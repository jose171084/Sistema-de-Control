"""
test_logo_upload_security.py - Suite de Seguridad y QA para Carga de Logotipos Multi-Tenant
Verifica:
1. Subida legítima de PNG/JPG/WEBP con actualización atómica de configuración.
2. Bloqueo HTTP 415 ante scripts o archivos de texto disfrazados (Validación Magic Bytes).
3. Bloqueo HTTP 413 ante archivos que excedan 2MB (Anti-DoS / saturación).
4. Persistencia de campos de texto cuando no se envía nuevo archivo de logo.
5. Bloqueo HTTP 403 ante intentos de Path Traversal en /uploads/.
"""

import unittest
import threading
import socketserver
import urllib.request
import urllib.error
import urllib.parse
import json
import os
import sys
import os
import time

sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Importar servidor y base de datos
import server
from server import InventoryAppHandler, BASE_DIR, UPLOADS_DIR
import database

TEST_PORT = 8097
TEST_HOST = "127.0.0.1"
BASE_URL = f"http://{TEST_HOST}:{TEST_PORT}"

class MockServerThread(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        socketserver.TCPServer.allow_reuse_address = True
        self.httpd = socketserver.ThreadingTCPServer((TEST_HOST, TEST_PORT), InventoryAppHandler)

    def run(self):
        self.httpd.serve_forever()

    def shutdown(self):
        self.httpd.shutdown()
        self.httpd.server_close()

def build_multipart_body(fields, files, boundary="----WebKitFormBoundaryTAVOTest12345"):
    lines = []
    for k, v in fields.items():
        lines.append(f"--{boundary}".encode("utf-8"))
        lines.append(f'Content-Disposition: form-data; name="{k}"'.encode("utf-8"))
        lines.append(b"")
        lines.append(str(v).encode("utf-8"))

    for field_name, (filename, ct, file_bytes) in files.items():
        lines.append(f"--{boundary}".encode("utf-8"))
        lines.append(f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"'.encode("utf-8"))
        lines.append(f'Content-Type: {ct}'.encode("utf-8"))
        lines.append(b"")
        lines.append(file_bytes)

    lines.append(f"--{boundary}--".encode("utf-8"))
    lines.append(b"")
    body_bytes = b"\r\n".join(lines)
    return body_bytes, boundary

class TestLogoUploadSecurity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        database.init_db()
        cls.server_thread = MockServerThread()
        cls.server_thread.start()
        time.sleep(1.0)

    @classmethod
    def tearDownClass(cls):
        cls.server_thread.shutdown()

    def test_01_upload_valid_png_logo(self):
        """1. Carga legítima de PNG con Magic Bytes válidos y actualización de textos."""
        print("\n--- Test 1: Subida legítima de PNG con Magic Bytes válidos ---")
        # Generar PNG mínimo real de 1x1 píxel
        real_png_bytes = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
            b"\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\rIDATx\x9cc`\x00\x00\x00"
            b"\x02\x00\x01H\xaf\xa4q\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        fields = {
            "nombre_negocio": "TAVO CLOUD Soluciones C.A.",
            "documento_fiscal": "J-99887766-5",
            "telefono": "+58 412 1112233",
            "direccion": "Centro Empresarial TAVO, Piso 5",
            "tasa_ves": "46.50",
            "tasa_cop": "4200.00",
            "iva_porcentaje": "16.0"
        }
        files = {
            "logo": ("tavo_logo.png", "image/png", real_png_bytes)
        }
        body, boundary = build_multipart_body(fields, files)

        req = urllib.request.Request(
            f"{BASE_URL}/api/config",
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            method="POST"
        )
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode("utf-8"))
            self.assertTrue(data.get("success"))
            logo_url = data.get("logo_url")
            self.assertIsNotNone(logo_url)
            self.assertTrue(logo_url.startswith("/uploads/logo_empresa_"))
            self.assertTrue(logo_url.endswith(".png"))

            # Verificar que el archivo realmente existe en uploads/
            rel_path = logo_url[len("/uploads/"):]
            full_path = os.path.join(UPLOADS_DIR, rel_path)
            self.assertTrue(os.path.exists(full_path), "El archivo guardado debe existir en disco")
            self.assertEqual(os.path.getsize(full_path), len(real_png_bytes))
            print(f"✅ ÉXITO: Logotipo guardado en {logo_url} y datos de empresa actualizados.")

    def test_02_reject_disguised_script_http_415(self):
        """2. Rechazo tajante de scripts o ejecutables disfrazados con extensión .png o MIME falso."""
        print("\n--- Test 2: Intento de inyección de script malicioso (.py disfrazado de .png) ---")
        malicious_script = b"import os\nos.system('echo Hackeado')\n# Script malicioso simulado"
        fields = {
            "nombre_negocio": "Intento de Hack",
            "documento_fiscal": "J-00000000-0"
        }
        files = {
            "logo": ("exploit.png", "image/png", malicious_script)
        }
        body, boundary = build_multipart_body(fields, files)

        req = urllib.request.Request(
            f"{BASE_URL}/api/config",
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            method="POST"
        )
        try:
            with urllib.request.urlopen(req) as resp:
                self.fail("El servidor debió rechazar el script malicioso con HTTP 415")
        except urllib.error.HTTPError as err:
            self.assertEqual(err.code, 415, "Debe responder con 415 Unsupported Media Type")
            err_data = json.loads(err.read().decode("utf-8"))
            print(f"✅ ÉXITO: Servidor bloqueó el script con HTTP 415: {err_data.get('error')}")

    def test_03_reject_oversized_file_http_413(self):
        """3. Rechazo de archivos que superen los 2MB de tamaño (Prevención DoS/Saturación)."""
        print("\n--- Test 3: Intento de subida de archivo que excede 2MB ---")
        # Cabecera PNG pero tamaño de 2.2MB
        png_header = b"\x89PNG\r\n\x1a\n"
        oversized_bytes = png_header + b"\x00" * (2 * 1024 * 1024 + 50000)
        fields = {
            "nombre_negocio": "Prueba Tamaño"
        }
        files = {
            "logo": ("heavy_logo.png", "image/png", oversized_bytes)
        }
        body, boundary = build_multipart_body(fields, files)

        req = urllib.request.Request(
            f"{BASE_URL}/api/config",
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            method="POST"
        )
        try:
            with urllib.request.urlopen(req) as resp:
                self.fail("El servidor debió rechazar el archivo > 2MB con HTTP 413")
        except urllib.error.HTTPError as err:
            self.assertEqual(err.code, 413, "Debe responder con 413 Payload Too Large")
            err_data = json.loads(err.read().decode("utf-8"))
            print(f"✅ ÉXITO: Servidor bloqueó archivo excedido con HTTP 413: {err_data.get('error')}")

    def test_04_save_text_fields_without_overwriting_existing_logo(self):
        """4. Actualización de RIF/Nombre sin enviar nuevo logo: conserva el logo actual."""
        print("\n--- Test 4: Actualización solo texto (conserva logo previo) ---")
        # 1. Obtener logo_url actual
        req_get = urllib.request.Request(f"{BASE_URL}/api/config")
        with urllib.request.urlopen(req_get) as resp:
            cfg_before = json.loads(resp.read().decode("utf-8"))
            logo_before = cfg_before.get("logo_url")
            self.assertIsNotNone(logo_before)

        # 2. Enviar actualización sin campo logo
        fields = {
            "nombre_negocio": "TAVO CLOUD Global Services",
            "documento_fiscal": "J-55443322-1",
            "telefono": "+58 414 9998877",
            "direccion": "Avenida Libertador, Torre TAVO",
            "tasa_ves": "47.00",
            "tasa_cop": "4250.00",
            "iva_porcentaje": "16.0"
        }
        body, boundary = build_multipart_body(fields, {})
        req_post = urllib.request.Request(
            f"{BASE_URL}/api/config",
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            method="POST"
        )
        with urllib.request.urlopen(req_post) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(data.get("logo_url"), logo_before, "El logo previo debe mantenerse intacto")
            print(f"✅ ÉXITO: Textos actualizados sin borrar el logotipo: {data.get('logo_url')}")

    def test_05_block_path_traversal_on_uploads(self):
        """5. Seguridad del servidor estático: bloqueo de Path Traversal en /uploads/."""
        print("\n--- Test 5: Bloqueo de Path Traversal en /uploads/ ---")
        traversal_urls = [
            f"{BASE_URL}/uploads/..%2F..%2Fserver.py",
            f"{BASE_URL}/uploads/..%2Fdatabase.py",
            f"{BASE_URL}/uploads/..%5Cserver.py"
        ]
        for url in traversal_urls:
            req = urllib.request.Request(url)
            try:
                with urllib.request.urlopen(req) as resp:
                    self.fail(f"La ruta traversal {url} no debió permitirse")
            except urllib.error.HTTPError as err:
                self.assertIn(err.code, [403, 404], "Debe devolver 403 Forbidden o 404 Not Found")
                print(f"✅ ÉXITO: Intento de Traversal bloqueado con código HTTP {err.code}: {url}")

if __name__ == "__main__":
    unittest.main()
