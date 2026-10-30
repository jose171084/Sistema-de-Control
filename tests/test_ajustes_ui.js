/**
 * TEST SUITE: FASE 2E-3 — ADECUACIÓN DE INTERFAZ
 * GESTIÓN E HISTORIAL DE AJUSTES DE INVENTARIO
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
    const headers = {
      'Content-Type': 'application/json'
    };
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
    if (payloadStr) {
      req.write(payloadStr);
    }
    req.end();
  });
}

// -------------------------------------------------------------
// MOCK DE ENTORNO NAVEGADOR / DOM
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
  }
  setAttribute(attr, val) { this.attributes[attr] = String(val); }
  getAttribute(attr) { return this.attributes[attr]; }
}

function getOrCreateMock(id, tagName = 'div') {
  if (!mockElements[id]) {
    mockElements[id] = new MockElement(id, tagName);
  }
  return mockElements[id];
}

global.document = {
  getElementById: (id) => getOrCreateMock(id),
  querySelectorAll: () => [],
  createElement: (tag) => new MockElement('dyn_' + Math.random(), tag),
  addEventListener: () => {},
  removeEventListener: () => {}
};

global.window = {
  print: () => {},
  addEventListener: () => {}
};

global.alert = (msg) => console.log('  [Alert Mock]:', msg);

// Instanciar AppState y helpers
global.AppState = {
  config: {},
  productos: [],
  historialAjustes: [],
  productoSubtab: 'catalogo',
  ultimoMovimientoInventario: null,
  ultimoAjusteInventario: null
};

// Simular fetch global en entorno de prueba
global.fetch = async (url) => {
  const res = await makeRequest('GET', url);
  return {
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
    json: async () => res.data
  };
};

// Cargar código de app.js
const appCode = fs.readFileSync(APP_JS_PATH, 'utf-8');
const indexHtml = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');

// Ejecutar contexto controlado
eval(appCode);

// Sincronizar AppState global expuesto por app.js
global.AppState = window.AppState;
const AppState = window.AppState;
const DocumentTemplates = window.DocumentTemplates;

async function runTests() {
  console.log('====================================================');
  console.log('INICIANDO PRUEBAS: ADECUACIÓN DE INTERFAZ DE AJUSTES');
  console.log('====================================================\n');

  // ---------------------------------------------------------------
  // SECCIÓN 1: ESTRUCTURA HTML EN index.html
  // ---------------------------------------------------------------
  console.log('--- GRUPO 1: VERIFICACIÓN DE ESTRUCTURA EN index.html ---');

  assert(indexHtml.includes('id="btnSubtabProdCatalogo"'), 'Existe botón para subpestaña Catálogo de Productos');
  assert(indexHtml.includes('id="btnSubtabProdAjustes"'), 'Existe botón para subpestaña Ajustes de Inventario');
  assert(indexHtml.includes('id="subtabProdCatalogoContainer"'), 'Existe contenedor para vista Catálogo');
  assert(indexHtml.includes('id="subtabProdAjustesContainer"'), 'Existe contenedor para vista Ajustes');
  assert(indexHtml.includes('cambiarSubtabProductos(\'catalogo\')'), 'Botón Catálogo invoca cambiarSubtabProductos');
  assert(indexHtml.includes('cambiarSubtabProductos(\'ajustes\')'), 'Botón Ajustes invoca cambiarSubtabProductos');

  // Cabecera y botón Nuevo Ajuste
  assert(indexHtml.includes('Gestiona cargos, descargos y movimientos de ajuste de existencias.'), 'Texto secundario de cabecera exacto');
  assert(indexHtml.includes('Nuevo Ajuste de Inventario'), 'Botón Nuevo Ajuste presente en cabecera');
  assert(indexHtml.includes('openAjusteModal()'), 'Botón Nuevo Ajuste llama a openAjusteModal()');

  // Filtros y búsqueda
  assert(indexHtml.includes('id="ajusteSearchInput"'), 'Existe campo de búsqueda de ajustes');
  assert(indexHtml.includes('id="ajusteFilterTipo"'), 'Existe selector de filtro por Tipo (CARGO/DESCARGO)');
  assert(indexHtml.includes('id="ajusteFilterMotivo"'), 'Existe selector de filtro por Motivo');

  // Estados visuales (Loading, Error, Empty, Tabla)
  assert(indexHtml.includes('id="ajustesLoadingState"'), 'Existe contenedor de estado de carga');
  assert(indexHtml.includes('id="ajustesErrorState"'), 'Existe contenedor de estado de error');
  assert(indexHtml.includes('id="ajustesEmptyState"'), 'Existe contenedor de estado vacío');
  assert(indexHtml.includes('No hay ajustes de inventario registrados'), 'Texto de estado vacío exacto');
  assert(indexHtml.includes('Los cargos y descargos que registres aparecerán aquí.'), 'Subtexto de estado vacío exacto');
  assert(indexHtml.includes('id="ajustesTableContainer"'), 'Existe contenedor de tabla de ajustes');
  assert(indexHtml.includes('id="ajustesTableBody"'), 'Existe cuerpo tbody de tabla de ajustes');

  // Mantenimiento del acceso rápido en catálogo y modal
  assert(indexHtml.includes('onclick="openAjusteModal()" class="bg-amber-600'), 'Acceso rápido en cabecera de catálogo conservado');
  assert(indexHtml.includes('id="modalAjusteInventario"'), 'Modal de ajuste #modalAjusteInventario conservado');
  assert(indexHtml.includes('id="modalComprobanteAjuste"'), 'Modal de comprobante #modalComprobanteAjuste conservado');

  // ---------------------------------------------------------------
  // SECCIÓN 2: LÓGICA FRONTEND EN app.js
  // ---------------------------------------------------------------
  console.log('\n--- GRUPO 2: LÓGICA DE SUBPESTAÑAS Y FORMATOS ---');

  assert(typeof cambiarSubtabProductos === 'function', 'Función cambiarSubtabProductos está definida globalmente');
  assert(typeof cargarHistorialAjustes === 'function', 'Función cargarHistorialAjustes está definida globalmente');
  assert(typeof filtrarHistorialAjustes === 'function', 'Función filtrarHistorialAjustes está definida globalmente');
  assert(typeof formatMotivoAjuste === 'function', 'Helper formatMotivoAjuste está definido');

  // Probar formatMotivoAjuste
  assert(formatMotivoAjuste('sobrante') === 'Sobrante físico', 'formatMotivoAjuste formatea sobrante');
  assert(formatMotivoAjuste('merma') === 'Merma operativa', 'formatMotivoAjuste formatea merma');
  assert(formatMotivoAjuste('vencimiento') === 'Vencimiento', 'formatMotivoAjuste formatea vencimiento');
  assert(formatMotivoAjuste('rotura') === 'Rotura o daño', 'formatMotivoAjuste formatea rotura');
  assert(formatMotivoAjuste('uso_interno') === 'Consumo / Uso interno', 'formatMotivoAjuste formatea uso interno');
  assert(formatMotivoAjuste('regularizacion') === 'Regularización', 'formatMotivoAjuste formatea regularización');

  // Probar cambio de subtab a 'catalogo'
  cambiarSubtabProductos('catalogo');
  assert(AppState.productoSubtab === 'catalogo', 'Subtab activo es catalogo');
  assert(!getOrCreateMock('subtabProdCatalogoContainer').classList.contains('hidden'), 'Contenedor catálogo es visible');
  assert(getOrCreateMock('subtabProdAjustesContainer').classList.contains('hidden'), 'Contenedor ajustes está oculto');

  // Probar cambio de subtab a 'ajustes'
  cambiarSubtabProductos('ajustes');
  assert(AppState.productoSubtab === 'ajustes', 'Subtab activo es ajustes');
  assert(getOrCreateMock('subtabProdCatalogoContainer').classList.contains('hidden'), 'Contenedor catálogo está oculto');
  assert(!getOrCreateMock('subtabProdAjustesContainer').classList.contains('hidden'), 'Contenedor ajustes es visible');

  // ---------------------------------------------------------------
  // SECCIÓN 3: OPERACIONES REALES CON BACKEND (CARGO Y DESCARGO)
  // ---------------------------------------------------------------
  console.log('\n--- GRUPO 3: TRANSACCIONALIDAD DE AJUSTES EN VIVO ---');

  // Obtener producto base para probar
  const resProds = await makeRequest('GET', '/api/productos');
  assert(resProds.status === 200 && resProds.data.length > 0, 'Servidor devuelve lista de productos');
  const testProd = resProds.data.find(p => p.tipo === 'producto');
  assert(!!testProd, 'Se identificó un producto físico de prueba: ' + testProd.nombre);
  const stockInicial = parseFloat(testProd.stock);

  // 1. Crear un CARGO de +10 unidades
  const cargoPayload = {
    tipo_ajuste: 'CARGO',
    motivo: 'sobrante',
    fecha: new Date().toISOString().split('T')[0],
    observaciones: 'Prueba UI Fase 2E-3: Cargo de prueba',
    detalles: [
      {
        producto_id: testProd.id,
        cantidad: 10.0,
        costo_unitario: testProd.costo || 15.0
      }
    ]
  };

  const resCargo = await makeRequest('POST', '/api/inventario/ajustes', cargoPayload);
  assert(resCargo.status === 201, 'POST /api/inventario/ajustes (CARGO) responde HTTP 201');
  assert(resCargo.data.success === true, 'Respuesta indica success: true');
  const cargoId = resCargo.data.id;
  assert(!!cargoId, 'Se generó ID de ajuste CARGO: ' + cargoId);

  // 2. Crear un DESCARGO compensatorio de -10 unidades
  const descargoPayload = {
    tipo_ajuste: 'DESCARGO',
    motivo: 'merma',
    fecha: new Date().toISOString().split('T')[0],
    observaciones: 'Prueba UI Fase 2E-3: Descargo compensatorio de prueba',
    detalles: [
      {
        producto_id: testProd.id,
        cantidad: 10.0,
        costo_unitario: testProd.costo || 15.0
      }
    ]
  };

  const resDescargo = await makeRequest('POST', '/api/inventario/ajustes', descargoPayload);
  assert(resDescargo.status === 201, 'POST /api/inventario/ajustes (DESCARGO) responde HTTP 201');
  assert(resDescargo.data.success === true, 'Respuesta indica success: true');
  const descargoId = resDescargo.data.id;
  assert(!!descargoId, 'Se generó ID de ajuste DESCARGO: ' + descargoId);

  // ---------------------------------------------------------------
  // SECCIÓN 4: CONSUMO Y RENDERIZADO DEL HISTORIAL DE AJUSTES
  // ---------------------------------------------------------------
  console.log('\n--- GRUPO 4: CARGA Y RENDERIZADO DEL HISTORIAL ---');

  await cargarHistorialAjustes();
  assert(AppState.historialAjustes.length >= 2, 'Historial cargó al menos los 2 ajustes creados');
  
  const ajusteCargoEncontrado = AppState.historialAjustes.find(a => a.id === cargoId);
  assert(!!ajusteCargoEncontrado, 'Se encontró el CARGO en el historial');
  assert(ajusteCargoEncontrado.tipo_ajuste === 'CARGO', 'Tipo es CARGO');
  assert(parseFloat(ajusteCargoEncontrado.total_cantidad) >= 10, 'Cantidad registrada correcta');

  const ajusteDescargoEncontrado = AppState.historialAjustes.find(a => a.id === descargoId);
  assert(!!ajusteDescargoEncontrado, 'Se encontró el DESCARGO en el historial');
  assert(ajusteDescargoEncontrado.tipo_ajuste === 'DESCARGO', 'Tipo es DESCARGO');

  // Probar renderizado en tabla HTML
  renderHistorialAjustes(AppState.historialAjustes);
  const tbodyHtml = getOrCreateMock('ajustesTableBody').innerHTML;
  assert(tbodyHtml.includes(ajusteCargoEncontrado.numero_ajuste), 'Tabla contiene número de ajuste del CARGO');
  assert(tbodyHtml.includes(ajusteDescargoEncontrado.numero_ajuste), 'Tabla contiene número de ajuste del DESCARGO');
  assert(tbodyHtml.includes('CARGO'), 'Tabla renderiza badge CARGO');
  assert(tbodyHtml.includes('DESCARGO'), 'Tabla renderiza badge DESCARGO');
  assert(tbodyHtml.includes('Sobrante físico'), 'Tabla renderiza motivo formateado');
  assert(tbodyHtml.includes('Merma operativa'), 'Tabla renderiza motivo de descargo formateado');
  assert(tbodyHtml.includes(`abrirComprobanteAjuste(${cargoId})`), 'Fila incluye llamada a abrirComprobanteAjuste');
  assert(tbodyHtml.includes('Ver / Reimprimir'), 'Botón Ver / Reimprimir está presente en fila');

  // ---------------------------------------------------------------
  // SECCIÓN 5: FILTROS Y BÚSQUEDA
  // ---------------------------------------------------------------
  console.log('\n--- GRUPO 5: FILTROS Y BÚSQUEDA EN FRONTEND ---');

  // Filtro por CARGO
  getOrCreateMock('ajusteFilterTipo').value = 'CARGO';
  getOrCreateMock('ajusteFilterMotivo').value = '';
  getOrCreateMock('ajusteSearchInput').value = '';
  filtrarHistorialAjustes();
  let tablaFiltro = getOrCreateMock('ajustesTableBody').innerHTML;
  assert(tablaFiltro.includes('CARGO'), 'Filtro CARGO muestra cargos');
  assert(!tablaFiltro.includes(ajusteDescargoEncontrado.numero_ajuste), 'Filtro CARGO excluye descargos');

  // Filtro por DESCARGO
  getOrCreateMock('ajusteFilterTipo').value = 'DESCARGO';
  filtrarHistorialAjustes();
  tablaFiltro = getOrCreateMock('ajustesTableBody').innerHTML;
  assert(tablaFiltro.includes('DESCARGO'), 'Filtro DESCARGO muestra descargos');
  assert(!tablaFiltro.includes(ajusteCargoEncontrado.numero_ajuste), 'Filtro DESCARGO excluye cargos');

  // Filtro por Búsqueda (N° de Ajuste)
  getOrCreateMock('ajusteFilterTipo').value = '';
  getOrCreateMock('ajusteSearchInput').value = ajusteCargoEncontrado.numero_ajuste;
  filtrarHistorialAjustes();
  tablaFiltro = getOrCreateMock('ajustesTableBody').innerHTML;
  assert(tablaFiltro.includes(ajusteCargoEncontrado.numero_ajuste), 'Búsqueda por número localiza el ajuste');
  assert(!tablaFiltro.includes(ajusteDescargoEncontrado.numero_ajuste), 'Búsqueda por número excluye otros ajustes');

  // Limpiar filtros
  limpiarFiltrosAjustes();
  assert(getOrCreateMock('ajusteSearchInput').value === '', 'Búsqueda se limpió');
  assert(getOrCreateMock('ajusteFilterTipo').value === '', 'Filtro de tipo se limpió');
  tablaFiltro = getOrCreateMock('ajustesTableBody').innerHTML;
  assert(tablaFiltro.includes(ajusteCargoEncontrado.numero_ajuste), 'Tabla muestra todos los ajustes tras limpiar');
  assert(tablaFiltro.includes(ajusteDescargoEncontrado.numero_ajuste), 'Tabla muestra todos los ajustes tras limpiar');

  // ---------------------------------------------------------------
  // SECCIÓN 6: INTEGRACIÓN CON DocumentPrinter Y COMPROBANTES
  // ---------------------------------------------------------------
  console.log('\n--- GRUPO 6: APERTURA Y REIMPRESIÓN DOCUMENTAL ---');

  await abrirComprobanteAjuste(cargoId);
  assert(AppState.ultimoMovimientoInventario !== null, 'AppState.ultimoMovimientoInventario cargado');
  assert(AppState.ultimoMovimientoInventario.id === cargoId, 'Comprobante cargó el ID solicitado');
  assert(!getOrCreateMock('modalComprobanteAjuste').classList.contains('hidden'), 'Modal #modalComprobanteAjuste se abrió');

  // Verificar plantillas documentales
  const tplTicket = DocumentTemplates.movimientoTicket(AppState.ultimoMovimientoInventario, AppState.config);
  assert(tplTicket.includes('COMPROBANTE OFICIAL'), 'Plantilla Ticket genera comprobante oficial');
  assert(tplTicket.includes(ajusteCargoEncontrado.numero_ajuste), 'Plantilla Ticket incluye N° de ajuste');

  const tplCarta = DocumentTemplates.movimientoCarta(AppState.ultimoMovimientoInventario, AppState.config);
  assert(tplCarta.includes('doc-movimiento-sheet'), 'Plantilla Carta aplica clase doc-movimiento-sheet');
  assert(tplCarta.includes(ajusteCargoEncontrado.numero_ajuste), 'Plantilla Carta incluye N° de ajuste');

  const tplA4 = DocumentTemplates.movimientoA4(AppState.ultimoMovimientoInventario, AppState.config);
  assert(tplA4.includes('doc-a4-movimiento'), 'Plantilla A4 aplica clase doc-a4-movimiento');

  // ---------------------------------------------------------------
  // SECCIÓN 7: COMPATIBILIDAD CON KARDEX V2
  // ---------------------------------------------------------------
  console.log('\n--- GRUPO 7: COMPATIBILIDAD CON KARDEX V2 ---');

  const resKardex = await makeRequest('GET', `/api/reportes/kardex-v2?producto_id=${testProd.id}`);
  assert(resKardex.status === 200, 'Kardex V2 responde HTTP 200');
  assert(Array.isArray(resKardex.data.movimientos), 'Kardex V2 devuelve lista de movimientos');

  // Verificar que el movimiento del ajuste aparece en Kardex
  const movAjusteEnKardex = resKardex.data.movimientos.find(m => m.documento_id === cargoId);
  assert(!!movAjusteEnKardex, 'Movimiento de ajuste CARGO registrado en el Kardex');
  assert(movAjusteEnKardex.documento_tipo === 'INVENTARIO_AJUSTE', 'Documento tipo en Kardex es INVENTARIO_AJUSTE');

  // Simular botón de imprimir desde Kardex
  verDetalleMovimientoKardex(movAjusteEnKardex);
  assert(!getOrCreateMock('kardexAjusteAcciones').classList.contains('hidden'), 'Acción de comprobante en Kardex es visible');

  // ---------------------------------------------------------------
  // SECCIÓN 8: CONCILIACIÓN DE INVENTARIO Y REGRESIÓN
  // ---------------------------------------------------------------
  console.log('\n--- GRUPO 8: CONCILIACIÓN DE INVENTARIO Y NO REGRESIÓN ---');

  const resConciliacion = await makeRequest('GET', '/api/inventario/conciliacion');
  assert(resConciliacion.status === 200, 'Endpoint conciliación responde HTTP 200');
  assert(resConciliacion.data.estado_general === 'CONCILIADO_OK', 'Estado general de conciliación: CONCILIADO_OK');
  assert(resConciliacion.data.total_diferencia === 0, 'Diferencias totales de inventario = 0');
  assert(resConciliacion.data.total_ok === resConciliacion.data.total_productos, '100% de productos conciliados exactos');

  // Endpoints del sistema
  const endpoints = ['/api/productos', '/api/clientes', '/api/proveedores', '/api/facturas', '/api/compras', '/api/devoluciones', '/api/cxc', '/api/cxp'];
  for (const ep of endpoints) {
    const resEp = await makeRequest('GET', ep);
    assert(resEp.status === 200, `Endpoint ${ep} responde HTTP 200 OK`);
  }

  console.log('\n====================================================');
  console.log(`TODAS LAS PRUEBAS COMPLETADAS CON ÉXITO: ${passedTests}/${totalTests} [OK]`);
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('\n[FATAL ERROR EN PRUEBAS]:', err);
  process.exit(1);
});
