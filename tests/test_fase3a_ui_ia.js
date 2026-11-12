/**
 * test_fase3a_ui_ia.js - Suite de pruebas automatizadas para Fase 3A Frontend:
 * Verificación de Integración UI de Inteligencia Artificial Orgánica de Inventarios.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const HTML_FILE = path.join(ROOT_DIR, 'public', 'index.html');
const JS_FILE = path.join(ROOT_DIR, 'public', 'app.js');

console.log('--- INICIANDO VERIFICACIÓN DE FASE 3A (FRONTEND IA ORGÁNICA) ---');

const htmlContent = fs.readFileSync(HTML_FILE, 'utf-8');
const jsContent = fs.readFileSync(JS_FILE, 'utf-8');

// 1. Elementos HTML en index.html
assert(htmlContent.includes('id="btnSubtabProdIa"'), 'Debe existir botón btnSubtabProdIa');
assert(htmlContent.includes('id="subtabProdIaContainer"'), 'Debe existir contenedor subtabProdIaContainer');
assert(htmlContent.includes('id="iaAlertasCriticasContainer"'), 'Debe existir contenedor de alertas críticas');
assert(htmlContent.includes('id="iaTablaDiagnosticoBody"'), 'Debe existir cuerpo de tabla de diagnóstico IA');
assert(htmlContent.includes('id="modalSimuladorPrecioIA"'), 'Debe existir modal modalSimuladorPrecioIA');
console.log('✓ Elementos HTML de Diagnóstico IA y Simulador verificados en index.html.');

// 2. Funciones en app.js
const funcionesIa = [
  'cargarDiagnosticoIaInventario',
  'renderIaMetricasPatrimoniales',
  'renderIaAlertasBanner',
  'renderIaTablaDiagnostico',
  'openModalSimuladorPrecioIA',
  'closeModalSimuladorPrecioIA',
  'ejecutarSimulacionEnVivo'
];

funcionesIa.forEach(fn => {
  assert(jsContent.includes(`function ${fn}`), `Debe existir función ${fn} en app.js`);
});
console.log(`✓ Las ${funcionesIa.length} funciones controladoras de IA están implementadas en app.js.`);

// 3. Subtab handler
assert(jsContent.includes("subtab === 'ia'"), "cambiarSubtabProductos debe manejar el estado 'ia'");
console.log('✓ Controlador de sub-pestaña cambiarSubtabProductos conectado al módulo IA.');

// 4. Cache-buster
assert(htmlContent.includes('v=3.0.0'), 'Cache-buster debe estar actualizado a v=3.0.0');
console.log('✓ Cache-buster v=3.0.0 verificado.');

console.log('\n=======================================================');
console.log('VERIFICACIÓN FRONTEND DE FASE 3A SUPERADA AL 100%');
console.log('=======================================================');
