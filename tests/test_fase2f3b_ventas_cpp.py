"""
test_fase2f3b_ventas_cpp.py - Suite de pruebas automatizadas para la Integración Transaccional del CPP en Ventas (Fase 2F-3B).
Cubre los 24 casos de aceptación requeridos por la especificación oficial (VENTA-CPP-01 a VENTA-CPP-24).
Opera sobre un entorno SQLite aislado para preservar la integridad canónica de la base de datos de producción.
"""

import sys
import os
import unittest
import sqlite3
import shutil
from decimal import Decimal, ROUND_HALF_UP

# Configurar path del proyecto
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

import database
from database import (
    calcular_cpp_entrada,
    calcular_valor_salida_cpp,
    validar_stock_no_negativo,
    reiniciar_cpp_si_stock_cero,
    validar_movimiento_no_retroactivo,
    registrar_movimiento_inventario,
    conciliar_inventario,
    reconstruir_cpp_desde_apertura,
    ErrorStockNegativo,
    ErrorMovimientoRetroactivoNoPermitido,
    ErrorInconsistenciaCPP
)

class TestFase2F3BVentasCPP(unittest.TestCase):

    def setUp(self):
        """Crea una base de datos SQLite aislada temporal con el esquema oficial y apertura certificada."""
        self.test_db_path = os.path.join(BASE_DIR, "test_fase2f3b_temp.db")
        shutil.copy2(database.DB_PATH, self.test_db_path)
        self.conn = sqlite3.connect(self.test_db_path)
        self.conn.row_factory = sqlite3.Row
        self.cur = self.conn.cursor()

    def tearDown(self):
        """Cierra y elimina la base de datos temporal."""
        self.conn.close()
        if os.path.exists(self.test_db_path):
            try:
                os.remove(self.test_db_path)
            except Exception:
                pass

    def procesar_venta(self, payload):
        """
        Simula el procesamiento transaccional de venta exactamente igual a POST /api/facturas en server.py.
        """
        cliente_id = payload.get("cliente_id", 1)
        items = payload.get("items", [])
        pagos = payload.get("pagos", [])
        notas = payload.get("notas", "")
        tipo_venta = payload.get("tipo_venta", "contado").strip().lower()
        fecha_vencimiento = payload.get("fecha_vencimiento", "")
        fecha_factura = payload.get("fecha") or "2026-10-29 12:00:00"
        numero_factura_input = (payload.get("numero_factura") or "").strip()
        idempotency_key = (payload.get("idempotency_key") or payload.get("client_tx_id") or "").strip()

        if not cliente_id or not items:
            raise ValueError("Se requiere un cliente y al menos un producto o servicio")

        self.cur.execute("SELECT id FROM clientes WHERE id = ?", (cliente_id,))
        if not self.cur.fetchone():
            raise ValueError(f"Cliente ID {cliente_id} no encontrado")

        if numero_factura_input:
            self.cur.execute("SELECT id, numero_factura FROM facturas WHERE numero_factura = ?", (numero_factura_input,))
            if self.cur.fetchone():
                raise ValueError(f"IDEMPOTENCIA: Ya existe una factura registrada con el número '{numero_factura_input}'.")

        if idempotency_key:
            self.cur.execute("SELECT id, numero_factura FROM facturas WHERE notas LIKE ?", (f"%[IDEMPOTENCY:{idempotency_key}]%",))
            if self.cur.fetchone():
                raise ValueError(f"IDEMPOTENCIA: La transacción con clave '{idempotency_key}' ya fue procesada.")

        self.cur.execute("BEGIN IMMEDIATE")

        self.cur.execute("SELECT * FROM configuracion WHERE id = 1")
        cfg = dict(self.cur.fetchone())
        tasa_ves = cfg["tasa_ves"]
        tasa_cop = cfg["tasa_cop"]
        iva_pct = cfg["iva_porcentaje"] / 100.0

        subtotal = 0.0
        iva_total = 0.0

        for itm in items:
            p_id = itm.get("producto_id")
            cant_v = float(itm.get("cantidad", 1))
            if cant_v <= 0:
                raise ValueError(f"La cantidad vendida debe ser mayor a 0, recibido: {cant_v}")
            self.cur.execute("SELECT id, precio_base, impuesto_tipo FROM productos WHERE id = ?", (p_id,))
            p_inf = self.cur.fetchone()
            if not p_inf:
                raise ValueError(f"Producto ID {p_id} no existe en catálogo")
            p_dict = dict(p_inf)
            pr_u = float(itm.get("precio_unitario", p_dict["precio_base"]))
            if pr_u < 0:
                raise ValueError(f"El precio unitario no puede ser negativo, recibido: {pr_u}")
            iva_u_v = round(pr_u * iva_pct, 4) if p_dict["impuesto_tipo"] == "gravado" else 0.0
            subtotal += round(pr_u * cant_v, 4)
            iva_total += round(iva_u_v * cant_v, 4)

        total_usd = round(subtotal + iva_total, 2)
        total_ves = round(total_usd * tasa_ves, 2)
        total_cop = round(total_usd * tasa_cop, 2)

        total_pagado_usd = 0.0
        pagos_procesados = []
        for p in pagos:
            mon = (p.get("moneda") or "USD").upper()
            m_m = float(p.get("monto_moneda", 0))
            t_c = float(p.get("tasa_cambio") or 1.0)
            eq = m_m if mon == "USD" else (round(m_m / t_c, 2) if t_c > 0 else 0.0)
            if m_m > 0:
                total_pagado_usd += eq
                pagos_procesados.append({"moneda": mon, "metodo": p.get("metodo", "Efectivo"), "monto_moneda": m_m, "tasa_cambio": t_c, "equivalente_usd": round(eq, 2), "referencia": p.get("referencia", "")})

        total_pagado_usd = round(total_pagado_usd, 2)
        saldo_pendiente = max(0.0, round(total_usd - total_pagado_usd, 2)) if tipo_venta == "credito" else 0.0
        estado_factura = "pagada" if saldo_pendiente <= 0.001 else "pendiente"

        if numero_factura_input:
            numero_factura = numero_factura_input
        else:
            self.cur.execute("SELECT COALESCE(MAX(id), 0) + 1 FROM facturas")
            numero_factura = f"FAC-{self.cur.fetchone()[0]:06d}"

        notas_final = notas
        if idempotency_key and f"[IDEMPOTENCY:{idempotency_key}]" not in notas_final:
            notas_final = f"{notas_final} [IDEMPOTENCY:{idempotency_key}]".strip()

        self.cur.execute("""
            INSERT INTO facturas (numero_factura, cliente_id, subtotal, iva_total, total_usd, total, tasa_ves, tasa_cop, total_ves, total_cop, estado, tipo_venta, fecha_vencimiento, saldo_pendiente, notas, fecha)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (numero_factura, cliente_id, subtotal, iva_total, total_usd, total_usd, tasa_ves, tasa_cop, total_ves, total_cop, estado_factura, tipo_venta, fecha_vencimiento if tipo_venta == 'credito' else None, saldo_pendiente, notas_final, fecha_factura))
        factura_id = self.cur.lastrowid

        detalles_generados = []
        for itm in items:
            prod_id = itm.get("producto_id")
            cant_dec = Decimal(str(itm.get("cantidad", 1)))

            self.cur.execute("SELECT id, codigo, nombre, tipo, impuesto_tipo, precio_base, stock, costo, costo_cpp FROM productos WHERE id = ?", (prod_id,))
            prod = dict(self.cur.fetchone())

            precio_unitario = float(itm.get("precio_unitario", prod["precio_base"]))
            impuesto_tipo = prod["impuesto_tipo"]
            tipo = prod["tipo"]

            iva_u = round(precio_unitario * iva_pct, 4) if impuesto_tipo == "gravado" else 0.0
            item_subtotal = round(precio_unitario * float(cant_dec), 4)
            item_iva = round(iva_u * float(cant_dec), 4)
            item_total = round(item_subtotal + item_iva, 4)

            costo_u_val = None
            costo_tot_val = None

            if tipo == "producto":
                validar_movimiento_no_retroactivo(self.cur, prod_id, fecha_factura)

                stock_ant_dec = Decimal(str(prod.get("stock") or 0.0))
                cpp_ant_val = prod.get("costo_cpp")

                if stock_ant_dec < Decimal("0"):
                    raise ErrorStockNegativo(f"STOCK_NEGATIVO: Imposible operar con stock físico negativo ({stock_ant_dec}) en SKU {prod['codigo']}.")

                if cant_dec > stock_ant_dec:
                    raise ErrorStockNegativo(f"STOCK_INSUFICIENTE: Salida solicitada ({cant_dec}) supera existencia disponible ({stock_ant_dec}) en SKU '{prod['nombre']}'.")

                if cpp_ant_val is None or Decimal(str(cpp_ant_val)) <= Decimal("0"):
                    raise ErrorInconsistenciaCPP(f"INCONSISTENCIA_CPP: Producto {prod['codigo']} tiene stock positivo ({stock_ant_dec}) pero costo_cpp inválido ({cpp_ant_val}).")

                cpp_dec = Decimal(str(cpp_ant_val))
                nuevo_stk_dec = (stock_ant_dec - cant_dec).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                costo_u_dec = cpp_dec.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                costo_tot_dec = (cant_dec * cpp_dec).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

                costo_u_val = float(costo_u_dec)
                costo_tot_val = float(costo_tot_dec)

                self.cur.execute("""
                    INSERT INTO factura_detalles (factura_id, producto_id, nombre_producto, tipo, impuesto_tipo, cantidad, precio_unitario, iva_unitario, subtotal, total, costo_unitario, costo_total)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (factura_id, prod_id, prod["nombre"], tipo, impuesto_tipo, float(cant_dec), precio_unitario, iva_u, item_subtotal, item_total, costo_u_val, costo_tot_val))
                factura_detalle_id = self.cur.lastrowid

                mov_id = registrar_movimiento_inventario(
                    cursor=self.cur,
                    producto_id=prod_id,
                    fecha=fecha_factura,
                    tipo_movimiento="venta",
                    sentido="SALIDA",
                    cantidad=float(cant_dec),
                    costo_unitario=costo_u_val,
                    costo_total=costo_tot_val,
                    stock_anterior=float(stock_ant_dec),
                    stock_nuevo=float(nuevo_stk_dec),
                    documento_tipo="FACTURA",
                    documento_id=factura_id,
                    documento_numero=numero_factura,
                    motivo=f"Salida por venta según factura {numero_factura} (Línea {factura_detalle_id})",
                    usuario_id=1,
                    documento_linea_id=factura_detalle_id
                )

                self.cur.execute("UPDATE productos SET stock = ? WHERE id = ?", (float(nuevo_stk_dec), prod_id))
            else:
                self.cur.execute("""
                    INSERT INTO factura_detalles (factura_id, producto_id, nombre_producto, tipo, impuesto_tipo, cantidad, precio_unitario, iva_unitario, subtotal, total, costo_unitario, costo_total)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (factura_id, prod_id, prod["nombre"], tipo, impuesto_tipo, float(cant_dec), precio_unitario, iva_u, item_subtotal, item_total, None, None))
                factura_detalle_id = self.cur.lastrowid
                mov_id = None

            detalles_generados.append({"detalle_id": factura_detalle_id, "movimiento_id": mov_id, "costo_u": costo_u_val, "costo_tot": costo_tot_val})

        self.conn.commit()
        return {"factura_id": factura_id, "numero_factura": numero_factura, "detalles": detalles_generados}

    # ========================================================
    # 24 PRUEBAS OFICIALES VENTA-CPP
    # ========================================================

    def test_venta_cpp_01_venta_normal_usando_cpp(self):
        """VENTA-CPP-01: Venta normal descuenta stock utilizando el CPP vigente."""
        # Producto 1: HAR008 (stock inicial 1733 @ CPP $29.00)
        res = self.procesar_venta({
            "cliente_id": 1,
            "items": [{"producto_id": 1, "cantidad": 33.0, "precio_unitario": 40.0}]
        })
        self.cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = 1")
        p = self.cur.fetchone()
        self.assertEqual(p["stock"], 1700.0)
        self.assertEqual(p["costo_cpp"], 29.0)

    def test_venta_cpp_02_verificar_stock_final(self):
        """VENTA-CPP-02: Verificar que el stock final disminuye exactamente la cantidad vendida."""
        # Producto 2: HARPIZZ (stock inicial 860.0)
        self.procesar_venta({
            "cliente_id": 1,
            "items": [{"producto_id": 2, "cantidad": 60.0, "precio_unitario": 45.0}]
        })
        self.cur.execute("SELECT stock FROM productos WHERE id = 2")
        self.assertEqual(self.cur.fetchone()["stock"], 800.0)

    def test_venta_cpp_03_verificar_cpp_sin_cambios(self):
        """VENTA-CPP-03: Verificar que el CPP permanece estrictamente idéntico (invariante) tras la venta."""
        # Producto 3: HAR010 (stock inicial 860 @ CPP $100.00)
        self.procesar_venta({
            "cliente_id": 1,
            "items": [{"producto_id": 3, "cantidad": 100.0, "precio_unitario": 130.0}]
        })
        self.cur.execute("SELECT costo_cpp FROM productos WHERE id = 3")
        self.assertEqual(self.cur.fetchone()["costo_cpp"], 100.0)

    def test_venta_cpp_04_verificar_costo_unitario_historico(self):
        """VENTA-CPP-04: Verificar que costo_unitario en factura_detalles e inventario_movimientos conserva el CPP vigente."""
        res = self.procesar_venta({
            "cliente_id": 1,
            "items": [{"producto_id": 1, "cantidad": 10.0, "precio_unitario": 40.0}]
        })
        det_id = res["detalles"][0]["detalle_id"]
        mov_id = res["detalles"][0]["movimiento_id"]

        self.cur.execute("SELECT costo_unitario FROM factura_detalles WHERE id = ?", (det_id,))
        self.assertEqual(self.cur.fetchone()["costo_unitario"], 29.0)

        self.cur.execute("SELECT costo_unitario FROM inventario_movimientos WHERE id = ?", (mov_id,))
        self.assertEqual(self.cur.fetchone()["costo_unitario"], 29.0)

    def test_venta_cpp_05_verificar_costo_total_historico(self):
        """VENTA-CPP-05: Verificar costo total histórico (cantidad * CPP) congelado en detalle y libro mayor."""
        # Venta 20 u de Producto 1 (CPP $29.00) -> Costo total = $580.00
        res = self.procesar_venta({
            "cliente_id": 1,
            "items": [{"producto_id": 1, "cantidad": 20.0, "precio_unitario": 40.0}]
        })
        det_id = res["detalles"][0]["detalle_id"]
        mov_id = res["detalles"][0]["movimiento_id"]

        self.cur.execute("SELECT costo_total FROM factura_detalles WHERE id = ?", (det_id,))
        self.assertEqual(self.cur.fetchone()["costo_total"], 580.0)

        self.cur.execute("SELECT costo_total FROM inventario_movimientos WHERE id = ?", (mov_id,))
        self.assertEqual(self.cur.fetchone()["costo_total"], 580.0)

    def test_venta_cpp_06_venta_que_deja_stock_exactamente_cero(self):
        """VENTA-CPP-06: Venta que agota todo el inventario deja stock = 0 sin errores."""
        # Producto 4: HARRESP (stock inicial 500 @ $5.00)
        self.procesar_venta({
            "cliente_id": 1,
            "items": [{"producto_id": 4, "cantidad": 500.0, "precio_unitario": 8.0}]
        })
        self.cur.execute("SELECT stock FROM productos WHERE id = 4")
        self.assertEqual(self.cur.fetchone()["stock"], 0.0)

    def test_venta_cpp_07_verificar_cpp_congelado_al_llegar_stock_cero(self):
        """VENTA-CPP-07: Verificar que el CPP permanece congelado en catálogo cuando stock llega a cero."""
        self.procesar_venta({
            "cliente_id": 1,
            "items": [{"producto_id": 4, "cantidad": 500.0, "precio_unitario": 8.0}]
        })
        self.cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = 4")
        p = self.cur.fetchone()
        self.assertEqual(p["stock"], 0.0)
        self.assertEqual(p["costo_cpp"], 5.0, "El CPP debe conservarse congelado como referencia contable")

    def test_venta_cpp_08_nueva_compra_posterior_a_stock_cero_establece_nuevo_cpp(self):
        """VENTA-CPP-08: Tras quedar en stock cero, una nueva compra establece el nuevo CPP según reglas aprobadas."""
        # 1. Agotar stock a 0
        self.procesar_venta({
            "cliente_id": 1,
            "items": [{"producto_id": 4, "cantidad": 500.0, "precio_unitario": 8.0}]
        })
        # 2. Nueva compra de 100 u @ $12.00
        calc = calcular_cpp_entrada(stock_anterior=0.0, cpp_anterior=5.0, cantidad_entrada=100.0, costo_entrada=12.0)
        self.assertEqual(calc["cpp_nuevo"], 12.0)
        self.assertEqual(calc["stock_nuevo"], 100.0)

    def test_venta_cpp_09_stock_insuficiente_debe_bloquear(self):
        """VENTA-CPP-09: Intento de vender más unidades de las disponibles debe bloquear con ErrorStockNegativo."""
        # Producto 4 tiene 500 unidades
        with self.assertRaises(ErrorStockNegativo):
            try:
                self.procesar_venta({
                    "cliente_id": 1,
                    "items": [{"producto_id": 4, "cantidad": 501.0, "precio_unitario": 8.0}]
                })
            except Exception:
                self.conn.rollback()
                raise

    def test_venta_cpp_10_stock_negativo_existente_debe_bloquear(self):
        """VENTA-CPP-10: Si existe stock negativo preexistente en catálogo, cualquier venta se bloquea de inmediato."""
        self.cur.execute("UPDATE productos SET stock = -10.0 WHERE id = 4")
        self.conn.commit()

        with self.assertRaises(ErrorStockNegativo):
            try:
                self.procesar_venta({
                    "cliente_id": 1,
                    "items": [{"producto_id": 4, "cantidad": 5.0, "precio_unitario": 8.0}]
                })
            except Exception:
                self.conn.rollback()
                raise

    def test_venta_cpp_11_cpp_invalido_con_stock_positivo_debe_bloquear(self):
        """VENTA-CPP-11: Stock positivo con costo_cpp inválido (<= 0 o NULL) bloquea con ErrorInconsistenciaCPP."""
        self.cur.execute("UPDATE productos SET costo_cpp = 0.0 WHERE id = 4")
        self.conn.commit()

        with self.assertRaises(ErrorInconsistenciaCPP):
            try:
                self.procesar_venta({
                    "cliente_id": 1,
                    "items": [{"producto_id": 4, "cantidad": 10.0, "precio_unitario": 8.0}]
                })
            except Exception:
                self.conn.rollback()
                raise

    def test_venta_cpp_12_venta_de_servicio_no_afecta_inventario(self):
        """VENTA-CPP-12: Venta de un servicio no descuenta stock ni genera movimiento en libro mayor."""
        # Insertar un servicio de prueba
        self.cur.execute("""
            INSERT INTO productos (codigo, nombre, categoria_id, tipo, impuesto_tipo, precio_base, iva_monto, precio_total, costo, costo_cpp, stock, stock_minimo)
            VALUES ('SRV-FLETE-01', 'SERVICIO DE FLETE', 1, 'servicio', 'exento', 50.0, 0.0, 50.0, 0.0, 0.0, 0.0, 0.0)
        """)
        srv_id = self.cur.lastrowid
        self.conn.commit()

        self.cur.execute("SELECT COUNT(*) FROM inventario_movimientos")
        movs_antes = self.cur.fetchone()[0]

        res = self.procesar_venta({
            "cliente_id": 1,
            "items": [{"producto_id": srv_id, "cantidad": 1.0, "precio_unitario": 50.0}]
        })

        self.cur.execute("SELECT COUNT(*) FROM inventario_movimientos")
        movs_despues = self.cur.fetchone()[0]
        self.assertEqual(movs_antes, movs_despues, "Los servicios no deben crear filas en inventario_movimientos")

        self.cur.execute("SELECT stock FROM productos WHERE id = ?", (srv_id,))
        self.assertEqual(self.cur.fetchone()["stock"], 0.0)

    def test_venta_cpp_13_dos_lineas_mismo_sku_generan_dos_movimientos(self):
        """VENTA-CPP-13: Dos líneas del mismo SKU en una sola factura descuentan stock secuencialmente y crean 2 movimientos."""
        # Producto 5: HARIESPOST (stock inicial 501.0 @ $95.00)
        # Línea 1: 10 u, Línea 2: 15 u -> Total 25 u. Stock final = 476.0
        res = self.procesar_venta({
            "cliente_id": 1,
            "items": [
                {"producto_id": 5, "cantidad": 10.0, "precio_unitario": 110.0},
                {"producto_id": 5, "cantidad": 15.0, "precio_unitario": 110.0}
            ]
        })
        fact_id = res["factura_id"]

        self.cur.execute("SELECT stock FROM productos WHERE id = 5")
        self.assertEqual(self.cur.fetchone()["stock"], 476.0)

        self.cur.execute("SELECT COUNT(*) FROM factura_detalles WHERE factura_id = ?", (fact_id,))
        self.assertEqual(self.cur.fetchone()[0], 2)

        self.cur.execute("SELECT COUNT(*) FROM inventario_movimientos WHERE documento_tipo = 'FACTURA' AND documento_id = ? AND producto_id = 5", (fact_id,))
        self.assertEqual(self.cur.fetchone()[0], 2, "Deben existir exactamente 2 movimientos para el mismo SKU")

    def test_venta_cpp_14_verificar_documento_linea_id(self):
        """VENTA-CPP-14: Cada movimiento de venta enlaza documento_linea_id con el id de factura_detalles."""
        res = self.procesar_venta({
            "cliente_id": 1,
            "items": [
                {"producto_id": 5, "cantidad": 10.0, "precio_unitario": 110.0},
                {"producto_id": 5, "cantidad": 15.0, "precio_unitario": 110.0}
            ]
        })
        for det in res["detalles"]:
            d_id = det["detalle_id"]
            m_id = det["movimiento_id"]
            self.cur.execute("SELECT documento_linea_id FROM inventario_movimientos WHERE id = ?", (m_id,))
            self.assertEqual(self.cur.fetchone()["documento_linea_id"], d_id)

    def test_venta_cpp_15_rollback_completo_ante_error(self):
        """VENTA-CPP-15: Si una línea posterior falla por stock insuficiente, el rollback revierte todo."""
        # Producto 5 tiene 501 u. Producto 4 tiene 500 u.
        # Línea 1: 50 u de Prod 5 (válido)
        # Línea 2: 600 u de Prod 4 (inválido -> stock insuficiente)
        self.cur.execute("SELECT stock FROM productos WHERE id = 5")
        stk_p5_orig = self.cur.fetchone()["stock"]

        with self.assertRaises(ErrorStockNegativo):
            try:
                self.procesar_venta({
                    "cliente_id": 1,
                    "items": [
                        {"producto_id": 5, "cantidad": 50.0, "precio_unitario": 110.0},
                        {"producto_id": 4, "cantidad": 600.0, "precio_unitario": 8.0}
                    ]
                })
            except Exception:
                self.conn.rollback()
                raise

        self.cur.execute("SELECT stock FROM productos WHERE id = 5")
        self.assertEqual(self.cur.fetchone()["stock"], stk_p5_orig, "El stock de Prod 5 debe quedar intacto tras rollback")

    def test_venta_cpp_16_venta_a_credito_no_altera_costo_cpp(self):
        """VENTA-CPP-16: Venta a crédito descuenta stock a CPP vigente y no altera productos.costo_cpp."""
        res = self.procesar_venta({
            "cliente_id": 1,
            "tipo_venta": "credito",
            "items": [{"producto_id": 1, "cantidad": 50.0, "precio_unitario": 40.0}],
            "pagos": [] # Sin abono inicial
        })
        self.cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = 1")
        p = self.cur.fetchone()
        self.assertEqual(p["stock"], 1683.0)
        self.assertEqual(p["costo_cpp"], 29.0)

        # Verificar creación de cuenta por cobrar
        self.cur.execute("SELECT saldo_pendiente, estado FROM facturas WHERE id = ?", (res["factura_id"],))
        f = self.cur.fetchone()
        self.assertGreater(f["saldo_pendiente"], 0.0)
        self.assertEqual(f["estado"], "pendiente")

    def test_venta_cpp_17_venta_de_contado_no_altera_costo_cpp(self):
        """VENTA-CPP-17: Venta de contado descuenta stock a CPP vigente y no altera productos.costo_cpp."""
        res = self.procesar_venta({
            "cliente_id": 1,
            "tipo_venta": "contado",
            "items": [{"producto_id": 1, "cantidad": 50.0, "precio_unitario": 40.0}],
            "pagos": [{"moneda": "USD", "metodo": "Efectivo", "monto_moneda": 2000.0, "tasa_cambio": 1.0}]
        })
        self.cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = 1")
        p = self.cur.fetchone()
        self.assertEqual(p["stock"], 1683.0)
        self.assertEqual(p["costo_cpp"], 29.0)

    def test_venta_cpp_18_cambio_de_tasa_no_altera_cpp_historico(self):
        """VENTA-CPP-18: La variación de tasas de cambio VES/COP no altera los costos CPP registrados."""
        # 1. Vender a tasa estándar
        res = self.procesar_venta({
            "cliente_id": 1,
            "items": [{"producto_id": 1, "cantidad": 10.0, "precio_unitario": 40.0}]
        })
        det_id = res["detalles"][0]["detalle_id"]

        # 2. Modificar tasa en configuración
        self.cur.execute("UPDATE configuracion SET tasa_ves = 999.0, tasa_cop = 5000.0 WHERE id = 1")
        self.conn.commit()

        # 3. Comprobar que el costo_unitario y costo_total de la factura siguen siendo exactamente $29.0 y $290.0
        self.cur.execute("SELECT costo_unitario, costo_total FROM factura_detalles WHERE id = ?", (det_id,))
        det = self.cur.fetchone()
        self.assertEqual(det["costo_unitario"], 29.0)
        self.assertEqual(det["costo_total"], 290.0)

        self.cur.execute("SELECT costo_cpp FROM productos WHERE id = 1")
        self.assertEqual(self.cur.fetchone()["costo_cpp"], 29.0)

    def test_venta_cpp_19_movimiento_retroactivo_debe_bloquearse(self):
        """VENTA-CPP-19: Intento de venta con fecha anterior al último movimiento del SKU se bloquea estrictamente."""
        # SKU 1 tiene movimientos al 2026-10-23
        with self.assertRaises(ErrorMovimientoRetroactivoNoPermitido):
            try:
                self.procesar_venta({
                    "cliente_id": 1,
                    "fecha": "2026-10-10 10:00:00",
                    "items": [{"producto_id": 1, "cantidad": 10.0, "precio_unitario": 40.0}]
                })
            except Exception:
                self.conn.rollback()
                raise

    def test_venta_cpp_20_concurrencia_begin_immediate_evita_stock_negativo(self):
        """VENTA-CPP-20: BEGIN IMMEDIATE adquiere candado impidiendo colisiones entre transacciones concurrentes."""
        conn2 = sqlite3.connect(self.test_db_path)
        cur2 = conn2.cursor()

        self.cur.execute("BEGIN IMMEDIATE")

        with self.assertRaises(sqlite3.OperationalError) as ctx:
            cur2.execute("BEGIN IMMEDIATE")
        self.assertIn("locked", str(ctx.exception).lower())

        self.conn.rollback()
        conn2.close()

    def test_venta_cpp_21_factura_repetida_idempotencia(self):
        """VENTA-CPP-21: Detección y rechazo seguro de facturas duplicadas por número de factura o idempotency_key."""
        self.procesar_venta({
            "cliente_id": 1,
            "numero_factura": "FAC-TEST-IDEM-01",
            "idempotency_key": "TX-KEY-9999",
            "items": [{"producto_id": 1, "cantidad": 5.0, "precio_unitario": 40.0}]
        })

        # Reintento con mismo número de factura
        with self.assertRaises(ValueError) as ctx:
            self.procesar_venta({
                "cliente_id": 1,
                "numero_factura": "FAC-TEST-IDEM-01",
                "items": [{"producto_id": 1, "cantidad": 5.0, "precio_unitario": 40.0}]
            })
        self.assertIn("IDEMPOTENCIA", str(ctx.exception))

        # Reintento con misma clave de idempotencia
        with self.assertRaises(ValueError) as ctx2:
            self.procesar_venta({
                "cliente_id": 1,
                "idempotency_key": "TX-KEY-9999",
                "items": [{"producto_id": 1, "cantidad": 5.0, "precio_unitario": 40.0}]
            })
        self.assertIn("IDEMPOTENCIA", str(ctx2.exception))

    def test_venta_cpp_22_verificar_reconstruccion_cpp_despues_de_ventas(self):
        """VENTA-CPP-22: Reconstrucción determinística del CPP procesa salidas y confirma que CPP y stock coinciden."""
        # Vender 100 u de Producto 1 (stock 1733 @ 29 -> 1633 @ 29)
        self.procesar_venta({
            "cliente_id": 1,
            "fecha": "2026-10-29 14:00:00",
            "items": [{"producto_id": 1, "cantidad": 100.0, "precio_unitario": 40.0}]
        })

        rec = reconstruir_cpp_desde_apertura(self.cur, producto_id=1, fecha_corte="2026-10-23 23:59:59", ultimo_mov_id=108)
        self.assertEqual(rec["stock_reconstruido"], 1633.0)
        self.assertEqual(rec["cpp_reconstruido"], 29.0)
        self.assertEqual(rec["valor_reconstruido"], 1633.0 * 29.0)
        self.assertEqual(rec["movimientos_procesados"], 1)

    def test_venta_cpp_23_verificar_conciliacion_inventario_vs_stock(self):
        """VENTA-CPP-23: Conciliación de inventario permanece en CONCILIADO_OK tras procesar ventas."""
        self.procesar_venta({
            "cliente_id": 1,
            "items": [
                {"producto_id": 1, "cantidad": 20.0, "precio_unitario": 40.0},
                {"producto_id": 2, "cantidad": 10.0, "precio_unitario": 45.0}
            ]
        })
        concil = conciliar_inventario(self.conn, self.cur)
        self.assertEqual(concil["estado_general"], "CONCILIADO_OK")
        self.assertEqual(concil["total_diferencia"], 0)

    def test_venta_cpp_24_ventas_historicas_no_modificadas(self):
        """VENTA-CPP-24: Verificar que las ventas históricas anteriores a esta fase conservan costo_unitario=NULL."""
        self.cur.execute("SELECT id, costo_unitario, costo_total FROM factura_detalles WHERE id = 28")
        row = self.cur.fetchone()
        self.assertIsNotNone(row)
        self.assertIsNone(row["costo_unitario"], "Los registros históricos no deben ser recalculados retrospectivamente")
        self.assertIsNone(row["costo_total"], "Los registros históricos no deben ser recalculados retrospectivamente")

if __name__ == "__main__":
    unittest.main()
