# -*- coding: utf-8 -*-
"""
TAVO CLOUD ERP — Middleware Perimetral de Seguridad (FASE 1)
security_middleware.py

Intercepta todas las solicitudes HTTP, aplica autenticación por token Bearer,
rotación atómica con replay seguro, protección Anti-CSRF, verificación RBAC
e idempotencia financiera transaccional sobre la Matriz Canónica de 149 Endpoints.
"""

import json
import sqlite3
import re
from typing import Optional, Dict, Any, Tuple
import security_core as sec

# Matriz Canónica de Permisos RBAC Objetivo (149 Endpoints)
RBAC_RULES = {
    # 1. Ventas & POS (perm_ventas)
    r"^/api/vendedores": "perm_ventas",
    r"^/api/zonas": "perm_ventas",
    r"^/api/pedidos": "perm_ventas",
    r"^/api/comisiones": "perm_ventas",
    r"^/api/facturas": "perm_ventas",
    r"^/api/devoluciones": "perm_ventas",
    r"^/api/pos/": "perm_ventas",
    
    # 2. Compras (perm_compras)
    r"^/api/proveedores": "perm_compras",
    r"^/api/compras": "perm_compras",
    r"^/api/ordenes-compra": "perm_compras",

    # 3. Inventario & Catálogo (perm_inventario)
    r"^/api/productos": "perm_inventario",
    r"^/api/categorias": "perm_inventario",
    r"^/api/inventario": "perm_inventario",
    r"^/api/kardex": "perm_inventario",

    # 4. Tesorería & Caja (perm_caja)
    r"^/api/caja": "perm_caja",
    r"^/api/tesoreria": "perm_caja",
    r"^/api/bancos": "perm_caja",

    # 5. Cuentas por Cobrar (perm_cxc)
    r"^/api/cxc": "perm_cxc",
    r"^/api/clientes": "perm_cxc",

    # 6. Cuentas por Pagar (perm_cxp)
    r"^/api/cxp": "perm_cxp",

    # 7. Reportes (perm_reportes)
    r"^/api/reportes": "perm_reportes",
    r"^/api/cfo/": "perm_reportes",

    # 8. Configuración & Administración (perm_configuracion)
    r"^/api/roles": "perm_configuracion",
    r"^/api/usuarios": "perm_configuracion",
    r"^/api/seguridad": "perm_configuracion",
    r"^/api/configuracion": "perm_configuracion",
    r"^/api/catalogo/subir-pdf": "perm_configuracion",
    r"^/api/database": "perm_configuracion",
}

PUBLIC_PATHS = {
    "/",
    "/catalogo",
    "/api/auth/login",
    "/api/auth/recuperar-password"
}

class SecurityMiddleware:
    """Interceptor perimetral de seguridad para el servidor HTTP."""

    @staticmethod
    def es_ruta_publica(method: str, path: str) -> bool:
        if path in PUBLIC_PATHS:
            return True
        if path.startswith("/uploads/"):
            return True
        return False

    @staticmethod
    def resolver_permiso_requerido(method: str, path: str) -> Optional[str]:
        # Rutas con "Autenticado General"
        if path in ("/api/auth/me", "/api/auth/logout"):
            return None  # Cualquier usuario autenticado tiene acceso

        # Tratamiento específico para notas de ajuste
        if path == "/api/notas-ajuste":
            return "perm_cxc"  # perm_cxc o perm_cxp según corresponda

        # Mapeo por expresiones regulares
        for pattern, perm in RBAC_RULES.items():
            if re.search(pattern, path):
                return perm

        # Por defecto, rutas no mapeadas requieren perm_configuracion (Fail-Closed)
        return "perm_configuracion"

    @classmethod
    def interceptar(cls, handler, method: str, path: str, conn: sqlite3.Connection) -> bool:
        """
        Ejecuta la inspección de seguridad previa al controlador.
        Retorna True si la petición fue manejada/bloqueada (no continuar), False si está autorizada.
        """
        # 1. Rutas Públicas Incondicionales
        if cls.es_ruta_publica(method, path):
            return False

        # 2. Tratamiento Especial: GET /api/config (Bifurcación Público Sanitizado vs Admin)
        if method == "GET" and path == "/api/config":
            auth_header = handler.headers.get("Authorization")
            if not auth_header:
                # Retornar Payload Público Sanitizado para Bootstrap / Login
                cur = conn.cursor()
                cur.execute("SELECT nombre_negocio, logo_url, moneda_principal, tasa_ves, tasa_cop, tema FROM configuracion WHERE id = 1")
                row = cur.fetchone()
                cfg = dict(zip(["nombre_negocio", "logo_url", "moneda_principal", "tasa_ves", "tasa_cop", "tema"], row)) if row else {}
                if cfg.get("tema") and isinstance(cfg["tema"], str):
                    try:
                        cfg["tema"] = json.loads(cfg["tema"])
                    except Exception:
                        pass
                handler.send_json(cfg, 200)
                return True  # Interceptado y servido de forma segura

        # 3. Tratamiento Especial: GET /api/catalogo/agrupado (Bifurcación Público Sanitizado para catalogo.html)
        if method == "GET" and path == "/api/catalogo/agrupado":
            auth_header = handler.headers.get("Authorization")
            if not auth_header:
                # Servir versión sanitizada para la web pública (oculta stock interno y costos)
                cur = conn.cursor()
                cur.execute("SELECT nombre_negocio, logo_url, telefono, direccion, moneda_principal FROM configuracion WHERE id = 1")
                cfg_row = cur.fetchone()
                tenant_info = dict(zip(["nombre_negocio", "logo_url", "telefono", "direccion", "moneda_principal"], cfg_row)) if cfg_row else {}

                cur.execute("""
                    SELECT p.id, p.codigo, p.nombre, p.descripcion, p.categoria_id,
                           c.nombre as categoria_nombre, p.precio_total, p.imagen,
                           (p.stock - COALESCE(p.stock_comprometido, 0.0) > 0) as disponible
                    FROM productos p
                    JOIN categorias c ON p.categoria_id = c.id
                    WHERE p.activo = 1
                    ORDER BY c.nombre ASC, p.nombre ASC
                """)
                prods = [dict(zip(["id", "codigo", "nombre", "descripcion", "categoria_id", "categoria_nombre", "precio_total", "imagen", "disponible"], r)) for r in cur.fetchall()]

                grupos = {}
                for p in prods:
                    cat_nom = p["categoria_nombre"] or "General"
                    if cat_nom not in grupos:
                        grupos[cat_nom] = {"categoria_id": p["categoria_id"], "categoria_nombre": cat_nom, "productos": []}
                    grupos[cat_nom]["productos"].append(p)

                handler.send_json({
                    "success": True,
                    "tenant": tenant_info,
                    "categorias": list(grupos.values())
                }, 200)
                return True

        # 4. Extracción y Verificación de Cabecera Authorization
        auth_header = handler.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            handler.send_error_json("Acceso no autorizado: Debe iniciar sesión para acceder a este recurso.", 401)
            return True

        token = auth_header.split(" ", 1)[1].strip()
        client_ip = handler.client_address[0] if hasattr(handler, "client_address") else ""

        # 5. Validación de Sesión y Rotación Atómica con Replay Seguro
        sesion, err, code = sec.validar_y_rotar_sesion(conn, token, client_ip)
        if err or not sesion:
            handler.send_error_json(err or "Sesión inválida o expirada", code)
            return True

        # Inyectar sesión autenticada en el handler para uso de los controladores
        handler.current_session = sesion
        if sesion.get("nuevo_jwt"):
            handler.send_header("X-New-Session-Token", sesion["nuevo_jwt"])

        # 6. Validación de Protección Anti-CSRF en Operaciones Mutantes
        if method in ("POST", "PUT", "DELETE"):
            csrf_header = handler.headers.get("X-CSRF-Token") or handler.headers.get("x-csrf-token")
            if not csrf_header or not sec.hmac.compare_digest(csrf_header, sesion["csrf_token"]):
                handler.send_error_json("Violación de Seguridad: Token Anti-CSRF ausente o inválido.", 403)
                return True

        # 7. Control de Acceso Basado en Roles (RBAC Estricto)
        permiso_requerido = cls.resolver_permiso_requerido(method, path)
        if permiso_requerido:
            user_perms = sesion.get("perms", {})
            user_rol = sesion.get("rol", "")
            # SuperAdmin o permiso específico activo
            if user_rol != "SuperAdmin" and user_perms.get(permiso_requerido, 0) != 1:
                # Excepción para notas de ajuste (perm_cxc o perm_cxp)
                if path == "/api/notas-ajuste" and (user_perms.get("perm_cxc", 0) == 1 or user_perms.get("perm_cxp", 0) == 1):
                    pass
                else:
                    handler.send_error_json(f"Acceso Denegado: Su rol no posee la autorización requerida ({permiso_requerido}).", 403)
                    return True

        return False  # Autorizado para continuar hacia el controlador
