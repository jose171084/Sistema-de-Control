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
    # 1. Dashboard & Ventas & POS (perm_dashboard / perm_ventas / perm_fuerza_ventas)
    r"^/api/dashboard": "perm_dashboard",
    r"^/api/vendedores": "perm_ventas",
    r"^/api/zonas": "perm_ventas",
    r"^/api/pedidos": "perm_ventas",
    r"^/api/comisiones": "perm_ventas",
    r"^/api/facturas": "perm_ventas",
    r"^/api/devoluciones-compras": "perm_compras",
    r"^/api/devoluciones": "perm_ventas",
    r"^/api/pos/": "perm_ventas",
    
    # 2. Compras (perm_compras)
    r"^/api/proveedores": "perm_compras",
    r"^/api/compras": "perm_compras",
    r"^/api/ordenes-compra": "perm_compras",

    # 3. Inventario & Catálogo & IA Inventario (perm_inventario)
    r"^/api/productos": "perm_inventario",
    r"^/api/categorias": "perm_inventario",
    r"^/api/inventario": "perm_inventario",
    r"^/api/kardex": "perm_inventario",
    r"^/api/ia/inventario": "perm_inventario",

    # 4. Tesorería & Caja & Gastos (perm_pos operativo o reportes/config)
    r"^/api/caja": "perm_pos",
    r"^/api/tesoreria": "perm_pos",
    r"^/api/bancos": "perm_pos",
    r"^/api/gastos": "perm_pos",

    # 5. Cuentas por Cobrar & Clientes & Pagos/Anticipos (perm_cxc / perm_clientes)
    r"^/api/cxc": "perm_cxc",
    r"^/api/clientes": "perm_cxc",
    r"^/api/anticipos": "perm_cxc",
    r"^/api/pagos": "perm_cxc",

    # 6. Cuentas por Pagar (perm_cxp)
    r"^/api/cxp": "perm_cxp",

    # 7. Reportes & CFO Copilot IA (perm_reportes)
    r"^/api/reportes": "perm_reportes",
    r"^/api/cfo/": "perm_reportes",
    r"^/api/ia/copilot": "perm_reportes",

    # 8. Configuración & Administración (perm_configuracion)
    r"^/api/roles": "perm_configuracion",
    r"^/api/usuarios": "perm_configuracion",
    r"^/api/seguridad": "perm_configuracion",
    r"^/api/configuracion": "perm_configuracion",
    r"^/api/formatos": "perm_configuracion",
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
        # Rutas con "Autenticado General" (configuración de tasas/impresión de solo lectura necesaria al iniciar sesión)
        if path in ("/api/auth/me", "/api/auth/logout"):
            return None  # Cualquier usuario autenticado tiene acceso
        if method == "GET" and path in ("/api/config", "/api/configuracion/impresion", "/api/formatos", "/api/tasas/oficiales"):
            return None

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
            tok_cfg, tok_src = sec.extraer_jwt_de_headers(handler.headers)
            if not tok_cfg or (tok_src == "cookie" and not sec.decodificar_y_verificar_jwt(tok_cfg)):
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
            tok_cat, tok_src = sec.extraer_jwt_de_headers(handler.headers)
            if not tok_cat or (tok_src == "cookie" and not sec.decodificar_y_verificar_jwt(tok_cat)):
                # Servir versión sanitizada para la web pública (oculta stock interno y costos)
                cur = conn.cursor()
                cur.execute("SELECT nombre_negocio, logo_url, telefono, direccion, moneda_principal FROM configuracion WHERE id = 1")
                cfg_row = cur.fetchone()
                tenant_info = dict(zip(["nombre_negocio", "logo_url", "telefono", "direccion", "moneda_principal"], cfg_row)) if cfg_row else {}

                cur.execute("""
                    SELECT p.id, p.codigo, p.nombre, p.descripcion, p.categoria_id,
                           COALESCE(c.nombre, 'General') as categoria_nombre, p.precio_total, p.imagen,
                           (p.stock - COALESCE(p.stock_comprometido, 0.0) > 0) as disponible
                    FROM productos p
                    LEFT JOIN categorias c ON p.categoria_id = c.id
                    WHERE COALESCE(p.activo, 1) = 1
                    ORDER BY categoria_nombre ASC, p.nombre ASC
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

        # 4. Extracción y Verificación de Credencial (Bearer o Cookie HttpOnly)
        token, _token_source = sec.extraer_jwt_de_headers(handler.headers)
        if not token:
            handler.send_error_json("Acceso no autorizado: Debe iniciar sesión para acceder a este recurso.", 401)
            return True

        client_ip = handler.client_address[0] if hasattr(handler, "client_address") else ""

        # 5. Validación de Sesión y Rotación Atómica con Replay Seguro
        sesion, err, code = sec.validar_y_rotar_sesion(conn, token, client_ip)
        if err or not sesion:
            handler.send_error_json(err or "Sesión inválida o expirada", code)
            return True

        # Inyectar sesión autenticada en el handler para uso de los controladores
        handler.current_session = sesion
        if sesion.get("nuevo_jwt"):
            handler._pending_new_jwt = sesion["nuevo_jwt"]
            if not hasattr(handler, "send_response"):
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
            # Bloqueo de mutaciones administrativas de Fuerza de Ventas para roles con facturar_directo=0
            if (
                method in ("POST", "PUT", "DELETE")
                and re.search(r"^/api/(vendedores|zonas|comisiones)", path)
                and user_rol != "SuperAdmin"
                and user_perms.get("facturar_directo", 1) == 0
                and user_perms.get("perm_configuracion", 0) != 1
            ):
                handler.send_error_json("Acceso Denegado: Solo Administración puede crear o modificar vendedores, zonas o liquidar comisiones.", 403)
                return True
            # Excepción explícita Caja/Tesorería/Gastos: requiere caja/facturación directa, reportes o configuración (bloquea vendedores facturar_directo=0)
            es_ruta_caja_tes = re.search(r"^/api/(caja|tesoreria|bancos|gastos)", path) is not None
            if es_ruta_caja_tes and user_rol != "SuperAdmin":
                autorizado_caja = (
                    user_perms.get("perm_caja", 0) == 1
                    or user_perms.get("perm_configuracion", 0) == 1
                    or (user_perms.get("perm_pos", 0) == 1 and user_perms.get("facturar_directo", 1) == 1)
                    or (path.startswith("/api/tesoreria") and user_perms.get("perm_reportes", 0) == 1)
                    or (path.startswith("/api/gastos") and user_perms.get("perm_reportes", 0) == 1)
                )
                if not autorizado_caja:
                    handler.send_error_json("Acceso Denegado: Su rol no posee autorización para operar Caja/Tesorería.", 403)
                    return True
            # SuperAdmin o permiso específico activo
            elif user_rol != "SuperAdmin" and user_perms.get(permiso_requerido, 0) != 1:
                # Excepción para notas de ajuste (perm_cxc o perm_cxp)
                if path == "/api/notas-ajuste" and (user_perms.get("perm_cxc", 0) == 1 or user_perms.get("perm_cxp", 0) == 1):
                    pass
                # Gestión/selección de clientes: autorizada para cartera clientes, ventas, fuerza de ventas o CxC
                elif re.search(r"^/api/clientes", path) and (
                    user_perms.get("perm_clientes", 0) == 1
                    or user_perms.get("perm_ventas", 0) == 1
                    or user_perms.get("perm_fuerza_ventas", 0) == 1
                    or user_perms.get("perm_cxc", 0) == 1
                ):
                    pass
                # Consulta de catálogo (solo lectura GET) para módulos comerciales de POS, Pedidos, Fuerza de Ventas o Compras
                elif method == "GET" and (
                    re.search(r"^/api/productos", path)
                    or re.search(r"^/api/categorias", path)
                    or path == "/api/catalogo/agrupado"
                ) and (
                    user_perms.get("perm_ventas", 0) == 1
                    or user_perms.get("perm_pos", 0) == 1
                    or user_perms.get("perm_fuerza_ventas", 0) == 1
                    or user_perms.get("perm_compras", 0) == 1
                ):
                    pass
                # Pedidos / Vendedores / Zonas / Comisiones: autorizados por perm_ventas, perm_fuerza_ventas o perm_pos
                elif (
                    re.search(r"^/api/(pedidos|vendedores|comisiones)", path)
                    or (method == "GET" and re.search(r"^/api/zonas", path))
                ) and (
                    user_perms.get("perm_fuerza_ventas", 0) == 1
                    or user_perms.get("perm_pos", 0) == 1
                ):
                    pass
                # Pagos y Anticipos: autorizados por perm_cxc, perm_cxp (pagos) o caja/facturación directa
                elif re.search(r"^/api/pagos", path) and (
                    user_perms.get("perm_cxc", 0) == 1
                    or user_perms.get("perm_cxp", 0) == 1
                    or (user_perms.get("perm_pos", 0) == 1 and user_perms.get("facturar_directo", 1) == 1)
                ):
                    pass
                elif re.search(r"^/api/anticipos", path) and (
                    user_perms.get("perm_cxc", 0) == 1
                    or (user_perms.get("perm_pos", 0) == 1 and user_perms.get("facturar_directo", 1) == 1)
                ):
                    pass
                else:
                    handler.send_error_json(f"Acceso Denegado: Su rol no posee la autorización requerida ({permiso_requerido}).", 403)
                    return True

        return False  # Autorizado para continuar hacia el controlador
