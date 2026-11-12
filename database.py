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
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime

DEFAULT_DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "inventario.db")
DB_LIMPIA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "inventario_limpia.db")

def resolver_db_path():
    """
    Detección y resolución inteligente de almacenamiento persistente en la nube / local:
    1. Si se define PERSISTENT_DATA_PATH o DATA_DIR (o carpetas montadas en Render como /data o /var/data).
    2. Si existe un disco montado y no contiene inventario.db, inicializa clonando la base del repositorio.
    3. Si no hay disco externo montado, opera sobre DEFAULT_DB_PATH local de forma segura.
    """
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
        return {
            "ok": False,
            "conectado": False,
            "success": False,
            "error": f"Error HTTP {e.code}: {e.reason}",
            "detalle": f"Verifique que el bucket '{cfg['bucket']}' esté creado en Supabase Storage.",
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
                        with open(DB_PATH, "wb") as f:
                            f.write(data)
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
                if e.code == 404:
                    continue
                else:
                    print(f"[PERSISTENCIA NUBE] Error HTTP {e.code} en {url}: {e.reason}")
            except Exception as e:
                print(f"[PERSISTENCIA NUBE] Error de conexión a {url}: {str(e)}")

    print(f"[PERSISTENCIA NUBE] Aún no existe '{cfg['filename']}' en Supabase Storage. Subiendo base actual como imagen persistente...")
    sync_to_supabase_storage()
    return False

def sync_to_supabase_storage():
    """Sube el archivo inventario.db a Supabase Storage con x-upsert para persistencia permanente."""
    global _last_cloud_sync_status
    cfg = get_supabase_config()
    if not cfg or not os.path.exists(DB_PATH):
        return False

    try:
        data = None
        for _ in range(3):
            try:
                with open(DB_PATH, "rb") as f:
                    data = f.read()
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

class MonitoredConnection(sqlite3.Connection):
    """Conexión SQLite que intercepta commit() para auto-guardar en la nube sin bloquear peticiones."""
    def commit(self):
        super().commit()
        trigger_cloud_sync_async()

def get_connection():
    conn = sqlite3.connect(DB_PATH, factory=MonitoredConnection)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
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
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_dev_det_factura_det ON devolucion_detalles(factura_detalle_id)")
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
        sincronizacion_tasas_auto INTEGER DEFAULT 1
    )
    """)

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

    # Sembrar 1 cliente genérico de contado para facturación rápida
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

    from crear_base_datos_limpia import crear_base_limpia
    crear_base_limpia(DB_PATH)
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
        SET estado = 'anulada', saldo_pendiente = 0.0, motivo_anulacion = ?, fecha_anulacion = ? 
        WHERE id = ?
    """, (motivo, fecha_hoy, factura_id))

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
    try:
        cur = conn.cursor()
        cur.execute("BEGIN IMMEDIATE")

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
    try:
        cur = conn.cursor()
        cur.execute("BEGIN IMMEDIATE")

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
    try:
        cur = conn.cursor()
        cur.execute("BEGIN IMMEDIATE")

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
    try:
        cur = conn.cursor()
        cur.execute("BEGIN IMMEDIATE")

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
    try:
        cur = conn.cursor()
        cur.execute("BEGIN IMMEDIATE")

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
    try:
        cur = conn.cursor()
        cur.execute("BEGIN IMMEDIATE")

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
    try:
        cur = conn.cursor()
        cur.execute("BEGIN IMMEDIATE")

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


if __name__ == "__main__":
    init_db()
    print("Base de datos inicializada correctamente.")
