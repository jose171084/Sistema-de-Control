# -*- coding: utf-8 -*-
"""
inventario_ia.py - Motor de Inteligencia Artificial Orgánica de Inventarios y Rentabilidad.
D-BIAN SYSTEM COMPUTER - Ing. José Morales

Principios de Diseño:
1. Cero Datos Fantasmas: Todos los indicadores emergen exclusivamente de datos persistidos en inventario.db.
2. Fidelidad Contable: Se apoya estrictamente en el Costo Promedio Ponderado (CPP) auditado.
3. Prevención de Riesgo: Detecta ventas a pérdida, márgenes estrechos, capital inmovilizado y quiebres de stock.
"""

import sqlite3
import os
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime

import database

def round2(val):
    if val is None:
        return 0.0
    return float(Decimal(str(val)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))

def diagnosticar_inventario_organico(conn=None):
    """
    Realiza una auditoría analítica profunda del inventario actual sin alterar datos.
    Calcula:
    - Valoración patrimonial CPP real por producto y global.
    - Margen bruto unitario y porcentual vs costo CPP.
    - Detección de ventas a pérdida (margen negativo).
    - Estado de cobertura y necesidad real de reorden.
    - Capital inmovilizado y capital en riesgo.
    """
    close_after = False
    if conn is None:
        conn = database.get_connection()
        close_after = True

    try:
        cur = conn.cursor()

        # 1. Tasas de cambio oficiales vigentes
        cur.execute("SELECT tasa_ves, tasa_cop FROM configuracion WHERE id = 1")
        row_cfg = cur.fetchone()
        t_ves = float(row_cfg[0] if row_cfg else 45.0)
        t_cop = float(row_cfg[1] if row_cfg else 4100.0)

        # 2. Catálogo de productos activos
        cur.execute("""
            SELECT id, codigo, nombre, stock, stock_minimo, costo_cpp, costo, precio_total, precio_base, activo
            FROM productos
            ORDER BY id
        """)
        productos = cur.fetchall()

        analisis_productos = []
        tot_unidades_stock = 0.0
        tot_patrimonio_usd = 0.0
        tot_capital_margen_negativo = 0.0
        tot_productos_riesgo_perdida = 0
        tot_productos_sobrestock = 0
        tot_productos_bajo_stock = 0
        tot_productos_saludables = 0
        alertas_gerenciales = []

        for p in productos:
            p_id, codigo, nombre, stock, stock_min, cpp, costo_std, precio_total, precio_base, activo = p
            stock = float(stock or 0.0)
            stock_min = float(stock_min or 10.0)
            cpp = float(cpp or costo_std or 0.0)
            precio = float(precio_total or precio_base or 0.0)

            tot_unidades_stock += stock
            val_patrimonio_usd = round2(stock * cpp)
            tot_patrimonio_usd += val_patrimonio_usd

            # Cálculo exacto de margen bruto vs CPP
            margen_unitario_usd = round2(precio - cpp)
            margen_porcentaje = round2((margen_unitario_usd / precio * 100.0)) if precio > 0 else 0.0

            # Análisis de rotación y salidas reales
            cur.execute("""
                SELECT COUNT(*), SUM(cantidad), COUNT(DISTINCT date(fecha))
                FROM inventario_movimientos
                WHERE producto_id = ? AND sentido = 'salida'
            """, (p_id,))
            mov_salidas = cur.fetchone()
            cant_movs_salida = int(mov_salidas[0] or 0)
            unidades_salida = float(mov_salidas[1] or 0.0)
            dias_con_salidas = int(mov_salidas[2] or 0)

            # Velocidad de consumo promedio diario (ADU)
            adu = round2(unidades_salida / max(1, dias_con_salidas)) if dias_con_salidas > 0 else 0.0

            # Días de cobertura (Runway)
            if adu > 0:
                dias_cobertura = round2(stock / adu)
                runway_texto = f"{int(dias_cobertura)} días de cobertura proyectada"
            else:
                dias_cobertura = None
                runway_texto = "Sin salidas recientes (Stock de seguridad alto)"

            # Diagnóstico de Abastecimiento
            if stock <= 0:
                estado_abastecimiento = "QUIEBRE_TOTAL"
                nivel_urgencia = "CRITICA"
                unidades_sugeridas = stock_min
                accion_abastecimiento = f"Comprar de inmediato {stock_min} unidades para recuperar stock mínimo."
                tot_productos_bajo_stock += 1
            elif stock < stock_min:
                estado_abastecimiento = "BAJO_STOCK"
                nivel_urgencia = "ALTA"
                unidades_sugeridas = round2((stock_min * 2) - stock)
                accion_abastecimiento = f"Reordenar {unidades_sugeridas} unidades para alcanzar nivel de seguridad óptimo."
                tot_productos_bajo_stock += 1
            elif stock > (stock_min * 8):
                estado_abastecimiento = "SOBRESTOCK"
                nivel_urgencia = "NINGUNA"
                unidades_sugeridas = 0.0
                accion_abastecimiento = f"NO comprar. Nivel de existencias ({stock} u) cubre holgadamente el mínimo ({stock_min} u). Priorizar ventas para liberar capital."
                tot_productos_sobrestock += 1
            else:
                estado_abastecimiento = "OPTIMO"
                nivel_urgencia = "NORMAL"
                unidades_sugeridas = 0.0
                accion_abastecimiento = "Nivel de stock balanceado."
                tot_productos_saludables += 1

            # Diagnóstico de Rentabilidad y Precios
            if margen_unitario_usd < 0:
                alerta_rentabilidad = "VENTA_A_PERDIDA"
                color_alerta = "danger"
                tot_productos_riesgo_perdida += 1
                tot_capital_margen_negativo += val_patrimonio_usd
                diagnostico_precio = f"¡ALERTA FINANCIERA SEVERA! El precio de venta (${precio} USD) está por debajo del costo promedio ponderado (${cpp} USD). Cada venta genera una pérdida de ${abs(margen_unitario_usd)} USD por unidad."
                alertas_gerenciales.append({
                    "nivel": "CRITICO",
                    "producto_id": p_id,
                    "codigo": codigo,
                    "nombre": nombre,
                    "mensaje": f"Precio de venta (${precio} USD) inferior al Costo CPP (${cpp} USD). Margen: {margen_porcentaje}%. Capital comprometido: ${val_patrimonio_usd} USD.",
                    "recomendacion": f"Ajustar precio de venta a mínimo ${round2(cpp * 1.15)} USD para recuperar margen saludable del 15%."
                })
            elif margen_porcentaje < 8.0:
                alerta_rentabilidad = "MARGEN_ESTRECHO"
                color_alerta = "warning"
                diagnostico_precio = f"Margen bruto de apenas {margen_porcentaje}% (${margen_unitario_usd} USD). Se recomienda revisión para amortizar costos fijos de operación."
                alertas_gerenciales.append({
                    "nivel": "ADVERTENCIA",
                    "producto_id": p_id,
                    "codigo": codigo,
                    "nombre": nombre,
                    "mensaje": f"Margen bruto estrecho ({margen_porcentaje}%). Ganancia unitaria: ${margen_unitario_usd} USD.",
                    "recomendacion": "Evaluar incremento moderado de precio o negociación de mejor costo de adquisición con proveedores."
                })
            else:
                alerta_rentabilidad = "SALUDABLE"
                color_alerta = "success"
                diagnostico_precio = f"Margen bruto comercial saludable del {margen_porcentaje}% (${margen_unitario_usd} USD por unidad)."

            analisis_productos.append({
                "id": p_id,
                "codigo": codigo,
                "nombre": nombre,
                "stock_actual": stock,
                "stock_minimo": stock_min,
                "costo_cpp_usd": cpp,
                "costo_cpp_ves": round2(cpp * t_ves),
                "precio_venta_usd": precio,
                "precio_venta_ves": round2(precio * t_ves),
                "margen_unitario_usd": margen_unitario_usd,
                "margen_porcentaje": margen_porcentaje,
                "valor_patrimonial_usd": val_patrimonio_usd,
                "valor_patrimonial_ves": round2(val_patrimonio_usd * t_ves),
                "salidas_historicas_unidades": unidades_salida,
                "movimientos_salida_count": cant_movs_salida,
                "consumo_diario_observado": adu,
                "dias_cobertura": dias_cobertura,
                "runway_texto": runway_texto,
                "estado_abastecimiento": estado_abastecimiento,
                "nivel_urgencia": nivel_urgencia,
                "unidades_sugeridas_compra": unidades_sugeridas,
                "inversion_sugerida_usd": round2(unidades_sugeridas * cpp),
                "accion_abastecimiento": accion_abastecimiento,
                "alerta_rentabilidad": alerta_rentabilidad,
                "color_alerta": color_alerta,
                "diagnostico_precio": diagnostico_precio
            })

        # Resumen Ejecutivo y Métricas Globales
        porc_riesgo = round2((tot_capital_margen_negativo / tot_patrimonio_usd * 100.0)) if tot_patrimonio_usd > 0 else 0.0

        # Índice de Salud del Inventario (Score de 0 a 100)
        # Penaliza productos con margen negativo (-25 pts c/u) y quiebres (-20 pts c/u)
        score_base = 100.0
        score_base -= (tot_productos_riesgo_perdida * 25.0)
        score_base -= (tot_productos_bajo_stock * 15.0)
        score_salud = max(0.0, min(100.0, score_base))

        return {
            "success": True,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "resumen_patrimonial": {
                "total_productos_analizados": len(productos),
                "total_unidades_fisicas": tot_unidades_stock,
                "total_valoracion_cpp_usd": round2(tot_patrimonio_usd),
                "total_valoracion_cpp_ves": round2(tot_patrimonio_usd * t_ves),
                "capital_en_riesgo_margen_negativo_usd": round2(tot_capital_margen_negativo),
                "porcentaje_capital_en_riesgo": porc_riesgo,
                "score_salud_inventario": score_salud,
                "conteo_sobrestock": tot_productos_sobrestock,
                "conteo_bajo_stock": tot_productos_bajo_stock,
                "conteo_margen_critico": tot_productos_riesgo_perdida,
                "ahorro_inmediato_compras_usd": round2(sum(p['valor_patrimonial_usd'] for p in analisis_productos if p['estado_abastecimiento'] == 'SOBRESTOCK'))
            },
            "alertas_gerenciales": alertas_gerenciales,
            "analisis_productos": analisis_productos
        }

    finally:
        if close_after:
            conn.close()

def simular_impacto_precio(producto_id, nuevo_precio_usd, conn=None):
    """
    Simulación determinista y matemática del impacto que tendría ajustar el precio
    de venta de un producto frente a su costo CPP histórico real.
    No realiza ningún INSERT/UPDATE en la base de datos.
    """
    close_after = False
    if conn is None:
        conn = database.get_connection()
        close_after = True

    try:
        cur = conn.cursor()
        cur.execute("SELECT id, codigo, nombre, stock, costo_cpp, costo, precio_total FROM productos WHERE id = ?", (producto_id,))
        p = cur.fetchone()
        if not p:
            raise ValueError(f"Producto con ID {producto_id} no encontrado.")

        stock = float(p[3] or 0.0)
        cpp = float(p[4] or p[5] or 0.0)
        precio_actual = float(p[6] or 0.0)
        nuevo_precio = float(nuevo_precio_usd)

        if nuevo_precio <= 0:
            raise ValueError("El nuevo precio de simulación debe ser mayor a 0.")

        margen_actual_usd = round2(precio_actual - cpp)
        margen_actual_pct = round2((margen_actual_usd / precio_actual * 100.0)) if precio_actual > 0 else 0.0

        margen_simulado_usd = round2(nuevo_precio - cpp)
        margen_simulado_pct = round2((margen_simulado_usd / nuevo_precio * 100.0))

        diferencia_utilidad_unitaria = round2(margen_simulado_usd - margen_actual_usd)
        impacto_patrimonial_total_stock = round2(diferencia_utilidad_unitaria * stock)

        return {
            "success": True,
            "producto": {
                "id": p[0],
                "codigo": p[1],
                "nombre": p[2],
                "stock": stock,
                "costo_cpp_usd": cpp
            },
            "precio_actual": {
                "precio_usd": precio_actual,
                "margen_unitario_usd": margen_actual_usd,
                "margen_porcentaje": margen_actual_pct,
                "utilidad_total_proyectada_stock": round2(margen_actual_usd * stock)
            },
            "precio_simulado": {
                "nuevo_precio_usd": nuevo_precio,
                "nuevo_margen_unitario_usd": margen_simulado_usd,
                "nuevo_margen_porcentaje": margen_simulado_pct,
                "nueva_utilidad_proyectada_stock": round2(margen_simulado_usd * stock)
            },
            "diferencial": {
                "incremento_margen_unitario_usd": diferencia_utilidad_unitaria,
                "incremento_ganancia_total_stock_usd": impacto_patrimonial_total_stock,
                "es_ganancia": impacto_patrimonial_total_stock > 0
            }
        }
    finally:
        if close_after:
            conn.close()
