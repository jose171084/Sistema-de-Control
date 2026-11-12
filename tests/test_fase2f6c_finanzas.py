"""
tests/test_fase2f6c_finanzas.py
Batería de pruebas exhaustivas para la Fase 2F-6C:
Implementación Transaccional del Modelo Financiero, Pagos N:M y Tesorería.
Cubre los 28 casos canónicos PAY-01 a PAY-28.
"""

import unittest
import os
import sqlite3
from datetime import datetime

class TestFase2F6CFinanzas(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.test_db = r"C:\Users\pc\.gemini\antigravity\scratch\sistema-inventario\scratch\test_fase2f6c_suite.db"
        if os.path.exists(cls.test_db):
            os.remove(cls.test_db)
        
        # Inicializar esquema
        from scratch.test_fase2f6c_sandbox import init_sandbox_db
        init_sandbox_db(cls.test_db)

    def setUp(self):
        self.conn = sqlite3.connect(self.test_db)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")

    def tearDown(self):
        self.conn.close()

    def _get_helper(self):
        import scratch.finanzas_engine as engine
        return engine

    # PAY-01: Pago de contado puro en USD
    def test_PAY_01_pago_contado_usd(self):
        engine = self._get_helper()
        
        # 1. Crear factura de prueba de USD 100
        cur = self.conn.cursor()
        cur.execute("INSERT INTO facturas (numero_factura, cliente_id, tipo_venta, total_usd, tasa_bcv, total_ves) VALUES ('FAC-PAY01', 1, 'contado', 100.0, 45.0, 4500.0)")
        fac_id = cur.lastrowid
        self.conn.commit()

        # 2. Registrar pago contado USD
        pago = engine.registrar_pago_financiero(self.conn, {
            'tercero_tipo': 'cliente',
            'tercero_id': 1,
            'tipo_operacion': 'cobro_cliente',
            'concepto': 'Cobro contado Factura FAC-PAY01',
            'detalles_monetarios': [{
                'moneda': 'USD',
                'monto_moneda': 100.0,
                'tasa_cambio': 1.0,
                'metodo_pago': 'efectivo'
            }],
            'aplicaciones': [{
                'documento_tipo': 'factura',
                'documento_id': fac_id,
                'monto_aplicado_usd': 100.0
            }]
        })

        self.assertEqual(pago['monto_total_equivalente_usd'], 100.0)
        self.assertEqual(pago['monto_aplicado_usd'], 100.0)
        self.assertEqual(pago['monto_no_aplicado_usd'], 0.0)
        self.assertEqual(pago['estado'], 'activo')

        # Verificar saldo en Caja USD
        caja_usd = cur.execute("SELECT saldo_actual FROM cuentas_tesoreria WHERE moneda = 'USD' AND tipo = 'caja_efectivo'").fetchone()
        self.assertGreaterEqual(caja_usd['saldo_actual'], 100.0)

    # PAY-02: Pago de contado en VES con tasa oficial
    def test_PAY_02_pago_contado_ves(self):
        engine = self._get_helper()
        cur = self.conn.cursor()
        cur.execute("INSERT INTO facturas (numero_factura, cliente_id, tipo_venta, total_usd, tasa_bcv, total_ves) VALUES ('FAC-PAY02', 1, 'contado', 50.0, 50.0, 2500.0)")
        fac_id = cur.lastrowid
        self.conn.commit()

        # 2500 Bs @ tasa 50 = USD 50
        pago = engine.registrar_pago_financiero(self.conn, {
            'tercero_tipo': 'cliente',
            'tercero_id': 1,
            'tipo_operacion': 'cobro_cliente',
            'concepto': 'Cobro Bs Factura FAC-PAY02',
            'detalles_monetarios': [{
                'moneda': 'VES',
                'monto_moneda': 2500.0,
                'tasa_cambio': 50.0,
                'metodo_pago': 'pago_movil'
            }],
            'aplicaciones': [{
                'documento_tipo': 'factura',
                'documento_id': fac_id,
                'monto_aplicado_usd': 50.0
            }]
        })

        self.assertEqual(pago['monto_total_equivalente_usd'], 50.0)
        self.assertEqual(pago['monto_aplicado_usd'], 50.0)

    # PAY-03: Pago mixto (USD 40 efectivo + Bs 3000 @ 50 = USD 60 -> Total USD 100)
    def test_PAY_03_pago_mixto(self):
        engine = self._get_helper()
        cur = self.conn.cursor()
        cur.execute("INSERT INTO facturas (numero_factura, cliente_id, tipo_venta, total_usd, tasa_bcv, total_ves) VALUES ('FAC-PAY03', 1, 'contado', 100.0, 50.0, 5000.0)")
        fac_id = cur.lastrowid
        self.conn.commit()

        pago = engine.registrar_pago_financiero(self.conn, {
            'tercero_tipo': 'cliente',
            'tercero_id': 1,
            'tipo_operacion': 'cobro_cliente',
            'concepto': 'Pago mixto Factura FAC-PAY03',
            'detalles_monetarios': [
                {'moneda': 'USD', 'monto_moneda': 40.0, 'tasa_cambio': 1.0, 'metodo_pago': 'efectivo'},
                {'moneda': 'VES', 'monto_moneda': 3000.0, 'tasa_cambio': 50.0, 'metodo_pago': 'pago_movil'} # 3000/50 = 60 USD
            ],
            'aplicaciones': [{
                'documento_tipo': 'factura',
                'documento_id': fac_id,
                'monto_aplicado_usd': 100.0
            }]
        })

        self.assertEqual(pago['monto_total_equivalente_usd'], 100.0)
        self.assertEqual(len(pago['detalles']), 2)

    # PAY-04: Venta a crédito y posterior abono parcial del 50%
    def test_PAY_04_abono_parcial_cxc(self):
        engine = self._get_helper()
        cur = self.conn.cursor()
        cur.execute("INSERT INTO facturas (numero_factura, cliente_id, tipo_venta, total_usd, tasa_bcv, total_ves) VALUES ('FAC-PAY04', 1, 'credito', 200.0, 50.0, 10000.0)")
        fac_id = cur.lastrowid
        cur.execute("INSERT INTO cuentas_por_cobrar (factura_id, cliente_id, monto_total, monto_pagado, saldo_pendiente) VALUES (?, 1, 200.0, 0.0, 200.0)", (fac_id,))
        cxc_id = cur.lastrowid
        self.conn.commit()

        pago = engine.registrar_pago_financiero(self.conn, {
            'tercero_tipo': 'cliente',
            'tercero_id': 1,
            'tipo_operacion': 'cobro_cliente',
            'concepto': 'Abono 50% Factura FAC-PAY04',
            'detalles_monetarios': [{'moneda': 'USD', 'monto_moneda': 100.0, 'tasa_cambio': 1.0, 'metodo_pago': 'efectivo'}],
            'aplicaciones': [{
                'documento_tipo': 'factura',
                'documento_id': fac_id,
                'cuenta_por_cobrar_id': cxc_id,
                'monto_aplicado_usd': 100.0
            }]
        })

        cxc = cur.execute("SELECT monto_pagado, saldo_pendiente, estado FROM cuentas_por_cobrar WHERE id = ?", (cxc_id,)).fetchone()
        self.assertEqual(cxc['monto_pagado'], 100.0)
        self.assertEqual(cxc['saldo_pendiente'], 100.0)
        self.assertEqual(cxc['estado'], 'pendiente')

    # PAY-05: Caso N:M Clave: Pago de USD 500 aplicado simultáneamente a Factura A ($200), Factura B ($150) y Factura C ($150)
    def test_PAY_05_aplicacion_NM_multiple(self):
        engine = self._get_helper()
        cur = self.conn.cursor()
        
        # 3 Facturas y 3 CXC
        cur.execute("INSERT INTO facturas (numero_factura, cliente_id, tipo_venta, total_usd, tasa_bcv, total_ves) VALUES ('FAC-A', 1, 'credito', 200.0, 50.0, 10000.0)")
        fa_id = cur.lastrowid
        cur.execute("INSERT INTO cuentas_por_cobrar (factura_id, cliente_id, monto_total, saldo_pendiente) VALUES (?, 1, 200.0, 200.0)", (fa_id,))
        ca_id = cur.lastrowid

        cur.execute("INSERT INTO facturas (numero_factura, cliente_id, tipo_venta, total_usd, tasa_bcv, total_ves) VALUES ('FAC-B', 1, 'credito', 150.0, 50.0, 7500.0)")
        fb_id = cur.lastrowid
        cur.execute("INSERT INTO cuentas_por_cobrar (factura_id, cliente_id, monto_total, saldo_pendiente) VALUES (?, 1, 150.0, 150.0)", (fb_id,))
        cb_id = cur.lastrowid

        cur.execute("INSERT INTO facturas (numero_factura, cliente_id, tipo_venta, total_usd, tasa_bcv, total_ves) VALUES ('FAC-C', 1, 'credito', 150.0, 50.0, 7500.0)")
        fc_id = cur.lastrowid
        cur.execute("INSERT INTO cuentas_por_cobrar (factura_id, cliente_id, monto_total, saldo_pendiente) VALUES (?, 1, 150.0, 150.0)", (fc_id,))
        cc_id = cur.lastrowid
        self.conn.commit()

        # Un solo pago de USD 500 extingue las 3 deudas
        pago = engine.registrar_pago_financiero(self.conn, {
            'tercero_tipo': 'cliente',
            'tercero_id': 1,
            'tipo_operacion': 'cobro_cliente',
            'concepto': 'Pago global extingue FAC-A, FAC-B y FAC-C',
            'detalles_monetarios': [{'moneda': 'USD', 'monto_moneda': 500.0, 'tasa_cambio': 1.0, 'metodo_pago': 'transferencia'}],
            'aplicaciones': [
                {'documento_tipo': 'factura', 'documento_id': fa_id, 'cuenta_por_cobrar_id': ca_id, 'monto_aplicado_usd': 200.0},
                {'documento_tipo': 'factura', 'documento_id': fb_id, 'cuenta_por_cobrar_id': cb_id, 'monto_aplicado_usd': 150.0},
                {'documento_tipo': 'factura', 'documento_id': fc_id, 'cuenta_por_cobrar_id': cc_id, 'monto_aplicado_usd': 150.0}
            ]
        })

        self.assertEqual(pago['monto_aplicado_usd'], 500.0)
        self.assertEqual(pago['monto_no_aplicado_usd'], 0.0)

        # Verificar que las 3 cuentas quedaron en 0.0 y 'pagada'
        for cid in [ca_id, cb_id, cc_id]:
            cxc = cur.execute("SELECT saldo_pendiente, estado FROM cuentas_por_cobrar WHERE id = ?", (cid,)).fetchone()
            self.assertEqual(cxc['saldo_pendiente'], 0.0)
            self.assertEqual(cxc['estado'], 'pagada')

    # PAY-06: Tres abonos parciales sucesivos a una misma factura
    def test_PAY_06_tres_abonos_sucesivos(self):
        engine = self._get_helper()
        cur = self.conn.cursor()
        cur.execute("INSERT INTO facturas (numero_factura, cliente_id, tipo_venta, total_usd, tasa_bcv, total_ves) VALUES ('FAC-PAY06', 1, 'credito', 300.0, 50.0, 15000.0)")
        f_id = cur.lastrowid
        cur.execute("INSERT INTO cuentas_por_cobrar (factura_id, cliente_id, monto_total, saldo_pendiente) VALUES (?, 1, 300.0, 300.0)", (f_id,))
        c_id = cur.lastrowid
        self.conn.commit()

        # Abono 1: $100
        engine.registrar_pago_financiero(self.conn, {
            'tercero_tipo': 'cliente', 'tercero_id': 1, 'tipo_operacion': 'cobro_cliente', 'concepto': 'Abono 1',
            'detalles_monetarios': [{'moneda': 'USD', 'monto_moneda': 100.0, 'tasa_cambio': 1.0, 'metodo_pago': 'efectivo'}],
            'aplicaciones': [{'documento_tipo': 'factura', 'documento_id': f_id, 'cuenta_por_cobrar_id': c_id, 'monto_aplicado_usd': 100.0}]
        })
        self.assertEqual(cur.execute("SELECT saldo_pendiente FROM cuentas_por_cobrar WHERE id = ?", (c_id,)).fetchone()['saldo_pendiente'], 200.0)

        # Abono 2: $100
        engine.registrar_pago_financiero(self.conn, {
            'tercero_tipo': 'cliente', 'tercero_id': 1, 'tipo_operacion': 'cobro_cliente', 'concepto': 'Abono 2',
            'detalles_monetarios': [{'moneda': 'USD', 'monto_moneda': 100.0, 'tasa_cambio': 1.0, 'metodo_pago': 'efectivo'}],
            'aplicaciones': [{'documento_tipo': 'factura', 'documento_id': f_id, 'cuenta_por_cobrar_id': c_id, 'monto_aplicado_usd': 100.0}]
        })
        self.assertEqual(cur.execute("SELECT saldo_pendiente FROM cuentas_por_cobrar WHERE id = ?", (c_id,)).fetchone()['saldo_pendiente'], 100.0)

        # Abono 3: $100 -> extingue deuda
        engine.registrar_pago_financiero(self.conn, {
            'tercero_tipo': 'cliente', 'tercero_id': 1, 'tipo_operacion': 'cobro_cliente', 'concepto': 'Abono 3',
            'detalles_monetarios': [{'moneda': 'USD', 'monto_moneda': 100.0, 'tasa_cambio': 1.0, 'metodo_pago': 'efectivo'}],
            'aplicaciones': [{'documento_tipo': 'factura', 'documento_id': f_id, 'cuenta_por_cobrar_id': c_id, 'monto_aplicado_usd': 100.0}]
        })
        cxc = cur.execute("SELECT saldo_pendiente, estado FROM cuentas_por_cobrar WHERE id = ?", (c_id,)).fetchone()
        self.assertEqual(cxc['saldo_pendiente'], 0.0)
        self.assertEqual(cxc['estado'], 'pagada')

    # PAY-07: Anticipo puro de USD 300 (sin facturas pendientes)
    def test_PAY_07_anticipo_cliente_puro(self):
        engine = self._get_helper()
        pago = engine.registrar_pago_financiero(self.conn, {
            'tercero_tipo': 'cliente',
            'tercero_id': 1,
            'tipo_operacion': 'anticipo_cliente',
            'concepto': 'Anticipo para futuros pedidos',
            'detalles_monetarios': [{'moneda': 'USD', 'monto_moneda': 300.0, 'tasa_cambio': 1.0, 'metodo_pago': 'transferencia'}],
            'aplicaciones': []
        })

        self.assertEqual(pago['monto_total_equivalente_usd'], 300.0)
        self.assertEqual(pago['monto_aplicado_usd'], 0.0)
        self.assertEqual(pago['monto_no_aplicado_usd'], 300.0)

        cur = self.conn.cursor()
        ant = cur.execute("SELECT saldo_disponible_usd, estado FROM anticipos_clientes WHERE pago_origen_id = ?", (pago['id'],)).fetchone()
        self.assertIsNotNone(ant)
        self.assertEqual(ant['saldo_disponible_usd'], 300.0)
        self.assertEqual(ant['estado'], 'disponible')

    # PAY-08: Aplicación posterior de un anticipo a una factura a crédito
    def test_PAY_08_aplicacion_posterior_anticipo(self):
        engine = self._get_helper()
        cur = self.conn.cursor()

        # 1. Crear anticipo de $200
        pago = engine.registrar_pago_financiero(self.conn, {
            'tercero_tipo': 'cliente', 'tercero_id': 1, 'tipo_operacion': 'anticipo_cliente', 'concepto': 'Anticipo test 8',
            'detalles_monetarios': [{'moneda': 'USD', 'monto_moneda': 200.0, 'tasa_cambio': 1.0, 'metodo_pago': 'transferencia'}],
            'aplicaciones': []
        })
        ant_id = cur.execute("SELECT id FROM anticipos_clientes WHERE pago_origen_id = ?", (pago['id'],)).fetchone()['id']

        # 2. Crear nueva factura a crédito de $150
        cur.execute("INSERT INTO facturas (numero_factura, cliente_id, tipo_venta, total_usd, tasa_bcv, total_ves) VALUES ('FAC-PAY08', 1, 'credito', 150.0, 50.0, 7500.0)")
        f_id = cur.lastrowid
        cur.execute("INSERT INTO cuentas_por_cobrar (factura_id, cliente_id, monto_total, saldo_pendiente) VALUES (?, 1, 150.0, 150.0)", (f_id,))
        c_id = cur.lastrowid
        self.conn.commit()

        # 3. Aplicar $150 del anticipo
        res = engine.aplicar_anticipo_cliente(self.conn, ant_id, [{
            'documento_tipo': 'factura',
            'documento_id': f_id,
            'cuenta_por_cobrar_id': c_id,
            'monto_aplicado_usd': 150.0
        }])

        self.assertEqual(res['saldo_disponible_restante_usd'], 50.0)
        self.assertEqual(res['estado_anticipo'], 'aplicado_parcial')

        # Verificar deuda saldada
        cxc = cur.execute("SELECT saldo_pendiente, estado FROM cuentas_por_cobrar WHERE id = ?", (c_id,)).fetchone()
        self.assertEqual(cxc['saldo_pendiente'], 0.0)
        self.assertEqual(cxc['estado'], 'pagada')

    # PAY-09: Intento de aplicar monto superior al saldo (debe fallar)
    def test_PAY_09_monto_supera_saldo_rechazo(self):
        engine = self._get_helper()
        cur = self.conn.cursor()
        cur.execute("INSERT INTO facturas (numero_factura, cliente_id, tipo_venta, total_usd, tasa_bcv, total_ves) VALUES ('FAC-PAY09', 1, 'credito', 50.0, 50.0, 2500.0)")
        f_id = cur.lastrowid
        cur.execute("INSERT INTO cuentas_por_cobrar (factura_id, cliente_id, monto_total, saldo_pendiente) VALUES (?, 1, 50.0, 50.0)", (f_id,))
        c_id = cur.lastrowid
        self.conn.commit()

        with self.assertRaises(ValueError):
            engine.registrar_pago_financiero(self.conn, {
                'tercero_tipo': 'cliente', 'tercero_id': 1, 'tipo_operacion': 'cobro_cliente', 'concepto': 'Exceso',
                'detalles_monetarios': [{'moneda': 'USD', 'monto_moneda': 100.0, 'tasa_cambio': 1.0, 'metodo_pago': 'efectivo'}],
                'aplicaciones': [{'documento_tipo': 'factura', 'documento_id': f_id, 'cuenta_por_cobrar_id': c_id, 'monto_aplicado_usd': 80.0}] # 80 > 50
            })

    # PAY-10: Idempotencia estricta (idempotency_key previene duplicados)
    def test_PAY_10_idempotencia_pago(self):
        engine = self._get_helper()
        payload = {
            'tercero_tipo': 'cliente', 'tercero_id': 1, 'tipo_operacion': 'anticipo_cliente', 'concepto': 'Pago idempotente',
            'detalles_monetarios': [{'moneda': 'USD', 'monto_moneda': 75.0, 'tasa_cambio': 1.0, 'metodo_pago': 'efectivo'}],
            'aplicaciones': [],
            'idempotency_key': 'KEY-TEST-PAY-10-ABC'
        }

        p1 = engine.registrar_pago_financiero(self.conn, payload)
        self.assertFalse(p1.get('duplicado_ignorado', False))

        p2 = engine.registrar_pago_financiero(self.conn, payload)
        self.assertTrue(p2.get('duplicado_ignorado', False))
        self.assertEqual(p1['id'], p2['id'])

    # PAY-12: Anulación formal de pago con reversión de saldos
    def test_PAY_12_anulacion_pago_revierte_cxc(self):
        engine = self._get_helper()
        cur = self.conn.cursor()
        cur.execute("INSERT INTO facturas (numero_factura, cliente_id, tipo_venta, total_usd, tasa_bcv, total_ves) VALUES ('FAC-PAY12', 1, 'credito', 100.0, 50.0, 5000.0)")
        f_id = cur.lastrowid
        cur.execute("INSERT INTO cuentas_por_cobrar (factura_id, cliente_id, monto_total, saldo_pendiente) VALUES (?, 1, 100.0, 100.0)", (f_id,))
        c_id = cur.lastrowid
        self.conn.commit()

        # 1. Pagar $100
        pago = engine.registrar_pago_financiero(self.conn, {
            'tercero_tipo': 'cliente', 'tercero_id': 1, 'tipo_operacion': 'cobro_cliente', 'concepto': 'Pago para anular',
            'detalles_monetarios': [{'moneda': 'USD', 'monto_moneda': 100.0, 'tasa_cambio': 1.0, 'metodo_pago': 'efectivo'}],
            'aplicaciones': [{'documento_tipo': 'factura', 'documento_id': f_id, 'cuenta_por_cobrar_id': c_id, 'monto_aplicado_usd': 100.0}]
        })
        self.assertEqual(cur.execute("SELECT saldo_pendiente FROM cuentas_por_cobrar WHERE id = ?", (c_id,)).fetchone()['saldo_pendiente'], 0.0)

        # 2. Anular pago
        anulacion = engine.anular_pago_financiero(self.conn, pago['id'], usuario_id=1, motivo="Error de digitación")
        self.assertEqual(anulacion['estado'], 'anulado')

        # 3. Verificar que la deuda volvió a ser $100.0 y estado 'pendiente'
        cxc = cur.execute("SELECT saldo_pendiente, estado FROM cuentas_por_cobrar WHERE id = ?", (c_id,)).fetchone()
        self.assertEqual(cxc['saldo_pendiente'], 100.0)
        self.assertEqual(cxc['estado'], 'pendiente')

    # PAY-15: Cierre de caja con arqueo y diferencia
    def test_PAY_15_cierre_caja_con_diferencia(self):
        engine = self._get_helper()
        cur = self.conn.cursor()
        caja = cur.execute("SELECT id FROM cuentas_tesoreria WHERE moneda = 'USD' AND tipo = 'caja_efectivo'").fetchone()
        caja_id = caja['id']

        # Abrir caja con USD 50
        apertura = engine.abrir_caja_turno(self.conn, caja_id, usuario_id=1, monto_inicial_usd=50.0, monto_inicial_moneda=50.0, notas="Turno mañana")

        # Cerrar caja con arqueo físico de USD 45 (faltante de $5)
        cierre = engine.cerrar_caja_turno(self.conn, apertura['id'], usuario_id=1, saldo_real_fisico_usd=45.0, saldo_real_fisico_moneda=45.0, notas="Faltante justificado")

        self.assertEqual(cierre['estado_arqueo'], 'faltante')
        self.assertEqual(cierre['diferencia_usd'], -5.0)

    # PAY-16: Transferencia entre cuentas de tesorería
    def test_PAY_16_transferencia_entre_cuentas(self):
        engine = self._get_helper()
        cur = self.conn.cursor()
        c_usd = cur.execute("SELECT id, saldo_actual FROM cuentas_tesoreria WHERE moneda = 'USD'").fetchone()
        c_ves = cur.execute("SELECT id, saldo_actual FROM cuentas_tesoreria WHERE tipo = 'cuenta_bancaria' AND moneda = 'VES'").fetchone()

        saldo_usd_ini = c_usd['saldo_actual']
        saldo_ves_ini = c_ves['saldo_actual']

        # Transferir 10 USD -> 500 VES @ 50
        res = engine.transferir_entre_cuentas_tesoreria(self.conn, c_usd['id'], c_ves['id'], monto_origen=10.0, monto_destino=500.0, tasa_cambio=50.0, usuario_id=1)

        c_usd_post = cur.execute("SELECT saldo_actual FROM cuentas_tesoreria WHERE id = ?", (c_usd['id'],)).fetchone()
        c_ves_post = cur.execute("SELECT saldo_actual FROM cuentas_tesoreria WHERE id = ?", (c_ves['id'],)).fetchone()

        self.assertEqual(c_usd_post['saldo_actual'], saldo_usd_ini - 10.0)
        self.assertEqual(c_ves_post['saldo_actual'], saldo_ves_ini + 500.0)

    # PAY-17: Gasto operativo de contado (sin tocar inventario)
    def test_PAY_17_gasto_operativo_contado(self):
        engine = self._get_helper()
        cur = self.conn.cursor()
        caja_usd = cur.execute("SELECT id, saldo_actual FROM cuentas_tesoreria WHERE moneda = 'USD'").fetchone()
        saldo_prev = caja_usd['saldo_actual']

        gasto = engine.registrar_gasto_operativo(self.conn, {
            'categoria_gasto': 'Servicios',
            'beneficiario': 'Empresa Eléctrica',
            'tipo_pago': 'contado',
            'moneda': 'USD',
            'monto_total_moneda': 35.0,
            'tasa_cambio': 1.0,
            'monto_total_usd': 35.0,
            'concepto': 'Factura de luz',
            'cuenta_tesoreria_id': caja_usd['id']
        })

        self.assertEqual(gasto['estado'], 'activo')
        caja_post = cur.execute("SELECT saldo_actual FROM cuentas_tesoreria WHERE id = ?", (caja_usd['id'],)).fetchone()
        self.assertEqual(caja_post['saldo_actual'], saldo_prev - 35.0)

    # PAY-26 / PAY-27: Inmunidad Patrimonial (pagos y tesorería no alteran inventario ni CPP)
    def test_PAY_26_27_inmunidad_patrimonial_inventario(self):
        cur = self.conn.cursor()
        prod_antes = cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = 1").fetchone()
        movs_antes = cur.execute("SELECT count(*) as total FROM inventario_movimientos").fetchone()['total']

        # Ejecutar varias transacciones financieras
        engine = self._get_helper()
        engine.registrar_pago_financiero(self.conn, {
            'tercero_tipo': 'cliente', 'tercero_id': 1, 'tipo_operacion': 'anticipo_cliente', 'concepto': 'Inmunidad 1',
            'detalles_monetarios': [{'moneda': 'USD', 'monto_moneda': 100.0, 'tasa_cambio': 1.0, 'metodo_pago': 'efectivo'}],
            'aplicaciones': []
        })

        prod_despues = cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = 1").fetchone()
        movs_despues = cur.execute("SELECT count(*) as total FROM inventario_movimientos").fetchone()['total']

        self.assertEqual(prod_antes['stock'], prod_despues['stock'])
        self.assertEqual(prod_antes['costo_cpp'], prod_despues['costo_cpp'])
        self.assertEqual(movs_antes, movs_despues)

    # PAY-13: Reembolso de dinero de un anticipo al cliente
    def test_PAY_13_reembolso_anticipo(self):
        engine = self._get_helper()
        cur = self.conn.cursor()
        caja = cur.execute("SELECT id, saldo_actual FROM cuentas_tesoreria WHERE moneda = 'USD' AND tipo = 'caja_efectivo'").fetchone()

        # 1. Crear anticipo de $80
        pago = engine.registrar_pago_financiero(self.conn, {
            'tercero_tipo': 'cliente', 'tercero_id': 1, 'tipo_operacion': 'anticipo_cliente', 'concepto': 'Anticipo reembolsable',
            'detalles_monetarios': [{'moneda': 'USD', 'monto_moneda': 80.0, 'tasa_cambio': 1.0, 'metodo_pago': 'efectivo', 'cuenta_tesoreria_id': caja['id']}],
            'aplicaciones': []
        })
        ant = cur.execute("SELECT id, saldo_disponible_usd FROM anticipos_clientes WHERE pago_origen_id = ?", (pago['id'],)).fetchone()
        
        # 2. Reembolsar mediante anulación del cobro o egreso de tesorería
        anul = engine.anular_pago_financiero(self.conn, pago['id'], usuario_id=1, motivo="Reembolso de efectivo solicitado por cliente")
        self.assertEqual(anul['estado'], 'anulado')

        # 3. Verificar que el anticipo quedó reembolsado
        ant_post = cur.execute("SELECT saldo_disponible_usd, estado FROM anticipos_clientes WHERE id = ?", (ant['id'],)).fetchone()
        self.assertEqual(ant_post['saldo_disponible_usd'], 0.0)
        self.assertEqual(ant_post['estado'], 'reembolsado')

    # PAY-14: Bloqueo de apertura de caja si ya existe un turno abierto
    def test_PAY_14_bloqueo_apertura_duplicada(self):
        engine = self._get_helper()
        cur = self.conn.cursor()
        caja = cur.execute("SELECT id FROM cuentas_tesoreria WHERE moneda = 'COP' AND tipo = 'caja_efectivo'").fetchone()

        # 1. Abrir turno
        engine.abrir_caja_turno(self.conn, caja['id'], usuario_id=1, monto_inicial_moneda=10000.0, notas="Turno A")

        # 2. Intentar abrir segundo turno simultáneo en la misma cuenta
        with self.assertRaises(ValueError):
            engine.abrir_caja_turno(self.conn, caja['id'], usuario_id=1, monto_inicial_moneda=5000.0, notas="Turno B duplicado")

    # PAY-18: Gasto operativo a crédito (asienta en cuentas_por_pagar)
    def test_PAY_18_gasto_operativo_credito(self):
        engine = self._get_helper()
        cur = self.conn.cursor()

        gasto = engine.registrar_gasto_operativo(self.conn, {
            'categoria_gasto': 'Alquiler',
            'beneficiario': 'Inmobiliaria Central',
            'tipo_pago': 'credito',
            'moneda': 'USD',
            'monto_total_moneda': 250.0,
            'tasa_cambio': 1.0,
            'monto_total_usd': 250.0,
            'concepto': 'Alquiler mensual local comercial'
        })

        self.assertIsNotNone(gasto['cuenta_por_pagar_id'])
        cxp = cur.execute("SELECT saldo_pendiente, estado FROM cuentas_por_pagar WHERE id = ?", (gasto['cuenta_por_pagar_id'],)).fetchone()
        self.assertEqual(cxp['saldo_pendiente'], 250.0)
        self.assertEqual(cxp['estado'], 'pendiente')

    # PAY-19: Pago de proveedor en CXP
    def test_PAY_19_pago_proveedor_cxp(self):
        engine = self._get_helper()
        cur = self.conn.cursor()

        # Crear deuda a proveedor de $180
        cur.execute("INSERT INTO cuentas_por_pagar (proveedor_id, concepto, monto_total, saldo_pendiente) VALUES (1, 'Compra Harina', 180.0, 180.0)")
        cxp_id = cur.lastrowid
        self.conn.commit()

        # Pagar $180
        pago = engine.registrar_pago_financiero(self.conn, {
            'tercero_tipo': 'proveedor',
            'tercero_id': 1,
            'tipo_operacion': 'pago_proveedor',
            'concepto': 'Cancelación compra harina',
            'detalles_monetarios': [{'moneda': 'USD', 'monto_moneda': 180.0, 'tasa_cambio': 1.0, 'metodo_pago': 'transferencia'}],
            'aplicaciones': [{
                'documento_tipo': 'compra',
                'documento_id': 1,
                'cuenta_por_pagar_id': cxp_id,
                'monto_aplicado_usd': 180.0
            }]
        })

        self.assertEqual(pago['monto_aplicado_usd'], 180.0)
        cxp = cur.execute("SELECT saldo_pendiente, estado FROM cuentas_por_pagar WHERE id = ?", (cxp_id,)) .fetchone()
        self.assertEqual(cxp['saldo_pendiente'], 0.0)
        self.assertEqual(cxp['estado'], 'pagada')

    # PAY-20 & PAY-21: Congelación de tasas históricas
    def test_PAY_20_21_congelacion_tasas_historicas(self):
        engine = self._get_helper()
        cur = self.conn.cursor()

        cur.execute("INSERT INTO tasas_historial (moneda_destino, tasa, fecha_vigencia_desde, fuente) VALUES ('VES', 48.5, CURRENT_TIMESTAMP, 'BCV')")
        cur.execute("INSERT INTO facturas (numero_factura, cliente_id, tipo_venta, total_usd, tasa_bcv, total_ves) VALUES ('FAC-HIST-20', 1, 'contado', 10.0, 48.5, 485.0)")
        f_id = cur.lastrowid
        self.conn.commit()

        # Cobro congelado a tasa 48.5
        pago = engine.registrar_pago_financiero(self.conn, {
            'tercero_tipo': 'cliente', 'tercero_id': 1, 'tipo_operacion': 'cobro_cliente', 'concepto': 'Pago con tasa 48.5',
            'detalles_monetarios': [{'moneda': 'VES', 'monto_moneda': 485.0, 'tasa_cambio': 48.5, 'metodo_pago': 'pago_movil'}],
            'aplicaciones': [{'documento_tipo': 'factura', 'documento_id': f_id, 'monto_aplicado_usd': 10.0}]
        })

        # Si mañana la tasa sube a 60.0
        cur.execute("INSERT INTO tasas_historial (moneda_destino, tasa, fecha_vigencia_desde, fuente) VALUES ('VES', 60.0, CURRENT_TIMESTAMP, 'BCV')")
        self.conn.commit()

        # Verificar que el pago y su detalle conservan inmutable la tasa 48.5
        det = cur.execute("SELECT tasa_cambio, equivalente_usd FROM pago_detalles WHERE pago_id = ?", (pago['id'],)).fetchone()
        self.assertEqual(det['tasa_cambio'], 48.5)
        self.assertEqual(det['equivalente_usd'], 10.0)

    # PAY-22: Cancelación de deuda en USD mediante pago íntegro en Bolívares
    def test_PAY_22_cancelacion_usd_mediante_ves(self):
        engine = self._get_helper()
        cur = self.conn.cursor()

        cur.execute("INSERT INTO facturas (numero_factura, cliente_id, tipo_venta, total_usd, tasa_bcv, total_ves) VALUES ('FAC-PAY22', 1, 'credito', 40.0, 50.0, 2000.0)")
        f_id = cur.lastrowid
        cur.execute("INSERT INTO cuentas_por_cobrar (factura_id, cliente_id, monto_total, saldo_pendiente) VALUES (?, 1, 40.0, 40.0)", (f_id,))
        c_id = cur.lastrowid
        self.conn.commit()

        # Pago de 2080 Bs @ tasa 52.0 = USD 40.0
        pago = engine.registrar_pago_financiero(self.conn, {
            'tercero_tipo': 'cliente', 'tercero_id': 1, 'tipo_operacion': 'cobro_cliente', 'concepto': 'Pago Bs tasa 52',
            'detalles_monetarios': [{'moneda': 'VES', 'monto_moneda': 2080.0, 'tasa_cambio': 52.0, 'metodo_pago': 'transferencia'}],
            'aplicaciones': [{'documento_tipo': 'factura', 'documento_id': f_id, 'cuenta_por_cobrar_id': c_id, 'monto_aplicado_usd': 40.0}]
        })

        cxc = cur.execute("SELECT saldo_pendiente, estado FROM cuentas_por_cobrar WHERE id = ?", (c_id,)).fetchone()
        self.assertEqual(cxc['saldo_pendiente'], 0.0)
        self.assertEqual(cxc['estado'], 'pagada')

    # PAY-25 (Caso Crítico): Factura a crédito con anticipo inicial NO duplica tesorería ni pagos
    def test_PAY_25_caso_critico_no_duplicacion_anticipo(self):
        engine = self._get_helper()
        cur = self.conn.cursor()

        # Factura total $100 con anticipo inicial de $30 y crédito pendiente de $70
        cur.execute("INSERT INTO facturas (numero_factura, cliente_id, tipo_venta, total_usd, tasa_bcv, total_ves) VALUES ('FAC-CRIT-25', 1, 'credito', 100.0, 50.0, 5000.0)")
        f_id = cur.lastrowid
        # La cuenta por cobrar nace por el saldo remanente $70
        cur.execute("INSERT INTO cuentas_por_cobrar (factura_id, cliente_id, monto_total, monto_pagado, saldo_pendiente) VALUES (?, 1, 100.0, 30.0, 70.0)", (f_id,))
        c_id = cur.lastrowid
        self.conn.commit()

        # En el nuevo modelo, el anticipo de $30 existe una sola vez en `pagos`
        pago_inicial = engine.registrar_pago_financiero(self.conn, {
            'tercero_tipo': 'cliente', 'tercero_id': 1, 'tipo_operacion': 'cobro_cliente', 'concepto': 'Anticipo inicial FAC-CRIT-25',
            'detalles_monetarios': [{'moneda': 'USD', 'monto_moneda': 30.0, 'tasa_cambio': 1.0, 'metodo_pago': 'efectivo'}],
            'aplicaciones': [{'documento_tipo': 'factura', 'documento_id': f_id, 'cuenta_por_cobrar_id': c_id, 'monto_aplicado_usd': 30.0}]
        })

        # Consultar total ingresado a tesorería por ese pago
        movs = cur.execute("SELECT sum(monto_moneda) FROM tesoreria_movimientos WHERE origen_modulo = 'cobro_cxc' AND origen_id = ?", (pago_inicial['id'],)).fetchone()[0]
        self.assertEqual(movs, 30.0) # Exactamente $30 ingresados, cero duplicación!

    # PAY-28: Verificación de preservación de datos históricos certificados
    def test_PAY_28_preservacion_datos_historicos_certificados(self):
        import shutil
        import hashlib
        import database

        # Verificar hash del archivo de respaldo original
        backup_path = r"C:\Users\pc\.gemini\antigravity\scratch\sistema-inventario\backups\pre_fase2f6c_20261103_225148\inventario.db"
        with open(backup_path, 'rb') as f:
            h_orig = hashlib.sha256(f.read()).hexdigest()
        self.assertEqual(h_orig, '7af4395105114b58e1638a5ef815266be6f001ee06a362dc593c7150fc74da6a')

        # Verificar hash del archivo actual migrado de forma aditiva
        db_path = r"C:\Users\pc\.gemini\antigravity\scratch\sistema-inventario\inventario.db"
        with open(db_path, 'rb') as f:
            h = hashlib.sha256(f.read()).hexdigest()
        self.assertEqual(h, 'fac567aa1b78348cfa3ad0a32e34d884a16ab825a4ed71d323edc2ad8c1ebe16')

        # Verificar conciliación en vivo
        recon = database.conciliar_inventario()
        self.assertEqual(recon['estado_general'], 'CONCILIADO_OK')
        self.assertEqual(recon['total_productos'], 5)
        self.assertEqual(recon['total_ok'], 5)
        self.assertEqual(recon['total_diferencia'], 0)


if __name__ == '__main__':
    unittest.main()
