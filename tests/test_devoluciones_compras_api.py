import os
import sys
import json
import urllib.request
import urllib.error
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

import server
import database

def run_api_tests():
    print("==================================================")
    print(" INICIANDO TEST API: ENDPOINTS DEVOLUCIONES COMPRAS")
    print("==================================================")

    # 1. Start server in background thread on port 8095
    port = 8095
    os.environ["PORT"] = str(port)
    os.environ["RENDER"] = "1"
    server.PORT = port
    server_thread = threading.Thread(target=server.run_server, daemon=True)
    server_thread.start()
    time.sleep(1.5)

    base_url = f"http://127.0.0.1:{port}"

    # 2. Test GET /api/devoluciones-compras
    print("\n--- Test 1: GET /api/devoluciones-compras ---")
    req = urllib.request.Request(f"{base_url}/api/devoluciones-compras")
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode('utf-8'))
        print(f"✅ Status 200 OK: {len(data)} devoluciones listadas.")

    # 3. Preparar compra de prueba
    conn = database.get_connection()
    c = conn.cursor()
    c.execute("SELECT id FROM proveedores LIMIT 1")
    prov_id = c.fetchone()[0]
    c.execute("SELECT id, nombre, stock FROM productos WHERE tipo = 'producto' LIMIT 1")
    p_row = c.fetchone()
    prod_id = p_row[0]
    prod_nom = p_row[1]
    stock_ini = float(p_row[2] or 0.0)

    # Insertar compra
    c.execute("""
        INSERT INTO compras (numero_control, numero_factura, proveedor_id, subtotal, iva_total, total, tipo_compra, saldo_pendiente, estado)
        VALUES ('CTRL-API-001', 'FACT-API-001', ?, 50.0, 0.0, 50.0, 'credito', 50.0, 'activa')
    """, (prov_id,))
    compra_id = c.lastrowid

    c.execute("""
        INSERT INTO compra_detalles (compra_id, producto_id, nombre_producto, cantidad, costo_unitario, impuesto_tipo, iva_unitario, total)
        VALUES (?, ?, ?, 5.0, 10.0, 'exento', 0.0, 50.0)
    """, (compra_id, prod_id, prod_nom))
    cd_id = c.lastrowid

    c.execute("""
        INSERT INTO cuentas_por_pagar (compra_id, proveedor_id, descripcion_concepto, numero_factura, monto_total, monto_pagado, saldo_pendiente, fecha_emision, fecha_vencimiento, estado)
        VALUES (?, ?, 'Compra API Test', 'FACT-API-001', 50.0, 0.0, 50.0, date('now'), date('now', '+30 days'), 'pendiente')
    """, (compra_id, prov_id))
    cxp_id = c.lastrowid

    # Incrementar stock
    c.execute("UPDATE productos SET stock = stock + 5 WHERE id = ?", (prod_id,))
    conn.commit()
    conn.close()

    # 4. Test GET /api/compras/{id}/items-para-devolucion
    print("\n--- Test 2: GET /api/compras/{id}/items-para-devolucion ---")
    req = urllib.request.Request(f"{base_url}/api/compras/{compra_id}/items-para-devolucion")
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        comp_info = json.loads(resp.read().decode('utf-8'))
        assert comp_info["id"] == compra_id
        assert len(comp_info["items"]) == 1
        itm = comp_info["items"][0]
        assert itm["cantidad_comprada"] == 5.0
        assert itm["cantidad_disponible"] == 5.0
        print(f"✅ Items para devolución verificados: {itm['prod_nombre']}, disponible={itm['cantidad_disponible']}, stock_almacén={itm['stock_almacen']}")

    # 5. Test POST /api/devoluciones-compras (Devolución válida de 2 unidades)
    print("\n--- Test 3: POST /api/devoluciones-compras ---")
    payload = {
        "compra_id": compra_id,
        "proveedor_id": prov_id,
        "motivo": "Devolución test HTTP API",
        "items": [{
            "compra_detalle_id": cd_id,
            "producto_id": prod_id,
            "cantidad": 2.0,
            "costo_unitario": 10.0
        }]
    }
    req = urllib.request.Request(
        f"{base_url}/api/devoluciones-compras",
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        res_post = json.loads(resp.read().decode('utf-8'))
        assert res_post["success"] is True
        dev_id = res_post["devolucion_id"]
        num_dev = res_post["numero_devolucion"]
        assert res_post["total_usd"] == 20.0
        assert res_post["monto_descontado_cxp"] == 20.0
        print(f"✅ POST exitoso: Devolución #{num_dev} registrada (Total ${res_post['total_usd']:.2f}, CxP rebajada en ${res_post['monto_descontado_cxp']:.2f})")

    # 6. Test GET /api/devoluciones-compras/{id}
    print("\n--- Test 4: GET /api/devoluciones-compras/{id} ---")
    req = urllib.request.Request(f"{base_url}/api/devoluciones-compras/{dev_id}")
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        dev_detail = json.loads(resp.read().decode('utf-8'))
        assert dev_detail["id"] == dev_id
        assert len(dev_detail["detalles"]) == 1
        print(f"✅ Detalle de devolución verificado: {dev_detail['numero_devolucion']} con {len(dev_detail['detalles'])} ítems.")

    # 7. Test POST /api/devoluciones-compras/{id}/anular
    print("\n--- Test 5: POST /api/devoluciones-compras/{id}/anular ---")
    anular_payload = {"motivo": "Prueba de anulación API"}
    req = urllib.request.Request(
        f"{base_url}/api/devoluciones-compras/{dev_id}/anular",
        data=json.dumps(anular_payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        res_anu = json.loads(resp.read().decode('utf-8'))
        assert res_anu["success"] is True
        assert res_anu["estado"] == "anulada"
        print(f"✅ Anulación exitosa: Devolución #{num_dev} anulada y revertida.")

    # Limpiar datos de prueba
    conn = database.get_connection()
    c = conn.cursor()
    c.execute("DELETE FROM devolucion_compra_detalles WHERE devolucion_compra_id = ?", (dev_id,))
    c.execute("DELETE FROM devoluciones_compras WHERE id = ?", (dev_id,))
    c.execute("DELETE FROM inventario_movimientos WHERE documento_tipo = 'DEVOLUCION_COMPRA' AND documento_id = ?", (dev_id,))
    c.execute("DELETE FROM inventario_movimientos WHERE documento_tipo = 'compra' AND documento_id = ?", (compra_id,))
    c.execute("DELETE FROM compra_detalles WHERE compra_id = ?", (compra_id,))
    c.execute("DELETE FROM cuentas_por_pagar WHERE id = ?", (cxp_id,))
    c.execute("DELETE FROM compras WHERE id = ?", (compra_id,))
    c.execute("UPDATE productos SET stock = ? WHERE id = ?", (stock_ini, prod_id))
    c.execute("DELETE FROM notas_ajuste_comercial WHERE numero_nota = ?", (num_dev,))
    conn.commit()
    conn.close()

    print("\n==================================================")
    print(" 🎯 TODOS LOS TESTS DE API HTTP PASARON (100% OK)")
    print("==================================================")

if __name__ == "__main__":
    run_api_tests()
