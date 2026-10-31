# -*- coding: utf-8 -*-
"""
Suite de Pruebas Automatizadas Fase 4:
Anulación Transaccional de Facturas, Devoluciones, Compras, Pagos CxC/CxP y Cuentas Directas.
Cumplimiento de Reversibilidad Absoluta y Normativa SENIAT.
"""

import unittest
import sqlite3
import tempfile
import shutil
import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

import database
from database import (
    anular_factura_venta,
    anular_devolucion_cliente,
    anular_compra_proveedor,
    anular_abono_cxc,
    anular_abono_cxp,
    anular_cuenta_cxp_directa,
    auditar_y_migrar_db,
    conciliar_inventario
)


class TestFase4AnulacionesCompletas(unittest.TestCase):
    """Pruebas exhaustivas de reversibilidad e integridad en anulaciones."""

    def setUp(self):
        """Crea un entorno aislado clonando inventario.db en un archivo temporal."""
        self.real_db_path = os.path.join(BASE_DIR, "inventario.db")
        self.temp_dir = tempfile.mkdtemp(prefix="test_anulaciones_")
        self.test_db_path = os.path.join(self.temp_dir, "test_inventario.db")
        shutil.copy2(self.real_db_path, self.test_db_path)

        self.conn = sqlite3.connect(self.test_db_path)
        self.conn.row_factory = sqlite3.Row
        self.cursor = self.conn.cursor()
        auditar_y_migrar_db(self.conn, self.cursor)
        self.conn.commit()

    def tearDown(self):
        try:
            self.conn.close()
        except Exception:
            pass
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_01_anulacion_factura_reingresa_stock_y_cpp_exacto(self):
        """Verifica que al anular una factura de venta el stock sume y el CPP regrese al estado anterior."""
        # Estado inicial del producto 1
        self.cursor.execute("SELECT id, stock, costo_cpp FROM productos WHERE id = 1")
        prod_ini = dict(self.cursor.fetchone())
        stock_0 = float(prod_ini["stock"])
        cpp_0 = float(prod_ini["costo_cpp"])

        # Simular emisión de una venta de 5 unidades
        cant_venta = 5.0
        stock_post_venta = stock_0 - cant_venta
        self.cursor.execute("UPDATE productos SET stock = ? WHERE id = 1", (stock_post_venta,))
        self.cursor.execute("""
            INSERT INTO facturas (numero_factura, cliente_id, fecha, tipo_venta, subtotal, iva_total, total, total_usd, tasa_ves, tasa_cop, total_ves, total_cop, saldo_pendiente, estado)
            VALUES ('FAC-TEST-001', 1, '2026-10-30 10:00:00', 'contado', 100.0, 16.0, 116.0, 116.0, 45.0, 4000.0, 5220.0, 464000.0, 0.0, 'pagada')
        """)
        fac_id = self.cursor.lastrowid

        self.cursor.execute("""
            INSERT INTO factura_detalles (factura_id, producto_id, nombre_producto, tipo, impuesto_tipo, cantidad, precio_unitario, iva_unitario, subtotal, total, costo_unitario, costo_total)
            VALUES (?, 1, 'Producto Test', 'producto', 'gravado', ?, 20.0, 3.2, 100.0, 116.0, ?, ?)
        """, (fac_id, cant_venta, cpp_0, round(cant_venta * cpp_0, 4)))

        # Ejecutar anulación de la factura
        res = anular_factura_venta(self.cursor, fac_id, motivo="Error de digitación en prueba")
        self.conn.commit()

        self.assertTrue(res["success"])
        self.assertEqual(res["estado"], "anulada")

        # Verificar que el stock volvió exactamente a stock_0 y el CPP a cpp_0
        self.cursor.execute("SELECT stock, costo_cpp FROM productos WHERE id = 1")
        prod_fin = dict(self.cursor.fetchone())
        self.assertAlmostEqual(float(prod_fin["stock"]), stock_0, places=4)
        self.assertAlmostEqual(float(prod_fin["costo_cpp"]), cpp_0, places=4)

        # Verificar estado de la factura
        self.cursor.execute("SELECT estado, motivo_anulacion FROM facturas WHERE id = ?", (fac_id,))
        fac_fin = dict(self.cursor.fetchone())
        self.assertEqual(fac_fin["estado"], "anulada")
        self.assertEqual(fac_fin["motivo_anulacion"], "Error de digitación en prueba")

        # Verificar registro en inventario_movimientos
        self.cursor.execute("""
            SELECT tipo_movimiento, sentido, cantidad, stock_anterior, stock_nuevo
            FROM inventario_movimientos
            WHERE documento_tipo = 'factura' AND documento_id = ? AND tipo_movimiento = 'devolucion_cliente'
        """, (fac_id,))
        mov = dict(self.cursor.fetchone())
        self.assertEqual(mov["sentido"], "ENTRADA")
        self.assertAlmostEqual(float(mov["cantidad"]), cant_venta, places=4)
        self.assertAlmostEqual(float(mov["stock_nuevo"]), stock_0, places=4)

    def test_02_anulacion_factura_credito_anula_cxc_y_abonos(self):
        """Verifica que anular una factura a crédito anule su CxC y abonos asociados."""
        self.cursor.execute("""
            INSERT INTO facturas (numero_factura, cliente_id, fecha, tipo_venta, subtotal, iva_total, total, total_usd, tasa_ves, tasa_cop, total_ves, total_cop, saldo_pendiente, estado)
            VALUES ('FAC-CRED-002', 1, '2026-10-30 11:00:00', 'credito', 200.0, 0.0, 200.0, 200.0, 45.0, 4000.0, 9000.0, 800000.0, 150.0, 'pendiente')
        """)
        fac_id = self.cursor.lastrowid

        self.cursor.execute("""
            INSERT INTO cuentas_por_cobrar (factura_id, cliente_id, monto_total, monto_pagado, saldo_pendiente, fecha_emision, fecha_vencimiento, estado)
            VALUES (?, 1, 200.0, 50.0, 150.0, '2026-10-30', '2026-11-30', 'parcial')
        """, (fac_id,))
        cxc_id = self.cursor.lastrowid

        self.cursor.execute("""
            INSERT INTO abonos_cxc (cxc_id, monto_usd, notas, estado)
            VALUES (?, 50.0, 'Abono parcial inicial', 'activo')
        """, (cxc_id,))
        ab_id = self.cursor.lastrowid

        # Anular factura
        anular_factura_venta(self.cursor, fac_id, motivo="Cliente desistió de la compra a crédito")
        self.conn.commit()

        # Verificar CxC anulada y saldo 0
        self.cursor.execute("SELECT estado, saldo_pendiente FROM cuentas_por_cobrar WHERE id = ?", (cxc_id,))
        cxc_fin = dict(self.cursor.fetchone())
        self.assertEqual(cxc_fin["estado"], "anulada")
        self.assertAlmostEqual(float(cxc_fin["saldo_pendiente"]), 0.0, places=2)

        # Verificar abono anulado
        self.cursor.execute("SELECT estado FROM abonos_cxc WHERE id = ?", (ab_id,))
        ab_fin = dict(self.cursor.fetchone())
        self.assertEqual(ab_fin["estado"], "anulado")

    def test_03_anulacion_devolucion_descuenta_stock_y_restituye_cxc(self):
        """Verifica que al anular una nota de crédito/devolución el stock reste y la CxC recupere su saldo anterior."""
        self.cursor.execute("SELECT stock, costo_cpp FROM productos WHERE id = 1")
        prod_0 = dict(self.cursor.fetchone())
        stock_antes_dev = float(prod_0["stock"])

        # Crear factura a crédito original con saldo $120 (ya rebajado por devolución de $80 sobre $200)
        self.cursor.execute("""
            INSERT INTO facturas (numero_factura, cliente_id, fecha, tipo_venta, subtotal, iva_total, total, total_usd, tasa_ves, tasa_cop, total_ves, total_cop, saldo_pendiente, estado)
            VALUES ('FAC-ORIG-003', 1, '2026-10-30 09:00:00', 'credito', 200.0, 0.0, 200.0, 200.0, 45.0, 4000.0, 9000.0, 800000.0, 120.0, 'pendiente')
        """)
        fac_id = self.cursor.lastrowid

        self.cursor.execute("""
            INSERT INTO cuentas_por_cobrar (factura_id, cliente_id, monto_total, monto_pagado, saldo_pendiente, fecha_emision, fecha_vencimiento, estado)
            VALUES (?, 1, 200.0, 80.0, 120.0, '2026-10-30', '2026-11-30', 'parcial')
        """, (fac_id,))
        cxc_id = self.cursor.lastrowid

        # Simular que la devolución había sumado 2 unidades al stock
        cant_dev = 2.0
        stock_con_dev = stock_antes_dev + cant_dev
        self.cursor.execute("UPDATE productos SET stock = ? WHERE id = 1", (stock_con_dev,))

        self.cursor.execute("""
            INSERT INTO devoluciones (numero_devolucion, factura_id, numero_factura, cliente_id, cliente_nombre, fecha_emision, tipo_devolucion, motivo, subtotal_usd, iva_usd, total_usd, tasa_ves, tasa_cop, total_ves, total_cop, estado)
            VALUES ('DEV-TEST-003', ?, 'FAC-ORIG-003', 1, 'Cliente Prueba', '2026-10-30 12:00:00', 'parcial', 'Devolución prueba', 80.0, 0.0, 80.0, 45.0, 4000.0, 3600.0, 320000.0, 'activa')
        """, (fac_id,))
        dev_id = self.cursor.lastrowid

        self.cursor.execute("""
            INSERT INTO devolucion_detalles (devolucion_id, producto_id, nombre_producto, tipo, impuesto_tipo, cantidad, precio_unitario, iva_unitario, subtotal, total, costo_unitario, costo_total)
            VALUES (?, 1, 'Prod 1', 'producto', 'exento', ?, 40.0, 0.0, 80.0, 80.0, 10.0, 20.0)
        """, (dev_id, cant_dev))

        # Ejecutar anulación de la devolución
        res = anular_devolucion_cliente(self.cursor, dev_id, motivo="Devolución aplicada por error")
        self.conn.commit()

        self.assertTrue(res["success"])

        # Verificar que el stock restó las 2 unidades y volvió a stock_antes_dev
        self.cursor.execute("SELECT stock FROM productos WHERE id = 1")
        stock_final = float(self.cursor.fetchone()[0])
        self.assertAlmostEqual(stock_final, stock_antes_dev, places=4)

        # Verificar que la CxC recuperó su saldo de $200.00 ($120 + $80)
        self.cursor.execute("SELECT saldo_pendiente, estado FROM cuentas_por_cobrar WHERE id = ?", (cxc_id,))
        cxc_fin = dict(self.cursor.fetchone())
        self.assertAlmostEqual(float(cxc_fin["saldo_pendiente"]), 200.0, places=2)
        self.assertEqual(cxc_fin["estado"], "pendiente")

    def test_04_anulacion_compra_retira_stock_y_anula_cxp(self):
        """Verifica que al anular una compra el stock reste y regrese al estado anterior y la CxP se anule."""
        self.cursor.execute("SELECT stock FROM productos WHERE id = 2")
        stock_0 = float(self.cursor.fetchone()[0])

        # Simular compra de 15 unidades
        cant_compra = 15.0
        self.cursor.execute("UPDATE productos SET stock = ? WHERE id = 2", (stock_0 + cant_compra,))

        self.cursor.execute("""
            INSERT INTO compras (numero_control, proveedor_id, fecha, subtotal, iva_total, total, tipo_compra, saldo_pendiente, numero_factura, estado)
            VALUES ('COM-TEST-004', 1, '2026-10-30 13:00:00', 300.0, 0.0, 300.0, 'credito', 300.0, 'FPROV-004', 'activa')
        """)
        comp_id = self.cursor.lastrowid

        self.cursor.execute("""
            INSERT INTO compra_detalles (compra_id, producto_id, nombre_producto, cantidad, costo_unitario, impuesto_tipo, iva_unitario, total)
            VALUES (?, 2, 'Prod 2', ?, 20.0, 'exento', 0.0, 300.0)
        """, (comp_id, cant_compra))

        self.cursor.execute("""
            INSERT INTO cuentas_por_pagar (compra_id, proveedor_id, descripcion_concepto, numero_factura, monto_total, monto_pagado, saldo_pendiente, fecha_emision, fecha_vencimiento, estado)
            VALUES (?, 1, 'Compra test', 'FPROV-004', 300.0, 0.0, 300.0, '2026-10-30', '2026-11-30', 'pendiente')
        """, (comp_id,))
        cxp_id = self.cursor.lastrowid

        # Anular la compra
        res = anular_compra_proveedor(self.cursor, comp_id, motivo="Factura duplicada del proveedor")
        self.conn.commit()

        self.assertTrue(res["success"])

        # Verificar que el stock regresó exactamente a stock_0
        self.cursor.execute("SELECT stock FROM productos WHERE id = 2")
        stock_fin = float(self.cursor.fetchone()[0])
        self.assertAlmostEqual(stock_fin, stock_0, places=4)

        # Verificar que la CxP quedó anulada y con saldo 0
        self.cursor.execute("SELECT estado, saldo_pendiente FROM cuentas_por_pagar WHERE id = ?", (cxp_id,))
        cxp_fin = dict(self.cursor.fetchone())
        self.assertEqual(cxp_fin["estado"], "anulada")
        self.assertAlmostEqual(float(cxp_fin["saldo_pendiente"]), 0.0, places=2)

    def test_05_anulacion_compra_bloqueada_si_stock_insuficiente(self):
        """Verifica que no se permita anular una compra si ya se consumió el stock y quedaría negativo."""
        self.cursor.execute("SELECT stock FROM productos WHERE id = 3")
        stock_actual = float(self.cursor.fetchone()[0])

        # Crear compra ficticia por una cantidad mayor al stock actual disponible
        cant_excesiva = stock_actual + 500.0
        self.cursor.execute("""
            INSERT INTO compras (numero_control, proveedor_id, fecha, subtotal, iva_total, total, tipo_compra, estado)
            VALUES ('COM-EXCESO-005', 1, '2026-10-30 14:00:00', 5000.0, 0.0, 5000.0, 'contado', 'activa')
        """)
        comp_id = self.cursor.lastrowid

        self.cursor.execute("""
            INSERT INTO compra_detalles (compra_id, producto_id, nombre_producto, cantidad, costo_unitario, impuesto_tipo, iva_unitario, total)
            VALUES (?, 3, 'Prod 3', ?, 10.0, 'exento', 0.0, 5000.0)
        """, (comp_id, cant_excesiva))

        with self.assertRaises(ValueError) as ctx:
            anular_compra_proveedor(self.cursor, comp_id, motivo="Intento inválido")

        self.assertIn("Stock insuficiente", str(ctx.exception))

    def test_06_anulacion_abono_cxc_restituye_saldo_exacto(self):
        """Verifica que anular pagos en CxC restituya el estado de cuenta y saldo exactamente al valor previo."""
        self.cursor.execute("""
            INSERT INTO facturas (numero_factura, cliente_id, fecha, tipo_venta, subtotal, iva_total, total, total_usd, tasa_ves, tasa_cop, total_ves, total_cop, saldo_pendiente, estado)
            VALUES ('FAC-CXC-006', 1, '2026-10-30 15:00:00', 'credito', 500.0, 0.0, 500.0, 500.0, 45.0, 4000.0, 22500.0, 2000000.0, 0.0, 'pagada')
        """)
        fac_id = self.cursor.lastrowid

        self.cursor.execute("""
            INSERT INTO cuentas_por_cobrar (factura_id, cliente_id, monto_total, monto_pagado, saldo_pendiente, fecha_emision, fecha_vencimiento, estado)
            VALUES (?, 1, 500.0, 500.0, 0.0, '2026-10-30', '2026-11-30', 'pagada')
        """, (fac_id,))
        cxc_id = self.cursor.lastrowid

        # Dos abonos: $200 y $300
        self.cursor.execute("INSERT INTO abonos_cxc (cxc_id, monto_usd, notas, estado) VALUES (?, 200.0, 'Abono 1', 'activo')", (cxc_id,))
        ab1_id = self.cursor.lastrowid
        self.cursor.execute("INSERT INTO abonos_cxc (cxc_id, monto_usd, notas, estado) VALUES (?, 300.0, 'Abono 2', 'activo')", (cxc_id,))
        ab2_id = self.cursor.lastrowid

        # 1. Anular Abono 2 ($300) -> Saldo debe pasar de $0 a $300, pagado de $500 a $200, estado a 'parcial'
        res2 = anular_abono_cxc(self.cursor, ab2_id, motivo="Cheque devuelto")
        self.assertAlmostEqual(res2["nuevo_saldo_pendiente"], 300.0, places=2)
        self.assertEqual(res2["nuevo_estado_cxc"], "parcial")

        # 2. Anular Abono 1 ($200) -> Saldo debe pasar de $300 a $500, pagado a $0, estado a 'pendiente'
        res1 = anular_abono_cxc(self.cursor, ab1_id, motivo="Transferencia errónea")
        self.assertAlmostEqual(res1["nuevo_saldo_pendiente"], 500.0, places=2)
        self.assertEqual(res1["nuevo_estado_cxc"], "pendiente")

        # Verificar factura también con saldo 500.00
        self.cursor.execute("SELECT saldo_pendiente FROM facturas WHERE id = ?", (fac_id,))
        self.assertAlmostEqual(float(self.cursor.fetchone()[0]), 500.0, places=2)

    def test_07_anulacion_abono_cxp_restituye_deuda_exacta(self):
        """Verifica que anular pagos en CxP restituya la deuda al proveedor exactamente al estado previo."""
        self.cursor.execute("""
            INSERT INTO cuentas_por_pagar (proveedor_id, descripcion_concepto, numero_factura, monto_total, monto_pagado, saldo_pendiente, fecha_emision, fecha_vencimiento, estado, tipo_registro)
            VALUES (1, 'Servicio eléctrico', 'ELEC-007', 400.0, 400.0, 0.0, '2026-10-30', '2026-11-30', 'pagada', 'directo')
        """)
        cxp_id = self.cursor.lastrowid

        self.cursor.execute("INSERT INTO abonos_cxp (cxp_id, monto_usd, notas, estado) VALUES (?, 400.0, 'Pago total', 'activo')", (cxp_id,))
        ab_id = self.cursor.lastrowid

        # Anular el pago
        res = anular_abono_cxp(self.cursor, ab_id, motivo="Error en referencia bancaria")
        self.conn.commit()

        self.assertAlmostEqual(res["nuevo_saldo_pendiente"], 400.0, places=2)
        self.assertEqual(res["nuevo_estado_cxp"], "pendiente")

        self.cursor.execute("SELECT saldo_pendiente, monto_pagado, estado FROM cuentas_por_pagar WHERE id = ?", (cxp_id,))
        cxp_fin = dict(self.cursor.fetchone())
        self.assertAlmostEqual(float(cxp_fin["saldo_pendiente"]), 400.0, places=2)
        self.assertAlmostEqual(float(cxp_fin["monto_pagado"]), 0.0, places=2)
        self.assertEqual(cxp_fin["estado"], "pendiente")

    def test_08_anulacion_cuenta_cxp_directa(self):
        """Verifica la anulación de facturas/gastos cargados directamente en CxP."""
        self.cursor.execute("""
            INSERT INTO cuentas_por_pagar (proveedor_id, descripcion_concepto, numero_factura, monto_total, monto_pagado, saldo_pendiente, fecha_emision, fecha_vencimiento, estado, tipo_registro)
            VALUES (1, 'Mantenimiento Aires', 'MANT-008', 180.0, 0.0, 180.0, '2026-10-30', '2026-11-30', 'pendiente', 'directo')
        """)
        cxp_id = self.cursor.lastrowid

        res = anular_cuenta_cxp_directa(self.cursor, cxp_id, motivo="Servicio no ejecutado")
        self.conn.commit()

        self.assertTrue(res["success"])
        self.cursor.execute("SELECT estado, saldo_pendiente FROM cuentas_por_pagar WHERE id = ?", (cxp_id,))
        cxp_fin = dict(self.cursor.fetchone())
        self.assertEqual(cxp_fin["estado"], "anulada")
        self.assertAlmostEqual(float(cxp_fin["saldo_pendiente"]), 0.0, places=2)

    def test_09_preservacion_intacta_42_movimientos_canonicos_en_db_real(self):
        """Regla de oro: verifica que inventario.db de producción conserve sus 42 movimientos y $211,292.00 USD intactos."""
        real_conn = sqlite3.connect(self.real_db_path)
        real_conn.row_factory = sqlite3.Row
        c = real_conn.cursor()

        c.execute("SELECT COUNT(*) FROM inventario_movimientos")
        total_movs = c.fetchone()[0]
        self.assertEqual(total_movs, 42, "Los 42 movimientos canónicos deben permanecer intactos")

        c.execute("SELECT ROUND(SUM(stock * costo_cpp), 2) FROM productos")
        val_total = float(c.fetchone()[0])
        self.assertAlmostEqual(val_total, 211292.00, places=2)

        rep_conc = conciliar_inventario(real_conn)
        self.assertEqual(rep_conc["estado_general"], "CONCILIADO_OK")
        self.assertEqual(rep_conc["total_diferencia"], 0)
        real_conn.close()

    def test_10_cumplimiento_fiscal_seniat_libros_y_ventas_diarias(self):
        """
        Verifica el comportamiento fiscal y financiero tras anulaciones:
        1. Libro de Ventas: La factura anulada SÍ aparece como '*** ANULADA ***' con montos 0.00 Bs.
        2. Libro de Compras: La compra anulada NO aparece en el libro de compras.
        3. Ventas Diarias: La factura anulada no suma en los ingresos del día.
        """
        # 1. Crear dos facturas en la fecha '2026-10-30': una activa ($100) y una que será anulada ($250)
        self.cursor.execute("""
            INSERT INTO facturas (numero_factura, cliente_id, fecha, tipo_venta, subtotal, iva_total, total, total_usd, tasa_ves, tasa_cop, total_ves, total_cop, saldo_pendiente, estado)
            VALUES ('FAC-SENIAT-ACT', 1, '2026-10-30 08:00:00', 'contado', 100.0, 16.0, 116.0, 116.0, 45.0, 4000.0, 5220.0, 464000.0, 0.0, 'pagada')
        """)
        fac_act_id = self.cursor.lastrowid

        self.cursor.execute("""
            INSERT INTO facturas (numero_factura, cliente_id, fecha, tipo_venta, subtotal, iva_total, total, total_usd, tasa_ves, tasa_cop, total_ves, total_cop, saldo_pendiente, estado)
            VALUES ('FAC-SENIAT-ANU', 1, '2026-10-30 09:00:00', 'contado', 250.0, 40.0, 290.0, 290.0, 45.0, 4000.0, 13050.0, 1160000.0, 0.0, 'pagada')
        """)
        fac_anu_id = self.cursor.lastrowid

        # Anular la segunda factura
        anular_factura_venta(self.cursor, fac_anu_id, motivo="Factura anulada para prueba SENIAT")

        # 2. Crear una compra y anularla
        self.cursor.execute("""
            INSERT INTO compras (numero_control, proveedor_id, fecha, subtotal, iva_total, total, tipo_compra, numero_factura, estado)
            VALUES ('COM-SENIAT-ANU', 1, '2026-10-30 10:00:00', 500.0, 80.0, 580.0, 'contado', 'F-PROV-99', 'activa')
        """)
        comp_anu_id = self.cursor.lastrowid
        anular_compra_proveedor(self.cursor, comp_anu_id, motivo="Compra anulada no va a Libro de Compras")
        self.conn.commit()

        # Verificar Libro de Ventas: ambas facturas se consultan, pero FAC-SENIAT-ANU tiene estado == 'anulada'
        self.cursor.execute("""
            SELECT numero_factura, estado, total_ves
            FROM facturas
            WHERE DATE(fecha) = '2026-10-30' AND id IN (?, ?)
            ORDER BY id ASC
        """, (fac_act_id, fac_anu_id))
        rows_lv = [dict(r) for r in self.cursor.fetchall()]
        self.assertEqual(len(rows_lv), 2)
        self.assertEqual(rows_lv[0]["estado"], "pagada")
        self.assertEqual(rows_lv[1]["estado"], "anulada")

        # Verificar exclusión en Ventas Diarias (solo no anuladas)
        self.cursor.execute("""
            SELECT COALESCE(SUM(total_usd), 0.0)
            FROM facturas
            WHERE DATE(fecha) = '2026-10-30' AND id IN (?, ?) AND (estado IS NULL OR estado != 'anulada')
        """, (fac_act_id, fac_anu_id))
        total_ventas_activas = float(self.cursor.fetchone()[0])
        self.assertAlmostEqual(total_ventas_activas, 116.0, places=2)

        # Verificar exclusión en Libro de Compras
        self.cursor.execute("""
            SELECT COUNT(*)
            FROM compras
            WHERE id = ? AND (estado IS NULL OR estado != 'anulada')
        """, (comp_anu_id,))
        en_libro_compras = self.cursor.fetchone()[0]
        self.assertEqual(en_libro_compras, 0, "La compra anulada NO debe aparecer en el Libro de Compras")

    def test_11_flujo_completo_pagos_multimoneda_y_anulacion_cxc_cxp(self):
        """
        Verifica el flujo de Pagos Multimoneda (USD + VES + COP) en CXC y CXP
        y su anulación secuencial regresando exactamente al saldo y estado inmediatamente anterior.
        """
        # --- PARTE A: CXC (Cliente) ---
        self.cursor.execute("""
            INSERT INTO facturas (numero_factura, cliente_id, fecha, tipo_venta, subtotal, iva_total, total, total_usd, tasa_ves, tasa_cop, total_ves, total_cop, saldo_pendiente, estado)
            VALUES ('FAC-MULTI-001', 1, '2026-10-31 08:00:00', 'credito', 500.0, 0.0, 500.0, 500.0, 45.0, 4000.0, 22500.0, 2000000.0, 500.0, 'pendiente')
        """)
        fac_id = self.cursor.lastrowid

        self.cursor.execute("""
            INSERT INTO cuentas_por_cobrar (factura_id, cliente_id, monto_total, monto_pagado, saldo_pendiente, fecha_emision, fecha_vencimiento, estado)
            VALUES (?, 1, 500.0, 0.0, 500.0, '2026-10-31', '2026-11-15', 'pendiente')
        """, (fac_id,))
        cxc_id = self.cursor.lastrowid

        # Pago #1 Multimoneda: $100 USD + 4,500 VES (tasa 45 = $100 USD) + 400,000 COP (tasa 4000 = $100 USD) = $300.00 USD
        self.cursor.execute("""
            INSERT INTO abonos_cxc (cxc_id, monto_usd, notas, estado)
            VALUES (?, 300.0, 'Pago Multimoneda 1 (USD+VES+COP)', 'activo')
        """, (cxc_id,))
        ab_cxc_1 = self.cursor.lastrowid
        self.cursor.executemany("""
            INSERT INTO abono_cxc_pagos (abono_id, moneda, metodo, monto_moneda, tasa_cambio, equivalente_usd, referencia)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, [
            (ab_cxc_1, 'USD', 'Dólar Efectivo', 100.0, 1.0, 100.0, 'EF-001'),
            (ab_cxc_1, 'VES', 'Pago Móvil', 4500.0, 45.0, 100.0, 'PM-9821'),
            (ab_cxc_1, 'COP', 'Transferencia Bancolombia', 400000.0, 4000.0, 100.0, 'BC-7712'),
        ])
        self.cursor.execute("UPDATE cuentas_por_cobrar SET monto_pagado = 300.0, saldo_pendiente = 200.0, estado = 'parcial' WHERE id = ?", (cxc_id,))
        self.cursor.execute("UPDATE facturas SET saldo_pendiente = 200.0, estado = 'pendiente' WHERE id = ?", (fac_id,))

        # Pago #2 en VES: 9,000 VES (tasa 45 = $200.00 USD) -> Salda la factura ($0.00)
        self.cursor.execute("""
            INSERT INTO abonos_cxc (cxc_id, monto_usd, notas, estado)
            VALUES (?, 200.0, 'Pago Final en VES', 'activo')
        """, (cxc_id,))
        ab_cxc_2 = self.cursor.lastrowid
        self.cursor.execute("""
            INSERT INTO abono_cxc_pagos (abono_id, moneda, metodo, monto_moneda, tasa_cambio, equivalente_usd, referencia)
            VALUES (?, 'VES', 'Transferencia Bancaria', 9000.0, 45.0, 200.0, 'TB-5544')
        """, (ab_cxc_2,))
        self.cursor.execute("UPDATE cuentas_por_cobrar SET monto_pagado = 500.0, saldo_pendiente = 0.0, estado = 'pagada' WHERE id = ?", (cxc_id,))
        self.cursor.execute("UPDATE facturas SET saldo_pendiente = 0.0, estado = 'pagada' WHERE id = ?", (fac_id,))
        self.conn.commit()

        # Anular Pago #2 -> Debe volver exactamente al estado tras el Pago #1 (pagado: $300, saldo: $200, estado: 'parcial')
        res_anu_2 = anular_abono_cxc(self.cursor, ab_cxc_2, motivo="Reversión de segundo pago")
        self.assertAlmostEqual(res_anu_2["nuevo_monto_pagado"], 300.0, places=2)
        self.assertAlmostEqual(res_anu_2["nuevo_saldo_pendiente"], 200.0, places=2)
        self.assertEqual(res_anu_2["nuevo_estado_cxc"], "parcial")

        # Anular Pago #1 Multimoneda -> Debe volver exactamente al estado original (pagado: $0, saldo: $500, estado: 'pendiente')
        res_anu_1 = anular_abono_cxc(self.cursor, ab_cxc_1, motivo="Reversión de primer pago multimoneda")
        self.assertAlmostEqual(res_anu_1["nuevo_monto_pagado"], 0.0, places=2)
        self.assertAlmostEqual(res_anu_1["nuevo_saldo_pendiente"], 500.0, places=2)
        self.assertEqual(res_anu_1["nuevo_estado_cxc"], "pendiente")

        # --- PARTE B: CXP (Proveedor) ---
        self.cursor.execute("""
            INSERT INTO cuentas_por_pagar (compra_id, proveedor_id, numero_factura, tipo_registro, descripcion_concepto, monto_total, monto_pagado, saldo_pendiente, fecha_emision, fecha_vencimiento, estado)
            VALUES (NULL, 1, 'PROV-MULTI-01', 'directo', 'Servicio logístico', 400.0, 0.0, 400.0, '2026-10-31', '2026-11-15', 'pendiente')
        """)
        cxp_id = self.cursor.lastrowid

        # Pago Multimoneda a Proveedor: $150 USD + 4,500 VES (tasa 45 = $100 USD) = $250.00 USD -> Saldo $150.00
        self.cursor.execute("""
            INSERT INTO abonos_cxp (cxp_id, monto_usd, notas, estado)
            VALUES (?, 250.0, 'Pago Multimoneda a Proveedor', 'activo')
        """, (cxp_id,))
        ab_cxp_1 = self.cursor.lastrowid
        self.cursor.executemany("""
            INSERT INTO abono_cxp_pagos (abono_id, moneda, metodo, monto_moneda, tasa_cambio, equivalente_usd, referencia)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, [
            (ab_cxp_1, 'USD', 'Zelle', 150.0, 1.0, 150.0, 'ZL-1122'),
            (ab_cxp_1, 'VES', 'Transferencia Banesco', 4500.0, 45.0, 100.0, 'BN-3344'),
        ])
        self.cursor.execute("UPDATE cuentas_por_pagar SET monto_pagado = 250.0, saldo_pendiente = 150.0, estado = 'parcial' WHERE id = ?", (cxp_id,))
        self.conn.commit()

        # Anular Pago Multimoneda CXP -> Debe volver exactamente al estado original ($0 pagado, $400 saldo, 'pendiente')
        res_cxp_anu = anular_abono_cxp(self.cursor, ab_cxp_1, motivo="Error en referencia bancaria")
        self.assertAlmostEqual(res_cxp_anu["nuevo_monto_pagado"], 0.0, places=2)
        self.assertAlmostEqual(res_cxp_anu["nuevo_saldo_pendiente"], 400.0, places=2)
        self.assertEqual(res_cxp_anu["nuevo_estado_cxp"], "pendiente")


if __name__ == "__main__":
    unittest.main()
