# -*- coding: utf-8 -*-
"""
cfo_copilot.py - Asistente Conversacional Gerencial y Director Financiero IA (TAVO CLOUD)

PRINCIPIOS FUNDAMENTALES:
1. Cero Alucinaciones / Cero Datos Fantasmas: El 100% de cifras, textos, tablas, alertas
   y acciones emergen de consultas SQL deterministas reales sobre inventario.db.
2. Seguridad e Inmunidad: Opera estrictamente en modo READ-ONLY. No altera registros en BD.
3. Cobertura Integral ERP: Liquidez (Tesorería + Turnos de Caja reales), Inventario CPP,
   Rentabilidad y Márgenes, Ventas/Facturación, Pedidos/Fuerza de Ventas, CXC, CXP,
   Gastos Operativos, Balance 360° y Consulta por Producto específico.
"""

import unicodedata
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, date, timedelta

import database
import inventario_ia


def round2(val):
    if val is None:
        return 0.0
    return float(Decimal(str(val)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))


def normalizar_texto(texto):
    """Limpia el texto, pasa a minúsculas y elimina tildes y signos."""
    if not texto:
        return ""
    texto = str(texto).lower().strip()
    texto = unicodedata.normalize('NFKD', texto).encode('ASCII', 'ignore').decode('utf-8')
    for char in "?¿!¡,.:;()[]{}\"'-_":
        texto = texto.replace(char, " ")
    return " ".join(texto.split())


def _obtener_config(conn):
    """Obtiene nombre del negocio y tasas oficiales vigentes desde configuracion."""
    cur = conn.cursor()
    cur.execute("SELECT nombre_negocio, tasa_ves, tasa_cop, iva_porcentaje FROM configuracion WHERE id = 1")
    row = cur.fetchone()
    negocio = (row[0] if row and row[0] else "TAVO CLOUD").strip()
    t_ves = float(row[1]) if (row and row[1] and float(row[1]) > 0) else 45.0
    t_cop = float(row[2]) if (row and row[2] and float(row[2]) > 0) else 4100.0
    iva = float(row[3]) if (row and row[3] is not None) else 16.0
    return negocio, t_ves, t_cop, iva


def obtener_tasas(conn):
    """Compatibilidad: retorna (t_ves, t_cop)."""
    _, t_ves, t_cop, _ = _obtener_config(conn)
    return t_ves, t_cop


def _calcular_liquidez_real(conn):
    """
    Calcula liquidez real combinando:
    1) Cuentas y bancos de tesoreria (cuentas_tesoreria).
    2) Turnos de caja abiertos en vivo (turnos_caja + movimientos_caja), mismo cálculo que BI.
    3) Respaldo de caja_aperturas si hubiera turnos legados abiertos.
    """
    t_ves, t_cop = obtener_tasas(conn)
    cur = conn.cursor()

    cur.execute("""
        SELECT id, nombre, tipo, moneda, banco_entidad, saldo_actual, activo
        FROM cuentas_tesoreria
        ORDER BY id
    """)
    cuentas = cur.fetchall()

    filas_tabla = []
    cta_usd = 0.0
    cta_ves = 0.0
    cta_cop = 0.0

    for cid, nombre, tipo, mon, banco, saldo, activo in cuentas:
        saldo = float(saldo or 0.0)
        mon_u = (mon or "USD").upper()
        if mon_u == "USD":
            cta_usd += saldo
            equiv_usd = round2(saldo)
        elif mon_u == "VES":
            cta_ves += saldo
            equiv_usd = round2(saldo / t_ves) if t_ves > 0 else 0.0
        elif mon_u == "COP":
            cta_cop += saldo
            equiv_usd = round2(saldo / t_cop) if t_cop > 0 else 0.0
        else:
            equiv_usd = 0.0

        filas_tabla.append({
            "origen": f"{nombre} ({banco or tipo})",
            "tipo": str(tipo or "cuenta").upper(),
            "moneda": mon_u,
            "saldo_moneda": f"{saldo:,.2f} {mon_u}",
            "equivalente_usd": f"${equiv_usd:,.2f}",
            "estado": "Activa" if activo else "Inactiva"
        })

    # Turnos de caja abiertos reales (turnos_caja + movimientos_caja)
    caja_usd = 0.0
    caja_ves = 0.0
    caja_cop = 0.0
    turnos_abiertos = []

    try:
        cur.execute("""
            SELECT tc.id, COALESCE(c.nombre, 'Caja Principal') AS caja_nombre,
                   tc.fondo_inicial_usd, tc.fondo_inicial_ves, tc.fecha_apertura
            FROM turnos_caja tc
            LEFT JOIN cajas c ON tc.caja_id = c.id
            WHERE UPPER(COALESCE(tc.estado, '')) = 'ABIERTO'
            ORDER BY tc.id DESC
        """)
        for tid, c_nom, f_usd, f_ves, f_aper in cur.fetchall():
            t_u = float(f_usd or 0.0)
            t_v = float(f_ves or 0.0)
            t_c = 0.0
            cur.execute("""
                SELECT UPPER(COALESCE(tipo, '')), UPPER(COALESCE(moneda, 'USD')), COALESCE(monto, 0.0)
                FROM movimientos_caja
                WHERE turno_id = ? AND COALESCE(referencia, '') != 'APERTURA'
            """, (tid,))
            for mv_tipo, mv_mon, mv_monto in cur.fetchall():
                sign = 1.0 if mv_tipo == 'INGRESO' else -1.0
                val = float(mv_monto or 0.0) * sign
                if mv_mon == 'USD':
                    t_u += val
                elif mv_mon == 'VES':
                    t_v += val
                elif mv_mon == 'COP':
                    t_c += val

            caja_usd += t_u
            caja_ves += t_v
            caja_cop += t_c
            t_equiv = round2(t_u + (t_v / t_ves if t_ves > 0 else 0.0) + (t_c / t_cop if t_cop > 0 else 0.0))
            turnos_abiertos.append({
                "id": tid,
                "nombre": c_nom,
                "fecha_apertura": f_aper,
                "usd": round2(t_u),
                "ves": round2(t_v),
                "cop": round2(t_c),
                "equiv_usd": t_equiv
            })
            filas_tabla.append({
                "origen": f"Turno Caja #{tid} — {c_nom} (Abierto)",
                "tipo": "CAJA TURNO VIVO",
                "moneda": "MULTI",
                "saldo_moneda": f"${t_u:,.2f} | Bs.{t_v:,.2f}",
                "equivalente_usd": f"${t_equiv:,.2f}",
                "estado": "ABIERTO"
            })
    except Exception:
        pass

    # Fallback legacy caja_aperturas si no hay turnos_caja abiertos
    if not turnos_abiertos:
        try:
            cur.execute("""
                SELECT ca.id, ct.nombre, ca.monto_inicial_usd, ca.monto_inicial_moneda, ct.moneda, ca.fecha_apertura
                FROM caja_aperturas ca
                JOIN cuentas_tesoreria ct ON ca.cuenta_tesoreria_id = ct.id
                WHERE LOWER(COALESCE(ca.estado, '')) = 'abierta'
            """)
            for aid, cnom, m_usd, m_mon, mon, f_ap in cur.fetchall():
                t_u = float(m_usd or 0.0)
                t_v = float(m_mon or 0.0) if mon == 'VES' else 0.0
                t_c = float(m_mon or 0.0) if mon == 'COP' else 0.0
                caja_usd += t_u
                caja_ves += t_v
                caja_cop += t_c
                t_equiv = round2(t_u + (t_v / t_ves if t_ves > 0 else 0.0) + (t_c / t_cop if t_cop > 0 else 0.0))
                turnos_abiertos.append({"id": aid, "nombre": cnom, "fecha_apertura": f_ap, "equiv_usd": t_equiv})
                filas_tabla.append({
                    "origen": f"Apertura #{aid} — {cnom}",
                    "tipo": "CAJA ABIERTA",
                    "moneda": mon or "USD",
                    "saldo_moneda": f"${t_u:,.2f}",
                    "equivalente_usd": f"${t_equiv:,.2f}",
                    "estado": "ABIERTO"
                })
        except Exception:
            pass

    total_usd = round2(cta_usd + caja_usd)
    total_ves = round2(cta_ves + caja_ves)
    total_cop = round2(cta_cop + caja_cop)
    consolidado_usd = round2(total_usd + (total_ves / t_ves if t_ves > 0 else 0.0) + (total_cop / t_cop if t_cop > 0 else 0.0))
    cajas_equiv_usd = round2(caja_usd + (caja_ves / t_ves if t_ves > 0 else 0.0) + (caja_cop / t_cop if t_cop > 0 else 0.0))
    cuentas_equiv_usd = round2(cta_usd + (cta_ves / t_ves if t_ves > 0 else 0.0) + (cta_cop / t_cop if t_cop > 0 else 0.0))

    return {
        "total_usd": total_usd,
        "total_ves": total_ves,
        "total_cop": total_cop,
        "consolidado_usd": consolidado_usd,
        "cuentas_equiv_usd": cuentas_equiv_usd,
        "cajas_equiv_usd": cajas_equiv_usd,
        "cuentas_count": len(cuentas),
        "turnos_abiertos": turnos_abiertos,
        "filas_tabla": filas_tabla
    }


# ==============================================================================
# 1. AUDITORÍA DETERMINISTA DE LIQUIDEZ Y TESORERÍA
# ==============================================================================
def auditar_liquidez(conn):
    negocio, _, _, _ = _obtener_config(conn)
    liq = _calcular_liquidez_real(conn)
    consolidado_usd = liq["consolidado_usd"]
    total_usd = liq["total_usd"]
    total_ves = liq["total_ves"]
    total_cop = liq["total_cop"]
    turnos_abiertos = liq["turnos_abiertos"]

    kpis = [
        {"etiqueta": "Liquidez Total Consolidada", "valor": f"${consolidado_usd:,.2f} USD", "tipo": "primary"},
        {"etiqueta": "En Caja(s) Turno Vivo", "valor": f"${liq['cajas_equiv_usd']:,.2f} USD", "tipo": "info"},
        {"etiqueta": "Saldo Efectivo USD", "valor": f"${total_usd:,.2f} USD", "tipo": "neutral"},
        {"etiqueta": "Saldo Bolívares (VES)", "valor": f"Bs. {total_ves:,.2f}", "tipo": "neutral"},
        {"etiqueta": "Turnos de Caja Abiertos", "valor": f"{len(turnos_abiertos)} abierto(s)", "tipo": "success" if turnos_abiertos else "warning"}
    ]

    alertas = []
    if consolidado_usd <= 0:
        alertas.append({
            "nivel": "warning",
            "mensaje": "La posición combinada en tesorería y caja está en $0.00 USD. Registre ingresos o apertura de caja para operar en efectivo."
        })
    if not turnos_abiertos:
        alertas.append({
            "nivel": "info",
            "mensaje": "No hay turnos de caja abiertos en este momento. Las ventas físicas en mostrador requerirán abrir un turno de caja."
        })
        acciones = [
            {"texto": "Abrir Turno de Caja", "accion": "openModalAperturaCaja()"},
            {"texto": "Ir al Módulo de Tesorería", "accion": "navigate('tesoreria')"}
        ]
    else:
        t_desc = ", ".join(f"Turno #{t['id']} ({t['nombre']}: ${t['equiv_usd']:,.2f} USD)" for t in turnos_abiertos)
        alertas.append({
            "nivel": "success",
            "mensaje": f"Caja operativa activa: {t_desc}."
        })
        acciones = [
            {"texto": "Registrar Movimiento en Caja", "accion": "openModalMovimientoCaja()"},
            {"texto": "Ir al Módulo de Tesorería", "accion": "navigate('tesoreria')"}
        ]

    resumen = (
        f"En **{negocio}**, la liquidez real consolidada asciende a **${consolidado_usd:,.2f} USD** "
        f"(**${total_usd:,.2f} USD**, **Bs. {total_ves:,.2f}** y **${total_cop:,.2f} COP**), distribuidos entre "
        f"**{liq['cuentas_count']} cuentas de tesorería** (**${liq['cuentas_equiv_usd']:,.2f} USD**) y "
        f"**{len(turnos_abiertos)} turno(s) de caja abierto(s)** (**${liq['cajas_equiv_usd']:,.2f} USD**)."
    )

    return {
        "intent": "LIQUIDEZ_TESORERIA",
        "titulo": "Posición de Liquidez, Cajas y Tesorería en Tiempo Real",
        "resumen_ejecutivo": resumen,
        "kpis": kpis,
        "tablas": [{
            "titulo": "Cuentas de Tesorería y Turnos de Caja Activos",
            "columnas": ["Origen / Cuenta", "Tipo", "Moneda", "Saldo Moneda", "Equivalente USD", "Estado"],
            "filas": liq["filas_tabla"]
        }],
        "alertas": alertas,
        "acciones_sugeridas": acciones
    }


# ==============================================================================
# 2. AUDITORÍA DETERMINISTA DE INVENTARIO Y PATRIMONIO (CPP)
# ==============================================================================
def auditar_inventario(conn):
    negocio, _, _, _ = _obtener_config(conn)
    diag = inventario_ia.diagnosticar_inventario_organico(conn)
    res_pat = diag.get("resumen_patrimonial", {})
    productos = diag.get("analisis_productos", [])

    filas_tabla = []
    for p in productos:
        stock_str = f"{p['stock_disponible']:g}" if p.get("tipo") != "servicio" else "Servicio"
        if p.get("stock_comprometido", 0) > 0:
            stock_str = f"{p['stock_disponible']:g} disp. ({p['stock_actual']:g} fís.)"
        filas_tabla.append({
            "codigo": p["codigo"],
            "nombre": p["nombre"],
            "stock": stock_str,
            "costo_cpp": f"${p['costo_cpp_usd']:,.2f}",
            "precio_venta": f"${p['precio_venta_usd']:,.2f}",
            "margen_pct": f"{p['margen_porcentaje']:+.2f}%",
            "rotacion": f"{p['consumo_diario_observado']:.2f} u/día",
            "patrimonio_usd": f"${p['valor_patrimonial_usd']:,.2f}",
            "estado_abastecimiento": p["estado_abastecimiento"]
        })

    tot_items = res_pat.get("total_productos_analizados", len(productos))
    patrimonio_tot = res_pat.get("total_valoracion_cpp_usd", 0.0)
    unidades_tot = res_pat.get("total_unidades_fisicas", 0.0)
    stock_comp_tot = res_pat.get("stock_comprometido_total", 0.0)
    capital_riesgo = res_pat.get("capital_en_riesgo_margen_negativo_usd", 0.0)
    ahorro_compras = res_pat.get("ahorro_inmediato_compras_usd", 0.0)
    score_salud = res_pat.get("score_salud_inventario", 0.0)
    conteo_bajo = res_pat.get("conteo_bajo_stock", 0)
    conteo_sobre = res_pat.get("conteo_sobrestock", 0)
    conteo_optimo = res_pat.get("conteo_optimo", 0)
    conteo_perdida = res_pat.get("conteo_margen_critico", 0)

    kpis = [
        {"etiqueta": "Patrimonio en Stock (CPP)", "valor": f"${patrimonio_tot:,.2f} USD", "tipo": "primary"},
        {"etiqueta": "Unidades Físicas (Comprometidas)", "valor": f"{unidades_tot:g} u ({stock_comp_tot:g} res.)", "tipo": "neutral"},
        {"etiqueta": "Capital en Riesgo Pérdida", "valor": f"${capital_riesgo:,.2f} USD", "tipo": "danger" if capital_riesgo > 0 else "success"},
        {"etiqueta": "Score Salud Inventario", "valor": f"{score_salud:.0f} / 100", "tipo": "info"}
    ]

    alertas_copilot = []
    for a in diag.get("alertas_gerenciales", []):
        alertas_copilot.append({
            "nivel": "danger" if a.get("nivel") == "CRITICO" else "warning",
            "mensaje": f"[{a.get('codigo')}] {a.get('mensaje')}"
        })
    if not alertas_copilot:
        alertas_copilot.append({
            "nivel": "success",
            "mensaje": f"Los {tot_items} ítem(s) activos operan sin ventas a pérdida ni quiebres de stock."
        })

    if tot_items == 0:
        resumen = f"No hay productos o servicios activos registrados actualmente en **{negocio}**."
    else:
        resumen = (
            f"El inventario activo de **{negocio}** suma **{unidades_tot:g} unidades físicas** "
            f"({stock_comp_tot:g} comprometidas en preventas) en **{tot_items} ítem(s)**, valorado en "
            f"**${patrimonio_tot:,.2f} USD** a Costo Promedio Ponderado (CPP). "
            f"Distribución: **{conteo_optimo}** en nivel óptimo, **{conteo_sobre}** en sobrestock "
            f"(${ahorro_compras:,.2f} USD inmovilizados) y **{conteo_bajo}** con requerimiento de reposición. "
            f"Productos con margen negativo (venta a pérdida): **{conteo_perdida}**."
        )

    acciones = [{"texto": "Abrir Diagnóstico IA en Catálogo", "accion": "abrirDiagnosticoIaProductos()"}]
    if productos:
        objetivo_sim = sorted(productos, key=lambda x: x["margen_porcentaje"])[0]
        acciones.append({
            "texto": f"Simular Precio de {objetivo_sim['codigo']}",
            "accion": f"abrirSimuladorPrecioIA({int(objetivo_sim['id'])})"
        })

    return {
        "intent": "INVENTARIO_PATRIMONIO",
        "titulo": "Auditoría Patrimonial de Inventario y Cobertura CPP",
        "resumen_ejecutivo": resumen,
        "kpis": kpis,
        "tablas": [{
            "titulo": "Catálogo Auditado con Costo CPP, Rotación y Rentabilidad",
            "columnas": ["Código", "Producto", "Stock", "Costo CPP", "Precio", "Margen %", "Rotación", "Patrimonio USD", "Abastecimiento"],
            "filas": filas_tabla
        }],
        "alertas": alertas_copilot,
        "acciones_sugeridas": acciones
    }


# ==============================================================================
# 3. AUDITORÍA DETERMINISTA DE RIESGO DE RENTABILIDAD Y MÁRGENES
# ==============================================================================
def auditar_rentabilidad_riesgo(conn):
    negocio, _, _, _ = _obtener_config(conn)
    diag = inventario_ia.diagnosticar_inventario_organico(conn)
    res_pat = diag.get("resumen_patrimonial", {})
    productos = diag.get("analisis_productos", [])

    riesgosos = [
        p for p in productos
        if p.get("alerta_rentabilidad") == "VENTA_A_PERDIDA"
        or p.get("margen_porcentaje", 0.0) < 10.0
        or (p.get("tipo") == "producto" and p.get("costo_cpp_usd", 0.0) <= 0 and p.get("stock_actual", 0.0) > 0)
    ]

    filas_tabla = []
    for r in riesgosos:
        es_perdida = (r.get("alerta_rentabilidad") == "VENTA_A_PERDIDA")
        sin_costo = (r.get("tipo") == "producto" and r.get("costo_cpp_usd", 0.0) <= 0)
        sev = "CRÍTICO (Venta a Pérdida)" if es_perdida else ("ADVERTENCIA (Sin Costo CPP)" if sin_costo else "ADVERTENCIA (Margen < 10%)")
        filas_tabla.append({
            "codigo": r["codigo"],
            "nombre": r["nombre"],
            "costo_cpp": f"${r['costo_cpp_usd']:,.2f}",
            "precio_venta": f"${r['precio_venta_usd']:,.2f}",
            "diferencia_unit": f"${r['margen_unitario_usd']:,.2f}",
            "margen_pct": f"{r['margen_porcentaje']:+.2f}%",
            "stock": f"{r['stock_actual']:g} u",
            "capital_expuesto": f"${r['valor_patrimonial_usd']:,.2f}",
            "severidad": sev
        })

    conteo_perdida = res_pat.get("conteo_margen_critico", 0)
    capital_riesgo = res_pat.get("capital_en_riesgo_margen_negativo_usd", 0.0)
    porc_riesgo = res_pat.get("porcentaje_capital_en_riesgo", 0.0)
    score_salud = res_pat.get("score_salud_inventario", 0.0)

    con_precio = [p for p in productos if p.get("precio_venta_usd", 0) > 0 and p.get("costo_cpp_usd", 0) > 0]
    margen_prom = round2(sum(p["margen_porcentaje"] for p in con_precio) / len(con_precio)) if con_precio else 0.0
    utilidad_stock_proy = round2(sum(p["margen_unitario_usd"] * p["stock_actual"] for p in productos if p.get("tipo") != "servicio"))

    kpis = [
        {"etiqueta": "Productos a Pérdida", "valor": f"{conteo_perdida}", "tipo": "danger" if conteo_perdida > 0 else "success"},
        {"etiqueta": "Capital en Riesgo", "valor": f"${capital_riesgo:,.2f} USD", "tipo": "danger" if capital_riesgo > 0 else "success"},
        {"etiqueta": "Margen Promedio Catálogo", "valor": f"{margen_prom:.1f}%", "tipo": "primary"},
        {"etiqueta": "Utilidad Potencial Stock", "valor": f"${utilidad_stock_proy:,.2f} USD", "tipo": "info"}
    ]

    alertas = []
    perdida_items = [r for r in riesgosos if r.get("alerta_rentabilidad") == "VENTA_A_PERDIDA"]
    for r in riesgosos:
        if r.get("alerta_rentabilidad") == "VENTA_A_PERDIDA":
            alertas.append({
                "nivel": "danger",
                "mensaje": (
                    f"ALERTA CRÍTICA en [{r['codigo']}] {r['nombre']}: Costo CPP ${r['costo_cpp_usd']:,.2f} vs "
                    f"Precio ${r['precio_venta_usd']:,.2f} USD. Pérdida unitaria: -${abs(r['margen_unitario_usd']):,.2f} USD "
                    f"(Capital expuesto: ${r['valor_patrimonial_usd']:,.2f} USD)."
                )
            })
        elif r.get("tipo") == "producto" and r.get("costo_cpp_usd", 0.0) <= 0:
            alertas.append({
                "nivel": "warning",
                "mensaje": f"[{r['codigo']}] {r['nombre']} posee stock físico sin Costo CPP configurado ($0.00); registre su costo para auditar margen real."
            })
        else:
            alertas.append({
                "nivel": "warning",
                "mensaje": f"[{r['codigo']}] {r['nombre']} tiene margen estrecho ({r['margen_porcentaje']:+.2f}%)."
            })

    if not alertas:
        alertas.append({
            "nivel": "success",
            "mensaje": f"Todos los ítems auditados en {negocio} mantienen márgenes saludables (promedio {margen_prom:.1f}%) y cero ventas a pérdida."
        })

    if perdida_items:
        peor = sorted(perdida_items, key=lambda x: x["margen_unitario_usd"])[0]
        resumen = (
            f"Se detectaron **{len(perdida_items)} producto(s) vendido(s) a pérdida** en **{negocio}**, "
            f"comprometiendo **${capital_riesgo:,.2f} USD** ({porc_riesgo:.1f}% del inventario CPP). "
            f"El caso prioritario es **[{peor['codigo']}] {peor['nombre']}** (Costo CPP **${peor['costo_cpp_usd']:,.2f}** vs "
            f"Precio **${peor['precio_venta_usd']:,.2f} USD**, pérdida de **-${abs(peor['margen_unitario_usd']):,.2f} USD/u**). "
            f"Precio sugerido mínimo (15% margen): **${round2(peor['costo_cpp_usd'] * 1.15):,.2f} USD**."
        )
    elif riesgosos:
        resumen = (
            f"**Cero productos vendidos a pérdida** en **{negocio}**. No obstante, hay **{len(riesgosos)} ítem(s)** "
            f"con margen estrecho (<10%) o costo CPP pendiente por definir. La utilidad bruta proyectada sobre el stock actual "
            f"es de **${utilidad_stock_proy:,.2f} USD** (Score de salud: **{score_salud:.0f}/100**)."
        )
    else:
        resumen = (
            f"**Rentabilidad 100% saludable en {negocio}**: cero productos vendidos a pérdida y cero márgenes críticos. "
            f"El margen promedio ponderado del catálogo es **{margen_prom:.1f}%**, con una utilidad potencial en inventario de "
            f"**${utilidad_stock_proy:,.2f} USD**."
        )

    acciones = [{"texto": "Ir a Catálogo de Productos", "accion": "navigate('productos')"}]
    target_sim = perdida_items[0] if perdida_items else (riesgosos[0] if riesgosos else (productos[0] if productos else None))
    if target_sim:
        acciones.insert(0, {
            "texto": f"Simular Precio de {target_sim['codigo']}",
            "accion": f"abrirSimuladorPrecioIA({int(target_sim['id'])})"
        })

    return {
        "intent": "RENTABILIDAD_RIESGO",
        "titulo": "Auditoría de Rentabilidad, Márgenes y Protección Patrimonial",
        "resumen_ejecutivo": resumen,
        "kpis": kpis,
        "tablas": [{
            "titulo": "Ítems con Observaciones de Margen o Costo" if filas_tabla else "Todos los Productos Auditados",
            "columnas": ["Código", "Producto", "Costo CPP", "Precio Venta", "Margen Unit.", "Margen %", "Stock", "Capital Expuesto", "Estado"],
            "filas": filas_tabla if filas_tabla else [
                {
                    "codigo": p["codigo"],
                    "nombre": p["nombre"],
                    "costo_cpp": f"${p['costo_cpp_usd']:,.2f}",
                    "precio_venta": f"${p['precio_venta_usd']:,.2f}",
                    "diferencia_unit": f"${p['margen_unitario_usd']:,.2f}",
                    "margen_pct": f"{p['margen_porcentaje']:+.2f}%",
                    "stock": f"{p['stock_actual']:g} u",
                    "capital_expuesto": f"${p['valor_patrimonial_usd']:,.2f}",
                    "estado": p["alerta_rentabilidad"]
                }
                for p in productos
            ]
        }],
        "alertas": alertas,
        "acciones_sugeridas": acciones
    }


# ==============================================================================
# 4. AUDITORÍA DETERMINISTA DE CUENTAS POR COBRAR (CXC)
# ==============================================================================
def _consultar_cxc_datos(conn):
    cur = conn.cursor()
    cur.execute("""
        SELECT cxc.id, COALESCE(f.numero_factura, 'FAC-' || cxc.factura_id) AS num_fac,
               c.nombre AS cliente, c.cedula,
               cxc.monto_total, cxc.monto_pagado, cxc.saldo_pendiente,
               cxc.fecha_emision, cxc.fecha_vencimiento, cxc.estado
        FROM cuentas_por_cobrar cxc
        JOIN clientes c ON cxc.cliente_id = c.id
        LEFT JOIN facturas f ON cxc.factura_id = f.id
        WHERE COALESCE(cxc.estado, 'pendiente') IN ('pendiente', 'parcial')
          AND cxc.saldo_pendiente > 0.001
        ORDER BY cxc.saldo_pendiente DESC
    """)
    deudas = cur.fetchall()
    cur.execute("SELECT COUNT(*) FROM clientes")
    total_clientes = int(cur.fetchone()[0] or 0)

    hoy_str = date.today().isoformat()
    total_cxc = round2(sum(float(d[6] or 0) for d in deudas))
    vencidas = [d for d in deudas if d[8] and str(d[8])[:10] < hoy_str]
    total_vencido = round2(sum(float(d[6] or 0) for d in vencidas))
    morosidad_pct = round2((total_vencido / total_cxc * 100.0)) if total_cxc > 0 else 0.0

    filas = []
    for d in deudas:
        es_venc = bool(d[8] and str(d[8])[:10] < hoy_str)
        filas.append({
            "cxc_id": d[0],
            "factura": d[1],
            "cliente": d[2],
            "cedula": d[3] or "-",
            "total_factura": f"${float(d[4] or 0):,.2f}",
            "abonado": f"${float(d[5] or 0):,.2f}",
            "saldo_pendiente": f"${float(d[6] or 0):,.2f}",
            "vencimiento": d[8] or "N/D",
            "estado": "VENCIDA" if es_venc else str(d[9] or "pendiente").upper()
        })

    return {
        "deudas": deudas,
        "total_clientes": total_clientes,
        "total_cxc": total_cxc,
        "vencidas_count": len(vencidas),
        "total_vencido": total_vencido,
        "morosidad_pct": morosidad_pct,
        "filas": filas
    }


def auditar_cxc(conn):
    d_cxc = _consultar_cxc_datos(conn)
    total_cxc = d_cxc["total_cxc"]
    deudas = d_cxc["deudas"]

    kpis = [
        {"etiqueta": "Cartera Total CXC", "valor": f"${total_cxc:,.2f} USD", "tipo": "success" if total_cxc == 0 else "warning"},
        {"etiqueta": "Facturas Pendientes", "valor": f"{len(deudas)}", "tipo": "neutral"},
        {"etiqueta": "Saldo Vencido", "valor": f"${d_cxc['total_vencido']:,.2f} USD", "tipo": "danger" if d_cxc["total_vencido"] > 0 else "success"},
        {"etiqueta": "Índice de Morosidad", "valor": f"{d_cxc['morosidad_pct']:.1f}%", "tipo": "danger" if d_cxc["morosidad_pct"] > 20 else "info"}
    ]

    alertas = []
    if total_cxc == 0:
        alertas.append({
            "nivel": "success",
            "mensaje": "La cartera de Cuentas por Cobrar está 100% al día ($0.00 USD pendientes)."
        })
        resumen = (
            f"Actualmente **no existen deudas pendientes en Cuentas por Cobrar (CXC)** entre los "
            f"**{d_cxc['total_clientes']} clientes** registrados. El saldo exigible es **$0.00 USD**."
        )
    else:
        if d_cxc["vencidas_count"] > 0:
            alertas.append({
                "nivel": "danger",
                "mensaje": f"Existen {d_cxc['vencidas_count']} factura(s) vencida(s) por ${d_cxc['total_vencido']:,.2f} USD ({d_cxc['morosidad_pct']:.1f}% de la cartera)."
            })
        else:
            alertas.append({
                "nivel": "info",
                "mensaje": f"Se registran {len(deudas)} crédito(s) vigente(s) por cobrar por ${total_cxc:,.2f} USD (cero vencidos)."
            })
        resumen = (
            f"La cartera de Cuentas por Cobrar suma **${total_cxc:,.2f} USD** en **{len(deudas)} factura(s)** "
            f"(saldo vencido: **${d_cxc['total_vencido']:,.2f} USD**, morosidad **{d_cxc['morosidad_pct']:.1f}%**)."
        )

    return {
        "intent": "CUENTAS_POR_COBRAR",
        "titulo": "Auditoría de Cuentas por Cobrar (Cartera de Clientes)",
        "resumen_ejecutivo": resumen,
        "kpis": kpis,
        "tablas": [{
            "titulo": "Detalle de Créditos y Saldos Pendientes de Clientes",
            "columnas": ["ID", "Factura", "Cliente", "Cédula/RIF", "Total", "Abonado", "Saldo Pendiente", "Vencimiento", "Estado"],
            "filas": d_cxc["filas"]
        }],
        "alertas": alertas,
        "acciones_sugeridas": [
            {"texto": "Ir a Cuentas por Cobrar (CXC)", "accion": "navigate('cxc')"},
            {"texto": "Ir a Facturación POS", "accion": "navigate('facturacion')"}
        ]
    }


# ==============================================================================
# 5. AUDITORÍA DETERMINISTA DE CUENTAS POR PAGAR (CXP)
# ==============================================================================
def _consultar_cxp_datos(conn):
    cur = conn.cursor()
    cur.execute("""
        SELECT cxp.id, cxp.compra_id, COALESCE(p.nombre, cxp.descripcion_concepto, 'Proveedor') AS proveedor,
               COALESCE(p.cedula, '-') AS rif,
               COALESCE(cxp.numero_factura, 'S/N') AS num_fac,
               cxp.monto_total, cxp.monto_pagado, cxp.saldo_pendiente,
               cxp.fecha_emision, cxp.fecha_vencimiento, cxp.estado
        FROM cuentas_por_pagar cxp
        LEFT JOIN proveedores p ON cxp.proveedor_id = p.id
        WHERE COALESCE(cxp.estado, 'pendiente') IN ('pendiente', 'parcial')
          AND cxp.saldo_pendiente > 0.001
        ORDER BY cxp.saldo_pendiente DESC
    """)
    deudas = cur.fetchall()
    hoy_str = date.today().isoformat()
    total_cxp = round2(sum(float(d[7] or 0) for d in deudas))
    vencidas = [d for d in deudas if d[9] and str(d[9])[:10] < hoy_str]
    total_vencido = round2(sum(float(d[7] or 0) for d in vencidas))

    filas = []
    for d in deudas:
        es_venc = bool(d[9] and str(d[9])[:10] < hoy_str)
        filas.append({
            "cxp_id": d[0],
            "compra_id": f"COM-{d[1]}" if d[1] else "GASTO",
            "proveedor": d[2],
            "rif": d[3],
            "factura_proveedor": d[4],
            "monto_total": f"${float(d[5] or 0):,.2f}",
            "abonado": f"${float(d[6] or 0):,.2f}",
            "saldo_pendiente": f"${float(d[7] or 0):,.2f}",
            "vencimiento": d[9] or "Por Definir",
            "estado": "VENCIDA" if es_venc else str(d[10] or "pendiente").upper()
        })

    return {
        "deudas": deudas,
        "total_cxp": total_cxp,
        "vencidas_count": len(vencidas),
        "total_vencido": total_vencido,
        "filas": filas
    }


def auditar_cxp(conn):
    d_cxp = _consultar_cxp_datos(conn)
    total_cxp = d_cxp["total_cxp"]
    deudas = d_cxp["deudas"]

    kpis = [
        {"etiqueta": "Compromisos Totales CXP", "valor": f"${total_cxp:,.2f} USD", "tipo": "warning" if total_cxp > 0 else "success"},
        {"etiqueta": "Documentos por Pagar", "valor": f"{len(deudas)} factura(s)", "tipo": "neutral"},
        {"etiqueta": "Saldo Vencido CXP", "valor": f"${d_cxp['total_vencido']:,.2f} USD", "tipo": "danger" if d_cxp["total_vencido"] > 0 else "success"},
        {"etiqueta": "Principal Acreedor", "valor": deudas[0][2] if deudas else "Ninguno", "tipo": "info"}
    ]

    alertas = []
    if total_cxp > 0:
        if d_cxp["vencidas_count"] > 0:
            alertas.append({
                "nivel": "danger",
                "mensaje": f"Hay {d_cxp['vencidas_count']} factura(s) vencida(s) por pagar a proveedores (${d_cxp['total_vencido']:,.2f} USD)."
            })
        else:
            alertas.append({
                "nivel": "warning",
                "mensaje": f"Compromisos vigentes por pagar a proveedores: ${total_cxp:,.2f} USD en {len(deudas)} documento(s)."
            })
        resumen = (
            f"La empresa tiene obligaciones pendientes en Cuentas por Pagar (CXP) por **${total_cxp:,.2f} USD** "
            f"en **{len(deudas)} documento(s)** (principal acreedor: **{deudas[0][2]}**, saldo vencido: **${d_cxp['total_vencido']:,.2f} USD**)."
        )
    else:
        alertas.append({
            "nivel": "success",
            "mensaje": "No hay compromisos pendientes en Cuentas por Pagar ($0.00 USD)."
        })
        resumen = "La empresa no posee compromisos vencidos ni pendientes en Cuentas por Pagar (**$0.00 USD**)."

    return {
        "intent": "CUENTAS_POR_PAGAR",
        "titulo": "Auditoría de Cuentas por Pagar a Proveedores (CXP)",
        "resumen_ejecutivo": resumen,
        "kpis": kpis,
        "tablas": [{
            "titulo": "Facturas y Compromisos Pendientes con Proveedores",
            "columnas": ["ID", "Origen", "Proveedor", "RIF", "Factura Prov.", "Total", "Abonado", "Saldo Pendiente", "Vencimiento", "Estado"],
            "filas": d_cxp["filas"]
        }],
        "alertas": alertas,
        "acciones_sugeridas": [
            {"texto": "Ir al Módulo de CXP", "accion": "navigate('cxp')"},
            {"texto": "Ir a Tesorería", "accion": "navigate('tesoreria')"}
        ]
    }


def auditar_cartera_cxc_cxp(conn):
    """Audita simultáneamente Cuentas por Cobrar (clientes) y Cuentas por Pagar (proveedores)."""
    d_cxc = _consultar_cxc_datos(conn)
    d_cxp = _consultar_cxp_datos(conn)
    posicion_neta = round2(d_cxc["total_cxc"] - d_cxp["total_cxp"])

    kpis = [
        {"etiqueta": "Nos Deben (CXC)", "valor": f"${d_cxc['total_cxc']:,.2f} USD", "tipo": "primary"},
        {"etiqueta": "Debemos (CXP)", "valor": f"${d_cxp['total_cxp']:,.2f} USD", "tipo": "warning" if d_cxp["total_cxp"] > 0 else "success"},
        {"etiqueta": "Posición Neta (CXC - CXP)", "valor": f"${posicion_neta:,.2f} USD", "tipo": "success" if posicion_neta >= 0 else "danger"},
        {"etiqueta": "Vencido CXC / CXP", "valor": f"${d_cxc['total_vencido']:,.2f} / ${d_cxp['total_vencido']:,.2f}", "tipo": "info"}
    ]

    alertas = []
    if d_cxc["total_vencido"] > 0:
        alertas.append({"nivel": "danger", "mensaje": f"CXC vencidas por cobrar: ${d_cxc['total_vencido']:,.2f} USD ({d_cxc['vencidas_count']} factura(s))."})
    if d_cxp["total_vencido"] > 0:
        alertas.append({"nivel": "danger", "mensaje": f"CXP vencidas por pagar: ${d_cxp['total_vencido']:,.2f} USD ({d_cxp['vencidas_count']} factura(s))."})
    if not alertas:
        alertas.append({"nivel": "success", "mensaje": "Sin saldos vencidos en CXC ni CXP al día de hoy."})

    resumen = (
        f"**Resumen de Cartera Comercial:** Los clientes nos deben **${d_cxc['total_cxc']:,.2f} USD** "
        f"({len(d_cxc['deudas'])} factura(s)), y debemos a proveedores **${d_cxp['total_cxp']:,.2f} USD** "
        f"({len(d_cxp['deudas'])} documento(s)). La posición crediticia neta es de **${posicion_neta:,.2f} USD**."
    )

    tablas = []
    if d_cxc["filas"]:
        tablas.append({
            "titulo": "Cuentas por Cobrar (Clientes)",
            "columnas": ["ID", "Factura", "Cliente", "Cédula/RIF", "Total", "Abonado", "Saldo", "Vencimiento", "Estado"],
            "filas": d_cxc["filas"]
        })
    if d_cxp["filas"]:
        tablas.append({
            "titulo": "Cuentas por Pagar (Proveedores)",
            "columnas": ["ID", "Origen", "Proveedor", "RIF", "Factura Prov.", "Total", "Abonado", "Saldo", "Vencimiento", "Estado"],
            "filas": d_cxp["filas"]
        })

    return {
        "intent": "CUENTAS_COBRAR_Y_PAGAR",
        "titulo": "Balance Consolidado de CXC (Clientes) y CXP (Proveedores)",
        "resumen_ejecutivo": resumen,
        "kpis": kpis,
        "tablas": tablas,
        "alertas": alertas,
        "acciones_sugeridas": [
            {"texto": "Ver Cuentas por Cobrar", "accion": "navigate('cxc')"},
            {"texto": "Ver Cuentas por Pagar", "accion": "navigate('cxp')"}
        ]
    }


# ==============================================================================
# 6. AUDITORÍA DETERMINISTA DEL BALANCE GERENCIAL 360°
# ==============================================================================
def auditar_balance_360(conn):
    negocio, _, _, _ = _obtener_config(conn)
    cur = conn.cursor()

    liq = _calcular_liquidez_real(conn)
    tot_tesoreria_usd = liq["consolidado_usd"]

    diag_inv = inventario_ia.diagnosticar_inventario_organico(conn)
    res_pat = diag_inv.get("resumen_patrimonial", {})
    tot_inventario_usd = res_pat.get("total_valoracion_cpp_usd", 0.0)
    unidades_tot = res_pat.get("total_unidades_fisicas", 0.0)
    capital_riesgo_usd = res_pat.get("capital_en_riesgo_margen_negativo_usd", 0.0)
    productos = diag_inv.get("analisis_productos", [])

    d_cxc = _consultar_cxc_datos(conn)
    d_cxp = _consultar_cxp_datos(conn)
    tot_cxc_usd = d_cxc["total_cxc"]
    tot_cxp_usd = d_cxp["total_cxp"]

    # Contexto comercial del mes (facturas y pedidos pendientes)
    cur.execute("""
        SELECT COUNT(*), COALESCE(SUM(total_usd), 0.0)
        FROM facturas
        WHERE COALESCE(estado, 'pagada') != 'anulada'
          AND substr(COALESCE(fecha, ''), 1, 7) = strftime('%Y-%m', 'now', 'localtime')
    """)
    row_vmes = cur.fetchone()
    ventas_mes_cnt = int(row_vmes[0] or 0)
    ventas_mes_usd = round2(float(row_vmes[1] or 0.0))

    cur.execute("SELECT COUNT(*), COALESCE(SUM(total_usd), 0.0) FROM pedidos WHERE UPPER(COALESCE(estado, '')) = 'PENDIENTE'")
    row_ped = cur.fetchone()
    ped_pend_cnt = int(row_ped[0] or 0)
    ped_pend_usd = round2(float(row_ped[1] or 0.0))

    total_activos = round2(tot_tesoreria_usd + tot_inventario_usd + tot_cxc_usd)
    patrimonio_neto_tangible = round2(total_activos - tot_cxp_usd)
    patrimonio_neto_seguro = round2(patrimonio_neto_tangible - capital_riesgo_usd)

    def _pct_act(monto):
        return f"{(monto / total_activos * 100.0):.1f}%" if total_activos > 0 else "0.0%"

    kpis = [
        {"etiqueta": "Patrimonio Neto Tangible", "valor": f"${patrimonio_neto_tangible:,.2f} USD", "tipo": "primary"},
        {"etiqueta": "Inventario (CPP)", "valor": f"${tot_inventario_usd:,.2f} USD", "tipo": "neutral"},
        {"etiqueta": "Liquidez (Tesorería + Caja)", "valor": f"${tot_tesoreria_usd:,.2f} USD", "tipo": "neutral"},
        {"etiqueta": "CXC / CXP Netas", "valor": f"${tot_cxc_usd:,.2f} / -${tot_cxp_usd:,.2f}", "tipo": "warning" if tot_cxp_usd > 0 else "info"},
        {"etiqueta": "Ventas del Mes Actual", "valor": f"${ventas_mes_usd:,.2f} USD ({ventas_mes_cnt})", "tipo": "success"}
    ]

    filas_balance = [
        {"rubro": "ACTIVO CIRCULANTE: Tesorería y Cajas Abiertas", "monto_usd": f"${tot_tesoreria_usd:,.2f}", "porcentaje": _pct_act(tot_tesoreria_usd)},
        {"rubro": f"ACTIVO CIRCULANTE: Inventario a Costo CPP ({unidades_tot:g} u)", "monto_usd": f"${tot_inventario_usd:,.2f}", "porcentaje": _pct_act(tot_inventario_usd)},
        {"rubro": f"ACTIVO CIRCULANTE: Cuentas por Cobrar ({len(d_cxc['deudas'])} doc.)", "monto_usd": f"${tot_cxc_usd:,.2f}", "porcentaje": _pct_act(tot_cxc_usd)},
        {"rubro": "TOTAL ACTIVO CIRCULANTE", "monto_usd": f"${total_activos:,.2f}", "porcentaje": "100.0%"},
        {"rubro": f"PASIVO EXIGIBLE: Cuentas por Pagar ({len(d_cxp['deudas'])} doc.)", "monto_usd": f"-${tot_cxp_usd:,.2f}", "porcentaje": _pct_act(tot_cxp_usd)},
        {"rubro": "PATRIMONIO NETO TANGIBLE (Activos - Pasivos)", "monto_usd": f"${patrimonio_neto_tangible:,.2f}", "porcentaje": "BASE NETA"}
    ]
    if capital_riesgo_usd > 0:
        filas_balance.append({
            "rubro": "AJUSTE POR RIESGO (Productos con Margen Negativo)",
            "monto_usd": f"-${capital_riesgo_usd:,.2f}",
            "porcentaje": _pct_act(capital_riesgo_usd)
        })
        filas_balance.append({
            "rubro": "PATRIMONIO BLINDADO (Sin Capital en Pérdida)",
            "monto_usd": f"${patrimonio_neto_seguro:,.2f}",
            "porcentaje": "PROTEGIDO"
        })

    alertas = []
    if capital_riesgo_usd > 0:
        alertas.append({
            "nivel": "danger",
            "mensaje": f"Existe un capital expuesto de ${capital_riesgo_usd:,.2f} USD por productos con precio inferior al costo CPP."
        })
    else:
        alertas.append({
            "nivel": "success",
            "mensaje": "Cero capital expuesto a venta a pérdida: todos los precios cubren el costo CPP."
        })

    if tot_cxp_usd == 0 or total_activos >= tot_cxp_usd:
        alertas.append({
            "nivel": "info",
            "mensaje": f"Cobertura de solvencia favorable: Activos circulantes (${total_activos:,.2f} USD) frente a CXP (${tot_cxp_usd:,.2f} USD)."
        })
    else:
        alertas.append({
            "nivel": "warning",
            "mensaje": f"Pasivos CXP (${tot_cxp_usd:,.2f} USD) superan el activo circulante actual (${total_activos:,.2f} USD)."
        })

    if ped_pend_cnt > 0:
        alertas.append({
            "nivel": "info",
            "mensaje": f"Preventas en cola: {ped_pend_cnt} pedido(s) pendiente(s) de aprobación por ${ped_pend_usd:,.2f} USD."
        })

    resumen = (
        f"El **Balance Gerencial 360° de {negocio}** arroja un patrimonio neto tangible de "
        f"**${patrimonio_neto_tangible:,.2f} USD** (Activos circulantes: **${total_activos:,.2f} USD** = "
        f"**${tot_inventario_usd:,.2f}** inventario CPP + **${tot_tesoreria_usd:,.2f}** liquidez + **${tot_cxc_usd:,.2f}** CXC; "
        f"Pasivos CXP: **${tot_cxp_usd:,.2f} USD**). "
        f"En el mes actual se han facturado **${ventas_mes_usd:,.2f} USD** ({ventas_mes_cnt} facturas)."
    )

    acciones = [
        {"texto": "Ver Diagnóstico IA de Inventario", "accion": "abrirDiagnosticoIaProductos()"},
        {"texto": "Ver Dashboard BI", "accion": "navigate('dashboard')"},
        {"texto": "Revisar Pedidos", "accion": "navigate('pedidos')"}
    ]
    if capital_riesgo_usd > 0 and productos:
        peor = sorted(productos, key=lambda x: x["margen_unitario_usd"])[0]
        acciones.insert(0, {"texto": f"Corregir Precio de {peor['codigo']}", "accion": f"abrirSimuladorPrecioIA({int(peor['id'])})"})

    return {
        "intent": "BALANCE_360",
        "titulo": "Balance Gerencial 360° y Solvencia Patrimonial",
        "resumen_ejecutivo": resumen,
        "kpis": kpis,
        "tablas": [{
            "titulo": "Estructura del Balance Operativo Tangible",
            "columnas": ["Rubro Financiero / Patrimonial", "Monto USD", "Participación"],
            "filas": filas_balance
        }],
        "alertas": alertas,
        "acciones_sugeridas": acciones
    }


# ==============================================================================
# 7. AUDITORÍA DETERMINISTA DE ABASTECIMIENTO Y COMPRAS
# ==============================================================================
def auditar_abastecimiento(conn):
    negocio, _, _, _ = _obtener_config(conn)
    diag = inventario_ia.diagnosticar_inventario_organico(conn)
    res_pat = diag.get("resumen_patrimonial", {})
    productos = [p for p in diag.get("analisis_productos", []) if p.get("tipo") != "servicio"]

    unidades_tot = res_pat.get("total_unidades_fisicas", 0.0)
    ahorro_sobrestock = res_pat.get("ahorro_inmediato_compras_usd", 0.0)
    inversion_sug = res_pat.get("inversion_sugerida_reposicion_usd", 0.0)

    a_comprar = [p for p in productos if p.get("unidades_sugeridas_compra", 0.0) > 0]
    sobrestock = [p for p in productos if p.get("estado_abastecimiento") == "SOBRESTOCK"]

    filas = []
    for p in sorted(productos, key=lambda x: (-x["unidades_sugeridas_compra"], x["stock_disponible"])):
        filas.append({
            "codigo": p["codigo"],
            "nombre": p["nombre"],
            "disponible": f"{p['stock_disponible']:g} u",
            "minimo": f"{p['stock_minimo']:g} u",
            "consumo": f"{p['consumo_diario_observado']:.2f} u/día",
            "cobertura": f"{int(p['dias_cobertura'])} d" if p["dias_cobertura"] is not None else "N/A",
            "sugerido_comprar": f"{p['unidades_sugeridas_compra']:g} u",
            "inversion_usd": f"${p['inversion_sugerida_usd']:,.2f}",
            "estado": p["estado_abastecimiento"]
        })

    if a_comprar:
        dictamen = f"REORDENAR ({len(a_comprar)} SKU)"
        tipo_dictamen = "warning"
        alertas = [{
            "nivel": "warning",
            "mensaje": f"Se detectan {len(a_comprar)} producto(s) con necesidad de reposición por inversión estimada de ${inversion_sug:,.2f} USD."
        }]
        resumen = (
            f"**Dictamen de Abastecimiento para {negocio}:** Se requiere reordenar **{len(a_comprar)} producto(s)** "
            f"(inversión estimada de **${inversion_sug:,.2f} USD** a costo CPP actual). "
            f"Simultáneamente hay **{len(sobrestock)} producto(s)** en sobrestock (**${ahorro_sobrestock:,.2f} USD**), "
            f"en los cuales NO se debe comprar."
        )
    else:
        dictamen = "$0.00 USD (NO COMPRAR)"
        tipo_dictamen = "success"
        alertas = [{
            "nivel": "success",
            "mensaje": f"Inventario cubierto: {len(productos)} producto(s) físicos con {unidades_tot:g} u totales. No se requieren compras inmediatas."
        }]
        resumen = (
            f"**Dictamen de Abastecimiento para {negocio}:** **Cero compras adicionales requeridas**. "
            f"Todos los **{len(productos)} producto(s)** físicos ({unidades_tot:g} unidades) superan sus mínimos y cobertura de rotación; "
            f"se protege caja evitando sobreinvertir (**${ahorro_sobrestock:,.2f} USD** en sobrestock)."
        )

    kpis = [
        {"etiqueta": "Sugerencia de Compras", "valor": dictamen, "tipo": tipo_dictamen},
        {"etiqueta": "Inversión Reorden Sugerida", "valor": f"${inversion_sug:,.2f} USD", "tipo": "primary"},
        {"etiqueta": "Capital en Sobrestock", "valor": f"${ahorro_sobrestock:,.2f} USD", "tipo": "info"},
        {"etiqueta": "Existencia Total Física", "valor": f"{unidades_tot:g} u", "tipo": "neutral"}
    ]

    return {
        "intent": "COMPRAS_ABASTECIMIENTO",
        "titulo": "Recomendación Estratégica de Abastecimiento y Compras",
        "resumen_ejecutivo": resumen,
        "kpis": kpis,
        "tablas": [{
            "titulo": "Plan de Reposición y Cobertura por Producto",
            "columnas": ["Código", "Producto", "Disponible", "Mínimo", "Consumo", "Cobertura", "Comprar", "Inversión CPP", "Estado"],
            "filas": filas
        }],
        "alertas": alertas,
        "acciones_sugeridas": [
            {"texto": "Ir a Módulo de Compras", "accion": "navigate('compras')"},
            {"texto": "Abrir Diagnóstico IA", "accion": "abrirDiagnosticoIaProductos()"}
        ]
    }


# ==============================================================================
# 8. AUDITORÍA DE VENTAS, FACTURACIÓN Y UTILIDAD REAL (CPP)
# ==============================================================================
def auditar_ventas_facturacion(conn, pregunta_raw=""):
    negocio, t_ves, _, _ = _obtener_config(conn)
    p_norm = normalizar_texto(pregunta_raw)
    cur = conn.cursor()

    hoy_dt = date.today()
    if any(w in p_norm for w in ["hoy", "dia de hoy", "diario"]):
        etiqueta_per = "Hoy"
        desde_str = hoy_dt.isoformat()
        hasta_str = hoy_dt.isoformat()
    elif any(w in p_norm for w in ["semana", "7 dias", "ultimos dias"]):
        etiqueta_per = "Últimos 7 Días"
        desde_str = (hoy_dt - timedelta(days=6)).isoformat()
        hasta_str = hoy_dt.isoformat()
    elif any(w in p_norm for w in ["anio", "ano", "anual"]):
        etiqueta_per = f"Año {hoy_dt.year}"
        desde_str = hoy_dt.replace(month=1, day=1).isoformat()
        hasta_str = hoy_dt.isoformat()
    elif any(w in p_norm for w in ["historico", "historia", "total", "todas", "siempre"]):
        etiqueta_per = "Histórico Completo"
        desde_str = "1900-01-01"
        hasta_str = "2999-12-31"
    else:
        etiqueta_per = "Mes Actual"
        desde_str = hoy_dt.replace(day=1).isoformat()
        hasta_str = hoy_dt.isoformat()

    cur.execute("""
        SELECT COUNT(*),
               COALESCE(SUM(total_usd), 0.0),
               COALESCE(SUM(subtotal), 0.0),
               COALESCE(SUM(iva_total), 0.0),
               SUM(CASE WHEN LOWER(COALESCE(tipo_venta, 'contado')) = 'credito' THEN 1 ELSE 0 END),
               COALESCE(SUM(CASE WHEN LOWER(COALESCE(tipo_venta, 'contado')) = 'credito' THEN total_usd ELSE 0.0 END), 0.0)
        FROM facturas
        WHERE COALESCE(estado, 'pagada') != 'anulada'
          AND substr(COALESCE(fecha, ''), 1, 10) BETWEEN ? AND ?
    """, (desde_str, hasta_str))
    r_v = cur.fetchone()
    cant_fac = int(r_v[0] or 0)
    total_ventas_usd = round2(float(r_v[1] or 0.0))
    subtotal_usd = round2(float(r_v[2] or 0.0))
    iva_usd = round2(float(r_v[3] or 0.0))
    cant_credito = int(r_v[4] or 0)
    monto_credito = round2(float(r_v[5] or 0.0))
    ticket_prom = round2(total_ventas_usd / cant_fac) if cant_fac > 0 else 0.0

    # Costo CPP real vendido y utilidad bruta
    cur.execute("""
        SELECT COALESCE(SUM(fd.subtotal), 0.0),
               COALESCE(SUM(
                   CASE
                       WHEN COALESCE(fd.tipo, 'producto') = 'servicio' THEN 0.0
                       ELSE COALESCE(fd.costo_total, COALESCE(fd.costo_unitario, p.costo_cpp, p.costo, 0.0) * COALESCE(fd.cantidad, 0.0))
                   END
               ), 0.0)
        FROM factura_detalles fd
        JOIN facturas f ON fd.factura_id = f.id
        LEFT JOIN productos p ON fd.producto_id = p.id
        WHERE COALESCE(f.estado, 'pagada') != 'anulada'
          AND substr(COALESCE(f.fecha, ''), 1, 10) BETWEEN ? AND ?
    """, (desde_str, hasta_str))
    r_c = cur.fetchone()
    base_ventas = float(r_c[0] or 0.0) or subtotal_usd
    costo_vendido = float(r_c[1] or 0.0)
    utilidad_bruta = round2(base_ventas - costo_vendido)
    margen_bruto_pct = round2((utilidad_bruta / base_ventas * 100.0)) if base_ventas > 0 else 0.0

    # Top productos vendidos en el período
    cur.execute("""
        SELECT COALESCE(p.codigo, 'ITEM') AS codigo,
               fd.nombre_producto,
               COALESCE(SUM(fd.cantidad), 0.0) AS cant,
               COALESCE(SUM(fd.total), 0.0) AS vendido_usd,
               COALESCE(SUM(
                   CASE
                       WHEN COALESCE(fd.tipo, 'producto') = 'servicio' THEN 0.0
                       ELSE COALESCE(fd.costo_total, COALESCE(fd.costo_unitario, p.costo_cpp, p.costo, 0.0) * COALESCE(fd.cantidad, 0.0))
                   END
               ), 0.0) AS costo_usd
        FROM factura_detalles fd
        JOIN facturas f ON fd.factura_id = f.id
        LEFT JOIN productos p ON fd.producto_id = p.id
        WHERE COALESCE(f.estado, 'pagada') != 'anulada'
          AND substr(COALESCE(f.fecha, ''), 1, 10) BETWEEN ? AND ?
        GROUP BY fd.producto_id, fd.nombre_producto
        ORDER BY vendido_usd DESC
        LIMIT 10
    """, (desde_str, hasta_str))
    top_rows = cur.fetchall()
    filas = []
    for cod, nom, cant, v_usd, c_usd in top_rows:
        util_item = round2(float(v_usd or 0) - float(c_usd or 0))
        filas.append({
            "codigo": cod,
            "producto": nom,
            "cantidad": f"{float(cant or 0):g}",
            "ventas_usd": f"${float(v_usd or 0):,.2f}",
            "costo_cpp": f"${float(c_usd or 0):,.2f}",
            "utilidad_usd": f"${util_item:,.2f}"
        })

    kpis = [
        {"etiqueta": f"Facturación ({etiqueta_per})", "valor": f"${total_ventas_usd:,.2f} USD", "tipo": "primary"},
        {"etiqueta": "Utilidad Bruta Real (CPP)", "valor": f"${utilidad_bruta:,.2f} USD", "tipo": "success" if utilidad_bruta >= 0 else "danger"},
        {"etiqueta": "Margen Bruto %", "valor": f"{margen_bruto_pct:.1f}%", "tipo": "info"},
        {"etiqueta": "Facturas / Ticket Prom.", "valor": f"{cant_fac} | ${ticket_prom:,.2f}", "tipo": "neutral"}
    ]

    alertas = []
    if cant_fac == 0:
        alertas.append({"nivel": "info", "mensaje": f"No se registran facturas activas en el período '{etiqueta_per}'."})
    else:
        alertas.append({
            "nivel": "success" if utilidad_bruta >= 0 else "danger",
            "mensaje": (
                f"Contado: {cant_fac - cant_credito} factura(s) (${round2(total_ventas_usd - monto_credito):,.2f} USD) | "
                f"Crédito: {cant_credito} factura(s) (${monto_credito:,.2f} USD). IVA facturado: ${iva_usd:,.2f} USD."
            )
        })

    resumen = (
        f"En el período **{etiqueta_per}** ({negocio}), se emitieron **{cant_fac} factura(s)** válidas por "
        f"**${total_ventas_usd:,.2f} USD** (Bs. {round2(total_ventas_usd * t_ves):,.2f}), con un costo CPP de mercancía de "
        f"**${round2(costo_vendido):,.2f} USD** y una **utilidad bruta real de ${utilidad_bruta:,.2f} USD** ({margen_bruto_pct:.1f}%)."
    )

    return {
        "intent": "VENTAS_FACTURACION",
        "titulo": f"Auditoría de Ventas, Facturación y Utilidad ({etiqueta_per})",
        "resumen_ejecutivo": resumen,
        "kpis": kpis,
        "tablas": [{
            "titulo": f"Top Productos / Ítems Facturados ({etiqueta_per})",
            "columnas": ["Código", "Producto / Servicio", "Unidades", "Facturado USD", "Costo CPP", "Utilidad Bruta"],
            "filas": filas
        }] if filas else [],
        "alertas": alertas,
        "acciones_sugeridas": [
            {"texto": "Ir a Reportes Fiscales / Ventas", "accion": "navigate('reportes')"},
            {"texto": "Ir a Facturación POS", "accion": "navigate('facturacion')"}
        ]
    }


# ==============================================================================
# 9. AUDITORÍA DE PEDIDOS, PREVENTAS Y FUERZA DE VENTAS
# ==============================================================================
def auditar_pedidos_preventas(conn):
    negocio, _, _, _ = _obtener_config(conn)
    cur = conn.cursor()

    cur.execute("""
        SELECT UPPER(COALESCE(estado, 'PENDIENTE')) AS est, COUNT(*), COALESCE(SUM(total_usd), 0.0)
        FROM pedidos
        GROUP BY est
    """)
    por_estado = {r[0]: {"cnt": int(r[1] or 0), "tot": round2(float(r[2] or 0.0))} for r in cur.fetchall()}

    tot_pedidos = sum(v["cnt"] for v in por_estado.values())
    pend = por_estado.get("PENDIENTE", {"cnt": 0, "tot": 0.0})
    aprob = por_estado.get("APROBADO", {"cnt": 0, "tot": 0.0})
    fact = por_estado.get("FACTURADO", {"cnt": 0, "tot": 0.0})
    rech = por_estado.get("RECHAZADO", {"cnt": 0, "tot": 0.0})
    venc = por_estado.get("VENCIDO", {"cnt": 0, "tot": 0.0})

    cur.execute("""
        SELECT p.numero_pedido, c.nombre AS cliente, COALESCE(v.nombre, 'Mostrador') AS vendedor,
               p.total_usd, p.condicion_pago, p.estado, p.fecha_vencimiento
        FROM pedidos p
        LEFT JOIN clientes c ON p.cliente_id = c.id
        LEFT JOIN vendedores v ON p.vendedor_id = v.id
        ORDER BY CASE UPPER(COALESCE(p.estado, '')) WHEN 'PENDIENTE' THEN 0 WHEN 'APROBADO' THEN 1 ELSE 2 END, p.id DESC
        LIMIT 12
    """)
    filas = []
    for num, cli, vend, tot, cond, est, fv in cur.fetchall():
        filas.append({
            "pedido": num,
            "cliente": cli or "Cliente",
            "vendedor": vend,
            "condicion": str(cond or "contado").upper(),
            "total_usd": f"${float(tot or 0):,.2f}",
            "vigencia": (fv or "-")[:10],
            "estado": est
        })

    kpis = [
        {"etiqueta": "Total Pedidos Históricos", "valor": f"{tot_pedidos}", "tipo": "primary"},
        {"etiqueta": "Pendientes de Aprobación", "valor": f"{pend['cnt']} (${pend['tot']:,.2f})", "tipo": "warning" if pend["cnt"] > 0 else "success"},
        {"etiqueta": "Aprobados (Reservados)", "valor": f"{aprob['cnt']} (${aprob['tot']:,.2f})", "tipo": "info"},
        {"etiqueta": "Facturados Exitosos", "valor": f"{fact['cnt']} (${fact['tot']:,.2f})", "tipo": "success"}
    ]

    alertas = []
    if pend["cnt"] > 0:
        alertas.append({
            "nivel": "warning",
            "mensaje": f"Hay {pend['cnt']} pedido(s) en estado PENDIENTE por ${pend['tot']:,.2f} USD esperando revisión administrativa."
        })
    if aprob["cnt"] > 0:
        alertas.append({
            "nivel": "info",
            "mensaje": f"Hay {aprob['cnt']} pedido(s) APROBADOS (${aprob['tot']:,.2f} USD) listos para facturar (mantienen stock comprometido)."
        })
    if not alertas:
        alertas.append({
            "nivel": "success",
            "mensaje": f"No hay pedidos pendientes ni represados en {negocio}."
        })

    resumen = (
        f"El módulo de Pedidos y Preventas de **{negocio}** registra **{tot_pedidos} pedido(s)**: "
        f"**{pend['cnt']} pendiente(s)** (${pend['tot']:,.2f} USD), **{aprob['cnt']} aprobado(s)** (${aprob['tot']:,.2f} USD), "
        f"**{fact['cnt']} facturado(s)** (${fact['tot']:,.2f} USD), **{rech['cnt']} rechazado(s)** y **{venc['cnt']} vencido(s)**."
    )

    return {
        "intent": "PEDIDOS_PREVENTAS",
        "titulo": "Auditoría de Pedidos, Preventas y Fuerza de Ventas",
        "resumen_ejecutivo": resumen,
        "kpis": kpis,
        "tablas": [{
            "titulo": "Pedidos Recientes y Prioritarios",
            "columnas": ["Pedido", "Cliente", "Vendedor", "Condición", "Total USD", "Vigencia", "Estado"],
            "filas": filas
        }] if filas else [],
        "alertas": alertas,
        "acciones_sugeridas": [
            {"texto": "Ir al Módulo de Pedidos", "accion": "navigate('pedidos')"},
            {"texto": "Ver Fuerza de Ventas", "accion": "navigate('fuerza-ventas')"}
        ]
    }


# ==============================================================================
# 10. AUDITORÍA DE GASTOS OPERATIVOS
# ==============================================================================
def auditar_gastos(conn):
    negocio, _, _, _ = _obtener_config(conn)
    cur = conn.cursor()
    cur.execute("""
        SELECT numero_gasto, categoria_gasto, beneficiario, concepto, monto_total_usd, fecha_emision, estado
        FROM gastos
        WHERE COALESCE(estado, 'ACTIVO') NOT IN ('anulada', 'ANULADO')
        ORDER BY id DESC
        LIMIT 20
    """)
    rows = cur.fetchall()
    tot_usd = round2(sum(float(r[4] or 0.0) for r in rows))

    filas = [
        {
            "numero": r[0] or "-",
            "categoria": r[1] or "General",
            "beneficiario": r[2] or "-",
            "concepto": r[3] or "-",
            "monto_usd": f"${float(r[4] or 0):,.2f}",
            "fecha": (r[5] or "-")[:10]
        }
        for r in rows
    ]

    kpis = [
        {"etiqueta": "Gastos Registrados", "valor": f"{len(rows)}", "tipo": "primary"},
        {"etiqueta": "Total Egresos Operativos", "valor": f"${tot_usd:,.2f} USD", "tipo": "warning" if tot_usd > 0 else "success"}
    ]
    alertas = [{
        "nivel": "info",
        "mensaje": f"Se contabilizan {len(rows)} gasto(s) operativo(s) activos por ${tot_usd:,.2f} USD." if rows else "No existen gastos operativos registrados aún."
    }]
    resumen = (
        f"En **{negocio}** se registran **{len(rows)} gasto(s) operativo(s)** activos "
        f"por un acumulado de **${tot_usd:,.2f} USD**."
    )

    return {
        "intent": "GASTOS_EGRESOS",
        "titulo": "Auditoría de Gastos Operativos y Egresos",
        "resumen_ejecutivo": resumen,
        "kpis": kpis,
        "tablas": [{
            "titulo": "Últimos Gastos Operativos Registrados",
            "columnas": ["N° Gasto", "Categoría", "Beneficiario", "Concepto", "Monto USD", "Fecha"],
            "filas": filas
        }] if filas else [],
        "alertas": alertas,
        "acciones_sugeridas": [
            {"texto": "Ir a Tesorería y Gastos", "accion": "navigate('tesoreria')"}
        ]
    }


# ==============================================================================
# 11. CONSULTA ESPECÍFICA POR PRODUCTO / SKU REAL
# ==============================================================================
def _buscar_producto_en_pregunta(conn, pregunta_norm):
    """Busca si el usuario mencionó el código SKU exacto o palabras distintivas de un producto real en BD."""
    if not pregunta_norm:
        return None
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, codigo, nombre FROM productos WHERE COALESCE(activo, 1) = 1")
        prods = cur.fetchall()
    except Exception:
        return None

    padded_q = f" {pregunta_norm} "
    q_tokens = set(pregunta_norm.split())
    stop = {"producto", "productos", "test", "para", "tavo", "preventa", "preventas", "devolucion", "reserva", "venta", "compra"}

    # 1. Prioridad máxima: coincidencia exacta de código SKU
    for pid, cod, _ in prods:
        cod_n = normalizar_texto(cod or "")
        if cod_n and f" {cod_n} " in padded_q:
            return (int(pid), True)

    # 2. Coincidencia por nombre distintivo del producto
    for pid, _, nom in prods:
        nom_n = normalizar_texto(nom or "")
        tokens = [t for t in nom_n.split() if len(t) >= 4 and t not in stop]
        if tokens and sum(1 for t in tokens if t in q_tokens) >= min(2, len(tokens)):
            return (int(pid), False)
    return None


def auditar_producto_especifico(conn, producto_id):
    diag = inventario_ia.diagnosticar_inventario_organico(conn)
    productos = diag.get("analisis_productos", [])
    prod = next((p for p in productos if int(p["id"]) == int(producto_id)), None)
    if not prod:
        return auditar_inventario(conn)

    kpis = [
        {"etiqueta": "Stock Disponible (Físico / Res.)", "valor": f"{prod['stock_disponible']:g} u ({prod['stock_actual']:g} / {prod['stock_comprometido']:g})", "tipo": "primary"},
        {"etiqueta": "Costo CPP / Precio", "valor": f"${prod['costo_cpp_usd']:,.2f} / ${prod['precio_venta_usd']:,.2f}", "tipo": "neutral"},
        {"etiqueta": "Margen Unitario (%)", "valor": f"${prod['margen_unitario_usd']:,.2f} ({prod['margen_porcentaje']:+.1f}%)", "tipo": "danger" if prod["margen_unitario_usd"] < 0 else "success"},
        {"etiqueta": "Rotación / Cobertura", "valor": f"{prod['consumo_diario_observado']:.2f} u/d | {int(prod['dias_cobertura']) if prod['dias_cobertura'] is not None else 'N/A'} d", "tipo": "info"}
    ]

    alertas = [
        {
            "nivel": "danger" if prod["color_alerta"] == "danger" else ("warning" if prod["color_alerta"] == "warning" else "success"),
            "mensaje": prod["diagnostico_precio"]
        },
        {
            "nivel": "warning" if prod["unidades_sugeridas_compra"] > 0 else "info",
            "mensaje": prod["accion_abastecimiento"]
        }
    ]

    resumen = (
        f"Ficha IA del ítem **[{prod['codigo']}] {prod['nombre']}**: cuenta con **{prod['stock_actual']:g} u físicas** "
        f"(**{prod['stock_comprometido']:g} u** comprometidas, **{prod['stock_disponible']:g} u** disponibles), "
        f"Costo CPP **${prod['costo_cpp_usd']:,.2f} USD** y Precio de Venta **${prod['precio_venta_usd']:,.2f} USD** "
        f"(margen **{prod['margen_porcentaje']:+.2f}%**). Valor patrimonial en inventario: **${prod['valor_patrimonial_usd']:,.2f} USD**."
    )

    return {
        "intent": "CONSULTA_PRODUCTO",
        "titulo": f"Auditoría IA de Producto: [{prod['codigo']}] {prod['nombre']}",
        "resumen_ejecutivo": resumen,
        "kpis": kpis,
        "tablas": [{
            "titulo": "Indicadores Auditados del Ítem",
            "columnas": ["Código", "Stock Disp.", "Mínimo", "Costo CPP", "Precio", "Margen %", "Salidas Hist.", "Abastecimiento"],
            "filas": [{
                "codigo": prod["codigo"],
                "stock_disp": f"{prod['stock_disponible']:g} u",
                "minimo": f"{prod['stock_minimo']:g} u",
                "cpp": f"${prod['costo_cpp_usd']:,.2f}",
                "precio": f"${prod['precio_venta_usd']:,.2f}",
                "margen": f"{prod['margen_porcentaje']:+.2f}%",
                "salidas": f"{prod['salidas_historicas_unidades']:g} u",
                "estado": prod["estado_abastecimiento"]
            }]
        }],
        "alertas": alertas,
        "acciones_sugeridas": [
            {"texto": f"Simular Precio de {prod['codigo']}", "accion": f"abrirSimuladorPrecioIA({int(prod['id'])})"},
            {"texto": "Abrir Diagnóstico IA Completo", "accion": "abrirDiagnosticoIaProductos()"}
        ]
    }


# ==============================================================================
# 12. AUDITORÍA DE ALERTAS CRÍTICAS CONSOLIDADAS (100% REALES)
# ==============================================================================
def auditar_alertas_criticas(conn):
    negocio, _, _, _ = _obtener_config(conn)
    diag_inv = inventario_ia.diagnosticar_inventario_organico(conn)
    cur = conn.cursor()

    alertas_consolidadas = []

    # 1. Inventario y márgenes reales
    for a in diag_inv.get("alertas_gerenciales", []):
        alertas_consolidadas.append({
            "modulo": "INVENTARIO / PRECIOS",
            "nivel": "danger" if a.get("nivel") == "CRITICO" else "warning",
            "mensaje": f"[{a.get('codigo')}] {a.get('mensaje')}",
            "producto_id": a.get("producto_id")
        })

    # 2. CXC vencidas reales
    d_cxc = _consultar_cxc_datos(conn)
    if d_cxc["vencidas_count"] > 0:
        alertas_consolidadas.append({
            "modulo": "CUENTAS POR COBRAR",
            "nivel": "danger",
            "mensaje": f"{d_cxc['vencidas_count']} factura(s) vencida(s) de clientes por ${d_cxc['total_vencido']:,.2f} USD."
        })

    # 3. CXP pendientes / vencidas reales
    d_cxp = _consultar_cxp_datos(conn)
    for cxp in d_cxp["deudas"]:
        alertas_consolidadas.append({
            "modulo": "CUENTAS POR PAGAR",
            "nivel": "danger" if cxp[9] and str(cxp[9])[:10] < date.today().isoformat() else "warning",
            "mensaje": f"Compromiso con {cxp[2]}: ${float(cxp[7]):,.2f} USD (Doc. #{cxp[4]})."
        })

    # 4. Pedidos pendientes por aprobar
    cur.execute("SELECT COUNT(*), COALESCE(SUM(total_usd), 0.0) FROM pedidos WHERE UPPER(COALESCE(estado, '')) = 'PENDIENTE'")
    p_row = cur.fetchone()
    if p_row and int(p_row[0] or 0) > 0:
        alertas_consolidadas.append({
            "modulo": "PEDIDOS / PREVENTAS",
            "nivel": "warning",
            "mensaje": f"{int(p_row[0])} pedido(s) PENDIENTE(S) de aprobación gerencial por ${float(p_row[1] or 0):,.2f} USD."
        })

    # 5. Estado real de caja (turnos_caja) y tesorería
    liq = _calcular_liquidez_real(conn)
    if not liq["turnos_abiertos"]:
        alertas_consolidadas.append({
            "modulo": "TESORERÍA / CAJAS",
            "nivel": "info",
            "mensaje": f"No hay turnos de caja abiertos actualmente. Tesorería disponible: ${liq['consolidado_usd']:,.2f} USD."
        })
    else:
        alertas_consolidadas.append({
            "modulo": "TESORERÍA / CAJAS",
            "nivel": "info",
            "mensaje": (
                f"{len(liq['turnos_abiertos'])} turno(s) de caja ABIERTO(S) "
                f"(Saldo en cajas: ${liq['cajas_equiv_usd']:,.2f} USD | "
                f"Tesorería general: ${liq['cuentas_equiv_usd']:,.2f} USD)."
            )
        })

    rojas = sum(1 for a in alertas_consolidadas if a["nivel"] == "danger")
    amarillas = sum(1 for a in alertas_consolidadas if a["nivel"] == "warning")
    info_n = sum(1 for a in alertas_consolidadas if a["nivel"] == "info")

    kpis = [
        {"etiqueta": "Alertas Críticas (Rojas)", "valor": f"{rojas}", "tipo": "danger" if rojas > 0 else "success"},
        {"etiqueta": "Alertas Operativas (Amarillas)", "valor": f"{amarillas}", "tipo": "warning" if amarillas > 0 else "neutral"},
        {"etiqueta": "Notificaciones Informativas", "valor": f"{info_n}", "tipo": "info"}
    ]

    filas_tabla = [
        {
            "modulo": a["modulo"],
            "severidad": "CRÍTICA" if a["nivel"] == "danger" else ("ADVERTENCIA" if a["nivel"] == "warning" else "INFO"),
            "detalle": a["mensaje"]
        }
        for a in alertas_consolidadas
    ]

    if rojas > 0:
        primera_roja = next(a for a in alertas_consolidadas if a["nivel"] == "danger")
        resumen = (
            f"En **{negocio}** se detectan **{rojas} alerta(s) crítica(s)** y **{amarillas} advertencia(s)** operativa(s). "
            f"Prioridad máxima: **{primera_roja['modulo']}** — {primera_roja['mensaje']}"
        )
    elif amarillas > 0:
        resumen = (
            f"**Cero alertas críticas rojas en {negocio}.** Se registran **{amarillas} observación(es) preventiva(s)** "
            f"(ej. {next(a['mensaje'] for a in alertas_consolidadas if a['nivel'] == 'warning')})."
        )
    else:
        resumen = f"**Operación saludable en {negocio}:** cero alertas críticas o advertencias pendientes al momento."

    acciones = [{"texto": "Ver Diagnóstico IA Inventario", "accion": "abrirDiagnosticoIaProductos()"}]
    if d_cxp["total_cxp"] > 0:
        acciones.append({"texto": "Revisar CXP", "accion": "navigate('cxp')"})
    if d_cxc["total_vencido"] > 0:
        acciones.append({"texto": "Gestionar CXC Vencidas", "accion": "navigate('cxc')"})
    if p_row and int(p_row[0] or 0) > 0:
        acciones.append({"texto": "Revisar Pedidos Pendientes", "accion": "navigate('pedidos')"})

    alertas_out = [{"nivel": a["nivel"], "mensaje": f"[{a['modulo']}] {a['mensaje']}"} for a in alertas_consolidadas]
    if not alertas_out:
        alertas_out.append({"nivel": "success", "mensaje": "Sin novedades críticas en ningún módulo del sistema."})

    return {
        "intent": "ALERTAS_CRITICAS",
        "titulo": "Centro de Notificaciones y Alertas Críticas Gerenciales",
        "resumen_ejecutivo": resumen,
        "kpis": kpis,
        "tablas": [{
            "titulo": "Matriz de Alertas Auditadas del Sistema",
            "columnas": ["Módulo Afectado", "Severidad", "Detalle de la Observación"],
            "filas": filas_tabla
        }] if filas_tabla else [],
        "alertas": alertas_out,
        "acciones_sugeridas": acciones
    }


# ==============================================================================
# 13. AYUDA Y CAPACIDADES DEL COPILOT
# ==============================================================================
def auditar_ayuda(conn=None):
    negocio = "su empresa"
    if conn is not None:
        try:
            negocio, _, _, _ = _obtener_config(conn)
        except Exception:
            pass

    kpis = [
        {"etiqueta": "Módulos Conectados en Vivo", "valor": "9 Áreas ERP", "tipo": "primary"},
        {"etiqueta": "Precisión Contable", "valor": "100% Determinista (SQL + CPP)", "tipo": "success"},
        {"etiqueta": "Seguridad de Datos", "valor": "READ-ONLY Certificado", "tipo": "info"}
    ]

    resumen = (
        f"Soy el **CFO Copilot Gerencial de {negocio}**. "
        f"Mis respuestas consultan en vivo la base de datos operativa real (facturación, pedidos, "
        f"Costo Promedio Ponderado CPP, turnos de caja y tesorería, CXC, CXP y gastos). Nunca invento ni hardcodeo datos."
    )

    capacidades = [
        {"modulo": "Tesorería y Cajas", "ejemplo": "¿Cuánto dinero tenemos en caja y bancos?"},
        {"modulo": "Ventas y Utilidad", "ejemplo": "¿Cuánto hemos vendido este mes y cuál es la utilidad bruta?"},
        {"modulo": "Pedidos / Preventas", "ejemplo": "¿Cuántos pedidos pendientes de aprobación hay?"},
        {"modulo": "Inventario Patrimonial", "ejemplo": "¿Cuál es el valor del inventario a costo CPP?"},
        {"modulo": "Rentabilidad y Precios", "ejemplo": "¿Qué productos tienen bajo margen o venta a pérdida?"},
        {"modulo": "CXC y CXP", "ejemplo": "¿Cuánto nos deben los clientes y cuánto debemos a proveedores?"},
        {"modulo": "Compras / Abastecimiento", "ejemplo": "¿Qué productos necesitan reposición o tienen sobrestock?"},
        {"modulo": "Balance Gerencial 360°", "ejemplo": "¿Cuál es el balance gerencial 360° de la empresa?"},
        {"modulo": "Alertas Críticas", "ejemplo": "¿Qué alertas o anomalías debo atender hoy?"}
    ]

    return {
        "intent": "AYUDA_CAPACIDADES",
        "titulo": "Capacidades y Consultas Auditables del CFO Copilot",
        "resumen_ejecutivo": resumen,
        "kpis": kpis,
        "tablas": [{
            "titulo": "Consultas Soportadas en Tiempo Real",
            "columnas": ["Área Financiera", "Ejemplo de Pregunta"],
            "filas": capacidades
        }],
        "alertas": [{
            "nivel": "info",
            "mensaje": "También puede consultar un producto específico indicando su código SKU o nombre."
        }],
        "acciones_sugeridas": [
            {"texto": "Consultar Balance 360°", "accion": "ejecutarPreguntaCopilot('¿Cuál es el balance gerencial 360°?')"},
            {"texto": "Ver Ventas del Mes", "accion": "ejecutarPreguntaCopilot('¿Cuánto hemos vendido este mes?')"},
            {"texto": "Ver Alertas Críticas", "accion": "ejecutarPreguntaCopilot('¿Hay alertas críticas hoy?')"}
        ]
    }


# ==============================================================================
# CLASIFICADOR SEMÁNTICO POR INTENCIÓN (INTENT ROUTER)
# ==============================================================================
def _match_any(texto_norm, keywords):
    tokens = set(texto_norm.split())
    padded = f" {texto_norm} "
    for kw in keywords:
        if " " in kw:
            if f" {kw} " in padded:
                return True
        elif kw in tokens:
            return True
    return False


def clasificar_intencion(pregunta_raw, conn=None):
    """
    Clasifica de manera determinista la intención financiera de la pregunta del usuario.
    Usa coincidencia exacta por palabra/frase para evitar falsos positivos por subcadenas (ej. venta vs preventa).
    """
    p = normalizar_texto(pregunta_raw)

    # 1. Consulta combinada explícita CXC + CXP
    pide_cxc = _match_any(p, ["cxc", "cobrar", "clientes", "deben", "deudor", "deudores", "cartera", "morosidad"])
    pide_cxp = _match_any(p, ["cxp", "pagar", "proveedor", "proveedores", "debemos"])
    if pide_cxc and pide_cxp:
        return "CUENTAS_COBRAR_Y_PAGAR"

    # 2. Alertas críticas
    if _match_any(p, ["alerta", "alertas", "urgente", "anomalia", "anomalias", "atender hoy", "peligro", "atencion"]):
        return "ALERTAS_CRITICAS"

    # 3. Balance Gerencial 360 (priorizar si pide balance explícito)
    if _match_any(p, ["balance", "360", "resumen ejecutivo", "situacion general", "estado general", "posicion financiera", "patrimonio neto", "solvencia", "como va el negocio", "salud financiera"]):
        return "BALANCE_360"

    # 4. Producto específico por código SKU exacto
    prod_match = None
    if conn is not None:
        prod_match = _buscar_producto_en_pregunta(conn, p)
        if prod_match is not None and prod_match[1] and not _match_any(p, ["simular", "todos", "inventario completo"]):
            return ("CONSULTA_PRODUCTO", prod_match[0])

    # 5. Rentabilidad y Riesgo de precios
    if _match_any(p, ["perdida", "venta a perdida", "margen", "margenes", "margen negativo", "rentable", "rentabilidad", "bajo costo", "destruccion", "precios bajos"]):
        return "RENTABILIDAD_RIESGO"

    # 6. Pedidos, preventas y vendedores (evaluar antes que ventas para no confundir preventa con venta)
    if _match_any(p, ["pedido", "pedidos", "preventa", "preventas", "vendedor", "vendedores", "comision", "comisiones", "comprometido"]):
        return "PEDIDOS_PREVENTAS"

    # 7. Ventas y facturación
    if _match_any(p, ["venta", "ventas", "vendido", "vendimos", "facturacion", "facturado", "facturas", "ingreso", "ingresos", "utilidad", "ganancia", "ticket"]):
        return "VENTAS_FACTURACION"

    # 8. Compras y abastecimiento
    if _match_any(p, ["comprar", "compras", "reorden", "reposicion", "abastecer", "abastecimiento", "sobrestock", "falta mercancia", "agotado", "quiebre"]):
        return "COMPRAS_ABASTECIMIENTO"

    # 9. Gastos operativos
    if _match_any(p, ["gasto", "gastos", "egreso", "egresos"]):
        return "GASTOS_EGRESOS"

    # 10. Liquidez y Tesorería
    if _match_any(p, ["liquidez", "caja", "cajas", "turno", "turnos", "banco", "bancos", "tesoreria", "efectivo", "plata", "dinero", "arqueo", "bolivares", "pesos", "dolares"]):
        return "LIQUIDEZ_TESORERIA"

    # 11. Cuentas por cobrar
    if pide_cxc or _match_any(p, ["creditos", "credito"]):
        return "CUENTAS_POR_COBRAR"

    # 12. Cuentas por pagar
    if pide_cxp or _match_any(p, ["deuda", "deudas"]):
        return "CUENTAS_POR_PAGAR"

    # 13. Inventario y stock patrimonial
    if _match_any(p, ["inventario", "stock", "mercancia", "existencia", "existencias", "productos", "catalogo", "costo cpp", "cpp", "valor inventario"]):
        return "INVENTARIO_PATRIMONIO"

    # 14. Producto por coincidencia de nombre distintivo
    if prod_match is not None:
        return ("CONSULTA_PRODUCTO", prod_match[0])

    # 15. Ayuda / Capacidades
    if _match_any(p, ["ayuda", "comandos", "que puedes hacer", "opciones", "como funciona", "capacidades", "hola", "buenos dias", "buenas tardes"]):
        return "AYUDA_CAPACIDADES"

    return "BALANCE_360"


# ==============================================================================
# PROCESADOR PRINCIPAL DE CONSULTAS GERENCIALES
# ==============================================================================
def procesar_consulta_gerencial(pregunta, conn=None):
    """
    Punto de entrada principal para el CFO Copilot.
    - Conexión READ-ONLY sin transacciones de escritura.
    - Cero mutaciones en inventario.db.
    """
    close_after = False
    if conn is None:
        conn = database.get_connection()
        close_after = True

    try:
        intent = clasificar_intencion(pregunta, conn=conn)

        if isinstance(intent, tuple) and intent[0] == "CONSULTA_PRODUCTO":
            respuesta = auditar_producto_especifico(conn, intent[1])
        elif intent == "LIQUIDEZ_TESORERIA":
            respuesta = auditar_liquidez(conn)
        elif intent == "INVENTARIO_PATRIMONIO":
            respuesta = auditar_inventario(conn)
        elif intent == "RENTABILIDAD_RIESGO":
            respuesta = auditar_rentabilidad_riesgo(conn)
        elif intent == "CUENTAS_POR_COBRAR":
            respuesta = auditar_cxc(conn)
        elif intent == "CUENTAS_POR_PAGAR":
            respuesta = auditar_cxp(conn)
        elif intent == "CUENTAS_COBRAR_Y_PAGAR":
            respuesta = auditar_cartera_cxc_cxp(conn)
        elif intent == "COMPRAS_ABASTECIMIENTO":
            respuesta = auditar_abastecimiento(conn)
        elif intent == "VENTAS_FACTURACION":
            respuesta = auditar_ventas_facturacion(conn, pregunta)
        elif intent == "PEDIDOS_PREVENTAS":
            respuesta = auditar_pedidos_preventas(conn)
        elif intent == "GASTOS_EGRESOS":
            respuesta = auditar_gastos(conn)
        elif intent == "BALANCE_360":
            respuesta = auditar_balance_360(conn)
        elif intent == "ALERTAS_CRITICAS":
            respuesta = auditar_alertas_criticas(conn)
        elif intent == "AYUDA_CAPACIDADES":
            respuesta = auditar_ayuda(conn)
        else:
            respuesta = auditar_balance_360(conn)

        respuesta["pregunta_original"] = pregunta
        respuesta["timestamp"] = datetime.now().isoformat()
        respuesta["status"] = "ok"
        return respuesta

    finally:
        if close_after:
            conn.close()


def obtener_sugerencias_copilot():
    """Retorna lista de preguntas frecuentes reales y generales para chips de 1-clic."""
    return [
        {"texto": "¿Cuál es la posición de liquidez en cajas y bancos?", "intent": "LIQUIDEZ_TESORERIA"},
        {"texto": "¿Cuánto hemos vendido este mes y cuál es la utilidad?", "intent": "VENTAS_FACTURACION"},
        {"texto": "¿Cuál es el balance gerencial 360° de la empresa?", "intent": "BALANCE_360"},
        {"texto": "¿Qué productos tienen bajo margen o venta a pérdida?", "intent": "RENTABILIDAD_RIESGO"},
        {"texto": "¿Cuál es el valor del inventario a costo CPP?", "intent": "INVENTARIO_PATRIMONIO"},
        {"texto": "¿Cuánto nos deben los clientes y cuánto debemos a proveedores?", "intent": "CUENTAS_COBRAR_Y_PAGAR"},
        {"texto": "¿Cuál es el estado de pedidos y preventas pendientes?", "intent": "PEDIDOS_PREVENTAS"},
        {"texto": "¿Qué productos necesitan reposición o tienen sobrestock?", "intent": "COMPRAS_ABASTECIMIENTO"},
        {"texto": "¿Hay alertas críticas que deba atender hoy?", "intent": "ALERTAS_CRITICAS"}
    ]
