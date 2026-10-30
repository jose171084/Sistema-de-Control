/**
 * TEST: CORRECCIÓN QUIRÚRGICA — FLUJO NUEVO AJUSTE DE INVENTARIO
 * Simula de extremo a extremo la ejecución de saveAjuste(e) en el navegador
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const APP_JS_PATH = path.join(__dirname, '..', 'public', 'app.js');
const INDEX_HTML_PATH = path.join(__dirname, '..', 'public', 'index.html');

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

function makeRequest(method, reqPath, data = null) {
  return new Promise((resolve, reject) => {
    const payloadStr = data ? JSON.stringify(data) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (payloadStr) {
      headers['Content-Length'] = Buffer.byteLength(payloadStr);
    }

    const options = {
      hostname: '127.0.0.1',
      port: 8000,
      path: reqPath,
      method: method,
      headers: headers
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });

    req.on('error', reject);
    if (payloadStr) req.write(payloadStr);
    req.end();
  });
}

// -------------------------------------------------------------
// MOCK DE ENTORNO NAVEGADOR
// -------------------------------------------------------------
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
    this.value = '';
    this.attributes = {};
    this.disabled = false;
    this.style = {};
  }
  setAttribute(attr, val) { this.attributes[attr] = String(val); }
  getAttribute(attr) { return this.attributes[attr]; }
  querySelector(sel) { return null; }
  querySelectorAll(sel) { return []; }
  appendChild(child) { return child; }
  remove() {}
}

function getOrCreateMock(id, tagName = 'div') {
  if (!mockElements[id]) {
    mockElements[id] = new MockElement(id, tagName);
  }
  return mockElements[id];
}

global.document = {
  getElementById: (id) => getOrCreateMock(id),
  querySelectorAll: (sel) => {
    if (sel === '.ajuste-item-row') {
      return global.mockRows || [];
    }
    return [];
  },
  createElement: (tag) => new MockElement('dyn_' + Math.random(), tag),
  addEventListener: () => {},
  removeEventListener: () => {},
  body: new MockElement('body', 'body')
};

global.window = {
  print: () => {},
  addEventListener: () => {},
  requestAnimationFrame: (cb) => cb()
};

global.alert = (msg) => console.log('  [Alert Mock]:', msg);

// Fetch conectado al servidor real
global.fetch = async (url, options = {}) => {
  const method = options.method || 'GET';
  const body = options.body ? JSON.parse(options.body) : null;
  const res = await makeRequest(method, url, body);
  return {
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
    json: async () => res.data
  };
};

// Cargar y evaluar app.js
const appCode = fs.readFileSync(APP_JS_PATH, 'utf-8');
eval(appCode);

global.AppState = window.AppState;
const AppState = window.AppState;
const DocumentTemplates = window.DocumentTemplates;

async function runTestFlow() {
  console.log('====================================================');
  console.log('PRUEBA DE CORRECCIÓN: FLUJO DE NUEVO AJUSTE (saveAjuste)');
  console.log('====================================================\n');

  // Obtener producto existente
  const resProd = await makeRequest('GET', '/api/productos');
  const producto = resProd.data.find(p => p.tipo === 'producto');
  assert(!!producto, 'Producto de prueba identificado: ' + producto.nombre);

  // ---------------------------------------------------------------
  // PRUEBA CARGO
  // ---------------------------------------------------------------
  console.log('\n--- PRUEBA 1: FLUJO COMPLETO DE CREACIÓN: CARGO ---');

  // Preparar inputs en el DOM simulado
  getOrCreateMock('ajusteTipo').value = 'CARGO';
  getOrCreateMock('ajusteMotivo').value = 'sobrante';
  getOrCreateMock('ajusteFecha').value = new Date().toISOString().split('T')[0];
  getOrCreateMock('ajusteObservaciones').value = 'Prueba automática de flujo CARGO';

  // Modal abierto inicialmente
  getOrCreateMock('modalAjusteInventario').classList.remove('hidden');
  getOrCreateMock('modalComprobanteAjuste').classList.add('hidden');

  // Simular fila de producto
  const mockRowCargo = new MockElement('row_cargo', 'div');
  const mockSelectCargo = new MockElement('sel_cargo', 'select');
  mockSelectCargo.value = String(producto.id);
  mockSelectCargo.selectedOptions = [{
    getAttribute: (attr) => attr === 'data-stock' ? String(producto.stock) : '15.0'
  }];
  const mockCantCargo = new MockElement('cant_cargo', 'input');
  mockCantCargo.value = '5.0';
  const mockCostoCargo = new MockElement('costo_cargo', 'input');
  mockCostoCargo.value = String(producto.costo || 15.0);

  mockRowCargo.querySelector = (sel) => {
    if (sel === '.ajuste-prod-select') return mockSelectCargo;
    if (sel === '.ajuste-cant-input') return mockCantCargo;
    if (sel === '.ajuste-costo-input') return mockCostoCargo;
    return null;
  };
  global.mockRows = [mockRowCargo];

  // Ejecutar saveAjuste tal como lo hace el formulario en el navegador
  let prevented = false;
  await saveAjuste({ preventDefault: () => { prevented = true; } });
  assert(prevented, 'saveAjuste llamó preventDefault()');

  // 1. Modal de creación debe estar CERRADO
  assert(getOrCreateMock('modalAjusteInventario').classList.contains('hidden'), 'El modal #modalAjusteInventario se cerró automáticamente');

  // 2. Modal de comprobante debe estar ABIERTO
  assert(!getOrCreateMock('modalComprobanteAjuste').classList.contains('hidden'), 'El modal #modalComprobanteAjuste se abrió inmediatamente');

  // 3. Comprobante contiene datos correctos
  assert(AppState.ultimoMovimientoInventario !== null, 'AppState.ultimoMovimientoInventario está poblado');
  const cargoAjuste = AppState.ultimoMovimientoInventario;
  assert(cargoAjuste.tipo_ajuste === 'CARGO', 'Tipo de ajuste es CARGO');
  assert(cargoAjuste.numero_ajuste.startsWith('CAR-'), 'Número de ajuste oficial: ' + cargoAjuste.numero_ajuste);
  assert(getOrCreateMock('previewComprobanteAjusteContenido').innerHTML.includes(cargoAjuste.numero_ajuste), 'Vista previa contiene el número de ajuste');
  assert(getOrCreateMock('previewComprobanteAjusteContenido').innerHTML.includes(producto.nombre), 'Vista previa contiene el nombre del producto');

  // ---------------------------------------------------------------
  // PRUEBA DESCARGO
  // ---------------------------------------------------------------
  console.log('\n--- PRUEBA 2: FLUJO COMPLETO DE CREACIÓN: DESCARGO ---');

  // Preparar inputs en el DOM simulado para DESCARGO
  getOrCreateMock('ajusteTipo').value = 'DESCARGO';
  getOrCreateMock('ajusteMotivo').value = 'merma';
  getOrCreateMock('ajusteFecha').value = new Date().toISOString().split('T')[0];
  getOrCreateMock('ajusteObservaciones').value = 'Prueba automática de flujo DESCARGO compensatorio';

  // Modal abierto inicialmente
  getOrCreateMock('modalAjusteInventario').classList.remove('hidden');
  getOrCreateMock('modalComprobanteAjuste').classList.add('hidden');

  // Simular fila de producto para DESCARGO (5 unidades compensatorias)
  const mockRowDescargo = new MockElement('row_descargo', 'div');
  const mockSelectDescargo = new MockElement('sel_descargo', 'select');
  mockSelectDescargo.value = String(producto.id);
  mockSelectDescargo.selectedOptions = [{
    getAttribute: (attr) => attr === 'data-stock' ? '9999' : '15.0'
  }];
  const mockCantDescargo = new MockElement('cant_descargo', 'input');
  mockCantDescargo.value = '5.0';
  const mockCostoDescargo = new MockElement('costo_descargo', 'input');
  mockCostoDescargo.value = String(producto.costo || 15.0);

  mockRowDescargo.querySelector = (sel) => {
    if (sel === '.ajuste-prod-select') return mockSelectDescargo;
    if (sel === '.ajuste-cant-input') return mockCantDescargo;
    if (sel === '.ajuste-costo-input') return mockCostoDescargo;
    return null;
  };
  global.mockRows = [mockRowDescargo];

  // Ejecutar saveAjuste
  await saveAjuste({ preventDefault: () => {} });

  // 1. Modal de creación debe estar CERRADO
  assert(getOrCreateMock('modalAjusteInventario').classList.contains('hidden'), 'El modal #modalAjusteInventario se cerró automáticamente tras descargo');

  // 2. Modal de comprobante debe estar ABIERTO
  assert(!getOrCreateMock('modalComprobanteAjuste').classList.contains('hidden'), 'El modal #modalComprobanteAjuste se abrió inmediatamente tras descargo');

  // 3. Comprobante contiene datos del descargo
  assert(AppState.ultimoMovimientoInventario !== null, 'AppState.ultimoMovimientoInventario está poblado con el descargo');
  const descargoAjuste = AppState.ultimoMovimientoInventario;
  assert(descargoAjuste.tipo_ajuste === 'DESCARGO', 'Tipo de ajuste es DESCARGO');
  assert(descargoAjuste.numero_ajuste.startsWith('DES-'), 'Número de ajuste oficial: ' + descargoAjuste.numero_ajuste);
  assert(getOrCreateMock('previewComprobanteAjusteContenido').innerHTML.includes(descargoAjuste.numero_ajuste), 'Vista previa contiene el número de ajuste descargo');

  // ---------------------------------------------------------------
  // PRUEBA DE IMPRESIÓN DOCUMENTAL
  // ---------------------------------------------------------------
  console.log('\n--- PRUEBA 3: IMPRESIÓN DE COMPROBANTE OFICIAL ---');

  const ticketHtml = DocumentTemplates.movimientoTicket(descargoAjuste, AppState.config);
  assert(ticketHtml.includes(descargoAjuste.numero_ajuste), 'Ticket incluye número de descargo');
  assert(ticketHtml.includes('doc-movimiento-ticket'), 'Ticket aplica clase doc-movimiento-ticket');

  const cartaHtml = DocumentTemplates.movimientoCarta(descargoAjuste, AppState.config);
  assert(cartaHtml.includes(descargoAjuste.numero_ajuste), 'Carta incluye número de descargo');
  assert(cartaHtml.includes('doc-movimiento-sheet'), 'Carta aplica estilos documentales');

  const a4Html = DocumentTemplates.movimientoA4(descargoAjuste, AppState.config);
  assert(a4Html.includes(descargoAjuste.numero_ajuste), 'A4 incluye número de descargo');
  assert(a4Html.includes('doc-a4-movimiento'), 'A4 aplica estilos documentales');

  // ---------------------------------------------------------------
  // PRUEBA DE CONCILIACIÓN
  // ---------------------------------------------------------------
  console.log('\n--- PRUEBA 4: ESTADO DE CONCILIACIÓN DE INVENTARIO ---');

  const resConciliacion = await makeRequest('GET', '/api/inventario/conciliacion');
  assert(resConciliacion.status === 200, 'Endpoint de conciliación responde HTTP 200');
  assert(resConciliacion.data.estado_general === 'CONCILIADO_OK', 'Conciliación general es CONCILIADO_OK');
  assert(resConciliacion.data.total_diferencia === 0, 'Diferencias totales de inventario = 0');
  assert(resConciliacion.data.total_ok === resConciliacion.data.total_productos, '100% de productos conciliados exactos');

  console.log('\n====================================================');
  console.log(`PRUEBAS DE CORRECCIÓN SUPERADAS: ${passedTests}/${totalTests} [OK]`);
  console.log('====================================================');
}

runTestFlow().catch(err => {
  console.error('\n[FATAL ERROR EN PRUEBAS]:', err);
  process.exit(1);
});
