"""
test_fase3_cxc_cxp_notas.py - Suite de pruebas automatizadas para la Fase 3:
Cuentas por Cobrar (CXC), Cuentas por Pagar (CXP), Gasto Directo a Proveedor y Notas de Ajuste Comercial (Débito/Crédito).
Opera sobre un entorno SQLite temporal y aislado para preservar la integridad patrimonial canónica.
"""

import sys
import os
import unittest
import sqlite3
import shutil
import json
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timedelta

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

import database

class TestFase3CxcCxpNotas(unittest.TestCase):

    def setUp(self):
        """Crea base de datos SQLite aislada para cada test."""
        self.test_db_path = os.path.join(BASE_DIR, "test_fase3_temp.db")
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

    def test_01_cxp_directo_exento(self):
        """Prueba registro de gasto directo exento de IVA sin afectar libro fiscal."""
        tasa_bcv = 45.0
        monto_usd = 250.00
        
        self.cur.execute("""
            INSERT INTO cuentas_por_pagar (
                compra_id, proveedor_id, descripcion_concepto, numero_factura, numero_control,
                impuesto_tipo, base_imponible_usd, iva_usd, tasa_bcv,
                base_imponible_ves, iva_ves, total_ves, afecta_libro_compras,
                monto_total, monto_pagado, saldo_pendiente, fecha_emision, fecha_vencimiento, estado, tipo_registro, notas
            ) VALUES (
                NULL, 1, 'Servicio de mantenimiento mensual de servidores', 'DIR-1001', '00-001001',
                'exento', ?, 0.0, ?,
                ?, 0.0, ?, 0,
                ?, 0.0, ?, '2026-10-29', '2026-11-15', 'pendiente', 'directo', 'Gasto operativo interno'
            )
        """, (
            monto_usd, tasa_bcv,
            round(monto_usd * tasa_bcv, 2), round(monto_usd * tasa_bcv, 2),
            monto_usd, monto_usd
        ))
        cxp_id = self.cur.lastrowid
        self.conn.commit()

        self.cur.execute("SELECT * FROM cuentas_por_pagar WHERE id = ?", (cxp_id,))
        row = dict(self.cur.fetchone())

        self.assertEqual(row["tipo_registro"], "directo")
        self.assertEqual(row["impuesto_tipo"], "exento")
        self.assertEqual(row["afecta_libro_compras"], 0)
        self.assertAlmostEqual(float(row["monto_total"]), 250.00, places=2)
        self.assertAlmostEqual(float(row["base_imponible_usd"]), 250.00, places=2)
        self.assertAlmostEqual(float(row["iva_usd"]), 0.0, places=2)
        self.assertAlmostEqual(float(row["total_ves"]), 11250.00, places=2)
        self.assertAlmostEqual(float(row["saldo_pendiente"]), 250.00, places=2)

    def test_02_cxp_directo_gravado_con_libro_fiscal(self):
        """Prueba registro de gasto directo gravado con IVA 16% que afecta el Libro de Compras SENIAT."""
        tasa_bcv = 45.0
        monto_total_usd = 116.00
        base_usd = 100.00
        iva_usd = 16.00
        base_ves = round(base_usd * tasa_bcv, 2)
        iva_ves = round(iva_usd * tasa_bcv, 2)
        total_ves = round(monto_total_usd * tasa_bcv, 2)

        self.cur.execute("""
            INSERT INTO cuentas_por_pagar (
                compra_id, proveedor_id, descripcion_concepto, numero_factura, numero_control,
                impuesto_tipo, base_imponible_usd, iva_usd, tasa_bcv,
                base_imponible_ves, iva_ves, total_ves, afecta_libro_compras,
                monto_total, monto_pagado, saldo_pendiente, fecha_emision, fecha_vencimiento, estado, tipo_registro, notas
            ) VALUES (
                NULL, 1, 'Factura de internet corporativo fibra óptica', 'FACT-89412', '00-009841',
                'gravado', ?, ?, ?,
                ?, ?, ?, 1,
                ?, 0.0, ?, '2026-10-29', '2026-11-10', 'pendiente', 'directo', 'Comprobante fiscal con IVA'
            )
        """, (
            base_usd, iva_usd, tasa_bcv,
            base_ves, iva_ves, total_ves,
            monto_total_usd, monto_total_usd
        ))
        cxp_id = self.cur.lastrowid
        self.conn.commit()

        self.cur.execute("SELECT * FROM cuentas_por_pagar WHERE id = ?", (cxp_id,))
        row = dict(self.cur.fetchone())

        self.assertEqual(row["tipo_registro"], "directo")
        self.assertEqual(row["impuesto_tipo"], "gravado")
        self.assertEqual(row["afecta_libro_compras"], 1)
        self.assertEqual(row["numero_factura"], "FACT-89412")
        self.assertEqual(row["numero_control"], "00-009841")
        self.assertAlmostEqual(float(row["base_imponible_usd"]), 100.00, places=2)
        self.assertAlmostEqual(float(row["iva_usd"]), 16.00, places=2)
        self.assertAlmostEqual(float(row["monto_total"]), 116.00, places=2)
        self.assertAlmostEqual(float(row["base_imponible_ves"]), 4500.00, places=2)
        self.assertAlmostEqual(float(row["iva_ves"]), 720.00, places=2)
        self.assertAlmostEqual(float(row["total_ves"]), 5220.00, places=2)

    def test_03_cxp_consolidado_query(self):
        """Verifica la consulta de consolidado de cuentas por pagar por proveedor."""
        self.cur.execute("""
            SELECT 
                p.id as proveedor_id,
                p.nombre as proveedor_nombre,
                p.cedula as proveedor_cedula,
                p.telefono as proveedor_telefono,
                p.correo as proveedor_correo,
                COUNT(cxp.id) as total_cuentas,
                COUNT(CASE WHEN cxp.estado != 'pagada' AND cxp.saldo_pendiente > 0.001 THEN 1 END) as cuentas_pendientes_count,
                COUNT(CASE WHEN cxp.estado != 'pagada' AND date(cxp.fecha_vencimiento) < date('now') THEN 1 END) as cuentas_vencidas_count,
                COALESCE(SUM(cxp.monto_total), 0.0) as total_facturado_usd,
                COALESCE(SUM(cxp.monto_pagado), 0.0) as total_pagado_usd,
                COALESCE(SUM(cxp.saldo_pendiente), 0.0) as saldo_pendiente_usd,
                ROUND(COALESCE(SUM(cxp.saldo_pendiente), 0.0) * cfg.tasa_ves, 2) as saldo_pendiente_ves
            FROM proveedores p
            INNER JOIN cuentas_por_pagar cxp ON cxp.proveedor_id = p.id
            CROSS JOIN configuracion cfg ON cfg.id = 1
            GROUP BY p.id
        """)
        rows = [dict(r) for r in self.cur.fetchall()]
        self.assertGreaterEqual(len(rows), 1)
        mocasa = next((r for r in rows if "MOCASA" in r["proveedor_nombre"].upper()), None)
        self.assertIsNotNone(mocasa)
        self.assertAlmostEqual(float(mocasa["saldo_pendiente_usd"]), 24940.00, places=2)
        self.assertGreaterEqual(int(mocasa["cuentas_pendientes_count"]), 1)

    def test_04_cxc_consolidado_query(self):
        """Verifica la consulta de consolidado de cuentas por cobrar por cliente."""
        # 1. Crear factura previa con todas las columnas requeridas
        self.cur.execute("""
            INSERT INTO facturas (
                numero_factura, cliente_id, tipo_venta, subtotal, iva_total, total,
                tasa_ves, tasa_cop, total_ves, total_cop, saldo_pendiente, total_usd, estado
            ) VALUES (
                'FACT-TEST-001', 1, 'credito', 1500.00, 0.0, 1500.00,
                45.0, 4000.0, 67500.00, 6000000.0, 1200.00, 1500.00, 'parcial'
            )
        """)
        factura_id = self.cur.lastrowid

        # 2. Insertar cuenta de crédito vinculada
        self.cur.execute("""
            INSERT INTO cuentas_por_cobrar (
                factura_id, cliente_id, monto_total, monto_pagado, saldo_pendiente,
                fecha_emision, fecha_vencimiento, estado, notas
            ) VALUES (
                ?, 1, 1500.00, 300.00, 1200.00, '2026-10-25', '2026-11-10', 'parcial', 'Factura de prueba'
            )
        """, (factura_id,))
        self.conn.commit()

        self.cur.execute("""
            SELECT 
                cl.id as cliente_id,
                cl.nombre as cliente_nombre,
                cl.cedula as cliente_cedula,
                cl.telefono as cliente_telefono,
                cl.correo as cliente_correo,
                COUNT(cxc.id) as total_facturas,
                COUNT(CASE WHEN cxc.estado != 'pagada' AND cxc.saldo_pendiente > 0.001 THEN 1 END) as facturas_pendientes_count,
                COUNT(CASE WHEN cxc.estado != 'pagada' AND date(cxc.fecha_vencimiento) < date('now') THEN 1 END) as facturas_vencidas_count,
                COALESCE(SUM(cxc.monto_total), 0.0) as total_facturado_usd,
                COALESCE(SUM(cxc.monto_pagado), 0.0) as total_pagado_usd,
                COALESCE(SUM(cxc.saldo_pendiente), 0.0) as saldo_pendiente_usd,
                ROUND(COALESCE(SUM(cxc.saldo_pendiente), 0.0) * cfg.tasa_ves, 2) as saldo_pendiente_ves
            FROM clientes cl
            INNER JOIN cuentas_por_cobrar cxc ON cxc.cliente_id = cl.id
            CROSS JOIN configuracion cfg ON cfg.id = 1
            WHERE cl.id = 1
            GROUP BY cl.id
        """)
        row = dict(self.cur.fetchone())
        self.assertEqual(row["cliente_id"], 1)
        self.assertAlmostEqual(float(row["saldo_pendiente_usd"]), 1200.00, places=2)
        self.assertAlmostEqual(float(row["total_facturado_usd"]), 1500.00, places=2)
        self.assertAlmostEqual(float(row["total_pagado_usd"]), 300.00, places=2)
        self.assertEqual(int(row["facturas_pendientes_count"]), 1)

    def test_05_nota_credito_cxc_disminuye_saldo(self):
        """Verifica que una Nota de Crédito en CXC disminuya el saldo de la factura y de la cuenta."""
        # 1. Crear factura
        self.cur.execute("""
            INSERT INTO facturas (
                numero_factura, cliente_id, tipo_venta, subtotal, iva_total, total,
                tasa_ves, tasa_cop, total_ves, total_cop, saldo_pendiente, total_usd, estado
            ) VALUES (
                'FACT-NC-001', 1, 'credito', 800.00, 0.0, 800.00,
                45.0, 4000.0, 36000.00, 3200000.0, 800.00, 800.00, 'pendiente'
            )
        """)
        factura_id = self.cur.lastrowid

        # 2. Crear cuenta por cobrar
        self.cur.execute("""
            INSERT INTO cuentas_por_cobrar (
                factura_id, cliente_id, monto_total, monto_pagado, saldo_pendiente,
                fecha_emision, fecha_vencimiento, estado, notas
            ) VALUES (
                ?, 1, 800.00, 0.0, 800.00, '2026-10-28', '2026-11-15', 'pendiente', 'Cuenta original'
            )
        """, (factura_id,))
        cxc_id = self.cur.lastrowid
        self.conn.commit()

        # 3. Aplicar Nota de Crédito por $150.00 (disminuye saldo)
        monto_nc = 150.00
        tasa_bcv = 45.0
        monto_ves = round(monto_nc * tasa_bcv, 2)

        self.cur.execute("SELECT * FROM cuentas_por_cobrar WHERE id = ?", (cxc_id,))
        cxc = dict(self.cur.fetchone())
        nuevo_pagado = round(float(cxc["monto_pagado"]) + monto_nc, 2)
        nuevo_saldo = max(0.0, round(float(cxc["monto_total"]) - nuevo_pagado, 2))
        nuevo_estado = "pagada" if nuevo_saldo <= 0.001 else "parcial"

        self.cur.execute("""
            UPDATE cuentas_por_cobrar
            SET monto_pagado = ?, saldo_pendiente = ?, estado = ?
            WHERE id = ?
        """, (nuevo_pagado, nuevo_saldo, nuevo_estado, cxc_id))

        self.cur.execute("""
            UPDATE facturas SET saldo_pendiente = ? WHERE id = ?
        """, (nuevo_saldo, factura_id))

        self.cur.execute("""
            INSERT INTO notas_ajuste_comercial (
                modulo, tercero_id, cuenta_id, tipo_nota, numero_nota, fecha,
                monto_usd, tasa_bcv, monto_ves, efecto, motivo, numero_control, afecta_libro_fiscal, usuario_id
            ) VALUES ('cxc', 1, ?, 'credito', 'NC-000001', '2026-10-29', ?, ?, ?, 'disminuye', 'Descuento comercial', '00-009901', 0, 1)
        """, (cxc_id, monto_nc, tasa_bcv, monto_ves))
        self.conn.commit()

        # 4. Verificar estado actualizado
        self.cur.execute("SELECT * FROM cuentas_por_cobrar WHERE id = ?", (cxc_id,))
        updated = dict(self.cur.fetchone())
        self.assertAlmostEqual(float(updated["saldo_pendiente"]), 650.00, places=2)
        self.assertAlmostEqual(float(updated["monto_pagado"]), 150.00, places=2)
        self.assertEqual(updated["estado"], "parcial")

        self.cur.execute("SELECT saldo_pendiente FROM facturas WHERE id = ?", (factura_id,))
        f_saldo = self.cur.fetchone()[0]
        self.assertAlmostEqual(float(f_saldo), 650.00, places=2)

    def test_06_nota_debito_cxc_incrementa_saldo(self):
        """Verifica que una Nota de Débito en CXC incremente el saldo de la factura."""
        self.cur.execute("""
            INSERT INTO facturas (
                numero_factura, cliente_id, tipo_venta, subtotal, iva_total, total,
                tasa_ves, tasa_cop, total_ves, total_cop, saldo_pendiente, total_usd, estado
            ) VALUES (
                'FACT-ND-001', 1, 'credito', 500.00, 0.0, 500.00,
                45.0, 4000.0, 22500.00, 2000000.0, 0.00, 500.00, 'pagada'
            )
        """)
        factura_id = self.cur.lastrowid

        self.cur.execute("""
            INSERT INTO cuentas_por_cobrar (
                factura_id, cliente_id, monto_total, monto_pagado, saldo_pendiente,
                fecha_emision, fecha_vencimiento, estado, notas
            ) VALUES (
                ?, 1, 500.00, 500.00, 0.00, '2026-10-20', '2026-10-25', 'pagada', 'Cuenta saldada'
            )
        """, (factura_id,))
        cxc_id = self.cur.lastrowid
        self.conn.commit()

        # Aplicar Nota de Débito por $50.00 por recargo de mora
        monto_nd = 50.00
        self.cur.execute("SELECT * FROM cuentas_por_cobrar WHERE id = ?", (cxc_id,))
        cxc = dict(self.cur.fetchone())
        nuevo_total = round(float(cxc["monto_total"]) + monto_nd, 2)
        nuevo_saldo = round(float(cxc["saldo_pendiente"]) + monto_nd, 2)
        nuevo_estado = "pendiente"

        self.cur.execute("""
            UPDATE cuentas_por_cobrar
            SET monto_total = ?, saldo_pendiente = ?, estado = ?
            WHERE id = ?
        """, (nuevo_total, nuevo_saldo, nuevo_estado, cxc_id))

        self.cur.execute("""
            UPDATE facturas SET total = ?, total_usd = ?, saldo_pendiente = ? WHERE id = ?
        """, (nuevo_total, nuevo_total, nuevo_saldo, factura_id))

        self.cur.execute("""
            INSERT INTO notas_ajuste_comercial (
                modulo, tercero_id, cuenta_id, tipo_nota, numero_nota, fecha,
                monto_usd, tasa_bcv, monto_ves, efecto, motivo, numero_control, afecta_libro_fiscal, usuario_id
            ) VALUES ('cxc', 1, ?, 'debito', 'ND-000001', '2026-10-29', ?, 45.0, 2250.0, 'incrementa', 'Recargo por mora', '00-009902', 0, 1)
        """, (cxc_id, monto_nd))
        self.conn.commit()

        self.cur.execute("SELECT * FROM cuentas_por_cobrar WHERE id = ?", (cxc_id,))
        updated = dict(self.cur.fetchone())
        self.assertAlmostEqual(float(updated["monto_total"]), 550.00, places=2)
        self.assertAlmostEqual(float(updated["saldo_pendiente"]), 50.00, places=2)
        self.assertEqual(updated["estado"], "pendiente")

        self.cur.execute("SELECT total_usd, saldo_pendiente FROM facturas WHERE id = ?", (factura_id,))
        f_row = dict(self.cur.fetchone())
        self.assertAlmostEqual(float(f_row["total_usd"]), 550.00, places=2)
        self.assertAlmostEqual(float(f_row["saldo_pendiente"]), 50.00, places=2)

    def test_07_nota_credito_cxp_disminuye_saldo(self):
        """Verifica que una Nota de Crédito en CXP disminuya la deuda con el proveedor."""
        # Tomar la cuenta por pagar existente de MOCASA (ID 1, Saldo $24,940.00)
        self.cur.execute("SELECT * FROM cuentas_por_pagar WHERE id = 1")
        cxp = dict(self.cur.fetchone())
        saldo_inicial = float(cxp["saldo_pendiente"])
        self.assertAlmostEqual(saldo_inicial, 24940.00, places=2)

        monto_nc = 940.00
        nuevo_pagado = round(float(cxp["monto_pagado"]) + monto_nc, 2)
        nuevo_saldo = max(0.0, round(float(cxp["monto_total"]) - nuevo_pagado, 2))
        nuevo_estado = "parcial"

        self.cur.execute("""
            UPDATE cuentas_por_pagar
            SET monto_pagado = ?, saldo_pendiente = ?, estado = ?
            WHERE id = 1
        """, (nuevo_pagado, nuevo_saldo, nuevo_estado))

        self.cur.execute("""
            INSERT INTO notas_ajuste_comercial (
                modulo, tercero_id, cuenta_id, tipo_nota, numero_nota, fecha,
                monto_usd, tasa_bcv, monto_ves, efecto, motivo, numero_control, afecta_libro_fiscal, usuario_id
            ) VALUES ('cxp', 1, 1, 'credito', 'NC-PROV-001', '2026-10-29', ?, 45.0, ?, 'disminuye', 'Bonificación especial proveedor', '00-001099', 1, 1)
        """, (monto_nc, round(monto_nc * 45.0, 2)))
        self.conn.commit()

        self.cur.execute("SELECT * FROM cuentas_por_pagar WHERE id = 1")
        updated = dict(self.cur.fetchone())
        self.assertAlmostEqual(float(updated["saldo_pendiente"]), 24000.00, places=2)
        self.assertAlmostEqual(float(updated["monto_pagado"]), 940.00, places=2)

    def test_08_nota_debito_cxp_incrementa_saldo(self):
        """Verifica que una Nota de Débito en CXP incremente la deuda con el proveedor."""
        self.cur.execute("SELECT * FROM cuentas_por_pagar WHERE id = 1")
        cxp = dict(self.cur.fetchone())
        saldo_inicial = float(cxp["saldo_pendiente"])

        monto_nd = 500.00
        nuevo_total = round(float(cxp["monto_total"]) + monto_nd, 2)
        nuevo_saldo = round(float(cxp["saldo_pendiente"]) + monto_nd, 2)

        self.cur.execute("""
            UPDATE cuentas_por_pagar
            SET monto_total = ?, saldo_pendiente = ?
            WHERE id = 1
        """, (nuevo_total, nuevo_saldo))

        self.cur.execute("""
            INSERT INTO notas_ajuste_comercial (
                modulo, tercero_id, cuenta_id, tipo_nota, numero_nota, fecha,
                monto_usd, tasa_bcv, monto_ves, efecto, motivo, numero_control, afecta_libro_fiscal, usuario_id
            ) VALUES ('cxp', 1, 1, 'debito', 'ND-PROV-001', '2026-10-29', ?, 45.0, ?, 'incrementa', 'Recargo flete adicional proveedor', '00-001100', 0, 1)
        """, (monto_nd, round(monto_nd * 45.0, 2)))
        self.conn.commit()

        self.cur.execute("SELECT * FROM cuentas_por_pagar WHERE id = 1")
        updated = dict(self.cur.fetchone())
        self.assertAlmostEqual(float(updated["saldo_pendiente"]), saldo_inicial + 500.00, places=2)
        self.assertAlmostEqual(float(updated["monto_total"]), float(cxp["monto_total"]) + 500.00, places=2)

    def test_09_preservacion_patrimonial_42_movimientos(self):
        """Regla de oro: verificar que los 42 movimientos canónicos de inventario no fueron alterados."""
        self.cur.execute("SELECT COUNT(*) FROM inventario_movimientos")
        count = self.cur.fetchone()[0]
        self.assertEqual(count, 42, f"Los movimientos canónicos deben ser exactamente 42, se encontraron {count}")

        # Conciliación matemática de inventario
        res = database.conciliar_inventario(self.conn)
        self.assertEqual(res["estado_general"], "CONCILIADO_OK")
        self.assertEqual(res["total_diferencia"], 0)

if __name__ == "__main__":
    unittest.main()
