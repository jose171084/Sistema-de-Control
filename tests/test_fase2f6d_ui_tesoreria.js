/**
 * test_fase2f6d_ui_tesoreria.js - Suite de pruebas automatizadas para Fase 2F-6D:
 * Verificación Estricta de Integración UI/UX de Cajas, Tesorería, Arqueos y Cobros N:M
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const HTML_FILE = path.join(ROOT_DIR, 'public', 'index.html');
const JS_FILE = path.join(ROOT_DIR, 'public', 'app.js');
const CSS_FILE = path.join(ROOT_DIR, 'public', 'styles.css');

console.log('--- INICIANDO VERIFICACIÓN DE FASE 2F-6D (FRONTEND UI/UX) ---');

// 1. Verificación de archivos existentes
assert(fs.existsSync(HTML_FILE), 'public/index.html debe existir');
assert(fs.existsSync(JS_FILE), 'public/app.js debe existir');
assert(fs.existsSync(CSS_FILE), 'public/styles.css debe existir');
console.log('✓ Archivos frontend verificados.');

const htmlContent = fs.readFileSync(HTML_FILE, 'utf-8');
const jsContent = fs.readFileSync(JS_FILE, 'utf-8');
const cssContent = fs.readFileSync(CSS_FILE, 'utf-8');

// 2. Verificación de Botón en Sidebar
assert(htmlContent.includes('id="nav-tesoreria"'), 'Debe existir botón nav-tesoreria en el sidebar');
assert(htmlContent.includes("navigate('tesoreria')"), 'El botón debe llamar a navigate("tesoreria")');
console.log('✓ Botón de navegación Tesorería en Sidebar verificado.');

// 3. Verificación de Vista Principal
assert(htmlContent.includes('id="view-tesoreria"'), 'Debe existir sección view-tesoreria');
assert(htmlContent.includes('id="tesoreriaCuentasCardsContainer"'), 'Debe existir contenedor de tarjetas de balance');
assert(htmlContent.includes('id="tesoreriaTurnosAlertaContainer"'), 'Debe existir contenedor de alerta de turnos');
assert(htmlContent.includes('id="tab-tesoreria-movimientos"'), 'Debe existir pestaña movimientos');
assert(htmlContent.includes('id="tab-tesoreria-gastos"'), 'Debe existir pestaña gastos');
assert(htmlContent.includes('id="tab-tesoreria-anticipos"'), 'Debe existir pestaña anticipos');
assert(htmlContent.includes('id="tab-tesoreria-arqueos"'), 'Debe existir pestaña arqueos');
console.log('✓ Estructura de vista principal y pestañas verificada.');

// 4. Verificación de Modales
const modalesRequeridos = [
  'modalAperturaCaja',
  'modalCierreCaja',
  'modalTransferenciaTesoreria',
  'modalGastoOperativo',
  'modalPagoMultipleNM',
  'modalAplicarAnticipo'
];

modalesRequeridos.forEach(m => {
  assert(htmlContent.includes(`id="${m}"`), `Debe existir modal ${m}`);
});
console.log(`✓ Los ${modalesRequeridos.length} modales de Tesorería están integrados en el HTML.`);

// 5. Verificación de Funciones JavaScript en app.js
const funcionesRequeridas = [
  'loadTesoreria',
  'renderTesoreriaCards',
  'cambiarTabTesoreria',
  'loadTesoreriaMovimientos',
  'renderTablaPagosTesoreria',
  'loadTesoreriaGastos',
  'renderTablaGastosTesoreria',
  'loadTesoreriaAnticipos',
  'renderTablaAnticiposTesoreria',
  'loadTesoreriaArqueos',
  'renderTablaArqueosTesoreria',
  'openModalAperturaCaja',
  'submitAperturaCaja',
  'openModalCierreCaja',
  'submitCierreCaja',
  'openModalTransferenciaTesoreria',
  'submitTransferenciaTesoreria',
  'openModalGastoOperativo',
  'submitGastoOperativo',
  'openModalCobroMultipleNM',
  'submitCobroMultipleNM',
  'openModalAplicarAnticipo',
  'submitAplicarAnticipo',
  'anularPagoModal'
];

funcionesRequeridas.forEach(fn => {
  assert(jsContent.includes(`function ${fn}`), `Debe existir función ${fn} en app.js`);
});
console.log(`✓ Las ${funcionesRequeridas.length} funciones controladoras están implementadas en app.js.`);

// 6. Verificación de Integración en el Router navigate()
assert(jsContent.includes("'tesoreria'"), "El router navigate debe incluir 'tesoreria'");
assert(jsContent.includes("if (viewName === 'tesoreria') loadTesoreria();"), "El router debe disparar loadTesoreria()");
console.log('✓ Router SPA navigate() actualizado y conectado a Tesorería.');

// 7. Verificación de Estilos CSS
assert(cssContent.includes('.tab-tesoreria-btn'), 'styles.css debe contener estilos para tabs de tesorería');
assert(cssContent.includes('.badge-arqueo-cuadrado'), 'styles.css debe contener estilos para arqueo cuadrado');
console.log('✓ Estilos visuales de Tesorería verificados en styles.css.');

// 8. Verificación de Cache-Busting
assert(htmlContent.includes('styles.css?v=2.6.0'), 'Debe utilizar cache-buster styles.css?v=2.6.0');
assert(htmlContent.includes('app.js?v=2.6.0'), 'Debe utilizar cache-buster app.js?v=2.6.0');
console.log('✓ Cache-Buster v=2.6.0 validado para prevención de caché en navegadores.');

console.log('\n=======================================================');
console.log('TODAS LAS VERIFICACIONES DE FASE 2F-6D PASARON AL 100%');
console.log('=======================================================');
