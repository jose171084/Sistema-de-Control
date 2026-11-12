/**
 * test_fase3b_ui_copilot.js
 * Suite de verificación automatizada de UI/UX para Fase 3B (CFO Copilot Gerencial)
 * Valida presencia de modales, botones, chips, controladores y eventos.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const BASE_DIR = path.resolve(__dirname, '..');
const HTML_PATH = path.join(BASE_DIR, 'public', 'index.html');
const JS_PATH = path.join(BASE_DIR, 'public', 'app.js');
const CSS_PATH = path.join(BASE_DIR, 'public', 'styles.css');

console.log('--- INICIANDO VERIFICACIÓN UI/UX DE FASE 3B (CFO COPILOT) ---');

// 1. Validar index.html
const html = fs.readFileSync(HTML_PATH, 'utf8');

// Botón en sidebar
assert(html.includes('id="nav-cfo-copilot"'), 'Falta el botón #nav-cfo-copilot en index.html');
assert(html.includes('abrirModalCfoCopilot()'), 'Falta la llamada a abrirModalCfoCopilot() en index.html');
console.log('✔ Botón en Sidebar #nav-cfo-copilot presente.');

// Botón en header
assert(html.includes('id="btnHeaderCfoCopilot"'), 'Falta el botón #btnHeaderCfoCopilot en index.html');
console.log('✔ Botón en Header #btnHeaderCfoCopilot presente.');

// Modal CFO Copilot
assert(html.includes('id="modalCfoCopilot"'), 'Falta el modal #modalCfoCopilot en index.html');
assert(html.includes('id="cfoCopilotSuggestionsContainer"'), 'Falta #cfoCopilotSuggestionsContainer en index.html');
assert(html.includes('id="cfoCopilotChatContainer"'), 'Falta #cfoCopilotChatContainer en index.html');
assert(html.includes('id="inputCfoCopilot"'), 'Falta #inputCfoCopilot en index.html');
assert(html.includes('id="btnSendCfoCopilot"'), 'Falta #btnSendCfoCopilot en index.html');
console.log('✔ Estructura completa de #modalCfoCopilot presente con todos los contenedores.');

// Cache buster
assert(html.includes('app.js?v=3.2.0'), 'Cache buster de app.js debe ser ?v=3.2.0');
console.log('✔ Cache buster actualizado a ?v=3.2.0');

// 2. Validar app.js
const js = fs.readFileSync(JS_PATH, 'utf8');
const funcionesEsperadas = [
  'abrirModalCfoCopilot',
  'cerrarModalCfoCopilot',
  'cargarSugerenciasCopilot',
  'ejecutarPreguntaRapidaCopilot',
  'renderizarMensajeInicialCopilot',
  'enviarConsultaCfoCopilot',
  'renderizarRespuestaCopilot',
  'ejecutarAccionCopilot',
  'reiniciarConversacionCopilot'
];

for (const fn of funcionesEsperadas) {
  assert(js.includes(`function ${fn}`), `Falta la función ${fn} en app.js`);
  console.log(`✔ Función controller ${fn} verificada.`);
}

// 3. Validar styles.css
const css = fs.readFileSync(CSS_PATH, 'utf8');
assert(css.includes('.no-scrollbar'), 'Falta .no-scrollbar en styles.css');
assert(css.includes('.animate-pulse-subtle'), 'Falta .animate-pulse-subtle en styles.css');
console.log('✔ Clases CSS de CFO Copilot verificadas.');

console.log('\n--- VERIFICACIÓN UI/UX FASE 3B SUPERADA AL 100% ---');
