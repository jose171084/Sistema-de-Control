# -*- coding: utf-8 -*-
"""
inventario_ia.py - Motor de Inteligencia Artificial Orgánica de Inventarios y Rentabilidad.
TAVO CLOUD ERP - Datos 100% Reales & Auditados

Principios de Diseño:
1. Cero Datos Fantasmas: Todos los indicadores emergen exclusivamente de datos persistidos en inventario.db.
2. Fidelidad Contable: Se apoya estrictamente en el Costo Promedio Ponderado (CPP) auditado.
3. Prevención de Riesgo: Detecta ventas a pérdida, márgenes estrechos, costos en cero,
   stock comprometido en preventas, quiebres por rotación (ADU) y capital en sobrestock.
"""

from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, date

import database


def round2(val):
    if val is None:
        return 0.0
    return float(Decimal(str(val)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))


def _tabla_tiene_columna(cur, tabla, col):
    try:
        cols = [r[1] for r in cur.execute(f"PRAGMA table_info({tabla})").fetchall()]
        return col in cols
    except Exception:
        return False


def _parse_fecha_ymd(val):
    if not val:
        return None
    s = str(val).strip()[:10]
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except Exception:
        return None


def diagnosticar_inventario_organico(conn=None):
    """
    Realiza una auditoría analítica profunda del inventario activo actual sin alterar datos.
    Calcula:
    - Valoración patrimonial CPP real por producto y global (excluye servicios e inactivos).
    - Stock físico, comprometido (preventas aprobadas) y disponible real.
    - Margen bruto unitario y porcentual vs costo CPP (y precio_total o precio_base).
    - Rotación real de salidas (ADU) desde kardex (case-insensitive SALIDA) y facturas.
    - Cobertura en días (Runway) integrada con el diagnóstico de reposición.
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
        t_ves = float(row_cfg[0]) if (row_cfg and row_cfg[0] and float(row_cfg[0]) > 0) else 45.0
        t_cop = float(row_cfg[1]) if (row_cfg and row_cfg[1] and float(row_cfg[1]) > 0) else 4100.0

        # 2. Catálogo de productos físicos activos (excluyendo servicios y desactivados)
        tiene_comp = _tabla_tiene_columna(cur, "productos", "stock_comprometido")
        tiene_tipo = _tabla_tiene_columna(cur, "productos", "tipo")
        tiene_activo = _tabla_tiene_columna(cur, "productos", "activo")

        comp_expr = "COALESCE(stock_comprometido, 0.0)" if tiene_comp else "0.0"
        tipo_expr = "COALESCE(tipo, 'producto')" if tiene_tipo else "'producto'"
        conds = []
        if tiene_activo:
            conds.append("COALESCE(activo, 1) = 1")
        if tiene_tipo:
            conds.append("LOWER(COALESCE(tipo, 'producto')) != 'servicio'")
        where_activo = ("WHERE " + " AND ".join(conds)) if conds else ""

        cur.execute(f"""
            SELECT id, codigo, nombre, stock, stock_minimo, costo_cpp, costo,
                   precio_total, precio_base, {tipo_expr} AS tipo, {comp_expr} AS stock_comprometido
            FROM productos
            {where_activo}
            ORDER BY id
        """)
        productos = cur.fetchall()

        # 3. Movimientos de salida agrupados (case-insensitive 'SALIDA') + ventana últimos 30 días
        hoy = date.today()
        salidas_kardex = {}
        try:
            cur.execute("""
                SELECT producto_id,
                       COUNT(*) AS cnt_all,
                       COALESCE(SUM(cantidad), 0.0) AS sum_all,
                       MIN(substr(COALESCE(fecha, created_at, ''), 1, 10)) AS first_dt,
                       MAX(substr(COALESCE(fecha, created_at, ''), 1, 10)) AS last_dt,
                       COALESCE(SUM(CASE WHEN substr(COALESCE(fecha, created_at, ''), 1, 10) >= date('now', '-30 days', 'localtime') THEN cantidad ELSE 0.0 END), 0.0) AS sum_30d,
                       COUNT(CASE WHEN substr(COALESCE(fecha, created_at, ''), 1, 10) >= date('now', '-30 days', 'localtime') THEN 1 END) AS cnt_30d
                FROM inventario_movimientos
                WHERE UPPER(COALESCE(sentido, '')) = 'SALIDA'
                GROUP BY producto_id
            """)
            for r in cur.fetchall():
                salidas_kardex[int(r[0])] = {
                    "cnt_all": int(r[1] or 0),
                    "sum_all": float(r[2] or 0.0),
                    "first_dt": _parse_fecha_ymd(r[3]),
                    "last_dt": _parse_fecha_ymd(r[4]),
                    "sum_30d": float(r[5] or 0.0),
                    "cnt_30d": int(r[6] or 0),
                }
        except Exception:
            salidas_kardex = {}

        # Respaldo desde factura_detalles (para productos o servicios vendidos)
        salidas_facturas = {}
        try:
            cur.execute("""
                SELECT fd.producto_id,
                       COUNT(*) AS cnt_all,
                       COALESCE(SUM(fd.cantidad), 0.0) AS sum_all,
                       MIN(substr(COALESCE(f.fecha, ''), 1, 10)) AS first_dt,
                       MAX(substr(COALESCE(f.fecha, ''), 1, 10)) AS last_dt,
                       COALESCE(SUM(CASE WHEN substr(COALESCE(f.fecha, ''), 1, 10) >= date('now', '-30 days', 'localtime') THEN fd.cantidad ELSE 0.0 END), 0.0) AS sum_30d,
                       COUNT(CASE WHEN substr(COALESCE(f.fecha, ''), 1, 10) >= date('now', '-30 days', 'localtime') THEN 1 END) AS cnt_30d
                FROM factura_detalles fd
                JOIN facturas f ON fd.factura_id = f.id
                WHERE COALESCE(f.estado, 'pagada') != 'anulada'
                  AND fd.producto_id IS NOT NULL
                GROUP BY fd.producto_id
            """)
            for r in cur.fetchall():
                salidas_facturas[int(r[0])] = {
                    "cnt_all": int(r[1] or 0),
                    "sum_all": float(r[2] or 0.0),
                    "first_dt": _parse_fecha_ymd(r[3]),
                    "last_dt": _parse_fecha_ymd(r[4]),
                    "sum_30d": float(r[5] or 0.0),
                    "cnt_30d": int(r[6] or 0),
                }
        except Exception:
            salidas_facturas = {}

        analisis_productos = []
        tot_unidades_stock = 0.0
        tot_comprometido = 0.0
        tot_patrimonio_usd = 0.0
        tot_capital_margen_negativo = 0.0
        tot_productos_riesgo_perdida = 0
        tot_productos_sobrestock = 0
        tot_productos_bajo_stock = 0
        tot_productos_quiebre = 0
        tot_productos_optimos = 0
        tot_inversion_sugerida = 0.0
        productos_fisicos_count = 0
        alertas_gerenciales = []

        for p in productos:
            p_id, codigo, nombre, stock, stock_min, cpp, costo_std, precio_total, precio_base, tipo, stock_comp = p
            es_servicio = (str(tipo or 'producto').strip().lower() == 'servicio')
            stock_fisico = float(stock or 0.0)
            stock_comp = float(stock_comp or 0.0)
            stock_disponible = round2(max(0.0, stock_fisico - stock_comp))
            stock_min_val = float(stock_min) if stock_min is not None else 5.0

            cpp_val = float(cpp) if (cpp is not None and float(cpp) > 0) else float(costo_std or 0.0)
            precio_val = float(precio_total) if (precio_total is not None and float(precio_total) > 0) else float(precio_base or 0.0)

            if not es_servicio:
                productos_fisicos_count += 1
                tot_unidades_stock += stock_fisico
                tot_comprometido += stock_comp
                val_patrimonio_usd = round2(stock_fisico * cpp_val)
                tot_patrimonio_usd += val_patrimonio_usd
            else:
                val_patrimonio_usd = 0.0

            # Margen bruto real vs CPP
            margen_unitario_usd = round2(precio_val - cpp_val)
            margen_porcentaje = round2((margen_unitario_usd / precio_val * 100.0)) if precio_val > 0 else 0.0

            # Rotación y salidas reales (prioriza kardex para físicos, facturas para servicios/respaldo)
            mov_info = salidas_kardex.get(int(p_id))
            if not mov_info or mov_info["sum_all"] <= 0:
                mov_info = salidas_facturas.get(int(p_id))

            if mov_info and mov_info["sum_all"] > 0:
                cant_movs_salida = mov_info["cnt_all"]
                unidades_salida = round2(mov_info["sum_all"])
                first_dt = mov_info["first_dt"] or hoy
                if mov_info["sum_30d"] > 0:
                    dias_ventana = min(30, max(1, (hoy - first_dt).days + 1))
                    adu = round2(mov_info["sum_30d"] / dias_ventana)
                else:
                    dias_span = max(1, (hoy - first_dt).days + 1)
                    adu = round2(unidades_salida / dias_span)
            else:
                cant_movs_salida = 0
                unidades_salida = 0.0
                adu = 0.0

            # Días de cobertura sobre stock disponible real
            if es_servicio:
                dias_cobertura = None
                runway_texto = f"Servicio ({cant_movs_salida} ventas registradas)"
            elif adu > 0:
                dias_cobertura = round2(stock_disponible / adu)
                runway_texto = f"{int(dias_cobertura)} días de cobertura proyectada ({adu:.2f} u/día)"
            else:
                dias_cobertura = None
                runway_texto = "Sin salidas registradas en el historial reciente"

            # Diagnóstico de Abastecimiento (solo productos físicos)
            if es_servicio:
                estado_abastecimiento = "SERVICIO"
                nivel_urgencia = "NORMAL"
                unidades_sugeridas = 0.0
                accion_abastecimiento = "Servicio intangible (no requiere reposición de inventario)."
            elif stock_disponible <= 0:
                estado_abastecimiento = "QUIEBRE_TOTAL"
                nivel_urgencia = "CRITICA"
                objetivo = max(stock_min_val * 2.0, stock_comp + stock_min_val, (adu * 15.0) if adu > 0 else 0.0, 1.0)
                unidades_sugeridas = round2(objetivo)
                tot_productos_bajo_stock += 1
                tot_productos_quiebre += 1
                nota_comp = f" (incluye {stock_comp:g} u comprometidas en pedidos)" if stock_comp > 0 else ""
                accion_abastecimiento = f"Stock disponible agotado{nota_comp}. Comprar de inmediato {unidades_sugeridas:g} unidades."
                alertas_gerenciales.append({
                    "nivel": "CRITICO" if (stock_comp > 0 or adu > 0) else "ADVERTENCIA",
                    "tipo": "QUIEBRE_TOTAL",
                    "producto_id": p_id,
                    "codigo": codigo,
                    "nombre": nombre,
                    "mensaje": f"Quiebre de stock disponible ({stock_disponible:g} u disponibles, físico {stock_fisico:g} u, comprometido {stock_comp:g} u).",
                    "recomendacion": f"Reordenar {unidades_sugeridas:g} u (Inversión est.: ${round2(unidades_sugeridas * cpp_val):,.2f} USD)."
                })
            elif stock_min_val > 0 and stock_disponible <= stock_min_val:
                estado_abastecimiento = "BAJO_STOCK"
                nivel_urgencia = "ALTA"
                objetivo = max(stock_min_val * 2.0, (adu * 15.0) if adu > 0 else 0.0)
                unidades_sugeridas = round2(max(1.0, objetivo - stock_disponible))
                tot_productos_bajo_stock += 1
                accion_abastecimiento = f"Por debajo o en el límite mínimo ({stock_disponible:g} <= {stock_min_val:g} u). Reordenar {unidades_sugeridas:g} u."
                alertas_gerenciales.append({
                    "nivel": "ADVERTENCIA",
                    "tipo": "BAJO_STOCK",
                    "producto_id": p_id,
                    "codigo": codigo,
                    "nombre": nombre,
                    "mensaje": f"Stock disponible en nivel crítico ({stock_disponible:g} u vs mínimo {stock_min_val:g} u).",
                    "recomendacion": f"Comprar {unidades_sugeridas:g} u para recuperar cobertura segura."
                })
            elif adu > 0 and dias_cobertura is not None and dias_cobertura <= 7.0:
                estado_abastecimiento = "BAJO_STOCK"
                nivel_urgencia = "ALTA"
                objetivo = max(stock_min_val * 2.0, adu * 15.0)
                unidades_sugeridas = round2(max(1.0, objetivo - stock_disponible))
                tot_productos_bajo_stock += 1
                accion_abastecimiento = f"Alta rotación ({adu:.2f} u/día): solo quedan {int(dias_cobertura)} días de cobertura. Reordenar {unidades_sugeridas:g} u."
                alertas_gerenciales.append({
                    "nivel": "ADVERTENCIA",
                    "tipo": "COBERTURA_BAJA",
                    "producto_id": p_id,
                    "codigo": codigo,
                    "nombre": nombre,
                    "mensaje": f"Cobertura baja por alta demanda ({int(dias_cobertura)} días restantes al ritmo actual de {adu:.2f} u/día).",
                    "recomendacion": f"Planificar compra de {unidades_sugeridas:g} u para 15 días de cobertura."
                })
            elif stock_min_val > 0 and stock_disponible > (stock_min_val * 8.0) and (dias_cobertura is None or dias_cobertura > 30.0):
                estado_abastecimiento = "SOBRESTOCK"
                nivel_urgencia = "NINGUNA"
                unidades_sugeridas = 0.0
                accion_abastecimiento = (
                    f"NO comprar. Existencia disponible ({stock_disponible:g} u) supera ampliamente "
                    f"el mínimo ({stock_min_val:g} u). Priorizar rotación para liberar capital."
                )
                tot_productos_sobrestock += 1
            else:
                estado_abastecimiento = "OPTIMO"
                nivel_urgencia = "NORMAL"
                unidades_sugeridas = 0.0
                accion_abastecimiento = "Nivel de stock balanceado frente al mínimo y rotación."
                tot_productos_optimos += 1

            inversion_sug_prod = round2(unidades_sugeridas * cpp_val)
            tot_inversion_sugerida += inversion_sug_prod

            # Diagnóstico de Rentabilidad y Precios
            if precio_val <= 0:
                alerta_rentabilidad = "VENTA_A_PERDIDA" if cpp_val > 0 else "MARGEN_ESTRECHO"
                color_alerta = "danger" if cpp_val > 0 else "warning"
                if cpp_val > 0:
                    tot_productos_riesgo_perdida += 1
                    tot_capital_margen_negativo += val_patrimonio_usd
                diagnostico_precio = "Precio de venta no configurado ($0.00 USD)."
                alertas_gerenciales.append({
                    "nivel": "CRITICO" if cpp_val > 0 else "ADVERTENCIA",
                    "tipo": "SIN_PRECIO",
                    "producto_id": p_id,
                    "codigo": codigo,
                    "nombre": nombre,
                    "mensaje": f"El producto no tiene precio de venta configurado ($0.00 USD) frente a costo CPP ${cpp_val:,.2f} USD.",
                    "recomendacion": f"Configurar precio de venta >= ${round2(max(cpp_val * 1.25, 1.0)):,.2f} USD."
                })
            elif cpp_val > 0 and margen_unitario_usd < 0:
                alerta_rentabilidad = "VENTA_A_PERDIDA"
                color_alerta = "danger"
                tot_productos_riesgo_perdida += 1
                tot_capital_margen_negativo += val_patrimonio_usd
                diagnostico_precio = (
                    f"¡ALERTA FINANCIERA SEVERA! El precio de venta (${precio_val:,.2f} USD) está por debajo "
                    f"del costo CPP (${cpp_val:,.2f} USD). Pérdida unitaria: -${abs(margen_unitario_usd):,.2f} USD."
                )
                alertas_gerenciales.append({
                    "nivel": "CRITICO",
                    "tipo": "VENTA_A_PERDIDA",
                    "producto_id": p_id,
                    "codigo": codigo,
                    "nombre": nombre,
                    "mensaje": f"Precio de venta (${precio_val:,.2f} USD) inferior al Costo CPP (${cpp_val:,.2f} USD). Margen: {margen_porcentaje}%. Capital comprometido: ${val_patrimonio_usd:,.2f} USD.",
                    "recomendacion": f"Ajustar precio de venta a mínimo ${round2(cpp_val * 1.15):,.2f} USD para recuperar 15% de margen."
                })
            elif not es_servicio and cpp_val <= 0 and stock_fisico > 0:
                alerta_rentabilidad = "MARGEN_ESTRECHO"
                color_alerta = "warning"
                diagnostico_precio = "Costo CPP en $0.00 USD; registre compras o costo estándar para auditar margen real."
                alertas_gerenciales.append({
                    "nivel": "ADVERTENCIA",
                    "tipo": "SIN_COSTO_CONFIGURADO",
                    "producto_id": p_id,
                    "codigo": codigo,
                    "nombre": nombre,
                    "mensaje": f"Producto con {stock_fisico:g} u físicas pero Costo CPP en $0.00 USD (impide calcular utilidad real).",
                    "recomendacion": "Registrar costo de adquisición o compra para activar auditoría exacta de margen."
                })
            elif margen_porcentaje < 8.0:
                alerta_rentabilidad = "MARGEN_ESTRECHO"
                color_alerta = "warning"
                diagnostico_precio = (
                    f"Margen bruto estrecho de {margen_porcentaje}% (${margen_unitario_usd:,.2f} USD). "
                    f"Evaluar ajuste para cubrir costos operativos."
                )
                alertas_gerenciales.append({
                    "nivel": "ADVERTENCIA",
                    "tipo": "MARGEN_ESTRECHO",
                    "producto_id": p_id,
                    "codigo": codigo,
                    "nombre": nombre,
                    "mensaje": f"Margen bruto estrecho ({margen_porcentaje}%). Ganancia unitaria: ${margen_unitario_usd:,.2f} USD.",
                    "recomendacion": f"Evaluar precio hacia ${round2(cpp_val * 1.15):,.2f} USD o mejorar costo con proveedor."
                })
            else:
                alerta_rentabilidad = "SALUDABLE"
                color_alerta = "success"
                diagnostico_precio = f"Margen bruto saludable de {margen_porcentaje}% (${margen_unitario_usd:,.2f} USD por unidad)."

            analisis_productos.append({
                "id": p_id,
                "codigo": codigo,
                "nombre": nombre,
                "tipo": "servicio" if es_servicio else "producto",
                "stock_actual": stock_fisico,
                "stock_comprometido": stock_comp,
                "stock_disponible": stock_disponible,
                "stock_minimo": stock_min_val,
                "costo_cpp_usd": round2(cpp_val),
                "costo_cpp_ves": round2(cpp_val * t_ves),
                "precio_venta_usd": round2(precio_val),
                "precio_venta_ves": round2(precio_val * t_ves),
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
                "inversion_sugerida_usd": inversion_sug_prod,
                "accion_abastecimiento": accion_abastecimiento,
                "alerta_rentabilidad": alerta_rentabilidad,
                "color_alerta": color_alerta,
                "diagnostico_precio": diagnostico_precio
            })

        # Métricas Globales
        porc_riesgo = round2((tot_capital_margen_negativo / tot_patrimonio_usd * 100.0)) if tot_patrimonio_usd > 0 else 0.0

        # Score de Salud del Inventario (0 - 100) proporcional al catálogo real
        n_base = max(1, productos_fisicos_count or len(productos))
        penal_perdida = (tot_productos_riesgo_perdida / n_base) * 60.0 + min(25.0, tot_productos_riesgo_perdida * 10.0)
        penal_quiebre = (tot_productos_quiebre / n_base) * 35.0
        penal_bajo = (max(0, tot_productos_bajo_stock - tot_productos_quiebre) / n_base) * 20.0
        sin_costo_count = sum(1 for a in alertas_gerenciales if a.get("tipo") == "SIN_COSTO_CONFIGURADO")
        penal_costo = min(10.0, (sin_costo_count / n_base) * 15.0)
        score_salud = round2(max(0.0, min(100.0, 100.0 - penal_perdida - penal_quiebre - penal_bajo - penal_costo)))

        ahorro_sobrestock = round2(sum(
            p['valor_patrimonial_usd']
            for p in analisis_productos
            if p['estado_abastecimiento'] == 'SOBRESTOCK'
        ))

        return {
            "success": True,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "resumen_patrimonial": {
                "total_productos_analizados": len(productos),
                "productos_fisicos_analizados": productos_fisicos_count,
                "total_unidades_fisicas": round2(tot_unidades_stock),
                "stock_comprometido_total": round2(tot_comprometido),
                "total_valoracion_cpp_usd": round2(tot_patrimonio_usd),
                "total_valoracion_cpp_ves": round2(tot_patrimonio_usd * t_ves),
                "capital_en_riesgo_margen_negativo_usd": round2(tot_capital_margen_negativo),
                "porcentaje_capital_en_riesgo": porc_riesgo,
                "score_salud_inventario": score_salud,
                "conteo_sobrestock": tot_productos_sobrestock,
                "conteo_bajo_stock": tot_productos_bajo_stock,
                "conteo_quiebre_total": tot_productos_quiebre,
                "conteo_optimo": tot_productos_optimos,
                "conteo_margen_critico": tot_productos_riesgo_perdida,
                "inversion_sugerida_reposicion_usd": round2(tot_inversion_sugerida),
                "ahorro_inmediato_compras_usd": ahorro_sobrestock
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
    Considera tanto precio_total como precio_base (para ítems exentos con precio en precio_base).
    No realiza ningún INSERT/UPDATE en la base de datos.
    """
    close_after = False
    if conn is None:
        conn = database.get_connection()
        close_after = True

    try:
        cur = conn.cursor()
        tiene_comp = _tabla_tiene_columna(cur, "productos", "stock_comprometido")
        comp_expr = "COALESCE(stock_comprometido, 0.0)" if tiene_comp else "0.0"

        cur.execute(f"""
            SELECT id, codigo, nombre, stock, costo_cpp, costo, precio_total, precio_base, {comp_expr}
            FROM productos
            WHERE id = ?
        """, (producto_id,))
        p = cur.fetchone()
        if not p:
            raise ValueError(f"Producto con ID {producto_id} no encontrado.")

        stock = float(p[3] or 0.0)
        cpp = float(p[4]) if (p[4] is not None and float(p[4]) > 0) else float(p[5] or 0.0)
        precio_actual = float(p[6]) if (p[6] is not None and float(p[6]) > 0) else float(p[7] or 0.0)
        stock_comp = float(p[8] or 0.0)
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
                "stock_comprometido": stock_comp,
                "costo_cpp_usd": round2(cpp)
            },
            "precio_actual": {
                "precio_usd": round2(precio_actual),
                "margen_unitario_usd": margen_actual_usd,
                "margen_porcentaje": margen_actual_pct,
                "utilidad_total_proyectada_stock": round2(margen_actual_usd * stock)
            },
            "precio_simulado": {
                "nuevo_precio_usd": round2(nuevo_precio),
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
