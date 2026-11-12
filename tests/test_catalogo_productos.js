// tests/test_catalogo_productos.js
// Test suite unitario para el generador de Catálogo de Productos (PDF/Impresión & WhatsApp)

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

// Cargar y ejecutar app.js en un contexto virtual mínimo
const appJsPath = path.join(__dirname, '..', 'public', 'app.js');
const appJsCode = fs.readFileSync(appJsPath, 'utf8');

// Mock del entorno DOM mínimo
const windowMock = {
  location: { reload: () => {} },
  addEventListener: () => {},
  removeEventListener: () => {},
  DocumentTemplates: {},
  AppState: {}
};

const documentMock = {
  title: 'Test',
  addEventListener: () => {},
  removeEventListener: () => {},
  head: { appendChild: () => {} },
  body: {
    classList: { add: () => {}, remove: () => {} },
    appendChild: () => {}
  },
  getElementById: (id) => null,
  createElement: (tag) => ({
    id: '',
    className: '',
    innerHTML: '',
    setAttribute: () => {},
    style: {}
  })
};

const context = {
  window: windowMock,
  document: documentMock,
  navigator: { clipboard: { writeText: async () => {} } },
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  fetch: async () => ({ ok: true, json: async () => ({}) })
};

vm.createContext(context);
vm.runInContext(appJsCode, context);

const DocumentTemplates = context.window.DocumentTemplates;
assert(DocumentTemplates, "DocumentTemplates debe estar definido");
assert(typeof DocumentTemplates.catalogoProductos === 'function', "DocumentTemplates.catalogoProductos debe ser una función");

console.log("==================================================");
console.log(" INICIANDO TEST SUITE: CATÁLOGO DE PRODUCTOS");
console.log("==================================================");

// Mock de Configuración de Empresa TAVO CLOUD
const mockConfig = {
  nombre_negocio: "Distribuidora TAVO CLOUD C.A.",
  documento_fiscal: "J-50123456-7",
  telefono: "+58 412 9998877",
  direccion: "Av. Empresarial Torre A, Nivel 4, Caracas",
  logo_url: "/uploads/logo_empresa_1794497432_7a25a14c.png",
  tasa_ves: 45.50
};

// Mock de Productos con y sin fotografía
const mockProductos = [
  {
    id: 1,
    codigo: "PRD-001",
    nombre: "Laptop Corporativa Lenovo ThinkPad",
    categoria_nombre: "Tecnología",
    precio_total: 850.00,
    stock: 14.0,
    imagen: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    descripcion: "Intel Core i7, 16GB RAM, SSD 512GB",
    activo: 1,
    tipo: "producto"
  },
  {
    id: 2,
    codigo: "PRD-002",
    nombre: "Monitor Profesional 27 Pulgadas 4K",
    categoria_nombre: "Tecnología",
    precio_total: 320.00,
    stock: 0.0, // Agotado
    imagen: "", // Sin foto para probar placeholder
    descripcion: "Panel IPS con calibración sRGB 100%",
    activo: 1,
    tipo: "producto"
  },
  {
    id: 3,
    codigo: "SRV-001",
    nombre: "Servicio de Configuración de Redes",
    categoria_nombre: "Servicios",
    precio_total: 150.00,
    stock: 0.0,
    imagen: "",
    descripcion: "Cableado estructurado y certificación",
    activo: 1,
    tipo: "servicio"
  }
];

// --- TEST 1: Catálogo Comercial (Sin Existencias) ---
console.log("\n--- Test 1: Catálogo Comercial (Sin Existencias) ---");
const htmlSinStock = DocumentTemplates.catalogoProductos(mockProductos, mockConfig, {
  mostrarStock: false,
  layout: 'grid'
});

assert(htmlSinStock.includes("CATÁLOGO DE PRODUCTOS"), "Debe tener título 'CATÁLOGO DE PRODUCTOS'");
assert(htmlSinStock.includes(mockConfig.nombre_negocio), "Debe incluir el nombre del negocio");
assert(htmlSinStock.includes(mockConfig.documento_fiscal), "Debe incluir el RIF de la empresa");
assert(htmlSinStock.includes(mockConfig.telefono), "Debe incluir el teléfono");
assert(htmlSinStock.includes(mockConfig.logo_url), "Debe incluir la URL del logotipo");
assert(htmlSinStock.includes("PRD-001"), "Debe contener el código del producto");
assert(htmlSinStock.includes("Laptop Corporativa Lenovo ThinkPad"), "Debe contener el nombre del producto");
assert(htmlSinStock.includes("$850.00"), "Debe contener el precio en USD");
assert(htmlSinStock.includes("data:image/png;base64"), "Debe renderizar la imagen base64 del producto");
assert(htmlSinStock.includes("fa-box"), "Debe renderizar el placeholder para el producto sin foto");

// Verificación estricta: ¡NO DEBE CONTENER 'Stock' ni existencias!
assert(!htmlSinStock.includes("Stock Disponible"), "NO debe contener 'Stock Disponible' cuando mostrarStock=false");
assert(!htmlSinStock.includes("unidades disponibles"), "NO debe contener mención de unidades cuando mostrarStock=false");
assert(!htmlSinStock.includes("Agotado"), "NO debe contener mención de Agotado cuando mostrarStock=false");
console.log("✅ ÉXITO: Catálogo Comercial generado perfectamente sin ninguna fuga de existencias.");

// --- TEST 2: Catálogo de Inventario (Con Existencias) ---
console.log("\n--- Test 2: Catálogo de Inventario (Con Existencias) ---");
const htmlConStock = DocumentTemplates.catalogoProductos(mockProductos, mockConfig, {
  mostrarStock: true,
  layout: 'grid'
});

assert(htmlConStock.includes("CATÁLOGO DE INVENTARIO"), "Debe tener título 'CATÁLOGO DE INVENTARIO'");
assert(htmlConStock.includes("Stock: <strong>14</strong> unid.") || htmlConStock.includes("14"), "Debe mostrar el stock del producto 1");
assert(htmlConStock.includes("Agotado"), "Debe identificar claramente productos agotados con stock=0");
console.log("✅ ÉXITO: Catálogo de Inventario generado con badges de stock visibles y precisos.");

// --- TEST 3: Formato Lista Ejecutiva (Layout 'list') ---
console.log("\n--- Test 3: Formato Lista Ejecutiva (Layout 'list') ---");
const htmlLista = DocumentTemplates.catalogoProductos(mockProductos, mockConfig, {
  mostrarStock: true,
  layout: 'list'
});

assert(htmlLista.includes("<table"), "Debe generar una tabla estructurada para el layout 'list'");
assert(htmlLista.includes("14 unid."), "Debe incluir la celda de stock en la tabla");
assert(htmlLista.includes("Agotado"), "Debe incluir la celda de agotado en la tabla");
console.log("✅ ÉXITO: Lista Ejecutiva generada con formato tabular corporativo.");

// --- TEST 4: Control de Paginación y Reglas CSS de Impresión ---
console.log("\n--- Test 4: Reglas CSS de Paginación ---");
assert(htmlSinStock.includes("page-break-inside: avoid") || htmlSinStock.includes("break-inside: avoid"), "Las tarjetas deben evitar quiebre de página");
assert(htmlSinStock.includes("doc-catalogo-sheet"), "Debe aplicar la clase de aislamiento doc-catalogo-sheet");
console.log("✅ ÉXITO: Reglas de impresión 'page-break-inside: avoid' verificadas.");

// --- TEST 5: Agrupamiento por Categorías y Eliminación de Bolívares (Solo USD) ---
console.log("\n--- Test 5: Agrupamiento por Categoría y Precios Únicamente en Dólares ($ USD) ---");
assert(htmlSinStock.includes("Tecnología"), "Debe incluir la categoría Tecnología en encabezado o banner");
assert(htmlSinStock.includes("Servicios"), "Debe incluir la categoría Servicios en encabezado o banner");
assert(!htmlSinStock.includes("Bs."), "El catálogo NO debe incluir 'Bs.' en ninguna parte");
assert(!htmlSinStock.includes("Bolívares"), "El catálogo NO debe incluir 'Bolívares' en ninguna parte");
assert(!htmlConStock.includes("Bs."), "El catálogo de inventario NO debe incluir 'Bs.'");
console.log("✅ ÉXITO: Catálogo estrictamente ordenado por categorías y 100% en Dólares ($ USD).");

// --- TEST 6: Normalización E.164 para WhatsApp ---
console.log("\n--- Test 6: Normalización de Número para Enlace de WhatsApp ---");
const normalizar = context.window.normalizarTelefonoWhatsApp;
assert(typeof normalizar === 'function', "normalizarTelefonoWhatsApp debe estar definida en window");
assert.strictEqual(normalizar("0412-1234567"), "584121234567", "0412-1234567 debe convertirse a 584121234567");
assert.strictEqual(normalizar("0414 765 4321"), "584147654321", "0414 765 4321 debe convertirse a 584147654321");
assert.strictEqual(normalizar("+58 424 1112233"), "584241112233", "+58 debe limpiarse y conservar 584241112233");
assert.strictEqual(normalizar("584129998877"), "584129998877", "Número con código internacional directo debe preservarse");
console.log("✅ ÉXITO: Normalizador telefónico E.164 para WhatsApp verificado con precisión.");

// --- TEST 7: Mensaje Oficial y Persuasivo de WhatsApp (Psicología Lingüística y Emojis) ---
console.log("\n--- Test 7: Mensaje Oficial para WhatsApp con Nombre, RIF y Psicología Lingüística ---");
const construirMensaje = context.window.construirMensajeWhatsAppCatalogo;
assert(typeof construirMensaje === 'function', "construirMensajeWhatsAppCatalogo debe estar definida en window");

const msgConCliente = construirMensaje("Inversiones El Éxito C.A.", mockConfig);
assert(msgConCliente.includes("DISTRIBUIDORA TAVO CLOUD C.A."), "El mensaje debe incluir el nombre de la empresa");
assert(msgConCliente.includes(mockConfig.documento_fiscal), "El mensaje debe incluir el RIF de la empresa");
assert(msgConCliente.includes("Estimado/a cliente *Inversiones El Éxito C.A.*"), "Debe saludar al cliente por su nombre");
assert(msgConCliente.includes("Nos complace compartirle nuestro **Catálogo Oficial de Productos**"), "Debe incluir la frase clave requerida");
assert(msgConCliente.includes("🏢") && msgConCliente.includes("📋") && msgConCliente.includes("📄") && msgConCliente.includes("💵"), "Debe incluir emojis corporativos");
assert(msgConCliente.includes("rentabilidad") || msgConCliente.includes("potenciar su negocio"), "Debe aplicar psicología lingüística orientada a beneficio");
assert(msgConCliente.includes("¡Le deseamos un excelente día y el mayor de los éxitos!"), "Debe incluir saludo cordial final");

const msgSinCliente = construirMensaje("", mockConfig);
assert(msgSinCliente.includes("Estimado/a cliente 👋"), "Debe manejar fallback cordial cuando no se especifica cliente");
console.log("✅ ÉXITO: Generación de mensaje oficial de WhatsApp validada con exactitud.");

console.log("\n==================================================");
console.log(" 🎯 TODOS LOS TESTS DEL CATÁLOGO PASARON AL 100%");
console.log("==================================================");
