"""
crear_base_datos_limpia.py - Generador de Base de Datos Limpia para Pruebas / Beta Tester.
Crea una base de datos SQLite nueva, optimizada y sin transacciones residuales,
manteniendo la estructura relacional completa, categorías y configuración base.
"""

import sqlite3
import os
import shutil
import json

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_ACTUAL = os.path.join(BASE_DIR, "inventario.db")
DB_BACKUP = os.path.join(BASE_DIR, "inventario_backup_actual.db")
DB_LIMPIA = os.path.join(BASE_DIR, "inventario_limpia.db")

def crear_base_limpia(destino_path=DB_LIMPIA):
    # Si existe el archivo destino, eliminarlo para empezar 100% limpio
    if os.path.exists(destino_path):
        os.remove(destino_path)

    conn = sqlite3.connect(destino_path)
    conn.execute("PRAGMA foreign_keys = ON")
    cursor = conn.cursor()

    # 1. Tabla de Configuración
    cursor.execute("""
    CREATE TABLE configuracion (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        nombre_negocio TEXT DEFAULT 'Mi Negocio Comercial',
        documento_fiscal TEXT DEFAULT 'J-12345678-9',
        telefono TEXT DEFAULT '+58 412 0000000',
        direccion TEXT DEFAULT 'Calle Principal #123',
        iva_porcentaje REAL DEFAULT 16.0,
        tasa_ves REAL DEFAULT 45.00,
        tasa_cop REAL DEFAULT 4100.00,
        moneda_principal TEXT DEFAULT 'USD',
        tema TEXT,
        labels TEXT,
        tema_config TEXT,
        labels_config TEXT,
        tasas_ultima_actualizacion TEXT,
        tasas_fuente TEXT,
        fecha_tasas_actualizacion TEXT,
        fuente_tasas TEXT,
        sincronizacion_tasas_auto INTEGER DEFAULT 1
    )
    """)

    # 2. Categorías
    cursor.execute("""
    CREATE TABLE categorias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        tipo TEXT NOT NULL CHECK(tipo IN ('servicio', 'producto')),
        descripcion TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 3. Productos y Servicios
    cursor.execute("""
    CREATE TABLE productos (
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

    # 4. Clientes
    cursor.execute("""
    CREATE TABLE clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        cedula TEXT UNIQUE NOT NULL,
        telefono TEXT NOT NULL,
        correo TEXT,
        direccion TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 5. Proveedores
    cursor.execute("""
    CREATE TABLE proveedores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        cedula TEXT UNIQUE NOT NULL,
        telefono TEXT NOT NULL,
        correo TEXT,
        direccion TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 6. Facturas
    cursor.execute("""
    CREATE TABLE facturas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_factura TEXT UNIQUE NOT NULL,
        cliente_id INTEGER NOT NULL,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        tipo_venta TEXT NOT NULL CHECK(tipo_venta IN ('contado', 'credito')),
        subtotal REAL NOT NULL,
        iva_total REAL NOT NULL,
        total_usd REAL NOT NULL DEFAULT 0.0,
        total REAL NOT NULL DEFAULT 0.0,
        tasa_ves REAL NOT NULL,
        tasa_cop REAL NOT NULL,
        total_ves REAL NOT NULL,
        total_cop REAL NOT NULL,
        estado TEXT DEFAULT 'pagada' CHECK(estado IN ('pagada', 'pendiente', 'anulada')),
        fecha_vencimiento TEXT,
        saldo_pendiente REAL DEFAULT 0.0,
        notas TEXT,
        FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    )
    """)

    # 7. Detalles de Factura
    cursor.execute("""
    CREATE TABLE factura_detalles (
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

    # 8. Pagos de Factura
    cursor.execute("""
    CREATE TABLE factura_pagos (
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

    # 9. Cuentas por Cobrar (CXC)
    cursor.execute("""
    CREATE TABLE cuentas_por_cobrar (
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

    # 10. Abonos CXC
    cursor.execute("""
    CREATE TABLE abonos_cxc (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cxc_id INTEGER NOT NULL,
        monto_usd REAL NOT NULL,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        notas TEXT,
        FOREIGN KEY (cxc_id) REFERENCES cuentas_por_cobrar(id) ON DELETE CASCADE
    )
    """)

    # 11. Pagos del Abono CXC
    cursor.execute("""
    CREATE TABLE abono_cxc_pagos (
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

    # 12. Compras
    cursor.execute("""
    CREATE TABLE compras (
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

    # 13. Detalles de Compra
    cursor.execute("""
    CREATE TABLE compra_detalles (
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

    # 14. Pagos de Compra
    cursor.execute("""
    CREATE TABLE compra_pagos (
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

    # 15. Cuentas por Pagar (CXP)
    cursor.execute("""
    CREATE TABLE cuentas_por_pagar (
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

    # 16. Abonos CXP
    cursor.execute("""
    CREATE TABLE abonos_cxp (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cxp_id INTEGER NOT NULL,
        monto_usd REAL NOT NULL,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        notas TEXT,
        FOREIGN KEY (cxp_id) REFERENCES cuentas_por_pagar(id) ON DELETE CASCADE
    )
    """)

    # 17. Pagos del Abono CXP
    cursor.execute("""
    CREATE TABLE abono_cxp_pagos (
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

    # 18. Devoluciones
    cursor.execute("""
    CREATE TABLE devoluciones (
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

    # 19. Detalles de Devolución
    cursor.execute("""
    CREATE TABLE devolucion_detalles (
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

    # 20. Pagos de Devolución
    cursor.execute("""
    CREATE TABLE devolucion_pagos (
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

    # 21. Libro Mayor de Inventario (FASE 2A)
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

    # 22. Control de Migraciones de Inventario
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

    # 23. Ajustes de Inventario (FASE 2C)
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

    # ========================================================
    # SEEDING DE DATOS LIMPIOS Y ESTRUCTURALES
    # ========================================================

    tema_zen = {
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
    }

    labels_default = {
        "titulo_app": "Inventario & Facturación",
        "subtitulo_app": "Control Multimoneda",
        "tab_dashboard": "Dashboard",
        "tab_categorias": "1. Categorías",
        "tab_productos": "2. Productos & Servicios",
        "tab_clientes": "3. Clientes",
        "tab_facturacion": "4. Facturación (Ventas)",
        "tab_devoluciones": "5. Devoluciones & NC",
        "tab_compras": "6. Compras",
        "tab_proveedores": "7. Proveedores",
        "tab_reportes": "8. Informes, Kardex & Fiscales",
        "tab_cxc": "9. Cuentas por Cobrar",
        "tab_cxp": "10. Cuentas por Pagar",
        "btn_nueva_venta": "Nueva Venta",
        "btn_cargar_compra": "Cargar Compra",
        "btn_procesar_venta": "Completar Facturación",
        "btn_credito": "Facturar a Crédito",
        "btn_abonar": "Registrar Abono",
        "btn_cxp": "Registrar Pago / Gasto",
        "btn_guardar_producto": "Guardar Ítem",
        "btn_sincronizar_tasas": "Sincronizar BCV / TRM",
        "btn_nueva_devolucion": "Nueva Devolución",
        "btn_kardex": "Consultar Kardex",
        "btn_seniat": "Generar Libros SENIAT"
    }

    # Configuración limpia
    tema_json = json.dumps(tema_zen)
    labels_json = json.dumps(labels_default)
    cursor.execute("""
    INSERT INTO configuracion (
        id, nombre_negocio, documento_fiscal, telefono, direccion, iva_porcentaje, 
        tasa_ves, tasa_cop, moneda_principal, tema, labels, tema_config, labels_config,
        tasas_ultima_actualizacion, tasas_fuente, fecha_tasas_actualizacion, fuente_tasas,
        sincronizacion_tasas_auto
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), ?, datetime('now', 'localtime'), ?, ?)
    """, (
        1, 'Empresa Comercial (Beta Tester)', 'J-12345678-9', '+58 412 0000000',
        'Av. Principal, Edificio Central, Local 1', 16.0, 45.00, 4100.00, 'USD',
        tema_json, labels_json, tema_json, labels_json,
        'BCV Oficial / TRM', 'BCV Oficial / TRM Colombia', 1
    ))

    # Categorías base limpias
    cursor.executemany("""
    INSERT INTO categorias (nombre, tipo, descripcion) VALUES (?, ?, ?)
    """, [
        ('Servicios Generales', 'servicio', 'Servicios profesionales, soporte técnico y mano de obra (No controlan stock)'),
        ('Productos & Mercancía', 'producto', 'Artículos físicos con control de inventario y existencia (Controlan stock)')
    ])

    # 1 Cliente inicial para facilitar facturación rápida de contado
    cursor.execute("""
    INSERT INTO clientes (nombre, cedula, telefono, correo, direccion)
    VALUES (?, ?, ?, ?, ?)
    """, ('Cliente Ocasional / Contado', 'V-00000000', '+58 412 0000000', 'cliente@ejemplo.com', 'Ventas de mostrador'))

    conn.commit()
    conn.close()
    print(f"Base de datos limpia creada exitosamente en: {destino_path}")

def aplicar_base_limpia_al_sistema():
    """Hace backup de la base actual y la reemplaza por la limpia."""
    if os.path.exists(DB_ACTUAL):
        shutil.copy2(DB_ACTUAL, DB_BACKUP)
        print(f"Respaldo de seguridad de la base actual creado en: {DB_BACKUP}")
    crear_base_limpia(DB_ACTUAL)
    # También dejamos una copia permanente de referencia
    crear_base_limpia(DB_LIMPIA)
    print("La base de datos principal 'inventario.db' ahora está 100% limpia y lista para el Beta Tester.")

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "--aplicar":
        aplicar_base_limpia_al_sistema()
    else:
        crear_base_limpia(DB_LIMPIA)
        print("Para aplicarla directamente a inventario.db ejecuta: py crear_base_datos_limpia.py --aplicar")
