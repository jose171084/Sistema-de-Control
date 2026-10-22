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
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "inventario.db")
DB_LIMPIA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "inventario_limpia.db")

# ========================================================
# PERSISTENCIA EN LA NUBE (SUPABASE STORAGE AUTO-SYNC)
# ========================================================
_sync_timer = None
_sync_lock = threading.Lock()

def get_supabase_config():
    url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    key = os.environ.get("SUPABASE_KEY", "").strip()
    bucket = os.environ.get("SUPABASE_BUCKET", "database").strip()
    filename = os.environ.get("SUPABASE_FILENAME", "inventario.db").strip()
    if url and key:
        return {"url": url, "key": key, "bucket": bucket, "filename": filename}
    return None

def sync_from_supabase_storage():
    """Descarga inventario.db desde Supabase Storage si está configurado (persistencia en Render)."""
    cfg = get_supabase_config()
    if not cfg:
        return False

    endpoints = [
        f"{cfg['url']}/storage/v1/object/authenticated/{cfg['bucket']}/{cfg['filename']}",
        f"{cfg['url']}/storage/v1/object/{cfg['bucket']}/{cfg['filename']}"
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
            print(f"[PERSISTENCIA NUBE] Consultando base persistente en Supabase Storage ({cfg['bucket']}/{cfg['filename']})...")
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = resp.read()
                if data and len(data) > 100:
                    with open(DB_PATH, "wb") as f:
                        f.write(data)
                    print(f"[PERSISTENCIA NUBE] Base de datos persistente descargada exitosamente ({len(data)} bytes).")
                    return True
        except urllib.error.HTTPError as e:
            if e.code == 404:
                continue
            else:
                print(f"[PERSISTENCIA NUBE] Error HTTP {e.code} en {url}: {e.reason}")
        except Exception as e:
            print(f"[PERSISTENCIA NUBE] Error de conexión a {url}: {str(e)}")

    print(f"[PERSISTENCIA NUBE] Aún no existe '{cfg['filename']}' en Supabase Storage o no se pudo descargar. Se respaldará la base local actual.")
    sync_to_supabase_storage()
    return False

def sync_to_supabase_storage():
    """Sube el archivo inventario.db a Supabase Storage con x-upsert para persistencia permanente."""
    cfg = get_supabase_config()
    if not cfg or not os.path.exists(DB_PATH):
        return False

    try:
        with open(DB_PATH, "rb") as f:
            data = f.read()

        url = f"{cfg['url']}/storage/v1/object/{cfg['bucket']}/{cfg['filename']}"
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
        with urllib.request.urlopen(req, timeout=15) as resp:
            print(f"[PERSISTENCIA NUBE] Base de datos guardada en Supabase Storage ({len(data)} bytes).")
            return True
    except Exception as e:
        print(f"[PERSISTENCIA NUBE] Error al sincronizar con Supabase Storage: {str(e)}")
        return False

def schedule_cloud_sync():
    """Programa una sincronización diferida (espera 3 segundos tras el último commit)."""
    global _sync_timer
    if not get_supabase_config():
        return
    with _sync_lock:
        if _sync_timer:
            _sync_timer.cancel()
        _sync_timer = threading.Timer(3.0, sync_to_supabase_storage)
        _sync_timer.daemon = True
        _sync_timer.start()

class MonitoredConnection(sqlite3.Connection):
    """Conexión SQLite que intercepta commit() para auto-guardar en la nube sin bloquear peticiones."""
    def commit(self):
        super().commit()
        schedule_cloud_sync()

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

    # 2. CUENTAS POR COBRAR (CXC)
    add_col_if_missing("cuentas_por_cobrar", "fecha_emision", "TEXT")
    add_col_if_missing("cuentas_por_cobrar", "notas", "TEXT")
    try:
        cursor.execute("UPDATE cuentas_por_cobrar SET fecha_emision = created_at WHERE fecha_emision IS NULL")
    except Exception:
        pass

    # 3. COMPRAS
    add_col_if_missing("compras", "tipo_compra", "TEXT DEFAULT 'contado'")
    add_col_if_missing("compras", "fecha_vencimiento", "TEXT")
    add_col_if_missing("compras", "saldo_pendiente", "REAL DEFAULT 0.0")
    add_col_if_missing("compras", "numero_factura", "TEXT")

    # 4. CUENTAS POR PAGAR (CXP)
    add_col_if_missing("cuentas_por_pagar", "tipo_registro", "TEXT DEFAULT 'compra'")

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
        estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente', 'parcial', 'pagada')),
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
        estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente', 'parcial', 'pagada')),
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
        FOREIGN KEY (devolucion_id) REFERENCES devoluciones(id) ON DELETE CASCADE,
        FOREIGN KEY (producto_id) REFERENCES productos(id)
    )
    """)

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
    # TABLAS DE AJUSTES DE INVENTARIO (FASE 2C)
    # ==========================================
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

def limpiar_transacciones_db():
    """
    Limpia todas las transacciones para pruebas del Beta Tester:
    - Facturas, detalles y pagos
    - Compras, detalles y pagos
    - Cuentas por cobrar y abonos
    - Cuentas por pagar y abonos
    - Devoluciones y notas de crédito
    - Reinicia el stock de todos los productos a 0
    Conserva intactos las categorías, productos, clientes y configuración.
    """
    conn = get_connection()
    c = conn.cursor()
    tablas = [
        "inventario_ajuste_detalles", "inventario_ajustes",
        "inventario_movimientos", "inventario_migraciones",
        "factura_pagos", "factura_detalles", "facturas",
        "compra_pagos", "compra_detalles", "compras",
        "abono_cxc_pagos", "abonos_cxc", "cuentas_por_cobrar",
        "abono_cxp_pagos", "abonos_cxp", "cuentas_por_pagar",
        "devolucion_pagos", "devolucion_detalles", "devoluciones"
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

def restablecer_fabrica_db():
    """Restaura completamente la base de datos limpia de fábrica."""
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
    usuario_id=1
):
    """
    Función central para registrar movimientos en el libro mayor persistente (FASE 2B).
    - Valida producto y tipo (omite servicios según Regla 22).
    - Valida cantidad > 0.
    - Valida sentido ('ENTRADA' o 'SALIDA').
    - Valida tipo_movimiento.
    - Idempotencia / Protección contra duplicados (Sección 8):
      Si ya existe un movimiento idéntico para (documento_tipo, documento_id, producto_id, tipo_movimiento),
      evita duplicidad y retorna el id existente.
    - Inserta el registro inmutable en inventario_movimientos.
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
        'cargo_ajuste', 'descargo_merma', 'descargo_vencimiento', 
        'descargo_rotura', 'descargo_uso_interno', 'APERTURA_MIGRACION'
    )
    if tipo_movimiento not in tipos_validos:
        raise ValueError(f"Tipo de movimiento inválido: {tipo_movimiento}")

    # Protección contra duplicados (Sección 8)
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

    cursor.execute("""
        INSERT INTO inventario_movimientos (
            fecha, producto_id, tipo_movimiento, sentido, cantidad,
            costo_unitario, costo_total, stock_anterior, stock_nuevo,
            documento_tipo, documento_id, documento_numero, motivo, usuario_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        fec, producto_id, tipo_movimiento, sent, cant,
        c_unit, c_tot, stk_ant, stk_nue,
        documento_tipo, documento_id, documento_numero, motivo, usuario_id
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

if __name__ == "__main__":
    init_db()
    print("Base de datos inicializada correctamente.")
