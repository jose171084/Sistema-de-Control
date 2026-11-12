import os
import sys
import sqlite3
from datetime import datetime

# Set path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

import database

def run_tests():
    print("==================================================")
    print(" INICIANDO TEST SUITE: DEVOLUCIONES DE COMPRAS")
    print("==================================================")

    conn = database.get_connection()
    cursor = conn.cursor()

    # 1. Asegurar configuración, proveedor y producto de prueba
    cursor.execute("SELECT id FROM proveedores LIMIT 1")
    prov_row = cursor.fetchone()
    if not prov_row:
        cursor.execute("INSERT INTO proveedores (nombre, cedula, telefono, correo, direccion) VALUES ('Distribuidora Los Andes C.A.', 'J-99887766-5', '+584141112233', 'ventas@losandes.com', 'Av. Industrial 45')")
        prov_id = cursor.lastrowid
    else:
        prov_id = prov_row[0]

    cursor.execute("SELECT id, codigo, nombre, stock FROM productos WHERE tipo = 'producto' LIMIT 1")
    prod_row = cursor.fetchone()
    if not prod_row:
        cursor.execute("INSERT INTO productos (codigo, nombre, categoria_id, tipo, impuesto_tipo, precio_base, iva_monto, precio_total, costo, stock) VALUES ('PROD-TEST-DEV', 'Producto Test Devolución', 1, 'producto', 'exento', 20.0, 0.0, 20.0, 10.0, 50.0)")
        prod_id = cursor.lastrowid
        prod_codigo = 'PROD-TEST-DEV'
        prod_nombre = 'Producto Test Devolución'
        stock_base = 50.0
    else:
        prod_id = prod_row[0]
        prod_codigo = prod_row[1]
        prod_nombre = prod_row[2]
        stock_base = float(prod_row[3] or 0.0)

    print(f"Producto de prueba: ID {prod_id} ({prod_codigo} - {prod_nombre}), Stock inicial: {stock_base}")

    # 2. Registrar una Compra de Prueba de 10 unidades a $12.00 cada una (Total $120.00 a crédito)
    costo_compra = 12.0
    cant_comprada = 10.0
    total_compra = costo_compra * cant_comprada # $120.00
    num_ctrl = f"TEST-CTRL-{int(datetime.now().timestamp())}"
    num_fact = f"FACT-PROV-{int(datetime.now().timestamp())}"

    cursor.execute("""
        INSERT INTO compras (numero_control, numero_factura, proveedor_id, subtotal, iva_total, total, tipo_compra, saldo_pendiente, estado)
        VALUES (?, ?, ?, ?, 0.0, ?, 'credito', ?, 'activa')
    """, (num_ctrl, num_fact, prov_id, total_compra, total_compra, total_compra))
    compra_id = cursor.lastrowid

    cursor.execute("""
        INSERT INTO compra_detalles (compra_id, producto_id, nombre_producto, cantidad, costo_unitario, impuesto_tipo, iva_unitario, total)
        VALUES (?, ?, ?, ?, ?, 'exento', 0.0, ?)
    """, (compra_id, prod_id, prod_nombre, cant_comprada, costo_compra, total_compra))
    cd_id = cursor.lastrowid

    # Crear la cuenta por pagar en cuentas_por_pagar
    cursor.execute("""
        INSERT INTO cuentas_por_pagar (compra_id, proveedor_id, descripcion_concepto, numero_factura, monto_total, monto_pagado, saldo_pendiente, fecha_emision, fecha_vencimiento, estado)
        VALUES (?, ?, ?, ?, ?, 0.0, ?, date('now'), date('now', '+30 days'), 'pendiente')
    """, (compra_id, prov_id, f"Compra #{num_ctrl}", num_fact, total_compra, total_compra))
    cxp_id = cursor.lastrowid

    # Incrementar stock inicial de la compra
    nuevo_stock_post_compra = stock_base + cant_comprada
    cursor.execute("UPDATE productos SET stock = ? WHERE id = ?", (nuevo_stock_post_compra, prod_id))

    database.registrar_movimiento_inventario(
        cursor=cursor,
        producto_id=prod_id,
        fecha=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        tipo_movimiento="compra",
        sentido="ENTRADA",
        cantidad=cant_comprada,
        costo_unitario=costo_compra,
        costo_total=total_compra,
        stock_anterior=stock_base,
        stock_nuevo=nuevo_stock_post_compra,
        documento_tipo="compra",
        documento_id=compra_id,
        documento_numero=num_ctrl,
        motivo="Entrada por compra de prueba"
    )
    conn.commit()

    print(f"✅ Compra registrada: ID {compra_id}, Total: ${total_compra:.2f}, Nuevo stock: {nuevo_stock_post_compra}")

    # Contar ventas actuales para verificar que ventas NO son afectadas
    cursor.execute("SELECT COUNT(*) FROM facturas")
    ventas_antes = cursor.fetchone()[0]

    # 3. Test de validación: Intentar devolver más de lo comprado (15 unidades)
    print("\n--- Test 3: Validación de exceso de cantidad ---")
    try:
        database.procesar_devolucion_compra(cursor, {
            "compra_id": compra_id,
            "proveedor_id": prov_id,
            "motivo": "Intento inválido",
            "items": [{
                "compra_detalle_id": cd_id,
                "producto_id": prod_id,
                "cantidad": 15.0,
                "costo_unitario": costo_compra
            }]
        })
        print("❌ FALLÓ: Debió rechazar cantidad superior a lo comprado!")
        sys.exit(1)
    except ValueError as e:
        print(f"✅ ÉXITO: Rechazó correctamente la cantidad excedida: {e}")

    # 4. Test de Devolución Válida: Devolver 3 unidades ($36.00)
    print("\n--- Test 4: Procesar Devolución Parcial (3 unidades) ---")
    cant_a_devolver = 3.0
    res_dev = database.procesar_devolucion_compra(cursor, {
        "compra_id": compra_id,
        "proveedor_id": prov_id,
        "motivo": "Mercancía defectuosa",
        "items": [{
            "compra_detalle_id": cd_id,
            "producto_id": prod_id,
            "cantidad": cant_a_devolver,
            "costo_unitario": costo_compra
        }]
    })
    conn.commit()

    dev_id = res_dev["devolucion_id"]
    num_dev = res_dev["numero_devolucion"]
    print(f"✅ Devolución procesada exitosamente: ID {dev_id}, N° {num_dev}")
    print(f"   Total devuelto: ${res_dev['total_usd']:.2f}")
    print(f"   Monto descontado de CxP: ${res_dev['monto_descontado_cxp']:.2f}")

    # 5. Verificación de Stock en Almacén
    cursor.execute("SELECT stock FROM productos WHERE id = ?", (prod_id,))
    stock_actual_verif = float(cursor.fetchone()[0])
    stock_esperado = nuevo_stock_post_compra - cant_a_devolver
    assert abs(stock_actual_verif - stock_esperado) < 0.001, f"Error en stock: esperado {stock_esperado}, actual {stock_actual_verif}"
    print(f"✅ Stock en almacén descontado correctamente: {nuevo_stock_post_compra} -> {stock_actual_verif}")

    # 6. Verificación en Kardex (inventario_movimientos)
    cursor.execute("""
        SELECT tipo_movimiento, sentido, cantidad, costo_unitario, stock_anterior, stock_nuevo, documento_numero
        FROM inventario_movimientos
        WHERE documento_tipo = 'DEVOLUCION_COMPRA' AND documento_id = ?
    """, (dev_id,))
    kardex_row = cursor.fetchone()
    assert kardex_row is not None, "No se encontró registro en Kardex"
    assert kardex_row[0] == "devolucion_proveedor", f"Tipo de movimiento incorrecto: {kardex_row[0]}"
    assert kardex_row[1] == "SALIDA", f"Sentido incorrecto: {kardex_row[1]}"
    assert abs(float(kardex_row[2]) - cant_a_devolver) < 0.001, f"Cantidad incorrecta: {kardex_row[2]}"
    print(f"✅ Kardex verificado: tipo='{kardex_row[0]}', sentido='{kardex_row[1]}', cant={kardex_row[2]}, doc='{kardex_row[6]}'")

    # 7. Verificación de Cuentas por Pagar (CXP)
    cursor.execute("SELECT monto_total, saldo_pendiente, estado FROM cuentas_por_pagar WHERE id = ?", (cxp_id,))
    cxp_verif = cursor.fetchone()
    saldo_cxp_esperado = total_compra - (cant_a_devolver * costo_compra) # 120 - 36 = 84
    assert abs(float(cxp_verif[1]) - saldo_cxp_esperado) < 0.01, f"Saldo CxP incorrecto: esperado {saldo_cxp_esperado}, actual {cxp_verif[1]}"
    print(f"✅ Cuenta por Pagar (CXP) descontada correctamente: saldo pendiente ahora es ${cxp_verif[1]:.2f} (era ${total_compra:.2f})")

    # 8. Verificación en Compras
    cursor.execute("SELECT saldo_pendiente FROM compras WHERE id = ?", (compra_id,))
    saldo_compra_verif = float(cursor.fetchone()[0])
    assert abs(saldo_compra_verif - saldo_cxp_esperado) < 0.01, f"Saldo Compra incorrecto: {saldo_compra_verif}"
    print(f"✅ Saldo en Compras actualizado en sincronía con CXP: ${saldo_compra_verif:.2f}")

    # 9. Verificación en Notas de Ajuste Comercial (Ledger CxP)
    cursor.execute("SELECT tipo_nota, monto_usd, efecto FROM notas_ajuste_comercial WHERE modulo = 'cxp' AND numero_nota = ?", (num_dev,))
    nota_verif = cursor.fetchone()
    assert nota_verif is not None, "No se registró la nota de débito en notas_ajuste_comercial"
    assert nota_verif[0] == "debito" and nota_verif[2] == "disminuye", "Nota de débito inválida en notas_ajuste_comercial"
    print(f"✅ Nota de Débito registrada en Ledger CxP: tipo='{nota_verif[0]}', monto=${nota_verif[1]:.2f}, efecto='{nota_verif[2]}'")

    # 10. Verificación de Invariante: Ventas NO afectadas
    cursor.execute("SELECT COUNT(*) FROM facturas")
    ventas_despues = cursor.fetchone()[0]
    assert ventas_antes == ventas_despues, "CRÍTICO: ¡Las ventas fueron alteradas!"
    print(f"✅ Invariante cumplido: Total facturas/ventas antes={ventas_antes}, después={ventas_despues} (0 impacto en ventas)")

    # 11. Test de Anulación de la Devolución (Reversión completa)
    print("\n--- Test 11: Anulación / Reversión de la Devolución ---")
    res_anu = database.anular_devolucion_compra(cursor, dev_id, motivo="Error de digitación", usuario_id=1)
    conn.commit()

    # Verificar stock reingresado (+)
    cursor.execute("SELECT stock FROM productos WHERE id = ?", (prod_id,))
    stock_post_anu = float(cursor.fetchone()[0])
    assert abs(stock_post_anu - nuevo_stock_post_compra) < 0.001, f"Stock no fue restaurado: {stock_post_anu}"
    print(f"✅ Stock restaurado a inventario (+3): ahora es {stock_post_anu}")

    # Verificar saldo CXP restaurado (+)
    cursor.execute("SELECT saldo_pendiente FROM cuentas_por_pagar WHERE id = ?", (cxp_id,))
    saldo_cxp_restaurado = float(cursor.fetchone()[0])
    assert abs(saldo_cxp_restaurado - total_compra) < 0.01, f"Saldo CxP no restaurado: {saldo_cxp_restaurado}"
    print(f"✅ Saldo CxP restaurado: ${saldo_cxp_restaurado:.2f}")

    # Limpiar registros de prueba creados
    cursor.execute("DELETE FROM devolucion_compra_detalles WHERE devolucion_compra_id = ?", (dev_id,))
    cursor.execute("DELETE FROM devoluciones_compras WHERE id = ?", (dev_id,))
    cursor.execute("DELETE FROM inventario_movimientos WHERE documento_tipo = 'DEVOLUCION_COMPRA' AND documento_id = ?", (dev_id,))
    cursor.execute("DELETE FROM inventario_movimientos WHERE documento_tipo = 'compra' AND documento_id = ?", (compra_id,))
    cursor.execute("DELETE FROM compra_detalles WHERE compra_id = ?", (compra_id,))
    cursor.execute("DELETE FROM cuentas_por_pagar WHERE id = ?", (cxp_id,))
    cursor.execute("DELETE FROM compras WHERE id = ?", (compra_id,))
    cursor.execute("UPDATE productos SET stock = ? WHERE id = ?", (stock_base, prod_id))
    cursor.execute("DELETE FROM notas_ajuste_comercial WHERE numero_nota = ?", (num_dev,))
    conn.commit()
    conn.close()

    print("\n==================================================")
    print(" 🎯 TODOS LOS TESTS PASARON EXITOSAMENTE (100% OK)")
    print("==================================================")

if __name__ == "__main__":
    run_tests()
