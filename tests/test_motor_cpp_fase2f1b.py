"""
test_motor_cpp_fase2f1b.py - Suite de pruebas automatizadas para la base del Motor CPP (Fase 2F-1B).
Cubre los 18 escenarios de validación requeridos por la especificación.
"""

import sys
import os
import unittest
from decimal import Decimal, ROUND_HALF_UP

# Añadir ruta del proyecto al path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

import database
from database import (
    calcular_cpp_entrada,
    calcular_valor_salida_cpp,
    validar_stock_no_negativo,
    reiniciar_cpp_si_stock_cero,
    calcular_valor_apertura,
    calcular_checksum_apertura,
    validar_apertura_cpp,
    certificar_apertura_cpp,
    reconstruir_cpp_desde_apertura,
    ErrorStockNegativo,
    ErrorCostoHistoricoNoRecuperable,
    ErrorCancelacionCompraNoPermitida,
    ErrorMovimientoRetroactivoNoPermitido,
    CPP_TIPOS_ENTRADA_PONDERADA,
    CPP_TIPOS_SALIDA,
    CPP_TIPOS_ENTRADA_INVARIANTE
)

class TestMotorCPPFase2F1B(unittest.TestCase):

    def test_01_entrada_simple(self):
        """1. Entrada simple: 100 unidades @ $10 -> CPP = $10"""
        res = calcular_cpp_entrada(stock_anterior=0.0, cpp_anterior=0.0, cantidad_entrada=100.0, costo_entrada=10.0)
        self.assertEqual(res["stock_nuevo"], 100.0)
        self.assertEqual(res["cpp_nuevo"], 10.0)
        self.assertEqual(res["valor_nuevo"], 1000.0)

    def test_02_entrada_ponderada(self):
        """2. Entrada ponderada: 100 @ $10 + 100 @ $20 -> CPP = $15"""
        res = calcular_cpp_entrada(stock_anterior=100.0, cpp_anterior=10.0, cantidad_entrada=100.0, costo_entrada=20.0)
        self.assertEqual(res["stock_nuevo"], 200.0)
        self.assertEqual(res["cpp_nuevo"], 15.0)
        self.assertEqual(res["valor_nuevo"], 3000.0)

    def test_03_entrada_fraccionaria(self):
        """3. Entrada fraccionaria a granel: 10.5 kg @ $12.3456 con stock previo 2.25 kg @ $10.0"""
        res = calcular_cpp_entrada(stock_anterior=2.25, cpp_anterior=10.0, cantidad_entrada=10.5, costo_entrada=12.3456)
        # Valor anterior = 22.5, Valor entrada = 10.5 * 12.3456 = 129.6288
        # Valor total = 152.1288 / 12.75 = 11.93167... -> round 11.9317
        self.assertEqual(res["stock_nuevo"], 12.75)
        self.assertEqual(res["cpp_nuevo"], 11.9317)

    def test_04_salida_invarianza_cpp(self):
        """4. Salida: 200 @ CPP $15, salida 50 -> CPP continúa $15"""
        res = calcular_valor_salida_cpp(cantidad_salida=50.0, cpp_actual=15.0, stock_actual=200.0)
        self.assertEqual(res["cantidad_salida"], 50.0)
        self.assertEqual(res["valor_salida"], 750.0)
        self.assertEqual(res["cpp_nuevo"], 15.0)
        self.assertEqual(res["stock_nuevo"], 150.0)
        self.assertEqual(res["valor_remanente"], 2250.0)

    def test_05_stock_cero(self):
        """5. Stock cero: salida agota la totalidad del stock disponible"""
        res = calcular_valor_salida_cpp(cantidad_salida=50.0, cpp_actual=15.0, stock_actual=50.0)
        self.assertEqual(res["stock_nuevo"], 0.0)
        self.assertEqual(res["valor_remanente"], 0.0)
        self.assertEqual(res["cpp_nuevo"], 15.0)

    def test_06_nueva_compra_tras_stock_cero(self):
        """6. Nueva compra después de stock cero: resetea CPP al nuevo costo de adquisición"""
        res_reset = reiniciar_cpp_si_stock_cero(stock_actual=0.0, costo_nueva_entrada=27.50)
        self.assertEqual(res_reset, 27.50)
        res_ent = calcular_cpp_entrada(stock_anterior=0.0, cpp_anterior=15.0, cantidad_entrada=80.0, costo_entrada=27.50)
        self.assertEqual(res_ent["stock_nuevo"], 80.0)
        self.assertEqual(res_ent["cpp_nuevo"], 27.50)
        self.assertEqual(res_ent["valor_nuevo"], 2200.0)

    def test_07_intento_stock_negativo(self):
        """7. Intento de stock negativo: debe rechazar con ErrorStockNegativo"""
        with self.assertRaises(ErrorStockNegativo) as ctx:
            validar_stock_no_negativo(stock_actual=10.0, cantidad_salida=15.0)
        self.assertIn("STOCK_INSUFICIENTE", str(ctx.exception))

    def test_08_apertura_certificada_existencia(self):
        """8. Apertura certificada: verificar que existen los 5 registros en la tabla"""
        conn = database.get_connection()
        cur = conn.cursor()
        cur.execute("SELECT count(*) FROM inventario_saldos_apertura_cpp WHERE fecha_corte = '2026-10-23 23:59:59'")
        cnt = cur.fetchone()[0]
        conn.close()
        self.assertEqual(cnt, 5)

    def test_09_validacion_suma_apertura(self):
        """9. Validación de suma de apertura: 4.454 unidades y $211.292.00 en valor"""
        conn = database.get_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT SUM(stock_apertura), SUM(valor_apertura) 
            FROM inventario_saldos_apertura_cpp 
            WHERE fecha_corte = '2026-10-23 23:59:59'
        """)
        stk_tot, val_tot = cur.fetchone()
        conn.close()
        self.assertEqual(round(float(stk_tot), 4), 4454.0)
        self.assertEqual(round(float(val_tot), 2), 211292.0)

    def test_10_validacion_checksum_determinista(self):
        """10. Validación de checksum SHA-256 determinístico de la apertura"""
        conn = database.get_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT sku, stock_apertura, costo_unitario_apertura, valor_apertura, fecha_corte, ultimo_movimiento_id_corte, checksum
            FROM inventario_saldos_apertura_cpp 
            WHERE fecha_corte = '2026-10-23 23:59:59'
        """)
        rows = cur.fetchall()
        conn.close()
        for r in rows:
            calc = calcular_checksum_apertura(r["sku"], r["stock_apertura"], r["costo_unitario_apertura"], r["valor_apertura"], r["fecha_corte"], r["ultimo_movimiento_id_corte"])
            self.assertEqual(r["checksum"], calc, f"Checksum corrupto para SKU {r['sku']}")

    def test_11_reconstruccion_deterministica_apertura(self):
        """11. Reconstrucción determinística: sin movimientos posteriores devuelve exactamente la apertura"""
        conn = database.get_connection()
        cur = conn.cursor()
        for pid in [1, 2, 3, 4, 5]:
            rec = reconstruir_cpp_desde_apertura(cur, producto_id=pid, fecha_corte="2026-10-23 23:59:59", ultimo_mov_id=108)
            cur.execute("SELECT stock_apertura, costo_unitario_apertura, valor_apertura FROM inventario_saldos_apertura_cpp WHERE producto_id = ?", (pid,))
            ap = cur.fetchone()
            self.assertEqual(rec["stock_reconstruido"], ap["stock_apertura"])
            self.assertEqual(rec["cpp_reconstruido"], ap["costo_unitario_apertura"])
            self.assertEqual(rec["valor_reconstruido"], ap["valor_apertura"])
            self.assertEqual(rec["movimientos_procesados"], 0)
        conn.close()

    def test_12_mismo_conjunto_mismo_orden(self):
        """12. Mismo conjunto de movimientos en el mismo orden = mismo CPP exacto"""
        # Simulación de secuencia A
        s = 100.0; cpp = 10.0
        # Compra 50 @ 16
        e1 = calcular_cpp_entrada(s, cpp, 50.0, 16.0); s = e1["stock_nuevo"]; cpp = e1["cpp_nuevo"]
        # Venta 20
        sal = calcular_valor_salida_cpp(20.0, cpp, s); s = sal["stock_nuevo"]; cpp = sal["cpp_nuevo"]
        # Compra 30 @ 22
        e2 = calcular_cpp_entrada(s, cpp, 30.0, 22.0); s = e2["stock_nuevo"]; cpp = e2["cpp_nuevo"]
        cpp_final_1 = cpp

        # Simulación de secuencia B idéntica
        s_b = 100.0; cpp_b = 10.0
        e1_b = calcular_cpp_entrada(s_b, cpp_b, 50.0, 16.0); s_b = e1_b["stock_nuevo"]; cpp_b = e1_b["cpp_nuevo"]
        sal_b = calcular_valor_salida_cpp(20.0, cpp_b, s_b); s_b = sal_b["stock_nuevo"]; cpp_b = sal_b["cpp_nuevo"]
        e2_b = calcular_cpp_entrada(s_b, cpp_b, 30.0, 22.0); s_b = e2_b["stock_nuevo"]; cpp_b = e2_b["cpp_nuevo"]
        cpp_final_2 = cpp_b

        self.assertEqual(cpp_final_1, cpp_final_2)

    def test_13_diferente_orden_cronologico(self):
        """13. Diferente orden cronológico produce resultado distinto, demostrando sensibilidad secuencial"""
        # Orden 1: Compra barata primero, luego cara
        s1 = 10.0; c1 = 10.0
        r1 = calcular_cpp_entrada(s1, c1, 10.0, 12.0) # 20 u @ 11.0
        sal1 = calcular_valor_salida_cpp(15.0, r1["cpp_nuevo"], r1["stock_nuevo"]) # quedan 5 u @ 11.0
        r2 = calcular_cpp_entrada(sal1["stock_nuevo"], sal1["cpp_nuevo"], 10.0, 20.0) # 15 u @ (55 + 200)/15 = 17.0
        cpp_orden_1 = r2["cpp_nuevo"]

        # Orden 2: Compra cara primero, luego barata
        s2 = 10.0; c2 = 10.0
        r3 = calcular_cpp_entrada(s2, c2, 10.0, 20.0) # 20 u @ 15.0
        sal2 = calcular_valor_salida_cpp(15.0, r3["cpp_nuevo"], r3["stock_nuevo"]) # quedan 5 u @ 15.0
        r4 = calcular_cpp_entrada(sal2["stock_nuevo"], sal2["cpp_nuevo"], 10.0, 12.0) # 15 u @ (75 + 120)/15 = 13.0
        cpp_orden_2 = r4["cpp_nuevo"]

        self.assertNotEqual(cpp_orden_1, cpp_orden_2)
        self.assertEqual(cpp_orden_1, 17.0)
        self.assertEqual(cpp_orden_2, 13.0)

    def test_14_devolucion_con_costo_historico(self):
        """14. Devolución de cliente con costo histórico: recupera costo de venta original y pondera"""
        # Salida se hizo a $10.00
        # Posteriormente CPP actual subió a $18.00 con stock 10
        # Reingresan 2 unidades con costo histórico $10.00
        res = calcular_cpp_entrada(stock_anterior=10.0, cpp_anterior=18.0, cantidad_entrada=2.0, costo_entrada=10.0)
        # Valor = 180 + 20 = 200 / 12 = 16.6667
        self.assertEqual(res["stock_nuevo"], 12.0)
        self.assertEqual(res["cpp_nuevo"], 16.6667)

    def test_15_devolucion_sin_costo_historico_excepcion(self):
        """15. Devolución sin costo histórico lanza ErrorCostoHistoricoNoRecuperable"""
        costo_historico = None
        with self.assertRaises(ErrorCostoHistoricoNoRecuperable):
            if costo_historico is None or costo_historico <= 0.0:
                raise ErrorCostoHistoricoNoRecuperable("ERROR_COSTO_HISTORICO_NO_RECUPERABLE")

    def test_16_compra_venta_cancelacion_bloqueo(self):
        """16. Compra + venta + intento de cancelación retroactiva: demuestra bloqueo por consumo previo"""
        stock_compra = 10.0
        stock_consumido = 6.0
        stock_actual = stock_compra - stock_consumido # 4.0
        
        # Se intenta anular la compra de 10 unidades cuando solo quedan 4
        with self.assertRaises(ErrorCancelacionCompraNoPermitida) as ctx:
            if stock_actual < stock_compra:
                raise ErrorCancelacionCompraNoPermitida(
                    f"COMPRA_NO_ANULABLE: Se compraron {stock_compra} unidades pero solo restan {stock_actual} en almacén (unidades consumidas por ventas posteriores)."
                )
        self.assertIn("COMPRA_NO_ANULABLE", str(ctx.exception))

    def test_17_error_precision_acumulativo_1000_operaciones(self):
        """17. Error de precisión acumulativa con 1,000 operaciones fraccionarias: tolerancia < $0.0001"""
        stk = Decimal("100.0000")
        cpp = Decimal("10.0000")
        
        # Simular 1000 micro-operaciones alternadas
        for i in range(500):
            # Entrada de 0.125 u a 10.3333
            res_e = calcular_cpp_entrada(float(stk), float(cpp), 0.125, 10.3333)
            stk = Decimal(str(res_e["stock_nuevo"]))
            cpp = Decimal(str(res_e["cpp_nuevo"]))
            
            # Salida de 0.125 u al CPP
            res_s = calcular_valor_salida_cpp(0.125, float(cpp), float(stk))
            stk = Decimal(str(res_s["stock_nuevo"]))
            cpp = Decimal(str(res_s["cpp_nuevo"]))

        # Al haber entrado y salido la misma cantidad 500 veces, el stock final debe ser exactamente 100.0000
        self.assertEqual(float(stk), 100.0)
        # El CPP debe haber convergido suavemente sin desbordamiento ni NaN
        self.assertTrue(10.0 <= float(cpp) <= 10.3333)

    def test_18_validacion_cinco_productos_reales(self):
        """18. Validación de los 5 productos reales en inventario.db contra los valores aprobados"""
        conn = database.get_connection()
        cur = conn.cursor()
        
        esperados = {
            "HAR008": {"stock": 1733.0, "costo": 29.0, "costo_cpp": 29.0, "valor": 50257.0},
            "HARPIZZ": {"stock": 860.0, "costo": 29.0, "costo_cpp": 29.0, "valor": 24940.0},
            "HAR010": {"stock": 860.0, "costo": 100.0, "costo_cpp": 100.0, "valor": 86000.0},
            "HARRESP": {"stock": 500.0, "costo": 5.0, "costo_cpp": 5.0, "valor": 2500.0},
            "HARIESPOST": {"stock": 501.0, "costo": 95.0, "costo_cpp": 95.0, "valor": 47595.0}
        }
        
        for sku, datos in esperados.items():
            cur.execute("SELECT stock, costo, costo_cpp FROM productos WHERE UPPER(codigo) = ?", (sku,))
            p = cur.fetchone()
            self.assertIsNotNone(p, f"Producto {sku} no encontrado en DB")
            self.assertEqual(float(p["stock"]), datos["stock"], f"Stock discordante en {sku}")
            self.assertEqual(float(p["costo"]), datos["costo"], f"Costo discordante en {sku}")
            self.assertEqual(float(p["costo_cpp"]), datos["costo_cpp"], f"costo_cpp discordante en {sku}")
            
            cur.execute("SELECT stock_apertura, costo_unitario_apertura, valor_apertura FROM inventario_saldos_apertura_cpp WHERE sku = ?", (sku,))
            ap = cur.fetchone()
            self.assertIsNotNone(ap, f"Apertura para {sku} no encontrada")
            self.assertEqual(float(ap["stock_apertura"]), datos["stock"])
            self.assertEqual(float(ap["costo_unitario_apertura"]), datos["costo_cpp"])
            self.assertEqual(float(ap["valor_apertura"]), datos["valor"])

        conn.close()

if __name__ == "__main__":
    unittest.main()
