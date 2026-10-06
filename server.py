"""
server.py - Servidor HTTP RESTful puro en Python 3 (Sin dependencias externas ni pip).
Gestiona el sistema de control de inventarios, productos, servicios, facturación multimoneda y compras.
"""

import http.server
import socketserver
import os
import json
import sqlite3
import urllib.parse
import urllib.request
import ssl
import mimetypes
import base64
import time
from datetime import datetime, timedelta
from database import get_connection, init_db

PORT = int(os.environ.get("PORT", 8000))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")

os.makedirs(PUBLIC_DIR, exist_ok=True)
os.makedirs(UPLOADS_DIR, exist_ok=True)

def obtener_tasas_oficiales():
    """
    Consulta las tasas oficiales en tiempo real:
    - BCV (Banco Central de Venezuela): ve.dolarapi.com/v1/dolares/oficial
    - TRM Colombia (Superintendencia Financiera de Colombia / datos.gov.co)
    """
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    tasa_ves = None
    tasa_cop = None
    fuentes = []
    errores = []

    # 1. Tasa BCV Oficial (Venezuela)
    try:
        req_ves = urllib.request.Request(
            'https://ve.dolarapi.com/v1/dolares/oficial', 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        with urllib.request.urlopen(req_ves, timeout=8, context=ctx) as r:
            data_ves = json.loads(r.read().decode('utf-8'))
            val_ves = data_ves.get('promedio')
            if val_ves:
                tasa_ves = round(float(val_ves), 4)
                fuentes.append("BCV Oficial")
    except Exception as e_ves:
        errores.append(f"BCV: {str(e_ves)}")
        try:
            req_ves_fb = urllib.request.Request(
                'https://pydolarvenezuela-api.vercel.app/api/v1/dollar/page?page=bcv',
                headers={'User-Agent': 'Mozilla/5.0'}
            )
            with urllib.request.urlopen(req_ves_fb, timeout=6, context=ctx) as r_fb:
                data_fb = json.loads(r_fb.read().decode('utf-8'))
                monitores = data_fb.get("monitors", {})
                bcv_m = monitores.get("usd", {}) or monitores.get("bcv", {})
                if bcv_m and bcv_m.get("price"):
                    tasa_ves = round(float(bcv_m.get("price")), 4)
                    fuentes.append("BCV (Fallback)")
        except Exception:
            pass

    # 2. Tasa TRM Oficial (Superintendencia Financiera de Colombia / datos.gov.co)
    try:
        req_cop = urllib.request.Request(
            'https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde%20DESC', 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        with urllib.request.urlopen(req_cop, timeout=8, context=ctx) as r:
            data_cop = json.loads(r.read().decode('utf-8'))
            if data_cop and len(data_cop) > 0 and 'valor' in data_cop[0]:
                tasa_cop = round(float(data_cop[0]['valor']), 2)
                fuentes.append("TRM Colombia (datos.gov.co)")
    except Exception as e_cop:
        errores.append(f"TRM: {str(e_cop)}")
        try:
            req_cop_fb = urllib.request.Request(
                'https://open.er-api.com/v6/latest/USD',
                headers={'User-Agent': 'Mozilla/5.0'}
            )
            with urllib.request.urlopen(req_cop_fb, timeout=6, context=ctx) as r_fb:
                data_fb = json.loads(r_fb.read().decode('utf-8'))
                rates = data_fb.get("rates", {})
                if "COP" in rates:
                    tasa_cop = round(float(rates["COP"]), 2)
                    fuentes.append("TRM (Fallback er-api)")
        except Exception:
            pass

    fuente_str = " / ".join(fuentes) if fuentes else "Error de conexión"
    error_str = "; ".join(errores) if errores else None
    return tasa_ves, tasa_cop, fuente_str, error_str

class InventoryAppHandler(http.server.BaseHTTPRequestHandler):

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def send_error_json(self, message, status=400):
        self.send_json({"error": message, "success": False}, status=status)

    def parse_body_json(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length == 0:
                return {}
            body_bytes = self.rfile.read(content_length)
            return json.loads(body_bytes.decode("utf-8"))
        except Exception as e:
            return None

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    # --- ENRUTADOR GET ---
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # Rutas de la API
        if path.startswith("/api/"):
            self.handle_api_get(path, query)
            return

        # Archivos estáticos o subidos
        if path.startswith("/uploads/"):
            rel_path = path[len("/uploads/"):]
            file_path = os.path.join(UPLOADS_DIR, rel_path)
            self.serve_file(file_path)
            return

        # Frontend SPA
        rel_path = path.lstrip("/")
        if not rel_path or rel_path == "":
            rel_path = "index.html"
        file_path = os.path.join(PUBLIC_DIR, rel_path)
        if not os.path.exists(file_path) or os.path.isdir(file_path):
            file_path = os.path.join(PUBLIC_DIR, "index.html")
        self.serve_file(file_path)

    # --- ENRUTADOR POST ---
    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path.startswith("/api/"):
            self.handle_api_post(path)
            return

        self.send_error_json("Ruta no encontrada", 404)

    # --- ENRUTADOR PUT ---
    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path.startswith("/api/"):
            self.handle_api_put(path)
            return

        self.send_error_json("Ruta no encontrada", 404)

    # --- ENRUTADOR DELETE ---
    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path.startswith("/api/"):
            self.handle_api_delete(path)
            return

        self.send_error_json("Ruta no encontrada", 404)

    def serve_file(self, filepath):
        if not os.path.exists(filepath) or os.path.isdir(filepath):
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"404 Not Found")
            return

        mime_type, _ = mimetypes.guess_type(filepath)
        if not mime_type:
            mime_type = "application/octet-stream"

        try:
            with open(filepath, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", mime_type)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(str(e).encode())

    # ==========================================
    # CONTROLADORES DE LA API (GET)
    # ==========================================
    def handle_api_get(self, path, query):
        conn = get_connection()
        cursor = conn.cursor()

        try:
            # 1. Configuración & Tasas
            if path == "/api/config":
                cursor.execute("SELECT * FROM configuracion WHERE id = 1")
                row = cursor.fetchone()
                if row:
                    res = dict(row)
                    if res.get("tema_config"):
                        try:
                            res["tema_config"] = json.loads(res["tema_config"])
                        except Exception:
                            pass
                    if res.get("labels_config"):
                        try:
                            res["labels_config"] = json.loads(res["labels_config"])
                        except Exception:
                            pass
                    self.send_json(res)
                else:
                    self.send_error_json("Configuración no encontrada", 404)

            elif path == "/api/tasas/oficiales":
                ves, cop, fuente, err = obtener_tasas_oficiales()
                self.send_json({
                    "tasa_ves": ves,
                    "tasa_cop": cop,
                    "fuente": fuente,
                    "error": err
                })

            # 2. Resumen del Dashboard
            elif path == "/api/dashboard":
                cursor.execute("SELECT COUNT(*) FROM productos WHERE tipo = 'producto'")
                total_productos = cursor.fetchone()[0]

                cursor.execute("SELECT COUNT(*) FROM productos WHERE tipo = 'servicio'")
                total_servicios = cursor.fetchone()[0]

                cursor.execute("SELECT COUNT(*) FROM productos WHERE tipo = 'producto' AND stock <= stock_minimo")
                alertas_stock = cursor.fetchone()[0]

                cursor.execute("SELECT COUNT(*) FROM clientes")
                total_clientes = cursor.fetchone()[0]

                cursor.execute("SELECT COUNT(*) FROM proveedores")
                total_proveedores = cursor.fetchone()[0]

                cursor.execute("SELECT COUNT(*), COALESCE(SUM(total_usd), 0) FROM facturas WHERE estado = 'pagada'")
                facturas_row = cursor.fetchone()
                total_facturas = facturas_row[0]
                ventas_total_usd = facturas_row[1]

                cursor.execute("SELECT COUNT(*), COALESCE(SUM(total), 0) FROM compras")
                compras_row = cursor.fetchone()
                total_compras = compras_row[0]
                compras_total_usd = compras_row[1]

                # Últimas 5 facturas
                cursor.execute("""
                    SELECT f.*, c.nombre as cliente_nombre 
                    FROM facturas f 
                    JOIN clientes c ON f.cliente_id = c.id 
                    ORDER BY f.id DESC LIMIT 5
                """)
                ultimas_facturas = [dict(r) for r in cursor.fetchall()]

                # Productos con poco stock
                cursor.execute("""
                    SELECT p.*, c.nombre as categoria_nombre 
                    FROM productos p
                    JOIN categorias c ON p.categoria_id = c.id
                    WHERE p.tipo = 'producto' AND p.stock <= p.stock_minimo
                    ORDER BY p.stock ASC LIMIT 5
                """)
                productos_bajo_stock = [dict(r) for r in cursor.fetchall()]

                # Resumen de Cuentas por Cobrar
                cursor.execute("""
                    SELECT 
                        COALESCE(SUM(saldo_pendiente), 0) as total_saldo_usd,
                        COUNT(CASE WHEN estado IN ('pendiente', 'parcial') THEN 1 END) as cuentas_pendientes
                    FROM cuentas_por_cobrar
                """)
                cxc_dash_row = cursor.fetchone()
                cxc_total_usd = round(cxc_dash_row[0] or 0.0, 2)
                cxc_pendientes = cxc_dash_row[1] or 0

                cursor.execute("SELECT tasa_ves, tasa_cop FROM configuracion WHERE id = 1")
                cfg_dash = cursor.fetchone()
                tasa_ves_dash = cfg_dash[0] if cfg_dash else 45.0
                tasa_cop_dash = cfg_dash[1] if cfg_dash else 4100.0

                cxc_total_ves = round(cxc_total_usd * tasa_ves_dash, 2)
                cxc_total_cop = round(cxc_total_usd * tasa_cop_dash, 2)

                # Resumen de Cuentas por Pagar (CXP)
                cursor.execute("""
                    SELECT 
                        COALESCE(SUM(saldo_pendiente), 0) as total_saldo_usd,
                        COUNT(CASE WHEN estado IN ('pendiente', 'parcial') THEN 1 END) as cuentas_pendientes
                    FROM cuentas_por_pagar
                """)
                cxp_dash_row = cursor.fetchone()
                cxp_total_usd = round(cxp_dash_row[0] or 0.0, 2)
                cxp_pendientes = cxp_dash_row[1] or 0
                cxp_total_ves = round(cxp_total_usd * tasa_ves_dash, 2)
                cxp_total_cop = round(cxp_total_usd * tasa_cop_dash, 2)

                # Top 5 productos más vendidos
                cursor.execute("""
                    SELECT 
                        fd.producto_id,
                        fd.nombre_producto,
                        COALESCE(SUM(fd.cantidad), 0) as total_vendido,
                        ROUND(COALESCE(SUM(fd.total), 0), 2) as total_usd,
                        p.stock as stock_actual,
                        p.tipo
                    FROM factura_detalles fd
                    JOIN facturas f ON fd.factura_id = f.id
                    LEFT JOIN productos p ON fd.producto_id = p.id
                    GROUP BY fd.producto_id, fd.nombre_producto
                    ORDER BY total_vendido DESC
                    LIMIT 5
                """)
                top_productos = [dict(r) for r in cursor.fetchall()]

                # Top 5 mejores clientes
                cursor.execute("""
                    SELECT 
                        c.id,
                        c.nombre,
                        c.cedula,
                        c.telefono,
                        COUNT(f.id) as total_facturas,
                        ROUND(COALESCE(SUM(f.total_usd), 0), 2) as total_comprado_usd
                    FROM facturas f
                    JOIN clientes c ON f.cliente_id = c.id
                    GROUP BY c.id, c.nombre, c.cedula, c.telefono
                    ORDER BY total_comprado_usd DESC
                    LIMIT 5
                """)
                top_clientes = [dict(r) for r in cursor.fetchall()]

                self.send_json({
                    "total_productos": total_productos,
                    "total_servicios": total_servicios,
                    "alertas_stock": alertas_stock,
                    "total_clientes": total_clientes,
                    "total_proveedores": total_proveedores,
                    "total_facturas": total_facturas,
                    "ventas_total_usd": ventas_total_usd,
                    "total_compras": total_compras,
                    "compras_total_usd": compras_total_usd,
                    "cxc_total_usd": cxc_total_usd,
                    "cxc_pendientes": cxc_pendientes,
                    "cxc_total_ves": cxc_total_ves,
                    "cxc_total_cop": cxc_total_cop,
                    "cxp_total_usd": cxp_total_usd,
                    "cxp_pendientes": cxp_pendientes,
                    "cxp_total_ves": cxp_total_ves,
                    "cxp_total_cop": cxp_total_cop,
                    "ultimas_facturas": ultimas_facturas,
                    "productos_bajo_stock": productos_bajo_stock,
                    "top_productos": top_productos,
                    "top_clientes": top_clientes
                })

            # 3. Categorías
            elif path == "/api/categorias":
                tipo_filter = query.get("tipo", [None])[0]
                if tipo_filter:
                    cursor.execute("SELECT * FROM categorias WHERE tipo = ? ORDER BY nombre ASC", (tipo_filter,))
                else:
                    cursor.execute("SELECT * FROM categorias ORDER BY nombre ASC")
                rows = [dict(r) for r in cursor.fetchall()]
                self.send_json(rows)

            # 4. Productos y Servicios
            elif path == "/api/productos":
                tipo = query.get("tipo", [None])[0]
                categoria_id = query.get("categoria_id", [None])[0]
                search = query.get("q", [None])[0]

                sql = """
                    SELECT p.*, c.nombre as categoria_nombre, c.tipo as categoria_tipo 
                    FROM productos p 
                    JOIN categorias c ON p.categoria_id = c.id 
                    WHERE p.activo = 1
                """
                params = []

                if tipo:
                    sql += " AND p.tipo = ?"
                    params.append(tipo)
                if categoria_id:
                    sql += " AND p.categoria_id = ?"
                    params.append(categoria_id)
                if search:
                    sql += " AND (p.nombre LIKE ? OR p.codigo LIKE ?)"
                    params.append(f"%{search}%")
                    params.append(f"%{search}%")

                sql += " ORDER BY p.id DESC"
                cursor.execute(sql, params)
                rows = [dict(r) for r in cursor.fetchall()]
                self.send_json(rows)

            elif path.startswith("/api/productos/"):
                item_id = path.split("/")[-1]
                cursor.execute("""
                    SELECT p.*, c.nombre as categoria_nombre 
                    FROM productos p 
                    JOIN categorias c ON p.categoria_id = c.id 
                    WHERE p.id = ?
                """, (item_id,))
                row = cursor.fetchone()
                if row:
                    self.send_json(dict(row))
                else:
                    self.send_error_json("Producto no encontrado", 404)

            # 5. Clientes
            elif path == "/api/clientes":
                search = query.get("q", [None])[0]
                if search:
                    cursor.execute("SELECT * FROM clientes WHERE nombre LIKE ? OR cedula LIKE ? ORDER BY nombre ASC", (f"%{search}%", f"%{search}%"))
                else:
                    cursor.execute("SELECT * FROM clientes ORDER BY nombre ASC")
                rows = [dict(r) for r in cursor.fetchall()]
                self.send_json(rows)

            elif path.startswith("/api/clientes/"):
                c_id = path.split("/")[-1]
                cursor.execute("SELECT * FROM clientes WHERE id = ?", (c_id,))
                row = cursor.fetchone()
                if row:
                    self.send_json(dict(row))
                else:
                    self.send_error_json("Cliente no encontrado", 404)

            # 6. Proveedores
            elif path == "/api/proveedores":
                search = query.get("q", [None])[0]
                if search:
                    cursor.execute("SELECT * FROM proveedores WHERE nombre LIKE ? OR cedula LIKE ? ORDER BY nombre ASC", (f"%{search}%", f"%{search}%"))
                else:
                    cursor.execute("SELECT * FROM proveedores ORDER BY nombre ASC")
                rows = [dict(r) for r in cursor.fetchall()]
                self.send_json(rows)

            elif path.startswith("/api/proveedores/"):
                p_id = path.split("/")[-1]
                cursor.execute("SELECT * FROM proveedores WHERE id = ?", (p_id,))
                row = cursor.fetchone()
                if row:
                    self.send_json(dict(row))
                else:
                    self.send_error_json("Proveedor no encontrado", 404)

            # 7. Facturas (Ventas)
            elif path == "/api/facturas":
                cursor.execute("""
                    SELECT f.*, c.nombre as cliente_nombre, c.cedula as cliente_cedula, c.telefono as cliente_telefono 
                    FROM facturas f 
                    JOIN clientes c ON f.cliente_id = c.id 
                    ORDER BY f.id DESC
                """)
                rows = [dict(r) for r in cursor.fetchall()]
                self.send_json(rows)

            elif path.startswith("/api/facturas/"):
                f_id = path.split("/")[-1]
                cursor.execute("""
                    SELECT f.*, c.nombre as cliente_nombre, c.cedula as cliente_cedula, 
                           c.telefono as cliente_telefono, c.correo as cliente_correo, c.direccion as cliente_direccion
                    FROM facturas f 
                    JOIN clientes c ON f.cliente_id = c.id 
                    WHERE f.id = ?
                """, (f_id,))
                factura = cursor.fetchone()
                if not factura:
                    self.send_error_json("Factura no encontrada", 404)
                    return

                res = dict(factura)
                # Obtener detalles
                cursor.execute("SELECT * FROM factura_detalles WHERE factura_id = ?", (f_id,))
                res["detalles"] = [dict(d) for d in cursor.fetchall()]

                # Obtener pagos
                cursor.execute("SELECT * FROM factura_pagos WHERE factura_id = ?", (f_id,))
                res["pagos"] = [dict(p) for p in cursor.fetchall()]

                self.send_json(res)

            # 8. Compras
            elif path == "/api/compras":
                cursor.execute("""
                    SELECT c.*, p.nombre as proveedor_nombre, p.cedula as proveedor_cedula 
                    FROM compras c 
                    JOIN proveedores p ON c.proveedor_id = p.id 
                    ORDER BY c.id DESC
                """)
                rows = [dict(r) for r in cursor.fetchall()]
                self.send_json(rows)

            elif path.startswith("/api/compras/"):
                c_id = path.split("/")[-1]
                cursor.execute("""
                    SELECT c.*, p.nombre as proveedor_nombre, p.cedula as proveedor_cedula, 
                           p.telefono as proveedor_telefono, p.correo as proveedor_correo
                    FROM compras c 
                    JOIN proveedores p ON c.proveedor_id = p.id 
                    WHERE c.id = ?
                """, (c_id,))
                compra = cursor.fetchone()
                if not compra:
                    self.send_error_json("Compra no encontrada", 404)
                    return

                res = dict(compra)
                cursor.execute("SELECT * FROM compra_detalles WHERE compra_id = ?", (c_id,))
                res["detalles"] = [dict(d) for d in cursor.fetchall()]
                self.send_json(res)

            # 9. Cuentas por Cobrar (CXC)
            elif path == "/api/cxc/resumen":
                cursor.execute("""
                    SELECT 
                        COALESCE(SUM(saldo_pendiente), 0) as total_saldo_usd,
                        COUNT(CASE WHEN estado IN ('pendiente', 'parcial') THEN 1 END) as pendientes_count,
                        COUNT(CASE WHEN estado = 'pagada' THEN 1 END) as pagadas_count,
                        COUNT(CASE WHEN estado IN ('pendiente', 'parcial') AND date(fecha_vencimiento) < date('now') THEN 1 END) as vencidas_count
                    FROM cuentas_por_cobrar
                """)
                res_row = dict(cursor.fetchone())

                cursor.execute("SELECT tasa_ves, tasa_cop FROM configuracion WHERE id = 1")
                cfg = dict(cursor.fetchone())
                total_saldo_usd = float(res_row["total_saldo_usd"])
                res_row["total_saldo_ves"] = round(total_saldo_usd * cfg["tasa_ves"], 2)
                res_row["total_saldo_cop"] = round(total_saldo_usd * cfg["tasa_cop"], 2)
                self.send_json(res_row)

            elif path == "/api/cxc":
                estado = query.get("estado", [None])[0]
                cliente_id = query.get("cliente_id", [None])[0]
                search = query.get("q", [None])[0]

                sql = """
                    SELECT cxc.*, f.numero_factura, f.subtotal, f.iva_total, f.total_usd,
                           c.nombre as cliente_nombre, c.cedula as cliente_cedula, c.telefono as cliente_telefono,
                           cfg.tasa_ves, cfg.tasa_cop
                    FROM cuentas_por_cobrar cxc
                    JOIN facturas f ON cxc.factura_id = f.id
                    JOIN clientes c ON cxc.cliente_id = c.id
                    CROSS JOIN configuracion cfg ON cfg.id = 1
                    WHERE 1=1
                """
                params = []
                if estado and estado != "todos":
                    if estado == "vencida":
                        sql += " AND cxc.estado IN ('pendiente', 'parcial') AND date(cxc.fecha_vencimiento) < date('now')"
                    else:
                        sql += " AND cxc.estado = ?"
                        params.append(estado)
                if cliente_id:
                    sql += " AND cxc.cliente_id = ?"
                    params.append(cliente_id)
                if search:
                    sql += " AND (c.nombre LIKE ? OR c.cedula LIKE ? OR f.numero_factura LIKE ?)"
                    params.append(f"%{search}%")
                    params.append(f"%{search}%")
                    params.append(f"%{search}%")

                sql += " ORDER BY cxc.id DESC"
                cursor.execute(sql, params)
                rows = [dict(r) for r in cursor.fetchall()]
                self.send_json(rows)

            elif path.startswith("/api/cxc/"):
                cxc_id = path.split("/")[-1]
                cursor.execute("""
                    SELECT cxc.*, f.numero_factura, f.subtotal, f.iva_total, f.total_usd,
                           c.nombre as cliente_nombre, c.cedula as cliente_cedula, c.telefono as cliente_telefono,
                           c.correo as cliente_correo, c.direccion as cliente_direccion,
                           cfg.tasa_ves, cfg.tasa_cop
                    FROM cuentas_por_cobrar cxc
                    JOIN facturas f ON cxc.factura_id = f.id
                    JOIN clientes c ON cxc.cliente_id = c.id
                    CROSS JOIN configuracion cfg ON cfg.id = 1
                    WHERE cxc.id = ?
                """, (cxc_id,))
                cxc = cursor.fetchone()
                if not cxc:
                    self.send_error_json("Cuenta por cobrar no encontrada", 404)
                    return
                res = dict(cxc)

                # Obtener abonos
                cursor.execute("SELECT * FROM abonos_cxc WHERE cxc_id = ? ORDER BY id DESC", (cxc_id,))
                abonos = []
                for ab in cursor.fetchall():
                    ab_dict = dict(ab)
                    cursor.execute("SELECT * FROM abono_cxc_pagos WHERE abono_id = ?", (ab_dict["id"],))
                    ab_dict["pagos"] = [dict(p) for p in cursor.fetchall()]
                    abonos.append(ab_dict)
                res["abonos"] = abonos
                self.send_json(res)

            # 9.1 Cuentas por Pagar (CXP) - Resumen
            elif path == "/api/cxp/resumen":
                cursor.execute("""
                    SELECT 
                        COALESCE(SUM(saldo_pendiente), 0) as total_saldo_usd,
                        COALESCE(SUM(monto_total), 0) as total_facturado_usd,
                        COALESCE(SUM(monto_pagado), 0) as total_pagado_usd,
                        COUNT(CASE WHEN estado IN ('pendiente', 'parcial') THEN 1 END) as pendientes_count,
                        COUNT(CASE WHEN estado = 'pagada' THEN 1 END) as pagadas_count,
                        COUNT(CASE WHEN estado IN ('pendiente', 'parcial') AND date(fecha_vencimiento) < date('now') THEN 1 END) as vencidas_count
                    FROM cuentas_por_pagar
                """)
                res_row = dict(cursor.fetchone())

                cursor.execute("SELECT tasa_ves, tasa_cop FROM configuracion WHERE id = 1")
                cfg = dict(cursor.fetchone())
                total_saldo_usd = float(res_row["total_saldo_usd"])
                res_row["total_saldo_ves"] = round(total_saldo_usd * cfg["tasa_ves"], 2)
                res_row["total_saldo_cop"] = round(total_saldo_usd * cfg["tasa_cop"], 2)
                self.send_json(res_row)

            # 9.2 Cuentas por Pagar (CXP) - Listado con filtros
            elif path == "/api/cxp":
                estado = query.get("estado", [None])[0]
                proveedor_id = query.get("proveedor_id", [None])[0]
                search = query.get("q", [None])[0]

                sql = """
                    SELECT cxp.*, 
                           comp.numero_control as compra_numero_control,
                           p.nombre as proveedor_nombre, p.cedula as proveedor_cedula, p.telefono as proveedor_telefono,
                           cfg.tasa_ves, cfg.tasa_cop,
                           ROUND(cxp.saldo_pendiente * cfg.tasa_ves, 2) as saldo_ves,
                           ROUND(cxp.saldo_pendiente * cfg.tasa_cop, 2) as saldo_cop,
                           CAST((julianday('now') - julianday(cxp.fecha_vencimiento)) AS INTEGER) as dias_vencido
                    FROM cuentas_por_pagar cxp
                    LEFT JOIN compras comp ON cxp.compra_id = comp.id
                    JOIN proveedores p ON cxp.proveedor_id = p.id
                    CROSS JOIN configuracion cfg ON cfg.id = 1
                    WHERE 1=1
                """
                params = []
                if estado and estado != "todos":
                    if estado == "vencida":
                        sql += " AND cxp.estado IN ('pendiente', 'parcial') AND date(cxp.fecha_vencimiento) < date('now')"
                    else:
                        sql += " AND cxp.estado = ?"
                        params.append(estado)
                if proveedor_id:
                    sql += " AND cxp.proveedor_id = ?"
                    params.append(proveedor_id)
                if search:
                    sql += " AND (p.nombre LIKE ? OR p.cedula LIKE ? OR cxp.numero_factura LIKE ? OR cxp.descripcion_concepto LIKE ?)"
                    params.append(f"%{search}%")
                    params.append(f"%{search}%")
                    params.append(f"%{search}%")
                    params.append(f"%{search}%")

                sql += " ORDER BY cxp.id DESC"
                cursor.execute(sql, params)
                rows = [dict(r) for r in cursor.fetchall()]
                self.send_json(rows)

            # 9.3 Cuentas por Pagar (CXP) - Detalle y Abonos
            elif path.startswith("/api/cxp/"):
                cxp_id = path.split("/")[-1]
                cursor.execute("""
                    SELECT cxp.*, 
                           comp.numero_control as compra_numero_control,
                           p.nombre as proveedor_nombre, p.cedula as proveedor_cedula, p.telefono as proveedor_telefono,
                           p.correo as proveedor_correo, p.direccion as proveedor_direccion,
                           cfg.tasa_ves, cfg.tasa_cop,
                           ROUND(cxp.saldo_pendiente * cfg.tasa_ves, 2) as saldo_ves,
                           ROUND(cxp.saldo_pendiente * cfg.tasa_cop, 2) as saldo_cop,
                           CAST((julianday('now') - julianday(cxp.fecha_vencimiento)) AS INTEGER) as dias_vencido
                    FROM cuentas_por_pagar cxp
                    LEFT JOIN compras comp ON cxp.compra_id = comp.id
                    JOIN proveedores p ON cxp.proveedor_id = p.id
                    CROSS JOIN configuracion cfg ON cfg.id = 1
                    WHERE cxp.id = ?
                """, (cxp_id,))
                cxp = cursor.fetchone()
                if not cxp:
                    self.send_error_json("Cuenta por pagar no encontrada", 404)
                    return
                res = dict(cxp)

                # Obtener abonos
                cursor.execute("SELECT * FROM abonos_cxp WHERE cxp_id = ? ORDER BY id DESC", (cxp_id,))
                abonos = []
                for ab in cursor.fetchall():
                    ab_dict = dict(ab)
                    cursor.execute("SELECT * FROM abono_cxp_pagos WHERE abono_id = ?", (ab_dict["id"],))
                    ab_dict["pagos"] = [dict(p) for p in cursor.fetchall()]
                    abonos.append(ab_dict)
                res["abonos"] = abonos
                self.send_json(res)

            # ==========================================
            # REPORTES DEL SISTEMA
            # ==========================================
            # 10. Reporte de Inventario & Valoración
            elif path == "/api/reportes/inventario":
                cursor.execute("SELECT tasa_ves, tasa_cop FROM configuracion WHERE id = 1")
                cfg_row = cursor.fetchone()
                t_ves = cfg_row[0] if cfg_row else 45.0
                t_cop = cfg_row[1] if cfg_row else 4100.0

                cursor.execute("""
                    SELECT 
                        p.id,
                        p.codigo,
                        p.nombre,
                        p.tipo,
                        p.impuesto_tipo,
                        c.nombre as categoria_nombre,
                        p.costo,
                        p.stock,
                        ROUND(CASE WHEN p.tipo = 'producto' THEN p.costo * p.stock ELSE 0 END, 2) as costo_total_stock,
                        p.precio_base,
                        p.precio_total,
                        ROUND(CASE WHEN p.tipo = 'producto' THEN p.precio_total * p.stock ELSE 0 END, 2) as valor_venta_stock
                    FROM productos p
                    JOIN categorias c ON p.categoria_id = c.id
                    WHERE p.activo = 1
                    ORDER BY p.tipo ASC, costo_total_stock DESC
                """)
                items = [dict(r) for r in cursor.fetchall()]

                total_costo_usd = round(sum(i["costo_total_stock"] for i in items if i["tipo"] == "producto"), 2)
                total_venta_usd = round(sum(i["valor_venta_stock"] for i in items if i["tipo"] == "producto"), 2)
                total_unidades = sum(i["stock"] for i in items if i["tipo"] == "producto")
                ganancia_estimada_usd = round(total_venta_usd - total_costo_usd, 2)

                self.send_json({
                    "items": items,
                    "resumen": {
                        "total_costo_inventario_usd": total_costo_usd,
                        "total_costo_inventario_ves": round(total_costo_usd * t_ves, 2),
                        "total_costo_inventario_cop": round(total_costo_usd * t_cop, 2),
                        "total_venta_estimada_usd": total_venta_usd,
                        "ganancia_estimada_usd": ganancia_estimada_usd,
                        "total_unidades_stock": total_unidades,
                        "total_items": len(items)
                    }
                })

            # 11. Reporte de Ventas Diarias con Desglose de Monedas
            elif path == "/api/reportes/ventas-diarias":
                fecha = query.get("fecha", [datetime.now().strftime("%Y-%m-%d")])[0]

                # Facturas emitidas en el día
                cursor.execute("""
                    SELECT f.*, c.nombre as cliente_nombre, c.cedula as cliente_cedula
                    FROM facturas f
                    JOIN clientes c ON f.cliente_id = c.id
                    WHERE date(f.fecha) = date(?)
                    ORDER BY f.id DESC
                """, (fecha,))
                facturas_dia = [dict(r) for r in cursor.fetchall()]

                total_ventas_usd = round(sum(f["total_usd"] for f in facturas_dia), 2)
                total_subtotal_usd = round(sum(f["subtotal"] for f in facturas_dia), 2)
                total_iva_usd = round(sum(f["iva_total"] for f in facturas_dia), 2)

                # Pagos en facturas del día
                cursor.execute("""
                    SELECT fp.moneda, fp.metodo, 
                           SUM(fp.monto_moneda) as total_moneda, 
                           SUM(fp.equivalente_usd) as total_usd,
                           COUNT(*) as transacciones
                    FROM factura_pagos fp
                    JOIN facturas f ON fp.factura_id = f.id
                    WHERE date(f.fecha) = date(?)
                    GROUP BY fp.moneda, fp.metodo
                """, (fecha,))
                pagos_facturas = [dict(r) for r in cursor.fetchall()]

                # Abonos de crédito cobrados en el día
                cursor.execute("""
                    SELECT ap.moneda, ap.metodo,
                           SUM(ap.monto_moneda) as total_moneda,
                           SUM(ap.equivalente_usd) as total_usd,
                           COUNT(*) as transacciones
                    FROM abono_cxc_pagos ap
                    JOIN abonos_cxc ab ON ap.abono_id = ab.id
                    WHERE date(ab.fecha) = date(?)
                    GROUP BY ap.moneda, ap.metodo
                """, (fecha,))
                pagos_abonos = [dict(r) for r in cursor.fetchall()]

                # Consolidación estructurada por moneda y método
                desglose_por_moneda = {
                    "USD": {"total_moneda": 0.0, "total_usd": 0.0, "metodos": {}},
                    "VES": {"total_moneda": 0.0, "total_usd": 0.0, "metodos": {}},
                    "COP": {"total_moneda": 0.0, "total_usd": 0.0, "metodos": {}}
                }

                total_cobrado_usd = 0.0

                for p in (pagos_facturas + pagos_abonos):
                    mon = p["moneda"].upper()
                    met = p["metodo"]
                    m_moneda = float(p["total_moneda"] or 0)
                    m_usd = float(p["total_usd"] or 0)
                    total_cobrado_usd += m_usd

                    if mon not in desglose_por_moneda:
                        desglose_por_moneda[mon] = {"total_moneda": 0.0, "total_usd": 0.0, "metodos": {}}
                    
                    desglose_por_moneda[mon]["total_moneda"] = round(desglose_por_moneda[mon]["total_moneda"] + m_moneda, 2)
                    desglose_por_moneda[mon]["total_usd"] = round(desglose_por_moneda[mon]["total_usd"] + m_usd, 2)
                    
                    if met not in desglose_por_moneda[mon]["metodos"]:
                        desglose_por_moneda[mon]["metodos"][met] = {"monto_moneda": 0.0, "monto_usd": 0.0, "conteo": 0}
                    desglose_por_moneda[mon]["metodos"][met]["monto_moneda"] = round(desglose_por_moneda[mon]["metodos"][met]["monto_moneda"] + m_moneda, 2)
                    desglose_por_moneda[mon]["metodos"][met]["monto_usd"] = round(desglose_por_moneda[mon]["metodos"][met]["monto_usd"] + m_usd, 2)
                    desglose_por_moneda[mon]["metodos"][met]["conteo"] += p.get("transacciones", 1)

                self.send_json({
                    "fecha": fecha,
                    "resumen": {
                        "facturas_emitidas": len(facturas_dia),
                        "total_facturado_usd": total_ventas_usd,
                        "subtotal_usd": total_subtotal_usd,
                        "iva_usd": total_iva_usd,
                        "total_cobrado_caja_usd": round(total_cobrado_usd, 2)
                    },
                    "desglose_monedas": desglose_por_moneda,
                    "facturas": facturas_dia
                })

            # 12. Reporte de Ventas Mensuales
            elif path == "/api/reportes/ventas-mensuales":
                cursor.execute("""
                    SELECT 
                        strftime('%Y-%m', fecha) as mes,
                        COUNT(id) as total_facturas,
                        ROUND(COALESCE(SUM(subtotal), 0), 2) as subtotal_usd,
                        ROUND(COALESCE(SUM(iva_total), 0), 2) as iva_usd,
                        ROUND(COALESCE(SUM(total_usd), 0), 2) as total_usd,
                        ROUND(COALESCE(SUM(CASE WHEN tipo_venta = 'contado' THEN total_usd ELSE 0 END), 0), 2) as ventas_contado_usd,
                        ROUND(COALESCE(SUM(CASE WHEN tipo_venta = 'credito' THEN total_usd ELSE 0 END), 0), 2) as ventas_credito_usd
                    FROM facturas
                    GROUP BY strftime('%Y-%m', fecha)
                    ORDER BY mes DESC
                """)
                meses = [dict(r) for r in cursor.fetchall()]

                cursor.execute("SELECT tasa_ves, tasa_cop FROM configuracion WHERE id = 1")
                cfg_row = cursor.fetchone()
                t_ves = cfg_row[0] if cfg_row else 45.0
                t_cop = cfg_row[1] if cfg_row else 4100.0

                for m in meses:
                    m["total_ves"] = round(m["total_usd"] * t_ves, 2)
                    m["total_cop"] = round(m["total_usd"] * t_cop, 2)

                total_historico_usd = round(sum(m["total_usd"] for m in meses), 2)
                total_facturas_historico = sum(m["total_facturas"] for m in meses)

                self.send_json({
                    "meses": meses,
                    "total_historico_usd": total_historico_usd,
                    "total_facturas_historico": total_facturas_historico
                })

            # 13. Reporte Detallado de Cuentas por Cobrar
            elif path == "/api/reportes/cxc-detallado":
                cursor.execute("SELECT tasa_ves, tasa_cop FROM configuracion WHERE id = 1")
                cfg_row = cursor.fetchone()
                t_ves = cfg_row[0] if cfg_row else 45.0
                t_cop = cfg_row[1] if cfg_row else 4100.0

                cursor.execute("""
                    SELECT 
                        cxc.*,
                        f.numero_factura,
                        f.fecha as fecha_factura,
                        f.total_usd as factura_total_usd,
                        c.nombre as cliente_nombre,
                        c.cedula as cliente_cedula,
                        c.telefono as cliente_telefono,
                        c.correo as cliente_correo,
                        c.direccion as cliente_direccion,
                        ROUND(cxc.saldo_pendiente * ?, 2) as saldo_ves,
                        ROUND(cxc.saldo_pendiente * ?, 2) as saldo_cop,
                        CAST((julianday('now') - julianday(cxc.fecha_vencimiento)) AS INTEGER) as dias_vencido
                    FROM cuentas_por_cobrar cxc
                    JOIN facturas f ON cxc.factura_id = f.id
                    JOIN clientes c ON cxc.cliente_id = c.id
                    ORDER BY 
                        CASE WHEN cxc.estado = 'pendiente' THEN 1 WHEN cxc.estado = 'parcial' THEN 2 ELSE 3 END,
                        cxc.fecha_vencimiento ASC
                """, (t_ves, t_cop))
                cuentas = [dict(r) for r in cursor.fetchall()]

                total_deuda_usd = round(sum(c["saldo_pendiente"] for c in cuentas if c["estado"] != "pagada"), 2)
                total_facturado_usd = round(sum(c["monto_total"] for c in cuentas), 2)
                total_cobrado_usd = round(sum(c["monto_pagado"] for c in cuentas), 2)

                self.send_json({
                    "cuentas": cuentas,
                    "resumen": {
                        "total_deuda_usd": total_deuda_usd,
                        "total_deuda_ves": round(total_deuda_usd * t_ves, 2),
                        "total_deuda_cop": round(total_deuda_usd * t_cop, 2),
                        "total_facturado_usd": total_facturado_usd,
                        "total_cobrado_usd": total_cobrado_usd,
                        "cuentas_activas": len([c for c in cuentas if c["estado"] != "pagada"]),
                        "cuentas_vencidas": len([c for c in cuentas if c["estado"] != "pagada" and (c.get("dias_vencido") or 0) > 0]),
                        "cuentas_pagadas": len([c for c in cuentas if c["estado"] == "pagada"])
                    }
                })

            # 14. Reporte Detallado de Cuentas por Pagar (CXP)
            elif path == "/api/reportes/cxp-detallado":
                cursor.execute("SELECT tasa_ves, tasa_cop FROM configuracion WHERE id = 1")
                cfg_row = cursor.fetchone()
                t_ves = cfg_row[0] if cfg_row else 45.0
                t_cop = cfg_row[1] if cfg_row else 4100.0

                cursor.execute("""
                    SELECT 
                        cxp.*,
                        comp.numero_control as compra_numero_control,
                        comp.fecha as fecha_compra,
                        prov.nombre as proveedor_nombre,
                        prov.cedula as proveedor_cedula,
                        prov.telefono as proveedor_telefono,
                        prov.correo as proveedor_correo,
                        prov.direccion as proveedor_direccion,
                        ROUND(cxp.saldo_pendiente * ?, 2) as saldo_ves,
                        ROUND(cxp.saldo_pendiente * ?, 2) as saldo_cop,
                        CAST((julianday('now') - julianday(cxp.fecha_vencimiento)) AS INTEGER) as dias_vencido
                    FROM cuentas_por_pagar cxp
                    LEFT JOIN compras comp ON cxp.compra_id = comp.id
                    JOIN proveedores prov ON cxp.proveedor_id = prov.id
                    ORDER BY 
                        CASE WHEN cxp.estado = 'pendiente' THEN 1 WHEN cxp.estado = 'parcial' THEN 2 ELSE 3 END,
                        cxp.fecha_vencimiento ASC
                """, (t_ves, t_cop))
                cuentas = [dict(r) for r in cursor.fetchall()]

                total_deuda_usd = round(sum(c["saldo_pendiente"] for c in cuentas if c["estado"] != "pagada"), 2)
                total_facturado_usd = round(sum(c["monto_total"] for c in cuentas), 2)
                total_pagado_usd = round(sum(c["monto_pagado"] for c in cuentas), 2)

                self.send_json({
                    "cuentas": cuentas,
                    "resumen": {
                        "total_deuda_usd": total_deuda_usd,
                        "total_deuda_ves": round(total_deuda_usd * t_ves, 2),
                        "total_deuda_cop": round(total_deuda_usd * t_cop, 2),
                        "total_facturado_usd": total_facturado_usd,
                        "total_pagado_usd": total_pagado_usd,
                        "cuentas_activas": len([c for c in cuentas if c["estado"] != "pagada"]),
                        "cuentas_vencidas": len([c for c in cuentas if c["estado"] != "pagada" and (c.get("dias_vencido") or 0) > 0]),
                        "cuentas_pagadas": len([c for c in cuentas if c["estado"] == "pagada"])
                    }
                })

            else:
                self.send_error_json("Endpoint no reconocido", 404)

        except Exception as e:
            self.send_error_json(str(e), 500)
        finally:
            conn.close()

    # ==========================================
    # CONTROLADORES DE LA API (POST)
    # ==========================================
    def handle_api_post(self, path):
        body = self.parse_body_json()
        if body is None:
            self.send_error_json("Formato JSON inválido", 400)
            return

        conn = get_connection()
        cursor = conn.cursor()

        try:
            # 1. Crear Categoría
            if path == "/api/categorias":
                nombre = body.get("nombre", "").strip()
                tipo = body.get("tipo", "").strip().lower()
                descripcion = body.get("descripcion", "").strip()

                if not nombre or tipo not in ('servicio', 'producto'):
                    self.send_error_json("Nombre y tipo válido ('servicio' o 'producto') son requeridos", 400)
                    return

                cursor.execute("INSERT INTO categorias (nombre, tipo, descripcion) VALUES (?, ?, ?)",
                               (nombre, tipo, descripcion))
                conn.commit()
                cat_id = cursor.lastrowid
                self.send_json({"id": cat_id, "nombre": nombre, "tipo": tipo, "descripcion": descripcion, "success": True}, 201)

            # 2. Crear Producto o Servicio
            elif path == "/api/productos":
                codigo = body.get("codigo", "").strip()
                nombre = body.get("nombre", "").strip()
                categoria_id = body.get("categoria_id")
                tipo = body.get("tipo", "").strip().lower()
                impuesto_tipo = body.get("impuesto_tipo", "gravado").strip().lower()
                precio_base = float(body.get("precio_base", 0.0))
                costo = float(body.get("costo", 0.0))
                stock = float(body.get("stock", 0.0))
                stock_minimo = float(body.get("stock_minimo", 5.0))
                imagen = body.get("imagen", "")
                descripcion = body.get("descripcion", "").strip()

                if not nombre or not categoria_id or tipo not in ('servicio', 'producto'):
                    self.send_error_json("Campos obligatorios: nombre, categoria_id y tipo ('servicio' o 'producto')", 400)
                    return

                if not codigo:
                    # Generar código automático si no se proporcionó
                    prefix = "PRD" if tipo == "producto" else "SRV"
                    codigo = f"{prefix}-{int(time.time()) % 100000:05d}"

                # Si es servicio, NO maneja existencia
                if tipo == 'servicio':
                    stock = 0.0
                    stock_minimo = 0.0

                # Obtener porcentaje de IVA de configuración
                cursor.execute("SELECT iva_porcentaje FROM configuracion WHERE id = 1")
                iva_pct = cursor.fetchone()[0] / 100.0

                if impuesto_tipo == 'gravado':
                    iva_monto = round(precio_base * iva_pct, 4)
                else:
                    iva_monto = 0.0

                precio_total = round(precio_base + iva_monto, 4)

                cursor.execute("""
                    INSERT INTO productos (codigo, nombre, categoria_id, tipo, impuesto_tipo, precio_base, iva_monto, precio_total, costo, stock, stock_minimo, imagen, descripcion)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (codigo, nombre, categoria_id, tipo, impuesto_tipo, precio_base, iva_monto, precio_total, costo, stock, stock_minimo, imagen, descripcion))
                conn.commit()
                p_id = cursor.lastrowid
                self.send_json({"id": p_id, "codigo": codigo, "success": True}, 201)

            # 3. Crear Cliente
            elif path == "/api/clientes":
                nombre = body.get("nombre", "").strip()
                cedula = body.get("cedula", "").strip().upper()
                telefono = body.get("telefono", "").strip()
                correo = body.get("correo", "").strip()
                direccion = body.get("direccion", "").strip()

                if not nombre or not cedula or not telefono:
                    self.send_error_json("Nombre, cédula y teléfono para WhatsApp son obligatorios", 400)
                    return

                cursor.execute("""
                    INSERT INTO clientes (nombre, cedula, telefono, correo, direccion)
                    VALUES (?, ?, ?, ?, ?)
                """, (nombre, cedula, telefono, correo, direccion))
                conn.commit()
                self.send_json({"id": cursor.lastrowid, "success": True}, 201)

            # 4. Crear Proveedor
            elif path == "/api/proveedores":
                nombre = body.get("nombre", "").strip()
                cedula = body.get("cedula", "").strip().upper()
                telefono = body.get("telefono", "").strip()
                correo = body.get("correo", "").strip()
                direccion = body.get("direccion", "").strip()

                if not nombre or not cedula or not telefono:
                    self.send_error_json("Nombre, cédula/RIF y teléfono para WhatsApp son obligatorios", 400)
                    return

                cursor.execute("""
                    INSERT INTO proveedores (nombre, cedula, telefono, correo, direccion)
                    VALUES (?, ?, ?, ?, ?)
                """, (nombre, cedula, telefono, correo, direccion))
                conn.commit()
                self.send_json({"id": cursor.lastrowid, "success": True}, 201)

            # 5. Crear Factura (Venta Contado o Crédito con descuento de stock y pagos multimoneda)
            elif path == "/api/facturas":
                cliente_id = body.get("cliente_id")
                items = body.get("items", [])
                pagos = body.get("pagos", [])
                notas = body.get("notas", "")
                tipo_venta = body.get("tipo_venta", "contado").strip().lower()
                fecha_vencimiento = body.get("fecha_vencimiento", "")

                if not cliente_id or not items or len(items) == 0:
                    self.send_error_json("Se requiere un cliente y al menos un producto o servicio", 400)
                    return

                if tipo_venta == "credito" and not fecha_vencimiento:
                    fecha_vencimiento = (datetime.now() + timedelta(days=15)).strftime("%Y-%m-%d")

                # Obtener configuración de tasas e IVA
                cursor.execute("SELECT * FROM configuracion WHERE id = 1")
                cfg = dict(cursor.fetchone())
                tasa_ves = cfg["tasa_ves"]
                tasa_cop = cfg["tasa_cop"]
                iva_pct = cfg["iva_porcentaje"] / 100.0

                # Iniciar procesamiento
                subtotal = 0.0
                iva_total = 0.0
                detalles_procesados = []

                for itm in items:
                    prod_id = itm.get("producto_id")
                    cant = float(itm.get("cantidad", 1))

                    cursor.execute("SELECT * FROM productos WHERE id = ?", (prod_id,))
                    prod = cursor.fetchone()
                    if not prod:
                        conn.rollback()
                        self.send_error_json(f"Producto ID {prod_id} no existe", 400)
                        return

                    prod_dict = dict(prod)
                    tipo = prod_dict["tipo"]
                    impuesto_tipo = prod_dict["impuesto_tipo"]
                    precio_unitario = float(itm.get("precio_unitario", prod_dict["precio_base"]))

                    # Si es producto, validar y descontar existencia
                    if tipo == "producto":
                        if prod_dict["stock"] < cant:
                            conn.rollback()
                            self.send_error_json(f"Stock insuficiente para '{prod_dict['nombre']}'. Disponible: {prod_dict['stock']}, Solicitado: {cant}", 400)
                            return
                        # Restar del inventario
                        cursor.execute("UPDATE productos SET stock = stock - ? WHERE id = ?", (cant, prod_id))
                    # Si es servicio, no se resta stock!

                    # Cálculo de IVA
                    if impuesto_tipo == "gravado":
                        iva_u = round(precio_unitario * iva_pct, 4)
                    else:
                        iva_u = 0.0

                    item_subtotal = round(precio_unitario * cant, 4)
                    item_iva = round(iva_u * cant, 4)
                    item_total = round(item_subtotal + item_iva, 4)

                    subtotal += item_subtotal
                    iva_total += item_iva

                    detalles_procesados.append({
                        "producto_id": prod_id,
                        "nombre_producto": prod_dict["nombre"],
                        "tipo": tipo,
                        "impuesto_tipo": impuesto_tipo,
                        "cantidad": cant,
                        "precio_unitario": precio_unitario,
                        "iva_unitario": iva_u,
                        "subtotal": item_subtotal,
                        "total": item_total
                    })

                total_usd = round(subtotal + iva_total, 2)
                total_ves = round(total_usd * tasa_ves, 2)
                total_cop = round(total_usd * tasa_cop, 2)

                # Procesar pagos recibidos
                total_pagado_usd = 0.0
                pagos_procesados = []
                for p in pagos:
                    moneda = p.get("moneda", "USD").upper()
                    metodo = p.get("metodo", "Efectivo")
                    monto_moneda = float(p.get("monto_moneda", 0))
                    tasa_cambio = float(p.get("tasa_cambio", 1.0))
                    referencia = p.get("referencia", "")

                    if moneda == "USD":
                        equiv_usd = monto_moneda
                    elif moneda == "VES":
                        equiv_usd = round(monto_moneda / tasa_cambio, 2) if tasa_cambio > 0 else 0
                    elif moneda == "COP":
                        equiv_usd = round(monto_moneda / tasa_cambio, 2) if tasa_cambio > 0 else 0
                    else:
                        equiv_usd = monto_moneda

                    if monto_moneda > 0:
                        total_pagado_usd += equiv_usd
                        pagos_procesados.append({
                            "moneda": moneda,
                            "metodo": metodo,
                            "monto_moneda": monto_moneda,
                            "tasa_cambio": tasa_cambio,
                            "equivalente_usd": equiv_usd,
                            "referencia": referencia
                        })

                total_pagado_usd = round(total_pagado_usd, 2)

                if tipo_venta == "credito":
                    saldo_pendiente = max(0.0, round(total_usd - total_pagado_usd, 2))
                    estado_factura = "pagada"
                else:
                    saldo_pendiente = 0.0
                    estado_factura = "pagada"

                # Generar número correlativo de factura
                cursor.execute("SELECT COUNT(*) FROM facturas")
                correlativo = cursor.fetchone()[0] + 1
                numero_factura = f"FAC-{correlativo:06d}"

                cursor.execute("""
                    INSERT INTO facturas (numero_factura, cliente_id, subtotal, iva_total, total_usd, tasa_ves, tasa_cop, total_ves, total_cop, estado, tipo_venta, fecha_vencimiento, saldo_pendiente, notas)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (numero_factura, cliente_id, subtotal, iva_total, total_usd, tasa_ves, tasa_cop, total_ves, total_cop, estado_factura, tipo_venta, fecha_vencimiento if tipo_venta == 'credito' else None, saldo_pendiente, notas))
                factura_id = cursor.lastrowid

                # Guardar detalles
                for d in detalles_procesados:
                    cursor.execute("""
                        INSERT INTO factura_detalles (factura_id, producto_id, nombre_producto, tipo, impuesto_tipo, cantidad, precio_unitario, iva_unitario, subtotal, total)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (factura_id, d["producto_id"], d["nombre_producto"], d["tipo"], d["impuesto_tipo"], d["cantidad"], d["precio_unitario"], d["iva_unitario"], d["subtotal"], d["total"]))

                # Guardar pagos iniciales de la factura
                for pp in pagos_procesados:
                    cursor.execute("""
                        INSERT INTO factura_pagos (factura_id, moneda, metodo, monto_moneda, tasa_cambio, equivalente_usd, referencia)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (factura_id, pp["moneda"], pp["metodo"], pp["monto_moneda"], pp["tasa_cambio"], pp["equivalente_usd"], pp["referencia"]))

                cxc_id = None
                # Si es crédito, registrar en Cuentas por Cobrar
                if tipo_venta == "credito":
                    cxc_estado = "pagada" if saldo_pendiente <= 0.001 else ("parcial" if total_pagado_usd > 0 else "pendiente")
                    fecha_emision = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

                    cursor.execute("""
                        INSERT INTO cuentas_por_cobrar (factura_id, cliente_id, monto_total, monto_pagado, saldo_pendiente, fecha_emision, fecha_vencimiento, estado, notas)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (factura_id, cliente_id, total_usd, total_pagado_usd, saldo_pendiente, fecha_emision, fecha_vencimiento, cxc_estado, notas))
                    cxc_id = cursor.lastrowid

                    # Si hubo un abono/pago inicial en el crédito, registrar en abonos_cxc
                    if total_pagado_usd > 0:
                        cursor.execute("""
                            INSERT INTO abonos_cxc (cxc_id, monto_usd, notas)
                            VALUES (?, ?, 'Abono inicial al momento de facturar')
                        """, (cxc_id, total_pagado_usd))
                        abono_id = cursor.lastrowid

                        for pp in pagos_procesados:
                            cursor.execute("""
                                INSERT INTO abono_cxc_pagos (abono_id, moneda, metodo, monto_moneda, tasa_cambio, equivalente_usd, referencia)
                                VALUES (?, ?, ?, ?, ?, ?, ?)
                            """, (abono_id, pp["moneda"], pp["metodo"], pp["monto_moneda"], pp["tasa_cambio"], pp["equivalente_usd"], pp["referencia"]))

                conn.commit()
                self.send_json({
                    "id": factura_id,
                    "numero_factura": numero_factura,
                    "total_usd": total_usd,
                    "total_ves": total_ves,
                    "total_cop": total_cop,
                    "tipo_venta": tipo_venta,
                    "fecha_vencimiento": fecha_vencimiento,
                    "saldo_pendiente": saldo_pendiente,
                    "cxc_id": cxc_id,
                    "success": True
                }, 201)

            # 6. Registrar Abono a Cuenta por Cobrar
            elif path.startswith("/api/cxc/") and path.endswith("/abonos"):
                parts = path.split("/")
                cxc_id = int(parts[3])
                pagos = body.get("pagos", [])
                notas = body.get("notas", "Abono a cuenta por cobrar")

                if not pagos or len(pagos) == 0:
                    self.send_error_json("Se requiere al menos una forma y monto de pago", 400)
                    return

                cursor.execute("SELECT * FROM cuentas_por_cobrar WHERE id = ?", (cxc_id,))
                cxc = cursor.fetchone()
                if not cxc:
                    self.send_error_json("Cuenta por cobrar no encontrada", 404)
                    return

                cxc_dict = dict(cxc)
                if cxc_dict["saldo_pendiente"] <= 0.001:
                    self.send_error_json("Esta cuenta ya se encuentra totalmente saldada", 400)
                    return

                # Calcular total abono
                total_abono_usd = 0.0
                pagos_proc = []
                for p in pagos:
                    moneda = p.get("moneda", "USD").upper()
                    metodo = p.get("metodo", "Efectivo")
                    monto_moneda = float(p.get("monto_moneda", 0))
                    tasa_cambio = float(p.get("tasa_cambio", 1.0))
                    referencia = p.get("referencia", "")

                    if moneda == "USD":
                        equiv_usd = monto_moneda
                    elif moneda in ("VES", "COP"):
                        equiv_usd = round(monto_moneda / tasa_cambio, 2) if tasa_cambio > 0 else 0
                    else:
                        equiv_usd = monto_moneda

                    if monto_moneda > 0:
                        total_abono_usd += equiv_usd
                        pagos_proc.append({
                            "moneda": moneda,
                            "metodo": metodo,
                            "monto_moneda": monto_moneda,
                            "tasa_cambio": tasa_cambio,
                            "equivalente_usd": equiv_usd,
                            "referencia": referencia
                        })

                total_abono_usd = round(total_abono_usd, 2)
                if total_abono_usd <= 0:
                    conn.rollback()
                    self.send_error_json("El monto del abono debe ser mayor a 0", 400)
                    return

                # Registrar abono
                cursor.execute("""
                    INSERT INTO abonos_cxc (cxc_id, monto_usd, notas)
                    VALUES (?, ?, ?)
                """, (cxc_id, total_abono_usd, notas))
                abono_id = cursor.lastrowid

                # Registrar pagos del abono
                for pp in pagos_proc:
                    cursor.execute("""
                        INSERT INTO abono_cxc_pagos (abono_id, moneda, metodo, monto_moneda, tasa_cambio, equivalente_usd, referencia)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (abono_id, pp["moneda"], pp["metodo"], pp["monto_moneda"], pp["tasa_cambio"], pp["equivalente_usd"], pp["referencia"]))

                # Actualizar saldo en CXC
                nuevo_monto_pagado = round(cxc_dict["monto_pagado"] + total_abono_usd, 2)
                nuevo_saldo = max(0.0, round(cxc_dict["saldo_pendiente"] - total_abono_usd, 2))
                nuevo_estado = "pagada" if nuevo_saldo <= 0.001 else "parcial"

                cursor.execute("""
                    UPDATE cuentas_por_cobrar
                    SET monto_pagado = ?, saldo_pendiente = ?, estado = ?
                    WHERE id = ?
                """, (nuevo_monto_pagado, nuevo_saldo, nuevo_estado, cxc_id))

                # Actualizar factura correspondiente
                cursor.execute("""
                    UPDATE facturas
                    SET saldo_pendiente = ?
                    WHERE id = ?
                """, (nuevo_saldo, cxc_dict["factura_id"]))

                conn.commit()
                self.send_json({
                    "success": True,
                    "abono_id": abono_id,
                    "monto_abono_usd": total_abono_usd,
                    "nuevo_saldo_pendiente": nuevo_saldo,
                    "nuevo_estado": nuevo_estado
                }, 201)

            # 6. Crear Compra (Incremento de stock, foto de factura y creación ágil de productos)
            elif path == "/api/compras":
                proveedor_id = body.get("proveedor_id")
                numero_control = body.get("numero_control", f"CMP-{int(time.time()) % 100000:05d}")
                foto_factura = body.get("foto_factura", "")
                items = body.get("items", [])
                notas = body.get("notas", "")

                if not proveedor_id or not items or len(items) == 0:
                    self.send_error_json("Se requiere un proveedor y al menos un ítem comprado", 400)
                    return

                cursor.execute("SELECT iva_porcentaje FROM configuracion WHERE id = 1")
                iva_pct = cursor.fetchone()[0] / 100.0

                subtotal = 0.0
                iva_total = 0.0
                detalles_procesados = []

                for itm in items:
                    prod_id = itm.get("producto_id")
                    # Si no existe, crearlo al vuelo
                    if not prod_id or itm.get("crear_nuevo") is True:
                        nombre_nuevo = itm.get("nombre", "").strip()
                        cat_id = itm.get("categoria_id")
                        impuesto_tipo = itm.get("impuesto_tipo", "gravado")
                        costo_u = float(itm.get("costo_unitario", 0.0))
                        precio_venta = float(itm.get("precio_venta", costo_u * 1.3))
                        tipo = itm.get("tipo", "producto")

                        if not cat_id:
                            # Obtener una categoría de tipo producto por defecto
                            cursor.execute("SELECT id FROM categorias WHERE tipo = 'producto' LIMIT 1")
                            cat_row = cursor.fetchone()
                            cat_id = cat_row[0] if cat_row else 1

                        codigo_nuevo = f"PRD-{int(time.time() * 100) % 1000000:06d}"
                        iva_v = round(precio_venta * iva_pct, 4) if impuesto_tipo == "gravado" else 0.0

                        cursor.execute("""
                            INSERT INTO productos (codigo, nombre, categoria_id, tipo, impuesto_tipo, precio_base, iva_monto, precio_total, costo, stock, stock_minimo)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 5)
                        """, (codigo_nuevo, nombre_nuevo, cat_id, tipo, impuesto_tipo, precio_venta, iva_v, round(precio_venta + iva_v, 4), costo_u))
                        prod_id = cursor.lastrowid

                    cant = float(itm.get("cantidad", 1))
                    costo_unitario = float(itm.get("costo_unitario", 0))
                    impuesto_tipo = itm.get("impuesto_tipo", "gravado")

                    cursor.execute("SELECT * FROM productos WHERE id = ?", (prod_id,))
                    prod = dict(cursor.fetchone())

                    # Si es producto, INCREMENTAR stock y actualizar costo de reposición
                    if prod["tipo"] == "producto":
                        cursor.execute("""
                            UPDATE productos 
                            SET stock = stock + ?, costo = ?
                            WHERE id = ?
                        """, (cant, costo_unitario, prod_id))

                    # Cálculo de IVA de compra
                    if impuesto_tipo == "gravado":
                        iva_u = round(costo_unitario * iva_pct, 4)
                    else:
                        iva_u = 0.0

                    item_subtotal = round(costo_unitario * cant, 4)
                    item_iva = round(iva_u * cant, 4)
                    item_total = round(item_subtotal + item_iva, 4)

                    subtotal += item_subtotal
                    iva_total += item_iva

                    detalles_procesados.append({
                        "producto_id": prod_id,
                        "nombre_producto": prod["nombre"],
                        "cantidad": cant,
                        "costo_unitario": costo_unitario,
                        "impuesto_tipo": impuesto_tipo,
                        "iva_unitario": iva_u,
                        "total": item_total
                    })

                total = round(subtotal + iva_total, 2)
                tipo_compra = body.get("tipo_compra", "contado")
                fecha_vencimiento = body.get("fecha_vencimiento")
                if tipo_compra == "credito" and not fecha_vencimiento:
                    fecha_vencimiento = (datetime.now() + timedelta(days=15)).strftime("%Y-%m-%d")

                numero_factura = body.get("numero_factura", numero_control)
                pagos = body.get("pagos", [])
                saldo_pendiente = total if tipo_compra == "credito" else 0.0

                cursor.execute("""
                    INSERT INTO compras (numero_control, proveedor_id, foto_factura, subtotal, iva_total, total, tipo_compra, fecha_vencimiento, saldo_pendiente, numero_factura, notas)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (numero_control, proveedor_id, foto_factura, subtotal, iva_total, total, tipo_compra, fecha_vencimiento, saldo_pendiente, numero_factura, notas))
                compra_id = cursor.lastrowid

                # Guardar detalles de la compra
                for d in detalles_procesados:
                    cursor.execute("""
                        INSERT INTO compra_detalles (compra_id, producto_id, nombre_producto, cantidad, costo_unitario, impuesto_tipo, iva_unitario, total)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (compra_id, d["producto_id"], d["nombre_producto"], d["cantidad"], d["costo_unitario"], d["impuesto_tipo"], d["iva_unitario"], d["total"]))

                # Si es a crédito -> Enviar inmediatamente a Cuentas por Pagar
                if tipo_compra == "credito":
                    cursor.execute("""
                        INSERT INTO cuentas_por_pagar (compra_id, proveedor_id, descripcion_concepto, numero_factura, monto_total, monto_pagado, saldo_pendiente, fecha_emision, fecha_vencimiento, estado, tipo_registro, notas)
                        VALUES (?, ?, ?, ?, ?, 0.0, ?, ?, ?, 'pendiente', 'compra', ?)
                    """, (compra_id, proveedor_id, f"Compra Factura #{numero_control}", numero_factura, total, total, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), fecha_vencimiento, notas))

                # Si es de contado -> Registrar las formas de pago multimoneda
                elif tipo_compra == "contado" and pagos:
                    for p in pagos:
                        tasa = float(p.get("tasa_cambio") or 1.0)
                        monto_m = float(p.get("monto_moneda", 0.0))
                        equiv = float(p.get("equivalente_usd") or (monto_m / tasa if p.get("moneda") != "USD" else monto_m))
                        cursor.execute("""
                            INSERT INTO compra_pagos (compra_id, moneda, metodo, monto_moneda, tasa_cambio, equivalente_usd, referencia)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        """, (compra_id, p["moneda"], p["metodo"], monto_m, tasa, round(equiv, 2), p.get("referencia", "")))

                conn.commit()
                self.send_json({
                    "id": compra_id,
                    "numero_control": numero_control,
                    "total": total,
                    "tipo_compra": tipo_compra,
                    "saldo_pendiente": saldo_pendiente,
                    "success": True
                }, 201)

            # 7. Registrar Saldo o Gasto Directo a Proveedor (Sin afectar inventario)
            elif path == "/api/cxp/directo":
                proveedor_id = body.get("proveedor_id")
                descripcion_concepto = (body.get("descripcion_concepto") or "").strip()
                numero_factura = (body.get("numero_factura") or "").strip() or f"DIR-{int(time.time()) % 100000:05d}"
                monto_total = float(body.get("monto_total", 0.0))
                fecha_emision = body.get("fecha_emision") or datetime.now().strftime("%Y-%m-%d")
                fecha_vencimiento = body.get("fecha_vencimiento") or (datetime.now() + timedelta(days=15)).strftime("%Y-%m-%d")
                notas = body.get("notas", "")

                if not proveedor_id or not descripcion_concepto or monto_total <= 0:
                    self.send_error_json("Se requiere un proveedor, concepto/descripción y monto mayor a 0", 400)
                    return

                cursor.execute("""
                    INSERT INTO cuentas_por_pagar (compra_id, proveedor_id, descripcion_concepto, numero_factura, monto_total, monto_pagado, saldo_pendiente, fecha_emision, fecha_vencimiento, estado, tipo_registro, notas)
                    VALUES (NULL, ?, ?, ?, ?, 0.0, ?, ?, ?, 'pendiente', 'directo', ?)
                """, (proveedor_id, descripcion_concepto, numero_factura, monto_total, monto_total, fecha_emision, fecha_vencimiento, notas))
                cxp_id = cursor.lastrowid
                conn.commit()

                self.send_json({
                    "id": cxp_id,
                    "success": True,
                    "message": "Gasto / Saldo directo a pagar registrado exitosamente"
                }, 201)

            # 8. Registrar Abono o Pago a Cuenta por Pagar (Multimoneda)
            elif path.startswith("/api/cxp/") and path.endswith("/abonos"):
                cxp_id = int(path.split("/")[3])
                pagos = body.get("pagos", [])
                notas = body.get("notas", "")
                monto_usd = float(body.get("monto_usd", 0.0))

                if monto_usd <= 0 and pagos:
                    for p in pagos:
                        tasa = float(p.get("tasa_cambio") or 1.0)
                        monto_m = float(p.get("monto_moneda", 0.0))
                        eq = float(p.get("equivalente_usd") or (monto_m / tasa if p.get("moneda") != "USD" else monto_m))
                        monto_usd += eq
                    monto_usd = round(monto_usd, 2)

                if monto_usd <= 0:
                    self.send_error_json("El monto del abono debe ser mayor a 0", 400)
                    return

                cursor.execute("SELECT * FROM cuentas_por_pagar WHERE id = ?", (cxp_id,))
                cxp = cursor.fetchone()
                if not cxp:
                    self.send_error_json("Cuenta por pagar no encontrada", 404)
                    return
                cxp_dict = dict(cxp)

                if monto_usd > cxp_dict["saldo_pendiente"] + 0.05:
                    self.send_error_json(f"El monto a abonar (${monto_usd}) excede el saldo pendiente (${cxp_dict['saldo_pendiente']})", 400)
                    return

                cursor.execute("""
                    INSERT INTO abonos_cxp (cxp_id, monto_usd, notas)
                    VALUES (?, ?, ?)
                """, (cxp_id, monto_usd, notas))
                abono_id = cursor.lastrowid

                for p in pagos:
                    tasa = float(p.get("tasa_cambio") or 1.0)
                    monto_m = float(p.get("monto_moneda", 0.0))
                    eq = float(p.get("equivalente_usd") or (monto_m / tasa if p.get("moneda") != "USD" else monto_m))
                    cursor.execute("""
                        INSERT INTO abono_cxp_pagos (abono_id, moneda, metodo, monto_moneda, tasa_cambio, equivalente_usd, referencia)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (abono_id, p["moneda"], p["metodo"], monto_m, tasa, round(eq, 2), p.get("referencia", "")))

                nuevo_monto_pagado = round(cxp_dict["monto_pagado"] + monto_usd, 2)
                nuevo_saldo = max(0.0, round(cxp_dict["monto_total"] - nuevo_monto_pagado, 2))
                nuevo_estado = "pagada" if nuevo_saldo <= 0.01 else "parcial"

                cursor.execute("""
                    UPDATE cuentas_por_pagar
                    SET monto_pagado = ?, saldo_pendiente = ?, estado = ?
                    WHERE id = ?
                """, (nuevo_monto_pagado, nuevo_saldo, nuevo_estado, cxp_id))

                if cxp_dict.get("compra_id"):
                    cursor.execute("""
                        UPDATE compras
                        SET saldo_pendiente = ?
                        WHERE id = ?
                    """, (nuevo_saldo, cxp_dict["compra_id"]))

                conn.commit()
                self.send_json({
                    "success": True,
                    "abono_id": abono_id,
                    "monto_abono_usd": monto_usd,
                    "nuevo_saldo_pendiente": nuevo_saldo,
                    "nuevo_estado": nuevo_estado
                }, 201)

            # 9. Sincronización Automática de Tasas Oficiales (BCV & TRM)
            elif path == "/api/tasas/actualizar-auto":
                ves, cop, fuente, err = obtener_tasas_oficiales()
                
                # Obtener valores actuales por si alguna falló
                cursor.execute("SELECT tasa_ves, tasa_cop FROM configuracion WHERE id = 1")
                cfg_curr = cursor.fetchone()
                curr_ves = cfg_curr[0] if cfg_curr else 45.0
                curr_cop = cfg_curr[1] if cfg_curr else 4100.0

                if ves is None and cop is None:
                    self.send_error_json(f"No se pudo consultar ninguna tasa oficial: {err}", 502)
                    return

                final_ves = ves if ves is not None else curr_ves
                final_cop = cop if cop is not None else curr_cop
                ahora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

                cursor.execute("""
                    UPDATE configuracion 
                    SET tasa_ves = ?, tasa_cop = ?, fecha_tasas_actualizacion = ?, fuente_tasas = ?
                    WHERE id = 1
                """, (final_ves, final_cop, ahora, fuente))
                conn.commit()

                self.send_json({
                    "success": True,
                    "tasa_ves": final_ves,
                    "tasa_cop": final_cop,
                    "fecha_tasas_actualizacion": ahora,
                    "fuente_tasas": fuente,
                    "message": "Tasas oficiales de BCV y TRM sincronizadas correctamente"
                })

            # 9. Guardar Personalización Visual y Textos (Temas, Colores y Nombres)
            elif path == "/api/config/personalizacion":
                tema = body.get("tema_config")
                labels = body.get("labels_config")

                tema_str = json.dumps(tema, ensure_ascii=False) if tema is not None else None
                labels_str = json.dumps(labels, ensure_ascii=False) if labels is not None else None

                cursor.execute("""
                    UPDATE configuracion 
                    SET tema_config = ?, labels_config = ?
                    WHERE id = 1
                """, (tema_str, labels_str))
                conn.commit()

                self.send_json({
                    "success": True,
                    "message": "Personalización guardada exitosamente"
                })

            # 10. Restablecer Personalización a Valores de Fábrica
            elif path == "/api/config/personalizacion/reset":
                cursor.execute("""
                    UPDATE configuracion 
                    SET tema_config = NULL, labels_config = NULL
                    WHERE id = 1
                """)
                conn.commit()

                self.send_json({
                    "success": True,
                    "message": "Personalización restablecida a valores originales"
                })

            else:
                self.send_error_json("Endpoint no reconocido", 404)

        except sqlite3.IntegrityError as ie:
            conn.rollback()
            self.send_error_json(f"Error de integridad: {str(ie)}", 400)
        except Exception as e:
            conn.rollback()
            self.send_error_json(str(e), 500)
        finally:
            conn.close()

    # ==========================================
    # CONTROLADORES DE LA API (PUT)
    # ==========================================
    def handle_api_put(self, path):
        body = self.parse_body_json()
        if body is None:
            self.send_error_json("Formato JSON inválido", 400)
            return

        conn = get_connection()
        cursor = conn.cursor()

        try:
            # 1. Configuración & Tasas
            if path == "/api/config":
                cursor.execute("""
                    UPDATE configuracion 
                    SET nombre_negocio = ?, documento_fiscal = ?, telefono = ?, direccion = ?, 
                        iva_porcentaje = ?, tasa_ves = ?, tasa_cop = ?
                    WHERE id = 1
                """, (
                    body.get("nombre_negocio"),
                    body.get("documento_fiscal"),
                    body.get("telefono"),
                    body.get("direccion"),
                    float(body.get("iva_porcentaje", 16.0)),
                    float(body.get("tasa_ves", 45.0)),
                    float(body.get("tasa_cop", 4100.0))
                ))
                conn.commit()
                self.send_json({"success": True, "message": "Configuración y tasas actualizadas correctamente"})

            # 2. Actualizar Producto / Servicio
            elif path.startswith("/api/productos/"):
                p_id = int(path.split("/")[-1])
                precio_base = float(body.get("precio_base", 0.0))
                impuesto_tipo = body.get("impuesto_tipo", "gravado")
                tipo = body.get("tipo", "producto")
                stock = float(body.get("stock", 0.0))
                if tipo == 'servicio':
                    stock = 0.0

                cursor.execute("SELECT iva_porcentaje FROM configuracion WHERE id = 1")
                iva_pct = cursor.fetchone()[0] / 100.0

                iva_monto = round(precio_base * iva_pct, 4) if impuesto_tipo == 'gravado' else 0.0
                precio_total = round(precio_base + iva_monto, 4)

                cursor.execute("""
                    UPDATE productos 
                    SET codigo = ?, nombre = ?, categoria_id = ?, tipo = ?, impuesto_tipo = ?,
                        precio_base = ?, iva_monto = ?, precio_total = ?, costo = ?, stock = ?, 
                        stock_minimo = ?, imagen = ?, descripcion = ?
                    WHERE id = ?
                """, (
                    body.get("codigo"),
                    body.get("nombre"),
                    body.get("categoria_id"),
                    tipo,
                    impuesto_tipo,
                    precio_base,
                    iva_monto,
                    precio_total,
                    float(body.get("costo", 0.0)),
                    stock,
                    float(body.get("stock_minimo", 5.0)),
                    body.get("imagen", ""),
                    body.get("descripcion", ""),
                    p_id
                ))
                conn.commit()
                self.send_json({"success": True, "message": "Producto actualizado"})

            # 3. Actualizar Categoría
            elif path.startswith("/api/categorias/"):
                c_id = int(path.split("/")[-1])
                cursor.execute("""
                    UPDATE categorias 
                    SET nombre = ?, tipo = ?, descripcion = ?
                    WHERE id = ?
                """, (body.get("nombre"), body.get("tipo"), body.get("descripcion"), c_id))
                conn.commit()
                self.send_json({"success": True})

            # 4. Actualizar Cliente
            elif path.startswith("/api/clientes/"):
                c_id = int(path.split("/")[-1])
                cursor.execute("""
                    UPDATE clientes 
                    SET nombre = ?, cedula = ?, telefono = ?, correo = ?, direccion = ?
                    WHERE id = ?
                """, (body.get("nombre"), body.get("cedula"), body.get("telefono"), body.get("correo"), body.get("direccion"), c_id))
                conn.commit()
                self.send_json({"success": True})

            # 5. Actualizar Proveedor
            elif path.startswith("/api/proveedores/"):
                pr_id = int(path.split("/")[-1])
                cursor.execute("""
                    UPDATE proveedores 
                    SET nombre = ?, cedula = ?, telefono = ?, correo = ?, direccion = ?
                    WHERE id = ?
                """, (body.get("nombre"), body.get("cedula"), body.get("telefono"), body.get("correo"), body.get("direccion"), pr_id))
                conn.commit()
                self.send_json({"success": True})

            else:
                self.send_error_json("Endpoint no reconocido", 404)

        except Exception as e:
            conn.rollback()
            self.send_error_json(str(e), 500)
        finally:
            conn.close()

    # ==========================================
    # CONTROLADORES DE LA API (DELETE)
    # ==========================================
    def handle_api_delete(self, path):
        conn = get_connection()
        cursor = conn.cursor()

        try:
            if path.startswith("/api/productos/"):
                p_id = int(path.split("/")[-1])
                # Marcar inactivo para mantener integridad de facturas históricas
                cursor.execute("UPDATE productos SET activo = 0 WHERE id = ?", (p_id,))
                conn.commit()
                self.send_json({"success": True, "message": "Producto desactivado correctamente"})

            elif path.startswith("/api/categorias/"):
                c_id = int(path.split("/")[-1])
                # Verificar si tiene productos asociados
                cursor.execute("SELECT COUNT(*) FROM productos WHERE categoria_id = ? AND activo = 1", (c_id,))
                count = cursor.fetchone()[0]
                if count > 0:
                    self.send_error_json(f"No se puede eliminar la categoría porque tiene {count} productos/servicios asociados.", 400)
                    return
                cursor.execute("DELETE FROM categorias WHERE id = ?", (c_id,))
                conn.commit()
                self.send_json({"success": True})

            elif path.startswith("/api/clientes/"):
                c_id = int(path.split("/")[-1])
                cursor.execute("DELETE FROM clientes WHERE id = ?", (c_id,))
                conn.commit()
                self.send_json({"success": True})

            elif path.startswith("/api/proveedores/"):
                p_id = int(path.split("/")[-1])
                cursor.execute("DELETE FROM proveedores WHERE id = ?", (p_id,))
                conn.commit()
                self.send_json({"success": True})

            else:
                self.send_error_json("Endpoint no reconocido", 404)

        except Exception as e:
            conn.rollback()
            self.send_error_json(str(e), 500)
        finally:
            conn.close()


import threading
import webbrowser

def is_server_responding(port):
    try:
        req = urllib.request.Request(f"http://localhost:{port}/api/config")
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            return resp.status == 200
    except Exception:
        return False

def check_and_update_rates_background():
    time.sleep(1) # Esperar a que el servidor termine de iniciar
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT fecha_tasas_actualizacion, tasa_ves, tasa_cop FROM configuracion WHERE id = 1")
        row = cursor.fetchone()
        hoy = datetime.now().strftime("%Y-%m-%d")
        needs_update = False
        if not row or not row[0] or not row[0].startswith(hoy):
            needs_update = True

        if needs_update:
            print("[Auto-Tasas] Consultando tasas oficiales del BCV y TRM Colombia...")
            ves, cop, fuente, err = obtener_tasas_oficiales()
            if ves or cop:
                ahora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                curr_ves = row[1] if row else 45.0
                curr_cop = row[2] if row else 4100.0
                final_ves = ves if ves else curr_ves
                final_cop = cop if cop else curr_cop
                cursor.execute("""
                    UPDATE configuracion 
                    SET tasa_ves = ?, tasa_cop = ?, fecha_tasas_actualizacion = ?, fuente_tasas = ?
                    WHERE id = 1
                """, (final_ves, final_cop, ahora, fuente))
                conn.commit()
                print(f"[Auto-Tasas] Sincronizadas con éxito: BCV = {final_ves} Bs. | TRM = {final_cop} COP ({fuente})")
            else:
                print(f"[Auto-Tasas] Advertencia: {err}")
        else:
            print(f"[Auto-Tasas] Las tasas ya están actualizadas a la fecha de hoy ({row[0]}).")
        conn.close()
    except Exception as e:
        print(f"[Auto-Tasas] Excepción al verificar tasas: {e}")

def run_server():
    init_db()

    # Si ya hay un servidor activo en el puerto 8000, abrir navegador y no dar error
    if is_server_responding(PORT):
        print(f"===============================================================")
        print(f" Sistema de Control de Inventario y Facturacion Multimoneda")
        print(f"===============================================================")
        print(f" [INFO] El servidor ya se encuentra ACTIVO en: http://localhost:{PORT}")
        print(f" [INFO] Abriendo la aplicacion en su navegador web...")
        print(f"===============================================================")
        try:
            webbrowser.open(f"http://localhost:{PORT}")
        except Exception:
            pass
        return

    socketserver.ThreadingTCPServer.allow_reuse_address = True
    httpd = None
    actual_port = PORT

    ports_to_try = [PORT] if os.environ.get("PORT") else [PORT, 8001, 8002, 8080]

    for p in ports_to_try:
        try:
            server_address = ("", p)
            httpd = socketserver.ThreadingTCPServer(server_address, InventoryAppHandler)
            actual_port = p
            break
        except OSError:
            if is_server_responding(p):
                print(f"[INFO] Servidor ya activo en http://localhost:{p}. Abriendo navegador...")
                try:
                    if not os.environ.get("PORT") and not os.environ.get("RENDER"):
                        webbrowser.open(f"http://localhost:{p}")
                except Exception:
                    pass
                return
            continue

    if not httpd:
        print(f"[ERROR] No se pudo iniciar el servidor en el puerto {PORT}.")
        print(f"Verifique si otra aplicacion ajena lo esta utilizando.")
        return

    print(f"===============================================================")
    print(f" Sistema de Control de Inventario y Facturacion Multimoneda")
    print(f" Servidor iniciado exitosamente en: http://localhost:{actual_port}")
    print(f" Presione Ctrl + C para detener.")
    print(f"===============================================================")
    
    threading.Thread(target=check_and_update_rates_background, daemon=True).start()
    
    def _open_browser():
        if os.environ.get("PORT") or os.environ.get("RENDER"):
            return # En la nube no se abre navegador grafico
        time.sleep(0.8)
        try:
            webbrowser.open(f"http://localhost:{actual_port}")
        except Exception:
            pass
    threading.Thread(target=_open_browser, daemon=True).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido por el usuario.")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
