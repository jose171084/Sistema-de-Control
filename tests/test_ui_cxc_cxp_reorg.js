/**
 * test_ui_cxc_cxp_reorg.js
 * Verificación automatizada de la reorganización UI/UX de Cuentas por Cobrar y Cuentas por Pagar.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const BASE_DIR = path.resolve(__dirname, '..');
const HTML_PATH = path.join(BASE_DIR, 'public', 'index.html');
const JS_PATH = path.join(BASE_DIR, 'public', 'app.js');

console.log('--- INICIANDO VERIFICACIÓN DE REORGANIZACIÓN UI/UX (CXC / CXP) ---');

const html = fs.readFileSync(HTML_PATH, 'utf8');

// 1. Verificar sección Ventas & Clientes
assert(html.includes('Ventas & Clientes'), 'Falta el título de sección "Ventas & Clientes"');
const ventasIndex = html.indexOf('Ventas & Clientes');
const cxcNavIndex = html.indexOf('id="nav-cxc"');
const inventarioIndex = html.indexOf('Inventario & Catálogo');
assert(cxcNavIndex > ventasIndex && cxcNavIndex < inventarioIndex, 'nav-cxc debe estar dentro de la sección Ventas & Clientes');
console.log('✔ #nav-cxc ubicado correctamente dentro de la sección "Ventas & Clientes".');

// 2. Verificar sección Compras & Proveedores
assert(html.includes('Compras & Proveedores'), 'Falta el título de sección "Compras & Proveedores"');
const comprasIndex = html.indexOf('Compras & Proveedores');
const cxpNavIndex = html.indexOf('id="nav-cxp"');
const finanzasIndex = html.indexOf('Finanzas & Tesorería');
assert(cxpNavIndex > comprasIndex && cxpNavIndex < finanzasIndex, 'nav-cxp debe estar dentro de la sección Compras & Proveedores');
console.log('✔ #nav-cxp ubicado correctamente dentro de la sección "Compras & Proveedores".');

// 3. Verificar que nav-cxp NO tenga role-admin-only
const navCxpLine = html.substring(cxpNavIndex - 50, cxpNavIndex + 100);
assert(!navCxpLine.includes('role-admin-only'), 'nav-cxp NO debe tener la clase role-admin-only para que nunca desaparezca');
console.log('✔ #nav-cxp liberado de restricciones de rol (NUNCA desaparecerá en modo cajero).');

// 4. Botones directos en vistas
assert(html.includes("onclick=\"navigate('cxc')\"") && html.includes('Cuentas por Cobrar (CxC)'), 'Falta enlace directo a CxC en vista Clientes');
assert(html.includes("onclick=\"navigate('cxp')\"") && html.includes('Cuentas por Pagar (CxP)'), 'Falta enlace directo a CxP en vista Proveedores');
console.log('✔ Enlaces cruzados de 1-clic verificados en Clientes y Proveedores.');

// 5. Cache buster
assert(html.includes('app.js?v=3.2.0'), 'Cache buster de app.js debe ser ?v=3.2.0');
console.log('✔ Cache buster actualizado a ?v=3.2.0.');

// 6. Verificar app.js
const js = fs.readFileSync(JS_PATH, 'utf8');
assert(!js.includes("AppState.currentView === 'reportes' || AppState.currentView === 'cxp'"), 'app.js no debe bloquear cxp en rol cajero');
console.log('✔ Controlador en app.js permite acceso pleno y sin redirecciones a CXP.');

console.log('\n--- VERIFICACIÓN DE REORGANIZACIÓN UI/UX SUPERADA AL 100% ---');
