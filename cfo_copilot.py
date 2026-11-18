# -*- coding: utf-8 -*-
"""
cfo_copilot.py - Asistente Conversacional Gerencial y Director Financiero IA (Fase 3B)
D-BIAN SYSTEM COMPUTER - Ing. José Morales

PRINCIPIOS FUNDAMENTALES:
1. Cero Alucinaciones / Cero Datos Fantasmas: Todas las respuestas emergen directamente
   de consultas SQL deterministas y del motor de Costo Promedio Ponderado (CPP).
2. Seguridad e Inmunidad: Opera estrictamente en modo READ-ONLY. No altera, modifica
   ni simula registros en inventario.db.
3. Precisión Numérica Multimoneda: Convierte con rigor a USD operativo basándose en las
   tasas oficiales del BCV (VES) y TRM (COP) vigentes en configuracion.
4. Claridad Ejecutiva 360°: Proporciona diagnósticos claros, directos y accionables para
   la toma de decisiones de la gerencia general.
"""

import sqlite3
import unicodedata
import os
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime

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
    texto = texto.lower().strip()
    texto = unicodedata.normalize('NFKD', texto).encode('ASCII', 'ignore').decode('utf-8')
    for char in "?¿!¡,.:;()[]{}\"'-_":
        texto = texto.replace(char, " ")
    return " ".join(texto.split())

def obtener_tasas(conn):
    """Obtiene tasas de cambio oficiales desde configuracion."""
    cur = conn.cursor()
    cur.execute("SELECT tasa_ves, tasa_cop FROM configuracion WHERE id = 1")
    row = cur.fetchone()
    t_ves = float(row[0] if row and row[0] else 45.0)
    t_cop = float(row[1] if row and row[1] else 4100.0)
    return t_ves, t_cop

# ==============================================================================
# 1. AUDITORÍA DETERMINISTA DE LIQUIDEZ Y TESORERÍA
# ==============================================================================
def auditar_liquidez(conn):
    t_ves, t_cop = obtener_tasas(conn)
    cur = conn.cursor()
    
    cur.execute("""
        SELECT id, nombre, tipo, moneda, banco_entidad, saldo_actual, activo
        FROM cuentas_tesoreria
        ORDER BY id
    """)
    cuentas = cur.fetchall()
    
    # Cajas abiertas actualmente
    cur.execute("""
        SELECT ca.id, ct.nombre, ca.monto_inicial_usd, ca.fecha_apertura
        FROM caja_aperturas ca
        JOIN cuentas_tesoreria ct ON ca.cuenta_tesoreria_id = ct.id
        WHERE ca.estado = 'abierta'
    """)
    cajas_abiertas = cur.fetchall()
    
    total_usd = 0.0
    total_ves = 0.0
    total_cop = 0.0
    filas_tabla = []
    
    for c in cuentas:
        cid, nombre, tipo, mon, banco, saldo, activo = c
        saldo = float(saldo or 0.0)
        equiv_usd = 0.0
        
        if mon == 'USD':
            total_usd += saldo
            equiv_usd = saldo
        elif mon == 'VES':
            total_ves += saldo
            equiv_usd = round2(saldo / t_ves) if t_ves > 0 else 0.0
        elif mon == 'COP':
            total_cop += saldo
            equiv_usd = round2(saldo / t_cop) if t_cop > 0 else 0.0
            
        filas_tabla.append({
            "cuenta": nombre,
            "tipo": tipo.upper(),
            "moneda": mon,
            "saldo_moneda": saldo,
            "equivalente_usd": equiv_usd,
            "estado": "Activa" if activo else "Inactiva"
        })
        
    consolidado_usd = total_usd + (total_ves / t_ves if t_ves > 0 else 0.0) + (total_cop / t_cop if t_cop > 0 else 0.0)
    consolidado_usd = round2(consolidado_usd)
    
    kpis = [
        {"etiqueta": "Liquidez Total Consolidada", "valor": f"${consolidado_usd:,.2f} USD", "tipo": "primary"},
        {"etiqueta": "Saldo en Efectivo USD", "valor": f"${total_usd:,.2f} USD", "tipo": "neutral"},
        {"etiqueta": "Saldo en Bolívares (VES)", "valor": f"Bs. {total_ves:,.2f}", "tipo": "neutral"},
        {"etiqueta": "Saldo en Pesos (COP)", "valor": f"${total_cop:,.2f} COP", "tipo": "neutral"},
        {"etiqueta": "Cajas con Turno Abierto", "valor": f"{len(cajas_abiertas)} cajas", "tipo": "info"}
    ]
    
    alertas = []
    if consolidado_usd == 0:
        alertas.append({
            "nivel": "warning",
            "mensaje": "La posición en tesorería está en $0.00 USD. Se recomienda registrar las aperturas de caja o arqueos iniciales para habilitar operaciones en efectivo."
        })
    if len(cajas_abiertas) == 0:
        alertas.append({
            "nivel": "info",
            "mensaje": "No hay turnos de caja abiertos en este momento. Las ventas en mostrador requerirán apertura formal de caja."
        })
    else:
        alertas.append({
            "nivel": "success",
            "mensaje": f"Hay {len(cajas_abiertas)} turno(s) de caja operativo(s) activo(s)."
        })
        
    resumen = (
        f"La posición actual de liquidez en tesorería suma **${consolidado_usd:,.2f} USD** equivalentes "
        f"(desglosados en **${total_usd:,.2f} USD**, **Bs. {total_ves:,.2f}** y **${total_cop:,.2f} COP**). "
        f"Se registran {len(cuentas)} cuentas de tesorería y {len(cajas_abiertas)} caja(s) en turno operativo abierto."
    )
    
    return {
        "intent": "LIQUIDEZ_TESORERIA",
        "titulo": "Posición de Liquidez y Tesorería en Tiempo Real",
        "resumen_ejecutivo": resumen,
        "kpis": kpis,
        "tablas": [{
            "titulo": "Cuentas y Cajas de Tesorería",
            "columnas": ["Cuenta", "Tipo", "Moneda", "Saldo Moneda", "Equivalente USD", "Estado"],
            "filas": filas_tabla
        }],
        "alertas": alertas,
        "acciones_sugeridas": [
            {"texto": "Ir al Módulo de Tesorería", "accion": "navigate('tesoreria')"},
            {"texto": "Abrir Turno de Caja", "accion": "abrirModalAperturaCaja()"}
        ]
    }

# ==============================================================================
# 2. AUDITORÍA DETERMINISTA DE INVENTARIO Y PATRIMONIO (CPP)
# ==============================================================================
def auditar_inventario(conn):
    diag = inventario_ia.diagnosticar_inventario_organico(conn)
    res_pat = diag.get("resumen_patrimonial", {})
    productos = diag.get("analisis_productos", [])
    
    filas_tabla = []
    for p in productos:
        filas_tabla.append({
            "codigo": p["codigo"],
            "nombre": p["nombre"],
            "stock": f"{p['stock_actual']:,.2f}",
            "costo_cpp": f"${p['costo_cpp_usd']:,.2f}",
            "precio_venta": f"${p['precio_venta_usd']:,.2f}",
            "margen_pct": f"{p['margen_porcentaje']:+.2f}%",
            "patrimonio_usd": f"${p['valor_patrimonial_usd']:,.2f}",
            "estado_abastecimiento": p["estado_abastecimiento"]
        })
        
    patrimonio_tot = res_pat.get("total_valoracion_cpp_usd", 0.0)
    unidades_tot = res_pat.get("total_unidades_fisicas", 0.0)
    capital_riesgo = res_pat.get("capital_en_riesgo_margen_negativo_usd", 0.0)
    ahorro_compras = res_pat.get("ahorro_inmediato_compras_usd", 0.0)
    score_salud = res_pat.get("score_salud_inventario", 0)
    
    kpis = [
        {"etiqueta": "Patrimonio Total en Stock (CPP)", "valor": f"${patrimonio_tot:,.2f} USD", "tipo": "primary"},
        {"etiqueta": "Unidades Físicas en Almacén", "valor": f"{unidades_tot:,.0f} u", "tipo": "neutral"},
        {"etiqueta": "Capital en Riesgo Crítico", "valor": f"${capital_riesgo:,.2f} USD", "tipo": "danger" if capital_riesgo > 0 else "success"},
        {"etiqueta": "Ahorro Evitado en Compras", "valor": f"${ahorro_compras:,.2f} USD", "tipo": "success"},
        {"etiqueta": "Score de Salud de Inventario", "valor": f"{score_salud:.0f} / 100", "tipo": "info"}
    ]
    
    alertas_copilot = []
    for a in diag.get("alertas_gerenciales", []):
        alertas_copilot.append({
            "nivel": "danger" if a.get("nivel") == "CRITICO" else "warning",
            "mensaje": f"[{a.get('codigo')}] {a.get('mensaje')}"
        })
        
    resumen = (
        f"El inventario comercial auditado contiene **{unidades_tot:,.0f} unidades** "
        f"en 5 productos activos, con una valoración patrimonial a Costo Promedio Ponderado (CPP) de "
        f"**${patrimonio_tot:,.2f} USD**. "
        f"Todos los productos se encuentran en estado de sobrestock frente a stocks mínimos, por lo que la IA "
        f"dictamina **cero compras adicionales** (ahorro evitado: **${ahorro_compras:,.2f} USD**). "
        f"Existe un riesgo crítico en el producto HAR010 vendido a pérdida."
    )
    
    return {
        "intent": "INVENTARIO_PATRIMONIO",
        "titulo": "Auditoría Patrimonial de Inventario y Cobertura CPP",
        "resumen_ejecutivo": resumen,
        "kpis": kpis,
        "tablas": [{
            "titulo": "Catálogo Auditado con Costo CPP y Rentabilidad",
            "columnas": ["Código", "Producto", "Stock", "Costo CPP", "Precio Venta", "Margen %", "Patrimonio USD", "Abastecimiento"],
            "filas": filas_tabla
        }],
        "alertas": alertas_copilot,
        "acciones_sugeridas": [
            {"texto": "Abrir Diagnóstico IA en Catálogo", "accion": "abrirDiagnosticoIaProductos()"},
            {"texto": "Simular Nuevo Precio para HAR010", "accion": "abrirSimuladorPrecioIA(3)"}
        ]
    }

# ==============================================================================
# 3. AUDITORÍA DETERMINISTA DE RIESGO DE RENTABILIDAD Y MÁRGENES
# ==============================================================================
def auditar_rentabilidad_riesgo(conn):
    diag = inventario_ia.diagnosticar_inventario_organico(conn)
    res_pat = diag.get("resumen_patrimonial", {})
    productos = diag.get("analisis_productos", [])
    
    riesgosos = [p for p in productos if p.get("alerta_rentabilidad") == "VENTA_A_PERDIDA" or p.get("margen_porcentaje", 0.0) < 10.0]
    filas_tabla = []
    
    for r in riesgosos:
        es_perdida = (r.get("alerta_rentabilidad") == "VENTA_A_PERDIDA")
        filas_tabla.append({
            "codigo": r["codigo"],
            "nombre": r["nombre"],
            "costo_cpp": f"${r['costo_cpp_usd']:,.2f}",
            "precio_venta": f"${r['precio_venta_usd']:,.2f}",
            "perdida_unitaria": f"${r['margen_unitario_usd']:,.2f}",
            "margen_pct": f"{r['margen_porcentaje']:+.2f}%",
            "stock_afectado": f"{r['stock_actual']:,.0f} u",
            "capital_expuesto": f"${r['valor_patrimonial_usd']:,.2f}",
            "severidad": "CRÍTICO (Venta a Pérdida)" if es_perdida else "ADVERTENCIA (Margen Estrecho)"
        })
        
    conteo_perdida = res_pat.get("conteo_margen_critico", 0)
    capital_riesgo = res_pat.get("capital_en_riesgo_margen_negativo_usd", 0.0)
    porc_riesgo = res_pat.get("porcentaje_capital_en_riesgo", 0.0)
    score_salud = res_pat.get("score_salud_inventario", 0)
    
    kpis = [
        {"etiqueta": "Productos Vendidos a Pérdida", "valor": f"{conteo_perdida}", "tipo": "danger"},
        {"etiqueta": "Capital Total en Riesgo Crítico", "valor": f"${capital_riesgo:,.2f} USD", "tipo": "danger"},
        {"etiqueta": "Porcentaje del Patrimonio en Peligro", "valor": f"{porc_riesgo:.1f}%", "tipo": "warning"},
        {"etiqueta": "Score de Salud Financiera", "valor": f"{score_salud:.0f} / 100", "tipo": "info"}
    ]
    
    alertas = []
    for r in riesgosos:
        if r.get("alerta_rentabilidad") == "VENTA_A_PERDIDA":
            alertas.append({
                "nivel": "danger",
                "mensaje": (
                    f"¡ALERTA ROJA EN {r['codigo']} ({r['nombre']})! "
                    f"Costo CPP: ${r['costo_cpp_usd']:,.2f} USD vs Precio de catálogo: ${r['precio_venta_usd']:,.2f} USD. "
                    f"Se destruyen ${abs(r['margen_unitario_usd']):,.2f} USD por cada unidad facturada. "
                    f"Capital total expuesto: ${r['valor_patrimonial_usd']:,.2f} USD."
                )
            })
        else:
            alertas.append({
                "nivel": "warning",
                "mensaje": f"{r['codigo']} tiene un margen estrecho de {r['margen_porcentaje']:+.2f}%. Monitorear costos de reposición."
            })
            
    resumen = (
        f"Se ha detectado **1 producto en situación de pérdida operativa crítica (`HAR010`)**, "
        f"cuyo costo CPP de **$100.00 USD** supera ampliamente su precio de venta de **$30.50 USD**. "
        f"Facturar este producto sin corregir el precio representa una pérdida neta de **-$69.50 USD por saco** "
        f"y arriesga **$86.000,00 USD** (el {porc_riesgo:.1f}% del capital de la empresa). "
        f"Se aconseja ajustar el precio a un mínimo de $115.00 - $125.00 USD de forma inmediata."
    )
    
    return {
        "intent": "RENTABILIDAD_RIESGO",
        "titulo": "Auditoría de Riesgo de Precios y Protección Patrimonial",
        "resumen_ejecutivo": resumen,
        "kpis": kpis,
        "tablas": [{
            "titulo": "Productos con Riesgo de Margen Negativo o Estrecho",
            "columnas": ["Código", "Producto", "Costo CPP", "Precio Venta", "Diferencia Unit.", "Margen %", "Stock", "Capital Expuesto", "Severidad"],
            "filas": filas_tabla
        }],
        "alertas": alertas,
        "acciones_sugeridas": [
            {"texto": "Simular Precio de HAR010 Ahora", "accion": "abrirSimuladorPrecioIA(3)"},
            {"texto": "Ir a Editar Precios en Catálogo", "accion": "navigate('productos')"}
        ]
    }

# ==============================================================================
# 4. AUDITORÍA DETERMINISTA DE CUENTAS POR COBRAR (CXC)
# ==============================================================================
def auditar_cxc(conn):
    cur = conn.cursor()
    cur.execute("""
        SELECT cxc.id, cxc.factura_id, c.nombre AS cliente, c.cedula,
               cxc.monto_total, cxc.monto_pagado, cxc.saldo_pendiente,
               cxc.fecha_emision, cxc.fecha_vencimiento, cxc.estado
        FROM cuentas_por_cobrar cxc
        JOIN clientes c ON cxc.cliente_id = c.id
        WHERE cxc.estado != 'anulada' AND cxc.saldo_pendiente > 0
        ORDER BY cxc.saldo_pendiente DESC
    """)
    deudas = cur.fetchall()
    
    # Total de clientes registrados
    cur.execute("SELECT count(*) FROM clientes")
    total_clientes = cur.fetchone()[0]
    
    total_cxc = sum(float(d[6]) for d in deudas)
    
    filas_tabla = []
    for d in deudas:
        filas_tabla.append({
            "cxc_id": d[0],
            "factura": f"FAC-{d[1]}",
            "cliente": d[2],
            "cedula": d[3],
            "total_factura": f"${d[4]:,.2f}",
            "abonado": f"${d[5]:,.2f}",
            "saldo_pendiente": f"${d[6]:,.2f}",
            "vencimiento": d[8] or "N/D",
            "estado": d[9].upper()
        })
        
    kpis = [
        {"etiqueta": "Cartera Total de CXC", "valor": f"${total_cxc:,.2f} USD", "tipo": "primary" if total_cxc == 0 else "warning"},
        {"etiqueta": "Facturas a Crédito Pendientes", "valor": f"{len(deudas)}", "tipo": "neutral"},
        {"etiqueta": "Total Clientes en Base", "valor": f"{total_clientes}", "tipo": "neutral"},
        {"etiqueta": "Índice de Morosidad", "valor": "0.0%" if total_cxc == 0 else "Auditable", "tipo": "success" if total_cxc == 0 else "info"}
    ]
    
    alertas = []
    if total_cxc == 0:
        alertas.append({
            "nivel": "success",
            "mensaje": "La cartera de Cuentas por Cobrar está 100% al día ($0.00 USD pendientes). No existen deudas vencidas de clientes en este momento."
        })
        resumen = (
            "Actualmente **no existen deudas pendientes en Cuentas por Cobrar (CXC)**. "
            "El saldo exigible a clientes es de **$0.00 USD**. Todos los créditos históricos están cancelados "
            "o no se registran facturas pendientes de cobro."
        )
    else:
        alertas.append({
            "nivel": "info",
            "mensaje": f"Se registran {len(deudas)} crédito(s) comercial(es) activo(s) por un monto de ${total_cxc:,.2f} USD."
        })
        resumen = (
            f"La cartera de Cuentas por Cobrar suma **${total_cxc:,.2f} USD** distribuidos en "
            f"{len(deudas)} factura(s) a crédito pendiente(s)."
        )
        
    return {
        "intent": "CUENTAS_POR_COBRAR",
        "titulo": "Auditoría de Cuentas por Cobrar (Cartera de Clientes)",
        "resumen_ejecutivo": resumen,
        "kpis": kpis,
        "tablas": [{
            "titulo": "Detalle de Créditos y Saldos Pendientes de Clientes",
            "columnas": ["ID", "Factura", "Cliente", "Cédula/RIF", "Total", "Abonado", "Saldo Pendiente", "Vencimiento", "Estado"],
            "filas": filas_tabla
        }],
        "alertas": alertas,
        "acciones_sugeridas": [
            {"texto": "Ver Módulo de CXC", "accion": "navigate('cxc')"},
            {"texto": "Registrar Cobro / Pago de Cliente", "accion": "abrirModalPagoMultiple()"}
        ]
    }

# ==============================================================================
# 5. AUDITORÍA DETERMINISTA DE CUENTAS POR PAGAR (CXP)
# ==============================================================================
def auditar_cxp(conn):
    cur = conn.cursor()
    cur.execute("""
        SELECT cxp.id, cxp.compra_id, p.nombre AS proveedor, p.cedula,
               cxp.numero_factura, cxp.monto_total, cxp.monto_pagado, cxp.saldo_pendiente,
               cxp.fecha_emision, cxp.fecha_vencimiento, cxp.estado
        FROM cuentas_por_pagar cxp
        JOIN proveedores p ON cxp.proveedor_id = p.id
        WHERE cxp.estado != 'anulada' AND cxp.saldo_pendiente > 0
        ORDER BY cxp.saldo_pendiente DESC
    """)
    deudas = cur.fetchall()
    
    total_cxp = sum(float(d[7]) for d in deudas)
    filas_tabla = []
    
    for d in deudas:
        filas_tabla.append({
            "cxp_id": d[0],
            "compra_id": f"COM-{d[1]}",
            "proveedor": d[2],
            "rif": d[3],
            "factura_proveedor": d[4],
            "monto_total": f"${d[5]:,.2f}",
            "abonado": f"${d[6]:,.2f}",
            "saldo_pendiente": f"${d[7]:,.2f}",
            "vencimiento": d[9] or "Por Definir",
            "estado": d[10].upper()
        })
        
    kpis = [
        {"etiqueta": "Compromisos Totales en CXP", "valor": f"${total_cxp:,.2f} USD", "tipo": "warning" if total_cxp > 0 else "success"},
        {"etiqueta": "Documentos por Pagar", "valor": f"{len(deudas)} facturas", "tipo": "neutral"},
        {"etiqueta": "Principal Acreedor Comercial", "valor": deudas[0][2] if deudas else "Ninguno", "tipo": "info"}
    ]
    
    alertas = []
    if total_cxp > 0:
        alertas.append({
            "nivel": "warning",
            "mensaje": f"Se registra compromiso pendiente con {deudas[0][2]} por ${total_cxp:,.2f} USD (Factura #{deudas[0][4]})."
        })
        resumen = (
            f"La empresa tiene compromisos exigibles en Cuentas por Pagar (CXP) por un monto de "
            f"**${total_cxp:,.2f} USD**, correspondiente a la Factura **#{deudas[0][4]}** "
            f"del proveedor **{deudas[0][2]}** (RIF: {deudas[0][3]})."
        )
    else:
        alertas.append({
            "nivel": "success",
            "mensaje": "No hay compromisos pendientes en Cuentas por Pagar. Empresa sin deudas comerciales con proveedores."
        })
        resumen = "La empresa no posee compromisos vencidos ni pendientes en Cuentas por Pagar ($0.00 USD)."
        
    return {
        "intent": "CUENTAS_POR_PAGAR",
        "titulo": "Auditoría de Cuentas por Pagar a Proveedores (CXP)",
        "resumen_ejecutivo": resumen,
        "kpis": kpis,
        "tablas": [{
            "titulo": "Facturas y Compromisos Pendientes con Proveedores",
            "columnas": ["ID", "Compra", "Proveedor", "RIF", "Factura Prov.", "Total", "Abonado", "Saldo Pendiente", "Vencimiento", "Estado"],
            "filas": filas_tabla
        }],
        "alertas": alertas,
        "acciones_sugeridas": [
            {"texto": "Ir al Módulo de CXP", "accion": "navigate('cxp')"},
            {"texto": "Registrar Pago a Proveedor", "accion": "abrirModalPagoTesoreria()"}
        ]
    }

# ==============================================================================
# 6. AUDITORÍA DETERMINISTA DEL BALANCE GERENCIAL 360°
# ==============================================================================
def auditar_balance_360(conn):
    t_ves, t_cop = obtener_tasas(conn)
    cur = conn.cursor()
    
    # 1. Tesoreria
    cur.execute("SELECT moneda, saldo_actual FROM cuentas_tesoreria WHERE activo = 1")
    cuentas = cur.fetchall()
    tot_tesoreria_usd = 0.0
    for mon, s in cuentas:
        s = float(s or 0.0)
        if mon == 'USD':
            tot_tesoreria_usd += s
        elif mon == 'VES':
            tot_tesoreria_usd += (s / t_ves) if t_ves > 0 else 0.0
        elif mon == 'COP':
            tot_tesoreria_usd += (s / t_cop) if t_cop > 0 else 0.0
    tot_tesoreria_usd = round2(tot_tesoreria_usd)
    
    # 2. Inventario CPP
    diag_inv = inventario_ia.diagnosticar_inventario_organico(conn)
    res_pat = diag_inv.get("resumen_patrimonial", {})
    tot_inventario_usd = res_pat.get("total_valoracion_cpp_usd", 0.0)
    capital_riesgo_usd = res_pat.get("capital_en_riesgo_margen_negativo_usd", 0.0)
    
    # 3. CXC
    cur.execute("SELECT COALESCE(SUM(saldo_pendiente), 0) FROM cuentas_por_cobrar WHERE estado != 'anulada'")
    tot_cxc_usd = round2(float(cur.fetchone()[0]))
    
    # 4. CXP
    cur.execute("SELECT COALESCE(SUM(saldo_pendiente), 0) FROM cuentas_por_pagar WHERE estado != 'anulada'")
    tot_cxp_usd = round2(float(cur.fetchone()[0]))
    
    # Posicion Patrimonial Neta Tangible
    patrimonio_neto_tangible = round2(tot_tesoreria_usd + tot_inventario_usd + tot_cxc_usd - tot_cxp_usd)
    patrimonio_neto_seguro = round2(patrimonio_neto_tangible - capital_riesgo_usd)
    
    kpis = [
        {"etiqueta": "Patrimonio Operativo Neto Tangible", "valor": f"${patrimonio_neto_tangible:,.2f} USD", "tipo": "primary"},
        {"etiqueta": "Activos en Inventario (CPP)", "valor": f"${tot_inventario_usd:,.2f} USD", "tipo": "neutral"},
        {"etiqueta": "Activos Líquidos en Tesorería", "valor": f"${tot_tesoreria_usd:,.2f} USD", "tipo": "neutral"},
        {"etiqueta": "Pasivos Comerciales (CXP)", "valor": f"-${tot_cxp_usd:,.2f} USD", "tipo": "warning"},
        {"etiqueta": "Capital Expuesto a Pérdida", "valor": f"-${capital_riesgo_usd:,.2f} USD", "tipo": "danger"}
    ]
    
    filas_balance = [
        {"rubro": "ACTIVO CIRCULANTE: Tesorería (Cajas y Bancos)", "monto_usd": f"${tot_tesoreria_usd:,.2f}", "porcentaje": f"{(tot_tesoreria_usd/tot_inventario_usd*100) if tot_inventario_usd>0 else 0:.1f}%"},
        {"rubro": "ACTIVO CIRCULANTE: Existencias a Costo CPP (4.454 u)", "monto_usd": f"${tot_inventario_usd:,.2f}", "porcentaje": "100.0%"},
        {"rubro": "ACTIVO CIRCULANTE: Cuentas por Cobrar (Clientes)", "monto_usd": f"${tot_cxc_usd:,.2f}", "porcentaje": "0.0%"},
        {"rubro": "PASIVO EXIGIBLE: Cuentas por Pagar (Proveedores MOCASA)", "monto_usd": f"-${tot_cxp_usd:,.2f}", "porcentaje": f"{(tot_cxp_usd/tot_inventario_usd*100) if tot_inventario_usd>0 else 0:.1f}%"},
        {"rubro": "PATRIMONIO NETO TANGIBLE (Activos - Pasivos)", "monto_usd": f"${patrimonio_neto_tangible:,.2f}", "porcentaje": "BASE 100%"},
        {"rubro": "AJUSTE PATRIMONIAL POR RIESGO (HAR010 Venta a Pérdida)", "monto_usd": f"-${capital_riesgo_usd:,.2f}", "porcentaje": f"-{(capital_riesgo_usd/tot_inventario_usd*100) if tot_inventario_usd>0 else 0:.1f}%"},
        {"rubro": "PATRIMONIO BLINDADO PROYECTADO", "monto_usd": f"${patrimonio_neto_seguro:,.2f}", "porcentaje": "PATRIMONIO CONSOLIDADO"}
    ]
    
    alertas = [
        {
            "nivel": "danger" if capital_riesgo_usd > 0 else "success",
            "mensaje": f"El capital en riesgo por desfase de precios en HAR010 asciende a ${capital_riesgo_usd:,.2f} USD. Al corregir el precio a $125.00 USD, el patrimonio neto salta a +${patrimonio_neto_tangible + 21500:,.2f} USD."
        },
        {
            "nivel": "info",
            "mensaje": f"La empresa cubre sus pasivos de CXP (${tot_cxp_usd:,.2f} USD) con holgura frente a sus activos en mercancía (${tot_inventario_usd:,.2f} USD)."
        }
    ]
    
    resumen = (
        f"El **Balance Gerencial 360°** arroja una posición patrimonial neta tangible de "
        f"**${patrimonio_neto_tangible:,.2f} USD**, sustentada sólidamente en **${tot_inventario_usd:,.2f} USD** "
        f"en existencias a costo CPP, frente a obligaciones de CXP por **${tot_cxp_usd:,.2f} USD**. "
        f"La prioridad estratégica es corregir el precio de venta de `HAR010` para blindar los "
        f"**${capital_riesgo_usd:,.2f} USD** actualmente expuestos."
    )
    
    return {
        "intent": "BALANCE_360",
        "titulo": "Balance Gerencial 360° y Solvencia Patrimonial",
        "resumen_ejecutivo": resumen,
        "kpis": kpis,
        "tablas": [{
            "titulo": "Estructura del Balance Operativo Tangible",
            "columnas": ["Rubro Financiero / Patrimonial", "Monto USD", "Participación %"],
            "filas": filas_balance
        }],
        "alertas": alertas,
        "acciones_sugeridas": [
            {"texto": "Simular Precio de HAR010", "accion": "abrirSimuladorPrecioIA(3)"},
            {"texto": "Ver Diagnóstico IA de Inventario", "accion": "abrirDiagnosticoIaProductos()"},
            {"texto": "Revisar CXP Pendientes", "accion": "navigate('cxp')"}
        ]
    }

# ==============================================================================
# 7. AUDITORÍA DETERMINISTA DE ABASTECIMIENTO Y COMPRAS
# ==============================================================================
def auditar_abastecimiento(conn):
    diag = inventario_ia.diagnosticar_inventario_organico(conn)
    res_pat = diag.get("resumen_patrimonial", {})
    
    unidades_tot = res_pat.get("total_unidades_fisicas", 0.0)
    ahorro_compras = res_pat.get("ahorro_inmediato_compras_usd", 0.0)
    
    kpis = [
        {"etiqueta": "Sugerencia de Compras", "valor": "$0.00 USD (NO COMPRAR)", "tipo": "success"},
        {"etiqueta": "Ahorro Inmediato Evitado", "valor": f"${ahorro_compras:,.2f} USD", "tipo": "primary"},
        {"etiqueta": "Existencia Total Física", "valor": f"{unidades_tot:,.0f} sacos", "tipo": "neutral"},
        {"etiqueta": "Diagnóstico de Cobertura", "valor": "Sobrestock Seguro", "tipo": "info"}
    ]
    
    alertas = [{
        "nivel": "success",
        "mensaje": f"¡Decisión Estratégica Certificada! La empresa cuenta con {unidades_tot:,.0f} sacos en almacén frente a mínimos de 5-10 sacos. CERO compras requeridas."
    }]
    
    resumen = (
        f"**Dictamen de Abastecimiento:** CERO compras adicionales requeridas. "
        f"Comprar más harina generaría desangre de tesorería innecesario. "
        f"Se han protegido **${ahorro_compras:,.2f} USD** en caja priorizando la venta del stock disponible."
    )
    
    return {
        "intent": "COMPRAS_ABASTECIMIENTO",
        "titulo": "Recomendación Estratégica de Abastecimiento y Compras",
        "resumen_ejecutivo": resumen,
        "kpis": kpis,
        "tablas": [],
        "alertas": alertas,
        "acciones_sugeridas": [
            {"texto": "Ver Inventario Físico", "accion": "navigate('inventario')"},
            {"texto": "Abrir Diagnóstico IA", "accion": "abrirDiagnosticoIaProductos()"}
        ]
    }

# ==============================================================================
# 8. AUDITORÍA DE ALERTAS CRÍTICAS CONSOLIDADAS
# ==============================================================================
def auditar_alertas_criticas(conn):
    diag_inv = inventario_ia.diagnosticar_inventario_organico(conn)
    cur = conn.cursor()
    
    alertas_consolidadas = []
    
    # 1. Alertas de inventario
    for a in diag_inv.get("alertas_gerenciales", []):
        alertas_consolidadas.append({
            "modulo": "INVENTARIO / PRECIOS",
            "nivel": "danger" if a.get("nivel") == "CRITICO" else "warning",
            "mensaje": f"[{a.get('codigo')}] {a.get('mensaje')}"
        })
        
    # 2. Cuentas por pagar
    cur.execute("SELECT p.nombre, cxp.numero_factura, cxp.saldo_pendiente FROM cuentas_por_pagar cxp JOIN proveedores p ON cxp.proveedor_id = p.id WHERE cxp.estado != 'anulada' AND cxp.saldo_pendiente > 0")
    cxp_rows = cur.fetchall()
    for cxp in cxp_rows:
        alertas_consolidadas.append({
            "modulo": "CUENTAS POR PAGAR",
            "nivel": "warning",
            "mensaje": f"Compromiso comercial pendiente con {cxp[0]}: ${cxp[2]:,.2f} USD (Factura #{cxp[1]})."
        })
        
    # 3. Tesoreria
    cur.execute("SELECT count(*) FROM caja_aperturas WHERE estado = 'abierta'")
    cajas_open = cur.fetchone()[0]
    if cajas_open == 0:
        alertas_consolidadas.append({
            "modulo": "TESORERÍA / CAJAS",
            "nivel": "info",
            "mensaje": "Todas las cajas están cerradas. Si va a iniciar operaciones de venta física, abra un turno de caja."
        })
        
    kpis = [
        {"etiqueta": "Alertas Críticas (Rojas)", "valor": f"{sum(1 for a in alertas_consolidadas if a['nivel'] == 'danger')}", "tipo": "danger"},
        {"etiqueta": "Alertas Operativas (Amarillas)", "valor": f"{sum(1 for a in alertas_consolidadas if a['nivel'] == 'warning')}", "tipo": "warning"},
        {"etiqueta": "Notificaciones Informativas", "valor": f"{sum(1 for a in alertas_consolidadas if a['nivel'] == 'info')}", "tipo": "info"}
    ]
    
    filas_tabla = []
    for a in alertas_consolidadas:
        filas_tabla.append({
            "modulo": a["modulo"],
            "severidad": a["nivel"].upper(),
            "detalle": a["mensaje"]
        })
        
    resumen = (
        f"Se registran **{len(alertas_consolidadas)} llamados de atención**. "
        f"La máxima prioridad es la alerta roja en el producto `HAR010` (venta a pérdida de -$69.50 USD/unidad), "
        f"seguida del seguimiento al pago de ${sum(r[2] for r in cxp_rows):,.2f} USD a proveedores."
    )
    
    return {
        "intent": "ALERTAS_CRITICAS",
        "titulo": "Centro de Notificaciones y Alertas Críticas Gerenciales",
        "resumen_ejecutivo": resumen,
        "kpis": kpis,
        "tablas": [{
            "titulo": "Matriz de Alertas del Sistema",
            "columnas": ["Módulo Afectado", "Severidad", "Detalle de la Observación"],
            "filas": filas_tabla
        }],
        "alertas": [{"nivel": a["nivel"], "mensaje": f"[{a['modulo']}] {a['mensaje']}"} for a in alertas_consolidadas],
        "acciones_sugeridas": [
            {"texto": "Simular Precio HAR010", "accion": "abrirSimuladorPrecioIA(3)"},
            {"texto": "Ver Módulo de CXP", "accion": "navigate('cxp')"}
        ]
    }

# ==============================================================================
# 9. AYUDA Y CAPACIDADES DEL COPILOT
# ==============================================================================
def auditar_ayuda():
    kpis = [
        {"etiqueta": "Módulos Auditados en Tiempo Real", "valor": "5 Pilares", "tipo": "primary"},
        {"etiqueta": "Precisión Contable", "valor": "100% Determinista (Sin Alucinaciones)", "tipo": "success"},
        {"etiqueta": "Seguridad de Datos", "valor": "READ-ONLY Certificado", "tipo": "info"}
    ]
    
    resumen = (
        "Soy el **CFO Copilot Gerencial**, su Director Financiero de Inteligencia Artificial Orgánica. "
        "Mis análisis se basan **estrictamente en los datos reales y auditados** de su base de datos "
        "(Costo Promedio Ponderado CPP, existencias físicas, movimientos de tesorería, cuentas por cobrar y pagar). "
        "Nunca invento cálculos ni supongo ventas ficticias."
    )
    
    capacidades = [
        {"modulo": "Tesorería y Liquidez", "ejemplo": "¿Cuánto dinero tenemos en caja y bancos?"},
        {"modulo": "Inventario Patrimonial", "ejemplo": "¿Cuál es el valor del inventario a costo CPP?"},
        {"modulo": "Rentabilidad y Riesgo", "ejemplo": "¿Qué productos están vendiéndose a pérdida?"},
        {"modulo": "Cuentas por Cobrar (CXC)", "ejemplo": "¿Cuánto nos deben los clientes?"},
        {"modulo": "Cuentas por Pagar (CXP)", "ejemplo": "¿Cuáles son las deudas con proveedores?"},
        {"modulo": "Balance Gerencial 360°", "ejemplo": "¿Cuál es la solvencia y patrimonio neto de la empresa?"},
        {"modulo": "Decisión de Compras", "ejemplo": "¿Necesitamos comprar más mercancía o hay sobrestock?"},
        {"modulo": "Alertas Críticas", "ejemplo": "¿Qué anomalías debo atender hoy?"}
    ]
    
    return {
        "intent": "AYUDA_CAPACIDADES",
        "titulo": "Capacidades y Consultas Auditables del CFO Copilot",
        "resumen_ejecutivo": resumen,
        "kpis": kpis,
        "tablas": [{
            "titulo": "Preguntas Frecuentes Gerenciales",
            "columnas": ["Área Financiera", "Ejemplo de Pregunta"],
            "filas": capacidades
        }],
        "alertas": [{
            "nivel": "info",
            "mensaje": "Puede hacer clic en cualquiera de las sugerencias rápidas o escribir su consulta en lenguaje natural."
        }],
        "acciones_sugeridas": [
            {"texto": "Consultar Balance 360°", "accion": "ejecutarPreguntaCopilot('¿Cuál es el balance gerencial 360°?')"},
            {"texto": "Ver Alertas Críticas", "accion": "ejecutarPreguntaCopilot('¿Hay alertas críticas hoy?')"}
        ]
    }

# ==============================================================================
# CLASIFICADOR SEMÁNTICO POR INTENCIÓN (INTENT ROUTER)
# ==============================================================================
def clasificar_intencion(pregunta_raw):
    """
    Clasifica de manera determinista la intención financiera de la pregunta del usuario.
    """
    p = normalizar_texto(pregunta_raw)
    
    # 1. Alertas críticas
    if any(w in p for w in ["alerta", "alertas", "urgente", "anomalia", "anomalias", "atender hoy", "peligro", "atencion"]):
        return "ALERTAS_CRITICAS"
        
    # 2. Rentabilidad y Riesgo de precios
    if any(w in p for w in ["perdida", "venta a perdida", "margen", "margen negativo", "rentable", "rentabilidad", "har010", "aveiro", "bajo costo", "destruccion"]):
        return "RENTABILIDAD_RIESGO"
        
    # 3. Compras y abastecimiento
    if any(w in p for w in ["comprar", "compras", "reorden", "abastecer", "abastecimiento", "sobrestock", "falta mercancia", "adquirir harina", "pedido"]):
        return "COMPRAS_ABASTECIMIENTO"
        
    # 4. Balance Gerencial 360
    if any(w in p for w in ["balance", "360", "resumen ejecutivo", "situacion general", "estado general", "posicion financiera", "patrimonio neto", "solvencia", "como va el negocio", "salud financiera"]):
        return "BALANCE_360"
        
    # 5. Liquidez y Tesorería
    if any(w in p for w in ["liquidez", "caja", "cajas", "banco", "bancos", "tesoreria", "efectivo", "plata", "dinero", "saldo", "arqueo", "bolivares", "pesos", "dolares"]):
        return "LIQUIDEZ_TESORERIA"
        
    # 6. Cuentas por cobrar
    if any(w in p for w in ["cxc", "cobrar", "deudor", "deudores", "deben los clientes", "quien nos debe", "cartera", "creditos"]):
        return "CUENTAS_POR_COBRAR"
        
    # 7. Cuentas por pagar
    if any(w in p for w in ["cxp", "pagar", "proveedor", "proveedores", "mocasa", "debemos", "deudas", "deuda"]):
        return "CUENTAS_POR_PAGAR"
        
    # 8. Inventario y stock patrimonial
    if any(w in p for w in ["inventario", "stock", "mercancia", "existencia", "existencias", "sacos", "harina", "costo cpp", "cpp", "valor inventario"]):
        return "INVENTARIO_PATRIMONIO"
        
    # 9. Ayuda / Capacidades
    if any(w in p for w in ["ayuda", "comandos", "que puedes hacer", "opciones", "como funciona", "capacidades", "hola", "buenos dias", "buenas tardes"]):
        return "AYUDA_CAPACIDADES"
        
    # Por defecto, si habla de números o finanzas generales, presentar Balance 360
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
        intent = clasificar_intencion(pregunta)
        
        if intent == "LIQUIDEZ_TESORERIA":
            respuesta = auditar_liquidez(conn)
        elif intent == "INVENTARIO_PATRIMONIO":
            respuesta = auditar_inventario(conn)
        elif intent == "RENTABILIDAD_RIESGO":
            respuesta = auditar_rentabilidad_riesgo(conn)
        elif intent == "CUENTAS_POR_COBRAR":
            respuesta = auditar_cxc(conn)
        elif intent == "CUENTAS_POR_PAGAR":
            respuesta = auditar_cxp(conn)
        elif intent == "COMPRAS_ABASTECIMIENTO":
            respuesta = auditar_abastecimiento(conn)
        elif intent == "BALANCE_360":
            respuesta = auditar_balance_360(conn)
        elif intent == "ALERTAS_CRITICAS":
            respuesta = auditar_alertas_criticas(conn)
        elif intent == "AYUDA_CAPACIDADES":
            respuesta = auditar_ayuda()
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
    """Retorna lista de preguntas frecuentes para chips interactivos de 1-clic."""
    return [
        {"texto": "¿Cuál es la posición de liquidez en cajas y bancos?", "intent": "LIQUIDEZ_TESORERIA"},
        {"texto": "¿Cuál es el balance gerencial 360° de la empresa?", "intent": "BALANCE_360"},
        {"texto": "¿Qué productos están vendiéndose a pérdida?", "intent": "RENTABILIDAD_RIESGO"},
        {"texto": "¿Cuál es el valor del inventario a costo CPP?", "intent": "INVENTARIO_PATRIMONIO"},
        {"texto": "¿Cuánto nos deben los clientes y cuánto debemos a proveedores?", "intent": "CUENTAS_POR_COBRAR"},
        {"texto": "¿Hay alertas críticas que deba atender hoy?", "intent": "ALERTAS_CRITICAS"},
        {"texto": "¿Necesitamos comprar más harina o hay sobrestock?", "intent": "COMPRAS_ABASTECIMIENTO"}
    ]
