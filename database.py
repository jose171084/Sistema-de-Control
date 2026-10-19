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
        tasa_ves REAL NOT NULL DEFAULT 0.0,
        tasa_cop REAL NOT NULL DEFAULT 0.0,
        total_ves REAL NOT NULL DEFAULT 0.0,
        total_cop REAL NOT NULL DEFAULT 0.0,
        estado TEXT DEFAULT 'pagada' CHECK(estado IN ('pagada', 'anulada')),
        tipo_venta TEXT DEFAULT 'contado' CHECK(tipo_venta IN ('contado', 'credito')),
        fecha_vencimiento TEXT,
        saldo_pendiente REAL DEFAULT 0.0,
        notas TEXT,
        FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    )
    """)

    # Migración de columnas para bases de datos existentes
    try:
        cursor.execute("ALTER TABLE facturas ADD COLUMN tipo_venta TEXT DEFAULT 'contado'")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE facturas ADD COLUMN fecha_vencimiento TEXT")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE facturas ADD COLUMN saldo_pendiente REAL DEFAULT 0.0")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE configuracion ADD COLUMN tema_config TEXT")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE configuracion ADD COLUMN labels_config TEXT")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE configuracion ADD COLUMN fecha_tasas_actualizacion TEXT")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE configuracion ADD COLUMN fuente_tasas TEXT")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE configuracion ADD COLUMN sincronizacion_tasas_auto INTEGER DEFAULT 1")
    except Exception:
        pass
    try:
        cursor.execute("UPDATE configuracion SET tema_config = tema WHERE tema_config IS NULL AND tema IS NOT NULL")
        cursor.execute("UPDATE configuracion SET labels_config = labels WHERE labels_config IS NULL AND labels IS NOT NULL")
        cursor.execute("UPDATE configuracion SET tema = tema_config WHERE tema IS NULL AND tema_config IS NOT NULL")
        cursor.execute("UPDATE configuracion SET labels = labels_config WHERE labels IS NULL AND labels_config IS NOT NULL")
    except Exception:
        pass

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

    # Sembrar configuración inicial si no existe
    cursor.execute("SELECT COUNT(*) FROM configuracion")
    if cursor.fetchone()[0] == 0:
        tema_zen = json.dumps({
            "sidebarBg": "#0f172a",
            "sidebarText": "#f8fafc",
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

if __name__ == "__main__":
    init_db()
    print("Base de datos inicializada correctamente.")
