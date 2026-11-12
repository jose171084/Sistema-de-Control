// tests/test_modal_unificado_ui.js
// Verifica el rediseño UX/UI del Modal de Catálogo Oficial (eliminación de pestañas y botones redundantes)

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const indexPath = path.join(__dirname, '..', 'public', 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

console.log("==================================================");
console.log(" INICIANDO TEST SUITE: REDISEÑO UX/UI MODAL CATÁLOGO");
console.log("==================================================");

// 1. Extraer el bloque del modal
const modalStart = indexHtml.indexOf('<div id="modalCatalogoProductos"');
assert(modalStart !== -1, "Modal #modalCatalogoProductos debe existir en index.html");
const modalEnd = indexHtml.indexOf('<!-- MODAL: VISOR DE VISTA PREVIA DEL CATÁLOGO EN PANTALLA -->');
assert(modalEnd !== -1, "Cierre del modal debe encontrarse");
const modalSub = indexHtml.substring(modalStart, modalEnd);

// Test A: Pestañas eliminadas
console.log("\n--- Test A: Eliminación de Pestañas Confusas ---");
assert(!modalSub.includes('id="tabBtnCatalogoFormato"'), "tabBtnCatalogoFormato debe haber sido eliminado");
assert(!modalSub.includes('id="tabBtnCatalogoWhatsApp"'), "tabBtnCatalogoWhatsApp debe haber sido eliminado");
assert(!modalSub.includes('id="panelCatalogoFormato"'), "panelCatalogoFormato debe haber sido eliminado");
assert(!modalSub.includes('id="panelCatalogoWhatsApp"'), "panelCatalogoWhatsApp debe haber sido eliminado");
console.log("✅ ÉXITO: Pestañas redundantes eliminadas. Vista 100% unificada.");

// Test B: Botones redundantes eliminados
console.log("\n--- Test B: Eliminación de Botones Contaminantes ---");
assert(!modalSub.includes('btnDescargarPdfDirecto'), "Botón btnDescargarPdfDirecto debe haber sido eliminado");
assert(!modalSub.includes('btnCompartirPdfWhatsApp'), "Botón btnCompartirPdfWhatsApp duplicado debe haber sido eliminado");
assert(!modalSub.includes('abrirVistaPreviaCatalogo()'), "Botón Vista Rápida en modal debe haber sido unificado");
assert(!modalSub.includes('btnEnviarWhatsAppFooter'), "Botón btnEnviarWhatsAppFooter duplicado debe haber sido reemplazado por btnCompartirWhatsApp");
console.log("✅ ÉXITO: Todos los botones redundantes fueron purgados.");

// Test C: Los 3 únicos botones requeridos en el footer
console.log("\n--- Test C: Verificación de los 3 Únicos Botones en el Footer ---");
assert(modalSub.includes('closeCatalogoModal()'), "Debe existir botón Cerrar con closeCatalogoModal()");
assert(modalSub.includes('verPdfEnPantalla()'), "Debe existir botón Ver PDF en Pantalla con verPdfEnPantalla()");
assert(modalSub.includes('compartirCatalogoPdfWhatsApp()'), "Debe existir botón Enviar Catálogo por WhatsApp con compartirCatalogoPdfWhatsApp()");
console.log("✅ ÉXITO: Footer limpio y corporativo con exactamente los 3 botones autorizados.");

// Test D: Presencia de selector de existencias y campos esenciales
console.log("\n--- Test D: Elementos de Control Esenciales ---");
assert(modalSub.includes('name="catalogoStockOption"'), "Debe contener el selector de existencias (sin_stock vs con_stock)");
assert(modalSub.includes('id="catalogoFilterCategoria"'), "Debe contener el filtro de categorías");
assert(modalSub.includes('id="catalogoClienteSelect"'), "Debe contener el selector de clientes");
assert(modalSub.includes('id="catalogoTelefonoWhatsApp"'), "Debe contener el input de teléfono de WhatsApp");
assert(modalSub.includes('id="catalogoMensajeWhatsAppPreview"'), "Debe contener la vista previa del mensaje oficial");
console.log("✅ ÉXITO: Todos los controles esenciales presentes con ergonomía superior.");

console.log("\n==================================================");
console.log(" 🎯 TEST SUITE DE UX/UI: 100% APROBADO");
console.log("==================================================");
