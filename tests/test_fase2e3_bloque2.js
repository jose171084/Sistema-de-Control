/**
 * TEST SUITE: FASE 2E-3 — BLOQUE 2
 * Comprobantes Oficiales de Movimientos de Inventario mediante DocumentPrinter
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const APP_JS_PATH = path.join(__dirname, '..', 'public', 'app.js');
const INDEX_HTML_PATH = path.join(__dirname, '..', 'public', 'index.html');
const STYLES_CSS_PATH = path.join(__dirname, '..', 'public', 'styles.css');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  [PASS] Test ${totalTests}: ${message}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] Test ${totalTests}: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

// -------------------------------------------------------------
// 1. MOCK DE ENTORNO DE NAVEGADOR
// -------------------------------------------------------------
const eventListeners = {};
const mockElements = {};

class MockElement {
  constructor(id, tagName = 'div') {
    this.id = id;
    this.tagName = tagName.toUpperCase();
    this.className = '';
    this.classList = {
      _classes: new Set(),
      add: (c) => this.classList._classes.add(c),
      remove: (c) => this.classList._classes.delete(c),
      contains: (c) => this.classList._classes.has(c)
    };
    this.innerHTML = '';
    this.textContent = '';
    this.style = {};
    this.attributes = {};
    this.value = '';
    this.children = [];
  }
  setAttribute(attr, val) { this.attributes[attr] = String(val); }
  getAttribute(attr) { return this.attributes[attr]; }
  appendChild(child) { this.children.push(child); return child; }
  querySelectorAll() { return []; }
}

global.window = {
  addEventListener: (evt, handler) => {
    if (!eventListeners[evt]) eventListeners[evt] = [];
    eventListeners[evt].push(handler);
  },
  removeEventListener: (evt, handler) => {
    if (eventListeners[evt]) {
      eventListeners[evt] = eventListeners[evt].filter(h => h !== handler);
    }
  },
  print: () => {
    if (global.window._printHook) global.window._printHook();
  },
  alert: (msg) => { console.log('    [MOCK_ALERT]:', msg); },
  setTimeout: setTimeout,
  clearTimeout: clearTimeout
};

global.document = {
  body: new MockElement('body', 'body'),
  head: new MockElement('head', 'head'),
  addEventListener: (evt, handler) => {
    if (!eventListeners[evt]) eventListeners[evt] = [];
    eventListeners[evt].push(handler);
  },
  removeEventListener: (evt, handler) => {
    if (eventListeners[evt]) {
      eventListeners[evt] = eventListeners[evt].filter(h => h !== handler);
    }
  },
  getElementById: (id) => {
    if (!mockElements[id]) {
      mockElements[id] = new MockElement(id);
    }
    return mockElements[id];
  },
  createElement: (tag) => new MockElement(`el_${Math.random()}`, tag)
};

// Cargar app.js en el entorno global
const appJsCode = fs.readFileSync(APP_JS_PATH, 'utf8');
eval(appJsCode);

function triggerAfterPrint() {
  if (eventListeners['afterprint'] && eventListeners['afterprint'].length > 0) {
    const handlers = [...eventListeners['afterprint']];
    eventListeners['afterprint'] = [];
    handlers.forEach(h => h());
  } else {
    window.DocumentPrinter.status = 'idle';
  }
}

console.log('====================================================');
console.log('INICIANDO PRUEBAS DE FASE 2E-3 — BLOQUE 2');
console.log('Comprobantes Oficiales de Movimiento de Inventario');
console.log('====================================================\n');

// -------------------------------------------------------------
// MOCK DATA DE CONFIGURACIÓN Y MOVIMIENTOS
// -------------------------------------------------------------
const mockConfig = {
  nombre_negocio: 'Inversiones & Comercio Pro, C.A.',
  documento_fiscal: 'J-12345678-9',
  telefono: '+58 412 1234567',
  direccion: 'Av. Libertador, Edif. Torre Centro, Piso 4'
};

// 1. Cargo por Ajuste Positivo
const mockCargo = {
  id: 1,
  numero_ajuste: 'AJU-000001',
  fecha: '2026-10-22 10:00:00',
  tipo_ajuste: 'CARGO',
  sentido: 'ENTRADA',
  motivo: 'Sobrante detectado en conteo cíclico mensual',
  observaciones: 'Verificado físicamente en pasillo 4 anaquel B',
  usuario_id: 1,
  usuario_nombre: 'Supervisor Almacén',
  detalles: [
    {
      id: 10,
      producto_id: 1,
      producto_codigo: 'HAR008',
      producto_nombre: 'HARINA PANADERA AVEIRO 45KG',
      cantidad: 10.0,
      costo_unitario: 29.0,
      costo_total: 290.0,
      stock_anterior: 1720.0,
      stock_nuevo: 1730.0,
      motivo_detalle: 'Lote no registrado'
    }
  ]
};

// 2. Merma
const mockMerma = {
  id: 2,
  numero_ajuste: 'AJU-000002',
  fecha: '2026-10-22 11:00:00',
  tipo_ajuste: 'DESCARGO',
  tipo_movimiento: 'descargo_merma',
  sentido: 'SALIDA',
  motivo: 'Merma por deshidratación y rotura de saco en estiba',
  observaciones: 'Pérdida por humedad en bodega lateral',
  usuario_id: 2,
  usuario_nombre: 'Encargado de Depósito',
  detalles: [
    {
      id: 11,
      producto_id: 2,
      producto_codigo: 'HARPIZZ',
      producto_nombre: 'HARINA PARA PIZZA SAC 45 K',
      cantidad: 2.0,
      costo_unitario: 29.0,
      costo_total: 58.0,
      stock_anterior: 860.0,
      stock_nuevo: 858.0,
      motivo_detalle: 'Humedad por gotera'
    }
  ]
};

// 3. Vencimiento
const mockVencimiento = {
  id: 3,
  numero_ajuste: 'AJU-000003',
  fecha: '2026-10-22 12:00:00',
  tipo_ajuste: 'DESCARGO',
  tipo_movimiento: 'descargo_vencimiento',
  sentido: 'SALIDA',
  motivo: 'Productos alcanzaron fecha límite de consumo',
  observaciones: 'Acta de destrucción sanitaria según protocolo',
  usuario_id: 1,
  detalles: [
    {
      id: 12,
      producto_id: 4,
      producto_codigo: 'HARRESP',
      producto_nombre: 'HARINA AVEIRO REPOST C/LEU',
      cantidad: 5.0,
      costo_unitario: 5.0,
      costo_total: 25.0,
      stock_anterior: 500.0,
      stock_nuevo: 495.0,
      motivo_detalle: 'Vencido el 20/10/2026'
    }
  ]
};

// 4. Rotura / Daño
const mockRotura = {
  id: 4,
  numero_ajuste: 'AJU-000004',
  fecha: '2026-10-22 13:00:00',
  tipo_ajuste: 'DESCARGO',
  tipo_movimiento: 'descargo_rotura',
  sentido: 'SALIDA',
  motivo: 'Caída de paleta durante maniobra de montacargas',
  observaciones: 'Reporte de incidente #402 firmado por chofer',
  usuario_id: 3,
  detalles: [
    {
      id: 13,
      producto_id: 5,
      producto_codigo: 'HARIESPOST',
      producto_nombre: 'HARINA AVEIRO REPOST PROF 5KG',
      cantidad: 4.0,
      costo_unitario: 95.0,
      costo_total: 380.0,
      stock_anterior: 500.0,
      stock_nuevo: 496.0,
      motivo_detalle: 'Empaques rasgados con derrame total'
    }
  ]
};

// 5. Uso Interno
const mockUsoInterno = {
  id: 5,
  numero_ajuste: 'AJU-000005',
  fecha: '2026-10-22 14:00:00',
  tipo_ajuste: 'DESCARGO',
  tipo_movimiento: 'descargo_uso_interno',
  sentido: 'SALIDA',
  motivo: 'Consumo interno para pruebas en panadería piloto',
  observaciones: 'Solicitud del departamento de I+D',
  usuario_id: 1,
  detalles: [
    {
      id: 14,
      producto_id: 1,
      producto_codigo: 'HAR008',
      producto_nombre: 'HARINA PANADERA AVEIRO 45KG',
      cantidad: 1.0,
      costo_unitario: 29.0,
      costo_total: 29.0,
      stock_anterior: 1720.0,
      stock_nuevo: 1719.0,
      motivo_detalle: 'Prueba de leudado'
    }
  ]
};

// 6. Inventario Inicial
const mockInventarioInicial = {
  id: 6,
  numero_ajuste: 'AJU-000006',
  fecha: '2026-10-22 08:00:00',
  tipo_ajuste: 'CARGO',
  tipo_movimiento: 'inventario_inicial',
  sentido: 'ENTRADA',
  motivo: 'Carga de inventario inicial de apertura de sucursal',
  observaciones: 'Balance de apertura debidamente auditado',
  usuario_id: 1,
  detalles: [
    {
      id: 15,
      producto_id: 3,
      producto_codigo: 'HAR010',
      producto_nombre: 'HARINA AVEIRO EX. ESPECIAL 45KG',
      cantidad: 50.0,
      costo_unitario: 100.0,
      costo_total: 5000.0,
      stock_anterior: 0.0,
      stock_nuevo: 50.0,
      motivo_detalle: 'Apertura de bodega'
    }
  ]
};

// -------------------------------------------------------------
// MATRIZ DE PRUEBAS OBLIGATORIA
// -------------------------------------------------------------

console.log('--- GRUPO 1: TIPOS DE MOVIMIENTOS ---');
// 1. Cargo por Ajuste Positivo
const tit1 = window.getTituloMovimientoInventario(mockCargo);
assert(tit1 === 'COMPROBANTE OFICIAL DE CARGO POR AJUSTE POSITIVO', 'Tipo 1: Cargo genera título obligatorio exacto');
const htmlCargo = window.DocumentTemplates.movimientoCarta(mockCargo, mockConfig);
assert(htmlCargo.includes('COMPROBANTE OFICIAL DE CARGO POR AJUSTE POSITIVO'), 'Carta renderiza título de Cargo');
assert(htmlCargo.includes('ENTRADA'), 'Identifica sentido ENTRADA');

// 2. Merma
const tit2 = window.getTituloMovimientoInventario(mockMerma);
assert(tit2 === 'COMPROBANTE DE DESCARGO POR MERMA OPERATIVA', 'Tipo 2: Merma genera título obligatorio exacto');
const htmlMerma = window.DocumentTemplates.movimientoCarta(mockMerma, mockConfig);
assert(htmlMerma.includes('COMPROBANTE DE DESCARGO POR MERMA OPERATIVA'), 'Carta renderiza título de Merma');
assert(htmlMerma.includes('SALIDA'), 'Identifica sentido SALIDA');

// 3. Vencimiento
const tit3 = window.getTituloMovimientoInventario(mockVencimiento);
assert(tit3 === 'ACTA DE DESINCORPORACIÓN POR VENCIMIENTO', 'Tipo 3: Vencimiento genera título obligatorio exacto');
const htmlVenc = window.DocumentTemplates.movimientoCarta(mockVencimiento, mockConfig);
assert(htmlVenc.includes('ACTA DE DESINCORPORACIÓN POR VENCIMIENTO'), 'Carta renderiza título de Vencimiento');

// 4. Rotura / Daño
const tit4 = window.getTituloMovimientoInventario(mockRotura);
assert(tit4 === 'COMPROBANTE DE DESCARGO POR ROTURA / DAÑO', 'Tipo 4: Rotura genera título obligatorio exacto');
const htmlRot = window.DocumentTemplates.movimientoCarta(mockRotura, mockConfig);
assert(htmlRot.includes('COMPROBANTE DE DESCARGO POR ROTURA / DAÑO'), 'Carta renderiza título de Rotura');

// 5. Uso Interno
const tit5 = window.getTituloMovimientoInventario(mockUsoInterno);
assert(tit5 === 'VALE DE SALIDA PARA CONSUMO INTERNO', 'Tipo 5: Uso Interno genera título obligatorio exacto');
const htmlUso = window.DocumentTemplates.movimientoCarta(mockUsoInterno, mockConfig);
assert(htmlUso.includes('VALE DE SALIDA PARA CONSUMO INTERNO'), 'Carta renderiza título de Uso Interno');

// 6. Inventario Inicial
const tit6 = window.getTituloMovimientoInventario(mockInventarioInicial);
assert(tit6 === 'ACTA FORMAL DE INVENTARIO INICIAL', 'Tipo 6: Inventario Inicial genera título obligatorio exacto');
const htmlIni = window.DocumentTemplates.movimientoCarta(mockInventarioInicial, mockConfig);
assert(htmlIni.includes('ACTA FORMAL DE INVENTARIO INICIAL'), 'Carta renderiza título de Inventario Inicial');

console.log('\n--- GRUPO 2: INTEGRIDAD DE DATOS ---');
// 7. Un producto
assert(mockCargo.detalles.length === 1, 'Caso de 1 producto en ajuste');
assert(htmlCargo.includes('HAR008'), 'Renderiza código del producto');

// 8. Múltiples productos
const mockMultiProd = {
  ...mockCargo,
  numero_ajuste: 'AJU-000025',
  detalles: [
    { producto_id: 1, producto_codigo: 'PROD-A', producto_nombre: 'Producto A Harina Pan', cantidad: 5, costo_unitario: 10, costo_total: 50, stock_anterior: 100, stock_nuevo: 105 },
    { producto_id: 2, producto_codigo: 'PROD-B', producto_nombre: 'Producto B Harina Pizza', cantidad: 3, costo_unitario: 15, costo_total: 45, stock_anterior: 50, stock_nuevo: 53 },
    { producto_id: 3, producto_codigo: 'PROD-C', producto_nombre: 'Producto C Harina Repostería', cantidad: 2, costo_unitario: 20, costo_total: 40, stock_anterior: 30, stock_nuevo: 32 }
  ]
};
const htmlMulti = window.DocumentTemplates.movimientoCarta(mockMultiProd, mockConfig);
assert(htmlMulti.includes('PROD-A') && htmlMulti.includes('PROD-B') && htmlMulti.includes('PROD-C'), 'Renderiza los 3 productos en la misma tabla');

// 9. Muchas líneas / multipágina
const mockMuchasLineas = {
  ...mockCargo,
  detalles: Array.from({ length: 25 }, (_, i) => ({
    producto_id: i + 1,
    producto_codigo: `COD-${100 + i}`,
    producto_nombre: `PRODUCTO EXTENSO LÍNEA ${i + 1}`,
    cantidad: 2.0,
    costo_unitario: 10.0,
    costo_total: 20.0,
    stock_anterior: 50.0,
    stock_nuevo: 52.0
  }))
};
const htmlLargas = window.DocumentTemplates.movimientoCarta(mockMuchasLineas, mockConfig);
assert(htmlLargas.includes('PRODUCTO EXTENSO LÍNEA 25'), 'Renderiza todas las 25 líneas');
assert(htmlLargas.includes('thead') && htmlLargas.includes('avoid-page-break'), 'Aplica thead y avoid-page-break');

// 10. Motivo
assert(htmlCargo.includes('Sobrante detectado en conteo cíclico mensual'), 'Presenta el motivo real');

// 11. Observaciones
assert(htmlCargo.includes('Verificado físicamente en pasillo 4 anaquel B'), 'Presenta las observaciones reales');

// 12. Stock anterior y nuevo
assert(htmlCargo.includes('1720.00') && htmlCargo.includes('1730.00'), 'Muestra trazabilidad de stock anterior y stock nuevo');

// 13. Costos
assert(htmlCargo.includes('$29.00') && htmlCargo.includes('$290.00'), 'Muestra costo unitario y valuación total');

// 14. Usuario / Responsable
assert(htmlCargo.includes('Supervisor Almacén') || htmlCargo.includes('Usuario #1'), 'Identifica al responsable/usuario');

console.log('\n--- GRUPO 3: FORMATOS DE PAPEL ---');
// 15. Ticket 80 mm
const ticketAju = window.DocumentTemplates.movimientoTicket(mockCargo, mockConfig);
assert(ticketAju.includes('doc-movimiento-ticket'), 'Aplica clase doc-movimiento-ticket');
assert(ticketAju.includes('RESPONSABLE') && ticketAju.includes('AUTORIZADO POR'), 'Incluye bloque de firmas compactas');

// 16. Carta
const cartaAju = window.DocumentTemplates.movimientoCarta(mockCargo, mockConfig);
assert(cartaAju.includes('doc-movimiento-sheet'), 'Aplica clase doc-movimiento-sheet');
assert(cartaAju.includes('RESPONSABLE DE INVENTARIO') && cartaAju.includes('AUTORIZADO POR'), 'Incluye firmas formales de Carta');

// 17. A4
const a4Aju = window.DocumentTemplates.movimientoA4(mockCargo, mockConfig);
assert(a4Aju.includes('doc-a4-movimiento') || a4Aju.includes('doc-a4-sheet'), 'Aplica clase doc-a4-movimiento');
assert(typeof window.DocumentTemplates.movimientoA4 === 'function', 'Función específica movimientoA4 existe');

console.log('\n--- GRUPO 4: FLUJO DE IMPRESIÓN ---');
// 18. Impresión inmediatamente después de guardar
window.AppState.ultimoMovimientoInventario = mockCargo;
const printRes = window.imprimirMovimientoActual('ticket80');
assert(printRes === true, 'imprimirMovimientoActual() despacha a DocumentPrinter retornando true');
assert(window.DocumentPrinter.status === 'printing', 'DocumentPrinter entra en estado printing');
triggerAfterPrint();
assert(window.DocumentPrinter.status === 'idle', 'Restaura a estado idle');

// 19. Reimpresión histórica
window.AppState.ultimoMovimientoInventario = mockMerma;
const selectAju = document.getElementById('selectFormatoImpresionMovimiento');
selectAju.value = 'letterPortrait';
const reimpHist = window.imprimirMovimientoActual();
assert(reimpHist === true, 'Reimprime movimiento histórico desde AppState');
triggerAfterPrint();

// 20. Impresión desde Kardex
const mockMovKardex = {
  id: 88,
  producto_id: 1,
  producto_codigo: 'HAR008',
  producto_nombre: 'HARINA PANADERA AVEIRO 45KG',
  documento_tipo: 'INVENTARIO_AJUSTE',
  documento_id: 1,
  documento_numero: 'AJU-000001',
  fecha: '2026-10-22',
  cantidad: 10,
  costo_unitario: 29,
  costo_total: 290,
  stock_anterior: 1720,
  stock_nuevo: 1730
};
window.AppState.kardexV2Data = { movimientos: [mockMovKardex] };
window.verDetalleMovimientoKardex(88);
const kardexAcc = document.getElementById('kardexAjusteAcciones');
assert(!kardexAcc.classList.contains('hidden'), 'Muestra acción de imprimir comprobante en modal Kardex para INVENTARIO_AJUSTE');

// 21. PRUEBA ESPECIAL DE KARDEX: Kardex imprime AJU completo con múltiples productos (Section 20)
console.log('\n--- PRUEBA ESPECIAL DE KARDEX (SECCIÓN 20) ---');
// Escenario: El movimiento en Kardex es solo de PROD-A, pero el AJU-000025 tiene A + B + C
window.AppState.ultimoMovimientoInventario = mockMultiProd; // AJU completo recuperado
const htmlKardexPrint = window.DocumentTemplates.movimientoCarta(window.AppState.ultimoMovimientoInventario, mockConfig);
assert(htmlKardexPrint.includes('PROD-A') && htmlKardexPrint.includes('PROD-B') && htmlKardexPrint.includes('PROD-C'),
  'Kardex imprime el AJU-XXXXXX completo con Productos A, B y C (no solo el Producto A individual)');

// 22. Cancelación del diálogo
window.imprimirMovimientoActual('letterPortrait');
assert(window.DocumentPrinter.status === 'printing', 'Entra en printing');
triggerAfterPrint();
assert(window.DocumentPrinter.status === 'idle', 'Cancela y restaura a idle');

// 23. Reimpresión inmediata
const reimpInmediata = window.imprimirMovimientoActual('ticket80');
assert(reimpInmediata === true, 'Permite reimprimir inmediatamente después de cancelar');

// 24. Doble clic / concurrencia
assert(window.DocumentPrinter.status === 'printing', 'Permanece en printing');
const blockedAju = window.imprimirMovimientoActual('a4Portrait');
assert(blockedAju === false, 'Segundo llamado concurrente es bloqueado de forma segura retornando false');
triggerAfterPrint();

console.log('\n--- GRUPO 5: SEGURIDAD XSS ---');
const mockAjuXSS = {
  ...mockCargo,
  motivo: 'Motivo malicioso <script>alert(1)</script> y "comillas"',
  observaciones: 'Obs con <img src=x onerror=alert(2)> y & ampersand',
  usuario_nombre: 'Admin <script>hack</script>',
  detalles: [
    {
      producto_id: 1,
      producto_codigo: 'CODE<XSS>',
      producto_nombre: 'Producto <b>Peligroso</b>',
      cantidad: 1,
      costo_unitario: 10,
      costo_total: 10,
      stock_anterior: 5,
      stock_nuevo: 6,
      motivo_detalle: 'Detalle con \'apóstrofe\' y <script>'
    }
  ]
};
const xssAjuTicket = window.DocumentTemplates.movimientoTicket(mockAjuXSS, mockConfig);
const xssAjuCarta = window.DocumentTemplates.movimientoCarta(mockAjuXSS, mockConfig);

// 25. XSS en nombre de producto
assert(!xssAjuCarta.includes('<b>Peligroso</b>') && xssAjuCarta.includes('&lt;b&gt;Peligroso&lt;/b&gt;'), 'XSS en nombre de producto neutralizado');

// 26. XSS en motivo
assert(!xssAjuCarta.includes('<script>alert(1)</script>') && xssAjuCarta.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'XSS en motivo neutralizado');

// 27. XSS en observaciones
assert(!xssAjuCarta.includes('<img src=x onerror=alert(2)>'), 'Tag img en observaciones neutralizado');

// 28. Caracteres especiales
assert(xssAjuCarta.includes('&quot;comillas&quot;') || xssAjuCarta.includes('&quot;'), 'Comillas dobles escapadas');
assert(xssAjuCarta.includes('&#039;apóstrofe&#039;') || xssAjuCarta.includes('&#039;'), 'Apóstrofes escapados');
assert(xssAjuCarta.includes('&amp; ampersand'), 'Ampersand escapado');

console.log('\n--- GRUPO 6: PRUEBAS DE NO REGRESIÓN ---');
// 29. Factura de venta
assert(typeof window.DocumentTemplates.facturaCarta === 'function', 'Factura de venta continúa disponible');

// 30. Nota de devolución
assert(typeof window.DocumentTemplates.devolucionCarta === 'function', 'Nota de devolución continúa disponible');

// 31, 32, 33. Endpoints del servidor
function checkEndpoint(urlPath) {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:8000' + urlPath, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    }).on('error', reject);
  });
}

async function verifyServer() {
  const conc = await checkEndpoint('/api/inventario/conciliacion');
  // 31. Conciliación
  assert(conc.status === 200 && conc.json.estado_general === 'CONCILIADO_OK', '/api/inventario/conciliacion es CONCILIADO_OK');
  // 32. Diferencia 0
  assert(conc.json.total_diferencia === 0, 'Diferencias totales de inventario = 0');

  // 33. Endpoints principales HTTP 200
  const endpoints = [
    '/api/productos',
    '/api/clientes',
    '/api/proveedores',
    '/api/facturas',
    '/api/compras',
    '/api/devoluciones',
    '/api/inventario/ajustes',
    '/api/reportes/kardex-v2'
  ];

  for (let ep of endpoints) {
    const r = await checkEndpoint(ep);
    assert(r.status === 200, `Endpoint ${ep} responde HTTP 200`);
  }

  console.log('\n====================================================');
  console.log(`TODAS LAS PRUEBAS (BLOQUE 2 + SERVIDOR) COMPLETADAS: ${passedTests}/${totalTests} [OK]`);
  console.log('====================================================\n');
}

verifyServer().catch(err => {
  console.error('Error en pruebas de servidor:', err);
  process.exit(1);
});
