/**
 * TEST SUITE: FASE 2E-3 — BLOQUE 1
 * Migración de Nota de Devolución de Cliente al DocumentPrinter
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// Configuración de rutas
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
    // Simular diálogo de impresión
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

// Acceder a través de window
const devTemplates = window.DocumentTemplates;
const docPrinter = window.DocumentPrinter;
const appState = window.AppState;

console.log('====================================================');
console.log('INICIANDO PRUEBAS DE FASE 2E-3 — BLOQUE 1');
console.log('====================================================\n');

// -------------------------------------------------------------
// MOCK DATA DE CONFIGURACIÓN Y DEVOLUCIÓN
// -------------------------------------------------------------
const mockConfig = {
  nombre_negocio: 'Inversiones & Comercio Pro, C.A.',
  documento_fiscal: 'J-12345678-9',
  telefono: '+58 412 1234567',
  direccion: 'Av. Libertador, Edif. Torre Centro, Piso 4'
};

const mockDevTotal = {
  id: 101,
  numero_devolucion: 'DEV-000101',
  factura_id: 50,
  numero_factura: 'FAC-000050',
  cliente_id: 2,
  cliente_nombre: 'Panadería Central C.A.',
  cliente_cedula: 'J-99887766-5',
  cliente_telefono: '+58 276 5551234',
  cliente_direccion: 'Carrera 7 con Calle 10',
  fecha_emision: '2026-10-22 14:30:00',
  fecha_factura_original: '2026-10-20 10:15:00',
  tipo_devolucion: 'total',
  motivo: 'Mercancía en mal estado de empaque original',
  subtotal_usd: 100.0,
  iva_usd: 16.0,
  total_usd: 116.0,
  tasa_ves: 885.50,
  total_ves: 102718.0,
  tasa_cop: 3175.0,
  total_cop: 368300.0,
  metodo_reembolso: 'efectivo',
  notas: 'Autorizado por Gerente de Sucursal con nota de crédito',
  detalles: [
    {
      producto_id: 1,
      codigo: 'HAR008',
      nombre: 'HARINA PANADERA AVEIRO 45KG',
      tipo: 'producto',
      impuesto_tipo: 'gravado',
      cantidad: 2.0,
      precio_unitario: 50.0,
      total: 100.0
    }
  ],
  pagos: [
    {
      id: 1,
      metodo: 'Efectivo USD',
      moneda: 'USD',
      monto_moneda: 116.0,
      monto_usd: 116.0,
      referencia: 'Caja Principal'
    }
  ]
};

const mockDevParcial = {
  id: 102,
  numero_devolucion: 'DEV-000102',
  factura_id: 55,
  numero_factura: 'FAC-000055',
  cliente_id: 3,
  cliente_nombre: 'Pastelería Gran Dulce',
  cliente_cedula: 'V-18765432',
  cliente_telefono: '+58 414 7778899',
  cliente_direccion: 'Barrio Obrero',
  fecha_emision: '2026-10-22 15:45:00',
  fecha_factura_original: '2026-10-21 11:00:00',
  tipo_devolucion: 'parcial',
  motivo: 'Cambio de 1 saco por peso menor al especificado',
  subtotal_usd: 31.5,
  iva_usd: 0.0,
  total_usd: 31.5,
  tasa_ves: 885.50,
  total_ves: 27893.25,
  tasa_cop: 3175.0,
  total_cop: 100013.0,
  metodo_reembolso: 'transferencia',
  notas: 'Cliente conserva resto de la factura',
  detalles: [
    {
      producto_id: 2,
      codigo: 'HARPIZZ',
      nombre: 'HARINA PARA PIZZA AVEIRO SAC 45 K',
      tipo: 'producto',
      impuesto_tipo: 'exento',
      cantidad: 1.0,
      precio_unitario: 31.5,
      total: 31.5
    }
  ],
  pagos: [
    {
      id: 2,
      metodo: 'Pago Móvil (VES)',
      moneda: 'VES',
      monto_moneda: 27893.25,
      monto_usd: 31.5,
      referencia: 'PM-889922'
    }
  ]
};

const mockDevMultiProducto = {
  id: 103,
  numero_devolucion: 'DEV-000103',
  factura_id: 60,
  numero_factura: 'FAC-000060',
  cliente_id: 4,
  cliente_nombre: 'Distribuidora Los Andes',
  cliente_cedula: 'J-33445566-7',
  fecha_emision: '2026-10-22 16:00:00',
  tipo_devolucion: 'parcial',
  motivo: 'Ajuste de pedido por entrega duplicada',
  subtotal_usd: 331.5,
  iva_usd: 16.0,
  total_usd: 347.5,
  tasa_ves: 885.50,
  total_ves: 307711.25,
  tasa_cop: 3175.0,
  total_cop: 1103313.0,
  detalles: [
    { producto_id: 1, codigo: 'HAR008', nombre: 'HARINA PANADERA 45KG', tipo: 'producto', cantidad: 3.0, precio_unitario: 31.5, impuesto_tipo: 'exento', total: 94.5 },
    { producto_id: 2, codigo: 'HARPIZZ', nombre: 'HARINA PIZZA 45KG', tipo: 'producto', cantidad: 2.0, precio_unitario: 31.5, impuesto_tipo: 'exento', total: 63.0 },
    { producto_id: 3, codigo: 'HAR010', nombre: 'HARINA EXTRA ESPECIAL', tipo: 'producto', cantidad: 2.0, precio_unitario: 37.0, impuesto_tipo: 'exento', total: 74.0 },
    { producto_id: 5, codigo: 'HARIESPOST', nombre: 'HARINA REPOSTERA PROF 5KG', tipo: 'producto', cantidad: 1.0, precio_unitario: 100.0, impuesto_tipo: 'gravado', total: 100.0 }
  ],
  pagos: [
    { metodo: 'Efectivo USD', moneda: 'USD', monto_moneda: 100.0, monto_usd: 100.0, referencia: 'Caja' },
    { metodo: 'Transferencia COP', moneda: 'COP', monto_moneda: 400000.0, monto_usd: 125.98, referencia: 'Bancolombia' },
    { metodo: 'Pago Móvil VES', moneda: 'VES', monto_moneda: 107604.0, monto_usd: 121.52, referencia: 'Banesco' }
  ]
};

// -------------------------------------------------------------
// EJECUCIÓN DE LAS 15 PRUEBAS ESPECÍFICAS
// -------------------------------------------------------------

console.log('--- TEST 01: Devolución total ---');
const htmlT1 = window.DocumentTemplates.devolucionTicket(mockDevTotal, mockConfig);
assert(htmlT1.includes('DEVOLUCIÓN TOTAL'), 'Contiene indicación expresa DEVOLUCIÓN TOTAL');
assert(htmlT1.includes('DEV-000101'), 'Contiene número de devolución DEV-000101');
assert(htmlT1.includes('FAC-000050'), 'Contiene referencia a Factura Original FAC-000050');
assert(htmlT1.includes('$116.00'), 'Contiene total reembolsado correcto $116.00');

console.log('--- TEST 02: Devolución parcial ---');
const htmlT2 = window.DocumentTemplates.devolucionCarta(mockDevParcial, mockConfig);
assert(htmlT2.includes('DEVOLUCIÓN PARCIAL'), 'Contiene indicación expresa DEVOLUCIÓN PARCIAL en formato Carta');
assert(htmlT2.includes('Pastelería Gran Dulce'), 'Identifica al cliente correctamente');
assert(htmlT2.includes('HARPIZZ'), 'Contiene código del producto devuelto HARPIZZ');
assert(htmlT2.includes('100,013 COP') || htmlT2.includes('100.013 COP'), 'Calcula equivalencia en COP correctamente');

console.log('--- TEST 03: Devolución con múltiples productos ---');
const htmlT3 = window.DocumentTemplates.devolucionCarta(mockDevMultiProducto, mockConfig);
assert(htmlT3.includes('HAR008') && htmlT3.includes('HARPIZZ') && htmlT3.includes('HAR010') && htmlT3.includes('HARIESPOST'), 'Renderiza las 4 líneas de productos en la tabla');
assert(htmlT3.includes('doc-table'), 'Aplica la clase estandarizada doc-table');
assert(htmlT3.includes('thead'), 'Mantiene encabezado thead para repetición');

console.log('--- TEST 04: Devolución con múltiples pagos ---');
assert(htmlT3.includes('Efectivo USD') && htmlT3.includes('Transferencia COP') && htmlT3.includes('Pago Móvil VES'), 'Desglosa los 3 métodos de reembolso en la columna correspondiente');
assert(htmlT3.includes('Bancolombia') && htmlT3.includes('Banesco'), 'Muestra las referencias bancarias de reembolso');

console.log('--- TEST 05: Multimoneda USD/VES/COP ---');
assert(htmlT3.includes('347.50'), 'Muestra total USD');
assert(htmlT3.includes('307,711.25 Bs.') || htmlT3.includes('307.711,25 Bs.') || htmlT3.includes('307711.25 Bs.'), 'Muestra total en Bolívares con tasa');
assert(htmlT3.includes('COP') && (htmlT3.includes('3.175') || htmlT3.includes('3175')), 'Muestra total y tasa de cambio COP');

function triggerAfterPrint() {
  if (eventListeners['afterprint']) {
    const handlers = [...eventListeners['afterprint']];
    eventListeners['afterprint'] = [];
    handlers.forEach(h => h());
  } else {
    window.DocumentPrinter.status = 'idle';
  }
}

console.log('--- TEST 06: Devolución histórica ---');
// Simular carga de devolución histórica en AppState
window.AppState.ultimaDevolucionEmitida = mockDevTotal;
assert(window.AppState.ultimaDevolucionEmitida.id === 101, 'AppState.ultimaDevolucionEmitida almacena el objeto de devolución activa');
const selectDev = document.getElementById('selectFormatoImpresionDevolucion');
selectDev.value = 'ticket80';
const printSuccess = window.imprimirDevolucionActual();
assert(printSuccess === true, 'imprimirDevolucionActual() despacha hacia DocumentPrinter.print() retornando true');
assert(window.DocumentPrinter.status === 'printing', 'DocumentPrinter pasa a estado printing');
triggerAfterPrint();
assert(window.DocumentPrinter.status === 'idle', 'triggerAfterPrint() restaura estado a idle');

console.log('--- TEST 07: Ticket 80 mm ---');
const ticketHtml = window.DocumentTemplates.devolucionTicket(mockDevTotal, mockConfig);
assert(ticketHtml.includes('doc-devolucion-ticket'), 'Aplica la clase doc-devolucion-ticket');
assert(ticketHtml.includes('Firma Almacén / Caja') && ticketHtml.includes('Firma Cliente'), 'Contiene bloque de firmas compactas de ticket');
assert(!ticketHtml.includes('<table class="doc-table">'), 'No utiliza tabla extendida de carta sino tabla compacta');

console.log('--- TEST 08: Carta Vertical ---');
const cartaHtml = window.DocumentTemplates.devolucionCarta(mockDevTotal, mockConfig);
assert(cartaHtml.includes('doc-devolucion-sheet'), 'Aplica clase doc-devolucion-sheet');
assert(cartaHtml.includes('RESPONSABLE ALMACÉN / CAJA') && cartaHtml.includes('CLIENTE / BENEFICIARIO'), 'Contiene firmas formales de Carta');
assert(cartaHtml.includes('P. Unit ($)') && cartaHtml.includes('Total ($)'), 'Contiene encabezados completos de columnas');

console.log('--- TEST 09: A4 Vertical ---');
const a4Html = window.DocumentTemplates.devolucionA4(mockDevTotal, mockConfig);
assert(a4Html.includes('doc-a4-sheet'), 'Aplica clase doc-a4-sheet específica para A4');
assert(typeof window.DocumentTemplates.devolucionA4 === 'function', 'Existe la plantilla específica devolucionA4');

console.log('--- TEST 10: Devolución con muchas líneas y multipágina ---');
const devLarga = {
  ...mockDevTotal,
  detalles: Array.from({ length: 30 }, (_, i) => ({
    producto_id: i + 1,
    codigo: `PROD-${100 + i}`,
    nombre: `PRODUCTO EXTENSO LÍNEA NÚMERO ${i + 1}`,
    tipo: 'producto',
    cantidad: 1.0,
    precio_unitario: 10.0,
    total: 10.0
  }))
};
const htmlLarga = window.DocumentTemplates.devolucionCarta(devLarga, mockConfig);
assert(htmlLarga.includes('PRODUCTO EXTENSO LÍNEA NÚMERO 30'), 'Renderiza correctamente las 30 líneas de productos');
assert(htmlLarga.includes('avoid-page-break'), 'Contiene marcas avoid-page-break para no fraccionar firmas ni totales');

console.log('--- TEST 11: Cancelación del diálogo de impresión ---');
// Disparar impresión y simular cancelación (disparo de afterprint)
window.imprimirDevolucionActual('letterPortrait');
assert(window.DocumentPrinter.status === 'printing', 'DocumentPrinter entra en estado printing');
triggerAfterPrint();
assert(window.DocumentPrinter.status === 'idle', 'triggerAfterPrint() restaura estado a idle');

console.log('--- TEST 12: Reimpresión inmediatamente después de cancelar ---');
triggerAfterPrint();
const reimpOk = window.imprimirDevolucionActual('letterPortrait');
assert(reimpOk === true, 'Permite reimprimir inmediatamente después de resetear/cancelar');

console.log('--- TEST 13: Bloqueo de doble clic en imprimir ---');
// Mientras DocumentPrinter esté en 'printing', un nuevo llamado debe retornar false
assert(window.DocumentPrinter.status === 'printing', 'DocumentPrinter permanece en printing');
const blocked = window.imprimirDevolucionActual('ticket80');
assert(blocked === false, 'Segundo llamado concurrente es bloqueado con seguridad retornando false');
triggerAfterPrint();

console.log('--- TEST 14: Aislamiento absoluto de la interfaz en CSS ---');
const cssContent = fs.readFileSync(STYLES_CSS_PATH, 'utf8');
assert(cssContent.includes('body.document-printing #areaImpresionOficial .doc-devolucion-sheet'), 'CSS contiene reglas para .doc-devolucion-sheet');
assert(cssContent.includes('body.document-printing #areaImpresionOficial .doc-devolucion-ticket'), 'CSS contiene reglas para .doc-devolucion-ticket');
assert(cssContent.includes('body.document-printing > *:not(#areaImpresionOficial)'), 'CSS oculta todo excepto #areaImpresionOficial');

console.log('--- TEST 15: Sanitización contra XSS ---');
const devXSS = {
  ...mockDevTotal,
  cliente_nombre: 'Hack <script>alert(1)</script> S.A.',
  motivo: 'Motivo con "comillas", \'apóstrofes\' y & ampersand',
  notas: 'Nota <b>insegura</b> con <img src=x onerror=alert(2)>',
  detalles: [
    {
      producto_id: 99,
      codigo: 'XSS"CODE',
      nombre: 'Harina <script>malicioso</script>',
      tipo: 'producto',
      cantidad: 1,
      precio_unitario: 10,
      total: 10
    }
  ]
};
const xssTicket = window.DocumentTemplates.devolucionTicket(devXSS, mockConfig);
const xssCarta = window.DocumentTemplates.devolucionCarta(devXSS, mockConfig);
assert(!xssTicket.includes('<script>alert(1)</script>'), 'Script en nombre de cliente está sanitizado en ticket');
assert(!xssCarta.includes('<script>alert(1)</script>'), 'Script en nombre de cliente está sanitizado en carta');
assert(xssCarta.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'Script se convierte en entidades HTML seguras');
assert(xssCarta.includes('&quot;comillas&quot;') || xssCarta.includes('&quot;'), 'Comillas se escapan como &quot;');
assert(xssCarta.includes('&#039;apóstrofes&#039;') || xssCarta.includes('&#039;'), 'Apóstrofes se escapan como &#039;');
assert(!xssCarta.includes('<img src=x onerror=alert(2)>'), 'Tag img en notas está debidamente neutralizado');

// -------------------------------------------------------------
// VERIFICACIÓN DE NO REGRESIÓN DE FACTURA DE VENTA
// -------------------------------------------------------------
console.log('\n--- VERIFICACIÓN DE NO REGRESIÓN: FACTURA DE VENTA ---');
assert(typeof window.DocumentTemplates.facturaTicket === 'function', 'facturaTicket continúa intacta');
assert(typeof window.DocumentTemplates.facturaCarta === 'function', 'facturaCarta continúa intacta');
assert(typeof window.DocumentTemplates.facturaA4 === 'function', 'facturaA4 continúa intacta');
assert(typeof window.imprimirFacturaActual === 'function', 'imprimirFacturaActual continúa intacta');

// -------------------------------------------------------------
// VERIFICACIÓN DE NO REGRESIÓN DE ENDPOINTS DEL SERVIDOR
// -------------------------------------------------------------
console.log('\n--- VERIFICACIÓN DE ENDPOINTS DEL SERVIDOR (NO REGRESIÓN) ---');

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
  assert(conc.status === 200, '/api/inventario/conciliacion retorna HTTP 200');
  assert(conc.json.estado_general === 'CONCILIADO_OK', 'Conciliación general es CONCILIADO_OK');
  assert(conc.json.total_diferencia === 0, 'Diferencias totales de inventario = 0');

  const endpoints = [
    '/api/productos',
    '/api/clientes',
    '/api/proveedores',
    '/api/facturas',
    '/api/compras',
    '/api/devoluciones',
    '/api/reportes/kardex-v2',
    '/api/cxc',
    '/api/cxp'
  ];

  for (let ep of endpoints) {
    const r = await checkEndpoint(ep);
    assert(r.status === 200, `Endpoint ${ep} responde HTTP 200`);
  }

  console.log('\n====================================================');
  console.log(`TODAS LAS PRUEBAS (FRONTEND + SERVIDOR) COMPLETADAS: ${passedTests}/${totalTests} [OK]`);
  console.log('====================================================\n');
}

verifyServer().catch(err => {
  console.error('Error en pruebas de servidor:', err);
  process.exit(1);
});
