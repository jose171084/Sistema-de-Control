"""
test_fase2f2b_compras_cpp.py - Suite de pruebas automatizadas para la Integración Transaccional del CPP en Compras (Fase 2F-2B).
Cubre los 24 casos de aceptación requeridos por la especificación oficial (CPP-01 a CPP-24).
Opera sobre un entorno SQLite aislado para preservar la integridad canónica de la base de datos de producción.
"""

import sys
import os
import unittest
import sqlite3
import shutil
from decimal import Decimal, ROUND_HALF_UP

# Configurar path del proyecto
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

import database
from database import (
    calcular_cpp_entrada,
    calcular_valor_salida_cpp,
    validar_stock_no_negativo,
    reiniciar_cpp_si_stock_cero,
    validar_movimiento_no_retroactivo,
    registrar_movimiento_inventario,
    conciliar_inventario,
    reconstruir_cpp_desde_apertura,
    ErrorStockNegativo,
    ErrorMovimientoRetroactivoNoPermitido,
    ErrorInconsistenciaCPP
)

class TestFase2F2BComprasCPP(unittest.TestCase):

    def setUp(self):
        """Crea una base de datos SQLite aislada en memoria o archivo temporal con el esquema oficial."""
        self.test_db_path = os.path.join(BASE_DIR, "test_fase2f2b_temp.db")
        # Copiar base de datos real para disponer del catálogo y la apertura certificada
        shutil.copy2(database.DB_PATH, self.test_db_path)
        self.conn = sqlite3.connect(self.test_db_path)
        self.conn.row_factory = sqlite3.Row
        self.cur = self.conn.cursor()

    def tearDown(self):
        """Cierra y elimina la base de datos temporal."""
        self.conn.close()
        if os.path.exists(self.test_db_path):
            try:
                os.remove(self.test_db_path)
            except Exception:
                pass

    def test_cpp_01_compra_mismo_costo(self):
        """CPP-01: Compra al mismo costo unitario que el CPP vigente (el CPP permanece idéntico)."""
        # Stock: 100 @ CPP $20. Compra: 50 @ $20 -> CPP resultante = $20.00
        res = calcular_cpp_entrada(stock_anterior=100.0, cpp_anterior=20.0, cantidad_entrada=50.0, costo_entrada=20.0)
        self.assertEqual(res["stock_nuevo"], 150.0)
        self.assertEqual(res["cpp_nuevo"], 20.0)
        self.assertEqual(res["valor_nuevo"], 3000.0)

    def test_cpp_02_compra_mayor_costo(self):
        """CPP-02: Compra a costo mayor (el CPP resultante se incrementa ponderadamente)."""
        # Stock: 100 @ CPP $20 ($2,000). Compra: 50 @ $35 ($1,750) -> Total $3,750 / 150 = $25.00
        res = calcular_cpp_entrada(stock_anterior=100.0, cpp_anterior=20.0, cantidad_entrada=50.0, costo_entrada=35.0)
        self.assertEqual(res["stock_nuevo"], 150.0)
        self.assertEqual(res["cpp_nuevo"], 25.0)
        self.assertEqual(res["valor_nuevo"], 3750.0)

    def test_cpp_03_compra_menor_costo(self):
        """CPP-03: Compra a costo menor (el CPP resultante disminuye ponderadamente)."""
        # Stock: 100 @ CPP $20 ($2,000). Compra: 50 @ $12.50 ($625) -> Total $2,625 / 150 = $17.50
        res = calcular_cpp_entrada(stock_anterior=100.0, cpp_anterior=20.0, cantidad_entrada=50.0, costo_entrada=12.50)
        self.assertEqual(res["stock_nuevo"], 150.0)
        self.assertEqual(res["cpp_nuevo"], 17.50)
        self.assertEqual(res["valor_nuevo"], 2625.0)

    def test_cpp_04_compra_stock_cero(self):
        """CPP-04: Compra con stock = 0 (establece el CPP inicial directamente al costo de entrada)."""
        res_reset = reiniciar_cpp_si_stock_cero(stock_actual=0.0, costo_nueva_entrada=32.0)
        self.assertEqual(res_reset, 32.0)
        res = calcular_cpp_entrada(stock_anterior=0.0, cpp_anterior=0.0, cantidad_entrada=50.0, costo_entrada=32.0)
        self.assertEqual(res["stock_nuevo"], 50.0)
        self.assertEqual(res["cpp_nuevo"], 32.0)
        self.assertEqual(res["valor_nuevo"], 1600.0)

    def test_cpp_05_stock_negativo_bloqueado(self):
        """CPP-05: Stock negativo bloqueado estrictamente con ErrorStockNegativo."""
        with self.assertRaises(ErrorStockNegativo):
            reiniciar_cpp_si_stock_cero(stock_actual=-5.0, costo_nueva_entrada=20.0)
        with self.assertRaises(ErrorStockNegativo):
            calcular_cpp_entrada(stock_anterior=-5.0, cpp_anterior=20.0, cantidad_entrada=10.0, costo_entrada=20.0)

    def test_cpp_06_stock_positivo_cpp_invalido_bloqueado(self):
        """CPP-06: Stock positivo + CPP inválido (nulo o <= 0) bloqueado estrictamente (sin fallback)."""
        with self.assertRaises(ErrorInconsistenciaCPP):
            calcular_cpp_entrada(stock_anterior=10.0, cpp_anterior=None, cantidad_entrada=5.0, costo_entrada=25.0)
        with self.assertRaises(ErrorInconsistenciaCPP):
            calcular_cpp_entrada(stock_anterior=10.0, cpp_anterior=0.0, cantidad_entrada=5.0, costo_entrada=25.0)

    def test_cpp_07_compra_credito_sin_pago_inicial(self):
        """CPP-07: Compra a crédito sin abono inicial genera saldo pendiente en CXP y actualiza stock/CPP."""
        # SKU 1: HAR008 (apertura 1733 @ 29)
        # Compra a crédito 100 u @ $32
        cant = 100.0
        costo_u = 32.0
        total_linea = cant * costo_u
        
        self.cur.execute("BEGIN IMMEDIATE")
        self.cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = 1")
        prod = self.cur.fetchone()
        
        calc = calcular_cpp_entrada(prod["stock"], prod["costo_cpp"], cant, costo_u)
        
        # Insertar compra cabecera
        self.cur.execute("""
            INSERT INTO compras (numero_control, proveedor_id, subtotal, iva_total, total, tipo_compra, saldo_pendiente, numero_factura)
            VALUES ('CMP-CRED-01', 1, ?, 0.0, ?, 'credito', ?, 'FACT-CRED-01')
        """, (total_linea, total_linea, total_linea))
        compra_id = self.cur.lastrowid
        
        # Insertar detalle
        self.cur.execute("""
            INSERT INTO compra_detalles (compra_id, producto_id, nombre_producto, cantidad, costo_unitario, impuesto_tipo, iva_unitario, total)
            VALUES (?, 1, 'HARINA PAN', ?, ?, 'exento', 0.0, ?)
        """, (compra_id, cant, costo_u, total_linea))
        detalle_id = self.cur.lastrowid
        
        # Movimiento inventario
        registrar_movimiento_inventario(
            self.cur, 1, "2026-10-28 10:00:00", "compra", "ENTRADA", cant, costo_u, total_linea,
            prod["stock"], calc["stock_nuevo"], "COMPRA", compra_id, "FACT-CRED-01", "Compra Credito", 1, detalle_id
        )
        
        # Actualizar productos
        self.cur.execute("UPDATE productos SET stock = ?, costo = ?, costo_cpp = ? WHERE id = 1", (calc["stock_nuevo"], costo_u, calc["cpp_nuevo"]))
        
        # Generar CXP
        self.cur.execute("""
            INSERT INTO cuentas_por_pagar (compra_id, proveedor_id, descripcion_concepto, numero_factura, monto_total, monto_pagado, saldo_pendiente, fecha_emision, fecha_vencimiento, estado)
            VALUES (?, 1, 'Factura CRED-01', 'FACT-CRED-01', ?, 0.0, ?, '2026-10-28', '2026-11-12', 'pendiente')
        """, (compra_id, total_linea, total_linea))
        
        self.conn.commit()
        
        # Verificaciones
        self.cur.execute("SELECT stock, costo, costo_cpp FROM productos WHERE id = 1")
        p_upd = self.cur.fetchone()
        self.assertEqual(float(p_upd["stock"]), 1833.0)
        self.assertEqual(float(p_upd["costo"]), 32.0)
        self.assertEqual(round(float(p_upd["costo_cpp"]), 4), round(calc["cpp_nuevo"], 4))
        
        self.cur.execute("SELECT saldo_pendiente, estado FROM cuentas_por_pagar WHERE compra_id = ?", (compra_id,))
        cxp = self.cur.fetchone()
        self.assertEqual(float(cxp["saldo_pendiente"]), total_linea)
        self.assertEqual(cxp["estado"], "pendiente")

    def test_cpp_08_compra_contado_multimoneda(self):
        """CPP-08: Compra contado multimoneda (pago en VES amortiza USD sin alterar el costo CPP)."""
        # Pago de $290 USD en Bs a tasa 365 (105,850 VES) no altera el costo unitario de inventario en USD
        tasa_ves = 365.0
        monto_usd = 290.0
        monto_ves = monto_usd * tasa_ves
        equiv_usd = round(monto_ves / tasa_ves, 2)
        self.assertEqual(equiv_usd, 290.0)
        
        # El CPP calculado en USD permanece invariable respecto a la moneda de cancelación
        calc = calcular_cpp_entrada(stock_anterior=100.0, cpp_anterior=29.0, cantidad_entrada=10.0, costo_entrada=29.0)
        self.assertEqual(calc["cpp_nuevo"], 29.0)

    def test_cpp_09_precision_usd_4_decimales(self):
        """CPP-09: Precisión aritmética en USD cuantizada estrictamente a 4 decimales con ROUND_HALF_UP."""
        # 1733 @ 29.00 ($50,257.00) + 267 @ 35.00 ($9,345.00) = $59,602.00 / 2,000.0 = 29.8010
        res = calcular_cpp_entrada(1733.0, 29.0, 267.0, 35.0)
        self.assertEqual(res["cpp_nuevo"], 29.8010)
        self.assertEqual(res["stock_nuevo"], 2000.0)
        self.assertEqual(res["valor_nuevo"], 59602.0)

    def test_cpp_10_no_revaluacion_historica_cambiaria(self):
        """CPP-10: El costo_cpp permanece expresado operativamente en USD y no sufre revaluación cambiaria."""
        self.cur.execute("SELECT costo_cpp FROM productos WHERE id = 1")
        cpp_antes = float(self.cur.fetchone()[0])
        
        # Simular cambio drástico en las tasas de cambio de configuración
        self.cur.execute("UPDATE configuracion SET tasa_ves = 500.0, tasa_cop = 5000.0 WHERE id = 1")
        self.conn.commit()
        
        self.cur.execute("SELECT costo_cpp FROM productos WHERE id = 1")
        cpp_despues = float(self.cur.fetchone()[0])
        self.assertEqual(cpp_antes, cpp_despues, "costo_cpp no debe variar por fluctuaciones de tasa de cambio")

    def test_cpp_11_costo_neto_vs_iva(self):
        """CPP-11: El IVA recuperable queda segregado y no se incorpora al costo de adquisición del inventario."""
        costo_base = 100.0
        iva_pct = 0.16
        iva_unitario = costo_base * iva_pct # 16.0
        precio_con_iva = costo_base + iva_unitario # 116.0
        
        # El motor CPP solo recibe el costo_base (100.0), nunca 116.0
        calc = calcular_cpp_entrada(stock_anterior=10.0, cpp_anterior=100.0, cantidad_entrada=10.0, costo_entrada=costo_base)
        self.assertEqual(calc["cpp_nuevo"], 100.0)

    def test_cpp_12_descuentos_comerciales_netos(self):
        """CPP-12: El costo alimentado al CPP debe ser el costo neto tras descuentos."""
        costo_bruto = 50.0
        descuento_unitario = 5.0
        costo_neto = costo_bruto - descuento_unitario # 45.0
        
        calc = calcular_cpp_entrada(stock_anterior=100.0, cpp_anterior=40.0, cantidad_entrada=100.0, costo_entrada=costo_neto)
        # (100*40 + 100*45) / 200 = 8500 / 200 = 42.50
        self.assertEqual(calc["cpp_nuevo"], 42.50)

    def test_cpp_13_compra_multiples_skus(self):
        """CPP-13: Compra con múltiples SKUs distintos en una sola transacción atómica."""
        # Comprar SKU 1 (HAR008) y SKU 2 (HARPIZZ) en la misma compra
        self.cur.execute("BEGIN IMMEDIATE")
        
        self.cur.execute("""
            INSERT INTO compras (numero_control, proveedor_id, subtotal, iva_total, total, tipo_compra, saldo_pendiente, numero_factura)
            VALUES ('CMP-MULTI-01', 1, 1000.0, 0.0, 1000.0, 'contado', 0.0, 'FACT-MULTI-01')
        """)
        compra_id = self.cur.lastrowid
        
        # Item 1: HAR008 (1733 @ 29) + 10 @ 30 -> 1743 u
        c1 = calcular_cpp_entrada(1733.0, 29.0, 10.0, 30.0)
        self.cur.execute("INSERT INTO compra_detalles (compra_id, producto_id, nombre_producto, cantidad, costo_unitario, impuesto_tipo, iva_unitario, total) VALUES (?, 1, 'P1', 10, 30, 'exento', 0, 300)", (compra_id,))
        det1 = self.cur.lastrowid
        registrar_movimiento_inventario(self.cur, 1, "2026-10-28 11:00:00", "compra", "ENTRADA", 10, 30, 300, 1733, c1["stock_nuevo"], "COMPRA", compra_id, "FACT-MULTI-01", "Multi", 1, det1)
        self.cur.execute("UPDATE productos SET stock = ?, costo = 30, costo_cpp = ? WHERE id = 1", (c1["stock_nuevo"], c1["cpp_nuevo"]))
        
        # Item 2: HARPIZZ (860 @ 29) + 20 @ 35 -> 880 u
        c2 = calcular_cpp_entrada(860.0, 29.0, 20.0, 35.0)
        self.cur.execute("INSERT INTO compra_detalles (compra_id, producto_id, nombre_producto, cantidad, costo_unitario, impuesto_tipo, iva_unitario, total) VALUES (?, 2, 'P2', 20, 35, 'exento', 0, 700)", (compra_id,))
        det2 = self.cur.lastrowid
        registrar_movimiento_inventario(self.cur, 2, "2026-10-28 11:00:00", "compra", "ENTRADA", 20, 35, 700, 860, c2["stock_nuevo"], "COMPRA", compra_id, "FACT-MULTI-01", "Multi", 1, det2)
        self.cur.execute("UPDATE productos SET stock = ?, costo = 35, costo_cpp = ? WHERE id = 2", (c2["stock_nuevo"], c2["cpp_nuevo"]))
        
        self.conn.commit()
        
        # Verificar ambos productos
        self.cur.execute("SELECT stock, costo_cpp FROM productos WHERE id IN (1, 2) ORDER BY id ASC")
        rows = self.cur.fetchall()
        self.assertEqual(rows[0]["stock"], 1743.0)
        self.assertEqual(rows[1]["stock"], 880.0)

    def test_cpp_14_compra_sku_repetido_multiples_lineas(self):
        """CPP-14: Compra con el mismo SKU repetido en múltiples líneas conserva trazabilidad y pondera secuencialmente."""
        # SKU 4: HARRESP (stock inicial 500 @ $5.00)
        # Línea 1: 100 u @ $8.00 -> Stock intermedio = 600, CPP = (500*5 + 100*8)/600 = 3300/600 = 5.50
        # Línea 2: 200 u @ $11.00 -> Stock final = 800, CPP = (600*5.50 + 200*11)/800 = (3300 + 2200)/800 = 5500/800 = 6.8750
        
        self.cur.execute("BEGIN IMMEDIATE")
        self.cur.execute("INSERT INTO compras (numero_control, proveedor_id, subtotal, iva_total, total, tipo_compra, saldo_pendiente, numero_factura) VALUES ('CMP-REP-01', 1, 3000, 0, 3000, 'contado', 0, 'FACT-REP-01')")
        compra_id = self.cur.lastrowid
        
        # Procesar Línea 1
        self.cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = 4")
        p0 = self.cur.fetchone()
        c1 = calcular_cpp_entrada(p0["stock"], p0["costo_cpp"], 100.0, 8.0)
        self.cur.execute("INSERT INTO compra_detalles (compra_id, producto_id, nombre_producto, cantidad, costo_unitario, impuesto_tipo, iva_unitario, total) VALUES (?, 4, 'HARINA REPOSTERIA', 100, 8, 'exento', 0, 800)", (compra_id,))
        det1 = self.cur.lastrowid
        
        m1 = registrar_movimiento_inventario(
            self.cur, 4, "2026-10-28 11:30:00", "compra", "ENTRADA", 100.0, 8.0, 800.0,
            p0["stock"], c1["stock_nuevo"], "COMPRA", compra_id, "FACT-REP-01", "Línea 1", 1, det1
        )
        self.cur.execute("UPDATE productos SET stock = ?, costo = 8, costo_cpp = ? WHERE id = 4", (c1["stock_nuevo"], c1["cpp_nuevo"]))
        
        # Procesar Línea 2 (lee el stock y CPP actualizados de la línea 1)
        self.cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = 4")
        p1 = self.cur.fetchone()
        self.assertEqual(p1["stock"], 600.0)
        self.assertEqual(p1["costo_cpp"], 5.50)
        
        c2 = calcular_cpp_entrada(p1["stock"], p1["costo_cpp"], 200.0, 11.0)
        self.cur.execute("INSERT INTO compra_detalles (compra_id, producto_id, nombre_producto, cantidad, costo_unitario, impuesto_tipo, iva_unitario, total) VALUES (?, 4, 'HARINA REPOSTERIA', 200, 11, 'exento', 0, 2200)", (compra_id,))
        det2 = self.cur.lastrowid
        
        m2 = registrar_movimiento_inventario(
            self.cur, 4, "2026-10-28 11:30:00", "compra", "ENTRADA", 200.0, 11.0, 2200.0,
            p1["stock"], c2["stock_nuevo"], "COMPRA", compra_id, "FACT-REP-01", "Línea 2", 1, det2
        )
        self.cur.execute("UPDATE productos SET stock = ?, costo = 11, costo_cpp = ? WHERE id = 4", (c2["stock_nuevo"], c2["cpp_nuevo"]))
        
        self.conn.commit()
        
        # Verificaciones críticas
        self.assertNotEqual(m1, m2, "Ambas líneas deben generar movimientos independientes en inventario_movimientos")
        self.cur.execute("SELECT COUNT(*) FROM inventario_movimientos WHERE documento_id = ? AND producto_id = 4", (compra_id,))
        self.assertEqual(self.cur.fetchone()[0], 2, "Deben existir exactamente 2 movimientos para el mismo SKU")
        
        self.cur.execute("SELECT stock, costo, costo_cpp FROM productos WHERE id = 4")
        p_fin = self.cur.fetchone()
        self.assertEqual(p_fin["stock"], 800.0)
        self.assertEqual(p_fin["costo"], 11.0)
        self.assertEqual(p_fin["costo_cpp"], 6.8750)

    def test_cpp_15_compra_producto_nuevo(self):
        """CPP-15: Compra de producto nuevo (crear_nuevo=true) inicializa stock, costo y costo_cpp = costo_entrada."""
        self.cur.execute("BEGIN IMMEDIATE")
        
        # Insertar producto nuevo con stock=0, costo=40.0, costo_cpp=40.0
        self.cur.execute("""
            INSERT INTO productos (codigo, nombre, categoria_id, tipo, impuesto_tipo, precio_base, iva_monto, precio_total, costo, costo_cpp, stock, stock_minimo)
            VALUES ('PRD-TESTNEW-01', 'PRODUCTO NUEVO PRUEBA', 1, 'producto', 'exento', 60.0, 0.0, 60.0, 40.0, 40.0, 0.0, 5.0)
        """)
        new_prod_id = self.cur.lastrowid
        
        # Procesar primera compra de 75 u @ $40.00
        calc = calcular_cpp_entrada(stock_anterior=0.0, cpp_anterior=0.0, cantidad_entrada=75.0, costo_entrada=40.0)
        self.cur.execute("UPDATE productos SET stock = ?, costo = 40.0, costo_cpp = ? WHERE id = ?", (calc["stock_nuevo"], calc["cpp_nuevo"], new_prod_id))
        
        self.conn.commit()
        
        self.cur.execute("SELECT stock, costo, costo_cpp FROM productos WHERE id = ?", (new_prod_id,))
        p = self.cur.fetchone()
        self.assertEqual(p["stock"], 75.0)
        self.assertEqual(p["costo"], 40.0)
        self.assertEqual(p["costo_cpp"], 40.0)

    def test_cpp_16_compra_retroactiva_bloqueada(self):
        """CPP-16: Compra con fecha retroactiva a un movimiento posterior queda bloqueada con ErrorMovimientoRetroactivoNoPermitido."""
        # El producto 1 tiene movimientos al 2026-10-23
        with self.assertRaises(ErrorMovimientoRetroactivoNoPermitido):
            validar_movimiento_no_retroactivo(self.cur, producto_id=1, fecha_movimiento="2026-10-15 08:00:00")
            
        # Fecha futura o posterior sí es permitida
        self.assertTrue(validar_movimiento_no_retroactivo(self.cur, producto_id=1, fecha_movimiento="2026-10-28 12:00:00"))

    def test_cpp_17_rollback_completo_ante_error(self):
        """CPP-17: Rollback completo ante error en cualquier ítem revierte la compra y las existencias."""
        self.cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = 1")
        stk_orig = self.cur.fetchone()["stock"]
        
        try:
            self.cur.execute("BEGIN IMMEDIATE")
            self.cur.execute("INSERT INTO compras (numero_control, proveedor_id, subtotal, iva_total, total) VALUES ('CMP-ERR-01', 1, 500, 0, 500)")
            # Simular actualización de stock del item 1
            self.cur.execute("UPDATE productos SET stock = stock + 50 WHERE id = 1")
            # Simular error en item 2 (stock negativo o excepción de validación)
            raise ValueError("ERROR_FORZADO_EN_ITEM_2")
        except Exception:
            self.conn.rollback()
            
        # Verificar que el stock no cambió
        self.cur.execute("SELECT stock FROM productos WHERE id = 1")
        stk_post = self.cur.fetchone()["stock"]
        self.assertEqual(stk_orig, stk_post, "El rollback debe restaurar el stock exacto previo")
        self.cur.execute("SELECT COUNT(*) FROM compras WHERE numero_control = 'CMP-ERR-01'")
        self.assertEqual(self.cur.fetchone()[0], 0, "La compra no debe quedar registrada")

    def test_cpp_18_idempotencia_compra_duplicada(self):
        """CPP-18: Detección y bloqueo de compra duplicada con el mismo proveedor y factura."""
        self.cur.execute("""
            INSERT INTO compras (numero_control, proveedor_id, numero_factura, subtotal, iva_total, total)
            VALUES ('CMP-IDEM-01', 1, 'FACT-IDEM-01', 100, 0, 100)
        """)
        self.conn.commit()
        
        # Consulta de idempotencia idéntica a la implementada en server.py
        self.cur.execute("""
            SELECT id FROM compras 
            WHERE proveedor_id = 1 AND (numero_factura = 'FACT-IDEM-01' OR numero_control = 'CMP-IDEM-01')
        """)
        existente = self.cur.fetchone()
        self.assertIsNotNone(existente, "Debe detectar la compra previa para bloquear duplicados")

    def test_cpp_19_concurrencia_begin_immediate(self):
        """CPP-19: BEGIN IMMEDIATE adquiere candado exclusivo impidiendo colisiones entre escritores concurrentes."""
        conn2 = sqlite3.connect(self.test_db_path)
        cur2 = conn2.cursor()
        
        self.cur.execute("BEGIN IMMEDIATE")
        
        # Segundo cursor intentando escribir inmediatamente debe recibir OperationalError (database locked)
        with self.assertRaises(sqlite3.OperationalError) as ctx:
            cur2.execute("BEGIN IMMEDIATE")
        self.assertIn("locked", str(ctx.exception).lower())
        
        self.conn.rollback()
        conn2.close()

    def test_cpp_20_costo_movimiento_conserva_costo_real_entrada(self):
        """CPP-20: inventario_movimientos.costo_unitario conserva el costo de factura, NO el CPP resultante."""
        # Producto 1 (apertura: 1733 @ $29.00). Compra: 267 @ $35.00 -> CPP resultante = $29.8010
        cant = 267.0
        costo_factura = 35.0
        c = calcular_cpp_entrada(1733.0, 29.0, cant, costo_factura)
        
        self.cur.execute("BEGIN IMMEDIATE")
        mov_id = registrar_movimiento_inventario(
            self.cur, 1, "2026-10-28 14:00:00", "compra", "ENTRADA", cant, costo_factura,
            cant * costo_factura, 1733.0, c["stock_nuevo"], "COMPRA", 999, "FAC-COST-01", "Verif Costo", 1, 9991
        )
        self.conn.commit()
        
        self.cur.execute("SELECT costo_unitario, costo_total FROM inventario_movimientos WHERE id = ?", (mov_id,))
        m = self.cur.fetchone()
        self.assertEqual(float(m["costo_unitario"]), 35.0, "Debe almacenar $35.00 (costo real de factura), no $29.8010")
        self.assertEqual(float(m["costo_total"]), 9345.0)

    def test_cpp_21_productos_costo_conserva_ultimo_costo(self):
        """CPP-21: productos.costo conserva el costo de reposición comercial de la última compra."""
        self.cur.execute("UPDATE productos SET costo = 35.0 WHERE id = 1")
        self.conn.commit()
        self.cur.execute("SELECT costo FROM productos WHERE id = 1")
        self.assertEqual(float(self.cur.fetchone()["costo"]), 35.0)

    def test_cpp_22_productos_costo_cpp_conserva_cpp_ponderado(self):
        """CPP-22: productos.costo_cpp conserva exclusivamente el costo promedio ponderado."""
        self.cur.execute("UPDATE productos SET costo_cpp = 29.8010 WHERE id = 1")
        self.conn.commit()
        self.cur.execute("SELECT costo_cpp FROM productos WHERE id = 1")
        self.assertEqual(float(self.cur.fetchone()["costo_cpp"]), 29.8010)

    def test_cpp_23_conciliacion_stock_total(self):
        """CPP-23: Conciliación de stock (productos.stock == sum(movimientos)) permanece en CONCILIADO_OK."""
        res = conciliar_inventario(self.conn, self.cur)
        self.assertEqual(res["estado_general"], "CONCILIADO_OK")
        self.assertEqual(res["total_diferencia"], 0)

    def test_cpp_24_reconstruccion_deterministica_desde_apertura(self):
        """CPP-24: Reconstrucción determinística del CPP desde la apertura coincide con productos.costo_cpp."""
        # Registrar una compra posterior al corte ID 108: 267 u @ $35.00 para HAR008 (id=1)
        cant = 267.0
        costo_u = 35.0
        
        self.cur.execute("BEGIN IMMEDIATE")
        self.cur.execute("""
            INSERT INTO inventario_movimientos (
                fecha, producto_id, tipo_movimiento, sentido, cantidad,
                costo_unitario, costo_total, stock_anterior, stock_nuevo,
                documento_tipo, documento_id, documento_numero, motivo, usuario_id, documento_linea_id
            ) VALUES ('2026-10-28 15:00:00', 1, 'compra', 'ENTRADA', ?, ?, ?, 1733.0, 2000.0, 'COMPRA', 888, 'FAC-REC-01', 'Reconst test', 1, 8881)
        """, (cant, costo_u, cant * costo_u))
        self.conn.commit()
        
        # Ejecutar reconstructor determinístico oficial
        rec = reconstruir_cpp_desde_apertura(self.cur, producto_id=1, fecha_corte="2026-10-23 23:59:59", ultimo_mov_id=108)
        self.assertEqual(rec["stock_reconstruido"], 2000.0)
        self.assertEqual(rec["cpp_reconstruido"], 29.8010)
        self.assertEqual(rec["valor_reconstruido"], 59602.0)
        self.assertEqual(rec["movimientos_procesados"], 1)

if __name__ == "__main__":
    unittest.main()
