# -*- coding: utf-8 -*-
"""
test_fase3a_ia_inventario.py - Suite de pruebas automatizadas para Fase 3A:
Inteligencia Artificial Orgánica de Inventarios, Detección de Quiebres y Márgenes CPP.
Opera sobre datos reales sin procesos fantasmas y valida la invarianza patrimonial.
"""

import sys
import os
import unittest
import sqlite3
import hashlib
import json
import socketserver
import threading
import urllib.request
import urllib.error

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

import database
import inventario_ia
from server import InventoryAppHandler

class TestFase3AIaInventario(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        # Iniciar servidor de prueba en puerto efímero (puerto 0)
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

    def _get(self, path):
        url = f"{self.base_url}{path}"
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))

    def _post(self, path, payload):
        url = f"{self.base_url}{path}"
        body_bytes = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body_bytes,
            headers={"Content-Type": "application/json; charset=utf-8"},
            method="POST"
        )
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))

    def test_01_diagnostico_organico_patrimonio(self):
        """Diagnóstico global certifica 5 productos, 4.454 unidades y $211.292 USD en CPP."""
        diag = inventario_ia.diagnosticar_inventario_organico()
        self.assertTrue(diag.get("success"))

        res = diag.get("resumen_patrimonial", {})
        self.assertEqual(res.get("total_productos_analizados"), 5)
        self.assertEqual(res.get("total_unidades_fisicas"), 4454.0)
        self.assertEqual(res.get("total_valoracion_cpp_usd"), 211292.0)
        self.assertEqual(res.get("capital_en_riesgo_margen_negativo_usd"), 86000.0)
        self.assertEqual(res.get("porcentaje_capital_en_riesgo"), 40.7)

    def test_02_deteccion_venta_a_perdida_har010(self):
        """Detección honesta de margen negativo severo en HAR010 (precio $30.50 vs cpp $100.00)."""
        diag = inventario_ia.diagnosticar_inventario_organico()
        prods = diag.get("analisis_productos", [])
        har010 = next((p for p in prods if p["codigo"] == "HAR010"), None)

        self.assertIsNotNone(har010)
        self.assertEqual(har010["costo_cpp_usd"], 100.0)
        self.assertEqual(har010["precio_venta_usd"], 30.5)
        self.assertEqual(har010["margen_unitario_usd"], -69.5)
        self.assertEqual(har010["margen_porcentaje"], -227.87)
        self.assertEqual(har010["alerta_rentabilidad"], "VENTA_A_PERDIDA")

        # Verificar alerta gerencial emitida
        alertas = diag.get("alertas_gerenciales", [])
        alerta_har010 = next((a for a in alertas if a["codigo"] == "HAR010"), None)
        self.assertIsNotNone(alerta_har010)
        self.assertEqual(alerta_har010["nivel"], "CRITICO")

    def test_03_deteccion_sobrestock_y_prevencion_compras(self):
        """Identifica sobrestock (stock >> mínimo) y sugiere $0 en compras innecesarias."""
        diag = inventario_ia.diagnosticar_inventario_organico()
        prods = diag.get("analisis_productos", [])

        # HAR008 tiene 1733 sacos para un mínimo de 10
        har008 = next((p for p in prods if p["codigo"] == "HAR008"), None)
        self.assertIsNotNone(har008)
        self.assertEqual(har008["estado_abastecimiento"], "SOBRESTOCK")
        self.assertEqual(har008["unidades_sugeridas_compra"], 0.0)
        self.assertIn("NO comprar", har008["accion_abastecimiento"])

    def test_04_simulador_impacto_precio(self):
        """Simulador matemático proyecta recuperación de margen sin tocar la persistencia."""
        # Simular ajuste de HAR010 a $125.00 USD
        sim = inventario_ia.simular_impacto_precio(producto_id=3, nuevo_precio_usd=125.0)
        self.assertTrue(sim.get("success"))

        actual = sim["precio_actual"]
        simulado = sim["precio_simulado"]
        dif = sim["diferencial"]

        self.assertEqual(actual["precio_usd"], 30.5)
        self.assertEqual(actual["margen_unitario_usd"], -69.5)

        self.assertEqual(simulado["nuevo_precio_usd"], 125.0)
        self.assertEqual(simulado["nuevo_margen_unitario_usd"], 25.0) # $125 - $100 = $25
        self.assertEqual(simulado["nuevo_margen_porcentaje"], 20.0)   # 25/125 = 20%

        # Incremento unitario: 25 - (-69.5) = $94.50 USD
        self.assertEqual(dif["incremento_margen_unitario_usd"], 94.5)
        # Impacto total sobre 860 unidades: 94.5 * 860 = $81,270.00 USD
        self.assertEqual(dif["incremento_ganancia_total_stock_usd"], 81270.0)
        self.assertTrue(dif["es_ganancia"])

    def test_05_endpoints_rest_ia(self):
        """Endpoints /api/ia/inventario/diagnostico y /api/ia/inventario/simular-precio responden 200."""
        # 1. GET Diagnóstico
        status, res_diag = self._get("/api/ia/inventario/diagnostico")
        self.assertEqual(status, 200)
        self.assertTrue(res_diag.get("success"))
        self.assertEqual(res_diag["resumen_patrimonial"]["total_productos_analizados"], 5)

        # 2. GET Alertas
        status, res_al = self._get("/api/ia/inventario/alertas")
        self.assertEqual(status, 200)
        self.assertTrue(res_al.get("success"))
        self.assertGreaterEqual(len(res_al.get("alertas", [])), 1)

        # 3. POST Simular Precio
        payload = {"producto_id": 1, "nuevo_precio": 35.0}
        status, res_sim = self._post("/api/ia/inventario/simular-precio", payload)
        self.assertEqual(status, 200)
        self.assertTrue(res_sim.get("success"))
        self.assertEqual(res_sim["precio_simulado"]["nuevo_precio_usd"], 35.0)

    def test_06_invarianza_absoluta_database(self):
        """Verifica que ninguna operación de la IA alteró la base de datos física."""
        db_path = os.path.join(BASE_DIR, "inventario.db")
        with open(db_path, "rb") as f:
            h = hashlib.sha256(f.read()).hexdigest()
        self.assertEqual(h, "fac567aa1b78348cfa3ad0a32e34d884a16ab825a4ed71d323edc2ad8c1ebe16")

        conn = database.get_connection()
        recon = database.conciliar_inventario(conn=conn)
        conn.close()

        self.assertEqual(recon["estado_general"], "CONCILIADO_OK")
        self.assertEqual(recon["total_productos"], 5)
        self.assertEqual(recon["total_ok"], 5)
        self.assertEqual(recon["total_diferencia"], 0)

if __name__ == "__main__":
    unittest.main()
