"""
test_fase2f4b_devoluciones_cpp.py - Suite de pruebas automatizadas para la Integración Transaccional del CPP en Devoluciones (Fase 2F-4B).
Cubre los 20 casos de aceptación requeridos por la especificación oficial (DEV-CPP-01 a DEV-CPP-20).
Opera sobre un entorno SQLite aislado para preservar la integridad canónica de la base de datos de producción.
"""

import sys
import os
import unittest
import sqlite3
import shutil
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime

# Configurar path del proyecto
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

import database
from database import (
    calcular_cpp_entrada,
    calcular_valor_salida_cpp,
    validar_stock_no_negativo,
    validar_movimiento_no_retroactivo,
    registrar_movimiento_inventario,
    conciliar_inventario,
    reconstruir_cpp_desde_apertura,
    ErrorStockNegativo,
    ErrorMovimientoRetroactivoNoPermitido,
    ErrorInconsistenciaCPP,
    ErrorCostoHistoricoNoRecuperable,
    ErrorCantidadDevolucionExcedeDisponible
)

class TestFase2F4BDevolucionesCPP(unittest.TestCase):

    def setUp(self):
        """Crea una base de datos SQLite aislada temporal con el esquema oficial y apertura certificada."""
        self.test_db_path = os.path.join(BASE_DIR, "test_fase2f4b_temp.db")
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
        """Simula exactamente la lógica transaccional de venta de POST /api/facturas en server.py."""
        cliente_id = payload.get("cliente_id", 1)
        items = payload.get("items", [])
        pagos = payload.get("pagos", [])
        notas = payload.get("notas", "")
        tipo_venta = payload.get("tipo_venta", "contado").strip().lower()
        fecha_vencimiento = payload.get("fecha_vencimiento", "")
        fecha_factura = payload.get("fecha") or "2026-10-29 12:00:00"
        numero_factura_input = (payload.get("numero_factura") or "").strip()
        idempotency_key = (payload.get("idempotency_key") or payload.get("client_tx_id") or "").strip()

        self.cur.execute("BEGIN IMMEDIATE")
        try:
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
                self.cur.execute("SELECT id, precio_base, impuesto_tipo, tipo FROM productos WHERE id = ?", (p_id,))
                p_dict = dict(self.cur.fetchone())
                pr_u = float(itm.get("precio_unitario", p_dict["precio_base"]))
                iva_u_v = round(pr_u * iva_pct, 4) if p_dict["impuesto_tipo"] == "gravado" else 0.0
                subtotal += round(pr_u * cant_v, 4)
                iva_total += round(iva_u_v * cant_v, 4)

            total_usd = round(subtotal + iva_total, 2)
            total_ves = round(total_usd * tasa_ves, 2)
            total_cop = round(total_usd * tasa_cop, 2)

            total_pagado_usd = 0.0
            for p in pagos:
                mon = (p.get("moneda") or "USD").upper()
                m_m = float(p.get("monto_moneda", 0))
                t_c = float(p.get("tasa_cambio") or 1.0)
                eq = m_m if mon == "USD" else (round(m_m / t_c, 2) if t_c > 0 else 0.0)
                if m_m > 0:
                    total_pagado_usd += eq

            saldo_pendiente = max(0.0, round(total_usd - total_pagado_usd, 2)) if tipo_venta == "credito" else 0.0
            estado_factura = "pagada" if saldo_pendiente <= 0.001 else "pendiente"

            if numero_factura_input:
                numero_factura = numero_factura_input
            else:
                self.cur.execute("SELECT COALESCE(MAX(id), 0) + 1 FROM facturas")
                numero_factura = f"FAC-{self.cur.fetchone()[0]:06d}"

            self.cur.execute("""
                INSERT INTO facturas (numero_factura, cliente_id, subtotal, iva_total, total_usd, total, tasa_ves, tasa_cop, total_ves, total_cop, estado, tipo_venta, fecha_vencimiento, saldo_pendiente, notas, fecha)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (numero_factura, cliente_id, subtotal, iva_total, total_usd, total_usd, tasa_ves, tasa_cop, total_ves, total_cop, estado_factura, tipo_venta, fecha_vencimiento if tipo_venta == 'credito' else None, saldo_pendiente, notas, fecha_factura))
            factura_id = self.cur.lastrowid

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

                if tipo == "producto":
                    validar_movimiento_no_retroactivo(self.cur, prod_id, fecha_factura)
                    stock_ant_dec = Decimal(str(prod.get("stock") or 0.0))
                    cpp_ant_val = prod.get("costo_cpp")

                    if stock_ant_dec < Decimal("0"):
                        raise ErrorStockNegativo(f"Stock negativo en {prod['codigo']}")
                    if cant_dec > stock_ant_dec:
                        raise ErrorStockNegativo(f"Stock insuficiente en {prod['codigo']}")
                    if cpp_ant_val is None or Decimal(str(cpp_ant_val)) <= Decimal("0"):
                        raise ErrorInconsistenciaCPP(f"Inconsistencia CPP en {prod['codigo']}")

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
                    f_det_id = self.cur.lastrowid

                    registrar_movimiento_inventario(
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
                        motivo=f"Salida por venta {numero_factura}",
                        usuario_id=1,
                        documento_linea_id=f_det_id
                    )

                    self.cur.execute("UPDATE productos SET stock = ? WHERE id = ?", (float(nuevo_stk_dec), prod_id))
                else:
                    self.cur.execute("""
                        INSERT INTO factura_detalles (factura_id, producto_id, nombre_producto, tipo, impuesto_tipo, cantidad, precio_unitario, iva_unitario, subtotal, total, costo_unitario, costo_total)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (factura_id, prod_id, prod["nombre"], tipo, impuesto_tipo, float(cant_dec), precio_unitario, iva_u, item_subtotal, item_total, None, None))

            if tipo_venta == "credito":
                self.cur.execute("""
                    INSERT INTO cuentas_por_cobrar (factura_id, cliente_id, monto_total, monto_pagado, saldo_pendiente, fecha_emision, fecha_vencimiento, estado, notas)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (factura_id, cliente_id, total_usd, total_pagado_usd, saldo_pendiente, fecha_factura, fecha_vencimiento, estado_factura, notas))

            self.conn.commit()
            return {"id": factura_id, "numero_factura": numero_factura, "total_usd": total_usd}
        except Exception:
            self.cur.execute("ROLLBACK")
            raise

    def procesar_devolucion(self, payload):
        """Simula exactamente la lógica transaccional de devolución de POST /api/devoluciones en server.py."""
        factura_id = payload.get("factura_id")
        cliente_id = payload.get("cliente_id")
        motivo = (payload.get("motivo") or "").strip() or "Devolución de mercancía / solicitud de cliente"
        tipo_devolucion_input = (payload.get("tipo_devolucion") or "").strip().lower()
        metodo_reembolso = (payload.get("metodo_reembolso") or "efectivo").strip().lower()
        items = payload.get("items", [])
        pagos_reembolso = payload.get("pagos_reembolso") or payload.get("pagos") or []
        notas = (payload.get("notas") or "").strip()
        fecha_devolucion_input = payload.get("fecha") or payload.get("fecha_emision")
        numero_devolucion_input = (payload.get("numero_devolucion") or "").strip()
        idempotency_key = (payload.get("idempotency_key") or payload.get("client_tx_id") or "").strip()

        if not items:
            raise ValueError("La devolución debe contener al menos un ítem")

        if fecha_devolucion_input and str(fecha_devolucion_input).strip():
            f_str = str(fecha_devolucion_input).strip()
            fecha_devolucion = f"{f_str} 12:00:00" if len(f_str) == 10 else f_str
        else:
            fecha_devolucion = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Idempotencia previa
        if numero_devolucion_input:
            self.cur.execute("SELECT id, numero_devolucion FROM devoluciones WHERE numero_devolucion = ?", (numero_devolucion_input,))
            if self.cur.fetchone():
                raise ValueError(f"IDEMPOTENCIA: Ya existe una devolución registrada con el número '{numero_devolucion_input}'.")

        if idempotency_key:
            self.cur.execute("SELECT id, numero_devolucion FROM devoluciones WHERE notas LIKE ?", (f"%[IDEMPOTENCY:{idempotency_key}]%",))
            if self.cur.fetchone():
                raise ValueError(f"IDEMPOTENCIA: La transacción con clave '{idempotency_key}' ya fue procesada.")

        self.cur.execute("BEGIN IMMEDIATE")
        try:
            factura_dict = None
            if factura_id:
                self.cur.execute("SELECT * FROM facturas WHERE id = ?", (factura_id,))
                f_row = self.cur.fetchone()
                if not f_row:
                    raise ValueError(f"Factura ID {factura_id} no encontrada")
                factura_dict = dict(f_row)
                if not cliente_id:
                    cliente_id = factura_dict["cliente_id"]

            if not cliente_id:
                raise ValueError("Se requiere un cliente para procesar la devolución")

            self.cur.execute("SELECT * FROM clientes WHERE id = ?", (cliente_id,))
            cli_row = self.cur.fetchone()
            if not cli_row:
                raise ValueError("Cliente no encontrado")
            cli_dict = dict(cli_row)

            self.cur.execute("SELECT * FROM configuracion WHERE id = 1")
            cfg_row = self.cur.fetchone()
            tasa_ves = cfg_row["tasa_ves"] if cfg_row else 45.0
            tasa_cop = cfg_row["tasa_cop"] if cfg_row else 4100.0
            iva_pct = (cfg_row["iva_porcentaje"] / 100.0) if cfg_row else 0.16

            if numero_devolucion_input:
                numero_devolucion = numero_devolucion_input
            else:
                self.cur.execute("SELECT COALESCE(MAX(id), 0) + 1 FROM devoluciones")
                numero_devolucion = f"DEV-{self.cur.fetchone()[0]:06d}"

            notas_final = notas
            if idempotency_key and f"[IDEMPOTENCY:{idempotency_key}]" not in notas_final:
                notas_final = f"{notas_final} [IDEMPOTENCY:{idempotency_key}]".strip()

            subtotal_dev = 0.0
            iva_dev = 0.0
            detalles_proc = []
            cantidades_acumuladas_por_factura_detalle = {}

            for itm in items:
                cant_dec = Decimal(str(itm.get("cantidad", 0)))
                if cant_dec <= Decimal("0"):
                    raise ValueError(f"La cantidad a devolver debe ser mayor a 0, recibido: {cant_dec}")

                prod_id = itm.get("producto_id")
                factura_det_id = itm.get("factura_detalle_id")

                if factura_id:
                    if factura_det_id:
                        self.cur.execute("SELECT * FROM factura_detalles WHERE id = ? AND factura_id = ?", (factura_det_id, factura_id))
                        fd_row = self.cur.fetchone()
                        if not fd_row:
                            raise ValueError(f"La línea de factura {factura_det_id} no pertenece a la factura {factura_id}")
                        fd = dict(fd_row)
                        if prod_id and fd["producto_id"] and fd["producto_id"] != prod_id:
                            raise ValueError(f"El producto_id {prod_id} no coincide con la línea")
                        prod_id = fd["producto_id"]
                    else:
                        if prod_id:
                            self.cur.execute("SELECT * FROM factura_detalles WHERE factura_id = ? AND producto_id = ?", (factura_id, prod_id))
                        else:
                            nom_b = itm.get("nombre") or itm.get("nombre_producto") or ""
                            self.cur.execute("SELECT * FROM factura_detalles WHERE factura_id = ? AND nombre_producto = ?", (factura_id, nom_b))
                        matching = [dict(r) for r in self.cur.fetchall()]
                        if not matching:
                            raise ValueError(f"No se encontró el ítem en la factura {factura_id}")
                        if len(matching) == 1:
                            fd = matching[0]
                            factura_det_id = fd["id"]
                            prod_id = fd["producto_id"]
                        else:
                            chosen = None
                            for cand in matching:
                                c_id = cand["id"]
                                self.cur.execute("SELECT COALESCE(SUM(cantidad), 0) FROM devolucion_detalles WHERE factura_detalle_id = ?", (c_id,))
                                dev_p = Decimal(str(self.cur.fetchone()[0]))
                                dev_b = cantidades_acumuladas_por_factura_detalle.get(c_id, Decimal("0"))
                                if Decimal(str(cand["cantidad"])) - dev_p - dev_b >= cant_dec:
                                    chosen = cand
                                    break
                            if not chosen:
                                raise ErrorCantidadDevolucionExcedeDisponible("No hay suficiente cantidad disponible en las líneas del SKU")
                            fd = chosen
                            factura_det_id = fd["id"]
                            prod_id = fd["producto_id"]

                    self.cur.execute("SELECT COALESCE(SUM(cantidad), 0) FROM devolucion_detalles WHERE factura_detalle_id = ?", (factura_det_id,))
                    dev_prev = Decimal(str(self.cur.fetchone()[0]))
                    dev_batch = cantidades_acumuladas_por_factura_detalle.get(factura_det_id, Decimal("0"))
                    cant_orig = Decimal(str(fd["cantidad"]))
                    disponible = cant_orig - dev_prev - dev_batch

                    if cant_dec > disponible:
                        raise ErrorCantidadDevolucionExcedeDisponible(f"La cantidad a devolver ({cant_dec}) supera la disponible ({disponible})")

                    cantidades_acumuladas_por_factura_detalle[factura_det_id] = dev_batch + cant_dec
                    tipo_itm = fd["tipo"]
                    nombre_itm = fd["nombre_producto"]
                    imp_tipo = fd["impuesto_tipo"]
                    p_unit = float(itm.get("precio_unitario", fd["precio_unitario"]))
                    codigo_itm = itm.get("codigo", "")
                else:
                    tipo_itm = itm.get("tipo", "producto")
                    if tipo_itm != "servicio":
                        raise ErrorCostoHistoricoNoRecuperable("Se requiere una factura válida para procesar la devolución de productos físicos")
                    factura_det_id = None
                    p_unit = float(itm.get("precio_unitario", 0.0))
                    imp_tipo = itm.get("impuesto_tipo", "exento")
                    nombre_itm = itm.get("nombre") or itm.get("nombre_producto") or "Servicio"
                    codigo_itm = itm.get("codigo", "")

                sub_itm = round(float(cant_dec) * p_unit, 4)
                iva_itm = round(sub_itm * iva_pct, 4) if imp_tipo == "gravado" else 0.0
                tot_itm = round(sub_itm + iva_itm, 4)
                subtotal_dev += sub_itm
                iva_dev += iva_itm

                costo_u_dev = None
                costo_tot_dev = None
                costo_hist_dec = None

                if tipo_itm == "producto" and prod_id:
                    if fd and fd.get("costo_unitario") is not None and float(fd["costo_unitario"]) > 0:
                        costo_hist_dec = Decimal(str(fd["costo_unitario"]))
                    if costo_hist_dec is None and factura_id:
                        self.cur.execute("""
                            SELECT costo_unitario FROM inventario_movimientos
                            WHERE documento_tipo = 'FACTURA' AND documento_id = ? AND producto_id = ?
                              AND (documento_linea_id = ? OR documento_linea_id IS NULL)
                              AND costo_unitario > 0
                            ORDER BY id DESC LIMIT 1
                        """, (factura_id, prod_id, factura_det_id))
                        mov_c = self.cur.fetchone()
                        if mov_c and mov_c[0] is not None and float(mov_c[0]) > 0:
                            costo_hist_dec = Decimal(str(mov_c[0]))

                    if costo_hist_dec is None or costo_hist_dec <= Decimal("0"):
                        raise ErrorCostoHistoricoNoRecuperable("Imposible recuperar el costo histórico original")

                    costo_u_dev = float(costo_hist_dec.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP))
                    costo_tot_dev = float((cant_dec * costo_hist_dec).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP))

                detalles_proc.append({
                    "producto_id": prod_id,
                    "factura_detalle_id": factura_det_id,
                    "codigo": codigo_itm,
                    "nombre": nombre_itm,
                    "tipo": tipo_itm,
                    "impuesto_tipo": imp_tipo,
                    "cantidad": float(cant_dec),
                    "cant_dec": cant_dec,
                    "precio_unitario": p_unit,
                    "iva_unitario": round(iva_itm / float(cant_dec), 4) if float(cant_dec) > 0 else 0.0,
                    "subtotal": sub_itm,
                    "total": tot_itm,
                    "costo_unitario": costo_u_dev,
                    "costo_total": costo_tot_dev,
                    "costo_hist_dec": costo_hist_dec
                })

            total_usd = round(subtotal_dev + iva_dev, 2)
            subtotal_usd = round(subtotal_dev, 2)
            iva_usd = round(iva_dev, 2)
            tasa_ves = 45.0
            tasa_cop = 4100.0
            total_ves = round(total_usd * tasa_ves, 2)
            total_cop = round(total_usd * tasa_cop, 2)

            num_fact = factura_dict["numero_factura"] if factura_dict else None
            fecha_fact_orig = factura_dict["fecha"] if factura_dict else None
            tipo_venta_orig = factura_dict.get("tipo_venta", "contado") if factura_dict else "contado"

            # Evaluar si la devolución resulta en devolución total o parcial
            totalmente_devuelta = False
            if factura_id and factura_dict:
                self.cur.execute("""
                    SELECT fd.id, fd.cantidad, COALESCE(SUM(dd.cantidad), 0) as devuelta
                    FROM factura_detalles fd
                    LEFT JOIN devolucion_detalles dd ON dd.factura_detalle_id = fd.id
                    WHERE fd.factura_id = ?
                    GROUP BY fd.id
                """, (factura_id,))
                line_status = self.cur.fetchall()
                totalmente_devuelta = len(line_status) > 0 and all(
                    (Decimal(str(ls["cantidad"])) - Decimal(str(ls["devuelta"])) - cantidades_acumuladas_por_factura_detalle.get(ls["id"], Decimal("0"))) <= Decimal("0.0001")
                    for ls in line_status
                )

            if totalmente_devuelta:
                tipo_devolucion = "total"
            elif tipo_devolucion_input in ("total", "parcial"):
                tipo_devolucion = tipo_devolucion_input
            else:
                tipo_devolucion = "parcial"

            self.cur.execute("""
                INSERT INTO devoluciones (
                    numero_devolucion, factura_id, numero_factura, cliente_id,
                    cliente_nombre, cliente_cedula, cliente_telefono, cliente_direccion,
                    fecha_emision, fecha_factura_original, tipo_devolucion, tipo_venta_original,
                    motivo, subtotal_usd, iva_usd, total_usd,
                    tasa_ves, tasa_cop, total_ves, total_cop,
                    metodo_reembolso, notas
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                numero_devolucion, factura_id, num_fact, cliente_id,
                cli_dict["nombre"], cli_dict.get("cedula", ""), cli_dict.get("telefono", ""), cli_dict.get("direccion", ""),
                fecha_devolucion, fecha_fact_orig, tipo_devolucion, tipo_venta_orig,
                motivo, subtotal_usd, iva_usd, total_usd,
                tasa_ves, tasa_cop, total_ves, total_cop,
                metodo_reembolso, notas_final
            ))
            dev_id = self.cur.lastrowid

            for d in detalles_proc:
                self.cur.execute("""
                    INSERT INTO devolucion_detalles (
                        devolucion_id, factura_detalle_id, producto_id, codigo, nombre_producto, tipo,
                        impuesto_tipo, cantidad, precio_unitario, iva_unitario, subtotal, total,
                        costo_unitario, costo_total
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    dev_id, d["factura_detalle_id"], d["producto_id"], d["codigo"], d["nombre"], d["tipo"],
                    d["impuesto_tipo"], d["cantidad"], d["precio_unitario"], d["iva_unitario"], d["subtotal"], d["total"],
                    d["costo_unitario"], d["costo_total"]
                ))
                dev_detalle_id = self.cur.lastrowid
                d["id"] = dev_detalle_id

                if d["tipo"] == "producto" and d["producto_id"]:
                    prod_id = d["producto_id"]
                    cant_dec = d["cant_dec"]
                    costo_hist = d["costo_hist_dec"]

                    validar_movimiento_no_retroactivo(self.cur, prod_id, fecha_devolucion)

                    self.cur.execute("SELECT id, codigo, nombre, stock, costo_cpp FROM productos WHERE id = ?", (prod_id,))
                    p_row = dict(self.cur.fetchone())
                    stk_ant = Decimal(str(p_row.get("stock") or 0.0))
                    cpp_ant_val = p_row.get("costo_cpp")

                    if stk_ant < Decimal("0"):
                        raise ErrorStockNegativo(f"Stock negativo en {p_row['codigo']}")

                    if stk_ant == Decimal("0"):
                        nuevo_cpp = costo_hist.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                        nuevo_stk = cant_dec.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                    else:
                        if cpp_ant_val is None or Decimal(str(cpp_ant_val)) <= Decimal("0"):
                            raise ErrorInconsistenciaCPP(f"Inconsistencia CPP en {p_row['codigo']}")
                        cpp_ant = Decimal(str(cpp_ant_val))
                        res_cpp = calcular_cpp_entrada(stk_ant, cpp_ant, cant_dec, costo_hist)
                        nuevo_stk = Decimal(str(res_cpp["stock_nuevo"]))
                        nuevo_cpp = Decimal(str(res_cpp["cpp_nuevo"]))

                    self.cur.execute("""
                        UPDATE productos
                        SET stock = ?, costo_cpp = ?
                        WHERE id = ?
                    """, (float(nuevo_stk), float(nuevo_cpp), prod_id))

                    registrar_movimiento_inventario(
                        cursor=self.cur,
                        producto_id=prod_id,
                        fecha=fecha_devolucion,
                        tipo_movimiento="devolucion_cliente",
                        sentido="ENTRADA",
                        cantidad=float(cant_dec),
                        costo_unitario=d["costo_unitario"],
                        costo_total=d["costo_total"],
                        stock_anterior=float(stk_ant),
                        stock_nuevo=float(nuevo_stk),
                        documento_tipo="DEVOLUCION",
                        documento_id=dev_id,
                        documento_numero=numero_devolucion,
                        motivo=f"Entrada por devolución {numero_devolucion}",
                        usuario_id=1,
                        documento_linea_id=dev_detalle_id
                    )

            for p in pagos_reembolso:
                mon = (p.get("moneda") or "USD").upper()
                met = p.get("metodo", metodo_reembolso)
                m_m = float(p.get("monto_moneda", 0))
                t_c = float(p.get("tasa_cambio") or (tasa_ves if mon == "VES" else (tasa_cop if mon == "COP" else 1.0)))
                eq = float(p.get("equivalente_usd") or (m_m / t_c if mon != "USD" else m_m))
                self.cur.execute("""
                    INSERT INTO devolucion_pagos (devolucion_id, moneda, metodo, monto_moneda, tasa_cambio, equivalente_usd, referencia)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (dev_id, mon, met, m_m, t_c, round(eq, 2), p.get("referencia", "")))

            if factura_id and factura_dict:
                if factura_dict.get("tipo_venta") == "credito":
                    self.cur.execute("SELECT * FROM cuentas_por_cobrar WHERE factura_id = ?", (factura_id,))
                    cxc_row = self.cur.fetchone()
                    if cxc_row:
                        cxc_d = dict(cxc_row)
                        nuevo_saldo_cxc = max(0.0, round(cxc_d["saldo_pendiente"] - total_usd, 2))
                        nuevo_estado_cxc = "pagada" if nuevo_saldo_cxc <= 0.01 else "parcial"
                        self.cur.execute("""
                            UPDATE cuentas_por_cobrar
                            SET saldo_pendiente = ?, estado = ?, notas = coalesce(notas, '') || ' [Devolución ' || ? || ']'
                            WHERE id = ?
                        """, (nuevo_saldo_cxc, nuevo_estado_cxc, numero_devolucion, cxc_d["id"]))

                        nuevo_estado_fact = "pagada" if nuevo_saldo_cxc <= 0.001 else "pendiente"
                        self.cur.execute("""
                            UPDATE facturas
                            SET saldo_pendiente = ?, estado = ?
                            WHERE id = ?
                        """, (nuevo_saldo_cxc, nuevo_estado_fact, factura_id))

                if tipo_devolucion == "total":
                    self.cur.execute("""
                        UPDATE facturas
                        SET estado = 'anulada', notas = coalesce(notas, '') || ' [ANULADA por Devolución Total ' || ? || ']'
                        WHERE id = ?
                    """, (numero_devolucion, factura_id))
                else:
                    self.cur.execute("""
                        UPDATE facturas
                        SET notas = coalesce(notas, '') || ' [Devolución Parcial ' || ? || ' por $' || ? || ']'
                        WHERE id = ?
                    """, (numero_devolucion, total_usd, factura_id))

            self.conn.commit()
            return {
                "id": dev_id,
                "numero_devolucion": numero_devolucion,
                "total_usd": total_usd,
                "detalles": detalles_proc,
                "tipo_devolucion": tipo_devolucion
            }
        except Exception:
            self.cur.execute("ROLLBACK")
            raise

    # ========================================================
    # 20 CASOS DE PRUEBA OFICIALES DEV-CPP-01 A DEV-CPP-20
    # ========================================================

    def test_dev_cpp_01_factura_congelada_devolucion_total(self):
        """DEV-CPP-01: Venta de HAR008 con costo congelado y devolución total posterior."""
        v = self.procesar_venta({
            "items": [{"producto_id": 1, "cantidad": 100, "precio_unitario": 35.0}],
            "fecha": "2026-10-29 12:00:00"
        })
        self.cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = 1")
        p = self.cur.fetchone()
        self.assertEqual(float(p["stock"]), 1633.0)
        self.assertEqual(float(p["costo_cpp"]), 29.0)

        # Devolución total
        d = self.procesar_devolucion({
            "factura_id": v["id"],
            "items": [{"producto_id": 1, "cantidad": 100, "precio_unitario": 35.0}],
            "fecha": "2026-10-29 13:00:00"
        })
        self.cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = 1")
        p2 = self.cur.fetchone()
        self.assertEqual(float(p2["stock"]), 1733.0)
        self.assertEqual(float(p2["costo_cpp"]), 29.0)

        self.cur.execute("SELECT estado FROM facturas WHERE id = ?", (v["id"],))
        self.assertEqual(self.cur.fetchone()["estado"], "anulada")

    def test_dev_cpp_02_recuperacion_costo_historico_primaria_secundaria(self):
        """DEV-CPP-02: Recuperación de costo histórico: fuente primaria y secundaria."""
        v = self.procesar_venta({
            "items": [{"producto_id": 2, "cantidad": 50, "precio_unitario": 40.0}],
            "fecha": "2026-10-29 12:00:00"
        })
        # Fuente primaria: costo_unitario en factura_detalles
        self.cur.execute("SELECT costo_unitario FROM factura_detalles WHERE factura_id = ?", (v["id"],))
        self.assertEqual(float(self.cur.fetchone()["costo_unitario"]), 29.0)

        # Simular que factura_detalles.costo_unitario queda NULL para forzar fuente secundaria (inventario_movimientos)
        self.cur.execute("UPDATE factura_detalles SET costo_unitario = NULL WHERE factura_id = ?", (v["id"],))
        self.conn.commit()

        d = self.procesar_devolucion({
            "factura_id": v["id"],
            "items": [{"producto_id": 2, "cantidad": 20, "precio_unitario": 40.0}],
            "fecha": "2026-10-29 13:00:00"
        })
        self.assertEqual(d["detalles"][0]["costo_unitario"], 29.0)

    def test_dev_cpp_03_devolucion_parcial(self):
        """DEV-CPP-03: Devolución parcial (vende 10, devuelve 4)."""
        v = self.procesar_venta({
            "items": [{"producto_id": 2, "cantidad": 10, "precio_unitario": 35.0}],
            "fecha": "2026-10-29 12:00:00"
        })
        d = self.procesar_devolucion({
            "factura_id": v["id"],
            "items": [{"producto_id": 2, "cantidad": 4, "precio_unitario": 35.0}],
            "fecha": "2026-10-29 13:00:00"
        })
        self.assertEqual(d["tipo_devolucion"], "parcial")
        self.cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = 2")
        p = self.cur.fetchone()
        self.assertEqual(float(p["stock"]), 854.0)
        self.assertEqual(float(p["costo_cpp"]), 29.0)

        self.cur.execute("SELECT estado, notas FROM facturas WHERE id = ?", (v["id"],))
        f = self.cur.fetchone()
        self.assertNotEqual(f["estado"], "anulada")
        self.assertIn("Devolución Parcial", f["notas"])

    def test_dev_cpp_04_multiples_devoluciones_parciales_sucesivas(self):
        """DEV-CPP-04: Múltiples devoluciones parciales sucesivas (10 -> dev 3 -> dev 4 -> dev 3)."""
        v = self.procesar_venta({
            "items": [{"producto_id": 3, "cantidad": 10, "precio_unitario": 120.0}],
            "fecha": "2026-10-29 12:00:00"
        })
        d1 = self.procesar_devolucion({
            "factura_id": v["id"],
            "items": [{"producto_id": 3, "cantidad": 3, "precio_unitario": 120.0}],
            "fecha": "2026-10-29 13:00:00"
        })
        self.assertEqual(d1["tipo_devolucion"], "parcial")

        d2 = self.procesar_devolucion({
            "factura_id": v["id"],
            "items": [{"producto_id": 3, "cantidad": 4, "precio_unitario": 120.0}],
            "fecha": "2026-10-29 14:00:00"
        })
        self.assertEqual(d2["tipo_devolucion"], "parcial")

        d3 = self.procesar_devolucion({
            "factura_id": v["id"],
            "items": [{"producto_id": 3, "cantidad": 3, "precio_unitario": 120.0}],
            "fecha": "2026-10-29 15:00:00"
        })
        self.assertEqual(d3["tipo_devolucion"], "total")

        self.cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = 3")
        p = self.cur.fetchone()
        self.assertEqual(float(p["stock"]), 860.0)
        self.assertEqual(float(p["costo_cpp"]), 100.0)

        self.cur.execute("SELECT estado FROM facturas WHERE id = ?", (v["id"],))
        self.assertEqual(self.cur.fetchone()["estado"], "anulada")

    def test_dev_cpp_05_bloqueo_exceso_cantidad_disponible(self):
        """DEV-CPP-05: Intento de devolución que supera la cantidad disponible en la factura."""
        v = self.procesar_venta({
            "items": [{"producto_id": 1, "cantidad": 10, "precio_unitario": 35.0}],
            "fecha": "2026-10-29 12:00:00"
        })
        # Intentar devolver 11 (excede 10)
        with self.assertRaises(ErrorCantidadDevolucionExcedeDisponible):
            self.procesar_devolucion({
                "factura_id": v["id"],
                "items": [{"producto_id": 1, "cantidad": 11, "precio_unitario": 35.0}],
                "fecha": "2026-10-29 13:00:00"
            })

        # Devolver 8 (OK)
        self.procesar_devolucion({
            "factura_id": v["id"],
            "items": [{"producto_id": 1, "cantidad": 8, "precio_unitario": 35.0}],
            "fecha": "2026-10-29 13:00:00"
        })

        # Intentar devolver 3 más (quedan 2 disponibles) -> Excede
        with self.assertRaises(ErrorCantidadDevolucionExcedeDisponible):
            self.procesar_devolucion({
                "factura_id": v["id"],
                "items": [{"producto_id": 1, "cantidad": 3, "precio_unitario": 35.0}],
                "fecha": "2026-10-29 14:00:00"
            })

    def test_dev_cpp_06_prohibicion_fallback_sin_costo_historico(self):
        """DEV-CPP-06: Prohibición estricta de fallback si no hay costo histórico recuperable."""
        v = self.procesar_venta({
            "items": [{"producto_id": 1, "cantidad": 5, "precio_unitario": 35.0}],
            "fecha": "2026-10-29 12:00:00"
        })
        # Eliminar costo de factura_detalles y de inventario_movimientos para ese doc
        self.cur.execute("UPDATE factura_detalles SET costo_unitario = NULL WHERE factura_id = ?", (v["id"],))
        self.cur.execute("DELETE FROM inventario_movimientos WHERE documento_tipo = 'FACTURA' AND documento_id = ?", (v["id"],))
        self.conn.commit()

        # Debe lanzar ErrorCostoHistoricoNoRecuperable y NO usar productos.costo
        with self.assertRaises(ErrorCostoHistoricoNoRecuperable):
            self.procesar_devolucion({
                "factura_id": v["id"],
                "items": [{"producto_id": 1, "cantidad": 5, "precio_unitario": 35.0}],
                "fecha": "2026-10-29 13:00:00"
            })

    def test_dev_cpp_07_devolucion_con_stock_cero(self):
        """DEV-CPP-07: Devolución con stock actual = 0 (inicio limpio con costo histórico)."""
        # Agotar producto 4 (stock actual 500)
        v = self.procesar_venta({
            "items": [{"producto_id": 4, "cantidad": 500, "precio_unitario": 10.0}],
            "fecha": "2026-10-29 12:00:00"
        })
        self.cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = 4")
        p = self.cur.fetchone()
        self.assertEqual(float(p["stock"]), 0.0)

        # Devolución de 20 unidades
        d = self.procesar_devolucion({
            "factura_id": v["id"],
            "items": [{"producto_id": 4, "cantidad": 20, "precio_unitario": 10.0}],
            "fecha": "2026-10-29 13:00:00"
        })
        self.cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = 4")
        p2 = self.cur.fetchone()
        self.assertEqual(float(p2["stock"]), 20.0)
        self.assertEqual(float(p2["costo_cpp"]), 5.0)

    def test_dev_cpp_08_bloqueo_stock_negativo_preexistente(self):
        """DEV-CPP-08: Bloqueo estricto ante stock negativo preexistente."""
        v = self.procesar_venta({
            "items": [{"producto_id": 1, "cantidad": 10, "precio_unitario": 35.0}],
            "fecha": "2026-10-29 12:00:00"
        })
        # Forzar stock negativo en la base de datos
        self.cur.execute("UPDATE productos SET stock = -5.0 WHERE id = 1")
        self.conn.commit()

        with self.assertRaises(ErrorStockNegativo):
            self.procesar_devolucion({
                "factura_id": v["id"],
                "items": [{"producto_id": 1, "cantidad": 5, "precio_unitario": 35.0}],
                "fecha": "2026-10-29 13:00:00"
            })

    def test_dev_cpp_09_bloqueo_stock_positivo_cpp_invalido(self):
        """DEV-CPP-09: Bloqueo estricto ante stock positivo pero costo_cpp inválido."""
        v = self.procesar_venta({
            "items": [{"producto_id": 1, "cantidad": 10, "precio_unitario": 35.0}],
            "fecha": "2026-10-29 12:00:00"
        })
        # Forzar costo_cpp = 0 en producto con stock
        self.cur.execute("UPDATE productos SET costo_cpp = 0.0 WHERE id = 1")
        self.conn.commit()

        with self.assertRaises(ErrorInconsistenciaCPP):
            self.procesar_devolucion({
                "factura_id": v["id"],
                "items": [{"producto_id": 1, "cantidad": 5, "precio_unitario": 35.0}],
                "fecha": "2026-10-29 13:00:00"
            })

    def test_dev_cpp_10_soporte_sku_repetido_misma_factura(self):
        """DEV-CPP-10: Soporte correcto para SKU repetido en distintas líneas de la factura."""
        v = self.procesar_venta({
            "items": [
                {"producto_id": 1, "cantidad": 5, "precio_unitario": 35.0},
                {"producto_id": 1, "cantidad": 8, "precio_unitario": 36.0}
            ],
            "fecha": "2026-10-29 12:00:00"
        })
        self.cur.execute("SELECT id, cantidad FROM factura_detalles WHERE factura_id = ? ORDER BY id ASC", (v["id"],))
        lines = self.cur.fetchall()
        id_l1 = lines[0]["id"]
        id_l2 = lines[1]["id"]

        # Devolver 3 de la primera línea y 4 de la segunda
        d = self.procesar_devolucion({
            "factura_id": v["id"],
            "items": [
                {"factura_detalle_id": id_l1, "producto_id": 1, "cantidad": 3},
                {"factura_detalle_id": id_l2, "producto_id": 1, "cantidad": 4}
            ],
            "fecha": "2026-10-29 13:00:00"
        })
        self.assertEqual(len(d["detalles"]), 2)
        self.assertEqual(d["detalles"][0]["factura_detalle_id"], id_l1)
        self.assertEqual(d["detalles"][1]["factura_detalle_id"], id_l2)

    def test_dev_cpp_11_trazabilidad_punta_a_punta(self):
        """DEV-CPP-11: Trazabilidad completa factura -> factura_detalles -> devolucion_detalles -> inventario_movimientos."""
        v = self.procesar_venta({
            "items": [{"producto_id": 2, "cantidad": 15, "precio_unitario": 35.0}],
            "fecha": "2026-10-29 12:00:00"
        })
        self.cur.execute("SELECT id FROM factura_detalles WHERE factura_id = ?", (v["id"],))
        f_det_id = self.cur.fetchone()["id"]

        d = self.procesar_devolucion({
            "factura_id": v["id"],
            "items": [{"factura_detalle_id": f_det_id, "producto_id": 2, "cantidad": 5}],
            "fecha": "2026-10-29 13:00:00"
        })
        dev_id = d["id"]

        self.cur.execute("SELECT id, factura_detalle_id FROM devolucion_detalles WHERE devolucion_id = ?", (dev_id,))
        dev_det = self.cur.fetchone()
        self.assertEqual(dev_det["factura_detalle_id"], f_det_id)

        self.cur.execute("SELECT documento_linea_id, documento_id, documento_tipo FROM inventario_movimientos WHERE documento_tipo = 'DEVOLUCION' AND documento_id = ?", (dev_id,))
        mov = self.cur.fetchone()
        self.assertEqual(mov["documento_linea_id"], dev_det["id"])
        self.assertEqual(mov["documento_id"], dev_id)

    def test_dev_cpp_12_movimiento_inventario_campos_oficiales(self):
        """DEV-CPP-12: Verificación de campos oficiales en inventario_movimientos."""
        v = self.procesar_venta({
            "items": [{"producto_id": 1, "cantidad": 10, "precio_unitario": 35.0}],
            "fecha": "2026-10-29 12:00:00"
        })
        d = self.procesar_devolucion({
            "factura_id": v["id"],
            "items": [{"producto_id": 1, "cantidad": 5}],
            "fecha": "2026-10-29 13:00:00"
        })
        self.cur.execute("SELECT * FROM inventario_movimientos WHERE documento_tipo = 'DEVOLUCION' AND documento_id = ?", (d["id"],))
        mov = dict(self.cur.fetchone())
        self.assertEqual(mov["tipo_movimiento"], "devolucion_cliente")
        self.assertEqual(mov["sentido"], "ENTRADA")
        self.assertEqual(mov["cantidad"], 5.0)
        self.assertEqual(mov["costo_unitario"], 29.0)
        self.assertEqual(mov["costo_total"], 145.0)
        self.assertIsNotNone(mov["documento_linea_id"])

    def test_dev_cpp_13_servicios_no_afectan_inventario_ni_cpp(self):
        """DEV-CPP-13: Devolución de servicios no genera movimientos ni altera CPP."""
        # Insertar un servicio de prueba con categoria_id válido
        self.cur.execute("""
            INSERT INTO productos (codigo, nombre, categoria_id, tipo, impuesto_tipo, precio_base, stock, costo, costo_cpp)
            VALUES ('SRV-TEST', 'Servicio Asistencia Técnica', 1, 'servicio', 'exento', 50.0, 0, 0, 0)
        """)
        srv_id = self.cur.lastrowid
        self.conn.commit()

        v = self.procesar_venta({
            "items": [{"producto_id": srv_id, "cantidad": 2, "precio_unitario": 50.0}],
            "fecha": "2026-10-29 12:00:00"
        })

        # Contar movimientos antes
        self.cur.execute("SELECT COUNT(*) FROM inventario_movimientos")
        movs_antes = self.cur.fetchone()[0]

        d = self.procesar_devolucion({
            "factura_id": v["id"],
            "items": [{"producto_id": srv_id, "cantidad": 1, "precio_unitario": 50.0}],
            "fecha": "2026-10-29 13:00:00"
        })

        # Contar movimientos después
        self.cur.execute("SELECT COUNT(*) FROM inventario_movimientos")
        movs_despues = self.cur.fetchone()[0]
        self.assertEqual(movs_antes, movs_despues)

    def test_dev_cpp_14_bloqueo_fecha_retroactiva(self):
        """DEV-CPP-14: Bloqueo de devolución con fecha anterior al último movimiento del SKU."""
        v = self.procesar_venta({
            "items": [{"producto_id": 1, "cantidad": 5, "precio_unitario": 35.0}],
            "fecha": "2026-10-29 15:00:00"
        })
        with self.assertRaises(ErrorMovimientoRetroactivoNoPermitido):
            self.procesar_devolucion({
                "factura_id": v["id"],
                "items": [{"producto_id": 1, "cantidad": 2}],
                "fecha": "2026-10-29 10:00:00"  # Retroactivo respecto a las 15:00:00
            })

    def test_dev_cpp_15_idempotencia_numero_y_clave(self):
        """DEV-CPP-15: Idempotencia por número correlativo y client_tx_id / idempotency_key."""
        v = self.procesar_venta({
            "items": [{"producto_id": 1, "cantidad": 10, "precio_unitario": 35.0}],
            "fecha": "2026-10-29 12:00:00"
        })
        d = self.procesar_devolucion({
            "factura_id": v["id"],
            "items": [{"producto_id": 1, "cantidad": 2}],
            "numero_devolucion": "DEV-TEST-IDEM-01",
            "idempotency_key": "TX-DEV-12345",
            "fecha": "2026-10-29 13:00:00"
        })
        # Reintento con mismo número
        with self.assertRaises(ValueError):
            self.procesar_devolucion({
                "factura_id": v["id"],
                "items": [{"producto_id": 1, "cantidad": 2}],
                "numero_devolucion": "DEV-TEST-IDEM-01",
                "fecha": "2026-10-29 14:00:00"
            })
        # Reintento con misma clave de idempotencia
        with self.assertRaises(ValueError):
            self.procesar_devolucion({
                "factura_id": v["id"],
                "items": [{"producto_id": 1, "cantidad": 2}],
                "idempotency_key": "TX-DEV-12345",
                "fecha": "2026-10-29 14:00:00"
            })

    def test_dev_cpp_16_atomicidad_rollback_transaccional(self):
        """DEV-CPP-16: Rollback atómico en fallos durante devolución multilínea."""
        v = self.procesar_venta({
            "items": [
                {"producto_id": 1, "cantidad": 5, "precio_unitario": 35.0},
                {"producto_id": 2, "cantidad": 5, "precio_unitario": 35.0}
            ],
            "fecha": "2026-10-29 12:00:00"
        })
        self.cur.execute("SELECT stock FROM productos WHERE id = 1")
        stk1_antes = self.cur.fetchone()["stock"]
        self.cur.execute("SELECT COUNT(*) FROM devoluciones")
        devs_antes = self.cur.fetchone()[0]

        # Devolución donde línea 1 es válida (2 unidades) pero línea 2 supera disponible (20 unidades)
        with self.assertRaises(ErrorCantidadDevolucionExcedeDisponible):
            self.procesar_devolucion({
                "factura_id": v["id"],
                "items": [
                    {"producto_id": 1, "cantidad": 2},
                    {"producto_id": 2, "cantidad": 20}
                ],
                "fecha": "2026-10-29 13:00:00"
            })

        self.cur.execute("SELECT stock FROM productos WHERE id = 1")
        self.assertEqual(self.cur.fetchone()["stock"], stk1_antes)
        self.cur.execute("SELECT COUNT(*) FROM devoluciones")
        self.assertEqual(self.cur.fetchone()[0], devs_antes)

    def test_dev_cpp_17_multimoneda_valoracion_usd_pura(self):
        """DEV-CPP-17: Multimoneda con reembolso en VES/COP preserva valoración de CPP puramente en USD."""
        v = self.procesar_venta({
            "items": [{"producto_id": 1, "cantidad": 10, "precio_unitario": 35.0}],
            "fecha": "2026-10-29 12:00:00"
        })
        d = self.procesar_devolucion({
            "factura_id": v["id"],
            "items": [{"producto_id": 1, "cantidad": 5}],
            "pagos": [
                {"moneda": "VES", "monto_moneda": 2250.0, "tasa_cambio": 45.0, "metodo": "Pago Móvil"}
            ],
            "fecha": "2026-10-29 13:00:00"
        })
        self.cur.execute("SELECT costo_unitario, costo_total FROM inventario_movimientos WHERE documento_tipo = 'DEVOLUCION' AND documento_id = ?", (d["id"],))
        mov = self.cur.fetchone()
        self.assertEqual(mov["costo_unitario"], 29.0)
        self.assertEqual(mov["costo_total"], 145.0)

    def test_dev_cpp_18_actualizacion_factura_credito_y_cxc(self):
        """DEV-CPP-18: Devolución sobre venta a crédito actualiza CXC y factura coherentemente."""
        v = self.procesar_venta({
            "tipo_venta": "credito",
            "items": [{"producto_id": 1, "cantidad": 10, "precio_unitario": 35.0}],
            "fecha": "2026-10-29 12:00:00"
        })
        self.cur.execute("SELECT saldo_pendiente FROM cuentas_por_cobrar WHERE factura_id = ?", (v["id"],))
        saldo_inicial = self.cur.fetchone()["saldo_pendiente"]

        # Devolución parcial de 4 unidades
        d1 = self.procesar_devolucion({
            "factura_id": v["id"],
            "items": [{"producto_id": 1, "cantidad": 4}],
            "fecha": "2026-10-29 13:00:00"
        })
        self.cur.execute("SELECT saldo_pendiente, estado FROM cuentas_por_cobrar WHERE factura_id = ?", (v["id"],))
        cxc1 = self.cur.fetchone()
        self.assertLess(cxc1["saldo_pendiente"], saldo_inicial)
        self.assertEqual(cxc1["estado"], "parcial")

        # Devolución del resto (6 unidades)
        d2 = self.procesar_devolucion({
            "factura_id": v["id"],
            "items": [{"producto_id": 1, "cantidad": 6}],
            "fecha": "2026-10-29 14:00:00"
        })
        self.cur.execute("SELECT saldo_pendiente, estado FROM cuentas_por_cobrar WHERE factura_id = ?", (v["id"],))
        cxc2 = self.cur.fetchone()
        self.assertEqual(cxc2["saldo_pendiente"], 0.0)
        self.assertEqual(cxc2["estado"], "pagada")

        self.cur.execute("SELECT estado FROM facturas WHERE id = ?", (v["id"],))
        self.assertEqual(self.cur.fetchone()["estado"], "anulada")

    def test_dev_cpp_19_reconstruccion_deterministica_cpp(self):
        """DEV-CPP-19: Reconstrucción determinística del CPP procesa correctamente devoluciones de clientes."""
        # 1. Venta de HAR008 (100 unidades al costo 29.0)
        v = self.procesar_venta({
            "items": [{"producto_id": 1, "cantidad": 100, "precio_unitario": 35.0}],
            "fecha": "2026-10-29 12:00:00"
        })
        # 2. Devolución parcial (40 unidades)
        d = self.procesar_devolucion({
            "factura_id": v["id"],
            "items": [{"producto_id": 1, "cantidad": 40}],
            "fecha": "2026-10-29 13:00:00"
        })

        # Ejecutar reconstrucción determinística desde apertura
        rec = reconstruir_cpp_desde_apertura(self.cur, producto_id=1, ultimo_mov_id=108)
        self.cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = 1")
        prod = self.cur.fetchone()

        self.assertEqual(rec["stock_reconstruido"], float(prod["stock"]))
        self.assertEqual(rec["cpp_reconstruido"], float(prod["costo_cpp"]))
        self.assertEqual(rec["movimientos_procesados"], 2)

    def test_dev_cpp_20_preservacion_datos_historicos_dev1_fac1(self):
        """DEV-CPP-20: Verificación de preservación estricta de DEV-000001, FAC-000001 y saldos de apertura."""
        self.cur.execute("SELECT id, numero_devolucion FROM devoluciones WHERE numero_devolucion = 'DEV-000001'")
        dev1 = self.cur.fetchone()
        self.assertIsNotNone(dev1)
        self.assertEqual(dev1["numero_devolucion"], "DEV-000001")

        self.cur.execute("SELECT id, numero_factura FROM facturas WHERE numero_factura = 'FAC-000001'")
        fac1 = self.cur.fetchone()
        self.assertIsNotNone(fac1)
        self.assertEqual(fac1["numero_factura"], "FAC-000001")

        self.cur.execute("SELECT COUNT(*) FROM inventario_saldos_apertura_cpp")
        self.assertEqual(self.cur.fetchone()[0], 5)

if __name__ == "__main__":
    unittest.main()
