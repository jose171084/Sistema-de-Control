"""
database.py - Módulo de base de datos SQLite para el Sistema de Inventario y Facturación.
Utiliza únicamente la librería estándar de Python (sqlite3).
"""

import sqlite3
import os
import json
import urllib.request
import urllib.error
import threading
import time
import shutil
import hashlib
import hmac
import base64
import tempfile
import logging
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from datetime import datetime, timedelta

logger = logging.getLogger("tavo.db")
if not logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s"))
    logger.addHandler(_handler)
    logger.setLevel(logging.INFO)

DEFAULT_DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "inventario.db")
DB_LIMPIA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "inventario_limpia.db")

def to_decimal(val, default="0") -> Decimal:
    """Convierte cualquier valor numérico a Decimal exacto sin errores de coma flotante."""
    if isinstance(val, Decimal):
        return val
    if val is None or val == "":
        return Decimal(default)
    try:
        return Decimal(str(val))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal(default)

def d_round(val, decimals: int = 2) -> float:
    """Redondeo contable estandarizado ROUND_HALF_UP sobre Decimal."""
    quant = Decimal("1") if decimals <= 0 else Decimal("1." + ("0" * decimals))
    return float(to_decimal(val).quantize(quant, rounding=ROUND_HALF_UP))


# ==============================================================================
# MÓDULO DE CRIPTOGRAFÍA, TOKENS DE SESIÓN Y SEGURIDAD RBAC (OWASP COMPLIANT)
# ==============================================================================
_DEFAULT_DEV_SESSION_SECRET = "TAVO_CLOUD_SECRET_2026_SUPER_SECURE_KEY_@#$%"
SESSION_SECRET = os.environ.get("SESSION_SECRET", _DEFAULT_DEV_SESSION_SECRET)
if SESSION_SECRET == _DEFAULT_DEV_SESSION_SECRET and (os.environ.get("RENDER") or os.environ.get("TAVO_ENV") == "production"):
    if os.environ.get("TAVO_STRICT_SECRETS") == "1":
        raise RuntimeError("CONFIGURACIÓN CRÍTICA FALTANTE: Defina SESSION_SECRET en variables de entorno de producción.")
    logger.warning("SESSION_SECRET usa valor por defecto en producción. Configure la variable de entorno SESSION_SECRET.")

def generar_salt() -> str:
    """Genera un salt criptográfico de 16 bytes aleatorios en formato hexadecimal."""
    return os.urandom(16).hex()

def hash_password(password: str, salt: str) -> str:
    """Genera hash robusto con PBKDF2-HMAC-SHA256 (100.000 iteraciones)."""
    pwd_bytes = (password or '').encode('utf-8')
    salt_bytes = (salt or '').encode('utf-8')
    key = hashlib.pbkdf2_hmac('sha256', pwd_bytes, salt_bytes, 100000)
    return key.hex()

def verificar_password(password: str, salt: str, password_hash: str) -> bool:
    """Verifica en tiempo constante la contraseña suministrada contra el hash almacenado."""
    if not password or not salt or not password_hash:
        return False
    expected = hash_password(password, salt)
    return hmac.compare_digest(expected, password_hash)

def generar_token_sesion(usuario_id: int, username: str, rol_nombre: str, permisos: dict = None) -> str:
    """Genera un token de sesión firmado JWT estándar Fase 1."""
    try:
        import security_core as sec
        import secrets
        jti = secrets.token_hex(32)
        return sec.emitir_jwt(jti=jti, usuario_id=usuario_id, instance_id=1, rol=rol_nombre, perms=permisos or {}, duracion_segundos=1800)
    except Exception:
        expira = int(time.time()) + 1800
        payload = {"uid": usuario_id, "usr": username, "rol": rol_nombre, "perm": permisos or {}, "exp": expira}
        raw = json.dumps(payload, separators=(',', ':'))
        b64 = base64.urlsafe_b64encode(raw.encode('utf-8')).decode('ascii').rstrip('=')
        sig = hmac.new(SESSION_SECRET.encode('utf-8'), b64.encode('ascii'), hashlib.sha256).hexdigest()
        return f"{b64}.{sig}"

def verificar_token_sesion(token: str):
    """Verifica la firma y vigencia del token de sesión. Retorna el payload decodificado o None."""
    if not token or '.' not in token:
        return None
    parts = token.split('.', 1)
    if len(parts) != 2:
        return None
    b64_payload, sig = parts
    expected_sig = hmac.new(SESSION_SECRET.encode('utf-8'), b64_payload.encode('ascii'), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected_sig):
        return None
    rem = len(b64_payload) % 4
    if rem > 0:
        b64_payload += '=' * (4 - rem)
    try:
        raw = base64.urlsafe_b64decode(b64_payload.encode('ascii')).decode('utf-8')
        payload = json.loads(raw)
        if payload.get("exp", 0) < int(time.time()):
            return None  # Token expirado
        return payload
    except Exception:
        return None

def obtener_permisos_usuario(usuario_id: int, conn=None):
    """Obtiene el perfil y conjunto completo de permisos granulares del usuario."""
    close_at_end = False
    if conn is None:
        conn = get_connection()
        close_at_end = True
    try:
        c = conn.cursor()
        c.execute("""
            SELECT u.id, u.username, u.nombre_completo, u.activo, u.rol_id,
                   r.nombre as rol_nombre, r.descripcion as rol_descripcion,
                   r.perm_dashboard, r.perm_pos, r.perm_inventario, r.perm_compras,
                   r.perm_ventas, r.perm_cxc, r.perm_cxp, r.perm_clientes,
                   r.perm_reportes, r.perm_configuracion, r.perm_fuerza_ventas,
                   r.facturar_negativo, r.autorizar_devoluciones, r.modificar_precios,
                   r.ver_costos_utilidad, r.anular_transacciones,
                   COALESCE(r.facturar_directo, 1) as facturar_directo
            FROM usuarios u
            JOIN roles r ON u.rol_id = r.id
            WHERE u.id = ?
        """, (usuario_id,))
        row = c.fetchone()
        if not row:
            return None
        return dict(row)
    except Exception as e:
        print(f"[RBAC ERROR] No se pudieron obtener permisos: {e}")
        return None
    finally:
        if close_at_end:
            conn.close()

def registrar_auditoria(usuario_id: int, username: str, accion: str, modulo: str, detalles: str = "", ip: str = "", conn=None):
    """Registra evento en la bitácora inmutable de auditoría de seguridad."""
    close_at_end = False
    if conn is None:
        conn = get_connection()
        close_at_end = True
    try:
        c = conn.cursor()
        c.execute("""
            INSERT INTO auditoria_seguridad (usuario_id, username, accion, modulo, detalles, ip)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (usuario_id, username, accion, modulo, detalles, ip))
        conn.commit()
    except Exception as e:
        print(f"[AUDITORIA ERROR] No se pudo registrar log: {e}")
    finally:
        if close_at_end:
            conn.close()

def resolver_db_path():
    """
    Detección y resolución inteligente de almacenamiento persistente en la nube / local:
    1. Si se define PERSISTENT_DATA_PATH o DATA_DIR (o carpetas montadas en Render como /data o /var/data).
    2. Si existe un disco montado y no contiene inventario.db, inicializa clonando la base del repositorio.
    3. Si no hay disco externo montado, opera sobre DEFAULT_DB_PATH local de forma segura.
    """
    custom_path = os.environ.get("DB_PATH") or os.environ.get("SQLITE_DB_PATH")
    if custom_path:
        custom_abs = os.path.abspath(custom_path)
        os.makedirs(os.path.dirname(custom_abs), exist_ok=True)
        print(f"[ALMACENAMIENTO] Operando sobre base de datos personalizada: {custom_abs}")
        return custom_abs

    candidate_dirs = [
        os.environ.get("PERSISTENT_DATA_PATH"),
        os.environ.get("DATA_DIR"),
        "/data",
        "/var/data",
        "/mnt/data"
    ]
    for c_dir in candidate_dirs:
        if c_dir and os.path.exists(c_dir) and os.path.isdir(c_dir):
            try:
                test_f = os.path.join(c_dir, ".test_write")
                with open(test_f, "w") as tf:
                    tf.write("ok")
                os.remove(test_f)
                target = os.path.join(c_dir, "inventario.db")
                if not os.path.exists(target) and os.path.exists(DEFAULT_DB_PATH):
                    shutil.copy2(DEFAULT_DB_PATH, target)
                    print(f"[ALMACENAMIENTO PERSISTENTE] Clonada base inicial hacia disco persistente: {target}")
                print(f"[ALMACENAMIENTO PERSISTENTE] Operando sobre disco persistente: {target}")
                return target
            except Exception as e:
                print(f"[ALMACENAMIENTO PERSISTENTE] Directorio no utilizable ({c_dir}): {e}")
    return DEFAULT_DB_PATH

DB_PATH = resolver_db_path()

# ========================================================
# PERSISTENCIA EN LA NUBE (SUPABASE STORAGE AUTO-SYNC RESILIENTE)
# ========================================================
_sync_timer = None
_sync_lock = threading.Lock()
_last_cloud_sync_status = {
    "ok": False,
    "timestamp": None,
    "error": None,
    "bytes": 0,
    "modo": "local_disk"
}

def get_supabase_config():
    """
    Busca configuración de Supabase Storage con tolerancia insensible a mayúsculas/minúsculas
    y auto-limpieza de sufijos (/rest/v1) en URLs.
    """
    # Diccionario con claves en mayúsculas para tolerancia total (Linux case-insensitive)
    env_upper = {k.upper(): str(v).strip() for k, v in os.environ.items() if v is not None}

    url = (
        env_upper.get("SUPABASE_URL") or
        env_upper.get("SUPABASE_PROJECT_URL") or
        env_upper.get("NEXT_PUBLIC_SUPABASE_URL") or
        env_upper.get("SUPABASE_ENDPOINT") or
        ""
    ).strip()

    # Sanitizar URL: eliminar sufijo de REST API si el usuario lo incluyó por error
    if url:
        if "/rest" in url:
            url = url.split("/rest")[0]
        url = url.rstrip("/")

    key = (
        env_upper.get("SUPABASE_KEY") or
        env_upper.get("SUPABASE_SERVICE_ROLE_KEY") or
        env_upper.get("SUPABASE_SERVICE_KEY") or
        env_upper.get("SUPABASE_ANON_KEY") or
        env_upper.get("SUPABASE_API_KEY") or
        env_upper.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or
        ""
    ).strip()

    bucket = (
        env_upper.get("SUPABASE_BUCKET") or
        env_upper.get("SUPABASE_STORAGE_BUCKET") or
        "database"
    ).strip()

    filename = (
        env_upper.get("SUPABASE_FILENAME") or
        "inventario.db"
    ).strip()

    if url and key:
        return {"url": url, "key": key, "bucket": bucket, "filename": filename}
    return None

def ensure_supabase_bucket_exists(cfg):
    """Intenta crear el bucket de Supabase Storage automáticamente si no existe (requiere service_role/secret key)."""
    if not cfg:
        return False
    try:
        url_create = f"{cfg['url']}/storage/v1/bucket"
        payload = json.dumps({
            "id": cfg["bucket"],
            "name": cfg["bucket"],
            "public": True
        }).encode("utf-8")
        req = urllib.request.Request(
            url_create,
            data=payload,
            headers={
                "apikey": cfg["key"],
                "Authorization": f"Bearer {cfg['key']}",
                "Content-Type": "application/json",
                "User-Agent": "SistemaInventario/1.0"
            },
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=8):
            return True
    except urllib.error.HTTPError as e:
        if e.code in (400, 409):  # Ya existe
            return True
        return False
    except Exception:
        return False

def test_supabase_connection():
    """Realiza una prueba activa de lectura/escritura en Supabase Storage y retorna diagnóstico detallado."""
    cfg = get_supabase_config()
    if not cfg:
        return {
            "ok": False,
            "conectado": False,
            "success": False,
            "error": "Variables de entorno de Supabase no configuradas en Render.",
            "detalle": "Debe agregar SUPABASE_URL y SUPABASE_KEY en la pestaña Environment de Render."
        }

    is_publishable = cfg["key"].startswith("sb_publishable_")

    # Probar acceso al bucket u objeto
    url_test = f"{cfg['url']}/storage/v1/bucket/{cfg['bucket']}"
    req = urllib.request.Request(
        url_test,
        headers={
            "apikey": cfg["key"],
            "Authorization": f"Bearer {cfg['key']}",
            "User-Agent": "SistemaInventario/1.0"
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return {
                "ok": True,
                "conectado": True,
                "success": True,
                "mensaje": f"Conexión exitosa a Supabase Storage. Bucket '{cfg['bucket']}' activo y accesible.",
                "url": cfg["url"],
                "bucket": cfg["bucket"]
            }
    except urllib.error.HTTPError as e:
        # Si el bucket no existe (404/400), intentar crearlo automáticamente
        if e.code in (404, 400):
            if ensure_supabase_bucket_exists(cfg):
                return {
                    "ok": True,
                    "conectado": True,
                    "success": True,
                    "mensaje": f"Conexión exitosa a Supabase. El bucket '{cfg['bucket']}' fue creado y vinculado automáticamente.",
                    "url": cfg["url"],
                    "bucket": cfg["bucket"]
                }

        if e.code in (401, 403):
            # Probar si el objeto existe directamente con autenticación
            url_obj = f"{cfg['url']}/storage/v1/object/authenticated/{cfg['bucket']}/{cfg['filename']}"
            req2 = urllib.request.Request(url_obj, headers={"apikey": cfg["key"], "Authorization": f"Bearer {cfg['key']}"})
            try:
                with urllib.request.urlopen(req2, timeout=8):
                    return {
                        "ok": True,
                        "conectado": True,
                        "success": True,
                        "mensaje": f"Conexión exitosa a Supabase con archivo '{cfg['filename']}' verificado.",
                        "url": cfg["url"],
                        "bucket": cfg["bucket"]
                    }
            except urllib.error.HTTPError as e2:
                if e2.code == 404:
                    return {
                        "ok": True,
                        "conectado": True,
                        "success": True,
                        "mensaje": f"Conexión autenticada OK a Supabase. El archivo '{cfg['filename']}' se creará automáticamente en la primera sincronización.",
                        "url": cfg["url"],
                        "bucket": cfg["bucket"]
                    }

        detalle_msg = f"Verifique que el bucket '{cfg['bucket']}' esté creado en Supabase Storage."
        if is_publishable:
            detalle_msg = "Está utilizando una Publishable Key ('sb_publishable_...'). Para el backend en Render debe configurar una Secret Key (+ New secret key) o la clave service_role (View legacy API keys) y asegurarse de crear el bucket 'database' en Storage."

        return {
            "ok": False,
            "conectado": False,
            "success": False,
            "error": f"Error HTTP {e.code}: {e.reason}",
            "detalle": detalle_msg,
            "url": cfg["url"],
            "bucket": cfg["bucket"]
        }
    except Exception as e:
        return {
            "ok": False,
            "conectado": False,
            "success": False,
            "error": f"Error de conexión: {str(e)}",
            "url": cfg["url"],
            "bucket": cfg["bucket"]
        }

def sync_from_supabase_storage():
    """Descarga inventario.db desde Supabase Storage si está configurado (persistencia en Render)."""
    global _last_cloud_sync_status
    cfg = get_supabase_config()
    if not cfg:
        return False

    buckets_to_try = [cfg['bucket']]
    for b_alt in ["database", "inventario", "backups", "public"]:
        if b_alt not in buckets_to_try:
            buckets_to_try.append(b_alt)

    had_transient_error = False
    for b in buckets_to_try:
        endpoints = [
            f"{cfg['url']}/storage/v1/object/authenticated/{b}/{cfg['filename']}",
            f"{cfg['url']}/storage/v1/object/{b}/{cfg['filename']}"
        ]

        for url in endpoints:
            req = urllib.request.Request(
                url,
                headers={
                    "apikey": cfg["key"],
                    "Authorization": f"Bearer {cfg['key']}",
                    "User-Agent": "SistemaInventario/1.0"
                }
            )
            try:
                print(f"[PERSISTENCIA NUBE] Consultando base persistente en Supabase Storage ({b}/{cfg['filename']})...")
                with urllib.request.urlopen(req, timeout=12) as resp:
                    data = resp.read()
                    if data and len(data) > 100:
                        # Respaldo de seguridad local antes de sobrescribir
                        if os.path.exists(DB_PATH):
                            shutil.copy2(DB_PATH, DB_PATH + ".pre_cloud_sync.bak")
                        cleanup_wal_sidecars(DB_PATH)
                        with open(DB_PATH, "wb") as f:
                            f.write(data)
                        _wal_configured_paths.discard(DB_PATH)
                        print(f"[PERSISTENCIA NUBE] Base de datos persistente descargada exitosamente ({len(data)} bytes) desde bucket '{b}'.")
                        _last_cloud_sync_status = {
                            "ok": True,
                            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                            "error": None,
                            "bytes": len(data),
                            "bucket": b,
                            "modo": "supabase_storage"
                        }
                        return True
            except urllib.error.HTTPError as e:
                if e.code in (400, 404):
                    continue
                else:
                    had_transient_error = True
                    print(f"[PERSISTENCIA NUBE] Error HTTP {e.code} en {url}: {e.reason}")
            except Exception as e:
                had_transient_error = True
                print(f"[PERSISTENCIA NUBE] Error de conexión a {url}: {str(e)}")

    if had_transient_error:
        print("[PERSISTENCIA NUBE] Error de red/servidor al consultar Supabase. Se omite sobrescritura automática para proteger datos en la nube.")
        return False

    print(f"[PERSISTENCIA NUBE] Aún no existe '{cfg['filename']}' en Supabase Storage. Subiendo base actual como imagen persistente...")
    sync_to_supabase_storage()
    return False

def sync_to_supabase_storage():
    """Sube un snapshot consistente de inventario.db a Supabase Storage con x-upsert."""
    global _last_cloud_sync_status
    cfg = get_supabase_config()
    if not cfg or not os.path.exists(DB_PATH):
        return False

    try:
        data = None
        for _ in range(3):
            try:
                data = export_consistent_db_bytes(DB_PATH)
                if data and len(data) >= 100:
                    break
            except Exception:
                time.sleep(0.1)

        if not data or len(data) < 100:
            print("[PERSISTENCIA NUBE] Error: archivo de base de datos vacío o ilegible.")
            return False

        buckets_to_try = [cfg['bucket']]
        for b_alt in ["database", "inventario"]:
            if b_alt not in buckets_to_try:
                buckets_to_try.append(b_alt)

        exito = False
        ultimo_error = None

        for b in buckets_to_try:
            url = f"{cfg['url']}/storage/v1/object/{b}/{cfg['filename']}"
            req = urllib.request.Request(
                url,
                data=data,
                headers={
                    "apikey": cfg["key"],
                    "Authorization": f"Bearer {cfg['key']}",
                    "x-upsert": "true",
                    "Content-Type": "application/x-sqlite3",
                    "User-Agent": "SistemaInventario/1.0"
                },
                method="POST"
            )
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    print(f"[PERSISTENCIA NUBE] Base de datos guardada en Supabase Storage (bucket '{b}', {len(data)} bytes).")
                    _last_cloud_sync_status = {
                        "ok": True,
                        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                        "error": None,
                        "bytes": len(data),
                        "bucket": b,
                        "modo": "supabase_storage"
                    }
                    exito = True
                    break
            except urllib.error.HTTPError as e:
                ultimo_error = f"HTTP {e.code}: {e.reason}"
                if e.code == 404:
                    continue
                else:
                    break
            except Exception as e:
                ultimo_error = str(e)
                break

        if not exito:
            _last_cloud_sync_status = {
                "ok": False,
                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "error": ultimo_error,
                "bytes": len(data) if data else 0,
                "bucket": cfg['bucket'],
                "modo": "error_sincronizacion"
            }
            print(f"[PERSISTENCIA NUBE] Fallo al sincronizar con Supabase Storage: {ultimo_error}")
            return False

        return True
    except Exception as e:
        print(f"[PERSISTENCIA NUBE] Error general al sincronizar: {str(e)}")
        return False

def trigger_cloud_sync_async():
    """Ejecuta sincronización en segundo plano de manera inmediata sin bloquear la transacción HTTP."""
    if not get_supabase_config():
        return
    t = threading.Thread(target=sync_to_supabase_storage, daemon=True)
    t.start()

def schedule_cloud_sync():
    """Programa o despacha sincronización inmediata/diferida hacia la nube."""
    trigger_cloud_sync_async()

_wal_configured_paths = set()
_wal_init_lock = threading.Lock()

def cleanup_wal_sidecars(db_path=None):
    """Elimina archivos residuales -wal y -shm antes de sobrescribir físicamente la BD."""
    target = db_path or DB_PATH
    _wal_configured_paths.discard(target)
    for suffix in ("-wal", "-shm", "-journal"):
        sidecar = target + suffix
        if os.path.exists(sidecar):
            try:
                os.remove(sidecar)
            except Exception:
                pass

def export_consistent_db_bytes(db_path=None) -> bytes:
    """Genera un snapshot binario atómico y consistente (incluyendo frames WAL confirmados)."""
    target = db_path or DB_PATH
    if not os.path.exists(target):
        raise FileNotFoundError(f"Base de datos no encontrada: {target}")
    fd, tmp_path = tempfile.mkstemp(prefix="tavo_snap_", suffix=".db")
    os.close(fd)
    src_conn = None
    dst_conn = None
    try:
        src_conn = sqlite3.connect(target, timeout=30.0)
        dst_conn = sqlite3.connect(tmp_path)
        src_conn.backup(dst_conn)
        dst_conn.commit()
        dst_conn.close()
        dst_conn = None
        src_conn.close()
        src_conn = None
        with open(tmp_path, "rb") as f:
            return f.read()
    finally:
        if dst_conn is not None:
            try:
                dst_conn.close()
            except Exception:
                pass
        if src_conn is not None:
            try:
                src_conn.close()
            except Exception:
                pass
        for suffix in ("", "-wal", "-shm", "-journal"):
            p = tmp_path + suffix
            if os.path.exists(p):
                try:
                    os.remove(p)
                except Exception:
                    pass

class MonitoredConnection(sqlite3.Connection):
    """Conexión SQLite que intercepta commit() para auto-guardar en la nube sin bloquear peticiones."""
    def commit(self):
        super().commit()
        trigger_cloud_sync_async()

def get_connection():
    conn = sqlite3.connect(DB_PATH, timeout=30.0, factory=MonitoredConnection)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    if DB_PATH not in _wal_configured_paths:
        with _wal_init_lock:
            if DB_PATH not in _wal_configured_paths:
                try:
                    conn.execute("PRAGMA journal_mode = WAL")
                    conn.execute("PRAGMA synchronous = NORMAL")
                    _wal_configured_paths.add(DB_PATH)
                except sqlite3.OperationalError:
                    pass
    return conn

def auditar_y_migrar_db(conn=None, cursor=None):
    """
    Auditoría profunda y migración automática de la base de datos SQLite.
    Garantiza:
    1. Integridad física (PRAGMA integrity_check).
    2. Integridad referencial (PRAGMA foreign_key_check).
    3. Normalización y migración preventiva de columnas en todas las tablas existentes
       (evitando errores como 'table facturas has no column named total_usd').
    4. Sincronización bidireccional de valores (total_usd <-> total, estado, fechas).
    """
    should_close = False
    if conn is None:
        conn = get_connection()
        should_close = True
    if cursor is None:
        cursor = conn.cursor()

    reporte = {
        "estado": "saludable",
        "integridad_fisica": "OK",
        "claves_foraneas": "OK",
        "migraciones_aplicadas": [],
        "tablas": {}
    }

    # 1. Integridad física
    try:
        cursor.execute("PRAGMA integrity_check")
        rows = cursor.fetchall()
        if rows and rows[0][0].lower() != "ok":
            reporte["integridad_fisica"] = [r[0] for r in rows]
            reporte["estado"] = "advertencia_integridad"
    except Exception as e:
        reporte["integridad_fisica"] = str(e)

    # 2. Integridad referencial
    try:
        cursor.execute("PRAGMA foreign_key_check")
        fk_errs = cursor.fetchall()
        if fk_errs:
            reporte["claves_foraneas"] = [list(r) for r in fk_errs]
            reporte["estado"] = "advertencia_fk"
    except Exception as e:
        reporte["claves_foraneas"] = str(e)

    def col_exists(table, col):
        try:
            cursor.execute(f"PRAGMA table_info({table})")
            return any(r[1].lower() == col.lower() for r in cursor.fetchall())
        except Exception:
            return False

    def add_col_if_missing(table, col, col_def):
        if not col_exists(table, col):
            try:
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN {col} {col_def}")
                reporte["migraciones_aplicadas"].append(f"{table}.{col}")
                print(f"[MIGRACIÓN AUTO] Columna '{col}' agregada a tabla '{table}'.")
            except Exception as e:
                print(f"[MIGRACIÓN AVISO] No se pudo agregar {col} a {table}: {e}")

    # ========================================================
    # MIGRACIONES PREVENTIVAS Y CORRECTIVAS POR TABLA
    # ========================================================

    # 1. FACTURAS (Resuelve error total_usd, estado, saldos y notas)
    add_col_if_missing("facturas", "total_usd", "REAL DEFAULT 0.0")
    add_col_if_missing("facturas", "total", "REAL DEFAULT 0.0")
    add_col_if_missing("facturas", "estado", "TEXT DEFAULT 'pagada'")
    add_col_if_missing("facturas", "tipo_venta", "TEXT DEFAULT 'contado'")
    add_col_if_missing("facturas", "fecha_vencimiento", "TEXT")
    add_col_if_missing("facturas", "saldo_pendiente", "REAL DEFAULT 0.0")
    add_col_if_missing("facturas", "notas", "TEXT")
    add_col_if_missing("facturas", "vendedor_id", "INTEGER")
    add_col_if_missing("facturas", "comision_porcentaje", "REAL DEFAULT 0.0")
    add_col_if_missing("facturas", "comision_monto_usd", "REAL DEFAULT 0.0")
    add_col_if_missing("facturas", "comision_estado", "TEXT DEFAULT 'PENDIENTE'")
    add_col_if_missing("facturas", "usuario_id", "INTEGER DEFAULT 1")
    add_col_if_missing("roles", "facturar_directo", "INTEGER DEFAULT 1")
    try:
        cursor.execute("UPDATE roles SET facturar_directo = 0 WHERE nombre = 'Vendedor Comercial' AND es_sistema = 1")
        cursor.execute("UPDATE roles SET facturar_directo = 0 WHERE nombre = 'Almacenista / Inventario' AND es_sistema = 1")
    except Exception:
        pass

        # 13.5 GESTION DE TERRITORIOS Y ZONAS COMERCIALES (ERP)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS zonas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER DEFAULT 1,
        nombre TEXT NOT NULL,
        descripcion TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_zonas_active ON zonas(is_active)")
    add_col_if_missing("clientes", "zona_id", "INTEGER REFERENCES zonas(id)")
    add_col_if_missing("clientes", "vendedor_id", "INTEGER REFERENCES vendedores(id)")
    add_col_if_missing("productos", "stock_comprometido", "REAL DEFAULT 0.0")
    add_col_if_missing("pedido_items", "cantidad_aprobada", "REAL")
    add_col_if_missing("pedidos", "fecha_vencimiento", "TIMESTAMP")

    # 14. TABLAS DE PEDIDOS Y PREVENTAS (FUERZA DE VENTAS CON AUTORIZACIÓN)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS pedidos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_pedido TEXT UNIQUE NOT NULL,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        cliente_id INTEGER NOT NULL,
        vendedor_id INTEGER,
        usuario_id INTEGER,
        subtotal REAL DEFAULT 0.0,
        iva_porcentaje REAL DEFAULT 0.0,
        iva_total REAL DEFAULT 0.0,
        total_usd REAL DEFAULT 0.0,
        tasa_ves REAL DEFAULT 1.0,
        tasa_cop REAL DEFAULT 1.0,
        condicion_pago TEXT DEFAULT 'contado',
        dias_credito INTEGER DEFAULT 0,
        estado TEXT DEFAULT 'PENDIENTE' CHECK(estado IN ('PENDIENTE', 'APROBADO', 'FACTURADO', 'RECHAZADO', 'VENCIDO')),
        factura_id INTEGER,
        fecha_aprobacion TIMESTAMP,
        aprobado_por_usuario_id INTEGER,
        motivo_rechazo TEXT,
        notas TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cliente_id) REFERENCES clientes(id),
        FOREIGN KEY (vendedor_id) REFERENCES vendedores(id),
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
        FOREIGN KEY (factura_id) REFERENCES facturas(id)
    )
    ''')
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS pedido_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pedido_id INTEGER NOT NULL,
        producto_id INTEGER NOT NULL,
        cantidad REAL NOT NULL,
        precio_unitario REAL NOT NULL,
        subtotal REAL NOT NULL,
        FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
        FOREIGN KEY (producto_id) REFERENCES productos(id)
    )
    ''')
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos(estado, fecha DESC)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pedidos_vendedor ON pedidos(vendedor_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pedidos_cliente ON pedidos(cliente_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pedido_items_pedido ON pedido_items(pedido_id)")


    # Sincronización de totales en facturas existentes
    try:
        cursor.execute("""
            UPDATE facturas 
            SET total_usd = total 
            WHERE (total_usd IS NULL OR total_usd = 0.0) AND (total IS NOT NULL AND total > 0.0)
        """)
        cursor.execute("""
            UPDATE facturas 
            SET total = total_usd 
            WHERE (total IS NULL OR total = 0.0) AND (total_usd IS NOT NULL AND total_usd > 0.0)
        """)
        cursor.execute("UPDATE facturas SET estado = 'pagada' WHERE estado IS NULL")
        cursor.execute("UPDATE facturas SET tipo_venta = 'contado' WHERE tipo_venta IS NULL")
    except Exception as e:
        print(f"[MIGRACIÓN AVISO] Error sincronizando facturas: {e}")

    # 1.1 AUDITORIA DE ANULACION EN FACTURAS
    add_col_if_missing("facturas", "motivo_anulacion", "TEXT")
    add_col_if_missing("facturas", "fecha_anulacion", "TEXT")
    add_col_if_missing("facturas", "usuario_anulacion_id", "INTEGER DEFAULT 1")

    # 1.2 DEVOLUCIONES
    add_col_if_missing("devoluciones", "estado", "TEXT DEFAULT 'activa'")
    add_col_if_missing("devoluciones", "motivo_anulacion", "TEXT")
    add_col_if_missing("devoluciones", "fecha_anulacion", "TEXT")
    add_col_if_missing("devoluciones", "usuario_anulacion_id", "INTEGER DEFAULT 1")

    # 2. CUENTAS POR COBRAR (CXC)
    add_col_if_missing("cuentas_por_cobrar", "fecha_emision", "TEXT")
    add_col_if_missing("cuentas_por_cobrar", "notas", "TEXT")
    add_col_if_missing("cuentas_por_cobrar", "motivo_anulacion", "TEXT")
    add_col_if_missing("cuentas_por_cobrar", "fecha_anulacion", "TEXT")
    add_col_if_missing("cuentas_por_cobrar", "usuario_anulacion_id", "INTEGER DEFAULT 1")
    add_col_if_missing("abonos_cxc", "estado", "TEXT DEFAULT 'activo'")
    add_col_if_missing("abonos_cxc", "motivo_anulacion", "TEXT")
    add_col_if_missing("abonos_cxc", "fecha_anulacion", "TEXT")
    try:
        cursor.execute("UPDATE cuentas_por_cobrar SET fecha_emision = created_at WHERE fecha_emision IS NULL")
    except Exception:
        pass

    # 3. COMPRAS
    add_col_if_missing("compras", "tipo_compra", "TEXT DEFAULT 'contado'")
    add_col_if_missing("compras", "fecha_vencimiento", "TEXT")
    add_col_if_missing("compras", "saldo_pendiente", "REAL DEFAULT 0.0")
    add_col_if_missing("compras", "numero_factura", "TEXT")

    add_col_if_missing("compras", "estado", "TEXT DEFAULT 'activa'")
    add_col_if_missing("compras", "motivo_anulacion", "TEXT")
    add_col_if_missing("compras", "fecha_anulacion", "TEXT")
    add_col_if_missing("compras", "usuario_anulacion_id", "INTEGER DEFAULT 1")

    # 4. CUENTAS POR PAGAR (CXP)
    add_col_if_missing("cuentas_por_pagar", "tipo_registro", "TEXT DEFAULT 'compra'")
    add_col_if_missing("cuentas_por_pagar", "numero_control", "TEXT")
    add_col_if_missing("cuentas_por_pagar", "impuesto_tipo", "TEXT DEFAULT 'exento'")
    add_col_if_missing("cuentas_por_pagar", "base_imponible_usd", "REAL DEFAULT 0.0")
    add_col_if_missing("cuentas_por_pagar", "iva_usd", "REAL DEFAULT 0.0")
    add_col_if_missing("cuentas_por_pagar", "tasa_bcv", "REAL DEFAULT 0.0")
    add_col_if_missing("cuentas_por_pagar", "base_imponible_ves", "REAL DEFAULT 0.0")
    add_col_if_missing("cuentas_por_pagar", "iva_ves", "REAL DEFAULT 0.0")
    add_col_if_missing("cuentas_por_pagar", "total_ves", "REAL DEFAULT 0.0")
    add_col_if_missing("cuentas_por_pagar", "afecta_libro_compras", "INTEGER DEFAULT 0")

    add_col_if_missing("cuentas_por_pagar", "motivo_anulacion", "TEXT")
    add_col_if_missing("cuentas_por_pagar", "fecha_anulacion", "TEXT")
    add_col_if_missing("cuentas_por_pagar", "usuario_anulacion_id", "INTEGER DEFAULT 1")
    add_col_if_missing("abonos_cxp", "estado", "TEXT DEFAULT 'activo'")
    add_col_if_missing("abonos_cxp", "motivo_anulacion", "TEXT")
    add_col_if_missing("abonos_cxp", "fecha_anulacion", "TEXT")

    # 4.0.1 Ampliar CHECK constraint de estado en cuentas_por_cobrar y cuentas_por_pagar para admitir 'anulada'
    for tbl_chk in ("cuentas_por_cobrar", "cuentas_por_pagar"):
        try:
            cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (tbl_chk,))
            row_sql = cursor.fetchone()
            if row_sql and row_sql[0] and "'anulada'" not in row_sql[0] and "CHECK(estado IN ('pendiente', 'parcial', 'pagada'))" in row_sql[0]:
                old_sql = row_sql[0]
                tmp_tbl = f"{tbl_chk}_mig_fase4"
                new_sql = old_sql.replace(
                    f"CREATE TABLE {tbl_chk}", f"CREATE TABLE {tmp_tbl}", 1
                ).replace(
                    f'CREATE TABLE "{tbl_chk}"', f'CREATE TABLE "{tmp_tbl}"', 1
                ).replace(
                    "CHECK(estado IN ('pendiente', 'parcial', 'pagada'))",
                    "CHECK(estado IN ('pendiente', 'parcial', 'pagada', 'anulada'))"
                )
                cursor.execute(f"PRAGMA table_info({tbl_chk})")
                cols_mig = [r[1] for r in cursor.fetchall()]
                cols_csv = ", ".join(cols_mig)
                cursor.execute("PRAGMA foreign_keys = OFF")
                cursor.execute(f"DROP TABLE IF EXISTS {tmp_tbl}")
                cursor.execute(new_sql)
                cursor.execute(f"INSERT INTO {tmp_tbl} ({cols_csv}) SELECT {cols_csv} FROM {tbl_chk}")
                cursor.execute(f"DROP TABLE {tbl_chk}")
                cursor.execute(f"ALTER TABLE {tmp_tbl} RENAME TO {tbl_chk}")
                cursor.execute("PRAGMA foreign_keys = ON")
                reporte.setdefault("columnas_reparadas", []).append(f"{tbl_chk}.estado(CHECK+anulada)")
        except Exception as e_chk:
            print(f"[MIGRACIÓN AVISO] Error actualizando CHECK de {tbl_chk}: {e_chk}")

    # 4.1 NOTAS DE AJUSTE COMERCIAL (CXC Y CXP)
    try:
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS notas_ajuste_comercial (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            modulo TEXT NOT NULL CHECK(modulo IN ('cxc', 'cxp')),
            tercero_id INTEGER NOT NULL,
            cuenta_id INTEGER,
            tipo_nota TEXT NOT NULL CHECK(tipo_nota IN ('credito', 'debito')),
            numero_nota TEXT NOT NULL,
            fecha TEXT NOT NULL,
            monto_usd REAL NOT NULL CHECK(monto_usd > 0),
            tasa_bcv REAL NOT NULL DEFAULT 1.0,
            monto_ves REAL NOT NULL DEFAULT 0.0,
            efecto TEXT NOT NULL CHECK(efecto IN ('disminuye', 'incrementa')),
            motivo TEXT NOT NULL,
            numero_control TEXT,
            afecta_libro_fiscal INTEGER DEFAULT 0,
            usuario_id INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_notas_mod_tercero ON notas_ajuste_comercial(modulo, tercero_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_notas_cuenta ON notas_ajuste_comercial(cuenta_id)")
    except Exception as e:
        print(f"[MIGRACIÓN AVISO] Error creando tabla notas_ajuste_comercial: {e}")

    # 5. CONFIGURACION
    add_col_if_missing("configuracion", "tema_config", "TEXT")
    add_col_if_missing("configuracion", "labels_config", "TEXT")
    add_col_if_missing("configuracion", "fecha_tasas_actualizacion", "TEXT")
    add_col_if_missing("configuracion", "fuente_tasas", "TEXT")
    add_col_if_missing("configuracion", "sincronizacion_tasas_auto", "INTEGER DEFAULT 1")

    try:
        cursor.execute("UPDATE configuracion SET tema_config = tema WHERE tema_config IS NULL AND tema IS NOT NULL")
        cursor.execute("UPDATE configuracion SET labels_config = labels WHERE labels_config IS NULL AND labels IS NOT NULL")
        cursor.execute("UPDATE configuracion SET tema = tema_config WHERE tema IS NULL AND tema_config IS NOT NULL")
        cursor.execute("UPDATE configuracion SET labels = labels_config WHERE labels IS NULL AND labels_config IS NOT NULL")
    except Exception:
        pass

    # 6. TABLAS DEL LIBRO MAYOR DE INVENTARIO (FASE 2A)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS inventario_movimientos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT NOT NULL,
        producto_id INTEGER NOT NULL,
        tipo_movimiento TEXT NOT NULL CHECK(tipo_movimiento IN (
            'inventario_inicial',
            'compra',
            'venta',
            'devolucion_cliente',
            'devolucion_proveedor',
            'cargo_ajuste',
            'descargo_merma',
            'descargo_vencimiento',
            'descargo_rotura',
            'descargo_uso_interno',
            'APERTURA_MIGRACION'
        )),
        sentido TEXT NOT NULL CHECK(sentido IN ('ENTRADA', 'SALIDA')),
        cantidad REAL NOT NULL CHECK(cantidad > 0),
        costo_unitario REAL NOT NULL DEFAULT 0.0 CHECK(costo_unitario >= 0),
        costo_total REAL NOT NULL DEFAULT 0.0 CHECK(costo_total >= 0),
        stock_anterior REAL NOT NULL DEFAULT 0.0,
        stock_nuevo REAL NOT NULL DEFAULT 0.0,
        documento_tipo TEXT NOT NULL,
        documento_id INTEGER,
        documento_numero TEXT,
        motivo TEXT,
        usuario_id INTEGER,
        documento_linea_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE RESTRICT
    )
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_inv_mov_prod_fecha ON inventario_movimientos(producto_id, fecha)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_inv_mov_doc ON inventario_movimientos(documento_tipo, documento_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_inv_mov_fecha ON inventario_movimientos(fecha)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_inv_mov_prod_fecha_id ON inventario_movimientos(producto_id, fecha, id)")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS inventario_migraciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        version TEXT NOT NULL,
        fecha_corte TEXT NOT NULL,
        estado TEXT NOT NULL CHECK(estado IN ('PENDIENTE', 'COMPLETADO', 'FALLIDO')),
        registros_generados INTEGER DEFAULT 0,
        observaciones TEXT
    )
    """)

    # 7. TABLAS DE AJUSTES DE INVENTARIO (FASE 2C)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS inventario_ajustes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_ajuste TEXT UNIQUE NOT NULL,
        fecha TEXT NOT NULL,
        tipo_ajuste TEXT NOT NULL CHECK(tipo_ajuste IN ('CARGO', 'DESCARGO')),
        motivo TEXT NOT NULL,
        observaciones TEXT,
        usuario_id INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS inventario_ajuste_detalles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ajuste_id INTEGER NOT NULL,
        producto_id INTEGER NOT NULL,
        cantidad REAL NOT NULL CHECK(cantidad > 0),
        costo_unitario REAL NOT NULL DEFAULT 0.0,
        costo_total REAL NOT NULL DEFAULT 0.0,
        stock_anterior REAL NOT NULL DEFAULT 0.0,
        stock_nuevo REAL NOT NULL DEFAULT 0.0,
        motivo_detalle TEXT,
        FOREIGN KEY (ajuste_id) REFERENCES inventario_ajustes(id) ON DELETE CASCADE,
        FOREIGN KEY (producto_id) REFERENCES productos(id)
    )
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_inv_ajustes_fecha ON inventario_ajustes(fecha)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_inv_ajuste_det_ajuste ON inventario_ajuste_detalles(ajuste_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_inv_ajuste_det_prod ON inventario_ajuste_detalles(producto_id)")

    # 8. MOTOR DE COSTO PROMEDIO PONDERADO (CPP) - FASE 2F-1B / 2F-2B / 2F-3B / 2F-4B / 2F-5B
    add_col_if_missing("productos", "costo_cpp", "REAL DEFAULT 0.0")
    add_col_if_missing("inventario_movimientos", "documento_linea_id", "INTEGER")
    add_col_if_missing("inventario_movimientos", "subtipo_movimiento", "TEXT")
    add_col_if_missing("inventario_movimientos", "cpp_anterior", "REAL")
    add_col_if_missing("inventario_movimientos", "cpp_nuevo", "REAL")

    add_col_if_missing("inventario_ajustes", "subtipo_ajuste", "TEXT")
    add_col_if_missing("inventario_ajustes", "documento_referencia", "TEXT")
    add_col_if_missing("inventario_ajustes", "autorizado_por", "TEXT")
    add_col_if_missing("inventario_ajustes", "estado", "TEXT DEFAULT 'activo'")
    add_col_if_missing("inventario_ajustes", "idempotency_key", "TEXT")
    add_col_if_missing("inventario_ajustes", "ajuste_referencia_id", "INTEGER")
    add_col_if_missing("inventario_ajustes", "motivo_anulacion", "TEXT")
    add_col_if_missing("inventario_ajustes", "fecha_anulacion", "TEXT")
    add_col_if_missing("inventario_ajustes", "usuario_anulacion_id", "INTEGER")

    add_col_if_missing("inventario_ajuste_detalles", "subtipo_movimiento", "TEXT")
    add_col_if_missing("inventario_ajuste_detalles", "cpp_anterior", "REAL")
    add_col_if_missing("inventario_ajuste_detalles", "cpp_nuevo", "REAL")

    add_col_if_missing("factura_detalles", "costo_unitario", "REAL")
    add_col_if_missing("factura_detalles", "costo_total", "REAL")
    add_col_if_missing("devolucion_detalles", "factura_detalle_id", "INTEGER")
    add_col_if_missing("devolucion_detalles", "costo_unitario", "REAL")
    add_col_if_missing("devolucion_detalles", "costo_total", "REAL")
    try:
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_dev_det_factura_det ON devolucion_detalles(factura_detalle_id)")
    except Exception:
        pass
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_inv_ajustes_idemp ON inventario_ajustes(idempotency_key)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_inv_ajustes_estado ON inventario_ajustes(estado)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_inv_mov_subtipo ON inventario_movimientos(subtipo_movimiento)")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS inventario_saldos_apertura_cpp (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha_corte TEXT NOT NULL,
        ultimo_movimiento_id_corte INTEGER NOT NULL,
        producto_id INTEGER NOT NULL,
        sku TEXT NOT NULL,
        stock_apertura REAL NOT NULL,
        costo_unitario_apertura REAL NOT NULL,
        valor_apertura REAL NOT NULL,
        moneda TEXT NOT NULL DEFAULT 'USD',
        fuente_valor TEXT NOT NULL,
        certificado_por TEXT NOT NULL,
        certificado_at TEXT NOT NULL,
        observacion TEXT,
        checksum TEXT NOT NULL,
        UNIQUE(fecha_corte, producto_id),
        FOREIGN KEY (producto_id) REFERENCES productos(id)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_inv_apertura_corte ON inventario_saldos_apertura_cpp(fecha_corte, producto_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_inv_apertura_sku ON inventario_saldos_apertura_cpp(sku)")

    # ========================================================
    # FASE 2F-6C: MODELO FINANCIERO, PAGOS N:M Y TESORERÍA
    # ========================================================
    # 1. Cuentas de Tesorería (Cajas, Bancos, Billeteras)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS cuentas_tesoreria (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL UNIQUE,
        tipo TEXT NOT NULL CHECK(tipo IN ('caja_efectivo', 'cuenta_bancaria', 'billetera_digital', 'punto_venta')),
        moneda TEXT NOT NULL CHECK(moneda IN ('USD', 'VES', 'COP', 'EUR')),
        banco_entidad TEXT,
        numero_cuenta_enmascarado TEXT,
        saldo_actual REAL NOT NULL DEFAULT 0.0,
        activo INTEGER NOT NULL DEFAULT 1,
        permite_sobregiro INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cuentas_tesoreria_tipo ON cuentas_tesoreria(tipo, moneda)")

    # 2. Historial Inmutable de Tasas de Cambio
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tasas_historial (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        moneda_origen TEXT NOT NULL DEFAULT 'USD',
        moneda_destino TEXT NOT NULL CHECK(moneda_destino IN ('VES', 'COP', 'EUR')),
        tasa REAL NOT NULL CHECK(tasa > 0),
        fecha_vigencia_desde TIMESTAMP NOT NULL,
        fuente TEXT NOT NULL DEFAULT 'OFICIAL',
        usuario_id INTEGER DEFAULT 1,
        motivo_actualizacion TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_tasas_historial_consulta ON tasas_historial(moneda_destino, fecha_vigencia_desde DESC)")

    # 3. Entidad Central de Pagos y Cobros
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS pagos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_pago TEXT UNIQUE NOT NULL,
        tipo_operacion TEXT NOT NULL CHECK(tipo_operacion IN ('cobro_cliente', 'pago_proveedor', 'anticipo_cliente', 'anticipo_proveedor')),
        tercero_tipo TEXT NOT NULL CHECK(tercero_tipo IN ('cliente', 'proveedor', 'otro')),
        tercero_id INTEGER NOT NULL,
        fecha_pago TIMESTAMP NOT NULL,
        concepto TEXT NOT NULL,
        monto_total_equivalente_usd REAL NOT NULL CHECK(monto_total_equivalente_usd >= 0),
        monto_aplicado_usd REAL NOT NULL DEFAULT 0.0 CHECK(monto_aplicado_usd >= 0),
        monto_no_aplicado_usd REAL NOT NULL DEFAULT 0.0 CHECK(monto_no_aplicado_usd >= 0),
        estado TEXT NOT NULL DEFAULT 'activo' CHECK(estado IN ('activo', 'anulado', 'conciliado')),
        idempotency_key TEXT UNIQUE,
        usuario_id INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        anulado_at TIMESTAMP,
        anulado_by INTEGER,
        motivo_anulacion TEXT
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pagos_tercero ON pagos(tercero_tipo, tercero_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pagos_fecha ON pagos(fecha_pago)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pagos_idempotency ON pagos(idempotency_key)")

    # 4. Desglose de Monedas del Pago (Líneas Monetarias)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS pago_detalles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pago_id INTEGER NOT NULL,
        cuenta_tesoreria_id INTEGER NOT NULL,
        moneda TEXT NOT NULL CHECK(moneda IN ('USD', 'VES', 'COP', 'EUR')),
        monto_moneda REAL NOT NULL CHECK(monto_moneda > 0),
        tasa_cambio REAL NOT NULL CHECK(tasa_cambio > 0),
        equivalente_usd REAL NOT NULL CHECK(equivalente_usd > 0),
        metodo_pago TEXT NOT NULL,
        referencia_bancaria TEXT,
        tasa_sugerida REAL,
        tasa_override INTEGER DEFAULT 0,
        motivo_override TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pago_id) REFERENCES pagos(id) ON DELETE CASCADE,
        FOREIGN KEY (cuenta_tesoreria_id) REFERENCES cuentas_tesoreria(id)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pago_detalles_pago ON pago_detalles(pago_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pago_detalles_cuenta ON pago_detalles(cuenta_tesoreria_id)")

    # 5. Matriz de Aplicación N:M a Documentos (Facturas, Compras, Gastos)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS pago_aplicaciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pago_id INTEGER NOT NULL,
        documento_tipo TEXT NOT NULL CHECK(documento_tipo IN ('factura', 'compra', 'gasto')),
        documento_id INTEGER NOT NULL,
        cuenta_por_cobrar_id INTEGER,
        cuenta_por_pagar_id INTEGER,
        monto_aplicado_usd REAL NOT NULL CHECK(monto_aplicado_usd > 0),
        fecha_aplicacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        estado TEXT NOT NULL DEFAULT 'activa' CHECK(estado IN ('activa', 'revertida')),
        revertido_at TIMESTAMP,
        revertido_motivo TEXT,
        FOREIGN KEY (pago_id) REFERENCES pagos(id) ON DELETE CASCADE,
        FOREIGN KEY (cuenta_por_cobrar_id) REFERENCES cuentas_por_cobrar(id),
        FOREIGN KEY (cuenta_por_pagar_id) REFERENCES cuentas_por_pagar(id)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pago_aplicaciones_doc ON pago_aplicaciones(documento_tipo, documento_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pago_aplicaciones_cxc ON pago_aplicaciones(cuenta_por_cobrar_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pago_aplicaciones_cxp ON pago_aplicaciones(cuenta_por_pagar_id)")

    # 6. Anticipos y Saldos a Favor de Clientes y Proveedores
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS anticipos_clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tercero_tipo TEXT NOT NULL DEFAULT 'cliente' CHECK(tercero_tipo IN ('cliente', 'proveedor')),
        tercero_id INTEGER NOT NULL,
        pago_origen_id INTEGER NOT NULL,
        monto_original_usd REAL NOT NULL CHECK(monto_original_usd > 0),
        saldo_disponible_usd REAL NOT NULL CHECK(saldo_disponible_usd >= 0),
        estado TEXT NOT NULL DEFAULT 'disponible' CHECK(estado IN ('disponible', 'aplicado_parcial', 'agotado', 'reembolsado')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pago_origen_id) REFERENCES pagos(id)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_anticipos_tercero ON anticipos_clientes(tercero_tipo, tercero_id, estado)")

    # 7. Libro Mayor Auxiliar de Tesorería (Kardex Financiero)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tesoreria_movimientos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cuenta_tesoreria_id INTEGER NOT NULL,
        tipo_movimiento TEXT NOT NULL CHECK(tipo_movimiento IN ('ingreso', 'egreso', 'transferencia_salida', 'transferencia_entrada', 'ajuste_arqueo')),
        origen_modulo TEXT NOT NULL CHECK(origen_modulo IN ('ventas_pos', 'cobro_cxc', 'compras', 'pago_cxp', 'gasto_operativo', 'caja_arqueo', 'transferencia_interna')),
        origen_id INTEGER,
        pago_detalle_id INTEGER,
        fecha_movimiento TIMESTAMP NOT NULL,
        descripcion TEXT NOT NULL,
        monto_moneda REAL NOT NULL CHECK(monto_moneda > 0),
        saldo_anterior REAL NOT NULL,
        saldo_nuevo REAL NOT NULL,
        tasa_cambio REAL NOT NULL,
        equivalente_usd REAL NOT NULL,
        usuario_id INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cuenta_tesoreria_id) REFERENCES cuentas_tesoreria(id),
        FOREIGN KEY (pago_detalle_id) REFERENCES pago_detalles(id)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_tesoreria_movimientos_cuenta ON tesoreria_movimientos(cuenta_tesoreria_id, fecha_movimiento DESC)")

    # 8. Control de Turnos y Cajas (Aperturas, Arqueos y Cierres)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS caja_aperturas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cuenta_tesoreria_id INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL,
        fecha_apertura TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        monto_inicial_usd REAL NOT NULL DEFAULT 0.0,
        monto_inicial_moneda REAL NOT NULL DEFAULT 0.0,
        estado TEXT NOT NULL DEFAULT 'abierta' CHECK(estado IN ('abierta', 'cerrada')),
        notas_apertura TEXT,
        FOREIGN KEY (cuenta_tesoreria_id) REFERENCES cuentas_tesoreria(id)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_caja_aperturas_estado ON caja_aperturas(cuenta_tesoreria_id, estado)")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS caja_cierres (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        caja_apertura_id INTEGER NOT NULL,
        fecha_cierre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        saldo_teorico_usd REAL NOT NULL,
        saldo_teorico_moneda REAL NOT NULL,
        saldo_real_fisico_usd REAL NOT NULL,
        saldo_real_fisico_moneda REAL NOT NULL,
        diferencia_usd REAL NOT NULL,
        diferencia_moneda REAL NOT NULL,
        estado_arqueo TEXT NOT NULL CHECK(estado_arqueo IN ('cuadrado', 'sobrante', 'faltante')),
        notas_cierre TEXT,
        cerrado_by INTEGER NOT NULL,
        FOREIGN KEY (caja_apertura_id) REFERENCES caja_aperturas(id)
    )
    """)

    # 9. Gastos Operativos Desacoplados de Proveedores de Inventario
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS gastos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_gasto TEXT UNIQUE NOT NULL,
        categoria_gasto TEXT NOT NULL,
        beneficiario TEXT NOT NULL,
        beneficiario_rif TEXT,
        tipo_pago TEXT NOT NULL CHECK(tipo_pago IN ('contado', 'credito')),
        moneda TEXT NOT NULL CHECK(moneda IN ('USD', 'VES', 'COP')),
        monto_total_moneda REAL NOT NULL CHECK(monto_total_moneda > 0),
        tasa_cambio REAL NOT NULL CHECK(tasa_cambio > 0),
        monto_total_usd REAL NOT NULL CHECK(monto_total_usd > 0),
        numero_factura_fiscal TEXT,
        numero_control TEXT,
        concepto TEXT NOT NULL,
        cuenta_tesoreria_id INTEGER,
        cuenta_por_pagar_id INTEGER,
        usuario_id INTEGER NOT NULL DEFAULT 1,
        fecha_emision TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        estado TEXT NOT NULL DEFAULT 'activo' CHECK(estado IN ('activo', 'anulado')),
        FOREIGN KEY (cuenta_tesoreria_id) REFERENCES cuentas_tesoreria(id),
        FOREIGN KEY (cuenta_por_pagar_id) REFERENCES cuentas_por_pagar(id)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha_emision)")

    # 10. Auditoría de Diferencias Cambiarias
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS diferencial_cambiario_movimientos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pago_id INTEGER NOT NULL,
        factura_id INTEGER,
        monto_usd_amortizado REAL NOT NULL,
        tasa_facturacion REAL NOT NULL,
        tasa_pago REAL NOT NULL,
        diferencial_ves REAL NOT NULL,
        tipo_diferencial TEXT NOT NULL CHECK(tipo_diferencial IN ('ganancia_cambiaria', 'perdida_cambiaria')),
        fecha_operacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pago_id) REFERENCES pagos(id),
        FOREIGN KEY (factura_id) REFERENCES facturas(id)
    )
    """)

    # 11. Períodos Financieros
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS periodos_financieros (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo_periodo TEXT UNIQUE NOT NULL,
        fecha_inicio DATE NOT NULL,
        fecha_fin DATE NOT NULL,
        estado TEXT NOT NULL DEFAULT 'abierto' CHECK(estado IN ('abierto', 'cerrado')),
        cerrado_at TIMESTAMP,
        cerrado_by INTEGER,
        motivo_reapertura TEXT
    )
    """)

    
    # ==============================================================================
    # 12. GESTIÓN DE USUARIOS Y CONTROL DE ACCESO (RBAC 100% CONFIGURABLE)
    # ==============================================================================
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT UNIQUE NOT NULL,
        descripcion TEXT,
        es_sistema INTEGER DEFAULT 0,
        perm_dashboard INTEGER DEFAULT 0,
        perm_pos INTEGER DEFAULT 1,
        perm_inventario INTEGER DEFAULT 0,
        perm_compras INTEGER DEFAULT 0,
        perm_ventas INTEGER DEFAULT 1,
        perm_cxc INTEGER DEFAULT 0,
        perm_cxp INTEGER DEFAULT 0,
        perm_clientes INTEGER DEFAULT 1,
        perm_reportes INTEGER DEFAULT 0,
        perm_configuracion INTEGER DEFAULT 0,
        perm_fuerza_ventas INTEGER DEFAULT 0,
        facturar_negativo INTEGER DEFAULT 0,
        autorizar_devoluciones INTEGER DEFAULT 0,
        modificar_precios INTEGER DEFAULT 0,
        ver_costos_utilidad INTEGER DEFAULT 0,
        anular_transacciones INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        nombre_completo TEXT NOT NULL,
        email TEXT,
        telefono TEXT,
        rol_id INTEGER NOT NULL,
        activo INTEGER DEFAULT 1,
        ultimo_acceso TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (rol_id) REFERENCES roles(id)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_usuarios_username ON usuarios(username)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON usuarios(rol_id)")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS auditoria_seguridad (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER,
        username TEXT,
        accion TEXT NOT NULL,
        modulo TEXT NOT NULL,
        detalles TEXT,
        ip TEXT,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria_seguridad(usuario_id, fecha DESC)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_auditoria_modulo ON auditoria_seguridad(modulo, fecha DESC)")

    # Seeding Inicial de Roles del Organigrama si no existen
    cursor.execute("SELECT COUNT(*) FROM roles")
    if cursor.fetchone()[0] == 0:
        cursor.executemany("""
        INSERT INTO roles (
            nombre, descripcion, es_sistema,
            perm_dashboard, perm_pos, perm_inventario, perm_compras,
            perm_ventas, perm_cxc, perm_cxp, perm_clientes,
            perm_reportes, perm_configuracion, perm_fuerza_ventas,
            facturar_negativo, autorizar_devoluciones, modificar_precios,
            ver_costos_utilidad, anular_transacciones
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, [
            (
                'SuperAdmin', 'Control total e irrestricto de todo el sistema y seguridad', 1,
                1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1
            ),
            (
                'Gerente General', 'Gestión operativa, inventarios, compras, ventas y tesorería', 1,
                1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1
            ),
            (
                'Cajero / Facturador', 'Facturación POS, cobros y clientes. Sin acceso a costos ni anulaciones', 1,
                0, 1, 0, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0
            ),
            (
                'Vendedor Comercial', 'Atención de clientes, cotizaciones y pedidos con comisiones', 1,
                0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0
            ),
            (
                'Almacenista / Inventario', 'Control físico de almacén, entradas de compra y ajustes de stock', 1,
                0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
            )
        ])
        print("[MIGRACIÓN AUTO] Roles iniciales del organigrama sembrados con éxito.")

    # Seeding Inicial de Usuario Maestro 'admin' si no existen usuarios
    cursor.execute("SELECT COUNT(*) FROM usuarios")
    if cursor.fetchone()[0] == 0:
        cursor.execute("SELECT id FROM roles WHERE nombre = 'SuperAdmin' LIMIT 1")
        admin_rol = cursor.fetchone()
        rol_id = admin_rol[0] if admin_rol else 1
        salt_inicial = generar_salt()
        pwd_hash = hash_password("admin123", salt_inicial)
        cursor.execute("""
            INSERT INTO usuarios (username, password_hash, salt, nombre_completo, email, telefono, rol_id, activo)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        """, ("admin", pwd_hash, salt_inicial, "Administrador Principal", "admin@tavocloud.com", "+58 412 0000000", rol_id))
        print("[MIGRACIÓN AUTO] Usuario maestro inicial 'admin' creado exitosamente (clave inicial: admin123).")

    # ==============================================================================
    # 12.1 INFRAESTRUCTURA DE SEGURIDAD FASE 1 (SESIONES, IDEMPOTENCIA Y OUTBOX)
    # ==============================================================================
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sesiones_activas (
        jti TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL,
        parent_jti TEXT NULL,
        reemplazado_por_jti TEXT NULL UNIQUE,
        usuario_id INTEGER NOT NULL,
        instance_id INTEGER NOT NULL DEFAULT 1,
        csrf_token TEXT NOT NULL,
        ip_origen TEXT NULL,
        user_agent TEXT NULL,
        creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expira_en TIMESTAMP NOT NULL,
        rotada_en TIMESTAMP NULL,
        estado TEXT NOT NULL CHECK(estado IN ('ACTIVA', 'ROTADA', 'EXPIRADA', 'REVOCADA')),
        encrypted_jwt TEXT NULL,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_jti) REFERENCES sesiones_activas(jti) ON DELETE SET NULL,
        FOREIGN KEY (reemplazado_por_jti) REFERENCES sesiones_activas(jti) ON DELETE SET NULL,
        CHECK (reemplazado_por_jti <> jti),
        CHECK (parent_jti <> jti)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sesiones_hash ON sesiones_activas(token_hash)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones_activas(usuario_id, estado)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sesiones_parent ON sesiones_activas(parent_jti)")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS idempotencia_transaccional (
        idempotency_key TEXT PRIMARY KEY,
        request_hash TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        usuario_id INTEGER NOT NULL,
        instance_id INTEGER NOT NULL DEFAULT 1,
        estado TEXT NOT NULL CHECK(estado IN ('EN_PROCESO', 'COMPLETADO', 'FALLIDO')),
        response_code INTEGER NULL,
        response_body TEXT NULL,
        creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expira_en TIMESTAMP NOT NULL,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_idempotencia_expira ON idempotencia_transaccional(expira_en)")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS outbox_eventos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo_evento TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK(estado IN ('PENDIENTE', 'PROCESADO', 'FALLIDO')),
        reintentos INTEGER NOT NULL DEFAULT 0,
        creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        procesado_en TIMESTAMP NULL
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_outbox_pendientes ON outbox_eventos(estado, creado_en)")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        descripcion TEXT NOT NULL,
        aplicado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """)
    cursor.execute("""
        INSERT OR IGNORE INTO schema_migrations (version, descripcion)
        VALUES ('FASE1_SEGURIDAD_REV7', 'Migracion formal DDL Fase 1: Sesiones, Idempotencia y Outbox')
    """)

    # ==============================================================================
    # 13. FUERZA DE VENTAS, VENDEDORES Y COMISIONES COMERCIALES
    # ==============================================================================
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS vendedores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER,
        codigo TEXT UNIQUE NOT NULL,
        nombre TEXT NOT NULL,
        documento_identidad TEXT,
        telefono TEXT,
        email TEXT,
        porcentaje_comision_base REAL DEFAULT 3.0,
        meta_mensual_usd REAL DEFAULT 5000.0,
        activo INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_vendedores_codigo ON vendedores(codigo)")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS liquidaciones_comisiones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vendedor_id INTEGER NOT NULL,
        periodo_mes INTEGER NOT NULL,
        periodo_ano INTEGER NOT NULL,
        total_ventas_usd REAL NOT NULL DEFAULT 0.0,
        total_comision_usd REAL NOT NULL DEFAULT 0.0,
        monto_pagado_usd REAL DEFAULT 0.0,
        estado TEXT DEFAULT 'ABIERTA' CHECK(estado IN ('ABIERTA', 'APROBADA', 'PAGADA')),
        fecha_liquidacion TIMESTAMP,
        notas TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendedor_id) REFERENCES vendedores(id)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_liq_vendedor_periodo ON liquidaciones_comisiones(vendedor_id, periodo_ano, periodo_mes)")

    # Seeding Inicial de Vendedor por Defecto
    cursor.execute("SELECT COUNT(*) FROM vendedores")
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
            INSERT INTO vendedores (codigo, nombre, porcentaje_comision_base, meta_mensual_usd, activo)
            VALUES (?, ?, ?, ?, 1)
        """, ('VEN-001', 'Ventas Mostrador / General', 0.0, 5000.0))
        print("[MIGRACIÓN AUTO] Vendedor por defecto 'VEN-001' sembrado.")

    # Sembrar Cuentas de Tesorería por Defecto si está vacío
    cursor.execute("SELECT COUNT(*) FROM cuentas_tesoreria")
    if cursor.fetchone()[0] == 0:
        cursor.executemany("""
        INSERT INTO cuentas_tesoreria (nombre, tipo, moneda, banco_entidad, saldo_actual, activo)
        VALUES (?, ?, ?, ?, 0.0, 1)
        """, [
            ('Caja Principal USD (Efectivo)', 'caja_efectivo', 'USD', 'Efectivo en Caja'),
            ('Caja Mostrador Bs. (Efectivo)', 'caja_efectivo', 'VES', 'Efectivo en Caja'),
            ('Banco Cuenta Corriente Bs. (Pago Móvil / Transf)', 'cuenta_bancaria', 'VES', 'Banco Nacional'),
            ('Caja Pesos COP (Efectivo)', 'caja_efectivo', 'COP', 'Efectivo en Caja')
        ])

    conn.commit()

    # 6. Estadísticas y conteos de tablas
    try:
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        tablas = [r[0] for r in cursor.fetchall()]
        for t in tablas:
            cursor.execute(f"PRAGMA table_info({t})")
            cols = [r[1] for r in cursor.fetchall()]
            cursor.execute(f"SELECT COUNT(*) FROM {t}")
            cnt = cursor.fetchone()[0]
            reporte["tablas"][t] = {
                "registros": cnt,
                "columnas": cols
            }
    except Exception as e:
        reporte["error_stats"] = str(e)

    if should_close:
        conn.close()

    return reporte

def init_db():
    # Sincronizar desde la nube al iniciar si está configurado en Render
    sync_from_supabase_storage()

    conn = get_connection()
    cursor = conn.cursor()

    # Tabla de Configuración (Tasas de cambio y datos del negocio)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS configuracion (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        nombre_negocio TEXT DEFAULT 'Mi Negocio Comercial',
        documento_fiscal TEXT DEFAULT 'J-12345678-9',
        telefono TEXT DEFAULT '+58 412 0000000',
        direccion TEXT DEFAULT 'Calle Principal #123',
        iva_porcentaje REAL DEFAULT 16.0,
        tasa_ves REAL DEFAULT 45.00,
        tasa_cop REAL DEFAULT 4100.00,
        moneda_principal TEXT DEFAULT 'USD',
        sincronizacion_tasas_auto INTEGER DEFAULT 1,
        logo_url TEXT DEFAULT NULL
    )
    """)
    try:
        cursor.execute("ALTER TABLE configuracion ADD COLUMN logo_url TEXT DEFAULT NULL")
    except Exception:
        pass

    # Tabla de Categorías (Clasificadas en Servicios y Productos)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS categorias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        tipo TEXT NOT NULL CHECK(tipo IN ('servicio', 'producto')),
        descripcion TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Tabla de Productos y Servicios
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS productos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE NOT NULL,
        nombre TEXT NOT NULL,
        categoria_id INTEGER NOT NULL,
        tipo TEXT NOT NULL CHECK(tipo IN ('servicio', 'producto')),
        impuesto_tipo TEXT NOT NULL CHECK(impuesto_tipo IN ('gravado', 'exento')),
        precio_base REAL NOT NULL DEFAULT 0.0,
        iva_monto REAL NOT NULL DEFAULT 0.0,
        precio_total REAL NOT NULL DEFAULT 0.0,
        costo REAL DEFAULT 0.0,
        costo_cpp REAL DEFAULT 0.0,
        stock REAL DEFAULT 0.0,
        stock_minimo REAL DEFAULT 5.0,
        imagen TEXT,
        descripcion TEXT,
        activo INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE RESTRICT
    )
    """)

    # Tabla de Clientes
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        cedula TEXT UNIQUE NOT NULL,
        telefono TEXT NOT NULL,
        correo TEXT,
        direccion TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Tabla de Proveedores
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS proveedores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        cedula TEXT UNIQUE NOT NULL,
        telefono TEXT NOT NULL,
        correo TEXT,
        direccion TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Tabla de Facturas (Ventas)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS facturas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_factura TEXT UNIQUE NOT NULL,
        cliente_id INTEGER NOT NULL,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        subtotal REAL NOT NULL DEFAULT 0.0,
        iva_total REAL NOT NULL DEFAULT 0.0,
        total_usd REAL NOT NULL DEFAULT 0.0,
        total REAL NOT NULL DEFAULT 0.0,
        tasa_ves REAL NOT NULL DEFAULT 0.0,
        tasa_cop REAL NOT NULL DEFAULT 0.0,
        total_ves REAL NOT NULL DEFAULT 0.0,
        total_cop REAL NOT NULL DEFAULT 0.0,
        estado TEXT DEFAULT 'pagada' CHECK(estado IN ('pagada', 'pendiente', 'anulada')),
        tipo_venta TEXT DEFAULT 'contado' CHECK(tipo_venta IN ('contado', 'credito')),
        fecha_vencimiento TEXT,
        saldo_pendiente REAL DEFAULT 0.0,
        notas TEXT,
        FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    )
    """)

    # Ejecutar migración y normalización automática de esquemas
    auditar_y_migrar_db(conn, cursor)

    # Tabla de Cuentas por Cobrar (CXC)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS cuentas_por_cobrar (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        factura_id INTEGER NOT NULL,
        cliente_id INTEGER NOT NULL,
        monto_total REAL NOT NULL,
        monto_pagado REAL NOT NULL DEFAULT 0.0,
        saldo_pendiente REAL NOT NULL,
        fecha_emision TEXT NOT NULL,
        fecha_vencimiento TEXT NOT NULL,
        estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente', 'parcial', 'pagada', 'anulada')),
        notas TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (factura_id) REFERENCES facturas(id) ON DELETE CASCADE,
        FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    )
    """)

    # Historial de Abonos a Cuentas por Cobrar
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS abonos_cxc (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cxc_id INTEGER NOT NULL,
        monto_usd REAL NOT NULL,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        notas TEXT,
        FOREIGN KEY (cxc_id) REFERENCES cuentas_por_cobrar(id) ON DELETE CASCADE
    )
    """)

    # Pagos multimoneda del abono
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS abono_cxc_pagos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        abono_id INTEGER NOT NULL,
        moneda TEXT NOT NULL CHECK(moneda IN ('USD', 'VES', 'COP')),
        metodo TEXT NOT NULL,
        monto_moneda REAL NOT NULL,
        tasa_cambio REAL NOT NULL,
        equivalente_usd REAL NOT NULL,
        referencia TEXT,
        FOREIGN KEY (abono_id) REFERENCES abonos_cxc(id) ON DELETE CASCADE
    )
    """)

    # Detalles de Factura
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS factura_detalles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        factura_id INTEGER NOT NULL,
        producto_id INTEGER NOT NULL,
        nombre_producto TEXT NOT NULL,
        tipo TEXT NOT NULL CHECK(tipo IN ('servicio', 'producto')),
        impuesto_tipo TEXT NOT NULL CHECK(impuesto_tipo IN ('gravado', 'exento')),
        cantidad REAL NOT NULL,
        precio_unitario REAL NOT NULL,
        iva_unitario REAL NOT NULL,
        subtotal REAL NOT NULL,
        total REAL NOT NULL,
        costo_unitario REAL,
        costo_total REAL,
        FOREIGN KEY (factura_id) REFERENCES facturas(id) ON DELETE CASCADE,
        FOREIGN KEY (producto_id) REFERENCES productos(id)
    )
    """)

    # Pagos de Factura (Soporte Multimoneda y Pago Mixto)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS factura_pagos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        factura_id INTEGER NOT NULL,
        moneda TEXT NOT NULL CHECK(moneda IN ('USD', 'VES', 'COP')),
        metodo TEXT NOT NULL,
        monto_moneda REAL NOT NULL,
        tasa_cambio REAL NOT NULL,
        equivalente_usd REAL NOT NULL,
        referencia TEXT,
        FOREIGN KEY (factura_id) REFERENCES facturas(id) ON DELETE CASCADE
    )
    """)

    # Tabla de Compras
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS compras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_control TEXT NOT NULL,
        proveedor_id INTEGER NOT NULL,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        foto_factura TEXT,
        subtotal REAL NOT NULL DEFAULT 0.0,
        iva_total REAL NOT NULL DEFAULT 0.0,
        total REAL NOT NULL DEFAULT 0.0,
        tipo_compra TEXT DEFAULT 'contado' CHECK(tipo_compra IN ('contado', 'credito')),
        fecha_vencimiento TEXT,
        saldo_pendiente REAL DEFAULT 0.0,
        numero_factura TEXT,
        notas TEXT,
        FOREIGN KEY (proveedor_id) REFERENCES proveedores(id)
    )
    """)

    # Migración de columnas para compras existentes
    try:
        cursor.execute("ALTER TABLE compras ADD COLUMN tipo_compra TEXT DEFAULT 'contado'")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE compras ADD COLUMN fecha_vencimiento TEXT")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE compras ADD COLUMN saldo_pendiente REAL DEFAULT 0.0")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE compras ADD COLUMN numero_factura TEXT")
    except Exception:
        pass

    # Tabla de Pagos de Compras (Soporte multimoneda y mixto de compras de contado)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS compra_pagos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        compra_id INTEGER NOT NULL,
        moneda TEXT NOT NULL CHECK(moneda IN ('USD', 'VES', 'COP')),
        metodo TEXT NOT NULL,
        monto_moneda REAL NOT NULL,
        tasa_cambio REAL NOT NULL,
        equivalente_usd REAL NOT NULL,
        referencia TEXT,
        FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE CASCADE
    )
    """)

    # Tabla de Cuentas por Pagar (CXP)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS cuentas_por_pagar (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        compra_id INTEGER,
        proveedor_id INTEGER NOT NULL,
        descripcion_concepto TEXT NOT NULL,
        numero_factura TEXT,
        monto_total REAL NOT NULL,
        monto_pagado REAL NOT NULL DEFAULT 0.0,
        saldo_pendiente REAL NOT NULL,
        fecha_emision TEXT NOT NULL,
        fecha_vencimiento TEXT NOT NULL,
        estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente', 'parcial', 'pagada', 'anulada')),
        tipo_registro TEXT NOT NULL DEFAULT 'compra' CHECK(tipo_registro IN ('compra', 'directo')),
        notas TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE CASCADE,
        FOREIGN KEY (proveedor_id) REFERENCES proveedores(id)
    )
    """)

    # Tabla de Abonos / Pagos a Cuentas por Pagar
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS abonos_cxp (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cxp_id INTEGER NOT NULL,
        monto_usd REAL NOT NULL,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        notas TEXT,
        FOREIGN KEY (cxp_id) REFERENCES cuentas_por_pagar(id) ON DELETE CASCADE
    )
    """)

    # Pagos multimoneda del abono a CXP
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS abono_cxp_pagos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        abono_id INTEGER NOT NULL,
        moneda TEXT NOT NULL CHECK(moneda IN ('USD', 'VES', 'COP')),
        metodo TEXT NOT NULL,
        monto_moneda REAL NOT NULL,
        tasa_cambio REAL NOT NULL,
        equivalente_usd REAL NOT NULL,
        referencia TEXT,
        FOREIGN KEY (abono_id) REFERENCES abonos_cxp(id) ON DELETE CASCADE
    )
    """)

    # Detalles de Compra
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS compra_detalles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        compra_id INTEGER NOT NULL,
        producto_id INTEGER NOT NULL,
        nombre_producto TEXT NOT NULL,
        cantidad REAL NOT NULL,
        costo_unitario REAL NOT NULL,
        impuesto_tipo TEXT NOT NULL CHECK(impuesto_tipo IN ('gravado', 'exento')),
        iva_unitario REAL NOT NULL,
        total REAL NOT NULL,
        FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE CASCADE,
        FOREIGN KEY (producto_id) REFERENCES productos(id)
    )
    """)

    # ==========================================
    # MÓDULO DE DEVOLUCIONES Y NOTAS DE CRÉDITO
    # ==========================================
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS devoluciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_devolucion TEXT UNIQUE NOT NULL,
        factura_id INTEGER,
        numero_factura TEXT,
        cliente_id INTEGER NOT NULL,
        cliente_nombre TEXT NOT NULL,
        cliente_cedula TEXT,
        cliente_telefono TEXT,
        cliente_direccion TEXT,
        fecha_emision TEXT NOT NULL,
        fecha_factura_original TEXT,
        tipo_devolucion TEXT NOT NULL DEFAULT 'total' CHECK(tipo_devolucion IN ('total', 'parcial', 'manual')),
        tipo_venta_original TEXT DEFAULT 'contado',
        motivo TEXT NOT NULL,
        subtotal_usd REAL NOT NULL DEFAULT 0.0,
        iva_usd REAL NOT NULL DEFAULT 0.0,
        total_usd REAL NOT NULL DEFAULT 0.0,
        tasa_ves REAL NOT NULL DEFAULT 0.0,
        tasa_cop REAL NOT NULL DEFAULT 0.0,
        total_ves REAL NOT NULL DEFAULT 0.0,
        total_cop REAL NOT NULL DEFAULT 0.0,
        metodo_reembolso TEXT DEFAULT 'efectivo',
        notas TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (factura_id) REFERENCES facturas(id) ON DELETE SET NULL,
        FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS devolucion_detalles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        devolucion_id INTEGER NOT NULL,
        factura_detalle_id INTEGER,
        producto_id INTEGER,
        codigo TEXT,
        nombre_producto TEXT NOT NULL,
        tipo TEXT NOT NULL CHECK(tipo IN ('servicio', 'producto')),
        impuesto_tipo TEXT NOT NULL CHECK(impuesto_tipo IN ('gravado', 'exento')),
        cantidad REAL NOT NULL,
        precio_unitario REAL NOT NULL,
        iva_unitario REAL NOT NULL DEFAULT 0.0,
        subtotal REAL NOT NULL DEFAULT 0.0,
        total REAL NOT NULL DEFAULT 0.0,
        costo_unitario REAL,
        costo_total REAL,
        FOREIGN KEY (devolucion_id) REFERENCES devoluciones(id) ON DELETE CASCADE,
        FOREIGN KEY (factura_detalle_id) REFERENCES factura_detalles(id),
        FOREIGN KEY (producto_id) REFERENCES productos(id)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_dev_det_factura_det ON devolucion_detalles(factura_detalle_id)")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS devolucion_pagos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        devolucion_id INTEGER NOT NULL,
        moneda TEXT NOT NULL CHECK(moneda IN ('USD', 'VES', 'COP')),
        metodo TEXT NOT NULL,
        monto_moneda REAL NOT NULL,
        tasa_cambio REAL NOT NULL,
        equivalente_usd REAL NOT NULL,
        referencia TEXT,
        FOREIGN KEY (devolucion_id) REFERENCES devoluciones(id) ON DELETE CASCADE
    )
    """)


    # ==========================================
    # MÓDULO DE DEVOLUCIONES DE COMPRAS (PROVEEDORES)
    # ==========================================
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS devoluciones_compras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_devolucion TEXT UNIQUE NOT NULL,
        compra_id INTEGER,
        numero_factura_proveedor TEXT,
        numero_control_compra TEXT,
        proveedor_id INTEGER NOT NULL,
        proveedor_nombre TEXT NOT NULL,
        proveedor_rif TEXT,
        proveedor_telefono TEXT,
        fecha_emision TEXT NOT NULL,
        fecha_compra_original TEXT,
        tipo_devolucion TEXT NOT NULL DEFAULT 'parcial' CHECK(tipo_devolucion IN ('total', 'parcial')),
        motivo TEXT NOT NULL,
        subtotal_usd REAL NOT NULL DEFAULT 0.0,
        iva_usd REAL NOT NULL DEFAULT 0.0,
        total_usd REAL NOT NULL DEFAULT 0.0,
        tasa_ves REAL NOT NULL DEFAULT 0.0,
        tasa_cop REAL NOT NULL DEFAULT 0.0,
        total_ves REAL NOT NULL DEFAULT 0.0,
        total_cop REAL NOT NULL DEFAULT 0.0,
        monto_descontado_cxp REAL NOT NULL DEFAULT 0.0,
        monto_saldo_favor REAL NOT NULL DEFAULT 0.0,
        estado TEXT NOT NULL DEFAULT 'activa' CHECK(estado IN ('activa', 'anulada')),
        motivo_anulacion TEXT,
        fecha_anulacion TEXT,
        usuario_id INTEGER DEFAULT 1,
        notas TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE SET NULL,
        FOREIGN KEY (proveedor_id) REFERENCES proveedores(id)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_dev_compra_prov ON devoluciones_compras(proveedor_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_dev_compra_comp ON devoluciones_compras(compra_id)")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS devolucion_compra_detalles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        devolucion_compra_id INTEGER NOT NULL,
        compra_detalle_id INTEGER,
        producto_id INTEGER NOT NULL,
        codigo TEXT,
        nombre_producto TEXT NOT NULL,
        impuesto_tipo TEXT NOT NULL DEFAULT 'exento' CHECK(impuesto_tipo IN ('gravado', 'exento')),
        cantidad REAL NOT NULL,
        costo_unitario REAL NOT NULL,
        iva_unitario REAL NOT NULL DEFAULT 0.0,
        subtotal REAL NOT NULL,
        total REAL NOT NULL,
        FOREIGN KEY (devolucion_compra_id) REFERENCES devoluciones_compras(id) ON DELETE CASCADE,
        FOREIGN KEY (compra_detalle_id) REFERENCES compra_detalles(id) ON DELETE SET NULL,
        FOREIGN KEY (producto_id) REFERENCES productos(id)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_dev_comp_det_id ON devolucion_compra_detalles(devolucion_compra_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_dev_comp_det_prod ON devolucion_compra_detalles(producto_id)")

    # ==========================================
    # LIBRO MAYOR DE INVENTARIO (FASE 2A)
    # ==========================================
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS inventario_movimientos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT NOT NULL,
        producto_id INTEGER NOT NULL,
        tipo_movimiento TEXT NOT NULL CHECK(tipo_movimiento IN (
            'inventario_inicial',
            'compra',
            'venta',
            'devolucion_cliente',
            'devolucion_proveedor',
            'cargo_ajuste',
            'descargo_merma',
            'descargo_vencimiento',
            'descargo_rotura',
            'descargo_uso_interno',
            'APERTURA_MIGRACION'
        )),
        sentido TEXT NOT NULL CHECK(sentido IN ('ENTRADA', 'SALIDA')),
        cantidad REAL NOT NULL CHECK(cantidad > 0),
        costo_unitario REAL NOT NULL DEFAULT 0.0 CHECK(costo_unitario >= 0),
        costo_total REAL NOT NULL DEFAULT 0.0 CHECK(costo_total >= 0),
        stock_anterior REAL NOT NULL DEFAULT 0.0,
        stock_nuevo REAL NOT NULL DEFAULT 0.0,
        documento_tipo TEXT NOT NULL,
        documento_id INTEGER,
        documento_numero TEXT,
        motivo TEXT,
        usuario_id INTEGER,
        documento_linea_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE RESTRICT
    )
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_inv_mov_prod_fecha ON inventario_movimientos(producto_id, fecha)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_inv_mov_doc ON inventario_movimientos(documento_tipo, documento_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_inv_mov_fecha ON inventario_movimientos(fecha)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_inv_mov_prod_fecha_id ON inventario_movimientos(producto_id, fecha, id)")

    # Tabla de Control de Migraciones de Inventario
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS inventario_migraciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        version TEXT NOT NULL,
        fecha_corte TEXT NOT NULL,
        estado TEXT NOT NULL CHECK(estado IN ('PENDIENTE', 'COMPLETADO', 'FALLIDO')),
        registros_generados INTEGER DEFAULT 0,
        observaciones TEXT
    )
    """)

    # ==========================================
    # TABLAS DE AJUSTES DE INVENTARIO (FASE 2C / FASE 2F-5B)
    # ==========================================
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS inventario_ajustes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_ajuste TEXT UNIQUE NOT NULL,
        fecha TEXT NOT NULL,
        tipo_ajuste TEXT NOT NULL CHECK(tipo_ajuste IN ('CARGO', 'DESCARGO')),
        motivo TEXT NOT NULL,
        observaciones TEXT,
        subtipo_ajuste TEXT,
        documento_referencia TEXT,
        autorizado_por TEXT,
        estado TEXT DEFAULT 'activo',
        idempotency_key TEXT,
        ajuste_referencia_id INTEGER,
        motivo_anulacion TEXT,
        fecha_anulacion TEXT,
        usuario_anulacion_id INTEGER,
        usuario_id INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS inventario_ajuste_detalles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ajuste_id INTEGER NOT NULL,
        producto_id INTEGER NOT NULL,
        cantidad REAL NOT NULL CHECK(cantidad > 0),
        costo_unitario REAL NOT NULL DEFAULT 0.0,
        costo_total REAL NOT NULL DEFAULT 0.0,
        stock_anterior REAL NOT NULL DEFAULT 0.0,
        stock_nuevo REAL NOT NULL DEFAULT 0.0,
        motivo_detalle TEXT,
        subtipo_movimiento TEXT,
        cpp_anterior REAL,
        cpp_nuevo REAL,
        FOREIGN KEY (ajuste_id) REFERENCES inventario_ajustes(id) ON DELETE CASCADE,
        FOREIGN KEY (producto_id) REFERENCES productos(id)
    )
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_inv_ajustes_fecha ON inventario_ajustes(fecha)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_inv_ajuste_det_ajuste ON inventario_ajuste_detalles(ajuste_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_inv_ajuste_det_prod ON inventario_ajuste_detalles(producto_id)")

    # ==========================================
    # TABLA DE APERTURA CERTIFICADA CPP (FASE 2F-1B)
    # ==========================================
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS inventario_saldos_apertura_cpp (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha_corte TEXT NOT NULL,
        ultimo_movimiento_id_corte INTEGER NOT NULL,
        producto_id INTEGER NOT NULL,
        sku TEXT NOT NULL,
        stock_apertura REAL NOT NULL,
        costo_unitario_apertura REAL NOT NULL,
        valor_apertura REAL NOT NULL,
        moneda TEXT NOT NULL DEFAULT 'USD',
        fuente_valor TEXT NOT NULL,
        certificado_por TEXT NOT NULL,
        certificado_at TEXT NOT NULL,
        observacion TEXT,
        checksum TEXT NOT NULL,
        UNIQUE(fecha_corte, producto_id),
        FOREIGN KEY (producto_id) REFERENCES productos(id)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_inv_apertura_corte ON inventario_saldos_apertura_cpp(fecha_corte, producto_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_inv_apertura_sku ON inventario_saldos_apertura_cpp(sku)")

    # ========================================================
    # FASE 2F-6C: MODELO FINANCIERO, PAGOS N:M Y TESORERÍA
    # ========================================================
    # 1. Cuentas de Tesorería (Cajas, Bancos, Billeteras)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS cuentas_tesoreria (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL UNIQUE,
        tipo TEXT NOT NULL CHECK(tipo IN ('caja_efectivo', 'cuenta_bancaria', 'billetera_digital', 'punto_venta')),
        moneda TEXT NOT NULL CHECK(moneda IN ('USD', 'VES', 'COP', 'EUR')),
        banco_entidad TEXT,
        numero_cuenta_enmascarado TEXT,
        saldo_actual REAL NOT NULL DEFAULT 0.0,
        activo INTEGER NOT NULL DEFAULT 1,
        permite_sobregiro INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cuentas_tesoreria_tipo ON cuentas_tesoreria(tipo, moneda)")

    # 2. Historial Inmutable de Tasas de Cambio
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tasas_historial (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        moneda_origen TEXT NOT NULL DEFAULT 'USD',
        moneda_destino TEXT NOT NULL CHECK(moneda_destino IN ('VES', 'COP', 'EUR')),
        tasa REAL NOT NULL CHECK(tasa > 0),
        fecha_vigencia_desde TIMESTAMP NOT NULL,
        fuente TEXT NOT NULL DEFAULT 'OFICIAL',
        usuario_id INTEGER DEFAULT 1,
        motivo_actualizacion TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_tasas_historial_consulta ON tasas_historial(moneda_destino, fecha_vigencia_desde DESC)")

    # 3. Entidad Central de Pagos y Cobros
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS pagos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_pago TEXT UNIQUE NOT NULL,
        tipo_operacion TEXT NOT NULL CHECK(tipo_operacion IN ('cobro_cliente', 'pago_proveedor', 'anticipo_cliente', 'anticipo_proveedor')),
        tercero_tipo TEXT NOT NULL CHECK(tercero_tipo IN ('cliente', 'proveedor', 'otro')),
        tercero_id INTEGER NOT NULL,
        fecha_pago TIMESTAMP NOT NULL,
        concepto TEXT NOT NULL,
        monto_total_equivalente_usd REAL NOT NULL CHECK(monto_total_equivalente_usd >= 0),
        monto_aplicado_usd REAL NOT NULL DEFAULT 0.0 CHECK(monto_aplicado_usd >= 0),
        monto_no_aplicado_usd REAL NOT NULL DEFAULT 0.0 CHECK(monto_no_aplicado_usd >= 0),
        estado TEXT NOT NULL DEFAULT 'activo' CHECK(estado IN ('activo', 'anulado', 'conciliado')),
        idempotency_key TEXT UNIQUE,
        usuario_id INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        anulado_at TIMESTAMP,
        anulado_by INTEGER,
        motivo_anulacion TEXT
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pagos_tercero ON pagos(tercero_tipo, tercero_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pagos_fecha ON pagos(fecha_pago)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pagos_idempotency ON pagos(idempotency_key)")

    # 4. Desglose de Monedas del Pago (Líneas Monetarias)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS pago_detalles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pago_id INTEGER NOT NULL,
        cuenta_tesoreria_id INTEGER NOT NULL,
        moneda TEXT NOT NULL CHECK(moneda IN ('USD', 'VES', 'COP', 'EUR')),
        monto_moneda REAL NOT NULL CHECK(monto_moneda > 0),
        tasa_cambio REAL NOT NULL CHECK(tasa_cambio > 0),
        equivalente_usd REAL NOT NULL CHECK(equivalente_usd > 0),
        metodo_pago TEXT NOT NULL,
        referencia_bancaria TEXT,
        tasa_sugerida REAL,
        tasa_override INTEGER DEFAULT 0,
        motivo_override TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pago_id) REFERENCES pagos(id) ON DELETE CASCADE,
        FOREIGN KEY (cuenta_tesoreria_id) REFERENCES cuentas_tesoreria(id)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pago_detalles_pago ON pago_detalles(pago_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pago_detalles_cuenta ON pago_detalles(cuenta_tesoreria_id)")

    # 5. Matriz de Aplicación N:M a Documentos (Facturas, Compras, Gastos)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS pago_aplicaciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pago_id INTEGER NOT NULL,
        documento_tipo TEXT NOT NULL CHECK(documento_tipo IN ('factura', 'compra', 'gasto')),
        documento_id INTEGER NOT NULL,
        cuenta_por_cobrar_id INTEGER,
        cuenta_por_pagar_id INTEGER,
        monto_aplicado_usd REAL NOT NULL CHECK(monto_aplicado_usd > 0),
        fecha_aplicacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        estado TEXT NOT NULL DEFAULT 'activa' CHECK(estado IN ('activa', 'revertida')),
        revertido_at TIMESTAMP,
        revertido_motivo TEXT,
        FOREIGN KEY (pago_id) REFERENCES pagos(id) ON DELETE CASCADE,
        FOREIGN KEY (cuenta_por_cobrar_id) REFERENCES cuentas_por_cobrar(id),
        FOREIGN KEY (cuenta_por_pagar_id) REFERENCES cuentas_por_pagar(id)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pago_aplicaciones_doc ON pago_aplicaciones(documento_tipo, documento_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pago_aplicaciones_cxc ON pago_aplicaciones(cuenta_por_cobrar_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pago_aplicaciones_cxp ON pago_aplicaciones(cuenta_por_pagar_id)")

    # 6. Anticipos y Saldos a Favor de Clientes y Proveedores
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS anticipos_clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tercero_tipo TEXT NOT NULL DEFAULT 'cliente' CHECK(tercero_tipo IN ('cliente', 'proveedor')),
        tercero_id INTEGER NOT NULL,
        pago_origen_id INTEGER NOT NULL,
        monto_original_usd REAL NOT NULL CHECK(monto_original_usd > 0),
        saldo_disponible_usd REAL NOT NULL CHECK(saldo_disponible_usd >= 0),
        estado TEXT NOT NULL DEFAULT 'disponible' CHECK(estado IN ('disponible', 'aplicado_parcial', 'agotado', 'reembolsado')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pago_origen_id) REFERENCES pagos(id)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_anticipos_tercero ON anticipos_clientes(tercero_tipo, tercero_id, estado)")

    # 7. Libro Mayor Auxiliar de Tesorería (Kardex Financiero)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tesoreria_movimientos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cuenta_tesoreria_id INTEGER NOT NULL,
        tipo_movimiento TEXT NOT NULL CHECK(tipo_movimiento IN ('ingreso', 'egreso', 'transferencia_salida', 'transferencia_entrada', 'ajuste_arqueo')),
        origen_modulo TEXT NOT NULL CHECK(origen_modulo IN ('ventas_pos', 'cobro_cxc', 'compras', 'pago_cxp', 'gasto_operativo', 'caja_arqueo', 'transferencia_interna')),
        origen_id INTEGER,
        pago_detalle_id INTEGER,
        fecha_movimiento TIMESTAMP NOT NULL,
        descripcion TEXT NOT NULL,
        monto_moneda REAL NOT NULL CHECK(monto_moneda > 0),
        saldo_anterior REAL NOT NULL,
        saldo_nuevo REAL NOT NULL,
        tasa_cambio REAL NOT NULL,
        equivalente_usd REAL NOT NULL,
        usuario_id INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cuenta_tesoreria_id) REFERENCES cuentas_tesoreria(id),
        FOREIGN KEY (pago_detalle_id) REFERENCES pago_detalles(id)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_tesoreria_movimientos_cuenta ON tesoreria_movimientos(cuenta_tesoreria_id, fecha_movimiento DESC)")

    # 8. Control de Turnos y Cajas (Aperturas, Arqueos y Cierres)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS caja_aperturas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cuenta_tesoreria_id INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL,
        fecha_apertura TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        monto_inicial_usd REAL NOT NULL DEFAULT 0.0,
        monto_inicial_moneda REAL NOT NULL DEFAULT 0.0,
        estado TEXT NOT NULL DEFAULT 'abierta' CHECK(estado IN ('abierta', 'cerrada')),
        notas_apertura TEXT,
        FOREIGN KEY (cuenta_tesoreria_id) REFERENCES cuentas_tesoreria(id)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_caja_aperturas_estado ON caja_aperturas(cuenta_tesoreria_id, estado)")

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS caja_cierres (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        caja_apertura_id INTEGER NOT NULL,
        fecha_cierre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        saldo_teorico_usd REAL NOT NULL,
        saldo_teorico_moneda REAL NOT NULL,
        saldo_real_fisico_usd REAL NOT NULL,
        saldo_real_fisico_moneda REAL NOT NULL,
        diferencia_usd REAL NOT NULL,
        diferencia_moneda REAL NOT NULL,
        estado_arqueo TEXT NOT NULL CHECK(estado_arqueo IN ('cuadrado', 'sobrante', 'faltante')),
        notas_cierre TEXT,
        cerrado_by INTEGER NOT NULL,
        FOREIGN KEY (caja_apertura_id) REFERENCES caja_aperturas(id)
    )
    """)

    # 9. Gastos Operativos Desacoplados de Proveedores de Inventario
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS gastos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_gasto TEXT UNIQUE NOT NULL,
        categoria_gasto TEXT NOT NULL,
        beneficiario TEXT NOT NULL,
        beneficiario_rif TEXT,
        tipo_pago TEXT NOT NULL CHECK(tipo_pago IN ('contado', 'credito')),
        moneda TEXT NOT NULL CHECK(moneda IN ('USD', 'VES', 'COP')),
        monto_total_moneda REAL NOT NULL CHECK(monto_total_moneda > 0),
        tasa_cambio REAL NOT NULL CHECK(tasa_cambio > 0),
        monto_total_usd REAL NOT NULL CHECK(monto_total_usd > 0),
        numero_factura_fiscal TEXT,
        numero_control TEXT,
        concepto TEXT NOT NULL,
        cuenta_tesoreria_id INTEGER,
        cuenta_por_pagar_id INTEGER,
        usuario_id INTEGER NOT NULL DEFAULT 1,
        fecha_emision TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        estado TEXT NOT NULL DEFAULT 'activo' CHECK(estado IN ('activo', 'anulado')),
        FOREIGN KEY (cuenta_tesoreria_id) REFERENCES cuentas_tesoreria(id),
        FOREIGN KEY (cuenta_por_pagar_id) REFERENCES cuentas_por_pagar(id)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha_emision)")

    # 10. Auditoría de Diferencias Cambiarias
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS diferencial_cambiario_movimientos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pago_id INTEGER NOT NULL,
        factura_id INTEGER,
        monto_usd_amortizado REAL NOT NULL,
        tasa_facturacion REAL NOT NULL,
        tasa_pago REAL NOT NULL,
        diferencial_ves REAL NOT NULL,
        tipo_diferencial TEXT NOT NULL CHECK(tipo_diferencial IN ('ganancia_cambiaria', 'perdida_cambiaria')),
        fecha_operacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (pago_id) REFERENCES pagos(id),
        FOREIGN KEY (factura_id) REFERENCES facturas(id)
    )
    """)

    # 11. Períodos Financieros
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS periodos_financieros (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo_periodo TEXT UNIQUE NOT NULL,
        fecha_inicio DATE NOT NULL,
        fecha_fin DATE NOT NULL,
        estado TEXT NOT NULL DEFAULT 'abierto' CHECK(estado IN ('abierto', 'cerrado')),
        cerrado_at TIMESTAMP,
        cerrado_by INTEGER,
        motivo_reapertura TEXT
    )
    """)

    # Sembrar Cuentas de Tesorería por Defecto si está vacío
    cursor.execute("SELECT COUNT(*) FROM cuentas_tesoreria")
    if cursor.fetchone()[0] == 0:
        cursor.executemany("""
        INSERT INTO cuentas_tesoreria (nombre, tipo, moneda, banco_entidad, saldo_actual, activo)
        VALUES (?, ?, ?, ?, 0.0, 1)
        """, [
            ('Caja Principal USD (Efectivo)', 'caja_efectivo', 'USD', 'Efectivo en Caja'),
            ('Caja Mostrador Bs. (Efectivo)', 'caja_efectivo', 'VES', 'Efectivo en Caja'),
            ('Banco Cuenta Corriente Bs. (Pago Móvil / Transf)', 'cuenta_bancaria', 'VES', 'Banco Nacional'),
            ('Caja Pesos COP (Efectivo)', 'caja_efectivo', 'COP', 'Efectivo en Caja')
        ])

    # Sembrar configuración inicial si no existe
    cursor.execute("SELECT COUNT(*) FROM configuracion")
    if cursor.fetchone()[0] == 0:
        tema_zen = json.dumps({
            "sidebarBg": "#ffffff",
            "sidebarText": "#1e293b",
            "primaryColor": "#14b8a6",
            "primaryHover": "#0d9488",
            "bgApp": "#f8fafc",
            "headerBg": "#ffffff",
            "btnFactura": "#14b8a6",
            "btnCompra": "#0ea5e9",
            "btnCxc": "#10b981",
            "btnCxp": "#64748b",
            "btnDevoluciones": "#06b6d4",
            "btnKardex": "#14b8a6",
            "btnFiscal": "#0284c7"
        })
        cursor.execute("""
        INSERT INTO configuracion (id, nombre_negocio, documento_fiscal, telefono, direccion, iva_porcentaje, tasa_ves, tasa_cop, moneda_principal, tema, tema_config)
        VALUES (1, 'Mi Negocio Comercial', 'J-12345678-9', '+58 412 0000000', 'Av. Principal, Edificio Central, Local 1', 16.0, 45.00, 4100.00, 'USD', ?, ?)
        """, (tema_zen, tema_zen))

    # Sembrar categorías base si está vacío
    cursor.execute("SELECT COUNT(*) FROM categorias")
    if cursor.fetchone()[0] == 0:
        cursor.executemany("""
        INSERT INTO categorias (nombre, tipo, descripcion) VALUES (?, ?, ?)
        """, [
            ('Servicios Generales', 'servicio', 'Servicios profesionales, soporte técnico y mano de obra (No controlan stock)'),
            ('Productos & Mercancía', 'producto', 'Artículos físicos con control de inventario y existencia (Controlan stock)')
        ])

    # Tabla de Configuración de Formatos de Impresión por Tenant
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tenant_config_impresion (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        color_primario TEXT NOT NULL DEFAULT '#0f172a',
        mostrar_sku INTEGER NOT NULL DEFAULT 1,
        mostrar_vendedor INTEGER NOT NULL DEFAULT 1,
        mostrar_descuento_linea INTEGER NOT NULL DEFAULT 1,
        logo_alineacion TEXT NOT NULL DEFAULT 'centro' CHECK(logo_alineacion IN ('izquierda', 'centro', 'derecha')),
        texto_footer_factura TEXT NOT NULL DEFAULT 'Gracias por su compra. Conserve esta factura como comprobante de garantía.',
        texto_header_ticket TEXT NOT NULL DEFAULT '*** COMPROBANTE DE COMPRA ***',
        texto_footer_ticket TEXT NOT NULL DEFAULT '*** GRACIAS POR SU PREFERENCIA ***',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    cursor.execute("SELECT COUNT(*) FROM tenant_config_impresion WHERE tenant_id = 1")
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
        INSERT INTO tenant_config_impresion (
            tenant_id, color_primario, mostrar_sku, mostrar_vendedor, mostrar_descuento_linea,
            logo_alineacion, texto_footer_factura, texto_header_ticket, texto_footer_ticket
        ) VALUES (
            1, '#0f172a', 1, 1, 1, 'centro',
            'Gracias por su compra. Conserve esta factura como comprobante de garantía.',
            '*** COMPROBANTE DE COMPRA ***',
            '*** GRACIAS POR SU PREFERENCIA ***'
        )
        """)

    # Sembrar 1 cliente genérico de contado para facturación rápida
    
    # Módulo de Tesorería y Control de Caja (Apertura, Movimientos y Cierre Z)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS cajas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        nombre TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    cursor.execute("SELECT COUNT(*) FROM cajas WHERE id = 1")
    if cursor.fetchone()[0] == 0:
        cursor.execute("INSERT INTO cajas (id, tenant_id, nombre, is_active) VALUES (1, 1, 'Caja Principal', 1)")

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS turnos_caja (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        caja_id INTEGER NOT NULL DEFAULT 1,
        usuario_id INTEGER NOT NULL,
        fecha_apertura TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        fecha_cierre TIMESTAMP NULL,
        fondo_inicial_usd REAL NOT NULL DEFAULT 0.0,
        fondo_inicial_ves REAL NOT NULL DEFAULT 0.0,
        estado TEXT NOT NULL CHECK(estado IN ('ABIERTO', 'CERRADO')) DEFAULT 'ABIERTO',
        totales_esperados_json TEXT NULL,
        totales_declarados_json TEXT NULL,
        diferencias_json TEXT NULL,
        notas TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (caja_id) REFERENCES cajas(id),
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS movimientos_caja (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        turno_id INTEGER NOT NULL,
        tipo TEXT NOT NULL CHECK(tipo IN ('INGRESO', 'EGRESO')),
        concepto TEXT NOT NULL,
        metodo_pago TEXT NOT NULL,
        moneda TEXT NOT NULL CHECK(moneda IN ('USD', 'VES', 'COP')),
        monto REAL NOT NULL,
        referencia TEXT NULL,
        factura_id_ref INTEGER NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (turno_id) REFERENCES turnos_caja(id) ON DELETE CASCADE
    )
    ''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS login_intentos (
        clave TEXT PRIMARY KEY,
        intentos INTEGER NOT NULL DEFAULT 0,
        bloqueado_hasta INTEGER NOT NULL DEFAULT 0,
        ultimo_intento INTEGER NOT NULL DEFAULT 0
    )
    ''')

    cursor.execute("SELECT COUNT(*) FROM clientes")
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
        INSERT INTO clientes (nombre, cedula, telefono, correo, direccion)
        VALUES (?, ?, ?, ?, ?)
        """, ('Cliente Ocasional / Contado', 'V-00000000', '+58 412 0000000', 'cliente@ejemplo.com', 'Ventas de mostrador'))

    conn.commit()
    conn.close()

def limpiar_transacciones_db(confirmacion=""):
    """
    Limpia transacciones para pruebas de Beta Tester.
    PROTECCIÓN CRÍTICA: Exige confirmacion == 'CONFIRMAR_BORRADO_TOTAL_AUTORIZADO' para evitar pérdidas accidentales.
    """
    if confirmacion != "CONFIRMAR_BORRADO_TOTAL_AUTORIZADO":
        raise PermissionError("Acción bloqueada: Debe proporcionar la frase de seguridad 'CONFIRMAR_BORRADO_TOTAL_AUTORIZADO'.")

    conn = get_connection()
    c = conn.cursor()
    tablas = [
        "inventario_ajuste_detalles", "inventario_ajustes",
        "inventario_movimientos", "inventario_migraciones",
        "factura_pagos", "factura_detalles", "facturas",
        "compra_pagos", "compra_detalles", "compras",
        "abono_cxc_pagos", "abonos_cxc", "cuentas_por_cobrar",
        "abono_cxp_pagos", "abonos_cxp", "cuentas_por_pagar",
        "devolucion_pagos", "devolucion_detalles", "devoluciones",
        "notas_ajuste_comercial"
    ]
    for t in tablas:
        try:
            c.execute(f"DELETE FROM {t}")
        except Exception:
            pass
    # Reiniciar stock a 0
    c.execute("UPDATE productos SET stock = 0")
    conn.commit()
    conn.close()
    sync_to_supabase_storage()
    return True

def restablecer_fabrica_db(confirmacion=""):
    """
    Restaura completamente la base de datos limpia de fábrica.
    PROTECCIÓN CRÍTICA: Exige confirmacion == 'CONFIRMAR_RESTABLECER_FABRICA_AUTORIZADO'.
    """
    if confirmacion not in ["CONFIRMAR_RESTABLECER_FABRICA_AUTORIZADO", "CONFIRMAR_BORRADO_TOTAL_AUTORIZADO"]:
        raise PermissionError("Acción bloqueada: Debe proporcionar la frase de seguridad 'CONFIRMAR_RESTABLECER_FABRICA_AUTORIZADO'.")

    cleanup_wal_sidecars(DB_PATH)
    from crear_base_datos_limpia import crear_base_limpia
    crear_base_limpia(DB_PATH)
    auditar_y_migrar_db()
    sync_to_supabase_storage()
    return True

# ========================================================
# FUNCIONES TRANSACCIONALES DE INVENTARIO (FASE 2A Y 2B)
# ========================================================

def registrar_movimiento_inventario(
    cursor,
    producto_id,
    fecha,
    tipo_movimiento,
    sentido,
    cantidad,
    costo_unitario,
    costo_total,
    stock_anterior,
    stock_nuevo,
    documento_tipo,
    documento_id,
    documento_numero=None,
    motivo=None,
    usuario_id=1,
    documento_linea_id=None,
    subtipo_movimiento=None,
    cpp_anterior=None,
    cpp_nuevo=None
):
    """
    Función central para registrar movimientos en el libro mayor persistente (FASE 2B / 2F-2B / 2F-5B).
    - Valida producto y tipo (omite servicios según Regla 22).
    - Valida cantidad > 0.
    - Valida sentido ('ENTRADA' o 'SALIDA').
    - Valida tipo_movimiento.
    - Idempotencia / Protección contra duplicados (Sección 8 / Fase 2F-2B):
      Si viene documento_linea_id, valida exactitud por línea física de documento.
      Si no viene, valida por (documento_tipo, documento_id, producto_id, tipo_movimiento).
    - Inserta el registro inmutable en inventario_movimientos incluyendo subtipo_movimiento y trazabilidad CPP si las columnas existen.
    - No realiza commit directo: opera dentro de la transacción activa del llamador (Principio de Atomicidad).
    """
    cursor.execute("SELECT id, tipo, stock, costo FROM productos WHERE id = ?", (producto_id,))
    prod = cursor.fetchone()
    if not prod:
        raise ValueError(f"Producto ID {producto_id} no existe en catálogo")
    
    prod_dict = dict(prod)
    if prod_dict["tipo"] == "servicio":
        return None

    cant = float(cantidad)
    if cant <= 0:
        raise ValueError(f"La cantidad del movimiento debe ser mayor a 0, recibido: {cant}")

    sent = str(sentido).strip().upper()
    if sent not in ("ENTRADA", "SALIDA"):
        raise ValueError(f"Sentido inválido: {sentido}. Debe ser 'ENTRADA' o 'SALIDA'.")

    tipos_validos = (
        'inventario_inicial', 'compra', 'venta', 
        'devolucion_cliente', 'devolucion_proveedor', 
        'cargo_ajuste', 'cargo_ajuste_sobrante', 'cargo_ajuste_hallazgo',
        'sobrante_conteo', 'hallazgo_mercancia', 'tasacion_manual',
        'descargo', 'descargo_ajuste',
        'descargo_merma', 'descargo_vencimiento', 
        'descargo_rotura', 'descargo_uso_interno', 'APERTURA_MIGRACION', 'anulacion_venta', 'anulacion_devolucion', 'anulacion_compra'
    )
    if tipo_movimiento not in tipos_validos:
        raise ValueError(f"Tipo de movimiento inválido: {tipo_movimiento}")

    # Protección contra duplicados (Sección 8 / Fase 2F-2B: soporte para múltiples líneas del mismo SKU)
    if documento_linea_id is not None:
        cursor.execute("""
            SELECT id FROM inventario_movimientos 
            WHERE documento_tipo = ? AND documento_id = ? AND producto_id = ? AND tipo_movimiento = ? AND documento_linea_id = ?
        """, (documento_tipo, documento_id, producto_id, tipo_movimiento, documento_linea_id))
    else:
        cursor.execute("""
            SELECT id FROM inventario_movimientos 
            WHERE documento_tipo = ? AND documento_id = ? AND producto_id = ? AND tipo_movimiento = ?
        """, (documento_tipo, documento_id, producto_id, tipo_movimiento))
    existente = cursor.fetchone()
    if existente:
        return existente[0]

    c_unit = max(0.0, float(costo_unitario or 0.0))
    c_tot = max(0.0, float(costo_total if costo_total is not None else round(cant * c_unit, 2)))
    stk_ant = float(stock_anterior)
    stk_nue = float(stock_nuevo)
    fec = str(fecha) if fecha else datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    cursor.execute("PRAGMA table_info(inventario_movimientos)")
    cols_mov = {r[1] for r in cursor.fetchall()}

    if "subtipo_movimiento" in cols_mov and "cpp_anterior" in cols_mov and "cpp_nuevo" in cols_mov:
        cursor.execute("""
            INSERT INTO inventario_movimientos (
                fecha, producto_id, tipo_movimiento, sentido, cantidad,
                costo_unitario, costo_total, stock_anterior, stock_nuevo,
                documento_tipo, documento_id, documento_numero, motivo, usuario_id,
                documento_linea_id, subtipo_movimiento, cpp_anterior, cpp_nuevo
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            fec, producto_id, tipo_movimiento, sent, cant,
            c_unit, c_tot, stk_ant, stk_nue,
            documento_tipo, documento_id, documento_numero, motivo, usuario_id,
            documento_linea_id, subtipo_movimiento,
            float(cpp_anterior) if cpp_anterior is not None else None,
            float(cpp_nuevo) if cpp_nuevo is not None else None
        ))
    elif "subtipo_movimiento" in cols_mov:
        cursor.execute("""
            INSERT INTO inventario_movimientos (
                fecha, producto_id, tipo_movimiento, sentido, cantidad,
                costo_unitario, costo_total, stock_anterior, stock_nuevo,
                documento_tipo, documento_id, documento_numero, motivo, usuario_id,
                documento_linea_id, subtipo_movimiento
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            fec, producto_id, tipo_movimiento, sent, cant,
            c_unit, c_tot, stk_ant, stk_nue,
            documento_tipo, documento_id, documento_numero, motivo, usuario_id,
            documento_linea_id, subtipo_movimiento
        ))
    else:
        cursor.execute("""
            INSERT INTO inventario_movimientos (
                fecha, producto_id, tipo_movimiento, sentido, cantidad,
                costo_unitario, costo_total, stock_anterior, stock_nuevo,
                documento_tipo, documento_id, documento_numero, motivo, usuario_id,
                documento_linea_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            fec, producto_id, tipo_movimiento, sent, cant,
            c_unit, c_tot, stk_ant, stk_nue,
            documento_tipo, documento_id, documento_numero, motivo, usuario_id,
            documento_linea_id
        ))
    return cursor.lastrowid

def migrar_historico_inventario(conn=None, cursor=None, fecha_corte=None):
    """
    Migración histórica idempotente para FASE 2A:
    - Reconstruye ordenadamente movimientos históricos a partir de compras, ventas y devoluciones existentes.
    - Excluye productos tipo 'servicio' (Regla 22).
    - Registra para cada movimiento histórico:
        * Compras: ENTRADA al costo unitario registrado en compra_detalles.
        * Ventas: SALIDA con costo_unitario = 0.0 (debido a que el sistema histórico no preservaba costo a fecha de venta, Regla 10).
        * Devoluciones: ENTRADA con costo_unitario = 0.0 (condición física apto/dañado no determinada en origen, Regla 10).
    - Para cada producto físico, calcula el saldo reconstruido.
      Compara con productos.stock actual.
      Si diferencia != 0:
        Genera un movimiento de regularización:
        * tipo_movimiento: 'APERTURA_MIGRACION'
        * documento_tipo: 'APERTURA_MIGRACION'
        * sentido: 'ENTRADA' si diff > 0 else 'SALIDA'
        * cantidad: abs(diff)
        * costo_unitario: 0.0
        * fecha: fecha_corte
    - Idempotencia: Si la migración 'FASE_2A' ya figura como 'COMPLETADO' en inventario_migraciones,
      no duplica ningún movimiento y retorna estado previo.
    """
    should_close = False
    if conn is None:
        conn = get_connection()
        should_close = True
    if cursor is None:
        cursor = conn.cursor()

    if not fecha_corte:
        fecha_corte = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # 1. Idempotencia: Verificar si ya fue ejecutada
    cursor.execute("""
        SELECT id, version, fecha_corte, estado, registros_generados, observaciones 
        FROM inventario_migraciones 
        WHERE version = 'FASE_2A' AND estado = 'COMPLETADO'
    """)
    migracion_previa = cursor.fetchone()
    if migracion_previa:
        resultado = {
            "ya_ejecutado": True,
            "migracion_id": migracion_previa["id"],
            "version": migracion_previa["version"],
            "fecha_corte": migracion_previa["fecha_corte"],
            "registros_generados": migracion_previa["registros_generados"],
            "observaciones": migracion_previa["observaciones"],
            "mensaje": "La migración FASE_2A ya fue completada previamente. No se duplicaron movimientos."
        }
        if should_close:
            conn.close()
        return resultado

    # Obtener productos físicos (excluyendo servicios según Regla 22)
    cursor.execute("SELECT id, codigo, nombre, tipo, stock, costo FROM productos WHERE tipo != 'servicio' ORDER BY id ASC")
    productos = [dict(r) for r in cursor.fetchall()]
    running_stock = {p["id"]: 0.0 for p in productos}

    # Recopilar eventos históricos
    eventos = []

    # A. Compras
    cursor.execute("""
        SELECT 
            cd.id as detalle_id,
            c.id as compra_id,
            coalesce(c.numero_factura, 'COM-' || printf('%04d', c.id)) as doc_numero,
            c.fecha,
            cd.producto_id,
            cd.cantidad,
            cd.costo_unitario
        FROM compra_detalles cd
        JOIN compras c ON cd.compra_id = c.id
        JOIN productos p ON cd.producto_id = p.id
        WHERE p.tipo != 'servicio'
        ORDER BY c.fecha ASC, c.id ASC, cd.id ASC
    """)
    for r in cursor.fetchall():
        eventos.append({
            "fecha": str(r["fecha"] or "2026-01-01 00:00:00"),
            "tipo_evento": "compra",
            "tipo_movimiento": "compra",
            "sentido": "ENTRADA",
            "producto_id": r["producto_id"],
            "cantidad": float(r["cantidad"]),
            "costo_unitario": float(r["costo_unitario"] or 0.0),
            "costo_total": round(float(r["cantidad"]) * float(r["costo_unitario"] or 0.0), 2),
            "documento_tipo": "COMPRA",
            "documento_id": r["compra_id"],
            "documento_numero": r["doc_numero"],
            "motivo": "Migración histórica: Entrada por compra a proveedor",
            "orden_prioridad": 1,
            "ref_id": r["detalle_id"]
        })

    # B. Ventas (facturas no anuladas)
    cursor.execute("""
        SELECT 
            fd.id as detalle_id,
            f.id as factura_id,
            f.numero_factura as doc_numero,
            f.fecha,
            fd.producto_id,
            fd.cantidad
        FROM factura_detalles fd
        JOIN facturas f ON fd.factura_id = f.id
        JOIN productos p ON fd.producto_id = p.id
        WHERE p.tipo != 'servicio' AND coalesce(f.estado, '') != 'anulada'
        ORDER BY f.fecha ASC, f.id ASC, fd.id ASC
    """)
    for r in cursor.fetchall():
        eventos.append({
            "fecha": str(r["fecha"] or "2026-01-01 00:00:00"),
            "tipo_evento": "venta",
            "tipo_movimiento": "venta",
            "sentido": "SALIDA",
            "producto_id": r["producto_id"],
            "cantidad": float(r["cantidad"]),
            "costo_unitario": 0.0,  # Regla 10: Costo histórico no determinado en sistema origen
            "costo_total": 0.0,
            "documento_tipo": "FACTURA",
            "documento_id": r["factura_id"],
            "documento_numero": r["doc_numero"],
            "motivo": "Migración histórica: Salida por facturación al cliente (Costo histórico no determinado en sistema origen)",
            "orden_prioridad": 2,
            "ref_id": r["detalle_id"]
        })

    # C. Devoluciones de clientes
    cursor.execute("""
        SELECT 
            dd.id as detalle_id,
            d.id as devolucion_id,
            d.numero_devolucion as doc_numero,
            d.fecha_emision as fecha,
            dd.producto_id,
            dd.cantidad
        FROM devolucion_detalles dd
        JOIN devoluciones d ON dd.devolucion_id = d.id
        JOIN productos p ON dd.producto_id = p.id
        WHERE p.tipo != 'servicio'
        ORDER BY d.fecha_emision ASC, d.id ASC, dd.id ASC
    """)
    for r in cursor.fetchall():
        eventos.append({
            "fecha": str(r["fecha"] or "2026-01-01 00:00:00"),
            "tipo_evento": "devolucion_cliente",
            "tipo_movimiento": "devolucion_cliente",
            "sentido": "ENTRADA",
            "producto_id": r["producto_id"],
            "cantidad": float(r["cantidad"]),
            "costo_unitario": 0.0,  # Regla 10: Condición física apto/dañado no determinada
            "costo_total": 0.0,
            "documento_tipo": "DEVOLUCION",
            "documento_id": r["devolucion_id"],
            "documento_numero": r["doc_numero"],
            "motivo": "Migración histórica: Entrada por devolución de cliente (Condición física apto/dañado no determinada en sistema origen)",
            "orden_prioridad": 3,
            "ref_id": r["detalle_id"]
        })

    # Ordenar estrictamente cronológico determinista
    eventos.sort(key=lambda x: (x["fecha"], x["orden_prioridad"], x["ref_id"]))

    cant_compras = 0
    cant_ventas = 0
    cant_devoluciones = 0
    cant_regularizaciones = 0
    total_movimientos = 0

    # Insertar movimientos históricos
    for ev in eventos:
        pid = ev["producto_id"]
        ant = running_stock[pid]
        cant = ev["cantidad"]
        if ev["sentido"] == "ENTRADA":
            nuevo = round(ant + cant, 4)
            running_stock[pid] = nuevo
            if ev["tipo_evento"] == "compra":
                cant_compras += 1
            elif ev["tipo_evento"] == "devolucion_cliente":
                cant_devoluciones += 1
        else:
            nuevo = round(ant - cant, 4)
            running_stock[pid] = nuevo
            cant_ventas += 1

        cursor.execute("""
            INSERT INTO inventario_movimientos (
                fecha, producto_id, tipo_movimiento, sentido, cantidad,
                costo_unitario, costo_total, stock_anterior, stock_nuevo,
                documento_tipo, documento_id, documento_numero, motivo, usuario_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        """, (
            ev["fecha"], pid, ev["tipo_movimiento"], ev["sentido"], cant,
            ev["costo_unitario"], ev["costo_total"], ant, nuevo,
            ev["documento_tipo"], ev["documento_id"], ev["documento_numero"], ev["motivo"]
        ))
        total_movimientos += 1

    # D. Regularización de Apertura por Migración (Secciones 13, 14, 15)
    for prod in productos:
        pid = prod["id"]
        stock_fisico = float(prod.get("stock") or 0.0)
        reconstruido = running_stock[pid]
        diferencia = round(stock_fisico - reconstruido, 4)

        if abs(diferencia) > 0.0001:
            if diferencia > 0:
                sentido = "ENTRADA"
                cant_reg = diferencia
                nuevo = round(reconstruido + cant_reg, 4)
            else:
                sentido = "SALIDA"
                cant_reg = abs(diferencia)
                nuevo = round(reconstruido - cant_reg, 4)

            cursor.execute("""
                INSERT INTO inventario_movimientos (
                    fecha, producto_id, tipo_movimiento, sentido, cantidad,
                    costo_unitario, costo_total, stock_anterior, stock_nuevo,
                    documento_tipo, documento_id, documento_numero, motivo, usuario_id
                ) VALUES (?, ?, 'APERTURA_MIGRACION', ?, ?, 0.0, 0.0, ?, ?, 'APERTURA_MIGRACION', ?, ?, ?, 1)
            """, (
                fecha_corte, pid, sentido, cant_reg, reconstruido, nuevo,
                pid, f"REG-MIG-{prod['codigo']}",
                "Regularización de apertura por migración Fase 2A (Diferencia histórica no documentada)"
            ))
            running_stock[pid] = nuevo
            cant_regularizaciones += 1
            total_movimientos += 1

    # Registrar en inventario_migraciones
    obs = f"Compras: {cant_compras}, Ventas: {cant_ventas}, Devoluciones: {cant_devoluciones}, Regularizaciones: {cant_regularizaciones}"
    cursor.execute("""
        INSERT INTO inventario_migraciones (
            version, fecha_corte, estado, registros_generados, observaciones
        ) VALUES ('FASE_2A', ?, 'COMPLETADO', ?, ?)
    """, (fecha_corte, total_movimientos, obs))
    migracion_id = cursor.lastrowid

    conn.commit()

    resultado = {
        "ya_ejecutado": False,
        "migracion_id": migracion_id,
        "version": "FASE_2A",
        "fecha_corte": fecha_corte,
        "compras_migradas": cant_compras,
        "ventas_migradas": cant_ventas,
        "devoluciones_migradas": cant_devoluciones,
        "regularizaciones_generadas": cant_regularizaciones,
        "total_registros_generados": total_movimientos,
        "observaciones": obs,
        "mensaje": "Migración histórica FASE_2A completada exitosamente."
    }

    if should_close:
        conn.close()

    return resultado

def conciliar_inventario(conn=None, cursor=None):
    """
    Compara para cada producto:
    - productos.stock (stock registrado en catálogo)
    - SUM(entradas) - SUM(salidas) en inventario_movimientos
    Determina si estado es 'OK' o 'DIFERENCIA'.
    """
    should_close = False
    if conn is None:
        conn = get_connection()
        should_close = True
    if cursor is None:
        cursor = conn.cursor()

    cursor.execute("""
        SELECT 
            p.id, 
            p.codigo, 
            p.nombre, 
            p.tipo, 
            p.stock as stock_registrado,
            COALESCE(SUM(CASE WHEN m.sentido = 'ENTRADA' THEN m.cantidad WHEN m.sentido = 'SALIDA' THEN -m.cantidad ELSE 0.0 END), 0.0) as stock_movimientos
        FROM productos p
        LEFT JOIN inventario_movimientos m ON p.id = m.producto_id
        GROUP BY p.id
        ORDER BY p.id ASC
    """)
    rows = cursor.fetchall()
    conciliacion = []
    total_ok = 0
    total_dif = 0

    for r in rows:
        stock_reg = float(r["stock_registrado"] or 0.0)
        stock_mov = float(r["stock_movimientos"] or 0.0)
        tipo = r["tipo"]

        if tipo == "servicio":
            # Regla 22: Los servicios no gestionan stock ni movimientos
            diferencia = 0.0
            estado = "OK"
            nota = "Servicio (Excluido de libro mayor)"
            total_ok += 1
        else:
            diferencia = round(stock_reg - stock_mov, 4)
            if abs(diferencia) < 0.0001:
                estado = "OK"
                nota = "Conciliado exacto"
                total_ok += 1
            else:
                estado = "DIFERENCIA"
                nota = f"Descuadre de {diferencia:+.4f} unidades"
                total_dif += 1

        conciliacion.append({
            "producto_id": r["id"],
            "codigo": r["codigo"],
            "nombre": r["nombre"],
            "tipo": tipo,
            "stock_registrado": stock_reg,
            "stock_movimientos": stock_mov,
            "diferencia": diferencia,
            "estado": estado,
            "nota": nota
        })

    resumen = {
        "total_productos": len(conciliacion),
        "total_ok": total_ok,
        "total_diferencia": total_dif,
        "estado_general": "CONCILIADO_OK" if total_dif == 0 else "DESCUADRE_DETECTADO",
        "detalles": conciliacion
    }

    if should_close:
        conn.close()

    return resumen

# ========================================================
# MOTOR DE COSTO PROMEDIO PONDERADO (CPP) - FASE 2F-1B
# ========================================================

class ErrorStockNegativo(ValueError):
    """Excepción lanzada cuando una operación intenta producir stock físico < 0."""
    pass

class ErrorCostoHistoricoNoRecuperable(ValueError):
    """Excepción lanzada cuando una devolución no puede recuperar el costo histórico original."""
    pass

class ErrorCantidadDevolucionExcedeDisponible(ValueError):
    """Excepción lanzada cuando la cantidad solicitada para devolver excede la cantidad disponible de la venta original."""
    pass

class ErrorCancelacionCompraNoPermitida(ValueError):
    """Excepción lanzada cuando una compra no puede anularse porque existen salidas o consumos posteriores."""
    pass

class ErrorMovimientoRetroactivoNoPermitido(ValueError):
    """Excepción lanzada cuando una operación de inventario tiene fecha anterior al último movimiento del SKU."""
    pass

class ErrorInconsistenciaCPP(ValueError):
    """Excepción lanzada cuando un producto tiene stock positivo pero costo_cpp nulo, cero o inválido."""
    pass

class ErrorAnulacionAjusteConMovimientosPosteriores(ValueError):
    """Excepción lanzada cuando se intenta anular directamente un ajuste que tiene movimientos posteriores o pertenece a un período cerrado."""
    pass

SUBTIPOS_AJUSTE_CARGO = (
    'CARGO_SOBRANTE_CONTEO',
    'CARGO_HALLAZGO_CON_SOPORTE',
    'CARGO_TASACION_MANUAL',
)

SUBTIPOS_AJUSTE_DESCARGO = (
    'DESCARGO_MERMA',
    'DESCARGO_VENCIMIENTO',
    'DESCARGO_ROTURA',
    'DESCARGO_USO_INTERNO',
    'DESCARGO_PERDIDA_NO_EXPLICADA',
)

SUBTIPOS_AJUSTE_CANONICOS = SUBTIPOS_AJUSTE_CARGO + SUBTIPOS_AJUSTE_DESCARGO

CPP_TIPOS_ENTRADA_PONDERADA = {
    'compra',
    'devolucion_cliente',
    'cargo_ajuste_hallazgo',
    'hallazgo_mercancia',
    'tasacion_manual',
    'produccion_interna',
    'traspaso_entrada',
    'inventario_inicial',
    'CARGO_HALLAZGO_CON_SOPORTE',
    'CARGO_TASACION_MANUAL',
}

CPP_TIPOS_SALIDA = {
    'venta',
    'descargo',
    'descargo_ajuste',
    'descargo_merma',
    'descargo_vencimiento',
    'descargo_rotura',
    'descargo_uso_interno',
    'devolucion_proveedor',
    'DESCARGO_MERMA',
    'DESCARGO_VENCIMIENTO',
    'DESCARGO_ROTURA',
    'DESCARGO_USO_INTERNO',
    'DESCARGO_PERDIDA_NO_EXPLICADA',
}

CPP_TIPOS_ENTRADA_INVARIANTE = {
    'sobrante_conteo',
    'cargo_ajuste_sobrante',
    'CARGO_SOBRANTE_CONTEO',
}

def resolver_subtipo_ajuste_canonico(tipo_ajuste, subtipo_ajuste=None, motivo=None):
    """
    Resuelve y valida determinísticamente el subtipo canónico de un ajuste de inventario (FASE 2F-5B).
    Prohíbe explícitamente mapear 'regularizacion' o 'ajuste_manual' a sobrante sin un subtipo canónico explícito.
    Si no existe un subtipo válido, lanza ValueError con código 'SUBTIPO_AJUSTE_OBLIGATORIO'.
    """
    tipo = (tipo_ajuste or "").strip().upper()
    if tipo not in ("CARGO", "DESCARGO"):
        raise ValueError("SUBTIPO_AJUSTE_OBLIGATORIO: tipo_ajuste debe ser 'CARGO' o 'DESCARGO'")

    sub_raw = (subtipo_ajuste or "").strip().upper()
    mot_raw = (motivo or "").strip()
    mot_low = mot_raw.lower()

    # 1. Si se envió subtipo_ajuste explícito, validarlo estrictamente contra la taxonomía del tipo_ajuste
    if sub_raw:
        if tipo == "CARGO":
            if sub_raw in ("CARGO_SOBRANTE_CONTEO", "SOBRANTE_CONTEO", "SOBRANTE"):
                return "CARGO_SOBRANTE_CONTEO"
            if sub_raw in ("CARGO_HALLAZGO_CON_SOPORTE", "HALLAZGO_CON_SOPORTE", "HALLAZGO"):
                return "CARGO_HALLAZGO_CON_SOPORTE"
            if sub_raw in ("CARGO_TASACION_MANUAL", "TASACION_MANUAL", "TASACION"):
                return "CARGO_TASACION_MANUAL"
            raise ValueError(
                f"SUBTIPO_AJUSTE_OBLIGATORIO: Subtipo '{subtipo_ajuste}' no es válido para CARGO. "
                f"Permitidos: {', '.join(SUBTIPOS_AJUSTE_CARGO)}"
            )
        else:
            if sub_raw in ("DESCARGO_MERMA", "MERMA"):
                return "DESCARGO_MERMA"
            if sub_raw in ("DESCARGO_VENCIMIENTO", "VENCIMIENTO"):
                return "DESCARGO_VENCIMIENTO"
            if sub_raw in ("DESCARGO_ROTURA", "ROTURA", "DANO", "DAÑO", "AVERIA"):
                return "DESCARGO_ROTURA"
            if sub_raw in ("DESCARGO_USO_INTERNO", "USO_INTERNO", "CONSUMO_INTERNO"):
                return "DESCARGO_USO_INTERNO"
            if sub_raw in ("DESCARGO_PERDIDA_NO_EXPLICADA", "PERDIDA_NO_EXPLICADA", "FALTANTE", "ROBO", "HURTO"):
                return "DESCARGO_PERDIDA_NO_EXPLICADA"
            raise ValueError(
                f"SUBTIPO_AJUSTE_OBLIGATORIO: Subtipo '{subtipo_ajuste}' no es válido para DESCARGO. "
                f"Permitidos: {', '.join(SUBTIPOS_AJUSTE_DESCARGO)}"
            )

    # 2. Si no se envió subtipo_ajuste, prohibir motivos genéricos ambiguos ('regularizacion', 'ajuste_manual')
    if not mot_raw or mot_low in (
        "regularizacion", "regularización",
        "ajuste_manual", "ajuste manual",
        "general", "otro", "otros", "ajuste"
    ):
        raise ValueError(
            f"SUBTIPO_AJUSTE_OBLIGATORIO: El motivo '{mot_raw}' es ambiguo y no puede convertirse silenciosamente. "
            "Debe especificar un subtipo_ajuste canónico explícito."
        )

    # 3. Mapear motivos específicos no ambiguos a su subtipo canónico exacto
    mot_up = mot_raw.upper()
    if tipo == "CARGO":
        if mot_up in SUBTIPOS_AJUSTE_CARGO:
            return mot_up
        if mot_low in ("sobrante", "sobrante_conteo", "cargo_sobrante_conteo", "sobrante fisico", "sobrante físico") or mot_low.startswith("sobrante"):
            return "CARGO_SOBRANTE_CONTEO"
        if mot_low in ("hallazgo", "hallazgo_con_soporte", "cargo_hallazgo_con_soporte", "hallazgo_mercancia") or mot_low.startswith("hallazgo"):
            return "CARGO_HALLAZGO_CON_SOPORTE"
        if mot_low in ("tasacion", "tasacion_manual", "tasación_manual", "cargo_tasacion_manual", "tasación") or mot_low.startswith("tasac"):
            return "CARGO_TASACION_MANUAL"
        raise ValueError(
            f"SUBTIPO_AJUSTE_OBLIGATORIO: No se pudo determinar un subtipo canónico válido para CARGO con motivo '{mot_raw}'."
        )
    else:
        if mot_up in SUBTIPOS_AJUSTE_DESCARGO:
            return mot_up
        if mot_low in ("merma", "descargo_merma", "merma operativa") or mot_low.startswith("merma"):
            return "DESCARGO_MERMA"
        if mot_low in ("vencimiento", "descargo_vencimiento", "caducidad", "vencido") or "vencimiento" in mot_low or "caduc" in mot_low:
            return "DESCARGO_VENCIMIENTO"
        if mot_low in ("rotura", "descargo_rotura", "dano", "daño", "averia", "avería", "rotura o daño") or any(k in mot_low for k in ("rotura", "daño", "dano", "averia")):
            return "DESCARGO_ROTURA"
        if mot_low in ("uso_interno", "descargo_uso_interno", "consumo_interno", "uso interno", "consumo interno") or any(k in mot_low for k in ("uso_interno", "uso interno", "consumo_interno", "consumo interno")):
            return "DESCARGO_USO_INTERNO"
        if mot_low in ("perdida_no_explicada", "descargo_perdida_no_explicada", "pérdida_no_explicada", "faltante", "faltante_conteo", "perdida", "pérdida", "robo", "hurto", "extravio", "extravío") or any(k in mot_low for k in ("perdida_no_explicada", "pérdida", "perdida", "faltante", "robo", "hurto")):
            return "DESCARGO_PERDIDA_NO_EXPLICADA"
        raise ValueError(
            f"SUBTIPO_AJUSTE_OBLIGATORIO: No se pudo determinar un subtipo canónico válido para DESCARGO con motivo '{mot_raw}'."
        )

def validar_stock_no_negativo(stock_actual, cantidad_salida):
    """
    Valida matemáticamente que una salida no produzca stock < 0.
    Lanza ErrorStockNegativo si cantidad_salida > stock_actual.
    """
    stk = Decimal(str(stock_actual))
    cant = Decimal(str(cantidad_salida))
    if cant < Decimal("0"):
        raise ValueError(f"La cantidad de salida no puede ser negativa: {cantidad_salida}")
    if cant > stk:
        raise ErrorStockNegativo(
            f"STOCK_INSUFICIENTE: Salida solicitada ({cant}) supera existencia disponible ({stk}). Stock < 0 prohibido."
        )
    return True

def reiniciar_cpp_si_stock_cero(stock_actual, costo_nueva_entrada):
    """
    Si el stock actual es exactamente 0, el nuevo ingreso establece el CPP directamente al costo de entrada.
    Si stock_actual < 0, lanza ErrorStockNegativo (bloqueo estricto).
    Si stock_actual > 0, retorna None para ejecutar ponderación.
    """
    stk = Decimal(str(stock_actual))
    if stk < Decimal("0"):
        raise ErrorStockNegativo(f"STOCK_NEGATIVO: Imposible operar con stock físico negativo ({stk}). Stock < 0 prohibido.")
    if stk == Decimal("0"):
        c_ent = Decimal(str(costo_nueva_entrada)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
        return float(c_ent)
    return None

def calcular_cpp_entrada(stock_anterior, cpp_anterior, cantidad_entrada, costo_entrada):
    """
    Cálculo matemático puro de entrada ponderada para motor CPP (Fase 2F-2B).
    Máquina de 4 estados:
        1. stock_anterior < 0: ERROR -> ErrorStockNegativo (bloqueo estricto).
        2. stock_anterior == 0: CPP_nuevo = costo_entrada (inicio limpio).
        3. stock_anterior > 0 y cpp_anterior > 0:
            CPP_nuevo = ((stock_anterior * cpp_anterior) + (cantidad_entrada * costo_entrada)) / (stock_anterior + cantidad_entrada)
        4. stock_anterior > 0 y (cpp_anterior is None o cpp_anterior <= 0):
            ERROR -> ValueError/ErrorInconsistenciaCPP (bloqueo estricto; prohibido fallback a productos.costo).
    Utiliza Decimal en memoria con precisión y redondeo ROUND_HALF_UP a 4 decimales.
    """
    stk_ant = Decimal(str(stock_anterior))
    cant_ent = Decimal(str(cantidad_entrada))
    costo_ent = Decimal(str(costo_entrada))

    if cant_ent <= Decimal("0"):
        raise ValueError(f"La cantidad de entrada debe ser mayor a 0, recibido: {cantidad_entrada}")
    if costo_ent < Decimal("0"):
        raise ValueError(f"El costo de entrada no puede ser negativo, recibido: {costo_entrada}")

    if stk_ant < Decimal("0"):
        raise ErrorStockNegativo(
            f"STOCK_NEGATIVO: Stock anterior no puede ser negativo ({stk_ant}). Operación bloqueada."
        )

    if stk_ant == Decimal("0"):
        nuevo_cpp = costo_ent.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
        nuevo_stk = cant_ent.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
        nuevo_valor = (cant_ent * costo_ent).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
        valor_entrada = nuevo_valor
    else:
        # stk_ant > 0
        if cpp_anterior is None or Decimal(str(cpp_anterior)) <= Decimal("0"):
            raise ErrorInconsistenciaCPP(
                f"INCONSISTENCIA_CPP: Producto con stock positivo ({stk_ant}) pero costo_cpp inválido ({cpp_anterior}). "
                "Operación bloqueada. Prohibido usar productos.costo como sustituto."
            )
        cpp_ant = Decimal(str(cpp_anterior))
        valor_ant = stk_ant * cpp_ant
        valor_ent = cant_ent * costo_ent
        valor_nuevo_calc = valor_ant + valor_ent
        nuevo_stk_calc = stk_ant + cant_ent
        nuevo_cpp = (valor_nuevo_calc / nuevo_stk_calc).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
        nuevo_stk = nuevo_stk_calc.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
        nuevo_valor = (nuevo_stk * nuevo_cpp).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
        valor_entrada = valor_ent.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

    return {
        "stock_nuevo": float(nuevo_stk),
        "cpp_nuevo": float(nuevo_cpp),
        "valor_nuevo": float(nuevo_valor),
        "valor_entrada": float(valor_entrada)
    }

def validar_movimiento_no_retroactivo(cursor, producto_id, fecha_movimiento):
    """
    Valida que la fecha del movimiento no sea anterior al último movimiento registrado
    para el producto_id ni pertenezca a un período cerrado / anterior al corte certificado CPP.
    Lanza ErrorMovimientoRetroactivoNoPermitido si viola la secuencia temporal (fecha ASC, id ASC).
    """
    if not fecha_movimiento:
        return True
    f_mov_str = str(fecha_movimiento).strip()

    # 1. Bloquear períodos históricos cerrados (anteriores o iguales al corte certificado de apertura CPP)
    try:
        cursor.execute("""
            SELECT fecha_corte FROM inventario_saldos_apertura_cpp
            WHERE producto_id = ?
            ORDER BY id DESC LIMIT 1
        """, (producto_id,))
        ap_row = cursor.fetchone()
        if ap_row:
            fecha_corte = ap_row["fecha_corte"] if isinstance(ap_row, sqlite3.Row) else ap_row[0]
            if f_mov_str <= str(fecha_corte).strip():
                raise ErrorMovimientoRetroactivoNoPermitido(
                    f"PERIODO_CERRADO_BLOQUEADO: La fecha del movimiento ({f_mov_str}) "
                    f"pertenece a un período histórico cerrado (<= {fecha_corte}) para el producto ID {producto_id}."
                )
    except ErrorMovimientoRetroactivoNoPermitido:
        raise
    except Exception:
        pass

    if f_mov_str <= "2026-04-11 23:59:59":
        raise ErrorMovimientoRetroactivoNoPermitido(
            f"PERIODO_CERRADO_BLOQUEADO: La fecha del movimiento ({f_mov_str}) pertenece a un período cerrado."
        )

    # 2. Bloquear retroactividad frente al último movimiento físico del SKU
    cursor.execute("""
        SELECT fecha, id FROM inventario_movimientos
        WHERE producto_id = ?
        ORDER BY fecha DESC, id DESC
        LIMIT 1
    """, (producto_id,))
    row = cursor.fetchone()
    if row:
        ultima_fecha = row["fecha"] if isinstance(row, sqlite3.Row) else row[0]
        if f_mov_str < str(ultima_fecha):
            raise ErrorMovimientoRetroactivoNoPermitido(
                f"MOVIMIENTO_RETROACTIVO_BLOQUEADO: La fecha del movimiento ({f_mov_str}) "
                f"es anterior al último movimiento registrado ({ultima_fecha}) para el producto ID {producto_id}."
            )
    return True

def calcular_valor_salida_cpp(cantidad_salida, cpp_actual, stock_actual=None):
    """
    Cálculo matemático puro de salida bajo motor CPP.
    La salida NO modifica el costo unitario promedio (invariante).
    Valor_salida = cantidad_salida * cpp_actual.
    """
    cant_sal = Decimal(str(cantidad_salida))
    cpp_act = Decimal(str(cpp_actual or 0.0))

    if cant_sal <= Decimal("0"):
        raise ValueError(f"La cantidad de salida debe ser mayor a 0, recibido: {cantidad_salida}")

    if stock_actual is not None:
        validar_stock_no_negativo(stock_actual, cantidad_salida)
        stk_nue = (Decimal(str(stock_actual)) - cant_sal).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    else:
        stk_nue = None

    valor_salida = (cant_sal * cpp_act).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

    res = {
        "cantidad_salida": float(cant_sal),
        "costo_unitario": float(cpp_act.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)),
        "valor_salida": float(valor_salida),
        "cpp_nuevo": float(cpp_act.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP))
    }
    if stk_nue is not None:
        res["stock_nuevo"] = float(stk_nue)
        res["valor_remanente"] = float((stk_nue * cpp_act).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP))
    return res

def calcular_valor_apertura(stock_apertura, costo_unitario_apertura):
    """
    Calcula el valor inicial de apertura: stock * costo_unitario.
    """
    stk = Decimal(str(stock_apertura)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    c_u = Decimal(str(costo_unitario_apertura)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    return float((stk * c_u).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP))

def calcular_checksum_apertura(sku, stock_apertura, costo_unitario_apertura, valor_apertura, fecha_corte, ultimo_movimiento_id_corte):
    """
    Calcula el hash SHA-256 determinístico para la tupla de apertura CPP.
    Formato canónico de serialización UTF-8:
    '{sku}|{stock:.4f}|{costo:.4f}|{valor:.4f}|{fecha_corte}|{ultimo_movimiento_id_corte}'
    """
    stk = Decimal(str(stock_apertura)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    c_u = Decimal(str(costo_unitario_apertura)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    val = Decimal(str(valor_apertura)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    fec = str(fecha_corte).strip()
    mid = int(ultimo_movimiento_id_corte)
    
    canonical_str = f"{str(sku).strip().upper()}|{stk:.4f}|{c_u:.4f}|{val:.4f}|{fec}|{mid}"
    return hashlib.sha256(canonical_str.encode("utf-8")).hexdigest()

def validar_apertura_cpp(producto_dict, stock_esperado, costo_apertura, fecha_corte="2026-10-23 23:59:59", ultimo_mov_id=108):
    """
    Valida la coherencia de datos previa a la certificación de apertura.
    """
    sku = producto_dict.get("codigo", "").strip().upper()
    stk_act = float(producto_dict.get("stock", 0.0))
    stk_esp = float(stock_esperado)
    costo_ap = float(costo_apertura)

    if abs(stk_act - stk_esp) > 0.0001:
        return {
            "valido": False,
            "error": f"Discrepancia en stock para {sku}: actual en DB={stk_act}, esperado={stk_esp}"
        }

    if costo_ap <= 0.0:
        return {
            "valido": False,
            "error": f"Costo de apertura inválido para {sku}: {costo_ap} (debe ser > 0)"
        }

    val_calc = calcular_valor_apertura(stk_esp, costo_ap)
    chk = calcular_checksum_apertura(sku, stk_esp, costo_ap, val_calc, fecha_corte, ultimo_mov_id)

    return {
        "valido": True,
        "sku": sku,
        "stock": stk_esp,
        "costo_unitario": costo_ap,
        "valor": val_calc,
        "checksum": chk
    }

def certificar_apertura_cpp(conn=None, cursor=None, certificado_por="FASE_2F_1B_CERTIFICADOR",
                           fecha_corte="2026-10-23 23:59:59", ultimo_mov_id=108,
                           observacion="Certificación formal de saldo inicial para motor CPP (Fase 2F-1B)"):
    """
    Registra de forma controlada y certificada los saldos de apertura CPP aprobados para los 5 productos.
    Actualiza productos.costo_cpp exclusivamente dentro de este flujo certificado.
    Es idempotente: si ya fue certificado para esta fecha_corte, valida checksums y retorna estado existente.
    """
    should_close = False
    if conn is None:
        conn = get_connection()
        should_close = True
    if cursor is None:
        cursor = conn.cursor()

    # Asegurar que la tabla y columna existan
    auditar_y_migrar_db(conn, cursor)

    # Definición formal de los 5 productos aprobados
    aperturas_aprobadas = [
        {"sku": "HAR008", "stock": 1733.0, "costo": 29.0, "fuente": "FACTURA_100_Y_CATALOGO_CERTIFICADO"},
        {"sku": "HARPIZZ", "stock": 860.0, "costo": 29.0, "fuente": "RESOLUCION_CERTIFICACION_CONTABLE_2F"},
        {"sku": "HAR010", "stock": 860.0, "costo": 100.0, "fuente": "RESOLUCION_CERTIFICACION_CONTABLE_2F"},
        {"sku": "HARRESP", "stock": 500.0, "costo": 5.0, "fuente": "RESOLUCION_CERTIFICACION_CONTABLE_2F"},
        {"sku": "HARIESPOST", "stock": 501.0, "costo": 95.0, "fuente": "RESOLUCION_CERTIFICACION_CONTABLE_2F"}
    ]

    ahora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    registros_certificados = []
    total_stock = 0.0
    total_valor = 0.0

    # Verificar si ya existe certificación previa completa para este corte
    cursor.execute("""
        SELECT count(*) FROM inventario_saldos_apertura_cpp WHERE fecha_corte = ?
    """, (fecha_corte,))
    count_previo = cursor.fetchone()[0]
    if count_previo == len(aperturas_aprobadas):
        cursor.execute("""
            SELECT producto_id, sku, stock_apertura, costo_unitario_apertura, valor_apertura, checksum
            FROM inventario_saldos_apertura_cpp WHERE fecha_corte = ? ORDER BY producto_id ASC
        """, (fecha_corte,))
        filas = cursor.fetchall()
        for f in filas:
            chk_esperado = calcular_checksum_apertura(f["sku"], f["stock_apertura"], f["costo_unitario_apertura"], f["valor_apertura"], fecha_corte, ultimo_mov_id)
            if f["checksum"] != chk_esperado:
                raise ValueError(f"CRÍTICO: Checksum corrupto en apertura para SKU {f['sku']}")
            total_stock += float(f["stock_apertura"])
            total_valor += float(f["valor_apertura"])
            registros_certificados.append(dict(f))

        res = {
            "estado": "YA_CERTIFICADO_PREVIAMENTE",
            "fecha_corte": fecha_corte,
            "ultimo_movimiento_id_corte": ultimo_mov_id,
            "total_productos": len(registros_certificados),
            "total_stock": round(total_stock, 4),
            "total_valor": round(total_valor, 4),
            "certificados": registros_certificados
        }
        if should_close:
            conn.close()
        return res

    for item in aperturas_aprobadas:
        sku = item["sku"]
        cursor.execute("SELECT id, codigo, nombre, stock, costo FROM productos WHERE UPPER(codigo) = ?", (sku,))
        p = cursor.fetchone()
        if not p:
            raise ValueError(f"Producto con SKU {sku} no existe en catálogo")
        
        p_id = p["id"]
        val_res = validar_apertura_cpp(dict(p), item["stock"], item["costo"], fecha_corte, ultimo_mov_id)
        if not val_res["valido"]:
            raise ValueError(val_res["error"])

        stk = val_res["stock"]
        c_u = val_res["costo_unitario"]
        val = val_res["valor"]
        chk = val_res["checksum"]

        # Insertar apertura certificada
        cursor.execute("""
            INSERT OR REPLACE INTO inventario_saldos_apertura_cpp (
                fecha_corte, ultimo_movimiento_id_corte, producto_id, sku,
                stock_apertura, costo_unitario_apertura, valor_apertura,
                moneda, fuente_valor, certificado_por, certificado_at, observacion, checksum
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'USD', ?, ?, ?, ?, ?)
        """, (
            fecha_corte, ultimo_mov_id, p_id, sku,
            stk, c_u, val,
            item["fuente"], certificado_por, ahora, observacion, chk
        ))

        # Actualizar costo_cpp exclusivamente mediante esta certificación formal
        cursor.execute("UPDATE productos SET costo_cpp = ? WHERE id = ?", (c_u, p_id))

        total_stock += stk
        total_valor += val
        registros_certificados.append({
            "producto_id": p_id,
            "sku": sku,
            "stock_apertura": stk,
            "costo_unitario_apertura": c_u,
            "valor_apertura": val,
            "checksum": chk
        })

    conn.commit()

    resultado = {
        "estado": "CERTIFICADO_OK",
        "fecha_corte": fecha_corte,
        "ultimo_movimiento_id_corte": ultimo_mov_id,
        "total_productos": len(registros_certificados),
        "total_stock": round(total_stock, 4),
        "total_valor": round(total_valor, 4),
        "certificados": registros_certificados
    }

    if should_close:
        conn.close()

    return resultado

def reconstruir_cpp_desde_apertura(cursor, producto_id, fecha_corte="2026-10-23 23:59:59", ultimo_mov_id=108):
    """
    Reconstrucción determinística del CPP a partir del saldo certificado de apertura
    y los movimientos posteriores con id > ultimo_mov_id ordenados por (fecha ASC, id ASC).
    El ID de corte es la frontera primaria obligatoria.
    No utiliza un 'else' genérico que convierta silenciosamente un tipo desconocido en entrada ponderada.
    """
    cursor.execute("""
        SELECT stock_apertura, costo_unitario_apertura, valor_apertura, sku, checksum
        FROM inventario_saldos_apertura_cpp
        WHERE producto_id = ? AND ultimo_movimiento_id_corte = ?
    """, (producto_id, ultimo_mov_id))
    ap = cursor.fetchone()
    if not ap:
        raise ValueError(f"CRÍTICO: No existe saldo de apertura certificado para producto ID {producto_id} con corte ID {ultimo_mov_id}")

    # Validar integridad del checksum antes de reconstruir
    chk_calc = calcular_checksum_apertura(ap["sku"], ap["stock_apertura"], ap["costo_unitario_apertura"], ap["valor_apertura"], fecha_corte, ultimo_mov_id)
    if ap["checksum"] != chk_calc:
        raise ValueError(f"CRÍTICO: Checksum inválido en apertura para producto ID {producto_id}")

    stock_acum = Decimal(str(ap["stock_apertura"]))
    cpp_acum = Decimal(str(ap["costo_unitario_apertura"]))
    valor_acum = Decimal(str(ap["valor_apertura"]))

    cursor.execute("PRAGMA table_info(inventario_movimientos)")
    cols_mov = {r[1] for r in cursor.fetchall()}
    has_subtipo = "subtipo_movimiento" in cols_mov
    has_cpp_cols = "cpp_anterior" in cols_mov and "cpp_nuevo" in cols_mov

    select_cols = "id, fecha, tipo_movimiento, sentido, cantidad, costo_unitario, costo_total, documento_tipo, documento_id, documento_linea_id, motivo"
    if has_subtipo:
        select_cols += ", subtipo_movimiento"
    if has_cpp_cols:
        select_cols += ", cpp_anterior, cpp_nuevo"

    cursor.execute(f"""
        SELECT {select_cols}
        FROM inventario_movimientos
        WHERE producto_id = ? AND id > ?
        ORDER BY fecha ASC, id ASC
    """, (producto_id, ultimo_mov_id))
    
    movs = cursor.fetchall()
    procesados = 0

    for r_m in movs:
        m = dict(r_m)
        procesados += 1
        m_id = m["id"]
        tipo = str(m.get("tipo_movimiento") or "").strip()
        subtipo = str(m.get("subtipo_movimiento") or "").strip().upper()
        sentido = str(m.get("sentido") or "").strip().upper()
        cant = Decimal(str(m["cantidad"]))
        c_u = Decimal(str(m["costo_unitario"]))
        motivo_m = str(m.get("motivo") or "").strip().lower()
        doc_tipo = str(m.get("documento_tipo") or "").strip().upper()

        # Caso especial: Reversión por anulación directa LIFO de ajuste
        if subtipo == "ANULACION_AJUSTE" or doc_tipo == "ANULACION_AJUSTE":
            if sentido == "SALIDA":
                validar_stock_no_negativo(stock_acum, cant)
                stock_acum = (stock_acum - cant).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
            elif sentido == "ENTRADA":
                stock_acum = (stock_acum + cant).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
            else:
                raise ValueError(f"SENTIDO_INVALIDO: Sentido '{sentido}' no reconocido en movimiento ID {m_id}")

            if m.get("cpp_nuevo") is not None:
                cpp_acum = Decimal(str(m["cpp_nuevo"])).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
            elif m.get("documento_linea_id"):
                cursor.execute("SELECT cpp_anterior FROM inventario_ajuste_detalles WHERE id = ?", (m["documento_linea_id"],))
                det_row = cursor.fetchone()
                if det_row and det_row[0] is not None:
                    cpp_acum = Decimal(str(det_row[0])).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
            valor_acum = (stock_acum * cpp_acum).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
            continue

        if sentido == "ENTRADA":
            if subtipo:
                if subtipo == "CARGO_SOBRANTE_CONTEO":
                    es_invariante = True
                    es_ponderada = False
                elif subtipo in ("CARGO_HALLAZGO_CON_SOPORTE", "CARGO_TASACION_MANUAL"):
                    es_invariante = False
                    es_ponderada = True
                else:
                    raise ValueError(
                        f"SUBTIPO_MOVIMIENTO_NO_RECONOCIDO: Subtipo de entrada '{subtipo}' desconocido en movimiento ID {m_id}"
                    )
            else:
                es_invariante = (
                    tipo in CPP_TIPOS_ENTRADA_INVARIANTE or
                    (tipo == "cargo_ajuste" and any(k in motivo_m for k in ("sobrante", "conteo", "invariante")))
                )
                es_ponderada = (
                    not es_invariante and (
                        tipo in CPP_TIPOS_ENTRADA_PONDERADA or
                        (tipo == "cargo_ajuste" and any(k in motivo_m for k in ("hallazgo", "tasacion", "tasación")))
                    )
                )
                if not es_invariante and not es_ponderada:
                    raise ValueError(
                        f"TIPO_MOVIMIENTO_NO_RECONOCIDO: Entrada con tipo_movimiento='{tipo}' y motivo='{motivo_m}' "
                        f"no reconocida determinísticamente en movimiento ID {m_id}"
                    )

            if es_invariante:
                if stock_acum < Decimal("0"):
                    raise ErrorStockNegativo(f"STOCK_NEGATIVO en reconstrucción CPP (movimiento ID {m_id})")
                if cpp_acum is None or cpp_acum <= Decimal("0"):
                    raise ErrorInconsistenciaCPP(f"INCONSISTENCIA_CPP en entrada invariante (movimiento ID {m_id})")
                stock_acum = (stock_acum + cant).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                valor_acum = (stock_acum * cpp_acum).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
            elif es_ponderada:
                res_ent = calcular_cpp_entrada(stock_acum, cpp_acum, cant, c_u)
                stock_acum = Decimal(str(res_ent["stock_nuevo"]))
                cpp_acum = Decimal(str(res_ent["cpp_nuevo"]))
                valor_acum = Decimal(str(res_ent["valor_nuevo"]))

        elif sentido == "SALIDA":
            if subtipo:
                if subtipo not in SUBTIPOS_AJUSTE_DESCARGO:
                    raise ValueError(
                        f"SUBTIPO_MOVIMIENTO_NO_RECONOCIDO: Subtipo de salida '{subtipo}' desconocido en movimiento ID {m_id}"
                    )
            else:
                if tipo not in CPP_TIPOS_SALIDA:
                    raise ValueError(
                        f"TIPO_MOVIMIENTO_NO_RECONOCIDO: Salida con tipo_movimiento='{tipo}' no reconocida en movimiento ID {m_id}"
                    )

            validar_stock_no_negativo(stock_acum, cant)
            res_sal = calcular_valor_salida_cpp(cant, cpp_acum, stock_acum)
            stock_acum = Decimal(str(res_sal["stock_nuevo"]))
            valor_acum = Decimal(str(res_sal["valor_remanente"]))
            # Salidas no alteran cpp_acum (incluso si stock_acum llega a 0)
        else:
            raise ValueError(f"SENTIDO_MOVIMIENTO_INVALIDO: '{sentido}' en movimiento ID {m_id}")

    return {
        "producto_id": producto_id,
        "sku": ap["sku"],
        "stock_reconstruido": float(stock_acum.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)),
        "cpp_reconstruido": float(cpp_acum.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)),
        "valor_reconstruido": float(valor_acum.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)),
        "movimientos_procesados": procesados
    }


def _obtener_ajuste_existente_dict(cursor, ajuste_id, mensaje_idempotencia):
    """Auxiliar para devolver la representación completa de un ajuste previamente procesado (Idempotencia)."""
    cursor.execute("SELECT * FROM inventario_ajustes WHERE id = ?", (ajuste_id,))
    row = cursor.fetchone()
    if not row:
        return None
    aj = dict(row)
    cursor.execute("""
        SELECT d.*, p.codigo as producto_codigo, p.nombre as producto_nombre
        FROM inventario_ajuste_detalles d
        LEFT JOIN productos p ON d.producto_id = p.id
        WHERE d.ajuste_id = ?
        ORDER BY d.id ASC
    """, (ajuste_id,))
    dets = [dict(r) for r in cursor.fetchall()]
    return {
        "success": True,
        "duplicado_ignorado": True,
        "id": aj["id"],
        "ajuste_id": aj["id"],
        "numero_ajuste": aj["numero_ajuste"],
        "tipo_ajuste": aj["tipo_ajuste"],
        "subtipo_ajuste": aj.get("subtipo_ajuste"),
        "motivo": aj["motivo"],
        "fecha": aj["fecha"],
        "estado": aj.get("estado") or "activo",
        "documento_referencia": aj.get("documento_referencia"),
        "autorizado_por": aj.get("autorizado_por"),
        "idempotency_key": aj.get("idempotency_key"),
        "ajuste_referencia_id": aj.get("ajuste_referencia_id"),
        "total_items": len(dets),
        "detalles": dets,
        "message": mensaje_idempotencia
    }


def procesar_ajuste_inventario_cpp(cursor, payload, conn=None, auto_commit=True):
    """
    Ejecuta atómicamente un Ajuste de Inventario (CARGO o DESCARGO) bajo las reglas
    del Motor CPP (FASE 2F-5B):
      1. Validar payload y taxonomía canónica (bloquea 'regularizacion'/'ajuste_manual' sin subtipo canónico).
      2. Validar idempotencia por idempotency_key / client_tx_id / numero_ajuste.
      3. Prohibir repetición del mismo producto_id dentro del mismo ajuste (SKU_DUPLICADO_EN_AJUSTE).
      4. Validar producto (existencia, excluir servicios), stock, CPP y retroactividad.
      5. Iniciar transacción BEGIN IMMEDIATE.
      6. Insertar encabezado en inventario_ajustes.
      7. Calcular CPP con Decimal + ROUND_HALF_UP (4 decimales).
      8. Insertar detalle en inventario_ajuste_detalles con subtipo_movimiento, cpp_anterior y cpp_nuevo.
      9. Insertar movimiento en inventario_movimientos con documento_linea_id = detalle.id y subtipo_movimiento.
     10. Actualizar productos.stock y productos.costo_cpp.
     11. Commit atómico o Rollback total ante cualquier excepción.
    """
    if conn is None:
        conn = getattr(cursor, "connection", None)

    # Asegurar que las columnas aditivas de Fase 2F-5B existan en la conexión activa
    cursor.execute("PRAGMA table_info(inventario_ajustes)")
    cols_aj = {r[1] for r in cursor.fetchall()}
    if "subtipo_ajuste" not in cols_aj:
        auditar_y_migrar_db(conn, cursor)

    tipo_ajuste = (payload.get("tipo_ajuste") or "").strip().upper()
    if tipo_ajuste not in ("CARGO", "DESCARGO"):
        raise ValueError("SUBTIPO_AJUSTE_OBLIGATORIO: tipo_ajuste debe ser 'CARGO' o 'DESCARGO'")

    motivo_raw = (payload.get("motivo") or "").strip()
    subtipo_input = (payload.get("subtipo_ajuste") or payload.get("subtipo_movimiento") or "").strip()

    if not motivo_raw and not subtipo_input:
        raise ValueError("SUBTIPO_AJUSTE_OBLIGATORIO: El motivo y/o subtipo_ajuste del ajuste es obligatorio")

    # Resolver subtipo canónico estricto (bloquea regularizacion y ajuste_manual ambiguos)
    subtipo_canonico = resolver_subtipo_ajuste_canonico(
        tipo_ajuste=tipo_ajuste,
        subtipo_ajuste=subtipo_input,
        motivo=motivo_raw
    )
    motivo = motivo_raw if motivo_raw else subtipo_canonico

    detalles = payload.get("detalles") or payload.get("items") or []
    if not isinstance(detalles, list) or len(detalles) == 0:
        raise ValueError("DETALLES_VACIOS: Debe incluir al menos un producto en el ajuste (lista 'detalles')")

    observaciones = (payload.get("observaciones") or payload.get("justificacion_tecnica") or "").strip()
    justificacion_header = (payload.get("justificacion_tecnica") or payload.get("observaciones") or "").strip()
    documento_referencia = (payload.get("documento_referencia") or "").strip()
    autorizado_por = (payload.get("autorizado_por") or "").strip()
    usuario_id = int(payload.get("usuario_id") or 1)
    numero_ajuste = (payload.get("numero_ajuste") or "").strip()
    idempotency_key = (payload.get("idempotency_key") or payload.get("client_tx_id") or "").strip()
    ajuste_referencia_id = payload.get("ajuste_referencia_id")
    if ajuste_referencia_id is not None and str(ajuste_referencia_id).strip() != "":
        ajuste_referencia_id = int(ajuste_referencia_id)
    else:
        ajuste_referencia_id = None

    # Validación preliminar de Idempotencia antes de abrir candado de escritura
    if numero_ajuste:
        cursor.execute("SELECT id FROM inventario_ajustes WHERE numero_ajuste = ?", (numero_ajuste,))
        ex_num = cursor.fetchone()
        if ex_num:
            return _obtener_ajuste_existente_dict(
                cursor, ex_num[0],
                f"Ajuste {numero_ajuste} ya procesado previamente (idempotencia garantizada)"
            )

    if idempotency_key:
        cursor.execute(
            "SELECT id FROM inventario_ajustes WHERE idempotency_key = ? OR observaciones LIKE ?",
            (idempotency_key, f"%[IDEMPOTENCY:{idempotency_key}]%")
        )
        ex_key = cursor.fetchone()
        if ex_key:
            return _obtener_ajuste_existente_dict(
                cursor, ex_key[0],
                "Ajuste ya procesado previamente con idempotency_key"
            )

    # Iniciar transacción atómica BEGIN IMMEDIATE
    started_tx = False
    if conn is not None and not conn.in_transaction:
        cursor.execute("BEGIN IMMEDIATE")
        started_tx = True
    elif conn is None:
        try:
            cursor.execute("BEGIN IMMEDIATE")
            started_tx = True
        except sqlite3.OperationalError:
            pass

    try:
        # Re-verificar idempotencia dentro de BEGIN IMMEDIATE (protección contra condición de carrera concurrente)
        if numero_ajuste:
            cursor.execute("SELECT id FROM inventario_ajustes WHERE numero_ajuste = ?", (numero_ajuste,))
            ex_num = cursor.fetchone()
            if ex_num:
                if started_tx and conn is not None and conn.in_transaction:
                    conn.rollback()
                return _obtener_ajuste_existente_dict(
                    cursor, ex_num[0],
                    f"Ajuste {numero_ajuste} ya procesado previamente (idempotencia garantizada)"
                )

        if idempotency_key:
            cursor.execute(
                "SELECT id FROM inventario_ajustes WHERE idempotency_key = ? OR observaciones LIKE ?",
                (idempotency_key, f"%[IDEMPOTENCY:{idempotency_key}]%")
            )
            ex_key = cursor.fetchone()
            if ex_key:
                if started_tx and conn is not None and conn.in_transaction:
                    conn.rollback()
                return _obtener_ajuste_existente_dict(
                    cursor, ex_key[0],
                    "Ajuste ya procesado previamente con idempotency_key"
                )

        # Normalización de fecha de operación
        fecha_input = payload.get("fecha")
        es_fecha_solo_dia = False
        if fecha_input and str(fecha_input).strip():
            f_str = str(fecha_input).strip()
            if len(f_str) == 10:
                es_fecha_solo_dia = True
                fecha_ajuste = f"{f_str} {datetime.now().strftime('%H:%M:%S')}"
            else:
                fecha_ajuste = f_str
        else:
            fecha_ajuste = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # 1. Validar líneas, prohibir SKU duplicado en el mismo ajuste y validar productos / retroactividad
        vistos_sku = set()
        productos_info = {}

        for idx, det in enumerate(detalles):
            p_id_raw = det.get("producto_id")
            if not p_id_raw:
                raise ValueError(f"Detalle #{idx+1}: 'producto_id' es requerido")
            try:
                p_id = int(p_id_raw)
                cant_str = str(det.get("cantidad", "0"))
                cant_dec_val = Decimal(cant_str)
            except Exception:
                raise ValueError(f"Detalle #{idx+1}: 'producto_id' y 'cantidad' deben ser numéricos válidos")

            if cant_dec_val <= Decimal("0"):
                raise ValueError(f"Detalle #{idx+1}: la cantidad debe ser mayor a 0 (recibido: {cant_str})")

            # Regla 9: Prohibición estricta de repetir el mismo producto_id dentro del mismo ajuste
            if p_id in vistos_sku:
                raise ValueError(
                    f"SKU_DUPLICADO_EN_AJUSTE: El producto ID {p_id} se encuentra duplicado en el mismo ajuste. "
                    "Consolide la cantidad en una sola línea por SKU."
                )
            vistos_sku.add(p_id)

            cursor.execute("SELECT id, codigo, nombre, tipo, stock, costo_cpp, costo, activo FROM productos WHERE id = ?", (p_id,))
            prod = cursor.fetchone()
            if not prod:
                raise LookupError(f"PRODUCTO_NO_ENCONTRADO: Producto ID {p_id} no existe")
            prod_data = dict(prod)
            if prod_data.get("tipo") == "servicio":
                raise ValueError(f"SERVICIO_NO_INVENTARIABLE: No se pueden realizar ajustes de inventario sobre servicios ('{prod_data['nombre']}')")

            productos_info[p_id] = prod_data

            # Si el usuario envió solo 'YYYY-MM-DD' y coincide exactamente con el día del último movimiento del SKU,
            # asegurar que la hora asignada no quede detrás de la hora del último movimiento de ese mismo día.
            if es_fecha_solo_dia:
                cursor.execute("""
                    SELECT fecha FROM inventario_movimientos
                    WHERE producto_id = ?
                    ORDER BY fecha DESC, id DESC LIMIT 1
                """, (p_id,))
                ult_mov = cursor.fetchone()
                if ult_mov:
                    ult_f = str(ult_mov[0])
                    if ult_f[:10] == fecha_ajuste[:10] and fecha_ajuste < ult_f:
                        fecha_ajuste = ult_f

            # Regla 8: Validar no retroactividad y períodos cerrados
            validar_movimiento_no_retroactivo(cursor, p_id, fecha_ajuste)

        # Generar número correlativo de ajuste si no fue provisto
        if not numero_ajuste:
            prefix = "CAR" if tipo_ajuste == "CARGO" else "DES"
            cursor.execute("SELECT COALESCE(MAX(id), 0) + 1 FROM inventario_ajustes")
            next_id = cursor.fetchone()[0]
            numero_ajuste = f"{prefix}-{next_id:06d}"

        observaciones_final = observaciones
        if idempotency_key and f"[IDEMPOTENCY:{idempotency_key}]" not in observaciones_final:
            observaciones_final = f"{observaciones_final} [IDEMPOTENCY:{idempotency_key}]".strip()

        # Insertar encabezado en inventario_ajustes
        cursor.execute("""
            INSERT INTO inventario_ajustes (
                numero_ajuste, fecha, tipo_ajuste, subtipo_ajuste, motivo, observaciones,
                documento_referencia, autorizado_por, estado, idempotency_key,
                ajuste_referencia_id, usuario_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'activo', ?, ?, ?)
        """, (
            numero_ajuste, fecha_ajuste, tipo_ajuste, subtipo_canonico, motivo, observaciones_final,
            documento_referencia or None, autorizado_por or None, idempotency_key or None,
            ajuste_referencia_id, usuario_id
        ))
        ajuste_id = cursor.lastrowid

        # Mapear tipo_movimiento compatible con el CHECK de inventario_movimientos
        sentido = "ENTRADA" if tipo_ajuste == "CARGO" else "SALIDA"
        if tipo_ajuste == "CARGO":
            tipo_mov_sql = "cargo_ajuste"
        else:
            if subtipo_canonico == "DESCARGO_VENCIMIENTO":
                tipo_mov_sql = "descargo_vencimiento"
            elif subtipo_canonico == "DESCARGO_ROTURA":
                tipo_mov_sql = "descargo_rotura"
            elif subtipo_canonico == "DESCARGO_USO_INTERNO":
                tipo_mov_sql = "descargo_uso_interno"
            else:
                # DESCARGO_MERMA y DESCARGO_PERDIDA_NO_EXPLICADA
                tipo_mov_sql = "descargo_merma"

        detalles_procesados = []

        for idx, det in enumerate(detalles):
            p_id = int(det["producto_id"])
            cant_dec = Decimal(str(det["cantidad"])).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
            motivo_detalle = (det.get("motivo_detalle") or det.get("justificacion_tecnica") or "").strip()

            # Permitir que una línea especifique su propio subtipo si pertenece al mismo sentido, o herede el del encabezado
            sub_det_raw = (det.get("subtipo_movimiento") or det.get("subtipo_ajuste") or "").strip()
            if sub_det_raw:
                subtipo_linea = resolver_subtipo_ajuste_canonico(tipo_ajuste, subtipo_ajuste=sub_det_raw, motivo=motivo_detalle or motivo)
            else:
                subtipo_linea = subtipo_canonico

            cursor.execute("SELECT id, codigo, nombre, stock, costo_cpp, costo FROM productos WHERE id = ?", (p_id,))
            prod_row = dict(cursor.fetchone())
            stk_ant_dec = Decimal(str(prod_row.get("stock") or 0.0)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
            cpp_ant_raw = prod_row.get("costo_cpp")
            sku_cod = prod_row.get("codigo")

            # Regla 7: Bloqueo absoluto de stock actual negativo
            if stk_ant_dec < Decimal("0"):
                raise ErrorStockNegativo(
                    f"STOCK_NEGATIVO: Producto {sku_cod} posee stock negativo ({stk_ant_dec}). Operación bloqueada."
                )

            if tipo_ajuste == "DESCARGO":
                # Regla 4: DESCARGOS (Merma, Vencimiento, Rotura, Uso Interno, Pérdida No Explicada)
                validar_stock_no_negativo(stk_ant_dec, cant_dec)
                if cpp_ant_raw is None or Decimal(str(cpp_ant_raw)) <= Decimal("0"):
                    raise ErrorInconsistenciaCPP(
                        f"INCONSISTENCIA_CPP: Producto {sku_cod} tiene stock {stk_ant_dec} pero costo_cpp inválido ({cpp_ant_raw}). "
                        "Operación bloqueada. Prohibido usar productos.costo como sustituto."
                    )
                cpp_ant_dec = Decimal(str(cpp_ant_raw)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                res_sal = calcular_valor_salida_cpp(cant_dec, cpp_ant_dec, stk_ant_dec)
                costo_u_dec = Decimal(str(res_sal["costo_unitario"])).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                costo_tot_dec = Decimal(str(res_sal["valor_salida"])).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                stock_nuevo_dec = Decimal(str(res_sal["stock_nuevo"])).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                # Si el movimiento deja stock en cero, NO poner CPP en cero; conservar el último CPP válido
                cpp_nuevo_dec = cpp_ant_dec

            else:
                # ENTRADAS (CARGO)
                if subtipo_linea == "CARGO_SOBRANTE_CONTEO":
                    # Regla 3.1: CARGO_SOBRANTE_CONTEO
                    # Tanto con stock > 0 como con stock == 0, exige CPP certificado > 0
                    if cpp_ant_raw is None or Decimal(str(cpp_ant_raw)) <= Decimal("0"):
                        raise ErrorInconsistenciaCPP(
                            f"INCONSISTENCIA_CPP: Producto {sku_cod} no posee costo_cpp certificado > 0 ({cpp_ant_raw}) "
                            "para realizar CARGO_SOBRANTE_CONTEO."
                        )
                    cpp_ant_dec = Decimal(str(cpp_ant_raw)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

                    # Si el payload intenta enviar un costo diferente al CPP vigente -> HTTP 400 SOBRANTE_NO_ADMITE_COSTO_EXTERNO
                    if "costo_unitario" in det and det.get("costo_unitario") is not None and str(det.get("costo_unitario")).strip() != "":
                        try:
                            costo_enviado_dec = Decimal(str(det.get("costo_unitario"))).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                        except Exception:
                            raise ValueError("SOBRANTE_NO_ADMITE_COSTO_EXTERNO: Costo unitario inválido en CARGO_SOBRANTE_CONTEO")
                        if costo_enviado_dec != cpp_ant_dec:
                            raise ValueError(
                                f"SOBRANTE_NO_ADMITE_COSTO_EXTERNO: CARGO_SOBRANTE_CONTEO utiliza exclusivamente el CPP vigente "
                                f"({cpp_ant_dec}) y no admite un costo externo diferente ({costo_enviado_dec})."
                            )

                    costo_u_dec = cpp_ant_dec
                    cpp_nuevo_dec = cpp_ant_dec
                    stock_nuevo_dec = (stk_ant_dec + cant_dec).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                    costo_tot_dec = (cant_dec * costo_u_dec).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

                elif subtipo_linea == "CARGO_HALLAZGO_CON_SOPORTE":
                    # Regla 3.2: CARGO_HALLAZGO_CON_SOPORTE
                    doc_ref_linea = (det.get("documento_referencia") or documento_referencia or "").strip()
                    costo_in = det.get("costo_unitario")
                    if not doc_ref_linea:
                        raise ValueError(
                            "HALLAZGO_REQUIERE_COSTO_Y_SOPORTE: CARGO_HALLAZGO_CON_SOPORTE requiere obligatoriamente 'documento_referencia'."
                        )
                    if costo_in is None or str(costo_in).strip() == "":
                        raise ValueError(
                            "HALLAZGO_REQUIERE_COSTO_Y_SOPORTE: CARGO_HALLAZGO_CON_SOPORTE requiere obligatoriamente 'costo_unitario > 0'."
                        )
                    try:
                        costo_u_dec = Decimal(str(costo_in)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                    except Exception:
                        raise ValueError("HALLAZGO_REQUIERE_COSTO_Y_SOPORTE: 'costo_unitario' debe ser numérico válido.")
                    if costo_u_dec <= Decimal("0"):
                        raise ValueError(
                            f"HALLAZGO_REQUIERE_COSTO_Y_SOPORTE: 'costo_unitario' debe ser > 0 (recibido: {costo_u_dec}). "
                            "Prohibido usar productos.costo o 0 como fallback."
                        )

                    if stk_ant_dec == Decimal("0"):
                        cpp_ant_dec = Decimal(str(cpp_ant_raw or 0.0)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                        res_calc = calcular_cpp_entrada(stk_ant_dec, cpp_ant_dec, cant_dec, costo_u_dec)
                    else:
                        if cpp_ant_raw is None or Decimal(str(cpp_ant_raw)) <= Decimal("0"):
                            raise ErrorInconsistenciaCPP(
                                f"INCONSISTENCIA_CPP: Producto {sku_cod} tiene stock positivo ({stk_ant_dec}) pero costo_cpp inválido ({cpp_ant_raw})."
                            )
                        cpp_ant_dec = Decimal(str(cpp_ant_raw)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                        res_calc = calcular_cpp_entrada(stk_ant_dec, cpp_ant_dec, cant_dec, costo_u_dec)

                    stock_nuevo_dec = Decimal(str(res_calc["stock_nuevo"])).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                    cpp_nuevo_dec = Decimal(str(res_calc["cpp_nuevo"])).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                    costo_tot_dec = (cant_dec * costo_u_dec).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

                elif subtipo_linea == "CARGO_TASACION_MANUAL":
                    # Regla 3.3: CARGO_TASACION_MANUAL
                    doc_ref_linea = (det.get("documento_referencia") or documento_referencia or "").strip()
                    aut_por_linea = (det.get("autorizado_por") or autorizado_por or "").strip()
                    just_linea = (det.get("justificacion_tecnica") or justificacion_header or motivo_detalle or "").strip()
                    costo_in = det.get("costo_unitario")

                    if not doc_ref_linea or not aut_por_linea or not just_linea or costo_in is None or str(costo_in).strip() == "":
                        raise ValueError(
                            "TASACION_MANUAL_INCOMPLETA: CARGO_TASACION_MANUAL requiere obligatoriamente "
                            "'costo_unitario > 0', 'justificacion_tecnica', 'documento_referencia' y 'autorizado_por'."
                        )
                    try:
                        costo_u_dec = Decimal(str(costo_in)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                    except Exception:
                        raise ValueError("TASACION_MANUAL_INCOMPLETA: 'costo_unitario' debe ser numérico válido.")
                    if costo_u_dec <= Decimal("0"):
                        raise ValueError(
                            f"TASACION_MANUAL_INCOMPLETA: 'costo_unitario' en tasación manual debe ser > 0 (recibido: {costo_u_dec})."
                        )

                    if stk_ant_dec == Decimal("0"):
                        cpp_ant_dec = Decimal(str(cpp_ant_raw or 0.0)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                        res_calc = calcular_cpp_entrada(stk_ant_dec, cpp_ant_dec, cant_dec, costo_u_dec)
                    else:
                        if cpp_ant_raw is None or Decimal(str(cpp_ant_raw)) <= Decimal("0"):
                            raise ErrorInconsistenciaCPP(
                                f"INCONSISTENCIA_CPP: Producto {sku_cod} tiene stock positivo ({stk_ant_dec}) pero costo_cpp inválido ({cpp_ant_raw})."
                            )
                        cpp_ant_dec = Decimal(str(cpp_ant_raw)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                        res_calc = calcular_cpp_entrada(stk_ant_dec, cpp_ant_dec, cant_dec, costo_u_dec)

                    stock_nuevo_dec = Decimal(str(res_calc["stock_nuevo"])).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                    cpp_nuevo_dec = Decimal(str(res_calc["cpp_nuevo"])).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                    costo_tot_dec = (cant_dec * costo_u_dec).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                else:
                    raise ValueError(f"SUBTIPO_AJUSTE_OBLIGATORIO: Subtipo no soportado '{subtipo_linea}'")

            # Insertar detalle con trazabilidad CPP (cpp_anterior, cpp_nuevo, subtipo_movimiento)
            cursor.execute("""
                INSERT INTO inventario_ajuste_detalles (
                    ajuste_id, producto_id, cantidad, costo_unitario, costo_total,
                    stock_anterior, stock_nuevo, motivo_detalle,
                    subtipo_movimiento, cpp_anterior, cpp_nuevo
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                ajuste_id, p_id, float(cant_dec), float(costo_u_dec), float(costo_tot_dec),
                float(stk_ant_dec), float(stock_nuevo_dec), motivo_detalle,
                subtipo_linea, float(cpp_ant_dec), float(cpp_nuevo_dec)
            ))
            ajuste_det_id = cursor.lastrowid

            # Registrar movimiento en inventario_movimientos con documento_linea_id = inventario_ajuste_detalles.id
            mov_id = registrar_movimiento_inventario(
                cursor=cursor,
                producto_id=p_id,
                fecha=fecha_ajuste,
                tipo_movimiento=tipo_mov_sql,
                sentido=sentido,
                cantidad=float(cant_dec),
                costo_unitario=float(costo_u_dec),
                costo_total=float(costo_tot_dec),
                stock_anterior=float(stk_ant_dec),
                stock_nuevo=float(stock_nuevo_dec),
                documento_tipo="INVENTARIO_AJUSTE",
                documento_id=ajuste_id,
                documento_linea_id=ajuste_det_id,
                documento_numero=numero_ajuste,
                motivo=motivo_detalle or motivo,
                usuario_id=usuario_id,
                subtipo_movimiento=subtipo_linea,
                cpp_anterior=float(cpp_ant_dec),
                cpp_nuevo=float(cpp_nuevo_dec)
            )

            # Actualizar productos.stock y productos.costo_cpp (sin usar productos.costo)
            cursor.execute("""
                UPDATE productos
                SET stock = ?, costo_cpp = ?
                WHERE id = ?
            """, (float(stock_nuevo_dec), float(cpp_nuevo_dec), p_id))

            # Hook opcional de prueba para verificar atomicidad / rollback ante fallo intermedio
            if det.get("_forzar_fallo_post_detalle") or payload.get("_forzar_fallo_transaccional"):
                raise RuntimeError("FALLO_SIMULADO_POST_MOVIMIENTO: Prueba de rollback atómico")

            detalles_procesados.append({
                "id": ajuste_det_id,
                "producto_id": p_id,
                "cantidad": float(cant_dec),
                "costo_unitario": float(costo_u_dec),
                "costo_total": float(costo_tot_dec),
                "stock_anterior": float(stk_ant_dec),
                "stock_nuevo": float(stock_nuevo_dec),
                "cpp_anterior": float(cpp_ant_dec),
                "cpp_nuevo": float(cpp_nuevo_dec),
                "costo_cpp_nuevo": float(cpp_nuevo_dec),
                "subtipo_movimiento": subtipo_linea,
                "documento_linea_id": ajuste_det_id,
                "movimiento_id": mov_id
            })

        if auto_commit and conn is not None and conn.in_transaction:
            conn.commit()

        return {
            "success": True,
            "duplicado_ignorado": False,
            "id": ajuste_id,
            "ajuste_id": ajuste_id,
            "numero_ajuste": numero_ajuste,
            "tipo_ajuste": tipo_ajuste,
            "subtipo_ajuste": subtipo_canonico,
            "motivo": motivo,
            "fecha": fecha_ajuste,
            "estado": "activo",
            "documento_referencia": documento_referencia or None,
            "autorizado_por": autorizado_por or None,
            "idempotency_key": idempotency_key or None,
            "ajuste_referencia_id": ajuste_referencia_id,
            "total_items": len(detalles_procesados),
            "detalles": detalles_procesados,
            "message": f"Ajuste {tipo_ajuste} ({subtipo_canonico}) {numero_ajuste} procesado exitosamente"
        }
    except Exception:
        if conn is not None and conn.in_transaction:
            conn.rollback()
        raise


def anular_ajuste_inventario(cursor, ajuste_id, motivo="Anulación directa de ajuste de inventario", usuario_id=1, conn=None, auto_commit=True):
    """
    Anula directamente un ajuste de inventario bajo regla estricta LIFO por SKU (FASE 2F-5B Sección 14):
      1. Verifica que el ajuste exista y esté en estado 'activo'.
      2. Verifica que pertenezca a un período abierto (fecha > '2026-10-23 23:59:59' y movimientos con id > 108).
      3. Verifica que NINGUNO de los SKUs afectados tenga movimientos posteriores en inventario_movimientos
         (regla Tope de Pila / LIFO por SKU). Si existe cualquier movimiento posterior -> lanza
         ErrorAnulacionAjusteConMovimientosPosteriores.
      4. Invierte el stock físicamente, restaura exactamente cpp_anterior en productos.costo_cpp,
         inserta el movimiento de reversión con subtipo_movimiento='ANULACION_AJUSTE' y documento_linea_id,
         y marca inventario_ajustes.estado = 'anulado'.
    """
    if conn is None:
        conn = getattr(cursor, "connection", None)

    ajuste_id = int(ajuste_id)
    started_tx = False
    if conn is not None and not conn.in_transaction:
        cursor.execute("BEGIN IMMEDIATE")
        started_tx = True

    try:
        cursor.execute("SELECT * FROM inventario_ajustes WHERE id = ?", (ajuste_id,))
        aj_row = cursor.fetchone()
        if not aj_row:
            raise LookupError(f"AJUSTE_NO_ENCONTRADO: Ajuste de inventario ID {ajuste_id} no existe.")
        aj = dict(aj_row)

        estado_actual = str(aj.get("estado") or "activo").strip().lower()
        if estado_actual == "anulado":
            raise ValueError(f"AJUSTE_YA_ANULADO: El ajuste {aj['numero_ajuste']} ya fue anulado previamente.")

        if str(aj.get("fecha") or "") <= "2026-10-23 23:59:59":
            raise ErrorAnulacionAjusteConMovimientosPosteriores(
                f"PERIODO_CERRADO: El ajuste {aj['numero_ajuste']} pertenece al período histórico certificado cerrado. "
                "Prohibido anular ajustes históricos; utilice un Contra-Ajuste compensatorio."
            )

        cursor.execute("""
            SELECT * FROM inventario_ajuste_detalles
            WHERE ajuste_id = ?
            ORDER BY id ASC
        """, (ajuste_id,))
        detalles = [dict(r) for r in cursor.fetchall()]
        if not detalles:
            raise ValueError(f"El ajuste {aj['numero_ajuste']} no posee líneas de detalle para anular.")

        # Validar regla LIFO por SKU en inventario_movimientos
        movimientos_originales = {}
        for det in detalles:
            p_id = int(det["producto_id"])
            det_id = int(det["id"])
            cursor.execute("""
                SELECT id, fecha, tipo_movimiento
                FROM inventario_movimientos
                WHERE documento_tipo = 'INVENTARIO_AJUSTE'
                  AND documento_id = ?
                  AND producto_id = ?
                  AND (documento_linea_id = ? OR documento_linea_id IS NULL)
                ORDER BY id DESC LIMIT 1
            """, (ajuste_id, p_id, det_id))
            mov_orig = cursor.fetchone()
            if not mov_orig:
                raise ValueError(
                    f"No se encontró asiento en inventario_movimientos para el ajuste {aj['numero_ajuste']} (producto ID {p_id})."
                )
            mov_orig_dict = dict(mov_orig)
            if int(mov_orig_dict["id"]) <= 108:
                raise ErrorAnulacionAjusteConMovimientosPosteriores(
                    f"PERIODO_CERRADO: El movimiento ID {mov_orig_dict['id']} pertenece al corte histórico inmutable (id <= 108)."
                )
            movimientos_originales[det_id] = mov_orig_dict

            # Buscar si existe cualquier movimiento posterior para este SKU
            cursor.execute("""
                SELECT id, fecha, tipo_movimiento, documento_tipo, documento_numero
                FROM inventario_movimientos
                WHERE producto_id = ?
                  AND (fecha > ? OR (fecha = ? AND id > ?))
                ORDER BY fecha ASC, id ASC
                LIMIT 1
            """, (p_id, mov_orig_dict["fecha"], mov_orig_dict["fecha"], mov_orig_dict["id"]))
            mov_post = cursor.fetchone()
            if mov_post:
                mp = dict(mov_post)
                raise ErrorAnulacionAjusteConMovimientosPosteriores(
                    f"ANULACION_BLOQUEADA_MOVIMIENTOS_POSTERIORES: No se puede anular directamente el ajuste "
                    f"{aj['numero_ajuste']} porque el producto ID {p_id} registra movimientos posteriores "
                    f"(Movimiento ID {mp['id']}, tipo '{mp['tipo_movimiento']}', fecha {mp['fecha']}). "
                    "Para preservar el CPP histórico de operaciones posteriores, emita un Contra-Ajuste compensatorio."
                )

        fecha_anulacion = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        tipo_ajuste = str(aj["tipo_ajuste"]).strip().upper()
        lineas_revertidas = []

        for det in detalles:
            p_id = int(det["producto_id"])
            det_id = int(det["id"])
            mov_orig_dict = movimientos_originales[det_id]
            # Asegurar que la fecha del movimiento de reversión no sea anterior al movimiento original
            fecha_rev = max(fecha_anulacion, str(mov_orig_dict["fecha"]))

            cursor.execute("SELECT id, codigo, nombre, stock, costo_cpp FROM productos WHERE id = ?", (p_id,))
            prod_row = dict(cursor.fetchone())
            stk_actual_dec = Decimal(str(prod_row.get("stock") or 0.0)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
            cpp_actual_dec = Decimal(str(prod_row.get("costo_cpp") or 0.0)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
            cant_dec = Decimal(str(det["cantidad"])).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
            costo_u_dec = Decimal(str(det["costo_unitario"])).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
            costo_tot_dec = Decimal(str(det["costo_total"])).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

            cpp_restaurado_val = det.get("cpp_anterior")
            if cpp_restaurado_val is not None:
                cpp_restaurado_dec = Decimal(str(cpp_restaurado_val)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
            else:
                cpp_restaurado_dec = cpp_actual_dec

            if tipo_ajuste == "CARGO":
                # Anular un CARGO requiere retirar las unidades ingresadas
                validar_stock_no_negativo(stk_actual_dec, cant_dec)
                stk_nuevo_dec = (stk_actual_dec - cant_dec).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                sentido_rev = "SALIDA"
                tipo_mov_rev = "descargo_merma"
            else:
                # Anular un DESCARGO reintegra las unidades retiradas
                stk_nuevo_dec = (stk_actual_dec + cant_dec).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                sentido_rev = "ENTRADA"
                tipo_mov_rev = "cargo_ajuste"

            # Actualizar producto restaurando stock y cpp_anterior exacto
            cursor.execute("""
                UPDATE productos
                SET stock = ?, costo_cpp = ?
                WHERE id = ?
            """, (float(stk_nuevo_dec), float(cpp_restaurado_dec), p_id))

            mov_rev_id = registrar_movimiento_inventario(
                cursor=cursor,
                producto_id=p_id,
                fecha=fecha_rev,
                tipo_movimiento=tipo_mov_rev,
                sentido=sentido_rev,
                cantidad=float(cant_dec),
                costo_unitario=float(costo_u_dec),
                costo_total=float(costo_tot_dec),
                stock_anterior=float(stk_actual_dec),
                stock_nuevo=float(stk_nuevo_dec),
                documento_tipo="ANULACION_AJUSTE",
                documento_id=ajuste_id,
                documento_linea_id=det_id,
                documento_numero=aj["numero_ajuste"],
                motivo=f"Anulación directa de Ajuste #{aj['numero_ajuste']}: {motivo}",
                usuario_id=usuario_id,
                subtipo_movimiento="ANULACION_AJUSTE",
                cpp_anterior=float(cpp_actual_dec),
                cpp_nuevo=float(cpp_restaurado_dec)
            )

            lineas_revertidas.append({
                "detalle_id": det_id,
                "producto_id": p_id,
                "cantidad_revertida": float(cant_dec),
                "stock_anterior": float(stk_actual_dec),
                "stock_restaurado": float(stk_nuevo_dec),
                "cpp_anterior_anulacion": float(cpp_actual_dec),
                "cpp_restaurado": float(cpp_restaurado_dec),
                "movimiento_reversion_id": mov_rev_id
            })

        cursor.execute("""
            UPDATE inventario_ajustes
            SET estado = 'anulado',
                motivo_anulacion = ?,
                fecha_anulacion = ?,
                usuario_anulacion_id = ?
            WHERE id = ?
        """, (motivo, fecha_anulacion, int(usuario_id), ajuste_id))

        if auto_commit and conn is not None and conn.in_transaction:
            conn.commit()

        return {
            "success": True,
            "id": ajuste_id,
            "numero_ajuste": aj["numero_ajuste"],
            "tipo_ajuste": tipo_ajuste,
            "subtipo_ajuste": aj.get("subtipo_ajuste"),
            "estado": "anulado",
            "motivo_anulacion": motivo,
            "fecha_anulacion": fecha_anulacion,
            "lineas_revertidas": lineas_revertidas,
            "message": f"Ajuste #{aj['numero_ajuste']} anulado exitosamente. Stock y CPP restaurados a su estado previo."
        }
    except Exception:
        if conn is not None and conn.in_transaction:
            conn.rollback()
        raise



# ========================================================
# FUNCIONES TRANSACCIONALES DE ANULACIÓN (FASE 4 - SENIOR)
# ========================================================

def anular_factura_venta(cursor, factura_id, motivo="Anulación de factura", usuario_id=1):
    """
    Anula atómicamente una factura de venta:
    1. Valida que exista y no esté anulada previamente.
    2. Para cada producto inventariable, reingresa el stock (+) al costo histórico original congelado.
    3. Recalcula el costo CPP con precisión matemática.
    4. Registra en inventario_movimientos: tipo 'anulacion_venta', sentido 'ENTRADA'.
    5. Anula la cuenta por cobrar asociada (si existe crédito) y anula sus abonos.
    6. Marca la factura como 'anulada'.
    """
    cursor.execute("SELECT * FROM facturas WHERE id = ?", (factura_id,))
    fac_row = cursor.fetchone()
    if not fac_row:
        raise ValueError(f"Factura ID {factura_id} no encontrada")
    
    fac = dict(fac_row)
    if fac.get("estado") == "anulada":
        raise ValueError(f"La factura #{fac.get('numero_factura')} ya se encuentra anulada.")

    fecha_hoy = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    num_fac = fac.get("numero_factura", f"FAC-{factura_id}")

    # 1. Recuperar detalles de la factura
    cursor.execute("""
        SELECT fd.*, p.tipo as prod_tipo_cat, p.stock as stock_actual, p.costo_cpp as cpp_actual, p.costo as costo_actual, p.nombre as prod_nombre
        FROM factura_detalles fd
        LEFT JOIN productos p ON fd.producto_id = p.id
        WHERE fd.factura_id = ?
    """, (factura_id,))
    detalles = [dict(r) for r in cursor.fetchall()]

    productos_afectados = []

    for d in detalles:
        p_id = d.get("producto_id")
        if not p_id or d.get("tipo") == "servicio" or d.get("prod_tipo_cat") == "servicio":
            continue

        cant = float(d.get("cantidad") or 0.0)
        if cant <= 0:
            continue

        stock_ant = float(d.get("stock_actual") or 0.0)
        cpp_ant = float(d.get("cpp_actual") or d.get("costo_actual") or 0.0)
        
        # Costo unitario histórico documentado y congelado al momento de la venta
        costo_hist = float(d.get("costo_unitario") if d.get("costo_unitario") is not None else cpp_ant)
        costo_tot_hist = round(cant * costo_hist, 4)

        stock_nuevo = round(stock_ant + cant, 4)

        # Recálculo de CPP considerando reingreso al costo histórico
        if stock_ant <= 0:
            cpp_nuevo = round(costo_hist, 4)
        else:
            val_ant = Decimal(str(stock_ant)) * Decimal(str(cpp_ant))
            val_reingreso = Decimal(str(cant)) * Decimal(str(costo_hist))
            cpp_nuevo = float(((val_ant + val_reingreso) / Decimal(str(stock_nuevo))).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP))

        # Actualizar producto
        cursor.execute("""
            UPDATE productos 
            SET stock = ?, costo_cpp = ? 
            WHERE id = ?
        """, (stock_nuevo, cpp_nuevo, p_id))

        # Registrar movimiento en libro mayor
        registrar_movimiento_inventario(
            cursor=cursor,
            producto_id=p_id,
            fecha=fecha_hoy,
            tipo_movimiento="devolucion_cliente",
            sentido="ENTRADA",
            cantidad=cant,
            costo_unitario=costo_hist,
            costo_total=costo_tot_hist,
            stock_anterior=stock_ant,
            stock_nuevo=stock_nuevo,
            documento_tipo="factura",
            documento_id=factura_id,
            documento_numero=num_fac,
            motivo=f"Anulación de Factura #{num_fac}: {motivo}",
            usuario_id=usuario_id,
            documento_linea_id=d.get("id")
        )

        productos_afectados.append({
            "producto_id": p_id,
            "nombre": d.get("prod_nombre"),
            "cantidad_reingresada": cant,
            "stock_anterior": stock_ant,
            "stock_nuevo": stock_nuevo,
            "cpp_anterior": cpp_ant,
            "cpp_nuevo": cpp_nuevo
        })

    # 2. Cuentas por Cobrar (CxC): Si era a crédito, anular la cuenta y sus abonos
    cursor.execute("SELECT id FROM cuentas_por_cobrar WHERE factura_id = ?", (factura_id,))
    cxc_rows = cursor.fetchall()
    for cxc_r in cxc_rows:
        cxc_id = cxc_r[0]
        # Anular abonos vinculados
        cursor.execute("""
            UPDATE abonos_cxc 
            SET estado = 'anulado', motivo_anulacion = ?, fecha_anulacion = ? 
            WHERE cxc_id = ? AND (estado IS NULL OR estado != 'anulado')
        """, (f"Anulación de factura raíz #{num_fac}", fecha_hoy, cxc_id))

        # Anular cuenta por cobrar
        cursor.execute("""
            UPDATE cuentas_por_cobrar 
            SET estado = 'anulada', saldo_pendiente = 0.0, motivo_anulacion = ?, fecha_anulacion = ? 
            WHERE id = ?
        """, (motivo, fecha_hoy, cxc_id))

    # 3. Marcar factura como anulada
    cursor.execute("""
        UPDATE facturas 
        SET estado = 'anulada', saldo_pendiente = 0.0, motivo_anulacion = ?, fecha_anulacion = ?, usuario_anulacion_id = ?
        WHERE id = ?
    """, (motivo, fecha_hoy, usuario_id, factura_id))

    return {
        "success": True,
        "factura_id": factura_id,
        "numero_factura": num_fac,
        "productos_reingresados": productos_afectados,
        "estado": "anulada",
        "fecha_anulacion": fecha_hoy
    }


def anular_devolucion_cliente(cursor, devolucion_id, motivo="Anulación de devolución", usuario_id=1):
    """
    Anula atómicamente una devolución de cliente (nota de crédito):
    1. Valida que exista y no esté previamente anulada.
    2. Valida que haya stock suficiente para retirar la mercancía devuelta (no permitir stock negativo).
    3. Descuenta el stock físico (-).
    4. Registra en inventario_movimientos: tipo 'anulacion_devolucion', sentido 'SALIDA'.
    5. Si amortizaba una factura a crédito original, reincrementa el saldo deudor de la CxC.
    6. Marca devolución como 'anulada'.
    """
    cursor.execute("SELECT * FROM devoluciones WHERE id = ?", (devolucion_id,))
    dev_row = cursor.fetchone()
    if not dev_row:
        raise ValueError(f"Devolución ID {devolucion_id} no encontrada")
    
    dev = dict(dev_row)
    if dev.get("estado") == "anulada":
        raise ValueError(f"La devolución #{dev.get('numero_devolucion')} ya se encuentra anulada.")

    fecha_hoy = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    num_dev = dev.get("numero_devolucion", f"DEV-{devolucion_id}")
    fac_id_orig = dev.get("factura_id")

    # 1. Detalles de la devolución
    cursor.execute("""
        SELECT dd.*, p.stock as stock_actual, p.costo_cpp as cpp_actual, p.costo as costo_actual, p.nombre as prod_nombre
        FROM devolucion_detalles dd
        LEFT JOIN productos p ON dd.producto_id = p.id
        WHERE dd.devolucion_id = ?
    """, (devolucion_id,))
    detalles = [dict(r) for r in cursor.fetchall()]

    productos_afectados = []

    # Validar existencias antes de tocar nada (Principio de Atomicidad)
    for d in detalles:
        p_id = d.get("producto_id")
        if not p_id or d.get("tipo") == "servicio":
            continue
        cant = float(d.get("cantidad") or 0.0)
        stock_ant = float(d.get("stock_actual") or 0.0)
        if stock_ant < cant - 0.0001:
            raise ValueError(f"Stock insuficiente para anular devolución de '{d.get('prod_nombre')}'. Stock actual: {stock_ant}, requerido retirar: {cant}.")

    # Ejecutar retiro de inventario
    for d in detalles:
        p_id = d.get("producto_id")
        if not p_id or d.get("tipo") == "servicio":
            continue

        cant = float(d.get("cantidad") or 0.0)
        stock_ant = float(d.get("stock_actual") or 0.0)
        stock_nuevo = round(max(0.0, stock_ant - cant), 4)
        c_u = float(d.get("cpp_actual") or d.get("costo_actual") or 0.0)
        c_tot = round(cant * c_u, 4)

        cursor.execute("UPDATE productos SET stock = ? WHERE id = ?", (stock_nuevo, p_id))

        registrar_movimiento_inventario(
            cursor=cursor,
            producto_id=p_id,
            fecha=fecha_hoy,
            tipo_movimiento="venta",
            sentido="SALIDA",
            cantidad=cant,
            costo_unitario=c_u,
            costo_total=c_tot,
            stock_anterior=stock_ant,
            stock_nuevo=stock_nuevo,
            documento_tipo="devolucion",
            documento_id=devolucion_id,
            documento_numero=num_dev,
            motivo=f"Anulación de Devolución #{num_dev}: {motivo}",
            usuario_id=usuario_id,
            documento_linea_id=d.get("id")
        )

        productos_afectados.append({
            "producto_id": p_id,
            "nombre": d.get("prod_nombre"),
            "cantidad_retirada": cant,
            "stock_anterior": stock_ant,
            "stock_nuevo": stock_nuevo
        })

    # 2. Si la devolución afectó una factura a crédito activa, reincrementar saldo deudor
    if fac_id_orig:
        monto_reintegrar_usd = float(dev.get("total_usd") or 0.0)
        cursor.execute("SELECT id, monto_total, monto_pagado, saldo_pendiente, estado FROM cuentas_por_cobrar WHERE factura_id = ? AND estado != 'anulada'", (fac_id_orig,))
        cxc_row = cursor.fetchone()
        if cxc_row:
            cxc_d = dict(cxc_row)
            nuevo_saldo = round(float(cxc_d["saldo_pendiente"]) + monto_reintegrar_usd, 2)
            nuevo_estado = "pendiente" if nuevo_saldo >= float(cxc_d["monto_total"]) - 0.001 else "parcial"
            cursor.execute("""
                UPDATE cuentas_por_cobrar 
                SET saldo_pendiente = ?, estado = ? 
                WHERE id = ?
            """, (nuevo_saldo, nuevo_estado, cxc_d["id"]))

            cursor.execute("""
                UPDATE facturas 
                SET saldo_pendiente = round(saldo_pendiente + ?, 2) 
                WHERE id = ? AND estado != 'anulada'
            """, (monto_reintegrar_usd, fac_id_orig))

    # 3. Marcar devolución como anulada
    cursor.execute("""
        UPDATE devoluciones 
        SET estado = 'anulada', motivo_anulacion = ?, fecha_anulacion = ? 
        WHERE id = ?
    """, (motivo, fecha_hoy, devolucion_id))

    return {
        "success": True,
        "devolucion_id": devolucion_id,
        "numero_devolucion": num_dev,
        "productos_retirados": productos_afectados,
        "estado": "anulada",
        "fecha_anulacion": fecha_hoy
    }


def anular_compra_proveedor(cursor, compra_id, motivo="Anulación de compra", usuario_id=1):
    """
    Anula atómicamente una compra a proveedor:
    1. Valida existencia y que no esté previamente anulada.
    2. Valida stock suficiente disponible para retirar (evita stock negativo si ya se vendió mercancía).
    3. Descuenta existencias físicas del almacén (-).
    4. Registra en inventario_movimientos: tipo 'anulacion_compra', sentido 'SALIDA'.
    5. Anula la cuenta por pagar vinculada (saldo=0, estado='anulada') y sus abonos.
    6. Marca la compra como 'anulada'.
    """
    cursor.execute("SELECT * FROM compras WHERE id = ?", (compra_id,))
    comp_row = cursor.fetchone()
    if not comp_row:
        raise ValueError(f"Compra ID {compra_id} no encontrada")
    
    comp = dict(comp_row)
    if comp.get("estado") == "anulada":
        raise ValueError(f"La compra #{comp.get('numero_control') or compra_id} ya se encuentra anulada.")

    fecha_hoy = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    num_comp = comp.get("numero_control") or comp.get("numero_factura") or f"COM-{compra_id}"

    # 1. Obtener detalles de la compra
    cursor.execute("""
        SELECT cd.*, p.stock as stock_actual, p.costo_cpp as cpp_actual, p.costo as costo_actual, p.nombre as prod_nombre
        FROM compra_detalles cd
        LEFT JOIN productos p ON cd.producto_id = p.id
        WHERE cd.compra_id = ?
    """, (compra_id,))
    detalles = [dict(r) for r in cursor.fetchall()]

    productos_afectados = []

    # Validar existencias físicas disponibles
    for d in detalles:
        p_id = d.get("producto_id")
        if not p_id:
            continue
        cant = float(d.get("cantidad") or 0.0)
        stock_ant = float(d.get("stock_actual") or 0.0)
        if stock_ant < cant - 0.0001:
            raise ValueError(
                f"No es posible anular la compra: Stock insuficiente para '{d.get('prod_nombre')}'. "
                f"Stock actual: {stock_ant}, comprado: {cant}. Ya se ha vendido parte de esta mercancía."
            )

    # Ejecutar retiro de inventario
    for d in detalles:
        p_id = d.get("producto_id")
        if not p_id:
            continue

        cant = float(d.get("cantidad") or 0.0)
        stock_ant = float(d.get("stock_actual") or 0.0)
        stock_nuevo = round(max(0.0, stock_ant - cant), 4)
        c_u = float(d.get("costo_unitario") or d.get("costo_actual") or 0.0)
        c_tot = round(cant * c_u, 4)

        cursor.execute("UPDATE productos SET stock = ? WHERE id = ?", (stock_nuevo, p_id))

        registrar_movimiento_inventario(
            cursor=cursor,
            producto_id=p_id,
            fecha=fecha_hoy,
            tipo_movimiento="devolucion_proveedor",
            sentido="SALIDA",
            cantidad=cant,
            costo_unitario=c_u,
            costo_total=c_tot,
            stock_anterior=stock_ant,
            stock_nuevo=stock_nuevo,
            documento_tipo="compra",
            documento_id=compra_id,
            documento_numero=num_comp,
            motivo=f"Anulación de Compra #{num_comp}: {motivo}",
            usuario_id=usuario_id,
            documento_linea_id=d.get("id")
        )

        productos_afectados.append({
            "producto_id": p_id,
            "nombre": d.get("prod_nombre"),
            "cantidad_retirada": cant,
            "stock_anterior": stock_ant,
            "stock_nuevo": stock_nuevo
        })

    # 2. Cuentas por Pagar (CxP): Anular la deuda vinculada y sus abonos
    cursor.execute("SELECT id FROM cuentas_por_pagar WHERE compra_id = ?", (compra_id,))
    cxp_rows = cursor.fetchall()
    for cxp_r in cxp_rows:
        cxp_id = cxp_r[0]
        cursor.execute("""
            UPDATE abonos_cxp 
            SET estado = 'anulado', motivo_anulacion = ?, fecha_anulacion = ? 
            WHERE cxp_id = ? AND (estado IS NULL OR estado != 'anulado')
        """, (f"Anulación de compra raíz #{num_comp}", fecha_hoy, cxp_id))

        cursor.execute("""
            UPDATE cuentas_por_pagar 
            SET estado = 'anulada', saldo_pendiente = 0.0, motivo_anulacion = ?, fecha_anulacion = ? 
            WHERE id = ?
        """, (motivo, fecha_hoy, cxp_id))

    # 3. Marcar compra como anulada
    cursor.execute("""
        UPDATE compras 
        SET estado = 'anulada', saldo_pendiente = 0.0, motivo_anulacion = ?, fecha_anulacion = ? 
        WHERE id = ?
    """, (motivo, fecha_hoy, compra_id))

    return {
        "success": True,
        "compra_id": compra_id,
        "numero_control": num_comp,
        "productos_retirados": productos_afectados,
        "estado": "anulada",
        "fecha_anulacion": fecha_hoy
    }



# ========================================================
# PROCESAR DEVOLUCIÓN DE COMPRAS (PROVEEDORES / NOTA DE DÉBITO)
# ========================================================
def procesar_devolucion_compra(cursor, data):
    """
    Procesa con exactitud atómica una devolución de mercancía a proveedor (Nota de Débito de Compra):
    1. Valida compra_id, proveedor_id, ítems a devolver y motivo.
    2. Valida existencias físicas disponibles en almacén (stock_actual >= cantidad_devuelta)
       para prevenir terminantemente inventario negativo.
    3. Valida que la cantidad a devolver no supere lo comprado originalmente en dicha factura
       (descontando devoluciones previas si las hubo).
    4. Descuenta las existencias del inventario (stock_nuevo = stock_anterior - cantidad_devuelta).
    5. Registra el movimiento oficial en el Kardex (inventario_movimientos):
       tipo_movimiento='devolucion_proveedor', sentido='SALIDA'.
    6. Descuenta el monto de la Cuenta por Pagar (CxP) asociada a la compra:
       - Si la cuenta tiene saldo pendiente: reduce saldo_pendiente y monto_total proporcionalmente.
       - Si la compra ya estaba pagada o la devolución excede el saldo: registra el excedente como saldo a favor del proveedor.
    7. Registra Nota de Débito en notas_ajuste_comercial (modulo='cxp', efecto='disminuye', tipo_nota='debito').
    8. Inserta registros en devoluciones_compras y devolucion_compra_detalles.
    9. NO AFECTA VENTAS NI CLIENTES.
    """
    compra_id = data.get("compra_id")
    proveedor_id = data.get("proveedor_id")
    motivo = (data.get("motivo") or "").strip()
    if not motivo:
        motivo = "Devolución de mercancía a proveedor / Nota de Débito"
    items = data.get("items") or []
    fecha_emision = data.get("fecha") or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if len(fecha_emision) == 10:
        fecha_emision += " " + datetime.now().strftime("%H:%M:%S")
    usuario_id = int(data.get("usuario_id") or 1)
    notas = (data.get("notas") or "").strip()

    if not items or len(items) == 0:
        raise ValueError("La devolución debe contener al menos un producto a devolver.")

    # 1. Validar compra si se especifica
    compra = None
    if compra_id:
        cursor.execute("SELECT * FROM compras WHERE id = ?", (compra_id,))
        c_row = cursor.fetchone()
        if not c_row:
            raise ValueError(f"Compra ID {compra_id} no encontrada.")
        compra = dict(c_row)
        if compra.get("estado") == "anulada":
            raise ValueError(f"La compra #{compra.get('numero_control') or compra_id} se encuentra anulada. No se pueden procesar devoluciones.")
        if not proveedor_id:
            proveedor_id = compra["proveedor_id"]

    if not proveedor_id:
        raise ValueError("Se requiere especificar un proveedor para procesar la devolución.")

    # 2. Validar proveedor
    cursor.execute("SELECT * FROM proveedores WHERE id = ?", (proveedor_id,))
    p_row = cursor.fetchone()
    if not p_row:
        raise ValueError(f"Proveedor ID {proveedor_id} no encontrado.")
    prov = dict(p_row)

    # 3. Tasas de cambio configuradas
    cursor.execute("SELECT * FROM configuracion WHERE id = 1")
    cfg_row = cursor.fetchone()
    cfg = dict(cfg_row) if cfg_row else {}
    tasa_ves = float(cfg.get("tasa_ves") or 45.0)
    tasa_cop = float(cfg.get("tasa_cop") or 4100.0)
    iva_pct = float(cfg.get("iva_porcentaje") or 16.0) / 100.0

    # 4. Validar ítems, stock disponible y cantidades originales
    detalles_procesados = []
    subtotal_dev = 0.0
    iva_dev = 0.0

    for itm in items:
        prod_id = itm.get("producto_id")
        compra_det_id = itm.get("compra_detalle_id")
        cant_dev = float(itm.get("cantidad") or 0.0)

        if cant_dev <= 0:
            continue

        # Validar producto en catálogo
        cursor.execute("SELECT * FROM productos WHERE id = ?", (prod_id,))
        prod_row = cursor.fetchone()
        if not prod_row:
            raise ValueError(f"Producto ID {prod_id} no existe en catálogo.")
        prod = dict(prod_row)

        if prod.get("tipo") == "servicio":
            raise ValueError(f"El ítem '{prod.get('nombre')}' es un servicio y no admite devolución física a proveedor.")

        stock_actual = float(prod.get("stock") or 0.0)

        # Regla estricta: NO permitir devolución que genere stock negativo en almacén
        if stock_actual < cant_dev - 0.0001:
            raise ValueError(
                f"Stock físico insuficiente en almacén para '{prod.get('nombre')}'. "
                f"Existencia actual: {stock_actual}, cantidad a devolver solicitada: {cant_dev}. "
                "No es posible procesar la devolución sin existencias disponibles."
            )

        # Si viene vinculado a una compra, validar límite contra compra_detalles
        cd = None
        if compra_id:
            if compra_det_id:
                cursor.execute("SELECT * FROM compra_detalles WHERE id = ? AND compra_id = ?", (compra_det_id, compra_id))
                cd_row = cursor.fetchone()
                if not cd_row:
                    raise ValueError(f"El renglón de compra {compra_det_id} no pertenece a la compra {compra_id}.")
                cd = dict(cd_row)
            else:
                cursor.execute("SELECT * FROM compra_detalles WHERE compra_id = ? AND producto_id = ?", (compra_id, prod_id))
                cd_row = cursor.fetchone()
                if cd_row:
                    cd = dict(cd_row)
                    compra_det_id = cd["id"]

            if cd:
                cant_comprada = float(cd.get("cantidad") or 0.0)
                # Verificar devoluciones previas de este renglón
                cursor.execute("""
                    SELECT COALESCE(SUM(dcd.cantidad), 0)
                    FROM devolucion_compra_detalles dcd
                    JOIN devoluciones_compras dc ON dcd.devolucion_compra_id = dc.id
                    WHERE dcd.compra_detalle_id = ? AND dc.estado != 'anulada'
                """, (cd["id"],))
                prev_dev = float(cursor.fetchone()[0] or 0.0)
                disp_linea = cant_comprada - prev_dev
                if cant_dev > disp_linea + 0.0001:
                    raise ValueError(
                        f"Cantidad a devolver ({cant_dev}) supera la cantidad disponible comprada ({disp_linea}) "
                        f"para '{prod.get('nombre')}' en la compra #{compra.get('numero_control') or compra_id}."
                    )

        costo_u = float(itm.get("costo_unitario") or (cd.get("costo_unitario") if cd else prod.get("costo", 0.0)))
        imp_tipo = itm.get("impuesto_tipo") or (cd.get("impuesto_tipo") if cd else prod.get("impuesto_tipo", "exento"))

        sub_itm = round(cant_dev * costo_u, 4)
        iva_itm = round(sub_itm * iva_pct, 4) if imp_tipo == "gravado" else 0.0
        tot_itm = round(sub_itm + iva_itm, 4)

        subtotal_dev += sub_itm
        iva_dev += iva_itm

        detalles_procesados.append({
            "producto_id": prod_id,
            "compra_detalle_id": compra_det_id,
            "codigo": prod.get("codigo", ""),
            "nombre_producto": prod.get("nombre", ""),
            "impuesto_tipo": imp_tipo,
            "cantidad": cant_dev,
            "costo_unitario": costo_u,
            "iva_unitario": round(iva_itm / cant_dev, 4) if cant_dev > 0 else 0.0,
            "subtotal": sub_itm,
            "total": tot_itm,
            "stock_anterior": stock_actual,
            "stock_nuevo": round(stock_actual - cant_dev, 4)
        })

    if not detalles_procesados:
        raise ValueError("Debe ingresar al menos una cantidad mayor a 0 para devolver.")

    total_usd = round(subtotal_dev + iva_dev, 2)
    subtotal_usd = round(subtotal_dev, 2)
    iva_usd = round(iva_dev, 2)
    total_ves = round(total_usd * tasa_ves, 2)
    total_cop = round(total_usd * tasa_cop, 2)

    # 5. Generar número correlativo DEV-COM-000001
    cursor.execute("SELECT COALESCE(MAX(id), 0) + 1 FROM devoluciones_compras")
    correlativo = cursor.fetchone()[0]
    numero_devolucion = f"DEV-COM-{correlativo:06d}"

    # 6. Descuento en Cuenta por Pagar (CXP)
    monto_descontado_cxp = 0.0
    monto_saldo_favor = 0.0
    cxp_afectada_id = None

    if compra_id:
        cursor.execute("SELECT * FROM cuentas_por_pagar WHERE compra_id = ? AND estado != 'anulada'", (compra_id,))
        cxp_row = cursor.fetchone()
        if cxp_row:
            cxp = dict(cxp_row)
            cxp_afectada_id = cxp["id"]
            saldo_pendiente_actual = float(cxp.get("saldo_pendiente") or 0.0)

            if saldo_pendiente_actual > 0:
                desc_aplicado = min(saldo_pendiente_actual, total_usd)
                monto_descontado_cxp = round(desc_aplicado, 2)
                nuevo_saldo_cxp = max(0.0, round(saldo_pendiente_actual - desc_aplicado, 2))
                nuevo_monto_total_cxp = max(0.0, round(float(cxp["monto_total"]) - desc_aplicado, 2))
                nuevo_estado_cxp = "pagada" if nuevo_saldo_cxp <= 0.001 else ("parcial" if float(cxp["monto_pagado"]) > 0 else "pendiente")

                cursor.execute("""
                    UPDATE cuentas_por_pagar
                    SET saldo_pendiente = ?, monto_total = ?, estado = ?
                    WHERE id = ?
                """, (nuevo_saldo_cxp, nuevo_monto_total_cxp, nuevo_estado_cxp, cxp["id"]))

                # Actualizar saldo_pendiente de la compra
                cursor.execute("""
                    UPDATE compras
                    SET saldo_pendiente = ?
                    WHERE id = ?
                """, (nuevo_saldo_cxp, compra_id))

                if total_usd > desc_aplicado:
                    monto_saldo_favor = round(total_usd - desc_aplicado, 2)
            else:
                monto_saldo_favor = total_usd
        else:
            monto_saldo_favor = total_usd
    else:
        monto_saldo_favor = total_usd

    # 7. Registrar Nota de Débito en notas_ajuste_comercial
    try:
        cursor.execute("""
            INSERT INTO notas_ajuste_comercial (
                modulo, tercero_id, cuenta_id, tipo_nota, numero_nota, fecha,
                monto_usd, tasa_bcv, monto_ves, efecto, motivo, numero_control,
                afecta_libro_fiscal, usuario_id
            ) VALUES ('cxp', ?, ?, 'debito', ?, ?, ?, ?, ?, 'disminuye', ?, ?, 1, ?)
        """, (
            proveedor_id,
            cxp_afectada_id,
            numero_devolucion,
            fecha_emision,
            total_usd,
            tasa_ves,
            total_ves,
            f"Devolución de Compra #{numero_devolucion}: {motivo}",
            numero_devolucion,
            usuario_id
        ))
    except Exception as e:
        pass

    # 8. Insertar cabecera de devolución de compra
    num_fact_prov = compra.get("numero_factura") if compra else None
    num_ctrl_comp = compra.get("numero_control") if compra else None
    fecha_comp_orig = compra.get("fecha") if compra else None

    cursor.execute("""
        INSERT INTO devoluciones_compras (
            numero_devolucion, compra_id, numero_factura_proveedor, numero_control_compra,
            proveedor_id, proveedor_nombre, proveedor_rif, proveedor_telefono,
            fecha_emision, fecha_compra_original, tipo_devolucion, motivo,
            subtotal_usd, iva_usd, total_usd, tasa_ves, tasa_cop, total_ves, total_cop,
            monto_descontado_cxp, monto_saldo_favor, estado, usuario_id, notas
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'activa', ?, ?)
    """, (
        numero_devolucion, compra_id, num_fact_prov, num_ctrl_comp,
        proveedor_id, prov.get("nombre", ""), prov.get("rif") or prov.get("cedula", ""), prov.get("telefono", ""),
        fecha_emision, fecha_comp_orig, "parcial", motivo,
        subtotal_usd, iva_usd, total_usd, tasa_ves, tasa_cop, total_ves, total_cop,
        monto_descontado_cxp, monto_saldo_favor, usuario_id, notas
    ))
    dev_comp_id = cursor.lastrowid

    # 9. Insertar renglones y ejecutar descuento físico en inventario + Kardex
    for d in detalles_procesados:
        cursor.execute("""
            INSERT INTO devolucion_compra_detalles (
                devolucion_compra_id, compra_detalle_id, producto_id, codigo,
                nombre_producto, impuesto_tipo, cantidad, costo_unitario,
                iva_unitario, subtotal, total
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            dev_comp_id, d["compra_detalle_id"], d["producto_id"], d["codigo"],
            d["nombre_producto"], d["impuesto_tipo"], d["cantidad"], d["costo_unitario"],
            d["iva_unitario"], d["subtotal"], d["total"]
        ))
        dcd_id = cursor.lastrowid

        # Descontar stock físico (-)
        cursor.execute("UPDATE productos SET stock = ? WHERE id = ?", (d["stock_nuevo"], d["producto_id"]))

        # Registrar en Kardex oficial
        registrar_movimiento_inventario(
            cursor=cursor,
            producto_id=d["producto_id"],
            fecha=fecha_emision,
            tipo_movimiento="devolucion_proveedor",
            sentido="SALIDA",
            cantidad=d["cantidad"],
            costo_unitario=d["costo_unitario"],
            costo_total=d["subtotal"],
            stock_anterior=d["stock_anterior"],
            stock_nuevo=d["stock_nuevo"],
            documento_tipo="DEVOLUCION_COMPRA",
            documento_id=dev_comp_id,
            documento_numero=numero_devolucion,
            motivo=f"Devolución de Compra #{numero_devolucion}: {motivo}",
            usuario_id=usuario_id,
            documento_linea_id=dcd_id
        )

    return {
        "success": True,
        "devolucion_id": dev_comp_id,
        "numero_devolucion": numero_devolucion,
        "total_usd": total_usd,
        "total_ves": total_ves,
        "monto_descontado_cxp": monto_descontado_cxp,
        "monto_saldo_favor": monto_saldo_favor,
        "items_afectados": detalles_procesados,
        "fecha": fecha_emision
    }


def anular_devolucion_compra(cursor, devolucion_compra_id, motivo="Anulación de devolución", usuario_id=1):
    """
    Anula atómicamente una devolución de compra:
    1. Verifica existencia y estado activo.
    2. Reintegra las existencias físicas al inventario (stock_nuevo = stock_anterior + cantidad).
    3. Registra en inventario_movimientos: tipo_movimiento='compra', sentido='ENTRADA'.
    4. Restablece la deuda en Cuentas por Pagar (CxP).
    5. Marca la devolución de compra como 'anulada'.
    """
    cursor.execute("SELECT * FROM devoluciones_compras WHERE id = ?", (devolucion_compra_id,))
    dev_row = cursor.fetchone()
    if not dev_row:
        raise ValueError(f"Devolución de compra ID {devolucion_compra_id} no encontrada.")
    dev = dict(dev_row)
    if dev.get("estado") == "anulada":
        raise ValueError(f"La devolución #{dev.get('numero_devolucion')} ya se encuentra anulada.")

    fecha_hoy = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # 1. Obtener detalles
    cursor.execute("SELECT * FROM devolucion_compra_detalles WHERE devolucion_compra_id = ?", (devolucion_compra_id,))
    detalles = [dict(r) for r in cursor.fetchall()]

    # 2. Reingresar existencias al almacén (+)
    for d in detalles:
        p_id = d["producto_id"]
        cant = float(d["cantidad"])
        cursor.execute("SELECT stock FROM productos WHERE id = ?", (p_id,))
        p_cur = cursor.fetchone()
        stk_ant = float(p_cur[0] or 0.0) if p_cur else 0.0
        stk_nuevo = round(stk_ant + cant, 4)

        cursor.execute("UPDATE productos SET stock = ? WHERE id = ?", (stk_nuevo, p_id))

        registrar_movimiento_inventario(
            cursor=cursor,
            producto_id=p_id,
            fecha=fecha_hoy,
            tipo_movimiento="compra",
            sentido="ENTRADA",
            cantidad=cant,
            costo_unitario=d["costo_unitario"],
            costo_total=d["subtotal"],
            stock_anterior=stk_ant,
            stock_nuevo=stk_nuevo,
            documento_tipo="DEVOLUCION_COMPRA",
            documento_id=devolucion_compra_id,
            documento_numero=dev.get("numero_devolucion"),
            motivo=f"Reversión / Anulación de Devolución de Compra #{dev.get('numero_devolucion')}: {motivo}",
            usuario_id=usuario_id,
            documento_linea_id=d["id"]
        )

    # 3. Restablecer CxP si se había descontado
    m_desc = float(dev.get("monto_descontado_cxp") or 0.0)
    c_id = dev.get("compra_id")
    if m_desc > 0 and c_id:
        cursor.execute("SELECT * FROM cuentas_por_pagar WHERE compra_id = ? AND estado != 'anulada'", (c_id,))
        cxp_row = cursor.fetchone()
        if cxp_row:
            cxp = dict(cxp_row)
            n_saldo = round(float(cxp.get("saldo_pendiente") or 0.0) + m_desc, 2)
            n_tot = round(float(cxp.get("monto_total") or 0.0) + m_desc, 2)
            n_est = "parcial" if float(cxp.get("monto_pagado") or 0.0) > 0 else "pendiente"
            cursor.execute("""
                UPDATE cuentas_por_pagar
                SET saldo_pendiente = ?, monto_total = ?, estado = ?
                WHERE id = ?
            """, (n_saldo, n_tot, n_est, cxp["id"]))

            cursor.execute("UPDATE compras SET saldo_pendiente = ? WHERE id = ?", (n_saldo, c_id))

    # 4. Marcar como anulada
    cursor.execute("""
        UPDATE devoluciones_compras
        SET estado = 'anulada', motivo_anulacion = ?, fecha_anulacion = ?
        WHERE id = ?
    """, (motivo, fecha_hoy, devolucion_compra_id))

    return {
        "success": True,
        "devolucion_id": devolucion_compra_id,
        "numero_devolucion": dev.get("numero_devolucion"),
        "estado": "anulada",
        "fecha_anulacion": fecha_hoy
    }


def anular_abono_cxc(cursor, abono_id, motivo="Anulación de cobro", usuario_id=1, cxc_id_explicit=None):
    """
    Anula atómicamente un pago/abono de cliente en CxC (incluyendo anticipos iniciales si abono_id == 0):
    1. Reincrementa saldo_pendiente de la cuenta por cobrar (+).
    2. Reduce monto_pagado (-).
    3. Recalcula estado de la cuenta por cobrar ('pendiente' o 'parcial').
    4. Reincrementa saldo_pendiente en la factura vinculada.
    5. Marca abonos_cxc: estado = 'anulado'.
    """
    fecha_hoy = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    if int(abono_id) == 0:
        if not cxc_id_explicit:
            raise ValueError("Se requiere el ID de la cuenta por cobrar (cxc_id) para anular un anticipo inicial.")
        cxc_id = int(cxc_id_explicit)
        cursor.execute("SELECT * FROM cuentas_por_cobrar WHERE id = ?", (cxc_id,))
        cxc_row = cursor.fetchone()
        if not cxc_row:
            raise ValueError(f"Cuenta por cobrar ID {cxc_id} no encontrada")
        cxc = dict(cxc_row)
        fac_id = cxc.get("factura_id")
        cursor.execute("SELECT * FROM factura_pagos WHERE factura_id = ?", (fac_id,))
        f_pagos = [dict(p) for p in cursor.fetchall()]
        if not f_pagos:
            raise ValueError("No se encontró anticipo inicial activo para anular en esta factura.")
        monto_abono = round(sum(float(p.get("equivalente_usd") or 0.0) for p in f_pagos), 2)
        if monto_abono <= 0:
            raise ValueError("El monto del anticipo inicial es 0.00")

        cursor.execute("""
            INSERT INTO abonos_cxc (cxc_id, monto_usd, fecha, notas, estado, motivo_anulacion, fecha_anulacion)
            VALUES (?, ?, ?, 'Anticipo / Pago inicial al momento de facturar (Anulado)', 'anulado', ?, ?)
        """, (cxc_id, monto_abono, cxc.get("fecha_emision") or fecha_hoy, motivo, fecha_hoy))
        abono_id = cursor.lastrowid
        for fp in f_pagos:
            cursor.execute("""
                INSERT INTO abono_cxc_pagos (abono_id, moneda, metodo, monto_moneda, tasa_cambio, equivalente_usd, referencia)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (abono_id, fp["moneda"], fp["metodo"], fp["monto_moneda"], fp["tasa_cambio"], fp["equivalente_usd"], fp.get("referencia", "")))
        cursor.execute("DELETE FROM factura_pagos WHERE factura_id = ?", (fac_id,))
    else:
        cursor.execute("SELECT * FROM abonos_cxc WHERE id = ?", (abono_id,))
        ab_row = cursor.fetchone()
        if not ab_row:
            raise ValueError(f"Abono CxC ID {abono_id} no encontrado")
        
        ab = dict(ab_row)
        if ab.get("estado") == "anulado":
            raise ValueError(f"El abono #{abono_id} ya se encuentra anulado.")

        cxc_id = ab.get("cxc_id")
        monto_abono = float(ab.get("monto_usd") or 0.0)

        cursor.execute("SELECT * FROM cuentas_por_cobrar WHERE id = ?", (cxc_id,))
        cxc_row = cursor.fetchone()
        if not cxc_row:
            raise ValueError(f"Cuenta por cobrar ID {cxc_id} asociada al abono no encontrada")
        cxc = dict(cxc_row)

        # Marcar abono como anulado
        cursor.execute("""
            UPDATE abonos_cxc 
            SET estado = 'anulado', motivo_anulacion = ?, fecha_anulacion = ? 
            WHERE id = ?
        """, (motivo, fecha_hoy, abono_id))

    tot_cxc = float(cxc.get("monto_total") or 0.0)
    nuevo_saldo = min(tot_cxc, round(float(cxc.get("saldo_pendiente") or 0.0) + monto_abono, 2))
    nuevo_pagado = round(max(0.0, float(cxc.get("monto_pagado") or 0.0) - monto_abono), 2)
    nuevo_estado = "pendiente" if nuevo_saldo >= tot_cxc - 0.001 else ("pagada" if nuevo_saldo <= 0.001 else "parcial")

    # Actualizar CxC
    cursor.execute("""
        UPDATE cuentas_por_cobrar 
        SET saldo_pendiente = ?, monto_pagado = ?, estado = ? 
        WHERE id = ?
    """, (nuevo_saldo, nuevo_pagado, nuevo_estado, cxc_id))

    # Actualizar factura vinculada si existe
    fac_id = cxc.get("factura_id")
    if fac_id:
        nuevo_estado_fac = "pagada" if nuevo_saldo <= 0.001 else "pendiente"
        cursor.execute("""
            UPDATE facturas 
            SET saldo_pendiente = ?, estado = ? 
            WHERE id = ? AND estado != 'anulada'
        """, (nuevo_saldo, nuevo_estado_fac, fac_id))

    return {
        "success": True,
        "abono_id": abono_id,
        "cxc_id": cxc_id,
        "monto_reintegrado_usd": monto_abono,
        "nuevo_monto_pagado": nuevo_pagado,
        "nuevo_saldo_pendiente": nuevo_saldo,
        "nuevo_estado_cxc": nuevo_estado,
        "fecha_anulacion": fecha_hoy
    }


def anular_abono_cxp(cursor, abono_id, motivo="Anulación de pago a proveedor", usuario_id=1, cxp_id_explicit=None):
    """
    Anula atómicamente un pago/abono a proveedor en CxP (incluyendo anticipos iniciales si abono_id == 0):
    1. Reincrementa saldo_pendiente de la cuenta por pagar (+).
    2. Reduce monto_pagado (-).
    3. Recalcula estado de la cuenta por pagar ('pendiente' o 'parcial').
    4. Reincrementa saldo_pendiente en la compra vinculada si aplica.
    5. Marca abonos_cxp: estado = 'anulado'.
    """
    fecha_hoy = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    if int(abono_id) == 0:
        if not cxp_id_explicit:
            raise ValueError("Se requiere el ID de la cuenta por pagar (cxp_id) para anular un anticipo inicial.")
        cxp_id = int(cxp_id_explicit)
        cursor.execute("SELECT * FROM cuentas_por_pagar WHERE id = ?", (cxp_id,))
        cxp_row = cursor.fetchone()
        if not cxp_row:
            raise ValueError(f"Cuenta por pagar ID {cxp_id} no encontrada")
        cxp = dict(cxp_row)
        comp_id = cxp.get("compra_id")
        cursor.execute("SELECT * FROM compra_pagos WHERE compra_id = ?", (comp_id,))
        c_pagos = [dict(p) for p in cursor.fetchall()]
        if not c_pagos:
            raise ValueError("No se encontró anticipo inicial activo para anular en esta compra.")
        monto_abono = round(sum(float(p.get("equivalente_usd") or 0.0) for p in c_pagos), 2)
        if monto_abono <= 0:
            raise ValueError("El monto del anticipo inicial es 0.00")

        cursor.execute("""
            INSERT INTO abonos_cxp (cxp_id, monto_usd, fecha, notas, estado, motivo_anulacion, fecha_anulacion)
            VALUES (?, ?, ?, 'Anticipo / Pago inicial en compra (Anulado)', 'anulado', ?, ?)
        """, (cxp_id, monto_abono, cxp.get("fecha_emision") or fecha_hoy, motivo, fecha_hoy))
        abono_id = cursor.lastrowid
        for cp in c_pagos:
            cursor.execute("""
                INSERT INTO abono_cxp_pagos (abono_id, moneda, metodo, monto_moneda, tasa_cambio, equivalente_usd, referencia)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (abono_id, cp["moneda"], cp["metodo"], cp["monto_moneda"], cp["tasa_cambio"], cp["equivalente_usd"], cp.get("referencia", "")))
        cursor.execute("DELETE FROM compra_pagos WHERE compra_id = ?", (comp_id,))
    else:
        cursor.execute("SELECT * FROM abonos_cxp WHERE id = ?", (abono_id,))
        ab_row = cursor.fetchone()
        if not ab_row:
            raise ValueError(f"Abono CxP ID {abono_id} no encontrado")
        
        ab = dict(ab_row)
        if ab.get("estado") == "anulado":
            raise ValueError(f"El pago CxP #{abono_id} ya se encuentra anulado.")

        cxp_id = ab.get("cxp_id")
        monto_abono = float(ab.get("monto_usd") or 0.0)

        cursor.execute("SELECT * FROM cuentas_por_pagar WHERE id = ?", (cxp_id,))
        cxp_row = cursor.fetchone()
        if not cxp_row:
            raise ValueError(f"Cuenta por pagar ID {cxp_id} asociada al abono no encontrada")
        cxp = dict(cxp_row)

        # Marcar abono como anulado
        cursor.execute("""
            UPDATE abonos_cxp 
            SET estado = 'anulado', motivo_anulacion = ?, fecha_anulacion = ? 
            WHERE id = ?
        """, (motivo, fecha_hoy, abono_id))

    tot_cxp = float(cxp.get("monto_total") or 0.0)
    nuevo_saldo = min(tot_cxp, round(float(cxp.get("saldo_pendiente") or 0.0) + monto_abono, 2))
    nuevo_pagado = round(max(0.0, float(cxp.get("monto_pagado") or 0.0) - monto_abono), 2)
    nuevo_estado = "pendiente" if nuevo_saldo >= tot_cxp - 0.001 else ("pagada" if nuevo_saldo <= 0.001 else "parcial")

    # Actualizar CxP
    cursor.execute("""
        UPDATE cuentas_por_pagar 
        SET saldo_pendiente = ?, monto_pagado = ?, estado = ? 
        WHERE id = ?
    """, (nuevo_saldo, nuevo_pagado, nuevo_estado, cxp_id))

    # Actualizar compra vinculada si existe
    comp_id = cxp.get("compra_id")
    if comp_id:
        cursor.execute("""
            UPDATE compras 
            SET saldo_pendiente = ? 
            WHERE id = ? AND estado != 'anulada'
        """, (nuevo_saldo, comp_id))

    return {
        "success": True,
        "abono_id": abono_id,
        "cxp_id": cxp_id,
        "monto_reintegrado_usd": monto_abono,
        "nuevo_monto_pagado": nuevo_pagado,
        "nuevo_saldo_pendiente": nuevo_saldo,
        "nuevo_estado_cxp": nuevo_estado,
        "fecha_anulacion": fecha_hoy
    }


def anular_cuenta_cxp_directa(cursor, cxp_id, motivo="Anulación de cuenta por pagar", usuario_id=1):
    """
    Anula una cuenta por pagar directa (gasto administrativo, factura de servicio sin inventario):
    1. Valida que exista y no esté previamente anulada.
    2. Si está vinculada a una compra de inventario, rechaza para que se anule desde Compras.
    3. Anula los abonos que tuviera registrados.
    4. Establece estado = 'anulada', saldo_pendiente = 0.0.
    """
    cursor.execute("SELECT * FROM cuentas_por_pagar WHERE id = ?", (cxp_id,))
    cxp_row = cursor.fetchone()
    if not cxp_row:
        raise ValueError(f"Cuenta por pagar ID {cxp_id} no encontrada")
    
    cxp = dict(cxp_row)
    if cxp.get("estado") == "anulada":
        raise ValueError(f"La cuenta por pagar #{cxp_id} ya se encuentra anulada.")

    if cxp.get("compra_id"):
        raise ValueError("Esta cuenta proviene de una compra de inventario. Debe anular la compra desde el módulo de Compras para devolver el stock correspondiente.")

    fecha_hoy = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Anular abonos
    cursor.execute("""
        UPDATE abonos_cxp 
        SET estado = 'anulado', motivo_anulacion = ?, fecha_anulacion = ? 
        WHERE cxp_id = ? AND (estado IS NULL OR estado != 'anulado')
    """, (f"Anulación de cuenta raíz CxP #{cxp_id}", fecha_hoy, cxp_id))

    # Anular cuenta
    cursor.execute("""
        UPDATE cuentas_por_pagar 
        SET estado = 'anulada', saldo_pendiente = 0.0, motivo_anulacion = ?, fecha_anulacion = ? 
        WHERE id = ?
    """, (motivo, fecha_hoy, cxp_id))

    return {
        "success": True,
        "cxp_id": cxp_id,
        "estado": "anulada",
        "fecha_anulacion": fecha_hoy
    }


def _normalizar_fecha_sort(fecha_str):
    """Normaliza una fecha 'YYYY-MM-DD' o 'YYYY-MM-DD HH:MM:SS' para ordenamiento cronológico estable."""
    if not fecha_str:
        return "0000-00-00 00:00:00"
    s = str(fecha_str).strip()
    if len(s) == 10:
        return s + " 00:00:00"
    return s[:19]


def obtener_estado_cuenta_cliente_cxc(cursor, cliente_id, tipo_filtro=None, q=None, fecha_desde=None, fecha_hasta=None, orden="asc"):
    """
    Construye el Estado de Cuenta Cronológico Desglosado (Libro Mayor Auxiliar) de un Cliente en CXC.
    Incluye todos los movimientos reales sin alterar registros:
      - Facturas a crédito ('factura')
      - Pagos aplicados ('pago') y Abonos parciales ('abono') con su desglose multimoneda (USD, VES, COP)
      - Notas de Crédito comerciales y por devolución ('nota_credito')
      - Notas de Débito comerciales ('nota_debito')
    Calcula paso a paso el saldo anterior y el saldo acumulado determinístico y permite filtrar por tipo, texto y fechas.
    """
    cliente_id = int(cliente_id)
    cursor.execute("SELECT * FROM clientes WHERE id = ?", (cliente_id,))
    cli_row = cursor.fetchone()
    cliente_info = dict(cli_row) if cli_row else {"id": cliente_id, "nombre": f"Cliente #{cliente_id}", "cedula": "-", "telefono": ""}

    cursor.execute("SELECT tasa_ves, tasa_cop FROM configuracion WHERE id = 1")
    cfg_row = cursor.fetchone()
    tasa_ves = float(cfg_row["tasa_ves"]) if cfg_row and cfg_row["tasa_ves"] else 45.0
    tasa_cop = float(cfg_row["tasa_cop"]) if cfg_row and cfg_row["tasa_cop"] else 4000.0

    # 1. Cuentas por cobrar y facturas del cliente
    cursor.execute("""
        SELECT cxc.*, f.numero_factura, f.fecha as factura_fecha, f.subtotal, f.iva_total,
               f.total_usd as factura_total_usd, f.estado as factura_estado,
               f.motivo_anulacion as factura_motivo_anulacion, f.fecha_anulacion as factura_fecha_anulacion,
               (SELECT COUNT(*) FROM abonos_cxc ab WHERE ab.cxc_id = cxc.id) as total_abonos_count,
               (SELECT COUNT(*) FROM abonos_cxc ab WHERE ab.cxc_id = cxc.id AND (ab.estado IS NULL OR ab.estado = 'activo')) as abonos_activos_count
        FROM cuentas_por_cobrar cxc
        JOIN facturas f ON cxc.factura_id = f.id
        WHERE cxc.cliente_id = ?
        ORDER BY cxc.id ASC
    """, (cliente_id,))
    cuentas = [dict(r) for r in cursor.fetchall()]
    cxc_map = {c["id"]: c for c in cuentas}
    fac_to_cxc = {c["factura_id"]: c for c in cuentas if c.get("factura_id")}

    # 2. Notas de ajuste comercial (Crédito y Débito) del cliente en CXC
    cursor.execute("""
        SELECT * FROM notas_ajuste_comercial
        WHERE modulo = 'cxc' AND tercero_id = ?
        ORDER BY id ASC
    """, (cliente_id,))
    notas_ajuste = [dict(r) for r in cursor.fetchall()]

    nd_incrementa_por_cuenta = {}
    nc_disminuye_por_cuenta = {}
    for n in notas_ajuste:
        cid = n.get("cuenta_id")
        m_usd = round(float(n.get("monto_usd") or 0.0), 2)
        if cid:
            if n.get("efecto") == "incrementa":
                nd_incrementa_por_cuenta[cid] = round(nd_incrementa_por_cuenta.get(cid, 0.0) + m_usd, 2)
            else:
                nc_disminuye_por_cuenta[cid] = round(nc_disminuye_por_cuenta.get(cid, 0.0) + m_usd, 2)

    # 3. Devoluciones asociadas a facturas a crédito de este cliente
    cursor.execute("""
        SELECT * FROM devoluciones
        WHERE cliente_id = ?
        ORDER BY id ASC
    """, (cliente_id,))
    todas_devs = [dict(r) for r in cursor.fetchall()]
    devoluciones_credito = [
        d for d in todas_devs
        if (d.get("factura_id") in fac_to_cxc) or (str(d.get("tipo_venta_original") or "").lower() == "credito")
    ]
    dev_por_cuenta = {}
    for d in devoluciones_credito:
        if str(d.get("estado") or "activa").lower() != "anulada":
            c_asoc = fac_to_cxc.get(d.get("factura_id"))
            if c_asoc:
                cid_d = c_asoc["id"]
                dev_por_cuenta[cid_d] = round(dev_por_cuenta.get(cid_d, 0.0) + float(d.get("total_usd") or 0.0), 2)

    movimientos = []

    # 4. Construir movimientos por cada cuenta (Factura + sus Pagos/Abonos)
    for c in cuentas:
        cid = c["id"]
        fid = c.get("factura_id")
        num_fac = c.get("numero_factura") or f"FAC-{fid or cid}"
        es_anulada_cxc = (c.get("estado") == "anulada") or (c.get("factura_estado") == "anulada")
        fecha_fac = c.get("factura_fecha") or c.get("fecha_emision") or c.get("created_at") or ""

        # Monto original de emisión de la factura antes de Notas de Débito que incrementaron monto_total
        inc_nd = nd_incrementa_por_cuenta.get(cid, 0.0)
        monto_emision = max(0.0, round(float(c.get("monto_total") or 0.0) - inc_nd, 2))

        motivo_anu_fac = c.get("motivo_anulacion") or c.get("factura_motivo_anulacion") or ""
        fecha_anu_fac = c.get("fecha_anulacion") or c.get("factura_fecha_anulacion") or ""

        movimientos.append({
            "uid": f"FAC-{cid}",
            "id_origen": cid,
            "cxc_id": cid,
            "factura_id": fid,
            "abono_id": None,
            "nota_id": None,
            "devolucion_id": None,
            "fecha": fecha_fac,
            "fecha_vencimiento": c.get("fecha_vencimiento") or "",
            "orden_interno": 1,
            "tipo_movimiento": "factura",
            "categoria_movimiento": "factura",
            "etiqueta_tipo": "Factura a Crédito",
            "documento_numero": num_fac,
            "documento_afectado": num_fac,
            "concepto": f"Emisión de Factura a Crédito {num_fac} (Vence: {c.get('fecha_vencimiento') or 'N/A'})" + (f" — [ANULADA: {motivo_anu_fac}]" if es_anulada_cxc and motivo_anu_fac else ""),
            "resumen_pagos": "",
            "pagos_detalle": [],
            "cargo_usd": monto_emision,
            "abono_usd": 0.0,
            "monto_usd": monto_emision,
            "estado": "anulada" if es_anulada_cxc else (c.get("estado") or "pendiente"),
            "es_anulado": es_anulada_cxc,
            "motivo_anulacion": motivo_anu_fac,
            "fecha_anulacion": fecha_anu_fac,
            "puede_anular_pago": False,
            "puede_anular_documento": not es_anulada_cxc,
            "puede_pagar": (not es_anulada_cxc) and float(c.get("saldo_pendiente") or 0.0) > 0.001
        })

        # Obtener abonos registrados en abonos_cxc para esta cuenta
        cursor.execute("SELECT * FROM abonos_cxc WHERE cxc_id = ? ORDER BY id ASC", (cid,))
        abonos_rows = [dict(r) for r in cursor.fetchall()]
        abonos_cuenta = []
        suma_abonos_activos = 0.0

        for ab in abonos_rows:
            cursor.execute("SELECT * FROM abono_cxc_pagos WHERE abono_id = ? ORDER BY id ASC", (ab["id"],))
            ab["pagos"] = [dict(p) for p in cursor.fetchall()]
            abonos_cuenta.append(ab)
            if ab.get("estado") != "anulado":
                suma_abonos_activos = round(suma_abonos_activos + float(ab.get("monto_usd") or 0.0), 2)

        # Verificar si existe un anticipo/pago inicial en factura_pagos que no esté aún en abonos_cxc
        ya_tiene_inicial = any("inicial" in (a.get("notas") or "").lower() for a in abonos_cuenta)
        if fid and float(c.get("monto_pagado") or 0.0) > 0 and not ya_tiene_inicial:
            cursor.execute("SELECT * FROM factura_pagos WHERE factura_id = ? ORDER BY id ASC", (fid,))
            f_pagos = [dict(p) for p in cursor.fetchall()]
            if f_pagos:
                monto_ini = round(sum(float(p.get("equivalente_usd") or 0.0) for p in f_pagos), 2)
                if monto_ini > 0:
                    abonos_cuenta.insert(0, {
                        "id": 0,
                        "cxc_id": cid,
                        "monto_usd": monto_ini,
                        "fecha": fecha_fac,
                        "notas": "Anticipo / Pago inicial al momento de facturar",
                        "estado": "anulado" if es_anulada_cxc else "activo",
                        "pagos": f_pagos,
                        "es_inicial": True
                    })
                    if not es_anulada_cxc:
                        suma_abonos_activos = round(suma_abonos_activos + monto_ini, 2)

        # Si aún hay diferencia en monto_pagado no cubierta por abonos_cxc ni notas (ej. carga inicial directa), reflejarla sin inventar datos
        pagado_explicado = round(suma_abonos_activos + nc_disminuye_por_cuenta.get(cid, 0.0) + dev_por_cuenta.get(cid, 0.0), 2)
        diff_pagado = round(float(c.get("monto_pagado") or 0.0) - pagado_explicado, 2)
        if diff_pagado > 0.009 and not es_anulada_cxc and not any(a.get("id") == 0 for a in abonos_cuenta):
            abonos_cuenta.insert(0, {
                "id": 0,
                "cxc_id": cid,
                "monto_usd": diff_pagado,
                "fecha": fecha_fac,
                "notas": "Anticipo / Abono inicial registrado en cuenta",
                "estado": "activo",
                "pagos": [{"moneda": "USD", "metodo": "Pago Inicial", "monto_moneda": diff_pagado, "tasa_cambio": 1.0, "equivalente_usd": diff_pagado, "referencia": ""}],
                "es_inicial": True
            })

        # Convertir cada abono/pago en movimiento cronológico
        saldo_temp_fac = monto_emision
        for idx_ab, ab in enumerate(abonos_cuenta):
            m_ab = round(float(ab.get("monto_usd") or 0.0), 2)
            es_anu_ab = (ab.get("estado") == "anulado") or es_anulada_cxc
            pagos_det = ab.get("pagos") or []
            partes_pago = []
            for p in pagos_det:
                mon = p.get("moneda") or "USD"
                met = p.get("metodo") or "Pago"
                mm = float(p.get("monto_moneda") or 0.0)
                ref = (p.get("referencia") or "").strip()
                ref_txt = f" [Ref: {ref}]" if ref else ""
                if mon == "USD":
                    partes_pago.append(f"{met}: ${mm:,.2f} USD{ref_txt}")
                else:
                    eq_u = float(p.get("equivalente_usd") or 0.0)
                    partes_pago.append(f"{met}: {mm:,.2f} {mon} (≈ ${eq_u:,.2f}){ref_txt}")
            resumen_pagos_str = " | ".join(partes_pago) if partes_pago else "Pago en USD"

            # Determinar si el cobro liquidó el saldo de la factura ('pago') o fue un abono parcial ('abono')
            liquida_total = (m_ab >= saldo_temp_fac - 0.01) and (saldo_temp_fac > 0)
            if not es_anu_ab:
                saldo_temp_fac = max(0.0, round(saldo_temp_fac - m_ab, 2))

            if ab.get("id") == 0:
                doc_num_ab = f"INI-{num_fac}"
                tipo_mov = "abono" if not liquida_total else "pago"
                etiqueta = "Anticipo / Pago Inicial"
                orden_int = 2
            else:
                doc_num_ab = f"PAG-{ab['id']:04d}" if liquida_total else f"ABO-{ab['id']:04d}"
                tipo_mov = "pago" if liquida_total else "abono"
                etiqueta = "Pago Aplicado (Total)" if liquida_total else "Abono Parcial"
                orden_int = 4

            notas_ab = (ab.get("notas") or "Cobro aplicado").strip()
            motivo_anu_ab = (ab.get("motivo_anulacion") or "").strip()
            concepto_ab = f"{notas_ab} ({resumen_pagos_str})" if resumen_pagos_str else notas_ab
            if es_anu_ab and motivo_anu_ab:
                concepto_ab += f" — [ANULADO: {motivo_anu_ab}]"

            movimientos.append({
                "uid": f"ABO-{cid}-{ab['id']}-{idx_ab}",
                "id_origen": int(ab["id"]) if ab.get("id") else idx_ab,
                "cxc_id": cid,
                "factura_id": fid,
                "abono_id": int(ab["id"]),
                "nota_id": None,
                "devolucion_id": None,
                "fecha": ab.get("fecha") or fecha_fac,
                "fecha_vencimiento": "",
                "orden_interno": orden_int,
                "tipo_movimiento": tipo_mov,
                "categoria_movimiento": "pago_abono",
                "etiqueta_tipo": etiqueta,
                "documento_numero": doc_num_ab,
                "documento_afectado": num_fac,
                "concepto": concepto_ab,
                "resumen_pagos": resumen_pagos_str,
                "pagos_detalle": pagos_det,
                "cargo_usd": 0.0,
                "abono_usd": m_ab,
                "monto_usd": m_ab,
                "estado": "anulado" if es_anu_ab else "activo",
                "es_anulado": es_anu_ab,
                "motivo_anulacion": motivo_anu_ab,
                "fecha_anulacion": ab.get("fecha_anulacion") or "",
                "puede_anular_pago": (not es_anu_ab) and (not es_anulada_cxc),
                "puede_anular_documento": False,
                "puede_pagar": False
            })

    # 5. Agregar Notas de Crédito y Notas de Débito de notas_ajuste_comercial
    for n in notas_ajuste:
        nid = n["id"]
        cid = n.get("cuenta_id")
        c_asoc = cxc_map.get(cid)
        num_fac_afectada = c_asoc.get("numero_factura") if c_asoc else (f"Cuenta #{cid}" if cid else "General")
        es_credito = (str(n.get("tipo_nota") or "").lower() == "credito")
        efecto = str(n.get("efecto") or ("disminuye" if es_credito else "incrementa")).lower()
        m_usd = round(float(n.get("monto_usd") or 0.0), 2)
        es_anu_cuenta = bool(c_asoc and c_asoc.get("estado") == "anulada")

        movimientos.append({
            "uid": f"NOTA-{nid}",
            "id_origen": nid,
            "cxc_id": cid,
            "factura_id": c_asoc.get("factura_id") if c_asoc else None,
            "abono_id": None,
            "nota_id": nid,
            "devolucion_id": None,
            "fecha": n.get("fecha") or n.get("created_at") or "",
            "fecha_vencimiento": "",
            "orden_interno": 3,
            "tipo_movimiento": "nota_credito" if es_credito else "nota_debito",
            "categoria_movimiento": "nota_credito" if es_credito else "nota_debito",
            "etiqueta_tipo": "Nota de Crédito" if es_credito else "Nota de Débito",
            "documento_numero": n.get("numero_nota") or f"{'NC' if es_credito else 'ND'}-{nid:06d}",
            "documento_afectado": num_fac_afectada,
            "concepto": f"{n.get('motivo') or 'Ajuste comercial'}" + (f" (Control: {n.get('numero_control')})" if n.get("numero_control") else ""),
            "resumen_pagos": "",
            "pagos_detalle": [],
            "cargo_usd": m_usd if efecto == "incrementa" else 0.0,
            "abono_usd": m_usd if efecto == "disminuye" else 0.0,
            "monto_usd": m_usd,
            "estado": "anulado" if es_anu_cuenta else "activo",
            "es_anulado": es_anu_cuenta,
            "motivo_anulacion": "",
            "fecha_anulacion": "",
            "puede_anular_pago": False,
            "puede_anular_documento": False,
            "puede_pagar": False
        })

    # 6. Agregar Notas de Crédito por Devolución de Mercancía sobre Facturas a Crédito
    for d in devoluciones_credito:
        did = d["id"]
        fid = d.get("factura_id")
        c_asoc = fac_to_cxc.get(fid)
        cid = c_asoc["id"] if c_asoc else None
        num_fac_afectada = d.get("numero_factura") or (c_asoc.get("numero_factura") if c_asoc else f"FAC-{fid}")
        m_usd = round(float(d.get("total_usd") or 0.0), 2)
        es_anu_dev = (str(d.get("estado") or "activa").lower() == "anulada")

        movimientos.append({
            "uid": f"DEV-{did}",
            "id_origen": did,
            "cxc_id": cid,
            "factura_id": fid,
            "abono_id": None,
            "nota_id": None,
            "devolucion_id": did,
            "fecha": d.get("fecha_emision") or d.get("created_at") or "",
            "fecha_vencimiento": "",
            "orden_interno": 3,
            "tipo_movimiento": "nota_credito",
            "categoria_movimiento": "nota_credito",
            "etiqueta_tipo": "Nota de Crédito (Devolución)",
            "documento_numero": d.get("numero_devolucion") or f"DEV-{did:06d}",
            "documento_afectado": num_fac_afectada,
            "concepto": f"Devolución de mercancía ({d.get('tipo_devolucion') or 'parcial'}): {d.get('motivo') or ''}",
            "resumen_pagos": "",
            "pagos_detalle": [],
            "cargo_usd": 0.0,
            "abono_usd": m_usd,
            "monto_usd": m_usd,
            "estado": "anulada" if es_anu_dev else "activa",
            "es_anulado": es_anu_dev,
            "motivo_anulacion": d.get("motivo_anulacion") or "",
            "fecha_anulacion": d.get("fecha_anulacion") or "",
            "puede_anular_pago": False,
            "puede_anular_documento": False,
            "puede_pagar": False
        })

    # 7. Ordenar cronológicamente (ASC) y calcular saldo acumulado paso a paso
    movimientos.sort(key=lambda m: (_normalizar_fecha_sort(m["fecha"]), m["orden_interno"], m["id_origen"]))

    saldo_acum = 0.0
    saldos_por_cuenta = {}
    total_facturas_usd = 0.0
    total_nd_usd = 0.0
    total_pagos_abonos_usd = 0.0
    total_pagos_usd = 0.0
    total_abonos_usd = 0.0
    total_nc_usd = 0.0

    conteos = {
        "todos": len(movimientos),
        "factura": 0,
        "pago_abono": 0,
        "pago": 0,
        "abono": 0,
        "nota_credito": 0,
        "nota_debito": 0,
        "anulado": 0
    }

    for idx, m in enumerate(movimientos):
        m["nro_operacion"] = idx + 1
        m["saldo_anterior_usd"] = round(saldo_acum, 2)
        cid_m = m.get("cxc_id")
        saldo_cta_prev = saldos_por_cuenta.get(cid_m, 0.0) if cid_m else saldo_acum

        if not m["es_anulado"]:
            nuevo_saldo_cta = round(max(0.0, saldo_cta_prev + float(m["cargo_usd"]) - float(m["abono_usd"])), 2)
            if cid_m:
                saldos_por_cuenta[cid_m] = nuevo_saldo_cta
            saldo_acum = round(max(0.0, saldo_acum + float(m["cargo_usd"]) - float(m["abono_usd"])), 2)

            if m["categoria_movimiento"] == "pago_abono":
                liquida_cta = (nuevo_saldo_cta <= 0.01) and (saldo_cta_prev > 0.01)
                m["tipo_movimiento"] = "pago" if liquida_cta else "abono"
                if m.get("abono_id") and int(m["abono_id"]) > 0:
                    m["etiqueta_tipo"] = "Pago Aplicado (Total)" if liquida_cta else "Abono Parcial"
                    m["documento_numero"] = f"PAG-{int(m['abono_id']):04d}" if liquida_cta else f"ABO-{int(m['abono_id']):04d}"

        t_mov = m["tipo_movimiento"]
        if t_mov in conteos:
            conteos[t_mov] += 1
        if m["categoria_movimiento"] == "pago_abono":
            conteos["pago_abono"] += 1
        if m["es_anulado"]:
            conteos["anulado"] += 1

        if not m["es_anulado"]:
            if t_mov == "factura":
                total_facturas_usd = round(total_facturas_usd + float(m["cargo_usd"]), 2)
            elif t_mov == "nota_debito":
                total_nd_usd = round(total_nd_usd + float(m["cargo_usd"]) - float(m["abono_usd"]), 2)
            elif t_mov == "pago":
                total_pagos_usd = round(total_pagos_usd + float(m["abono_usd"]), 2)
                total_pagos_abonos_usd = round(total_pagos_abonos_usd + float(m["abono_usd"]), 2)
            elif t_mov == "abono":
                total_abonos_usd = round(total_abonos_usd + float(m["abono_usd"]), 2)
                total_pagos_abonos_usd = round(total_pagos_abonos_usd + float(m["abono_usd"]), 2)
            elif t_mov == "nota_credito":
                total_nc_usd = round(total_nc_usd + float(m["abono_usd"]) - float(m["cargo_usd"]), 2)

        m["saldo_acumulado_usd"] = saldo_acum
        m["saldo_acumulado_ves"] = round(saldo_acum * tasa_ves, 2)
        m["saldo_acumulado_cop"] = round(saldo_acum * tasa_cop, 2)

    # 8. Aplicar filtros solicitados sin perder los saldos históricos reales de cada fila
    movs_filtrados = list(movimientos)
    tf = (tipo_filtro or "").strip().lower()
    if tf and tf != "todos":
        if tf == "factura":
            movs_filtrados = [m for m in movs_filtrados if m["tipo_movimiento"] == "factura"]
        elif tf == "pago_abono":
            movs_filtrados = [m for m in movs_filtrados if m["categoria_movimiento"] == "pago_abono"]
        elif tf == "pago":
            estrictos = [m for m in movs_filtrados if m["tipo_movimiento"] == "pago"]
            movs_filtrados = estrictos if estrictos else [m for m in movs_filtrados if m["categoria_movimiento"] == "pago_abono"]
        elif tf == "abono":
            estrictos = [m for m in movs_filtrados if m["tipo_movimiento"] == "abono"]
            movs_filtrados = estrictos if estrictos else [m for m in movs_filtrados if m["categoria_movimiento"] == "pago_abono"]
        elif tf == "nota_credito":
            movs_filtrados = [m for m in movs_filtrados if m["tipo_movimiento"] == "nota_credito"]
        elif tf == "nota_debito":
            movs_filtrados = [m for m in movs_filtrados if m["tipo_movimiento"] == "nota_debito"]
        elif tf in ("anulado", "anulados", "anulada"):
            movs_filtrados = [m for m in movs_filtrados if m["es_anulado"]]

    if fecha_desde and str(fecha_desde).strip():
        fd_str = str(fecha_desde).strip()[:10]
        movs_filtrados = [m for m in movs_filtrados if str(m["fecha"] or "")[:10] >= fd_str]

    if fecha_hasta and str(fecha_hasta).strip():
        fh_str = str(fecha_hasta).strip()[:10]
        movs_filtrados = [m for m in movs_filtrados if str(m["fecha"] or "")[:10] <= fh_str]

    if q and str(q).strip():
        q_low = str(q).strip().lower()
        movs_filtrados = [
            m for m in movs_filtrados
            if q_low in str(m.get("documento_numero") or "").lower()
            or q_low in str(m.get("documento_afectado") or "").lower()
            or q_low in str(m.get("concepto") or "").lower()
            or q_low in str(m.get("etiqueta_tipo") or "").lower()
            or q_low in str(m.get("resumen_pagos") or "").lower()
        ]

    if str(orden or "asc").strip().lower() == "desc":
        movs_filtrados.reverse()

    saldo_real_cuentas = round(sum(float(c.get("saldo_pendiente") or 0.0) for c in cuentas if c.get("estado") != "anulada"), 2)

    return {
        "cliente": cliente_info,
        "tasa_ves": tasa_ves,
        "tasa_cop": tasa_cop,
        "resumen": {
            "total_facturas_usd": total_facturas_usd,
            "total_notas_debito_usd": total_nd_usd,
            "total_pagos_abonos_usd": total_pagos_abonos_usd,
            "total_pagos_usd": total_pagos_usd,
            "total_abonos_usd": total_abonos_usd,
            "total_abonos_parciales_usd": total_abonos_usd,
            "total_notas_credito_usd": total_nc_usd,
            "saldo_pendiente_usd": saldo_real_cuentas,
            "saldo_pendiente_ves": round(saldo_real_cuentas * tasa_ves, 2),
            "saldo_pendiente_cop": round(saldo_real_cuentas * tasa_cop, 2),
            "saldo_acumulado_cronologico_usd": saldo_acum
        },
        "conteos": conteos,
        "movimientos": movs_filtrados,
        "total_movimientos": len(movs_filtrados),
        "total_movimientos_global": len(movimientos),
        "total_movimientos_filtrados": len(movs_filtrados),
        "facturas": cuentas
    }


def obtener_estado_cuenta_proveedor_cxp(cursor, proveedor_id, tipo_filtro=None, q=None, fecha_desde=None, fecha_hasta=None, orden="asc"):
    """
    Construye el Estado de Cuenta Cronológico Desglosado (Libro Mayor Auxiliar) de un Proveedor en CXP.
    Incluye todos los movimientos reales sin alterar registros:
      - Facturas de Compra a Crédito y Cargos/Gastos Directos ('factura')
      - Pagos aplicados ('pago') y Abonos parciales ('abono') con su desglose multimoneda (USD, VES, COP)
      - Notas de Crédito de proveedor ('nota_credito')
      - Notas de Débito de proveedor ('nota_debito')
    Calcula paso a paso el saldo anterior y el saldo acumulado determinístico y permite filtrar por tipo, texto y fechas.
    """
    proveedor_id = int(proveedor_id)
    cursor.execute("SELECT * FROM proveedores WHERE id = ?", (proveedor_id,))
    prov_row = cursor.fetchone()
    proveedor_info = dict(prov_row) if prov_row else {"id": proveedor_id, "nombre": f"Proveedor #{proveedor_id}", "cedula": "-", "telefono": ""}

    cursor.execute("SELECT tasa_ves, tasa_cop FROM configuracion WHERE id = 1")
    cfg_row = cursor.fetchone()
    tasa_ves = float(cfg_row["tasa_ves"]) if cfg_row and cfg_row["tasa_ves"] else 45.0
    tasa_cop = float(cfg_row["tasa_cop"]) if cfg_row and cfg_row["tasa_cop"] else 4000.0

    # 1. Cuentas por pagar del proveedor
    cursor.execute("""
        SELECT cxp.*,
               comp.numero_control as compra_numero_control,
               comp.fecha as compra_fecha,
               comp.estado as compra_estado,
               comp.motivo_anulacion as compra_motivo_anulacion,
               comp.fecha_anulacion as compra_fecha_anulacion,
               ROUND(cxp.saldo_pendiente * ?, 2) as saldo_ves,
               ROUND(cxp.saldo_pendiente * ?, 2) as saldo_cop,
               CAST((julianday('now') - julianday(cxp.fecha_vencimiento)) AS INTEGER) as dias_vencido,
               (SELECT COUNT(*) FROM abonos_cxp ab WHERE ab.cxp_id = cxp.id) as total_abonos_count,
               (SELECT COUNT(*) FROM abonos_cxp ab WHERE ab.cxp_id = cxp.id AND (ab.estado IS NULL OR ab.estado = 'activo')) as abonos_activos_count
        FROM cuentas_por_pagar cxp
        LEFT JOIN compras comp ON cxp.compra_id = comp.id
        WHERE cxp.proveedor_id = ?
        ORDER BY cxp.id ASC
    """, (tasa_ves, tasa_cop, proveedor_id))
    cuentas = [dict(r) for r in cursor.fetchall()]
    cxp_map = {c["id"]: c for c in cuentas}

    # 2. Notas de ajuste comercial (Crédito y Débito) del proveedor en CXP
    cursor.execute("""
        SELECT * FROM notas_ajuste_comercial
        WHERE modulo = 'cxp' AND tercero_id = ?
        ORDER BY id ASC
    """, (proveedor_id,))
    notas_ajuste = [dict(r) for r in cursor.fetchall()]

    nd_incrementa_por_cuenta = {}
    nc_disminuye_por_cuenta = {}
    for n in notas_ajuste:
        cid = n.get("cuenta_id")
        m_usd = round(float(n.get("monto_usd") or 0.0), 2)
        if cid:
            if n.get("efecto") == "incrementa":
                nd_incrementa_por_cuenta[cid] = round(nd_incrementa_por_cuenta.get(cid, 0.0) + m_usd, 2)
            else:
                nc_disminuye_por_cuenta[cid] = round(nc_disminuye_por_cuenta.get(cid, 0.0) + m_usd, 2)

    movimientos = []

    # 3. Construir movimientos por cada cuenta (Factura/Compra/Gasto + sus Pagos/Abonos)
    for c in cuentas:
        cid = c["id"]
        comp_id = c.get("compra_id")
        num_doc = c.get("numero_factura") or c.get("compra_numero_control") or f"CXP-{cid:04d}"
        es_anulada_cxp = (c.get("estado") == "anulada") or (c.get("compra_estado") == "anulada")
        fecha_doc = c.get("compra_fecha") or c.get("fecha_emision") or c.get("created_at") or ""

        inc_nd = nd_incrementa_por_cuenta.get(cid, 0.0)
        monto_emision = max(0.0, round(float(c.get("monto_total") or 0.0) - inc_nd, 2))

        es_directo = (str(c.get("tipo_registro") or "compra").lower() == "directo") or (not comp_id)
        etiqueta_doc = "Factura / Gasto Directo" if es_directo else "Factura de Compra"
        concepto_base = c.get("descripcion_concepto") or ("Gasto directo de proveedor" if es_directo else f"Compra de mercancía #{num_doc}")
        motivo_anu_doc = c.get("motivo_anulacion") or c.get("compra_motivo_anulacion") or ""
        fecha_anu_doc = c.get("fecha_anulacion") or c.get("compra_fecha_anulacion") or ""

        movimientos.append({
            "uid": f"CXP-DOC-{cid}",
            "id_origen": cid,
            "cxp_id": cid,
            "compra_id": comp_id,
            "abono_id": None,
            "nota_id": None,
            "fecha": fecha_doc,
            "fecha_vencimiento": c.get("fecha_vencimiento") or "",
            "orden_interno": 1,
            "tipo_movimiento": "factura",
            "subtipo_documento": "directo" if es_directo else "compra",
            "categoria_movimiento": "factura",
            "etiqueta_tipo": etiqueta_doc,
            "documento_numero": num_doc,
            "documento_afectado": num_doc,
            "concepto": f"{concepto_base} (Vence: {c.get('fecha_vencimiento') or 'N/A'})" + (f" — [ANULADA: {motivo_anu_doc}]" if es_anulada_cxp and motivo_anu_doc else ""),
            "resumen_pagos": "",
            "pagos_detalle": [],
            "cargo_usd": monto_emision,
            "abono_usd": 0.0,
            "monto_usd": monto_emision,
            "estado": "anulada" if es_anulada_cxp else (c.get("estado") or "pendiente"),
            "es_anulado": es_anulada_cxp,
            "motivo_anulacion": motivo_anu_doc,
            "fecha_anulacion": fecha_anu_doc,
            "puede_anular_pago": False,
            "puede_anular_documento": not es_anulada_cxp,
            "puede_pagar": (not es_anulada_cxp) and float(c.get("saldo_pendiente") or 0.0) > 0.001
        })

        # Obtener abonos registrados en abonos_cxp para esta cuenta
        cursor.execute("SELECT * FROM abonos_cxp WHERE cxp_id = ? ORDER BY id ASC", (cid,))
        abonos_rows = [dict(r) for r in cursor.fetchall()]
        abonos_cuenta = []
        suma_abonos_activos = 0.0

        for ab in abonos_rows:
            cursor.execute("SELECT * FROM abono_cxp_pagos WHERE abono_id = ? ORDER BY id ASC", (ab["id"],))
            ab["pagos"] = [dict(p) for p in cursor.fetchall()]
            abonos_cuenta.append(ab)
            if ab.get("estado") != "anulado":
                suma_abonos_activos = round(suma_abonos_activos + float(ab.get("monto_usd") or 0.0), 2)

        # Verificar si hubo anticipo inicial en compra_pagos que no esté aún en abonos_cxp
        ya_tiene_inicial = any("inicial" in (a.get("notas") or "").lower() for a in abonos_cuenta)
        if comp_id and float(c.get("monto_pagado") or 0.0) > 0 and not ya_tiene_inicial:
            cursor.execute("SELECT * FROM compra_pagos WHERE compra_id = ? ORDER BY id ASC", (comp_id,))
            c_pagos = [dict(p) for p in cursor.fetchall()]
            if c_pagos:
                monto_ini = round(sum(float(p.get("equivalente_usd") or 0.0) for p in c_pagos), 2)
                if monto_ini > 0:
                    abonos_cuenta.insert(0, {
                        "id": 0,
                        "cxp_id": cid,
                        "monto_usd": monto_ini,
                        "fecha": fecha_doc,
                        "notas": "Anticipo / Pago inicial en compra",
                        "estado": "anulado" if es_anulada_cxp else "activo",
                        "pagos": c_pagos,
                        "es_inicial": True
                    })
                    if not es_anulada_cxp:
                        suma_abonos_activos = round(suma_abonos_activos + monto_ini, 2)

        pagado_explicado = round(suma_abonos_activos + nc_disminuye_por_cuenta.get(cid, 0.0), 2)
        diff_pagado = round(float(c.get("monto_pagado") or 0.0) - pagado_explicado, 2)
        if diff_pagado > 0.009 and not es_anulada_cxp and not any(a.get("id") == 0 for a in abonos_cuenta):
            abonos_cuenta.insert(0, {
                "id": 0,
                "cxp_id": cid,
                "monto_usd": diff_pagado,
                "fecha": fecha_doc,
                "notas": "Anticipo / Pago inicial registrado en cuenta",
                "estado": "activo",
                "pagos": [{"moneda": "USD", "metodo": "Pago Inicial", "monto_moneda": diff_pagado, "tasa_cambio": 1.0, "equivalente_usd": diff_pagado, "referencia": ""}],
                "es_inicial": True
            })

        saldo_temp_doc = monto_emision
        for idx_ab, ab in enumerate(abonos_cuenta):
            m_ab = round(float(ab.get("monto_usd") or 0.0), 2)
            es_anu_ab = (ab.get("estado") == "anulado") or es_anulada_cxp
            pagos_det = ab.get("pagos") or []
            partes_pago = []
            for p in pagos_det:
                mon = p.get("moneda") or "USD"
                met = p.get("metodo") or "Pago"
                mm = float(p.get("monto_moneda") or 0.0)
                ref = (p.get("referencia") or "").strip()
                ref_txt = f" [Ref: {ref}]" if ref else ""
                if mon == "USD":
                    partes_pago.append(f"{met}: ${mm:,.2f} USD{ref_txt}")
                else:
                    eq_u = float(p.get("equivalente_usd") or 0.0)
                    partes_pago.append(f"{met}: {mm:,.2f} {mon} (≈ ${eq_u:,.2f}){ref_txt}")
            resumen_pagos_str = " | ".join(partes_pago) if partes_pago else "Pago en USD"

            liquida_total = (m_ab >= saldo_temp_doc - 0.01) and (saldo_temp_doc > 0)
            if not es_anu_ab:
                saldo_temp_doc = max(0.0, round(saldo_temp_doc - m_ab, 2))

            if ab.get("id") == 0:
                doc_num_ab = f"INI-{num_doc}"
                tipo_mov = "abono" if not liquida_total else "pago"
                etiqueta = "Anticipo / Pago Inicial"
                orden_int = 2
            else:
                doc_num_ab = f"PAG-{ab['id']:04d}" if liquida_total else f"ABO-{ab['id']:04d}"
                tipo_mov = "pago" if liquida_total else "abono"
                etiqueta = "Pago a Proveedor (Total)" if liquida_total else "Abono a Proveedor"
                orden_int = 4

            notas_ab = (ab.get("notas") or "Pago a proveedor").strip()
            motivo_anu_ab = (ab.get("motivo_anulacion") or "").strip()
            concepto_ab = f"{notas_ab} ({resumen_pagos_str})" if resumen_pagos_str else notas_ab
            if es_anu_ab and motivo_anu_ab:
                concepto_ab += f" — [ANULADO: {motivo_anu_ab}]"

            movimientos.append({
                "uid": f"ABO-CXP-{cid}-{ab['id']}-{idx_ab}",
                "id_origen": int(ab["id"]) if ab.get("id") else idx_ab,
                "cxp_id": cid,
                "compra_id": comp_id,
                "abono_id": int(ab["id"]),
                "nota_id": None,
                "fecha": ab.get("fecha") or fecha_doc,
                "fecha_vencimiento": "",
                "orden_interno": orden_int,
                "tipo_movimiento": tipo_mov,
                "categoria_movimiento": "pago_abono",
                "etiqueta_tipo": etiqueta,
                "documento_numero": doc_num_ab,
                "documento_afectado": num_doc,
                "concepto": concepto_ab,
                "resumen_pagos": resumen_pagos_str,
                "pagos_detalle": pagos_det,
                "cargo_usd": 0.0,
                "abono_usd": m_ab,
                "monto_usd": m_ab,
                "estado": "anulado" if es_anu_ab else "activo",
                "es_anulado": es_anu_ab,
                "motivo_anulacion": motivo_anu_ab,
                "fecha_anulacion": ab.get("fecha_anulacion") or "",
                "puede_anular_pago": (not es_anu_ab) and (not es_anulada_cxp),
                "puede_anular_documento": False,
                "puede_pagar": False
            })

    # 4. Agregar Notas de Crédito y Notas de Débito de proveedor (notas_ajuste_comercial)
    for n in notas_ajuste:
        nid = n["id"]
        cid = n.get("cuenta_id")
        c_asoc = cxp_map.get(cid)
        num_doc_afectado = (c_asoc.get("numero_factura") or c_asoc.get("compra_numero_control") or f"CXP-{cid}") if c_asoc else "General"
        es_credito = (str(n.get("tipo_nota") or "").lower() == "credito")
        efecto = str(n.get("efecto") or ("disminuye" if es_credito else "incrementa")).lower()
        m_usd = round(float(n.get("monto_usd") or 0.0), 2)
        es_anu_cuenta = bool(c_asoc and c_asoc.get("estado") == "anulada")

        movimientos.append({
            "uid": f"NOTA-CXP-{nid}",
            "id_origen": nid,
            "cxp_id": cid,
            "compra_id": c_asoc.get("compra_id") if c_asoc else None,
            "abono_id": None,
            "nota_id": nid,
            "fecha": n.get("fecha") or n.get("created_at") or "",
            "fecha_vencimiento": "",
            "orden_interno": 3,
            "tipo_movimiento": "nota_credito" if es_credito else "nota_debito",
            "categoria_movimiento": "nota_credito" if es_credito else "nota_debito",
            "etiqueta_tipo": "Nota de Crédito" if es_credito else "Nota de Débito",
            "documento_numero": n.get("numero_nota") or f"{'NC' if es_credito else 'ND'}-{nid:06d}",
            "documento_afectado": num_doc_afectado,
            "concepto": f"{n.get('motivo') or 'Ajuste comercial con proveedor'}" + (f" (Control: {n.get('numero_control')})" if n.get("numero_control") else ""),
            "resumen_pagos": "",
            "pagos_detalle": [],
            "cargo_usd": m_usd if efecto == "incrementa" else 0.0,
            "abono_usd": m_usd if efecto == "disminuye" else 0.0,
            "monto_usd": m_usd,
            "estado": "anulado" if es_anu_cuenta else "activo",
            "es_anulado": es_anu_cuenta,
            "motivo_anulacion": "",
            "fecha_anulacion": "",
            "puede_anular_pago": False,
            "puede_anular_documento": False,
            "puede_pagar": False
        })

    # 5. Ordenar cronológicamente (ASC) y calcular saldo acumulado paso a paso
    movimientos.sort(key=lambda m: (_normalizar_fecha_sort(m["fecha"]), m["orden_interno"], m["id_origen"]))

    saldo_acum = 0.0
    saldos_por_cuenta = {}
    total_facturas_usd = 0.0
    total_nd_usd = 0.0
    total_pagos_abonos_usd = 0.0
    total_pagos_usd = 0.0
    total_abonos_usd = 0.0
    total_nc_usd = 0.0

    conteos = {
        "todos": len(movimientos),
        "factura": 0,
        "pago_abono": 0,
        "pago": 0,
        "abono": 0,
        "nota_credito": 0,
        "nota_debito": 0,
        "anulado": 0
    }

    for idx, m in enumerate(movimientos):
        m["nro_operacion"] = idx + 1
        m["saldo_anterior_usd"] = round(saldo_acum, 2)
        cid_m = m.get("cxp_id")
        saldo_cta_prev = saldos_por_cuenta.get(cid_m, 0.0) if cid_m else saldo_acum

        if not m["es_anulado"]:
            nuevo_saldo_cta = round(max(0.0, saldo_cta_prev + float(m["cargo_usd"]) - float(m["abono_usd"])), 2)
            if cid_m:
                saldos_por_cuenta[cid_m] = nuevo_saldo_cta
            saldo_acum = round(max(0.0, saldo_acum + float(m["cargo_usd"]) - float(m["abono_usd"])), 2)

            if m["categoria_movimiento"] == "pago_abono":
                liquida_cta = (nuevo_saldo_cta <= 0.01) and (saldo_cta_prev > 0.01)
                m["tipo_movimiento"] = "pago" if liquida_cta else "abono"
                if m.get("abono_id") and int(m["abono_id"]) > 0:
                    m["etiqueta_tipo"] = "Pago Aplicado (Total)" if liquida_cta else "Abono Parcial"
                    m["documento_numero"] = f"PAG-{int(m['abono_id']):04d}" if liquida_cta else f"ABO-{int(m['abono_id']):04d}"

        t_mov = m["tipo_movimiento"]
        if t_mov in conteos:
            conteos[t_mov] += 1
        if m["categoria_movimiento"] == "pago_abono":
            conteos["pago_abono"] += 1
        if m["es_anulado"]:
            conteos["anulado"] += 1

        if not m["es_anulado"]:
            if t_mov == "factura":
                total_facturas_usd = round(total_facturas_usd + float(m["cargo_usd"]), 2)
            elif t_mov == "nota_debito":
                total_nd_usd = round(total_nd_usd + float(m["cargo_usd"]) - float(m["abono_usd"]), 2)
            elif t_mov == "pago":
                total_pagos_usd = round(total_pagos_usd + float(m["abono_usd"]), 2)
                total_pagos_abonos_usd = round(total_pagos_abonos_usd + float(m["abono_usd"]), 2)
            elif t_mov == "abono":
                total_abonos_usd = round(total_abonos_usd + float(m["abono_usd"]), 2)
                total_pagos_abonos_usd = round(total_pagos_abonos_usd + float(m["abono_usd"]), 2)
            elif t_mov == "nota_credito":
                total_nc_usd = round(total_nc_usd + float(m["abono_usd"]) - float(m["cargo_usd"]), 2)

        m["saldo_acumulado_usd"] = saldo_acum
        m["saldo_acumulado_ves"] = round(saldo_acum * tasa_ves, 2)
        m["saldo_acumulado_cop"] = round(saldo_acum * tasa_cop, 2)

    # 6. Aplicar filtros solicitados
    movs_filtrados = list(movimientos)
    tf = (tipo_filtro or "").strip().lower()
    if tf and tf != "todos":
        if tf == "factura":
            movs_filtrados = [m for m in movs_filtrados if m["tipo_movimiento"] == "factura"]
        elif tf == "pago_abono":
            movs_filtrados = [m for m in movs_filtrados if m["categoria_movimiento"] == "pago_abono"]
        elif tf == "pago":
            estrictos = [m for m in movs_filtrados if m["tipo_movimiento"] == "pago"]
            movs_filtrados = estrictos if estrictos else [m for m in movs_filtrados if m["categoria_movimiento"] == "pago_abono"]
        elif tf == "abono":
            estrictos = [m for m in movs_filtrados if m["tipo_movimiento"] == "abono"]
            movs_filtrados = estrictos if estrictos else [m for m in movs_filtrados if m["categoria_movimiento"] == "pago_abono"]
        elif tf == "nota_credito":
            movs_filtrados = [m for m in movs_filtrados if m["tipo_movimiento"] == "nota_credito"]
        elif tf == "nota_debito":
            movs_filtrados = [m for m in movs_filtrados if m["tipo_movimiento"] == "nota_debito"]
        elif tf in ("anulado", "anulados", "anulada"):
            movs_filtrados = [m for m in movs_filtrados if m["es_anulado"]]

    if fecha_desde and str(fecha_desde).strip():
        fd_str = str(fecha_desde).strip()[:10]
        movs_filtrados = [m for m in movs_filtrados if str(m["fecha"] or "")[:10] >= fd_str]

    if fecha_hasta and str(fecha_hasta).strip():
        fh_str = str(fecha_hasta).strip()[:10]
        movs_filtrados = [m for m in movs_filtrados if str(m["fecha"] or "")[:10] <= fh_str]

    if q and str(q).strip():
        q_low = str(q).strip().lower()
        movs_filtrados = [
            m for m in movs_filtrados
            if q_low in str(m.get("documento_numero") or "").lower()
            or q_low in str(m.get("documento_afectado") or "").lower()
            or q_low in str(m.get("concepto") or "").lower()
            or q_low in str(m.get("etiqueta_tipo") or "").lower()
            or q_low in str(m.get("resumen_pagos") or "").lower()
        ]

    if str(orden or "asc").strip().lower() == "desc":
        movs_filtrados.reverse()

    saldo_real_cuentas = round(sum(float(c.get("saldo_pendiente") or 0.0) for c in cuentas if c.get("estado") != "anulada"), 2)

    return {
        "proveedor": proveedor_info,
        "tasa_ves": tasa_ves,
        "tasa_cop": tasa_cop,
        "resumen": {
            "total_facturas_usd": total_facturas_usd,
            "total_notas_debito_usd": total_nd_usd,
            "total_pagos_abonos_usd": total_pagos_abonos_usd,
            "total_pagos_usd": total_pagos_usd,
            "total_abonos_usd": total_abonos_usd,
            "total_abonos_parciales_usd": total_abonos_usd,
            "total_notas_credito_usd": total_nc_usd,
            "saldo_pendiente_usd": saldo_real_cuentas,
            "saldo_pendiente_ves": round(saldo_real_cuentas * tasa_ves, 2),
            "saldo_pendiente_cop": round(saldo_real_cuentas * tasa_cop, 2),
            "saldo_acumulado_cronologico_usd": saldo_acum
        },
        "conteos": conteos,
        "movimientos": movs_filtrados,
        "total_movimientos": len(movs_filtrados),
        "total_movimientos_global": len(movimientos),
        "total_movimientos_filtrados": len(movs_filtrados),
        "cuentas": cuentas
    }

# ========================================================
# FASE 2F-6C: MOTOR FINANCIERO, PAGOS N:M Y TESORERÍA
# ========================================================

def obtener_cuentas_tesoreria(solo_activas=True, conn=None):
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True
    try:
        cur = conn.cursor()
        query = "SELECT id, nombre, tipo, moneda, banco_entidad, numero_cuenta_enmascarado, saldo_actual, activo, permite_sobregiro FROM cuentas_tesoreria"
        if solo_activas:
            query += " WHERE activo = 1"
        query += " ORDER BY id ASC"
        cur.execute(query)
        rows = cur.fetchall()
        cols = ['id', 'nombre', 'tipo', 'moneda', 'banco_entidad', 'numero_cuenta_enmascarado', 'saldo_actual', 'activo', 'permite_sobregiro']
        return [dict(zip(cols, r)) for r in rows]
    finally:
        if close_after:
            conn.close()

def obtener_resumen_tesoreria(conn=None):
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True
    try:
        cur = conn.cursor()
        cuentas = obtener_cuentas_tesoreria(solo_activas=False, conn=conn)
        
        cur.execute("""
        SELECT a.id, a.cuenta_tesoreria_id, a.fecha_apertura, a.monto_inicial_usd, a.monto_inicial_moneda,
               c.nombre as cuenta_nombre, c.moneda
        FROM caja_aperturas a
        JOIN cuentas_tesoreria c ON a.cuenta_tesoreria_id = c.id
        WHERE a.estado = 'abierta'
        """)
        aperturas = [dict(zip(['id', 'cuenta_tesoreria_id', 'fecha_apertura', 'monto_inicial_usd', 'monto_inicial_moneda', 'cuenta_nombre', 'moneda'], r)) for r in cur.fetchall()]

        totales = {'USD': 0.0, 'VES': 0.0, 'COP': 0.0}
        for c in cuentas:
            m = c['moneda']
            if m in totales:
                totales[m] = round(totales[m] + float(c['saldo_actual']), 2)

        return {
            'cuentas': cuentas,
            'cajas_abiertas': aperturas,
            'totales_moneda': totales,
            'total_cuentas': len(cuentas)
        }
    finally:
        if close_after:
            conn.close()

def registrar_pago_financiero(datos, conn=None):
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True
    started_tx = False
    try:
        cur = conn.cursor()
        if not conn.in_transaction:
            cur.execute("BEGIN IMMEDIATE")
            started_tx = True

        idempotency_key = datos.get('idempotency_key')
        if idempotency_key:
            cur.execute("SELECT id, numero_pago, monto_total_equivalente_usd, monto_aplicado_usd, monto_no_aplicado_usd, estado FROM pagos WHERE idempotency_key = ?", (idempotency_key,))
            existing = cur.fetchone()
            if existing:
                return {
                    'id': existing[0],
                    'numero_pago': existing[1],
                    'monto_total_equivalente_usd': existing[2],
                    'monto_aplicado_usd': existing[3],
                    'monto_no_aplicado_usd': existing[4],
                    'estado': existing[5],
                    'duplicado_ignorado': True
                }

        tercero_tipo = datos.get('tercero_tipo', 'cliente')
        tercero_id = datos.get('tercero_id', 1)
        tipo_operacion = datos.get('tipo_operacion', 'cobro_cliente')
        concepto = datos.get('concepto', 'Cobro / Pago comercial')
        fecha_pago = datos.get('fecha_pago') or datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        usuario_id = datos.get('usuario_id', 1)

        detalles_monetarios = datos.get('detalles_monetarios') or datos.get('detalles') or []
        aplicaciones = datos.get('aplicaciones', [])

        if not detalles_monetarios and not aplicaciones:
            raise ValueError("El pago debe contener al menos un detalle monetario o una aplicación válida.")

        total_equivalente_usd = 0.0
        detalles_calculados = []
        for d in detalles_monetarios:
            moneda = d.get('moneda', 'USD')
            monto_moneda = float(d.get('monto_moneda', 0.0))
            tasa_cambio = float(d.get('tasa_cambio', 1.0))
            if tasa_cambio <= 0:
                tasa_cambio = 1.0

            if moneda == 'USD':
                eq_usd = round(monto_moneda, 2)
            else:
                eq_usd = round(monto_moneda / tasa_cambio, 2)

            total_equivalente_usd = round(total_equivalente_usd + eq_usd, 2)

            cuenta_id = d.get('cuenta_tesoreria_id')
            if not cuenta_id:
                cur.execute("SELECT id FROM cuentas_tesoreria WHERE moneda = ? AND activo = 1 ORDER BY id ASC LIMIT 1", (moneda,))
                row_c = cur.fetchone()
                cuenta_id = row_c[0] if row_c else 1

            detalles_calculados.append({
                'cuenta_tesoreria_id': cuenta_id,
                'moneda': moneda,
                'monto_moneda': monto_moneda,
                'tasa_cambio': tasa_cambio,
                'equivalente_usd': eq_usd,
                'metodo_pago': d.get('metodo_pago', 'efectivo'),
                'referencia_bancaria': d.get('referencia_bancaria')
            })

        total_aplicado_usd = 0.0
        aplicaciones_validadas = []
        for a in aplicaciones:
            monto_app = round(float(a.get('monto_aplicado_usd', 0.0)), 2)
            if monto_app <= 0:
                continue

            doc_tipo = a.get('documento_tipo', 'factura')
            doc_id = a.get('documento_id')
            cxc_id = a.get('cuenta_por_cobrar_id')
            cxp_id = a.get('cuenta_por_pagar_id')

            if doc_tipo == 'factura':
                if cxc_id:
                    cur.execute("SELECT id, saldo_pendiente, monto_pagado FROM cuentas_por_cobrar WHERE id = ?", (cxc_id,))
                else:
                    cur.execute("SELECT id, saldo_pendiente, monto_pagado FROM cuentas_por_cobrar WHERE factura_id = ?", (doc_id,))
                cxc = cur.fetchone()
                if cxc:
                    cxc_id = cxc[0]
                    saldo_pendiente = float(cxc[1])
                    if monto_app > saldo_pendiente + 0.005:
                        raise ValueError(f"MONTO_SUPERA_SALDO: El monto a aplicar (${monto_app:.2f}) supera el saldo pendiente (${saldo_pendiente:.2f})")
                else:
                    cxc_id = None

            total_aplicado_usd = round(total_aplicado_usd + monto_app, 2)
            aplicaciones_validadas.append({
                'documento_tipo': doc_tipo,
                'documento_id': doc_id,
                'cuenta_por_cobrar_id': cxc_id,
                'cuenta_por_pagar_id': cxp_id,
                'monto_aplicado_usd': monto_app
            })

        if total_aplicado_usd > total_equivalente_usd + 0.005:
            raise ValueError(f"MONTO_SUPERA_SALDO: El monto aplicado (${total_aplicado_usd:.2f}) supera el total pagado (${total_equivalente_usd:.2f})")

        monto_no_aplicado_usd = max(0.0, round(total_equivalente_usd - total_aplicado_usd, 2))

        prefix = 'COB' if tipo_operacion in ('cobro_cliente', 'anticipo_cliente') else 'PAG'
        ym = datetime.now().strftime('%Y%m')
        cur.execute("SELECT COUNT(*) FROM pagos WHERE numero_pago LIKE ?", (f"{prefix}-{ym}-%",))
        seq = cur.fetchone()[0] + 1
        numero_pago = f"{prefix}-{ym}-{seq:06d}"

        cur.execute("""
        INSERT INTO pagos (
            numero_pago, tipo_operacion, tercero_tipo, tercero_id, fecha_pago, concepto,
            monto_total_equivalente_usd, monto_aplicado_usd, monto_no_aplicado_usd,
            estado, idempotency_key, usuario_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo', ?, ?)
        """, (
            numero_pago, tipo_operacion, tercero_tipo, tercero_id, fecha_pago, concepto,
            total_equivalente_usd, total_aplicado_usd, monto_no_aplicado_usd,
            idempotency_key, usuario_id
        ))
        pago_id = cur.lastrowid

        detalles_guardados = []
        for d in detalles_calculados:
            cur.execute("""
            INSERT INTO pago_detalles (
                pago_id, cuenta_tesoreria_id, moneda, monto_moneda, tasa_cambio, equivalente_usd,
                metodo_pago, referencia_bancaria
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                pago_id, d['cuenta_tesoreria_id'], d['moneda'], d['monto_moneda'], d['tasa_cambio'], d['equivalente_usd'],
                d['metodo_pago'], d['referencia_bancaria']
            ))
            pago_det_id = cur.lastrowid
            d['id'] = pago_det_id
            detalles_guardados.append(d)

            es_ingreso = tipo_operacion in ('cobro_cliente', 'anticipo_cliente')
            tipo_mov = 'ingreso' if es_ingreso else 'egreso'
            origen_mod = 'cobro_cxc' if es_ingreso else 'pago_cxp'

            cur.execute("SELECT saldo_actual FROM cuentas_tesoreria WHERE id = ?", (d['cuenta_tesoreria_id'],))
            row_s = cur.fetchone()
            saldo_ant = float(row_s[0]) if row_s else 0.0
            saldo_nue = round(saldo_ant + d['monto_moneda'], 2) if es_ingreso else round(saldo_ant - d['monto_moneda'], 2)

            cur.execute("UPDATE cuentas_tesoreria SET saldo_actual = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (saldo_nue, d['cuenta_tesoreria_id']))

            cur.execute("""
            INSERT INTO tesoreria_movimientos (
                cuenta_tesoreria_id, tipo_movimiento, origen_modulo, origen_id, pago_detalle_id,
                fecha_movimiento, descripcion, monto_moneda, saldo_anterior, saldo_nuevo,
                tasa_cambio, equivalente_usd, usuario_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                d['cuenta_tesoreria_id'], tipo_mov, origen_mod, pago_id, pago_det_id,
                fecha_pago, f"{concepto} ({d['metodo_pago']})", d['monto_moneda'], saldo_ant, saldo_nue,
                d['tasa_cambio'], d['equivalente_usd'], usuario_id
            ))

        for a in aplicaciones_validadas:
            cur.execute("""
            INSERT INTO pago_aplicaciones (
                pago_id, documento_tipo, documento_id, cuenta_por_cobrar_id, cuenta_por_pagar_id,
                monto_aplicado_usd, estado
            ) VALUES (?, ?, ?, ?, ?, ?, 'activa')
            """, (
                pago_id, a['documento_tipo'], a['documento_id'], a['cuenta_por_cobrar_id'], a['cuenta_por_pagar_id'],
                a['monto_aplicado_usd']
            ))

            if a['cuenta_por_cobrar_id']:
                cur.execute("SELECT monto_pagado, saldo_pendiente FROM cuentas_por_cobrar WHERE id = ?", (a['cuenta_por_cobrar_id'],))
                row_c = cur.fetchone()
                if row_c:
                    monto_pagado_nuevo = round(float(row_c[0]) + a['monto_aplicado_usd'], 2)
                    saldo_pendiente_nuevo = max(0.0, round(float(row_c[1]) - a['monto_aplicado_usd'], 2))
                    estado_nuevo = 'pagada' if saldo_pendiente_nuevo <= 0.005 else 'pendiente'
                    cur.execute("""
                    UPDATE cuentas_por_cobrar 
                    SET monto_pagado = ?, saldo_pendiente = ?, estado = ?
                    WHERE id = ?
                    """, (monto_pagado_nuevo, saldo_pendiente_nuevo, estado_nuevo, a['cuenta_por_cobrar_id']))

            if a['cuenta_por_pagar_id']:
                cur.execute("SELECT monto_pagado, saldo_pendiente FROM cuentas_por_pagar WHERE id = ?", (a['cuenta_por_pagar_id'],))
                row_cp = cur.fetchone()
                if row_cp:
                    monto_pagado_nuevo = round(float(row_cp[0]) + a['monto_aplicado_usd'], 2)
                    saldo_pendiente_nuevo = max(0.0, round(float(row_cp[1]) - a['monto_aplicado_usd'], 2))
                    estado_nuevo = 'pagada' if saldo_pendiente_nuevo <= 0.005 else 'pendiente'
                    cur.execute("""
                    UPDATE cuentas_por_pagar 
                    SET monto_pagado = ?, saldo_pendiente = ?, estado = ?
                    WHERE id = ?
                    """, (monto_pagado_nuevo, saldo_pendiente_nuevo, estado_nuevo, a['cuenta_por_pagar_id']))

        anticipo_creado = None
        if monto_no_aplicado_usd > 0.005:
            cur.execute("""
            INSERT INTO anticipos_clientes (
                tercero_tipo, tercero_id, pago_origen_id, monto_original_usd, saldo_disponible_usd, estado
            ) VALUES (?, ?, ?, ?, ?, 'disponible')
            """, (tercero_tipo, tercero_id, pago_id, monto_no_aplicado_usd, monto_no_aplicado_usd))
            anticipo_creado = {
                'id': cur.lastrowid,
                'saldo_disponible_usd': monto_no_aplicado_usd,
                'estado': 'disponible'
            }

        conn.commit()

        return {
            'id': pago_id,
            'numero_pago': numero_pago,
            'tipo_operacion': tipo_operacion,
            'concepto': concepto,
            'monto_total_equivalente_usd': total_equivalente_usd,
            'monto_aplicado_usd': total_aplicado_usd,
            'monto_no_aplicado_usd': monto_no_aplicado_usd,
            'estado': 'activo',
            'detalles': detalles_guardados,
            'aplicaciones': aplicaciones_validadas,
            'anticipo': anticipo_creado,
            'duplicado_ignorado': False
        }
    except Exception as e:
        if started_tx and conn is not None and conn.in_transaction:
            conn.rollback()
        raise e
    finally:
        if close_after:
            conn.close()

def anular_pago_financiero(pago_id, usuario_id=1, motivo="", conn=None):
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True
    started_tx = False
    try:
        cur = conn.cursor()
        if not conn.in_transaction:
            cur.execute("BEGIN IMMEDIATE")
            started_tx = True

        cur.execute("SELECT id, estado, concepto FROM pagos WHERE id = ?", (pago_id,))
        p = cur.fetchone()
        if not p:
            raise ValueError(f"Pago {pago_id} no encontrado")
        if p[1] == 'anulado':
            raise ValueError(f"El pago {pago_id} ya se encuentra anulado")

        cur.execute("SELECT id, documento_tipo, documento_id, cuenta_por_cobrar_id, cuenta_por_pagar_id, monto_aplicado_usd FROM pago_aplicaciones WHERE pago_id = ? AND estado = 'activa'", (pago_id,))
        apps = cur.fetchall()
        now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        for app in apps:
            app_id, doc_tipo, doc_id, cxc_id, cxp_id, monto_app = app
            monto_app = float(monto_app)

            if cxc_id:
                cur.execute("SELECT monto_pagado, saldo_pendiente FROM cuentas_por_cobrar WHERE id = ?", (cxc_id,))
                row_c = cur.fetchone()
                if row_c:
                    monto_pagado_nuevo = max(0.0, round(float(row_c[0]) - monto_app, 2))
                    saldo_pendiente_nuevo = round(float(row_c[1]) + monto_app, 2)
                    cur.execute("UPDATE cuentas_por_cobrar SET monto_pagado = ?, saldo_pendiente = ?, estado = 'pendiente' WHERE id = ?", (monto_pagado_nuevo, saldo_pendiente_nuevo, cxc_id))

            if cxp_id:
                cur.execute("SELECT monto_pagado, saldo_pendiente FROM cuentas_por_pagar WHERE id = ?", (cxp_id,))
                row_cp = cur.fetchone()
                if row_cp:
                    monto_pagado_nuevo = max(0.0, round(float(row_cp[0]) - monto_app, 2))
                    saldo_pendiente_nuevo = round(float(row_cp[1]) + monto_app, 2)
                    cur.execute("UPDATE cuentas_por_pagar SET monto_pagado = ?, saldo_pendiente = ?, estado = 'pendiente' WHERE id = ?", (monto_pagado_nuevo, saldo_pendiente_nuevo, cxp_id))

            cur.execute("UPDATE pago_aplicaciones SET estado = 'revertida', revertido_at = ?, revertido_motivo = ? WHERE id = ?", (now_str, motivo, app_id))

        cur.execute("SELECT id, monto_original_usd, saldo_disponible_usd FROM anticipos_clientes WHERE pago_origen_id = ?", (pago_id,))
        ant = cur.fetchone()
        if ant:
            orig = float(ant[1])
            disp = float(ant[2])
            if disp < orig - 0.005:
                raise ValueError("No se puede anular el pago: el saldo a favor generado ya fue consumido en facturas posteriores.")
            cur.execute("UPDATE anticipos_clientes SET estado = 'reembolsado', saldo_disponible_usd = 0.0, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (ant[0],))

        cur.execute("SELECT id, cuenta_tesoreria_id, moneda, monto_moneda, tasa_cambio, equivalente_usd, metodo_pago FROM pago_detalles WHERE pago_id = ?", (pago_id,))
        detalles = cur.fetchall()

        for d in detalles:
            det_id, cuenta_id, moneda, monto_moneda, tasa, eq_usd, metodo = d
            monto_moneda = float(monto_moneda)
            tasa = float(tasa)
            eq_usd = float(eq_usd)

            cur.execute("SELECT saldo_actual FROM cuentas_tesoreria WHERE id = ?", (cuenta_id,))
            saldo_ant = float(cur.fetchone()[0])
            saldo_nue = round(saldo_ant - monto_moneda, 2)
            cur.execute("UPDATE cuentas_tesoreria SET saldo_actual = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (saldo_nue, cuenta_id))

            cur.execute("""
            INSERT INTO tesoreria_movimientos (
                cuenta_tesoreria_id, tipo_movimiento, origen_modulo, origen_id, pago_detalle_id,
                fecha_movimiento, descripcion, monto_moneda, saldo_anterior, saldo_nuevo,
                tasa_cambio, equivalente_usd, usuario_id
            ) VALUES (?, 'egreso', 'cobro_cxc', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                cuenta_id, pago_id, det_id, now_str, f"ANULACIÓN PAGO #{pago_id}: {motivo}",
                monto_moneda, saldo_ant, saldo_nue, tasa, eq_usd, usuario_id
            ))

        cur.execute("""
        UPDATE pagos 
        SET estado = 'anulado', anulado_at = ?, anulado_by = ?, motivo_anulacion = ?
        WHERE id = ?
        """, (now_str, usuario_id, motivo, pago_id))

        conn.commit()
        return {'id': pago_id, 'estado': 'anulado', 'anulado_at': now_str}
    except Exception as e:
        if started_tx and conn is not None and conn.in_transaction:
            conn.rollback()
        raise e
    finally:
        if close_after:
            conn.close()

def aplicar_anticipo_cliente(anticipo_id, aplicaciones, usuario_id=1, conn=None):
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True
    started_tx = False
    try:
        cur = conn.cursor()
        if not conn.in_transaction:
            cur.execute("BEGIN IMMEDIATE")
            started_tx = True

        cur.execute("SELECT id, pago_origen_id, saldo_disponible_usd, estado FROM anticipos_clientes WHERE id = ?", (anticipo_id,))
        ant = cur.fetchone()
        if not ant:
            raise ValueError(f"Anticipo {anticipo_id} no encontrado")
        if ant[3] not in ('disponible', 'aplicado_parcial'):
            raise ValueError("El anticipo no tiene saldo disponible.")

        pago_origen_id = ant[1]
        saldo_disp = float(ant[2])

        total_aplicar = sum(float(a.get('monto_aplicado_usd', 0.0)) for a in aplicaciones)
        if total_aplicar > saldo_disp + 0.005:
            raise ValueError(f"El monto a aplicar (${total_aplicar:.2f}) supera el saldo disponible (${saldo_disp:.2f})")

        for a in aplicaciones:
            monto_app = round(float(a.get('monto_aplicado_usd', 0.0)), 2)
            if monto_app <= 0:
                continue

            cxc_id = a.get('cuenta_por_cobrar_id')
            doc_id = a.get('documento_id')

            if cxc_id:
                cur.execute("SELECT id, saldo_pendiente, monto_pagado FROM cuentas_por_cobrar WHERE id = ?", (cxc_id,))
            else:
                cur.execute("SELECT id, saldo_pendiente, monto_pagado FROM cuentas_por_cobrar WHERE factura_id = ?", (doc_id,))
            cxc = cur.fetchone()
            if not cxc:
                continue

            cxc_id = cxc[0]
            saldo_pend = float(cxc[1])
            if monto_app > saldo_pend + 0.005:
                raise ValueError("Monto excede saldo pendiente de factura.")

            cur.execute("""
            INSERT INTO pago_aplicaciones (
                pago_id, documento_tipo, documento_id, cuenta_por_cobrar_id, monto_aplicado_usd, estado
            ) VALUES (?, 'factura', ?, ?, ?, 'activa')
            """, (pago_origen_id, doc_id, cxc_id, monto_app))

            monto_pagado_nuevo = round(float(cxc[2]) + monto_app, 2)
            saldo_pend_nuevo = max(0.0, round(saldo_pend - monto_app, 2))
            estado_nuevo = 'pagada' if saldo_pend_nuevo <= 0.005 else 'pendiente'

            cur.execute("UPDATE cuentas_por_cobrar SET monto_pagado = ?, saldo_pendiente = ?, estado = ? WHERE id = ?", (monto_pagado_nuevo, saldo_pend_nuevo, estado_nuevo, cxc_id))

        saldo_restante = max(0.0, round(saldo_disp - total_aplicar, 2))
        estado_ant = 'agotado' if saldo_restante <= 0.005 else 'aplicado_parcial'

        cur.execute("UPDATE anticipos_clientes SET saldo_disponible_usd = ?, estado = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (saldo_restante, estado_ant, anticipo_id))

        cur.execute("""
        UPDATE pagos 
        SET monto_aplicado_usd = round(monto_aplicado_usd + ?, 2),
            monto_no_aplicado_usd = round(monto_no_aplicado_usd - ?, 2)
        WHERE id = ?
        """, (total_aplicar, total_aplicar, pago_origen_id))

        conn.commit()
        return {
            'anticipo_id': anticipo_id,
            'monto_aplicado_usd': total_aplicar,
            'saldo_disponible_restante_usd': saldo_restante,
            'estado_anticipo': estado_ant
        }
    except Exception as e:
        if started_tx and conn is not None and conn.in_transaction:
            conn.rollback()
        raise e
    finally:
        if close_after:
            conn.close()

def abrir_caja_turno(cuenta_tesoreria_id, usuario_id=1, monto_inicial_usd=0.0, monto_inicial_moneda=0.0, notas="", conn=None):
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True
    started_tx = False
    try:
        cur = conn.cursor()
        if not conn.in_transaction:
            cur.execute("BEGIN IMMEDIATE")
            started_tx = True

        cur.execute("SELECT id FROM caja_aperturas WHERE cuenta_tesoreria_id = ? AND estado = 'abierta'", (cuenta_tesoreria_id,))
        if cur.fetchone():
            raise ValueError(f"La cuenta {cuenta_tesoreria_id} ya posee un turno de caja abierto.")

        now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        cur.execute("""
        INSERT INTO caja_aperturas (
            cuenta_tesoreria_id, usuario_id, fecha_apertura, monto_inicial_usd, monto_inicial_moneda, estado, notas_apertura
        ) VALUES (?, ?, ?, ?, ?, 'abierta', ?)
        """, (cuenta_tesoreria_id, usuario_id, now_str, monto_inicial_usd, monto_inicial_moneda, notas))
        apertura_id = cur.lastrowid

        if monto_inicial_moneda > 0:
            cur.execute("UPDATE cuentas_tesoreria SET saldo_actual = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (monto_inicial_moneda, cuenta_tesoreria_id))

        conn.commit()
        return {'id': apertura_id, 'cuenta_tesoreria_id': cuenta_tesoreria_id, 'estado': 'abierta', 'monto_inicial_usd': monto_inicial_usd}
    except Exception as e:
        if started_tx and conn is not None and conn.in_transaction:
            conn.rollback()
        raise e
    finally:
        if close_after:
            conn.close()

def cerrar_caja_turno(caja_apertura_id, usuario_id=1, saldo_real_fisico_usd=0.0, saldo_real_fisico_moneda=0.0, notas="", conn=None):
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True
    started_tx = False
    try:
        cur = conn.cursor()
        if not conn.in_transaction:
            cur.execute("BEGIN IMMEDIATE")
            started_tx = True

        cur.execute("SELECT id, cuenta_tesoreria_id, fecha_apertura, monto_inicial_usd, monto_inicial_moneda, estado FROM caja_aperturas WHERE id = ?", (caja_apertura_id,))
        ap = cur.fetchone()
        if not ap:
            raise ValueError(f"Turno de apertura {caja_apertura_id} no encontrado")
        if ap[5] != 'abierta':
            raise ValueError("El turno de caja ya se encuentra cerrado.")

        cuenta_id = ap[1]
        fecha_ape = ap[2]
        monto_ini_usd = float(ap[3])
        monto_ini_moneda = float(ap[4])

        cur.execute("""
        SELECT 
            COALESCE(SUM(CASE WHEN tipo_movimiento = 'ingreso' THEN monto_moneda ELSE 0 END), 0.0) as ingresos,
            COALESCE(SUM(CASE WHEN tipo_movimiento = 'egreso' THEN monto_moneda ELSE 0 END), 0.0) as egresos
        FROM tesoreria_movimientos
        WHERE cuenta_tesoreria_id = ? AND fecha_movimiento > ?
        """, (cuenta_id, fecha_ape))
        movs = cur.fetchone()
        ingresos = float(movs[0])
        egresos = float(movs[1])

        saldo_teorico_moneda = round(monto_ini_moneda + ingresos - egresos, 2)
        cur.execute("SELECT moneda FROM cuentas_tesoreria WHERE id = ?", (cuenta_id,))
        moneda = cur.fetchone()[0]

        diferencia_moneda = round(saldo_real_fisico_moneda - saldo_teorico_moneda, 2)
        diferencia_usd = diferencia_moneda if moneda == 'USD' else round(diferencia_moneda, 2)

        if abs(diferencia_moneda) <= 0.01:
            estado_arqueo = 'cuadrado'
        elif diferencia_moneda > 0:
            estado_arqueo = 'sobrante'
        else:
            estado_arqueo = 'faltante'

        now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        cur.execute("""
        INSERT INTO caja_cierres (
            caja_apertura_id, fecha_cierre, saldo_teorico_usd, saldo_teorico_moneda,
            saldo_real_fisico_usd, saldo_real_fisico_moneda, diferencia_usd, diferencia_moneda,
            estado_arqueo, notas_cierre, cerrado_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            caja_apertura_id, now_str, saldo_teorico_moneda, saldo_teorico_moneda,
            saldo_real_fisico_usd, saldo_real_fisico_moneda, diferencia_usd, diferencia_moneda,
            estado_arqueo, notas, usuario_id
        ))
        cierre_id = cur.lastrowid

        if abs(diferencia_moneda) > 0.01:
            cur.execute("UPDATE cuentas_tesoreria SET saldo_actual = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (saldo_real_fisico_moneda, cuenta_id))
            cur.execute("""
            INSERT INTO tesoreria_movimientos (
                cuenta_tesoreria_id, tipo_movimiento, origen_modulo, origen_id,
                fecha_movimiento, descripcion, monto_moneda, saldo_anterior, saldo_nuevo,
                tasa_cambio, equivalente_usd, usuario_id
            ) VALUES (?, 'ajuste_arqueo', 'caja_arqueo', ?, ?, ?, ?, ?, ?, 1.0, ?, ?)
            """, (
                cuenta_id, cierre_id, now_str, f"ARQUEO CAJA #{caja_apertura_id}: {estado_arqueo.upper()}",
                abs(diferencia_moneda), saldo_teorico_moneda, saldo_real_fisico_moneda, abs(diferencia_usd), usuario_id
            ))

        cur.execute("UPDATE caja_aperturas SET estado = 'cerrada' WHERE id = ?", (caja_apertura_id,))
        conn.commit()

        return {
            'id': cierre_id,
            'caja_apertura_id': caja_apertura_id,
            'estado_arqueo': estado_arqueo,
            'saldo_teorico_usd': saldo_teorico_moneda,
            'saldo_real_fisico_usd': saldo_real_fisico_usd,
            'diferencia_usd': diferencia_usd,
            'diferencia_moneda': diferencia_moneda
        }
    except Exception as e:
        if started_tx and conn is not None and conn.in_transaction:
            conn.rollback()
        raise e
    finally:
        if close_after:
            conn.close()

def registrar_gasto_operativo(datos, usuario_id=1, conn=None):
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True
    started_tx = False
    try:
        cur = conn.cursor()
        if not conn.in_transaction:
            cur.execute("BEGIN IMMEDIATE")
            started_tx = True

        categoria = datos.get('categoria_gasto') or datos.get('categoria') or 'Operativo'
        beneficiario = datos.get('beneficiario', 'Proveedor de Servicios')
        rif = datos.get('beneficiario_rif')
        tipo_pago = datos.get('tipo_pago', 'contado')
        moneda = datos.get('moneda', 'USD')
        monto_moneda = float(datos.get('monto_total_moneda') or datos.get('monto_moneda') or datos.get('monto') or 0.0)
        tasa = float(datos.get('tasa_cambio', 1.0))
        if tasa <= 0: tasa = 1.0
        monto_usd = round(monto_moneda if moneda == 'USD' else monto_moneda / tasa, 2)
        concepto = datos.get('concepto') or datos.get('descripcion') or 'Gasto operativo'
        cuenta_id = datos.get('cuenta_tesoreria_id')
        fecha_emision = datos.get('fecha_emision') or datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        ym = datetime.now().strftime('%Y%m')
        cur.execute("SELECT COUNT(*) FROM gastos WHERE numero_gasto LIKE ?", (f"GAS-{ym}-%",))
        seq = cur.fetchone()[0] + 1
        numero_gasto = f"GAS-{ym}-{seq:06d}"

        cxp_id = None
        if tipo_pago == 'credito':
            cur.execute("""
            INSERT INTO cuentas_por_pagar (
                concepto, monto_total, saldo_pendiente, fecha_vencimiento, estado
            ) VALUES (?, ?, ?, date('now', '+30 days'), 'pendiente')
            """, (f"Gasto: {concepto} ({beneficiario})", monto_usd, monto_usd))
            cxp_id = cur.lastrowid

        cur.execute("""
        INSERT INTO gastos (
            numero_gasto, categoria_gasto, beneficiario, beneficiario_rif, tipo_pago,
            moneda, monto_total_moneda, tasa_cambio, monto_total_usd, concepto,
            cuenta_tesoreria_id, cuenta_por_pagar_id, usuario_id, fecha_emision, estado
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo')
        """, (
            numero_gasto, categoria, beneficiario, rif, tipo_pago,
            moneda, monto_moneda, tasa, monto_usd, concepto,
            cuenta_id, cxp_id, usuario_id, fecha_emision
        ))
        gasto_id = cur.lastrowid

        if tipo_pago == 'contado' and cuenta_id:
            cur.execute("SELECT saldo_actual FROM cuentas_tesoreria WHERE id = ?", (cuenta_id,))
            row_s = cur.fetchone()
            saldo_ant = float(row_s[0]) if row_s else 0.0
            saldo_nue = round(saldo_ant - monto_moneda, 2)
            cur.execute("UPDATE cuentas_tesoreria SET saldo_actual = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (saldo_nue, cuenta_id))

            cur.execute("""
            INSERT INTO tesoreria_movimientos (
                cuenta_tesoreria_id, tipo_movimiento, origen_modulo, origen_id,
                fecha_movimiento, descripcion, monto_moneda, saldo_anterior, saldo_nuevo,
                tasa_cambio, equivalente_usd, usuario_id
            ) VALUES (?, 'egreso', 'gasto_operativo', ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                cuenta_id, gasto_id, fecha_emision, f"GASTO #{numero_gasto}: {concepto}",
                monto_moneda, saldo_ant, saldo_nue, tasa, monto_usd, usuario_id
            ))

        conn.commit()
        return {
            'id': gasto_id,
            'numero_gasto': numero_gasto,
            'monto_total_usd': monto_usd,
            'estado': 'activo',
            'cuenta_por_pagar_id': cxp_id
        }
    except Exception as e:
        if started_tx and conn is not None and conn.in_transaction:
            conn.rollback()
        raise e
    finally:
        if close_after:
            conn.close()

def transferir_entre_cuentas_tesoreria(cuenta_origen_id, cuenta_destino_id, monto_origen, monto_destino, tasa_cambio, usuario_id=1, notas="", conn=None):
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True
    started_tx = False
    try:
        cur = conn.cursor()
        if not conn.in_transaction:
            cur.execute("BEGIN IMMEDIATE")
            started_tx = True

        cur.execute("SELECT id, moneda, saldo_actual FROM cuentas_tesoreria WHERE id = ?", (cuenta_origen_id,))
        orig = cur.fetchone()
        cur.execute("SELECT id, moneda, saldo_actual FROM cuentas_tesoreria WHERE id = ?", (cuenta_destino_id,))
        dest = cur.fetchone()

        if not orig or not dest:
            raise ValueError("Cuenta de origen o destino no encontrada")

        saldo_orig_ant = float(orig[2])
        saldo_dest_ant = float(dest[2])

        saldo_orig_nue = round(saldo_orig_ant - float(monto_origen), 2)
        saldo_dest_nue = round(saldo_dest_ant + float(monto_destino), 2)

        cur.execute("UPDATE cuentas_tesoreria SET saldo_actual = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (saldo_orig_nue, cuenta_origen_id))
        cur.execute("UPDATE cuentas_tesoreria SET saldo_actual = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (saldo_dest_nue, cuenta_destino_id))

        now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        cur.execute("""
        INSERT INTO tesoreria_movimientos (
            cuenta_tesoreria_id, tipo_movimiento, origen_modulo,
            fecha_movimiento, descripcion, monto_moneda, saldo_anterior, saldo_nuevo,
            tasa_cambio, equivalente_usd, usuario_id
        ) VALUES (?, 'transferencia_salida', 'transferencia_interna', ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            cuenta_origen_id, now_str, f"Transferencia hacia cuenta #{cuenta_destino_id} ({notas})",
            float(monto_origen), saldo_orig_ant, saldo_orig_nue, float(tasa_cambio), float(monto_origen), usuario_id
        ))

        cur.execute("""
        INSERT INTO tesoreria_movimientos (
            cuenta_tesoreria_id, tipo_movimiento, origen_modulo,
            fecha_movimiento, descripcion, monto_moneda, saldo_anterior, saldo_nuevo,
            tasa_cambio, equivalente_usd, usuario_id
        ) VALUES (?, 'transferencia_entrada', 'transferencia_interna', ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            cuenta_destino_id, now_str, f"Transferencia recibida de cuenta #{cuenta_origen_id} ({notas})",
            float(monto_destino), saldo_dest_ant, saldo_dest_nue, float(tasa_cambio), float(monto_origen), usuario_id
        ))

        conn.commit()
        return {
            'cuenta_origen_id': cuenta_origen_id,
            'saldo_origen_nuevo': saldo_orig_nue,
            'cuenta_destino_id': cuenta_destino_id,
            'saldo_destino_nuevo': saldo_dest_nue
        }
    except Exception as e:
        if started_tx and conn is not None and conn.in_transaction:
            conn.rollback()
        raise e
    finally:
        if close_after:
            conn.close()

def obtener_historial_pagos(filtros=None, conn=None):
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True
    try:
        cur = conn.cursor()
        query = """
        SELECT p.id, p.numero_pago, p.tipo_operacion, p.tercero_tipo, p.tercero_id, p.fecha_pago,
               p.concepto, p.monto_total_equivalente_usd, p.monto_aplicado_usd, p.monto_no_aplicado_usd,
               p.estado, p.created_at, p.motivo_anulacion,
               CASE WHEN p.tercero_tipo = 'cliente' THEN c.nombre ELSE pr.nombre END as tercero_nombre
        FROM pagos p
        LEFT JOIN clientes c ON p.tercero_tipo = 'cliente' AND p.tercero_id = c.id
        LEFT JOIN proveedores pr ON p.tercero_tipo = 'proveedor' AND p.tercero_id = pr.id
        WHERE 1=1
        """
        params = []
        if filtros:
            if filtros.get('tercero_id'):
                query += " AND p.tercero_id = ?"
                params.append(filtros['tercero_id'])
            if filtros.get('estado'):
                query += " AND p.estado = ?"
                params.append(filtros['estado'])
            if filtros.get('tipo_operacion'):
                query += " AND p.tipo_operacion = ?"
                params.append(filtros['tipo_operacion'])

        query += " ORDER BY p.id DESC LIMIT 100"
        cur.execute(query, params)
        rows = cur.fetchall()
        cols = ['id', 'numero_pago', 'tipo_operacion', 'tercero_tipo', 'tercero_id', 'fecha_pago',
                'concepto', 'monto_total_equivalente_usd', 'monto_aplicado_usd', 'monto_no_aplicado_usd',
                'estado', 'created_at', 'motivo_anulacion', 'tercero_nombre']
        
        resultado = []
        for r in rows:
            p_dict = dict(zip(cols, r))
            cur.execute("""
            SELECT pd.id, pd.cuenta_tesoreria_id, pd.moneda, pd.monto_moneda, pd.tasa_cambio, pd.equivalente_usd,
                   pd.metodo_pago, pd.referencia_bancaria, ct.nombre as cuenta_nombre
            FROM pago_detalles pd
            LEFT JOIN cuentas_tesoreria ct ON pd.cuenta_tesoreria_id = ct.id
            WHERE pd.pago_id = ?
            """, (p_dict['id'],))
            p_dict['detalles'] = [dict(zip(['id', 'cuenta_tesoreria_id', 'moneda', 'monto_moneda', 'tasa_cambio', 'equivalente_usd', 'metodo_pago', 'referencia_bancaria', 'cuenta_nombre'], dr)) for dr in cur.fetchall()]
            
            cur.execute("""
            SELECT pa.id, pa.documento_tipo, pa.documento_id, pa.monto_aplicado_usd, pa.estado,
                   f.numero_factura
            FROM pago_aplicaciones pa
            LEFT JOIN facturas f ON pa.documento_tipo = 'factura' AND pa.documento_id = f.id
            WHERE pa.pago_id = ?
            """, (p_dict['id'],))
            p_dict['aplicaciones'] = [dict(zip(['id', 'documento_tipo', 'documento_id', 'monto_aplicado_usd', 'estado', 'numero_factura'], ar)) for ar in cur.fetchall()]

            resultado.append(p_dict)

        return resultado
    finally:
        if close_after:
            conn.close()

def obtener_anticipos_cliente(cliente_id, solo_disponibles=True, conn=None):
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True
    try:
        cur = conn.cursor()
        query = """
        SELECT a.id, a.tercero_tipo, a.tercero_id, a.pago_origen_id, a.monto_original_usd,
               a.saldo_disponible_usd, a.estado, a.created_at, p.numero_pago
        FROM anticipos_clientes a
        JOIN pagos p ON a.pago_origen_id = p.id
        WHERE a.tercero_tipo = 'cliente' AND a.tercero_id = ?
        """
        params = [cliente_id]
        if solo_disponibles:
            query += " AND a.saldo_disponible_usd > 0 AND a.estado IN ('disponible', 'aplicado_parcial')"
        query += " ORDER BY a.id ASC"
        cur.execute(query, params)
        cols = ['id', 'tercero_tipo', 'tercero_id', 'pago_origen_id', 'monto_original_usd', 'saldo_disponible_usd', 'estado', 'created_at', 'numero_pago']
        return [dict(zip(cols, r)) for r in cur.fetchall()]
    finally:
        if close_after:
            conn.close()

def obtener_gastos_operativos(filtros=None, conn=None):
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True
    try:
        cur = conn.cursor()
        query = """
        SELECT g.id, g.numero_gasto, g.categoria_gasto, g.beneficiario, g.beneficiario_rif, g.tipo_pago,
               g.moneda, g.monto_total_moneda, g.tasa_cambio, g.monto_total_usd, g.numero_factura_fiscal,
               g.numero_control, g.concepto, g.cuenta_tesoreria_id, g.cuenta_por_pagar_id, g.fecha_emision,
               g.estado, ct.nombre as cuenta_nombre
        FROM gastos g
        LEFT JOIN cuentas_tesoreria ct ON g.cuenta_tesoreria_id = ct.id
        WHERE 1=1
        """
        params = []
        if filtros and filtros.get('estado'):
            query += " AND g.estado = ?"
            params.append(filtros['estado'])
        query += " ORDER BY g.id DESC LIMIT 100"
        cur.execute(query, params)
        cols = ['id', 'numero_gasto', 'categoria_gasto', 'beneficiario', 'beneficiario_rif', 'tipo_pago',
                'moneda', 'monto_total_moneda', 'tasa_cambio', 'monto_total_usd', 'numero_factura_fiscal',
                'numero_control', 'concepto', 'cuenta_tesoreria_id', 'cuenta_por_pagar_id', 'fecha_emision',
                'estado', 'cuenta_nombre']
        return [dict(zip(cols, r)) for r in cur.fetchall()]
    finally:
        if close_after:
            conn.close()



# ==============================================================================
# 15. FUNCIONES OPERACIONALES DE PEDIDOS Y PREVENTA (FUERZA DE VENTAS)
# ==============================================================================

# ========================================================
# FUNCIONES DE GESTION TERRITORIAL (ZONAS)
# ========================================================

def obtener_zonas(solo_activas=True, conn=None):
    """Consulta la lista de zonas comerciales configuradas."""
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True
    try:
        cur = conn.cursor()
        sql = "SELECT * FROM zonas WHERE 1=1"
        if solo_activas:
            sql += " AND is_active = 1"
        sql += " ORDER BY nombre ASC"
        cur.execute(sql)
        return [dict(r) for r in cur.fetchall()]
    finally:
        if close_after:
            conn.close()

def crear_zona(nombre, descripcion='', is_active=1, tenant_id=1, conn=None):
    """Crea una nueva zona o territorio de ventas."""
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO zonas (tenant_id, nombre, descripcion, is_active)
            VALUES (?, ?, ?, ?)
        """, (tenant_id, nombre.strip(), (descripcion or '').strip(), int(is_active)))
        conn.commit()
        schedule_cloud_sync()
        return {"id": cur.lastrowid, "success": True, "nombre": nombre.strip()}
    finally:
        if close_after:
            conn.close()

def actualizar_zona(zona_id, nombre=None, descripcion=None, is_active=None, conn=None):
    """Actualiza o desactiva una zona comercial."""
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM zonas WHERE id = ?", (zona_id,))
        z = cur.fetchone()
        if not z:
            raise ValueError(f"Zona ID {zona_id} no existe")

        cur.execute("""
            UPDATE zonas
            SET nombre = COALESCE(?, nombre),
                descripcion = COALESCE(?, descripcion),
                is_active = COALESCE(?, is_active)
            WHERE id = ?
        """, (nombre, descripcion, is_active, zona_id))
        conn.commit()
        schedule_cloud_sync()
        return {"id": zona_id, "success": True}
    finally:
        if close_after:
            conn.close()

# ========================================================
# FUNCIONES DE FUERZA DE VENTAS, PEDIDOS Y RESERVA DE STOCK
# ========================================================

def crear_pedido(cliente_id, vendedor_id=None, items=None, condicion_pago='contado', dias_credito=0, notas='', usuario_id=1, fecha_vencimiento=None, horas_vigencia=48, conn=None, auto_commit=True):
    """
    Crea un pedido / preventa con Logica ERP de 'Stock Comprometido':
    - Valida existencia y solvencia de cliente.
    - Asigna vendedor por cliente, usuario o seleccion.
    - Valida disponibilidad = (stock_fisico - stock_comprometido).
    - SUMA las cantidades al stock_comprometido (Reserva Garantizada).
    - Asigna vigencia temporal (fecha_vencimiento, default 48h).
    """
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True
    started_tx = False
    try:
        cur = conn.cursor()
        if not conn.in_transaction:
            cur.execute("BEGIN IMMEDIATE")
            started_tx = True

        # 1. Verificar cliente y territorio
        cur.execute("SELECT id, nombre, cedula, zona_id, vendedor_id FROM clientes WHERE id = ?", (cliente_id,))
        cli = cur.fetchone()
        if not cli:
            raise ValueError(f"Cliente ID {cliente_id} no existe")
        cli_dict = dict(cli)

        # Si no se paso vendedor_id, heredar del cliente o del usuario autenticado
        if not vendedor_id:
            if cli_dict.get("vendedor_id"):
                vendedor_id = cli_dict["vendedor_id"]
            elif usuario_id:
                cur.execute("SELECT id FROM vendedores WHERE usuario_id = ? AND activo = 1", (usuario_id,))
                v_encontrado = cur.fetchone()
                if v_encontrado:
                    vendedor_id = v_encontrado["id"]

        # 2. Configuracion de tasas e IVA
        cur.execute("SELECT tasa_ves, tasa_cop, iva_porcentaje FROM configuracion WHERE id = 1")
        cfg = cur.fetchone()
        tasa_ves = float(cfg["tasa_ves"]) if cfg else 45.0
        tasa_cop = float(cfg["tasa_cop"]) if cfg else 4100.0
        iva_pct = float(cfg["iva_porcentaje"]) if cfg else 16.0

        subtotal = Decimal('0.0')
        iva_total = Decimal('0.0')

        if not items or len(items) == 0:
            raise ValueError("El pedido debe contener al menos un producto o servicio")

        # Verificar si el usuario tiene permiso de facturar en negativo
        cur.execute("""
            SELECT r.facturar_negativo
            FROM usuarios u
            JOIN roles r ON u.rol_id = r.id
            WHERE u.id = ?
        """, (usuario_id,))
        u_perm = cur.fetchone()
        can_neg = u_perm and u_perm["facturar_negativo"] == 1

        items_procesados = []
        for itm in items:
            p_id = itm.get("producto_id") or itm.get("id")
            cant = Decimal(str(itm.get("cantidad", 1)))
            if cant <= Decimal('0.0'):
                raise ValueError("La cantidad de cada item debe ser mayor a 0")

            cur.execute("""
                SELECT id, codigo, nombre, tipo, impuesto_tipo, precio_base, stock,
                       COALESCE(stock_comprometido, 0.0) as stock_comprometido
                FROM productos WHERE id = ?
            """, (p_id,))
            p = cur.fetchone()
            if not p:
                raise ValueError(f"Producto ID {p_id} no existe")

            p_dict = dict(p)

            # Validacion de Disponibilidad = stock_fisico - stock_comprometido
            if p_dict["tipo"] == "producto":
                stk_fis = Decimal(str(p_dict.get("stock") or 0.0))
                stk_comp = Decimal(str(p_dict.get("stock_comprometido") or 0.0))
                disp = stk_fis - stk_comp

                if cant > disp and not can_neg:
                    raise ValueError(
                        f"Disponibilidad insuficiente para '{p_dict['nombre']}' ({p_dict['codigo']}): "
                        f"Solicitado: {cant}, Fisico: {stk_fis}, Reservado: {stk_comp}, Disponible: {disp}"
                    )

            p_prec = itm.get("precio_unitario") or itm.get("precio") or p_dict["precio_base"]
            pu = Decimal(str(p_prec))
            it_sub = (cant * pu).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP)
            it_iva = (it_sub * (Decimal(str(iva_pct)) / Decimal('100.0'))).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP) if p_dict.get("impuesto_tipo") == "gravado" else Decimal('0.0')

            subtotal += it_sub
            iva_total += it_iva
            items_procesados.append({
                "producto_id": p_id,
                "nombre": p_dict["nombre"],
                "tipo": p_dict["tipo"],
                "cantidad": float(cant),
                "precio_unitario": float(pu),
                "subtotal": float(it_sub)
            })

        total_usd = (subtotal + iva_total).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

        # Generar numero correlativo
        cur.execute("SELECT COALESCE(MAX(id), 0) + 1 FROM pedidos")
        next_id = cur.fetchone()[0]
        numero_pedido = f"PED-{next_id:06d}"

        # 3. Calcular vigencia / fecha_vencimiento (default 48 horas)
        if not fecha_vencimiento:
            horas = int(horas_vigencia or 48)
            fecha_vencimiento = (datetime.now() + timedelta(hours=horas)).strftime("%Y-%m-%d %H:%M:%S")

        # 4. Insertar cabecera de pedido
        cur.execute("""
            INSERT INTO pedidos (
                numero_pedido, cliente_id, vendedor_id, usuario_id,
                subtotal, iva_porcentaje, iva_total, total_usd,
                tasa_ves, tasa_cop, condicion_pago, dias_credito,
                estado, notas, fecha_vencimiento
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?, ?)
        """, (
            numero_pedido, cliente_id, vendedor_id, usuario_id,
            float(subtotal), float(iva_pct), float(iva_total), float(total_usd),
            tasa_ves, tasa_cop, condicion_pago, dias_credito, notas, fecha_vencimiento
        ))
        pedido_id = cur.lastrowid

        # 5. Insertar renglones y SUMAR a stock_comprometido (Reserva Activa)
        for it in items_procesados:
            cur.execute("""
                INSERT INTO pedido_items (pedido_id, producto_id, cantidad, cantidad_aprobada, precio_unitario, subtotal)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (pedido_id, it["producto_id"], it["cantidad"], it["cantidad"], it["precio_unitario"], it["subtotal"]))

            if it["tipo"] == "producto":
                cur.execute("""
                    UPDATE productos
                    SET stock_comprometido = COALESCE(stock_comprometido, 0.0) + ?
                    WHERE id = ?
                """, (it["cantidad"], it["producto_id"]))

        # Registro en auditoria
        try:
            cur.execute("""
                INSERT INTO auditoria_seguridad (usuario_id, username, accion, modulo, detalles)
                VALUES (?, (SELECT username FROM usuarios WHERE id = ?), 'CREAR_PEDIDO', 'FUERZA_VENTAS', ?)
            """, (usuario_id, usuario_id, f"Pedido {numero_pedido} registrado por ${float(total_usd):.2f} USD. Reserva de stock comprometido activada (Vence: {fecha_vencimiento})"))
        except Exception:
            pass

        if auto_commit and started_tx and conn.in_transaction:
            conn.commit()
            schedule_cloud_sync()

        return {
            "success": True,
            "pedido_id": pedido_id,
            "numero_pedido": numero_pedido,
            "total_usd": float(total_usd),
            "estado": "PENDIENTE",
            "fecha_vencimiento": fecha_vencimiento,
            "mensaje": f"Pedido {numero_pedido} registrado exitosamente. Stock comprometido reservado por 48 horas."
        }
    except Exception as e:
        if started_tx and conn is not None and conn.in_transaction:
            conn.rollback()
        raise e
    finally:
        if close_after:
            conn.close()


def expirar_pedidos_vencidos(conn=None):
    """
    Rutina automatica ERP: Revisa pedidos PENDIENTES cuya fecha_vencimiento ha expirado.
    Libera el stock_comprometido de vuelta al inventario disponible y marca el pedido como 'VENCIDO'.
    """
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True
    started_tx = False
    try:
        cur = conn.cursor()
        if not conn.in_transaction:
            cur.execute("BEGIN IMMEDIATE")
            started_tx = True

        cur.execute("""
            SELECT id, numero_pedido, fecha_vencimiento
            FROM pedidos
            WHERE estado = 'PENDIENTE' 
              AND fecha_vencimiento IS NOT NULL 
              AND datetime(fecha_vencimiento) <= datetime('now', 'localtime')
        """)
        vencidos = [dict(r) for r in cur.fetchall()]
        expirados_info = []

        for ped in vencidos:
            p_id = ped["id"]
            num_ped = ped["numero_pedido"]

            cur.execute("""
                SELECT pi.producto_id, pi.cantidad, p.tipo, p.nombre
                FROM pedido_items pi
                JOIN productos p ON pi.producto_id = p.id
                WHERE pi.pedido_id = ?
            """, (p_id,))
            items = [dict(r) for r in cur.fetchall()]

            for it in items:
                if it["tipo"] == "producto":
                    cur.execute("""
                        UPDATE productos
                        SET stock_comprometido = MAX(0.0, COALESCE(stock_comprometido, 0.0) - ?)
                        WHERE id = ?
                    """, (float(it["cantidad"]), it["producto_id"]))

            cur.execute("""
                UPDATE pedidos
                SET estado = 'VENCIDO',
                    motivo_rechazo = 'Expiracion automatica por vigencia de reserva (48h cumplidas)',
                    fecha_aprobacion = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (p_id,))

            try:
                cur.execute("""
                    INSERT INTO auditoria_seguridad (usuario_id, username, accion, modulo, detalles)
                    VALUES (1, 'SYSTEM', 'EXPIRAR_PEDIDO', 'FUERZA_VENTAS', ?)
                """, (f"Pedido {num_ped} expirado automaticamente. Stock comprometido liberado al inventario disponible.",))
            except Exception:
                pass

            expirados_info.append({"id": p_id, "numero_pedido": num_ped})

        conn.commit()
        if expirados_info:
            schedule_cloud_sync()
        return expirados_info
    except Exception as e:
        if started_tx and conn is not None and conn.in_transaction:
            conn.rollback()
        raise e
    finally:
        if close_after:
            conn.close()


def obtener_pedidos(filtros=None, conn=None):
    """Consulta la lista de pedidos con informacion enriquecida de cliente, zona y vendedor."""
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True
    try:
        try:
            expirar_pedidos_vencidos(conn)
        except Exception:
            pass

        cur = conn.cursor()
        query = """
        SELECT p.id, p.numero_pedido, p.fecha, p.cliente_id, p.vendedor_id, p.usuario_id,
               p.subtotal, p.iva_porcentaje, p.iva_total, p.total_usd, p.tasa_ves, p.tasa_cop,
               p.condicion_pago, p.dias_credito, p.estado, p.factura_id, p.fecha_aprobacion,
               p.aprobado_por_usuario_id, p.motivo_rechazo, p.notas, p.fecha_vencimiento,
               c.nombre as cliente_nombre, c.cedula as cliente_cedula, c.telefono as cliente_telefono,
               z.nombre as zona_nombre,
               v.nombre as vendedor_nombre, v.codigo as vendedor_codigo,
               u.username as usuario_username,
               f.numero_factura as factura_numero,
               (SELECT COUNT(*) FROM pedido_items WHERE pedido_id = p.id) as items_count
        FROM pedidos p
        JOIN clientes c ON p.cliente_id = c.id
        LEFT JOIN zonas z ON c.zona_id = z.id
        LEFT JOIN vendedores v ON p.vendedor_id = v.id
        LEFT JOIN usuarios u ON p.usuario_id = u.id
        LEFT JOIN facturas f ON p.factura_id = f.id
        WHERE 1=1
        """
        params = []
        if filtros:
            if filtros.get("estado") and filtros["estado"] != "TODOS":
                query += " AND p.estado = ?"
                params.append(filtros["estado"])
            if filtros.get("vendedor_id"):
                query += " AND p.vendedor_id = ?"
                params.append(filtros["vendedor_id"])
            if filtros.get("cliente_id"):
                query += " AND p.cliente_id = ?"
                params.append(filtros["cliente_id"])
            if filtros.get("zona_id"):
                query += " AND c.zona_id = ?"
                params.append(filtros["zona_id"])

        query += " ORDER BY p.id DESC"
        cur.execute(query, params)
        return [dict(r) for r in cur.fetchall()]
    finally:
        if close_after:
            conn.close()


def obtener_pedido_detalle(pedido_id, conn=None):
    """Obtiene el detalle completo de un pedido con disponibilidad de stock e inputs de aprobacion."""
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT p.id, p.numero_pedido, p.fecha, p.cliente_id, p.vendedor_id, p.usuario_id,
                   p.subtotal, p.iva_porcentaje, p.iva_total, p.total_usd, p.tasa_ves, p.tasa_cop,
                   p.condicion_pago, p.dias_credito, p.estado, p.factura_id, p.fecha_aprobacion,
                   p.aprobado_por_usuario_id, p.motivo_rechazo, p.notas, p.fecha_vencimiento,
                   c.nombre as cliente_nombre, c.cedula as cliente_cedula, c.telefono as cliente_telefono, c.direccion as cliente_direccion,
                   c.zona_id, z.nombre as zona_nombre,
                   v.nombre as vendedor_nombre, v.codigo as vendedor_codigo,
                   u.username as usuario_username,
                   f.numero_factura as factura_numero
            FROM pedidos p
            JOIN clientes c ON p.cliente_id = c.id
            LEFT JOIN zonas z ON c.zona_id = z.id
            LEFT JOIN vendedores v ON p.vendedor_id = v.id
            LEFT JOIN usuarios u ON p.usuario_id = u.id
            LEFT JOIN facturas f ON p.factura_id = f.id
            WHERE p.id = ?
        """, (pedido_id,))
        ped = cur.fetchone()
        if not ped:
            return None

        pedido_dict = dict(ped)

        cur.execute("""
            SELECT pi.id, pi.producto_id, pi.cantidad, COALESCE(pi.cantidad_aprobada, pi.cantidad) as cantidad_aprobada,
                   pi.precio_unitario, pi.subtotal,
                   pr.codigo as producto_codigo, pr.nombre as producto_nombre, pr.tipo as producto_tipo,
                   pr.stock as stock_fisico, COALESCE(pr.stock_comprometido, 0.0) as stock_comprometido,
                   MAX(0.0, pr.stock - COALESCE(pr.stock_comprometido, 0.0)) as stock_disponible,
                   pr.impuesto_tipo
            FROM pedido_items pi
            JOIN productos pr ON pi.producto_id = pr.id
            WHERE pi.pedido_id = ?
            ORDER BY pi.id ASC
        """, (pedido_id,))
        pedido_dict["items"] = [dict(r) for r in cur.fetchall()]

        return pedido_dict
    finally:
        if close_after:
            conn.close()


def aprobar_y_facturar_pedido(pedido_id, usuario_aprobador_id=1, metodo_pago_contado='Efectivo USD', notas_adicionales='', items_aprobados=None, conn=None, auto_commit=True):
    """
    Autoriza un pedido y lo convierte en Factura real con soporte para APROBACION PARCIAL (Backorders):
    - Permite al Administrador editar cantidades (ej. aprobar 8 de 10).
    - Libera el 100% de la reserva original de stock_comprometido.
    - Descuenta del stock fisico unicamente lo aprobado.
    - Genera factura con los montos recalculados y asienta en Kardex inmutable.
    """
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True
    started_tx = False
    try:
        cur = conn.cursor()
        if not conn.in_transaction:
            cur.execute("BEGIN IMMEDIATE")
            started_tx = True

        cur.execute("SELECT * FROM pedidos WHERE id = ?", (pedido_id,))
        ped = cur.fetchone()
        if not ped:
            raise ValueError(f"Pedido ID {pedido_id} no encontrado")

        ped_dict = dict(ped)
        if ped_dict["estado"] != "PENDIENTE":
            raise ValueError(f"El pedido no esta pendiente de aprobacion (Estado actual: '{ped_dict['estado']}')")

        # Verificar vigencia
        if ped_dict.get("fecha_vencimiento"):
            try:
                f_venc = datetime.strptime(ped_dict["fecha_vencimiento"], "%Y-%m-%d %H:%M:%S")
                if f_venc < datetime.now():
                    raise ValueError(f"El pedido {ped_dict['numero_pedido']} ha vencido ({ped_dict['fecha_vencimiento']}). Su reserva de stock ha expirado.")
            except ValueError as ve:
                if "ha vencido" in str(ve): raise ve

        # Verificar permisos del aprobador
        cur.execute("""
            SELECT r.perm_pos, r.perm_ventas, r.facturar_directo, r.facturar_negativo
            FROM usuarios u
            JOIN roles r ON u.rol_id = r.id
            WHERE u.id = ?
        """, (usuario_aprobador_id,))
        aprob_perm = cur.fetchone()
        can_negative = aprob_perm and aprob_perm["facturar_negativo"] == 1

        # Cargar renglones originales
        cur.execute("""
            SELECT pi.*, p.codigo, p.nombre, p.tipo, p.stock, p.costo, p.costo_cpp, p.impuesto_tipo,
                   COALESCE(p.stock_comprometido, 0.0) as stock_comprometido
            FROM pedido_items pi
            JOIN productos p ON pi.producto_id = p.id
            WHERE pi.pedido_id = ?
        """, (pedido_id,))
        items_db = [dict(r) for r in cur.fetchall()]

        # Mapear cantidades aprobadas (Aprobacion Parcial / Backorder)
        aprob_map = {}
        if items_aprobados:
            if isinstance(items_aprobados, list):
                for ia in items_aprobados:
                    pid = ia.get("producto_id") or ia.get("id")
                    if pid is not None:
                        aprob_map[int(pid)] = Decimal(str(ia.get("cantidad", 0)))
            elif isinstance(items_aprobados, dict):
                for k, v in items_aprobados.items():
                    aprob_map[int(k)] = Decimal(str(v))

        # Procesar renglones y calcular nuevos totales
        iva_pct_dec = Decimal(str(ped_dict.get("iva_porcentaje") or 16.0))
        subtotal_aprob = Decimal('0.0')
        iva_total_aprob = Decimal('0.0')
        items_finales = []
        hubo_aprobacion_parcial = False

        for it in items_db:
            pid = int(it["producto_id"])
            cant_orig = Decimal(str(it["cantidad"]))
            pu = Decimal(str(it["precio_unitario"]))

            if pid in aprob_map:
                cant_aprob = max(Decimal('0.0'), min(aprob_map[pid], cant_orig))
            else:
                cant_aprob = cant_orig

            if cant_aprob < cant_orig:
                hubo_aprobacion_parcial = True

            # Validar stock fisico para la cantidad aprobada
            if it["tipo"] == "producto" and cant_aprob > Decimal('0.0'):
                stk_fis = Decimal(str(it["stock"] or 0.0))
                if cant_aprob > stk_fis and not can_negative:
                    raise ValueError(f"Stock fisico insuficiente para '{it['nombre']}' (Aprobar: {cant_aprob}, Disponible: {stk_fis})")

            it_sub = (cant_aprob * pu).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP)
            it_iva = (it_sub * (iva_pct_dec / Decimal('100.0'))).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP) if it.get("impuesto_tipo") == "gravado" else Decimal('0.0')

            subtotal_aprob += it_sub
            iva_total_aprob += it_iva

            items_finales.append({
                "item_id": it["id"],
                "producto_id": pid,
                "nombre": it["nombre"],
                "tipo": it["tipo"],
                "impuesto_tipo": it.get("impuesto_tipo", "exento"),
                "cant_original": cant_orig,
                "cant_aprobada": cant_aprob,
                "pu": pu,
                "subtotal": it_sub,
                "iva": it_iva,
                "total": it_sub + it_iva,
                "stock": it["stock"],
                "costo": it.get("costo") or 0.0,
                "costo_cpp": it.get("costo_cpp") or it.get("costo") or 0.0
            })

        if not any(it["cant_aprobada"] > Decimal('0.0') for it in items_finales):
            raise ValueError("Debe aprobar una cantidad mayor a cero en al menos un renglón para facturar el pedido.")

        total_usd_aprob = (subtotal_aprob + iva_total_aprob).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

        # Generar numero correlativo de factura
        cur.execute("SELECT COALESCE(MAX(id), 0) + 1 FROM facturas")
        correlativo = cur.fetchone()[0]
        numero_factura = f"FAC-{correlativo:06d}"

        subtotal = float(subtotal_aprob)
        iva_total = float(iva_total_aprob)
        total_usd = float(total_usd_aprob)
        tasa_ves = float(ped_dict["tasa_ves"])
        tasa_cop = float(ped_dict["tasa_cop"])
        total_ves = round(total_usd * tasa_ves, 2)
        total_cop = round(total_usd * tasa_cop, 2)
        tipo_venta = ped_dict["condicion_pago"] or "contado"
        dias_cred = int(ped_dict["dias_credito"] or 15)

        fecha_factura = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        fecha_venc = (datetime.now() + timedelta(days=dias_cred)).strftime("%Y-%m-%d") if tipo_venta == "credito" else None
        saldo_pendiente = total_usd if tipo_venta == "credito" else 0.0
        estado_factura = "pendiente" if tipo_venta == "credito" else "pagada"

        # Calculo de comisiones del vendedor sobre lo efectivamente aprobado
        vendedor_id = ped_dict.get("vendedor_id")
        comision_pct = 0.0
        comision_monto_usd = 0.0
        comision_estado = "PENDIENTE"
        if vendedor_id:
            cur.execute("SELECT id, porcentaje_comision_base FROM vendedores WHERE id = ? AND activo = 1", (vendedor_id,))
            v_row = cur.fetchone()
            if v_row:
                comision_pct = float(v_row["porcentaje_comision_base"] or 0.0)
                comision_monto_usd = round(subtotal * (comision_pct / 100.0), 2)
                comision_estado = "DEVENGADA" if tipo_venta == "contado" else "PENDIENTE"

        notas_fac = f"Facturado desde Pedido {ped_dict['numero_pedido']}."
        if hubo_aprobacion_parcial:
            notas_fac += " [Aprobacion Parcial / Backorder procesado]."
        if notas_adicionales:
            notas_fac += f" {notas_adicionales}"

        # 1. Insertar Factura
        cur.execute("""
            INSERT INTO facturas (
                numero_factura, cliente_id, subtotal, iva_total, total_usd, total,
                tasa_ves, tasa_cop, total_ves, total_cop, estado, tipo_venta,
                fecha_vencimiento, saldo_pendiente, notas, fecha,
                vendedor_id, comision_porcentaje, comision_monto_usd, comision_estado, usuario_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            numero_factura, ped_dict["cliente_id"], subtotal, iva_total, total_usd, total_usd,
            tasa_ves, tasa_cop, total_ves, total_cop, estado_factura, tipo_venta,
            fecha_venc, saldo_pendiente, notas_fac, fecha_factura,
            vendedor_id, comision_pct, comision_monto_usd, comision_estado, usuario_aprobador_id
        ))
        factura_id = cur.lastrowid

        # 2. Insertar Detalles, Liberar Stock Comprometido, Descontar Stock Fisico y Kardex
        for it in items_finales:
            p_id = it["producto_id"]
            cant_orig = it["cant_original"]
            cant_aprob = it["cant_aprobada"]
            pu = float(it["pu"])
            it_sub = float(it["subtotal"])
            iva_u = round(pu * (float(ped_dict.get("iva_porcentaje") or 16.0) / 100.0), 4) if it.get("impuesto_tipo") == "gravado" else 0.0
            it_tot = float(it["total"])

            costo_u = it.get("costo_cpp") or it.get("costo") or 0.0
            costo_tot = round(float(costo_u) * float(cant_aprob), 4) if costo_u else None

            # Actualizar en pedido_items la cantidad aprobada
            cur.execute("""
                UPDATE pedido_items
                SET cantidad_aprobada = ?
                WHERE id = ?
            """, (float(cant_aprob), it["item_id"]))

            # Liberar reserva de stock comprometido original
            if it["tipo"] == "producto":
                cur.execute("""
                    UPDATE productos
                    SET stock_comprometido = MAX(0.0, COALESCE(stock_comprometido, 0.0) - ?)
                    WHERE id = ?
                """, (float(cant_orig), p_id))

            # Si se aprobo cantidad > 0, registrar en factura y descontar stock fisico
            if cant_aprob > Decimal('0.0'):
                cur.execute("""
                    INSERT INTO factura_detalles (
                        factura_id, producto_id, nombre_producto, tipo, impuesto_tipo,
                        cantidad, precio_unitario, iva_unitario, subtotal, total,
                        costo_unitario, costo_total
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    factura_id, p_id, it["nombre"], it.get("tipo", "producto"), it.get("impuesto_tipo", "exento"),
                    float(cant_aprob), pu, iva_u, it_sub, it_tot,
                    float(costo_u) if costo_u is not None else 0.0,
                    float(costo_tot) if costo_tot is not None else 0.0
                ))
                factura_detalle_id = cur.lastrowid

                if it["tipo"] == "producto":
                    stock_ant = float(it["stock"] or 0.0)
                    stock_nuevo = round(stock_ant - float(cant_aprob), 4)
                    # Descuento fisico
                    cur.execute("UPDATE productos SET stock = stock - ? WHERE id = ?", (float(cant_aprob), p_id))
                    # Asiento en Kardex inmutable
                    registrar_movimiento_inventario(
                        cursor=cur,
                        producto_id=p_id,
                        fecha=fecha_factura,
                        tipo_movimiento="venta",
                        sentido="SALIDA",
                        cantidad=float(cant_aprob),
                        costo_unitario=float(costo_u),
                        costo_total=costo_tot,
                        stock_anterior=stock_ant,
                        stock_nuevo=stock_nuevo,
                        documento_tipo="factura",
                        documento_id=factura_id,
                        documento_numero=numero_factura,
                        motivo=f"Venta aprobada de Pedido {ped_dict['numero_pedido']}" + (f" (Aprobacion parcial {float(cant_aprob)}/{float(cant_orig)})" if cant_aprob < cant_orig else ""),
                        usuario_id=usuario_aprobador_id,
                        documento_linea_id=factura_detalle_id
                    )

        # 3. Flujo Contable y Tesoreria alineado al motor oficial
        if tipo_venta == "contado":
            cur.execute("""
                INSERT INTO factura_pagos (factura_id, moneda, metodo, monto_moneda, tasa_cambio, equivalente_usd, referencia)
                VALUES (?, 'USD', ?, ?, 1.0, ?, ?)
            """, (factura_id, metodo_pago_contado, total_usd, total_usd, f"Pago de contado Pedido {ped_dict['numero_pedido']}"))

            # Asentar ingreso en movimientos_caja amarrado al turno activo
            cur.execute("SELECT id FROM turnos_caja WHERE estado = 'ABIERTO' ORDER BY id DESC LIMIT 1")
            t_open = cur.fetchone()
            if t_open:
                cur.execute("""
                    INSERT INTO movimientos_caja (turno_id, tipo, concepto, metodo_pago, moneda, monto, referencia, factura_id_ref, created_at)
                    VALUES (?, 'INGRESO', ?, ?, 'USD', ?, ?, ?, CURRENT_TIMESTAMP)
                """, (
                    t_open["id"],
                    f"Cobro Factura #{numero_factura} (Pedido {ped_dict['numero_pedido']})",
                    metodo_pago_contado,
                    total_usd,
                    f"PED-{pedido_id}",
                    factura_id
                ))
        else:
            cur.execute("""
                INSERT INTO cuentas_por_cobrar (
                    factura_id, cliente_id, monto_total, monto_pagado, saldo_pendiente,
                    fecha_emision, fecha_vencimiento, estado, notas
                ) VALUES (?, ?, ?, 0.0, ?, ?, ?, 'pendiente', ?)
            """, (factura_id, ped_dict["cliente_id"], total_usd, total_usd, fecha_factura, fecha_venc, f"Credito desde Pedido {ped_dict['numero_pedido']}"))

        # 4. Actualizar Estado del Pedido
        cur.execute("""
            UPDATE pedidos
            SET estado = 'FACTURADO', factura_id = ?, fecha_aprobacion = CURRENT_TIMESTAMP, aprobado_por_usuario_id = ?
            WHERE id = ?
        """, (factura_id, usuario_aprobador_id, pedido_id))

        # 5. Registro de Auditoria
        try:
            cur.execute("""
                INSERT INTO auditoria_seguridad (usuario_id, username, accion, modulo, detalles)
                VALUES (?, (SELECT username FROM usuarios WHERE id = ?), 'APROBAR_Y_FACTURAR_PEDIDO', 'FUERZA_VENTAS', ?)
            """, (usuario_aprobador_id, usuario_aprobador_id, f"Pedido {ped_dict['numero_pedido']} facturado con {numero_factura} por ${total_usd:.2f} USD (Reserva liberada)"))
        except Exception:
            pass

        if auto_commit and started_tx and conn.in_transaction:
            conn.commit()
            schedule_cloud_sync()

        return {
            "success": True,
            "pedido_id": pedido_id,
            "factura_id": factura_id,
            "numero_factura": numero_factura,
            "total_usd": total_usd,
            "tipo_venta": tipo_venta,
            "comision_monto_usd": comision_monto_usd,
            "comision_estado": comision_estado,
            "hubo_aprobacion_parcial": hubo_aprobacion_parcial,
            "mensaje": f"Pedido {ped_dict['numero_pedido']} aprobado y facturado exitosamente como {numero_factura}."
        }
    except Exception as e:
        if started_tx and conn is not None and conn.in_transaction:
            conn.rollback()
        raise e
    finally:
        if close_after:
            conn.close()


def rechazar_pedido(pedido_id, usuario_id=1, motivo='', conn=None, auto_commit=True):
    """
    Rechaza un pedido pendiente de aprobacion y LIBERA el stock_comprometido de vuelta a disponibilidad.
    """
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True
    started_tx = False
    try:
        cur = conn.cursor()
        if not conn.in_transaction:
            cur.execute("BEGIN IMMEDIATE")
            started_tx = True

        cur.execute("SELECT id, numero_pedido, estado FROM pedidos WHERE id = ?", (pedido_id,))
        ped = cur.fetchone()
        if not ped:
            raise ValueError(f"Pedido ID {pedido_id} no encontrado")

        if ped["estado"] == "FACTURADO":
            raise ValueError("No se puede rechazar un pedido que ya ha sido facturado")
        if ped["estado"] != "PENDIENTE":
            raise ValueError(f"Solo se pueden rechazar pedidos pendientes (Estado actual: '{ped['estado']}')")

        # Liberar stock comprometido
        cur.execute("""
            SELECT pi.producto_id, pi.cantidad, p.tipo
            FROM pedido_items pi
            JOIN productos p ON pi.producto_id = p.id
            WHERE pi.pedido_id = ?
        """, (pedido_id,))
        items = [dict(r) for r in cur.fetchall()]

        for it in items:
            if it["tipo"] == "producto":
                cur.execute("""
                    UPDATE productos
                    SET stock_comprometido = MAX(0.0, COALESCE(stock_comprometido, 0.0) - ?)
                    WHERE id = ?
                """, (float(it["cantidad"]), it["producto_id"]))

        cur.execute("""
            UPDATE pedidos
            SET estado = 'RECHAZADO', motivo_rechazo = ?, fecha_aprobacion = CURRENT_TIMESTAMP, aprobado_por_usuario_id = ?
            WHERE id = ?
        """, (motivo or 'Rechazado por Administracion', usuario_id, pedido_id))

        try:
            cur.execute("""
                INSERT INTO auditoria_seguridad (usuario_id, username, accion, modulo, detalles)
                VALUES (?, (SELECT username FROM usuarios WHERE id = ?), 'RECHAZAR_PEDIDO', 'FUERZA_VENTAS', ?)
            """, (usuario_id, usuario_id, f"Pedido {ped['numero_pedido']} rechazado. Stock comprometido liberado. Motivo: {motivo}"))
        except Exception:
            pass

        if auto_commit and started_tx and conn.in_transaction:
            conn.commit()
            schedule_cloud_sync()

        return {
            "success": True,
            "pedido_id": pedido_id,
            "mensaje": f"Pedido {ped['numero_pedido']} rechazado y mercancia liberada."
        }
    except Exception as e:
        if started_tx and conn is not None and conn.in_transaction:
            conn.rollback()
        raise e
    finally:
        if close_after:
            conn.close()
if __name__ == "__main__":
    init_db()
    print("Base de datos inicializada correctamente.")


# ==============================================================================
# MOTOR DE FORMATOS PARAMETRIZADOS POR TENANT (FASE 3C)
# ==============================================================================
def obtener_config_impresion(tenant_id=1, conn=None):
    """
    Retorna la configuración de formatos de impresión para un tenant.
    Si no existe registro, crea uno con los valores por defecto.
    """
    should_close = False
    if conn is None:
        conn = get_connection()
        should_close = True
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM tenant_config_impresion WHERE tenant_id = ?", (tenant_id,))
        row = cursor.fetchone()
        if not row:
            cursor.execute("""
                INSERT INTO tenant_config_impresion (
                    tenant_id, color_primario, mostrar_sku, mostrar_vendedor, mostrar_descuento_linea,
                    logo_alineacion, texto_footer_factura, texto_header_ticket, texto_footer_ticket
                ) VALUES (
                    ?, '#0f172a', 1, 1, 1, 'centro',
                    'Gracias por su compra. Conserve esta factura como comprobante de garantía.',
                    '*** COMPROBANTE DE COMPRA ***',
                    '*** GRACIAS POR SU PREFERENCIA ***'
                )
            """, (tenant_id,))
            conn.commit()
            cursor.execute("SELECT * FROM tenant_config_impresion WHERE tenant_id = ?", (tenant_id,))
            row = cursor.fetchone()
        res = dict(row)
        res["mostrar_sku"] = bool(res.get("mostrar_sku", 1))
        res["mostrar_vendedor"] = bool(res.get("mostrar_vendedor", 1))
        res["mostrar_descuento_linea"] = bool(res.get("mostrar_descuento_linea", 1))
        return res
    finally:
        if should_close:
            conn.close()

def guardar_config_impresion(datos, tenant_id=1, conn=None):
    """
    Actualiza la configuración de formatos de impresión de un tenant.
    """
    should_close = False
    if conn is None:
        conn = get_connection()
        should_close = True
    try:
        cursor = conn.cursor()
        color_primario = (datos.get("color_primario") or "#0f172a").strip()
        mostrar_sku = 1 if datos.get("mostrar_sku", True) else 0
        mostrar_vendedor = 1 if datos.get("mostrar_vendedor", True) else 0
        mostrar_descuento_linea = 1 if datos.get("mostrar_descuento_linea", True) else 0
        logo_alineacion = (datos.get("logo_alineacion") or "centro").strip().lower()
        if logo_alineacion not in ("izquierda", "centro", "derecha"):
            logo_alineacion = "centro"
        texto_footer_factura = datos.get("texto_footer_factura", "Gracias por su compra. Conserve esta factura como comprobante de garantía.")
        texto_header_ticket = datos.get("texto_header_ticket", "*** COMPROBANTE DE COMPRA ***")
        texto_footer_ticket = datos.get("texto_footer_ticket", "*** GRACIAS POR SU PREFERENCIA ***")

        cursor.execute("SELECT id FROM tenant_config_impresion WHERE tenant_id = ?", (tenant_id,))
        existe = cursor.fetchone()
        if existe:
            cursor.execute("""
                UPDATE tenant_config_impresion
                SET color_primario = ?,
                    mostrar_sku = ?,
                    mostrar_vendedor = ?,
                    mostrar_descuento_linea = ?,
                    logo_alineacion = ?,
                    texto_footer_factura = ?,
                    texto_header_ticket = ?,
                    texto_footer_ticket = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE tenant_id = ?
            """, (
                color_primario, mostrar_sku, mostrar_vendedor, mostrar_descuento_linea,
                logo_alineacion, texto_footer_factura, texto_header_ticket, texto_footer_ticket,
                tenant_id
            ))
        else:
            cursor.execute("""
                INSERT INTO tenant_config_impresion (
                    tenant_id, color_primario, mostrar_sku, mostrar_vendedor, mostrar_descuento_linea,
                    logo_alineacion, texto_footer_factura, texto_header_ticket, texto_footer_ticket
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                tenant_id, color_primario, mostrar_sku, mostrar_vendedor, mostrar_descuento_linea,
                logo_alineacion, texto_footer_factura, texto_header_ticket, texto_footer_ticket
            ))
        conn.commit()
        return obtener_config_impresion(tenant_id=tenant_id, conn=conn)
    finally:
        if should_close:
            conn.close()


# ==============================================================================
# MÓDULO DE CONTROL DE CAJA (APERTURA, ARQUEO, MOVIMIENTOS Y CIERRE Z)
# Estándar ERP con Principio de Cierre Ciego y Multimoneda (USD, VES, COP)
# ==============================================================================

def normalizar_metodo_moneda_caja(metodo, moneda):
    metodo = (metodo or '').strip().lower()
    moneda = (moneda or 'USD').strip().upper()

    if moneda == 'USD':
        if 'zelle' in metodo:
            return 'zelle_usd'
        elif 'transfer' in metodo or 'banco' in metodo:
            return 'transferencia_usd'
        elif 'efectivo' in metodo or 'dolar' in metodo or 'dólar' in metodo or 'cash' in metodo:
            return 'efectivo_usd'
        else:
            return 'otros_usd'
    elif moneda == 'VES':
        if 'movil' in metodo or 'móvil' in metodo:
            return 'pago_movil_ves'
        elif 'punto' in metodo or 'debito' in metodo or 'débito' in metodo or 'tarjeta' in metodo or 'pos' in metodo:
            return 'punto_venta_ves'
        elif 'transfer' in metodo or 'banco' in metodo:
            return 'transferencia_ves'
        elif 'efectivo' in metodo or 'bolivar' in metodo or 'bolívar' in metodo or 'cash' in metodo:
            return 'efectivo_ves'
        else:
            return 'otros_ves'
    elif moneda == 'COP':
        if 'transfer' in metodo or 'banco' in metodo:
            return 'transferencia_cop'
        elif 'efectivo' in metodo or 'peso' in metodo or 'cash' in metodo:
            return 'efectivo_cop'
        else:
            return 'otros_cop'
    else:
        return 'otros'


def obtener_cajas(tenant_id=1, conn=None):
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM cajas WHERE tenant_id = ? AND is_active = 1 ORDER BY id ASC", (tenant_id,))
        return [dict(r) for r in cur.fetchall()]
    finally:
        if close_after:
            conn.close()


def obtener_turno_activo(usuario_id=None, caja_id=None, conn=None):
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True
    try:
        cur = conn.cursor()
        query = """
            SELECT t.*, c.nombre as caja_nombre, u.username, u.nombre_completo as usuario_nombre
            FROM turnos_caja t
            LEFT JOIN cajas c ON t.caja_id = c.id
            LEFT JOIN usuarios u ON t.usuario_id = u.id
            WHERE t.estado = 'ABIERTO'
        """
        params = []
        if usuario_id is not None and caja_id is not None:
            query += " AND t.caja_id = ? AND (t.usuario_id = ? OR t.usuario_id = 1)"
            params.extend([caja_id, usuario_id])
        elif usuario_id is not None:
            query += " AND (t.usuario_id = ? OR t.usuario_id = 1)"
            params.append(usuario_id)
        elif caja_id is not None:
            query += " AND t.caja_id = ?"
            params.append(caja_id)

        query += " ORDER BY t.id DESC LIMIT 1"
        cur.execute(query, params)
        row = cur.fetchone()
        if not row:
            # Si no encontró por usuario específico, buscar cualquier turno ABIERTO general en la caja principal
            cur.execute("""
                SELECT t.*, c.nombre as caja_nombre, u.username, u.nombre_completo as usuario_nombre
                FROM turnos_caja t
                LEFT JOIN cajas c ON t.caja_id = c.id
                LEFT JOIN usuarios u ON t.usuario_id = u.id
                WHERE t.estado = 'ABIERTO'
                ORDER BY t.id DESC LIMIT 1
            """)
            row = cur.fetchone()

        if row:
            if isinstance(row, sqlite3.Row):
                d = dict(row)
            else:
                cols = [c[0] for c in cur.description]
                d = dict(zip(cols, row))
            # Contar movimientos actuales
            cur.execute("""
                SELECT 
                    COUNT(*) as total_movs,
                    COALESCE(SUM(CASE WHEN tipo = 'INGRESO' AND moneda = 'USD' THEN monto ELSE 0 END), 0.0) as ing_usd,
                    COALESCE(SUM(CASE WHEN tipo = 'INGRESO' AND moneda = 'VES' THEN monto ELSE 0 END), 0.0) as ing_ves,
                    COALESCE(SUM(CASE WHEN tipo = 'INGRESO' AND moneda = 'COP' THEN monto ELSE 0 END), 0.0) as ing_cop,
                    COALESCE(SUM(CASE WHEN tipo = 'EGRESO' AND moneda = 'USD' THEN monto ELSE 0 END), 0.0) as egr_usd,
                    COALESCE(SUM(CASE WHEN tipo = 'EGRESO' AND moneda = 'VES' THEN monto ELSE 0 END), 0.0) as egr_ves,
                    COALESCE(SUM(CASE WHEN tipo = 'EGRESO' AND moneda = 'COP' THEN monto ELSE 0 END), 0.0) as egr_cop
                FROM movimientos_caja
                WHERE turno_id = ?
            """, (d["id"],))
            s = dict(cur.fetchone())
            d["total_movimientos"] = s["total_movs"]
            d["total_ingresos_usd"] = round(s["ing_usd"], 2)
            d["total_ingresos_ves"] = round(s["ing_ves"], 2)
            d["total_ingresos_cop"] = round(s["ing_cop"], 2)
            d["total_egresos_usd"] = round(s["egr_usd"], 2)
            d["total_egresos_ves"] = round(s["egr_ves"], 2)
            d["total_egresos_cop"] = round(s["egr_cop"], 2)
            return d
        return None
    finally:
        if close_after:
            conn.close()


def abrir_turno_caja(datos, usuario_id=1, conn=None, auto_commit=True):
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True
    started_tx = False
    try:
        cur = conn.cursor()
        if not conn.in_transaction:
            cur.execute("BEGIN IMMEDIATE")
            started_tx = True
        caja_id = int(datos.get("caja_id", 1) or 1)
        fondo_inicial_usd = float(datos.get("fondo_inicial_usd", 0.0) or 0.0)
        fondo_inicial_ves = float(datos.get("fondo_inicial_ves", 0.0) or 0.0)
        notas = (datos.get("notas") or "").strip()

        # Verificar si ya existe un turno abierto para esta caja
        cur.execute("SELECT id FROM turnos_caja WHERE caja_id = ? AND estado = 'ABIERTO'", (caja_id,))
        existente = cur.fetchone()
        if existente:
            ext_id = existente["id"] if isinstance(existente, sqlite3.Row) else existente[0]
            raise ValueError(f"Ya existe un turno de caja abierto (Turno #{ext_id}) para esta caja.")

        cur.execute("""
            INSERT INTO turnos_caja (
                tenant_id, caja_id, usuario_id, fondo_inicial_usd, fondo_inicial_ves,
                estado, notas, fecha_apertura
            ) VALUES (?, ?, ?, ?, ?, 'ABIERTO', ?, CURRENT_TIMESTAMP)
        """, (1, caja_id, usuario_id, fondo_inicial_usd, fondo_inicial_ves, notas))
        turno_id = cur.lastrowid

        # Si hay fondos iniciales, registrarlos como movimientos de apertura
        if fondo_inicial_usd > 0:
            cur.execute("""
                INSERT INTO movimientos_caja (turno_id, tipo, concepto, metodo_pago, moneda, monto, referencia)
                VALUES (?, 'INGRESO', 'Fondo Inicial de Caja USD', 'Efectivo USD', 'USD', ?, 'APERTURA')
            """, (turno_id, fondo_inicial_usd))

        if fondo_inicial_ves > 0:
            cur.execute("""
                INSERT INTO movimientos_caja (turno_id, tipo, concepto, metodo_pago, moneda, monto, referencia)
                VALUES (?, 'INGRESO', 'Fondo Inicial de Caja VES', 'Efectivo VES', 'VES', ?, 'APERTURA')
            """, (turno_id, fondo_inicial_ves))

        # Auditoría
        try:
            cur.execute("""
                INSERT INTO auditoria_seguridad (usuario_id, username, accion, modulo, detalles)
                VALUES (?, (SELECT username FROM usuarios WHERE id = ?), 'APERTURA_CAJA', 'TESORERIA', ?)
            """, (usuario_id, usuario_id, f"Apertura de turno #{turno_id} en Caja #{caja_id}. Fondo USD: ${fondo_inicial_usd:.2f}, VES: Bs.{fondo_inicial_ves:.2f}"))
        except Exception:
            pass

        if auto_commit and started_tx and conn.in_transaction:
            conn.commit()
            schedule_cloud_sync()
        return obtener_turno_activo(usuario_id=usuario_id, caja_id=caja_id, conn=conn)
    except Exception as e:
        if started_tx and conn is not None and conn.in_transaction:
            conn.rollback()
        raise e
    finally:
        if close_after:
            conn.close()


def registrar_movimiento_caja(datos, usuario_id=1, conn=None, auto_commit=True):
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True
    started_tx = False
    try:
        cur = conn.cursor()
        if not conn.in_transaction:
            cur.execute("BEGIN IMMEDIATE")
            started_tx = True
        turno_id = datos.get("turno_id")
        if not turno_id:
            turno_act = obtener_turno_activo(usuario_id=usuario_id, conn=conn)
            if not turno_act:
                raise ValueError("No hay un turno de caja abierto para registrar el movimiento.")
            turno_id = turno_act["id"]
        else:
            turno_id = int(turno_id)
            cur.execute("SELECT id, estado FROM turnos_caja WHERE id = ?", (turno_id,))
            t_row = cur.fetchone()
            if not t_row:
                raise ValueError(f"Turno de caja #{turno_id} no encontrado.")
            if t_row["estado"] != "ABIERTO":
                raise ValueError(f"El turno de caja #{turno_id} no está abierto.")

        tipo = (datos.get("tipo") or "EGRESO").strip().upper()
        if tipo not in ("INGRESO", "EGRESO"):
            raise ValueError(f"Tipo de movimiento inválido: '{tipo}'. Debe ser 'INGRESO' o 'EGRESO'.")

        concepto = (datos.get("concepto") or "").strip()
        if not concepto:
            raise ValueError("El concepto o descripción del movimiento es obligatorio.")

        metodo_pago = (datos.get("metodo_pago") or "Efectivo").strip()
        moneda = (datos.get("moneda") or "USD").strip().upper()
        if moneda not in ("USD", "VES", "COP"):
            raise ValueError(f"Moneda inválida: '{moneda}'. Solo se admite 'USD', 'VES' o 'COP'.")

        monto = float(datos.get("monto", 0.0) or 0.0)
        if monto <= 0.0:
            raise ValueError("El monto del movimiento debe ser estrictamente mayor a 0.00.")

        referencia = (datos.get("referencia") or "").strip()
        factura_id_ref = datos.get("factura_id_ref")
        if factura_id_ref is not None:
            try:
                factura_id_ref = int(factura_id_ref)
            except Exception:
                factura_id_ref = None

        cur.execute("""
            INSERT INTO movimientos_caja (
                turno_id, tipo, concepto, metodo_pago, moneda, monto, referencia, factura_id_ref, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (turno_id, tipo, concepto, metodo_pago, moneda, monto, referencia, factura_id_ref))
        mov_id = cur.lastrowid

        # Auditoría
        try:
            cur.execute("""
                INSERT INTO auditoria_seguridad (usuario_id, username, accion, modulo, detalles)
                VALUES (?, (SELECT username FROM usuarios WHERE id = ?), 'MOVIMIENTO_CAJA', 'TESORERIA', ?)
            """, (usuario_id, usuario_id, f"{tipo} Turno #{turno_id}: {concepto} por {monto:.2f} {moneda} ({metodo_pago})"))
        except Exception:
            pass

        if auto_commit and started_tx and conn.in_transaction:
            conn.commit()
            schedule_cloud_sync()
        return {
            "success": True,
            "id": mov_id,
            "turno_id": turno_id,
            "tipo": tipo,
            "concepto": concepto,
            "metodo_pago": metodo_pago,
            "moneda": moneda,
            "monto": monto,
            "referencia": referencia,
            "factura_id_ref": factura_id_ref
        }
    except Exception as e:
        if started_tx and conn is not None and conn.in_transaction:
            conn.rollback()
        raise e
    finally:
        if close_after:
            conn.close()


def cerrar_turno_caja_ciego(declarado, usuario_id=1, turno_id=None, notas='', conn=None, auto_commit=True):
    """
    Cierre Ciego de Turno de Caja (Estándar ERP TAVO CLOUD):
    - El cajero ingresa ÚNICAMENTE lo que tiene contado en físico (declarado).
    - El backend calcula de manera hermética e inmutable el saldo esperado teórico.
    - Se genera el JSON de diferencias (EXACTO, SOBRANTE, FALTANTE) por método y por moneda.
    - Se cierra el turno con timestamp UTC/local inmutable.
    """
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True
    started_tx = False
    try:
        cur = conn.cursor()
        if not conn.in_transaction:
            cur.execute("BEGIN IMMEDIATE")
            started_tx = True

        if turno_id is None:
            cur.execute("SELECT * FROM turnos_caja WHERE estado = 'ABIERTO' ORDER BY id DESC LIMIT 1")
            t_row = cur.fetchone()
            if not t_row:
                raise ValueError("No se encontró ningún turno de caja abierto para cerrar.")
            turno_id = t_row["id"]
        else:
            cur.execute("SELECT * FROM turnos_caja WHERE id = ?", (turno_id,))
            t_row = cur.fetchone()
            if not t_row:
                raise ValueError(f"Turno de caja #{turno_id} no encontrado.")
            if t_row["estado"] != "ABIERTO":
                raise ValueError(f"El turno de caja #{turno_id} ya se encuentra cerrado.")

        t_dict = dict(t_row)
        fondo_usd = float(t_dict.get("fondo_inicial_usd", 0.0) or 0.0)
        fondo_ves = float(t_dict.get("fondo_inicial_ves", 0.0) or 0.0)

        # Cargar todos los movimientos del turno (excluyendo registros duplicados de APERTURA si ya están en fondo inicial)
        cur.execute("""
            SELECT * FROM movimientos_caja 
            WHERE turno_id = ? AND COALESCE(referencia, '') != 'APERTURA'
            ORDER BY id ASC
        """, (turno_id,))
        movs = [dict(r) for r in cur.fetchall()]

        # Calcular totales esperados teóricos
        esperados_metodo = {
            'efectivo_usd': fondo_usd,
            'efectivo_ves': fondo_ves,
            'efectivo_cop': 0.0,
            'pago_movil_ves': 0.0,
            'punto_venta_ves': 0.0,
            'zelle_usd': 0.0,
            'transferencia_ves': 0.0,
            'transferencia_usd': 0.0,
            'transferencia_cop': 0.0,
            'otros_usd': 0.0,
            'otros_ves': 0.0,
            'otros_cop': 0.0,
        }

        resumen_ventas = {
            'total_ingresos_usd': 0.0,
            'total_ingresos_ves': 0.0,
            'total_ingresos_cop': 0.0,
            'total_egresos_usd': 0.0,
            'total_egresos_ves': 0.0,
            'total_egresos_cop': 0.0,
            'cantidad_ingresos': 0,
            'cantidad_egresos': 0,
            'cantidad_ventas': 0
        }

        facturas_vistas = set()

        for m in movs:
            norm_key = normalizar_metodo_moneda_caja(m['metodo_pago'], m['moneda'])
            monto = float(m['monto'])
            moneda = m['moneda']
            if norm_key not in esperados_metodo:
                esperados_metodo[norm_key] = 0.0

            if m['tipo'] == 'INGRESO':
                esperados_metodo[norm_key] += monto
                if moneda == 'USD': resumen_ventas['total_ingresos_usd'] += monto
                elif moneda == 'VES': resumen_ventas['total_ingresos_ves'] += monto
                elif moneda == 'COP': resumen_ventas['total_ingresos_cop'] += monto
                resumen_ventas['cantidad_ingresos'] += 1
                if m.get('factura_id_ref') and m['factura_id_ref'] not in facturas_vistas:
                    facturas_vistas.add(m['factura_id_ref'])
                    resumen_ventas['cantidad_ventas'] += 1
            elif m['tipo'] == 'EGRESO':
                esperados_metodo[norm_key] -= monto
                if moneda == 'USD': resumen_ventas['total_egresos_usd'] += monto
                elif moneda == 'VES': resumen_ventas['total_egresos_ves'] += monto
                elif moneda == 'COP': resumen_ventas['total_egresos_cop'] += monto
                resumen_ventas['cantidad_egresos'] += 1

        # Redondear esperados
        for k in esperados_metodo:
            esperados_metodo[k] = round(esperados_metodo[k], 2)

        # Procesar valores declarados por el cajero
        if not isinstance(declarado, dict):
            declarado = {}

        declarados_metodo = {}
        diferencias_metodo = {}

        todas_llaves = set(list(esperados_metodo.keys()) + list(declarado.keys()))
        for k in sorted(todas_llaves):
            esp = round(esperados_metodo.get(k, 0.0), 2)
            # Manejo flexible de llaves declaradas
            dec_raw = declarado.get(k)
            if dec_raw is None:
                # Intentar buscar sin sufijo si aplica
                dec_raw = 0.0
            dec = round(float(dec_raw or 0.0), 2)
            declarados_metodo[k] = dec
            dif = round(dec - esp, 2)
            if dif == 0.0:
                est = 'EXACTO'
            elif dif > 0.0:
                est = 'SOBRANTE'
            else:
                est = 'FALTANTE'

            diferencias_metodo[k] = {
                'esperado': esp,
                'declarado': dec,
                'diferencia': dif,
                'estado': est
            }

        # Consolidado por moneda
        totales_moneda = {
            'USD': {'esperado': 0.0, 'declarado': 0.0, 'diferencia': 0.0, 'estado': 'EXACTO'},
            'VES': {'esperado': 0.0, 'declarado': 0.0, 'diferencia': 0.0, 'estado': 'EXACTO'},
            'COP': {'esperado': 0.0, 'declarado': 0.0, 'diferencia': 0.0, 'estado': 'EXACTO'}
        }

        for k, v in diferencias_metodo.items():
            if k.endswith('_usd'): mon = 'USD'
            elif k.endswith('_ves'): mon = 'VES'
            elif k.endswith('_cop'): mon = 'COP'
            else: continue
            totales_moneda[mon]['esperado'] += v['esperado']
            totales_moneda[mon]['declarado'] += v['declarado']

        for mon in totales_moneda:
            esp = round(totales_moneda[mon]['esperado'], 2)
            dec = round(totales_moneda[mon]['declarado'], 2)
            dif = round(dec - esp, 2)
            totales_moneda[mon]['esperado'] = esp
            totales_moneda[mon]['declarado'] = dec
            totales_moneda[mon]['diferencia'] = dif
            if dif == 0.0: totales_moneda[mon]['estado'] = 'EXACTO'
            elif dif > 0.0: totales_moneda[mon]['estado'] = 'SOBRANTE'
            else: totales_moneda[mon]['estado'] = 'FALTANTE'

        totales_esperados_payload = {
            'por_metodo': esperados_metodo,
            'totales_moneda': {m: totales_moneda[m]['esperado'] for m in totales_moneda},
            'resumen': resumen_ventas,
            'fondo_inicial_usd': fondo_usd,
            'fondo_inicial_ves': fondo_ves
        }

        totales_declarados_payload = {
            'por_metodo': declarados_metodo,
            'totales_moneda': {m: totales_moneda[m]['declarado'] for m in totales_moneda}
        }

        diferencias_payload = {
            'por_metodo': diferencias_metodo,
            'totales_moneda': totales_moneda
        }

        esp_json = json.dumps(totales_esperados_payload, ensure_ascii=False)
        dec_json = json.dumps(totales_declarados_payload, ensure_ascii=False)
        dif_json = json.dumps(diferencias_payload, ensure_ascii=False)

        cur.execute("""
            UPDATE turnos_caja
            SET estado = 'CERRADO',
                fecha_cierre = CURRENT_TIMESTAMP,
                totales_esperados_json = ?,
                totales_declarados_json = ?,
                diferencias_json = ?,
                notas = ?
            WHERE id = ?
        """, (esp_json, dec_json, dif_json, notas, turno_id))

        # Auditoría
        try:
            cur.execute("""
                INSERT INTO auditoria_seguridad (usuario_id, username, accion, modulo, detalles)
                VALUES (?, (SELECT username FROM usuarios WHERE id = ?), 'CIERRE_CAJA_Z', 'TESORERIA', ?)
            """, (usuario_id, usuario_id, f"Cierre Z de turno #{turno_id}. Cuadre USD: {totales_moneda['USD']['estado']} ({totales_moneda['USD']['diferencia']:+.2f}), VES: {totales_moneda['VES']['estado']} ({totales_moneda['VES']['diferencia']:+.2f})"))
        except Exception:
            pass

        if auto_commit and started_tx and conn.in_transaction:
            conn.commit()
            schedule_cloud_sync()
        return obtener_reporte_cierre_z(turno_id=turno_id, conn=conn)
    except Exception as e:
        if started_tx and conn is not None and conn.in_transaction:
            conn.rollback()
        raise e
    finally:
        if close_after:
            conn.close()


def obtener_movimientos_caja(turno_id=None, conn=None):
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True
    try:
        cur = conn.cursor()
        if turno_id is not None:
            cur.execute("""
                SELECT m.*, f.numero_factura, c.nombre as cliente_nombre
                FROM movimientos_caja m
                LEFT JOIN facturas f ON m.factura_id_ref = f.id
                LEFT JOIN clientes c ON f.cliente_id = c.id
                WHERE m.turno_id = ?
                ORDER BY m.id DESC
            """, (turno_id,))
        else:
            cur.execute("""
                SELECT m.*, f.numero_factura, c.nombre as cliente_nombre
                FROM movimientos_caja m
                LEFT JOIN facturas f ON m.factura_id_ref = f.id
                LEFT JOIN clientes c ON f.cliente_id = c.id
                ORDER BY m.id DESC LIMIT 100
            """)
        return [dict(r) for r in cur.fetchall()]
    finally:
        if close_after:
            conn.close()


def obtener_reporte_cierre_z(turno_id, conn=None):
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT t.*, c.nombre as caja_nombre, u.username, u.nombre_completo as usuario_nombre
            FROM turnos_caja t
            LEFT JOIN cajas c ON t.caja_id = c.id
            LEFT JOIN usuarios u ON t.usuario_id = u.id
            WHERE t.id = ?
        """, (turno_id,))
        t_row = cur.fetchone()
        if not t_row:
            raise ValueError(f"Turno de caja #{turno_id} no encontrado")

        turno = dict(t_row)
        esperados = json.loads(turno["totales_esperados_json"] or "{}") if turno.get("totales_esperados_json") else {}
        declarados = json.loads(turno["totales_declarados_json"] or "{}") if turno.get("totales_declarados_json") else {}
        diferencias = json.loads(turno["diferencias_json"] or "{}") if turno.get("diferencias_json") else {}

        # Movimientos del turno
        cur.execute("""
            SELECT m.*, f.numero_factura, c.nombre as cliente_nombre
            FROM movimientos_caja m
            LEFT JOIN facturas f ON m.factura_id_ref = f.id
            LEFT JOIN clientes c ON f.cliente_id = c.id
            WHERE m.turno_id = ?
            ORDER BY m.id ASC
        """, (turno_id,))
        movimientos = [dict(r) for r in cur.fetchall()]

        # Facturas cobradas en el turno
        cur.execute("""
            SELECT DISTINCT f.id, f.numero_factura, f.fecha, f.total_usd, f.tipo_venta, c.nombre as cliente_nombre
            FROM movimientos_caja m
            JOIN facturas f ON m.factura_id_ref = f.id
            LEFT JOIN clientes c ON f.cliente_id = c.id
            WHERE m.turno_id = ? AND m.tipo = 'INGRESO'
            ORDER BY f.id ASC
        """, (turno_id,))
        facturas = [dict(r) for r in cur.fetchall()]

        return {
            "success": True,
            "turno": turno,
            "esperados": esperados,
            "declarados": declarados,
            "diferencias": diferencias,
            "movimientos": movimientos,
            "facturas": facturas,
            "fecha_reporte": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
    finally:
        if close_after:
            conn.close()


def _tabla_tiene_columna(cursor, tabla: str, columna: str) -> bool:
    """Verifica de forma segura si una tabla contiene una columna (ej. tenant_id)."""
    try:
        cols = [r[1] for r in cursor.execute(f"PRAGMA table_info({tabla})").fetchall()]
        return columna in cols
    except Exception:
        return False


def obtener_resumen_dashboard_bi(periodo: str = "mes", tenant_id: int = 1, conn=None):
    """
    Motor BI Real-Time para GET /api/dashboard/resumen?periodo=hoy|semana|mes|anio.
    Calcula KPIs financieros, estado operativo en vivo, serie temporal, distribución de pagos
    y listas accionables exclusivamente desde SQLite sin datos simulados ni divisiones por cero.
    """
    close_after = False
    if conn is None:
        conn = get_connection()
        close_after = True

    try:
        cur = conn.cursor()
        periodo_norm = (periodo or "mes").strip().lower()
        if periodo_norm not in ("hoy", "semana", "mes", "anio"):
            periodo_norm = "mes"

        hoy_dt = datetime.now().date()
        if periodo_norm == "hoy":
            desde_dt = hoy_dt
            hasta_dt = hoy_dt
            prev_desde_dt = hoy_dt - timedelta(days=1)
            prev_hasta_dt = prev_desde_dt
        elif periodo_norm == "semana":
            desde_dt = hoy_dt - timedelta(days=6)
            hasta_dt = hoy_dt
            prev_desde_dt = hoy_dt - timedelta(days=13)
            prev_hasta_dt = hoy_dt - timedelta(days=7)
        elif periodo_norm == "anio":
            desde_dt = hoy_dt.replace(month=1, day=1)
            hasta_dt = hoy_dt
            prev_desde_dt = desde_dt.replace(year=hoy_dt.year - 1, month=1, day=1)
            prev_hasta_dt = desde_dt.replace(year=hoy_dt.year - 1, month=12, day=31)
        else:  # mes
            desde_dt = hoy_dt.replace(day=1)
            hasta_dt = hoy_dt
            prev_hasta_dt = desde_dt - timedelta(days=1)
            prev_desde_dt = prev_hasta_dt.replace(day=1)

        desde_str = desde_dt.isoformat()
        hasta_str = hasta_dt.isoformat()
        prev_desde_str = prev_desde_dt.isoformat()
        prev_hasta_str = prev_hasta_dt.isoformat()

        t_id = int(tenant_id or 1)

        def _t_clause(tabla: str, alias: str = ""):
            if _tabla_tiene_columna(cur, tabla, "tenant_id"):
                pref = f"{alias}." if alias else ""
                return f" AND {pref}tenant_id = ? ", [t_id]
            return "", []

        # Tasas vigentes
        cfg_row = cur.execute("SELECT tasa_ves, tasa_cop FROM configuracion WHERE id = 1").fetchone()
        tasa_ves = float(cfg_row[0]) if cfg_row and cfg_row[0] and float(cfg_row[0]) > 0 else 45.0
        tasa_cop = float(cfg_row[1]) if cfg_row and cfg_row[1] and float(cfg_row[1]) > 0 else 4100.0
        tasa_ves_dec = to_decimal(tasa_ves, "45")
        tasa_cop_dec = to_decimal(tasa_cop, "4100")

        # 1. KPIs Financieros: Ventas actuales y período anterior
        f_ten_sql, f_ten_args = _t_clause("facturas", "f")
        row_v_act = cur.execute(
            f"""
            SELECT COUNT(*), COALESCE(SUM(f.total_usd), 0), COALESCE(SUM(f.subtotal), 0)
            FROM facturas f
            WHERE COALESCE(f.estado, 'pagada') != 'anulada'
              AND substr(COALESCE(f.fecha, ''), 1, 10) BETWEEN ? AND ?
              {f_ten_sql}
            """,
            [desde_str, hasta_str] + f_ten_args,
        ).fetchone()
        facturas_count = int(row_v_act[0] or 0)
        ventas_total_dec = to_decimal(row_v_act[1], "0")
        ventas_subtotal_dec = to_decimal(row_v_act[2], "0")

        row_v_prev = cur.execute(
            f"""
            SELECT COALESCE(SUM(f.total_usd), 0)
            FROM facturas f
            WHERE COALESCE(f.estado, 'pagada') != 'anulada'
              AND substr(COALESCE(f.fecha, ''), 1, 10) BETWEEN ? AND ?
              {f_ten_sql}
            """,
            [prev_desde_str, prev_hasta_str] + f_ten_args,
        ).fetchone()
        ventas_prev_dec = to_decimal(row_v_prev[0], "0")

        if ventas_prev_dec > Decimal("0"):
            var_pct = float(
                (((ventas_total_dec - ventas_prev_dec) / ventas_prev_dec) * Decimal("100")).quantize(
                    Decimal("0.1"), rounding=ROUND_HALF_UP
                )
            )
        elif ventas_total_dec > Decimal("0"):
            var_pct = 100.0
        else:
            var_pct = 0.0

        # Utilidad Bruta real (Ventas sin IVA menos Costo CPP real de factura_detalles)
        row_costo = cur.execute(
            f"""
            SELECT
                COALESCE(SUM(fd.subtotal), 0) as base_ventas,
                COALESCE(SUM(
                    CASE
                        WHEN fd.tipo = 'servicio' THEN 0
                        ELSE COALESCE(fd.costo_total, COALESCE(fd.costo_unitario, p.costo_cpp, p.costo, 0) * COALESCE(fd.cantidad, 0))
                    END
                ), 0) as costo_real
            FROM factura_detalles fd
            JOIN facturas f ON fd.factura_id = f.id
            LEFT JOIN productos p ON fd.producto_id = p.id
            WHERE COALESCE(f.estado, 'pagada') != 'anulada'
              AND substr(COALESCE(f.fecha, ''), 1, 10) BETWEEN ? AND ?
              {f_ten_sql}
            """,
            [desde_str, hasta_str] + f_ten_args,
        ).fetchone()
        base_ventas_dec = to_decimal(row_costo[0], "0")
        if base_ventas_dec <= Decimal("0") and ventas_subtotal_dec > Decimal("0"):
            base_ventas_dec = ventas_subtotal_dec
        costo_real_dec = to_decimal(row_costo[1], "0")
        utilidad_bruta_dec = base_ventas_dec - costo_real_dec
        margen_pct = (
            float(((utilidad_bruta_dec / base_ventas_dec) * Decimal("100")).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))
            if base_ventas_dec > Decimal("0")
            else 0.0
        )

        # CxC & CxP Pendientes actuales
        cxc_ten_sql, cxc_ten_args = _t_clause("cuentas_por_cobrar", "cxc")
        row_cxc = cur.execute(
            f"""
            SELECT COALESCE(SUM(cxc.saldo_pendiente), 0), COUNT(CASE WHEN cxc.saldo_pendiente > 0.001 THEN 1 END)
            FROM cuentas_por_cobrar cxc
            WHERE COALESCE(cxc.estado, 'pendiente') IN ('pendiente', 'parcial')
              {cxc_ten_sql}
            """,
            cxc_ten_args,
        ).fetchone()
        cxc_pendiente_usd = d_round(row_cxc[0], 2)
        cxc_pendientes_count = int(row_cxc[1] or 0)

        cxp_ten_sql, cxp_ten_args = _t_clause("cuentas_por_pagar", "cxp")
        row_cxp = cur.execute(
            f"""
            SELECT COALESCE(SUM(cxp.saldo_pendiente), 0), COUNT(CASE WHEN cxp.saldo_pendiente > 0.001 THEN 1 END)
            FROM cuentas_por_pagar cxp
            WHERE COALESCE(cxp.estado, 'pendiente') IN ('pendiente', 'parcial')
              {cxp_ten_sql}
            """,
            cxp_ten_args,
        ).fetchone()
        cxp_pendiente_usd = d_round(row_cxp[0], 2)
        cxp_pendientes_count = int(row_cxp[1] or 0)

        # 2. Estado Operativo en Vivo: Caja, Pedidos Pendientes y Stock Crítico
        tc_ten_sql, tc_ten_args = _t_clause("turnos_caja", "tc")
        turno_abierto = cur.execute(
            f"""
            SELECT tc.id, tc.fondo_inicial_usd, tc.fondo_inicial_ves, tc.fecha_apertura
            FROM turnos_caja tc
            WHERE tc.estado = 'ABIERTO' {tc_ten_sql}
            ORDER BY tc.id DESC LIMIT 1
            """,
            tc_ten_args,
        ).fetchone()

        caja_estado = "CERRADO"
        caja_turno_id = None
        caja_saldo_usd_dec = Decimal("0")
        caja_saldo_ves_dec = Decimal("0")
        caja_saldo_consolidado_dec = Decimal("0")

        if turno_abierto:
            caja_estado = "ABIERTO"
            caja_turno_id = int(turno_abierto["id"])
            caja_saldo_usd_dec = to_decimal(turno_abierto["fondo_inicial_usd"], "0")
            caja_saldo_ves_dec = to_decimal(turno_abierto["fondo_inicial_ves"], "0")
            caja_cop_dec = Decimal("0")

            movs_turno = cur.execute(
                """
                SELECT tipo, moneda, monto
                FROM movimientos_caja
                WHERE turno_id = ? AND COALESCE(referencia, '') != 'APERTURA'
                """,
                (caja_turno_id,),
            ).fetchall()
            for mv in movs_turno:
                sign = Decimal("1") if mv["tipo"] == "INGRESO" else Decimal("-1")
                m_dec = to_decimal(mv["monto"], "0") * sign
                mon = (mv["moneda"] or "USD").upper()
                if mon == "USD":
                    caja_saldo_usd_dec += m_dec
                elif mon == "VES":
                    caja_saldo_ves_dec += m_dec
                elif mon == "COP":
                    caja_cop_dec += m_dec

            caja_saldo_consolidado_dec = (
                caja_saldo_usd_dec
                + (caja_saldo_ves_dec / tasa_ves_dec if tasa_ves_dec > Decimal("0") else Decimal("0"))
                + (caja_cop_dec / tasa_cop_dec if tasa_cop_dec > Decimal("0") else Decimal("0"))
            )

        ped_ten_sql, ped_ten_args = _t_clause("pedidos", "ped")
        pedidos_pendientes_count = int(
            cur.execute(
                f"SELECT COUNT(*) FROM pedidos ped WHERE ped.estado = 'PENDIENTE' {ped_ten_sql}",
                ped_ten_args,
            ).fetchone()[0]
            or 0
        )

        p_ten_sql, p_ten_args = _t_clause("productos", "p")
        stock_critico_count = int(
            cur.execute(
                f"""
                SELECT COUNT(*) FROM productos p
                WHERE p.tipo = 'producto' AND COALESCE(p.activo, 1) = 1 AND p.stock <= p.stock_minimo {p_ten_sql}
                """,
                p_ten_args,
            ).fetchone()[0]
            or 0
        )

        # 3. Serie Temporal (Ingresos vs Compras/Egresos)
        group_expr = "substr(COALESCE(fecha, ''), 1, 7)" if periodo_norm == "anio" else "substr(COALESCE(fecha, ''), 1, 10)"
        group_gasto_expr = "substr(COALESCE(fecha_emision, created_at, ''), 1, 7)" if periodo_norm == "anio" else "substr(COALESCE(fecha_emision, created_at, ''), 1, 10)"

        ing_map = {}
        for r in cur.execute(
            f"""
            SELECT {group_expr} as bucket, COALESCE(SUM(total_usd), 0) as total
            FROM facturas f
            WHERE COALESCE(f.estado, 'pagada') != 'anulada'
              AND substr(COALESCE(f.fecha, ''), 1, 10) BETWEEN ? AND ?
              {f_ten_sql}
            GROUP BY bucket
            """,
            [desde_str, hasta_str] + f_ten_args,
        ).fetchall():
            if r["bucket"]:
                ing_map[r["bucket"]] = to_decimal(r["total"], "0")

        egr_map = {}
        c_ten_sql, c_ten_args = _t_clause("compras", "co")
        for r in cur.execute(
            f"""
            SELECT {group_expr.replace('fecha', 'co.fecha')} as bucket, COALESCE(SUM(co.total), 0) as total
            FROM compras co
            WHERE COALESCE(co.estado, 'activa') != 'anulada'
              AND substr(COALESCE(co.fecha, ''), 1, 10) BETWEEN ? AND ?
              {c_ten_sql}
            GROUP BY bucket
            """,
            [desde_str, hasta_str] + c_ten_args,
        ).fetchall():
            if r["bucket"]:
                egr_map[r["bucket"]] = egr_map.get(r["bucket"], Decimal("0")) + to_decimal(r["total"], "0")

        g_ten_sql, g_ten_args = _t_clause("gastos", "g")
        for r in cur.execute(
            f"""
            SELECT {group_gasto_expr.replace('fecha_emision', 'g.fecha_emision').replace('created_at', 'g.created_at')} as bucket,
                   COALESCE(SUM(g.monto_total_usd), 0) as total
            FROM gastos g
            WHERE COALESCE(g.estado, 'ACTIVO') NOT IN ('anulada', 'ANULADO')
              AND substr(COALESCE(g.fecha_emision, g.created_at, ''), 1, 10) BETWEEN ? AND ?
              {g_ten_sql}
            GROUP BY bucket
            """,
            [desde_str, hasta_str] + g_ten_args,
        ).fetchall():
            if r["bucket"]:
                egr_map[r["bucket"]] = egr_map.get(r["bucket"], Decimal("0")) + to_decimal(r["total"], "0")

        meses_es = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
        serie_temporal = []
        if periodo_norm == "anio":
            for m in range(1, hoy_dt.month + 1):
                key = f"{hoy_dt.year:04d}-{m:02d}"
                serie_temporal.append({
                    "fecha": key,
                    "etiqueta": f"{meses_es[m - 1]} {hoy_dt.year}",
                    "ingresos_usd": d_round(ing_map.get(key, Decimal("0")), 2),
                    "egresos_usd": d_round(egr_map.get(key, Decimal("0")), 2),
                })
        else:
            cursor_dt = desde_dt
            while cursor_dt <= hasta_dt:
                key = cursor_dt.isoformat()
                serie_temporal.append({
                    "fecha": key,
                    "etiqueta": f"{cursor_dt.day:02d} {meses_es[cursor_dt.month - 1]}",
                    "ingresos_usd": d_round(ing_map.get(key, Decimal("0")), 2),
                    "egresos_usd": d_round(egr_map.get(key, Decimal("0")), 2),
                })
                cursor_dt += timedelta(days=1)

        # 4. Distribución de Pagos (Dona)
        pagos_agg = {}
        for r in cur.execute(
            f"""
            SELECT COALESCE(NULLIF(TRIM(fp.metodo), ''), 'Otros') as metodo_pago,
                   COALESCE(SUM(fp.equivalente_usd), 0) as total_usd,
                   COUNT(*) as cantidad
            FROM factura_pagos fp
            JOIN facturas f ON fp.factura_id = f.id
            WHERE COALESCE(f.estado, 'pagada') != 'anulada'
              AND substr(COALESCE(f.fecha, ''), 1, 10) BETWEEN ? AND ?
              {f_ten_sql}
            GROUP BY metodo_pago
            """,
            [desde_str, hasta_str] + f_ten_args,
        ).fetchall():
            m_name = r["metodo_pago"]
            entry = pagos_agg.setdefault(m_name, {"total": Decimal("0"), "cantidad": 0})
            entry["total"] += to_decimal(r["total_usd"], "0")
            entry["cantidad"] += int(r["cantidad"] or 0)

        # Incluir ingresos directos de caja sin factura asociada (abonos / ingresos extra)
        for r in cur.execute(
            f"""
            SELECT COALESCE(NULLIF(TRIM(mc.metodo_pago), ''), 'Otros') as metodo_pago,
                   mc.moneda,
                   COALESCE(SUM(mc.monto), 0) as monto,
                   COUNT(*) as cantidad
            FROM movimientos_caja mc
            JOIN turnos_caja tc ON mc.turno_id = tc.id
            WHERE mc.tipo = 'INGRESO'
              AND mc.factura_id_ref IS NULL
              AND COALESCE(mc.referencia, '') != 'APERTURA'
              AND substr(COALESCE(mc.created_at, ''), 1, 10) BETWEEN ? AND ?
              {tc_ten_sql}
            GROUP BY metodo_pago, mc.moneda
            """,
            [desde_str, hasta_str] + tc_ten_args,
        ).fetchall():
            m_name = r["metodo_pago"]
            mon = (r["moneda"] or "USD").upper()
            amt = to_decimal(r["monto"], "0")
            if mon == "VES":
                eq_usd = amt / tasa_ves_dec if tasa_ves_dec > Decimal("0") else Decimal("0")
            elif mon == "COP":
                eq_usd = amt / tasa_cop_dec if tasa_cop_dec > Decimal("0") else Decimal("0")
            else:
                eq_usd = amt
            entry = pagos_agg.setdefault(m_name, {"total": Decimal("0"), "cantidad": 0})
            entry["total"] += eq_usd
            entry["cantidad"] += int(r["cantidad"] or 0)

        distribucion_pagos = sorted(
            [
                {
                    "metodo_pago": k,
                    "total_usd": d_round(v["total"], 2),
                    "cantidad": v["cantidad"],
                }
                for k, v in pagos_agg.items()
                if v["total"] > Decimal("0")
            ],
            key=lambda x: x["total_usd"],
            reverse=True,
        )

        # 5. Listas Accionables
        productos_stock_critico = [
            dict(r)
            for r in cur.execute(
                f"""
                SELECT p.id, p.codigo, p.nombre, p.stock, p.stock_minimo, p.costo_cpp,
                       COALESCE(c.nombre, 'General') as categoria_nombre
                FROM productos p
                LEFT JOIN categorias c ON p.categoria_id = c.id
                WHERE p.tipo = 'producto' AND COALESCE(p.activo, 1) = 1 AND p.stock <= p.stock_minimo
                  {p_ten_sql}
                ORDER BY p.stock ASC, p.nombre ASC
                LIMIT 8
                """,
                p_ten_args,
            ).fetchall()
        ]

        pedidos_pendientes_lista = [
            dict(r)
            for r in cur.execute(
                f"""
                SELECT ped.id, ped.numero_pedido, ped.fecha, ped.total_usd, ped.condicion_pago,
                       COALESCE(c.nombre, 'Cliente General') as cliente_nombre,
                       COALESCE(v.nombre, 'Directo') as vendedor_nombre
                FROM pedidos ped
                LEFT JOIN clientes c ON ped.cliente_id = c.id
                LEFT JOIN vendedores v ON ped.vendedor_id = v.id
                WHERE ped.estado = 'PENDIENTE' {ped_ten_sql}
                ORDER BY ped.id DESC
                LIMIT 6
                """,
                ped_ten_args,
            ).fetchall()
        ]

        ultimas_facturas = [
            dict(r)
            for r in cur.execute(
                f"""
                SELECT f.id, f.numero_factura, f.fecha, f.total_usd, f.total_ves, f.tipo_venta, f.estado,
                       COALESCE(c.nombre, 'Cliente General') as cliente_nombre
                FROM facturas f
                LEFT JOIN clientes c ON f.cliente_id = c.id
                WHERE COALESCE(f.estado, 'pagada') != 'anulada'
                  AND substr(COALESCE(f.fecha, ''), 1, 10) BETWEEN ? AND ?
                  {f_ten_sql}
                ORDER BY f.id DESC
                LIMIT 6
                """,
                [desde_str, hasta_str] + f_ten_args,
            ).fetchall()
        ]

        top_productos = [
            dict(r)
            for r in cur.execute(
                f"""
                SELECT fd.producto_id,
                       fd.nombre_producto,
                       ROUND(COALESCE(SUM(fd.cantidad), 0), 2) as total_vendido,
                       ROUND(COALESCE(SUM(fd.total), 0), 2) as total_usd,
                       COALESCE(p.stock, 0) as stock_actual,
                       COALESCE(p.tipo, fd.tipo, 'producto') as tipo
                FROM factura_detalles fd
                JOIN facturas f ON fd.factura_id = f.id
                LEFT JOIN productos p ON fd.producto_id = p.id
                WHERE COALESCE(f.estado, 'pagada') != 'anulada'
                  AND substr(COALESCE(f.fecha, ''), 1, 10) BETWEEN ? AND ?
                  {f_ten_sql}
                GROUP BY fd.producto_id, fd.nombre_producto
                ORDER BY total_usd DESC, total_vendido DESC
                LIMIT 5
                """,
                [desde_str, hasta_str] + f_ten_args,
            ).fetchall()
        ]

        top_clientes = [
            dict(r)
            for r in cur.execute(
                f"""
                SELECT c.id, c.nombre, c.cedula, COALESCE(c.telefono, '') as telefono,
                       COUNT(f.id) as total_facturas,
                       ROUND(COALESCE(SUM(f.total_usd), 0), 2) as total_comprado_usd
                FROM facturas f
                JOIN clientes c ON f.cliente_id = c.id
                WHERE COALESCE(f.estado, 'pagada') != 'anulada'
                  AND substr(COALESCE(f.fecha, ''), 1, 10) BETWEEN ? AND ?
                  {f_ten_sql}
                GROUP BY c.id
                ORDER BY total_comprado_usd DESC
                LIMIT 5
                """,
                [desde_str, hasta_str] + f_ten_args,
            ).fetchall()
        ]

        ventas_total_usd = d_round(ventas_total_dec, 2)
        return {
            "success": True,
            "periodo": periodo_norm,
            "rango": {
                "desde": desde_str,
                "hasta": hasta_str,
                "anterior_desde": prev_desde_str,
                "anterior_hasta": prev_hasta_str,
            },
            "tasas": {
                "tasa_ves": tasa_ves,
                "tasa_cop": tasa_cop,
            },
            "kpis": {
                "ventas_total_usd": ventas_total_usd,
                "ventas_total_ves": d_round(ventas_total_dec * tasa_ves_dec, 2),
                "ventas_periodo_anterior_usd": d_round(ventas_prev_dec, 2),
                "variacion_ventas_pct": var_pct,
                "utilidad_bruta_usd": d_round(utilidad_bruta_dec, 2),
                "margen_promedio_pct": margen_pct,
                "cxc_pendiente_usd": cxc_pendiente_usd,
                "cxc_pendientes_count": cxc_pendientes_count,
                "cxp_pendiente_usd": cxp_pendiente_usd,
                "cxp_pendientes_count": cxp_pendientes_count,
                "facturas_count": facturas_count,
            },
            "operativo": {
                "caja_estado": caja_estado,
                "caja_turno_id": caja_turno_id,
                "caja_saldo_usd": d_round(caja_saldo_usd_dec, 2),
                "caja_saldo_ves": d_round(caja_saldo_ves_dec, 2),
                "caja_saldo_consolidado_usd": d_round(caja_saldo_consolidado_dec, 2),
                "pedidos_pendientes_count": pedidos_pendientes_count,
                "stock_critico_count": stock_critico_count,
            },
            "serie_temporal": serie_temporal,
            "distribucion_pagos": distribucion_pagos,
            "productos_stock_critico": productos_stock_critico,
            "pedidos_pendientes": pedidos_pendientes_lista,
            "ultimas_facturas": ultimas_facturas,
            "top_productos": top_productos,
            "top_clientes": top_clientes,
        }
    finally:
        if close_after:
            conn.close()

