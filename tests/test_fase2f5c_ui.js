/**
 * TEST SUITE: FASE 2F-5C — FRONTEND + DOCUMENTPRINTER DE AJUSTES DE INVENTARIO
 * Cubre UI-01 a UI-20. Ejecuta app.js real en un DOM simulado y opera contra el servidor real (127.0.0.1:8000).
 * El runner restaura inventario.db desde backup al finalizar (ningún dato de prueba persiste).
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const APP_JS_PATH = path.join(__dirname, '..', 'public', 'app.js');
const INDEX_HTML_PATH = path.join(__dirname, '..', 'public', 'index.html');
const STYLES_PATH = path.join(__dirname, '..', 'public', 'styles.css');

let passed = 0;
let total = 0;
const porGrupo = {};
let grupoActual = '';

function grupo(nombre) { grupoActual = nombre; porGrupo[nombre] = { ok: 0, total: 0 }; console.log(`\n--- ${nombre} ---`); }
function assert(cond, msg) {
  total++; porGrupo[grupoActual].total++;
  if (cond) { passed++; porGrupo[grupoActual].ok++; console.log(`  [PASS] ${total}: ${msg}`); }
  else { console.error(`  [FAIL] ${total}: ${msg}`); throw new Error('Assertion failed: ' + msg); }
}

function makeRequest(method, reqPath, data = null) {
  return new Promise((resolve, reject) => {
    const payloadStr = data ? JSON.stringify(data) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (payloadStr) headers['Content-Length'] = Buffer.byteLength(payloadStr);
    const req = http.request({ hostname: '127.0.0.1', port: 8000, path: reqPath, method, headers }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(body) }); } catch (e) { resolve({ status: res.statusCode, raw: body }); } });
    });
    req.on('error', reject);
    if (payloadStr) req.write(payloadStr);
    req.end();
  });
}

// ---------------- DOM SIMULADO ----------------
const mockElements = {};
class MockElement {
  constructor(id, tagName = 'div') {
    this.id = id;
    this.tagName = tagName.toUpperCase();
    this.className = '';
    this.children = [];
    this._innerHTML = '';
    this.textContent = '';
    this.value = '';
    this.attributes = {};
    this.disabled = false;
    this.readOnly = false;
    this.required = false;
    this.title = '';
    this.style = {};
    const set = new Set();
    this.classList = {
      _classes: set,
      add: (...c) => c.forEach(x => set.add(x)),
      remove: (...c) => c.forEach(x => set.delete(x)),
      contains: (c) => set.has(c)
    };
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(v) { this._innerHTML = String(v); if (v === '') this.children = []; }
  setAttribute(a, v) { this.attributes[a] = String(v); }
  getAttribute(a) { return this.attributes[a] !== undefined ? this.attributes[a] : null; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  appendChild(ch) { this.children.push(ch); return ch; }
  remove() {}
  closest() { return null; }
}
function el(id, tag) { if (!mockElements[id]) mockElements[id] = new MockElement(id, tag); return mockElements[id]; }

global.mockRows = [];
global.document = {
  title: 'Sistema',
  getElementById: (id) => el(id),
  querySelectorAll: (sel) => (sel === '.ajuste-item-row' ? global.mockRows : []),
  createElement: (tag) => new MockElement('dyn_' + Math.random(), tag),
  addEventListener: () => {},
  removeEventListener: () => {},
  body: new MockElement('body', 'body'),
  head: new MockElement('head', 'head')
};

const listeners = {};
let windowPrintCalls = 0;
global.window = {
  print: () => { windowPrintCalls++; },
  addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
  removeEventListener: (ev, fn) => { listeners[ev] = (listeners[ev] || []).filter(f => f !== fn); },
  requestAnimationFrame: (cb) => cb(),
  location: { hostname: '127.0.0.1', protocol: 'http:', host: '127.0.0.1:8000', origin: 'http://127.0.0.1:8000' }
};
function triggerAfterPrint() { const fns = (listeners.afterprint || []).slice(); listeners.afterprint = []; fns.forEach(f => f()); }

let alertMsgs = [];
let confirmResp = true;
let promptResp = 'Anulación de prueba 2F-5C';
global.alert = (m) => { alertMsgs.push(String(m)); };
global.confirm = (m) => { global.__lastConfirm = String(m); return confirmResp; };
global.prompt = () => promptResp;

const fetchLog = [];
global.fetch = async (url, options = {}) => {
  const method = (options.method || 'GET').toUpperCase();
  fetchLog.push({ method, url });
  const body = options.body ? JSON.parse(options.body) : null;
  const res = await makeRequest(method, url, body);
  return { ok: res.status >= 200 && res.status < 300, status: res.status, json: async () => res.data };
};

const appCode = fs.readFileSync(APP_JS_PATH, 'utf-8');
const indexHtml = fs.readFileSync(INDEX_HTML_PATH, 'utf-8');
const stylesCss = fs.readFileSync(STYLES_PATH, 'utf-8');
eval(appCode);
const AppState = window.AppState;
const DocumentTemplates = window.DocumentTemplates;
const DocumentPrinter = window.DocumentPrinter;

// ---------------- HELPERS DE PRUEBA ----------------
function mockRow({ productoId, stock, cpp, costoRep = '', codigo = 'SKU', nombre = 'Producto', cantidad = '1', costo = '' }) {
  const row = new MockElement('row_' + Math.random());
  const select = new MockElement('sel', 'select');
  select.value = String(productoId);
  const attrs = { 'data-stock': String(stock), 'data-costo-cpp': cpp === null ? '' : String(cpp), 'data-costo-reposicion': String(costoRep), 'data-codigo': codigo, 'data-nombre': nombre };
  select.selectedOptions = [{ value: String(productoId), getAttribute: (a) => (attrs[a] !== undefined ? attrs[a] : null) }];
  const parts = {
    '.ajuste-prod-select': select,
    '.ajuste-cant-input': Object.assign(new MockElement('cant', 'input'), { value: String(cantidad) }),
    '.ajuste-costo-input': Object.assign(new MockElement('costo', 'input'), { value: String(costo) }),
    '.ajuste-costo-label': new MockElement('lbl'),
    '.ajuste-result-badge': new MockElement('badge'),
    '.ajuste-prod-info': new MockElement('info'),
    '.ajuste-row-preview': new MockElement('prev')
  };
  row.querySelector = (s) => parts[s] || null;
  row._parts = parts;
  return row;
}
function setForm(o) {
  el('ajusteTipo').value = o.tipo || 'CARGO';
  el('ajusteMotivo').value = o.subtipo || '';
  el('ajusteFecha').value = new Date().toISOString().split('T')[0];
  el('ajusteObservaciones').value = o.observaciones || '';
  el('ajusteMotivoTexto').value = o.motivoTexto || '';
  el('ajusteDocumentoReferencia').value = o.documento || '';
  el('ajusteAutorizadoPor').value = o.autorizado || '';
  el('ajusteJustificacion').value = o.justificacion || '';
  el('ajusteReferenciaId').value = o.referencia || '';
}
function filaDe(html, numero) {
  return html.split('<tr').find(seg => seg.includes(numero)) || '';
}
async function producto(id) {
  const r = await makeRequest('GET', '/api/productos');
  return r.data.find(p => p.id === id);
}
async function crearAjusteAPI(payload) {
  const r = await makeRequest('POST', '/api/inventario/ajustes', Object.assign({ idempotency_key: 'TEST-2F5C-' + Math.random().toString(36).slice(2) }, payload));
  if (r.status !== 201) throw new Error('No se pudo crear ajuste de prueba: ' + JSON.stringify(r.data));
  return r.data;
}
function contarPost(desde, pathPrefix) { return fetchLog.slice(desde).filter(f => f.method === 'POST' && (!pathPrefix || f.url.startsWith(pathPrefix))).length; }

async function run() {
  console.log('====================================================');
  console.log('FASE 2F-5C — PRUEBAS DE FRONTEND + DOCUMENTPRINTER');
  console.log('====================================================');

  const prods = (await makeRequest('GET', '/api/productos')).data.filter(p => p.tipo === 'producto' && p.stock > 0 && p.costo_cpp > 0);
  AppState.productos = prods;
  AppState.config = (await makeRequest('GET', '/api/config')).data || {};
  const P = (i) => prods[i];
  if (prods.length < 4) throw new Error('Se requieren al menos 4 productos con stock y CPP > 0');

  // ---------------- UI-01 ----------------
  grupo('UI-01 Selector de subtipos canónicos');
  const cargos = getSubtiposAjusteUI('CARGO').map(x => x.value);
  const descargos = getSubtiposAjusteUI('DESCARGO').map(x => x.value);
  assert(JSON.stringify(cargos) === JSON.stringify(['CARGO_SOBRANTE_CONTEO', 'CARGO_HALLAZGO_CON_SOPORTE', 'CARGO_TASACION_MANUAL']), 'CARGO expone exactamente los 3 subtipos canónicos');
  assert(JSON.stringify(descargos) === JSON.stringify(['DESCARGO_MERMA', 'DESCARGO_VENCIMIENTO', 'DESCARGO_ROTURA', 'DESCARGO_USO_INTERNO', 'DESCARGO_PERDIDA_NO_EXPLICADA']), 'DESCARGO expone exactamente los 5 subtipos canónicos');
  el('ajusteTipo').value = 'CARGO'; onAjusteTipoChange();
  let opts = el('ajusteMotivo').children.map(o => o.value);
  assert(opts[0] === '' && opts.length === 4, 'Selector CARGO: placeholder vacío + 3 opciones (selección explícita obligatoria)');
  assert(el('ajusteMotivo').children[1].textContent.includes('CARGO_SOBRANTE_CONTEO') && el('ajusteMotivo').children[1].textContent.includes('Sobrante de Conteo'), 'Opción muestra etiqueta y código canónico');
  assert(el('ajusteMotivo').value === '', 'Ningún subtipo preseleccionado');
  el('ajusteTipo').value = 'DESCARGO'; onAjusteTipoChange();
  opts = el('ajusteMotivo').children.map(o => o.value);
  assert(opts.length === 6 && opts.slice(1).every(v => descargos.includes(v)), 'Selector DESCARGO: placeholder + 5 subtipos canónicos');
  el('ajusteTipo').value = 'CARGO'; el('ajusteMotivo').value = 'CARGO_SOBRANTE_CONTEO'; onAjusteSubtipoChange();
  assert(el('ajusteSubtipoDescripcion').innerHTML.includes('Diferencia positiva detectada en conteo físico. Se valorará al CPP vigente.'), 'Descripción exacta de Sobrante de Conteo');

  // ---------------- UI-02 ----------------
  grupo('UI-02 Regularización / ajuste manual sin subtipo no disponible');
  ['CARGO', 'DESCARGO'].forEach(t => {
    el('ajusteTipo').value = t; onAjusteTipoChange();
    const vals = el('ajusteMotivo').children.map(o => String(o.value).toLowerCase());
    assert(!vals.includes('regularizacion') && !vals.includes('ajuste_manual'), `Selector ${t} no ofrece 'regularizacion' ni 'ajuste_manual'`);
  });
  assert(resolverSubtipoAjusteUI('CARGO', 'regularizacion') === null && resolverSubtipoAjusteUI('DESCARGO', 'ajuste_manual') === null, 'Resolver rechaza motivos ambiguos');
  let errs = validarFormularioAjuste({ tipo: 'CARGO', subtipoRaw: 'regularizacion', lineas: [{ producto_id: P(0).id, cantidad: 1, stock: 10 }] });
  assert(errs.some(e => e.includes('SUBTIPO_AJUSTE_OBLIGATORIO')), 'Validación bloquea regularizacion con SUBTIPO_AJUSTE_OBLIGATORIO');
  errs = validarFormularioAjuste({ tipo: 'CARGO', subtipoRaw: '', lineas: [{ producto_id: P(0).id, cantidad: 1, stock: 10 }] });
  assert(errs.some(e => e.includes('SUBTIPO_AJUSTE_OBLIGATORIO')), 'Validación bloquea subtipo vacío');
  const modalIdx = indexHtml.indexOf('id="modalAjusteInventario"');
  const modalHtml = indexHtml.slice(modalIdx, indexHtml.indexOf('id="modalDetalleMovimientoKardex"'));
  assert(!/value="regularizacion"|value="ajuste_manual"/.test(modalHtml), 'Modal de creación no contiene opciones ambiguas');
  assert(!/<option value="regularizacion"|<option value="ajuste_manual"/.test(indexHtml), 'index.html no ofrece opciones ambiguas en ningún selector');
  const rBack = await makeRequest('POST', '/api/inventario/ajustes', { tipo_ajuste: 'CARGO', motivo: 'regularizacion', detalles: [{ producto_id: P(0).id, cantidad: 1 }] });
  assert(rBack.status === 400 && String(rBack.data.error).includes('SUBTIPO_AJUSTE_OBLIGATORIO'), 'Backend (autoridad) también rechaza regularizacion sin subtipo (HTTP 400)');

  // ---------------- UI-03 ----------------
  grupo('UI-03 Campos condicionales de Hallazgo con Soporte');
  el('ajusteTipo').value = 'CARGO'; el('ajusteMotivo').value = 'CARGO_HALLAZGO_CON_SOPORTE'; onAjusteSubtipoChange();
  assert(!el('ajusteCampoDocumentoWrap').classList.contains('hidden') && el('ajusteDocumentoReferencia').required === true, 'Documento de referencia visible y obligatorio');
  assert(el('ajusteMotivoTexto').required === true && el('ajusteMotivoTextoLabel').textContent.includes('*'), 'Motivo/observación obligatorio');
  assert(el('ajusteCampoJustificacionWrap').classList.contains('hidden') && el('ajusteCampoAutorizadoWrap').classList.contains('hidden'), 'Justificación y autorizado ocultos');
  errs = validarFormularioAjuste({ tipo: 'CARGO', subtipoRaw: 'CARGO_HALLAZGO_CON_SOPORTE', lineas: [{ producto_id: P(0).id, cantidad: 2, costo_unitario: '', stock: 10 }] });
  assert(errs.some(e => e.includes('documento de referencia')), 'Exige documento de referencia');
  assert(errs.some(e => e.includes('costo unitario de entrada debe ser mayor a 0')), 'Exige costo > 0');
  assert(errs.some(e => e.includes('motivo / observación')), 'Exige motivo/observación');
  errs = validarFormularioAjuste({ tipo: 'CARGO', subtipoRaw: 'CARGO_HALLAZGO_CON_SOPORTE', documentoReferencia: 'NE-1', motivoTexto: 'Hallazgo', lineas: [{ producto_id: P(0).id, cantidad: 2, costo_unitario: '7.5', stock: 10 }] });
  assert(errs.length === 0, 'Hallazgo completo no presenta errores');

  // ---------------- UI-04 ----------------
  grupo('UI-04 Campos condicionales de Tasación Manual');
  el('ajusteMotivo').value = 'CARGO_TASACION_MANUAL'; onAjusteSubtipoChange();
  assert(!el('ajusteCampoDocumentoWrap').classList.contains('hidden') && !el('ajusteCampoJustificacionWrap').classList.contains('hidden') && !el('ajusteCampoAutorizadoWrap').classList.contains('hidden'), 'Documento, justificación y autorizado visibles');
  assert(el('ajusteJustificacion').required && el('ajusteAutorizadoPor').required && el('ajusteDocumentoReferencia').required, 'Los tres campos son obligatorios');
  assert(!el('ajusteSubtipoAdvertencia').classList.contains('hidden') && el('ajusteSubtipoAdvertencia').innerHTML.includes('Este ajuste modifica el CPP mediante valoración ponderada y requiere autorización.'), 'Advertencia exacta visible');
  errs = validarFormularioAjuste({ tipo: 'CARGO', subtipoRaw: 'CARGO_TASACION_MANUAL', documentoReferencia: 'ACTA', lineas: [{ producto_id: P(0).id, cantidad: 2, costo_unitario: '9', stock: 10 }] });
  assert(errs.some(e => e.includes('justificación técnica')) && errs.some(e => e.includes('Autorizado por')), 'Exige justificación y autorizado_por');
  const payTas = construirPayloadAjuste({ tipo: 'CARGO', subtipoRaw: 'CARGO_TASACION_MANUAL', documentoReferencia: 'ACTA-9', autorizadoPor: 'Gerencia', justificacion: 'Informe', motivoTexto: 'Tasación', lineas: [{ producto_id: P(0).id, cantidad: '2', costo_unitario: '9' }] }, 'K1');
  assert(payTas.subtipo_ajuste === 'CARGO_TASACION_MANUAL' && payTas.documento_referencia === 'ACTA-9' && payTas.autorizado_por === 'Gerencia' && payTas.justificacion_tecnica === 'Informe' && payTas.idempotency_key === 'K1' && payTas.detalles[0].costo_unitario === 9, 'Payload de tasación usa solo campos del contrato real');
  el('ajusteMotivo').value = 'CARGO_SOBRANTE_CONTEO'; onAjusteSubtipoChange();
  assert(el('ajusteSubtipoAdvertencia').classList.contains('hidden') && el('ajusteCampoDocumentoWrap').classList.contains('hidden'), 'Al cambiar a sobrante se ocultan campos y advertencia');

  // ---------------- UI-05 ----------------
  grupo('UI-05 Descargos y sobrante sin edición de costo');
  const filaD = mockRow({ productoId: P(0).id, stock: 100, cpp: 20, costoRep: 25, codigo: 'SKU-A', nombre: 'Prod A', cantidad: '5', costo: '999' });
  global.mockRows = [filaD];
  el('ajusteTipo').value = 'DESCARGO'; onAjusteTipoChange(); el('ajusteMotivo').value = 'DESCARGO_ROTURA'; onAjusteSubtipoChange();
  assert(filaD._parts['.ajuste-costo-input'].readOnly === true, 'Costo de descargo es de solo lectura');
  assert(filaD._parts['.ajuste-costo-input'].value === '20.0000', 'Costo de descargo forzado al CPP vigente (20.0000), descartando valor manual');
  assert(filaD._parts['.ajuste-costo-label'].textContent === 'CPP vigente (solo lectura)', 'Etiqueta "CPP vigente" como costo de valoración');
  const info = filaD._parts['.ajuste-prod-info'].innerHTML;
  assert(info.includes('CPP actual:') && info.includes('Costo de reposición (referencial):') && info.includes('25.0000') && info.includes('20.0000'), 'Info diferencia visualmente CPP vs Costo de reposición');
  assert(info.includes('SKU-A') && info.includes('Prod A') && info.includes('Stock actual') && info.includes('DESCARGO_ROTURA'), 'Info muestra SKU, producto, stock, tipo/subtipo');
  const payDes = construirPayloadAjuste({ tipo: 'DESCARGO', subtipoRaw: 'DESCARGO_ROTURA', lineas: [{ producto_id: P(0).id, cantidad: '5', costo_unitario: '999' }] }, 'K2');
  assert(payDes.detalles[0].costo_unitario === undefined, 'Payload de descargo NO envía costo_unitario');
  el('ajusteTipo').value = 'CARGO'; onAjusteTipoChange(); el('ajusteMotivo').value = 'CARGO_SOBRANTE_CONTEO'; onAjusteSubtipoChange();
  assert(filaD._parts['.ajuste-costo-input'].readOnly === true && filaD._parts['.ajuste-costo-input'].value === '20.0000', 'Sobrante: CPP vigente solo lectura');
  el('ajusteMotivo').value = 'CARGO_HALLAZGO_CON_SOPORTE'; onAjusteSubtipoChange();
  assert(filaD._parts['.ajuste-costo-input'].readOnly === false, 'Hallazgo: costo de entrada editable');
  errs = validarFormularioAjuste({ tipo: 'DESCARGO', subtipoRaw: 'DESCARGO_MERMA', lineas: [{ producto_id: P(0).id, cantidad: 101, stock: 100 }] });
  assert(errs.some(e => e.includes('supera el stock disponible')), 'Descargo bloquea cantidad superior al stock');

  // ---------------- UI-06 ----------------
  grupo('UI-06 Previsualización CPP');
  let pv = calcularPreviewAjusteCPP({ subtipo: 'CARGO_SOBRANTE_CONTEO', stock: 100, cpp: 20, cantidad: 10 });
  assert(pv.valido && pv.stockResultante === 110 && pv.cppResultante.toFixed(4) === '20.0000' && pv.cppActual.toFixed(4) === '20.0000', 'Sobrante 100 + 10 → 110, CPP 20.0000 → 20.0000');
  pv = calcularPreviewAjusteCPP({ subtipo: 'CARGO_HALLAZGO_CON_SOPORTE', stock: 100, cpp: 20, cantidad: 10, costo: 30 });
  assert(pv.valido && pv.stockResultante === 110 && pv.cppResultante.toFixed(4) === '20.9091', 'Hallazgo 100@20 + 10@30 → CPP 20.9091');
  pv = calcularPreviewAjusteCPP({ subtipo: 'CARGO_TASACION_MANUAL', stock: 0, cpp: 15, cantidad: 4, costo: 12.5 });
  assert(pv.valido && pv.cppResultante === 12.5, 'Tasación con stock 0 → CPP = costo de entrada');
  pv = calcularPreviewAjusteCPP({ subtipo: 'DESCARGO_MERMA', stock: 100, cpp: 20, cantidad: 30 });
  assert(pv.valido && pv.stockResultante === 70 && pv.cppResultante === 20 && pv.valorMovimiento === 600, 'Descargo conserva CPP y valora al CPP vigente');
  pv = calcularPreviewAjusteCPP({ subtipo: 'DESCARGO_MERMA', stock: 10, cpp: 20, cantidad: 30 });
  assert(!pv.valido && pv.mensaje.includes('supera el stock'), 'Descargo excedente marcado como bloqueado');
  pv = calcularPreviewAjusteCPP({ subtipo: 'CARGO_SOBRANTE_CONTEO', stock: 10, cpp: 0, cantidad: 1 });
  assert(!pv.valido && pv.mensaje.includes('CPP vigente inválido'), 'Sobrante con CPP inválido advierte bloqueo');
  const filaPv = mockRow({ productoId: P(0).id, stock: 100, cpp: 20, cantidad: '10', costo: '30' });
  global.mockRows = [filaPv];
  el('ajusteTipo').value = 'CARGO'; el('ajusteMotivo').value = 'CARGO_HALLAZGO_CON_SOPORTE'; onAjusteSubtipoChange();
  const prevHtml = el('ajustePreviewCPP').innerHTML;
  assert(prevHtml.includes('Previsualización') && prevHtml.includes('no constituye confirmación contable'), 'Panel indica que es previsualización, no confirmación contable');
  assert(prevHtml.includes('20.0000') && prevHtml.includes('20.9091'), 'Panel muestra CPP anterior → CPP nuevo');
  const rp = filaPv._parts['.ajuste-row-preview'].innerHTML;
  assert(['Stock actual', 'CPP actual', 'Cantidad', 'Costo de entrada', 'Stock resultante', 'CPP resultante'].every(k => rp.includes(k)), 'Fila muestra los 6 campos de previsualización');

  // ---------------- UI-07 ----------------
  grupo('UI-07 Bloqueo SKU duplicado');
  errs = validarFormularioAjuste({ tipo: 'CARGO', subtipoRaw: 'CARGO_SOBRANTE_CONTEO', lineas: [{ producto_id: P(0).id, cantidad: 1, codigo: 'X' }, { producto_id: P(0).id, cantidad: 2, codigo: 'X' }] });
  assert(errs.some(e => e.includes('SKU duplicado')), 'Validación detecta SKU duplicado');
  global.mockRows = [mockRow({ productoId: P(0).id, stock: P(0).stock, cpp: P(0).costo_cpp, cantidad: '1' }), mockRow({ productoId: P(0).id, stock: P(0).stock, cpp: P(0).costo_cpp, cantidad: '2' })];
  setForm({ tipo: 'CARGO', subtipo: 'CARGO_SOBRANTE_CONTEO', motivoTexto: 'dup' });
  let f0 = fetchLog.length;
  await saveAjuste({ preventDefault: () => {} });
  assert(contarPost(f0, '/api/inventario/ajustes') === 0, 'saveAjuste no envía nada al backend con SKU duplicado');
  assert(!el('ajusteErroresValidacion').classList.contains('hidden') && el('ajusteErroresValidacion').innerHTML.includes('SKU duplicado'), 'Error visible en el formulario');
  global.mockRows = [];
  recalcularAjusteTotales();

  // ---------------- UI-08 ----------------
  grupo('UI-08 Generación idempotency_key');
  const keys = new Set(Array.from({ length: 1000 }, () => generarIdempotencyKeyAjuste()));
  assert(keys.size === 1000, '1000 claves generadas son únicas');
  global.mockRows = [];
  openAjusteModal('CARGO');
  const k1 = AppState.ajusteIdempotencyKey;
  openAjusteModal('CARGO');
  const k2 = AppState.ajusteIdempotencyKey;
  assert(k1 && k2 && k1 !== k2 && k1.startsWith('AJ-UI-'), 'Cada apertura del formulario genera una clave nueva');
  // Doble clic: dos invocaciones simultáneas => un solo POST
  const pD = P(3);
  global.mockRows = [mockRow({ productoId: pD.id, stock: pD.stock, cpp: pD.costo_cpp, cantidad: '1', codigo: pD.codigo })];
  setForm({ tipo: 'CARGO', subtipo: 'CARGO_SOBRANTE_CONTEO', motivoTexto: 'Prueba doble clic 2F-5C' });
  const keyAntes = AppState.ajusteIdempotencyKey;
  f0 = fetchLog.length;
  const pr1 = saveAjuste({ preventDefault: () => {} });
  const pr2 = saveAjuste({ preventDefault: () => {} });
  await Promise.all([pr1, pr2]);
  assert(contarPost(f0, '/api/inventario/ajustes') === 1, 'Doble clic simultáneo => exactamente 1 POST');
  assert(AppState.ajusteIdempotencyKey === null, 'La clave queda consumida tras el éxito (no se reutiliza)');
  const creadoDobleClic = AppState.ultimoMovimientoInventario;
  assert(creadoDobleClic && creadoDobleClic.idempotency_key === keyAntes, 'El ajuste creado persiste exactamente la clave generada por la UI');
  // Reenvío con la misma clave => backend no duplica
  const payloadRe = { tipo_ajuste: 'CARGO', subtipo_ajuste: 'CARGO_SOBRANTE_CONTEO', motivo: 'reintento', idempotency_key: keyAntes, detalles: [{ producto_id: pD.id, cantidad: 1 }] };
  const rRe = await makeRequest('POST', '/api/inventario/ajustes', payloadRe);
  assert(rRe.status === 200 && rRe.data.duplicado_ignorado === true && rRe.data.id === creadoDobleClic.id, 'Reenvío con misma clave => HTTP 200 duplicado_ignorado (sin segundo ajuste)');
  const pD2 = await producto(pD.id);
  assert(Math.abs(pD2.stock - (pD.stock + 1)) < 1e-9, 'Stock incrementó una sola vez');
  // Mensaje UX de operación ya procesada
  const toastMsgs = [];
  const origToast = window.showToast;
  showToast = (m, t) => toastMsgs.push(String(m));
  AppState.ajusteIdempotencyKey = keyAntes;
  global.mockRows = [mockRow({ productoId: pD.id, stock: pD2.stock, cpp: pD2.costo_cpp, cantidad: '1', codigo: pD.codigo })];
  setForm({ tipo: 'CARGO', subtipo: 'CARGO_SOBRANTE_CONTEO', motivoTexto: 'reintento' });
  await saveAjuste({ preventDefault: () => {} });
  showToast = origToast;
  assert(toastMsgs.some(m => m.includes('ya fue procesada')), 'UI informa que la operación ya fue procesada');

  // ---------------- UI-09 ----------------
  grupo('UI-09 Historial activo/anulado');
  const pC = P(2);
  const ajActivo = await crearAjusteAPI({ tipo_ajuste: 'CARGO', subtipo_ajuste: 'CARGO_HALLAZGO_CON_SOPORTE', motivo: 'Hallazgo UI-09', documento_referencia: 'DOC-UI09', detalles: [{ producto_id: pC.id, cantidad: 2, costo_unitario: pC.costo_cpp }] });
  const pB0 = P(1);
  const ajAnular = await crearAjusteAPI({ tipo_ajuste: 'DESCARGO', subtipo_ajuste: 'DESCARGO_MERMA', motivo: 'Merma UI-09', detalles: [{ producto_id: pB0.id, cantidad: 1 }] });
  const rAn = await makeRequest('POST', `/api/inventario/ajustes/${ajAnular.id}/anular`, { motivo: 'Prueba historial' });
  assert(rAn.status === 200, 'Anulación preparatoria aceptada por backend');
  await cargarHistorialAjustes();
  el('ajusteFilterTipo').value = ''; el('ajusteFilterMotivo').value = ''; el('ajusteSearchInput').value = '';
  renderHistorialAjustes(AppState.historialAjustes);
  let tb = el('ajustesTableBody').innerHTML;
  const fA = filaDe(tb, ajActivo.numero_ajuste);
  const fN = filaDe(tb, ajAnular.numero_ajuste);
  assert(fA.includes('ACTIVO') && fA.includes('anularAjusteInventarioUI(') && fA.includes('Ver / Reimprimir'), 'Fila ACTIVA: ver, imprimir y anular');
  assert(fN.includes('ANULADO') && !fN.includes('anularAjusteInventarioUI(') && fN.includes('Ver / Reimprimir'), 'Fila ANULADA: ver/imprimir, SIN botón anular');
  assert(fA.includes('CARGO_HALLAZGO_CON_SOPORTE') && fA.includes('DOC-UI09') && fA.includes('Usuario #'), 'Fila muestra subtipo, documento de referencia y usuario');
  await enriquecerHistorialAjustesCPP(AppState.historialAjustes, 200);
  renderHistorialAjustes(AppState.historialAjustes);
  tb = el('ajustesTableBody').innerHTML;
  assert(filaDe(tb, ajActivo.numero_ajuste).includes('&rarr;') && filaDe(tb, ajActivo.numero_ajuste).includes(Number(pC.costo_cpp).toFixed(4)), 'Fila muestra CPP anterior → CPP nuevo');
  el('ajusteFilterMotivo').value = '__anulado__'; filtrarHistorialAjustes();
  tb = el('ajustesTableBody').innerHTML;
  assert(tb.includes(ajAnular.numero_ajuste) && !tb.includes(ajActivo.numero_ajuste), 'Filtro "Solo anulados" funciona');
  el('ajusteFilterMotivo').value = 'cargo_hallazgo_con_soporte'; filtrarHistorialAjustes();
  tb = el('ajustesTableBody').innerHTML;
  assert(tb.includes(ajActivo.numero_ajuste) && !tb.includes(ajAnular.numero_ajuste), 'Filtro por subtipo canónico funciona');
  el('ajusteFilterMotivo').value = '';
  f0 = fetchLog.length;
  const resYa = await anularAjusteInventarioUI(ajAnular.id);
  assert(resYa.estado === 'ya_anulado' && contarPost(f0) === 0, 'Ajuste anulado no puede volver a anularse (sin POST)');

  // ---------------- UI-10 ----------------
  grupo('UI-10 Detalle completo');
  await abrirComprobanteAjuste(ajActivo.id);
  const det = el('previewComprobanteAjusteContenido').innerHTML;
  const dAct = AppState.ultimoMovimientoInventario;
  const linea = dAct.detalles[0];
  ['Documento', 'Número', 'Fecha', 'Estado', 'Usuario', 'Motivo', 'Referencia', 'Autorización', 'Subtipo'].forEach(k => assert(det.includes(k), `Sección Documento incluye "${k}"`));
  assert(det.includes(ajActivo.numero_ajuste) && det.includes('DOC-UI09') && det.includes('ACTIVO'), 'Número, referencia y estado reales');
  assert(det.includes(`SKU ${linea.producto_codigo}`) && det.includes(linea.producto_nombre) && det.includes('ENTRADA') && det.includes('CARGO_HALLAZGO_CON_SOPORTE'), 'Producto: SKU, descripción, sentido y subtipo');
  assert(det.includes(Number(linea.stock_anterior).toFixed(4)) && det.includes(Number(linea.stock_nuevo).toFixed(4)), 'Valoración: stock anterior y nuevo');
  assert(det.includes(_cppDocTxt(linea.cpp_anterior)) && det.includes(_cppDocTxt(linea.cpp_nuevo)), 'Valoración: CPP anterior y nuevo');
  assert(det.includes(Number(linea.costo_unitario).toFixed(4)) && det.includes(Number(linea.costo_total).toFixed(2)), 'Valoración: costo unitario aplicado y costo total');
  assert(det.includes(`documento_id=${dAct.id}`) && det.includes(`documento_linea_id=${linea.id}`) && det.includes('Ajuste relacionado'), 'Trazabilidad: documento_id, documento_linea_id, ajuste relacionado');
  assert(!el('modalComprobanteAjuste').classList.contains('hidden'), 'Modal de detalle abierto');

  // ---------------- UI-11 ----------------
  grupo('UI-11 Anulación exitosa');
  const pA = P(0);
  const antesA = await producto(pA.id);
  const ajTop = await crearAjusteAPI({ tipo_ajuste: 'CARGO', subtipo_ajuste: 'CARGO_TASACION_MANUAL', motivo: 'Tasación UI-11', documento_referencia: 'ACTA-UI11', autorizado_por: 'Gerencia', justificacion_tecnica: 'Informe técnico', detalles: [{ producto_id: pA.id, cantidad: 3, costo_unitario: Number(antesA.costo_cpp) * 2 }] });
  const durA = await producto(pA.id);
  assert(Math.abs(durA.stock - (antesA.stock + 3)) < 1e-9 && durA.costo_cpp !== antesA.costo_cpp, 'Ajuste de tasación modificó stock y CPP');
  await cargarHistorialAjustes();
  confirmResp = true; promptResp = 'Error de digitación UI-11';
  const resAn = await anularAjusteInventarioUI(ajTop.id);
  assert(global.__lastConfirm.includes(window.MSG_CONFIRMACION_ANULACION_AJUSTE), 'Confirmación explícita con el texto exacto requerido');
  assert(resAn.estado === 'anulado', 'Resultado: anulado');
  const postA = await producto(pA.id);
  assert(Math.abs(postA.stock - antesA.stock) < 1e-9 && Math.abs(postA.costo_cpp - antesA.costo_cpp) < 1e-9, 'Stock y CPP restaurados exactamente al estado anterior');
  const dAn = (await makeRequest('GET', `/api/inventario/ajustes/${ajTop.id}`)).data;
  assert(dAn.estado === 'anulado' && dAn.motivo_anulacion === 'Error de digitación UI-11', 'Backend registra estado anulado y motivo');
  assert(filaDe(el('ajustesTableBody').innerHTML, ajTop.numero_ajuste).includes('ANULADO'), 'Historial actualizado muestra ANULADO');
  confirmResp = false;
  f0 = fetchLog.length;
  const resCancel = await anularAjusteInventarioUI(ajActivo.id);
  assert(resCancel.estado === 'cancelado' && contarPost(f0) === 0, 'Cancelar la confirmación no envía nada');
  confirmResp = true;

  // ---------------- UI-12 ----------------
  grupo('UI-12 Anulación bloqueada por movimiento posterior');
  const pB = P(1);
  const aj1 = await crearAjusteAPI({ tipo_ajuste: 'DESCARGO', subtipo_ajuste: 'DESCARGO_USO_INTERNO', motivo: 'UI-12 primero', detalles: [{ producto_id: pB.id, cantidad: 2 }] });
  await crearAjusteAPI({ tipo_ajuste: 'DESCARGO', subtipo_ajuste: 'DESCARGO_MERMA', motivo: 'UI-12 posterior', detalles: [{ producto_id: pB.id, cantidad: 1 }] });
  const antesB = await producto(pB.id);
  await cargarHistorialAjustes();
  alertMsgs = [];
  const resBl = await anularAjusteInventarioUI(aj1.id);
  assert(resBl.estado === 'bloqueado' && resBl.tipo === 'BLOQUEADA_MOVIMIENTOS_POSTERIORES', 'UI interpreta ANULACION_BLOQUEADA_MOVIMIENTOS_POSTERIORES');
  assert(alertMsgs.includes(window.MSG_ANULACION_BLOQUEADA_AJUSTE), 'Mensaje exacto mostrado al usuario');
  const despuesB = await producto(pB.id);
  assert(despuesB.stock === antesB.stock && despuesB.costo_cpp === antesB.costo_cpp, 'Nada fue modificado (stock y CPP intactos)');
  const d1 = (await makeRequest('GET', `/api/inventario/ajustes/${aj1.id}`)).data;
  assert(String(d1.estado).toLowerCase() === 'activo', 'El ajuste permanece ACTIVO');
  assert(interpretarErrorAnulacionAjuste('PERIODO_CERRADO: x') === 'PERIODO_CERRADO' && interpretarErrorAnulacionAjuste('AJUSTE_YA_ANULADO: x') === 'YA_ANULADO', 'Interpretación de otros códigos de error');

  // ---------------- UI-13 ----------------
  grupo('UI-13 Contra-ajuste sin inventar endpoint');
  assert(window.CONTRA_AJUSTE_FLUJO_BACKEND.endpoint === '/api/inventario/ajustes' && window.CONTRA_AJUSTE_FLUJO_BACKEND.campoReferencia === 'ajuste_referencia_id', 'Flujo declarado usa el endpoint existente + ajuste_referencia_id');
  assert(!/\/api\/[a-z_\/]*contra/i.test(appCode), 'app.js no contiene ningún endpoint de "contra-ajuste" inventado');
  await abrirComprobanteAjuste(aj1.id);
  assert(el('previewComprobanteAjusteContenido').innerHTML.includes('Crear contra-ajuste'), 'Detalle ofrece "Crear contra-ajuste" (flujo backend compatible existente)');
  global.mockRows = [];
  f0 = fetchLog.length;
  const prep = await prepararContraAjuste(aj1.id);
  const usados = fetchLog.slice(f0);
  assert(usados.every(f => f.method === 'GET'), 'Preparar contra-ajuste NO envía POST (no se crea automáticamente)');
  assert(prep.tipo === 'CARGO' && el('ajusteTipo').value === 'CARGO' && el('ajusteReferenciaId').value === String(aj1.id), 'Formulario pre-llenado: tipo contrario y ajuste_referencia_id');
  assert(el('ajusteMotivo').value === '' && !el('modalAjusteInventario').classList.contains('hidden'), 'Subtipo queda sin seleccionar: el usuario decide y confirma');
  assert(!el('ajusteContraAjusteBanner').classList.contains('hidden') && el('ajusteContraAjusteBanner').innerHTML.includes(aj1.numero_ajuste), 'Banner de contra-ajuste referenciado visible');
  // Confirmación manual del usuario: se registra por el MISMO endpoint con ajuste_referencia_id
  const pB2 = await producto(pB.id);
  global.mockRows = [mockRow({ productoId: pB.id, stock: pB2.stock, cpp: pB2.costo_cpp, cantidad: '2', codigo: pB.codigo })];
  el('ajusteMotivo').value = 'CARGO_SOBRANTE_CONTEO';
  f0 = fetchLog.length;
  await saveAjuste({ preventDefault: () => {} });
  const posts = fetchLog.slice(f0).filter(f => f.method === 'POST');
  assert(posts.length === 1 && posts[0].url === '/api/inventario/ajustes', 'Contra-ajuste confirmado usa únicamente POST /api/inventario/ajustes');
  const contra = AppState.ultimoMovimientoInventario;
  assert(parseInt(contra.ajuste_referencia_id, 10) === aj1.id, 'Backend persiste ajuste_referencia_id del contra-ajuste');
  const dTraz = renderDetalleAjusteHTML(contra);
  assert(dTraz.includes(aj1.numero_ajuste), 'Detalle del contra-ajuste muestra el ajuste relacionado');

  // ---------------- UI-14..17 ----------------
  const dataDoc = (await makeRequest('GET', `/api/inventario/ajustes/${ajActivo.id}`)).data;
  const formatos = [
    ['UI-14 DocumentPrinter Ticket 80mm', 'ticket80', 'doc-ticket80', 'doc-movimiento-ticket'],
    ['UI-15 DocumentPrinter Carta', 'letterPortrait', 'doc-letterPortrait', 'doc-movimiento-sheet'],
    ['UI-16 DocumentPrinter A4', 'a4Portrait', 'doc-a4Portrait', 'doc-a4-movimiento'],
    ['UI-17 DocumentPrinter Hoja', 'hoja', 'doc-letterLandscape', 'doc-movimiento-hoja']
  ];
  for (const [g, fmt, cls, docCls] of formatos) {
    grupo(g);
    AppState.ultimoMovimientoInventario = dataDoc;
    const pcBefore = windowPrintCalls;
    const ok = imprimirMovimientoActual(fmt);
    const area = el('areaImpresionOficial');
    assert(ok === true && DocumentPrinter.status === 'printing', 'Despachado vía DocumentPrinter.print (estado printing)');
    assert(document.body.classList.contains('document-printing'), 'Activa body.document-printing');
    assert(area.className.includes(cls), `#areaImpresionOficial con formato ${cls}`);
    const h = area.innerHTML;
    assert(h.includes(docCls), `Plantilla aplica ${docCls}`);
    assert(h.includes('AJUSTE — HALLAZGO CON SOPORTE') && h.includes('COMPROBANTE OFICIAL DE AJUSTE DE INVENTARIO'), 'Título dinámico canónico');
    assert(h.includes(dataDoc.numero_ajuste) && h.includes('ACTIVO') && h.includes('DOC-UI09') && h.includes('CARGO_HALLAZGO_CON_SOPORTE'), 'Encabezado/motivo: número, estado, referencia, subtipo');
    assert(h.includes(_cppDocTxt(dataDoc.detalles[0].cpp_anterior)) && h.includes(_cppDocTxt(dataDoc.detalles[0].cpp_nuevo)), 'Detalle: CPP anterior y CPP nuevo');
    assert(h.includes('N/D') && /Und/.test(h), 'Unidad informada como N/D (no se inventa)');
    assert(h.includes('Stock Resultante'), 'Resumen: stock resultante');
    assert(h.includes('VALORIZACIÓN TOTAL') || h.includes('VALUACIÓN TOTAL'), 'Resumen: valoración total');
    assert(h.includes('Total Unidades Afectadas'), 'Resumen: unidades afectadas');
    assert(h.includes('AUDITORÍA') || h.includes('Auditoría'), 'Bloque de auditoría');
    if (AppState.config && AppState.config.documento_fiscal) assert(h.includes(AppState.config.documento_fiscal), 'RIF configurado presente');
    else assert(!h.includes('RIF:'), 'Sin RIF configurado: no se inventa');
    await new Promise(r => setTimeout(r, 80));
    assert(windowPrintCalls === pcBefore + 1, 'Diálogo de impresión invocado solo por el núcleo DocumentPrinter');
    triggerAfterPrint();
    assert(DocumentPrinter.status === 'idle' && !document.body.classList.contains('document-printing') && area.innerHTML === '', 'Limpieza: estado idle y contenedor vaciado');
  }
  grupo('UI-14..17 Títulos dinámicos y documentos largos/anulados');
  const esperados = {
    CARGO_SOBRANTE_CONTEO: 'AJUSTE — SOBRANTE DE CONTEO', CARGO_HALLAZGO_CON_SOPORTE: 'AJUSTE — HALLAZGO CON SOPORTE', CARGO_TASACION_MANUAL: 'AJUSTE — TASACIÓN MANUAL',
    DESCARGO_MERMA: 'DESCARGO — MERMA', DESCARGO_VENCIMIENTO: 'DESCARGO — VENCIMIENTO', DESCARGO_ROTURA: 'DESCARGO — ROTURA',
    DESCARGO_USO_INTERNO: 'DESCARGO — USO INTERNO', DESCARGO_PERDIDA_NO_EXPLICADA: 'DESCARGO — PÉRDIDA NO EXPLICADA'
  };
  Object.entries(esperados).forEach(([s, t]) => assert(getTituloMovimientoInventario({ subtipo_ajuste: s, tipo_ajuste: s.startsWith('CARGO') ? 'CARGO' : 'DESCARGO' }) === t, `Título ${t}`));
  const largo = Object.assign({}, dataDoc, { detalles: Array.from({ length: 40 }, (_, i) => Object.assign({}, dataDoc.detalles[0], { id: 9000 + i, producto_codigo: `LARGO-${i + 1}` })) });
  const a4Largo = DocumentTemplates.movimientoA4(largo, AppState.config);
  assert(a4Largo.includes('LARGO-40') && a4Largo.includes('<thead>') && a4Largo.includes('avoid-page-break'), 'A4 soporta 40 líneas con encabezado repetible');
  const docAnul = DocumentTemplates.movimientoCarta(dAn, AppState.config);
  assert(docAnul.includes('DOCUMENTO ANULADO') && docAnul.includes('ANULADO') && docAnul.includes('Error de digitación UI-11'), 'Comprobante de ajuste anulado muestra estado y motivo');

  // ---------------- UI-18 ----------------
  grupo('UI-18 No utiliza window.print()');
  ['imprimirMovimientoActual', 'abrirComprobanteAjuste', 'saveAjuste', 'anularAjusteInventarioUI', 'prepararContraAjuste', 'renderDetalleAjusteHTML', 'openAjusteModal', 'recalcularAjusteTotales'].forEach(fn => {
    const src = eval(fn).toString();
    assert(!src.includes('window.print'), `${fn} no invoca window.print()`);
  });
  assert(eval('imprimirMovimientoActual').toString().includes('DocumentPrinter.print'), 'imprimirMovimientoActual delega en DocumentPrinter.print');

  // ---------------- UI-19 ----------------
  grupo('UI-19 No imprime la página completa');
  assert(stylesCss.includes('body.document-printing > *:not(#areaImpresionOficial)'), 'CSS oculta todo excepto #areaImpresionOficial');
  assert(indexHtml.includes('id="areaImpresionOficial"'), 'Contenedor oficial presente');
  ['ticket80', 'letterPortrait', 'a4Portrait', 'hoja'].forEach(fmt => {
    AppState.ultimoMovimientoInventario = dataDoc;
    imprimirMovimientoActual(fmt);
    const h = el('areaImpresionOficial').innerHTML;
    assert(!h.includes('<button') && !h.includes('<form') && !h.includes('onclick=') && !h.includes('<select') && !h.includes('sidebar'), `${fmt}: sin botones, formularios, navegación ni menú`);
    triggerAfterPrint();
  });
  assert(renderDetalleAjusteHTML(dataDoc).includes('no-print'), 'Acciones de pantalla marcadas no-print');

  // ---------------- UI-20 ----------------
  grupo('UI-20 No rompe flujo existente');
  assert(typeof cargarHistorialAjustes === 'function' && typeof filtrarHistorialAjustes === 'function' && typeof limpiarFiltrosAjustes === 'function' && typeof cambiarSubtabProductos === 'function', 'Funciones de historial/subpestañas intactas');
  assert(formatMotivoAjuste('regularizacion') === 'Regularización' && formatMotivoAjuste('sobrante') === 'Sobrante físico', 'Registros históricos conservan su etiqueta');
  assert(getTituloMovimientoInventario({ tipo_ajuste: 'DESCARGO', motivo: 'merma' }) === 'COMPROBANTE DE DESCARGO POR MERMA OPERATIVA', 'Títulos legados intactos para registros sin subtipo');
  assert(resolverSubtipoAjusteUI('CARGO', 'sobrante') === 'CARGO_SOBRANTE_CONTEO' && resolverSubtipoAjusteUI('DESCARGO', 'merma') === 'DESCARGO_MERMA', 'Alias legados no ambiguos siguen funcionando');
  ['facturaTicket', 'facturaCarta', 'facturaA4', 'devolucionTicket', 'devolucionCarta', 'devolucionA4', 'movimientoTicket', 'movimientoCarta', 'movimientoA4', 'movimientoHoja'].forEach(t => assert(typeof DocumentTemplates[t] === 'function', `Plantilla ${t} disponible`));
  assert(typeof imprimirFacturaActual === 'function' && typeof imprimirDevolucionActual === 'function', 'Impresión de facturas y devoluciones intacta');
  const conc = await makeRequest('GET', '/api/inventario/conciliacion');
  assert(conc.status === 200 && conc.data.estado_general === 'CONCILIADO_OK' && conc.data.total_diferencia === 0 && conc.data.total_ok === conc.data.total_productos, 'Conciliación CONCILIADO_OK con diferencia 0 tras todas las operaciones UI');

  console.log('\n====================================================');
  Object.entries(porGrupo).forEach(([g, r]) => console.log(`  ${g}: ${r.ok}/${r.total}`));
  console.log(`FASE 2F-5C — PRUEBAS UI SUPERADAS: ${passed}/${total} [${passed === total ? 'OK' : 'FAIL'}]`);
  console.log('====================================================');
  process.exit(passed === total ? 0 : 1);
}

run().catch(err => {
  console.error('\n[FATAL ERROR EN PRUEBAS 2F-5C]:', err);
  console.log(`Resultado parcial: ${passed}/${total}`);
  process.exit(1);
});
