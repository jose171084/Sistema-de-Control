"""
test_fase2f5b_ajustes_cpp.py - Suite de pruebas automatizadas para la Integracion Transaccional del CPP en Ajustes de Inventario (Fase 2F-5B).
Cubre los 20 casos de aceptacion requeridos (AJU-CPP-01 a AJU-CPP-20).
Opera sobre un entorno SQLite aislado para preservar al 100% la base de datos canonica de produccion.
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

class TestFase2F5BAjustesCPP(unittest.TestCase):

    def setUp(self):
        """Crea una base de datos SQLite aislada temporal con el esquema oficial y apertura certificada."""
        self.test_db_path = os.path.join(BASE_DIR, "test_fase2f5b_temp.db")
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

    def procesar_ajuste(self, payload):
        """
        Ejecuta la logica transaccional exacta de POST /api/inventario/ajustes (Fase 2F-5B).
        Aisla y emula con rigor el comportamiento de server.py.
        """
        tipo_ajuste = (payload.get("tipo_ajuste") or "").strip().upper()
        if tipo_ajuste not in ("CARGO", "DESCARGO"):
            raise ValueError("tipo_ajuste debe ser 'CARGO' o 'DESCARGO'")

        motivo = (payload.get("motivo") or "").strip()
        if not motivo:
            raise ValueError("El motivo del ajuste es obligatorio")

        detalles = payload.get("detalles") or payload.get("items") or []
        if not isinstance(detalles, list) or len(detalles) == 0:
            raise ValueError("Debe incluir al menos un producto en el ajuste (lista 'detalles')")

        fecha_input = payload.get("fecha")
        if fecha_input and str(fecha_input).strip():
            f_str = str(fecha_input).strip()
            if len(f_str) == 10:
                fecha_ajuste = f"{f_str} 12:00:00"
            else:
                fecha_ajuste = f_str
        else:
            fecha_ajuste = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        observaciones = (payload.get("observaciones") or "").strip()
        usuario_id = int(payload.get("usuario_id") or 1)
        numero_ajuste = (payload.get("numero_ajuste") or "").strip()
        idempotency_key = (payload.get("idempotency_key") or payload.get("client_tx_id") or "").strip()

        # Idempotencia
        if numero_ajuste:
            self.cur.execute("SELECT id, numero_ajuste, tipo_ajuste, motivo FROM inventario_ajustes WHERE numero_ajuste = ?", (numero_ajuste,))
            existente = self.cur.fetchone()
            if existente:
                return {
                    "id": existente["id"],
                    "numero_ajuste": existente["numero_ajuste"],
                    "tipo_ajuste": existente["tipo_ajuste"],
                    "success": True,
                    "duplicado_ignorado": True,
                    "message": "Ajuste ya procesado previamente (idempotencia garantizada)"
                }

        if idempotency_key:
            self.cur.execute("SELECT id, numero_ajuste, tipo_ajuste, motivo FROM inventario_ajustes WHERE observaciones LIKE ?", (f"%[IDEMPOTENCY:{idempotency_key}]%",))
            existente_key = self.cur.fetchone()
            if existente_key:
                return {
                    "id": existente_key["id"],
                    "numero_ajuste": existente_key["numero_ajuste"],
                    "tipo_ajuste": existente_key["tipo_ajuste"],
                    "success": True,
                    "duplicado_ignorado": True,
                    "message": "Ajuste ya procesado previamente con idempotency_key"
                }

        self.cur.execute("BEGIN IMMEDIATE")
        try:
            # Prevalidacion
            productos_info = {}
            cantidades_acumuladas = {}
            for idx, det in enumerate(detalles):
                p_id = det.get("producto_id")
                if not p_id:
                    raise ValueError(f"Detalle #{idx+1}: 'producto_id' es requerido")
                p_id = int(p_id)
                cant_val = float(det.get("cantidad", 0.0))
                if cant_val <= 0:
                    raise ValueError(f"Detalle #{idx+1}: la cantidad debe ser mayor a 0 (recibido: {cant_val})")

                if p_id not in productos_info:
                    self.cur.execute("SELECT id, codigo, nombre, tipo, stock, costo_cpp, costo, activo FROM productos WHERE id = ?", (p_id,))
                    prod = self.cur.fetchone()
                    if not prod:
                        raise ValueError(f"Producto ID {p_id} no existe")
                    productos_info[p_id] = dict(prod)
                    cantidades_acumuladas[p_id] = Decimal("0")

                prod_data = productos_info[p_id]
                if prod_data.get("tipo") == "servicio":
                    raise ValueError(f"No se pueden realizar ajustes de inventario sobre servicios ('{prod_data['nombre']}')")

                validar_movimiento_no_retroactivo(self.cur, p_id, fecha_ajuste)
                cantidades_acumuladas[p_id] += Decimal(str(cant_val))

            if tipo_ajuste == "DESCARGO":
                for p_id, cant_total_dec in cantidades_acumuladas.items():
                    prod_data = productos_info[p_id]
                    stk_act_dec = Decimal(str(prod_data.get("stock") or 0.0))
                    validar_stock_no_negativo(stk_act_dec, cant_total_dec)

            if not numero_ajuste:
                prefix = "CAR" if tipo_ajuste == "CARGO" else "DES"
                self.cur.execute("SELECT COALESCE(MAX(id), 0) + 1 FROM inventario_ajustes")
                next_id = self.cur.fetchone()[0]
                numero_ajuste = f"{prefix}-{next_id:06d}"

            observaciones_final = observaciones
            if idempotency_key and f"[IDEMPOTENCY:{idempotency_key}]" not in observaciones_final:
                observaciones_final = f"{observaciones_final} [IDEMPOTENCY:{idempotency_key}]".strip()

            self.cur.execute("""
                INSERT INTO inventario_ajustes (numero_ajuste, fecha, tipo_ajuste, motivo, observaciones, usuario_id)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (numero_ajuste, fecha_ajuste, tipo_ajuste, motivo, observaciones_final, usuario_id))
            ajuste_id = self.cur.lastrowid

            sentido = "ENTRADA" if tipo_ajuste == "CARGO" else "SALIDA"
            motivo_lower = motivo.lower()

            if tipo_ajuste == "CARGO":
                tipo_movimiento = "cargo_ajuste"
            else:
                if "vencimiento" in motivo_lower or "venc" in motivo_lower:
                    tipo_movimiento = "descargo_vencimiento"
                elif "rotura" in motivo_lower or "dan" in motivo_lower:
                    tipo_movimiento = "descargo_rotura"
                elif "uso_interno" in motivo_lower or "interno" in motivo_lower:
                    tipo_movimiento = "descargo_uso_interno"
                else:
                    tipo_movimiento = "descargo_merma"

            detalles_procesados = []
            for det in detalles:
                p_id = int(det["producto_id"])
                cant_dec = Decimal(str(det["cantidad"]))
                motivo_detalle = (det.get("motivo_detalle") or "").strip()

                self.cur.execute("SELECT id, codigo, nombre, stock, costo_cpp, costo FROM productos WHERE id = ?", (p_id,))
                prod_row = dict(self.cur.fetchone())
                stk_ant_dec = Decimal(str(prod_row.get("stock") or 0.0))
                cpp_ant_val = prod_row.get("costo_cpp")
                costo_cat_val = prod_row.get("costo")
                sku_cod = prod_row.get("codigo")

                if tipo_ajuste == "DESCARGO":
                    validar_stock_no_negativo(stk_ant_dec, cant_dec)
                    if cpp_ant_val is None or Decimal(str(cpp_ant_val)) <= Decimal("0"):
                        raise ErrorInconsistenciaCPP(
                            f"INCONSISTENCIA_CPP: Producto {sku_cod} tiene stock {stk_ant_dec} pero costo_cpp invalido ({cpp_ant_val})."
                        )
                    costo_u_dec = Decimal(str(cpp_ant_val)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                    costo_tot_dec = (cant_dec * costo_u_dec).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                    costo_cpp_nuevo_dec = costo_u_dec
                    stock_nuevo_dec = (stk_ant_dec - cant_dec).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                else:
                    m_eval = (motivo_detalle.lower() if motivo_detalle else motivo_lower)
                    es_sobrante = any(k in m_eval for k in ['sobrante', 'conteo', 'regularizacion'])

                    if es_sobrante:
                        if stk_ant_dec < Decimal("0"):
                            raise ErrorStockNegativo(f"STOCK_NEGATIVO: Stock {stk_ant_dec} no permite operar.")
                        if stk_ant_dec == Decimal("0"):
                            if cpp_ant_val is not None and Decimal(str(cpp_ant_val)) > Decimal("0"):
                                costo_u_dec = Decimal(str(cpp_ant_val)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                            elif det.get("costo_unitario") and float(det.get("costo_unitario")) > 0:
                                costo_u_dec = Decimal(str(det.get("costo_unitario"))).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                            else:
                                costo_u_dec = Decimal(str(costo_cat_val or 0.0)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                            costo_cpp_nuevo_dec = costo_u_dec
                            stock_nuevo_dec = cant_dec.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                            costo_tot_dec = (cant_dec * costo_u_dec).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                        else:
                            if cpp_ant_val is None or Decimal(str(cpp_ant_val)) <= Decimal("0"):
                                raise ErrorInconsistenciaCPP(
                                    f"INCONSISTENCIA_CPP: Producto {sku_cod} tiene stock {stk_ant_dec} pero costo_cpp invalido ({cpp_ant_val})."
                                )
                            costo_u_dec = Decimal(str(cpp_ant_val)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                            costo_cpp_nuevo_dec = costo_u_dec
                            stock_nuevo_dec = (stk_ant_dec + cant_dec).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                            costo_tot_dec = (cant_dec * costo_u_dec).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                    else:
                        costo_in = det.get("costo_unitario")
                        if costo_in is not None and float(costo_in) > 0:
                            costo_u_dec = Decimal(str(costo_in)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                        else:
                            if stk_ant_dec > Decimal("0") and cpp_ant_val and Decimal(str(cpp_ant_val)) > Decimal("0"):
                                costo_u_dec = Decimal(str(cpp_ant_val)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                            else:
                                costo_u_dec = Decimal(str(costo_cat_val or 0.0)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

                        if stk_ant_dec == Decimal("0"):
                            costo_cpp_nuevo_dec = costo_u_dec
                            stock_nuevo_dec = cant_dec.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                            costo_tot_dec = (cant_dec * costo_u_dec).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                        else:
                            if cpp_ant_val is None or Decimal(str(cpp_ant_val)) <= Decimal("0"):
                                raise ErrorInconsistenciaCPP(
                                    f"INCONSISTENCIA_CPP: Producto {sku_cod} tiene stock {stk_ant_dec} pero costo_cpp invalido ({cpp_ant_val})."
                                )
                            cpp_ant_dec = Decimal(str(cpp_ant_val))
                            res_calc = calcular_cpp_entrada(stk_ant_dec, cpp_ant_dec, cant_dec, costo_u_dec)
                            stock_nuevo_dec = Decimal(str(res_calc["stock_nuevo"]))
                            costo_cpp_nuevo_dec = Decimal(str(res_calc["cpp_nuevo"]))
                            costo_tot_dec = (cant_dec * costo_u_dec).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

                self.cur.execute("""
                    UPDATE productos 
                    SET stock = ?, costo_cpp = ? 
                    WHERE id = ?
                """, (float(stock_nuevo_dec), float(costo_cpp_nuevo_dec), p_id))

                self.cur.execute("""
                    INSERT INTO inventario_ajuste_detalles 
                    (ajuste_id, producto_id, cantidad, costo_unitario, costo_total, stock_anterior, stock_nuevo, motivo_detalle)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (ajuste_id, p_id, float(cant_dec), float(costo_u_dec), float(costo_tot_dec), float(stk_ant_dec), float(stock_nuevo_dec), motivo_detalle))
                ajuste_det_id = self.cur.lastrowid

                mov_id = registrar_movimiento_inventario(
                    cursor=self.cur,
                    producto_id=p_id,
                    fecha=fecha_ajuste,
                    tipo_movimiento=tipo_movimiento,
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
                    usuario_id=usuario_id
                )

                detalles_procesados.append({
                    "id": ajuste_det_id,
                    "producto_id": p_id,
                    "cantidad": float(cant_dec),
                    "costo_unitario": float(costo_u_dec),
                    "costo_total": float(costo_tot_dec),
                    "stock_anterior": float(stk_ant_dec),
                    "stock_nuevo": float(stock_nuevo_dec),
                    "costo_cpp_nuevo": float(costo_cpp_nuevo_dec),
                    "movimiento_id": mov_id
                })

            self.conn.commit()
            return {
                "success": True,
                "id": ajuste_id,
                "numero_ajuste": numero_ajuste,
                "tipo_ajuste": tipo_ajuste,
                "motivo": motivo,
                "fecha": fecha_ajuste,
                "detalles": detalles_procesados
            }
        except Exception:
            self.conn.rollback()
            raise

    # =========================================================================
    # CASOS DE PRUEBA OFICIALES AJU-CPP-01 A AJU-CPP-20
    # =========================================================================

    def test_aju_cpp_01_cargo_sobrante_stock_positivo_invariante(self):
        """AJU-CPP-01: Sobrante de conteo físico incrementa stock y mantiene el CPP unitario INVARIANTE."""
        # Producto 1: Stock 1733, CPP 29.0
        res = self.procesar_ajuste({
            "tipo_ajuste": "CARGO",
            "motivo": "sobrante",
            "fecha": "2026-10-29 14:00:00",
            "detalles": [{"producto_id": 1, "cantidad": 50}]
        })
        self.assertTrue(res["success"])
        self.cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = 1")
        prod = dict(self.cur.fetchone())
        self.assertEqual(prod["stock"], 1783.0)
        self.assertEqual(prod["costo_cpp"], 29.0)  # Invariante!
        # Movimiento en kardex
        det = res["detalles"][0]
        self.assertEqual(det["costo_unitario"], 29.0)
        self.assertEqual(det["costo_total"], 1450.0)

    def test_aju_cpp_02_cargo_regularizacion_invariante(self):
        """AJU-CPP-02: Regularización de inventario físico mantiene CPP unitario invariante."""
        res = self.procesar_ajuste({
            "tipo_ajuste": "CARGO",
            "motivo": "regularizacion",
            "fecha": "2026-10-29 14:05:00",
            "detalles": [{"producto_id": 2, "cantidad": 10}]
        })
        self.cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = 2")
        prod = dict(self.cur.fetchone())
        self.assertEqual(prod["stock"], 870.0)
        self.assertEqual(prod["costo_cpp"], 29.0)

    def test_aju_cpp_03_cargo_hallazgo_recalcula_ponderado(self):
        """AJU-CPP-03: Hallazgo de mercancía con costo tasado recalcula CPP mediante promedio ponderado."""
        # Producto 4: Stock 500, CPP 5.0 (Valor: 2500)
        # Ingreso tasado: 100 u a $8.00 (Valor entrada: 800)
        # Nuevo stock = 600, Nuevo valor = 3300, Nuevo CPP = 3300 / 600 = 5.5000
        res = self.procesar_ajuste({
            "tipo_ajuste": "CARGO",
            "motivo": "hallazgo",
            "fecha": "2026-10-29 14:10:00",
            "detalles": [{"producto_id": 4, "cantidad": 100, "costo_unitario": 8.0}]
        })
        self.cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = 4")
        prod = dict(self.cur.fetchone())
        self.assertEqual(prod["stock"], 600.0)
        self.assertEqual(prod["costo_cpp"], 5.5)

    def test_aju_cpp_04_cargo_stock_cero_establece_cpp_inicial(self):
        """AJU-CPP-04: Cargo sobre producto con stock cero establece directamente el nuevo CPP al costo de entrada."""
        # Creamos producto con stock 0
        self.cur.execute("""
            INSERT INTO productos (codigo, nombre, categoria_id, tipo, impuesto_tipo, stock, costo_cpp, costo, precio_base, activo)
            VALUES ('PROD_ZERO', 'Producto Stock Cero', 1, 'producto', 'exento', 0.0, 0.0, 10.0, 20.0, 1)
        """)
        p_id = self.cur.lastrowid
        self.conn.commit()

        res = self.procesar_ajuste({
            "tipo_ajuste": "CARGO",
            "motivo": "hallazgo",
            "fecha": "2026-10-29 14:15:00",
            "detalles": [{"producto_id": p_id, "cantidad": 25, "costo_unitario": 12.5}]
        })
        self.cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = ?", (p_id,))
        p = dict(self.cur.fetchone())
        self.assertEqual(p["stock"], 25.0)
        self.assertEqual(p["costo_cpp"], 12.5)

    def test_aju_cpp_05_descargo_merma_costo_cpp_vigente(self):
        """AJU-CPP-05: Descargo por merma se valúa estrictamente al CPP vigente ignorando costo enviado por usuario."""
        # Producto 3: Stock 860, CPP 100.0
        res = self.procesar_ajuste({
            "tipo_ajuste": "DESCARGO",
            "motivo": "merma",
            "fecha": "2026-10-29 14:20:00",
            "detalles": [{"producto_id": 3, "cantidad": 10, "costo_unitario": 999.0}]  # 999 debe ser ignorado
        })
        det = res["detalles"][0]
        self.assertEqual(det["costo_unitario"], 100.0)
        self.assertEqual(det["costo_total"], 1000.0)
        self.cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = 3")
        prod = dict(self.cur.fetchone())
        self.assertEqual(prod["stock"], 850.0)
        self.assertEqual(prod["costo_cpp"], 100.0)

    def test_aju_cpp_06_descargo_vencimiento_tipo_movimiento(self):
        """AJU-CPP-06: Descargo con motivo vencimiento genera tipo_movimiento 'descargo_vencimiento'."""
        res = self.procesar_ajuste({
            "tipo_ajuste": "DESCARGO",
            "motivo": "vencimiento",
            "fecha": "2026-10-29 14:25:00",
            "detalles": [{"producto_id": 1, "cantidad": 5}]
        })
        mov_id = res["detalles"][0]["movimiento_id"]
        self.cur.execute("SELECT tipo_movimiento, sentido FROM inventario_movimientos WHERE id = ?", (mov_id,))
        mov = dict(self.cur.fetchone())
        self.assertEqual(mov["tipo_movimiento"], "descargo_vencimiento")
        self.assertEqual(mov["sentido"], "SALIDA")

    def test_aju_cpp_07_descargo_rotura_tipo_movimiento(self):
        """AJU-CPP-07: Descargo con motivo rotura genera tipo_movimiento 'descargo_rotura'."""
        res = self.procesar_ajuste({
            "tipo_ajuste": "DESCARGO",
            "motivo": "rotura",
            "fecha": "2026-10-29 14:30:00",
            "detalles": [{"producto_id": 2, "cantidad": 2}]
        })
        mov_id = res["detalles"][0]["movimiento_id"]
        self.cur.execute("SELECT tipo_movimiento FROM inventario_movimientos WHERE id = ?", (mov_id,))
        self.assertEqual(self.cur.fetchone()[0], "descargo_rotura")

    def test_aju_cpp_08_descargo_uso_interno_tipo_movimiento(self):
        """AJU-CPP-08: Descargo con motivo uso interno genera tipo_movimiento 'descargo_uso_interno'."""
        res = self.procesar_ajuste({
            "tipo_ajuste": "DESCARGO",
            "motivo": "uso_interno",
            "fecha": "2026-10-29 14:35:00",
            "detalles": [{"producto_id": 5, "cantidad": 1}]
        })
        mov_id = res["detalles"][0]["movimiento_id"]
        self.cur.execute("SELECT tipo_movimiento FROM inventario_movimientos WHERE id = ?", (mov_id,))
        self.assertEqual(self.cur.fetchone()[0], "descargo_uso_interno")

    def test_aju_cpp_09_descargo_mantiene_cpp_invariante(self):
        """AJU-CPP-09: Un descargo disminuye las existencias pero deja inalterado el CPP unitario remanente."""
        # Producto 5: Stock 501, CPP 95.0
        res = self.procesar_ajuste({
            "tipo_ajuste": "DESCARGO",
            "motivo": "merma",
            "fecha": "2026-10-29 14:40:00",
            "detalles": [{"producto_id": 5, "cantidad": 101}]
        })
        self.cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = 5")
        prod = dict(self.cur.fetchone())
        self.assertEqual(prod["stock"], 400.0)
        self.assertEqual(prod["costo_cpp"], 95.0)  # Totalmente invariante!

    def test_aju_cpp_10_descargo_insuficiente_rechazado(self):
        """AJU-CPP-10: Descargo con cantidad mayor a la disponible lanza ErrorStockNegativo."""
        # Producto 4 tiene stock 500
        with self.assertRaises(ErrorStockNegativo):
            self.procesar_ajuste({
                "tipo_ajuste": "DESCARGO",
                "motivo": "merma",
                "fecha": "2026-10-29 14:45:00",
                "detalles": [{"producto_id": 4, "cantidad": 501}]
            })
        # Verificar que el stock no fue modificado
        self.cur.execute("SELECT stock FROM productos WHERE id = 4")
        self.assertEqual(self.cur.fetchone()[0], 500.0)

    def test_aju_cpp_11_descargo_sobre_stock_cero_rechazado(self):
        """AJU-CPP-11: Intento de descargo sobre producto con stock cero es rechazado de inmediato."""
        self.cur.execute("""
            INSERT INTO productos (codigo, nombre, categoria_id, tipo, impuesto_tipo, stock, costo_cpp, costo, precio_base, activo)
            VALUES ('ZERO_PROD2', 'Stock Cero 2', 1, 'producto', 'exento', 0.0, 0.0, 10.0, 20.0, 1)
        """)
        p_id = self.cur.lastrowid
        self.conn.commit()

        with self.assertRaises(ErrorStockNegativo):
            self.procesar_ajuste({
                "tipo_ajuste": "DESCARGO",
                "motivo": "merma",
                "fecha": "2026-10-29 14:50:00",
                "detalles": [{"producto_id": p_id, "cantidad": 1}]
            })

    def test_aju_cpp_12_rechazo_servicio(self):
        """AJU-CPP-12: Intento de ajuste sobre un producto tipo 'servicio' es rechazado con ValueError."""
        self.cur.execute("""
            INSERT INTO productos (codigo, nombre, categoria_id, tipo, impuesto_tipo, stock, costo_cpp, costo, precio_base, activo)
            VALUES ('SRV_TEST', 'Flete de Transporte', 1, 'servicio', 'exento', 0.0, 0.0, 0.0, 50.0, 1)
        """)
        srv_id = self.cur.lastrowid
        self.conn.commit()

        with self.assertRaises(ValueError) as ctx:
            self.procesar_ajuste({
                "tipo_ajuste": "CARGO",
                "motivo": "sobrante",
                "fecha": "2026-10-29 14:55:00",
                "detalles": [{"producto_id": srv_id, "cantidad": 1}]
            })
        self.assertIn("servicios", str(ctx.exception))

    def test_aju_cpp_13_rechazo_movimiento_retroactivo(self):
        """AJU-CPP-13: Movimiento con fecha anterior al último movimiento del producto es bloqueado por ErrorMovimientoRetroactivoNoPermitido."""
        # Fecha en el pasado (2020-01-01)
        with self.assertRaises(ErrorMovimientoRetroactivoNoPermitido):
            self.procesar_ajuste({
                "tipo_ajuste": "CARGO",
                "motivo": "sobrante",
                "fecha": "2020-01-01 00:00:00",
                "detalles": [{"producto_id": 1, "cantidad": 10}]
            })

    def test_aju_cpp_14_trazabilidad_documento_linea_id(self):
        """AJU-CPP-14: Cada movimiento generado tiene su documento_linea_id vinculado a inventario_ajuste_detalles.id."""
        res = self.procesar_ajuste({
            "tipo_ajuste": "CARGO",
            "motivo": "sobrante",
            "fecha": "2026-10-29 15:00:00",
            "detalles": [{"producto_id": 1, "cantidad": 15}]
        })
        mov_id = res["detalles"][0]["movimiento_id"]
        det_id = res["detalles"][0]["id"]
        self.cur.execute("SELECT documento_linea_id, documento_tipo, documento_id FROM inventario_movimientos WHERE id = ?", (mov_id,))
        m = dict(self.cur.fetchone())
        self.assertEqual(m["documento_linea_id"], det_id)
        self.assertEqual(m["documento_tipo"], "INVENTARIO_AJUSTE")
        self.assertEqual(m["documento_id"], res["id"])

    def test_aju_cpp_15_idempotencia_numero_ajuste(self):
        """AJU-CPP-15: Enviar el mismo numero_ajuste no duplica movimientos ni altera saldos."""
        payload = {
            "tipo_ajuste": "CARGO",
            "motivo": "sobrante",
            "numero_ajuste": "CAR-TEST-0001",
            "fecha": "2026-10-29 15:05:00",
            "detalles": [{"producto_id": 2, "cantidad": 10}]
        }
        res1 = self.procesar_ajuste(payload)
        self.cur.execute("SELECT stock FROM productos WHERE id = 2")
        stock1 = self.cur.fetchone()[0]

        # Reenvio identico
        res2 = self.procesar_ajuste(payload)
        self.assertTrue(res2.get("duplicado_ignorado"))
        self.cur.execute("SELECT stock FROM productos WHERE id = 2")
        stock2 = self.cur.fetchone()[0]
        self.assertEqual(stock1, stock2)

    def test_aju_cpp_16_idempotencia_key(self):
        """AJU-CPP-16: Reenvío con el mismo idempotency_key devuelve duplicado_ignorado y no genera movimientos extras."""
        payload = {
            "tipo_ajuste": "DESCARGO",
            "motivo": "merma",
            "idempotency_key": "IDEMP-KEY-999888",
            "fecha": "2026-10-29 15:10:00",
            "detalles": [{"producto_id": 3, "cantidad": 5}]
        }
        res1 = self.procesar_ajuste(payload)
        self.cur.execute("SELECT COUNT(*) FROM inventario_movimientos WHERE producto_id = 3")
        mov_cnt1 = self.cur.fetchone()[0]

        res2 = self.procesar_ajuste(payload)
        self.assertTrue(res2.get("duplicado_ignorado"))
        self.cur.execute("SELECT COUNT(*) FROM inventario_movimientos WHERE producto_id = 3")
        mov_cnt2 = self.cur.fetchone()[0]
        self.assertEqual(mov_cnt1, mov_cnt2)

    def test_aju_cpp_17_ajuste_multilinea_mismo_sku(self):
        """AJU-CPP-17: Ajuste multilínea que contiene dos líneas del mismo SKU valida el stock total acumulado."""
        # Producto 4 tiene 500 u. Solicitamos 300 + 250 = 550 u (Insuficiente)
        with self.assertRaises(ErrorStockNegativo):
            self.procesar_ajuste({
                "tipo_ajuste": "DESCARGO",
                "motivo": "merma",
                "fecha": "2026-10-29 15:15:00",
                "detalles": [
                    {"producto_id": 4, "cantidad": 300},
                    {"producto_id": 4, "cantidad": 250}
                ]
            })

    def test_aju_cpp_18_rollback_en_error(self):
        """AJU-CPP-18: Si una línea falla en un ajuste multilínea, ninguna línea se aplica (Atomicidad ACID)."""
        # Linea 1 valida (Prod 1), Linea 2 invalida (Prod 4 excede stock)
        with self.assertRaises(ErrorStockNegativo):
            self.procesar_ajuste({
                "tipo_ajuste": "DESCARGO",
                "motivo": "merma",
                "fecha": "2026-10-29 15:20:00",
                "detalles": [
                    {"producto_id": 1, "cantidad": 10},
                    {"producto_id": 4, "cantidad": 9999}
                ]
            })
        # Prod 1 no debe haber cambiado su stock
        self.cur.execute("SELECT stock FROM productos WHERE id = 1")
        self.assertEqual(self.cur.fetchone()[0], 1733.0)

    def test_aju_cpp_19_reconstruccion_cpp_post_ajustes(self):
        """AJU-CPP-19: Reconstrucción determinística del CPP post-ajustes coincide 100% con saldos en productos."""
        # Ejecutamos un cargo por sobrante y un descargo por merma
        self.procesar_ajuste({
            "tipo_ajuste": "CARGO",
            "motivo": "sobrante",
            "fecha": "2026-10-29 15:25:00",
            "detalles": [{"producto_id": 1, "cantidad": 20}]
        })
        self.procesar_ajuste({
            "tipo_ajuste": "DESCARGO",
            "motivo": "merma",
            "fecha": "2026-10-29 15:30:00",
            "detalles": [{"producto_id": 1, "cantidad": 5}]
        })
        # Reconstruir determinísticamente
        rec = reconstruir_cpp_desde_apertura(self.cur, producto_id=1)
        self.cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = 1")
        prod = dict(self.cur.fetchone())
        self.assertEqual(rec["stock_reconstruido"], prod["stock"])
        self.assertEqual(rec["cpp_reconstruido"], prod["costo_cpp"])

    def test_aju_cpp_20_conciliacion_general_post_ajustes(self):
        """AJU-CPP-20: La conciliación general de inventario reporta CONCILIADO_OK tras aplicar ajustes."""
        self.procesar_ajuste({
            "tipo_ajuste": "CARGO",
            "motivo": "sobrante",
            "fecha": "2026-10-29 15:35:00",
            "detalles": [{"producto_id": 2, "cantidad": 15}]
        })
        self.procesar_ajuste({
            "tipo_ajuste": "DESCARGO",
            "motivo": "rotura",
            "fecha": "2026-10-29 15:40:00",
            "detalles": [{"producto_id": 2, "cantidad": 5}]
        })
        conc = conciliar_inventario(self.conn)
        self.assertEqual(conc["estado_general"], "CONCILIADO_OK")
        self.assertEqual(conc["total_diferencia"], 0)

if __name__ == "__main__":
    unittest.main()
