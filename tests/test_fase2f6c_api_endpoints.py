# -*- coding: utf-8 -*-
"""
test_fase2f6c_api_endpoints.py - Suite de pruebas de integración HTTP para Fase 2F-6C:
Endpoints REST del Modelo Financiero, Tesorería, Cajas, Gastos y Anticipos N:M.
Opera sobre base de datos SQLite temporal y servidor HTTP en hilo aislado.
"""

import sys
import os
import unittest
import sqlite3
import shutil
import tempfile
import json
import threading
import urllib.request
import urllib.error
import socketserver

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

import database
import server
from server import InventoryAppHandler

class TestFase2F6CApiEndpoints(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # 1. Crear copia temporal de inventario.db
        cls.temp_dir = tempfile.mkdtemp(prefix="test_fase2f6c_api_")
        cls.temp_db = os.path.join(cls.temp_dir, "test_inventario.db")
        shutil.copy2(os.path.join(BASE_DIR, "inventario.db"), cls.temp_db)

        # 2. Configurar database.DB_PATH y migrar
        cls.original_db_path = database.DB_PATH
        database.DB_PATH = cls.temp_db

        conn = sqlite3.connect(cls.temp_db)
        cur = conn.cursor()
        database.auditar_y_migrar_db(conn, cur)
        conn.commit()
        conn.close()

        # 3. Iniciar servidor de prueba en puerto efímero (puerto 0)
        socketserver.TCPServer.allow_reuse_address = True
        cls.httpd = socketserver.TCPServer(("127.0.0.1", 0), InventoryAppHandler)
        cls.port = cls.httpd.server_address[1]
        cls.server_thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.port}"

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        database.DB_PATH = cls.original_db_path
        shutil.rmtree(cls.temp_dir, ignore_errors=True)

    def _get(self, path):
        url = f"{self.base_url}{path}"
        req = urllib.request.Request(url, method="GET")
        try:
            with urllib.request.urlopen(req) as resp:
                status = resp.status
                data = json.loads(resp.read().decode("utf-8"))
                return status, data
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read().decode("utf-8"))

    def _post(self, path, payload):
        url = f"{self.base_url}{path}"
        body_bytes = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body_bytes,
            headers={"Content-Type": "application/json; charset=utf-8"},
            method="POST"
        )
        try:
            with urllib.request.urlopen(req) as resp:
                status = resp.status
                data = json.loads(resp.read().decode("utf-8"))
                return status, data
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read().decode("utf-8"))

    def test_01_get_cuentas_tesoreria(self):
        """GET /api/tesoreria/cuentas retorna lista de cuentas sembradas."""
        status, res = self._get("/api/tesoreria/cuentas")
        self.assertEqual(status, 200)
        self.assertTrue(res.get("success"))
        cuentas = res.get("data", [])
        self.assertGreaterEqual(len(cuentas), 4)
        nombres = [c["nombre"] for c in cuentas]
        self.assertTrue(any("Caja Principal USD" in n for n in nombres))

    def test_02_get_resumen_tesoreria(self):
        """GET /api/tesoreria/resumen retorna cuentas, totales y cajas abiertas."""
        status, res = self._get("/api/tesoreria/resumen")
        self.assertEqual(status, 200)
        self.assertTrue(res.get("success"))
        data = res.get("data", {})
        self.assertIn("cuentas", data)
        self.assertIn("totales_moneda", data)
        self.assertIn("cajas_abiertas", data)

    def test_03_apertura_y_cierre_caja(self):
        """POST /api/tesoreria/cajas/apertura y POST /api/tesoreria/cajas/cierre."""
        # 1. Apertura
        payload_apertura = {
            "cuenta_tesoreria_id": 1,
            "usuario_id": 1,
            "monto_inicial_usd": 150.0,
            "monto_inicial_moneda": 150.0,
            "notas": "Apertura turno matutino"
        }
        status, res_ap = self._post("/api/tesoreria/cajas/apertura", payload_apertura)
        self.assertEqual(status, 201)
        self.assertTrue(res_ap.get("success"))
        apertura_id = res_ap["data"]["id"]

        # 2. Cierre
        payload_cierre = {
            "caja_apertura_id": apertura_id,
            "usuario_id": 1,
            "saldo_real_fisico_usd": 150.0,
            "saldo_real_fisico_moneda": 150.0,
            "notas": "Cierre sin diferencias"
        }
        status, res_cl = self._post("/api/tesoreria/cajas/cierre", payload_cierre)
        self.assertEqual(status, 200)
        self.assertTrue(res_cl.get("success"))
        self.assertEqual(res_cl["data"]["estado_arqueo"], "cuadrado")
        self.assertEqual(res_cl["data"]["diferencia_usd"], 0.0)

    def test_04_registrar_pago_anticipo_y_anulacion(self):
        """Ciclo completo POST /api/pagos, GET /api/pagos, y POST /api/pagos/<id>/anular."""
        payload_pago = {
            "tipo_operacion": "cobro_cliente",
            "tercero_tipo": "cliente",
            "tercero_id": 1,
            "concepto": "Anticipo de cliente para futuros pedidos",
            "detalles": [
                {
                    "cuenta_tesoreria_id": 1,
                    "metodo_pago": "efectivo_usd",
                    "moneda": "USD",
                    "monto_moneda": 100.0,
                    "tasa_cambio": 1.0,
                    "monto_equivalente_usd": 100.0
                }
            ],
            "aplicaciones": [] # Genera $100 de saldo a favor
        }
        status, res_pago = self._post("/api/pagos", payload_pago)
        self.assertEqual(status, 201)
        self.assertTrue(res_pago.get("success"))
        pago_id = res_pago["data"]["id"]
        self.assertEqual(res_pago["data"]["monto_no_aplicado_usd"], 100.0)

        # GET /api/pagos
        status, res_hist = self._get("/api/pagos")
        self.assertEqual(status, 200)
        self.assertTrue(any(p["id"] == pago_id for p in res_hist["data"]))

        # GET /api/anticipos/cliente/1
        status, res_ant = self._get("/api/anticipos/cliente/1")
        self.assertEqual(status, 200)
        self.assertTrue(any(a["saldo_disponible_usd"] == 100.0 for a in res_ant["data"]))

        # Anulación del pago
        status, res_anul = self._post(f"/api/pagos/{pago_id}/anular", {"motivo": "Cancelación solicitada por cliente"})
        self.assertEqual(status, 200)
        self.assertTrue(res_anul.get("success"))
        self.assertEqual(res_anul["data"]["estado"], "anulado")

    def test_05_gasto_operativo(self):
        """POST /api/gastos y GET /api/gastos."""
        payload_gasto = {
            "categoria": "servicios",
            "beneficiario": "Compañía Eléctrica Nacional",
            "beneficiario_rif": "J-99999999-0",
            "tipo_pago": "contado",
            "cuenta_tesoreria_id": 1,
            "moneda": "USD",
            "monto": 45.0,
            "descripcion": "Pago de servicio eléctrico del local"
        }
        status, res_gasto = self._post("/api/gastos", payload_gasto)
        self.assertEqual(status, 201)
        self.assertTrue(res_gasto.get("success"))
        gasto_id = res_gasto["data"]["id"]

        status, res_list = self._get("/api/gastos")
        self.assertEqual(status, 200)
        self.assertTrue(any(g["id"] == gasto_id for g in res_list["data"]))

    def test_06_transferencia_tesoreria(self):
        """POST /api/tesoreria/transferencias mueve fondos entre cuentas."""
        payload_trans = {
            "cuenta_origen_id": 1,
            "cuenta_destino_id": 4,
            "monto_origen": 20.0,
            "monto_destino": 82000.0,
            "tasa_cambio": 4100.0,
            "notas": "Fondeo de caja COP desde caja USD"
        }
        status, res_trans = self._post("/api/tesoreria/transferencias", payload_trans)
        self.assertEqual(status, 200)
        self.assertTrue(res_trans.get("success"))
        self.assertEqual(res_trans["data"]["cuenta_origen_id"], 1)

if __name__ == "__main__":
    unittest.main()
