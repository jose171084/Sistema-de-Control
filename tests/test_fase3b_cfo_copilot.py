# -*- coding: utf-8 -*-
"""
test_fase3b_cfo_copilot.py - Pruebas Automatizadas de Fase 3B
CFO Copilot Gerencial y Auditoría Determinista Multimoneda

Casos de Prueba:
- COP-01: Clasificación semántica de preguntas gerenciales.
- COP-02: Auditoría de Liquidez y Tesorería (saldos por moneda y consolidado USD).
- COP-03: Auditoría de Inventario y Cobertura (4.454 u, $211.292 USD CPP).
- COP-04: Auditoría de Rentabilidad y Detección de Venta a Pérdida (HAR010 -$69.50 USD).
- COP-05: Auditoría de CXC y CXP (deuda real de MOCASA $24.940 USD).
- COP-06: Balance Gerencial 360° (Patrimonio Neto Tangible $186.352 USD).
- COP-07: Dictamen de Abastecimiento ($0 en compras, sobrestock seguro).
- COP-08: Invarianza Criptográfica Absoluta de inventario.db (0 mutaciones).
- COP-09: Endpoint HTTP GET /api/ia/copilot/sugerencias (200 OK y lista de chips).
- COP-10: Endpoint HTTP POST /api/ia/copilot/consulta (200 OK y payload enriquecido).
"""

import unittest
import os
import sys
import hashlib
import sqlite3
import json
import threading
import socketserver
import urllib.request
import urllib.error

# Asegurar path al módulo principal
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(CURRENT_DIR)
if PROJECT_DIR not in sys.path:
    sys.path.insert(0, PROJECT_DIR)

import cfo_copilot
import database
import server
from server import InventoryAppHandler

DB_PATH = os.path.join(PROJECT_DIR, 'inventario.db')

def calc_hash(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()

class TestCfoCopilotFase3B(unittest.TestCase):
    
    @classmethod
    def setUpClass(cls):
        cls.db_path = DB_PATH
        cls.hash_inicial = calc_hash(cls.db_path)
        
        # Iniciar servidor efímero para pruebas de API
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
        
    def test_cop01_clasificador_semantico(self):
        """Verifica la correcta clasificación de preguntas en lenguaje natural."""
        self.assertEqual(cfo_copilot.clasificar_intencion("¿Cuánto dinero hay en caja y bancos?"), "LIQUIDEZ_TESORERIA")
        self.assertEqual(cfo_copilot.clasificar_intencion("Saldo de tesorería y efectivo"), "LIQUIDEZ_TESORERIA")
        self.assertEqual(cfo_copilot.clasificar_intencion("¿Cuál es el valor del inventario a costo CPP?"), "INVENTARIO_PATRIMONIO")
        self.assertEqual(cfo_copilot.clasificar_intencion("¿Cuántos sacos de harina tenemos en stock?"), "INVENTARIO_PATRIMONIO")
        self.assertEqual(cfo_copilot.clasificar_intencion("¿Qué productos están vendiéndose a pérdida?"), "RENTABILIDAD_RIESGO")
        self.assertEqual(cfo_copilot.clasificar_intencion("Margen negativo de harina aveiro har010"), "RENTABILIDAD_RIESGO")
        self.assertEqual(cfo_copilot.clasificar_intencion("¿Cuánto nos deben los clientes en cuentas por cobrar?"), "CUENTAS_POR_COBRAR")
        self.assertEqual(cfo_copilot.clasificar_intencion("¿Cuáles son las deudas con proveedores en CXP?"), "CUENTAS_POR_PAGAR")
        self.assertEqual(cfo_copilot.clasificar_intencion("¿Cuál es el balance gerencial 360 de la empresa?"), "BALANCE_360")
        self.assertEqual(cfo_copilot.clasificar_intencion("¿Hay alertas críticas urgentes para atender hoy?"), "ALERTAS_CRITICAS")
        self.assertEqual(cfo_copilot.clasificar_intencion("¿Necesitamos comprar más mercancía o hay sobrestock?"), "COMPRAS_ABASTECIMIENTO")
        self.assertEqual(cfo_copilot.clasificar_intencion("Hola, ¿qué puedes hacer?"), "AYUDA_CAPACIDADES")
        
    def test_cop02_auditoria_liquidez(self):
        """Verifica que la consulta de tesorería retorne los datos de las cuentas reales."""
        res = cfo_copilot.procesar_consulta_gerencial("¿Cuánto dinero tenemos en caja?")
        self.assertEqual(res["intent"], "LIQUIDEZ_TESORERIA")
        self.assertEqual(res["status"], "ok")
        self.assertIn("Posición", res["titulo"])
        self.assertTrue(len(res["kpis"]) >= 4)
        self.assertTrue(len(res["tablas"]) >= 1)
        self.assertEqual(len(res["tablas"][0]["filas"]), 4)  # 4 cuentas de tesorería
        
    def test_cop03_auditoria_inventario(self):
        """Verifica la valoración del stock a costo CPP (4.454 u y $211.292 USD)."""
        res = cfo_copilot.procesar_consulta_gerencial("¿Cuál es el valor del inventario en almacén?")
        self.assertEqual(res["intent"], "INVENTARIO_PATRIMONIO")
        self.assertIn("$211,292.00 USD", res["kpis"][0]["valor"])
        self.assertIn("4,454 u", res["kpis"][1]["valor"])
        self.assertEqual(len(res["tablas"][0]["filas"]), 5)  # 5 productos
        
    def test_cop04_auditoria_rentabilidad_y_riesgo(self):
        """Verifica la detección certera de la venta a pérdida de HAR010."""
        res = cfo_copilot.procesar_consulta_gerencial("¿Qué productos están a pérdida o margen negativo?")
        self.assertEqual(res["intent"], "RENTABILIDAD_RIESGO")
        self.assertIn("HAR010", res["resumen_ejecutivo"])
        self.assertTrue("86.000" in res["resumen_ejecutivo"] or "86,000" in res["resumen_ejecutivo"])
        self.assertEqual(res["kpis"][0]["valor"], "1")  # 1 producto vendido a pérdida
        
    def test_cop05_auditoria_cxc_y_cxp(self):
        """Verifica el estado de cartera de clientes y cuentas por pagar a proveedores."""
        # CXC
        res_cxc = cfo_copilot.procesar_consulta_gerencial("¿Cuánto nos deben los clientes?")
        self.assertEqual(res_cxc["intent"], "CUENTAS_POR_COBRAR")
        self.assertIn("$0.00 USD", res_cxc["kpis"][0]["valor"])
        
        # CXP
        res_cxp = cfo_copilot.procesar_consulta_gerencial("¿Cuánto debemos a proveedores?")
        self.assertEqual(res_cxp["intent"], "CUENTAS_POR_PAGAR")
        self.assertIn("$24,940.00 USD", res_cxp["kpis"][0]["valor"])
        self.assertIn("MOCASA", res_cxp["resumen_ejecutivo"])
        
    def test_cop06_balance_gerencial_360(self):
        """Verifica el cálculo del balance patrimonial neto tangible."""
        res = cfo_copilot.procesar_consulta_gerencial("¿Cuál es el balance 360 y situación de la empresa?")
        self.assertEqual(res["intent"], "BALANCE_360")
        # Patrimonio neto = Tesoreria ($0) + Inventario ($211.292) + CXC ($0) - CXP ($24.940) = $186.352 USD
        self.assertIn("$186,352.00 USD", res["kpis"][0]["valor"])
        self.assertTrue(len(res["tablas"][0]["filas"]) >= 5)
        
    def test_cop07_abastecimiento_compras(self):
        """Verifica que el dictamen recomiende CERO compras por sobrestock."""
        res = cfo_copilot.procesar_consulta_gerencial("¿Necesitamos comprar más mercancía?")
        self.assertEqual(res["intent"], "COMPRAS_ABASTECIMIENTO")
        self.assertIn("NO COMPRAR", res["kpis"][0]["valor"])
        self.assertIn("$211,292.00 USD", res["kpis"][1]["valor"])
        
    def test_cop08_invarianza_criptografica_db(self):
        """Verifica que ninguna consulta del Copilot haya modificado inventario.db."""
        hash_final = calc_hash(self.db_path)
        self.assertEqual(self.hash_inicial, hash_final, "¡CRÍTICO: inventario.db fue alterado!")

    def test_cop09_endpoint_sugerencias_http(self):
        """Verifica que GET /api/ia/copilot/sugerencias retorne 200 OK y las sugerencias."""
        req = urllib.request.Request(f"{self.base_url}/api/ia/copilot/sugerencias")
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode('utf-8'))
            self.assertTrue(data.get("success"))
            sug = data.get("sugerencias", [])
            self.assertTrue(len(sug) >= 5)
            self.assertIn("texto", sug[0])

    def test_cop10_endpoint_consulta_http(self):
        """Verifica que POST /api/ia/copilot/consulta procese preguntas vía REST."""
        payload = json.dumps({"pregunta": "¿Cuál es el balance 360?"}).encode('utf-8')
        req = urllib.request.Request(
            f"{self.base_url}/api/ia/copilot/consulta",
            data=payload,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode('utf-8'))
            self.assertEqual(data.get("status"), "ok")
            self.assertEqual(data.get("intent"), "BALANCE_360")
            self.assertIn("Balance Gerencial 360", data.get("titulo"))
            self.assertTrue(len(data.get("kpis")) >= 4)

if __name__ == '__main__':
    unittest.main()
