"""
test_fase2f5b_ajustes_cpp.py - Suite de pruebas automatizadas para la Implementación Transaccional
del Motor CPP en Ajustes de Inventario (FASE 2F-5B).
Cubre exactamente los 24 casos obligatorios aprobados en FASE 2F-5A / 2F-5B (AJ-CPP-01 a AJ-CPP-24).
Opera sobre copias aisladas temporales de SQLite para preservar al 100% la base de datos canónica de producción.
"""

import sys
import os
import unittest
import sqlite3
import shutil
from decimal import Decimal

# Configurar path del proyecto
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

import database
from database import (
    auditar_y_migrar_db,
    conciliar_inventario,
    reconstruir_cpp_desde_apertura,
    procesar_ajuste_inventario_cpp,
    anular_ajuste_inventario,
    ErrorStockNegativo,
    ErrorMovimientoRetroactivoNoPermitido,
    ErrorInconsistenciaCPP,
    ErrorAnulacionAjusteConMovimientosPosteriores,
)


class TestFase2F5BAjustesCPP(unittest.TestCase):

    def setUp(self):
        """Crea una base de datos SQLite aislada temporal con la migración aditiva de Fase 2F-5B aplicada."""
        self.test_db_path = os.path.join(BASE_DIR, "test_fase2f5b_temp.db")
        shutil.copy2(database.DB_PATH, self.test_db_path)
        self.conn = sqlite3.connect(self.test_db_path)
        self.conn.row_factory = sqlite3.Row
        self.cur = self.conn.cursor()
        auditar_y_migrar_db(self.conn, self.cur)

    def tearDown(self):
        """Cierra y elimina la base de datos temporal."""
        self.conn.close()
        if os.path.exists(self.test_db_path):
            try:
                os.remove(self.test_db_path)
            except Exception:
                pass

    def procesar_ajuste(self, payload):
        return procesar_ajuste_inventario_cpp(
            cursor=self.cur,
            payload=payload,
            conn=self.conn,
            auto_commit=True
        )

    def anular_ajuste(self, ajuste_id, motivo="Anulación de ajuste en prueba"):
        return anular_ajuste_inventario(
            cursor=self.cur,
            ajuste_id=ajuste_id,
            motivo=motivo,
            usuario_id=1,
            conn=self.conn,
            auto_commit=True
        )

    # =========================================================================
    # AJ-CPP-01 — Sobrante mantiene CPP (CARGO_SOBRANTE_CONTEO)
    # =========================================================================
    def test_AJ_CPP_01_sobrante_mantiene_cpp(self):
        """AJ-CPP-01: CARGO_SOBRANTE_CONTEO con stock > 0 utiliza exclusivamente el CPP vigente y NO modifica el CPP."""
        # Producto ID 1 (HAR008): stock=1733.0, costo_cpp=29.0000
        res = self.procesar_ajuste({
            "tipo_ajuste": "CARGO",
            "subtipo_ajuste": "CARGO_SOBRANTE_CONTEO",
            "motivo": "Sobrante verificado en conteo cíclico",
            "fecha": "2026-10-31 10:00:00",
            "detalles": [{"producto_id": 1, "cantidad": 7}]
        })
        self.assertTrue(res["success"])
        self.assertEqual(res["subtipo_ajuste"], "CARGO_SOBRANTE_CONTEO")
        det = res["detalles"][0]
        self.assertAlmostEqual(det["stock_anterior"], 1733.0, places=4)
        self.assertAlmostEqual(det["stock_nuevo"], 1740.0, places=4)
        self.assertAlmostEqual(det["costo_unitario"], 29.0, places=4)
        self.assertAlmostEqual(det["costo_total"], 203.0, places=4)
        self.assertAlmostEqual(det["cpp_anterior"], 29.0, places=4)
        self.assertAlmostEqual(det["cpp_nuevo"], 29.0, places=4)

        self.cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = 1")
        prod = self.cur.fetchone()
        self.assertAlmostEqual(prod["stock"], 1740.0, places=4)
        self.assertAlmostEqual(prod["costo_cpp"], 29.0, places=4)

    # =========================================================================
    # AJ-CPP-02 — Sobrante con costo externo bloqueado
    # =========================================================================
    def test_AJ_CPP_02_sobrante_con_costo_externo_bloqueado(self):
        """AJ-CPP-02: Si CARGO_SOBRANTE_CONTEO envía un costo_unitario distinto al CPP vigente -> SOBRANTE_NO_ADMITE_COSTO_EXTERNO."""
        with self.assertRaises(ValueError) as ctx:
            self.procesar_ajuste({
                "tipo_ajuste": "CARGO",
                "subtipo_ajuste": "CARGO_SOBRANTE_CONTEO",
                "motivo": "Intento de sobrante con costo arbitrario",
                "fecha": "2026-10-31 10:05:00",
                "detalles": [{"producto_id": 1, "cantidad": 2, "costo_unitario": 45.0}]
            })
        self.assertIn("SOBRANTE_NO_ADMITE_COSTO_EXTERNO", str(ctx.exception))

        # Verificar que stock y CPP no cambiaron
        self.cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = 1")
        prod = self.cur.fetchone()
        self.assertAlmostEqual(prod["stock"], 1733.0, places=4)
        self.assertAlmostEqual(prod["costo_cpp"], 29.0, places=4)

    # =========================================================================
    # AJ-CPP-03 — Sobrante con stock cero
    # =========================================================================
    def test_AJ_CPP_03_sobrante_con_stock_cero(self):
        """AJ-CPP-03: Si stock = 0, CARGO_SOBRANTE_CONTEO solo se permite si CPP certificado > 0; si CPP <= 0 o NULL se bloquea."""
        # Caso A: Stock = 0 pero conserva último CPP certificado > 0 (ej. 29.0) -> Permitido
        self.cur.execute("UPDATE productos SET stock = 0.0, costo_cpp = 29.0 WHERE id = 1")
        self.conn.commit()

        res = self.procesar_ajuste({
            "tipo_ajuste": "CARGO",
            "subtipo_ajuste": "CARGO_SOBRANTE_CONTEO",
            "motivo": "Sobrante tras agotamiento temporal con CPP certificado",
            "fecha": "2026-10-31 10:10:00",
            "detalles": [{"producto_id": 1, "cantidad": 3}]
        })
        self.assertTrue(res["success"])
        self.assertAlmostEqual(res["detalles"][0]["cpp_nuevo"], 29.0, places=4)
        self.assertAlmostEqual(res["detalles"][0]["stock_nuevo"], 3.0, places=4)

        # Caso B: Stock = 0 y CPP = 0 o NULL -> Bloqueado con ErrorInconsistenciaCPP
        self.cur.execute("UPDATE productos SET stock = 0.0, costo_cpp = 0.0 WHERE id = 1")
        self.conn.commit()
        with self.assertRaises(ErrorInconsistenciaCPP):
            self.procesar_ajuste({
                "tipo_ajuste": "CARGO",
                "subtipo_ajuste": "CARGO_SOBRANTE_CONTEO",
                "motivo": "Sobrante sin CPP certificado",
                "fecha": "2026-10-31 10:15:00",
                "detalles": [{"producto_id": 1, "cantidad": 2}]
            })

    # =========================================================================
    # AJ-CPP-04 — Hallazgo con soporte pondera CPP (CARGO_HALLAZGO_CON_SOPORTE)
    # =========================================================================
    def test_AJ_CPP_04_hallazgo_con_soporte_pondera_cpp(self):
        """AJ-CPP-04: CARGO_HALLAZGO_CON_SOPORTE con stock > 0 recalcula CPP por promedio ponderado exacto."""
        # Producto ID 4 (HARRESP): stock=500.0, CPP=5.0000 (valor=2500.0)
        # Entrada de 500 unidades a $7.0000 (valor=3500.0) -> nuevo stock=1000.0, valor=6000.0 -> CPP_nuevo = 6.0000
        res = self.procesar_ajuste({
            "tipo_ajuste": "CARGO",
            "subtipo_ajuste": "CARGO_HALLAZGO_CON_SOPORTE",
            "motivo": "Hallazgo de mercancía respaldado por nota de entrega",
            "documento_referencia": "NE-2026-00981",
            "fecha": "2026-10-31 10:20:00",
            "detalles": [{"producto_id": 4, "cantidad": 500, "costo_unitario": 7.0}]
        })
        self.assertTrue(res["success"])
        det = res["detalles"][0]
        self.assertAlmostEqual(det["stock_nuevo"], 1000.0, places=4)
        self.assertAlmostEqual(det["cpp_anterior"], 5.0, places=4)
        self.assertAlmostEqual(det["cpp_nuevo"], 6.0, places=4)
        self.assertAlmostEqual(det["costo_total"], 3500.0, places=4)

        self.cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = 4")
        prod = self.cur.fetchone()
        self.assertAlmostEqual(prod["stock"], 1000.0, places=4)
        self.assertAlmostEqual(prod["costo_cpp"], 6.0, places=4)

    # =========================================================================
    # AJ-CPP-05 — Hallazgo con stock cero establece CPP
    # =========================================================================
    def test_AJ_CPP_05_hallazgo_con_stock_cero_establece_cpp(self):
        """AJ-CPP-05: CARGO_HALLAZGO_CON_SOPORTE cuando stock == 0 establece CPP_nuevo = costo_unitario."""
        self.cur.execute("UPDATE productos SET stock = 0.0, costo_cpp = 29.0 WHERE id = 1")
        self.conn.commit()

        res = self.procesar_ajuste({
            "tipo_ajuste": "CARGO",
            "subtipo_ajuste": "CARGO_HALLAZGO_CON_SOPORTE",
            "motivo": "Hallazgo con stock cero",
            "documento_referencia": "ACTA-HALLAZGO-005",
            "fecha": "2026-10-31 10:25:00",
            "detalles": [{"producto_id": 1, "cantidad": 10, "costo_unitario": 34.50}]
        })
        det = res["detalles"][0]
        self.assertAlmostEqual(det["stock_nuevo"], 10.0, places=4)
        self.assertAlmostEqual(det["cpp_nuevo"], 34.50, places=4)

    # =========================================================================
    # AJ-CPP-06 — Hallazgo sin soporte bloqueado
    # =========================================================================
    def test_AJ_CPP_06_hallazgo_sin_soporte_bloqueado(self):
        """AJ-CPP-06: CARGO_HALLAZGO_CON_SOPORTE sin documento_referencia o sin costo_unitario > 0 -> bloqueado."""
        # Sin documento_referencia
        with self.assertRaises(ValueError) as ctx1:
            self.procesar_ajuste({
                "tipo_ajuste": "CARGO",
                "subtipo_ajuste": "CARGO_HALLAZGO_CON_SOPORTE",
                "motivo": "Hallazgo sin documento",
                "fecha": "2026-10-31 10:30:00",
                "detalles": [{"producto_id": 1, "cantidad": 5, "costo_unitario": 30.0}]
            })
        self.assertIn("HALLAZGO_REQUIERE_COSTO_Y_SOPORTE", str(ctx1.exception))

        # Sin costo_unitario (prohibido usar productos.costo como fallback)
        with self.assertRaises(ValueError) as ctx2:
            self.procesar_ajuste({
                "tipo_ajuste": "CARGO",
                "subtipo_ajuste": "CARGO_HALLAZGO_CON_SOPORTE",
                "motivo": "Hallazgo sin costo unitario",
                "documento_referencia": "DOC-123",
                "fecha": "2026-10-31 10:31:00",
                "detalles": [{"producto_id": 1, "cantidad": 5}]
            })
        self.assertIn("HALLAZGO_REQUIERE_COSTO_Y_SOPORTE", str(ctx2.exception))

    # =========================================================================
    # AJ-CPP-07 — Tasación manual válida (CARGO_TASACION_MANUAL)
    # =========================================================================
    def test_AJ_CPP_07_tasacion_manual_valida(self):
        """AJ-CPP-07: CARGO_TASACION_MANUAL con costo_unitario > 0, justificacion_tecnica, documento_referencia y autorizado_por."""
        # Producto ID 2 (HARPIZZ): stock=860.0, CPP=29.0000 (valor=24940.0)
        # Entrada de 140 unidades a $39.0000 (valor=5460.0) -> stock=1000.0, valor=30400.0 -> CPP_nuevo = 30.4000
        res = self.procesar_ajuste({
            "tipo_ajuste": "CARGO",
            "subtipo_ajuste": "CARGO_TASACION_MANUAL",
            "motivo": "Reincorporación de lote con tasación pericial",
            "justificacion_tecnica": "Informe técnico de laboratorio certificando aptitud del lote",
            "documento_referencia": "ACTA-PERICIAL-2026-09",
            "autorizado_por": "Ing. Jose Morales",
            "fecha": "2026-10-31 10:35:00",
            "detalles": [{"producto_id": 2, "cantidad": 140, "costo_unitario": 39.0}]
        })
        self.assertTrue(res["success"])
        self.assertEqual(res["subtipo_ajuste"], "CARGO_TASACION_MANUAL")
        self.assertEqual(res["autorizado_por"], "Ing. Jose Morales")
        det = res["detalles"][0]
        self.assertAlmostEqual(det["stock_nuevo"], 1000.0, places=4)
        self.assertAlmostEqual(det["cpp_anterior"], 29.0, places=4)
        self.assertAlmostEqual(det["cpp_nuevo"], 30.40, places=4)

    # =========================================================================
    # AJ-CPP-08 — Tasación sin autorización bloqueada
    # =========================================================================
    def test_AJ_CPP_08_tasacion_sin_autorizacion_bloqueada(self):
        """AJ-CPP-08: CARGO_TASACION_MANUAL sin autorizado_por o sin documento_referencia -> TASACION_MANUAL_INCOMPLETA."""
        with self.assertRaises(ValueError) as ctx:
            self.procesar_ajuste({
                "tipo_ajuste": "CARGO",
                "subtipo_ajuste": "CARGO_TASACION_MANUAL",
                "motivo": "Tasación sin firma autorizada",
                "justificacion_tecnica": "Avalúo interno",
                "documento_referencia": "ACTA-01",
                # Falta autorizado_por
                "fecha": "2026-10-31 10:40:00",
                "detalles": [{"producto_id": 2, "cantidad": 5, "costo_unitario": 35.0}]
            })
        self.assertIn("TASACION_MANUAL_INCOMPLETA", str(ctx.exception))

    # =========================================================================
    # AJ-CPP-09 — Merma al CPP vigente (DESCARGO_MERMA)
    # =========================================================================
    def test_AJ_CPP_09_merma_al_cpp_vigente(self):
        """AJ-CPP-09: DESCARGO_MERMA valora la salida al CPP vigente sin alterar el CPP e ignora costo_unitario externo."""
        # Producto ID 1: stock=1733.0, CPP=29.0
        res = self.procesar_ajuste({
            "tipo_ajuste": "DESCARGO",
            "subtipo_ajuste": "DESCARGO_MERMA",
            "motivo": "Merma por evaporación/manipulación",
            "fecha": "2026-10-31 11:00:00",
            "detalles": [{"producto_id": 1, "cantidad": 3, "costo_unitario": 500.0}]  # Debe ignorar 500.0
        })
        det = res["detalles"][0]
        self.assertEqual(det["subtipo_movimiento"], "DESCARGO_MERMA")
        self.assertAlmostEqual(det["costo_unitario"], 29.0, places=4)
        self.assertAlmostEqual(det["costo_total"], 87.0, places=4)
        self.assertAlmostEqual(det["cpp_anterior"], 29.0, places=4)
        self.assertAlmostEqual(det["cpp_nuevo"], 29.0, places=4)
        self.assertAlmostEqual(det["stock_nuevo"], 1730.0, places=4)

    # =========================================================================
    # AJ-CPP-10 — Vencimiento al CPP vigente (DESCARGO_VENCIMIENTO)
    # =========================================================================
    def test_AJ_CPP_10_vencimiento_al_cpp_vigente(self):
        """AJ-CPP-10: DESCARGO_VENCIMIENTO valora al CPP vigente y conserva CPP."""
        # Producto ID 2: stock=860.0, CPP=29.0
        res = self.procesar_ajuste({
            "tipo_ajuste": "DESCARGO",
            "subtipo_ajuste": "DESCARGO_VENCIMIENTO",
            "motivo": "Lote vencido retirado de almacén",
            "fecha": "2026-10-31 11:05:00",
            "detalles": [{"producto_id": 2, "cantidad": 10}]
        })
        det = res["detalles"][0]
        self.assertEqual(det["subtipo_movimiento"], "DESCARGO_VENCIMIENTO")
        self.assertAlmostEqual(det["costo_unitario"], 29.0, places=4)
        self.assertAlmostEqual(det["costo_total"], 290.0, places=4)
        self.assertAlmostEqual(det["cpp_nuevo"], 29.0, places=4)
        self.assertAlmostEqual(det["stock_nuevo"], 850.0, places=4)

    # =========================================================================
    # AJ-CPP-11 — Rotura al CPP vigente (DESCARGO_ROTURA)
    # =========================================================================
    def test_AJ_CPP_11_rotura_al_cpp_vigente(self):
        """AJ-CPP-11: DESCARGO_ROTURA valora al CPP vigente y conserva CPP."""
        # Producto ID 3: stock=860.0, CPP=100.0
        res = self.procesar_ajuste({
            "tipo_ajuste": "DESCARGO",
            "subtipo_ajuste": "DESCARGO_ROTURA",
            "motivo": "Rotura de sacos en estiba",
            "fecha": "2026-10-31 11:10:00",
            "detalles": [{"producto_id": 3, "cantidad": 10}]
        })
        det = res["detalles"][0]
        self.assertEqual(det["subtipo_movimiento"], "DESCARGO_ROTURA")
        self.assertAlmostEqual(det["costo_unitario"], 100.0, places=4)
        self.assertAlmostEqual(det["costo_total"], 1000.0, places=4)
        self.assertAlmostEqual(det["cpp_nuevo"], 100.0, places=4)
        self.assertAlmostEqual(det["stock_nuevo"], 850.0, places=4)

    # =========================================================================
    # AJ-CPP-12 — Uso interno al CPP vigente (DESCARGO_USO_INTERNO)
    # =========================================================================
    def test_AJ_CPP_12_uso_interno_al_cpp_vigente(self):
        """AJ-CPP-12: DESCARGO_USO_INTERNO valora al CPP vigente y conserva CPP."""
        # Producto ID 4: stock=500.0, CPP=5.0
        res = self.procesar_ajuste({
            "tipo_ajuste": "DESCARGO",
            "subtipo_ajuste": "DESCARGO_USO_INTERNO",
            "motivo": "Consumo interno para pruebas de panadería",
            "fecha": "2026-10-31 11:15:00",
            "detalles": [{"producto_id": 4, "cantidad": 20}]
        })
        det = res["detalles"][0]
        self.assertEqual(det["subtipo_movimiento"], "DESCARGO_USO_INTERNO")
        self.assertAlmostEqual(det["costo_unitario"], 5.0, places=4)
        self.assertAlmostEqual(det["costo_total"], 100.0, places=4)
        self.assertAlmostEqual(det["cpp_nuevo"], 5.0, places=4)
        self.assertAlmostEqual(det["stock_nuevo"], 480.0, places=4)

    # =========================================================================
    # AJ-CPP-13 — Pérdida no explicada (DESCARGO_PERDIDA_NO_EXPLICADA)
    # =========================================================================
    def test_AJ_CPP_13_perdida_no_explicada_al_cpp_vigente(self):
        """AJ-CPP-13: DESCARGO_PERDIDA_NO_EXPLICADA valora al CPP vigente y conserva CPP."""
        # Producto ID 5: stock=501.0, CPP=95.0
        res = self.procesar_ajuste({
            "tipo_ajuste": "DESCARGO",
            "subtipo_ajuste": "DESCARGO_PERDIDA_NO_EXPLICADA",
            "motivo": "Faltante detectado en arqueo de almacén",
            "fecha": "2026-10-31 11:20:00",
            "detalles": [{"producto_id": 5, "cantidad": 1}]
        })
        det = res["detalles"][0]
        self.assertEqual(det["subtipo_movimiento"], "DESCARGO_PERDIDA_NO_EXPLICADA")
        self.assertAlmostEqual(det["costo_unitario"], 95.0, places=4)
        self.assertAlmostEqual(det["costo_total"], 95.0, places=4)
        self.assertAlmostEqual(det["cpp_nuevo"], 95.0, places=4)
        self.assertAlmostEqual(det["stock_nuevo"], 500.0, places=4)

    # =========================================================================
    # AJ-CPP-14 — Descargo hasta stock cero conserva CPP
    # =========================================================================
    def test_AJ_CPP_14_descargo_hasta_stock_cero_conserva_cpp(self):
        """AJ-CPP-14: Cuando un descargo deja stock == 0, NO pone costo_cpp en cero; conserva el último CPP válido."""
        # Producto ID 1 tiene stock = 1733.0, CPP = 29.0
        res = self.procesar_ajuste({
            "tipo_ajuste": "DESCARGO",
            "subtipo_ajuste": "DESCARGO_MERMA",
            "motivo": "Descargo total del stock disponible",
            "fecha": "2026-10-31 11:25:00",
            "detalles": [{"producto_id": 1, "cantidad": 1733}]
        })
        det = res["detalles"][0]
        self.assertAlmostEqual(det["stock_nuevo"], 0.0, places=4)
        self.assertAlmostEqual(det["cpp_nuevo"], 29.0, places=4)

        self.cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = 1")
        prod = self.cur.fetchone()
        self.assertAlmostEqual(prod["stock"], 0.0, places=4)
        self.assertAlmostEqual(prod["costo_cpp"], 29.0, places=4)

    # =========================================================================
    # AJ-CPP-15 — Stock negativo bloqueado
    # =========================================================================
    def test_AJ_CPP_15_stock_negativo_bloqueado(self):
        """AJ-CPP-15: Descargo que excede stock actual o producto con stock < 0 -> ErrorStockNegativo."""
        with self.assertRaises(ErrorStockNegativo):
            self.procesar_ajuste({
                "tipo_ajuste": "DESCARGO",
                "subtipo_ajuste": "DESCARGO_ROTURA",
                "motivo": "Intento de sobre-descargo",
                "fecha": "2026-10-31 11:30:00",
                "detalles": [{"producto_id": 1, "cantidad": 1734}]  # Stock actual es 1733
            })

        self.cur.execute("SELECT stock FROM productos WHERE id = 1")
        self.assertAlmostEqual(self.cur.fetchone()["stock"], 1733.0, places=4)

    # =========================================================================
    # AJ-CPP-16 — CPP inválido bloqueado (sin fallback a productos.costo)
    # =========================================================================
    def test_AJ_CPP_16_cpp_invalido_bloqueado(self):
        """AJ-CPP-16: Stock > 0 con costo_cpp <= 0 o NULL se bloquea con ErrorInconsistenciaCPP sin usar productos.costo."""
        self.cur.execute("UPDATE productos SET costo_cpp = 0.0, costo = 29.0 WHERE id = 1")
        self.conn.commit()

        with self.assertRaises(ErrorInconsistenciaCPP):
            self.procesar_ajuste({
                "tipo_ajuste": "DESCARGO",
                "subtipo_ajuste": "DESCARGO_MERMA",
                "motivo": "Descargo con CPP corrompido",
                "fecha": "2026-10-31 11:35:00",
                "detalles": [{"producto_id": 1, "cantidad": 1}]
            })

        with self.assertRaises(ErrorInconsistenciaCPP):
            self.procesar_ajuste({
                "tipo_ajuste": "CARGO",
                "subtipo_ajuste": "CARGO_SOBRANTE_CONTEO",
                "motivo": "Sobrante con CPP corrompido",
                "fecha": "2026-10-31 11:36:00",
                "detalles": [{"producto_id": 1, "cantidad": 1}]
            })

    # =========================================================================
    # AJ-CPP-17 — Retroactividad bloqueada
    # =========================================================================
    def test_AJ_CPP_17_retroactividad_bloqueada(self):
        """AJ-CPP-17: Ajuste con fecha anterior al último movimiento del SKU o en período cerrado -> ErrorMovimientoRetroactivoNoPermitido."""
        with self.assertRaises(ErrorMovimientoRetroactivoNoPermitido):
            self.procesar_ajuste({
                "tipo_ajuste": "CARGO",
                "subtipo_ajuste": "CARGO_SOBRANTE_CONTEO",
                "motivo": "Ajuste retroactivo prohibido",
                "fecha": "2026-10-20 08:00:00",
                "detalles": [{"producto_id": 1, "cantidad": 1}]
            })

    # =========================================================================
    # AJ-CPP-18 — SKU repetido bloqueado (y bloqueo de regularizacion ambigua)
    # =========================================================================
    def test_AJ_CPP_18_sku_repetido_y_regularizacion_ambigua_bloqueados(self):
        """AJ-CPP-18: Prohibido repetir el mismo producto_id dentro del mismo ajuste (SKU_DUPLICADO_EN_AJUSTE) y prohibido 'regularizacion' sin subtipo."""
        with self.assertRaises(ValueError) as ctx_dup:
            self.procesar_ajuste({
                "tipo_ajuste": "CARGO",
                "subtipo_ajuste": "CARGO_SOBRANTE_CONTEO",
                "motivo": "Ajuste con SKU repetido",
                "fecha": "2026-10-31 11:40:00",
                "detalles": [
                    {"producto_id": 1, "cantidad": 2},
                    {"producto_id": 1, "cantidad": 3}
                ]
            })
        self.assertIn("SKU_DUPLICADO_EN_AJUSTE", str(ctx_dup.exception))

        # Además, 'regularizacion' o 'ajuste_manual' sin subtipo canónico explícito debe bloquearse
        with self.assertRaises(ValueError) as ctx_reg:
            self.procesar_ajuste({
                "tipo_ajuste": "CARGO",
                "motivo": "regularizacion",
                "fecha": "2026-10-31 11:41:00",
                "detalles": [{"producto_id": 1, "cantidad": 2}]
            })
        self.assertIn("SUBTIPO_AJUSTE_OBLIGATORIO", str(ctx_reg.exception))

    # =========================================================================
    # AJ-CPP-19 — Idempotencia
    # =========================================================================
    def test_AJ_CPP_19_idempotencia(self):
        """AJ-CPP-19: Reintentos con el mismo idempotency_key o client_tx_id no duplican ajustes ni movimientos."""
        payload = {
            "tipo_ajuste": "CARGO",
            "subtipo_ajuste": "CARGO_SOBRANTE_CONTEO",
            "motivo": "Sobrante idempotente",
            "idempotency_key": "IDEMP-2F5B-001",
            "fecha": "2026-10-31 11:45:00",
            "detalles": [{"producto_id": 1, "cantidad": 7}]
        }
        res1 = self.procesar_ajuste(payload)
        self.assertFalse(res1["duplicado_ignorado"])

        res2 = self.procesar_ajuste(payload)
        self.assertTrue(res2["duplicado_ignorado"])
        self.assertEqual(res1["id"], res2["id"])

        # El stock solo aumentó una vez (1733 + 7 = 1740)
        self.cur.execute("SELECT stock FROM productos WHERE id = 1")
        self.assertAlmostEqual(self.cur.fetchone()["stock"], 1740.0, places=4)

    # =========================================================================
    # AJ-CPP-20 — Rollback transaccional
    # =========================================================================
    def test_AJ_CPP_20_rollback_transaccional(self):
        """AJ-CPP-20: Si falla cualquier paso intermedio (ej. 2da línea inválida o fallo post-movimiento), se hace ROLLBACK total."""
        self.cur.execute("SELECT COUNT(*) FROM inventario_ajustes")
        aj_antes = self.cur.fetchone()[0]
        self.cur.execute("SELECT COUNT(*) FROM inventario_movimientos")
        mov_antes = self.cur.fetchone()[0]

        # Fallo en la segunda línea por sobre-descargo después de que la primera línea era válida
        with self.assertRaises(ErrorStockNegativo):
            self.procesar_ajuste({
                "tipo_ajuste": "DESCARGO",
                "subtipo_ajuste": "DESCARGO_MERMA",
                "motivo": "Prueba de atomicidad multi-item",
                "fecha": "2026-10-31 11:50:00",
                "detalles": [
                    {"producto_id": 1, "cantidad": 2},     # Válida (stock 1733)
                    {"producto_id": 2, "cantidad": 9999}   # Inválida (stock 860) -> Dispara rollback
                ]
            })

        # Fallo simulado post-inserción de detalle y movimiento
        with self.assertRaises(RuntimeError):
            self.procesar_ajuste({
                "tipo_ajuste": "CARGO",
                "subtipo_ajuste": "CARGO_SOBRANTE_CONTEO",
                "motivo": "Prueba de fallo forzado post-detalle",
                "fecha": "2026-10-31 11:51:00",
                "_forzar_fallo_transaccional": True,
                "detalles": [{"producto_id": 1, "cantidad": 5}]
            })

        self.cur.execute("SELECT COUNT(*) FROM inventario_ajustes")
        self.assertEqual(self.cur.fetchone()[0], aj_antes)
        self.cur.execute("SELECT COUNT(*) FROM inventario_movimientos")
        self.assertEqual(self.cur.fetchone()[0], mov_antes)
        self.cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = 1")
        p1 = self.cur.fetchone()
        self.assertAlmostEqual(p1["stock"], 1733.0, places=4)
        self.assertAlmostEqual(p1["costo_cpp"], 29.0, places=4)

    # =========================================================================
    # AJ-CPP-21 — documento_linea_id correcto
    # =========================================================================
    def test_AJ_CPP_21_documento_linea_id_correcto(self):
        """AJ-CPP-21: Cada movimiento en inventario_movimientos guarda documento_linea_id == inventario_ajuste_detalles.id, subtipo_movimiento, cpp_anterior y cpp_nuevo."""
        res = self.procesar_ajuste({
            "tipo_ajuste": "CARGO",
            "subtipo_ajuste": "CARGO_HALLAZGO_CON_SOPORTE",
            "motivo": "Hallazgo multi-línea con trazabilidad de línea",
            "documento_referencia": "ACTA-LIN-021",
            "fecha": "2026-10-31 12:00:00",
            "detalles": [
                {"producto_id": 4, "cantidad": 500, "costo_unitario": 7.0},
                {"producto_id": 2, "cantidad": 140, "costo_unitario": 39.0}
            ]
        })
        self.assertEqual(len(res["detalles"]), 2)
        for det in res["detalles"]:
            self.cur.execute("""
                SELECT id, documento_tipo, documento_id, documento_linea_id, subtipo_movimiento, cpp_anterior, cpp_nuevo
                FROM inventario_movimientos
                WHERE id = ?
            """, (det["movimiento_id"],))
            mov = self.cur.fetchone()
            self.assertEqual(mov["documento_tipo"], "INVENTARIO_AJUSTE")
            self.assertEqual(mov["documento_id"], res["ajuste_id"])
            self.assertEqual(mov["documento_linea_id"], det["id"])
            self.assertEqual(mov["subtipo_movimiento"], "CARGO_HALLAZGO_CON_SOPORTE")
            self.assertAlmostEqual(mov["cpp_anterior"], det["cpp_anterior"], places=4)
            self.assertAlmostEqual(mov["cpp_nuevo"], det["cpp_nuevo"], places=4)

    # =========================================================================
    # AJ-CPP-22 — Reconstrucción CPP exacta
    # =========================================================================
    def test_AJ_CPP_22_reconstruccion_cpp_exacta(self):
        """AJ-CPP-22: reconstruir_cpp_desde_apertura() reproduce exactamente el stock y el CPP tras una secuencia mixta de ajustes."""
        # 1. Hallazgo con soporte en Prod 4 (500 @ 5.0 + 500 @ 7.0 -> 1000 @ 6.0)
        self.procesar_ajuste({
            "tipo_ajuste": "CARGO",
            "subtipo_ajuste": "CARGO_HALLAZGO_CON_SOPORTE",
            "motivo": "Hallazgo P4",
            "documento_referencia": "SOP-001",
            "fecha": "2026-10-31 12:10:00",
            "detalles": [{"producto_id": 4, "cantidad": 500, "costo_unitario": 7.0}]
        })
        # 2. Sobrante de conteo en Prod 4 (1000 @ 6.0 + 50 @ 6.0 -> 1050 @ 6.0)
        self.procesar_ajuste({
            "tipo_ajuste": "CARGO",
            "subtipo_ajuste": "CARGO_SOBRANTE_CONTEO",
            "motivo": "Sobrante P4",
            "fecha": "2026-10-31 12:15:00",
            "detalles": [{"producto_id": 4, "cantidad": 50}]
        })
        # 3. Tasación manual en Prod 2 (860 @ 29.0 + 140 @ 39.0 -> 1000 @ 30.4)
        self.procesar_ajuste({
            "tipo_ajuste": "CARGO",
            "subtipo_ajuste": "CARGO_TASACION_MANUAL",
            "motivo": "Tasación P2",
            "justificacion_tecnica": "Informe pericial",
            "documento_referencia": "PER-002",
            "autorizado_por": "Gerencia General",
            "fecha": "2026-10-31 12:20:00",
            "detalles": [{"producto_id": 2, "cantidad": 140, "costo_unitario": 39.0}]
        })
        # 4. Descargo por merma en Prod 4 (1050 - 50 -> 1000 @ 6.0)
        self.procesar_ajuste({
            "tipo_ajuste": "DESCARGO",
            "subtipo_ajuste": "DESCARGO_MERMA",
            "motivo": "Merma P4",
            "fecha": "2026-10-31 12:25:00",
            "detalles": [{"producto_id": 4, "cantidad": 50}]
        })

        # Verificar conciliación general y reconstrucción determinística desde apertura para los 5 productos
        conc = conciliar_inventario(self.conn, self.cur)
        self.assertEqual(conc["estado_general"], "CONCILIADO_OK")

        for pid in range(1, 6):
            rec = reconstruir_cpp_desde_apertura(self.cur, pid)
            self.cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = ?", (pid,))
            prod = self.cur.fetchone()
            self.assertAlmostEqual(rec["stock_reconstruido"], prod["stock"], places=4)
            self.assertAlmostEqual(rec["cpp_reconstruido"], prod["costo_cpp"], places=4)

    # =========================================================================
    # AJ-CPP-23 — Anulación directa LIFO
    # =========================================================================
    def test_AJ_CPP_23_anulacion_directa_lifo(self):
        """AJ-CPP-23: Si un ajuste es el último movimiento de los SKUs afectados, anular_ajuste_inventario() revierte stock y restaura cpp_anterior."""
        # Producto ID 4: stock=500, CPP=5.0 -> Hallazgo de 500 uds a $7.0 -> stock=1000, CPP=6.0
        res_aj = self.procesar_ajuste({
            "tipo_ajuste": "CARGO",
            "subtipo_ajuste": "CARGO_HALLAZGO_CON_SOPORTE",
            "motivo": "Hallazgo por error de digitación",
            "documento_referencia": "NE-ERR-01",
            "fecha": "2026-10-31 13:00:00",
            "detalles": [{"producto_id": 4, "cantidad": 500, "costo_unitario": 7.0}]
        })
        ajuste_id = res_aj["ajuste_id"]

        self.cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = 4")
        prod_post = self.cur.fetchone()
        self.assertAlmostEqual(prod_post["stock"], 1000.0, places=4)
        self.assertAlmostEqual(prod_post["costo_cpp"], 6.0, places=4)

        # Anular ajuste (es el tope de pila LIFO del SKU 4)
        res_anul = self.anular_ajuste(ajuste_id, motivo="Reversión por error de digitación")
        self.assertTrue(res_anul["success"])
        self.assertEqual(res_anul["estado"], "anulado")

        # Verificar que stock volvió a 500.0 y costo_cpp volvió a 5.0000
        self.cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = 4")
        prod_rev = self.cur.fetchone()
        self.assertAlmostEqual(prod_rev["stock"], 500.0, places=4)
        self.assertAlmostEqual(prod_rev["costo_cpp"], 5.0, places=4)

        # Verificar que reconstruir_cpp_desde_apertura coincide tras la anulación
        for pid in range(1, 6):
            rec = reconstruir_cpp_desde_apertura(self.cur, pid)
            self.cur.execute("SELECT stock, costo_cpp FROM productos WHERE id = ?", (pid,))
            prod = self.cur.fetchone()
            self.assertAlmostEqual(rec["stock_reconstruido"], prod["stock"], places=4)
            self.assertAlmostEqual(rec["cpp_reconstruido"], prod["costo_cpp"], places=4)

    # =========================================================================
    # AJ-CPP-24 — Movimiento posterior bloquea anulación
    # =========================================================================
    def test_AJ_CPP_24_movimiento_posterior_bloquea_anulacion(self):
        """AJ-CPP-24: Si existe cualquier movimiento posterior sobre el SKU, se bloquea la anulación directa y se exige Contra-Ajuste referenciado."""
        # 1. Ajuste #1 sobre Producto 4 (500 @ 5.0 + 500 @ 7.0 -> 1000 @ 6.0)
        aj1 = self.procesar_ajuste({
            "tipo_ajuste": "CARGO",
            "subtipo_ajuste": "CARGO_HALLAZGO_CON_SOPORTE",
            "motivo": "Primer ajuste",
            "documento_referencia": "DOC-AJ1",
            "fecha": "2026-10-31 14:00:00",
            "detalles": [{"producto_id": 4, "cantidad": 500, "costo_unitario": 7.0}]
        })

        # 2. Movimiento posterior sobre Producto 4 (Descargo de 50 unidades)
        self.procesar_ajuste({
            "tipo_ajuste": "DESCARGO",
            "subtipo_ajuste": "DESCARGO_USO_INTERNO",
            "motivo": "Movimiento posterior sobre el mismo SKU",
            "fecha": "2026-10-31 14:10:00",
            "detalles": [{"producto_id": 4, "cantidad": 50}]
        })

        # 3. Intentar anular aj1 -> Debe bloquearse con ErrorAnulacionAjusteConMovimientosPosteriores
        with self.assertRaises(ErrorAnulacionAjusteConMovimientosPosteriores) as ctx:
            self.anular_ajuste(aj1["ajuste_id"], motivo="Intento de anular ajuste con movimientos posteriores")
        self.assertIn("ANULACION_BLOQUEADA_MOVIMIENTOS_POSTERIORES", str(ctx.exception))

        # 4. Verificar que en su lugar se puede emitir un Contra-Ajuste referenciado con ajuste_referencia_id
        contra = self.procesar_ajuste({
            "tipo_ajuste": "DESCARGO",
            "subtipo_ajuste": "DESCARGO_MERMA",
            "motivo": "Contra-ajuste compensatorio del ajuste inicial",
            "ajuste_referencia_id": aj1["ajuste_id"],
            "fecha": "2026-10-31 14:20:00",
            "detalles": [{"producto_id": 4, "cantidad": 500}]
        })
        self.assertTrue(contra["success"])
        self.assertEqual(contra["ajuste_referencia_id"], aj1["ajuste_id"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
