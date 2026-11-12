/**
 * app.js - Lógica interactiva del Sistema de Inventario y Facturación Multimoneda
 */

// Limpieza de sesión de tema previo para migración visual inmediata a TAVO CLOUD
try {
  localStorage.removeItem('sis_tema');
} catch (e) {}

// Estado global de la aplicación
const AppState = {
  currentView: 'dashboard',
  config: {
    nombre_negocio: 'Mi Negocio Comercial',
    documento_fiscal: 'J-12345678-9',
    telefono: '+58 412 0000000',
    direccion: 'Calle Principal #123',
    iva_porcentaje: 16.0,
    tasa_ves: 45.00,
    tasa_cop: 4100.00
  },
  categorias: [],
  productos: [],
  clientes: [],
  proveedores: [],
  // Estado del POS (Facturación)
  posCart: [],
  posPagos: [],
  posTipoVenta: 'contado',
  posFilterCategory: 'todos',
  ultimaFacturaEmitida: null,
  // Estado del Módulo de Compras
  compraItems: [],
  compraFotoBase64: '',
  compraTipo: 'contado',
  compraPagos: [],
  // Estado de Cuentas por Cobrar (CXC)
  cxc: [],
  cxcResumen: {},
  cxcFilterEstado: 'todos',
  abonoPagos: [],
  abonoCxcActual: null,
  // Estado de Cuentas por Pagar (CXP)
  cxp: [],
  cxpResumen: {},
  cxpFilterEstado: 'todos',
  abonoCxpPagos: [],
  abonoCxpActual: null,
  // Estado de Reportes
  reportesTabActual: 'kardex',
  reportesInventarioData: null,
  reportesInventarioFilterTipo: 'todos',
  reportesVentasDiariasData: null,
  reportesVentasMensualesData: null,
  reportesCxcData: null,
  reportesCxcFilterEstado: 'todos',
  reportesCxpData: null,
  // Estado de Devoluciones
  devoluciones: [],
  devolucionesHistorial: [],
  devolucionModo: 'factura',
  devolucionFacturaSeleccionada: null,
  facturasParaDevolucion: [],
  devolucionItems: [],
  devCart: [],
  devPagos: [],
  devFilterCategory: 'todos',
  devolucionFacturaPagosOriginales: [],
  devolucionClienteSeleccionado: null,
  devolucionSubtab: 'nueva',
  ultimaDevolucionEmitida: null,
  clienteModalOrigen: 'clientes',
  productoModalOrigen: 'productos',
  // Filtros
  categoriaFilter: 'todos',
  temaActual: null,
  labelsActuales: null
};

// ========================================================
// CONFIGURACIÓN DE TEMAS Y ETIQUETAS PERSONALIZABLES
// ========================================================
const THEME_PRESETS = {
    zen_fresco: {
    sidebarBg: '#071B49',
    sidebarText: '#f1f5f9',
    primaryColor: '#0755C9',
    primaryHover: '#087FE8',
    bgApp: '#F5F8FC',
    headerBg: '#ffffff',
    btnFactura: '#0755C9',
    btnCompra: '#087FE8',
    btnCxc: '#10b981',
    btnCxp: '#64748b',
    btnDevoluciones: '#00C6E8',
    btnKardex: '#0755C9',
    btnFiscal: '#0755C9'
  },
  indigo: {
    sidebarBg: '#0f172a',
    sidebarText: '#f8fafc',
    primaryColor: '#4f46e5',
    primaryHover: '#4338ca',
    bgApp: '#f1f5f9',
    headerBg: '#ffffff',
    btnFactura: '#059669',
    btnCompra: '#2563eb',
    btnCxc: '#d97706',
    btnCxp: '#e11d48',
    btnDevoluciones: '#0891b2',
    btnKardex: '#4f46e5',
    btnFiscal: '#0284c7'
  },
  esmeralda: {
    sidebarBg: '#064e3b',
    sidebarText: '#ecfdf5',
    primaryColor: '#059669',
    primaryHover: '#047857',
    bgApp: '#f0fdf4',
    headerBg: '#ffffff',
    btnFactura: '#059669',
    btnCompra: '#0d9488',
    btnCxc: '#d97706',
    btnCxp: '#e11d48',
    btnDevoluciones: '#0891b2',
    btnKardex: '#059669',
    btnFiscal: '#0284c7'
  },
  azul: {
    sidebarBg: '#1e3a8a',
    sidebarText: '#eff6ff',
    primaryColor: '#2563eb',
    primaryHover: '#1d4ed8',
    bgApp: '#f8fafc',
    headerBg: '#ffffff',
    btnFactura: '#10b981',
    btnCompra: '#2563eb',
    btnCxc: '#f59e0b',
    btnCxp: '#e11d48',
    btnDevoluciones: '#0891b2',
    btnKardex: '#2563eb',
    btnFiscal: '#0284c7'
  },
  violeta: {
    sidebarBg: '#2e1065',
    sidebarText: '#f5f3ff',
    primaryColor: '#7c3aed',
    primaryHover: '#6d28d9',
    bgApp: '#faf5ff',
    headerBg: '#ffffff',
    btnFactura: '#059669',
    btnCompra: '#7c3aed',
    btnCxc: '#d97706',
    btnCxp: '#e11d48',
    btnDevoluciones: '#0891b2',
    btnKardex: '#7c3aed',
    btnFiscal: '#0284c7'
  },
  oscuro: {
    sidebarBg: '#020617',
    sidebarText: '#f8fafc',
    primaryColor: '#38bdf8',
    primaryHover: '#0284c7',
    bgApp: '#0f172a',
    headerBg: '#1e293b',
    btnFactura: '#10b981',
    btnCompra: '#0284c7',
    btnCxc: '#f59e0b',
    btnCxp: '#e11d48',
    btnDevoluciones: '#0891b2',
    btnKardex: '#38bdf8',
    btnFiscal: '#0284c7'
  },
  sunset: {
    sidebarBg: '#451a03',
    sidebarText: '#fffbeb',
    primaryColor: '#ea580c',
    primaryHover: '#c2410c',
    bgApp: '#fff7ed',
    headerBg: '#ffffff',
    btnFactura: '#059669',
    btnCompra: '#ea580c',
    btnCxc: '#b45309',
    btnCxp: '#e11d48',
    btnDevoluciones: '#0891b2',
    btnKardex: '#ea580c',
    btnFiscal: '#0284c7'
  }
};

const DEFAULT_THEME = { ...THEME_PRESETS.zen_fresco };

const DEFAULT_LABELS = {
  titulo_app: "TAVO CLOUD",
  subtitulo_app: "Business Management",
  tab_dashboard: "Dashboard",
  tab_categorias: "Categorías",
  tab_productos: "Productos y Servicios",
  tab_clientes: "Clientes",
  tab_facturacion: "Facturas",
  tab_devoluciones: "Devoluciones de Factura",
  tab_cxc: "Cuentas por Cobrar",
  tab_proveedores: "Proveedores",
  tab_compras: "Compras",
  tab_devolucion_compras: "Devolución de Compras",
  tab_cxp: "Cuentas por Pagar",
  tab_tesoreria: "Caja y Tesorería",
  tab_reportes: "Informes",
  btn_nueva_venta: "Nueva Venta",
  btn_cargar_compra: "Cargar Compra",
  btn_procesar_venta: "Completar Facturación",
  btn_credito: "Facturar a Crédito",
  btn_abonar: "Registrar Abono",
  btn_cxp: "Registrar Pago / Gasto",
  btn_guardar_producto: "Guardar Ítem",
  btn_sincronizar_tasas: "Sincronizar BCV / TRM",
  btn_nueva_devolucion: "Nueva Devolución",
  btn_kardex: "Consultar Kardex",
  btn_seniat: "Generar Libros SENIAT"
};

// ========================================================
// INICIALIZACIÓN
// ========================================================
document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();
  initPersonalizacion();
  await loadCategorias();
  await loadProductos();
  await loadClientes();
  await loadProveedores();
  await loadDashboard();
  await loadDatabaseStatus();
  initRolUsuario();

  // Fecha por defecto en compras (hoy)
  const today = new Date().toISOString().split('T')[0];
  const compraFechaInput = document.getElementById('compraFecha');
  if (compraFechaInput) compraFechaInput.value = today;

  // Iniciar con un pago por defecto en efectivo USD para mayor comodidad
  initDefaultPosPago();

  // Sincronizar automáticamente tasas oficiales SÓLO SI el modo automático está activado
  try {
    const modoAuto = !AppState.config || AppState.config.sincronizacion_tasas_auto !== 0;
    if (modoAuto) {
      const hoyStr = new Date().toISOString().split('T')[0];
      const fechaActualizacion = (AppState.config && AppState.config.fecha_tasas_actualizacion) || '';
      if (!fechaActualizacion.startsWith(hoyStr)) {
        sincronizarTasasOficiales(true);
      }
    } else {
      console.log('Modo manual de tasas activo: se preservan las tasas configuradas por el usuario.');
    }
  } catch(e) {}

  // Cerrar lista flotante de clientes en POS y facturas en Devoluciones al hacer clic afuera
  document.addEventListener('click', (e) => {
    const searchInput = document.getElementById('posClienteSearchInput');
    const resultsDiv = document.getElementById('posClienteSearchResults');
    if (resultsDiv && !resultsDiv.contains(e.target) && e.target !== searchInput) {
      resultsDiv.classList.add('hidden');
    }

    const devFactInput = document.getElementById('devFacturaSearchInput');
    const devFactResults = document.getElementById('devFacturaSearchResults');
    if (devFactResults && !devFactResults.contains(e.target) && e.target !== devFactInput) {
      devFactResults.classList.add('hidden');
    }

    const devCliInput = document.getElementById('devClienteSearchInput');
    const devCliResults = document.getElementById('devClienteSearchResults');
    if (devCliResults && !devCliResults.contains(e.target) && e.target !== devCliInput) {
      devCliResults.classList.add('hidden');
    }
  });
});

// ========================================================
// GESTIÓN DE PERSONALIZACIÓN Y ESTILOS
// ========================================================
function initPersonalizacion() {
  let temaGuardado = null;
  let labelsGuardados = null;

  // 1. Preferir lo devuelto por la Base de Datos (soporte para tema_config y tema)
  if (AppState.config) {
    const rawT = AppState.config.tema_config || AppState.config.tema;
    if (rawT) {
      temaGuardado = typeof rawT === 'string' ? JSON.parse(rawT) : rawT;
    }
    const rawL = AppState.config.labels_config || AppState.config.labels;
    if (rawL) {
      labelsGuardados = typeof rawL === 'string' ? JSON.parse(rawL) : rawL;
    }
  }

  // 2. Si no viene en BD, consultar localStorage
  if (!temaGuardado) {
    try {
      const local = localStorage.getItem('sis_tema');
      if (local) temaGuardado = JSON.parse(local);
    } catch(e) {}
  }
  if (!labelsGuardados) {
    try {
      const local = localStorage.getItem('sis_labels');
      if (local) labelsGuardados = JSON.parse(local);
    } catch(e) {}
  }

  // Sanitización quirúrgica: eliminar cualquier prefijo numérico o cadenas obsoletas persistidas
  if (labelsGuardados && typeof labelsGuardados === 'object') {
    const cleanMapping = {
      tab_dashboard: "Dashboard",
      tab_categorias: "Categorías",
      tab_productos: "Productos y Servicios",
      tab_clientes: "Clientes",
      tab_facturacion: "Facturas",
      tab_devoluciones: "Devoluciones de Factura",
      tab_cxc: "Cuentas por Cobrar",
      tab_proveedores: "Proveedores",
      tab_compras: "Compras",
      tab_devolucion_compras: "Devolución de Compras",
      tab_cxp: "Cuentas por Pagar",
      tab_tesoreria: "Caja y Tesorería",
      tab_reportes: "Informes"
    };
    for (const [k, v] of Object.entries(cleanMapping)) {
      if (labelsGuardados[k] && (/^\d+\.\s*/.test(labelsGuardados[k]) || labelsGuardados[k].includes('& NC') || labelsGuardados[k].includes('(Ventas)') || labelsGuardados[k].includes('Kardex & Fiscales') || labelsGuardados[k].includes('Cajas & Tesorería') || labelsGuardados[k].includes('Punto de Venta') || labelsGuardados[k].includes('Reportes & Balances'))) {
        labelsGuardados[k] = v;
      }
    }
    try { localStorage.setItem('sis_labels', JSON.stringify(labelsGuardados)); } catch(e) {}
  }

  AppState.temaActual = temaGuardado ? { ...DEFAULT_THEME, ...temaGuardado } : { ...DEFAULT_THEME };
  AppState.labelsActuales = labelsGuardados ? { ...DEFAULT_LABELS, ...labelsGuardados } : { ...DEFAULT_LABELS };

  aplicarTema(AppState.temaActual);
  aplicarLabels(AppState.labelsActuales);
}

function aplicarTema(tema) {
  if (!tema) tema = DEFAULT_THEME;
  const root = document.documentElement;

  // 1. Asignar variables CSS en :root
  if (tema.sidebarBg) root.style.setProperty('--color-sidebar', tema.sidebarBg);
  if (tema.sidebarText) root.style.setProperty('--color-sidebar-text', tema.sidebarText);
  if (tema.primaryColor) {
    root.style.setProperty('--color-primary', tema.primaryColor);
    root.style.setProperty('--color-sidebar-active', tema.primaryColor);
  }
  if (tema.primaryHover) root.style.setProperty('--color-primary-hover', tema.primaryHover);
  if (tema.bgApp) root.style.setProperty('--color-bg-app', tema.bgApp);
  if (tema.headerBg) root.style.setProperty('--color-header-bg', tema.headerBg);
  if (tema.btnFactura) root.style.setProperty('--color-btn-factura', tema.btnFactura);
  if (tema.btnCompra) root.style.setProperty('--color-btn-compra', tema.btnCompra);
  if (tema.btnCxc) root.style.setProperty('--color-btn-cxc', tema.btnCxc);
  if (tema.btnCxp) root.style.setProperty('--color-btn-cxp', tema.btnCxp);
  if (tema.btnDevoluciones) root.style.setProperty('--color-btn-devoluciones', tema.btnDevoluciones);
  if (tema.btnKardex) root.style.setProperty('--color-btn-kardex', tema.btnKardex);
  if (tema.btnFiscal) root.style.setProperty('--color-btn-fiscal', tema.btnFiscal);

  // 2. Inyectar o actualizar hoja de estilos dinámica de máxima especificidad (!important)
  let styleTag = document.getElementById('dynamicThemeStyles');
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = 'dynamicThemeStyles';
    document.head.appendChild(styleTag);
  }

  const pColor = tema.primaryColor || '#14b8a6';
  const pHover = tema.primaryHover || '#0d9488';
  const sBg = tema.sidebarBg || '#ffffff';
  const sText = tema.sidebarText || '#1e293b';
  const bgApp = tema.bgApp || '#f8fafc';
  const hBg = tema.headerBg || '#ffffff';
  const bFactura = tema.btnFactura || '#14b8a6';
  const bCompra = tema.btnCompra || '#0ea5e9';
  const bCxc = tema.btnCxc || '#10b981';
  const bCxp = tema.btnCxp || '#64748b';
  const bDev = tema.btnDevoluciones || '#06b6d4';
  const bKardex = tema.btnKardex || '#14b8a6';
  const bFiscal = tema.btnFiscal || '#0284c7';

  function isHexDark(hex) {
    if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return false;
    let c = hex.substring(1);
    if (c.length === 3) c = c.split('').map(x => x+x).join('');
    if (c.length !== 6) return false;
    const r = parseInt(c.substr(0,2), 16) || 0;
    const g = parseInt(c.substr(2,2), 16) || 0;
    const b = parseInt(c.substr(4,2), 16) || 0;
    return ((r * 299 + g * 587 + b * 114) / 1000) < 140;
  }
  const isDarkSidebar = isHexDark(sBg);
  const sHover = isDarkSidebar ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.05)';
  const sBorder = isDarkSidebar ? 'rgba(255, 255, 255, 0.1)' : 'rgba(226, 232, 240, 0.8)';
  const sCardBg = isDarkSidebar ? 'rgba(255, 255, 255, 0.06)' : 'rgba(248, 250, 252, 0.95)';
  const sCardBorder = isDarkSidebar ? 'rgba(255, 255, 255, 0.12)' : 'rgba(226, 232, 240, 0.8)';
  const sMutedText = isDarkSidebar ? 'rgba(248, 250, 252, 0.65)' : '#64748b';
  const sIconColor = isDarkSidebar ? '#94a3b8' : '#64748b';

  styleTag.textContent = `
    :root {
      --color-primary: ${pColor} !important;
      --color-primary-hover: ${pHover} !important;
      --color-sidebar: ${sBg} !important;
      --color-sidebar-text: ${sText} !important;
      --color-sidebar-active: ${pColor} !important;
      --color-bg-app: ${bgApp} !important;
      --color-header-bg: ${hBg} !important;
      --color-btn-factura: ${bFactura} !important;
      --color-btn-compra: ${bCompra} !important;
      --color-btn-cxc: ${bCxc} !important;
      --color-btn-cxp: ${bCxp} !important;
      --color-btn-devoluciones: ${bDev} !important;
      --color-btn-kardex: ${bKardex} !important;
      --color-btn-fiscal: ${bFiscal} !important;
    }
    body, body.bg-slate-50, body.bg-slate-100 {
      background-color: ${bgApp} !important;
    }
    .app-main-wrapper {
      background-color: ${bgApp} !important;
    }
    #appSidebar {
      background-color: ${sBg} !important;
      color: ${sText} !important;
      border-right: 1px solid ${sBorder} !important;
    }
    header.app-header {
      background-color: ${hBg} !important;
    }
    .sidebar-nav-btn {
      color: ${sText} !important;
    }
    .sidebar-nav-btn i {
      color: ${sIconColor} !important;
    }
    .sidebar-nav-btn:hover {
      background-color: ${sHover} !important;
      color: ${isDarkSidebar ? '#ffffff' : '#0f172a'} !important;
    }
    .sidebar-nav-btn.active-nav {
      background-color: ${pColor} !important;
      color: #ffffff !important;
      box-shadow: 0 4px 14px -2px ${pColor}55 !important;
    }
    .sidebar-nav-btn.active-nav i {
      color: #ffffff !important;
    }
    .sidebar-section-title {
      color: ${sMutedText} !important;
    }
    .sidebar-widget-card {
      background-color: ${sCardBg} !important;
      border-color: ${sCardBorder} !important;
    }
    .btn-theme-primary {
      background-color: ${pColor} !important;
      color: #ffffff !important;
    }
    .btn-theme-primary:hover {
      background-color: ${pHover} !important;
      filter: brightness(0.95);
    }
    .btn-theme-factura {
      background-color: ${bFactura} !important;
      color: #ffffff !important;
    }
    .btn-theme-compra {
      background-color: ${bCompra} !important;
      color: #ffffff !important;
    }
    .btn-theme-cxc {
      background-color: ${bCxc} !important;
      color: #ffffff !important;
    }
    .btn-theme-cxp {
      background-color: ${bCxp} !important;
      color: #ffffff !important;
    }
    .btn-theme-devoluciones {
      background-color: ${bDev} !important;
      color: #ffffff !important;
    }
    .btn-theme-kardex {
      background-color: ${bKardex} !important;
      color: #ffffff !important;
    }
    .btn-theme-fiscal {
      background-color: ${bFiscal} !important;
      color: #ffffff !important;
    }
    .text-theme-primary {
      color: ${pColor} !important;
    }
    .border-theme-primary {
      border-color: ${pColor} !important;
    }
    input:not([type="checkbox"]):not([type="radio"]):focus, select:focus, textarea:focus {
      border-color: ${pColor} !important;
      box-shadow: 0 0 0 3px ${pColor}28 !important;
    }
  `;

  // 3. Forzar repintado directo en elementos clave del DOM para feedback instantáneo
  document.body.style.backgroundColor = bgApp;
  const mainWrapper = document.querySelector('.app-main-wrapper');
  if (mainWrapper) mainWrapper.style.backgroundColor = bgApp;
  const sidebarEl = document.getElementById('appSidebar');
  if (sidebarEl) {
    sidebarEl.style.backgroundColor = sBg;
    sidebarEl.style.color = sText;
  }
  const headerEl = document.querySelector('header.app-header');
  if (headerEl) headerEl.style.backgroundColor = hBg;

  // 4. Sincronizar pickers
  syncPickersWithTheme(tema);
}

function syncPickersWithTheme(tema) {
  const map = {
    pickerSidebarBg: tema.sidebarBg,
    pickerSidebarText: tema.sidebarText,
    pickerPrimaryColor: tema.primaryColor,
    pickerBgApp: tema.bgApp,
    pickerHeaderBg: tema.headerBg || '#ffffff',
    pickerBtnFactura: tema.btnFactura,
    pickerBtnCompra: tema.btnCompra,
    pickerBtnCxc: tema.btnCxc,
    pickerBtnCxp: tema.btnCxp,
    pickerBtnDevoluciones: tema.btnDevoluciones,
    pickerBtnKardex: tema.btnKardex || '#14b8a6',
    pickerBtnFiscal: tema.btnFiscal || '#0284c7'
  };
  for (const [id, val] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el && val) el.value = val;
  }
}

function previewColorChange(key, value) {
  if (!AppState.temaActual) AppState.temaActual = { ...DEFAULT_THEME };
  AppState.temaActual[key] = value;
  if (key === 'primaryColor') {
    AppState.temaActual.primaryHover = value;
  }
  aplicarTema(AppState.temaActual);
}

function aplicarPresetTema(presetKey) {
  const preset = THEME_PRESETS[presetKey];
  if (!preset) return;
  AppState.temaActual = { ...DEFAULT_THEME, ...preset };
  aplicarTema(AppState.temaActual);
}

function aplicarLabels(labels) {
  if (!labels) labels = DEFAULT_LABELS;
  AppState.labelsActuales = { ...DEFAULT_LABELS, ...labels };

  document.querySelectorAll('[data-label-key]').forEach(el => {
    const key = el.getAttribute('data-label-key');
    if (AppState.labelsActuales[key]) {
      el.textContent = AppState.labelsActuales[key];
    }
  });

  if (AppState.labelsActuales.titulo_app) {
    document.title = `${AppState.labelsActuales.titulo_app} - Sistema Multimoneda`;
  }
}

function setPersonalizacionTab(tab) {
  const tabs = ['colores', 'pestanas', 'botones'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tabBtn${t.charAt(0).toUpperCase() + t.slice(1)}`);
    const panel = document.getElementById(`panelPersonalizacion${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (btn) {
      if (t === tab) {
        btn.classList.add('text-teal-600', 'border-b-2', 'border-teal-600');
        btn.classList.remove('text-slate-500');
      } else {
        btn.classList.remove('text-teal-600', 'border-b-2', 'border-teal-600');
        btn.classList.add('text-slate-500');
      }
    }
    if (panel) {
      if (t === tab) panel.classList.remove('hidden');
      else panel.classList.add('hidden');
    }
  });
}

function openPersonalizacionModal() {
  const tema = AppState.temaActual || DEFAULT_THEME;
  const labels = AppState.labelsActuales || DEFAULT_LABELS;

  syncPickersWithTheme(tema);

  const pMap = {
    customTabDashboard: labels.tab_dashboard,
    customTabCategorias: labels.tab_categorias,
    customTabProductos: labels.tab_productos,
    customTabClientes: labels.tab_clientes,
    customTabFacturacion: labels.tab_facturacion,
    customTabDevoluciones: labels.tab_devoluciones,
    customTabCxc: labels.tab_cxc,
    customTabProveedores: labels.tab_proveedores,
    customTabCompras: labels.tab_compras,
    customTabDevolucionCompras: labels.tab_devolucion_compras,
    customTabCxp: labels.tab_cxp,
    customTabTesoreria: labels.tab_tesoreria,
    customTabReportes: labels.tab_reportes,
    customTabKardex: labels.tab_kardex,
    customTabInvSimple: labels.tab_inv_simple,
    customTabFiscal: labels.tab_fiscal
  };
  for (const [id, val] of Object.entries(pMap)) {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  }

  const bMap = {
    customTituloApp: labels.titulo_app,
    customSubtituloApp: labels.subtitulo_app,
    customBtnNuevaVenta: labels.btn_nueva_venta,
    customBtnCargarCompra: labels.btn_cargar_compra,
    customBtnProcesarVenta: labels.btn_procesar_venta,
    customBtnCredito: labels.btn_credito,
    customBtnAbonar: labels.btn_abonar,
    customBtnSyncTasas: labels.btn_sincronizar_tasas,
    customBtnNuevaDevolucion: labels.btn_nueva_devolucion,
    customBtnKardex: labels.btn_kardex
  };
  for (const [id, val] of Object.entries(bMap)) {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  }

  setPersonalizacionTab('colores');
  document.getElementById('modalPersonalizacion').classList.remove('hidden');
}

function closePersonalizacionModal() {
  document.getElementById('modalPersonalizacion').classList.add('hidden');
}

async function guardarPersonalizacion() {
  const tema = {
    sidebarBg: document.getElementById('pickerSidebarBg').value,
    sidebarText: document.getElementById('pickerSidebarText').value,
    primaryColor: document.getElementById('pickerPrimaryColor').value,
    primaryHover: document.getElementById('pickerPrimaryColor').value,
    bgApp: document.getElementById('pickerBgApp').value,
    headerBg: document.getElementById('pickerHeaderBg')?.value || '#ffffff',
    btnFactura: document.getElementById('pickerBtnFactura').value,
    btnCompra: document.getElementById('pickerBtnCompra').value,
    btnCxc: document.getElementById('pickerBtnCxc').value,
    btnCxp: document.getElementById('pickerBtnCxp')?.value || '#64748b',
    btnDevoluciones: document.getElementById('pickerBtnDevoluciones')?.value || '#06b6d4',
    btnKardex: document.getElementById('pickerBtnKardex')?.value || '#14b8a6',
    btnFiscal: document.getElementById('pickerBtnFiscal')?.value || '#0284c7'
  };

  const labels = {
    titulo_app: document.getElementById('customTituloApp').value.trim() || DEFAULT_LABELS.titulo_app,
    subtitulo_app: document.getElementById('customSubtituloApp').value.trim() || DEFAULT_LABELS.subtitulo_app,
    tab_dashboard: document.getElementById('customTabDashboard').value.trim() || DEFAULT_LABELS.tab_dashboard,
    tab_categorias: document.getElementById('customTabCategorias').value.trim() || DEFAULT_LABELS.tab_categorias,
    tab_productos: document.getElementById('customTabProductos').value.trim() || DEFAULT_LABELS.tab_productos,
    tab_clientes: document.getElementById('customTabClientes').value.trim() || DEFAULT_LABELS.tab_clientes,
    tab_facturacion: document.getElementById('customTabFacturacion').value.trim() || DEFAULT_LABELS.tab_facturacion,
    tab_devoluciones: document.getElementById('customTabDevoluciones')?.value.trim() || DEFAULT_LABELS.tab_devoluciones,
    tab_compras: document.getElementById('customTabCompras')?.value.trim() || DEFAULT_LABELS.tab_compras,
    tab_proveedores: document.getElementById('customTabProveedores')?.value.trim() || DEFAULT_LABELS.tab_proveedores,
    tab_devolucion_compras: document.getElementById('customTabDevolucionCompras')?.value.trim() || DEFAULT_LABELS.tab_devolucion_compras,
    tab_cxc: document.getElementById('customTabCxc')?.value.trim() || DEFAULT_LABELS.tab_cxc,
    tab_cxp: document.getElementById('customTabCxp')?.value.trim() || DEFAULT_LABELS.tab_cxp,
    tab_tesoreria: document.getElementById('customTabTesoreria')?.value.trim() || DEFAULT_LABELS.tab_tesoreria,
    tab_reportes: document.getElementById('customTabReportes')?.value.trim() || DEFAULT_LABELS.tab_reportes,
    tab_kardex: document.getElementById('customTabKardex')?.value.trim() || DEFAULT_LABELS.tab_kardex,
    tab_inv_simple: document.getElementById('customTabInvSimple')?.value.trim() || DEFAULT_LABELS.tab_inv_simple,
    tab_fiscal: document.getElementById('customTabFiscal')?.value.trim() || DEFAULT_LABELS.tab_fiscal,
    btn_nueva_venta: document.getElementById('customBtnNuevaVenta').value.trim() || DEFAULT_LABELS.btn_nueva_venta,
    btn_cargar_compra: document.getElementById('customBtnCargarCompra').value.trim() || DEFAULT_LABELS.btn_cargar_compra,
    btn_procesar_venta: document.getElementById('customBtnProcesarVenta').value.trim() || DEFAULT_LABELS.btn_procesar_venta,
    btn_credito: document.getElementById('customBtnCredito').value.trim() || DEFAULT_LABELS.btn_credito,
    btn_abonar: document.getElementById('customBtnAbonar').value.trim() || DEFAULT_LABELS.btn_abonar,
    btn_sincronizar_tasas: document.getElementById('customBtnSyncTasas').value.trim() || DEFAULT_LABELS.btn_sincronizar_tasas,
    btn_nueva_devolucion: document.getElementById('customBtnNuevaDevolucion')?.value.trim() || DEFAULT_LABELS.btn_nueva_devolucion,
    btn_kardex: document.getElementById('customBtnKardex')?.value.trim() || DEFAULT_LABELS.btn_kardex
  };

  try {
    const res = await fetch('/api/config/personalizacion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tema_config: tema, labels_config: labels })
    });

    AppState.temaActual = tema;
    AppState.labelsActuales = labels;
    localStorage.setItem('sis_tema', JSON.stringify(tema));
    localStorage.setItem('sis_labels', JSON.stringify(labels));
    aplicarTema(tema);
    aplicarLabels(labels);
    closePersonalizacionModal();
    alert('Personalización y diseño guardados correctamente.');
  } catch (err) {
    localStorage.setItem('sis_tema', JSON.stringify(tema));
    localStorage.setItem('sis_labels', JSON.stringify(labels));
    aplicarTema(tema);
    aplicarLabels(labels);
    closePersonalizacionModal();
    alert('Personalización guardada localmente.');
  }
}

async function restablecerPersonalizacionFabrica() {
  if (!confirm('¿Deseas restablecer todos los colores, estilos y nombres a los valores originales de fábrica?')) return;
  try {
    await fetch('/api/config/personalizacion/reset', { method: 'POST' });
  } catch(e) {}
  localStorage.removeItem('sis_tema');
  localStorage.removeItem('sis_labels');
  AppState.temaActual = { ...DEFAULT_THEME };
  AppState.labelsActuales = { ...DEFAULT_LABELS };
  aplicarTema(DEFAULT_THEME);
  aplicarLabels(DEFAULT_LABELS);
  closePersonalizacionModal();
  alert('Se han restablecido los colores y nombres predeterminados de fábrica.');
}

// Toggle para navegación móvil en Sidebar
function toggleMobileSidebar() {
  const sidebar = document.getElementById('appSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (!sidebar) return;

  const isClosed = sidebar.classList.contains('-translate-x-full');
  if (isClosed) {
    sidebar.classList.remove('-translate-x-full');
    sidebar.classList.add('translate-x-0');
    if (backdrop) backdrop.classList.remove('hidden');
  } else {
    sidebar.classList.add('-translate-x-full');
    sidebar.classList.remove('translate-x-0');
    if (backdrop) backdrop.classList.add('hidden');
  }
}

// ========================================================
// NAVEGACIÓN ENTRE MÓDULOS
// ========================================================

// ========================================================
// NAVEGACIÓN Y ENLACE: DEVOLUCIÓN DE COMPRAS (PROVEEDORES)
// ========================================================
function handleDevolucionComprasNav() {
  navigate('compras');
  if (typeof showToast === 'function') {
    showToast('Devolución de Compras: Selecciona la compra y haz clic en "Anular Compra" para revertir existencias y deuda.', 'info');
  }
  setTimeout(() => {
    const tabla = document.getElementById('comprasTableBody') || document.querySelector('#view-compras table');
    if (tabla) {
      tabla.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 350);
}
window.handleDevolucionComprasNav = handleDevolucionComprasNav;

function navigate(viewName) {
  AppState.currentView = viewName;

  // En móviles, cerrar el sidebar si está abierto
  const sidebar = document.getElementById('appSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (window.innerWidth < 768 && sidebar && !sidebar.classList.contains('-translate-x-full')) {
    sidebar.classList.add('-translate-x-full');
    sidebar.classList.remove('translate-x-0');
    if (backdrop) backdrop.classList.add('hidden');
  }

  const views = ['dashboard', 'categorias', 'productos', 'clientes', 'facturacion', 'devoluciones', 'compras', 'devolucion-compras', 'proveedores', 'cxc', 'cxp', 'reportes', 'tesoreria'];
  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    const navBtn = document.getElementById(`nav-${v}`);
    if (el) {
      if (v === viewName) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }
    if (navBtn) {
      if (v === viewName) {
        navBtn.classList.add('active-nav');
      } else {
        navBtn.classList.remove('active-nav');
      }
    }
  });

  // Sincronizar indicador de la Barra Inferior Móvil (Bottom Nav)
  const mobItems = ['dashboard', 'facturacion', 'compras', 'cxc', 'productos', 'reportes'];
  mobItems.forEach(m => {
    const mobBtn = document.getElementById(`mob-nav-${m}`);
    if (mobBtn) {
      const isMatch = (m === viewName) || (m === 'cxc' && viewName === 'cxp');
      if (isMatch) {
        mobBtn.classList.add('active');
      } else {
        mobBtn.classList.remove('active');
      }
    }
  });

  // Acciones específicas al entrar a una vista
  if (viewName === 'dashboard') loadDashboard();
  if (viewName === 'categorias') loadCategorias();
  if (viewName === 'productos') {
    if (typeof cambiarSubtabProductos === 'function') {
      cambiarSubtabProductos('catalogo');
    } else {
      loadProductos();
    }
  }
  if (viewName === 'clientes') loadClientes();
  if (viewName === 'proveedores') loadProveedores();
  if (viewName === 'facturacion') {
    populatePosSelectors();
    renderPosCatalog();
    renderPosCart();
    setTimeout(() => {
      const search = document.getElementById('posSearchProduct');
      if (search) {
        search.focus();
        search.select();
      }
    }, 150);
  }
  if (viewName === 'devoluciones') {
    initDevolucionesView();
  }
  if (viewName === 'compras') {
    populateComprasSelectors();
  }
  if (viewName === 'cxc') {
    loadCxc();
  }
  if (viewName === 'cxp') {
    loadCxp();
  }
  if (viewName === 'tesoreria') loadTesoreria();
  if (viewName === 'reportes') {
    loadReportes();
  }
}

// ========================================================
// CONFIGURACIÓN & TASAS DE CAMBIO
// ========================================================
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const data = await res.json();
      AppState.config = data;
      updateConfigUI();
    }
  } catch (err) {
    console.error("Error cargando configuración:", err);
  }
}

function updateConfigUI() {
  const cfg = AppState.config;
  const businessName = cfg.nombre_negocio || 'Mi Negocio Comercial';

  const hName = document.getElementById('headerBusinessName');
  if (hName) hName.textContent = businessName;
  const sName = document.getElementById('sidebarBusinessName');
  if (sName) sName.textContent = businessName;
  // Hidratación Multi-Tenant del Logotipo de la Empresa
  const logoPlaceholders = document.querySelectorAll('#businessLogoPlaceholder, .businessLogoImg');
  const defaultBrandIcon = document.getElementById('defaultBrandIcon');

  if (cfg.logo_url) {
    logoPlaceholders.forEach(el => {
      el.src = cfg.logo_url;
      el.classList.remove('hidden');
      el.style.display = 'block';
    });
    if (defaultBrandIcon) {
      defaultBrandIcon.classList.add('hidden');
    }
  } else {
    logoPlaceholders.forEach(el => {
      el.classList.add('hidden');
      el.style.display = 'none';
    });
    if (defaultBrandIcon) {
      defaultBrandIcon.classList.remove('hidden');
    }
  }


  const docFiscal = document.getElementById('headerDocFiscal');
  if (docFiscal) docFiscal.textContent = cfg.documento_fiscal || '';

  const vesStr = `${parseFloat(cfg.tasa_ves || 45.0).toFixed(2)} Bs.`;
  const copStr = `${Math.round(cfg.tasa_cop || 4100.0).toLocaleString('es-CO')} COP`;

  const hRateVes = document.getElementById('headerRateVes');
  if (hRateVes) hRateVes.textContent = vesStr;
  const sRateVes = document.getElementById('sidebarRateVes');
  if (sRateVes) sRateVes.textContent = vesStr;

  const mRateVes = document.getElementById('mobileRateVes');
  if (mRateVes) mRateVes.textContent = parseFloat(cfg.tasa_ves || 45.0).toFixed(2);
  const mRateCop = document.getElementById('mobileRateCop');
  if (mRateCop) mRateCop.textContent = Math.round(cfg.tasa_cop || 4100.0).toLocaleString('es-CO');

  const hRateCop = document.getElementById('headerRateCop');
  if (hRateCop) hRateCop.textContent = copStr;
  const sRateCop = document.getElementById('sidebarRateCop');
  if (sRateCop) sRateCop.textContent = copStr;

  const sDate = document.getElementById('sidebarRatesDate');
  if (sDate) {
    if (cfg.fecha_tasas_actualizacion) {
      const fechaCorta = cfg.fecha_tasas_actualizacion.split(' ')[0];
      sDate.textContent = fechaCorta;
    } else {
      sDate.textContent = 'Hoy';
    }
  }

  const lblIva = document.getElementById('lblIvaPct');
  if (lblIva) lblIva.textContent = `${cfg.iva_porcentaje}%`;

  // Badges Dinámicos de Modo de Tasas (Auto vs Manual)
  const modoAuto = cfg.sincronizacion_tasas_auto !== 0;
  const badgeSidebar = document.getElementById('badgeTasasOficiales');
  if (badgeSidebar) {
    if (modoAuto) {
      badgeSidebar.className = 'text-[10px] text-emerald-400 font-mono flex items-center cursor-pointer';
      badgeSidebar.innerHTML = '<i class="fa-solid fa-bolt text-[7px] mr-1 text-emerald-400"></i>Auto';
    } else {
      badgeSidebar.className = 'text-[10px] text-amber-400 font-mono flex items-center cursor-pointer';
      badgeSidebar.innerHTML = '<i class="fa-solid fa-hand text-[8px] mr-1 text-amber-400"></i>Manual';
    }
  }

  const badgeHeader = document.getElementById('headerTasasModoBadge');
  if (badgeHeader) {
    if (modoAuto) {
      badgeHeader.className = 'text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-700 border border-emerald-300';
      badgeHeader.innerHTML = '<i class="fa-solid fa-bolt mr-1"></i>Auto';
    } else {
      badgeHeader.className = 'text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700 border border-amber-300';
      badgeHeader.innerHTML = '<i class="fa-solid fa-hand mr-1"></i>Manual';
    }
  }

  const badgeHeaderMob = document.getElementById('headerTasasModoBadgeMob');
  if (badgeHeaderMob) {
    if (modoAuto) {
      badgeHeaderMob.className = 'ml-0.5 text-[8px] bg-emerald-100 text-emerald-800 px-1 py-0.2 rounded font-sans font-bold';
      badgeHeaderMob.textContent = 'Auto';
    } else {
      badgeHeaderMob.className = 'ml-0.5 text-[8px] bg-amber-100 text-amber-800 px-1 py-0.2 rounded font-sans font-bold';
      badgeHeaderMob.textContent = 'Manual';
    }
  }
}

// Sincronización Automática de Tasas Oficiales (BCV & TRM)
async function sincronizarTasasOficiales(silent = false) {
  const icon = document.getElementById('iconSyncTasas');
  const btn = document.getElementById('btnSyncTasasSidebar');
  const iconHead = document.getElementById('headerIconSync');
  if (icon) icon.classList.add('fa-spin');
  if (iconHead) iconHead.classList.add('fa-spin');
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/tasas/actualizar-auto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (res.ok && data.success) {
      AppState.config.tasa_ves = data.tasa_ves;
      AppState.config.tasa_cop = data.tasa_cop;
      AppState.config.fecha_tasas_actualizacion = data.fecha_tasas_actualizacion;
      AppState.config.fuente_tasas = data.fuente_tasas;

      updateConfigUI();
      if (AppState.currentView === 'facturacion') updatePosTotals();
      if (AppState.currentView === 'devoluciones') actualizarTotalesDevolucion();
      if (AppState.currentView === 'cxc') loadCxc();
      if (AppState.currentView === 'reportes') loadReportes();
      if (AppState.currentView === 'dashboard') loadDashboard();

      if (!silent) {
        alert(`✅ Tasas oficiales actualizadas correctamente:\n• BCV: ${parseFloat(data.tasa_ves).toFixed(2)} Bs./USD\n• TRM: ${parseFloat(data.tasa_cop).toLocaleString('es-CO')} COP/USD\n• Fuente: ${data.fuente_tasas}`);
      }
    } else {
      if (!silent) {
        alert('Aviso: ' + (data.error || 'No se pudieron consultar las tasas oficiales en este momento.'));
      }
    }
  } catch (err) {
    if (!silent) {
      alert('Error al conectar con el servicio de tasas oficiales: ' + err.message);
    }
  } finally {
    if (icon) icon.classList.remove('fa-spin');
    if (iconHead) iconHead.classList.remove('fa-spin');
    if (btn) btn.disabled = false;
  }
}

// ========================================================
// CONTROL DE MODO DE TASAS (AUTOMÁTICO VS MANUAL)
// ========================================================
function openTasasModal() {
  const cfg = AppState.config;
  const modal = document.getElementById('modalTasas');
  if (!modal) return;

  const inVes = document.getElementById('modalTasaVes');
  const inCop = document.getElementById('modalTasaCop');
  const swAuto = document.getElementById('switchTasasAuto');
  const lblFuente = document.getElementById('modalTasasFuente');
  const lblFecha = document.getElementById('modalTasasFecha');

  if (inVes) inVes.value = cfg.tasa_ves || 45.0;
  if (inCop) inCop.value = cfg.tasa_cop || 4100.0;
  if (swAuto) swAuto.checked = cfg.sincronizacion_tasas_auto !== 0;
  if (lblFuente) lblFuente.textContent = cfg.fuente_tasas || 'Oficial';
  if (lblFecha) lblFecha.textContent = cfg.fecha_tasas_actualizacion ? cfg.fecha_tasas_actualizacion.split(' ')[0] : 'Hoy';

  updateTasasModoBanner(cfg.sincronizacion_tasas_auto !== 0);
  modal.classList.remove('hidden');
}

function closeTasasModal() {
  const modal = document.getElementById('modalTasas');
  if (modal) modal.classList.add('hidden');
}

function updateTasasModoBanner(isAuto) {
  const banner = document.getElementById('tasasModoBanner');
  const title = document.getElementById('tasasModoTitle');
  const desc = document.getElementById('tasasModoDesc');

  if (isAuto) {
    if (title) title.textContent = 'Sincronización Oficial Automática (Encendida)';
    if (desc) desc.textContent = 'Actualiza automáticamente las tasas oficiales de BCV y TRM.';
    if (banner) {
      banner.className = 'text-xs p-2.5 rounded-xl border bg-emerald-50 border-emerald-200 text-emerald-800 flex items-center';
      banner.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-600 mr-2 text-sm shrink-0"></i><span><strong>Modo Automático:</strong> El sistema consulta el BCV y la TRM diariamente.</span>';
    }
  } else {
    if (title) title.textContent = 'Modo Manual (Sincronización Apagada)';
    if (desc) desc.textContent = 'Tus tasas personalizadas se respetan y nunca serán sobrescritas.';
    if (banner) {
      banner.className = 'text-xs p-2.5 rounded-xl border bg-amber-50 border-amber-200 text-amber-800 flex items-center';
      banner.innerHTML = '<i class="fa-solid fa-hand text-amber-600 mr-2 text-sm shrink-0"></i><span><strong>Modo Manual:</strong> Sincronización oficial apagada. Las tasas que tú fijes se mantendrán protegidas.</span>';
    }
  }
}

async function onToggleModoTasas(isAuto) {
  AppState.config.sincronizacion_tasas_auto = isAuto ? 1 : 0;
  updateTasasModoBanner(isAuto);

  try {
    const res = await fetch('/api/tasas/toggle-auto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sincronizacion_tasas_auto: isAuto ? 1 : 0 })
    });
    if (res.ok) {
      updateConfigUI();
      if (isAuto) {
        if (confirm('✅ Sincronización oficial activada.\n\n¿Deseas consultar y actualizar las tasas oficiales del BCV y TRM ahora mismo?')) {
          await sincronizarTasasOficiales(false);
          const inVes = document.getElementById('modalTasaVes');
          const inCop = document.getElementById('modalTasaCop');
          if (inVes) inVes.value = AppState.config.tasa_ves;
          if (inCop) inCop.value = AppState.config.tasa_cop;
        }
      }
    }
  } catch (err) {
    console.error('Error al cambiar modo de tasas:', err);
  }
}

async function guardarTasasManual(e) {
  e.preventDefault();
  const tasaVes = parseFloat(document.getElementById('modalTasaVes').value);
  const tasaCop = parseFloat(document.getElementById('modalTasaCop').value);

  if (isNaN(tasaVes) || tasaVes <= 0 || isNaN(tasaCop) || tasaCop <= 0) {
    alert('Por favor introduce valores numéricos válidos y mayores a 0 para ambas tasas.');
    return;
  }

  try {
    const res = await fetch('/api/tasas/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tasa_ves: tasaVes,
        tasa_cop: tasaCop,
        apagar_auto: true,
        fuente: 'Manual (Personalizado)'
      })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      AppState.config.tasa_ves = tasaVes;
      AppState.config.tasa_cop = tasaCop;
      AppState.config.sincronizacion_tasas_auto = 0;
      AppState.config.fuente_tasas = 'Manual (Personalizado)';
      AppState.config.fecha_tasas_actualizacion = data.fecha_tasas_actualizacion;

      const sw = document.getElementById('switchTasasAuto');
      if (sw) sw.checked = false;
      updateTasasModoBanner(false);
      updateConfigUI();

      if (AppState.currentView === 'facturacion') updatePosTotals();
      if (AppState.currentView === 'devoluciones') actualizarTotalesDevolucion();
      if (AppState.currentView === 'cxc') loadCxc();
      if (AppState.currentView === 'reportes') loadReportes();
      if (AppState.currentView === 'dashboard') loadDashboard();

      alert(`✅ Tasas manuales guardadas con éxito:\n• Dólar en Bs: ${tasaVes.toFixed(2)} Bs.\n• Dólar en COP: ${tasaCop.toLocaleString('es-CO')} COP\n\nLa sincronización automática ha quedado apagada para preservar tus tasas.`);
      closeTasasModal();
    } else {
      alert('Error guardando tasas: ' + (data.error || 'Ocurrió un error inesperado'));
    }
  } catch (err) {
    alert('Error al conectar con el servidor: ' + err.message);
  }
}

async function sincronizarTasasOficialesDesdeModal() {
  const icon = document.getElementById('modalIconSync');
  if (icon) icon.classList.add('fa-spin');
  try {
    await sincronizarTasasOficiales(false);
    const inVes = document.getElementById('modalTasaVes');
    const inCop = document.getElementById('modalTasaCop');
    const lblFuente = document.getElementById('modalTasasFuente');
    const lblFecha = document.getElementById('modalTasasFecha');

    if (inVes) inVes.value = AppState.config.tasa_ves;
    if (inCop) inCop.value = AppState.config.tasa_cop;
    if (lblFuente) lblFuente.textContent = AppState.config.fuente_tasas || 'Oficial';
    if (lblFecha) lblFecha.textContent = AppState.config.fecha_tasas_actualizacion ? AppState.config.fecha_tasas_actualizacion.split(' ')[0] : 'Hoy';
  } finally {
    if (icon) icon.classList.remove('fa-spin');
  }
}


// ========================================================
// CONTROLADOR DE LOGOTIPO MULTI-TENANT (FASE 2)
// ========================================================
let flagQuitarLogo = false;

function previewLogoConfig(event) {
  const input = event.target;
  const preview = document.getElementById('cfgLogoPreview');
  const icon = document.getElementById('cfgLogoPlaceholderIcon');
  const btnQuitar = document.getElementById('btnQuitarLogo');

  if (input.files && input.files[0]) {
    const file = input.files[0];
    if (file.size > 2 * 1024 * 1024) {
      alert('⚠️ El archivo seleccionado supera el límite de 2MB. Por favor seleccione una imagen más liviana.');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
      if (preview) {
        preview.src = e.target.result;
        preview.classList.remove('hidden');
        preview.style.display = 'block';
      }
      if (icon) icon.classList.add('hidden');
      if (btnQuitar) btnQuitar.classList.remove('hidden');
      flagQuitarLogo = false;
    };
    reader.readAsDataURL(file);
  }
}

function quitarLogoConfig() {
  const input = document.getElementById('logoUpload');
  const preview = document.getElementById('cfgLogoPreview');
  const icon = document.getElementById('cfgLogoPlaceholderIcon');
  const btnQuitar = document.getElementById('btnQuitarLogo');

  if (input) input.value = '';
  if (preview) {
    preview.src = '';
    preview.classList.add('hidden');
    preview.style.display = 'none';
  }
  if (icon) icon.classList.remove('hidden');
  if (btnQuitar) btnQuitar.classList.add('hidden');
  flagQuitarLogo = true;
}

function openConfigModal() {
  const cfg = AppState.config || {};
  document.getElementById('cfgTasaVes').value = cfg.tasa_ves || 45.0;
  document.getElementById('cfgTasaCop').value = cfg.tasa_cop || 4100.0;
  document.getElementById('cfgIva').value = cfg.iva_porcentaje !== undefined ? cfg.iva_porcentaje : 16.0;
  document.getElementById('cfgNombreNegocio').value = cfg.nombre_negocio || '';
  document.getElementById('cfgRif').value = cfg.documento_fiscal || '';
  document.getElementById('cfgTelefono').value = cfg.telefono || '';
  document.getElementById('cfgDireccion').value = cfg.direccion || '';
  const swAuto = document.getElementById('cfgTasasAutoSwitch');
  if (swAuto) swAuto.checked = cfg.sincronizacion_tasas_auto !== 0;

  // Hidratar vista previa del logo en el modal
  const preview = document.getElementById('cfgLogoPreview');
  const icon = document.getElementById('cfgLogoPlaceholderIcon');
  const btnQuitar = document.getElementById('btnQuitarLogo');
  const inputLogo = document.getElementById('logoUpload');
  if (inputLogo) inputLogo.value = '';
  flagQuitarLogo = false;

  if (cfg.logo_url) {
    if (preview) {
      preview.src = cfg.logo_url;
      preview.classList.remove('hidden');
      preview.style.display = 'block';
    }
    if (icon) icon.classList.add('hidden');
    if (btnQuitar) btnQuitar.classList.remove('hidden');
  } else {
    if (preview) {
      preview.src = '';
      preview.classList.add('hidden');
      preview.style.display = 'none';
    }
    if (icon) icon.classList.remove('hidden');
    if (btnQuitar) btnQuitar.classList.add('hidden');
  }

  document.getElementById('modalConfig').classList.remove('hidden');
}

function closeConfigModal() {
  document.getElementById('modalConfig').classList.add('hidden');
}

async function saveConfig(e) {
  e.preventDefault();
  const swAuto = document.getElementById('cfgTasasAutoSwitch');
  const fileInput = document.getElementById('logoUpload');
  const logoFile = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;

  if (logoFile && logoFile.size > 2 * 1024 * 1024) {
    alert('El archivo de logotipo supera el límite máximo de 2MB. Por favor seleccione un archivo más liviano.');
    return;
  }

  // Refactorización a FormData (empaqueta texto + archivo binario en la misma petición)
  const formData = new FormData();
  formData.append('tasa_ves', document.getElementById('cfgTasaVes').value);
  formData.append('tasa_cop', document.getElementById('cfgTasaCop').value);
  formData.append('iva_porcentaje', document.getElementById('cfgIva').value);
  formData.append('nombre_negocio', document.getElementById('cfgNombreNegocio').value);
  formData.append('documento_fiscal', document.getElementById('cfgRif').value);
  formData.append('telefono', document.getElementById('cfgTelefono').value);
  formData.append('direccion', document.getElementById('cfgDireccion').value);
  formData.append('sincronizacion_tasas_auto', swAuto ? (swAuto.checked ? '1' : '0') : '1');

  if (logoFile) {
    formData.append('logo', logoFile);
  }
  if (flagQuitarLogo) {
    formData.append('quitar_logo', '1');
  }

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (res.ok && data.success) {
      AppState.config = {
        ...AppState.config,
        nombre_negocio: document.getElementById('cfgNombreNegocio').value,
        documento_fiscal: document.getElementById('cfgRif').value,
        telefono: document.getElementById('cfgTelefono').value,
        direccion: document.getElementById('cfgDireccion').value,
        tasa_ves: parseFloat(document.getElementById('cfgTasaVes').value),
        tasa_cop: parseFloat(document.getElementById('cfgTasaCop').value),
        iva_porcentaje: parseFloat(document.getElementById('cfgIva').value),
        sincronizacion_tasas_auto: swAuto ? (swAuto.checked ? 1 : 0) : 1,
        logo_url: data.logo_url !== undefined ? data.logo_url : AppState.config.logo_url
      };
      updateConfigUI();
      closeConfigModal();
      if (AppState.currentView === 'facturacion') updatePosTotals();
      alert('Configuración y logotipo de empresa guardados correctamente.');
    } else {
      alert('Error al guardar configuración: ' + (data.message || 'Error desconocido'));
    }
  } catch (err) {
    alert('Error al conectar con el servidor: ' + err.message);
  }
}

// ========================================================
// GESTIÓN DE BASE DE DATOS & BETA TESTER
// ========================================================
async function openDatabaseModal() {
  const modal = document.getElementById('modalBaseDatos');
  if (modal) {
    modal.classList.remove('hidden');
    await loadDatabaseStatus();
  }
}

function closeDatabaseModal() {
  const modal = document.getElementById('modalBaseDatos');
  if (modal) modal.classList.add('hidden');
}

async function loadDatabaseStatus() {
  try {
    const res = await fetch('/api/database/status');
    if (!res.ok) return;
    const data = await res.json();
    
    const isCloudEphemeral = data.es_efimero || (data.is_render && !data.supabase_conectado) || (window.location.hostname.includes('onrender.com') && !data.supabase_conectado);
    
    // Banner superior si está en la nube efímera
    const alertBanner = document.getElementById('cloudEphemeralAlert');
    if (alertBanner) {
      if (isCloudEphemeral && sessionStorage.getItem('dismissCloudAlert') !== '1') {
        alertBanner.classList.remove('hidden');
      } else {
        alertBanner.classList.add('hidden');
      }
    }

    const badgeEl = document.getElementById('dbPersistenceBadge');
    if (badgeEl) {
      if (data.supabase_conectado) {
        badgeEl.innerHTML = `<span class="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-1 rounded-full text-xs font-semibold flex items-center">
          <i class="fa-solid fa-cloud mr-1.5 text-emerald-600"></i>Persistencia Nube Supabase (Activa - No se borra)
        </span>`;
      } else if (isCloudEphemeral) {
        badgeEl.innerHTML = `<span class="bg-rose-100 text-rose-800 border border-rose-300 px-2.5 py-1 rounded-full text-xs font-semibold flex items-center">
          <i class="fa-solid fa-triangle-exclamation mr-1.5 text-rose-600"></i>Modo Volátil Efímero (Render sin Supabase)
        </span>`;
      } else {
        badgeEl.innerHTML = `<span class="bg-sky-100 text-sky-800 border border-sky-300 px-2.5 py-1 rounded-full text-xs font-semibold flex items-center">
          <i class="fa-solid fa-hard-drive mr-1.5 text-sky-600"></i>Almacenamiento Local Permanente (SQLite en Disco)
        </span>`;
      }
    }

    const elTam = document.getElementById('dbStatTamano');
    const elFac = document.getElementById('dbStatFacturas');
    const elCom = document.getElementById('dbStatCompras');
    const elPrd = document.getElementById('dbStatProductos');

    if (elTam) elTam.textContent = data.tamano_formateado || '0 KB';
    if (elFac) elFac.textContent = data.facturas_count || 0;
    if (elCom) elCom.textContent = data.compras_count || 0;
    if (elPrd) elPrd.textContent = data.productos_count || 0;

    const noticeEl = document.getElementById('dbWarningNotice');
    if (noticeEl) {
      if (isCloudEphemeral) {
        noticeEl.classList.remove('hidden');
      } else {
        noticeEl.classList.add('hidden');
      }
    }
  } catch (err) {
    console.error('Error cargando estado de base de datos:', err);
  }
}

async function probarConexionSupabase() {
  const resultEl = document.getElementById('dbSupabaseTestResult');
  const btn = document.getElementById('btnProbarSupabase');
  if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i>Probando...';
  if (resultEl) resultEl.textContent = 'Verificando credenciales...';

  try {
    const res = await fetch('/api/database/test-supabase');
    const data = await res.json();
    const isOk = Boolean(data.ok || data.conectado || data.success);
    if (isOk) {
      if (resultEl) {
        resultEl.innerHTML = `<span class="text-emerald-600 font-bold"><i class="fa-solid fa-check mr-1"></i>Conectado exitosamente (Bucket: ${data.bucket || 'database'})</span>`;
      }
      alert('✅ Conexión con Supabase verificada exitosamente.\n\nBucket: ' + (data.bucket || 'database') + '\n\nLa base de datos se respaldará automáticamente en la nube.');
      await loadDatabaseStatus();
    } else {
      if (resultEl) {
        resultEl.innerHTML = `<span class="text-rose-600 font-semibold"><i class="fa-solid fa-xmark mr-1"></i>No conectado: ${data.error || 'Credenciales no configuradas'}</span>`;
      }
      alert('⚠️ Supabase no está conectado.\n\nDetalle: ' + (data.detalle || data.error || 'Faltan SUPABASE_URL o SUPABASE_KEY en Render.'));
    }
  } catch (err) {
    if (resultEl) resultEl.textContent = 'Error: ' + err.message;
    alert('Error al probar conexión: ' + err.message);
  } finally {
    if (btn) btn.innerHTML = '<i class="fa-solid fa-plug mr-1.5 text-sky-600"></i>Probar Conexión Supabase';
  }
}

function downloadDatabaseBackup() {
  window.location.href = '/api/database/backup';
}

async function ejecutarAuditoriaBD() {
  const btn = document.getElementById('btnAuditarBD');
  const container = document.getElementById('dbAuditResultContainer');
  const details = document.getElementById('dbAuditDetails');
  const badge = document.getElementById('dbAuditStatusBadge');

  if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Auditando base de datos...';
  try {
    const res = await fetch('/api/database/audit');
    if (!res.ok) throw new Error('Error HTTP ' + res.status);
    const data = await res.json();
    if (container) container.classList.remove('hidden');
    if (badge) {
      if (data.estado === 'saludable') {
        badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800';
        badge.textContent = '● 100% Saludable';
      } else {
        badge.className = 'px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800';
        badge.textContent = '● ' + data.estado;
      }
    }
    let html = `<div><strong>Integridad Física:</strong> ${data.integridad_fisica}</div>`;
    html += `<div><strong>Claves Foráneas:</strong> ${data.claves_foraneas}</div>`;
    if (data.migraciones_aplicadas && data.migraciones_aplicadas.length > 0) {
      html += `<div class="text-teal-700"><strong>Columnas Reparadas / Migradas:</strong> ${data.migraciones_aplicadas.join(', ')}</div>`;
    } else {
      html += `<div class="text-emerald-700"><strong>Esquema:</strong> 100% Sincronizado (0 columnas faltantes).</div>`;
    }
    if (data.tablas) {
      html += `<div class="pt-1.5 border-t border-slate-200 text-slate-500 font-sans text-[11px] grid grid-cols-2 gap-1">`;
      for (const [tbl, info] of Object.entries(data.tablas)) {
        html += `<div>• ${tbl}: <strong>${info.registros}</strong> reg.</div>`;
      }
      html += `</div>`;
    }
    if (details) details.innerHTML = html;
    await loadDatabaseStatus();
  } catch (err) {
    alert('Error al ejecutar auditoría: ' + err.message);
  } finally {
    if (btn) btn.innerHTML = '<i class="fa-solid fa-clipboard-check mr-2 text-teal-400"></i>Auditar y Reparar Esquema Automáticamente';
  }
}

async function triggerDatabaseClean() {
  const code = prompt('⚠️ ATENCIÓN: Esta acción LIMPIARÁ todas las ventas, compras y deudas de prueba para iniciar un ciclo nuevo.\n\nSe conservarán productos, categorías y clientes.\n\nEscribe "BORRAR" para confirmar:');
  if (code !== 'BORRAR') {
    if (code !== null) alert('Operación cancelada. El código ingresado no coincide.');
    return;
  }
  try {
    const res = await fetch('/api/database/clean-transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmacion: 'CONFIRMAR_RESTABLECER_FABRICA_AUTORIZADO' })
    });
    const data = await res.json();
    if (data.success) {
      alert('✅ ' + data.message);
      await loadDatabaseStatus();
      if (typeof loadDashboard === 'function') loadDashboard();
      if (typeof loadProducts === 'function') loadProducts();
      if (typeof loadCategorias === 'function') loadCategorias();
      if (typeof loadClientes === 'function') loadClientes();
    } else {
      alert('Error: ' + (data.message || 'No se pudo limpiar la base de datos'));
    }
  } catch (err) {
    alert('Error al conectar con el servidor: ' + err.message);
  }
}

async function triggerFactoryReset() {
  const code = prompt('⚠️ PELIGRO: Esta acción restablecerá el sistema a una BASE DE DATOS LIMPIA DE FÁBRICA.\n\nSe eliminarán facturas, compras, productos y clientes creados.\n\nEscribe "LIMPIAR" para confirmar:');
  if (code !== 'LIMPIAR') {
    if (code !== null) alert('Operación cancelada. El código ingresado no coincide.');
    return;
  }
  try {
    const res = await fetch('/api/database/factory-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmacion: 'CONFIRMAR_RESTABLECER_FABRICA_AUTORIZADO' })
    });
    const data = await res.json();
    if (data.success) {
      alert('✅ ' + data.message);
      window.location.reload();
    } else {
      alert('Error: ' + (data.message || 'No se pudo restablecer la base de datos'));
    }
  } catch (err) {
    alert('Error al conectar con el servidor: ' + err.message);
  }
}

async function handleRestoreFile(input) {
  const file = input.files[0];
  if (!file) return;

  if (!confirm(`¿Deseas restaurar la base de datos desde el archivo "${file.name}"?\n\nLos datos actuales serán reemplazados por el archivo seleccionado.`)) {
    input.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = async function(e) {
    const arrayBuffer = e.target.result;
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    try {
      const res = await fetch('/api/database/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_base64: base64 })
      });
      const data = await res.json();
      if (data.success) {
        alert('✅ Base de datos restaurada exitosamente.');
        window.location.reload();
      } else {
        alert('Error restaurando: ' + (data.message || 'Archivo no válido'));
      }
    } catch (err) {
      alert('Error al conectar con el servidor: ' + err.message);
    }
    input.value = '';
  };
  reader.readAsArrayBuffer(file);
}

// ========================================================
// DASHBOARD
// ========================================================
async function loadDashboard() {
  try {
    const res = await fetch('/api/dashboard');
    if (!res.ok) return;
    const data = await res.json();

    document.getElementById('dashTotalProductos').textContent = data.total_productos;
    document.getElementById('dashTotalServicios').textContent = data.total_servicios;
    document.getElementById('dashAlertasStock').textContent = data.alertas_stock;

    const totalVentas = parseFloat(data.ventas_total_usd || 0);
    document.getElementById('dashTotalVentas').textContent = `$${totalVentas.toFixed(2)}`;
    const equivBs = (totalVentas * AppState.config.tasa_ves).toFixed(2);
    document.getElementById('dashTotalVentasBs').textContent = `≈ ${parseFloat(equivBs).toLocaleString('es-VE')} Bs.`;

    // Cuentas por Cobrar Total
    const cxcTotalUsd = parseFloat(data.cxc_total_usd || 0);
    const cxcPendientes = data.cxc_pendientes || 0;
    const elDashCxc = document.getElementById('dashTotalCxc');
    if (elDashCxc) elDashCxc.textContent = `$${cxcTotalUsd.toFixed(2)}`;
    const elDashCxcBs = document.getElementById('dashTotalCxcBs');
    if (elDashCxcBs) {
      const cxcBs = (cxcTotalUsd * AppState.config.tasa_ves).toFixed(2);
      elDashCxcBs.textContent = `≈ ${parseFloat(cxcBs).toLocaleString('es-VE')} Bs. (${cxcPendientes} pendientes)`;
    }

    // Cuentas por Pagar Total (CXP)
    const cxpTotalUsd = parseFloat(data.cxp_total_usd || 0);
    const cxpPendientes = data.cxp_pendientes || 0;
    const elDashCxp = document.getElementById('dashTotalCxp');
    if (elDashCxp) elDashCxp.textContent = `$${cxpTotalUsd.toFixed(2)}`;
    const elDashCxpBs = document.getElementById('dashTotalCxpBs');
    if (elDashCxpBs) {
      const cxpBs = (cxpTotalUsd * AppState.config.tasa_ves).toFixed(2);
      elDashCxpBs.textContent = `≈ ${parseFloat(cxpBs).toLocaleString('es-VE')} Bs. (${cxpPendientes} activas)`;
    }

    // Lista de productos con bajo stock
    const stockListEl = document.getElementById('dashStockList');
    if (data.productos_bajo_stock && data.productos_bajo_stock.length > 0) {
      stockListEl.innerHTML = data.productos_bajo_stock.map(p => `
        <div class="flex items-center justify-between p-3 bg-rose-50/60 border border-rose-100 rounded-xl text-sm">
          <div>
            <p class="font-semibold text-slate-800">${escapeHtml(p.nombre)}</p>
            <p class="text-xs text-slate-500">${escapeHtml(p.categoria_nombre)} &bull; Cód: ${escapeHtml(p.codigo)}</p>
          </div>
          <div class="text-right">
            <span class="inline-block px-2.5 py-1 rounded-lg text-xs font-bold ${p.stock <= 0 ? 'bg-rose-600 text-white' : 'bg-amber-100 text-amber-800'}">
              ${p.stock <= 0 ? 'AGOTADO' : `Stock: ${p.stock}`}
            </span>
            <p class="text-[11px] text-slate-400 mt-0.5">Mín: ${p.stock_minimo}</p>
          </div>
        </div>
      `).join('');
    } else {
      stockListEl.innerHTML = `
        <div class="text-center py-6 text-slate-400 text-sm">
          <i class="fa-solid fa-check-circle text-emerald-500 text-2xl mb-1 block"></i>
          ¡Excelente! Todos los productos tienen existencias suficientes.
        </div>
      `;
    }

    // Lista de últimas facturas
    const facturasListEl = document.getElementById('dashFacturasList');
    if (data.ultimas_facturas && data.ultimas_facturas.length > 0) {
      facturasListEl.innerHTML = data.ultimas_facturas.map(f => `
        <div class="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm hover:bg-slate-100 transition cursor-pointer" onclick="verFacturaEmitida(${f.id})">
          <div>
            <p class="font-bold text-slate-800">${escapeHtml(f.numero_factura)}</p>
            <p class="text-xs text-slate-500">${escapeHtml(f.cliente_nombre)} &bull; ${formatFecha(f.fecha)}</p>
          </div>
          <div class="text-right">
            <p class="font-bold text-indigo-700">$${parseFloat(f.total_usd).toFixed(2)}</p>
            <p class="text-xs text-slate-500">${parseFloat(f.total_ves).toFixed(2)} Bs.</p>
          </div>
        </div>
      `).join('');
    } else {
      facturasListEl.innerHTML = `
        <div class="text-center py-6 text-slate-400 text-sm">
          Aún no se han emitido facturas.
        </div>
      `;
    }

    // Top 5 Productos Más Vendidos
    const topProdEl = document.getElementById('dashTopProductosList');
    if (topProdEl) {
      if (data.top_productos && data.top_productos.length > 0) {
        topProdEl.innerHTML = data.top_productos.map((p, idx) => {
          const medalColors = [
            'bg-amber-100 text-amber-800 border-amber-300 font-black',
            'bg-slate-200 text-slate-800 border-slate-300 font-bold',
            'bg-amber-700/10 text-amber-900 border-amber-600/30 font-bold',
            'bg-slate-100 text-slate-600 font-medium',
            'bg-slate-100 text-slate-600 font-medium'
          ];
          const badgeClass = medalColors[idx] || 'bg-slate-100 text-slate-600';
          return `
            <div class="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm">
              <div class="flex items-center space-x-3">
                <span class="w-7 h-7 rounded-full flex items-center justify-center text-xs border ${badgeClass}">
                  #${idx + 1}
                </span>
                <div>
                  <p class="font-bold text-slate-800">${escapeHtml(p.nombre_producto)}</p>
                  <p class="text-xs text-slate-400">${p.tipo === 'producto' ? `Stock actual: ${p.stock_actual}` : 'Servicio'}</p>
                </div>
              </div>
              <div class="text-right">
                <span class="inline-block px-2.5 py-0.5 rounded-lg text-xs font-extrabold bg-indigo-100 text-indigo-800">
                  ${p.total_vendido} vendidos
                </span>
                <p class="text-xs font-bold text-slate-700 mt-0.5">$${parseFloat(p.total_usd).toFixed(2)}</p>
              </div>
            </div>
          `;
        }).join('');
      } else {
        topProdEl.innerHTML = `<div class="text-center py-6 text-slate-400 text-xs">No hay datos de ventas aún.</div>`;
      }
    }

    // Top 5 Mejores Clientes
    const topCliEl = document.getElementById('dashTopClientesList');
    if (topCliEl) {
      if (data.top_clientes && data.top_clientes.length > 0) {
        topCliEl.innerHTML = data.top_clientes.map((c, idx) => {
          const medalColors = [
            'bg-amber-100 text-amber-800 border-amber-300 font-black',
            'bg-slate-200 text-slate-800 border-slate-300 font-bold',
            'bg-amber-700/10 text-amber-900 border-amber-600/30 font-bold',
            'bg-slate-100 text-slate-600 font-medium',
            'bg-slate-100 text-slate-600 font-medium'
          ];
          const badgeClass = medalColors[idx] || 'bg-slate-100 text-slate-600';
          return `
            <div class="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm">
              <div class="flex items-center space-x-3">
                <span class="w-7 h-7 rounded-full flex items-center justify-center text-xs border ${badgeClass}">
                  #${idx + 1}
                </span>
                <div>
                  <p class="font-bold text-slate-800">${escapeHtml(c.nombre)}</p>
                  <p class="text-xs text-slate-400">${escapeHtml(c.cedula)} &bull; ${escapeHtml(c.telefono || '')}</p>
                </div>
              </div>
              <div class="text-right">
                <span class="inline-block px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800">
                  ${c.total_facturas} facturas
                </span>
                <p class="text-xs font-extrabold text-indigo-700 mt-0.5">$${parseFloat(c.total_comprado_usd).toFixed(2)}</p>
              </div>
            </div>
          `;
        }).join('');
      } else {
        topCliEl.innerHTML = `<div class="text-center py-6 text-slate-400 text-xs">No hay clientes con compras aún.</div>`;
      }
    }

  } catch (err) {
    console.error("Error al cargar dashboard:", err);
  }
}

// ========================================================
// MÓDULO 1: CATEGORÍAS (SERVICIOS Y PRODUCTOS)
// ========================================================
async function loadCategorias() {
  try {
    const res = await fetch('/api/categorias');
    if (!res.ok) return;
    AppState.categorias = await res.json();
    renderCategoriasTable();
    populateCategoryDropdowns();
  } catch (err) {
    console.error("Error cargando categorías:", err);
  }
}

function filterCategorias(tipo) {
  AppState.categoriaFilter = tipo;
  ['todos', 'producto', 'servicio'].forEach(t => {
    const btn = document.getElementById(`filter-cat-${t}`);
    if (btn) {
      if (t === tipo) {
        btn.className = 'px-3.5 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white';
      } else {
        btn.className = 'px-3.5 py-1.5 rounded-lg text-sm font-medium bg-slate-200 text-slate-700 hover:bg-slate-300';
      }
    }
  });
  renderCategoriasTable();
}

function renderCategoriasTable() {
  const tbody = document.getElementById('categoriasTableBody');
  if (!tbody) return;

  let filtradas = AppState.categorias;
  if (AppState.categoriaFilter !== 'todos') {
    filtradas = filtradas.filter(c => c.tipo === AppState.categoriaFilter);
  }

  if (filtradas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400">No hay categorías registradas en esta clasificación.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtradas.map(c => {
    const esProducto = c.tipo === 'producto';
    const badgeClasificacion = esProducto
      ? `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
           <i class="fa-solid fa-box-open mr-1.5"></i>Producto
         </span>`
      : `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
           <i class="fa-solid fa-wrench mr-1.5"></i>Servicio
         </span>`;

    const reglaExistencia = esProducto
      ? `<span class="text-emerald-700 text-xs font-medium"><i class="fa-solid fa-check mr-1"></i>Controla existencia</span>`
      : `<span class="text-slate-400 text-xs font-medium"><i class="fa-solid fa-ban mr-1"></i>No maneja existencia</span>`;

    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="py-3 px-4 font-mono text-xs text-slate-400">#${c.id}</td>
        <td class="py-3 px-4 font-bold text-slate-800">${escapeHtml(c.nombre)}</td>
        <td class="py-3 px-4">${badgeClasificacion}</td>
        <td class="py-3 px-4">${reglaExistencia}</td>
        <td class="py-3 px-4 text-slate-500 text-xs">${escapeHtml(c.descripcion || '-')}</td>
        <td class="py-3 px-4 text-right space-x-1">
          <button onclick="editCategoria(${c.id})" class="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg" title="Editar">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button onclick="deleteCategoria(${c.id})" class="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg" title="Eliminar">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function openCategoryModal(isEdit = false) {
  document.getElementById('catModalTitle').textContent = isEdit ? 'Editar Categoría' : 'Nueva Categoría';
  if (!isEdit) {
    document.getElementById('catId').value = '';
    document.getElementById('catNombre').value = '';
    document.getElementById('catTipo').value = 'producto';
    document.getElementById('catDescripcion').value = '';
  }
  document.getElementById('modalCategoria').classList.remove('hidden');
}

function closeCategoryModal() {
  document.getElementById('modalCategoria').classList.add('hidden');
}

function editCategoria(id) {
  const cat = AppState.categorias.find(c => c.id === id);
  if (!cat) return;
  document.getElementById('catId').value = cat.id;
  document.getElementById('catNombre').value = cat.nombre;
  document.getElementById('catTipo').value = cat.tipo;
  document.getElementById('catDescripcion').value = cat.descripcion || '';
  openCategoryModal(true);
}

async function saveCategoria(e) {
  e.preventDefault();
  const id = document.getElementById('catId').value;
  const payload = {
    nombre: document.getElementById('catNombre').value.trim(),
    tipo: document.getElementById('catTipo').value,
    descripcion: document.getElementById('catDescripcion').value.trim()
  };

  try {
    const url = id ? `/api/categorias/${id}` : '/api/categorias';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      closeCategoryModal();
      await loadCategorias();
    } else {
      const err = await res.json();
      alert('Error: ' + (err.error || 'No se pudo guardar la categoría'));
    }
  } catch (err) {
    alert('Error al guardar categoría: ' + err.message);
  }
}

async function deleteCategoria(id) {
  if (!confirm('¿Seguro que deseas eliminar esta categoría?')) return;
  try {
    const res = await fetch(`/api/categorias/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await loadCategorias();
    } else {
      const err = await res.json();
      alert('Error: ' + (err.error || 'No se pudo eliminar la categoría'));
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

function populateCategoryDropdowns() {
  // Selector en modal de producto
  const prodSelect = document.getElementById('prodCategoriaId');
  if (prodSelect) {
    prodSelect.innerHTML = `<option value="">Selecciona una categoría...</option>` +
      AppState.categorias.map(c => `
        <option value="${c.id}" data-tipo="${c.tipo}">${escapeHtml(c.nombre)} (${c.tipo.toUpperCase()})</option>
      `).join('');
  }

  // Selector en filtro de productos
  const filterSelect = document.getElementById('prodFilterCategoria');
  if (filterSelect) {
    filterSelect.innerHTML = `<option value="">Todas las categorías</option>` +
      AppState.categorias.map(c => `
        <option value="${c.id}">${escapeHtml(c.nombre)}</option>
      `).join('');
  }

  // Selector en modal rápido de compra
  const quickSelect = document.getElementById('quickItemCategoria');
  if (quickSelect) {
    const productosCats = AppState.categorias.filter(c => c.tipo === 'producto');
    quickSelect.innerHTML = productosCats.map(c => `
      <option value="${c.id}">${escapeHtml(c.nombre)}</option>
    `).join('');
  }
}

// ========================================================
// MÓDULO 2: PRODUCTOS & SERVICIOS
// ========================================================
async function loadProductos() {
  try {
    const search = document.getElementById('prodSearchInput')?.value.trim() || '';
    const tipo = document.getElementById('prodFilterTipo')?.value || '';
    const categoriaId = document.getElementById('prodFilterCategoria')?.value || '';

    const params = new URLSearchParams();
    if (search) params.append('q', search);
    if (tipo) params.append('tipo', tipo);
    if (categoriaId) params.append('categoria_id', categoriaId);

    const res = await fetch(`/api/productos?${params.toString()}`);
    if (!res.ok) return;
    AppState.productos = await res.json();
    renderProductosTable();
  } catch (err) {
    console.error("Error al cargar productos:", err);
  }
}

function renderProductosTable() {
  const tbody = document.getElementById('productosTableBody');
  if (!tbody) return;

  if (AppState.productos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-8 text-slate-400">No se encontraron productos o servicios que coincidan con la búsqueda.</td></tr>`;
    return;
  }

  tbody.innerHTML = AppState.productos.map(p => {
    const esProducto = p.tipo === 'producto';
    const esGravado = p.impuesto_tipo === 'gravado';

    const badgeTipo = esProducto
      ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">Producto</span>`
      : `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">Servicio</span>`;

    const badgeImpuesto = esGravado
      ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700">Gravado (16%)</span>`
      : `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-600">Exento (0%)</span>`;

    // Existencia
    let stockDisplay = '';
    if (esProducto) {
      if (p.stock <= 0) {
        stockDisplay = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700">Agotado (0)</span>`;
      } else if (p.stock <= p.stock_minimo) {
        stockDisplay = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">${p.stock} (Bajo)</span>`;
      } else {
        stockDisplay = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">${p.stock} disp.</span>`;
      }
    } else {
      stockDisplay = `<span class="text-slate-400 text-xs italic">N/A (Servicio)</span>`;
    }

    // Imagen en miniatura
    const imgHtml = p.imagen
      ? `<img src="${p.imagen}" alt="${escapeHtml(p.nombre)}" class="w-10 h-10 object-cover rounded-lg border border-slate-200">`
      : `<div class="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 text-xs">
           <i class="fa-solid ${esProducto ? 'fa-box' : 'fa-wrench'}"></i>
         </div>`;

    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="py-3 px-4">
          <div class="flex items-center space-x-3">
            ${imgHtml}
            <div>
              <p class="font-bold text-slate-900 leading-snug">${escapeHtml(p.nombre)}</p>
              <p class="text-xs text-slate-400">${escapeHtml(p.descripcion || '')}</p>
            </div>
          </div>
        </td>
        <td class="py-3 px-4 font-mono text-xs text-slate-500 font-semibold">${escapeHtml(p.codigo)}</td>
        <td class="py-3 px-4 text-xs font-medium text-slate-600">${escapeHtml(p.categoria_nombre)}</td>
        <td class="py-3 px-4">${badgeTipo}</td>
        <td class="py-3 px-4">${badgeImpuesto}</td>
        <td class="py-3 px-4 text-sm font-semibold text-slate-700">$${parseFloat(p.precio_base).toFixed(2)}</td>
        <td class="py-3 px-4 text-sm font-extrabold text-indigo-700">
          $${parseFloat(p.precio_total).toFixed(2)}
          <span class="block text-[11px] font-normal text-slate-500">≈ ${(p.precio_total * AppState.config.tasa_ves).toFixed(2)} Bs.</span>
        </td>
        <td class="py-3 px-4">${stockDisplay}</td>
        <td class="py-3 px-4 text-right space-x-1">
          <button onclick="editProducto(${p.id})" class="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg" title="Editar">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button onclick="deleteProducto(${p.id})" class="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg" title="Desactivar">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function openProductoModal(isEdit = false, origen = 'productos') {
  AppState.productoModalOrigen = origen;
  document.getElementById('prodModalTitle').textContent = isEdit ? 'Editar Ítem' : 'Crear Producto o Servicio';
  const prodStockEl = document.getElementById('prodStock');
  if (prodStockEl) {
    prodStockEl.readOnly = false;
    prodStockEl.classList.remove('bg-slate-100', 'cursor-not-allowed');
    prodStockEl.classList.add('bg-white');
    prodStockEl.title = '';
  }
  if (!isEdit) {
    document.getElementById('prodId').value = '';
    document.getElementById('prodCodigo').value = '';
    document.getElementById('prodNombre').value = '';
    document.getElementById('prodCategoriaId').value = '';
    document.getElementById('prodTipo').value = 'producto';
    document.getElementById('prodImpuestoTipo').value = 'gravado';
    document.getElementById('prodPrecioBase').value = '0.00';
    document.getElementById('prodPrecioTotal').value = '0.00';
    document.getElementById('prodStock').value = '10';
    document.getElementById('prodStockMinimo').value = '5';
    document.getElementById('prodCosto').value = '0.00';
    document.getElementById('prodDescripcion').value = '';
    document.getElementById('prodImageBase64').value = '';
    document.getElementById('prodImagePreviewWrap').classList.add('hidden');
    document.getElementById('prodImageFile').value = '';
  }
  populateCategoryDropdowns();
  toggleProductStockFields();
  calcularPreciosProducto();
  document.getElementById('modalProducto').classList.remove('hidden');
}

function closeProductoModal() {
  document.getElementById('modalProducto').classList.add('hidden');
}

function onSelectCategoriaInProductForm() {
  const select = document.getElementById('prodCategoriaId');
  const opt = select.options[select.selectedIndex];
  if (opt && opt.dataset.tipo) {
    document.getElementById('prodTipo').value = opt.dataset.tipo;
    toggleProductStockFields();
  }
}

function toggleProductStockFields() {
  const tipo = document.getElementById('prodTipo').value;
  const stockContainer = document.getElementById('containerStockFields');
  const serviceNotice = document.getElementById('containerServiceNotice');

  if (tipo === 'servicio') {
    stockContainer.classList.add('hidden');
    serviceNotice.classList.remove('hidden');
  } else {
    stockContainer.classList.remove('hidden');
    serviceNotice.classList.add('hidden');
  }
}

function calcularPreciosProducto() {
  const precioBase = parseFloat(document.getElementById('prodPrecioBase').value) || 0;
  const impuestoTipo = document.getElementById('prodImpuestoTipo').value;
  const ivaPct = (AppState.config.iva_porcentaje || 16.0) / 100.0;

  let ivaMonto = 0;
  if (impuestoTipo === 'gravado') {
    ivaMonto = precioBase * ivaPct;
  }

  const precioTotal = precioBase + ivaMonto;

  document.getElementById('prodPrecioTotal').value = precioTotal.toFixed(2);
  document.getElementById('lblIvaCalculado').textContent = `$${ivaMonto.toFixed(2)}`;

  // Conversiones a Bs y COP en tiempo real
  const equivBs = (precioTotal * AppState.config.tasa_ves).toFixed(2);
  const equivCop = Math.round(precioTotal * AppState.config.tasa_cop).toLocaleString('es-CO');
  document.getElementById('lblEquivalenteBs').textContent = `Equiv: ${equivBs} Bs. | ${equivCop} COP`;
}

function previewProductImage(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const base64 = e.target.result;
    document.getElementById('prodImageBase64').value = base64;
    document.getElementById('prodImagePreview').src = base64;
    document.getElementById('prodImagePreviewWrap').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function editProducto(id) {
  const prod = AppState.productos.find(p => p.id === id);
  if (!prod) return;

  document.getElementById('prodId').value = prod.id;
  document.getElementById('prodCodigo').value = prod.codigo;
  document.getElementById('prodNombre').value = prod.nombre;
  document.getElementById('prodCategoriaId').value = prod.categoria_id;
  document.getElementById('prodTipo').value = prod.tipo;
  document.getElementById('prodImpuestoTipo').value = prod.impuesto_tipo;
  document.getElementById('prodPrecioBase').value = prod.precio_base;
  const editStockEl = document.getElementById('prodStock');
  editStockEl.value = prod.stock;
  editStockEl.readOnly = true;
  editStockEl.classList.remove('bg-white');
  editStockEl.classList.add('bg-slate-100', 'cursor-not-allowed');
  editStockEl.title = 'El stock no se puede editar directamente. Utilice Ajuste de Inventario o Compras.';
  document.getElementById('prodStockMinimo').value = prod.stock_minimo;
  document.getElementById('prodCosto').value = prod.costo;
  document.getElementById('prodDescripcion').value = prod.descripcion || '';
  document.getElementById('prodImageBase64').value = prod.imagen || '';

  if (prod.imagen) {
    document.getElementById('prodImagePreview').src = prod.imagen;
    document.getElementById('prodImagePreviewWrap').classList.remove('hidden');
  } else {
    document.getElementById('prodImagePreviewWrap').classList.add('hidden');
  }

  openProductoModal(true);
}

async function saveProducto(e) {
  e.preventDefault();
  const id = document.getElementById('prodId').value;
  const payload = {
    codigo: document.getElementById('prodCodigo').value.trim(),
    nombre: document.getElementById('prodNombre').value.trim(),
    categoria_id: parseInt(document.getElementById('prodCategoriaId').value),
    tipo: document.getElementById('prodTipo').value,
    impuesto_tipo: document.getElementById('prodImpuestoTipo').value,
    precio_base: parseFloat(document.getElementById('prodPrecioBase').value),
    costo: parseFloat(document.getElementById('prodCosto').value) || 0,
    stock: parseFloat(document.getElementById('prodStock').value) || 0,
    stock_minimo: parseFloat(document.getElementById('prodStockMinimo').value) || 5,
    descripcion: document.getElementById('prodDescripcion').value.trim(),
    imagen: document.getElementById('prodImageBase64').value
  };

  try {
    if (id) {
      delete payload.stock; // FASE 2C: Neutralizar envío de stock en PUT
    }
    const url = id ? `/api/productos/${id}` : '/api/productos';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const resData = await res.json().catch(() => ({}));
      closeProductoModal();
      await loadProductos();
      await loadDashboard();
  await loadDatabaseStatus();
  initRolUsuario();

      // Si se creó desde Compras, poblar y auto-seleccionar el nuevo ítem
      if (AppState.productoModalOrigen === 'compras' || AppState.currentView === 'compras') {
        populateComprasSelectors();
        const nuevoProd = AppState.productos.find(p => 
          (resData && resData.id && p.id === resData.id) ||
          (p.codigo && p.codigo === payload.codigo) ||
          p.nombre.toLowerCase() === payload.nombre.toLowerCase()
        );
        if (nuevoProd) {
          const selectItem = document.getElementById('compraItemSelect');
          if (selectItem) {
            selectItem.value = nuevoProd.id;
            if (selectItem.onchange) selectItem.onchange();
            const cantInput = document.getElementById('compraItemCant');
            if (cantInput) cantInput.value = 1;
            const costoInput = document.getElementById('compraItemCosto');
            if (costoInput) costoInput.value = parseFloat(nuevoProd.costo || 0).toFixed(2);
          }
        }
      }
      AppState.productoModalOrigen = 'productos';
    } else {
      const err = await res.json();
      alert('Error: ' + (err.error || 'No se pudo guardar el ítem'));
    }
  } catch (err) {
    alert('Error al guardar el ítem: ' + err.message);
  }
}

async function deleteProducto(id) {
  if (!confirm('¿Seguro que deseas desactivar este ítem?')) return;
  try {
    const res = await fetch(`/api/productos/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await loadProductos();
      await loadDashboard();
  await loadDatabaseStatus();
  initRolUsuario();
    } else {
      const err = await res.json();
      alert('Error: ' + (err.error || 'No se pudo eliminar'));
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ========================================================
// MÓDULO 3: CLIENTES
// ========================================================
async function loadClientes() {
  try {
    const search = document.getElementById('clienteSearchInput')?.value.trim() || '';
    const url = search ? `/api/clientes?q=${encodeURIComponent(search)}` : '/api/clientes';
    const res = await fetch(url);
    if (!res.ok) return;
    AppState.clientes = await res.json();
    renderClientesTable();
  } catch (err) {
    console.error("Error al cargar clientes:", err);
  }
}

function renderClientesTable() {
  const tbody = document.getElementById('clientesTableBody');
  if (!tbody) return;

  if (AppState.clientes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400">No se encontraron clientes.</td></tr>`;
    return;
  }

  tbody.innerHTML = AppState.clientes.map(c => {
    // Generar enlace directo de WhatsApp
    const waPhone = c.telefono.replace(/[^0-9]/g, '');
    const waLink = `https://wa.me/${waPhone}?text=${encodeURIComponent(`Hola ${c.nombre}, te contactamos de ${AppState.config.nombre_negocio}.`)}`;

    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="py-3 px-4 font-mono text-xs font-bold text-slate-700">${escapeHtml(c.cedula)}</td>
        <td class="py-3 px-4 font-bold text-slate-900">${escapeHtml(c.nombre)}</td>
        <td class="py-3 px-4">
          <a href="${waLink}" target="_blank" rel="noopener noreferrer" 
             class="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition">
            <i class="fa-brands fa-whatsapp text-emerald-600 mr-1.5 text-sm"></i>
            ${escapeHtml(c.telefono)}
          </a>
        </td>
        <td class="py-3 px-4 text-xs text-slate-500">${escapeHtml(c.correo || '-')}</td>
        <td class="py-3 px-4 text-xs text-slate-500">${escapeHtml(c.direccion || '-')}</td>
        <td class="py-3 px-4 text-right space-x-1">
          <button onclick="editCliente(${c.id})" class="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg" title="Editar">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button onclick="deleteCliente(${c.id})" class="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg" title="Eliminar">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function openClienteModal(isEdit = false, origen = 'clientes') {
  AppState.clienteModalOrigen = origen;
  document.getElementById('clienteModalTitle').textContent = isEdit ? 'Editar Cliente' : 'Registrar Cliente';
  if (!isEdit) {
    document.getElementById('clienteId').value = '';
    document.getElementById('clienteNombre').value = '';
    document.getElementById('clienteCedula').value = '';
    document.getElementById('clienteTelefono').value = '';
    document.getElementById('clienteCorreo').value = '';
    document.getElementById('clienteDireccion').value = '';
  }
  document.getElementById('modalCliente').classList.remove('hidden');
}

function closeClienteModal() {
  document.getElementById('modalCliente').classList.add('hidden');
}

function editCliente(id) {
  const c = AppState.clientes.find(cli => cli.id === id);
  if (!c) return;
  document.getElementById('clienteId').value = c.id;
  document.getElementById('clienteNombre').value = c.nombre;
  document.getElementById('clienteCedula').value = c.cedula;
  document.getElementById('clienteTelefono').value = c.telefono;
  document.getElementById('clienteCorreo').value = c.correo || '';
  document.getElementById('clienteDireccion').value = c.direccion || '';
  openClienteModal(true, 'clientes');
}

async function saveCliente(e) {
  e.preventDefault();
  const id = document.getElementById('clienteId').value;
  const payload = {
    nombre: document.getElementById('clienteNombre').value.trim(),
    cedula: document.getElementById('clienteCedula').value.trim(),
    telefono: document.getElementById('clienteTelefono').value.trim(),
    correo: document.getElementById('clienteCorreo').value.trim(),
    direccion: document.getElementById('clienteDireccion').value.trim()
  };

  try {
    const url = id ? `/api/clientes/${id}` : '/api/clientes';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const resData = await res.json().catch(() => ({}));
      closeClienteModal();
      await loadClientes();

      const nuevoId = (resData && resData.id) || (AppState.clientes.find(cli => cli.cedula === payload.cedula)?.id);

      if (AppState.clienteModalOrigen === 'facturacion' || AppState.currentView === 'facturacion') {
        populatePosSelectors();
        if (nuevoId) {
          seleccionarClientePOS(nuevoId);
        }
      } else if (AppState.clienteModalOrigen === 'devoluciones' || AppState.currentView === 'devoluciones') {
        populateDevolucionClientes();
        if (nuevoId) {
          seleccionarClienteDevolucion(nuevoId);
        }
      }
      AppState.clienteModalOrigen = 'clientes';
    } else {
      const err = await res.json();
      alert('Error: ' + (err.error || 'No se pudo guardar el cliente'));
    }
  } catch (err) {
    alert('Error al guardar cliente: ' + err.message);
  }
}

async function deleteCliente(id) {
  if (!confirm('¿Seguro que deseas eliminar este cliente?')) return;
  try {
    const res = await fetch(`/api/clientes/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await loadClientes();
    } else {
      const err = await res.json();
      alert('Error: ' + (err.error || 'No se pudo eliminar el cliente'));
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ========================================================
// MÓDULO 4: FACTURACIÓN & PUNTO DE VENTA (MULTIMONEDA)
// ========================================================
function populatePosSelectors() {
  // Mantener compatibilidad si se limpian o recargan clientes
  const clienteId = document.getElementById('posClienteSelect')?.value;
  if (clienteId) {
    const c = AppState.clientes.find(cli => cli.id == clienteId);
    if (c) seleccionarClientePOS(c.id);
  }
}

function buscarClientePOS(query = '') {
  const resultsDiv = document.getElementById('posClienteSearchResults');
  if (!resultsDiv) return;

  const q = (query || '').toLowerCase().trim();
  let matches = AppState.clientes;
  if (q) {
    matches = AppState.clientes.filter(c => 
      c.nombre.toLowerCase().includes(q) || 
      c.cedula.toLowerCase().includes(q) || 
      (c.telefono && c.telefono.includes(q))
    );
  }

  if (matches.length === 0) {
    resultsDiv.innerHTML = `
      <div class="p-3 text-xs text-slate-400 text-center">
        No se encontró ningún cliente con ese nombre o cédula.
        <button type="button" onclick="openClienteModal()" class="text-indigo-600 font-bold hover:underline block mx-auto mt-1">+ Crear Nuevo Cliente</button>
      </div>
    `;
    resultsDiv.classList.remove('hidden');
    return;
  }

  resultsDiv.innerHTML = matches.slice(0, 8).map(c => `
    <div onclick="seleccionarClientePOS(${c.id})" class="p-2.5 hover:bg-indigo-50 cursor-pointer flex items-center justify-between text-xs transition">
      <div>
        <p class="font-bold text-slate-800">${escapeHtml(c.nombre)}</p>
        <p class="text-slate-500 font-mono text-[11px]">${escapeHtml(c.cedula)} &bull; Tel: ${escapeHtml(c.telefono)}</p>
      </div>
      <span class="text-indigo-600 text-xs font-bold">Seleccionar &rarr;</span>
    </div>
  `).join('');
  resultsDiv.classList.remove('hidden');
}

function seleccionarClientePOS(clienteId) {
  const c = AppState.clientes.find(cli => cli.id === clienteId);
  if (!c) return;

  document.getElementById('posClienteSelect').value = c.id;
  document.getElementById('posSelectedClienteNombre').textContent = c.nombre;
  document.getElementById('posSelectedClienteCedula').textContent = c.cedula;
  document.getElementById('posSelectedClienteTelefono').textContent = c.telefono;

  document.getElementById('posClienteSelectedCard').classList.remove('hidden');
  document.getElementById('posClienteSearchResults').classList.add('hidden');
  document.getElementById('posClienteSearchInput').value = `${c.nombre} (${c.cedula})`;
  document.getElementById('btnClearClientePOS').classList.remove('hidden');
}

function limpiarClientePOS() {
  document.getElementById('posClienteSelect').value = '';
  document.getElementById('posClienteSelectedCard').classList.add('hidden');
  document.getElementById('posClienteSearchResults').classList.add('hidden');
  document.getElementById('posClienteSearchInput').value = '';
  document.getElementById('btnClearClientePOS').classList.add('hidden');
  document.getElementById('posClienteSearchInput').focus();
}

function setPosFilterCategory(tipo) {
  AppState.posFilterCategory = tipo;
  ['todos', 'producto', 'servicio'].forEach(t => {
    const btn = document.getElementById(`posCat-${t}`);
    if (btn) {
      if (t === tipo) {
        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white';
      } else {
        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200';
      }
    }
  });
  renderPosCatalog();
}

function renderPosCatalog() {
  const grid = document.getElementById('posCatalogGrid');
  if (!grid) return;

  const search = document.getElementById('posSearchProduct')?.value.toLowerCase().trim() || '';
  let filtrados = AppState.productos;

  if (AppState.posFilterCategory !== 'todos') {
    filtrados = filtrados.filter(p => p.tipo === AppState.posFilterCategory);
  }

  if (search) {
    filtrados = filtrados.filter(p => p.nombre.toLowerCase().includes(search) || p.codigo.toLowerCase().includes(search));
  }

  if (filtrados.length === 0) {
    grid.innerHTML = `<div class="col-span-full py-8 text-center text-slate-400 text-xs">No hay ítems para mostrar.</div>`;
    return;
  }

  grid.innerHTML = filtrados.map(p => {
    const esProducto = p.tipo === 'producto';
    const agotado = esProducto && p.stock <= 0;

    const imgTag = p.imagen
      ? `<img src="${p.imagen}" alt="${escapeHtml(p.nombre)}" class="w-12 h-12 object-cover rounded-xl shadow-xs">`
      : `<div class="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 text-lg">
           <i class="fa-solid ${esProducto ? 'fa-box' : 'fa-wrench'}"></i>
         </div>`;

    const badgeStock = esProducto
      ? `<span class="text-[10px] font-bold ${agotado ? 'text-rose-600' : 'text-emerald-600'}">Stock: ${p.stock}</span>`
      : `<span class="text-[10px] font-medium text-purple-600">Servicio</span>`;

    const badgeImpuesto = p.impuesto_tipo === 'gravado'
      ? `<span class="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">+16% IVA</span>`
      : `<span class="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">Exento</span>`;

    return `
      <div onclick="addPosItem(${p.id})" 
           class="bg-slate-50 hover:bg-indigo-50/70 border border-slate-200 hover:border-indigo-300 p-3 rounded-xl transition cursor-pointer flex flex-col justify-between space-y-2 select-none group ${agotado ? 'opacity-60 pointer-events-none' : ''}">
        <div class="flex items-start space-x-2.5">
          ${imgTag}
          <div class="flex-1 min-w-0">
            <p class="font-bold text-xs text-slate-800 truncate group-hover:text-indigo-700">${escapeHtml(p.nombre)}</p>
            <p class="text-[11px] text-slate-400 font-mono">${escapeHtml(p.codigo)}</p>
            <div class="flex items-center space-x-1 mt-1">
              ${badgeStock}
              ${badgeImpuesto}
            </div>
          </div>
        </div>
        <div class="pt-2 border-t border-slate-200/60 flex items-center justify-between">
          <div>
            <span class="text-xs font-extrabold text-indigo-700 block">$${parseFloat(p.precio_total).toFixed(2)}</span>
            <span class="text-[10px] text-slate-400">${(p.precio_total * AppState.config.tasa_ves).toFixed(2)} Bs.</span>
          </div>
          <button class="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs group-hover:scale-110 transition">
            <i class="fa-solid fa-plus"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function addPosItem(productoId) {
  const prod = AppState.productos.find(p => p.id === productoId);
  if (!prod) return;

  const existing = AppState.posCart.find(i => i.producto_id === productoId);

  // Si es producto, validar stock
  if (prod.tipo === 'producto') {
    const currentCant = existing ? existing.cantidad : 0;
    if (currentCant + 1 > prod.stock) {
      if (typeof showToast === 'function') {
        showToast(`Existencias insuficientes para '${prod.nombre}'. Disponibles: ${prod.stock}`, 'warning');
      } else {
        alert(`Existencias insuficientes para '${prod.nombre}'. Disponibles: ${prod.stock}`);
      }
      return;
    }
  }

  const ivaPct = (AppState.config.iva_porcentaje || 16.0) / 100.0;
  const ivaUnitario = prod.impuesto_tipo === 'gravado' ? (prod.precio_base * ivaPct) : 0;

  if (existing) {
    existing.cantidad += 1;
    existing.subtotal = existing.precio_unitario * existing.cantidad;
    existing.iva_total = existing.iva_unitario * existing.cantidad;
    existing.total = existing.subtotal + existing.iva_total;
  } else {
    AppState.posCart.push({
      producto_id: prod.id,
      nombre: prod.nombre,
      codigo: prod.codigo,
      tipo: prod.tipo,
      impuesto_tipo: prod.impuesto_tipo,
      precio_unitario: prod.precio_base,
      iva_unitario: ivaUnitario,
      cantidad: 1,
      stock_disponible: prod.stock,
      subtotal: prod.precio_base,
      iva_total: ivaUnitario,
      total: prod.precio_base + ivaUnitario
    });
  }

  renderPosCart();
}

function updatePosCartItemCant(productoId, delta) {
  const item = AppState.posCart.find(i => i.producto_id === productoId);
  if (!item) return;

  const newCant = item.cantidad + delta;
  if (newCant <= 0) {
    removePosCartItem(productoId);
    return;
  }

  // Validar existencia si es producto
  if (item.tipo === 'producto' && newCant > item.stock_disponible) {
    alert(`No puedes agregar más de ${item.stock_disponible} unidades disponibles.`);
    return;
  }

  item.cantidad = newCant;
  item.subtotal = item.precio_unitario * item.cantidad;
  item.iva_total = item.iva_unitario * item.cantidad;
  item.total = item.subtotal + item.iva_total;

  renderPosCart();
}

function removePosCartItem(productoId) {
  AppState.posCart = AppState.posCart.filter(i => i.producto_id !== productoId);
  renderPosCart();
}

function renderPosCart() {
  const container = document.getElementById('posCartItemsList');
  const countBadge = document.getElementById('posItemsCountBadge');

  if (!container) return;

  const totalCount = AppState.posCart.reduce((acc, i) => acc + i.cantidad, 0);
  if (countBadge) countBadge.textContent = `${totalCount} ${totalCount === 1 ? 'ítem' : 'ítems'}`;

  if (AppState.posCart.length === 0) {
    container.innerHTML = `<p class="text-sm text-slate-400 text-center py-8">El carrito está vacío. Selecciona productos o servicios de la izquierda.</p>`;
    updatePosTotals();
    return;
  }

  container.innerHTML = AppState.posCart.map(item => {
    return `
      <div class="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
        <div class="flex-1 pr-2 min-w-0">
          <p class="font-bold text-slate-800 truncate">${escapeHtml(item.nombre)}</p>
          <div class="flex items-center space-x-1.5 text-[11px] text-slate-400">
            <span>$${item.precio_unitario.toFixed(2)} c/u</span>
            <span>&bull;</span>
            <span class="${item.impuesto_tipo === 'gravado' ? 'text-blue-600 font-medium' : 'text-slate-500'}">
              ${item.impuesto_tipo === 'gravado' ? 'Gravado (16%)' : 'Exento'}
            </span>
          </div>
        </div>

        <!-- Controles de Cantidad -->
        <div class="flex items-center space-x-1.5">
          <button onclick="updatePosCartItemCant(${item.producto_id}, -1)" class="w-6 h-6 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center font-bold text-slate-600">
            -
          </button>
          <span class="w-6 text-center font-bold text-slate-800">${item.cantidad}</span>
          <button onclick="updatePosCartItemCant(${item.producto_id}, 1)" class="w-6 h-6 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center font-bold text-slate-600">
            +
          </button>
        </div>

        <!-- Total del Ítem y Quitar -->
        <div class="text-right pl-3">
          <span class="font-bold text-slate-900 block">$${item.total.toFixed(2)}</span>
          <button onclick="removePosCartItem(${item.producto_id})" class="text-[11px] text-rose-500 hover:underline">
            Quitar
          </button>
        </div>
      </div>
    `;
  }).join('');

  updatePosTotals();
}

function updatePosTotals() {
  const subtotal = AppState.posCart.reduce((acc, i) => acc + i.subtotal, 0);
  const iva = AppState.posCart.reduce((acc, i) => acc + i.iva_total, 0);
  const totalUsd = subtotal + iva;

  const totalVes = totalUsd * AppState.config.tasa_ves;
  const totalCop = Math.round(totalUsd * AppState.config.tasa_cop);

  document.getElementById('posSubtotalUsd').textContent = `$${subtotal.toFixed(2)}`;
  document.getElementById('posIvaUsd').textContent = `$${iva.toFixed(2)}`;
  document.getElementById('posTotalUsd').textContent = `$${totalUsd.toFixed(2)}`;
  document.getElementById('posTotalVes').textContent = `${totalVes.toFixed(2)} Bs.`;
  document.getElementById('posTotalCop').textContent = `${totalCop.toLocaleString('es-CO')} COP`;

  recalcularPagosMixtos();
}

// ========================================================
// PAGOS MIXTOS MULTIMONEDA (USD, VES, COP) & VENTAS A CRÉDITO
// ========================================================
function calcularSaldoPendienteParaFila(filaIdExcluida = null) {
  const subtotal = AppState.posCart.reduce((acc, i) => acc + i.subtotal, 0);
  const iva = AppState.posCart.reduce((acc, i) => acc + i.iva_total, 0);
  const totalUsd = subtotal + iva;

  let pagadoUSD = 0;
  AppState.posPagos.forEach(p => {
    if (filaIdExcluida !== null && p.id === filaIdExcluida) return;
    let equiv = 0;
    if (p.moneda === 'USD') equiv = p.monto;
    else if (p.moneda === 'VES') equiv = AppState.config.tasa_ves > 0 ? (p.monto / AppState.config.tasa_ves) : 0;
    else if (p.moneda === 'COP') equiv = AppState.config.tasa_cop > 0 ? (p.monto / AppState.config.tasa_cop) : 0;
    pagadoUSD += equiv;
  });

  return Math.max(0, totalUsd - pagadoUSD);
}

// Métodos de pago vinculados estrictamente por moneda
const METODOS_PAGO_POR_MONEDA = {
  USD: ['Dólar Efectivo', 'Zelle', 'Binance', 'Zinli'],
  COP: ['Pesos Efectivo', 'Bancolombia', 'Nequi'],
  VES: ['Pago Móvil', 'Transferencia', 'Punto de Venta']
};

function getMetodosPago(moneda) {
  return METODOS_PAGO_POR_MONEDA[moneda] || METODOS_PAGO_POR_MONEDA.USD;
}

function convertirUsdAMoneda(montoUsd, moneda) {
  if (moneda === 'USD') return Math.round(montoUsd * 100) / 100;
  if (moneda === 'VES') return Math.round(montoUsd * AppState.config.tasa_ves * 100) / 100;
  if (moneda === 'COP') return Math.round(montoUsd * AppState.config.tasa_cop);
  return montoUsd;
}

function initDefaultPosPago() {
  const subtotal = AppState.posCart.reduce((acc, i) => acc + i.subtotal, 0);
  const iva = AppState.posCart.reduce((acc, i) => acc + i.iva_total, 0);
  const totalUsd = subtotal + iva;

  AppState.posPagos = [
    {
      id: 1,
      moneda: 'USD',
      metodo: 'Dólar Efectivo',
      monto: totalUsd > 0 ? totalUsd : 0
    }
  ];
  renderPosPagos();
}

function addPagoRow() {
  const nextId = AppState.posPagos.length > 0 ? Math.max(...AppState.posPagos.map(p => p.id)) + 1 : 1;
  const saldoRestanteUSD = calcularSaldoPendienteParaFila();
  const defaultMoneda = AppState.posPagos.length === 1 && AppState.posPagos[0].moneda === 'USD' ? 'VES' : 'USD';
  const montoAuto = convertirUsdAMoneda(saldoRestanteUSD, defaultMoneda);
  const metodosDisponibles = getMetodosPago(defaultMoneda);

  AppState.posPagos.push({
    id: nextId,
    moneda: defaultMoneda,
    metodo: metodosDisponibles[0],
    monto: montoAuto
  });
  renderPosPagos();
}

function removePagoRow(id) {
  AppState.posPagos = AppState.posPagos.filter(p => p.id !== id);
  if (AppState.posPagos.length === 0) {
    initDefaultPosPago();
  } else {
    renderPosPagos();
  }
}

function renderPosPagos() {
  const container = document.getElementById('posPagosList');
  if (!container) return;

  container.innerHTML = AppState.posPagos.map(p => {
    const metodosDisponibles = getMetodosPago(p.moneda);
    if (!metodosDisponibles.includes(p.metodo)) {
      p.metodo = metodosDisponibles[0];
    }

    const metodosOptions = metodosDisponibles.map(m => `
      <option value="${m}" ${p.metodo === m ? 'selected' : ''}>${m}</option>
    `).join('');

    return `
      <div class="flex items-center space-x-2 bg-slate-50 p-2 rounded-xl border border-slate-200 text-xs">
        <!-- Moneda -->
        <select onchange="updatePagoMoneda(${p.id}, this.value)" class="bg-white border border-slate-200 rounded-lg py-1 px-2 font-bold text-slate-700">
          <option value="USD" ${p.moneda === 'USD' ? 'selected' : ''}>USD ($)</option>
          <option value="VES" ${p.moneda === 'VES' ? 'selected' : ''}>VES (Bs.)</option>
          <option value="COP" ${p.moneda === 'COP' ? 'selected' : ''}>COP (Pesos)</option>
        </select>

        <!-- Método dinámico por moneda -->
        <select onchange="updatePagoMetodo(${p.id}, this.value)" class="bg-white border border-slate-200 rounded-lg py-1 px-2 font-medium text-slate-700">
          ${metodosOptions}
        </select>

        <!-- Monto en esa moneda -->
        <div class="relative flex-1">
          <input type="number" step="any" min="0" value="${p.monto !== undefined && p.monto !== null ? p.monto : ''}" placeholder="Monto"
                 oninput="updatePagoMonto(${p.id}, this.value)"
                 class="w-full bg-white border border-slate-200 rounded-lg py-1 px-2 text-xs font-bold text-slate-900 text-right">
        </div>

        <!-- Quitar fila -->
        <button onclick="removePagoRow(${p.id})" class="text-rose-500 hover:text-rose-700 p-1" title="Quitar pago">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    `;
  }).join('');

  recalcularPagosMixtos();
}

function updatePagoMoneda(id, nuevaMoneda) {
  const p = AppState.posPagos.find(x => x.id === id);
  if (p) {
    p.moneda = nuevaMoneda;
    p.metodo = getMetodosPago(nuevaMoneda)[0];
    // Colocar automáticamente el saldo pendiente en la moneda seleccionada
    const saldoPendienteUSD = calcularSaldoPendienteParaFila(id);
    p.monto = convertirUsdAMoneda(saldoPendienteUSD, nuevaMoneda);
    renderPosPagos();
  }
}

function updatePagoMetodo(id, metodo) {
  const p = AppState.posPagos.find(x => x.id === id);
  if (p) p.metodo = metodo;
}

function updatePagoMonto(id, monto) {
  const p = AppState.posPagos.find(x => x.id === id);
  if (p) {
    p.monto = parseFloat(monto) || 0;
    recalcularPagosMixtos();
  }
}

function recalcularPagosMixtos() {
  const subtotal = AppState.posCart.reduce((acc, i) => acc + i.subtotal, 0);
  const iva = AppState.posCart.reduce((acc, i) => acc + i.iva_total, 0);
  const totalUsd = subtotal + iva;

  let totalPagadoUsd = 0;

  AppState.posPagos.forEach(p => {
    let equiv = 0;
    if (p.moneda === 'USD') {
      equiv = p.monto || 0;
    } else if (p.moneda === 'VES') {
      equiv = AppState.config.tasa_ves > 0 ? ((p.monto || 0) / AppState.config.tasa_ves) : 0;
    } else if (p.moneda === 'COP') {
      equiv = AppState.config.tasa_cop > 0 ? ((p.monto || 0) / AppState.config.tasa_cop) : 0;
    }
    p.equiv_usd = equiv;
    totalPagadoUsd += equiv;
  });

  const diff = totalPagadoUsd - totalUsd;
  document.getElementById('posPagadoUsd').textContent = `$${totalPagadoUsd.toFixed(2)}`;
  document.getElementById('posPagadoDetalle').textContent = `${AppState.posPagos.length} forma(s) de pago`;

  const balanceLabel = document.getElementById('posBalanceLabel');
  const balanceVal = document.getElementById('posBalanceVal');

  if (Math.abs(diff) < 0.01) {
    balanceLabel.textContent = 'Estado:';
    balanceVal.className = 'text-base font-bold text-emerald-600';
    balanceVal.textContent = 'Pago Completo Exacto ($0.00)';
  } else if (diff > 0) {
    balanceLabel.textContent = 'Vuelto / Cambio a Entregar:';
    balanceVal.className = 'text-base font-bold text-indigo-700';
    const vueltoBs = (diff * AppState.config.tasa_ves).toFixed(2);
    balanceVal.textContent = `$${diff.toFixed(2)} (${vueltoBs} Bs.)`;
  } else {
    balanceLabel.textContent = AppState.posTipoVenta === 'credito' ? 'Saldo a Crédito (CXC):' : 'Saldo Pendiente:';
    balanceVal.className = AppState.posTipoVenta === 'credito' ? 'text-base font-bold text-amber-700' : 'text-base font-bold text-rose-600';
    const pendienteBs = (Math.abs(diff) * AppState.config.tasa_ves).toFixed(2);
    balanceVal.textContent = `$${Math.abs(diff).toFixed(2)} (${pendienteBs} Bs.)`;
  }
}

function setPosTipoVenta(tipo) {
  AppState.posTipoVenta = tipo;
  const btnContado = document.getElementById('btnTipoVentaContado');
  const btnCredito = document.getElementById('btnTipoVentaCredito');
  const containerCredito = document.getElementById('posCreditoContainer');
  const btnProcesarContado = document.getElementById('btnProcesarContado');
  const btnProcesarCredito = document.getElementById('btnProcesarCredito');
  const lblFormasPagoTitulo = document.getElementById('lblFormasPagoTitulo');

  if (tipo === 'credito') {
    if (btnCredito) btnCredito.className = 'px-3 py-1 rounded-md text-xs font-bold bg-amber-500 text-white shadow-xs transition';
    if (btnContado) btnContado.className = 'px-3 py-1 rounded-md text-xs font-bold text-slate-600 hover:text-slate-900 transition';
    if (containerCredito) containerCredito.classList.remove('hidden');
    if (btnProcesarContado) btnProcesarContado.classList.add('hidden');
    if (btnProcesarCredito) btnProcesarCredito.classList.remove('hidden');
    if (lblFormasPagoTitulo) lblFormasPagoTitulo.innerHTML = `<i class="fa-solid fa-money-bill-transfer mr-1 text-amber-600"></i>Abono Inicial Opcional (Multimoneda)`;

    const fechaVencInput = document.getElementById('posFechaVencimiento');
    if (fechaVencInput && !fechaVencInput.value) {
      setVencimientoDias(15);
    }
  } else {
    if (btnContado) btnContado.className = 'px-3 py-1 rounded-md text-xs font-bold bg-white text-slate-900 shadow-xs transition';
    if (btnCredito) btnCredito.className = 'px-3 py-1 rounded-md text-xs font-bold text-slate-600 hover:text-slate-900 transition';
    if (containerCredito) containerCredito.classList.add('hidden');
    if (btnProcesarContado) btnProcesarContado.classList.remove('hidden');
    if (btnProcesarCredito) btnProcesarCredito.classList.add('hidden');
    if (lblFormasPagoTitulo) lblFormasPagoTitulo.innerHTML = `<i class="fa-solid fa-money-bill-transfer mr-1 text-emerald-600"></i>Formas de Pago Mixto`;
  }
  recalcularPagosMixtos();
}

function setVencimientoDias(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  const input = document.getElementById('posFechaVencimiento');
  if (input) input.value = d.toISOString().split('T')[0];
}

function limpiarPOS() {
  AppState.posCart = [];
  limpiarClientePOS();
  renderPosCart();
  setPosTipoVenta('contado');
  initDefaultPosPago();
}

async function procesarFactura(tipoVentaForzado = null) {
  const tipoVenta = tipoVentaForzado || AppState.posTipoVenta || 'contado';
  const clienteId = document.getElementById('posClienteSelect')?.value;
  if (!clienteId) {
    alert('Por favor busca y selecciona un cliente para la factura.');
    document.getElementById('posClienteSearchInput')?.focus();
    return;
  }

  if (AppState.posCart.length === 0) {
    alert('El carrito está vacío. Agrega productos o servicios.');
    return;
  }

  const subtotal = AppState.posCart.reduce((acc, i) => acc + i.subtotal, 0);
  const iva = AppState.posCart.reduce((acc, i) => acc + i.iva_total, 0);
  const totalUsd = subtotal + iva;

  let totalPagadoUsd = 0;
  const pagos = AppState.posPagos.filter(p => (parseFloat(p.monto) || 0) > 0).map(p => {
    let tasa = 1.0;
    if (p.moneda === 'VES') tasa = AppState.config.tasa_ves;
    if (p.moneda === 'COP') tasa = AppState.config.tasa_cop;
    const equiv = p.moneda === 'USD' ? p.monto : (tasa > 0 ? p.monto / tasa : 0);
    totalPagadoUsd += equiv;
    return {
      moneda: p.moneda,
      metodo: p.metodo,
      monto_moneda: p.monto,
      tasa_cambio: tasa,
      referencia: ''
    };
  });

  let fechaVencimiento = '';
  if (tipoVenta === 'credito') {
    fechaVencimiento = document.getElementById('posFechaVencimiento')?.value;
    if (!fechaVencimiento) {
      alert('Por favor selecciona la fecha de vencimiento para la venta a crédito.');
      return;
    }
  } else {
    if (totalPagadoUsd < totalUsd - 0.05) {
      const falta = (totalUsd - totalPagadoUsd).toFixed(2);
      if (confirm(`El monto pagado ($${totalPagadoUsd.toFixed(2)}) es menor al total ($${totalUsd.toFixed(2)}). Faltan $${falta}.\n\n¿Deseas facturarla A CRÉDITO y registrar el saldo en Cuentas por Cobrar?`)) {
        setPosTipoVenta('credito');
        return;
      }
      return;
    }
  }

  const payload = {
    cliente_id: parseInt(clienteId),
    tipo_venta: tipoVenta,
    fecha_vencimiento: fechaVencimiento,
    items: AppState.posCart.map(i => ({
      producto_id: i.producto_id,
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario
    })),
    pagos: pagos,
    notas: tipoVenta === 'credito' ? 'Venta a crédito enviada a cuentas por cobrar' : 'Venta por mostrador al contado'
  };

  try {
    const res = await fetch('/api/facturas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const data = await res.json();
      limpiarPOS();
      await loadProductos();
      await loadDashboard();
  await loadDatabaseStatus();
  initRolUsuario();
      if (AppState.currentView === 'cxc') await loadCxc();
      await verFacturaEmitida(data.id);
    } else {
      const err = await res.json();
      alert('Error en facturación: ' + (err.error || 'No se pudo completar'));
    }
  } catch (err) {
    alert('Error al procesar la factura: ' + err.message);
  }
}

// Ver e imprimir factura
async function verFacturaEmitida(facturaId) {
  try {
    const res = await fetch(`/api/facturas/${facturaId}`);
    if (!res.ok) return;
    const f = await res.json();
    AppState.ultimaFacturaEmitida = f;

    const cfg = AppState.config;
    document.getElementById('ticketBusinessName').textContent = cfg.nombre_negocio;
    document.getElementById('ticketBusinessRif').textContent = `RIF: ${cfg.documento_fiscal}`;
    document.getElementById('ticketBusinessPhone').textContent = `Tel: ${cfg.telefono}`;
    document.getElementById('ticketBusinessAddress').textContent = cfg.direccion;
    document.getElementById('ticketInvoiceNumber').textContent = `FACTURA #${f.numero_factura}`;
    document.getElementById('ticketInvoiceDate').textContent = `Fecha: ${formatFecha(f.fecha)}`;

    document.getElementById('ticketClientName').textContent = f.cliente_nombre;
    document.getElementById('ticketClientId').textContent = f.cliente_cedula;
    document.getElementById('ticketClientPhone').textContent = f.cliente_telefono;

    // Condición de Venta
    const condEl = document.getElementById('ticketCondition');
    const dueRow = document.getElementById('ticketDueDateRow');
    const dueVal = document.getElementById('ticketDueDate');
    const pendRow = document.getElementById('ticketPendingRow');
    const pendVal = document.getElementById('ticketPendingBalance');

    if (condEl) {
      if (f.tipo_venta === 'credito') {
        condEl.textContent = 'A CRÉDITO';
        condEl.className = 'uppercase font-black text-amber-700';
        if (dueRow) {
          dueRow.classList.remove('hidden');
          if (dueVal) dueVal.textContent = formatFecha(f.fecha_vencimiento);
        }
        if (pendRow) {
          pendRow.classList.remove('hidden');
          if (pendVal) pendVal.textContent = `$${parseFloat(f.saldo_pendiente || 0).toFixed(2)}`;
        }
      } else {
        condEl.textContent = 'AL CONTADO';
        condEl.className = 'uppercase font-black text-emerald-700';
        if (dueRow) dueRow.classList.add('hidden');
        if (pendRow) pendRow.classList.add('hidden');
      }
    }

    // Ítems
    const itemsTbody = document.getElementById('ticketItemsBody');
    itemsTbody.innerHTML = f.detalles.map(d => `
      <tr>
        <td class="py-1">${d.cantidad}</td>
        <td class="py-1 font-medium">${escapeHtml(d.nombre_producto)} ${d.impuesto_tipo === 'gravado' ? '(G)' : '(E)'}</td>
        <td class="py-1 text-right">$${parseFloat(d.precio_unitario).toFixed(2)}</td>
        <td class="py-1 text-right font-bold">$${parseFloat(d.total).toFixed(2)}</td>
      </tr>
    `).join('');

    // Totales
    document.getElementById('ticketSubtotal').textContent = `$${parseFloat(f.subtotal).toFixed(2)}`;
    document.getElementById('ticketIva').textContent = `$${parseFloat(f.iva_total).toFixed(2)}`;
    document.getElementById('ticketTotalUsd').textContent = `$${parseFloat(f.total_usd).toFixed(2)}`;
    document.getElementById('ticketTasaVes').textContent = parseFloat(f.tasa_ves).toFixed(2);
    document.getElementById('ticketTotalVes').textContent = `${parseFloat(f.total_ves).toFixed(2)} Bs.`;
    document.getElementById('ticketTasaCop').textContent = Math.round(f.tasa_cop).toLocaleString('es-CO');
    document.getElementById('ticketTotalCop').textContent = `${Math.round(f.total_cop).toLocaleString('es-CO')} COP`;

    // Pagos
    const paymentsBody = document.getElementById('ticketPaymentsBody');
    if (f.pagos && f.pagos.length > 0) {
      paymentsBody.innerHTML = f.pagos.map(p => `
        <div class="flex justify-between text-slate-600">
          <span>&bull; ${p.metodo} (${p.moneda}):</span>
          <span class="font-bold">${p.monto_moneda.toLocaleString('es-VE')} ${p.moneda} (≈ $${p.equivalente_usd.toFixed(2)})</span>
        </div>
      `).join('');
    } else {
      paymentsBody.innerHTML = `<span class="text-slate-400">Sin abono inicial / Total a crédito</span>`;
    }

    document.getElementById('modalFacturaEmitida').classList.remove('hidden');

  } catch (err) {
    console.error("Error al visualizar factura:", err);
  }
}

function closeModalFacturaEmitida() {
  document.getElementById('modalFacturaEmitida').classList.add('hidden');
}

function compartirFacturaWhatsApp() {
  const f = AppState.ultimaFacturaEmitida;
  if (!f) return;

  const waPhone = (f.cliente_telefono || '').replace(/[^0-9]/g, '');
  if (!waPhone) {
    alert('El cliente no tiene un número telefónico válido para WhatsApp.');
    return;
  }

  let mensaje = `*FACTURA ELECTRÓNICA - ${AppState.config.nombre_negocio}*\n`;
  mensaje += `N°: *${f.numero_factura}*\n`;
  mensaje += `Cliente: ${f.cliente_nombre} (${f.cliente_cedula})\n`;
  mensaje += `Condición: *${f.tipo_venta === 'credito' ? 'A CRÉDITO' : 'AL CONTADO'}*\n`;
  if (f.tipo_venta === 'credito') {
    mensaje += `Fecha Vencimiento: *${formatFecha(f.fecha_vencimiento)}*\n`;
    mensaje += `Saldo por Cobrar: *$${parseFloat(f.saldo_pendiente || 0).toFixed(2)}*\n`;
  }
  mensaje += `Fecha: ${formatFecha(f.fecha)}\n\n`;
  mensaje += `*DETALLE DE ÍTEMS:*\n`;

  f.detalles.forEach(d => {
    mensaje += `- ${d.cantidad}x ${d.nombre_producto}: $${parseFloat(d.total).toFixed(2)}\n`;
  });

  mensaje += `\n*TOTAL FACTURA:*\n`;
  mensaje += `*USD: $${parseFloat(f.total_usd).toFixed(2)}*\n`;
  mensaje += `Bolívares: ${parseFloat(f.total_ves).toFixed(2)} Bs.\n`;
  mensaje += `Pesos: ${Math.round(f.total_cop).toLocaleString('es-CO')} COP\n\n`;
  mensaje += `¡Gracias por su preferencia!`;

  const url = `https://wa.me/${waPhone}?text=${encodeURIComponent(mensaje)}`;
  window.open(url, '_blank');
}

function toggleHistorialFacturas() {
  const c = document.getElementById('historialFacturasContainer');
  const btn = document.getElementById('btnToggleHistorialFacturas');
  if (c.classList.contains('hidden')) {
    c.classList.remove('hidden');
    btn.innerHTML = `<i class="fa-solid fa-xmark mr-1.5"></i>Ocultar Historial`;
    loadFacturas();
  } else {
    c.classList.add('hidden');
    btn.innerHTML = `<i class="fa-solid fa-list-check mr-1.5"></i>Historial de Facturas`;
  }
}

async function loadFacturas() {
  try {
    const res = await fetch('/api/facturas');
    if (!res.ok) return;
    const facturas = await res.json();
    const tbody = document.getElementById('facturasTableBody');
    if (!tbody) return;

    if (facturas.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-slate-400">No hay facturas registradas.</td></tr>`;
      return;
    }

    tbody.innerHTML = facturas.map(f => {
      const esAnulada = f.estado === 'anulada';
      return `
      <tr class="hover:bg-slate-50 transition ${esAnulada ? 'opacity-60 bg-rose-50/30' : ''}">
        <td class="py-2.5 px-3 font-mono font-bold ${esAnulada ? 'line-through text-rose-700' : 'text-slate-800'}">
          ${escapeHtml(f.numero_factura)}
          ${esAnulada ? '<span class="ml-1.5 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold no-underline inline-block">ANULADA</span>' : ''}
        </td>
        <td class="py-2.5 px-3 text-xs text-slate-500">${formatFecha(f.fecha)}</td>
        <td class="py-2.5 px-3 font-medium text-slate-700">${escapeHtml(f.cliente_nombre)}</td>
        <td class="py-2.5 px-3 font-bold ${esAnulada ? 'line-through text-slate-400' : 'text-indigo-700'}">$${parseFloat(f.total_usd).toFixed(2)}</td>
        <td class="py-2.5 px-3 text-xs text-slate-600">${parseFloat(f.total_ves).toFixed(2)} Bs.</td>
        <td class="py-2.5 px-3 text-xs text-slate-600">${Math.round(f.total_cop).toLocaleString('es-CO')} COP</td>
        <td class="py-2.5 px-3 text-right space-x-1 whitespace-nowrap">
          <button onclick="verFacturaEmitida(${f.id})" class="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold">
            <i class="fa-solid fa-receipt mr-1"></i>Ver
          </button>
          ${!esAnulada ? `
          <button onclick="anularFactura(${f.id}, '${escapeHtml(f.numero_factura)}')" class="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-semibold" title="Anular factura y reintegrar stock">
            <i class="fa-solid fa-ban mr-1"></i>Anular
          </button>
          ` : ''}
        </td>
      </tr>
    `}).join('');
  } catch (err) {
    console.error("Error al cargar historial de facturas:", err);
  }
}

// ========================================================
// MÓDULO 5: DEVOLUCIONES Y NOTAS DE CRÉDITO (REINTEGRO DE INVENTARIO)
// ========================================================

const METODOS_REEMBOLSO_POR_MONEDA = {
  USD: ['Dólar Efectivo', 'Zelle', 'Binance', 'Zinli', 'Nota de Crédito'],
  COP: ['Pesos Efectivo', 'Bancolombia', 'Nequi'],
  VES: ['Pago Móvil', 'Transferencia', 'Punto de Venta']
};

function getMetodosReembolso(moneda) {
  return METODOS_REEMBOLSO_POR_MONEDA[moneda] || METODOS_REEMBOLSO_POR_MONEDA.USD;
}

function initDevolucionesView() {
  loadFacturasParaDevolucion();
  if (AppState.devolucionSubtab === 'historial') {
    loadDevoluciones();
  }
  if (!AppState.devPagos || AppState.devPagos.length === 0) {
    initDefaultDevPago();
  }
  renderDevCatalog();
  renderDevCart();
}

function cambiarSubtabDevoluciones(subtab) {
  AppState.devolucionSubtab = subtab;
  const containerNueva = document.getElementById('subtabDevNuevaContainer');
  const containerHistorial = document.getElementById('subtabDevHistorialContainer');
  const btnNueva = document.getElementById('btnSubtabDevNueva');
  const btnHistorial = document.getElementById('btnSubtabDevHistorial');

  if (subtab === 'nueva') {
    if (containerNueva) containerNueva.classList.remove('hidden');
    if (containerHistorial) containerHistorial.classList.add('hidden');
    if (btnNueva) {
      btnNueva.className = 'bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow transition flex items-center';
    }
    if (btnHistorial) {
      btnHistorial.className = 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2 rounded-xl text-sm font-medium shadow-sm transition flex items-center';
    }
    renderDevCatalog();
    renderDevCart();
  } else {
    if (containerNueva) containerNueva.classList.add('hidden');
    if (containerHistorial) containerHistorial.classList.remove('hidden');
    if (btnNueva) {
      btnNueva.className = 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2 rounded-xl text-sm font-medium shadow-sm transition flex items-center';
    }
    if (btnHistorial) {
      btnHistorial.className = 'bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow transition flex items-center';
    }
    loadDevoluciones();
  }
}

function setModoDevolucion(modo) {
  AppState.devolucionModo = modo;
  const boxFactura = document.getElementById('devBuscadorFacturaBox');
  const boxCliente = document.getElementById('devBuscadorClienteBox');
  const btnFactura = document.getElementById('btnModoDevFactura');
  const btnManual = document.getElementById('btnModoDevManual');
  const btnTotalAll = document.getElementById('btnDevTotalAll');
  const noticePagos = document.getElementById('devOriginalPagosNotice');

  if (modo === 'factura') {
    if (boxFactura) boxFactura.classList.remove('hidden');
    if (boxCliente) boxCliente.classList.add('hidden');
    if (btnFactura) {
      btnFactura.className = 'px-4 py-1.5 rounded-lg text-xs font-bold transition shadow-sm bg-white text-cyan-700';
    }
    if (btnManual) {
      btnManual.className = 'px-4 py-1.5 rounded-lg text-xs font-bold transition text-slate-600 hover:text-slate-900';
    }
    if (AppState.devolucionFacturaSeleccionada) {
      if (btnTotalAll) btnTotalAll.classList.remove('hidden');
      if (noticePagos) noticePagos.classList.remove('hidden');
    } else {
      if (btnTotalAll) btnTotalAll.classList.add('hidden');
      if (noticePagos) noticePagos.classList.add('hidden');
    }
  } else {
    if (boxFactura) boxFactura.classList.add('hidden');
    if (boxCliente) boxCliente.classList.remove('hidden');
    if (btnFactura) {
      btnFactura.className = 'px-4 py-1.5 rounded-lg text-xs font-bold transition text-slate-600 hover:text-slate-900';
    }
    if (btnManual) {
      btnManual.className = 'px-4 py-1.5 rounded-lg text-xs font-bold transition shadow-sm bg-white text-cyan-700';
    }
    if (btnTotalAll) btnTotalAll.classList.add('hidden');
    if (noticePagos) noticePagos.classList.add('hidden');
  }

  // Reiniciar carrito y pagos para el nuevo modo
  AppState.devCart = [];
  initDefaultDevPago();
  renderDevCatalog();
  renderDevCart();
}

function populateDevolucionClientes() {
  const sel = document.getElementById('devManualClienteSelect');
  if (!sel) return;
  const currVal = sel.value;
  sel.innerHTML = '<option value="">Seleccione cliente...</option>' +
    AppState.clientes.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)} (${escapeHtml(c.cedula)})</option>`).join('');
  if (currVal) sel.value = currVal;
}

function populateDevolucionProductos() {
  const sel = document.getElementById('devManualProductoSelect');
  if (!sel) return;
  sel.innerHTML = '<option value="">Seleccione ítem del catálogo...</option>' +
    AppState.productos.map(p => {
      const label = p.tipo === 'servicio' ? `[Servicio] ${p.nombre}` : `${p.nombre} (Stock: ${p.stock})`;
      return `<option value="${p.id}" data-precio="${p.precio_total}" data-impuesto="${p.impuesto_tipo}" data-tipo="${p.tipo}" data-codigo="${escapeHtml(p.codigo)}">${escapeHtml(label)}</option>`;
    }).join('');
}

async function loadFacturasParaDevolucion() {
  try {
    const res = await fetch('/api/facturas');
    if (!res.ok) return;
    AppState.facturasParaDevolucion = await res.json();
  } catch (err) {
    console.error("Error al cargar facturas para devolución:", err);
  }
}

function buscarFacturaDevolucion(query = '') {
  const resultsDiv = document.getElementById('devFacturaSearchResults');
  if (!resultsDiv) return;

  const q = (query || '').toLowerCase().trim();
  let matches = (AppState.facturasParaDevolucion || []).filter(f => f.estado !== 'anulada');
  if (q) {
    matches = matches.filter(f => 
      f.numero_factura.toLowerCase().includes(q) ||
      (f.cliente_nombre && f.cliente_nombre.toLowerCase().includes(q)) ||
      (f.cliente_cedula && f.cliente_cedula.toLowerCase().includes(q))
    );
  }

  if (matches.length === 0) {
    resultsDiv.innerHTML = `
      <div class="p-3 text-xs text-slate-400 text-center italic">
        No se encontraron facturas emitidas activas que coincidan con la búsqueda.
      </div>
    `;
    resultsDiv.classList.remove('hidden');
    return;
  }

  resultsDiv.innerHTML = matches.slice(0, 10).map(f => `
    <div onclick="seleccionarFacturaParaDevolucion(${f.id})" class="p-3 hover:bg-cyan-50 cursor-pointer flex items-center justify-between text-xs transition">
      <div>
        <div class="flex items-center space-x-2">
          <span class="font-bold text-slate-900 font-mono">${escapeHtml(f.numero_factura)}</span>
          <span class="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${f.tipo_venta === 'credito' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}">${f.tipo_venta}</span>
        </div>
        <p class="text-slate-600 mt-0.5">${escapeHtml(f.cliente_nombre || 'Consumidor Final')} &bull; <span class="font-mono">${escapeHtml(f.cliente_cedula || '')}</span></p>
        <p class="text-[11px] text-slate-400">${formatFecha(f.fecha)}</p>
      </div>
      <div class="text-right">
        <p class="font-black text-slate-800 text-sm">$${parseFloat(f.total_usd).toFixed(2)}</p>
        <span class="text-cyan-600 font-bold hover:underline">Seleccionar &rarr;</span>
      </div>
    </div>
  `).join('');
  resultsDiv.classList.remove('hidden');
}

function formatearPagosOriginalesResumen(factura) {
  const pagos = factura.pagos || [];
  if (pagos.length === 0) {
    if (factura.tipo_venta === 'credito') {
      return `<span class="text-amber-700 font-bold"><i class="fa-solid fa-clock mr-1"></i>Venta a Crédito (Saldo pendiente CXC: $${parseFloat(factura.saldo_pendiente || factura.total_usd).toFixed(2)})</span>`;
    }
    return `<span class="text-slate-600 font-medium">Dólar Efectivo ($${parseFloat(factura.total_usd).toFixed(2)})</span>`;
  }

  return pagos.map(p => {
    let montoFmt = '';
    if (p.moneda === 'COP') {
      montoFmt = `${Math.round(p.monto_moneda || 0).toLocaleString('es-CO')} COP`;
    } else if (p.moneda === 'VES') {
      montoFmt = `${parseFloat(p.monto_moneda || 0).toFixed(2)} Bs.`;
    } else {
      montoFmt = `$${parseFloat(p.monto_moneda || p.equivalente_usd || 0).toFixed(2)} USD`;
    }
    const equivFmt = p.moneda !== 'USD' ? ` <span class="text-slate-400 font-normal">(≈ $${parseFloat(p.equivalente_usd || 0).toFixed(2)})</span>` : '';
    return `<div class="inline-flex items-center mr-2 mb-1 bg-white px-2 py-0.5 rounded border border-cyan-200">
      <span class="font-bold text-slate-800">${escapeHtml(p.metodo)}:</span>
      <span class="ml-1 text-cyan-800 font-mono font-semibold">${montoFmt}</span>${equivFmt}
    </div>`;
  }).join('');
}

function mostrarAvisoPagosOriginales(factura) {
  const notice = document.getElementById('devOriginalPagosNotice');
  const listEl = document.getElementById('devOriginalPagosList');
  if (!notice || !listEl) return;

  const pagos = factura.pagos || [];
  if (pagos.length === 0 && factura.tipo_venta === 'credito') {
    listEl.innerHTML = `<div>• Venta a Crédito: Saldo pendiente $${parseFloat(factura.saldo_pendiente || factura.total_usd).toFixed(2)} (Ajustará cuenta por cobrar)</div>`;
    notice.classList.remove('hidden');
    return;
  }

  if (pagos.length === 0) {
    listEl.innerHTML = `<div>• Dólar Efectivo: $${parseFloat(factura.total_usd).toFixed(2)}</div>`;
    notice.classList.remove('hidden');
    return;
  }

  listEl.innerHTML = pagos.map(p => {
    let detalle = `${p.metodo} (${p.moneda}): `;
    if (p.moneda === 'COP') detalle += `${Math.round(p.monto_moneda || 0).toLocaleString('es-CO')} COP`;
    else if (p.moneda === 'VES') detalle += `${parseFloat(p.monto_moneda || 0).toFixed(2)} Bs.`;
    else detalle += `$${parseFloat(p.monto_moneda || p.equivalente_usd || 0).toFixed(2)} USD`;
    if (p.moneda !== 'USD') detalle += ` (Equiv: $${parseFloat(p.equivalente_usd || 0).toFixed(2)})`;
    return `<div>• ${escapeHtml(detalle)}</div>`;
  }).join('');

  notice.classList.remove('hidden');
}

function restaurarPagosOriginalesComoReembolso(factura = null) {
  const fact = factura || AppState.devolucionFacturaSeleccionada;
  if (!fact) {
    initDefaultDevPago();
    return;
  }

  const subtotal = AppState.devCart.reduce((acc, i) => acc + i.subtotal, 0);
  const iva = AppState.devCart.reduce((acc, i) => acc + i.iva_total, 0);
  const totalUsdDevolver = subtotal + iva;

  const pagosOrig = fact.pagos || [];

  if (pagosOrig.length === 0) {
    if (fact.tipo_venta === 'credito') {
      AppState.devPagos = [
        {
          id: 1,
          moneda: 'USD',
          metodo: 'Nota de Crédito',
          monto: totalUsdDevolver > 0 ? Math.round(totalUsdDevolver * 100) / 100 : 0
        }
      ];
    } else {
      AppState.devPagos = [
        {
          id: 1,
          moneda: 'USD',
          metodo: 'Dólar Efectivo',
          monto: totalUsdDevolver > 0 ? Math.round(totalUsdDevolver * 100) / 100 : 0
        }
      ];
    }
    renderDevPagos();
    return;
  }

  const totalOrigUsd = parseFloat(fact.total_usd || 0);
  const ratio = totalOrigUsd > 0 ? (totalUsdDevolver / totalOrigUsd) : 1.0;

  AppState.devPagos = pagosOrig.map((p, idx) => {
    const mon = p.moneda || 'USD';
    let montoReembolso = 0;
    if (mon === 'USD') {
      montoReembolso = Math.round((parseFloat(p.monto_moneda || p.equivalente_usd || 0) * ratio) * 100) / 100;
    } else if (mon === 'VES') {
      montoReembolso = Math.round((parseFloat(p.monto_moneda || 0) * ratio) * 100) / 100;
    } else if (mon === 'COP') {
      montoReembolso = Math.round(parseFloat(p.monto_moneda || 0) * ratio);
    }
    return {
      id: idx + 1,
      moneda: mon,
      metodo: p.metodo || (getMetodosReembolso(mon)[0]),
      monto: montoReembolso
    };
  });

  if (AppState.devPagos.length === 0) {
    initDefaultDevPago();
  } else {
    renderDevPagos();
  }
}

async function seleccionarFacturaParaDevolucion(facturaId) {
  try {
    const res = await fetch(`/api/facturas/${facturaId}`);
    if (!res.ok) {
      alert('No se pudo cargar la información de la factura.');
      return;
    }
    const data = await res.json();
    AppState.devolucionFacturaSeleccionada = data;
    AppState.devolucionFacturaPagosOriginales = data.pagos || [];
    AppState.devolucionClienteSeleccionado = {
      id: data.cliente_id,
      nombre: data.cliente_nombre || 'Consumidor Final',
      cedula: data.cliente_cedula || '',
      telefono: data.cliente_telefono || ''
    };

    // Ocultar resultados flotantes
    const resultsDiv = document.getElementById('devFacturaSearchResults');
    if (resultsDiv) resultsDiv.classList.add('hidden');

    const searchInput = document.getElementById('devFacturaSearchInput');
    if (searchInput) searchInput.value = data.numero_factura;

    const btnClear = document.getElementById('btnClearFacturaDev');
    if (btnClear) btnClear.classList.remove('hidden');

    // Llenar tarjeta de factura cargada
    const card = document.getElementById('devFacturaCargadaCard');
    if (card) {
      card.classList.remove('hidden');
      document.getElementById('devCardNumeroFactura').textContent = data.numero_factura;
      const badgeCond = document.getElementById('devCardBadgeCondicion');
      if (badgeCond) {
        badgeCond.textContent = (data.tipo_venta || 'contado').toUpperCase();
        badgeCond.className = data.tipo_venta === 'credito' 
          ? 'ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 uppercase'
          : 'ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 uppercase';
      }
      document.getElementById('devCardClienteNombre').textContent = data.cliente_nombre || 'Consumidor Final';
      document.getElementById('devCardClienteDoc').textContent = `${data.cliente_cedula || '-'} • Tel: ${data.cliente_telefono || '-'}`;
      document.getElementById('devCardTotalOriginal').textContent = `$${parseFloat(data.total_usd).toFixed(2)}`;

      // Desglose de pagos originales
      const pagosHtml = formatearPagosOriginalesResumen(data);
      document.getElementById('devCardPagosDesglose').innerHTML = pagosHtml;
    }

    // Mostrar aviso en la columna de reembolsos
    mostrarAvisoPagosOriginales(data);

    // Habilitar botón Devolver Todos
    const btnDevTotalAll = document.getElementById('btnDevTotalAll');
    if (btnDevTotalAll) btnDevTotalAll.classList.remove('hidden');

    // CARGAR ÍTEMS DE LA FACTURA EN EL CARRITO DE DEVOLUCIÓN
    const rawItems = data.items || data.detalles || [];
    const ivaPct = (AppState.config.iva_porcentaje || 16.0) / 100.0;

    AppState.devCart = rawItems.map(it => {
      const precioUnit = parseFloat(it.precio_unitario || 0);
      const cant = parseFloat(it.cantidad || 0);
      const impTipo = it.impuesto_tipo || 'gravado';
      const ivaUnit = impTipo === 'gravado' ? (precioUnit * ivaPct) : 0;
      const subtotal = cant * precioUnit;
      const ivaTotal = cant * ivaUnit;
      return {
        producto_id: it.producto_id,
        codigo: it.codigo || '',
        nombre: it.nombre || it.nombre_producto || 'Ítem',
        tipo: it.tipo || 'producto',
        impuesto_tipo: impTipo,
        precio_unitario: precioUnit,
        iva_unitario: ivaUnit,
        cant_facturada: cant,
        cantidad: cant,
        subtotal: subtotal,
        iva_total: ivaTotal,
        total: subtotal + ivaTotal,
        imagen: it.imagen || ''
      };
    });

    // Prellenar las formas de reembolso con las originales de la factura
    restaurarPagosOriginalesComoReembolso(data);

    // Renderizar catálogo e ítems
    renderDevCatalog();
    renderDevCart();

  } catch (err) {
    console.error("Error al seleccionar factura:", err);
    alert('Ocurrió un error al cargar la factura.');
  }
}

function limpiarFacturaDevolucion() {
  AppState.devolucionFacturaSeleccionada = null;
  AppState.devolucionFacturaPagosOriginales = [];
  AppState.devolucionClienteSeleccionado = null;
  AppState.devCart = [];

  const searchInput = document.getElementById('devFacturaSearchInput');
  if (searchInput) searchInput.value = '';

  const btnClear = document.getElementById('btnClearFacturaDev');
  if (btnClear) btnClear.classList.add('hidden');

  const card = document.getElementById('devFacturaCargadaCard');
  if (card) card.classList.add('hidden');

  const noticePagos = document.getElementById('devOriginalPagosNotice');
  if (noticePagos) noticePagos.classList.add('hidden');

  const btnDevTotalAll = document.getElementById('btnDevTotalAll');
  if (btnDevTotalAll) btnDevTotalAll.classList.add('hidden');

  initDefaultDevPago();
  renderDevCatalog();
  renderDevCart();
}

// Búsqueda y Selección de Cliente en Modo Manual
function buscarClienteDevolucion(query = '') {
  const resultsDiv = document.getElementById('devClienteSearchResults');
  if (!resultsDiv) return;

  const q = (query || '').toLowerCase().trim();
  let matches = AppState.clientes || [];
  if (q) {
    matches = matches.filter(c => 
      c.nombre.toLowerCase().includes(q) || 
      c.cedula.toLowerCase().includes(q) || 
      (c.telefono && c.telefono.toLowerCase().includes(q))
    );
  }

  if (matches.length === 0) {
    resultsDiv.innerHTML = `<div class="p-3 text-xs text-slate-400 text-center italic">No se encontraron clientes.</div>`;
    resultsDiv.classList.remove('hidden');
    return;
  }

  resultsDiv.innerHTML = matches.slice(0, 8).map(c => `
    <div onclick="seleccionarClienteDevolucion(${c.id})" class="p-2.5 hover:bg-cyan-50 cursor-pointer flex items-center justify-between text-xs transition">
      <div>
        <p class="font-bold text-slate-800">${escapeHtml(c.nombre)}</p>
        <p class="text-slate-500 font-mono text-[11px]">${escapeHtml(c.cedula)} &bull; Tel: ${escapeHtml(c.telefono || '-')}</p>
      </div>
      <span class="text-cyan-600 text-xs font-bold">Seleccionar &rarr;</span>
    </div>
  `).join('');
  resultsDiv.classList.remove('hidden');
}

function seleccionarClienteDevolucion(clienteId) {
  const c = AppState.clientes.find(cli => cli.id === clienteId);
  if (!c) return;

  AppState.devolucionClienteSeleccionado = c;
  const inputHidden = document.getElementById('devClienteSelect');
  if (inputHidden) inputHidden.value = c.id;

  const elNombre = document.getElementById('devSelectedClienteNombre');
  if (elNombre) elNombre.textContent = c.nombre;

  const elCedula = document.getElementById('devSelectedClienteCedula');
  if (elCedula) elCedula.textContent = c.cedula;

  const elTel = document.getElementById('devSelectedClienteTelefono');
  if (elTel) elTel.textContent = c.telefono || '-';

  const card = document.getElementById('devClienteSelectedCard');
  if (card) card.classList.remove('hidden');

  const resultsDiv = document.getElementById('devClienteSearchResults');
  if (resultsDiv) resultsDiv.classList.add('hidden');

  const inputSearch = document.getElementById('devClienteSearchInput');
  if (inputSearch) inputSearch.value = `${c.nombre} (${c.cedula})`;

  const btnClear = document.getElementById('btnClearClienteDev');
  if (btnClear) btnClear.classList.remove('hidden');
}

function limpiarClienteDevolucion() {
  AppState.devolucionClienteSeleccionado = null;
  const inputHidden = document.getElementById('devClienteSelect');
  if (inputHidden) inputHidden.value = '';

  const card = document.getElementById('devClienteSelectedCard');
  if (card) card.classList.add('hidden');

  const resultsDiv = document.getElementById('devClienteSearchResults');
  if (resultsDiv) resultsDiv.classList.add('hidden');

  const inputSearch = document.getElementById('devClienteSearchInput');
  if (inputSearch) {
    inputSearch.value = '';
    inputSearch.focus();
  }

  const btnClear = document.getElementById('btnClearClienteDev');
  if (btnClear) btnClear.classList.add('hidden');
}

// Filtros y Renderizado de Catálogo en Devoluciones (Idéntico a Facturación POS)
function setDevFilterCategory(tipo) {
  AppState.devFilterCategory = tipo;
  ['todos', 'producto', 'servicio'].forEach(t => {
    const btn = document.getElementById(`devCat-${t}`);
    if (btn) {
      if (t === tipo) {
        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 text-white';
      } else {
        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200';
      }
    }
  });
  renderDevCatalog();
}

function renderDevCatalog() {
  const grid = document.getElementById('devCatalogGrid');
  const headerNotice = document.getElementById('devCatalogHeaderNotice');
  if (!grid) return;

  const search = document.getElementById('devSearchProduct')?.value.toLowerCase().trim() || '';

  if (AppState.devolucionModo === 'factura') {
    if (!AppState.devolucionFacturaSeleccionada) {
      if (headerNotice) headerNotice.textContent = 'Busca y selecciona una factura emitida arriba para ver sus ítems.';
      grid.innerHTML = `
        <div class="col-span-full py-12 text-center text-slate-400 text-xs italic">
          <i class="fa-solid fa-file-invoice text-3xl mb-2 block text-slate-300"></i>
          Ingresa el número de factura o cliente en el buscador superior para cargar los ítems facturados.
        </div>
      `;
      return;
    }

    if (headerNotice) {
      headerNotice.textContent = `Ítems facturados en ${AppState.devolucionFacturaSeleccionada.numero_factura} (haz clic para agregar o ajustar en la devolución):`;
    }

    const rawItems = AppState.devolucionFacturaSeleccionada.items || AppState.devolucionFacturaSeleccionada.detalles || [];
    let filtrados = rawItems;

    if (AppState.devFilterCategory !== 'todos') {
      filtrados = filtrados.filter(it => (it.tipo || 'producto') === AppState.devFilterCategory);
    }
    if (search) {
      filtrados = filtrados.filter(it => 
        (it.nombre || it.nombre_producto || '').toLowerCase().includes(search) || 
        (it.codigo || '').toLowerCase().includes(search)
      );
    }

    if (filtrados.length === 0) {
      grid.innerHTML = `<div class="col-span-full py-8 text-center text-slate-400 text-xs">No se encontraron ítems en esta factura que coincidan.</div>`;
      return;
    }

    grid.innerHTML = filtrados.map(it => {
      const prodId = it.producto_id;
      const nombre = it.nombre || it.nombre_producto || 'Ítem';
      const codigo = it.codigo || '-';
      const cantFacturada = parseFloat(it.cantidad || 0);
      const precioUnit = parseFloat(it.precio_unitario || 0);
      const esProducto = (it.tipo || 'producto') === 'producto';
      const inCart = AppState.devCart.find(c => c.producto_id === prodId);
      const cantInCart = inCart ? inCart.cantidad : 0;
      const alcanzadoMax = cantInCart >= cantFacturada;

      const imgTag = it.imagen
        ? `<img src="${it.imagen}" alt="${escapeHtml(nombre)}" class="w-12 h-12 object-cover rounded-xl shadow-xs">`
        : `<div class="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 text-lg">
             <i class="fa-solid ${esProducto ? 'fa-box' : 'fa-wrench'}"></i>
           </div>`;

      return `
        <div onclick="addDevCartItemFromInvoice(${prodId})" 
             class="bg-slate-50 hover:bg-cyan-50/70 border border-slate-200 hover:border-cyan-300 p-3 rounded-xl transition cursor-pointer flex flex-col justify-between space-y-2 select-none group ${alcanzadoMax ? 'opacity-70' : ''}">
          <div class="flex items-start space-x-2.5">
            ${imgTag}
            <div class="flex-1 min-w-0">
              <p class="font-bold text-xs text-slate-800 truncate group-hover:text-cyan-700">${escapeHtml(nombre)}</p>
              <p class="text-[11px] text-slate-400 font-mono">${escapeHtml(codigo)}</p>
              <div class="flex items-center space-x-1 mt-1">
                <span class="text-[10px] font-bold text-cyan-700 bg-cyan-50 px-1.5 py-0.5 rounded">Facturado: ${cantFacturada} uds</span>
                ${inCart ? `<span class="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">Devolviendo: ${cantInCart}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="pt-2 border-t border-slate-200/60 flex items-center justify-between">
            <div>
              <span class="text-xs font-extrabold text-cyan-700 block">$${precioUnit.toFixed(2)}</span>
              <span class="text-[10px] text-slate-400">${(precioUnit * AppState.config.tasa_ves).toFixed(2)} Bs.</span>
            </div>
            <button class="w-6 h-6 rounded-lg bg-cyan-600 text-white flex items-center justify-center text-xs group-hover:scale-110 transition" title="Agregar a devolución">
              <i class="fa-solid fa-plus"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

  } else {
    // MODO MANUAL: Catálogo completo exactamente idéntico a Facturación POS
    if (headerNotice) {
      headerNotice.textContent = 'Catálogo completo de productos y servicios (haz clic para agregar a la devolución):';
    }

    let filtrados = AppState.productos || [];
    if (AppState.devFilterCategory !== 'todos') {
      filtrados = filtrados.filter(p => p.tipo === AppState.devFilterCategory);
    }
    if (search) {
      filtrados = filtrados.filter(p => p.nombre.toLowerCase().includes(search) || p.codigo.toLowerCase().includes(search));
    }

    if (filtrados.length === 0) {
      grid.innerHTML = `<div class="col-span-full py-8 text-center text-slate-400 text-xs">No hay ítems para mostrar.</div>`;
      return;
    }

    grid.innerHTML = filtrados.map(p => {
      const esProducto = p.tipo === 'producto';
      const imgTag = p.imagen
        ? `<img src="${p.imagen}" alt="${escapeHtml(p.nombre)}" class="w-12 h-12 object-cover rounded-xl shadow-xs">`
        : `<div class="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 text-lg">
             <i class="fa-solid ${esProducto ? 'fa-box' : 'fa-wrench'}"></i>
           </div>`;

      const badgeStock = esProducto
        ? `<span class="text-[10px] font-bold text-slate-600">Stock actual: ${p.stock}</span>`
        : `<span class="text-[10px] font-medium text-purple-600">Servicio</span>`;

      const badgeImpuesto = p.impuesto_tipo === 'gravado'
        ? `<span class="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">+16% IVA</span>`
        : `<span class="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">Exento</span>`;

      return `
        <div onclick="addDevCartItemManual(${p.id})" 
             class="bg-slate-50 hover:bg-cyan-50/70 border border-slate-200 hover:border-cyan-300 p-3 rounded-xl transition cursor-pointer flex flex-col justify-between space-y-2 select-none group">
          <div class="flex items-start space-x-2.5">
            ${imgTag}
            <div class="flex-1 min-w-0">
              <p class="font-bold text-xs text-slate-800 truncate group-hover:text-cyan-700">${escapeHtml(p.nombre)}</p>
              <p class="text-[11px] text-slate-400 font-mono">${escapeHtml(p.codigo)}</p>
              <div class="flex items-center space-x-1 mt-1">
                ${badgeStock}
                ${badgeImpuesto}
              </div>
            </div>
          </div>
          <div class="pt-2 border-t border-slate-200/60 flex items-center justify-between">
            <div>
              <span class="text-xs font-extrabold text-cyan-700 block">$${parseFloat(p.precio_total).toFixed(2)}</span>
              <span class="text-[10px] text-slate-400">${(p.precio_total * AppState.config.tasa_ves).toFixed(2)} Bs.</span>
            </div>
            <button class="w-6 h-6 rounded-lg bg-cyan-600 text-white flex items-center justify-center text-xs group-hover:scale-110 transition">
              <i class="fa-solid fa-plus"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }
}

// Operaciones del Carrito de Devoluciones (Exacto a Facturación POS)
function addDevCartItemFromInvoice(productoId) {
  if (!AppState.devolucionFacturaSeleccionada) return;
  const rawItems = AppState.devolucionFacturaSeleccionada.items || AppState.devolucionFacturaSeleccionada.detalles || [];
  const itOrig = rawItems.find(it => it.producto_id === productoId);
  if (!itOrig) return;

  const existing = AppState.devCart.find(i => i.producto_id === productoId);
  const cantFacturada = parseFloat(itOrig.cantidad || 0);

  if (existing) {
    if (existing.cantidad + 1 > cantFacturada) {
      alert(`No puedes devolver más de las ${cantFacturada} unidades facturadas.`);
      return;
    }
    existing.cantidad += 1;
    existing.subtotal = existing.precio_unitario * existing.cantidad;
    existing.iva_total = existing.iva_unitario * existing.cantidad;
    existing.total = existing.subtotal + existing.iva_total;
  } else {
    const precioUnit = parseFloat(itOrig.precio_unitario || 0);
    const ivaPct = (AppState.config.iva_porcentaje || 16.0) / 100.0;
    const impTipo = itOrig.impuesto_tipo || 'gravado';
    const ivaUnit = impTipo === 'gravado' ? (precioUnit * ivaPct) : 0;

    AppState.devCart.push({
      producto_id: itOrig.producto_id,
      codigo: itOrig.codigo || '',
      nombre: itOrig.nombre || itOrig.nombre_producto || 'Ítem',
      tipo: itOrig.tipo || 'producto',
      impuesto_tipo: impTipo,
      precio_unitario: precioUnit,
      iva_unitario: ivaUnit,
      cant_facturada: cantFacturada,
      cantidad: 1,
      subtotal: precioUnit,
      iva_total: ivaUnit,
      total: precioUnit + ivaUnit,
      imagen: itOrig.imagen || ''
    });
  }

  renderDevCart();
  renderDevCatalog();
}

function addDevCartItemManual(productoId) {
  const prod = AppState.productos.find(p => p.id === productoId);
  if (!prod) return;

  const existing = AppState.devCart.find(i => i.producto_id === productoId);
  const ivaPct = (AppState.config.iva_porcentaje || 16.0) / 100.0;
  const ivaUnitario = prod.impuesto_tipo === 'gravado' ? (prod.precio_base * ivaPct) : 0;

  if (existing) {
    existing.cantidad += 1;
    existing.subtotal = existing.precio_unitario * existing.cantidad;
    existing.iva_total = existing.iva_unitario * existing.cantidad;
    existing.total = existing.subtotal + existing.iva_total;
  } else {
    AppState.devCart.push({
      producto_id: prod.id,
      nombre: prod.nombre,
      codigo: prod.codigo,
      tipo: prod.tipo,
      impuesto_tipo: prod.impuesto_tipo,
      precio_unitario: prod.precio_base,
      iva_unitario: ivaUnitario,
      cantidad: 1,
      cant_facturada: null,
      subtotal: prod.precio_base,
      iva_total: ivaUnitario,
      total: prod.precio_base + ivaUnitario,
      imagen: prod.imagen || ''
    });
  }

  renderDevCart();
}

function updateDevCartItemCant(productoId, delta) {
  const item = AppState.devCart.find(i => i.producto_id === productoId);
  if (!item) return;

  const newCant = item.cantidad + delta;
  if (newCant <= 0) {
    removeDevCartItem(productoId);
    return;
  }

  if (AppState.devolucionModo === 'factura' && item.cant_facturada !== null && item.cant_facturada !== undefined) {
    if (newCant > item.cant_facturada) {
      alert(`No puedes devolver más de ${item.cant_facturada} unidades facturadas.`);
      return;
    }
  }

  item.cantidad = newCant;
  item.subtotal = item.precio_unitario * item.cantidad;
  item.iva_total = item.iva_unitario * item.cantidad;
  item.total = item.subtotal + item.iva_total;

  renderDevCart();
  renderDevCatalog();
}

function removeDevCartItem(productoId) {
  AppState.devCart = AppState.devCart.filter(i => i.producto_id !== productoId);
  renderDevCart();
  renderDevCatalog();
}

function devolverTodosFactura() {
  if (!AppState.devolucionFacturaSeleccionada) return;
  const rawItems = AppState.devolucionFacturaSeleccionada.items || AppState.devolucionFacturaSeleccionada.detalles || [];
  const ivaPct = (AppState.config.iva_porcentaje || 16.0) / 100.0;

  AppState.devCart = rawItems.map(it => {
    const cant = parseFloat(it.cantidad || 0);
    const precio = parseFloat(it.precio_unitario || 0);
    const impTipo = it.impuesto_tipo || 'gravado';
    const ivaUnit = impTipo === 'gravado' ? (precio * ivaPct) : 0;
    const subtotal = cant * precio;
    const ivaTotal = cant * ivaUnit;
    return {
      producto_id: it.producto_id,
      codigo: it.codigo || '',
      nombre: it.nombre || it.nombre_producto || 'Ítem',
      tipo: it.tipo || 'producto',
      impuesto_tipo: impTipo,
      precio_unitario: precio,
      iva_unitario: ivaUnit,
      cant_facturada: cant,
      cantidad: cant,
      subtotal: subtotal,
      iva_total: ivaTotal,
      total: subtotal + ivaTotal,
      imagen: it.imagen || ''
    };
  });

  renderDevCart();
  renderDevCatalog();
}

function limpiarDevCart() {
  AppState.devCart = [];
  renderDevCart();
  renderDevCatalog();
}

function renderDevCart() {
  const container = document.getElementById('devCartItemsList');
  const countBadge = document.getElementById('devItemsCountBadge');

  if (!container) return;

  const totalCount = AppState.devCart.reduce((acc, i) => acc + i.cantidad, 0);
  if (countBadge) countBadge.textContent = `${totalCount} ${totalCount === 1 ? 'ítem' : 'ítems'}`;

  if (AppState.devCart.length === 0) {
    container.innerHTML = `<p class="text-sm text-slate-400 text-center py-8">No hay ítems en la devolución. Selecciona de la izquierda.</p>`;
    updateDevTotals();
    return;
  }

  container.innerHTML = AppState.devCart.map(item => {
    const esServicio = item.tipo === 'servicio';
    const badgeReintegro = !esServicio 
      ? `<span class="text-[10px] text-emerald-600 font-semibold">&bull; Regresa a stock</span>`
      : `<span class="text-[10px] text-purple-600 font-semibold">&bull; Servicio</span>`;

    const facturadaBadge = item.cant_facturada 
      ? `<span class="text-[10px] text-slate-400">Facturado: ${item.cant_facturada}</span>`
      : '';

    return `
      <div class="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
        <div class="flex-1 pr-2 min-w-0">
          <p class="font-bold text-slate-800 truncate">${escapeHtml(item.nombre)}</p>
          <div class="flex items-center space-x-1.5 text-[11px] text-slate-400">
            <span>$${item.precio_unitario.toFixed(2)} c/u</span>
            <span>&bull;</span>
            <span class="${item.impuesto_tipo === 'gravado' ? 'text-blue-600 font-medium' : 'text-slate-500'}">
              ${item.impuesto_tipo === 'gravado' ? 'Gravado (16%)' : 'Exento'}
            </span>
            ${facturadaBadge ? `<span>&bull;</span> ${facturadaBadge}` : ''}
          </div>
          <div>${badgeReintegro}</div>
        </div>

        <!-- Controles de Cantidad -->
        <div class="flex items-center space-x-1.5">
          <button type="button" onclick="updateDevCartItemCant(${item.producto_id}, -1)" class="w-6 h-6 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center font-bold text-slate-600">
            -
          </button>
          <span class="w-6 text-center font-bold text-slate-800">${item.cantidad}</span>
          <button type="button" onclick="updateDevCartItemCant(${item.producto_id}, 1)" class="w-6 h-6 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center font-bold text-slate-600">
            +
          </button>
        </div>

        <!-- Total del Ítem y Quitar -->
        <div class="text-right pl-3">
          <span class="font-bold text-slate-900 block">$${item.total.toFixed(2)}</span>
          <button type="button" onclick="removeDevCartItem(${item.producto_id})" class="text-[11px] text-rose-500 hover:underline">
            Quitar
          </button>
        </div>
      </div>
    `;
  }).join('');

  updateDevTotals();
}

function updateDevTotals() {
  const subtotal = AppState.devCart.reduce((acc, i) => acc + i.subtotal, 0);
  const iva = AppState.devCart.reduce((acc, i) => acc + i.iva_total, 0);
  const totalUsd = subtotal + iva;

  const totalVes = totalUsd * AppState.config.tasa_ves;
  const totalCop = Math.round(totalUsd * AppState.config.tasa_cop);

  const elSubtotal = document.getElementById('devSubtotalUsd');
  if (elSubtotal) elSubtotal.textContent = `$${subtotal.toFixed(2)}`;

  const elIva = document.getElementById('devIvaUsd');
  if (elIva) elIva.textContent = `$${iva.toFixed(2)}`;

  const elTotal = document.getElementById('devTotalUsd');
  if (elTotal) elTotal.textContent = `$${totalUsd.toFixed(2)}`;

  const elVes = document.getElementById('devTotalVes');
  if (elVes) elVes.textContent = `${totalVes.toFixed(2)} Bs.`;

  const elCop = document.getElementById('devTotalCop');
  if (elCop) elCop.textContent = `${totalCop.toLocaleString('es-CO')} COP`;

  recalcularDevPagosMixtos();
}

// Reembolsos Mixtos Multimoneda (USD, VES, COP)
function calcularSaldoPendienteParaDevFila(filaIdExcluida = null) {
  const subtotal = AppState.devCart.reduce((acc, i) => acc + i.subtotal, 0);
  const iva = AppState.devCart.reduce((acc, i) => acc + i.iva_total, 0);
  const totalUsd = subtotal + iva;

  let reembolsadoUSD = 0;
  (AppState.devPagos || []).forEach(p => {
    if (filaIdExcluida !== null && p.id === filaIdExcluida) return;
    let equiv = 0;
    if (p.moneda === 'USD') equiv = parseFloat(p.monto) || 0;
    else if (p.moneda === 'VES') equiv = AppState.config.tasa_ves > 0 ? ((parseFloat(p.monto) || 0) / AppState.config.tasa_ves) : 0;
    else if (p.moneda === 'COP') equiv = AppState.config.tasa_cop > 0 ? ((parseFloat(p.monto) || 0) / AppState.config.tasa_cop) : 0;
    reembolsadoUSD += equiv;
  });

  return Math.max(0, totalUsd - reembolsadoUSD);
}

function initDefaultDevPago() {
  const subtotal = AppState.devCart.reduce((acc, i) => acc + i.subtotal, 0);
  const iva = AppState.devCart.reduce((acc, i) => acc + i.iva_total, 0);
  const totalUsd = subtotal + iva;

  AppState.devPagos = [
    {
      id: 1,
      moneda: 'USD',
      metodo: 'Dólar Efectivo',
      monto: totalUsd > 0 ? Math.round(totalUsd * 100) / 100 : 0
    }
  ];
  renderDevPagos();
}

function addDevPagoRow() {
  const nextId = (AppState.devPagos || []).length > 0 ? Math.max(...AppState.devPagos.map(p => p.id)) + 1 : 1;
  const saldoRestanteUSD = calcularSaldoPendienteParaDevFila();
  const defaultMoneda = AppState.devPagos.length === 1 && AppState.devPagos[0].moneda === 'USD' ? 'VES' : 'USD';
  const montoAuto = convertirUsdAMoneda(saldoRestanteUSD, defaultMoneda);
  const metodosDisponibles = getMetodosReembolso(defaultMoneda);

  AppState.devPagos.push({
    id: nextId,
    moneda: defaultMoneda,
    metodo: metodosDisponibles[0],
    monto: montoAuto
  });
  renderDevPagos();
}

function removeDevPagoRow(id) {
  AppState.devPagos = (AppState.devPagos || []).filter(p => p.id !== id);
  if (AppState.devPagos.length === 0) {
    initDefaultDevPago();
  } else {
    renderDevPagos();
  }
}

function renderDevPagos() {
  const container = document.getElementById('devPagosList');
  if (!container) return;

  container.innerHTML = (AppState.devPagos || []).map(p => {
    const metodosDisponibles = getMetodosReembolso(p.moneda);
    if (!metodosDisponibles.includes(p.metodo)) {
      p.metodo = metodosDisponibles[0];
    }

    const metodosOptions = metodosDisponibles.map(m => `
      <option value="${m}" ${p.metodo === m ? 'selected' : ''}>${m}</option>
    `).join('');

    return `
      <div class="flex items-center space-x-2 bg-slate-50 p-2 rounded-xl border border-slate-200 text-xs">
        <!-- Moneda -->
        <select onchange="updateDevPagoMoneda(${p.id}, this.value)" class="bg-white border border-slate-200 rounded-lg py-1 px-2 font-bold text-slate-700">
          <option value="USD" ${p.moneda === 'USD' ? 'selected' : ''}>USD ($)</option>
          <option value="VES" ${p.moneda === 'VES' ? 'selected' : ''}>VES (Bs.)</option>
          <option value="COP" ${p.moneda === 'COP' ? 'selected' : ''}>COP (Pesos)</option>
        </select>

        <!-- Método dinámico por moneda -->
        <select onchange="updateDevPagoMetodo(${p.id}, this.value)" class="bg-white border border-slate-200 rounded-lg py-1 px-2 font-medium text-slate-700">
          ${metodosOptions}
        </select>

        <!-- Monto en esa moneda -->
        <div class="relative flex-1">
          <input type="number" step="any" min="0" value="${p.monto !== undefined && p.monto !== null ? p.monto : ''}" placeholder="Monto"
                 oninput="updateDevPagoMonto(${p.id}, this.value)"
                 class="w-full bg-white border border-slate-200 rounded-lg py-1 px-2 text-xs font-bold text-slate-900 text-right">
        </div>

        <!-- Quitar fila -->
        <button type="button" onclick="removeDevPagoRow(${p.id})" class="text-rose-500 hover:text-rose-700 p-1" title="Quitar reembolso">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    `;
  }).join('');

  recalcularDevPagosMixtos();
}

function updateDevPagoMoneda(id, nuevaMoneda) {
  const p = (AppState.devPagos || []).find(x => x.id === id);
  if (p) {
    p.moneda = nuevaMoneda;
    p.metodo = getMetodosReembolso(nuevaMoneda)[0];
    const saldoPendienteUSD = calcularSaldoPendienteParaDevFila(id);
    p.monto = convertirUsdAMoneda(saldoPendienteUSD, nuevaMoneda);
    renderDevPagos();
  }
}

function updateDevPagoMetodo(id, metodo) {
  const p = (AppState.devPagos || []).find(x => x.id === id);
  if (p) p.metodo = metodo;
}

function updateDevPagoMonto(id, val) {
  const p = (AppState.devPagos || []).find(x => x.id === id);
  if (p) {
    p.monto = parseFloat(val) || 0;
    recalcularDevPagosMixtos();
  }
}

function recalcularDevPagosMixtos() {
  const subtotal = AppState.devCart.reduce((acc, i) => acc + i.subtotal, 0);
  const iva = AppState.devCart.reduce((acc, i) => acc + i.iva_total, 0);
  const totalDevUsd = subtotal + iva;

  let totalReembolsadoUSD = 0;
  const desgloseMonedas = [];

  (AppState.devPagos || []).forEach(p => {
    let equivUSD = 0;
    const monto = parseFloat(p.monto) || 0;
    if (p.moneda === 'USD') {
      equivUSD = monto;
      if (monto > 0) desgloseMonedas.push(`$${monto.toFixed(2)} USD`);
    } else if (p.moneda === 'VES') {
      equivUSD = AppState.config.tasa_ves > 0 ? (monto / AppState.config.tasa_ves) : 0;
      if (monto > 0) desgloseMonedas.push(`${monto.toFixed(2)} Bs.`);
    } else if (p.moneda === 'COP') {
      equivUSD = AppState.config.tasa_cop > 0 ? (monto / AppState.config.tasa_cop) : 0;
      if (monto > 0) desgloseMonedas.push(`${Math.round(monto).toLocaleString('es-CO')} COP`);
    }
    totalReembolsadoUSD += equivUSD;
  });

  const diffUSD = Math.round((totalDevUsd - totalReembolsadoUSD) * 100) / 100;

  const elReembolsadoUsd = document.getElementById('devReembolsadoUsd');
  if (elReembolsadoUsd) elReembolsadoUsd.textContent = `$${totalReembolsadoUSD.toFixed(2)}`;

  const elDetalle = document.getElementById('devReembolsadoDetalle');
  if (elDetalle) elDetalle.textContent = desgloseMonedas.join(' + ') || '0 pagos asignados';

  const elBalanceLabel = document.getElementById('devBalanceLabel');
  const elBalanceVal = document.getElementById('devBalanceVal');

  if (elBalanceVal) {
    if (Math.abs(diffUSD) < 0.01) {
      if (elBalanceLabel) elBalanceLabel.textContent = 'Estado de Cuadre:';
      elBalanceVal.textContent = 'Cuadrado exacto';
      elBalanceVal.className = 'text-sm font-bold text-emerald-600';
    } else if (diffUSD > 0) {
      if (elBalanceLabel) elBalanceLabel.textContent = 'Falta por asignar:';
      elBalanceVal.textContent = `$${diffUSD.toFixed(2)}`;
      elBalanceVal.className = 'text-sm font-bold text-amber-600';
    } else {
      if (elBalanceLabel) elBalanceLabel.textContent = 'Excedente:';
      elBalanceVal.textContent = `+$${Math.abs(diffUSD).toFixed(2)}`;
      elBalanceVal.className = 'text-sm font-bold text-rose-600';
    }
  }

  return { totalDevUsd, totalReembolsadoUSD, diffUSD };
}

function setDevMotivo(motivo) {
  const input = document.getElementById('devMotivoInput');
  if (input) input.value = motivo;
}

// Procesar Devolución (Reintegro de stock, deducción de ventas y ticket)
async function procesarDevolucionConfirm() {
  if (AppState.devCart.length === 0) {
    alert('Debes agregar al menos un ítem al carrito de devolución.');
    return;
  }

  const motivo = (document.getElementById('devMotivoInput')?.value || '').trim();
  if (!motivo) {
    alert('Por favor indica el motivo de la devolución.');
    document.getElementById('devMotivoInput')?.focus();
    return;
  }

  let clienteId = null;
  let facturaId = null;

  if (AppState.devolucionModo === 'factura') {
    if (!AppState.devolucionFacturaSeleccionada) {
      alert('Por favor selecciona la factura a la que deseas aplicar la devolución.');
      return;
    }
    facturaId = AppState.devolucionFacturaSeleccionada.id;
    clienteId = AppState.devolucionFacturaSeleccionada.cliente_id;
  } else {
    if (!AppState.devolucionClienteSeleccionado) {
      alert('Por favor selecciona o crea el cliente receptor de la devolución manual.');
      document.getElementById('devClienteSearchInput')?.focus();
      return;
    }
    clienteId = AppState.devolucionClienteSeleccionado.id;
  }

  const subtotal = AppState.devCart.reduce((acc, i) => acc + i.subtotal, 0);
  const iva = AppState.devCart.reduce((acc, i) => acc + i.iva_total, 0);
  const totalDevUsd = subtotal + iva;

  if (totalDevUsd <= 0) {
    alert('El total de la devolución debe ser mayor a 0.');
    return;
  }

  if (!AppState.devPagos || AppState.devPagos.length === 0) {
    initDefaultDevPago();
  }

  const pagosPayload = (AppState.devPagos || []).map(p => {
    let equivUSD = 0;
    const monto = parseFloat(p.monto) || 0;
    if (p.moneda === 'USD') equivUSD = monto;
    else if (p.moneda === 'VES') equivUSD = AppState.config.tasa_ves > 0 ? (monto / AppState.config.tasa_ves) : 0;
    else if (p.moneda === 'COP') equivUSD = AppState.config.tasa_cop > 0 ? (monto / AppState.config.tasa_cop) : 0;

    return {
      moneda: p.moneda,
      metodo: p.metodo,
      monto: monto,
      monto_moneda: monto,
      tasa_cambio: p.moneda === 'VES' ? AppState.config.tasa_ves : (p.moneda === 'COP' ? AppState.config.tasa_cop : 1.0),
      equivalente_usd: Math.round(equivUSD * 100) / 100,
      referencia: `Devolución - ${motivo}`
    };
  });

  const metodoPrincipal = pagosPayload.length > 0 ? pagosPayload[0].metodo : 'Dólar Efectivo';

  const itemsPayload = AppState.devCart.map(it => ({
    producto_id: it.producto_id,
    tipo: it.tipo || 'producto',
    codigo: it.codigo,
    nombre: it.nombre,
    cantidad: parseFloat(it.cantidad),
    precio_unitario: it.precio_unitario,
    impuesto_tipo: it.impuesto_tipo
  }));

  const payload = {
    factura_id: facturaId,
    cliente_id: clienteId,
    motivo: motivo,
    notas: `Devolución ${AppState.devolucionModo === 'factura' ? 'de Factura' : 'Libre'} - ${motivo}`,
    metodo_reembolso: metodoPrincipal,
    tasa_ves: AppState.config.tasa_ves,
    tasa_cop: AppState.config.tasa_cop,
    items: itemsPayload,
    pagos: pagosPayload
  };

  const btnProcesar = document.getElementById('btnProcesarDevolucion');
  if (btnProcesar) {
    btnProcesar.disabled = true;
    btnProcesar.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i>Procesando reintegro...`;
  }

  try {
    const res = await fetch('/api/devoluciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      alert('Error al registrar devolución: ' + (data.error || 'No se pudo procesar.'));
      return;
    }

    alert(`✅ Devolución registrada con éxito: ${data.numero_devolucion}\n\n• Existencias reintegradas al inventario.\n• Monto restado de ventas del día.\n• Total devuelto: $${parseFloat(data.total_usd).toFixed(2)}`);

    // Actualizar inventario, dashboard, facturas y cxc
    await loadProductos();
    await loadDashboard();
  await loadDatabaseStatus();
  initRolUsuario();
    await loadFacturasParaDevolucion();
    if (AppState.devolucionFacturaSeleccionada?.tipo_venta === 'credito') {
      await loadCxc();
    }

    // Resetear formulario
    limpiarFacturaDevolucion();
    limpiarClienteDevolucion();
    limpiarDevCart();
    const motivoInp = document.getElementById('devMotivoInput');
    if (motivoInp) motivoInp.value = '';

    // Abrir comprobante / ticket de devolución
    abrirTicketDevolucion(data.id);

  } catch (err) {
    console.error("Error al procesar devolución:", err);
    alert('Error al procesar la devolución: ' + err.message);
  } finally {
    if (btnProcesar) {
      btnProcesar.disabled = false;
      btnProcesar.innerHTML = `<i class="fa-solid fa-arrow-rotate-left text-lg mr-2"></i><span>Procesar Devolución & Reintegrar Stock</span>`;
    }
  }
}

// Historial y Reportes de Devoluciones
async function loadDevoluciones() {
  try {
    const res = await fetch('/api/devoluciones');
    if (!res.ok) return;
    const devoluciones = await res.json();
    AppState.devolucionesHistorial = devoluciones;

    // Calcular estadísticas
    const hoyStr = new Date().toISOString().split('T')[0];
    let totalUsd = 0;
    let devHoyUsd = 0;

    devoluciones.forEach(d => {
      const monto = parseFloat(d.total_usd) || 0;
      totalUsd += monto;
      if (d.fecha_emision && d.fecha_emision.startsWith(hoyStr)) {
        devHoyUsd += monto;
      }
    });

    const elCount = document.getElementById('repDevCountTotal');
    if (elCount) elCount.textContent = devoluciones.length;

    const elMontoUsd = document.getElementById('repDevMontoTotalUsd');
    if (elMontoUsd) elMontoUsd.textContent = `$${totalUsd.toFixed(2)}`;

    const elMontoBs = document.getElementById('repDevMontoTotalBs');
    if (elMontoBs) elMontoBs.textContent = `${(totalUsd * AppState.config.tasa_ves).toFixed(2)} Bs.`;

    const elMontoHoy = document.getElementById('repDevMontoHoyUsd');
    if (elMontoHoy) elMontoHoy.textContent = `$${devHoyUsd.toFixed(2)}`;

    const elItemsReint = document.getElementById('repDevItemsReintegrados');
    if (elItemsReint) elItemsReint.textContent = devoluciones.reduce((acc, cur) => acc + (parseInt(cur.items_count) || 0), 0);

    renderDevolucionesHistorial();
  } catch (err) {
    console.error("Error al cargar historial de devoluciones:", err);
  }
}

function renderDevolucionesHistorial() {
  const tbody = document.getElementById('devolucionesTableBody');
  if (!tbody) return;

  const search = (document.getElementById('devHistorialSearchInput')?.value || '').toLowerCase().trim();
  let list = AppState.devolucionesHistorial || [];

  if (search) {
    list = list.filter(d => 
      d.numero_devolucion.toLowerCase().includes(search) ||
      (d.numero_factura && d.numero_factura.toLowerCase().includes(search)) ||
      (d.cliente_nombre && d.cliente_nombre.toLowerCase().includes(search)) ||
      (d.motivo && d.motivo.toLowerCase().includes(search))
    );
  }

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400 italic">No hay devoluciones registradas.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(d => {
    const esAnulada = d.estado === 'anulada';
    return `
    <tr class="hover:bg-slate-50 transition border-b border-slate-100 ${esAnulada ? 'opacity-60 bg-rose-50/30' : ''}">
      <td class="py-3 px-4 font-mono font-bold ${esAnulada ? 'line-through text-rose-700' : 'text-cyan-700'}">
        ${escapeHtml(d.numero_devolucion)}
        ${esAnulada ? '<span class="ml-1 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold no-underline inline-block">ANULADA</span>' : ''}
      </td>
      <td class="py-3 px-4 font-mono text-xs text-slate-600 font-semibold">${escapeHtml(d.numero_factura || 'Manual (Sin Factura)')}</td>
      <td class="py-3 px-4">
        <p class="font-bold text-slate-900">${escapeHtml(d.cliente_nombre || 'Consumidor Final')}</p>
        <p class="text-[11px] text-slate-400 font-mono">${escapeHtml(d.cliente_cedula || '-')}</p>
      </td>
      <td class="py-3 px-4 text-xs text-slate-500">${formatFecha(d.fecha_emision)}</td>
      <td class="py-3 px-4 text-xs text-slate-700 max-w-xs truncate">${escapeHtml(d.motivo)}</td>
      <td class="py-3 px-4 text-right font-black ${esAnulada ? 'line-through text-slate-400' : 'text-rose-600'} font-mono">$${parseFloat(d.total_usd).toFixed(2)}</td>
      <td class="py-3 px-4 text-right font-mono text-xs text-slate-600">${parseFloat(d.total_ves || 0).toFixed(2)} Bs.</td>
      <td class="py-3 px-4 text-center space-x-1 whitespace-nowrap">
        <button onclick="abrirTicketDevolucion(${d.id})" class="px-2.5 py-1 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 rounded-lg text-xs font-semibold shadow-sm transition">
          <i class="fa-solid fa-receipt mr-1"></i>Ver
        </button>
        ${!esAnulada ? `
        <button onclick="anularDevolucion(${d.id}, '${escapeHtml(d.numero_devolucion)}')" class="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-semibold shadow-sm transition" title="Anular devolución y descontar stock">
          <i class="fa-solid fa-ban mr-1"></i>Anular
        </button>
        ` : ''}
      </td>
    </tr>
  `}).join('');
}

// Modal Comprobante / Ticket Oficial de Devolución
async function abrirTicketDevolucion(devId) {
  try {
    const res = await fetch(`/api/devoluciones/${devId}`);
    if (!res.ok) {
      alert('No se pudo cargar la nota de devolución.');
      return;
    }
    const dev = await res.json();
    AppState.ultimaDevolucionEmitida = dev;

    const cfg = AppState.config;
    document.getElementById('ticketDevBusinessName').textContent = cfg.nombre_negocio;
    document.getElementById('ticketDevBusinessRif').textContent = `RIF: ${cfg.documento_fiscal}`;
    document.getElementById('ticketDevBusinessPhone').textContent = `Tel: ${cfg.telefono}`;

    document.getElementById('ticketDevNumero').textContent = `NOTA DE DEVOLUCIÓN #${dev.numero_devolucion}`;
    document.getElementById('ticketDevFecha').textContent = `Fecha: ${formatFecha(dev.fecha_emision)}`;
    document.getElementById('ticketDevFacturaRef').textContent = dev.numero_factura ? `Factura ${dev.numero_factura}` : 'Devolución Libre / Manual';
    document.getElementById('ticketDevClienteNombre').textContent = dev.cliente_nombre || 'Consumidor Final';
    document.getElementById('ticketDevClienteDoc').textContent = dev.cliente_cedula || '-';
    document.getElementById('ticketDevMotivo').textContent = dev.motivo || '-';

    const itemsBody = document.getElementById('ticketDevItemsBody');
    if (itemsBody) {
      itemsBody.innerHTML = (dev.items || dev.detalles || []).map(it => `
        <tr class="border-b border-slate-100">
          <td class="py-1">
            <span class="font-bold text-slate-900">${escapeHtml(it.nombre || it.nombre_producto)}</span>
            ${it.codigo ? `<span class="block text-[10px] text-slate-400 font-mono">${escapeHtml(it.codigo)}</span>` : ''}
          </td>
          <td class="py-1 text-center font-mono font-bold">${parseFloat(it.cantidad)}</td>
          <td class="py-1 text-right font-mono">$${parseFloat(it.precio_unitario).toFixed(2)}</td>
          <td class="py-1 text-right font-mono font-bold">$${parseFloat(it.total || it.subtotal).toFixed(2)}</td>
        </tr>
      `).join('');
    }

    document.getElementById('ticketDevSubtotal').textContent = `$${parseFloat(dev.subtotal_usd || 0).toFixed(2)}`;
    document.getElementById('ticketDevIva').textContent = `$${parseFloat(dev.iva_usd || 0).toFixed(2)}`;
    document.getElementById('ticketDevTotalUsd').textContent = `$${parseFloat(dev.total_usd || 0).toFixed(2)}`;
    document.getElementById('ticketDevTotalVes').textContent = `${parseFloat(dev.total_ves || 0).toFixed(2)} Bs.`;
    document.getElementById('ticketDevTotalCop').textContent = `${Math.round(dev.total_cop || 0).toLocaleString('es-CO')} COP`;

    // Métodos de compensación desglosados
    const pagosList = (dev.pagos || []).map(p => {
      let mFmt = p.moneda === 'COP' ? `${Math.round(p.monto_moneda).toLocaleString('es-CO')} COP` : (p.moneda === 'VES' ? `${parseFloat(p.monto_moneda).toFixed(2)} Bs.` : `$${parseFloat(p.monto_moneda).toFixed(2)}`);
      return `${p.metodo} (${mFmt})`;
    }).join(', ');

    const metodoReembolso = pagosList || (dev.metodo_reembolso ? dev.metodo_reembolso.replace(/_/g, ' ').toUpperCase() : 'EFECTIVO USD');
    document.getElementById('ticketDevMetodoCompensacion').textContent = metodoReembolso;

    document.getElementById('modalTicketDevolucion').classList.remove('hidden');
  } catch (err) {
    console.error("Error al abrir ticket de devolución:", err);
    alert('Error al visualizar ticket: ' + err.message);
  }
}

function closeModalTicketDevolucion() {
  document.getElementById('modalTicketDevolucion').classList.add('hidden');
}

function imprimirTicketDevolucion() {
  const select = document.getElementById('selectFormatoImpresionDevolucion');
  const formato = select ? select.value : 'ticket80';
  imprimirDevolucionActual(formato);
}

function compartirDevolucionWhatsApp() {
  const dev = AppState.ultimaDevolucionEmitida;
  if (!dev) return;

  const itemsTxt = (dev.items || dev.detalles || []).map(it => `• ${it.nombre || it.nombre_producto} x${it.cantidad} = $${parseFloat(it.total || it.subtotal).toFixed(2)}`).join('\n');
  const msg = 
`*${AppState.config.nombre_negocio}*
*COMPROBANTE DE DEVOLUCIÓN: ${dev.numero_devolucion}*
----------------------------------------
Cliente: ${dev.cliente_nombre || 'Cliente'}
Factura de Origen: ${dev.numero_factura || 'Manual'}
Fecha: ${formatFecha(dev.fecha_emision)}
Motivo: ${dev.motivo}

*Ítems Devueltos:*
${itemsTxt}

*TOTAL DEVUELTO: $${parseFloat(dev.total_usd).toFixed(2)}*
Equiv. en Bolívares: ${parseFloat(dev.total_ves || 0).toFixed(2)} Bs.
Equiv. en Pesos: ${Math.round(dev.total_cop || 0).toLocaleString('es-CO')} COP
Forma de Reembolso: ${(dev.metodo_reembolso || '').replace(/_/g, ' ').toUpperCase()}
----------------------------------------
_Mercancía reintegrada al stock satisfactoriamente._`;

  const phone = (dev.cliente_telefono || '').replace(/[^0-9]/g, '');
  const url = phone 
    ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

// ========================================================
// MÓDULO 6: COMPRAS (INCREMENTO DE STOCK Y FOTO DE FACTURA)
// ========================================================
function populateComprasSelectors() {
  const pSelect = document.getElementById('compraProveedorSelect');
  if (pSelect) {
    pSelect.innerHTML = `<option value="">Seleccione proveedor...</option>` +
      AppState.proveedores.map(p => `
        <option value="${p.id}">${escapeHtml(p.nombre)} (${escapeHtml(p.cedula)})</option>
      `).join('');
  }

  const iSelect = document.getElementById('compraItemSelect');
  if (iSelect) {
    const soloProductos = AppState.productos.filter(p => p.tipo === 'producto');
    iSelect.innerHTML = `<option value="">Seleccione producto...</option>` +
      soloProductos.map(p => `
        <option value="${p.id}" data-costo="${p.costo}" data-impuesto="${p.impuesto_tipo}">
          ${escapeHtml(p.nombre)} (Stock actual: ${p.stock})
        </option>
      `).join('');

    iSelect.onchange = function() {
      const opt = iSelect.options[iSelect.selectedIndex];
      if (opt && opt.dataset.costo) {
        document.getElementById('compraItemCosto').value = opt.dataset.costo;
      }
    };
  }
}

function previewFotoFactura(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    AppState.compraFotoBase64 = e.target.result;
    document.getElementById('compraFotoImg').src = AppState.compraFotoBase64;
    document.getElementById('compraFotoPreviewContainer').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function eliminarFotoFactura() {
  AppState.compraFotoBase64 = '';
  document.getElementById('compraFotoInput').value = '';
  document.getElementById('compraFotoPreviewContainer').classList.add('hidden');
}

function verFotoAmpliada() {
  if (!AppState.compraFotoBase64) return;
  document.getElementById('imgFotoAmpliadaSrc').src = AppState.compraFotoBase64;
  document.getElementById('modalFotoAmpliada').classList.remove('hidden');
}

function cerrarFotoAmpliada() {
  document.getElementById('modalFotoAmpliada').classList.add('hidden');
}

function agregarItemACompra() {
  const select = document.getElementById('compraItemSelect');
  const prodId = parseInt(select.value);
  if (!prodId) {
    alert('Selecciona un producto del catálogo o créalo con el botón superior.');
    return;
  }

  const prod = AppState.productos.find(p => p.id === prodId);
  if (!prod) return;

  const cant = parseFloat(document.getElementById('compraItemCant').value) || 1;
  const costo = parseFloat(document.getElementById('compraItemCosto').value) || 0;

  const ivaPct = (AppState.config.iva_porcentaje || 16.0) / 100.0;
  const ivaUnitario = prod.impuesto_tipo === 'gravado' ? (costo * ivaPct) : 0;
  const total = (costo + ivaUnitario) * cant;

  AppState.compraItems.push({
    producto_id: prod.id,
    nombre: prod.nombre,
    tipo: 'producto',
    impuesto_tipo: prod.impuesto_tipo,
    cantidad: cant,
    costo_unitario: costo,
    iva_unitario: ivaUnitario,
    total: total,
    crear_nuevo: false
  });

  renderCompraItemsTable();
}

function abrirModalCrearItemEnCompra() {
  openProductoModal(false, 'compras');
}

function cerrarModalCrearItemEnCompra() {
  document.getElementById('modalCrearItemCompra').classList.add('hidden');
}

function confirmarCrearItemEnCompra(e) {
  e.preventDefault();
  const nombre = document.getElementById('quickItemNombre').value.trim();
  const catId = parseInt(document.getElementById('quickItemCategoria').value);
  const impuestoTipo = document.getElementById('quickItemImpuesto').value;
  const cant = parseFloat(document.getElementById('quickItemCantidad').value) || 1;
  const costo = parseFloat(document.getElementById('quickItemCosto').value) || 0;
  const precioVenta = parseFloat(document.getElementById('quickItemPrecioVenta').value) || (costo * 1.3);

  const ivaPct = (AppState.config.iva_porcentaje || 16.0) / 100.0;
  const ivaUnitario = impuestoTipo === 'gravado' ? (costo * ivaPct) : 0;
  const total = (costo + ivaUnitario) * cant;

  // Añadir ítem marcado como nuevo
  AppState.compraItems.push({
    producto_id: null,
    nombre: nombre,
    categoria_id: catId,
    tipo: 'producto',
    impuesto_tipo: impuestoTipo,
    precio_venta: precioVenta,
    cantidad: cant,
    costo_unitario: costo,
    iva_unitario: ivaUnitario,
    total: total,
    crear_nuevo: true
  });

  cerrarModalCrearItemEnCompra();
  renderCompraItemsTable();
}

function eliminarItemDeCompra(index) {
  AppState.compraItems.splice(index, 1);
  renderCompraItemsTable();
}

function renderCompraItemsTable() {
  const tbody = document.getElementById('compraItemsTableBody');
  if (!tbody) return;

  if (AppState.compraItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-400">Aún no has agregado ítems a la compra.</td></tr>`;
    document.getElementById('compraSubtotalVal').textContent = '$0.00';
    document.getElementById('compraIvaVal').textContent = '$0.00';
    document.getElementById('compraTotalVal').textContent = '$0.00';
    return;
  }

  let subtotal = 0;
  let totalIva = 0;

  tbody.innerHTML = AppState.compraItems.map((item, idx) => {
    const itemSub = item.costo_unitario * item.cantidad;
    const itemIva = item.iva_unitario * item.cantidad;
    subtotal += itemSub;
    totalIva += itemIva;

    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="py-2.5 px-3">
          <span class="font-bold text-slate-800">${escapeHtml(item.nombre)}</span>
          ${item.crear_nuevo ? '<span class="ml-1 text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">NUEVO</span>' : ''}
        </td>
        <td class="py-2.5 px-3 font-semibold">${item.cantidad}</td>
        <td class="py-2.5 px-3 font-mono">$${item.costo_unitario.toFixed(2)}</td>
        <td class="py-2.5 px-3 text-slate-500">${item.impuesto_tipo === 'gravado' ? 'Gravado (16%)' : 'Exento'}</td>
        <td class="py-2.5 px-3 font-bold text-slate-900">$${item.total.toFixed(2)}</td>
        <td class="py-2.5 px-3 text-right">
          <button onclick="eliminarItemDeCompra(${idx})" class="text-rose-500 hover:text-rose-700">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  const total = subtotal + totalIva;
  document.getElementById('compraSubtotalVal').textContent = `$${subtotal.toFixed(2)}`;
  document.getElementById('compraIvaVal').textContent = `$${totalIva.toFixed(2)}`;
  document.getElementById('compraTotalVal').textContent = `$${total.toFixed(2)}`;

  if (AppState.compraPagos.length === 0 || (AppState.compraPagos.length === 1 && AppState.compraPagos[0].moneda === 'USD' && AppState.compraPagos[0].monto === 0)) {
    initDefaultCompraPago();
  } else {
    updateCompraTotales();
  }
}

function setCompraTipo(tipo) {
  AppState.compraTipo = tipo;
  const btnContado = document.getElementById('btnCompraTipoContado');
  const btnCredito = document.getElementById('btnCompraTipoCredito');
  const containerPagos = document.getElementById('compraPagosContainer');
  const containerCredito = document.getElementById('compraCreditoContainer');

  if (tipo === 'contado') {
    if (btnContado) btnContado.className = "px-3 py-1 rounded-md text-xs font-bold bg-white text-blue-700 shadow-xs transition";
    if (btnCredito) btnCredito.className = "px-3 py-1 rounded-md text-xs font-bold text-slate-600 hover:text-slate-900 transition";
    if (containerPagos) {
      containerPagos.classList.remove('hidden');
      const spanPago = containerPagos.querySelector('span');
      if (spanPago) spanPago.textContent = 'Formas de Pago de la Compra:';
    }
    if (containerCredito) containerCredito.classList.add('hidden');
  } else {
    if (btnCredito) btnCredito.className = "px-3 py-1 rounded-md text-xs font-bold bg-rose-600 text-white shadow-xs transition";
    if (btnContado) btnContado.className = "px-3 py-1 rounded-md text-xs font-bold text-slate-600 hover:text-slate-900 transition";
    if (containerPagos) {
      containerPagos.classList.remove('hidden');
      const spanPago = containerPagos.querySelector('span');
      if (spanPago) spanPago.textContent = 'Abono Inicial / Anticipo (Opcional):';
    }
    if (containerCredito) containerCredito.classList.remove('hidden');

    const fechaVencInput = document.getElementById('compraFechaVencimiento');
    if (fechaVencInput && !fechaVencInput.value) {
      const d = new Date();
      d.setDate(d.getDate() + 15);
      fechaVencInput.value = d.toISOString().split('T')[0];
    }
  }

  updateCompraTotales();
}

function calcularTotalCompraUSD() {
  let subtotal = 0;
  let totalIva = 0;
  AppState.compraItems.forEach(i => {
    subtotal += i.costo_unitario * i.cantidad;
    totalIva += i.iva_unitario * i.cantidad;
  });
  return subtotal + totalIva;
}

function initDefaultCompraPago() {
  const total = calcularTotalCompraUSD();
  AppState.compraPagos = [
    {
      id: 1,
      moneda: 'USD',
      metodo: 'Dólar Efectivo',
      monto: total > 0 ? Math.round(total * 100) / 100 : 0
    }
  ];
  renderCompraPagos();
}

function calcularSaldoRestanteCompraUSD(filaIdExcluida = null) {
  const total = calcularTotalCompraUSD();
  let pagadoUSD = 0;
  AppState.compraPagos.forEach(p => {
    if (filaIdExcluida !== null && p.id === filaIdExcluida) return;
    let equiv = 0;
    if (p.moneda === 'USD') equiv = p.monto || 0;
    else if (p.moneda === 'VES') equiv = AppState.config.tasa_ves > 0 ? ((p.monto || 0) / AppState.config.tasa_ves) : 0;
    else if (p.moneda === 'COP') equiv = AppState.config.tasa_cop > 0 ? ((p.monto || 0) / AppState.config.tasa_cop) : 0;
    pagadoUSD += equiv;
  });
  return Math.max(0, total - pagadoUSD);
}

function addCompraPagoRow() {
  const nextId = AppState.compraPagos.length > 0 ? Math.max(...AppState.compraPagos.map(p => p.id)) + 1 : 1;
  const saldoRestanteUSD = calcularSaldoRestanteCompraUSD();
  const defaultMoneda = AppState.compraPagos.length === 1 && AppState.compraPagos[0].moneda === 'USD' ? 'VES' : 'USD';
  const montoAuto = convertirUsdAMoneda(saldoRestanteUSD, defaultMoneda);
  const metodosDisponibles = getMetodosPago(defaultMoneda);

  AppState.compraPagos.push({
    id: nextId,
    moneda: defaultMoneda,
    metodo: metodosDisponibles[0],
    monto: montoAuto
  });
  renderCompraPagos();
}

function removeCompraPagoRow(id) {
  AppState.compraPagos = AppState.compraPagos.filter(p => p.id !== id);
  if (AppState.compraPagos.length === 0) {
    initDefaultCompraPago();
  } else {
    renderCompraPagos();
  }
}

function renderCompraPagos() {
  const container = document.getElementById('compraPagosList');
  if (!container) return;

  container.innerHTML = AppState.compraPagos.map(p => {
    const metodosDisponibles = getMetodosPago(p.moneda);
    if (!metodosDisponibles.includes(p.metodo)) {
      p.metodo = metodosDisponibles[0];
    }
    const metodosOptions = metodosDisponibles.map(m => `
      <option value="${m}" ${p.metodo === m ? 'selected' : ''}>${m}</option>
    `).join('');

    return `
      <div class="flex items-center space-x-2 bg-slate-50 p-2 rounded-xl border border-slate-200 text-xs">
        <select onchange="updateCompraPagoMoneda(${p.id}, this.value)" class="bg-white border border-slate-200 rounded-lg py-1 px-2 font-bold text-slate-700">
          <option value="USD" ${p.moneda === 'USD' ? 'selected' : ''}>USD ($)</option>
          <option value="VES" ${p.moneda === 'VES' ? 'selected' : ''}>VES (Bs.)</option>
          <option value="COP" ${p.moneda === 'COP' ? 'selected' : ''}>COP (Pesos)</option>
        </select>

        <select onchange="updateCompraPagoMetodo(${p.id}, this.value)" class="bg-white border border-slate-200 rounded-lg py-1 px-2 font-medium text-slate-700">
          ${metodosOptions}
        </select>

        <div class="relative flex-1">
          <input type="number" step="any" min="0" value="${p.monto !== undefined && p.monto !== null ? p.monto : ''}" placeholder="Monto"
                 oninput="updateCompraPagoMonto(${p.id}, this.value)"
                 class="w-full bg-white border border-slate-200 rounded-lg py-1 px-2 text-xs font-bold text-slate-900 text-right">
        </div>

        <button onclick="removeCompraPagoRow(${p.id})" class="text-rose-500 hover:text-rose-700 p-1">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    `;
  }).join('');

  updateCompraTotales();
}

function updateCompraPagoMoneda(id, nuevaMoneda) {
  const p = AppState.compraPagos.find(x => x.id === id);
  if (p) {
    p.moneda = nuevaMoneda;
    p.metodo = getMetodosPago(nuevaMoneda)[0];
    const saldoUSD = calcularSaldoRestanteCompraUSD(id);
    p.monto = convertirUsdAMoneda(saldoUSD, nuevaMoneda);
    renderCompraPagos();
  }
}

function updateCompraPagoMetodo(id, metodo) {
  const p = AppState.compraPagos.find(x => x.id === id);
  if (p) p.metodo = metodo;
}

function updateCompraPagoMonto(id, monto) {
  const p = AppState.compraPagos.find(x => x.id === id);
  if (p) {
    p.monto = parseFloat(monto) || 0;
    updateCompraTotales();
  }
}

function updateCompraTotales() {
  const totalCompra = calcularTotalCompraUSD();
  let totalPagadoUsd = 0;

  AppState.compraPagos.forEach(p => {
    let equiv = 0;
    if (p.moneda === 'USD') equiv = p.monto || 0;
    else if (p.moneda === 'VES') equiv = AppState.config.tasa_ves > 0 ? ((p.monto || 0) / AppState.config.tasa_ves) : 0;
    else if (p.moneda === 'COP') equiv = AppState.config.tasa_cop > 0 ? ((p.monto || 0) / AppState.config.tasa_cop) : 0;
    p.equiv_usd = equiv;
    totalPagadoUsd += equiv;
  });

  const saldoRestante = Math.max(0, totalCompra - totalPagadoUsd);

  const elPagado = document.getElementById('compraTotalPagadoUsd');
  if (elPagado) elPagado.textContent = `$${totalPagadoUsd.toFixed(2)}`;

  const elSaldo = document.getElementById('compraSaldoRestanteUsd');
  if (elSaldo) elSaldo.textContent = `$${saldoRestante.toFixed(2)}`;
}

function nuevaCompraForm() {
  document.getElementById('compraProveedorSelect').value = '';
  document.getElementById('compraNumeroControl').value = '';
  document.getElementById('compraNotas').value = '';
  eliminarFotoFactura();
  AppState.compraItems = [];
  setCompraTipo('contado');
  initDefaultCompraPago();
  renderCompraItemsTable();
}

async function guardarCompra() {
  const proveedorId = document.getElementById('compraProveedorSelect').value;
  const numeroControl = document.getElementById('compraNumeroControl').value.trim();
  const fecha = document.getElementById('compraFecha').value;
  const notas = document.getElementById('compraNotas').value.trim();

  if (!proveedorId) {
    alert('Selecciona un proveedor para la compra.');
    return;
  }
  if (!numeroControl) {
    alert('Ingresa el número de factura o control del proveedor.');
    return;
  }
  if (AppState.compraItems.length === 0) {
    alert('Agrega al menos un producto a la compra.');
    return;
  }

  const tipoCompra = AppState.compraTipo || 'contado';
  let fechaVenc = null;
  let pagos = [];

  if (tipoCompra === 'credito') {
    fechaVenc = document.getElementById('compraFechaVencimiento').value;
    if (!fechaVenc) {
      alert('Por favor especifica la fecha de vencimiento de la compra a crédito.');
      return;
    }
    // Si especificó abono o pago inicial en la compra a crédito, procesarlo
    pagos = AppState.compraPagos.filter(p => (parseFloat(p.monto) || 0) > 0).map(p => ({
      moneda: p.moneda,
      metodo: p.metodo,
      monto_moneda: parseFloat(p.monto),
      tasa_cambio: p.moneda === 'VES' ? AppState.config.tasa_ves : (p.moneda === 'COP' ? AppState.config.tasa_cop : 1.0),
      referencia: ''
    }));
  } else {
    const totalCompra = calcularTotalCompraUSD();
    const totalPagado = AppState.compraPagos.reduce((acc, p) => acc + (p.equiv_usd || 0), 0);
    if (totalCompra > 0 && totalPagado < (totalCompra - 0.05)) {
      if (!confirm(`El monto pagado ($${totalPagado.toFixed(2)}) es menor que el total de la compra ($${totalCompra.toFixed(2)}). ¿Deseas continuar?`)) {
        return;
      }
    }

    pagos = AppState.compraPagos.filter(p => (parseFloat(p.monto) || 0) > 0).map(p => ({
      moneda: p.moneda,
      metodo: p.metodo,
      monto_moneda: parseFloat(p.monto),
      tasa_cambio: p.moneda === 'VES' ? AppState.config.tasa_ves : (p.moneda === 'COP' ? AppState.config.tasa_cop : 1.0),
      referencia: ''
    }));
  }

  const payload = {
    proveedor_id: parseInt(proveedorId),
    numero_control: numeroControl,
    fecha: fecha,
    foto_factura: AppState.compraFotoBase64,
    items: AppState.compraItems,
    notas: notas,
    tipo_compra: tipoCompra,
    fecha_vencimiento: fechaVenc,
    pagos: pagos
  };

  try {
    const res = await fetch('/api/compras', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      if (tipoCompra === 'credito') {
        alert('¡Compra a crédito registrada exitosamente!\n• Se generó una Cuenta por Pagar (CXP) al proveedor.\n• Las existencias fueron incrementadas en el inventario.');
      } else {
        alert('¡Compra al contado registrada exitosamente!\n• Pago multimoneda procesado.\n• Las existencias fueron incrementadas en el inventario.');
      }
      nuevaCompraForm();
      await loadProductos();
      await loadDashboard();
  await loadDatabaseStatus();
  initRolUsuario();
      if (AppState.currentView === 'cxp') loadCxp();
      toggleHistorialCompras();
    } else {
      const err = await res.json();
      alert('Error al registrar compra: ' + (err.error || 'No se pudo guardar'));
    }
  } catch (err) {
    alert('Error al registrar compra: ' + err.message);
  }
}

function toggleHistorialCompras() {
  const c = document.getElementById('historialComprasContainer');
  if (c.classList.contains('hidden')) {
    c.classList.remove('hidden');
    loadCompras();
  } else {
    c.classList.add('hidden');
  }
}

async function loadCompras() {
  try {
    const res = await fetch('/api/compras');
    if (!res.ok) return;
    const compras = await res.json();
    const tbody = document.getElementById('comprasTableBody');
    if (!tbody) return;

    if (compras.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-400">No hay compras registradas.</td></tr>`;
      return;
    }

    tbody.innerHTML = compras.map(c => {
      const tieneFoto = Boolean(c.foto_factura);
      const esAnulada = c.estado === 'anulada';
      return `
        <tr class="hover:bg-slate-50 transition ${esAnulada ? 'opacity-60 bg-rose-50/30' : ''}">
          <td class="py-2.5 px-3 font-mono font-bold ${esAnulada ? 'line-through text-rose-700' : 'text-slate-800'}">
            ${escapeHtml(c.numero_control)}
            ${esAnulada ? '<span class="ml-1.5 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold no-underline inline-block">ANULADA</span>' : ''}
          </td>
          <td class="py-2.5 px-3 text-xs text-slate-500">${formatFecha(c.fecha)}</td>
          <td class="py-2.5 px-3 font-medium text-slate-700">${escapeHtml(c.proveedor_nombre)}</td>
          <td class="py-2.5 px-3 font-bold ${esAnulada ? 'line-through text-slate-400' : 'text-blue-700'}">$${parseFloat(c.total).toFixed(2)}</td>
          <td class="py-2.5 px-3">
            ${tieneFoto ? `
              <button onclick="verFotoFacturaGuardada('${c.foto_factura}')" class="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg font-semibold hover:bg-indigo-100">
                <i class="fa-solid fa-image mr-1"></i>Ver Foto
              </button>
            ` : `<span class="text-xs text-slate-400">Sin foto</span>`}
          </td>
          <td class="py-2.5 px-3 text-right space-x-1.5 whitespace-nowrap">
            ${esAnulada ? `
              <span class="text-xs text-rose-600 font-bold"><i class="fa-solid fa-ban mr-1"></i>Compra Anulada</span>
            ` : `
              <span class="text-xs text-emerald-600 font-semibold mr-2"><i class="fa-solid fa-check mr-1"></i>Stock cargado</span>
              <button onclick="anularCompra(${c.id}, '${escapeHtml(c.numero_control)}')" class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-semibold" title="Anular compra y retirar stock">
                <i class="fa-solid fa-ban mr-1"></i>Anular
              </button>
            `}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error("Error cargando compras:", err);
  }
}

function verFotoFacturaGuardada(fotoBase64) {
  if (!fotoBase64) return;
  document.getElementById('imgFotoAmpliadaSrc').src = fotoBase64;
  document.getElementById('modalFotoAmpliada').classList.remove('hidden');
}

// ========================================================
// MÓDULO 6: PROVEEDORES
// ========================================================
async function loadProveedores() {
  try {
    const search = document.getElementById('proveedorSearchInput')?.value.trim() || '';
    const url = search ? `/api/proveedores?q=${encodeURIComponent(search)}` : '/api/proveedores';
    const res = await fetch(url);
    if (!res.ok) return;
    AppState.proveedores = await res.json();
    renderProveedoresTable();
    populateComprasSelectors();
  } catch (err) {
    console.error("Error al cargar proveedores:", err);
  }
}

function renderProveedoresTable() {
  const tbody = document.getElementById('proveedoresTableBody');
  if (!tbody) return;

  if (AppState.proveedores.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400">No se encontraron proveedores.</td></tr>`;
    return;
  }

  tbody.innerHTML = AppState.proveedores.map(p => {
    const waPhone = p.telefono.replace(/[^0-9]/g, '');
    const waLink = `https://wa.me/${waPhone}?text=${encodeURIComponent(`Hola estimado proveedor ${p.nombre}.`)}`;

    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="py-3 px-4 font-mono text-xs font-bold text-slate-700">${escapeHtml(p.cedula)}</td>
        <td class="py-3 px-4 font-bold text-slate-900">${escapeHtml(p.nombre)}</td>
        <td class="py-3 px-4">
          <a href="${waLink}" target="_blank" rel="noopener noreferrer" 
             class="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition">
            <i class="fa-brands fa-whatsapp text-emerald-600 mr-1.5 text-sm"></i>
            ${escapeHtml(p.telefono)}
          </a>
        </td>
        <td class="py-3 px-4 text-xs text-slate-500">${escapeHtml(p.correo || '-')}</td>
        <td class="py-3 px-4 text-xs text-slate-500">${escapeHtml(p.direccion || '-')}</td>
        <td class="py-3 px-4 text-right space-x-1">
          <button onclick="editProveedor(${p.id})" class="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg" title="Editar">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button onclick="deleteProveedor(${p.id})" class="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg" title="Eliminar">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function abrirModalProveedorDesdeGasto() {
  AppState.origenCrearProveedor = 'gastoDirectoCXP';
  openProveedorModal(false);
}

function openProveedorModal(isEdit = false) {
  document.getElementById('proveedorModalTitle').textContent = isEdit ? 'Editar Proveedor' : 'Registrar Proveedor';
  if (!isEdit) {
    document.getElementById('proveedorId').value = '';
    document.getElementById('proveedorNombre').value = '';
    document.getElementById('proveedorCedula').value = '';
    document.getElementById('proveedorTelefono').value = '';
    document.getElementById('proveedorCorreo').value = '';
    document.getElementById('proveedorDireccion').value = '';
  }
  document.getElementById('modalProveedor').classList.remove('hidden');
}

function closeProveedorModal() {
  document.getElementById('modalProveedor').classList.add('hidden');
}

function editProveedor(id) {
  const p = AppState.proveedores.find(pr => pr.id === id);
  if (!p) return;
  document.getElementById('proveedorId').value = p.id;
  document.getElementById('proveedorNombre').value = p.nombre;
  document.getElementById('proveedorCedula').value = p.cedula;
  document.getElementById('proveedorTelefono').value = p.telefono;
  document.getElementById('proveedorCorreo').value = p.correo || '';
  document.getElementById('proveedorDireccion').value = p.direccion || '';
  openProveedorModal(true);
}

async function saveProveedor(e) {
  e.preventDefault();
  const id = document.getElementById('proveedorId').value;
  const payload = {
    nombre: document.getElementById('proveedorNombre').value.trim(),
    cedula: document.getElementById('proveedorCedula').value.trim(),
    telefono: document.getElementById('proveedorTelefono').value.trim(),
    correo: document.getElementById('proveedorCorreo').value.trim(),
    direccion: document.getElementById('proveedorDireccion').value.trim()
  };

  try {
    const url = id ? `/api/proveedores/${id}` : '/api/proveedores';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const respData = await res.json().catch(() => null);
      closeProveedorModal();
      await loadProveedores();
      if (AppState.origenCrearProveedor === 'gastoDirectoCXP') {
        AppState.origenCrearProveedor = null;
        const pSelect = document.getElementById('cxpDirectoProveedor');
        if (pSelect) {
          pSelect.innerHTML = `<option value="">-- Seleccionar Proveedor --</option>` +
            AppState.proveedores.map(p => `
              <option value="${p.id}">${escapeHtml(p.nombre)} (${escapeHtml(p.cedula)})</option>
            `).join('');
          const nuevoId = respData?.id || (AppState.proveedores.find(p => p.cedula === payload.cedula)?.id);
          if (nuevoId) pSelect.value = String(nuevoId);
        }
      }
    } else {
      const err = await res.json();
      alert('Error: ' + (err.error || 'No se pudo guardar el proveedor'));
    }
  } catch (err) {
    alert('Error al guardar proveedor: ' + err.message);
  }
}

async function deleteProveedor(id) {
  if (!confirm('¿Seguro que deseas eliminar este proveedor?')) return;
  try {
    const res = await fetch(`/api/proveedores/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await loadProveedores();
    } else {
      const err = await res.json();
      alert('Error: ' + (err.error || 'No se pudo eliminar'));
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ========================================================
// MÓDULO 7: CUENTAS POR COBRAR (CXC) — REDISEÑO CONSOLIDADO & ESTADO DE CUENTA
// ========================================================
AppState.cxcConsolidado = [];
AppState.cxcClienteSeleccionado = null;
AppState.cxcConsFilter = 'todos';
AppState.cxcClienteFacturas = [];
AppState.cxcClienteFilter = 'todos';

async function loadCxc() {
  if (AppState.cxcClienteSeleccionado) {
    await verEstadoCuentaCliente(AppState.cxcClienteSeleccionado);
  }
  await loadCxcConsolidado();
}

async function loadCxcConsolidado() {
  try {
    // 1. Resumen superior
    const resResumen = await fetch('/api/cxc/resumen');
    if (resResumen.ok) {
      const resumen = await resResumen.json();
      AppState.cxcResumen = resumen;
      const elSaldoUsd = document.getElementById('cxcResumenSaldoUsd');
      if (elSaldoUsd) elSaldoUsd.textContent = `$${parseFloat(resumen.total_saldo_usd || 0).toFixed(2)}`;
      const elSaldoBs = document.getElementById('cxcResumenSaldoBs');
      if (elSaldoBs) elSaldoBs.textContent = `≈ ${parseFloat(resumen.total_saldo_ves || 0).toLocaleString('es-VE')} Bs.`;
      const elPendientes = document.getElementById('cxcResumenPendientes');
      if (elPendientes) elPendientes.textContent = resumen.pendientes_count || 0;
      const elVencidas = document.getElementById('cxcResumenVencidas');
      if (elVencidas) elVencidas.textContent = resumen.vencidas_count || 0;
      const elPagadas = document.getElementById('cxcResumenPagadas');
      if (elPagadas) elPagadas.textContent = resumen.pagadas_count || 0;
    }

    // 2. Consolidado por cliente
    const search = document.getElementById('cxcSearchInput')?.value.trim() || '';
    const params = new URLSearchParams();
    if (search) params.append('q', search);

    const resCons = await fetch(`/api/cxc/consolidado?${params.toString()}`);
    if (resCons.ok) {
      AppState.cxcConsolidado = await resCons.json();
      renderCxcConsolidadoTable();
    }
  } catch (err) {
    console.error("Error al cargar CXC consolidado:", err);
  }
}

function filterCxcConsolidado(filtro) {
  AppState.cxcConsFilter = filtro;
  ['todos', 'pendientes', 'vencidas', 'saldados'].forEach(f => {
    const btn = document.getElementById(`cxcConsFilter-${f}`);
    if (btn) {
      if (f === filtro) {
        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 text-white';
      } else {
        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200';
      }
    }
  });
  renderCxcConsolidadoTable();
}

function renderCxcConsolidadoTable() {
  const tbody = document.getElementById('cxcConsolidadoTableBody');
  if (!tbody) return;

  let lista = AppState.cxcConsolidado || [];
  const filtro = AppState.cxcConsFilter || 'todos';

  if (filtro === 'pendientes') {
    lista = lista.filter(c => {
      const saldo = parseFloat(c.saldo_pendiente_total_usd !== undefined ? c.saldo_pendiente_total_usd : (c.saldo_pendiente_usd || 0));
      return saldo > 0.001;
    });
  } else if (filtro === 'vencidas') {
    lista = lista.filter(c => parseInt(c.facturas_vencidas_count || 0) > 0);
  } else if (filtro === 'saldados') {
    lista = lista.filter(c => {
      const saldo = parseFloat(c.saldo_pendiente_total_usd !== undefined ? c.saldo_pendiente_total_usd : (c.saldo_pendiente_usd || 0));
      return saldo <= 0.001;
    });
  }

  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-10 text-slate-400">No se encontraron clientes con cuentas en este criterio.</td></tr>`;
    return;
  }

  const tasaVes = AppState.config.tasa_ves || 45.0;

  tbody.innerHTML = lista.map(c => {
    const saldoUsd = parseFloat(c.saldo_pendiente_total_usd !== undefined ? c.saldo_pendiente_total_usd : (c.saldo_pendiente_usd || 0));
    const saldoBs = (c.saldo_pendiente_total_ves !== undefined ? parseFloat(c.saldo_pendiente_total_ves) : (c.saldo_pendiente_ves !== undefined ? parseFloat(c.saldo_pendiente_ves) : (saldoUsd * tasaVes))).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const waPhone = (c.cliente_telefono || '').replace(/[^0-9]/g, '');
    const totalFacturado = parseFloat(c.total_facturado_usd !== undefined ? c.total_facturado_usd : (c.total_deuda_usd || 0));
    const totalCobrado = parseFloat(c.total_cobrado_usd !== undefined ? c.total_cobrado_usd : (c.total_pagado_usd || 0));

    const badgeFacturas = (c.facturas_pendientes_count || 0) > 0 
      ? `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">${c.facturas_pendientes_count} pendiente(s)</span>`
      : `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">0 pendientes</span>`;

    const badgeVencidas = (c.facturas_vencidas_count || 0) > 0
      ? `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800"><i class="fa-solid fa-triangle-exclamation mr-1"></i>${c.facturas_vencidas_count}</span>`
      : `<span class="text-xs text-slate-400">0</span>`;

    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="py-3 px-4">
          <p class="font-bold text-slate-900">${escapeHtml(c.cliente_nombre || 'Cliente')}</p>
          <span class="text-xs text-slate-400 font-mono font-semibold">${escapeHtml(c.cliente_cedula || '-')}</span>
        </td>
        <td class="py-3 px-4 text-xs text-slate-600">
          <div class="flex items-center gap-1.5">
            <i class="fa-solid fa-phone text-slate-400 text-[11px]"></i>
            <span>${escapeHtml(c.cliente_telefono || 'Sin teléfono')}</span>
            ${waPhone ? `<a href="https://wa.me/${waPhone}" target="_blank" class="text-emerald-600 hover:text-emerald-700 ml-1"><i class="fa-brands fa-whatsapp text-sm"></i></a>` : ''}
          </div>
        </td>
        <td class="py-3 px-4 text-center">${badgeFacturas}</td>
        <td class="py-3 px-4 text-center">${badgeVencidas}</td>
        <td class="py-3 px-4 font-bold text-slate-700 text-sm">$${totalFacturado.toFixed(2)}</td>
        <td class="py-3 px-4 font-semibold text-emerald-700 text-sm">$${totalCobrado.toFixed(2)}</td>
        <td class="py-3 px-4">
          <span class="font-black text-sm ${saldoUsd > 0.001 ? 'text-rose-600' : 'text-emerald-700'} block">$${saldoUsd.toFixed(2)}</span>
          <span class="text-[11px] text-slate-500">≈ ${saldoBs} Bs.</span>
        </td>
        <td class="py-3 px-4 text-right">
          <div class="flex items-center justify-end gap-1.5 flex-wrap">
            <button onclick="abrirPagosDirectoCliente(${c.cliente_id})" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5" title="Aplicar Pago Multimoneda o Anular Pagos del Cliente">
              <i class="fa-solid fa-money-bill-wave"></i> Pagos
            </button>
            <button onclick="verEstadoCuentaCliente(${c.cliente_id})" class="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5" title="Ver facturas del cliente, pagos y opciones de anulación">
              <i class="fa-solid fa-folder-open"></i> Estado de Cuenta / Anular
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function verEstadoCuentaCliente(clienteId) {
  try {
    AppState.cxcClienteSeleccionado = clienteId;

    const [resFact, resEc] = await Promise.all([
      fetch(`/api/cxc?cliente_id=${clienteId}`),
      fetch(`/api/cxc/estado-cuenta/${clienteId}`)
    ]);
    if (!resFact.ok) throw new Error("No se pudo obtener las facturas del cliente");
    const facturas = await resFact.json();
    AppState.cxcClienteFacturas = facturas;

    const ecData = resEc.ok ? await resEc.json() : null;
    AppState.cxcEstadoCuentaData = ecData;
    AppState.cxcClienteMovimientos = ecData ? (ecData.movimientos || []) : [];
    if (!AppState.cxcMovFilter) AppState.cxcMovFilter = 'todos';

    // Obtener datos del cliente
    let cliente = (ecData && ecData.cliente) ? ecData.cliente : (AppState.clientes ? AppState.clientes.find(cl => cl.id === clienteId) : null);
    if (!cliente && facturas.length > 0) {
      cliente = {
        id: clienteId,
        nombre: facturas[0].cliente_nombre,
        cedula: facturas[0].cliente_cedula,
        telefono: facturas[0].cliente_telefono
      };
    }

    const nombre = cliente ? cliente.nombre : `Cliente #${clienteId}`;
    const cedula = cliente ? cliente.cedula : '-';
    const telefono = cliente ? (cliente.telefono || 'Sin teléfono') : '-';
    const waPhone = (telefono || '').replace(/[^0-9]/g, '');

    document.getElementById('cxcDetalleClienteNombre').textContent = nombre;
    document.getElementById('cxcDetalleClienteCedula').textContent = cedula;
    document.getElementById('cxcDetalleClienteTelefono').innerHTML = `<i class="fa-solid fa-phone mr-1"></i>${escapeHtml(telefono)}`;
    const waSpan = document.getElementById('cxcDetalleClienteWhatsapp');
    if (waSpan) {
      waSpan.innerHTML = waPhone 
        ? `<a href="https://wa.me/${waPhone}" target="_blank" class="text-emerald-600 hover:underline font-semibold flex items-center gap-1"><i class="fa-brands fa-whatsapp"></i> Chat WhatsApp</a>`
        : '';
    }

    // Calcular saldos del cliente (excluyendo facturas anuladas)
    const totalSaldoUsd = facturas.filter(f => f.estado !== 'anulada').reduce((acc, f) => acc + parseFloat(f.saldo_pendiente || 0), 0);
    const tasaVes = (ecData && ecData.tasa_ves) ? ecData.tasa_ves : (AppState.config.tasa_ves || 45.0);
    const totalSaldoBs = (totalSaldoUsd * tasaVes).toFixed(2);

    document.getElementById('cxcDetalleSaldoUsd').textContent = `$${totalSaldoUsd.toFixed(2)}`;
    document.getElementById('cxcDetalleSaldoBs').textContent = `≈ ${parseFloat(totalSaldoBs).toLocaleString('es-VE')} Bs.`;

    // Poblar KPIs de desglose y contadores de filtros
    if (ecData && ecData.resumen && ecData.conteos) {
      const r = ecData.resumen;
      const k = ecData.conteos;
      const setEl = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
      setEl('cxcKpiFacturasUsd', `$${parseFloat(r.total_facturas_usd || 0).toFixed(2)}`);
      setEl('cxcKpiFacturasCount', `${k.factura || 0} factura(s)`);
      setEl('cxcKpiNotasDebitoUsd', `+$${parseFloat(r.total_notas_debito_usd || 0).toFixed(2)}`);
      setEl('cxcKpiNotasDebitoCount', `${k.nota_debito || 0} nota(s) débito`);
      setEl('cxcKpiPagosUsd', `-$${parseFloat(r.total_pagos_usd || 0).toFixed(2)}`);
      setEl('cxcKpiPagosCount', `${k.pago || 0} pago(s) total(es)`);
      setEl('cxcKpiAbonosUsd', `-$${parseFloat(r.total_abonos_usd || 0).toFixed(2)}`);
      setEl('cxcKpiAbonosCount', `${k.abono || 0} abono(s) parcial(es)`);
      setEl('cxcKpiNotasCreditoUsd', `-$${parseFloat(r.total_notas_credito_usd || 0).toFixed(2)}`);
      setEl('cxcKpiNotasCreditoCount', `${k.nota_credito || 0} nota(s) crédito`);

      ['todos', 'factura', 'pago_abono', 'pago', 'abono', 'nota_credito', 'nota_debito', 'anulado'].forEach(tipoKey => {
        setEl(`cxcMovCount-${tipoKey}`, k[tipoKey] !== undefined ? k[tipoKey] : 0);
      });
    }

    // Cambiar vistas
    document.getElementById('cxcVistaConsolidada').classList.add('hidden');
    document.getElementById('cxcVistaEstadoCuenta').classList.remove('hidden');

    renderCxcEstadoCuentaMovimientos();
    renderCxcClienteFacturasTable();
  } catch (err) {
    alert("Error al cargar estado de cuenta del cliente: " + err.message);
  }
}

function filterCxcMovimientosTipo(tipo) {
  AppState.cxcMovFilter = tipo;
  ['todos', 'factura', 'pago_abono', 'pago', 'abono', 'nota_credito', 'nota_debito', 'anulado'].forEach(t => {
    const btn = document.getElementById(`cxcMovFilter-${t}`);
    if (btn) {
      if (t === tipo) {
        btn.className = 'px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-600 text-white shadow-xs transition';
      } else {
        btn.className = 'px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition';
      }
    }
  });
  renderCxcEstadoCuentaMovimientos();
}

function limpiarFiltrosMovimientosCXC() {
  const s = document.getElementById('cxcMovSearchInput');
  const d = document.getElementById('cxcMovDesdeInput');
  const h = document.getElementById('cxcMovHastaInput');
  const o = document.getElementById('cxcMovOrdenSelect');
  if (s) s.value = '';
  if (d) d.value = '';
  if (h) h.value = '';
  if (o) o.value = 'asc';
  filterCxcMovimientosTipo('todos');
}

function renderCxcEstadoCuentaMovimientos() {
  const tbody = document.getElementById('cxcMovimientosTableBody');
  const tfoot = document.getElementById('cxcMovimientosTableFoot');
  const badge = document.getElementById('cxcMovsCountBadge');
  if (!tbody) return;

  const todosMovs = AppState.cxcClienteMovimientos || [];
  let lista = [...todosMovs];
  const tf = AppState.cxcMovFilter || 'todos';
  const q = (document.getElementById('cxcMovSearchInput')?.value || '').trim().toLowerCase();
  const desde = (document.getElementById('cxcMovDesdeInput')?.value || '').trim();
  const hasta = (document.getElementById('cxcMovHastaInput')?.value || '').trim();
  const orden = (document.getElementById('cxcMovOrdenSelect')?.value || 'asc').trim();

  if (tf !== 'todos') {
    if (tf === 'factura') {
      lista = lista.filter(m => m.tipo_movimiento === 'factura');
    } else if (tf === 'pago_abono') {
      lista = lista.filter(m => m.categoria_movimiento === 'pago_abono');
    } else if (tf === 'pago') {
      const estrictos = lista.filter(m => m.tipo_movimiento === 'pago');
      lista = estrictos.length > 0 ? estrictos : lista.filter(m => m.categoria_movimiento === 'pago_abono');
    } else if (tf === 'abono') {
      const estrictos = lista.filter(m => m.tipo_movimiento === 'abono');
      lista = estrictos.length > 0 ? estrictos : lista.filter(m => m.categoria_movimiento === 'pago_abono');
    } else if (tf === 'nota_credito') {
      lista = lista.filter(m => m.tipo_movimiento === 'nota_credito');
    } else if (tf === 'nota_debito') {
      lista = lista.filter(m => m.tipo_movimiento === 'nota_debito');
    } else if (tf === 'anulado') {
      lista = lista.filter(m => m.es_anulado);
    }
  }

  if (desde) {
    lista = lista.filter(m => String(m.fecha || '').slice(0, 10) >= desde);
  }
  if (hasta) {
    lista = lista.filter(m => String(m.fecha || '').slice(0, 10) <= hasta);
  }
  if (q) {
    lista = lista.filter(m =>
      String(m.documento_numero || '').toLowerCase().includes(q) ||
      String(m.documento_afectado || '').toLowerCase().includes(q) ||
      String(m.concepto || '').toLowerCase().includes(q) ||
      String(m.etiqueta_tipo || '').toLowerCase().includes(q) ||
      String(m.resumen_pagos || '').toLowerCase().includes(q)
    );
  }

  if (orden === 'desc') {
    lista.reverse();
  }

  if (badge) {
    badge.textContent = `${lista.length} de ${todosMovs.length} movimiento(s)`;
  }

  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center py-8 text-slate-400">No se encontraron movimientos con los filtros seleccionados en este Estado de Cuenta.</td></tr>`;
    if (tfoot) tfoot.innerHTML = '';
    return;
  }

  const tasaVes = AppState.config.tasa_ves || 45.0;
  let sumCargos = 0;
  let sumAbonos = 0;

  tbody.innerHTML = lista.map(m => {
    const esAnulado = Boolean(m.es_anulado);
    const cargo = parseFloat(m.cargo_usd || 0);
    const abono = parseFloat(m.abono_usd || 0);
    const saldoAcum = parseFloat(m.saldo_acumulado_usd || 0);
    const saldoBs = (saldoAcum * tasaVes).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    if (!esAnulado) {
      sumCargos += cargo;
      sumAbonos += abono;
    }

    let badgeTipo = '';
    if (m.tipo_movimiento === 'factura') {
      badgeTipo = `<span class="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-blue-100 text-blue-800 inline-flex items-center gap-1"><i class="fa-solid fa-file-invoice"></i>${escapeHtml(m.etiqueta_tipo)}</span>`;
    } else if (m.tipo_movimiento === 'pago') {
      badgeTipo = `<span class="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-emerald-100 text-emerald-800 inline-flex items-center gap-1"><i class="fa-solid fa-money-bill-wave"></i>${escapeHtml(m.etiqueta_tipo)}</span>`;
    } else if (m.tipo_movimiento === 'abono') {
      badgeTipo = `<span class="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-teal-100 text-teal-800 inline-flex items-center gap-1"><i class="fa-solid fa-hand-holding-dollar"></i>${escapeHtml(m.etiqueta_tipo)}</span>`;
    } else if (m.tipo_movimiento === 'nota_credito') {
      badgeTipo = `<span class="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-indigo-100 text-indigo-800 inline-flex items-center gap-1"><i class="fa-solid fa-circle-minus"></i>${escapeHtml(m.etiqueta_tipo)}</span>`;
    } else if (m.tipo_movimiento === 'nota_debito') {
      badgeTipo = `<span class="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-amber-100 text-amber-800 inline-flex items-center gap-1"><i class="fa-solid fa-circle-plus"></i>${escapeHtml(m.etiqueta_tipo)}</span>`;
    }

    let accionesHtml = '';
    if (esAnulado) {
      accionesHtml = `<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800"><i class="fa-solid fa-ban mr-1"></i>ANULADO</span>`;
    } else if (m.puede_anular_pago && m.cxc_id !== null && m.abono_id !== null) {
      accionesHtml = `
        <div class="flex items-center justify-center gap-1">
          <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">ACTIVO</span>
          <button type="button" onclick="verHistorialAbonosCXC(${m.cxc_id})" class="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-bold shadow-xs transition cursor-pointer" title="Anular este Pago / Abono y restituir saldo">
            <i class="fa-solid fa-rotate-left mr-0.5"></i>Anular Pago
          </button>
        </div>
      `;
    } else if (m.tipo_movimiento === 'factura' && m.cxc_id) {
      accionesHtml = `
        <div class="flex items-center justify-center gap-1">
          ${m.puede_pagar ? `<button type="button" onclick="abrirModalAbonoCXC(${m.cxc_id})" class="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold transition" title="Registrar Pago"><i class="fa-solid fa-money-bill-wave mr-0.5"></i>Pagos</button>` : `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700">SALDADA</span>`}
          ${m.puede_anular_documento ? `<button type="button" onclick="anularFacturaDesdeCXC(${m.factura_id}, '${escapeHtml(m.documento_numero)}')" class="px-2 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg text-[10px] font-bold transition" title="Anular Factura"><i class="fa-solid fa-ban"></i></button>` : ''}
        </div>
      `;
    } else {
      accionesHtml = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">ACTIVO</span>`;
    }

    return `
      <tr class="hover:bg-slate-50 transition ${esAnulado ? 'bg-rose-50/30 opacity-65' : ''}">
        <td class="py-2.5 px-3 text-center font-mono font-bold text-slate-400">${m.nro_operacion}</td>
        <td class="py-2.5 px-3 whitespace-nowrap text-slate-600 font-medium">${formatFecha(m.fecha)}</td>
        <td class="py-2.5 px-3 whitespace-nowrap">${badgeTipo}</td>
        <td class="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">${escapeHtml(m.documento_numero)}</td>
        <td class="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">${escapeHtml(m.documento_afectado || '-')}</td>
        <td class="py-2.5 px-3 text-slate-700 max-w-md">
          <div class="${esAnulado ? 'line-through text-slate-400' : ''}">${escapeHtml(m.concepto || '')}</div>
        </td>
        <td class="py-2.5 px-3 text-right font-bold ${cargo > 0 ? (esAnulado ? 'line-through text-slate-400' : 'text-rose-700 bg-rose-50/30') : 'text-slate-300'}">
          ${cargo > 0 ? '+$' + cargo.toFixed(2) : '—'}
        </td>
        <td class="py-2.5 px-3 text-right font-bold ${abono > 0 ? (esAnulado ? 'line-through text-slate-400' : 'text-emerald-700 bg-emerald-50/30') : 'text-slate-300'}">
          ${abono > 0 ? '-$' + abono.toFixed(2) : '—'}
        </td>
        <td class="py-2.5 px-3 text-right bg-amber-50/30">
          <span class="font-black text-slate-900 block">$${saldoAcum.toFixed(2)}</span>
          <span class="text-[10px] text-slate-500">≈ ${saldoBs} Bs.</span>
        </td>
        <td class="py-2.5 px-3 text-center whitespace-nowrap">${accionesHtml}</td>
      </tr>
    `;
  }).join('');

  if (tfoot) {
    const saldoFinalGlobal = AppState.cxcEstadoCuentaData?.resumen?.saldo_pendiente_usd ?? Math.max(0, sumCargos - sumAbonos);
    tfoot.innerHTML = `
      <tr>
        <td colspan="6" class="py-2.5 px-3 text-right uppercase tracking-wider text-slate-600">Totales de Movimientos Activos Mostrados (${lista.filter(x => !x.es_anulado).length}):</td>
        <td class="py-2.5 px-3 text-right text-rose-700 font-extrabold">+$${sumCargos.toFixed(2)}</td>
        <td class="py-2.5 px-3 text-right text-emerald-700 font-extrabold">-$${sumAbonos.toFixed(2)}</td>
        <td class="py-2.5 px-3 text-right text-slate-900 font-black bg-amber-100/60">Saldo Actual: $${parseFloat(saldoFinalGlobal).toFixed(2)}</td>
        <td></td>
      </tr>
    `;
  }
}

function volverACxcConsolidado() {
  AppState.cxcClienteSeleccionado = null;
  document.getElementById('cxcVistaEstadoCuenta').classList.add('hidden');
  document.getElementById('cxcVistaConsolidada').classList.remove('hidden');
  loadCxcConsolidado();
}

function filterCxcClienteEstado(estado) {
  AppState.cxcClienteFilter = estado;
  ['todos', 'pendiente', 'vencida', 'pagada', 'anulada'].forEach(e => {
    const btn = document.getElementById(`cxcDetFilter-${e}`);
    if (btn) {
      if (e === estado) {
        btn.className = 'px-3 py-1 rounded-lg text-xs font-bold bg-amber-600 text-white';
      } else {
        btn.className = 'px-3 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200';
      }
    }
  });
  renderCxcClienteFacturasTable();
}

function renderCxcClienteFacturasTable() {
  const tbody = document.getElementById('cxcDetalleTableBody');
  if (!tbody) return;

  let facturas = AppState.cxcClienteFacturas || [];
  const filtro = AppState.cxcClienteFilter || 'todos';

  if (filtro === 'pendiente') {
    facturas = facturas.filter(f => f.estado !== 'pagada' && f.estado !== 'anulada');
  } else if (filtro === 'vencida') {
    facturas = facturas.filter(f => f.estado !== 'pagada' && f.estado !== 'anulada' && new Date(f.fecha_vencimiento) < new Date(new Date().toDateString()));
  } else if (filtro === 'pagada') {
    facturas = facturas.filter(f => f.estado === 'pagada');
  } else if (filtro === 'anulada') {
    facturas = facturas.filter(f => f.estado === 'anulada');
  }

  if (facturas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400">No hay facturas con este criterio para este cliente.</td></tr>`;
    return;
  }

  const tasaVes = AppState.config.tasa_ves || 45.0;

  tbody.innerHTML = facturas.map(c => {
    const esAnulada = c.estado === 'anulada';
    const esVencida = !esAnulada && c.estado !== 'pagada' && new Date(c.fecha_vencimiento) < new Date(new Date().toDateString());
    let badgeEstado = '';
    if (esAnulada) {
      badgeEstado = `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800"><i class="fa-solid fa-ban mr-1"></i>Anulada</span>`;
    } else if (c.estado === 'pagada') {
      badgeEstado = `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800"><i class="fa-solid fa-check mr-1"></i>Pagada</span>`;
    } else if (esVencida) {
      badgeEstado = `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800"><i class="fa-solid fa-clock-rotate-left mr-1"></i>Vencida</span>`;
    } else if (c.estado === 'parcial') {
      badgeEstado = `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800"><i class="fa-solid fa-hourglass-half mr-1"></i>Abono Parcial</span>`;
    } else {
      badgeEstado = `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800"><i class="fa-solid fa-clock mr-1"></i>Pendiente</span>`;
    }

    const saldoBs = (c.saldo_pendiente * tasaVes).toFixed(2);
    const abonosActivos = parseInt(c.abonos_activos_count || 0);

    return `
      <tr class="hover:bg-slate-50 transition ${esAnulada ? 'opacity-60 bg-rose-50/30' : ''}">
        <td class="py-3 px-4 font-mono font-bold text-slate-900">${escapeHtml(c.numero_factura)}</td>
        <td class="py-3 px-4 text-xs text-slate-500">${formatFecha(c.fecha_emision)}</td>
        <td class="py-3 px-4 text-xs">
          <span class="font-semibold ${esVencida ? 'text-rose-600 font-bold' : 'text-slate-700'}">${c.fecha_vencimiento}</span>
          ${esVencida ? '<span class="block text-[10px] text-rose-500 font-bold">¡Vencida!</span>' : ''}
        </td>
        <td class="py-3 px-4 font-bold text-slate-700">$${parseFloat(c.monto_total).toFixed(2)}</td>
        <td class="py-3 px-4 font-medium text-emerald-700">$${parseFloat(c.monto_pagado).toFixed(2)}</td>
        <td class="py-3 px-4">
          <span class="font-black text-sm text-rose-600 block">$${parseFloat(c.saldo_pendiente).toFixed(2)}</span>
          <span class="text-[11px] text-slate-500">≈ ${saldoBs} Bs.</span>
        </td>
        <td class="py-3 px-4">${badgeEstado}</td>
        <td class="py-3 px-4 text-right space-x-1 whitespace-nowrap">
          ${(!esAnulada && c.saldo_pendiente > 0.001) ? `
            <button onclick="abrirModalAbonoCXC(${c.id})" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition shadow-xs" title="Aplicar Pago Multimoneda (USD, VES, COP) para rebajar saldo">
              <i class="fa-solid fa-money-bill-wave mr-1"></i>Pagos
            </button>
          ` : (!esAnulada ? `
            <span class="px-2 py-1 text-emerald-600 text-xs font-bold">Saldada</span>
          ` : '')}
          <button onclick="verHistorialAbonosCXC(${c.id})" class="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-xs font-bold transition" title="Ver historial de pagos recibidos y anular pagos">
            <i class="fa-solid fa-rotate-left mr-1"></i>Anular Pago${abonosActivos > 0 ? ' (' + abonosActivos + ')' : ''}
          </button>
          ${!esAnulada ? `
            <button onclick="anularFacturaDesdeCXC(${c.factura_id}, '${escapeHtml(c.numero_factura)}')" class="px-2.5 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg text-xs font-bold transition" title="Anular esta factura y revertir inventario y saldo">
              <i class="fa-solid fa-ban mr-1"></i>Anular Factura
            </button>
            <button onclick="abrirModalNotaAjuste('cxc', ${c.cliente_id}, ${c.id})" class="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition" title="Aplicar Nota Débito / Crédito">
              <i class="fa-solid fa-file-invoice-dollar mr-0.5"></i>+ Nota
            </button>
          ` : ''}
          <button onclick="enviarRecordatorioWhatsAppCXC(${c.id})" class="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Recordatorio WhatsApp">
            <i class="fa-brands fa-whatsapp text-sm"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Abrir modal de Pagos directamente desde la fila del cliente (Consolidado) o desde el encabezado del Estado de Cuenta
async function abrirPagosDirectoCliente(clienteId) {
  try {
    const res = await fetch(`/api/cxc?cliente_id=${clienteId}`);
    if (!res.ok) throw new Error("No se pudieron cargar las cuentas del cliente");
    const cuentas = await res.json();
    const activas = cuentas.filter(c => c.estado !== 'anulada');
    if (activas.length === 0) {
      alert("Este cliente no tiene facturas activas en Cuentas por Cobrar.");
      return;
    }
    // Preferir la factura pendiente más antigua (menor id con saldo > 0), o si todas están saldadas, la más reciente para permitir ver/anular pagos
    const pendientes = activas.filter(c => parseFloat(c.saldo_pendiente || 0) > 0.001).sort((a, b) => a.id - b.id);
    const cuentaInicial = pendientes.length > 0 ? pendientes[0] : activas[0];

    await abrirModalAbonoCXC(cuentaInicial.id, activas);
  } catch (err) {
    alert("Error al abrir Pagos del cliente: " + err.message);
  }
}

function abrirModalPagosClienteActual() {
  if (AppState.cxcClienteSeleccionado) {
    abrirPagosDirectoCliente(AppState.cxcClienteSeleccionado);
  }
}

async function onCambioCuentaEnModalPagoCXC(nuevoCxcId) {
  if (!nuevoCxcId) return;
  await abrirModalAbonoCXC(parseInt(nuevoCxcId), AppState.abonoCxcListaCliente || null);
}

// Modal de Pagos / Abonos a Cuenta por Cobrar (Multimoneda)
async function abrirModalAbonoCXC(cxcId, listaCuentasCliente = null) {
  try {
    const res = await fetch(`/api/cxc/${cxcId}`);
    if (!res.ok) return;
    const c = await res.json();
    AppState.abonoCxcActual = c;

    // Si no se pasó listaCuentasCliente pero hay varias facturas del cliente en memoria, usarlas
    if (!listaCuentasCliente && AppState.cxcClienteFacturas && AppState.cxcClienteFacturas.length > 1) {
      listaCuentasCliente = AppState.cxcClienteFacturas.filter(x => x.estado !== 'anulada');
    }
    AppState.abonoCxcListaCliente = listaCuentasCliente;

    const wrapperSelect = document.getElementById('abonoCxcSelectCuentaWrapper');
    const selectCuenta = document.getElementById('abonoCxcSelectCuenta');
    if (wrapperSelect && selectCuenta) {
      if (listaCuentasCliente && listaCuentasCliente.length > 0) {
        wrapperSelect.classList.remove('hidden');
        selectCuenta.innerHTML = listaCuentasCliente.map(item => {
          const s = parseFloat(item.saldo_pendiente || 0).toFixed(2);
          const pag = parseFloat(item.monto_pagado || 0).toFixed(2);
          return `<option value="${item.id}" ${item.id === c.id ? 'selected' : ''}>Factura ${escapeHtml(item.numero_factura)} — Saldo: $${s} (Abonado: $${pag})</option>`;
        }).join('');
      } else {
        wrapperSelect.classList.add('hidden');
      }
    }

    document.getElementById('abonoCxcId').value = c.id;
    document.getElementById('abonoClienteNombre').textContent = `${c.cliente_nombre} (${c.cliente_cedula})`;
    document.getElementById('abonoFacturaNumero').textContent = c.numero_factura;
    document.getElementById('abonoSaldoPendienteUsd').textContent = `$${parseFloat(c.saldo_pendiente).toFixed(2)}`;
    const saldoBs = (c.saldo_pendiente * AppState.config.tasa_ves).toFixed(2);
    const saldoCop = Math.round(c.saldo_pendiente * AppState.config.tasa_cop).toLocaleString('es-CO');
    document.getElementById('abonoSaldoPendienteBs').textContent = `${saldoBs} Bs.`;
    document.getElementById('abonoSaldoPendienteCop').textContent = `${saldoCop} COP`;
    document.getElementById('abonoNotas').value = '';

    // Inicializar fila de pago prellenando con el saldo pendiente exacto en USD
    AppState.abonoPagos = [
      {
        id: 1,
        moneda: 'USD',
        metodo: 'Dólar Efectivo',
        monto: parseFloat(c.saldo_pendiente),
        referencia: ''
      }
    ];
    renderAbonoPagos();

    document.getElementById('modalAbonoCXC').classList.remove('hidden');
  } catch (err) {
    console.error("Error abriendo modal de pagos CXC:", err);
  }
}

function closeModalAbonoCXC() {
  document.getElementById('modalAbonoCXC').classList.add('hidden');
}

function calcularSaldoPendienteParaFilaAbono(filaIdExcluida = null) {
  const c = AppState.abonoCxcActual;
  if (!c) return 0;
  const saldoTotalUsd = parseFloat(c.saldo_pendiente);

  let pagadoUSD = 0;
  AppState.abonoPagos.forEach(p => {
    if (filaIdExcluida !== null && p.id === filaIdExcluida) return;
    let equiv = 0;
    if (p.moneda === 'USD') equiv = p.monto || 0;
    else if (p.moneda === 'VES') equiv = AppState.config.tasa_ves > 0 ? ((p.monto || 0) / AppState.config.tasa_ves) : 0;
    else if (p.moneda === 'COP') equiv = AppState.config.tasa_cop > 0 ? ((p.monto || 0) / AppState.config.tasa_cop) : 0;
    pagadoUSD += equiv;
  });

  return Math.max(0, saldoTotalUsd - pagadoUSD);
}

function addAbonoPagoRow() {
  const nextId = AppState.abonoPagos.length > 0 ? Math.max(...AppState.abonoPagos.map(p => p.id)) + 1 : 1;
  const saldoRestanteUSD = calcularSaldoPendienteParaFilaAbono();
  const defaultMoneda = AppState.abonoPagos.length === 1 && AppState.abonoPagos[0].moneda === 'USD' ? 'VES' : 'USD';
  const montoAuto = convertirUsdAMoneda(saldoRestanteUSD, defaultMoneda);
  const metodosDisponibles = getMetodosPago(defaultMoneda);

  AppState.abonoPagos.push({
    id: nextId,
    moneda: defaultMoneda,
    metodo: metodosDisponibles[0],
    monto: montoAuto,
    referencia: ''
  });
  renderAbonoPagos();
}

function removeAbonoPagoRow(id) {
  AppState.abonoPagos = AppState.abonoPagos.filter(p => p.id !== id);
  if (AppState.abonoPagos.length === 0) {
    addAbonoPagoRow();
  } else {
    renderAbonoPagos();
  }
}

function renderAbonoPagos() {
  const container = document.getElementById('abonoPagosList');
  if (!container) return;

  container.innerHTML = AppState.abonoPagos.map(p => {
    const metodosDisponibles = getMetodosPago(p.moneda);
    if (!metodosDisponibles.includes(p.metodo)) {
      p.metodo = metodosDisponibles[0];
    }

    const metodosOptions = metodosDisponibles.map(m => `
      <option value="${m}" ${p.metodo === m ? 'selected' : ''}>${m}</option>
    `).join('');

    return `
      <div class="bg-slate-50 p-2 rounded-xl border border-slate-200 text-xs space-y-1.5">
        <div class="flex items-center space-x-2">
          <select onchange="updateAbonoPagoMoneda(${p.id}, this.value)" class="bg-white border border-slate-200 rounded-lg py-1 px-2 font-bold text-slate-700">
            <option value="USD" ${p.moneda === 'USD' ? 'selected' : ''}>USD ($)</option>
            <option value="VES" ${p.moneda === 'VES' ? 'selected' : ''}>VES (Bs.)</option>
            <option value="COP" ${p.moneda === 'COP' ? 'selected' : ''}>COP (Pesos)</option>
          </select>

          <select onchange="updateAbonoPagoMetodo(${p.id}, this.value)" class="bg-white border border-slate-200 rounded-lg py-1 px-2 font-medium text-slate-700">
            ${metodosOptions}
          </select>

          <div class="relative flex-1">
            <input type="number" step="any" min="0" value="${p.monto !== undefined && p.monto !== null ? p.monto : ''}" placeholder="Monto"
                   oninput="updateAbonoPagoMonto(${p.id}, this.value)"
                   class="w-full bg-white border border-slate-200 rounded-lg py-1 px-2 text-xs font-bold text-slate-900 text-right">
          </div>

          <button onclick="removeAbonoPagoRow(${p.id})" class="text-rose-500 hover:text-rose-700 p-1">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="flex items-center justify-between gap-2">
          <input type="text" value="${escapeHtml(p.referencia || '')}" placeholder="N° Referencia / Comprobante (opcional)"
                 oninput="updateAbonoPagoReferencia(${p.id}, this.value)"
                 class="flex-1 bg-white border border-slate-200 rounded-lg py-1 px-2 text-[11px] text-slate-700">
        </div>
      </div>
    `;
  }).join('');

  recalcularAbonoCXC();
}

function updateAbonoPagoMoneda(id, nuevaMoneda) {
  const p = AppState.abonoPagos.find(x => x.id === id);
  if (p) {
    p.moneda = nuevaMoneda;
    p.metodo = getMetodosPago(nuevaMoneda)[0];
    const saldoPendienteUSD = calcularSaldoPendienteParaFilaAbono(id);
    p.monto = convertirUsdAMoneda(saldoPendienteUSD, nuevaMoneda);
    renderAbonoPagos();
  }
}

function updateAbonoPagoMetodo(id, metodo) {
  const p = AppState.abonoPagos.find(x => x.id === id);
  if (p) p.metodo = metodo;
}

function updateAbonoPagoReferencia(id, ref) {
  const p = AppState.abonoPagos.find(x => x.id === id);
  if (p) p.referencia = ref;
}

function updateAbonoPagoMonto(id, monto) {
  const p = AppState.abonoPagos.find(x => x.id === id);
  if (p) {
    p.monto = parseFloat(monto) || 0;
    recalcularAbonoCXC();
  }
}

function recalcularAbonoCXC() {
  const c = AppState.abonoCxcActual;
  if (!c) return;

  let totalAbonoUsd = 0;
  AppState.abonoPagos.forEach(p => {
    let equiv = 0;
    if (p.moneda === 'USD') equiv = p.monto || 0;
    else if (p.moneda === 'VES') equiv = AppState.config.tasa_ves > 0 ? ((p.monto || 0) / AppState.config.tasa_ves) : 0;
    else if (p.moneda === 'COP') equiv = AppState.config.tasa_cop > 0 ? ((p.monto || 0) / AppState.config.tasa_cop) : 0;
    p.equiv_usd = equiv;
    totalAbonoUsd += equiv;
  });

  const saldoActual = parseFloat(c.saldo_pendiente);
  const nuevoSaldo = Math.max(0, saldoActual - totalAbonoUsd);

  document.getElementById('abonoTotalUsd').textContent = `$${totalAbonoUsd.toFixed(2)}`;
  document.getElementById('abonoNuevoSaldoUsd').textContent = `$${nuevoSaldo.toFixed(2)}`;
}

async function confirmarAbonoCXC() {
  const c = AppState.abonoCxcActual;
  if (!c) return;

  const pagos = AppState.abonoPagos.filter(p => (parseFloat(p.monto) || 0) > 0).map(p => {
    let tasa = 1.0;
    if (p.moneda === 'VES') tasa = AppState.config.tasa_ves;
    if (p.moneda === 'COP') tasa = AppState.config.tasa_cop;
    return {
      moneda: p.moneda,
      metodo: p.metodo,
      monto_moneda: p.monto,
      tasa_cambio: tasa,
      referencia: (p.referencia || '').trim()
    };
  });

  if (pagos.length === 0) {
    alert('Ingresa al menos un monto de pago mayor a cero.');
    return;
  }

  const notas = document.getElementById('abonoNotas')?.value.trim() || 'Pago aplicado en CXC';

  try {
    const res = await fetch(`/api/cxc/${c.id}/abonos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pagos, notas })
    });

    if (res.ok) {
      const data = await res.json();
      closeModalAbonoCXC();
      alert(`¡Pago de $${data.monto_abono_usd.toFixed(2)} USD registrado exitosamente!\nNuevo saldo pendiente: $${data.nuevo_saldo_pendiente.toFixed(2)}`);
      await loadCxc();
      if (AppState.cxcClienteSeleccionado) {
        await verEstadoCuentaCliente(AppState.cxcClienteSeleccionado);
      }
      await loadDashboard();
      await loadDatabaseStatus();
      if (AppState.currentView === 'reportes' && AppState.reportesTabActual === 'cxc') loadReporteCxc();
    } else {
      const err = await res.json();
      alert('Error registrando pago: ' + (err.error || 'No se pudo guardar'));
    }
  } catch (err) {
    alert('Error al registrar pago: ' + err.message);
  }
}

async function verHistorialAbonosCXC(cxcId) {
  try {
    const res = await fetch(`/api/cxc/${cxcId}`);
    if (!res.ok) return;
    const c = await res.json();
    const content = document.getElementById('historialAbonosContent');
    const abonosActivos = (c.abonos || []).filter(ab => ab.estado !== 'anulado' && ab.id !== undefined && ab.id !== null);

    let html = `
      <div class="bg-indigo-50/70 p-3 rounded-xl border border-indigo-200 text-xs space-y-1">
        <p><strong>Factura:</strong> ${escapeHtml(c.numero_factura)} &bull; <strong>Cliente:</strong> ${escapeHtml(c.cliente_nombre)}</p>
        <p><strong>Total Factura:</strong> $${parseFloat(c.monto_total).toFixed(2)} &bull; <strong>Total Abonado:</strong> $${parseFloat(c.monto_pagado).toFixed(2)}</p>
        <p><strong>Saldo Pendiente:</strong> <span class="font-bold text-rose-700">$${parseFloat(c.saldo_pendiente).toFixed(2)}</span></p>
      </div>
      <div id="statusAnulacionCXC" class="hidden p-2.5 rounded-xl text-xs font-bold"></div>
    `;

    if (abonosActivos.length > 0 && c.estado !== 'anulada') {
      html += `
        <div class="bg-rose-50/90 p-3.5 rounded-xl border-2 border-rose-300 space-y-2.5 shadow-sm">
          <div class="flex items-center justify-between">
            <span class="text-xs font-extrabold text-rose-900 uppercase tracking-wide flex items-center gap-1.5">
              <i class="fa-solid fa-rotate-left text-rose-600"></i> Panel de Anulación Directa de Pago / Abono
            </span>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-200 text-rose-900">${abonosActivos.length} activo(s)</span>
          </div>
          <div class="space-y-1">
            <label class="block text-[11px] font-bold text-slate-700">1. Selecciona el pago o abono que deseas anular:</label>
            <select id="selectPagoAnularCXC" class="w-full px-2.5 py-2 border border-rose-300 rounded-lg text-xs font-bold text-slate-800 bg-white focus:ring-2 focus:ring-rose-500 outline-none">
              ${abonosActivos.map((ab, idx) => `
                <option value="${ab.id}">
                  ${ab.id === 0 ? 'Anticipo / Pago Inicial' : 'Abono #' + ab.id} — ${formatFecha(ab.fecha)} — Monto: +$${parseFloat(ab.monto_usd).toFixed(2)} USD
                </option>
              `).join('')}
            </select>
          </div>
          <div class="space-y-1">
            <label class="block text-[11px] font-bold text-slate-700">2. Motivo de la anulación:</label>
            <input type="text" id="motivoAnularPagoCXC" value="Reversión de cobro / abono aplicado" placeholder="Indica el motivo de la reversión..." class="w-full px-2.5 py-1.5 border border-rose-300 rounded-lg text-xs text-slate-800 bg-white focus:ring-2 focus:ring-rose-500 outline-none">
          </div>
          <button type="button" id="btnEjecutarAnulacionCXC" onclick="ejecutarAnulacionPagoSeleccionadoCXC(${c.id})" class="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-extrabold rounded-xl text-xs shadow-md flex items-center justify-center gap-2 transition cursor-pointer">
            <i class="fa-solid fa-ban"></i> PROCESAR ANULACIÓN DE PAGO Y RESTITUIR SALDO
          </button>
        </div>
      `;
    }

    if (!c.abonos || c.abonos.length === 0) {
      html += `<p class="text-center py-6 text-slate-400 text-xs">No se han registrado abonos a esta cuenta.</p>`;
    } else {
      html += `<div class="text-[11px] font-bold text-slate-500 uppercase tracking-wider pt-1">Detalle de Pagos / Abonos Registrados:</div>`;
      html += c.abonos.map((ab, idx) => {
        const esAnulado = ab.estado === 'anulado';
        const puedeAnular = !esAnulado && c.estado !== 'anulada' && ab.id !== undefined && ab.id !== null;
        return `
        <div class="p-3 ${esAnulado ? 'bg-rose-50/40 border-rose-200 opacity-65' : 'bg-slate-50 border-slate-200'} border rounded-xl text-xs space-y-1.5">
          <div class="flex justify-between items-center">
            <span class="font-bold text-slate-800">
              ${ab.id === 0 ? 'Anticipo Inicial' : 'Abono #' + (c.abonos.length - idx)} &bull; ${formatFecha(ab.fecha)}
              ${esAnulado ? '<span class="ml-1.5 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">ANULADO</span>' : '<span class="ml-1.5 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">ACTIVO</span>'}
            </span>
            <div class="flex items-center gap-2">
              <strong class="${esAnulado ? 'line-through text-slate-400' : 'text-emerald-700'} font-extrabold text-sm">+$${parseFloat(ab.monto_usd).toFixed(2)}</strong>
              ${puedeAnular ? `
                <button type="button" onclick="anularAbonoCXC(${ab.id}, ${c.id})" class="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-bold shadow-sm transition cursor-pointer" title="Anular este cobro y restituir saldo inmediatamente">
                  <i class="fa-solid fa-ban mr-1"></i>Anular este Pago
                </button>
              ` : ''}
            </div>
          </div>
          <p class="text-[11px] text-slate-500">${escapeHtml(ab.notas || '')}</p>
          <div class="space-y-0.5 pt-1 border-t border-slate-100 text-[11px] text-slate-600">
            ${(ab.pagos || []).map(p => `
              <div class="flex justify-between">
                <span>&bull; ${p.metodo} (${p.moneda}):</span>
                <span>${parseFloat(p.monto_moneda).toLocaleString('es-VE')} ${p.moneda} (≈ $${parseFloat(p.equivalente_usd).toFixed(2)})</span>
              </div>
            `).join('')}
          </div>
        </div>
      `}).join('');
    }

    content.innerHTML = html;
    document.getElementById('modalHistorialAbonosCXC').classList.remove('hidden');
  } catch (err) {
    console.error("Error cargando historial de abonos:", err);
  }
}

function closeModalHistorialAbonosCXC() {
  document.getElementById('modalHistorialAbonosCXC').classList.add('hidden');
}

function enviarRecordatorioWhatsAppCXC(cxcId) {
  const c = AppState.cxc.find(item => item.id === cxcId);
  if (!c) return;

  const waPhone = (c.cliente_telefono || '').replace(/[^0-9]/g, '');
  if (!waPhone) {
    alert('El cliente no tiene un número telefónico válido para WhatsApp.');
    return;
  }

  const saldoBs = (c.saldo_pendiente * AppState.config.tasa_ves).toFixed(2);
  let mensaje = `*RECORDATORIO DE PAGO - ${AppState.config.nombre_negocio}*\n`;
  mensaje += `Estimado(a) *${c.cliente_nombre}*,\n`;
  mensaje += `Le escribimos cordialmente para recordarle el saldo pendiente de su Factura *#${c.numero_factura}*.\n\n`;
  mensaje += `*DATOS DE LA CUENTA:*\n`;
  mensaje += `- Total Factura: $${parseFloat(c.monto_total).toFixed(2)}\n`;
  mensaje += `- Total Abonado: $${parseFloat(c.monto_pagado).toFixed(2)}\n`;
  mensaje += `- *SALDO PENDIENTE:* *$${parseFloat(c.saldo_pendiente).toFixed(2)}* (≈ ${saldoBs} Bs.)\n`;
  mensaje += `- *Fecha de Vencimiento:* ${c.fecha_vencimiento}\n\n`;
  mensaje += `Agradecemos gestionar su pago a la brevedad. ¡Que tenga un excelente día!`;

  const url = `https://wa.me/${waPhone}?text=${encodeURIComponent(mensaje)}`;
  window.open(url, '_blank');
}

// ========================================================
// MÓDULO 8: CUENTAS POR PAGAR (CXP) — REDISEÑO CONSOLIDADO & ESTADO DE CUENTA
// ========================================================
AppState.cxpConsolidado = [];
AppState.cxpProveedorSeleccionado = null;
AppState.cxpConsFilter = 'todos';
AppState.cxpProveedorCuentas = [];
AppState.cxpProveedorFilter = 'todos';

async function loadCxp() {
  if (AppState.cxpProveedorSeleccionado) {
    await verEstadoCuentaProveedor(AppState.cxpProveedorSeleccionado);
  }
  await loadCxpConsolidado();
}

async function loadCxpConsolidado() {
  try {
    // 1. Resumen superior
    const resResumen = await fetch('/api/cxp/resumen');
    if (resResumen.ok) {
      const resumen = await resResumen.json();
      AppState.cxpResumen = resumen;
      const elSaldoUsd = document.getElementById('cxpResumenSaldoUsd');
      if (elSaldoUsd) elSaldoUsd.textContent = `$${parseFloat(resumen.total_saldo_usd || 0).toFixed(2)}`;
      const elSaldoBs = document.getElementById('cxpResumenSaldoBs');
      if (elSaldoBs) {
        const bs = parseFloat(resumen.total_saldo_ves || 0).toLocaleString('es-VE');
        const cop = Math.round(resumen.total_saldo_cop || 0).toLocaleString('es-CO');
        elSaldoBs.textContent = `≈ ${bs} Bs. | ${cop} COP`;
      }
      const elPendientes = document.getElementById('cxpResumenPendientes');
      if (elPendientes) elPendientes.textContent = resumen.pendientes_count || 0;
      const elVencidas = document.getElementById('cxpResumenVencidas');
      if (elVencidas) elVencidas.textContent = resumen.vencidas_count || 0;
      const elPagado = document.getElementById('cxpResumenPagado');
      if (elPagado) elPagado.textContent = `$${parseFloat(resumen.total_pagado_usd || 0).toFixed(2)}`;
    }

    // 2. Consolidado por proveedor
    const search = document.getElementById('cxpSearchInput')?.value.trim() || '';
    const params = new URLSearchParams();
    if (search) params.append('q', search);

    const resCons = await fetch(`/api/cxp/consolidado?${params.toString()}`);
    if (resCons.ok) {
      AppState.cxpConsolidado = await resCons.json();
      renderCxpConsolidadoTable();
    }
  } catch (err) {
    console.error("Error al cargar CXP consolidado:", err);
  }
}

function filterCxpConsolidado(filtro) {
  AppState.cxpConsFilter = filtro;
  ['todos', 'pendientes', 'vencidas', 'saldados'].forEach(f => {
    const btn = document.getElementById(`cxpConsFilter-${f}`);
    if (btn) {
      if (f === filtro) {
        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 text-white';
      } else {
        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200';
      }
    }
  });
  renderCxpConsolidadoTable();
}

function renderCxpConsolidadoTable() {
  const tbody = document.getElementById('cxpConsolidadoTableBody');
  if (!tbody) return;

  let lista = AppState.cxpConsolidado || [];
  const filtro = AppState.cxpConsFilter || 'todos';

  if (filtro === 'pendientes') {
    lista = lista.filter(c => {
      const saldo = parseFloat(c.saldo_pendiente_total_usd !== undefined ? c.saldo_pendiente_total_usd : (c.saldo_pendiente_usd || 0));
      return saldo > 0.001;
    });
  } else if (filtro === 'vencidas') {
    lista = lista.filter(c => parseInt(c.cuentas_vencidas_count || 0) > 0);
  } else if (filtro === 'saldados') {
    lista = lista.filter(c => {
      const saldo = parseFloat(c.saldo_pendiente_total_usd !== undefined ? c.saldo_pendiente_total_usd : (c.saldo_pendiente_usd || 0));
      return saldo <= 0.001;
    });
  }

  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-10 text-slate-400">No se encontraron proveedores con cuentas en este criterio.</td></tr>`;
    return;
  }

  const tasaVes = AppState.config.tasa_ves || 45.0;

  tbody.innerHTML = lista.map(c => {
    const saldoUsd = parseFloat(c.saldo_pendiente_total_usd !== undefined ? c.saldo_pendiente_total_usd : (c.saldo_pendiente_usd || 0));
    const saldoBs = (c.saldo_pendiente_total_ves !== undefined ? parseFloat(c.saldo_pendiente_total_ves) : (c.saldo_pendiente_ves !== undefined ? parseFloat(c.saldo_pendiente_ves) : (saldoUsd * tasaVes))).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const waPhone = (c.proveedor_telefono || '').replace(/[^0-9]/g, '');
    const totalFacturado = parseFloat(c.total_facturado_usd !== undefined ? c.total_facturado_usd : (c.total_deuda_usd || 0));
    const totalCobrado = parseFloat(c.total_pagado_usd !== undefined ? c.total_pagado_usd : (c.total_cobrado_usd || 0));

    const badgeCuentas = (c.cuentas_pendientes_count || 0) > 0 
      ? `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">${c.cuentas_pendientes_count} pendiente(s)</span>`
      : `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">0 pendientes</span>`;

    const badgeVencidas = (c.cuentas_vencidas_count || 0) > 0
      ? `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800"><i class="fa-solid fa-triangle-exclamation mr-1"></i>${c.cuentas_vencidas_count}</span>`
      : `<span class="text-xs text-slate-400">0</span>`;

    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="py-3 px-4">
          <p class="font-bold text-slate-900">${escapeHtml(c.proveedor_nombre || 'Proveedor')}</p>
          <span class="text-xs text-slate-400 font-mono font-semibold">${escapeHtml(c.proveedor_cedula || '-')}</span>
        </td>
        <td class="py-3 px-4 text-xs text-slate-600">
          <div class="flex items-center gap-1.5">
            <i class="fa-solid fa-phone text-slate-400 text-[11px]"></i>
            <span>${escapeHtml(c.proveedor_telefono || 'Sin teléfono')}</span>
            ${waPhone ? `<a href="https://wa.me/${waPhone}" target="_blank" class="text-emerald-600 hover:text-emerald-700 ml-1"><i class="fa-brands fa-whatsapp text-sm"></i></a>` : ''}
          </div>
        </td>
        <td class="py-3 px-4 text-center">${badgeCuentas}</td>
        <td class="py-3 px-4 text-center">${badgeVencidas}</td>
        <td class="py-3 px-4 font-bold text-slate-700 text-sm">$${totalFacturado.toFixed(2)}</td>
        <td class="py-3 px-4 font-semibold text-emerald-700 text-sm">$${totalCobrado.toFixed(2)}</td>
        <td class="py-3 px-4">
          <span class="font-black text-sm ${saldoUsd > 0.001 ? 'text-rose-600' : 'text-emerald-700'} block">$${saldoUsd.toFixed(2)}</span>
          <span class="text-[11px] text-slate-500">≈ ${saldoBs} Bs.</span>
        </td>
        <td class="py-3 px-4 text-right">
          <div class="flex items-center justify-end gap-1.5 flex-wrap">
            <button onclick="abrirPagosDirectoProveedor(${c.proveedor_id})" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5" title="Aplicar Pago Multimoneda o Anular Pagos al Proveedor">
              <i class="fa-solid fa-money-bill-wave"></i> Pagos
            </button>
            <button onclick="verEstadoCuentaProveedor(${c.proveedor_id})" class="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5" title="Ver cuentas del proveedor, pagos y opciones de anulación">
              <i class="fa-solid fa-folder-open"></i> Estado de Cuenta / Anular
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function verEstadoCuentaProveedor(proveedorId) {
  try {
    AppState.cxpProveedorSeleccionado = proveedorId;

    const [resCuentas, resEc] = await Promise.all([
      fetch(`/api/cxp?proveedor_id=${proveedorId}`),
      fetch(`/api/cxp/estado-cuenta/${proveedorId}`)
    ]);
    if (!resCuentas.ok) throw new Error("No se pudo obtener las cuentas del proveedor");
    const cuentas = await resCuentas.json();
    AppState.cxpProveedorCuentas = cuentas;

    const ecData = resEc.ok ? await resEc.json() : null;
    AppState.cxpEstadoCuentaData = ecData;
    AppState.cxpProveedorMovimientos = ecData ? (ecData.movimientos || []) : [];
    if (!AppState.cxpMovFilter) AppState.cxpMovFilter = 'todos';

    // Obtener datos del proveedor
    let proveedor = (ecData && ecData.proveedor) ? ecData.proveedor : (AppState.proveedores ? AppState.proveedores.find(pr => pr.id === proveedorId) : null);
    if (!proveedor && cuentas.length > 0) {
      proveedor = {
        id: proveedorId,
        nombre: cuentas[0].proveedor_nombre,
        cedula: cuentas[0].proveedor_cedula,
        telefono: cuentas[0].proveedor_telefono
      };
    }

    const nombre = proveedor ? proveedor.nombre : `Proveedor #${proveedorId}`;
    const cedula = proveedor ? proveedor.cedula : '-';
    const telefono = proveedor ? (proveedor.telefono || 'Sin teléfono') : '-';
    const waPhone = (telefono || '').replace(/[^0-9]/g, '');

    document.getElementById('cxpDetalleProveedorNombre').textContent = nombre;
    document.getElementById('cxpDetalleProveedorCedula').textContent = cedula;
    document.getElementById('cxpDetalleProveedorTelefono').innerHTML = `<i class="fa-solid fa-phone mr-1"></i>${escapeHtml(telefono)}`;
    const waSpan = document.getElementById('cxpDetalleProveedorWhatsapp');
    if (waSpan) {
      waSpan.innerHTML = waPhone 
        ? `<a href="https://wa.me/${waPhone}" target="_blank" class="text-emerald-600 hover:underline font-semibold flex items-center gap-1"><i class="fa-brands fa-whatsapp"></i> Chat WhatsApp</a>`
        : '';
    }

    // Calcular saldos del proveedor (excluyendo cuentas anuladas)
    const totalSaldoUsd = cuentas.filter(c => c.estado !== 'anulada').reduce((acc, c) => acc + parseFloat(c.saldo_pendiente || 0), 0);
    const tasaVes = (ecData && ecData.tasa_ves) ? ecData.tasa_ves : (AppState.config.tasa_ves || 45.0);
    const totalSaldoBs = (totalSaldoUsd * tasaVes).toFixed(2);

    document.getElementById('cxpDetalleSaldoUsd').textContent = `$${totalSaldoUsd.toFixed(2)}`;
    document.getElementById('cxpDetalleSaldoBs').textContent = `≈ ${parseFloat(totalSaldoBs).toLocaleString('es-VE')} Bs.`;

    // Poblar KPIs de desglose y contadores de filtros
    if (ecData && ecData.resumen && ecData.conteos) {
      const r = ecData.resumen;
      const k = ecData.conteos;
      const setEl = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
      setEl('cxpKpiFacturasUsd', `$${parseFloat(r.total_facturas_usd || 0).toFixed(2)}`);
      setEl('cxpKpiFacturasCount', `${k.factura || 0} documento(s)`);
      setEl('cxpKpiNotasDebitoUsd', `+$${parseFloat(r.total_notas_debito_usd || 0).toFixed(2)}`);
      setEl('cxpKpiNotasDebitoCount', `${k.nota_debito || 0} nota(s) débito`);
      setEl('cxpKpiPagosUsd', `-$${parseFloat(r.total_pagos_usd || 0).toFixed(2)}`);
      setEl('cxpKpiPagosCount', `${k.pago || 0} pago(s) total(es)`);
      setEl('cxpKpiAbonosUsd', `-$${parseFloat(r.total_abonos_usd || 0).toFixed(2)}`);
      setEl('cxpKpiAbonosCount', `${k.abono || 0} abono(s) parcial(es)`);
      setEl('cxpKpiNotasCreditoUsd', `-$${parseFloat(r.total_notas_credito_usd || 0).toFixed(2)}`);
      setEl('cxpKpiNotasCreditoCount', `${k.nota_credito || 0} nota(s) crédito`);

      ['todos', 'factura', 'pago_abono', 'pago', 'abono', 'nota_credito', 'nota_debito', 'anulado'].forEach(tipoKey => {
        setEl(`cxpMovCount-${tipoKey}`, k[tipoKey] !== undefined ? k[tipoKey] : 0);
      });
    }

    // Cambiar vistas
    document.getElementById('cxpVistaConsolidada').classList.add('hidden');
    document.getElementById('cxpVistaEstadoCuenta').classList.remove('hidden');

    renderCxpEstadoCuentaMovimientos();
    renderCxpProveedorCuentasTable();
  } catch (err) {
    alert("Error al cargar estado de cuenta del proveedor: " + err.message);
  }
}

function filterCxpMovimientosTipo(tipo) {
  AppState.cxpMovFilter = tipo;
  ['todos', 'factura', 'pago_abono', 'pago', 'abono', 'nota_credito', 'nota_debito', 'anulado'].forEach(t => {
    const btn = document.getElementById(`cxpMovFilter-${t}`);
    if (btn) {
      if (t === tipo) {
        btn.className = 'px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 text-white shadow-xs transition';
      } else {
        btn.className = 'px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition';
      }
    }
  });
  renderCxpEstadoCuentaMovimientos();
}

function limpiarFiltrosMovimientosCXP() {
  const s = document.getElementById('cxpMovSearchInput');
  const d = document.getElementById('cxpMovDesdeInput');
  const h = document.getElementById('cxpMovHastaInput');
  const o = document.getElementById('cxpMovOrdenSelect');
  if (s) s.value = '';
  if (d) d.value = '';
  if (h) h.value = '';
  if (o) o.value = 'asc';
  filterCxpMovimientosTipo('todos');
}

function renderCxpEstadoCuentaMovimientos() {
  const tbody = document.getElementById('cxpMovimientosTableBody');
  const tfoot = document.getElementById('cxpMovimientosTableFoot');
  const badge = document.getElementById('cxpMovsCountBadge');
  if (!tbody) return;

  const todosMovs = AppState.cxpProveedorMovimientos || [];
  let lista = [...todosMovs];
  const tf = AppState.cxpMovFilter || 'todos';
  const q = (document.getElementById('cxpMovSearchInput')?.value || '').trim().toLowerCase();
  const desde = (document.getElementById('cxpMovDesdeInput')?.value || '').trim();
  const hasta = (document.getElementById('cxpMovHastaInput')?.value || '').trim();
  const orden = (document.getElementById('cxpMovOrdenSelect')?.value || 'asc').trim();

  if (tf !== 'todos') {
    if (tf === 'factura') {
      lista = lista.filter(m => m.tipo_movimiento === 'factura');
    } else if (tf === 'pago_abono') {
      lista = lista.filter(m => m.categoria_movimiento === 'pago_abono');
    } else if (tf === 'pago') {
      const estrictos = lista.filter(m => m.tipo_movimiento === 'pago');
      lista = estrictos.length > 0 ? estrictos : lista.filter(m => m.categoria_movimiento === 'pago_abono');
    } else if (tf === 'abono') {
      const estrictos = lista.filter(m => m.tipo_movimiento === 'abono');
      lista = estrictos.length > 0 ? estrictos : lista.filter(m => m.categoria_movimiento === 'pago_abono');
    } else if (tf === 'nota_credito') {
      lista = lista.filter(m => m.tipo_movimiento === 'nota_credito');
    } else if (tf === 'nota_debito') {
      lista = lista.filter(m => m.tipo_movimiento === 'nota_debito');
    } else if (tf === 'anulado') {
      lista = lista.filter(m => m.es_anulado);
    }
  }

  if (desde) {
    lista = lista.filter(m => String(m.fecha || '').slice(0, 10) >= desde);
  }
  if (hasta) {
    lista = lista.filter(m => String(m.fecha || '').slice(0, 10) <= hasta);
  }
  if (q) {
    lista = lista.filter(m =>
      String(m.documento_numero || '').toLowerCase().includes(q) ||
      String(m.documento_afectado || '').toLowerCase().includes(q) ||
      String(m.concepto || '').toLowerCase().includes(q) ||
      String(m.etiqueta_tipo || '').toLowerCase().includes(q) ||
      String(m.resumen_pagos || '').toLowerCase().includes(q)
    );
  }

  if (orden === 'desc') {
    lista.reverse();
  }

  if (badge) {
    badge.textContent = `${lista.length} de ${todosMovs.length} movimiento(s)`;
  }

  if (lista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center py-8 text-slate-400">No se encontraron movimientos con los filtros seleccionados en este Estado de Cuenta.</td></tr>`;
    if (tfoot) tfoot.innerHTML = '';
    return;
  }

  const tasaVes = AppState.config.tasa_ves || 45.0;
  let sumCargos = 0;
  let sumAbonos = 0;

  tbody.innerHTML = lista.map(m => {
    const esAnulado = Boolean(m.es_anulado);
    const cargo = parseFloat(m.cargo_usd || 0);
    const abono = parseFloat(m.abono_usd || 0);
    const saldoAcum = parseFloat(m.saldo_acumulado_usd || 0);
    const saldoBs = (saldoAcum * tasaVes).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    if (!esAnulado) {
      sumCargos += cargo;
      sumAbonos += abono;
    }

    let badgeTipo = '';
    if (m.tipo_movimiento === 'factura') {
      badgeTipo = `<span class="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-blue-100 text-blue-800 inline-flex items-center gap-1"><i class="fa-solid fa-file-invoice"></i>${escapeHtml(m.etiqueta_tipo)}</span>`;
    } else if (m.tipo_movimiento === 'pago') {
      badgeTipo = `<span class="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-emerald-100 text-emerald-800 inline-flex items-center gap-1"><i class="fa-solid fa-money-bill-wave"></i>${escapeHtml(m.etiqueta_tipo)}</span>`;
    } else if (m.tipo_movimiento === 'abono') {
      badgeTipo = `<span class="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-teal-100 text-teal-800 inline-flex items-center gap-1"><i class="fa-solid fa-hand-holding-dollar"></i>${escapeHtml(m.etiqueta_tipo)}</span>`;
    } else if (m.tipo_movimiento === 'nota_credito') {
      badgeTipo = `<span class="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-indigo-100 text-indigo-800 inline-flex items-center gap-1"><i class="fa-solid fa-circle-minus"></i>${escapeHtml(m.etiqueta_tipo)}</span>`;
    } else if (m.tipo_movimiento === 'nota_debito') {
      badgeTipo = `<span class="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-rose-100 text-rose-800 inline-flex items-center gap-1"><i class="fa-solid fa-circle-plus"></i>${escapeHtml(m.etiqueta_tipo)}</span>`;
    }

    let accionesHtml = '';
    if (esAnulado) {
      accionesHtml = `<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800"><i class="fa-solid fa-ban mr-1"></i>ANULADO</span>`;
    } else if (m.puede_anular_pago && m.cxp_id !== null && m.abono_id !== null) {
      accionesHtml = `
        <div class="flex items-center justify-center gap-1">
          <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">ACTIVO</span>
          <button type="button" onclick="verHistorialAbonosCXP(${m.cxp_id})" class="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-bold shadow-xs transition cursor-pointer" title="Anular este Pago / Abono y restituir deuda">
            <i class="fa-solid fa-rotate-left mr-0.5"></i>Anular Pago
          </button>
        </div>
      `;
    } else if (m.tipo_movimiento === 'factura' && m.cxp_id) {
      accionesHtml = `
        <div class="flex items-center justify-center gap-1">
          ${m.puede_pagar ? `<button type="button" onclick="abrirModalAbonoCXP(${m.cxp_id})" class="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold transition" title="Registrar Pago"><i class="fa-solid fa-money-bill-wave mr-0.5"></i>Pagos</button>` : `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700">SALDADA</span>`}
          ${m.puede_anular_documento ? (m.compra_id ? `<button type="button" onclick="anularCompraDesdeCXP(${m.compra_id}, '${escapeHtml(m.documento_numero)}')" class="px-2 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg text-[10px] font-bold transition" title="Anular Compra"><i class="fa-solid fa-ban"></i></button>` : `<button type="button" onclick="anularCuentaCXP(${m.cxp_id}, '${escapeHtml(m.documento_numero)}')" class="px-2 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg text-[10px] font-bold transition" title="Anular Cuenta Directa"><i class="fa-solid fa-ban"></i></button>`) : ''}
        </div>
      `;
    } else {
      accionesHtml = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">ACTIVO</span>`;
    }

    return `
      <tr class="hover:bg-slate-50 transition ${esAnulado ? 'bg-rose-50/30 opacity-65' : ''}">
        <td class="py-2.5 px-3 text-center font-mono font-bold text-slate-400">${m.nro_operacion}</td>
        <td class="py-2.5 px-3 whitespace-nowrap text-slate-600 font-medium">${formatFecha(m.fecha)}</td>
        <td class="py-2.5 px-3 whitespace-nowrap">${badgeTipo}</td>
        <td class="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">${escapeHtml(m.documento_numero)}</td>
        <td class="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">${escapeHtml(m.documento_afectado || '-')}</td>
        <td class="py-2.5 px-3 text-slate-700 max-w-md">
          <div class="${esAnulado ? 'line-through text-slate-400' : ''}">${escapeHtml(m.concepto || '')}</div>
        </td>
        <td class="py-2.5 px-3 text-right font-bold ${cargo > 0 ? (esAnulado ? 'line-through text-slate-400' : 'text-rose-700 bg-rose-50/30') : 'text-slate-300'}">
          ${cargo > 0 ? '+$' + cargo.toFixed(2) : '—'}
        </td>
        <td class="py-2.5 px-3 text-right font-bold ${abono > 0 ? (esAnulado ? 'line-through text-slate-400' : 'text-emerald-700 bg-emerald-50/30') : 'text-slate-300'}">
          ${abono > 0 ? '-$' + abono.toFixed(2) : '—'}
        </td>
        <td class="py-2.5 px-3 text-right bg-rose-50/30">
          <span class="font-black text-slate-900 block">$${saldoAcum.toFixed(2)}</span>
          <span class="text-[10px] text-slate-500">≈ ${saldoBs} Bs.</span>
        </td>
        <td class="py-2.5 px-3 text-center whitespace-nowrap">${accionesHtml}</td>
      </tr>
    `;
  }).join('');

  if (tfoot) {
    const saldoFinalGlobal = AppState.cxpEstadoCuentaData?.resumen?.saldo_pendiente_usd ?? Math.max(0, sumCargos - sumAbonos);
    tfoot.innerHTML = `
      <tr>
        <td colspan="6" class="py-2.5 px-3 text-right uppercase tracking-wider text-slate-600">Totales de Movimientos Activos Mostrados (${lista.filter(x => !x.es_anulado).length}):</td>
        <td class="py-2.5 px-3 text-right text-rose-700 font-extrabold">+$${sumCargos.toFixed(2)}</td>
        <td class="py-2.5 px-3 text-right text-emerald-700 font-extrabold">-$${sumAbonos.toFixed(2)}</td>
        <td class="py-2.5 px-3 text-right text-slate-900 font-black bg-rose-100/60">Deuda Actual: $${parseFloat(saldoFinalGlobal).toFixed(2)}</td>
        <td></td>
      </tr>
    `;
  }
}

function volverACxpConsolidado() {
  AppState.cxpProveedorSeleccionado = null;
  document.getElementById('cxpVistaEstadoCuenta').classList.add('hidden');
  document.getElementById('cxpVistaConsolidada').classList.remove('hidden');
  loadCxpConsolidado();
}

function filterCxpProveedorEstado(estado) {
  AppState.cxpProveedorFilter = estado;
  ['todos', 'pendiente', 'parcial', 'vencida', 'pagada', 'anulada'].forEach(e => {
    const btn = document.getElementById(`cxpDetFilter-${e}`);
    if (btn) {
      if (e === estado) {
        btn.className = 'px-3 py-1 rounded-lg text-xs font-bold bg-rose-600 text-white';
      } else {
        btn.className = 'px-3 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200';
      }
    }
  });
  renderCxpProveedorCuentasTable();
}

function renderCxpProveedorCuentasTable() {
  const tbody = document.getElementById('cxpDetalleTableBody');
  if (!tbody) return;

  let cuentas = AppState.cxpProveedorCuentas || [];
  const filtro = AppState.cxpProveedorFilter || 'todos';

  if (filtro === 'pendiente') {
    cuentas = cuentas.filter(c => c.estado === 'pendiente');
  } else if (filtro === 'parcial') {
    cuentas = cuentas.filter(c => c.estado === 'parcial');
  } else if (filtro === 'vencida') {
    cuentas = cuentas.filter(c => c.estado !== 'pagada' && c.estado !== 'anulada' && (parseInt(c.dias_vencido) || 0) > 0);
  } else if (filtro === 'pagada') {
    cuentas = cuentas.filter(c => c.estado === 'pagada');
  } else if (filtro === 'anulada') {
    cuentas = cuentas.filter(c => c.estado === 'anulada');
  }

  if (cuentas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-8 text-slate-400">No hay cuentas con este criterio para este proveedor.</td></tr>`;
    return;
  }

  const tasaVes = AppState.config.tasa_ves || 45.0;

  tbody.innerHTML = cuentas.map(c => {
    const esAnulada = c.estado === 'anulada';
    const diasVenc = parseInt(c.dias_vencido) || 0;
    const esVencida = !esAnulada && c.estado !== 'pagada' && diasVenc > 0;

    let badgeEstado = '';
    if (esAnulada) {
      badgeEstado = `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800"><i class="fa-solid fa-ban mr-1"></i>Anulada</span>`;
    } else if (c.estado === 'pagada') {
      badgeEstado = `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800"><i class="fa-solid fa-check mr-1"></i>Saldada</span>`;
    } else if (esVencida) {
      badgeEstado = `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800"><i class="fa-solid fa-clock-rotate-left mr-1"></i>Vencida</span>`;
    } else if (c.estado === 'parcial') {
      badgeEstado = `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800"><i class="fa-solid fa-hourglass-half mr-1"></i>Parcial</span>`;
    } else {
      badgeEstado = `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800"><i class="fa-solid fa-clock mr-1"></i>Pendiente</span>`;
    }

    const saldoBs = parseFloat(c.saldo_ves || (c.saldo_pendiente * tasaVes)).toLocaleString('es-VE');

    const badgeTipo = c.tipo_registro === 'directo'
      ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">Gasto Directo</span>`
      : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">Compra Stock</span>`;

    const plazoHtml = esVencida 
      ? `<span class="text-rose-600 font-bold text-xs"><i class="fa-solid fa-triangle-exclamation mr-1"></i>Vencida (${diasVenc} d)</span>`
      : `<span class="text-slate-600 text-xs">${c.fecha_vencimiento}</span>`;

    const abonosActivos = parseInt(c.abonos_activos_count || 0);
    const numDocCxp = escapeHtml(c.numero_factura || c.compra_numero_control || `#${c.id}`);

    return `
      <tr class="hover:bg-slate-50 transition ${esAnulada ? 'opacity-60 bg-rose-50/30' : ''}">
        <td class="py-3 px-4 font-mono font-bold text-slate-900 text-xs">
          <p>${escapeHtml(c.numero_factura || '-')}</p>
          <span class="text-[10px] text-slate-400 font-sans font-normal">${escapeHtml(c.descripcion_concepto || 'Compra de mercancía')}</span>
        </td>
        <td class="py-3 px-4">${badgeTipo}</td>
        <td class="py-3 px-4 text-xs text-slate-500">${formatFecha(c.fecha_emision)}</td>
        <td class="py-3 px-4 text-xs">${plazoHtml}</td>
        <td class="py-3 px-4 font-bold text-slate-700 text-xs">$${parseFloat(c.monto_total).toFixed(2)}</td>
        <td class="py-3 px-4 font-medium text-emerald-700 text-xs">$${parseFloat(c.monto_pagado).toFixed(2)}</td>
        <td class="py-3 px-4">
          <span class="font-black text-xs text-rose-600 block">$${parseFloat(c.saldo_pendiente).toFixed(2)}</span>
          <span class="text-[10px] text-slate-400">≈ ${saldoBs} Bs.</span>
        </td>
        <td class="py-3 px-4 text-center">${badgeEstado}</td>
        <td class="py-3 px-4 text-right space-x-1 whitespace-nowrap">
          ${(!esAnulada && c.saldo_pendiente > 0.001) ? `
            <button onclick="abrirModalAbonoCXP(${c.id})" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition shadow-xs" title="Aplicar Pago Multimoneda (USD, VES, COP) para rebajar saldo">
              <i class="fa-solid fa-money-bill-wave mr-1"></i>Pagos
            </button>
          ` : (!esAnulada ? `
            <span class="px-2 py-1 text-emerald-600 text-xs font-bold">Saldada</span>
          ` : '')}
          <button onclick="verHistorialAbonosCXP(${c.id})" class="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-xs font-bold transition" title="Ver historial de pagos al proveedor y anular pagos">
            <i class="fa-solid fa-rotate-left mr-1"></i>Anular Pago${abonosActivos > 0 ? ' (' + abonosActivos + ')' : ''}
          </button>
          ${!esAnulada ? (c.compra_id ? `
            <button onclick="anularCompraDesdeCXP(${c.compra_id}, '${numDocCxp}')" class="px-2.5 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg text-xs font-bold transition" title="Anular esta compra y revertir inventario y deuda">
              <i class="fa-solid fa-ban mr-1"></i>Anular Compra
            </button>
          ` : `
            <button onclick="anularCuentaCXP(${c.id}, '${numDocCxp}')" class="px-2.5 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg text-xs font-bold transition" title="Anular esta cuenta por pagar directa">
              <i class="fa-solid fa-ban mr-1"></i>Anular Cuenta
            </button>
          `) : ''}
          ${!esAnulada ? `
            <button onclick="abrirModalNotaAjuste('cxp', ${c.proveedor_id}, ${c.id})" class="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition" title="Aplicar Nota Débito / Crédito">
              <i class="fa-solid fa-file-invoice-dollar mr-0.5"></i>+ Nota
            </button>
          ` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

// Helpers para abrir modales desde vista detallada
function abrirModalDirectoCXPParaProveedorActual() {
  abrirModalDirectoCXP(AppState.cxpProveedorSeleccionado);
}

function abrirModalNotaAjusteParaClienteActual() {
  if (AppState.cxcClienteSeleccionado) {
    abrirModalNotaAjuste('cxc', AppState.cxcClienteSeleccionado);
  }
}

function abrirModalNotaAjusteParaProveedorActual() {
  if (AppState.cxpProveedorSeleccionado) {
    abrirModalNotaAjuste('cxp', AppState.cxpProveedorSeleccionado);
  }
}

// ========================================================
// MODAL DE GASTO DIRECTO / SALDO A PROVEEDOR (CXP)
// ========================================================
function abrirModalDirectoCXP(defaultProvId = null) {
  const pSelect = document.getElementById('cxpDirectoProveedor');
  if (pSelect) {
    pSelect.innerHTML = `<option value="">-- Seleccionar Proveedor --</option>` +
      AppState.proveedores.map(p => `
        <option value="${p.id}">${escapeHtml(p.nombre)} (${escapeHtml(p.cedula)})</option>
      `).join('');
    if (defaultProvId) {
      pSelect.value = String(defaultProvId);
    }
  }

  document.getElementById('cxpDirectoConcepto').value = '';
  document.getElementById('cxpDirectoNumFactura').value = '';
  document.getElementById('cxpDirectoNumControl').value = '';
  document.getElementById('cxpDirectoImpuestoTipo').value = 'exento';
  document.getElementById('cxpDirectoAfectaLibro').value = '0';
  document.getElementById('cxpDirectoBaseUsd').value = '';
  document.getElementById('cxpDirectoIvaUsd').value = '0.00';
  document.getElementById('cxpDirectoMonto').value = '';
  document.getElementById('cxpDirectoNotas').value = '';

  const today = new Date().toISOString().split('T')[0];
  document.getElementById('cxpDirectoFechaEmision').value = today;
  const dVenc = new Date();
  dVenc.setDate(dVenc.getDate() + 15);
  document.getElementById('cxpDirectoFechaVencimiento').value = dVenc.toISOString().split('T')[0];

  actualizarCalculosCxpDirecto();
  document.getElementById('modalDirectoCXP').classList.remove('hidden');
}

function closeModalDirectoCXP() {
  document.getElementById('modalDirectoCXP').classList.add('hidden');
}

function actualizarCalculosCxpDirecto() {
  const impTipo = document.getElementById('cxpDirectoImpuestoTipo')?.value || 'exento';
  const total = parseFloat(document.getElementById('cxpDirectoMonto')?.value) || 0;
  let base = 0;
  let iva = 0;
  if (impTipo === 'gravado') {
    base = Math.round((total / 1.16) * 100) / 100;
    iva = Math.round((total - base) * 100) / 100;
  } else {
    base = total;
    iva = 0;
  }
  const elBase = document.getElementById('cxpDirectoBaseUsd');
  const elIva = document.getElementById('cxpDirectoIvaUsd');
  if (elBase) elBase.value = base > 0 ? base.toFixed(2) : '';
  if (elIva) elIva.value = iva.toFixed(2);

  actualizarDesgloseFiscalCxpDirecto(base, iva, total);
}

function actualizarDesdeTotalCxpDirecto() {
  actualizarCalculosCxpDirecto();
}

function actualizarDesdeBaseCxpDirecto() {
  const impTipo = document.getElementById('cxpDirectoImpuestoTipo')?.value || 'exento';
  const base = parseFloat(document.getElementById('cxpDirectoBaseUsd')?.value) || 0;
  let iva = 0;
  let total = 0;
  if (impTipo === 'gravado') {
    iva = Math.round((base * 0.16) * 100) / 100;
    total = Math.round((base + iva) * 100) / 100;
  } else {
    iva = 0;
    total = base;
  }
  const elTotal = document.getElementById('cxpDirectoMonto');
  const elIva = document.getElementById('cxpDirectoIvaUsd');
  if (elTotal) elTotal.value = total > 0 ? total.toFixed(2) : '';
  if (elIva) elIva.value = iva.toFixed(2);

  actualizarDesgloseFiscalCxpDirecto(base, iva, total);
}

function actualizarDesgloseFiscalCxpDirecto(baseUsd, ivaUsd, totalUsd) {
  const tasaVes = AppState.config.tasa_ves || 45.0;
  const tasaCop = AppState.config.tasa_cop || 4000;

  const baseBs = (baseUsd * tasaVes).toFixed(2);
  const ivaBs = (ivaUsd * tasaVes).toFixed(2);
  const totalBs = (totalUsd * tasaVes).toFixed(2);
  const cop = Math.round(totalUsd * tasaCop).toLocaleString('es-CO');

  const elTasa = document.getElementById('cxpDirectoTasaBcvBadge');
  if (elTasa) elTasa.textContent = `Tasa BCV: ${tasaVes.toFixed(2)} Bs/$`;
  const elBaseBs = document.getElementById('cxpDirectoBaseBs');
  if (elBaseBs) elBaseBs.textContent = `${parseFloat(baseBs).toLocaleString('es-VE')} Bs.`;
  const elIvaBs = document.getElementById('cxpDirectoIvaBs');
  if (elIvaBs) elIvaBs.textContent = `${parseFloat(ivaBs).toLocaleString('es-VE')} Bs.`;
  const elTotalBs = document.getElementById('cxpDirectoTotalBs');
  if (elTotalBs) elTotalBs.textContent = `${parseFloat(totalBs).toLocaleString('es-VE')} Bs.`;
  const elCop = document.getElementById('cxpDirectoMontoCop');
  if (elCop) elCop.textContent = `${cop} COP`;
}

async function guardarDirectoCXP(e) {
  e.preventDefault();
  const provId = document.getElementById('cxpDirectoProveedor').value;
  const concepto = document.getElementById('cxpDirectoConcepto').value.trim();
  const numFactura = document.getElementById('cxpDirectoNumFactura').value.trim();
  const numControl = document.getElementById('cxpDirectoNumControl').value.trim();
  const impTipo = document.getElementById('cxpDirectoImpuestoTipo').value;
  const afectaLibro = parseInt(document.getElementById('cxpDirectoAfectaLibro').value) || 0;
  const monto = parseFloat(document.getElementById('cxpDirectoMonto').value) || 0;
  const baseUsd = parseFloat(document.getElementById('cxpDirectoBaseUsd').value) || (impTipo === 'exento' ? monto : monto / 1.16);
  const ivaUsd = parseFloat(document.getElementById('cxpDirectoIvaUsd').value) || (impTipo === 'exento' ? 0 : monto - baseUsd);
  const fechaEmision = document.getElementById('cxpDirectoFechaEmision').value;
  const fechaVencimiento = document.getElementById('cxpDirectoFechaVencimiento').value;
  const notas = document.getElementById('cxpDirectoNotas').value.trim();

  if (!provId) {
    alert('Seleccione un proveedor.');
    return;
  }
  if (!concepto) {
    alert('Ingrese el concepto o descripción del gasto.');
    return;
  }
  if (monto <= 0) {
    alert('El monto debe ser mayor a cero.');
    return;
  }
  if (afectaLibro === 1 && !numFactura) {
    alert('Para gastos que afectan el Libro de Compras Fiscal (SENIAT), el N° de Factura es obligatorio.');
    return;
  }
  if (!fechaVencimiento) {
    alert('Ingrese la fecha de vencimiento.');
    return;
  }

  const payload = {
    proveedor_id: parseInt(provId),
    descripcion_concepto: concepto,
    numero_factura: numFactura,
    numero_control: numControl,
    impuesto_tipo: impTipo,
    afecta_libro_compras: afectaLibro,
    base_imponible_usd: baseUsd,
    iva_usd: ivaUsd,
    monto_total: monto,
    fecha_emision: fechaEmision,
    fecha_vencimiento: fechaVencimiento,
    notas: notas
  };

  try {
    const res = await fetch('/api/cxp/directo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      alert('¡Cuenta por pagar / Gasto directo registrado con éxito!');
      closeModalDirectoCXP();
      await loadCxp();
      await loadDashboard();
  await loadDatabaseStatus();
  initRolUsuario();
    } else {
      const err = await res.json();
      alert('Error: ' + (err.error || 'No se pudo guardar la cuenta'));
    }
  } catch (err) {
    alert('Error de conexión: ' + err.message);
  }
}

// ========================================================
// MODAL DE NOTAS DE AJUSTE COMERCIAL (DÉBITO / CRÉDITO)
// ========================================================
async function abrirModalNotaAjuste(modulo, terceroId, cuentaIdDefault = null, tipoNotaDefault = 'credito') {
  document.getElementById('notaAjusteModulo').value = modulo;
  document.getElementById('notaAjusteTerceroId').value = terceroId;

  const badge = document.getElementById('notaAjusteModuloBadge');
  const etiqueta = document.getElementById('notaAjusteTerceroEtiqueta');
  const nombreEl = document.getElementById('notaAjusteTerceroNombre');
  const modalTitle = document.getElementById('notaAjusteModalTitle');

  if (modulo === 'cxc') {
    badge.textContent = 'CXC (Cliente)';
    badge.className = 'text-xs px-2.5 py-1 rounded-full font-bold bg-amber-100 text-amber-800 uppercase';
    etiqueta.textContent = 'Cliente';
    const cl = (AppState.clientes && AppState.clientes.find(c => c.id === terceroId)) || (AppState.cxcConsolidado && AppState.cxcConsolidado.find(c => c.cliente_id === terceroId));
    nombreEl.textContent = cl ? `${cl.nombre || cl.cliente_nombre} (${cl.cedula || cl.cliente_cedula})` : `Cliente #${terceroId}`;
    modalTitle.innerHTML = `<i class="fa-solid fa-file-invoice-dollar text-indigo-600 mr-2"></i>Nota de Ajuste — Cuenta por Cobrar`;
  } else {
    badge.textContent = 'CXP (Proveedor)';
    badge.className = 'text-xs px-2.5 py-1 rounded-full font-bold bg-rose-100 text-rose-800 uppercase';
    etiqueta.textContent = 'Proveedor';
    const pr = (AppState.proveedores && AppState.proveedores.find(p => p.id === terceroId)) || (AppState.cxpConsolidado && AppState.cxpConsolidado.find(p => p.proveedor_id === terceroId));
    nombreEl.textContent = pr ? `${pr.nombre || pr.proveedor_nombre} (${pr.cedula || pr.proveedor_cedula})` : `Proveedor #${terceroId}`;
    modalTitle.innerHTML = `<i class="fa-solid fa-file-invoice-dollar text-indigo-600 mr-2"></i>Nota de Ajuste — Cuenta por Pagar`;
  }

  // Cargar cuentas / facturas del tercero
  const selectCuenta = document.getElementById('notaAjusteCuentaId');
  selectCuenta.innerHTML = '<option value="">Cargando documentos...</option>';

  try {
    const url = modulo === 'cxc' ? `/api/cxc?cliente_id=${terceroId}` : `/api/cxp?proveedor_id=${terceroId}`;
    const res = await fetch(url);
    const docs = await res.json();
    
    if (docs.length === 0) {
      selectCuenta.innerHTML = '<option value="">No hay documentos registrados</option>';
    } else {
      selectCuenta.innerHTML = docs.map(d => {
        const num = d.numero_factura || `ID #${d.id}`;
        const saldo = parseFloat(d.saldo_pendiente || 0).toFixed(2);
        const desc = d.descripcion_concepto ? ` - ${d.descripcion_concepto}` : '';
        return `<option value="${d.id}">${escapeHtml(num)}${escapeHtml(desc)} | Saldo: $${saldo}</option>`;
      }).join('');
      if (cuentaIdDefault) {
        selectCuenta.value = String(cuentaIdDefault);
      }
    }
  } catch (err) {
    selectCuenta.innerHTML = '<option value="">Error cargando facturas</option>';
  }

  document.getElementById('notaAjusteTipoNota').value = tipoNotaDefault;
  document.getElementById('notaAjusteMontoUsd').value = '';
  document.getElementById('notaAjusteFecha').value = new Date().toISOString().split('T')[0];
  document.getElementById('notaAjusteMotivo').value = '';
  document.getElementById('notaAjusteNumControl').value = '';
  document.getElementById('notaAjusteAfectaLibro').value = '0';

  onCambioTipoNotaAjuste();
  actualizarEquivalenciasNotaAjuste();

  document.getElementById('modalNotaAjusteComercial').classList.remove('hidden');
}

function closeModalNotaAjuste() {
  document.getElementById('modalNotaAjusteComercial').classList.add('hidden');
}

function onCambioTipoNotaAjuste() {
  const modulo = document.getElementById('notaAjusteModulo').value;
  const tipo = document.getElementById('notaAjusteTipoNota').value;
  const selectEfecto = document.getElementById('notaAjusteEfecto');
  const alertEl = document.getElementById('notaAjusteAlertaEfecto');
  const explicacion = document.getElementById('notaAjusteExplicacionEfecto');

  if (tipo === 'credito') {
    selectEfecto.value = 'disminuye';
    if (modulo === 'cxc') {
      explicacion.innerHTML = `<strong>Nota de Crédito en CXC:</strong> Disminuye el saldo adeudado por el cliente (-) por devolución, descuento o ajuste a favor.`;
      alertEl.className = 'text-xs rounded-xl p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-2';
    } else {
      explicacion.innerHTML = `<strong>Nota de Crédito en CXP:</strong> Disminuye la deuda con el proveedor (-) por bonificación, descuento o devolución de compra.`;
      alertEl.className = 'text-xs rounded-xl p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-2';
    }
  } else {
    // debito
    if (modulo === 'cxc') {
      selectEfecto.value = 'incrementa';
      explicacion.innerHTML = `<strong>Nota de Débito en CXC:</strong> Incrementa el saldo a cobrar al cliente (+) por intereses de mora, gastos o diferencia de precio.`;
      alertEl.className = 'text-xs rounded-xl p-2.5 bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2';
    } else {
      selectEfecto.value = 'incrementa';
      explicacion.innerHTML = `<strong>Nota de Débito en CXP:</strong> Incrementa el saldo por pagar al proveedor (+) por recargo, gastos de flete o diferencia en factura.`;
      alertEl.className = 'text-xs rounded-xl p-2.5 bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-2';
    }
  }
}

function actualizarEquivalenciasNotaAjuste() {
  const montoUsd = parseFloat(document.getElementById('notaAjusteMontoUsd')?.value) || 0;
  const tasaVes = AppState.config.tasa_ves || 45.0;
  const montoBs = (montoUsd * tasaVes).toFixed(2);
  const elBs = document.getElementById('notaAjusteMontoBs');
  if (elBs) elBs.textContent = `${parseFloat(montoBs).toLocaleString('es-VE')} Bs.`;
}

async function guardarNotaAjuste(e) {
  e.preventDefault();
  const modulo = document.getElementById('notaAjusteModulo').value;
  const terceroId = parseInt(document.getElementById('notaAjusteTerceroId').value);
  const cuentaId = document.getElementById('notaAjusteCuentaId').value;
  const tipoNota = document.getElementById('notaAjusteTipoNota').value;
  const efecto = document.getElementById('notaAjusteEfecto').value;
  const montoUsd = parseFloat(document.getElementById('notaAjusteMontoUsd').value) || 0;
  const fecha = document.getElementById('notaAjusteFecha').value;
  const motivo = document.getElementById('notaAjusteMotivo').value.trim();
  const numControl = document.getElementById('notaAjusteNumControl').value.trim();
  const afectaLibro = parseInt(document.getElementById('notaAjusteAfectaLibro').value) || 0;

  if (!cuentaId) {
    alert('Debe seleccionar la factura o cuenta sobre la cual se aplicará la nota.');
    return;
  }
  if (montoUsd <= 0) {
    alert('El monto de la nota debe ser mayor a cero.');
    return;
  }
  if (!motivo) {
    alert('El concepto o motivo de la nota es obligatorio.');
    return;
  }

  const payload = {
    modulo: modulo,
    tercero_id: terceroId,
    cuenta_id: parseInt(cuentaId),
    tipo_nota: tipoNota,
    efecto: efecto,
    monto_usd: montoUsd,
    fecha: fecha,
    motivo: motivo,
    numero_control: numControl,
    afecta_libro_fiscal: afectaLibro
  };

  try {
    const res = await fetch('/api/notas-ajuste', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const data = await res.json();
      alert(`¡${data.tipo_nota === 'credito' ? 'Nota de Crédito' : 'Nota de Débito'} ${data.numero_nota} registrada con éxito!
Efecto: ${efecto.toUpperCase()} saldo por $${montoUsd.toFixed(2)} USD (${data.monto_ves.toFixed(2)} Bs.)`);
      closeModalNotaAjuste();
      
      // Actualizar vista inmediatamente
      if (modulo === 'cxc') {
        if (AppState.cxcClienteSeleccionado) {
          await verEstadoCuentaCliente(AppState.cxcClienteSeleccionado);
        }
        await loadCxcConsolidado();
      } else {
        if (AppState.cxpProveedorSeleccionado) {
          await verEstadoCuentaProveedor(AppState.cxpProveedorSeleccionado);
        }
        await loadCxpConsolidado();
      }
      await loadDashboard();
  await loadDatabaseStatus();
  initRolUsuario();
    } else {
      const err = await res.json();
      alert('Error: ' + (err.error || 'No se pudo guardar la nota de ajuste'));
    }
  } catch (err) {
    alert('Error al guardar nota de ajuste: ' + err.message);
  }
}

// Abrir modal de Pagos directamente desde la fila del proveedor (Consolidado) o desde el encabezado del Estado de Cuenta
async function abrirPagosDirectoProveedor(proveedorId) {
  try {
    const res = await fetch(`/api/cxp?proveedor_id=${proveedorId}`);
    if (!res.ok) throw new Error("No se pudieron cargar las cuentas del proveedor");
    const cuentas = await res.json();
    const activas = cuentas.filter(c => c.estado !== 'anulada');
    if (activas.length === 0) {
      alert("Este proveedor no tiene cuentas activas en Cuentas por Pagar.");
      return;
    }
    const pendientes = activas.filter(c => parseFloat(c.saldo_pendiente || 0) > 0.001).sort((a, b) => a.id - b.id);
    const cuentaInicial = pendientes.length > 0 ? pendientes[0] : activas[0];

    await abrirModalAbonoCXP(cuentaInicial.id, activas);
  } catch (err) {
    alert("Error al abrir Pagos del proveedor: " + err.message);
  }
}

function abrirModalPagosProveedorActual() {
  if (AppState.cxpProveedorSeleccionado) {
    abrirPagosDirectoProveedor(AppState.cxpProveedorSeleccionado);
  }
}

async function onCambioCuentaEnModalPagoCXP(nuevoCxpId) {
  if (!nuevoCxpId) return;
  await abrirModalAbonoCXP(parseInt(nuevoCxpId), AppState.abonoCxpListaProveedor || null);
}

// Modal de Pagos / Abonos a Cuenta por Pagar (Multimoneda)
async function abrirModalAbonoCXP(cxpId, listaCuentasProveedor = null) {
  try {
    const res = await fetch(`/api/cxp/${cxpId}`);
    if (!res.ok) return;
    const c = await res.json();
    AppState.abonoCxpActual = c;

    if (!listaCuentasProveedor && AppState.cxpProveedorCuentas && AppState.cxpProveedorCuentas.length > 1) {
      listaCuentasProveedor = AppState.cxpProveedorCuentas.filter(x => x.estado !== 'anulada');
    }
    AppState.abonoCxpListaProveedor = listaCuentasProveedor;

    const wrapperSelect = document.getElementById('abonoCxpSelectCuentaWrapper');
    const selectCuenta = document.getElementById('abonoCxpSelectCuenta');
    if (wrapperSelect && selectCuenta) {
      if (listaCuentasProveedor && listaCuentasProveedor.length > 0) {
        wrapperSelect.classList.remove('hidden');
        selectCuenta.innerHTML = listaCuentasProveedor.map(item => {
          const s = parseFloat(item.saldo_pendiente || 0).toFixed(2);
          const pag = parseFloat(item.monto_pagado || 0).toFixed(2);
          const docLabel = item.numero_factura || item.descripcion_concepto || `#${item.id}`;
          return `<option value="${item.id}" ${item.id === c.id ? 'selected' : ''}>Doc: ${escapeHtml(docLabel)} — Saldo: $${s} (Abonado: $${pag})</option>`;
        }).join('');
      } else {
        wrapperSelect.classList.add('hidden');
      }
    }

    document.getElementById('abonoCxpProveedorNombre').textContent = `${c.proveedor_nombre} (${c.proveedor_cedula || ''})`;
    document.getElementById('abonoCxpFacturaConcepto').textContent = `${c.numero_factura || 'S/N'} - ${c.descripcion_concepto || 'Compra de mercancía'}`;
    document.getElementById('abonoCxpSaldoPendienteUsd').textContent = `$${parseFloat(c.saldo_pendiente).toFixed(2)}`;
    const saldoBs = (c.saldo_pendiente * AppState.config.tasa_ves).toFixed(2);
    const saldoCop = Math.round(c.saldo_pendiente * AppState.config.tasa_cop).toLocaleString('es-CO');
    document.getElementById('abonoCxpSaldoPendienteBs').textContent = `${parseFloat(saldoBs).toLocaleString('es-VE')} Bs.`;
    document.getElementById('abonoCxpSaldoPendienteCop').textContent = `${saldoCop} COP`;
    document.getElementById('abonoCxpNotas').value = '';

    // Inicializar fila de pago prellenando con el saldo pendiente exacto en USD
    AppState.abonoCxpPagos = [
      {
        id: 1,
        moneda: 'USD',
        metodo: 'Dólar Efectivo',
        monto: parseFloat(c.saldo_pendiente),
        referencia: ''
      }
    ];
    renderAbonoPagosCXP();

    document.getElementById('modalAbonoCXP').classList.remove('hidden');
  } catch (err) {
    console.error("Error abriendo abono CXP:", err);
  }
}

function closeModalAbonoCXP() {
  document.getElementById('modalAbonoCXP').classList.add('hidden');
}

function calcularSaldoPendienteParaFilaAbonoCXP(filaIdExcluida = null) {
  const c = AppState.abonoCxpActual;
  if (!c) return 0;
  const saldoTotalUsd = parseFloat(c.saldo_pendiente);

  let pagadoUSD = 0;
  AppState.abonoCxpPagos.forEach(p => {
    if (filaIdExcluida !== null && p.id === filaIdExcluida) return;
    let equiv = 0;
    if (p.moneda === 'USD') equiv = p.monto || 0;
    else if (p.moneda === 'VES') equiv = AppState.config.tasa_ves > 0 ? ((p.monto || 0) / AppState.config.tasa_ves) : 0;
    else if (p.moneda === 'COP') equiv = AppState.config.tasa_cop > 0 ? ((p.monto || 0) / AppState.config.tasa_cop) : 0;
    pagadoUSD += equiv;
  });

  return Math.max(0, saldoTotalUsd - pagadoUSD);
}

function addAbonoPagoCxpRow() {
  const nextId = AppState.abonoCxpPagos.length > 0 ? Math.max(...AppState.abonoCxpPagos.map(p => p.id)) + 1 : 1;
  const saldoRestanteUSD = calcularSaldoPendienteParaFilaAbonoCXP();
  const defaultMoneda = AppState.abonoCxpPagos.length === 1 && AppState.abonoCxpPagos[0].moneda === 'USD' ? 'VES' : 'USD';
  const montoAuto = convertirUsdAMoneda(saldoRestanteUSD, defaultMoneda);
  const metodosDisponibles = getMetodosPago(defaultMoneda);

  AppState.abonoCxpPagos.push({
    id: nextId,
    moneda: defaultMoneda,
    metodo: metodosDisponibles[0],
    monto: montoAuto,
    referencia: ''
  });
  renderAbonoPagosCXP();
}

function removeAbonoPagoCxpRow(id) {
  AppState.abonoCxpPagos = AppState.abonoCxpPagos.filter(p => p.id !== id);
  if (AppState.abonoCxpPagos.length === 0) {
    addAbonoPagoCxpRow();
  } else {
    renderAbonoPagosCXP();
  }
}

function renderAbonoPagosCXP() {
  const container = document.getElementById('abonoCxpPagosContainer');
  if (!container) return;

  container.innerHTML = AppState.abonoCxpPagos.map(p => {
    const metodosDisponibles = getMetodosPago(p.moneda);
    if (!metodosDisponibles.includes(p.metodo)) {
      p.metodo = metodosDisponibles[0];
    }

    const metodosOptions = metodosDisponibles.map(m => `
      <option value="${m}" ${p.metodo === m ? 'selected' : ''}>${m}</option>
    `).join('');

    return `
      <div class="bg-slate-50 p-2 rounded-xl border border-slate-200 text-xs space-y-1.5">
        <div class="flex items-center space-x-2">
          <select onchange="updateAbonoPagoCxpMoneda(${p.id}, this.value)" class="bg-white border border-slate-200 rounded-lg py-1 px-2 font-bold text-slate-700">
            <option value="USD" ${p.moneda === 'USD' ? 'selected' : ''}>USD ($)</option>
            <option value="VES" ${p.moneda === 'VES' ? 'selected' : ''}>VES (Bs.)</option>
            <option value="COP" ${p.moneda === 'COP' ? 'selected' : ''}>COP (Pesos)</option>
          </select>

          <select onchange="updateAbonoPagoCxpMetodo(${p.id}, this.value)" class="bg-white border border-slate-200 rounded-lg py-1 px-2 font-medium text-slate-700">
            ${metodosOptions}
          </select>

          <div class="relative flex-1">
            <input type="number" step="any" min="0" value="${p.monto !== undefined && p.monto !== null ? p.monto : ''}" placeholder="Monto"
                   oninput="updateAbonoPagoCxpMonto(${p.id}, this.value)"
                   class="w-full bg-white border border-slate-200 rounded-lg py-1 px-2 text-xs font-bold text-slate-900 text-right">
          </div>

          <button onclick="removeAbonoPagoCxpRow(${p.id})" class="text-rose-500 hover:text-rose-700 p-1">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="flex items-center justify-between gap-2">
          <input type="text" value="${escapeHtml(p.referencia || '')}" placeholder="N° Referencia / Comprobante (opcional)"
                 oninput="updateAbonoPagoCxpReferencia(${p.id}, this.value)"
                 class="flex-1 bg-white border border-slate-200 rounded-lg py-1 px-2 text-[11px] text-slate-700">
        </div>
      </div>
    `;
  }).join('');

  recalcularAbonoCXP();
}

function updateAbonoPagoCxpMoneda(id, nuevaMoneda) {
  const p = AppState.abonoCxpPagos.find(x => x.id === id);
  if (p) {
    p.moneda = nuevaMoneda;
    p.metodo = getMetodosPago(nuevaMoneda)[0];
    const saldoPendienteUSD = calcularSaldoPendienteParaFilaAbonoCXP(id);
    p.monto = convertirUsdAMoneda(saldoPendienteUSD, nuevaMoneda);
    renderAbonoPagosCXP();
  }
}

function updateAbonoPagoCxpMetodo(id, metodo) {
  const p = AppState.abonoCxpPagos.find(x => x.id === id);
  if (p) p.metodo = metodo;
}

function updateAbonoPagoCxpReferencia(id, ref) {
  const p = AppState.abonoCxpPagos.find(x => x.id === id);
  if (p) p.referencia = ref;
}

function updateAbonoPagoCxpMonto(id, monto) {
  const p = AppState.abonoCxpPagos.find(x => x.id === id);
  if (p) {
    p.monto = parseFloat(monto) || 0;
    recalcularAbonoCXP();
  }
}

function recalcularAbonoCXP() {
  const c = AppState.abonoCxpActual;
  if (!c) return;

  let totalAbonoUsd = 0;
  AppState.abonoCxpPagos.forEach(p => {
    let equiv = 0;
    if (p.moneda === 'USD') equiv = p.monto || 0;
    else if (p.moneda === 'VES') equiv = AppState.config.tasa_ves > 0 ? ((p.monto || 0) / AppState.config.tasa_ves) : 0;
    else if (p.moneda === 'COP') equiv = AppState.config.tasa_cop > 0 ? ((p.monto || 0) / AppState.config.tasa_cop) : 0;
    p.equiv_usd = equiv;
    totalAbonoUsd += equiv;
  });

  const saldoActual = parseFloat(c.saldo_pendiente);
  const nuevoSaldo = Math.max(0, saldoActual - totalAbonoUsd);

  document.getElementById('abonoCxpTotalUsd').textContent = `$${totalAbonoUsd.toFixed(2)}`;
  document.getElementById('abonoCxpNuevoSaldoUsd').textContent = `$${nuevoSaldo.toFixed(2)}`;
}

async function confirmarAbonoCXP() {
  const c = AppState.abonoCxpActual;
  if (!c) return;

  const pagos = AppState.abonoCxpPagos.filter(p => (parseFloat(p.monto) || 0) > 0).map(p => {
    let tasa = 1.0;
    if (p.moneda === 'VES') tasa = AppState.config.tasa_ves;
    if (p.moneda === 'COP') tasa = AppState.config.tasa_cop;
    return {
      moneda: p.moneda,
      metodo: p.metodo,
      monto_moneda: p.monto,
      tasa_cambio: tasa,
      referencia: (p.referencia || '').trim()
    };
  });

  if (pagos.length === 0) {
    alert('Ingresa al menos un monto de pago mayor a cero.');
    return;
  }

  const payload = {
    pagos: pagos,
    notas: document.getElementById('abonoCxpNotas').value.trim() || 'Pago aplicado en CXP'
  };

  try {
    const res = await fetch(`/api/cxp/${c.id}/abonos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const data = await res.json();
      closeModalAbonoCXP();
      alert(`¡Pago de $${data.monto_abono_usd.toFixed(2)} USD registrado exitosamente!\nNuevo saldo pendiente: $${data.nuevo_saldo_pendiente.toFixed(2)}`);
      await loadCxp();
      if (AppState.cxpProveedorSeleccionado) {
        await verEstadoCuentaProveedor(AppState.cxpProveedorSeleccionado);
      }
      await loadDashboard();
      await loadDatabaseStatus();
      if (AppState.currentView === 'reportes' && AppState.reportesTabActual === 'cxp') loadReporteCxp();
    } else {
      const err = await res.json();
      alert('Error al registrar pago: ' + (err.error || 'No se pudo procesar'));
    }
  } catch (err) {
    alert('Error al registrar pago: ' + err.message);
  }
}

async function verHistorialAbonosCXP(cxpId) {
  try {
    const res = await fetch(`/api/cxp/${cxpId}`);
    if (!res.ok) return;
    const c = await res.json();
    const content = document.getElementById('historialAbonosCxpContent');
    const abonosActivos = (c.abonos || []).filter(ab => ab.estado !== 'anulado' && ab.id !== undefined && ab.id !== null);

    let html = `
      <div class="bg-rose-50/70 p-3 rounded-xl border border-rose-200 text-xs space-y-1">
        <p><strong>Proveedor:</strong> ${escapeHtml(c.proveedor_nombre)} &bull; <strong>Doc:</strong> ${escapeHtml(c.numero_factura || '-')}</p>
        <p><strong>Concepto:</strong> ${escapeHtml(c.descripcion_concepto || 'Compra de mercancía')}</p>
        <p><strong>Total:</strong> $${parseFloat(c.monto_total).toFixed(2)} &bull; <strong>Pagado:</strong> $${parseFloat(c.monto_pagado).toFixed(2)}</p>
        <p><strong>Saldo Pendiente:</strong> <span class="font-bold text-rose-700">$${parseFloat(c.saldo_pendiente).toFixed(2)}</span></p>
      </div>
      <div id="statusAnulacionCXP" class="hidden p-2.5 rounded-xl text-xs font-bold"></div>
    `;

    if (abonosActivos.length > 0 && c.estado !== 'anulada') {
      html += `
        <div class="bg-rose-50/90 p-3.5 rounded-xl border-2 border-rose-300 space-y-2.5 shadow-sm">
          <div class="flex items-center justify-between">
            <span class="text-xs font-extrabold text-rose-900 uppercase tracking-wide flex items-center gap-1.5">
              <i class="fa-solid fa-rotate-left text-rose-600"></i> Panel de Anulación Directa de Pago / Abono
            </span>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-200 text-rose-900">${abonosActivos.length} activo(s)</span>
          </div>
          <div class="space-y-1">
            <label class="block text-[11px] font-bold text-slate-700">1. Selecciona el pago o abono que deseas anular:</label>
            <select id="selectPagoAnularCXP" class="w-full px-2.5 py-2 border border-rose-300 rounded-lg text-xs font-bold text-slate-800 bg-white focus:ring-2 focus:ring-rose-500 outline-none">
              ${abonosActivos.map((ab, idx) => `
                <option value="${ab.id}">
                  ${ab.id === 0 ? 'Anticipo / Pago Inicial' : 'Pago #' + ab.id} — ${formatFecha(ab.fecha)} — Monto: -$${parseFloat(ab.monto_usd).toFixed(2)} USD
                </option>
              `).join('')}
            </select>
          </div>
          <div class="space-y-1">
            <label class="block text-[11px] font-bold text-slate-700">2. Motivo de la anulación:</label>
            <input type="text" id="motivoAnularPagoCXP" value="Reversión de pago a proveedor" placeholder="Indica el motivo de la reversión..." class="w-full px-2.5 py-1.5 border border-rose-300 rounded-lg text-xs text-slate-800 bg-white focus:ring-2 focus:ring-rose-500 outline-none">
          </div>
          <button type="button" id="btnEjecutarAnulacionCXP" onclick="ejecutarAnulacionPagoSeleccionadoCXP(${c.id})" class="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-extrabold rounded-xl text-xs shadow-md flex items-center justify-center gap-2 transition cursor-pointer">
            <i class="fa-solid fa-ban"></i> PROCESAR ANULACIÓN DE PAGO Y RESTITUIR DEUDA
          </button>
        </div>
      `;
    }

    if (!c.abonos || c.abonos.length === 0) {
      html += `<p class="text-center py-6 text-slate-400 text-xs">No se han registrado pagos para esta cuenta.</p>`;
    } else {
      html += `<div class="text-[11px] font-bold text-slate-500 uppercase tracking-wider pt-1">Detalle de Pagos Registrados:</div>`;
      html += c.abonos.map((ab, idx) => {
        const esAnulado = ab.estado === 'anulado';
        const puedeAnular = !esAnulado && c.estado !== 'anulada' && ab.id !== undefined && ab.id !== null;
        return `
        <div class="p-3 ${esAnulado ? 'bg-rose-50/40 border-rose-200 opacity-65' : 'bg-slate-50 border-slate-200'} border rounded-xl text-xs space-y-1.5">
          <div class="flex justify-between items-center">
            <span class="font-bold text-slate-800">
              ${ab.id === 0 ? 'Anticipo Inicial' : 'Pago #' + (c.abonos.length - idx)} &bull; ${formatFecha(ab.fecha)}
              ${esAnulado ? '<span class="ml-1.5 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">ANULADO</span>' : '<span class="ml-1.5 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">ACTIVO</span>'}
            </span>
            <div class="flex items-center gap-2">
              <strong class="${esAnulado ? 'line-through text-slate-400' : 'text-rose-700'} font-extrabold text-sm">-$${parseFloat(ab.monto_usd).toFixed(2)}</strong>
              ${puedeAnular ? `
                <button type="button" onclick="anularAbonoCXP(${ab.id}, ${c.id})" class="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-bold shadow-sm transition cursor-pointer" title="Anular este pago y restituir deuda inmediatamente">
                  <i class="fa-solid fa-ban mr-1"></i>Anular este Pago
                </button>
              ` : ''}
            </div>
          </div>
          <p class="text-[11px] text-slate-500">${escapeHtml(ab.notas || '')}</p>
          <div class="space-y-0.5 pt-1 border-t border-slate-100 text-[11px] text-slate-600">
            ${(ab.pagos || []).map(p => `
              <div class="flex justify-between">
                <span>&bull; ${p.metodo} (${p.moneda}):</span>
                <span>${parseFloat(p.monto_moneda).toLocaleString('es-VE')} ${p.moneda} (≈ $${parseFloat(p.equivalente_usd).toFixed(2)})</span>
              </div>
            `).join('')}
          </div>
        </div>
      `}).join('');
    }

    content.innerHTML = html;
    document.getElementById('modalHistorialAbonosCXP').classList.remove('hidden');
  } catch (err) {
    console.error("Error cargando historial de pagos CXP:", err);
  }
}

function closeModalHistorialAbonosCXP() {
  document.getElementById('modalHistorialAbonosCXP').classList.add('hidden');
}

function enviarRecordatorioWhatsAppCXP(cxpId) {
  const c = AppState.cxp.find(item => item.id === cxpId);
  if (!c) return;

  const waPhone = (c.proveedor_telefono || '').replace(/[^0-9]/g, '');
  if (!waPhone) {
    alert('El proveedor no tiene un número telefónico registrado para WhatsApp.');
    return;
  }

  const saldoBs = parseFloat(c.saldo_ves || 0).toLocaleString('es-VE');
  let mensaje = `*NOTIFICACIÓN COMERCIAL - ${AppState.config.nombre_negocio}*\n`;
  mensaje += `Estimados *${c.proveedor_nombre}*,\n`;
  mensaje += `Nos comunicamos con relación a la Factura/Cuenta *#${c.numero_factura || 'Gasto'}* (${c.descripcion_concepto || 'Mercancía'}).\n\n`;
  mensaje += `*ESTADO DE LA CUENTA:*\n`;
  mensaje += `- Monto Total: $${parseFloat(c.monto_total).toFixed(2)}\n`;
  mensaje += `- Monto Amortizado: $${parseFloat(c.monto_pagado).toFixed(2)}\n`;
  mensaje += `- Saldo Pendiente: *$${parseFloat(c.saldo_pendiente).toFixed(2)}* (≈ ${saldoBs} Bs.)\n`;
  mensaje += `- Vencimiento: ${c.fecha_vencimiento}\n\n`;
  mensaje += `Por favor envíenos sus datos bancarios actualizados si aplican. ¡Muchas gracias!`;

  const url = `https://wa.me/${waPhone}?text=${encodeURIComponent(mensaje)}`;
  window.open(url, '_blank');
}

// ========================================================
// MÓDULO 9: CENTRO DE REPORTES & ESTADÍSTICAS
// ========================================================
function loadReportes() {
  const fechaInput = document.getElementById('repVentasFechaInput');
  if (fechaInput && !fechaInput.value) {
    fechaInput.value = new Date().toISOString().split('T')[0];
  }
  setReportTab(AppState.reportesTabActual || 'kardex');
}

function setReportTab(tabName) {
  if (!tabName) tabName = 'kardex';
  AppState.reportesTabActual = tabName;
  const tabs = ['kardex', 'inv_simple', 'libro_ventas', 'libro_compras', 'art177', 'diarias', 'mensuales', 'inventario', 'cxc', 'cxp'];

  // Sincronizar selector móvil si existe
  const mobSelect = document.getElementById('mobileReportSelector');
  if (mobSelect && mobSelect.value !== tabName) {
    mobSelect.value = tabName;
  }

  tabs.forEach(t => {
    const btn = document.getElementById(`btn-subtab-rep-${t}`);
    const view = document.getElementById(`subview-rep-${t}`);
    if (view) {
      if (t === tabName) {
        view.classList.remove('hidden');
      } else {
        view.classList.add('hidden');
      }
    }
    if (btn) {
      if (t === tabName) {
        btn.className = 'px-3.5 py-2 rounded-xl text-xs font-bold btn-theme-primary text-white shadow-xs transition whitespace-nowrap';
      } else {
        btn.className = 'px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition whitespace-nowrap';
      }
    }
  });

  if (tabName === 'inventario') loadReporteInventario();
  if (tabName === 'diarias') loadReporteVentasDiarias();
  if (tabName === 'mensuales') loadReporteVentasMensuales();
  if (tabName === 'kardex') { if (AppState.kardexVersion === 'v2') loadReporteKardexV2(); else loadReporteKardex(); }
  if (tabName === 'inv_simple') loadReporteInventarioSimple();
  if (tabName === 'libro_ventas') loadLibroVentasSeniat();
  if (tabName === 'libro_compras') loadLibroComprasSeniat();
  if (tabName === 'art177') loadLibroInventarioArt177();
  if (tabName === 'cxc') loadReporteCxc();
  if (tabName === 'cxp') loadReporteCxp();
}

function recargarReporteActual() {
  if (AppState.reportesTabActual === 'inventario') loadReporteInventario();
  else if (AppState.reportesTabActual === 'diarias') loadReporteVentasDiarias();
  else if (AppState.reportesTabActual === 'mensuales') loadReporteVentasMensuales();
  else if (AppState.reportesTabActual === 'kardex') loadReporteKardex();
  else if (AppState.reportesTabActual === 'inv_simple') loadReporteInventarioSimple();
  else if (AppState.reportesTabActual === 'libro_ventas') loadLibroVentasSeniat();
  else if (AppState.reportesTabActual === 'libro_compras') loadLibroComprasSeniat();
  else if (AppState.reportesTabActual === 'art177') loadLibroInventarioArt177();
  else if (AppState.reportesTabActual === 'cxc') loadReporteCxc();
  else if (AppState.reportesTabActual === 'cxp') loadReporteCxp();
}

// --------------------------------------------------------
// REPORTE 1: INVENTARIO & VALORACIÓN
// --------------------------------------------------------
async function loadReporteInventario() {
  try {
    const res = await fetch('/api/reportes/inventario');
    if (!res.ok) return;
    const data = await res.json();
    AppState.reportesInventarioData = data;

    const r = data.resumen || {};
    const elCosto = document.getElementById('repInvTotalCostoUsd');
    if (elCosto) elCosto.textContent = `$${parseFloat(r.total_costo_inventario_usd || 0).toFixed(2)}`;
    const elCostoBs = document.getElementById('repInvTotalCostoBs');
    if (elCostoBs) elCostoBs.textContent = `≈ ${parseFloat(r.total_costo_inventario_ves || 0).toLocaleString('es-VE')} Bs. | ${Math.round(r.total_costo_inventario_cop || 0).toLocaleString('es-CO')} COP`;
    const elVenta = document.getElementById('repInvTotalVentaUsd');
    if (elVenta) elVenta.textContent = `$${parseFloat(r.total_venta_estimada_usd || 0).toFixed(2)}`;
    const elGanancia = document.getElementById('repInvGananciaUsd');
    if (elGanancia) elGanancia.textContent = `$${parseFloat(r.ganancia_estimada_usd || 0).toFixed(2)}`;
    const elUnidades = document.getElementById('repInvTotalUnidades');
    if (elUnidades) elUnidades.textContent = r.total_unidades_stock || 0;
    const elItemsCount = document.getElementById('repInvTotalItemsCount');
    if (elItemsCount) elItemsCount.textContent = `${r.total_items || 0} ítems en catálogo`;

    renderReporteInventarioTabla();
  } catch (err) {
    console.error("Error cargando reporte de inventario:", err);
  }
}

function filterRepInvTipo(tipo) {
  AppState.reportesInventarioFilterTipo = tipo;
  ['todos', 'producto', 'servicio'].forEach(t => {
    const btn = document.getElementById(`repInvFilter-${t}`);
    if (btn) {
      if (t === tipo) {
        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white';
      } else {
        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200';
      }
    }
  });
  renderReporteInventarioTabla();
}

function renderReporteInventarioTabla() {
  const data = AppState.reportesInventarioData;
  if (!data || !data.items) return;

  const tbody = document.getElementById('repInvTableBody');
  const tfoot = document.getElementById('repInvTableFoot');
  if (!tbody) return;

  const q = (document.getElementById('repInvSearchInput')?.value || '').trim().toLowerCase();
  const filtroTipo = AppState.reportesInventarioFilterTipo || 'todos';

  const filtrados = data.items.filter(item => {
    const matchTipo = filtroTipo === 'todos' || item.tipo === filtroTipo;
    const matchSearch = !q || item.nombre.toLowerCase().includes(q) || (item.codigo || '').toLowerCase().includes(q) || (item.categoria_nombre || '').toLowerCase().includes(q);
    return matchTipo && matchSearch;
  });

  if (filtrados.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-8 text-slate-400">No se encontraron ítems en este criterio.</td></tr>`;
    if (tfoot) tfoot.innerHTML = '';
    return;
  }

  let sumStock = 0;
  let sumCostoTotal = 0;
  let sumVentaTotal = 0;

  tbody.innerHTML = filtrados.map(item => {
    const esProd = item.tipo === 'producto';
    const costoStock = parseFloat(item.costo_total_stock || 0);
    const ventaStock = parseFloat(item.valor_venta_stock || 0);

    if (esProd) {
      sumStock += parseFloat(item.stock || 0);
      sumCostoTotal += costoStock;
      sumVentaTotal += ventaStock;
    }

    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="py-2.5 px-4 font-mono font-bold text-slate-700 text-xs">${escapeHtml(item.codigo || '-')}</td>
        <td class="py-2.5 px-4">
          <p class="font-bold text-slate-800 text-xs">${escapeHtml(item.nombre)}</p>
          <span class="text-[10px] text-slate-400">${item.impuesto_tipo === 'gravado' ? 'IVA 16%' : 'Exento 0%'}</span>
        </td>
        <td class="py-2.5 px-4 text-xs text-slate-600">${escapeHtml(item.categoria_nombre)}</td>
        <td class="py-2.5 px-4 text-center">
          <span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${esProd ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800'}">
            ${esProd ? 'Producto' : 'Servicio'}
          </span>
        </td>
        <td class="py-2.5 px-4 text-right font-bold text-xs ${esProd ? (item.stock <= 5 ? 'text-rose-600' : 'text-slate-800') : 'text-slate-400'}">
          ${esProd ? item.stock : '<span class="text-slate-400 font-normal">N/A</span>'}
        </td>
        <td class="py-2.5 px-4 text-right text-xs text-slate-600">
          $${parseFloat(item.costo || 0).toFixed(2)}
        </td>
        <td class="py-2.5 px-4 text-right font-extrabold text-xs text-slate-900 bg-slate-50/70">
          ${esProd ? `$${costoStock.toFixed(2)}` : '<span class="text-slate-400 font-normal">$0.00</span>'}
        </td>
        <td class="py-2.5 px-4 text-right text-xs text-slate-700 font-medium">
          $${parseFloat(item.precio_total || 0).toFixed(2)}
        </td>
        <td class="py-2.5 px-4 text-right font-bold text-xs text-emerald-700">
          ${esProd ? `$${ventaStock.toFixed(2)}` : '<span class="text-slate-400 font-normal">Variable</span>'}
        </td>
      </tr>
    `;
  }).join('');

  if (tfoot) {
    tfoot.innerHTML = `
      <tr>
        <td colspan="4" class="py-3 px-4 text-right uppercase tracking-wider text-slate-500">Totales del Reporte:</td>
        <td class="py-3 px-4 text-right font-black text-slate-900">${sumStock} un.</td>
        <td class="py-3 px-4 text-right text-slate-400">-</td>
        <td class="py-3 px-4 text-right font-black text-slate-900 text-sm bg-slate-100/80">$${sumCostoTotal.toFixed(2)}</td>
        <td class="py-3 px-4 text-right text-slate-400">-</td>
        <td class="py-3 px-4 text-right font-black text-emerald-700 text-sm">$${sumVentaTotal.toFixed(2)}</td>
      </tr>
    `;
  }
}

// --------------------------------------------------------
// REPORTE 2: VENTAS DIARIAS & DESGLOSE DE MONEDAS
// --------------------------------------------------------
function setRepVentasHoy() {
  const input = document.getElementById('repVentasFechaInput');
  if (input) {
    input.value = new Date().toISOString().split('T')[0];
    loadReporteVentasDiarias();
  }
}

async function loadReporteVentasDiarias() {
  const input = document.getElementById('repVentasFechaInput');
  const fecha = input?.value || new Date().toISOString().split('T')[0];

  try {
    const res = await fetch(`/api/reportes/ventas-diarias?fecha=${fecha}`);
    if (!res.ok) return;
    const data = await res.json();
    AppState.reportesVentasDiariasData = data;

    renderReporteVentasDiarias();
  } catch (err) {
    console.error("Error al cargar ventas diarias:", err);
  }
}

function renderReporteVentasDiarias() {
  const data = AppState.reportesVentasDiariasData;
  if (!data) return;

  const r = data.resumen || {};
  const facturadoUsd = parseFloat(r.total_facturado_usd || 0);
  const devolucionesUsd = parseFloat(r.total_devoluciones_usd || 0);
  const ventasNetasUsd = parseFloat(r.ventas_netas_usd !== undefined ? r.ventas_netas_usd : Math.max(0, facturadoUsd - devolucionesUsd));
  const devCount = r.devoluciones_count !== undefined ? r.devoluciones_count : (data.devoluciones ? data.devoluciones.length : 0);

  document.getElementById('repDiaFacturasCount').textContent = r.facturas_emitidas || 0;
  document.getElementById('repDiaTotalFacturadoUsd').textContent = `$${facturadoUsd.toFixed(2)}`;

  const elDevUsd = document.getElementById('repDiaTotalDevolucionesUsd');
  if (elDevUsd) elDevUsd.textContent = `-$${devolucionesUsd.toFixed(2)}`;
  const elDevBadge = document.getElementById('repDiaDevolucionesBadge');
  if (elDevBadge) elDevBadge.textContent = `${devCount} devolución(es)`;

  const elNeto = document.getElementById('repDiaVentasNetasUsd');
  if (elNeto) elNeto.textContent = `$${ventasNetasUsd.toFixed(2)}`;

  const elF1 = document.getElementById('repDiaFormulaFacturado');
  if (elF1) elF1.textContent = `$${facturadoUsd.toFixed(2)}`;
  const elF2 = document.getElementById('repDiaFormulaDevoluciones');
  if (elF2) elF2.textContent = `$${devolucionesUsd.toFixed(2)}`;
  const elF3 = document.getElementById('repDiaFormulaNeto');
  if (elF3) elF3.textContent = `$${ventasNetasUsd.toFixed(2)}`;

  document.getElementById('repDiaIvaUsd').textContent = `$${parseFloat(r.iva_usd || 0).toFixed(2)}`;
  document.getElementById('repDiaSubtotalUsd').textContent = `Subtotal: $${parseFloat(r.subtotal_usd || 0).toFixed(2)}`;
  document.getElementById('repDiaTotalCobradoUsd').textContent = `$${parseFloat(r.total_cobrado_caja_usd || 0).toFixed(2)}`;

  // Desglose de monedas
  const mon = data.desglose_monedas || {};

  // 1. USD
  const usdData = mon.USD || { total_moneda: 0, total_usd: 0, metodos: {} };
  document.getElementById('repMonedaTotalUsd').textContent = `$${parseFloat(usdData.total_moneda).toFixed(2)}`;
  const usdListEl = document.getElementById('repMetodosUsdList');
  if (usdListEl) {
    const metodosKeys = Object.keys(usdData.metodos || {});
    if (metodosKeys.length === 0) {
      usdListEl.innerHTML = `<span class="text-slate-400 italic">Sin ingresos en USD este día</span>`;
    } else {
      usdListEl.innerHTML = metodosKeys.map(k => `
        <div class="flex justify-between items-center py-1 border-b border-slate-50">
          <span class="font-medium text-slate-600">&bull; ${escapeHtml(k)}:</span>
          <span class="font-bold text-slate-900">$${parseFloat(usdData.metodos[k].monto_moneda).toFixed(2)}</span>
        </div>
      `).join('');
    }
  }

  // 2. VES (Bolívares)
  const vesData = mon.VES || { total_moneda: 0, total_usd: 0, metodos: {} };
  document.getElementById('repMonedaTotalVes').textContent = `${parseFloat(vesData.total_moneda).toLocaleString('es-VE')} Bs.`;
  document.getElementById('repMonedaEquivVesUsd').textContent = `≈ $${parseFloat(vesData.total_usd).toFixed(2)}`;
  const vesListEl = document.getElementById('repMetodosVesList');
  if (vesListEl) {
    const metodosKeys = Object.keys(vesData.metodos || {});
    if (metodosKeys.length === 0) {
      vesListEl.innerHTML = `<span class="text-slate-400 italic">Sin ingresos en Bs. este día</span>`;
    } else {
      vesListEl.innerHTML = metodosKeys.map(k => `
        <div class="flex justify-between items-center py-1 border-b border-slate-50">
          <span class="font-medium text-slate-600">&bull; ${escapeHtml(k)}:</span>
          <span class="font-bold text-slate-900">${parseFloat(vesData.metodos[k].monto_moneda).toLocaleString('es-VE')} Bs. (≈ $${parseFloat(vesData.metodos[k].monto_usd).toFixed(2)})</span>
        </div>
      `).join('');
    }
  }

  // 3. COP (Pesos)
  const copData = mon.COP || { total_moneda: 0, total_usd: 0, metodos: {} };
  document.getElementById('repMonedaTotalCop').textContent = `${Math.round(copData.total_moneda).toLocaleString('es-CO')} COP`;
  document.getElementById('repMonedaEquivCopUsd').textContent = `≈ $${parseFloat(copData.total_usd).toFixed(2)}`;
  const copListEl = document.getElementById('repMetodosCopList');
  if (copListEl) {
    const metodosKeys = Object.keys(copData.metodos || {});
    if (metodosKeys.length === 0) {
      copListEl.innerHTML = `<span class="text-slate-400 italic">Sin ingresos en Pesos este día</span>`;
    } else {
      copListEl.innerHTML = metodosKeys.map(k => `
        <div class="flex justify-between items-center py-1 border-b border-slate-50">
          <span class="font-medium text-slate-600">&bull; ${escapeHtml(k)}:</span>
          <span class="font-bold text-slate-900">${Math.round(copData.metodos[k].monto_moneda).toLocaleString('es-CO')} COP (≈ $${parseFloat(copData.metodos[k].monto_usd).toFixed(2)})</span>
        </div>
      `).join('');
    }
  }

  // Tabla de facturas del día
  const tbody = document.getElementById('repDiaFacturasTableBody');
  const facturas = data.facturas || [];
  document.getElementById('repDiaFacturasSubtitle').textContent = `${facturas.length} comprobante(s) emitido(s)`;

  if (tbody) {
    if (facturas.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" class="text-center py-8 text-slate-400">No se registraron ventas en esta fecha.</td></tr>`;
    } else {
      tbody.innerHTML = facturas.map(f => {
        const hora = f.fecha ? f.fecha.split(' ')[1] || f.fecha : '-';
        const esCredito = f.tipo_venta === 'credito';
        return `
          <tr class="hover:bg-slate-50 transition">
            <td class="py-2.5 px-4 font-mono font-bold text-slate-800 text-xs">${escapeHtml(f.numero_factura)}</td>
            <td class="py-2.5 px-4 text-xs text-slate-500">${hora}</td>
            <td class="py-2.5 px-4">
              <p class="font-bold text-slate-800 text-xs">${escapeHtml(f.cliente_nombre)}</p>
              <p class="text-[10px] text-slate-400 font-mono">${escapeHtml(f.cliente_cedula)}</p>
            </td>
            <td class="py-2.5 px-4">
              <span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${esCredito ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}">
                ${esCredito ? 'Crédito' : 'Contado'}
              </span>
            </td>
            <td class="py-2.5 px-4 text-right text-xs text-slate-600">$${parseFloat(f.subtotal).toFixed(2)}</td>
            <td class="py-2.5 px-4 text-right text-xs text-slate-600">$${parseFloat(f.iva_total).toFixed(2)}</td>
            <td class="py-2.5 px-4 text-right font-extrabold text-xs text-indigo-700">$${parseFloat(f.total_usd).toFixed(2)}</td>
            <td class="py-2.5 px-4 text-right text-xs text-slate-600">${parseFloat(f.total_ves).toFixed(2)} Bs.</td>
            <td class="py-2.5 px-4 text-right text-xs text-slate-600">${Math.round(f.total_cop).toLocaleString('es-CO')} COP</td>
            <td class="py-2.5 px-4 text-center">
              <button onclick="verFacturaEmitida(${f.id})" class="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold">
                <i class="fa-solid fa-receipt mr-1"></i>Ver
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  // Tabla de devoluciones del día (Restando)
  const devBody = document.getElementById('repDiaDevolucionesTableBody');
  const devoluciones = data.devoluciones || [];
  const elDevSub = document.getElementById('repDiaDevolucionesSubtitle');
  if (elDevSub) elDevSub.textContent = `${devoluciones.length} devolución(es) registrada(s)`;

  if (devBody) {
    if (devoluciones.length === 0) {
      devBody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-400 italic text-xs">No se registraron devoluciones en esta fecha (Ventas íntegras sin deducciones).</td></tr>`;
    } else {
      devBody.innerHTML = devoluciones.map(d => {
        return `
          <tr class="hover:bg-rose-50/50 transition">
            <td class="py-2.5 px-4 font-mono font-bold text-rose-800 text-xs">${escapeHtml(d.numero_devolucion)}</td>
            <td class="py-2.5 px-4 font-mono text-xs text-slate-600">${escapeHtml(d.numero_factura || 'Libre')}</td>
            <td class="py-2.5 px-4">
              <p class="font-bold text-slate-800 text-xs">${escapeHtml(d.cliente_nombre)}</p>
              <p class="text-[10px] text-slate-400 font-mono">${escapeHtml(d.cliente_cedula || '')}</p>
            </td>
            <td class="py-2.5 px-4 text-xs text-slate-600">${escapeHtml(d.motivo || 'Devolución')}</td>
            <td class="py-2.5 px-4 text-right font-extrabold text-xs text-rose-600">-$${parseFloat(d.total_usd).toFixed(2)}</td>
            <td class="py-2.5 px-4 text-right text-xs text-rose-700">-${parseFloat(d.total_ves).toFixed(2)} Bs.</td>
            <td class="py-2.5 px-4 text-right text-xs text-rose-700">-${Math.round(d.total_cop || 0).toLocaleString('es-CO')} COP</td>
            <td class="py-2.5 px-4 text-center">
              <button onclick="verComprobanteDevolucion(${d.id})" class="px-2 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg text-xs font-semibold">
                <i class="fa-solid fa-receipt mr-1"></i>Ver
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }
  }
}

// --------------------------------------------------------
// REPORTE 3: VENTAS MENSUALES
// --------------------------------------------------------
async function loadReporteVentasMensuales() {
  try {
    const res = await fetch('/api/reportes/ventas-mensuales');
    if (!res.ok) return;
    const data = await res.json();
    AppState.reportesVentasMensualesData = data;

    renderReporteVentasMensuales();
  } catch (err) {
    console.error("Error al cargar ventas mensuales:", err);
  }
}

function renderReporteVentasMensuales() {
  const data = AppState.reportesVentasMensualesData;
  if (!data) return;

  const meses = data.meses || [];
  const totalHistorico = parseFloat(data.total_historico_usd || 0);
  const totalFacturas = data.total_facturas_historico || 0;
  const promedio = meses.length > 0 ? (totalHistorico / meses.length) : 0;

  document.getElementById('repMesTotalHistoricoUsd').textContent = `$${totalHistorico.toFixed(2)}`;
  document.getElementById('repMesTotalFacturasCount').textContent = totalFacturas;
  document.getElementById('repMesPromedioUsd').textContent = `$${promedio.toFixed(2)}`;

  const tbody = document.getElementById('repMesesTableBody');
  if (!tbody) return;

  if (meses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-8 text-slate-400">No hay registros mensuales de ventas aún.</td></tr>`;
    return;
  }

  tbody.innerHTML = meses.map(m => `
    <tr class="hover:bg-slate-50 transition">
      <td class="py-3 px-4 font-mono font-bold text-slate-800 text-sm">
        <i class="fa-solid fa-calendar mr-2 text-indigo-500"></i>${m.mes}
      </td>
      <td class="py-3 px-4 text-center font-bold text-slate-700">${m.total_facturas}</td>
      <td class="py-3 px-4 text-right text-xs text-slate-600 font-medium">$${parseFloat(m.ventas_contado_usd || 0).toFixed(2)}</td>
      <td class="py-3 px-4 text-right text-xs text-amber-700 font-medium">$${parseFloat(m.ventas_credito_usd || 0).toFixed(2)}</td>
      <td class="py-3 px-4 text-right text-xs text-slate-600">$${parseFloat(m.subtotal_usd || 0).toFixed(2)}</td>
      <td class="py-3 px-4 text-right text-xs text-slate-600">$${parseFloat(m.iva_usd || 0).toFixed(2)}</td>
      <td class="py-3 px-4 text-right font-black text-indigo-800 text-sm bg-indigo-50/40">$${parseFloat(m.total_usd || 0).toFixed(2)}</td>
      <td class="py-3 px-4 text-right text-xs text-slate-600">${parseFloat(m.total_ves || 0).toLocaleString('es-VE')} Bs.</td>
      <td class="py-3 px-4 text-right text-xs text-slate-600">${Math.round(m.total_cop || 0).toLocaleString('es-CO')} COP</td>
    </tr>
  `).join('');
}

// --------------------------------------------------------
// REPORTE 4: CUENTAS POR COBRAR DETALLADAS
// --------------------------------------------------------
async function loadReporteCxc() {
  try {
    const res = await fetch('/api/reportes/cxc-detallado');
    if (!res.ok) return;
    const data = await res.json();
    AppState.reportesCxcData = data;

    const r = data.resumen || {};
    document.getElementById('repCxcTotalDeudaUsd').textContent = `$${parseFloat(r.total_deuda_usd || 0).toFixed(2)}`;
    document.getElementById('repCxcTotalDeudaBs').textContent = `≈ ${parseFloat(r.total_deuda_ves || 0).toLocaleString('es-VE')} Bs. | ${Math.round(r.total_deuda_cop || 0).toLocaleString('es-CO')} COP`;
    document.getElementById('repCxcTotalFacturadoUsd').textContent = `$${parseFloat(r.total_facturado_usd || 0).toFixed(2)}`;
    document.getElementById('repCxcTotalCobradoUsd').textContent = `$${parseFloat(r.total_cobrado_usd || 0).toFixed(2)}`;
    document.getElementById('repCxcCuentasActivas').textContent = `${r.cuentas_activas || 0} cuenta(s) activa(s)`;
    document.getElementById('repCxcCuentasVencidas').textContent = `${r.cuentas_vencidas || 0} cuenta(s) vencida(s)`;

    renderReporteCxcTabla();
  } catch (err) {
    console.error("Error al cargar reporte detallado de CXC:", err);
  }
}

function filterRepCxcEstado(estado) {
  AppState.reportesCxcFilterEstado = estado;
  ['todos', 'pendiente', 'vencida', 'pagada'].forEach(e => {
    const btn = document.getElementById(`repCxcFilter-${e}`);
    if (btn) {
      if (e === estado) {
        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white';
      } else {
        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200';
      }
    }
  });
  renderReporteCxcTabla();
}

function renderReporteCxcTabla() {
  const data = AppState.reportesCxcData;
  if (!data || !data.cuentas) return;

  const tbody = document.getElementById('repCxcTableBody');
  const tfoot = document.getElementById('repCxcTableFoot');
  if (!tbody) return;

  const q = (document.getElementById('repCxcSearchInput')?.value || '').trim().toLowerCase();
  const filtroEstado = AppState.reportesCxcFilterEstado || 'todos';

  const filtrados = data.cuentas.filter(c => {
    const diasVenc = parseInt(c.dias_vencido) || 0;
    const esVencida = c.estado !== 'pagada' && diasVenc > 0;

    let matchEstado = true;
    if (filtroEstado === 'pendiente') matchEstado = (c.estado === 'pendiente' || c.estado === 'parcial');
    else if (filtroEstado === 'vencida') matchEstado = esVencida;
    else if (filtroEstado === 'pagada') matchEstado = (c.estado === 'pagada');

    const matchSearch = !q || 
      c.cliente_nombre.toLowerCase().includes(q) || 
      c.cliente_cedula.toLowerCase().includes(q) || 
      c.numero_factura.toLowerCase().includes(q);

    return matchEstado && matchSearch;
  });

  if (filtrados.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-8 text-slate-400">No se encontraron cuentas por cobrar con estos filtros.</td></tr>`;
    if (tfoot) tfoot.innerHTML = '';
    return;
  }

  let sumFacturado = 0;
  let sumAbonado = 0;
  let sumSaldo = 0;

  tbody.innerHTML = filtrados.map(c => {
    const diasVenc = parseInt(c.dias_vencido) || 0;
    const esVencida = c.estado !== 'pagada' && diasVenc > 0;
    const saldo = parseFloat(c.saldo_pendiente || 0);
    const montoTot = parseFloat(c.monto_total || 0);
    const montoPag = parseFloat(c.monto_pagado || 0);

    sumFacturado += montoTot;
    sumAbonado += montoPag;
    sumSaldo += saldo;

    let badgeEstado = '';
    if (c.estado === 'pagada') {
      badgeEstado = `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800"><i class="fa-solid fa-check mr-1"></i>Saldada</span>`;
    } else if (esVencida) {
      badgeEstado = `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800"><i class="fa-solid fa-clock-rotate-left mr-1"></i>Vencida</span>`;
    } else if (c.estado === 'parcial') {
      badgeEstado = `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800"><i class="fa-solid fa-hourglass-half mr-1"></i>Parcial</span>`;
    } else {
      badgeEstado = `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800"><i class="fa-solid fa-clock mr-1"></i>Pendiente</span>`;
    }

    const plazoHtml = esVencida 
      ? `<span class="text-rose-600 font-bold text-xs"><i class="fa-solid fa-triangle-exclamation mr-1"></i>Vencida hace ${diasVenc} días</span>`
      : `<span class="text-slate-500 text-xs">${c.fecha_vencimiento}</span>`;

    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="py-2.5 px-4 font-mono font-bold text-slate-800 text-xs">
          <p>${escapeHtml(c.numero_factura)}</p>
          <span class="text-[10px] text-slate-400 font-sans">${formatFecha(c.fecha_emision)}</span>
        </td>
        <td class="py-2.5 px-4">
          <p class="font-bold text-slate-800 text-xs">${escapeHtml(c.cliente_nombre)}</p>
          <p class="text-[10px] text-slate-400">${escapeHtml(c.cliente_cedula)} &bull; ${escapeHtml(c.cliente_telefono || '')}</p>
        </td>
        <td class="py-2.5 px-4">${plazoHtml}</td>
        <td class="py-2.5 px-4 text-right text-xs text-slate-600 font-medium">$${montoTot.toFixed(2)}</td>
        <td class="py-2.5 px-4 text-right text-xs text-emerald-700 font-medium">$${montoPag.toFixed(2)}</td>
        <td class="py-2.5 px-4 text-right font-black text-xs text-rose-700 bg-rose-50/50">$${saldo.toFixed(2)}</td>
        <td class="py-2.5 px-4 text-right text-xs text-slate-600">${parseFloat(c.saldo_ves || 0).toLocaleString('es-VE')} Bs.</td>
        <td class="py-2.5 px-4 text-center">${badgeEstado}</td>
        <td class="py-2.5 px-4 text-right space-x-1 whitespace-nowrap">
          <button onclick="enviarRecordatorioWhatsAppCXC(${c.id})" class="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Recordar por WhatsApp">
            <i class="fa-brands fa-whatsapp text-sm"></i>
          </button>
          ${(c.estado !== 'anulada' && saldo > 0.001) ? `
            <button onclick="abrirModalAbonoCXC(${c.id})" class="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold">
              <i class="fa-solid fa-money-bill-wave mr-1"></i>Pagos
            </button>
          ` : ''}
          <button onclick="verHistorialAbonosCXC(${c.id})" class="px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-xs font-bold" title="Ver y anular pagos">
            <i class="fa-solid fa-rotate-left mr-0.5"></i>Anular Pago
          </button>
          ${c.estado !== 'anulada' ? `
            <button onclick="anularFacturaDesdeCXC(${c.factura_id}, '${escapeHtml(c.numero_factura)}')" class="px-2 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg text-xs font-bold" title="Anular Factura">
              <i class="fa-solid fa-ban mr-0.5"></i>Anular
            </button>
          ` : ''}
        </td>
      </tr>
    `;
  }).join('');

  if (tfoot) {
    tfoot.innerHTML = `
      <tr>
        <td colspan="3" class="py-3 px-4 text-right uppercase tracking-wider text-slate-500">Totales Cartera:</td>
        <td class="py-3 px-4 text-right font-black text-slate-900">$${sumFacturado.toFixed(2)}</td>
        <td class="py-3 px-4 text-right font-black text-emerald-700">$${sumAbonado.toFixed(2)}</td>
        <td class="py-3 px-4 text-right font-black text-rose-700 text-sm bg-rose-100/50">$${sumSaldo.toFixed(2)}</td>
        <td class="py-3 px-4 text-right text-slate-400" colspan="3">-</td>
      </tr>
    `;
  }
}

// --------------------------------------------------------
// REPORTE 5: CUENTAS POR PAGAR (DETALLE)
// --------------------------------------------------------
async function loadReporteCxp() {
  try {
    const res = await fetch('/api/reportes/cxp-detallado');
    if (!res.ok) return;
    const data = await res.json();
    AppState.reportesCxpData = data;

    const r = data.resumen || {};
    const elSaldo = document.getElementById('repCxpTotalSaldoUsd');
    if (elSaldo) elSaldo.textContent = `$${parseFloat(r.total_saldo_pendiente_usd || 0).toFixed(2)}`;
    const elSaldoBs = document.getElementById('repCxpTotalSaldoBs');
    if (elSaldoBs) {
      const bs = parseFloat(r.total_saldo_pendiente_ves || 0).toLocaleString('es-VE');
      const cop = Math.round(r.total_saldo_pendiente_cop || 0).toLocaleString('es-CO');
      elSaldoBs.textContent = `≈ ${bs} Bs. | ${cop} COP`;
    }
    const elPend = document.getElementById('repCxpCountPendientes');
    if (elPend) elPend.textContent = r.total_cuentas_pendientes || 0;
    const elVencUsd = document.getElementById('repCxpTotalVencidoUsd');
    if (elVencUsd) elVencUsd.textContent = `$${parseFloat(r.total_vencido_usd || 0).toFixed(2)}`;
    const elVencCount = document.getElementById('repCxpCountVencidas');
    if (elVencCount) elVencCount.textContent = `${r.total_cuentas_vencidas || 0} cuentas vencidas`;
    const elAbonado = document.getElementById('repCxpTotalAbonadoUsd');
    if (elAbonado) elAbonado.textContent = `$${parseFloat(r.total_pagado_usd || 0).toFixed(2)}`;

    renderReporteCxpTable();
  } catch (err) {
    console.error("Error cargando reporte CXP:", err);
  }
}

function setReporteCxpFilter(estado) {
  AppState.reportesCxpFilterEstado = estado;
  ['todos', 'pendientes', 'vencidas', 'pagadas'].forEach(e => {
    const btn = document.getElementById(`repCxpFilter-${e}`);
    if (btn) {
      if (e === estado) {
        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 text-white';
      } else {
        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200';
      }
    }
  });
  renderReporteCxpTable();
}

function renderReporteCxpTable() {
  const data = AppState.reportesCxpData;
  if (!data || !data.cuentas) return;

  const tbody = document.getElementById('repCxpTableBody');
  const tfoot = document.getElementById('repCxpTableFoot');
  if (!tbody) return;

  const q = (document.getElementById('repCxpSearchInput')?.value || '').trim().toLowerCase();
  const filtro = AppState.reportesCxpFilterEstado || 'todos';

  const filtrados = data.cuentas.filter(c => {
    const diasVenc = parseInt(c.dias_vencido) || 0;
    const esVencida = c.estado !== 'pagada' && diasVenc > 0;
    const esPagada = c.estado === 'pagada';
    const esPend = !esPagada && !esVencida;

    let matchEstado = true;
    if (filtro === 'pendientes') matchEstado = esPend;
    else if (filtro === 'vencidas') matchEstado = esVencida;
    else if (filtro === 'pagadas') matchEstado = esPagada;

    const matchSearch = !q || 
      (c.proveedor_nombre || '').toLowerCase().includes(q) ||
      (c.numero_factura || '').toLowerCase().includes(q) ||
      (c.descripcion_concepto || '').toLowerCase().includes(q) ||
      (c.proveedor_cedula || '').toLowerCase().includes(q);

    return matchEstado && matchSearch;
  });

  if (filtrados.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center py-8 text-slate-400">No hay cuentas por pagar en este criterio.</td></tr>`;
    if (tfoot) tfoot.innerHTML = '';
    return;
  }

  let sumTotal = 0;
  let sumPagado = 0;
  let sumSaldo = 0;

  tbody.innerHTML = filtrados.map(c => {
    const diasVenc = parseInt(c.dias_vencido) || 0;
    const esVencida = c.estado !== 'pagada' && diasVenc > 0;
    const tot = parseFloat(c.monto_total || 0);
    const pag = parseFloat(c.monto_pagado || 0);
    const sal = parseFloat(c.saldo_pendiente || 0);

    sumTotal += tot;
    sumPagado += pag;
    sumSaldo += sal;

    let badge = '';
    if (c.estado === 'pagada') {
      badge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800"><i class="fa-solid fa-check mr-1"></i>Saldada</span>`;
    } else if (esVencida) {
      badge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800"><i class="fa-solid fa-clock-rotate-left mr-1"></i>Vencida</span>`;
    } else if (c.estado === 'parcial') {
      badge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800"><i class="fa-solid fa-hourglass-half mr-1"></i>Parcial</span>`;
    } else {
      badge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800"><i class="fa-solid fa-clock mr-1"></i>Pendiente</span>`;
    }

    const vencHtml = esVencida
      ? `<span class="text-rose-600 font-bold text-xs"><i class="fa-solid fa-triangle-exclamation mr-1"></i>Vencida hace ${diasVenc} días</span>`
      : `<span class="text-slate-500 text-xs">${c.fecha_vencimiento}</span>`;

    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="py-2.5 px-4 font-mono font-bold text-slate-800 text-xs">${escapeHtml(c.numero_factura || '-')}</td>
        <td class="py-2.5 px-4">
          <p class="font-bold text-slate-800 text-xs">${escapeHtml(c.proveedor_nombre)}</p>
          <span class="text-[10px] text-slate-400 font-mono">${escapeHtml(c.proveedor_cedula || '')}</span>
        </td>
        <td class="py-2.5 px-4 text-xs text-slate-600">${escapeHtml(c.descripcion_concepto || 'Compra')}</td>
        <td class="py-2.5 px-4">${vencHtml}</td>
        <td class="py-2.5 px-4 text-right text-xs text-slate-700 font-medium">$${tot.toFixed(2)}</td>
        <td class="py-2.5 px-4 text-right text-xs text-emerald-700 font-medium">$${pag.toFixed(2)}</td>
        <td class="py-2.5 px-4 text-right font-black text-xs text-rose-700 bg-rose-50/50">$${sal.toFixed(2)}</td>
        <td class="py-2.5 px-4 text-right text-xs text-slate-600">${parseFloat(c.saldo_ves || 0).toLocaleString('es-VE')} Bs.</td>
        <td class="py-2.5 px-4 text-center">${badge}</td>
        <td class="py-2.5 px-4 text-right space-x-1 whitespace-nowrap">
          ${(c.estado !== 'anulada' && sal > 0.001) ? `
            <button onclick="abrirModalAbonoCXP(${c.id})" class="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold">
              <i class="fa-solid fa-money-bill-wave mr-1"></i>Pagos
            </button>
          ` : ''}
          <button onclick="verHistorialAbonosCXP(${c.id})" class="px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-xs font-bold" title="Ver y anular pagos">
            <i class="fa-solid fa-rotate-left mr-0.5"></i>Anular Pago
          </button>
          ${c.estado !== 'anulada' ? (c.compra_id ? `
            <button onclick="anularCompraDesdeCXP(${c.compra_id}, '${escapeHtml(c.numero_factura || '#'+c.id)}')" class="px-2 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg text-xs font-bold" title="Anular Compra">
              <i class="fa-solid fa-ban mr-0.5"></i>Anular
            </button>
          ` : `
            <button onclick="anularCuentaCXP(${c.id}, '${escapeHtml(c.numero_factura || '#'+c.id)}')" class="px-2 py-1 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded-lg text-xs font-bold" title="Anular Cuenta">
              <i class="fa-solid fa-ban mr-0.5"></i>Anular
            </button>
          `) : ''}
        </td>
      </tr>
    `;
  }).join('');

  if (tfoot) {
    tfoot.innerHTML = `
      <tr>
        <td colspan="4" class="py-3 px-4 text-right uppercase tracking-wider text-slate-500">Totales Pasivos:</td>
        <td class="py-3 px-4 text-right font-black text-slate-900">$${sumTotal.toFixed(2)}</td>
        <td class="py-3 px-4 text-right font-black text-emerald-700">$${sumPagado.toFixed(2)}</td>
        <td class="py-3 px-4 text-right font-black text-rose-700 text-sm bg-rose-100/50">$${sumSaldo.toFixed(2)}</td>
        <td class="py-3 px-4 text-right text-slate-400" colspan="3">-</td>
      </tr>
    `;
  }
}

// ========================================================
// MOTOR DE VISTA PRELIMINAR, IMPRESIÓN Y EXPORTACIÓN A PDF/EXCEL
// ========================================================
function abrirVistaPreliminarReporte() {
  const container = document.getElementById('hojaReporteImprimible');
  if (!container) return;

  const cfg = AppState.config;
  const hoyStr = new Date().toLocaleString('es-VE', { dateStyle: 'long', timeStyle: 'short' });
  const tab = AppState.reportesTabActual || 'inventario';

  let tituloReporte = '';
  let subtituloReporte = '';
  let kpisHtml = '';
  let tablaHtml = '';

  // 1. Encabezado Oficial Membretado Común
  const headerHtml = `
    <div class="border-b-2 border-slate-800 pb-4 flex justify-between items-start">
      <div>
        <h1 class="text-2xl font-black text-slate-900 uppercase tracking-wide">${escapeHtml(cfg.nombre_negocio || 'Mi Negocio Comercial')}</h1>
        <p class="text-xs text-slate-600 font-semibold font-mono">RIF / DOC: ${escapeHtml(cfg.documento_fiscal || 'J-00000000-0')}</p>
        <p class="text-xs text-slate-500">${escapeHtml(cfg.direccion || 'Dirección Comercial Principal')}</p>
        <p class="text-xs text-slate-500">Teléfono: ${escapeHtml(cfg.telefono || '+58 000 0000000')}</p>
      </div>
      <div class="text-right text-xs space-y-1">
        <span class="inline-block bg-slate-900 text-white font-bold px-3 py-1 rounded text-[11px] tracking-wider uppercase">DOCUMENTO OFICIAL</span>
        <p class="text-slate-500 mt-1"><strong>Emisión:</strong> ${hoyStr}</p>
        <p class="text-slate-500"><strong>Tasas del día:</strong> BCV ${parseFloat(cfg.tasa_ves || 0).toFixed(2)} Bs. | TRM ${Math.round(cfg.tasa_cop || 0).toLocaleString('es-CO')} COP</p>
      </div>
    </div>
  `;

  if (tab === 'inventario') {
    const data = AppState.reportesInventarioData;
    const r = data?.resumen || {};
    tituloReporte = 'REPORTE GENERAL DE VALORACIÓN DE INVENTARIO';
    subtituloReporte = 'Catálogo consolidado de productos y servicios con costo, precio de venta y margen proyectado.';

    kpisHtml = `
      <div class="grid grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-300 text-center text-xs">
        <div>
          <p class="text-slate-500 uppercase text-[10px] font-bold">Costo Inventario</p>
          <strong class="text-slate-900 text-base font-black">$${parseFloat(r.total_costo_inventario_usd || 0).toFixed(2)}</strong>
        </div>
        <div>
          <p class="text-slate-500 uppercase text-[10px] font-bold">Valor Estimado Venta</p>
          <strong class="text-emerald-700 text-base font-black">$${parseFloat(r.total_venta_estimada_usd || 0).toFixed(2)}</strong>
        </div>
        <div>
          <p class="text-slate-500 uppercase text-[10px] font-bold">Ganancia Proyectada</p>
          <strong class="text-indigo-700 text-base font-black">$${parseFloat(r.ganancia_estimada_usd || 0).toFixed(2)}</strong>
        </div>
        <div>
          <p class="text-slate-500 uppercase text-[10px] font-bold">Total Unidades Físicas</p>
          <strong class="text-slate-800 text-base font-black">${r.total_unidades_stock || 0}</strong>
        </div>
      </div>
    `;

    const items = data?.items || [];
    tablaHtml = `
      <table class="w-full text-left text-xs border border-slate-300">
        <thead class="bg-slate-100 border-b border-slate-300 font-bold uppercase text-[10px] text-slate-700">
          <tr>
            <th class="p-2">Código</th>
            <th class="p-2">Descripción del Ítem</th>
            <th class="p-2">Categoría</th>
            <th class="p-2 text-center">Tipo</th>
            <th class="p-2 text-right">Existencia</th>
            <th class="p-2 text-right">Costo Unit.</th>
            <th class="p-2 text-right">Costo Total</th>
            <th class="p-2 text-right">Precio Venta</th>
            <th class="p-2 text-right">Valor Venta Total</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          ${items.map(i => `
            <tr>
              <td class="p-2 font-mono">${escapeHtml(i.codigo || '-')}</td>
              <td class="p-2 font-semibold text-slate-900">${escapeHtml(i.nombre)}</td>
              <td class="p-2 text-slate-600">${escapeHtml(i.categoria_nombre)}</td>
              <td class="p-2 text-center uppercase text-[10px]">${i.tipo}</td>
              <td class="p-2 text-right font-bold">${i.tipo === 'producto' ? i.stock : '-'}</td>
              <td class="p-2 text-right">$${parseFloat(i.costo || 0).toFixed(2)}</td>
              <td class="p-2 text-right font-bold">$${parseFloat(i.costo_total_stock || 0).toFixed(2)}</td>
              <td class="p-2 text-right">$${parseFloat(i.precio || 0).toFixed(2)}</td>
              <td class="p-2 text-right font-bold text-slate-900">$${parseFloat(i.valor_venta_stock || 0).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot class="bg-slate-100 font-bold border-t-2 border-slate-400">
          <tr>
            <td colspan="4" class="p-2 text-right uppercase">Totales:</td>
            <td class="p-2 text-right">${r.total_unidades_stock || 0}</td>
            <td class="p-2 text-right">-</td>
            <td class="p-2 text-right font-black">$${parseFloat(r.total_costo_inventario_usd || 0).toFixed(2)}</td>
            <td class="p-2 text-right">-</td>
            <td class="p-2 text-right font-black">$${parseFloat(r.total_venta_estimada_usd || 0).toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    `;
  } else if (tab === 'diarias') {
    const data = AppState.reportesVentasDiariasData;
    const r = data?.resumen || {};
    tituloReporte = `REPORTE DE VENTAS DIARIAS (${data?.fecha || hoyStr})`;
    subtituloReporte = 'Desglose detallado de ventas por facturación y monedas recibidas (USD, Bolívares y Pesos).';

    kpisHtml = `
      <div class="grid grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-300 text-center text-xs">
        <div>
          <p class="text-slate-500 uppercase text-[10px] font-bold">Total Facturado USD</p>
          <strong class="text-emerald-700 text-base font-black">$${parseFloat(r.total_ventas_usd || 0).toFixed(2)}</strong>
        </div>
        <div>
          <p class="text-slate-500 uppercase text-[10px] font-bold">Efectivo / Divisas USD</p>
          <strong class="text-slate-900 text-base font-bold">$${parseFloat(r.total_usd_recibido || 0).toFixed(2)}</strong>
        </div>
        <div>
          <p class="text-slate-500 uppercase text-[10px] font-bold">Bolívares (VES)</p>
          <strong class="text-amber-800 text-base font-bold">${parseFloat(r.total_ves_recibido || 0).toLocaleString('es-VE')} Bs.</strong>
        </div>
        <div>
          <p class="text-slate-500 uppercase text-[10px] font-bold">Pesos (COP)</p>
          <strong class="text-blue-800 text-base font-bold">${Math.round(r.total_cop_recibido || 0).toLocaleString('es-CO')} COP</strong>
        </div>
      </div>
    `;

    const facturas = data?.facturas || [];
    tablaHtml = `
      <table class="w-full text-left text-xs border border-slate-300">
        <thead class="bg-slate-100 border-b border-slate-300 font-bold uppercase text-[10px] text-slate-700">
          <tr>
            <th class="p-2">N° Factura</th>
            <th class="p-2">Hora</th>
            <th class="p-2">Cliente</th>
            <th class="p-2">Condición</th>
            <th class="p-2 text-right">Total ($ USD)</th>
            <th class="p-2 text-right">Equiv. Bs.</th>
            <th class="p-2 text-right">Equiv. COP</th>
            <th class="p-2">Desglose de Pagos</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          ${facturas.map(f => `
            <tr>
              <td class="p-2 font-mono font-bold">${escapeHtml(f.numero_factura)}</td>
              <td class="p-2 text-slate-500">${formatFecha(f.fecha)}</td>
              <td class="p-2 font-semibold">${escapeHtml(f.cliente_nombre)}</td>
              <td class="p-2 uppercase text-[10px] font-bold ${f.tipo_venta === 'credito' ? 'text-amber-700' : 'text-emerald-700'}">${f.tipo_venta}</td>
              <td class="p-2 text-right font-black">$${parseFloat(f.total_usd).toFixed(2)}</td>
              <td class="p-2 text-right">${parseFloat(f.total_ves).toLocaleString('es-VE')} Bs.</td>
              <td class="p-2 text-right">${Math.round(f.total_cop).toLocaleString('es-CO')} COP</td>
              <td class="p-2 text-[10px] text-slate-600">
                ${(f.pagos || []).map(p => `${p.metodo}: ${parseFloat(p.monto_moneda).toLocaleString('es-VE')} ${p.moneda}`).join(' | ') || (f.tipo_venta === 'credito' ? 'Crédito' : '-')}
              </td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot class="bg-slate-100 font-bold border-t-2 border-slate-400">
          <tr>
            <td colspan="4" class="p-2 text-right uppercase">Total del Día:</td>
            <td class="p-2 text-right font-black text-emerald-800">$${parseFloat(r.total_ventas_usd || 0).toFixed(2)}</td>
            <td class="p-2 text-right">${(parseFloat(r.total_ventas_usd || 0) * (cfg.tasa_ves || 1)).toLocaleString('es-VE')} Bs.</td>
            <td class="p-2 text-right">${Math.round(parseFloat(r.total_ventas_usd || 0) * (cfg.tasa_cop || 1)).toLocaleString('es-CO')} COP</td>
            <td class="p-2">-</td>
          </tr>
        </tfoot>
      </table>
    `;
  } else if (tab === 'mensuales') {
    const data = AppState.reportesVentasMensualesData;
    const r = data?.resumen || {};
    tituloReporte = `REPORTE CONSOLIDADO MENSUAL DE VENTAS (${data?.anio || new Date().getFullYear()})`;
    subtituloReporte = 'Evolución mensual de facturación, volumen de transacciones y comparativo histórico.';

    kpisHtml = `
      <div class="grid grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-300 text-center text-xs">
        <div>
          <p class="text-slate-500 uppercase text-[10px] font-bold">Total Facturado en el Año</p>
          <strong class="text-indigo-700 text-base font-black">$${parseFloat(r.total_facturado_usd || 0).toFixed(2)}</strong>
        </div>
        <div>
          <p class="text-slate-500 uppercase text-[10px] font-bold">Total Facturas Emitidas</p>
          <strong class="text-slate-800 text-base font-black">${r.total_facturas_emitidas || 0}</strong>
        </div>
        <div>
          <p class="text-slate-500 uppercase text-[10px] font-bold">Ticket Promedio Venta</p>
          <strong class="text-emerald-700 text-base font-black">$${parseFloat(r.ticket_promedio_usd || 0).toFixed(2)}</strong>
        </div>
      </div>
    `;

    const meses = data?.meses || [];
    tablaHtml = `
      <table class="w-full text-left text-xs border border-slate-300">
        <thead class="bg-slate-100 border-b border-slate-300 font-bold uppercase text-[10px] text-slate-700">
          <tr>
            <th class="p-2">Mes</th>
            <th class="p-2 text-right">N° Facturas</th>
            <th class="p-2 text-right">Total USD</th>
            <th class="p-2 text-right">Equivalente Bolívares (VES)</th>
            <th class="p-2 text-right">Equivalente Pesos (COP)</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          ${meses.map(m => `
            <tr>
              <td class="p-2 font-bold">${escapeHtml(m.nombre_mes)}</td>
              <td class="p-2 text-right font-semibold">${m.total_facturas}</td>
              <td class="p-2 text-right font-black text-indigo-900">$${parseFloat(m.total_usd).toFixed(2)}</td>
              <td class="p-2 text-right">${parseFloat(m.total_ves).toLocaleString('es-VE')} Bs.</td>
              <td class="p-2 text-right">${Math.round(m.total_cop).toLocaleString('es-CO')} COP</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot class="bg-slate-100 font-bold border-t-2 border-slate-400">
          <tr>
            <td class="p-2 uppercase">Total Anual:</td>
            <td class="p-2 text-right">${r.total_facturas_emitidas || 0}</td>
            <td class="p-2 text-right font-black">$${parseFloat(r.total_facturado_usd || 0).toFixed(2)}</td>
            <td class="p-2 text-right">-</td>
            <td class="p-2 text-right">-</td>
          </tr>
        </tfoot>
      </table>
    `;
  } else if (tab === 'cxc') {
    const data = AppState.reportesCxcData;
    const r = data?.resumen || {};
    tituloReporte = 'ESTADO DE CUENTAS POR COBRAR (CARTERA DE CLIENTES)';
    subtituloReporte = 'Detalle de facturas emitidas a crédito, amortizaciones y saldos pendientes por cobrar.';

    kpisHtml = `
      <div class="grid grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-300 text-center text-xs">
        <div>
          <p class="text-slate-500 uppercase text-[10px] font-bold">Cartera Total Saldo</p>
          <strong class="text-rose-700 text-base font-black">$${parseFloat(r.total_saldo_pendiente_usd || 0).toFixed(2)}</strong>
        </div>
        <div>
          <p class="text-slate-500 uppercase text-[10px] font-bold">Cuentas Pendientes</p>
          <strong class="text-slate-800 text-base font-black">${r.total_cuentas_pendientes || 0}</strong>
        </div>
        <div>
          <p class="text-slate-500 uppercase text-[10px] font-bold">Mora / Deuda Vencida</p>
          <strong class="text-rose-600 text-base font-black">$${parseFloat(r.total_vencido_usd || 0).toFixed(2)} (${r.total_cuentas_vencidas || 0})</strong>
        </div>
        <div>
          <p class="text-slate-500 uppercase text-[10px] font-bold">Total Cobrado / Abonado</p>
          <strong class="text-emerald-700 text-base font-black">$${parseFloat(r.total_abonado_usd || 0).toFixed(2)}</strong>
        </div>
      </div>
    `;

    const cuentas = data?.cuentas || [];
    tablaHtml = `
      <table class="w-full text-left text-xs border border-slate-300">
        <thead class="bg-slate-100 border-b border-slate-300 font-bold uppercase text-[10px] text-slate-700">
          <tr>
            <th class="p-2">Factura</th>
            <th class="p-2">Cliente</th>
            <th class="p-2">Emisión</th>
            <th class="p-2">Vencimiento</th>
            <th class="p-2 text-right">Total ($)</th>
            <th class="p-2 text-right">Abonado ($)</th>
            <th class="p-2 text-right">Saldo Deudor ($)</th>
            <th class="p-2 text-right">Saldo en Bs.</th>
            <th class="p-2 text-center">Estado</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          ${cuentas.map(c => `
            <tr>
              <td class="p-2 font-mono font-bold">${escapeHtml(c.numero_factura)}</td>
              <td class="p-2 font-semibold">${escapeHtml(c.cliente_nombre)} (${escapeHtml(c.cliente_cedula)})</td>
              <td class="p-2 text-slate-500">${formatFecha(c.fecha_emision)}</td>
              <td class="p-2 ${parseInt(c.dias_vencido) > 0 ? 'text-rose-600 font-bold' : ''}">${c.fecha_vencimiento}</td>
              <td class="p-2 text-right">$${parseFloat(c.monto_total).toFixed(2)}</td>
              <td class="p-2 text-right text-emerald-700 font-medium">$${parseFloat(c.monto_pagado).toFixed(2)}</td>
              <td class="p-2 text-right font-black text-rose-700">$${parseFloat(c.saldo_pendiente).toFixed(2)}</td>
              <td class="p-2 text-right">${parseFloat(c.saldo_ves || 0).toLocaleString('es-VE')} Bs.</td>
              <td class="p-2 text-center uppercase text-[10px] font-bold">${c.estado}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot class="bg-slate-100 font-bold border-t-2 border-slate-400">
          <tr>
            <td colspan="4" class="p-2 text-right uppercase">Total Cartera:</td>
            <td class="p-2 text-right font-black">$${cuentas.reduce((a,c)=>a+parseFloat(c.monto_total||0),0).toFixed(2)}</td>
            <td class="p-2 text-right font-black text-emerald-700">$${cuentas.reduce((a,c)=>a+parseFloat(c.monto_pagado||0),0).toFixed(2)}</td>
            <td class="p-2 text-right font-black text-rose-700">$${parseFloat(r.total_saldo_pendiente_usd || 0).toFixed(2)}</td>
            <td class="p-2 text-right font-black">${parseFloat(r.total_saldo_pendiente_ves || 0).toLocaleString('es-VE')} Bs.</td>
            <td class="p-2">-</td>
          </tr>
        </tfoot>
      </table>
    `;
  } else if (tab === 'cxp') {
    const data = AppState.reportesCxpData;
    const r = data?.resumen || {};
    tituloReporte = 'ESTADO DE CUENTAS POR PAGAR (PASIVOS & PROVEEDORES)';
    subtituloReporte = 'Detalle de compras a crédito y gastos directos pendientes de pago con proveedores.';

    kpisHtml = `
      <div class="grid grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-300 text-center text-xs">
        <div>
          <p class="text-slate-500 uppercase text-[10px] font-bold">Pasivo Total Pendiente</p>
          <strong class="text-rose-700 text-base font-black">$${parseFloat(r.total_saldo_pendiente_usd || 0).toFixed(2)}</strong>
        </div>
        <div>
          <p class="text-slate-500 uppercase text-[10px] font-bold">Cuentas por Pagar</p>
          <strong class="text-slate-800 text-base font-black">${r.total_cuentas_pendientes || 0}</strong>
        </div>
        <div>
          <p class="text-slate-500 uppercase text-[10px] font-bold">Deuda Vencida (Mora)</p>
          <strong class="text-rose-600 text-base font-black">$${parseFloat(r.total_vencido_usd || 0).toFixed(2)} (${r.total_cuentas_vencidas || 0})</strong>
        </div>
        <div>
          <p class="text-slate-500 uppercase text-[10px] font-bold">Total Pagado a la Fecha</p>
          <strong class="text-emerald-700 text-base font-black">$${parseFloat(r.total_pagado_usd || 0).toFixed(2)}</strong>
        </div>
      </div>
    `;

    const cuentas = data?.cuentas || [];
    tablaHtml = `
      <table class="w-full text-left text-xs border border-slate-300">
        <thead class="bg-slate-100 border-b border-slate-300 font-bold uppercase text-[10px] text-slate-700">
          <tr>
            <th class="p-2">Factura / Control</th>
            <th class="p-2">Proveedor</th>
            <th class="p-2">Concepto</th>
            <th class="p-2">Vencimiento</th>
            <th class="p-2 text-right">Monto Total ($)</th>
            <th class="p-2 text-right">Pagado ($)</th>
            <th class="p-2 text-right">Saldo Deudor ($)</th>
            <th class="p-2 text-right">Saldo en Bs.</th>
            <th class="p-2 text-center">Estado</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          ${cuentas.map(c => `
            <tr>
              <td class="p-2 font-mono font-bold">${escapeHtml(c.numero_factura || '-')}</td>
              <td class="p-2 font-semibold">${escapeHtml(c.proveedor_nombre)} (${escapeHtml(c.proveedor_cedula || '')})</td>
              <td class="p-2 text-slate-600">${escapeHtml(c.descripcion_concepto || 'Compra')}</td>
              <td class="p-2 ${parseInt(c.dias_vencido) > 0 ? 'text-rose-600 font-bold' : ''}">${c.fecha_vencimiento}</td>
              <td class="p-2 text-right font-medium">$${parseFloat(c.monto_total).toFixed(2)}</td>
              <td class="p-2 text-right text-emerald-700 font-medium">$${parseFloat(c.monto_pagado).toFixed(2)}</td>
              <td class="p-2 text-right font-black text-rose-700">$${parseFloat(c.saldo_pendiente).toFixed(2)}</td>
              <td class="p-2 text-right">${parseFloat(c.saldo_ves || 0).toLocaleString('es-VE')} Bs.</td>
              <td class="p-2 text-center uppercase text-[10px] font-bold">${c.estado}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot class="bg-slate-100 font-bold border-t-2 border-slate-400">
          <tr>
            <td colspan="4" class="p-2 text-right uppercase">Total Pasivos:</td>
            <td class="p-2 text-right font-black">$${cuentas.reduce((a,c)=>a+parseFloat(c.monto_total||0),0).toFixed(2)}</td>
            <td class="p-2 text-right font-black text-emerald-700">$${cuentas.reduce((a,c)=>a+parseFloat(c.monto_pagado||0),0).toFixed(2)}</td>
            <td class="p-2 text-right font-black text-rose-700">$${parseFloat(r.total_saldo_pendiente_usd || 0).toFixed(2)}</td>
            <td class="p-2 text-right font-black">${parseFloat(r.total_saldo_pendiente_ves || 0).toLocaleString('es-VE')} Bs.</td>
            <td class="p-2">-</td>
          </tr>
        </tfoot>
      </table>
    `;
  } else if (tab === 'kardex') {
    const data = AppState.reportesKardexData;
    const p = data?.producto || {};
    const r = data?.resumen || {};
    tituloReporte = `KARDEX DE INVENTARIO: ${p.codigo || ''} - ${p.nombre || ''}`;
    subtituloReporte = `Categoría: ${p.categoria_nombre || 'General'} | Costo Unitario: $${parseFloat(p.costo || 0).toFixed(2)} | Precio Venta: $${parseFloat(p.precio_total || p.precio || 0).toFixed(2)}`;

    kpisHtml = `
      <div class="grid grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-300 text-center text-xs">
        <div>
          <p class="text-slate-500 uppercase text-[10px] font-bold">Stock Inicial</p>
          <strong class="text-slate-800 text-base font-black">${r.stock_inicial || 0}</strong>
        </div>
        <div>
          <p class="text-emerald-700 uppercase text-[10px] font-bold">Total Entradas</p>
          <strong class="text-emerald-700 text-base font-black">${r.total_entradas || 0} ($${parseFloat(r.valor_entradas || 0).toFixed(2)})</strong>
        </div>
        <div>
          <p class="text-rose-700 uppercase text-[10px] font-bold">Total Salidas</p>
          <strong class="text-rose-700 text-base font-black">${r.total_salidas || 0} ($${parseFloat(r.valor_salidas || 0).toFixed(2)})</strong>
        </div>
        <div>
          <p class="text-cyan-800 uppercase text-[10px] font-bold">Existencia Actual</p>
          <strong class="text-cyan-800 text-base font-black">${r.stock_actual || 0} ($${parseFloat(r.valor_total_actual || 0).toFixed(2)})</strong>
        </div>
      </div>
    `;

    const movs = data?.movimientos || [];
    tablaHtml = `
      <table class="w-full text-left text-xs border border-slate-300">
        <thead class="bg-slate-100 border-b border-slate-300 font-bold uppercase text-[10px] text-slate-700">
          <tr>
            <th class="p-2">Fecha</th>
            <th class="p-2">Tipo</th>
            <th class="p-2">Documento / Ref</th>
            <th class="p-2">Tercero</th>
            <th class="p-2">Concepto</th>
            <th class="p-2 text-right">Entrada Cant.</th>
            <th class="p-2 text-right">Entrada Total</th>
            <th class="p-2 text-right">Salida Cant.</th>
            <th class="p-2 text-right">Salida Total</th>
            <th class="p-2 text-right font-black">Stock Saldo</th>
            <th class="p-2 text-right font-black">Saldo Total ($)</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          ${movs.map(m => `
            <tr>
              <td class="p-2 font-mono">${formatFecha(m.fecha)}</td>
              <td class="p-2 font-bold">${m.tipo_movimiento}</td>
              <td class="p-2 font-mono">${escapeHtml(m.documento)}</td>
              <td class="p-2">${escapeHtml(m.tercero || '-')}</td>
              <td class="p-2 text-slate-500">${escapeHtml(m.concepto || '-')}</td>
              <td class="p-2 text-right font-semibold text-emerald-700">${m.entrada_cant > 0 ? m.entrada_cant : '-'}</td>
              <td class="p-2 text-right text-emerald-800">${m.entrada_cant > 0 ? '$' + parseFloat(m.entrada_total).toFixed(2) : '-'}</td>
              <td class="p-2 text-right font-semibold text-rose-700">${m.salida_cant > 0 ? m.salida_cant : '-'}</td>
              <td class="p-2 text-right text-rose-800">${m.salida_cant > 0 ? '$' + parseFloat(m.salida_total).toFixed(2) : '-'}</td>
              <td class="p-2 text-right font-black">${m.saldo_cant}</td>
              <td class="p-2 text-right font-black">$${parseFloat(m.saldo_total || 0).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } else if (tab === 'inv_simple') {
    const data = AppState.reportesInvSimpleData?.productos || [];
    tituloReporte = 'INFORME SIMPLIFICADO DE STOCK Y EXISTENCIAS';
    subtituloReporte = 'Reporte operativo de almacén con código, descripción, categoría y cantidad actual disponible.';

    const totalStock = data.reduce((a, b) => a + parseFloat(b.stock || 0), 0);
    kpisHtml = `
      <div class="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-300 text-center text-xs">
        <div>
          <p class="text-slate-500 uppercase text-[10px] font-bold">Total Ítems en Catálogo</p>
          <strong class="text-slate-900 text-base font-black">${data.length}</strong>
        </div>
        <div>
          <p class="text-emerald-700 uppercase text-[10px] font-bold">Total Unidades Físicas en Stock</p>
          <strong class="text-emerald-700 text-base font-black">${totalStock}</strong>
        </div>
      </div>
    `;

    tablaHtml = `
      <table class="w-full text-left text-xs border border-slate-300">
        <thead class="bg-slate-100 border-b border-slate-300 font-bold uppercase text-[10px] text-slate-700">
          <tr>
            <th class="p-2 w-32">Código del Ítem</th>
            <th class="p-2">Nombre del Ítem / Descripción</th>
            <th class="p-2 w-48">Categoría</th>
            <th class="p-2 w-36 text-right font-black">Cantidad Actual (Stock)</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          ${data.map(p => `
            <tr>
              <td class="p-2 font-mono font-bold">${escapeHtml(p.codigo)}</td>
              <td class="p-2 font-medium text-slate-900">${escapeHtml(p.nombre)}</td>
              <td class="p-2 text-slate-500">${escapeHtml(p.categoria_nombre || '-')}</td>
              <td class="p-2 text-right font-black text-sm text-slate-950">${p.stock}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot class="bg-slate-100 font-bold border-t-2 border-slate-400">
          <tr>
            <td colspan="3" class="p-2 text-right uppercase">Total Unidades Físicas:</td>
            <td class="p-2 text-right font-black text-sm">${totalStock}</td>
          </tr>
        </tfoot>
      </table>
    `;
  } else if (tab === 'libro_ventas') {
    const data = AppState.reportesLibroVentasSeniat;
    const r = data?.resumen || {};
    const emp = data?.empresa || {};
    tituloReporte = `LIBRO DE VENTAS (NORMATIVA SENIAT - VENEZUELA)`;
    subtituloReporte = `Contribuyente: ${emp.nombre || AppState.config.nombre_negocio} | RIF: ${emp.rif || AppState.config.documento_fiscal} | Período: ${data?.mes || ''}/${data?.anio || ''} | Tasa BCV: ${parseFloat(data?.tasa_bcv_cierre || 0).toFixed(2)} Bs.`;

    kpisHtml = `
      <div class="grid grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-300 text-center text-xs">
        <div>
          <p class="text-slate-500 uppercase text-[10px] font-bold">Total Ventas (Bs.)</p>
          <strong class="text-slate-900 text-sm font-black">${parseFloat(r.total_ventas_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})} Bs.</strong>
          <span class="block text-[10px] text-slate-400">($${parseFloat(r.total_ventas_usd || 0).toFixed(2)})</span>
        </div>
        <div>
          <p class="text-indigo-700 uppercase text-[10px] font-bold">Base Imponible (16%)</p>
          <strong class="text-indigo-700 text-sm font-black">${parseFloat(r.total_base_imponible_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})} Bs.</strong>
          <span class="block text-[10px] text-slate-400">($${parseFloat(r.total_base_imponible_usd || 0).toFixed(2)})</span>
        </div>
        <div>
          <p class="text-rose-700 uppercase text-[10px] font-bold">Débito Fiscal IVA (16%)</p>
          <strong class="text-rose-700 text-sm font-black">${parseFloat(r.total_iva_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})} Bs.</strong>
          <span class="block text-[10px] text-slate-400">($${parseFloat(r.total_iva_usd || 0).toFixed(2)})</span>
        </div>
        <div>
          <p class="text-slate-500 uppercase text-[10px] font-bold">Ventas Exentas</p>
          <strong class="text-slate-700 text-sm font-black">${parseFloat(r.total_exento_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})} Bs.</strong>
          <span class="block text-[10px] text-slate-400">($${parseFloat(r.total_exento_usd || 0).toFixed(2)})</span>
        </div>
      </div>
    `;

    const items = data?.items || [];
    tablaHtml = `
      <table class="w-full text-left text-[11px] border border-slate-300">
        <thead class="bg-slate-100 border-b border-slate-300 font-bold uppercase text-[9px] text-slate-700">
          <tr>
            <th class="p-1 text-center">N° Op.</th>
            <th class="p-1">Fecha</th>
            <th class="p-1">RIF/Cédula</th>
            <th class="p-1">Nombre / Razón Social</th>
            <th class="p-1">N° Factura</th>
            <th class="p-1">N° Control</th>
            <th class="p-1">N° NC</th>
            <th class="p-1">Fact. Afectada</th>
            <th class="p-1 text-center">Tipo</th>
            <th class="p-1 text-right">Total Ventas Bs.</th>
            <th class="p-1 text-right">Exento Bs.</th>
            <th class="p-1 text-right">Base Imponible</th>
            <th class="p-1 text-right">IVA (16%)</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          ${items.map(i => `
            <tr class="${i.es_devolucion ? 'text-rose-700 bg-rose-50/40' : ''}">
              <td class="p-1 text-center font-mono">${i.operacion_nro}</td>
              <td class="p-1 font-mono">${i.fecha}</td>
              <td class="p-1 font-mono">${escapeHtml(i.cliente_rif)}</td>
              <td class="p-1">${escapeHtml(i.cliente_nombre)}</td>
              <td class="p-1 font-mono font-bold">${escapeHtml(i.numero_factura || '-')}</td>
              <td class="p-1 font-mono">${escapeHtml(i.numero_control || '-')}</td>
              <td class="p-1 font-mono">${escapeHtml(i.numero_nota_credito || '-')}</td>
              <td class="p-1 font-mono">${escapeHtml(i.factura_afectada || '-')}</td>
              <td class="p-1 text-center font-bold">${i.tipo_transaccion}</td>
              <td class="p-1 text-right font-black">${parseFloat(i.total_ventas_ves).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
              <td class="p-1 text-right">${parseFloat(i.ventas_exentas_ves).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
              <td class="p-1 text-right font-semibold">${parseFloat(i.base_imponible_ves).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
              <td class="p-1 text-right font-bold">${parseFloat(i.iva_debito_ves).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot class="bg-slate-100 font-bold border-t-2 border-slate-400">
          <tr>
            <td colspan="9" class="p-1.5 text-right uppercase">TOTALES GENERALES SENIAT:</td>
            <td class="p-1.5 text-right font-black">${parseFloat(r.total_ventas_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
            <td class="p-1.5 text-right font-semibold">${parseFloat(r.total_exento_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
            <td class="p-1.5 text-right font-bold">${parseFloat(r.total_base_imponible_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
            <td class="p-1.5 text-right font-black text-rose-700">${parseFloat(r.total_iva_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
          </tr>
        </tfoot>
      </table>
    `;
  } else if (tab === 'libro_compras') {
    const data = AppState.reportesLibroComprasSeniat;
    const r = data?.resumen || {};
    const emp = data?.empresa || {};
    tituloReporte = `LIBRO DE COMPRAS (NORMATIVA SENIAT - VENEZUELA)`;
    subtituloReporte = `Contribuyente: ${emp.nombre || AppState.config.nombre_negocio} | RIF: ${emp.rif || AppState.config.documento_fiscal} | Período: ${data?.mes || ''}/${data?.anio || ''} | Tasa BCV: ${parseFloat(data?.tasa_bcv_cierre || 0).toFixed(2)} Bs.`;

    kpisHtml = `
      <div class="grid grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-300 text-center text-xs">
        <div>
          <p class="text-slate-500 uppercase text-[10px] font-bold">Total Compras (Bs.)</p>
          <strong class="text-slate-900 text-sm font-black">${parseFloat(r.total_compras_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})} Bs.</strong>
          <span class="block text-[10px] text-slate-400">($${parseFloat(r.total_ventas_usd || 0).toFixed(2)})</span>
        </div>
        <div>
          <p class="text-indigo-700 uppercase text-[10px] font-bold">Base Imponible (16%)</p>
          <strong class="text-indigo-700 text-sm font-black">${parseFloat(r.total_base_imponible_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})} Bs.</strong>
          <span class="block text-[10px] text-slate-400">($${parseFloat(r.total_base_imponible_usd || 0).toFixed(2)})</span>
        </div>
        <div>
          <p class="text-emerald-700 uppercase text-[10px] font-bold">Crédito Fiscal IVA (16%)</p>
          <strong class="text-emerald-700 text-sm font-black">${parseFloat(r.total_iva_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})} Bs.</strong>
          <span class="block text-[10px] text-slate-400">($${parseFloat(r.total_iva_usd || 0).toFixed(2)})</span>
        </div>
        <div>
          <p class="text-slate-500 uppercase text-[10px] font-bold">Compras Exentas</p>
          <strong class="text-slate-700 text-sm font-black">${parseFloat(r.total_exento_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})} Bs.</strong>
          <span class="block text-[10px] text-slate-400">($${parseFloat(r.total_exento_usd || 0).toFixed(2)})</span>
        </div>
      </div>
    `;

    const items = data?.items || [];
    tablaHtml = `
      <table class="w-full text-left text-[11px] border border-slate-300">
        <thead class="bg-slate-100 border-b border-slate-300 font-bold uppercase text-[9px] text-slate-700">
          <tr>
            <th class="p-1 text-center">N° Op.</th>
            <th class="p-1">Fecha</th>
            <th class="p-1">RIF Proveedor</th>
            <th class="p-1">Nombre / Razón Social</th>
            <th class="p-1">N° Factura</th>
            <th class="p-1">N° Control</th>
            <th class="p-1">N° ND/NC</th>
            <th class="p-1">Fact. Afectada</th>
            <th class="p-1 text-center">Tipo</th>
            <th class="p-1 text-right">Total Compras Bs.</th>
            <th class="p-1 text-right">Exento Bs.</th>
            <th class="p-1 text-right">Base Imponible</th>
            <th class="p-1 text-right">IVA (16%)</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          ${items.map(i => `
            <tr>
              <td class="p-1 text-center font-mono">${i.operacion_nro}</td>
              <td class="p-1 font-mono">${i.fecha}</td>
              <td class="p-1 font-mono font-semibold">${escapeHtml(i.proveedor_rif)}</td>
              <td class="p-1">${escapeHtml(i.proveedor_nombre)}</td>
              <td class="p-1 font-mono font-bold">${escapeHtml(i.numero_factura || '-')}</td>
              <td class="p-1 font-mono">${escapeHtml(i.numero_control || '-')}</td>
              <td class="p-1 font-mono text-slate-400">${escapeHtml(i.numero_nota_deb_cred || '-')}</td>
              <td class="p-1 font-mono text-slate-400">${escapeHtml(i.factura_afectada || '-')}</td>
              <td class="p-1 text-center font-bold">${i.tipo_transaccion}</td>
              <td class="p-1 text-right font-black">${parseFloat(i.total_compras_ves).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
              <td class="p-1 text-right">${parseFloat(i.compras_exentas_ves).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
              <td class="p-1 text-right font-semibold">${parseFloat(i.base_imponible_ves).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
              <td class="p-1 text-right font-bold text-emerald-700">${parseFloat(i.iva_credito_ves).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot class="bg-slate-100 font-bold border-t-2 border-slate-400">
          <tr>
            <td colspan="9" class="p-1.5 text-right uppercase">TOTALES GENERALES SENIAT:</td>
            <td class="p-1.5 text-right font-black">${parseFloat(r.total_compras_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
            <td class="p-1.5 text-right font-semibold">${parseFloat(r.total_exento_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
            <td class="p-1.5 text-right font-bold">${parseFloat(r.total_base_imponible_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
            <td class="p-1.5 text-right font-black text-emerald-800">${parseFloat(r.total_iva_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
          </tr>
        </tfoot>
      </table>
    `;
  } else if (tab === 'art177') {
    const data = AppState.reportesArt177Data;
    const r = data?.resumen || {};
    tituloReporte = `LIBRO DE INVENTARIO DE MERCANCÍAS (ARTÍCULO 177 R-LISLR)`;
    subtituloReporte = `Registro detallado mensual de entradas y salidas de mercancías en unidades físicas y valores monetarios | Período: ${data?.periodo || ''} | Tasa BCV: ${parseFloat(data?.tasa_bcv || 0).toFixed(2)} Bs.`;

    kpisHtml = `
      <div class="grid grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-300 text-center text-xs">
        <div>
          <p class="text-slate-500 uppercase text-[10px] font-bold">Inventario Inicial</p>
          <strong class="text-slate-900 text-sm font-black">${parseFloat(r.total_inicial_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})} Bs.</strong>
          <span class="block text-[10px] text-slate-400">($${parseFloat(r.total_inicial_usd || 0).toFixed(2)})</span>
        </div>
        <div>
          <p class="text-emerald-700 uppercase text-[10px] font-bold">Entradas del Mes</p>
          <strong class="text-emerald-700 text-sm font-black">${parseFloat(r.total_entradas_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})} Bs.</strong>
          <span class="block text-[10px] text-slate-400">($${parseFloat(r.total_entradas_usd || 0).toFixed(2)})</span>
        </div>
        <div>
          <p class="text-rose-700 uppercase text-[10px] font-bold">Salidas del Mes</p>
          <strong class="text-rose-700 text-sm font-black">${parseFloat(r.total_salidas_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})} Bs.</strong>
          <span class="block text-[10px] text-slate-400">($${parseFloat(r.total_salidas_usd || 0).toFixed(2)})</span>
        </div>
        <div>
          <p class="text-indigo-900 uppercase text-[10px] font-bold">Inventario Final</p>
          <strong class="text-indigo-900 text-sm font-black">${parseFloat(r.total_final_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})} Bs.</strong>
          <span class="block text-[10px] text-indigo-700 font-bold">($${parseFloat(r.total_final_usd || 0).toFixed(2)})</span>
        </div>
      </div>
    `;

    const items = data?.items || [];
    tablaHtml = `
      <table class="w-full text-left text-[11px] border border-slate-300">
        <thead class="bg-slate-100 border-b border-slate-300 font-bold uppercase text-[9px] text-slate-700">
          <tr>
            <th class="p-1">Código</th>
            <th class="p-1">Descripción Mercancía</th>
            <th class="p-1 text-right">Inicial Cant.</th>
            <th class="p-1 text-right">Inicial Total Bs.</th>
            <th class="p-1 text-right">Entradas Cant.</th>
            <th class="p-1 text-right">Entradas Total Bs.</th>
            <th class="p-1 text-right">Salidas Cant.</th>
            <th class="p-1 text-right">Salidas Total Bs.</th>
            <th class="p-1 text-right font-black">Final Cant.</th>
            <th class="p-1 text-right font-black">Final Total Bs.</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          ${items.map(i => `
            <tr>
              <td class="p-1 font-mono font-bold">${escapeHtml(i.codigo)}</td>
              <td class="p-1">${escapeHtml(i.nombre)}</td>
              <td class="p-1 text-right">${i.inicial_cant}</td>
              <td class="p-1 text-right">${parseFloat(i.inicial_total_ves).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
              <td class="p-1 text-right text-emerald-700 font-semibold">${i.entradas_cant}</td>
              <td class="p-1 text-right text-emerald-800 font-bold">${parseFloat(i.entradas_total_ves).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
              <td class="p-1 text-right text-rose-700 font-semibold">${i.salidas_cant}</td>
              <td class="p-1 text-right text-rose-800 font-bold">${parseFloat(i.salidas_total_ves).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
              <td class="p-1 text-right font-black">${i.final_cant}</td>
              <td class="p-1 text-right font-black text-indigo-900">${parseFloat(i.final_total_ves).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot class="bg-slate-100 font-bold border-t-2 border-slate-400">
          <tr>
            <td colspan="3" class="p-1.5 text-right uppercase">TOTALES INVENTARIO ART. 177:</td>
            <td class="p-1.5 text-right font-black">${parseFloat(r.total_inicial_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
            <td></td>
            <td class="p-1.5 text-right font-black text-emerald-800">${parseFloat(r.total_entradas_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
            <td></td>
            <td class="p-1.5 text-right font-black text-rose-800">${parseFloat(r.total_salidas_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
            <td></td>
            <td class="p-1.5 text-right font-black text-indigo-950">${parseFloat(r.total_final_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
          </tr>
        </tfoot>
      </table>
    `;
  }

  // Firmas y Bloque de Auditoría Formal
  const footerFirmasHtml = `
    <div class="pt-8 mt-6 border-t border-slate-300">
      <div class="grid grid-cols-3 gap-6 text-center text-xs text-slate-600 pt-8">
        <div class="border-t border-slate-400 pt-2">
          <p class="font-bold">Elaborado por:</p>
          <p class="text-[11px] text-slate-400">Firma y Sello</p>
        </div>
        <div class="border-t border-slate-400 pt-2">
          <p class="font-bold">Revisado por:</p>
          <p class="text-[11px] text-slate-400">Administración / Contabilidad</p>
        </div>
        <div class="border-t border-slate-400 pt-2">
          <p class="font-bold">Aprobado por:</p>
          <p class="text-[11px] text-slate-400">Gerencia General</p>
        </div>
      </div>
      <p class="text-center text-[10px] text-slate-400 mt-6 italic">
        Reporte oficial emitido en tiempo real por el Sistema de Control de Inventario y Finanzas Multimoneda.
      </p>
    </div>
  `;

  // Renderizar contenido completo
  container.innerHTML = `
    ${headerHtml}
    <div class="space-y-1">
      <h2 class="text-lg font-black text-slate-900 uppercase tracking-wide">${tituloReporte}</h2>
      <p class="text-xs text-slate-500">${subtituloReporte}</p>
    </div>
    ${kpisHtml}
    <div class="overflow-x-auto">
      ${tablaHtml}
    </div>
    ${footerFirmasHtml}
  `;

  document.getElementById('modalVistaPreliminarReporte').classList.remove('hidden');
}

function cerrarVistaPreliminar() {
  document.getElementById('modalVistaPreliminarReporte').classList.add('hidden');
}

function imprimirDesdePreliminar() {
  window.print();
}

function exportarReporteActualCsv() {
  const tab = AppState.reportesTabActual || 'inventario';
  let rows = [];
  let filename = `Reporte_${tab}_${new Date().toISOString().split('T')[0]}.csv`;

  if (tab === 'inventario') {
    const data = AppState.reportesInventarioData?.items || [];
    rows.push(['Codigo', 'Nombre', 'Categoria', 'Tipo', 'Impuesto', 'Stock', 'Costo Unitario USD', 'Costo Total USD', 'Precio Venta USD', 'Valor Venta USD']);
    data.forEach(i => {
      rows.push([
        `"${i.codigo || ''}"`,
        `"${(i.nombre || '').replace(/"/g, '""')}"`,
        `"${(i.categoria_nombre || '').replace(/"/g, '""')}"`,
        `"${i.tipo}"`,
        `"${i.impuesto_tipo}"`,
        i.stock || 0,
        parseFloat(i.costo || 0).toFixed(2),
        parseFloat(i.costo_total_stock || 0).toFixed(2),
        parseFloat(i.precio || 0).toFixed(2),
        parseFloat(i.valor_venta_stock || 0).toFixed(2)
      ]);
    });
  } else if (tab === 'diarias') {
    const data = AppState.reportesVentasDiariasData?.facturas || [];
    rows.push(['Factura', 'Fecha', 'Cliente', 'Cedula', 'Condicion', 'Total USD', 'Total VES', 'Total COP']);
    data.forEach(f => {
      rows.push([
        `"${f.numero_factura}"`,
        `"${f.fecha}"`,
        `"${(f.cliente_nombre || '').replace(/"/g, '""')}"`,
        `"${f.cliente_cedula || ''}"`,
        `"${f.tipo_venta}"`,
        parseFloat(f.total_usd).toFixed(2),
        parseFloat(f.total_ves).toFixed(2),
        Math.round(f.total_cop)
      ]);
    });
  } else if (tab === 'mensuales') {
    const data = AppState.reportesVentasMensualesData?.meses || [];
    rows.push(['Mes', 'Nro Facturas', 'Total USD', 'Total VES', 'Total COP']);
    data.forEach(m => {
      rows.push([
        `"${m.nombre_mes}"`,
        m.total_facturas,
        parseFloat(m.total_usd).toFixed(2),
        parseFloat(m.total_ves).toFixed(2),
        Math.round(m.total_cop)
      ]);
    });
  } else if (tab === 'cxc') {
    const data = AppState.reportesCxcData?.cuentas || [];
    rows.push(['Factura', 'Cliente', 'Cedula', 'Telefono', 'Fecha Emision', 'Fecha Vencimiento', 'Monto Total USD', 'Monto Pagado USD', 'Saldo Pendiente USD', 'Saldo VES', 'Estado']);
    data.forEach(c => {
      rows.push([
        `"${c.numero_factura}"`,
        `"${(c.cliente_nombre || '').replace(/"/g, '""')}"`,
        `"${c.cliente_cedula || ''}"`,
        `"${c.cliente_telefono || ''}"`,
        `"${c.fecha_emision}"`,
        `"${c.fecha_vencimiento}"`,
        parseFloat(c.monto_total).toFixed(2),
        parseFloat(c.monto_pagado).toFixed(2),
        parseFloat(c.saldo_pendiente).toFixed(2),
        parseFloat(c.saldo_ves || 0).toFixed(2),
        `"${c.estado}"`
      ]);
    });
  } else if (tab === 'cxp') {
    const data = AppState.reportesCxpData?.cuentas || [];
    rows.push(['Factura/Control', 'Proveedor', 'RIF/Cedula', 'Telefono', 'Concepto', 'Tipo', 'Fecha Emision', 'Fecha Vencimiento', 'Monto Total USD', 'Monto Pagado USD', 'Saldo Pendiente USD', 'Saldo VES', 'Estado']);
    data.forEach(c => {
      rows.push([
        `"${c.numero_factura || ''}"`,
        `"${(c.proveedor_nombre || '').replace(/"/g, '""')}"`,
        `"${c.proveedor_cedula || ''}"`,
        `"${c.proveedor_telefono || ''}"`,
        `"${(c.descripcion_concepto || '').replace(/"/g, '""')}"`,
        `"${c.tipo_registro}"`,
        `"${c.fecha_emision}"`,
        `"${c.fecha_vencimiento}"`,
        parseFloat(c.monto_total).toFixed(2),
        parseFloat(c.monto_pagado).toFixed(2),
        parseFloat(c.saldo_pendiente).toFixed(2),
        parseFloat(c.saldo_ves || 0).toFixed(2),
        `"${c.estado}"`
      ]);
    });
  } else if (tab === 'kardex') {
    const data = AppState.reportesKardexData;
    const p = data?.producto || {};
    rows.push(['Producto', `"${p.codigo || ''} - ${p.nombre || ''}"`]);
    rows.push(['Fecha', 'Tipo', 'Documento', 'Referencia', 'Tercero', 'Concepto', 'Entrada Cant', 'Entrada Unit USD', 'Entrada Total USD', 'Salida Cant', 'Salida Unit USD', 'Salida Total USD', 'Stock Saldo', 'Costo Unit USD', 'Saldo Total USD']);
    (data?.movimientos || []).forEach(m => {
      rows.push([
        `"${m.fecha}"`,
        `"${m.tipo_movimiento}"`,
        `"${m.documento}"`,
        `"${m.referencia || ''}"`,
        `"${(m.tercero || '').replace(/"/g, '""')}"`,
        `"${(m.concepto || '').replace(/"/g, '""')}"`,
        m.entrada_cant || 0,
        parseFloat(m.entrada_unit || 0).toFixed(2),
        parseFloat(m.entrada_total || 0).toFixed(2),
        m.salida_cant || 0,
        parseFloat(m.salida_unit || 0).toFixed(2),
        parseFloat(m.salida_total || 0).toFixed(2),
        m.saldo_cant || 0,
        parseFloat(m.saldo_unit || 0).toFixed(2),
        parseFloat(m.saldo_total || 0).toFixed(2)
      ]);
    });
  } else if (tab === 'inv_simple') {
    const data = AppState.reportesInvSimpleData?.productos || [];
    rows.push(['Codigo', 'Nombre', 'Categoria', 'Stock Actual']);
    data.forEach(p => {
      rows.push([
        `"${p.codigo || ''}"`,
        `"${(p.nombre || '').replace(/"/g, '""')}"`,
        `"${(p.categoria_nombre || '').replace(/"/g, '""')}"`,
        p.stock || 0
      ]);
    });
  } else if (tab === 'libro_ventas') {
    const data = AppState.reportesLibroVentasSeniat;
    rows.push(['Nro Operacion', 'Fecha', 'RIF/Cedula', 'Nombre/Razon Social', 'Nro Factura', 'Nro Control', 'Nro Nota Credito', 'Factura Afectada', 'Tipo Transaccion', 'Total Ventas VES', 'Ventas Exentas VES', 'Base Imponible VES', 'IVA Debito VES', 'Total Ventas USD']);
    (data?.items || []).forEach(i => {
      rows.push([
        i.operacion_nro,
        `"${i.fecha}"`,
        `"${i.cliente_rif}"`,
        `"${(i.cliente_nombre || '').replace(/"/g, '""')}"`,
        `"${i.numero_factura || ''}"`,
        `"${i.numero_control || ''}"`,
        `"${i.numero_nota_credito || ''}"`,
        `"${i.factura_afectada || ''}"`,
        `"${i.tipo_transaccion}"`,
        parseFloat(i.total_ventas_ves || 0).toFixed(2),
        parseFloat(i.ventas_exentas_ves || 0).toFixed(2),
        parseFloat(i.base_imponible_ves || 0).toFixed(2),
        parseFloat(i.iva_debito_ves || 0).toFixed(2),
        parseFloat(i.total_ventas_usd || 0).toFixed(2)
      ]);
    });
  } else if (tab === 'libro_compras') {
    const data = AppState.reportesLibroComprasSeniat;
    rows.push(['Nro Operacion', 'Fecha', 'RIF Proveedor', 'Nombre/Razon Social', 'Nro Factura', 'Nro Control', 'Nro ND/NC', 'Factura Afectada', 'Tipo Transaccion', 'Total Compras VES', 'Compras Exentas VES', 'Base Imponible VES', 'IVA Credito VES', 'Total Compras USD']);
    (data?.items || []).forEach(i => {
      rows.push([
        i.operacion_nro,
        `"${i.fecha}"`,
        `"${i.proveedor_rif}"`,
        `"${(i.proveedor_nombre || '').replace(/"/g, '""')}"`,
        `"${i.numero_factura || ''}"`,
        `"${i.numero_control || ''}"`,
        `"${i.numero_nota_deb_cred || ''}"`,
        `"${i.factura_afectada || ''}"`,
        `"${i.tipo_transaccion}"`,
        parseFloat(i.total_compras_ves || 0).toFixed(2),
        parseFloat(i.compras_exentas_ves || 0).toFixed(2),
        parseFloat(i.base_imponible_ves || 0).toFixed(2),
        parseFloat(i.iva_credito_ves || 0).toFixed(2),
        parseFloat(i.total_compras_usd || 0).toFixed(2)
      ]);
    });
  } else if (tab === 'art177') {
    const data = AppState.reportesArt177Data;
    rows.push(['Codigo', 'Descripcion Mercancia', 'Inicial Cant', 'Inicial Costo Unit USD', 'Inicial Total Bs', 'Entradas Cant', 'Entradas Total Bs', 'Salidas Cant', 'Salidas Total Bs', 'Final Cant', 'Final Total Bs']);
    (data?.items || []).forEach(i => {
      rows.push([
        `"${i.codigo || ''}"`,
        `"${(i.nombre || '').replace(/"/g, '""')}"`,
        i.inicial_cant,
        parseFloat(i.costo_unit_usd || 0).toFixed(2),
        parseFloat(i.inicial_total_ves || 0).toFixed(2),
        i.entradas_cant,
        parseFloat(i.entradas_total_ves || 0).toFixed(2),
        i.salidas_cant,
        parseFloat(i.salidas_total_ves || 0).toFixed(2),
        i.final_cant,
        parseFloat(i.final_total_ves || 0).toFixed(2)
      ]);
    });
  }

  const csvContent = "\uFEFF" + rows.map(e => e.join(",")).join("\n");
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ========================================================
// REPORTE 6: KARDEX DE INVENTARIO
// ========================================================
async function loadReporteKardex(producto_id) {
  const select = document.getElementById('kardexProductoSelect');
  const desde = document.getElementById('kardexDesdeInput')?.value || '';
  const hasta = document.getElementById('kardexHastaInput')?.value || '';
  const prodId = producto_id || select?.value || '';

  try {
    const url = `/api/reportes/kardex?producto_id=${encodeURIComponent(prodId)}&desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    AppState.reportesKardexData = data;

    // Poblar select si está vacío
    if (select && select.options.length <= 1 && data.productos) {
      select.innerHTML = data.productos.map(p => 
        `<option value="${p.id}" ${data.producto && data.producto.id === p.id ? 'selected' : ''}>${escapeHtml(p.codigo)} - ${escapeHtml(p.nombre)} (Stock: ${p.stock})</option>`
      ).join('');
    }

    renderReporteKardex();
  } catch (err) {
    console.error("Error al cargar Kardex:", err);
  }
}

function renderReporteKardex() {
  const data = AppState.reportesKardexData;
  if (!data || !data.producto) return;

  const p = data.producto;
  const r = data.resumen || {};

  document.getElementById('kardexStockInicial').textContent = r.stock_inicial || 0;
  document.getElementById('kardexCodigoItem').textContent = `Cód: ${p.codigo} | ${p.categoria_nombre || 'General'}`;
  document.getElementById('kardexTotalEntradas').textContent = r.total_entradas || 0;
  document.getElementById('kardexValorEntradas').textContent = `Total: $${parseFloat(r.valor_entradas || 0).toFixed(2)}`;
  document.getElementById('kardexTotalSalidas').textContent = r.total_salidas || 0;
  document.getElementById('kardexValorSalidas').textContent = `Total: $${parseFloat(r.valor_salidas || 0).toFixed(2)}`;
  document.getElementById('kardexStockFinal').textContent = r.stock_actual || 0;
  document.getElementById('kardexValorSaldo').textContent = `$${parseFloat(r.valor_total_actual || 0).toFixed(2)} valor total`;
  document.getElementById('kardexCostoUnitario').textContent = `$${parseFloat(p.costo || 0).toFixed(2)}`;
  document.getElementById('kardexPrecioVenta').textContent = `Precio Venta: $${parseFloat(p.precio_total || p.precio || 0).toFixed(2)}`;
  document.getElementById('kardexProductoNombreHeader').textContent = `${p.codigo} - ${p.nombre}`;
  document.getElementById('kardexMovimientosCount').textContent = `${(data.movimientos || []).length} movimiento(s)`;

  const tbody = document.getElementById('kardexTableBody');
  const movs = data.movimientos || [];
  if (!tbody) return;

  if (movs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="14" class="text-center py-8 text-slate-400 italic">No hay movimientos registrados para este producto en el período seleccionado.</td></tr>`;
    return;
  }

  tbody.innerHTML = movs.map(m => {
    let badgeClass = 'bg-slate-100 text-slate-700';
    if (m.tipo_movimiento === 'COMPRA') badgeClass = 'bg-emerald-100 text-emerald-800 font-bold';
    else if (m.tipo_movimiento === 'VENTA') badgeClass = 'bg-rose-100 text-rose-800 font-bold';
    else if (m.tipo_movimiento === 'DEVOLUCION') badgeClass = 'bg-blue-100 text-blue-800 font-bold';

    const entCant = m.entrada_cant > 0 ? m.entrada_cant : '-';
    const entUnit = m.entrada_cant > 0 ? `$${parseFloat(m.entrada_unit).toFixed(2)}` : '-';
    const entTot = m.entrada_cant > 0 ? `$${parseFloat(m.entrada_total).toFixed(2)}` : '-';

    const salCant = m.salida_cant > 0 ? m.salida_cant : '-';
    const salUnit = m.salida_cant > 0 ? `$${parseFloat(m.salida_unit).toFixed(2)}` : '-';
    const salTot = m.salida_cant > 0 ? `$${parseFloat(m.salida_total).toFixed(2)}` : '-';

    return `
      <tr class="hover:bg-slate-50 transition border-b border-slate-100 text-slate-800">
        <td class="py-2 px-3 font-mono text-[11px]">${formatFecha(m.fecha)}</td>
        <td class="py-2 px-3"><span class="px-2 py-0.5 rounded text-[10px] ${badgeClass}">${m.tipo_movimiento}</span></td>
        <td class="py-2 px-3 font-mono font-bold text-slate-800">${escapeHtml(m.documento)} ${m.referencia ? `<span class="text-slate-400 font-normal">(${escapeHtml(m.referencia)})</span>` : ''}</td>
        <td class="py-2 px-3">${escapeHtml(m.tercero || '-')}</td>
        <td class="py-2 px-3 text-slate-500">${escapeHtml(m.concepto || '-')}</td>
        <!-- Entradas -->
        <td class="py-2 px-2 text-right bg-emerald-50/40 text-emerald-900 font-semibold">${entCant}</td>
        <td class="py-2 px-2 text-right bg-emerald-50/40 text-slate-600">${entUnit}</td>
        <td class="py-2 px-2 text-right bg-emerald-50/40 text-emerald-800 font-bold border-r border-emerald-100">${entTot}</td>
        <!-- Salidas -->
        <td class="py-2 px-2 text-right bg-rose-50/40 text-rose-900 font-semibold">${salCant}</td>
        <td class="py-2 px-2 text-right bg-rose-50/40 text-slate-600">${salUnit}</td>
        <td class="py-2 px-2 text-right bg-rose-50/40 text-rose-800 font-bold border-r border-rose-100">${salTot}</td>
        <!-- Saldo -->
        <td class="py-2 px-2 text-right bg-slate-100/70 font-black text-slate-900">${m.saldo_cant}</td>
        <td class="py-2 px-2 text-right bg-slate-100/70 text-slate-600">$${parseFloat(m.saldo_unit || 0).toFixed(2)}</td>
        <td class="py-2 px-2 text-right bg-slate-100/70 font-black text-slate-900">$${parseFloat(m.saldo_total || 0).toFixed(2)}</td>
      </tr>
    `;
  }).join('');
}

function imprimirKardex() {
  abrirVistaPreliminarReporte();
}

// ========================================================
// REPORTE 7: INVENTARIO RÁPIDO (CÓDIGO, NOMBRE, STOCK)
// ========================================================
async function loadReporteInventarioSimple() {
  const catSelect = document.getElementById('invSimpleCategoriaSelect');
  if (catSelect && catSelect.options.length <= 1) {
    try {
      const resCat = await fetch('/api/categorias');
      if (resCat.ok) {
        const cats = await resCat.json();
        catSelect.innerHTML = `<option value="">Todas las Categorías</option>` +
          cats.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
      }
    } catch(e) {}
  }

  const catId = catSelect?.value || '';
  const q = document.getElementById('invSimpleSearchInput')?.value || '';

  try {
    const res = await fetch(`/api/reportes/inventario-simple?categoria_id=${encodeURIComponent(catId)}&q=${encodeURIComponent(q)}`);
    if (!res.ok) return;
    const data = await res.json();
    AppState.reportesInvSimpleData = data;
    renderReporteInventarioSimple();
  } catch (err) {
    console.error("Error al cargar inventario simple:", err);
  }
}

function renderReporteInventarioSimple() {
  const data = AppState.reportesInvSimpleData;
  if (!data) return;

  const q = (document.getElementById('invSimpleSearchInput')?.value || '').toLowerCase().trim();
  const catSelect = document.getElementById('invSimpleCategoriaSelect');
  const catNombre = catSelect && catSelect.selectedIndex > 0 ? catSelect.options[catSelect.selectedIndex].text : '';

  let prods = data.productos || [];
  if (q) {
    prods = prods.filter(p => (p.codigo || '').toLowerCase().includes(q) || (p.nombre || '').toLowerCase().includes(q));
  }
  if (catNombre && catNombre !== 'Todas las Categorías') {
    prods = prods.filter(p => p.categoria_nombre === catNombre);
  }

  const badge = document.getElementById('invSimpleCountBadge');
  if (badge) badge.textContent = `${prods.length} ítems registrados`;

  const tbody = document.getElementById('invSimpleTableBody');
  if (!tbody) return;

  if (prods.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-slate-400">No se encontraron productos con los filtros aplicados.</td></tr>`;
    return;
  }

  let totalUnidades = 0;
  tbody.innerHTML = prods.map(p => {
    const stock = parseFloat(p.stock || 0);
    totalUnidades += stock;
    const stockClass = stock <= 0 ? 'text-rose-600 bg-rose-50' : (stock <= 5 ? 'text-amber-600 bg-amber-50' : 'text-slate-900 bg-slate-50');

    return `
      <tr class="hover:bg-slate-50 transition border-b border-slate-100">
        <td class="py-3 px-6 font-mono font-bold text-slate-800 text-xs">${escapeHtml(p.codigo)}</td>
        <td class="py-3 px-6 font-medium text-slate-900 text-xs">${escapeHtml(p.nombre)}</td>
        <td class="py-3 px-6 text-xs text-slate-500">${escapeHtml(p.categoria_nombre || '-')}</td>
        <td class="py-3 px-6 text-right font-black text-sm ${stockClass} px-3 py-1 rounded">${stock}</td>
      </tr>
    `;
  }).join('');

  const tfoot = document.getElementById('invSimpleTableFoot');
  if (tfoot) {
    tfoot.innerHTML = `
      <tr>
        <td colspan="2" class="py-3 px-6 uppercase tracking-wider text-xs font-bold text-slate-700">Total ítems mostrados: ${prods.length}</td>
        <td class="py-3 px-6 text-right uppercase tracking-wider text-xs font-bold text-slate-700">Total Unidades Físicas:</td>
        <td class="py-3 px-6 text-right font-black text-base text-slate-950 bg-slate-200/70">${totalUnidades}</td>
      </tr>
    `;
  }
}

function imprimirInventarioSimple() {
  abrirVistaPreliminarReporte();
}

// ========================================================
// REPORTE 8: LIBRO DE VENTAS SENIAT (VENEZUELA)
// ========================================================
async function loadLibroVentasSeniat() {
  const mesInput = document.getElementById('libroVentasMesInput');
  if (mesInput && !mesInput.value) {
    mesInput.value = new Date().toISOString().slice(0, 7);
  }
  const mes = mesInput?.value || new Date().toISOString().slice(0, 7);

  try {
    const res = await fetch(`/api/reportes/seniat/libro-ventas?mes=${encodeURIComponent(mes)}`);
    if (!res.ok) return;
    const data = await res.json();
    AppState.reportesLibroVentasSeniat = data;
    renderLibroVentasSeniat();
  } catch (err) {
    console.error("Error al cargar libro de ventas SENIAT:", err);
  }
}

function renderLibroVentasSeniat() {
  const data = AppState.reportesLibroVentasSeniat;
  if (!data) return;

  const r = data.resumen || data.totales || {};
  const emp = data.empresa || data.contribuyente || {};
  const totalBs = r.total_ventas_ves ?? r.total_ventas_netas_ves ?? 0;
  const totalUsd = r.total_ventas_usd ?? r.total_ventas_netas_usd ?? 0;
  const baseBs = r.total_base_imponible_ves ?? 0;
  const baseUsd = r.total_base_imponible_usd ?? 0;
  const debitoBs = r.total_iva_ves ?? r.total_iva_debito_ves ?? 0;
  const debitoUsd = r.total_iva_usd ?? r.total_iva_debito_usd ?? 0;
  const exentoBs = r.total_exento_ves ?? r.total_exentas_ves ?? 0;
  const exentoUsd = r.total_exento_usd ?? r.total_exentas_usd ?? 0;
  const mesLabel = data.mes && data.anio ? `${data.mes}/${data.anio}` : (data.periodo || '');
  const tasaCierre = data.tasa_bcv_cierre || emp.tasa_ves || AppState.config.tasa_ves || 45.0;

  document.getElementById('seniatVentasTotalBs').textContent = `${parseFloat(totalBs).toLocaleString('es-VE', {minimumFractionDigits: 2})} Bs.`;
  document.getElementById('seniatVentasTotalUsd').textContent = `≈ $${parseFloat(totalUsd).toFixed(2)} USD`;

  document.getElementById('seniatVentasBaseBs').textContent = `${parseFloat(baseBs).toLocaleString('es-VE', {minimumFractionDigits: 2})} Bs.`;
  document.getElementById('seniatVentasBaseUsd').textContent = `≈ $${parseFloat(baseUsd).toFixed(2)} USD`;

  document.getElementById('seniatVentasDebitoBs').textContent = `${parseFloat(debitoBs).toLocaleString('es-VE', {minimumFractionDigits: 2})} Bs.`;
  document.getElementById('seniatVentasDebitoUsd').textContent = `≈ $${parseFloat(debitoUsd).toFixed(2)} USD`;

  document.getElementById('seniatVentasExentoBs').textContent = `${parseFloat(exentoBs).toLocaleString('es-VE', {minimumFractionDigits: 2})} Bs.`;
  document.getElementById('seniatVentasExentoUsd').textContent = `≈ $${parseFloat(exentoUsd).toFixed(2)} USD`;

  document.getElementById('seniatVentasEmpresaNombre').textContent = emp.nombre || emp.nombre_negocio || AppState.config.nombre_negocio;
  document.getElementById('seniatVentasEmpresaRif').textContent = emp.rif || emp.documento_fiscal || AppState.config.documento_fiscal;
  document.getElementById('seniatVentasPeriodoLabel').textContent = `${mesLabel} (Tasa: ${parseFloat(tasaCierre).toFixed(2)} Bs.)`;

  const tbody = document.getElementById('libroVentasTableBody');
  const items = data.items || data.registros || [];
  if (!tbody) return;

  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="14" class="text-center py-8 text-slate-400 italic">No se registraron operaciones de ventas ni devoluciones en el período fiscal seleccionado.</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(i => {
    const isNc = i.es_devolucion;
    const rowClass = isNc ? 'bg-rose-50/60 text-rose-950 font-semibold' : 'hover:bg-slate-50 text-slate-800';
    return `
      <tr class="${rowClass} transition border-b border-slate-100">
        <td class="py-2 px-2 text-center font-mono font-bold">${i.operacion_nro}</td>
        <td class="py-2 px-2 font-mono text-[10px]">${i.fecha}</td>
        <td class="py-2 px-2 font-mono font-semibold">${escapeHtml(i.cliente_rif)}</td>
        <td class="py-2 px-3">${escapeHtml(i.cliente_nombre)}</td>
        <td class="py-2 px-2 font-mono font-bold">${escapeHtml(i.numero_factura || '-')}</td>
        <td class="py-2 px-2 font-mono text-slate-600">${escapeHtml(i.numero_control || '-')}</td>
        <td class="py-2 px-2 font-mono text-rose-700 font-bold">${escapeHtml(i.numero_nota_credito || '-')}</td>
        <td class="py-2 px-2 font-mono text-slate-500">${escapeHtml(i.factura_afectada || '-')}</td>
        <td class="py-2 px-2 text-center font-bold text-[10px]">${i.tipo_transaccion}</td>
        <td class="py-2 px-2 text-right font-black ${isNc ? 'text-rose-700' : 'text-slate-900'}">${parseFloat(i.total_ventas_ves).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
        <td class="py-2 px-2 text-right text-slate-500">${parseFloat(i.ventas_exentas_ves).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
        <td class="py-2 px-2 text-right text-indigo-700 font-semibold">${parseFloat(i.base_imponible_ves).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
        <td class="py-2 px-2 text-right text-rose-700 font-bold">${parseFloat(i.iva_debito_ves).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
        <td class="py-2 px-2 text-right text-slate-500 font-mono text-[10px]">$${parseFloat(i.total_ventas_usd).toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  const tfoot = document.getElementById('libroVentasTableFoot');
  if (tfoot) {
    tfoot.innerHTML = `
      <tr>
        <td colspan="9" class="py-2.5 px-3 text-right uppercase font-bold text-slate-900 text-xs">TOTALES DEL PERÍODO FISCAL:</td>
        <td class="py-2.5 px-2 text-right font-black text-xs text-slate-950">${parseFloat(r.total_ventas_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
        <td class="py-2.5 px-2 text-right font-bold text-xs text-slate-600">${parseFloat(r.total_exento_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
        <td class="py-2.5 px-2 text-right font-bold text-xs text-indigo-900">${parseFloat(r.total_base_imponible_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
        <td class="py-2.5 px-2 text-right font-black text-xs text-rose-800">${parseFloat(r.total_iva_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
        <td class="py-2.5 px-2 text-right font-black text-xs text-slate-900">$${parseFloat(r.total_ventas_usd || 0).toFixed(2)}</td>
      </tr>
    `;
  }
}

function imprimirLibroVentasSeniat() {
  abrirVistaPreliminarReporte();
}

function exportarLibroVentasCSV() {
  exportReporteCsv('libro_ventas');
}

// ========================================================
// REPORTE 9: LIBRO DE COMPRAS SENIAT (VENEZUELA)
// ========================================================
async function loadLibroComprasSeniat() {
  const mesInput = document.getElementById('libroComprasMesInput');
  if (mesInput && !mesInput.value) {
    mesInput.value = new Date().toISOString().slice(0, 7);
  }
  const mes = mesInput?.value || new Date().toISOString().slice(0, 7);

  try {
    const res = await fetch(`/api/reportes/seniat/libro-compras?mes=${encodeURIComponent(mes)}`);
    if (!res.ok) return;
    const data = await res.json();
    AppState.reportesLibroComprasSeniat = data;
    renderLibroComprasSeniat();
  } catch (err) {
    console.error("Error al cargar libro de compras SENIAT:", err);
  }
}

function renderLibroComprasSeniat() {
  const data = AppState.reportesLibroComprasSeniat;
  if (!data) return;

  const r = data.resumen || data.totales || {};
  const emp = data.empresa || data.contribuyente || {};
  const totalBs = r.total_compras_ves ?? 0;
  const totalUsd = r.total_compras_usd ?? 0;
  const baseBs = r.total_base_imponible_ves ?? 0;
  const baseUsd = r.total_base_imponible_usd ?? 0;
  const creditoBs = r.total_iva_ves ?? r.total_iva_credito_ves ?? 0;
  const creditoUsd = r.total_iva_usd ?? r.total_iva_credito_usd ?? 0;
  const exentoBs = r.total_exento_ves ?? r.total_exentas_ves ?? 0;
  const exentoUsd = r.total_exento_usd ?? r.total_exentas_usd ?? 0;
  const mesLabel = data.mes && data.anio ? `${data.mes}/${data.anio}` : (data.periodo || '');
  const tasaCierre = data.tasa_bcv_cierre || emp.tasa_ves || AppState.config.tasa_ves || 45.0;

  document.getElementById('seniatComprasTotalBs').textContent = `${parseFloat(totalBs).toLocaleString('es-VE', {minimumFractionDigits: 2})} Bs.`;
  document.getElementById('seniatComprasTotalUsd').textContent = `≈ $${parseFloat(totalUsd).toFixed(2)} USD`;

  document.getElementById('seniatComprasBaseBs').textContent = `${parseFloat(baseBs).toLocaleString('es-VE', {minimumFractionDigits: 2})} Bs.`;
  document.getElementById('seniatComprasBaseUsd').textContent = `≈ $${parseFloat(baseUsd).toFixed(2)} USD`;

  document.getElementById('seniatComprasCreditoBs').textContent = `${parseFloat(creditoBs).toLocaleString('es-VE', {minimumFractionDigits: 2})} Bs.`;
  document.getElementById('seniatComprasCreditoUsd').textContent = `≈ $${parseFloat(creditoUsd).toFixed(2)} USD`;

  document.getElementById('seniatComprasExentoBs').textContent = `${parseFloat(exentoBs).toLocaleString('es-VE', {minimumFractionDigits: 2})} Bs.`;
  document.getElementById('seniatComprasExentoUsd').textContent = `≈ $${parseFloat(exentoUsd).toFixed(2)} USD`;

  document.getElementById('seniatComprasEmpresaNombre').textContent = emp.nombre || emp.nombre_negocio || AppState.config.nombre_negocio;
  document.getElementById('seniatComprasEmpresaRif').textContent = emp.rif || emp.documento_fiscal || AppState.config.documento_fiscal;
  document.getElementById('seniatComprasPeriodoLabel').textContent = `${mesLabel} (Tasa: ${parseFloat(tasaCierre).toFixed(2)} Bs.)`;

  const tbody = document.getElementById('libroComprasTableBody');
  const items = data.items || data.registros || [];
  if (!tbody) return;

  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="14" class="text-center py-8 text-slate-400 italic">No se registraron compras de mercancía en el período fiscal seleccionado.</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(i => {
    return `
      <tr class="hover:bg-slate-50 transition border-b border-slate-100 text-slate-800">
        <td class="py-2 px-2 text-center font-mono font-bold">${i.operacion_nro}</td>
        <td class="py-2 px-2 font-mono text-[10px]">${i.fecha}</td>
        <td class="py-2 px-2 font-mono font-semibold">${escapeHtml(i.proveedor_rif)}</td>
        <td class="py-2 px-3">${escapeHtml(i.proveedor_nombre)}</td>
        <td class="py-2 px-2 font-mono font-bold text-slate-900">${escapeHtml(i.numero_factura || '-')}</td>
        <td class="py-2 px-2 font-mono text-slate-600">${escapeHtml(i.numero_control || '-')}</td>
        <td class="py-2 px-2 font-mono text-slate-400">${escapeHtml(i.numero_nota_deb_cred || '-')}</td>
        <td class="py-2 px-2 font-mono text-slate-400">${escapeHtml(i.factura_afectada || '-')}</td>
        <td class="py-2 px-2 text-center font-bold text-[10px]">${i.tipo_transaccion}</td>
        <td class="py-2 px-2 text-right font-black text-slate-950">${parseFloat(i.total_compras_ves).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
        <td class="py-2 px-2 text-right text-slate-500">${parseFloat(i.compras_exentas_ves).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
        <td class="py-2 px-2 text-right text-indigo-700 font-semibold">${parseFloat(i.base_imponible_ves).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
        <td class="py-2 px-2 text-right text-emerald-700 font-bold">${parseFloat(i.iva_credito_ves).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
        <td class="py-2 px-2 text-right text-slate-500 font-mono text-[10px]">$${parseFloat(i.total_compras_usd).toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  const tfoot = document.getElementById('libroComprasTableFoot');
  if (tfoot) {
    tfoot.innerHTML = `
      <tr>
        <td colspan="9" class="py-2.5 px-3 text-right uppercase font-bold text-slate-900 text-xs">TOTALES DEL PERÍODO FISCAL:</td>
        <td class="py-2.5 px-2 text-right font-black text-xs text-slate-950">${parseFloat(r.total_compras_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
        <td class="py-2.5 px-2 text-right font-bold text-xs text-slate-600">${parseFloat(r.total_exento_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
        <td class="py-2.5 px-2 text-right font-bold text-xs text-indigo-900">${parseFloat(r.total_base_imponible_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
        <td class="py-2.5 px-2 text-right font-black text-xs text-emerald-800">${parseFloat(r.total_iva_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
        <td class="py-2.5 px-2 text-right font-black text-xs text-slate-900">$${parseFloat(r.total_compras_usd || 0).toFixed(2)}</td>
      </tr>
    `;
  }
}

function imprimirLibroComprasSeniat() {
  abrirVistaPreliminarReporte();
}

function exportarLibroComprasCSV() {
  exportReporteCsv('libro_compras');
}

// ========================================================
// REPORTE 10: LIBRO DE INVENTARIO ARTÍCULO 177 R-LISLR
// ========================================================
async function loadLibroInventarioArt177() {
  const mesInput = document.getElementById('art177MesInput');
  if (mesInput && !mesInput.value) {
    mesInput.value = new Date().toISOString().slice(0, 7);
  }
  const mes = mesInput?.value || new Date().toISOString().slice(0, 7);

  try {
    const res = await fetch(`/api/reportes/seniat/libro-inventario-art177?mes=${encodeURIComponent(mes)}`);
    if (!res.ok) return;
    const data = await res.json();
    AppState.reportesArt177Data = data;
    renderLibroInventarioArt177();
  } catch (err) {
    console.error("Error al cargar Libro de Inventario Art 177:", err);
  }
}

function renderLibroInventarioArt177() {
  const data = AppState.reportesArt177Data;
  if (!data) return;

  const r = data.resumen || data.totales || {};
  const totalInicialBs = r.total_inicial_ves ?? r.inicial_valor_ves ?? 0;
  const totalInicialUsd = r.total_inicial_usd ?? r.inicial_valor_usd ?? 0;
  const totalEntradasBs = r.total_entradas_ves ?? r.entradas_valor_ves ?? 0;
  const totalEntradasUsd = r.total_entradas_usd ?? r.entradas_valor_usd ?? 0;
  const totalSalidasBs = r.total_salidas_ves ?? r.salidas_valor_ves ?? 0;
  const totalSalidasUsd = r.total_salidas_usd ?? r.salidas_valor_usd ?? 0;
  const totalFinalBs = r.total_final_ves ?? r.final_valor_ves ?? 0;
  const totalFinalUsd = r.total_final_usd ?? r.final_valor_usd ?? 0;

  document.getElementById('art177TotalInicialBs').textContent = `${parseFloat(totalInicialBs).toLocaleString('es-VE', {minimumFractionDigits: 2})} Bs.`;
  document.getElementById('art177TotalInicialUsd').textContent = `≈ $${parseFloat(totalInicialUsd).toFixed(2)} USD`;

  document.getElementById('art177TotalEntradasBs').textContent = `${parseFloat(totalEntradasBs).toLocaleString('es-VE', {minimumFractionDigits: 2})} Bs.`;
  document.getElementById('art177TotalEntradasUsd').textContent = `≈ $${parseFloat(totalEntradasUsd).toFixed(2)} USD`;

  document.getElementById('art177TotalSalidasBs').textContent = `${parseFloat(totalSalidasBs).toLocaleString('es-VE', {minimumFractionDigits: 2})} Bs.`;
  document.getElementById('art177TotalSalidasUsd').textContent = `≈ $${parseFloat(totalSalidasUsd).toFixed(2)} USD`;

  document.getElementById('art177TotalFinalBs').textContent = `${parseFloat(totalFinalBs).toLocaleString('es-VE', {minimumFractionDigits: 2})} Bs.`;
  document.getElementById('art177TotalFinalUsd').textContent = `≈ $${parseFloat(totalFinalUsd).toFixed(2)} USD`;

  document.getElementById('art177PeriodoLabel').textContent = data.periodo || data.periodo_mes || '-';
  document.getElementById('art177TasaBcvLabel').textContent = `${parseFloat(data.tasa_bcv || AppState.config.tasa_ves || 45.0).toFixed(2)} Bs.`;

  const tbody = document.getElementById('art177TableBody');
  const items = data.items || data.articulos || [];
  if (!tbody) return;

  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="14" class="text-center py-8 text-slate-400 italic">No hay productos ni mercancías registradas para el balance del período.</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(i => {
    const costoUnit = i.costo_unit_usd ?? i.costo_unitario ?? 0;
    const inicialTotal = i.inicial_total_ves ?? i.inicial_valor_ves ?? 0;
    const entradasTotal = i.entradas_total_ves ?? i.entradas_valor_ves ?? 0;
    const salidasTotal = i.salidas_total_ves ?? i.salidas_valor_ves ?? 0;
    const finalTotal = i.final_total_ves ?? i.final_valor_ves ?? 0;
    return `
      <tr class="hover:bg-slate-50 transition border-b border-slate-100 text-slate-800 text-xs">
        <td class="py-2 px-3 font-mono font-bold text-slate-800">${escapeHtml(i.codigo)}</td>
        <td class="py-2 px-3 font-medium">${escapeHtml(i.nombre)} <span class="text-slate-400 text-[10px]">(${escapeHtml(i.categoria || '')})</span></td>
        <!-- Inicial -->
        <td class="py-2 px-2 text-right font-semibold">${i.inicial_cant}</td>
        <td class="py-2 px-2 text-right text-slate-500">$${parseFloat(costoUnit).toFixed(2)}</td>
        <td class="py-2 px-2 text-right font-medium border-r border-slate-200">${parseFloat(inicialTotal).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
        <!-- Entradas -->
        <td class="py-2 px-2 text-right bg-emerald-50/50 text-emerald-900 font-semibold">${i.entradas_cant}</td>
        <td class="py-2 px-2 text-right bg-emerald-50/50 text-slate-500">$${parseFloat(costoUnit).toFixed(2)}</td>
        <td class="py-2 px-2 text-right bg-emerald-50/50 text-emerald-900 font-bold border-r border-emerald-100">${parseFloat(entradasTotal).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
        <!-- Salidas -->
        <td class="py-2 px-2 text-right bg-rose-50/50 text-rose-900 font-semibold">${i.salidas_cant}</td>
        <td class="py-2 px-2 text-right bg-rose-50/50 text-slate-500">$${parseFloat(costoUnit).toFixed(2)}</td>
        <td class="py-2 px-2 text-right bg-rose-50/50 text-rose-900 font-bold border-r border-rose-100">${parseFloat(salidasTotal).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
        <!-- Final -->
        <td class="py-2 px-2 text-right bg-indigo-50/70 text-indigo-950 font-black">${i.final_cant}</td>
        <td class="py-2 px-2 text-right bg-indigo-50/70 text-slate-600">$${parseFloat(costoUnit).toFixed(2)}</td>
        <td class="py-2 px-2 text-right bg-indigo-50/70 text-indigo-950 font-black">${parseFloat(finalTotal).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
      </tr>
    `;
  }).join('');

  const tfoot = document.getElementById('art177TableFoot');
  if (tfoot) {
    tfoot.innerHTML = `
      <tr>
        <td colspan="2" class="py-2.5 px-3 text-right uppercase font-bold text-slate-900 text-xs">VALORACIONES TOTALES CONSOLIDADAS:</td>
        <td colspan="2" class="py-2.5 px-2 text-right text-slate-500 text-xs">$${parseFloat(r.total_inicial_usd || 0).toFixed(2)}</td>
        <td class="py-2.5 px-2 text-right font-black text-xs text-slate-900">${parseFloat(r.total_inicial_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
        <td colspan="2" class="py-2.5 px-2 text-right text-emerald-700 text-xs">$${parseFloat(r.total_entradas_usd || 0).toFixed(2)}</td>
        <td class="py-2.5 px-2 text-right font-black text-xs text-emerald-900">${parseFloat(r.total_entradas_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
        <td colspan="2" class="py-2.5 px-2 text-right text-rose-700 text-xs">$${parseFloat(r.total_salidas_usd || 0).toFixed(2)}</td>
        <td class="py-2.5 px-2 text-right font-black text-xs text-rose-900">${parseFloat(r.total_salidas_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
        <td colspan="2" class="py-2.5 px-2 text-right text-indigo-800 text-xs font-bold">$${parseFloat(r.total_final_usd || 0).toFixed(2)}</td>
        <td class="py-2.5 px-2 text-right font-black text-xs text-indigo-950 bg-indigo-100">${parseFloat(r.total_final_ves || 0).toLocaleString('es-VE', {minimumFractionDigits: 2})}</td>
      </tr>
    `;
  }
}

function imprimirLibroInventarioArt177() {
  abrirVistaPreliminarReporte();
}

function exportarLibroArt177CSV() {
  exportReporteCsv('art177');
}

// ========================================================
// UTILIDADES
// ========================================================
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatFecha(str) {
  if (!str) return '';
  try {
    const d = new Date(str);
    return d.toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return str;
  }
}


// ========================================================
// MÓDULO DE AJUSTES FORMALES DE INVENTARIO (FASE 2C)
// FASE 2F-5C: TAXONOMÍA CANÓNICA + PREVISUALIZACIÓN CPP + IDEMPOTENCIA
// El backend (procesar_ajuste_inventario_cpp) es la autoridad matemática y de integridad.
// Todas las validaciones y cálculos de esta sección son exclusivamente de UX.
// ========================================================

const AJUSTE_SUBTIPOS_UI = {
  CARGO: [
    {
      value: 'CARGO_SOBRANTE_CONTEO',
      label: 'Sobrante de Conteo',
      tituloDoc: 'AJUSTE — SOBRANTE DE CONTEO',
      descripcion: 'Diferencia positiva detectada en conteo físico. Se valorará al CPP vigente.',
      modoCosto: 'CPP_INVARIANTE',
      advertencia: ''
    },
    {
      value: 'CARGO_HALLAZGO_CON_SOPORTE',
      label: 'Hallazgo con Soporte',
      tituloDoc: 'AJUSTE — HALLAZGO CON SOPORTE',
      descripcion: 'Mercancía encontrada con documento de respaldo. Ingresa a su costo documentado y recalcula el CPP por promedio ponderado.',
      modoCosto: 'PONDERADO',
      advertencia: ''
    },
    {
      value: 'CARGO_TASACION_MANUAL',
      label: 'Tasación Manual',
      tituloDoc: 'AJUSTE — TASACIÓN MANUAL',
      descripcion: 'Entrada valorada mediante tasación técnica documentada y autorizada.',
      modoCosto: 'PONDERADO',
      advertencia: 'Este ajuste modifica el CPP mediante valoración ponderada y requiere autorización.'
    }
  ],
  DESCARGO: [
    { value: 'DESCARGO_MERMA', label: 'Merma', tituloDoc: 'DESCARGO — MERMA', descripcion: 'Pérdida operativa de producto. Se valora al CPP vigente; el CPP no cambia.', modoCosto: 'CPP_SALIDA', advertencia: '' },
    { value: 'DESCARGO_VENCIMIENTO', label: 'Vencimiento', tituloDoc: 'DESCARGO — VENCIMIENTO', descripcion: 'Producto vencido retirado del inventario. Se valora al CPP vigente; el CPP no cambia.', modoCosto: 'CPP_SALIDA', advertencia: '' },
    { value: 'DESCARGO_ROTURA', label: 'Rotura / Daño', tituloDoc: 'DESCARGO — ROTURA', descripcion: 'Producto dañado o roto. Se valora al CPP vigente; el CPP no cambia.', modoCosto: 'CPP_SALIDA', advertencia: '' },
    { value: 'DESCARGO_USO_INTERNO', label: 'Uso Interno', tituloDoc: 'DESCARGO — USO INTERNO', descripcion: 'Consumo interno de la empresa. Se valora al CPP vigente; el CPP no cambia.', modoCosto: 'CPP_SALIDA', advertencia: '' },
    { value: 'DESCARGO_PERDIDA_NO_EXPLICADA', label: 'Pérdida no Explicada', tituloDoc: 'DESCARGO — PÉRDIDA NO EXPLICADA', descripcion: 'Faltante sin causa determinada. Se valora al CPP vigente; el CPP no cambia.', modoCosto: 'CPP_SALIDA', advertencia: '' }
  ]
};

// Alias legados NO ambiguos (compatibilidad con payloads/registros previos). 'regularizacion' y 'ajuste_manual' se excluyen deliberadamente.
const AJUSTE_ALIAS_LEGADOS_UI = {
  sobrante: 'CARGO_SOBRANTE_CONTEO',
  merma: 'DESCARGO_MERMA',
  vencimiento: 'DESCARGO_VENCIMIENTO',
  rotura: 'DESCARGO_ROTURA',
  uso_interno: 'DESCARGO_USO_INTERNO',
  perdida_no_explicada: 'DESCARGO_PERDIDA_NO_EXPLICADA'
};
const AJUSTE_MOTIVOS_AMBIGUOS_UI = ['regularizacion', 'ajuste_manual'];

const MSG_CONFIRMACION_ANULACION_AJUSTE = 'La anulación directa solo es posible si este ajuste permanece en el tope de la secuencia de inventario. Si existen movimientos posteriores, el sistema bloqueará la anulación y deberá utilizarse un contra-ajuste.';
const MSG_ANULACION_BLOQUEADA_AJUSTE = 'Este ajuste tiene movimientos posteriores y no puede anularse directamente. Debe realizarse un contra-ajuste para conservar la integridad histórica.';

// Contra-ajuste: el backend (FASE 2F-5B) soporta 'ajuste_referencia_id' sobre el MISMO endpoint POST /api/inventario/ajustes.
// No existe (ni se inventa) un endpoint específico de contra-ajuste. La UI solo pre-llena el formulario; el usuario confirma manualmente.
const CONTRA_AJUSTE_FLUJO_BACKEND = {
  disponible: true,
  endpoint: '/api/inventario/ajustes',
  campoReferencia: 'ajuste_referencia_id'
};

function getSubtiposAjusteUI(tipo) {
  const t = String(tipo || '').toUpperCase();
  return (AJUSTE_SUBTIPOS_UI[t] || []).slice();
}

function obtenerConfigSubtipoAjuste(subtipo) {
  const s = String(subtipo || '').trim().toUpperCase();
  return AJUSTE_SUBTIPOS_UI.CARGO.concat(AJUSTE_SUBTIPOS_UI.DESCARGO).find(x => x.value === s) || null;
}

function resolverSubtipoAjusteUI(tipo, valor) {
  const t = String(tipo || '').toUpperCase();
  const raw = String(valor || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (AJUSTE_MOTIVOS_AMBIGUOS_UI.includes(lower)) return null;
  const upper = raw.toUpperCase();
  const lista = getSubtiposAjusteUI(t);
  if (lista.some(x => x.value === upper)) return upper;
  const alias = AJUSTE_ALIAS_LEGADOS_UI[lower];
  if (alias && lista.some(x => x.value === alias)) return alias;
  return null;
}

function getCamposRequeridosSubtipo(subtipo) {
  const s = String(subtipo || '').toUpperCase();
  return {
    documento: s === 'CARGO_HALLAZGO_CON_SOPORTE' || s === 'CARGO_TASACION_MANUAL',
    costoEditable: s === 'CARGO_HALLAZGO_CON_SOPORTE' || s === 'CARGO_TASACION_MANUAL',
    motivoTexto: s === 'CARGO_HALLAZGO_CON_SOPORTE',
    justificacion: s === 'CARGO_TASACION_MANUAL',
    autorizado: s === 'CARGO_TASACION_MANUAL'
  };
}

function generarIdempotencyKeyAjuste() {
  try {
    if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') {
      return `AJ-UI-${crypto.randomUUID()}`;
    }
  } catch (e) {}
  const rnd = Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
  return `AJ-UI-${Date.now().toString(36)}-${rnd}`;
}

function redondear4Ajuste(x) {
  const n = Number(x);
  if (!isFinite(n)) return NaN;
  const sign = n < 0 ? -1 : 1;
  return sign * Math.round((Math.abs(n) + Number.EPSILON) * 10000) / 10000;
}

// Previsualización matemática (NO es confirmación contable; el backend recalcula con Decimal ROUND_HALF_UP)
function calcularPreviewAjusteCPP(params) {
  const p = params || {};
  const cfg = obtenerConfigSubtipoAjuste(p.subtipo);
  const stock = Number(p.stock);
  const cppRaw = (p.cpp === null || p.cpp === undefined || p.cpp === '') ? NaN : Number(p.cpp);
  const cant = Number(p.cantidad);
  const costo = (p.costo === null || p.costo === undefined || p.costo === '') ? NaN : Number(p.costo);
  const base = { valido: false, incompleto: false, stockActual: stock, cppActual: cppRaw, cantidad: cant, costoEntrada: null, stockResultante: null, cppResultante: null, valorMovimiento: null, mensaje: '' };

  if (!cfg) return Object.assign(base, { incompleto: true, mensaje: 'Seleccione un subtipo canónico.' });
  if (!isFinite(stock)) return Object.assign(base, { incompleto: true, mensaje: 'Seleccione un producto.' });
  if (!isFinite(cant) || cant <= 0) return Object.assign(base, { incompleto: true, mensaje: 'Ingrese una cantidad mayor a 0.' });
  if (stock < 0) return Object.assign(base, { mensaje: 'Stock actual negativo: el backend bloqueará la operación.' });

  if (cfg.modoCosto === 'CPP_INVARIANTE') {
    if (!isFinite(cppRaw) || cppRaw <= 0) return Object.assign(base, { mensaje: 'CPP vigente inválido (≤ 0 o nulo): el backend bloqueará el sobrante.' });
    const cpp = redondear4Ajuste(cppRaw);
    return Object.assign(base, { valido: true, costoEntrada: cpp, stockResultante: redondear4Ajuste(stock + cant), cppResultante: cpp, valorMovimiento: redondear4Ajuste(cant * cpp) });
  }

  if (cfg.modoCosto === 'CPP_SALIDA') {
    if (!isFinite(cppRaw) || cppRaw <= 0) return Object.assign(base, { mensaje: 'CPP vigente inválido (≤ 0 o nulo): el backend bloqueará el descargo.' });
    if (cant > stock) return Object.assign(base, { mensaje: `Cantidad (${cant}) supera el stock disponible (${stock}).` });
    const cpp = redondear4Ajuste(cppRaw);
    return Object.assign(base, { valido: true, costoEntrada: cpp, stockResultante: redondear4Ajuste(stock - cant), cppResultante: cpp, valorMovimiento: redondear4Ajuste(cant * cpp) });
  }

  // PONDERADO (Hallazgo con soporte / Tasación manual)
  if (!isFinite(costo) || costo <= 0) return Object.assign(base, { incompleto: true, mensaje: 'Ingrese el costo de entrada (> 0) para calcular el CPP resultante.' });
  const costoR = redondear4Ajuste(costo);
  const stockNuevo = redondear4Ajuste(stock + cant);
  let cppNuevo;
  if (stock === 0) {
    cppNuevo = costoR;
  } else {
    if (!isFinite(cppRaw) || cppRaw <= 0) return Object.assign(base, { mensaje: 'CPP vigente inválido con stock positivo: el backend bloqueará la operación.' });
    cppNuevo = redondear4Ajuste(((stock * cppRaw) + (cant * costoR)) / (stock + cant));
  }
  return Object.assign(base, { valido: true, costoEntrada: costoR, stockResultante: stockNuevo, cppResultante: cppNuevo, valorMovimiento: redondear4Ajuste(cant * costoR) });
}

function validarFormularioAjuste(form) {
  const f = form || {};
  const errores = [];
  const tipo = String(f.tipo || '').toUpperCase();
  if (tipo !== 'CARGO' && tipo !== 'DESCARGO') errores.push('Tipo de ajuste inválido (CARGO / DESCARGO).');

  const subtipo = resolverSubtipoAjusteUI(tipo, f.subtipoRaw);
  if (!subtipo) {
    const lower = String(f.subtipoRaw || '').trim().toLowerCase();
    if (AJUSTE_MOTIVOS_AMBIGUOS_UI.includes(lower)) {
      errores.push(`SUBTIPO_AJUSTE_OBLIGATORIO: '${lower}' es ambiguo y no está permitido. Seleccione un subtipo canónico explícito.`);
    } else {
      errores.push('SUBTIPO_AJUSTE_OBLIGATORIO: Debe seleccionar explícitamente un subtipo canónico de ajuste.');
    }
  }
  const req = getCamposRequeridosSubtipo(subtipo);
  const lineas = Array.isArray(f.lineas) ? f.lineas : [];
  if (lineas.length === 0) errores.push('Debe incluir al menos un producto en el ajuste.');

  const vistos = new Set();
  lineas.forEach((l, idx) => {
    const n = idx + 1;
    const pid = parseInt(l.producto_id, 10);
    if (!pid) { errores.push(`Línea ${n}: el producto es obligatorio.`); return; }
    if (vistos.has(pid)) errores.push(`Línea ${n}: SKU duplicado en el mismo ajuste (${l.codigo || 'ID ' + pid}). Consolide la cantidad en una sola línea.`);
    vistos.add(pid);

    const cantStr = String(l.cantidad === undefined || l.cantidad === null ? '' : l.cantidad).trim();
    const cant = Number(cantStr);
    if (cantStr === '' || !isFinite(cant)) errores.push(`Línea ${n}: la cantidad debe ser un número válido.`);
    else if (cant <= 0) errores.push(`Línea ${n}: la cantidad debe ser mayor a 0.`);
    else if (tipo === 'DESCARGO') {
      const stk = Number(l.stock);
      if (isFinite(stk) && cant > stk) errores.push(`Línea ${n}: la cantidad (${cant}) supera el stock disponible (${stk}).`);
    }
    if (req.costoEditable) {
      const c = Number(l.costo_unitario);
      if (l.costo_unitario === '' || l.costo_unitario === null || l.costo_unitario === undefined || !isFinite(c) || c <= 0) {
        errores.push(`Línea ${n}: el costo unitario de entrada debe ser mayor a 0.`);
      }
    }
  });

  if (req.documento && !String(f.documentoReferencia || '').trim()) errores.push('El documento de referencia es obligatorio para este subtipo.');
  if (req.motivoTexto && !String(f.motivoTexto || f.observaciones || '').trim()) errores.push('El motivo / observación es obligatorio para Hallazgo con Soporte.');
  if (req.justificacion && !String(f.justificacion || '').trim()) errores.push('La justificación técnica es obligatoria para Tasación Manual.');
  if (req.autorizado && !String(f.autorizadoPor || '').trim()) errores.push('El campo "Autorizado por" es obligatorio para Tasación Manual.');
  return errores;
}

// Construye el payload compatible EXCLUSIVAMENTE con el contrato real de POST /api/inventario/ajustes
function construirPayloadAjuste(form, idempotencyKey) {
  const f = form || {};
  const tipo = String(f.tipo || '').toUpperCase();
  const subtipo = resolverSubtipoAjusteUI(tipo, f.subtipoRaw);
  const cfg = obtenerConfigSubtipoAjuste(subtipo);
  const req = getCamposRequeridosSubtipo(subtipo);
  const motivo = String(f.motivoTexto || '').trim() || String(f.observaciones || '').trim() || (cfg ? cfg.label : '');
  const payload = {
    tipo_ajuste: tipo,
    subtipo_ajuste: subtipo,
    motivo,
    fecha: f.fecha || undefined,
    observaciones: String(f.observaciones || '').trim(),
    idempotency_key: idempotencyKey,
    detalles: (f.lineas || []).map(l => {
      const d = { producto_id: parseInt(l.producto_id, 10), cantidad: Number(l.cantidad) };
      if (req.costoEditable) d.costo_unitario = Number(l.costo_unitario);
      return d;
    })
  };
  const doc = String(f.documentoReferencia || '').trim();
  if (doc) payload.documento_referencia = doc;
  if (req.autorizado || String(f.autorizadoPor || '').trim()) {
    const aut = String(f.autorizadoPor || '').trim();
    if (aut) payload.autorizado_por = aut;
  }
  if (req.justificacion || String(f.justificacion || '').trim()) {
    const j = String(f.justificacion || '').trim();
    if (j) payload.justificacion_tecnica = j;
  }
  const refId = parseInt(f.ajusteReferenciaId, 10);
  if (refId) payload.ajuste_referencia_id = refId;
  if (!payload.fecha) delete payload.fecha;
  return payload;
}

function _valorElementoAjuste(id) {
  const el = document.getElementById(id);
  return el && el.value !== undefined && el.value !== null ? String(el.value) : '';
}

function leerFormularioAjusteDOM() {
  const rows = document.querySelectorAll('.ajuste-item-row') || [];
  const lineas = [];
  for (const row of rows) {
    const select = row.querySelector ? row.querySelector('.ajuste-prod-select') : null;
    const cantInput = row.querySelector ? row.querySelector('.ajuste-cant-input') : null;
    const costoInput = row.querySelector ? row.querySelector('.ajuste-costo-input') : null;
    if (!select) continue;
    const opt = select.selectedOptions && select.selectedOptions[0];
    const ga = (attr) => (opt && typeof opt.getAttribute === 'function') ? opt.getAttribute(attr) : null;
    lineas.push({
      producto_id: select.value,
      cantidad: cantInput ? cantInput.value : '',
      costo_unitario: costoInput ? costoInput.value : '',
      stock: ga('data-stock'),
      cpp: ga('data-costo-cpp'),
      codigo: ga('data-codigo') || ''
    });
  }
  return {
    tipo: _valorElementoAjuste('ajusteTipo'),
    subtipoRaw: _valorElementoAjuste('ajusteMotivo'),
    fecha: _valorElementoAjuste('ajusteFecha'),
    observaciones: _valorElementoAjuste('ajusteObservaciones'),
    motivoTexto: _valorElementoAjuste('ajusteMotivoTexto'),
    documentoReferencia: _valorElementoAjuste('ajusteDocumentoReferencia'),
    autorizadoPor: _valorElementoAjuste('ajusteAutorizadoPor'),
    justificacion: _valorElementoAjuste('ajusteJustificacion'),
    ajusteReferenciaId: _valorElementoAjuste('ajusteReferenciaId'),
    lineas
  };
}

function openAjusteModal(tipo = 'CARGO', opciones = {}) {
  const modal = document.getElementById('modalAjusteInventario');
  if (!modal) return;
  document.getElementById('ajusteTipo').value = tipo;
  ['ajusteMotivoTexto', 'ajusteDocumentoReferencia', 'ajusteAutorizadoPor', 'ajusteJustificacion', 'ajusteReferenciaId', 'ajusteObservaciones'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  onAjusteTipoChange();
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('ajusteFecha').value = hoy;

  // Nueva operación => nueva clave de idempotencia (nunca se reutiliza entre ajustes distintos)
  AppState.ajusteIdempotencyKey = generarIdempotencyKeyAjuste();
  AppState.ajusteGuardando = false;

  const banner = document.getElementById('ajusteContraAjusteBanner');
  const itemsContainer = document.getElementById('ajusteItemsList');
  itemsContainer.innerHTML = '';

  const ref = opciones && opciones.contraAjusteDe;
  if (ref && ref.id) {
    document.getElementById('ajusteReferenciaId').value = String(ref.id);
    const mt = document.getElementById('ajusteMotivoTexto');
    if (mt) mt.value = `Contra-ajuste del ajuste N° ${ref.numero_ajuste || ref.id}`;
    if (banner) {
      banner.innerHTML = `<i class="fa-solid fa-link mr-1"></i> Contra-ajuste referenciado al ajuste <strong>${escapeHtml(ref.numero_ajuste || ('#' + ref.id))}</strong> (ajuste_referencia_id = ${escapeHtml(ref.id)}). Seleccione el subtipo canónico y revise cantidades antes de confirmar.`;
      banner.classList.remove('hidden');
    }
    (ref.detalles || []).forEach(d => addAjusteRow(d.producto_id, d.cantidad));
    if (!(ref.detalles || []).length) addAjusteRow();
  } else {
    if (banner) { banner.innerHTML = ''; banner.classList.add('hidden'); }
    addAjusteRow();
  }
  renderErroresAjuste([]);
  modal.classList.remove('hidden');
}

function closeAjusteModal() {
  const modal = document.getElementById('modalAjusteInventario');
  if (modal) modal.classList.add('hidden');
}

function onAjusteTipoChange() {
  const tipo = document.getElementById('ajusteTipo').value;
  const motivoSelect = document.getElementById('ajusteMotivo');
  motivoSelect.innerHTML = '';

  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = 'Seleccione el subtipo canónico...';
  motivoSelect.appendChild(ph);

  getSubtiposAjusteUI(tipo).forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.value;
    opt.textContent = `${m.label} — ${m.value}`;
    motivoSelect.appendChild(opt);
  });
  motivoSelect.value = '';
  onAjusteSubtipoChange();
}

function onAjusteSubtipoChange() {
  const tipo = _valorElementoAjuste('ajusteTipo');
  const subtipo = resolverSubtipoAjusteUI(tipo, _valorElementoAjuste('ajusteMotivo'));
  const cfg = obtenerConfigSubtipoAjuste(subtipo);
  const req = getCamposRequeridosSubtipo(subtipo);

  const desc = document.getElementById('ajusteSubtipoDescripcion');
  if (desc) {
    desc.innerHTML = cfg
      ? `<span class="font-mono font-bold text-slate-700">${escapeHtml(cfg.value)}</span> — ${escapeHtml(cfg.descripcion)}`
      : 'Seleccione explícitamente un subtipo. No se admiten motivos genéricos ("regularización" / "ajuste manual").';
  }
  const adv = document.getElementById('ajusteSubtipoAdvertencia');
  if (adv) {
    if (cfg && cfg.advertencia) { adv.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-1"></i>${escapeHtml(cfg.advertencia)}`; adv.classList.remove('hidden'); }
    else { adv.innerHTML = ''; adv.classList.add('hidden'); }
  }
  const toggle = (wrapId, inputId, visible) => {
    const w = document.getElementById(wrapId);
    const i = document.getElementById(inputId);
    if (w) { if (visible) w.classList.remove('hidden'); else w.classList.add('hidden'); }
    if (i) i.required = !!visible;
  };
  toggle('ajusteCampoDocumentoWrap', 'ajusteDocumentoReferencia', req.documento);
  toggle('ajusteCampoJustificacionWrap', 'ajusteJustificacion', req.justificacion);
  toggle('ajusteCampoAutorizadoWrap', 'ajusteAutorizadoPor', req.autorizado);
  const mt = document.getElementById('ajusteMotivoTexto');
  if (mt) mt.required = !!req.motivoTexto;
  const mtLbl = document.getElementById('ajusteMotivoTextoLabel');
  if (mtLbl) mtLbl.textContent = req.motivoTexto ? 'Motivo / Observación *' : 'Motivo / Observación';

  recalcularAjusteTotales();
}

function addAjusteRow(selectedProdId = null, cantidadInicial = null) {
  const container = document.getElementById('ajusteItemsList');
  if (!container) return;

  const prods = (AppState.productos || []).filter(p => p.tipo === 'producto' && p.activo !== 0);
  if (prods.length === 0) {
    container.innerHTML = '<p class="text-xs text-slate-500 py-2 text-center">No hay productos físicos registrados disponibles.</p>';
    return;
  }

  const row = document.createElement('div');
  row.className = 'ajuste-item-row bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2';

  let optionsHtml = '<option value="">Seleccionar producto...</option>';
  prods.forEach(p => {
    const isSel = selectedProdId && p.id === parseInt(selectedProdId) ? 'selected' : '';
    const cppAttr = (p.costo_cpp !== undefined && p.costo_cpp !== null) ? p.costo_cpp : '';
    optionsHtml += `<option value="${p.id}" data-stock="${p.stock}" data-costo-cpp="${cppAttr}" data-costo-reposicion="${p.costo !== undefined && p.costo !== null ? p.costo : ''}" data-codigo="${escapeHtml(p.codigo || 'SIN-COD')}" data-nombre="${escapeHtml(p.nombre || '')}" ${isSel}>${escapeHtml(p.codigo || 'SIN-COD')} - ${escapeHtml(p.nombre)} (Stock: ${p.stock})</option>`;
  });

  row.innerHTML = `
    <div class="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
      <div class="sm:col-span-5">
        <label class="block text-[11px] font-semibold text-slate-600 mb-0.5">Producto *</label>
        <select class="ajuste-prod-select w-full bg-white border border-slate-200 rounded-lg p-1.5 text-xs focus:outline-none focus:border-amber-500" onchange="recalcularAjusteTotales()">
          ${optionsHtml}
        </select>
      </div>
      <div class="sm:col-span-2">
        <label class="block text-[11px] font-semibold text-slate-600 mb-0.5">Cantidad *</label>
        <input type="number" step="any" min="0.0001" value="${cantidadInicial !== null && cantidadInicial !== undefined ? Number(cantidadInicial) : 1}" class="ajuste-cant-input w-full bg-white border border-slate-200 rounded-lg p-1.5 text-xs text-center font-bold focus:outline-none focus:border-amber-500" oninput="recalcularAjusteTotales()">
      </div>
      <div class="sm:col-span-2">
        <label class="ajuste-costo-label block text-[11px] font-semibold text-slate-600 mb-0.5">CPP vigente</label>
        <input type="number" step="any" min="0" value="" class="ajuste-costo-input w-full bg-white border border-slate-200 rounded-lg p-1.5 text-xs text-right focus:outline-none focus:border-amber-500" oninput="recalcularAjusteTotales()">
      </div>
      <div class="sm:col-span-2 text-center">
        <label class="block text-[11px] font-semibold text-slate-600 mb-0.5">Stock Final</label>
        <span class="ajuste-result-badge inline-block px-2 py-1 rounded text-xs font-bold bg-slate-200 text-slate-700">--</span>
      </div>
      <div class="sm:col-span-1 flex items-center justify-center">
        <button type="button" onclick="removeAjusteRow(this)" class="text-rose-500 hover:text-rose-700 p-1 rounded transition" title="Eliminar producto">
          <i class="fa-solid fa-trash-can text-sm"></i>
        </button>
      </div>
    </div>
    <div class="ajuste-prod-info text-[11px] text-slate-500"></div>
    <div class="ajuste-row-preview text-[11px]"></div>
  `;

  container.appendChild(row);
  recalcularAjusteTotales();
}

function removeAjusteRow(btn) {
  const row = btn.closest('.ajuste-item-row');
  if (row) {
    row.remove();
    recalcularAjusteTotales();
  }
}

function _fmt4(n) { return (n === null || n === undefined || !isFinite(Number(n))) ? 'N/D' : Number(n).toFixed(4); }

function recalcularAjusteTotales() {
  const tipo = _valorElementoAjuste('ajusteTipo');
  const subtipo = resolverSubtipoAjusteUI(tipo, _valorElementoAjuste('ajusteMotivo'));
  const cfg = obtenerConfigSubtipoAjuste(subtipo);
  const req = getCamposRequeridosSubtipo(subtipo);
  const rows = document.querySelectorAll('.ajuste-item-row');
  let totalItems = 0;
  let totalCantidad = 0;
  let totalCosto = 0;
  const previews = [];
  const conteoSku = {};

  rows.forEach(row => {
    if (!row.querySelector) return;
    const select = row.querySelector('.ajuste-prod-select');
    if (select && select.value) conteoSku[select.value] = (conteoSku[select.value] || 0) + 1;
  });

  rows.forEach(row => {
    if (!row.querySelector) return;
    const select = row.querySelector('.ajuste-prod-select');
    const cantInput = row.querySelector('.ajuste-cant-input');
    const costoInput = row.querySelector('.ajuste-costo-input');
    const costoLabel = row.querySelector('.ajuste-costo-label');
    const badge = row.querySelector('.ajuste-result-badge');
    const info = row.querySelector('.ajuste-prod-info');
    const rowPrev = row.querySelector('.ajuste-row-preview');
    if (!select || !cantInput || !badge) return;

    // Configurar campo de costo según subtipo (nunca editable en sobrante ni descargos)
    if (costoInput) {
      if (req.costoEditable) {
        costoInput.readOnly = false;
        costoInput.classList.remove('bg-slate-100', 'text-slate-500', 'cursor-not-allowed');
        costoInput.title = 'Costo unitario de entrada documentado (> 0). Recalcula el CPP por promedio ponderado.';
        if (costoLabel) costoLabel.textContent = 'Costo de entrada ($) *';
      } else {
        costoInput.readOnly = true;
        costoInput.classList.add('bg-slate-100', 'text-slate-500', 'cursor-not-allowed');
        costoInput.title = (tipo === 'DESCARGO') ? 'Descargo valorado al CPP vigente (no editable)' : 'Sobrante valorado al CPP vigente (no editable)';
        if (costoLabel) costoLabel.textContent = 'CPP vigente (solo lectura)';
      }
    }

    const opt = select.selectedOptions && select.selectedOptions[0];
    if (!opt || !opt.value) {
      badge.textContent = '--';
      badge.className = 'ajuste-result-badge inline-block px-2 py-1 rounded text-xs font-bold bg-slate-200 text-slate-700';
      if (info) info.innerHTML = '';
      if (rowPrev) rowPrev.innerHTML = '';
      if (costoInput && !req.costoEditable) costoInput.value = '';
      return;
    }

    const stock = parseFloat(opt.getAttribute('data-stock') || 0);
    const cppAttr = opt.getAttribute('data-costo-cpp');
    const cpp = (cppAttr === null || cppAttr === '' || cppAttr === undefined) ? null : parseFloat(cppAttr);
    const repAttr = opt.getAttribute('data-costo-reposicion');
    const costoRep = (repAttr === null || repAttr === '' || repAttr === undefined) ? null : parseFloat(repAttr);
    const codigo = opt.getAttribute('data-codigo') || '';
    const nombre = opt.getAttribute('data-nombre') || '';

    if (costoInput && !req.costoEditable) costoInput.value = (cpp !== null && isFinite(cpp)) ? cpp.toFixed(4) : '';

    if (info) {
      info.innerHTML = `
        <div class="flex flex-wrap gap-x-3 gap-y-1 items-center">
          <span><strong>SKU:</strong> <span class="font-mono">${escapeHtml(codigo)}</span></span>
          <span><strong>Producto:</strong> ${escapeHtml(nombre)}</span>
          <span><strong>Stock actual:</strong> ${stock.toFixed(4)}</span>
          <span class="px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200"><strong>CPP actual:</strong> ${_fmt4(cpp)}</span>
          <span class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200" title="Costo de catálogo/reposición: solo referencial, NO se utiliza en el cálculo del CPP"><strong>Costo de reposición (referencial):</strong> ${costoRep !== null && isFinite(costoRep) ? costoRep.toFixed(4) : 'N/D'}</span>
          <span><strong>Tipo:</strong> ${escapeHtml(tipo || '—')}${cfg ? ' / ' + escapeHtml(cfg.value) : ''}</span>
          <span><strong>Cantidad:</strong> ${escapeHtml(cantInput.value || '0')}</span>
          ${conteoSku[select.value] > 1 ? '<span class="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-bold">SKU duplicado en este ajuste</span>' : ''}
        </div>`;
    }

    const prev = calcularPreviewAjusteCPP({ subtipo, stock, cpp, cantidad: cantInput.value, costo: costoInput ? costoInput.value : '' });

    if (prev.valido) {
      badge.textContent = prev.stockResultante.toFixed(2);
      badge.className = `ajuste-result-badge inline-block px-2 py-1 rounded text-xs font-bold ${tipo === 'CARGO' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`;
      totalItems += 1;
      totalCantidad += Number(prev.cantidad);
      totalCosto += Number(prev.valorMovimiento);
      previews.push({ codigo, nombre, prev });
    } else {
      badge.textContent = prev.incompleto ? '--' : 'Bloqueado';
      badge.className = `ajuste-result-badge inline-block px-2 py-1 rounded text-xs font-bold ${prev.incompleto ? 'bg-slate-200 text-slate-700' : 'bg-rose-100 text-rose-800'}`;
    }

    if (rowPrev) {
      rowPrev.innerHTML = prev.valido
        ? `<div class="grid grid-cols-2 sm:grid-cols-6 gap-1 bg-white border border-dashed border-slate-300 rounded-lg p-2 font-mono">
             <div><span class="block text-[9px] uppercase text-slate-400">Stock actual</span>${prev.stockActual.toFixed(4)}</div>
             <div><span class="block text-[9px] uppercase text-slate-400">Cantidad</span>${Number(prev.cantidad).toFixed(4)}</div>
             <div><span class="block text-[9px] uppercase text-slate-400">Stock resultante</span>${prev.stockResultante.toFixed(4)}</div>
             <div><span class="block text-[9px] uppercase text-slate-400">CPP actual</span>${_fmt4(prev.cppActual)}</div>
             <div><span class="block text-[9px] uppercase text-slate-400">${cfg && cfg.modoCosto === 'PONDERADO' ? 'Costo de entrada' : 'Costo aplicado (CPP)'}</span>${_fmt4(prev.costoEntrada)}</div>
             <div><span class="block text-[9px] uppercase text-slate-400">CPP resultante</span><strong>${_fmt4(prev.cppResultante)}</strong></div>
           </div>`
        : `<div class="${prev.incompleto ? 'text-slate-400' : 'text-rose-600 font-semibold'}">${escapeHtml(prev.mensaje)}</div>`;
    }
  });

  const sumItemsEl = document.getElementById('ajusteSummaryItems');
  const sumCantEl = document.getElementById('ajusteSummaryCantidad');
  const sumCostoEl = document.getElementById('ajusteSummaryCosto');
  if (sumItemsEl) sumItemsEl.textContent = totalItems;
  if (sumCantEl) sumCantEl.textContent = totalCantidad.toFixed(2);
  if (sumCostoEl) sumCostoEl.textContent = totalCosto.toFixed(2);

  const prevBox = document.getElementById('ajustePreviewCPP');
  if (prevBox) {
    prevBox.innerHTML = previews.length
      ? `<div class="font-bold text-[11px] uppercase tracking-wide text-slate-600 mb-1"><i class="fa-solid fa-eye mr-1"></i>Previsualización — no constituye confirmación contable</div>
         <div class="text-[10px] text-slate-500 mb-1">Cálculo estimado en pantalla. El backend recalcula con precisión Decimal (4 decimales, ROUND_HALF_UP) y es la única autoridad.</div>
         ${previews.map(x => `<div class="font-mono text-[11px]">[${escapeHtml(x.codigo)}] CPP ${_fmt4(x.prev.cppActual)} &rarr; ${_fmt4(x.prev.cppResultante)} &bull; Stock ${x.prev.stockActual.toFixed(4)} &rarr; ${x.prev.stockResultante.toFixed(4)}</div>`).join('')}`
      : '';
  }
}

function renderErroresAjuste(errores) {
  const box = document.getElementById('ajusteErroresValidacion');
  if (!box) return;
  if (!errores || errores.length === 0) { box.innerHTML = ''; box.classList.add('hidden'); return; }
  box.innerHTML = `<ul class="list-disc pl-4 space-y-0.5">${errores.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`;
  box.classList.remove('hidden');
}

// Helper seguro de notificaciones Toast (no bloqueante)
function showToast(message, type = 'info') {
  try {
    let container = document.getElementById('appToastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'appToastContainer';
      container.className = 'fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    const bg = type === 'success' ? 'bg-emerald-600' : (type === 'error' ? 'bg-rose-600' : 'bg-slate-800');
    toast.className = `${bg} text-white px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold flex items-center gap-2 pointer-events-auto transition-all duration-300 transform translate-y-2 opacity-0`;
    const icon = type === 'success' ? '<i class="fa-solid fa-circle-check"></i>' : (type === 'error' ? '<i class="fa-solid fa-circle-exclamation"></i>' : '<i class="fa-solid fa-circle-info"></i>');
    toast.innerHTML = `${icon} <span>${escapeHtml(String(message || ''))}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
      toast.classList.add('translate-y-0', 'opacity-100');
    });
    setTimeout(() => {
      toast.classList.remove('translate-y-0', 'opacity-100');
      toast.classList.add('translate-y-2', 'opacity-0');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  } catch (e) {
    console.log(`[Toast ${type}]:`, message);
  }
}
window.showToast = showToast;

async function saveAjuste(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();

  // Bloqueo de doble envío mientras una operación está en curso
  if (AppState.ajusteGuardando) {
    showToast('Ya hay un ajuste en proceso de guardado. Espere la respuesta del servidor.', 'info');
    return;
  }

  const form = leerFormularioAjusteDOM();
  const errores = validarFormularioAjuste(form);
  if (errores.length > 0) {
    renderErroresAjuste(errores);
    showToast(errores[0], 'error');
    return;
  }
  renderErroresAjuste([]);

  // Clave de idempotencia de ESTA operación (se conserva ante reintentos del mismo formulario)
  if (!AppState.ajusteIdempotencyKey) {
    AppState.ajusteIdempotencyKey = generarIdempotencyKeyAjuste();
  }
  const payload = construirPayloadAjuste(form, AppState.ajusteIdempotencyKey);

  const btnGuardar = document.getElementById('btnGuardarAjuste');
  AppState.ajusteGuardando = true;
  AppState.ajusteUIEstado = 'guardando';
  if (btnGuardar) {
    btnGuardar.disabled = true;
    btnGuardar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
  }

  try {
    const res = await fetch('/api/inventario/ajustes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error((data && data.error) || 'Error al procesar el ajuste de inventario');
    }

    const ajusteId = data.id || data.ajuste_id;
    AppState.ajusteUIEstado = 'guardado';

    if (data.duplicado_ignorado) {
      showToast(`La operación ya fue procesada previamente (Ajuste ${data.numero_ajuste || ''}). No se creó un duplicado.`, 'info');
    } else {
      showToast(`Ajuste ${data.numero_ajuste || ''} aplicado con éxito`, 'success');
    }

    // La clave queda consumida: un nuevo ajuste nunca la reutilizará
    AppState.ajusteIdempotencyKey = null;

    closeAjusteModal();

    if (ajusteId) {
      try {
        await abrirComprobanteAjuste(ajusteId);
      } catch (printErr) {
        console.error('Error al abrir comprobante oficial tras guardado:', printErr);
      }
    }

    try {
      if (typeof cargarHistorialAjustes === 'function') {
        await cargarHistorialAjustes();
      }
    } catch (histErr) {
      console.warn('No se pudo refrescar el historial de ajustes:', histErr);
    }

    try {
      await loadProductos();
      await loadDashboard();
      await loadDatabaseStatus();
      if (typeof loadReporteKardex === 'function' && AppState.currentView === 'reportes') {
        loadReporteKardex();
      }
    } catch (auxErr) {
      console.warn('No se pudo refrescar catálogo o dashboard:', auxErr);
    }

  } catch (err) {
    AppState.ajusteUIEstado = 'error';
    showToast(err.message || 'Error al procesar el ajuste', 'error');
    renderErroresAjuste([err.message || 'Error al procesar el ajuste']);
  } finally {
    AppState.ajusteGuardando = false;
    if (btnGuardar) {
      btnGuardar.disabled = false;
      btnGuardar.innerHTML = '<i class="fa-solid fa-check"></i> <span>Confirmar y Aplicar Ajuste</span>';
    }
  }
}

// ========================================================
// FASE 2E-3: GESTIÓN E HISTORIAL DE AJUSTES DE INVENTARIO
// ========================================================

AppState.productoSubtab = 'catalogo';
AppState.historialAjustes = [];

function cambiarSubtabProductos(subtab) {
  AppState.productoSubtab = subtab;
  const containerCatalogo = document.getElementById('subtabProdCatalogoContainer');
  const containerAjustes = document.getElementById('subtabProdAjustesContainer');
  const containerIa = document.getElementById('subtabProdIaContainer');
  const btnCatalogo = document.getElementById('btnSubtabProdCatalogo');
  const btnAjustes = document.getElementById('btnSubtabProdAjustes');
  const btnIa = document.getElementById('btnSubtabProdIa');

  const inactiveClass = 'px-4 py-2 rounded-xl text-sm font-semibold transition flex items-center bg-white text-slate-600 hover:bg-slate-50 border border-slate-200 shadow-2xs';
  const activeClass = 'px-4 py-2 rounded-xl text-sm font-bold shadow-xs transition flex items-center btn-theme-primary text-white';

  if (btnCatalogo) btnCatalogo.className = inactiveClass;
  if (btnAjustes) btnAjustes.className = inactiveClass;
  if (btnIa) btnIa.className = inactiveClass;

  if (containerCatalogo) containerCatalogo.classList.add('hidden');
  if (containerAjustes) containerAjustes.classList.add('hidden');
  if (containerIa) containerIa.classList.add('hidden');

  if (subtab === 'ajustes') {
    if (containerAjustes) containerAjustes.classList.remove('hidden');
    if (btnAjustes) btnAjustes.className = activeClass;
    cargarHistorialAjustes();
  } else if (subtab === 'ia') {
    if (containerIa) containerIa.classList.remove('hidden');
    if (btnIa) btnIa.className = activeClass;
    cargarDiagnosticoIaInventario();
  } else {
    if (containerCatalogo) containerCatalogo.classList.remove('hidden');
    if (btnCatalogo) btnCatalogo.className = activeClass;
    loadProductos();
  }
}

function formatMotivoAjuste(motivo) {
  if (!motivo) return 'General';
  const cfgCanon = obtenerConfigSubtipoAjuste(motivo);
  if (cfgCanon) return cfgCanon.label;
  const m = String(motivo).toLowerCase().trim();
  if (m === 'sobrante') return 'Sobrante físico';
  if (m === 'regularizacion') return 'Regularización';
  if (m === 'merma') return 'Merma operativa';
  if (m === 'vencimiento') return 'Vencimiento';
  if (m === 'rotura') return 'Rotura o daño';
  if (m === 'uso_interno') return 'Consumo / Uso interno';
  if (m === 'perdida_no_explicada') return 'Pérdida / Faltante';
  if (m === 'ajuste_manual') return 'Ajuste manual';
  if (m === 'inventario_inicial') return 'Inventario inicial';
  return motivo.charAt(0).toUpperCase() + motivo.slice(1);
}

async function cargarHistorialAjustes() {
  const loading = document.getElementById('ajustesLoadingState');
  const errorBox = document.getElementById('ajustesErrorState');
  const emptyBox = document.getElementById('ajustesEmptyState');
  const tableContainer = document.getElementById('ajustesTableContainer');

  if (loading) loading.classList.remove('hidden');
  if (errorBox) errorBox.classList.add('hidden');
  if (emptyBox) emptyBox.classList.add('hidden');
  if (tableContainer) tableContainer.classList.add('hidden');

  try {
    const res = await fetch('/api/inventario/ajustes');
    if (!res.ok) {
      throw new Error(`Error en el servidor al consultar ajustes (HTTP ${res.status})`);
    }
    const data = await res.json();
    AppState.historialAjustes = Array.isArray(data.ajustes) ? data.ajustes : [];

    if (loading) loading.classList.add('hidden');

    if (AppState.historialAjustes.length === 0) {
      if (emptyBox) emptyBox.classList.remove('hidden');
      if (tableContainer) tableContainer.classList.add('hidden');
      return;
    }

    if (emptyBox) emptyBox.classList.add('hidden');
    if (tableContainer) tableContainer.classList.remove('hidden');

    filtrarHistorialAjustes();
    // Enriquecimiento asíncrono de CPP anterior/nuevo por línea mediante el endpoint existente GET /api/inventario/ajustes/:id
    enriquecerHistorialAjustesCPP(AppState.historialAjustes).catch(e => console.warn('Enriquecimiento CPP de historial no disponible:', e));
  } catch (err) {
    console.error('Error cargando historial de ajustes:', err);
    if (loading) loading.classList.add('hidden');
    if (emptyBox) emptyBox.classList.add('hidden');
    if (tableContainer) tableContainer.classList.add('hidden');
    if (errorBox) {
      errorBox.classList.remove('hidden');
      const msg = document.getElementById('ajustesErrorMessage');
      if (msg) msg.textContent = err.message || 'No fue posible cargar el historial de ajustes.';
    }
  }
}

function filtrarHistorialAjustes() {
  const q = (document.getElementById('ajusteSearchInput')?.value || '').toLowerCase().trim();
  const fTipo = (document.getElementById('ajusteFilterTipo')?.value || '').toUpperCase().trim();
  const fMotivo = (document.getElementById('ajusteFilterMotivo')?.value || '').toLowerCase().trim();

  const totalOriginal = AppState.historialAjustes || [];
  if (totalOriginal.length === 0) {
    const emptyBox = document.getElementById('ajustesEmptyState');
    const tableContainer = document.getElementById('ajustesTableContainer');
    if (emptyBox) emptyBox.classList.remove('hidden');
    if (tableContainer) tableContainer.classList.add('hidden');
    return;
  }

  const filtrados = totalOriginal.filter(a => {
    if (fTipo && String(a.tipo_ajuste || '').toUpperCase() !== fTipo) return false;
    if (fMotivo) {
      const sub = String(a.subtipo_ajuste || '').toLowerCase();
      if (fMotivo === '__legacy__') {
        if (sub) return false;
      } else if (fMotivo === '__anulado__') {
        if (String(a.estado || 'activo').toLowerCase() !== 'anulado') return false;
      } else if (sub !== fMotivo && String(a.motivo || '').toLowerCase() !== fMotivo) {
        return false;
      }
    }
    if (q) {
      const num = String(a.numero_ajuste || '').toLowerCase();
      const mot = String(a.motivo || '').toLowerCase();
      const obs = String(a.observaciones || '').toLowerCase();
      const doc = String(a.documento_referencia || '').toLowerCase();
      const sub = String(a.subtipo_ajuste || '').toLowerCase();
      if (!num.includes(q) && !mot.includes(q) && !obs.includes(q) && !doc.includes(q) && !sub.includes(q)) return false;
    }
    return true;
  });

  renderHistorialAjustes(filtrados);
}

function limpiarFiltrosAjustes() {
  const searchInput = document.getElementById('ajusteSearchInput');
  const filterTipo = document.getElementById('ajusteFilterTipo');
  const filterMotivo = document.getElementById('ajusteFilterMotivo');
  if (searchInput) searchInput.value = '';
  if (filterTipo) filterTipo.value = '';
  if (filterMotivo) filterMotivo.value = '';
  filtrarHistorialAjustes();
}

function _resumenCPPHistorialAjuste(a) {
  const cache = AppState.ajustesDetalleCache || {};
  const det = cache[a.id];
  if (!det) return '<span class="text-slate-300" title="Cargando detalle CPP...">…</span>';
  const lineas = det.detalles || [];
  const conCpp = lineas.filter(d => d.cpp_anterior !== null && d.cpp_anterior !== undefined && d.cpp_nuevo !== null && d.cpp_nuevo !== undefined);
  if (lineas.length === 0) return '<span class="text-slate-400">—</span>';
  if (conCpp.length === 0) return '<span class="text-[10px] text-slate-400" title="Registro anterior a FASE 2F-5B: no almacenó instantánea CPP">N/D (histórico)</span>';
  if (lineas.length === 1) {
    const d = conCpp[0];
    return `<span class="font-mono text-[11px]">${Number(d.cpp_anterior).toFixed(4)} &rarr; <strong>${Number(d.cpp_nuevo).toFixed(4)}</strong></span>`;
  }
  return `<span class="text-[10px] text-slate-500">${lineas.length} líneas &bull; ver detalle</span>`;
}

async function enriquecerHistorialAjustesCPP(lista, limite = 60) {
  AppState.ajustesDetalleCache = AppState.ajustesDetalleCache || {};
  const pendientes = (lista || []).filter(a => a && a.id && !AppState.ajustesDetalleCache[a.id]).slice(0, limite);
  if (pendientes.length === 0) return 0;
  let cargados = 0;
  for (const a of pendientes) {
    try {
      const res = await fetch(`/api/inventario/ajustes/${a.id}`);
      if (res && res.ok) {
        AppState.ajustesDetalleCache[a.id] = await res.json();
        cargados++;
      }
    } catch (e) { /* tolerante: el historial sigue operativo sin CPP */ }
  }
  if (cargados > 0 && AppState.productoSubtab === 'ajustes') {
    try { filtrarHistorialAjustes(); } catch (e) {}
  }
  return cargados;
}

function renderHistorialAjustes(lista) {
  const tbody = document.getElementById('ajustesTableBody');
  const tableContainer = document.getElementById('ajustesTableContainer');
  const emptyBox = document.getElementById('ajustesEmptyState');

  if (!tbody) return;

  if (tableContainer) tableContainer.classList.remove('hidden');
  if (emptyBox) emptyBox.classList.add('hidden');

  if (!lista || lista.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" class="text-center py-10 text-slate-400">
          <i class="fa-solid fa-filter-circle-xmark text-2xl block mb-2 text-slate-300"></i>
          No se encontraron ajustes de inventario que coincidan con los filtros aplicados.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = lista.map(a => {
    const esCargo = String(a.tipo_ajuste || '').toUpperCase() === 'CARGO';
    const tipoBadge = esCargo
      ? `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-2xs"><i class="fa-solid fa-arrow-down text-[10px]"></i> CARGO</span>`
      : `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200 shadow-2xs"><i class="fa-solid fa-arrow-up text-[10px]"></i> DESCARGO</span>`;
    const subtipoTxt = a.subtipo_ajuste
      ? `<div class="font-mono text-[9px] text-slate-500 mt-1">${escapeHtml(a.subtipo_ajuste)}</div>`
      : `<div class="text-[9px] text-slate-400 mt-1" title="Registro previo a la taxonomía canónica">Sin subtipo (histórico)</div>`;

    const motivoLabel = formatMotivoAjuste(a.motivo);
    const fechaTexto = typeof formatFecha === 'function' ? formatFecha(a.fecha) : escapeHtml(a.fecha || '—');
    const totalItems = parseInt(a.total_items || 0);
    const totalCantidad = parseFloat(a.total_cantidad || 0).toFixed(2);
    const totalCosto = parseFloat(a.total_costo || 0).toFixed(2);
    const anulado = String(a.estado || 'activo').toLowerCase() === 'anulado';

    const estadoBadge = anulado
      ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200"><i class="fa-solid fa-ban text-[9px]"></i> ANULADO</span>`
      : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><i class="fa-solid fa-circle-check text-[9px]"></i> ACTIVO</span>`;

    const btnAnular = anulado ? '' : `
          <button type="button" onclick="anularAjusteInventarioUI(${a.id})" class="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-2.5 py-1.5 rounded-xl text-xs font-bold transition inline-flex items-center gap-1" title="Anular ajuste (solo si permanece en el tope de la secuencia)">
            <i class="fa-solid fa-ban"></i> Anular
          </button>`;

    return `
      <tr class="hover:bg-slate-50/80 transition-colors ${anulado ? 'opacity-70' : ''}">
        <td class="py-3 px-4 font-mono font-bold text-teal-800 whitespace-nowrap ${anulado ? 'line-through' : ''}">
          ${escapeHtml(a.numero_ajuste || '—')}
        </td>
        <td class="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
          ${fechaTexto}
        </td>
        <td class="py-3 px-4 text-center whitespace-nowrap">
          ${tipoBadge}
          ${subtipoTxt}
        </td>
        <td class="py-3 px-4 text-xs text-slate-800 font-medium">
          <div>${escapeHtml(motivoLabel)}</div>
          ${a.documento_referencia ? `<div class="text-[11px] text-indigo-700"><i class="fa-solid fa-paperclip text-[9px]"></i> ${escapeHtml(a.documento_referencia)}</div>` : ''}
          ${a.observaciones ? `<div class="text-[11px] text-slate-400 truncate max-w-xs" title="${escapeHtml(a.observaciones)}">${escapeHtml(a.observaciones)}</div>` : ''}
        </td>
        <td class="py-3 px-4 text-center font-mono text-xs font-semibold text-slate-700 whitespace-nowrap">
          ${totalItems} ítem${totalItems === 1 ? '' : 's'}
        </td>
        <td class="py-3 px-4 text-right font-mono text-xs font-bold text-slate-800 whitespace-nowrap">
          ${totalCantidad}
        </td>
        <td class="py-3 px-4 text-center whitespace-nowrap">
          ${_resumenCPPHistorialAjuste(a)}
        </td>
        <td class="py-3 px-4 text-right font-mono text-xs font-bold text-teal-700 whitespace-nowrap">
          $${totalCosto}
        </td>
        <td class="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
          Usuario #${escapeHtml(a.usuario_id || 1)}
        </td>
        <td class="py-3 px-4 text-center whitespace-nowrap">
          ${estadoBadge}
        </td>
        <td class="py-3 px-4 text-right whitespace-nowrap space-x-1">
          <button type="button" onclick="abrirComprobanteAjuste(${a.id})" class="bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 px-3 py-1.5 rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 shadow-2xs hover:shadow-xs">
            <i class="fa-solid fa-print"></i> Ver / Reimprimir
          </button>${btnAnular}
        </td>
      </tr>
    `;
  }).join('');
}

window.cambiarSubtabProductos = cambiarSubtabProductos;
window.cargarHistorialAjustes = cargarHistorialAjustes;
window.filtrarHistorialAjustes = filtrarHistorialAjustes;
window.limpiarFiltrosAjustes = limpiarFiltrosAjustes;


// ========================================================
// MÓDULO KARDEX OFICIAL V2 BASADO EN INVENTARIO_MOVIMIENTOS (FASE 2D)
// ========================================================

AppState.kardexVersion = 'v2'; // 'v2' (Oficial) o 'v1' (Legado)
AppState.kardexV2Data = null;

function switchKardexVersion(version) {
  AppState.kardexVersion = version;
  const btnV2 = document.getElementById('btnToggleKardexV2');
  const btnV1 = document.getElementById('btnToggleKardexV1');
  const contV2 = document.getElementById('kardexV2Container');
  const contV1 = document.getElementById('kardexV1Container');
  const badge = document.getElementById('kardexVersionBadge');

  if (version === 'v2') {
    if (btnV2) { btnV2.className = 'px-4 py-2 rounded-xl text-xs font-bold bg-teal-600 text-white shadow transition flex items-center gap-1.5'; }
    if (btnV1) { btnV1.className = 'px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition flex items-center gap-1.5'; }
    if (contV2) contV2.classList.remove('hidden');
    if (contV1) contV1.classList.add('hidden');
    if (badge) badge.innerHTML = '<i class="fa-solid fa-circle-check text-teal-600 mr-1"></i>Consultando Libro Mayor Persistente (inventario_movimientos)';
    loadReporteKardexV2();
  } else {
    if (btnV1) { btnV1.className = 'px-4 py-2 rounded-xl text-xs font-bold bg-sky-600 text-white shadow transition flex items-center gap-1.5'; }
    if (btnV2) { btnV2.className = 'px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition flex items-center gap-1.5'; }
    if (contV1) contV1.classList.remove('hidden');
    if (contV2) contV2.classList.add('hidden');
    if (badge) badge.innerHTML = '<i class="fa-solid fa-clock-rotate-left text-amber-500 mr-1"></i>Modo Legado V1 (Reconstrucción dinámica para compatibilidad)';
    loadReporteKardex();
  }
}

async function loadReporteKardexV2() {
  const prodSelect = document.getElementById('kardexV2ProductoSelect');
  const desde = document.getElementById('kardexV2DesdeInput')?.value || '';
  const hasta = document.getElementById('kardexV2HastaInput')?.value || '';
  const tipo = document.getElementById('kardexV2TipoSelect')?.value || '';
  const sentido = document.getElementById('kardexV2SentidoSelect')?.value || '';
  const prodId = prodSelect?.value || '';

  const params = new URLSearchParams();
  if (prodId) params.append('producto_id', prodId);
  if (desde) params.append('desde', desde);
  if (hasta) params.append('hasta', hasta);
  if (tipo) params.append('tipo_movimiento', tipo);
  if (sentido) params.append('sentido', sentido);
  params.append('limit', '200');

  try {
    const res = await fetch(`/api/reportes/kardex-v2?${params.toString()}`);
    if (!res.ok) return;
    const data = await res.json();
    AppState.kardexV2Data = data;

    // Poblar selector de productos si tiene una sola opción
    if (prodSelect && prodSelect.options.length <= 1 && data.productos) {
      let opts = '<option value="">Todos los productos</option>';
      data.productos.forEach(p => {
        const isSel = data.producto && data.producto.id === p.id ? 'selected' : '';
        opts += `<option value="${p.id}" ${isSel}>${escapeHtml(p.codigo)} - ${escapeHtml(p.nombre)} (Stock: ${p.stock})</option>`;
      });
      prodSelect.innerHTML = opts;
    }

    renderReporteKardexV2();
  } catch (err) {
    console.error("Error al cargar Kardex V2:", err);
  }
}

function resetFiltrosKardexV2() {
  const prodSelect = document.getElementById('kardexV2ProductoSelect');
  const desde = document.getElementById('kardexV2DesdeInput');
  const hasta = document.getElementById('kardexV2HastaInput');
  const tipo = document.getElementById('kardexV2TipoSelect');
  const sentido = document.getElementById('kardexV2SentidoSelect');

  if (prodSelect) prodSelect.value = '';
  if (desde) desde.value = '';
  if (hasta) hasta.value = '';
  if (tipo) tipo.value = '';
  if (sentido) sentido.value = '';

  loadReporteKardexV2();
}

function renderReporteKardexV2() {
  const data = AppState.kardexV2Data;
  if (!data) return;

  const r = data.resumen || {};
  const p = data.producto;
  const movs = data.movimientos || [];

  // Actualizar KPIs
  const elTotalMovs = document.getElementById('kardexV2TotalMovs');
  const elProdDesc = document.getElementById('kardexV2ProductoDesc');
  const elTotalEnt = document.getElementById('kardexV2TotalEntradas');
  const elValEnt = document.getElementById('kardexV2ValorEntradas');
  const elTotalSal = document.getElementById('kardexV2TotalSalidas');
  const elValSal = document.getElementById('kardexV2ValorSalidas');
  const elSaldo = document.getElementById('kardexV2SaldoActual');
  const elHeaderTitle = document.getElementById('kardexV2HeaderTitle');
  const elBadgeCount = document.getElementById('kardexV2CountBadge');

  if (elTotalMovs) elTotalMovs.textContent = r.total_movimientos || 0;
  if (elProdDesc) elProdDesc.textContent = p ? `${p.codigo} - ${p.nombre}` : 'Todos los productos';
  if (elTotalEnt) elTotalEnt.textContent = parseFloat(r.total_entradas || 0).toFixed(2);
  if (elValEnt) elValEnt.textContent = `Costo Valuado: $${parseFloat(r.total_costo_entradas || 0).toFixed(2)}`;
  if (elTotalSal) elTotalSal.textContent = parseFloat(r.total_salidas || 0).toFixed(2);
  if (elValSal) elValSal.textContent = `Costo Valuado: $${parseFloat(r.total_costo_salidas || 0).toFixed(2)}`;
  if (elSaldo) elSaldo.textContent = p ? parseFloat(r.stock_actual || 0).toFixed(2) : `${parseFloat(r.total_entradas - r.total_salidas || 0).toFixed(2)} (Neto)`;
  if (elHeaderTitle) elHeaderTitle.textContent = p ? `${p.codigo} - ${p.nombre}` : 'Todos los Productos';
  if (elBadgeCount) elBadgeCount.textContent = `${movs.length} movimiento(s)`;

  const tbody = document.getElementById('kardexV2TableBody');
  if (!tbody) return;

  if (movs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" class="text-center py-8 text-slate-400 italic">No se encontraron movimientos en inventario_movimientos con los filtros seleccionados.</td></tr>';
    return;
  }

  tbody.innerHTML = movs.map(m => {
    let badgeClass = 'bg-slate-100 text-slate-700';
    if (m.tipo_movimiento === 'compra') badgeClass = 'bg-emerald-100 text-emerald-800 font-bold';
    else if (m.tipo_movimiento === 'venta') badgeClass = 'bg-rose-100 text-rose-800 font-bold';
    else if (m.tipo_movimiento === 'cargo_ajuste') badgeClass = 'bg-blue-100 text-blue-800 font-bold';
    else if (m.tipo_movimiento.startsWith('descargo_')) badgeClass = 'bg-amber-100 text-amber-800 font-bold';
    else if (m.tipo_movimiento === 'devolucion_cliente') badgeClass = 'bg-cyan-100 text-cyan-800 font-bold';
    else if (m.tipo_movimiento === 'inventario_inicial') badgeClass = 'bg-indigo-100 text-indigo-800 font-bold';
    else if (m.tipo_movimiento === 'APERTURA_MIGRACION') badgeClass = 'bg-purple-100 text-purple-800 font-bold';

    const entStr = m.entrada > 0 ? parseFloat(m.entrada).toFixed(2) : '—';
    const salStr = m.salida > 0 ? parseFloat(m.salida).toFixed(2) : '—';
    const cUnitStr = `$${parseFloat(m.costo_unitario || 0).toFixed(2)}`;
    const cTotStr = `$${parseFloat(m.costo_total || 0).toFixed(2)}`;

    return `
      <tr class="hover:bg-slate-50 transition border-b border-slate-100 text-slate-800 text-xs">
        <td class="py-2 px-3 font-mono text-[11px]">${m.fecha}</td>
        <td class="py-2 px-3 font-medium text-slate-900"><span class="text-[10px] text-slate-500 font-mono">${escapeHtml(m.producto_codigo)}</span><br>${escapeHtml(m.producto_nombre)}</td>
        <td class="py-2 px-3"><span class="px-2 py-0.5 rounded text-[10px] ${badgeClass}">${escapeHtml(m.tipo_movimiento_label)}</span></td>
        <td class="py-2 px-3 font-mono font-bold text-slate-800">${escapeHtml(m.documento_numero)}</td>
        <td class="py-2 px-3 text-slate-600 max-w-xs truncate" title="${escapeHtml(m.motivo)}">${escapeHtml(m.motivo)}</td>
        <td class="py-2 px-2 text-right bg-emerald-50/50 text-emerald-900 font-bold">${entStr}</td>
        <td class="py-2 px-2 text-right bg-rose-50/50 text-rose-900 font-bold">${salStr}</td>
        <td class="py-2 px-2 text-right text-slate-600 font-mono">${cUnitStr}</td>
        <td class="py-2 px-2 text-right text-slate-900 font-mono font-semibold">${cTotStr}</td>
        <td class="py-2 px-2 text-right text-slate-400 font-mono">${parseFloat(m.stock_anterior).toFixed(2)}</td>
        <td class="py-2 px-2 text-right bg-teal-50/60 font-black text-teal-900 font-mono">${parseFloat(m.saldo).toFixed(2)}</td>
        <td class="py-2 px-2 text-center">
          <button type="button" onclick="verDetalleMovimientoKardex(${m.id})" class="text-teal-600 hover:text-teal-800 p-1 rounded transition" title="Ver detalle inmutable">
            <i class="fa-solid fa-circle-info text-sm"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function verDetalleMovimientoKardex(movId) {
  const mov = (AppState.kardexV2Data?.movimientos || []).find(m => m.id === movId);
  if (!mov) return;

  const container = document.getElementById('detalleMovimientoContenido');
  if (!container) return;

  container.innerHTML = `
    <div class="bg-slate-50 p-3 rounded-xl border border-slate-200 grid grid-cols-2 gap-2 text-xs">
      <div><span class="text-slate-400 font-semibold block">ID Asiento:</span> <strong class="text-slate-900 font-mono">#${mov.id}</strong></div>
      <div><span class="text-slate-400 font-semibold block">Fecha Operación:</span> <strong class="text-slate-900 font-mono">${mov.fecha}</strong></div>
      <div class="col-span-2"><span class="text-slate-400 font-semibold block">Producto:</span> <strong class="text-slate-900">${escapeHtml(mov.producto_codigo)} - ${escapeHtml(mov.producto_nombre)}</strong></div>
      <div><span class="text-slate-400 font-semibold block">Tipo Movimiento:</span> <strong class="text-teal-700">${escapeHtml(mov.tipo_movimiento_label)} (${mov.tipo_movimiento})</strong></div>
      <div><span class="text-slate-400 font-semibold block">Sentido:</span> <strong class="${mov.sentido === 'ENTRADA' ? 'text-emerald-700' : 'text-rose-700'}">${mov.sentido}</strong></div>
      <div><span class="text-slate-400 font-semibold block">Cantidad Afectada:</span> <strong class="text-slate-900">${parseFloat(mov.cantidad).toFixed(2)}</strong></div>
      <div><span class="text-slate-400 font-semibold block">Costo Unitario Registrado:</span> <strong class="text-slate-900 font-mono">$${parseFloat(mov.costo_unitario).toFixed(2)}</strong></div>
      <div><span class="text-slate-400 font-semibold block">Costo Total Valuado:</span> <strong class="text-slate-900 font-mono">$${parseFloat(mov.costo_total).toFixed(2)}</strong></div>
      <div><span class="text-slate-400 font-semibold block">Documento Referencia:</span> <strong class="text-slate-900 font-mono">${escapeHtml(mov.documento_tipo)} ${escapeHtml(mov.documento_numero)}</strong></div>
      <div class="col-span-2"><span class="text-slate-400 font-semibold block">Motivo / Observaciones:</span> <strong class="text-slate-700 font-normal">${escapeHtml(mov.motivo)}</strong></div>
      <div class="col-span-2 bg-white p-2.5 rounded-lg border border-slate-200 grid grid-cols-2 gap-2 text-center">
        <div><span class="text-[11px] text-slate-400 block">Stock Anterior</span><strong class="text-slate-700 text-sm font-mono">${parseFloat(mov.stock_anterior).toFixed(2)}</strong></div>
        <div><span class="text-[11px] text-teal-600 block">Saldo Resultante (Stock Nuevo)</span><strong class="text-teal-800 text-sm font-mono font-black">${parseFloat(mov.stock_nuevo).toFixed(2)}</strong></div>
      </div>
      <div class="col-span-2 text-[10px] text-slate-400 pt-1">
        Registrado por Usuario ID #${mov.usuario_id} | Timestamp Creación: ${mov.created_at || '—'}
      </div>
    </div>
  `;

  const modal = document.getElementById('modalDetalleMovimientoKardex');
  if (modal) modal.classList.remove('hidden');

  const accionesDiv = document.getElementById('kardexAjusteAcciones');
  const esAjuste = String(mov.documento_tipo).toUpperCase() === 'INVENTARIO_AJUSTE' || String(mov.documento_tipo).toUpperCase() === 'AJUSTE' || String(mov.documento_numero || '').startsWith('AJU-');
  if (accionesDiv) {
    if (esAjuste && mov.documento_id) {
      accionesDiv.classList.remove('hidden');
      const btnPrint = document.getElementById('btnImprimirDesdeKardex');
      if (btnPrint) {
        btnPrint.onclick = () => abrirComprobanteAjuste(mov.documento_id);
      }
    } else {
      accionesDiv.classList.add('hidden');
    }
  }
}

function cerrarModalDetalleMovimiento() {
  const modal = document.getElementById('modalDetalleMovimientoKardex');
  if (modal) modal.classList.add('hidden');
}

function imprimirKardexV2() {
  window.print();
}

// ========================================================
// FASE 2E-1: NÚCLEO TÉCNICO DE IMPRESIÓN DOCUMENTAL AISLADO
// ========================================================
const DocumentPrinter = {
  status: 'idle', // 'idle' | 'printing' | 'cleanup'
  _originalTitle: '',
  _cleanupTimer: null,
  _afterPrintHandler: null,

  FORMATS: {
    ticket80: {
      key: 'ticket80',
      name: 'Ticket Térmico 80mm',
      cssPage: '@page { size: 80mm auto; margin: 2mm 1mm; }',
      className: 'doc-ticket80'
    },
    letterPortrait: {
      key: 'letterPortrait',
      name: 'Carta Vertical (Portrait)',
      cssPage: '@page { size: letter portrait; margin: 12mm; }',
      className: 'doc-sheet doc-letterPortrait'
    },
    letterLandscape: {
      key: 'letterLandscape',
      name: 'Carta Horizontal (Landscape)',
      cssPage: '@page { size: letter landscape; margin: 10mm; }',
      className: 'doc-sheet doc-letterLandscape'
    },
    a4Portrait: {
      key: 'a4Portrait',
      name: 'A4 Vertical (Portrait)',
      cssPage: '@page { size: A4 portrait; margin: 12mm; }',
      className: 'doc-sheet doc-a4Portrait'
    },
    a4Landscape: {
      key: 'a4Landscape',
      name: 'A4 Horizontal (Landscape)',
      cssPage: '@page { size: A4 landscape; margin: 10mm; }',
      className: 'doc-sheet doc-a4Landscape'
    }
  },

  normalizeFormat: function(fmt) {
    if (!fmt) return 'letterPortrait';
    const s = String(fmt).trim().toLowerCase().replace(/[-_\s]/g, '');
    if (s === 'ticket80' || s === 'ticket' || s === 'pos' || s === '80mm') return 'ticket80';
    if (s === 'letterlandscape' || s === 'cartahorizontal' || s === 'letterh') return 'letterLandscape';
    if (s === 'letterportrait' || s === 'cartavertical' || s === 'carta' || s === 'letter') return 'letterPortrait';
    if (s === 'a4landscape' || s === 'a4horizontal' || s === 'a4h') return 'a4Landscape';
    if (s === 'a4portrait' || s === 'a4vertical' || s === 'a4') return 'a4Portrait';
    return this.FORMATS[fmt] ? fmt : 'letterPortrait';
  },

  escape: function(text) {
    if (text === null || text === undefined) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  getContainer: function() {
    let container = document.getElementById('areaImpresionOficial');
    if (!container) {
      container = document.createElement('div');
      container.id = 'areaImpresionOficial';
      container.className = 'hidden-on-screen';
      container.setAttribute('aria-hidden', 'true');
      document.body.appendChild(container);
    }
    return container;
  },

  print: function(options) {
    if (!options || typeof options !== 'object') {
      console.error('[DocumentPrinter] Error: opciones no especificadas.');
      return false;
    }

    if (this.status !== 'idle') {
      console.warn('[DocumentPrinter] Impresión en curso o limpieza pendiente. Intento ignorado.');
      return false;
    }

    this.status = 'printing';

    const fmtKey = this.normalizeFormat(options.type || options.page || 'letterPortrait');
    const formatConfig = this.FORMATS[fmtKey] || this.FORMATS.letterPortrait;

    const container = this.getContainer();
    const docTitle = options.title ? String(options.title).trim() : 'Documento';

    // 1. Guardar título original y cambiarlo temporalmente para el PDF / Spooler
    this._originalTitle = document.title;
    try {
      document.title = docTitle;
    } catch (e) {}

    // 2. Inyectar regla @page dinámica para garantizar el formato exacto en Chromium/Firefox
    let pageStyleEl = document.getElementById('documentPrinterPageStyle');
    if (!pageStyleEl) {
      pageStyleEl = document.createElement('style');
      pageStyleEl.id = 'documentPrinterPageStyle';
      document.head.appendChild(pageStyleEl);
    }
    pageStyleEl.innerHTML = formatConfig.cssPage;

    // 3. Preparar contenedor oficial de impresión
    container.className = formatConfig.className;
    container.innerHTML = options.html || '<p>Documento vacío</p>';

    // 4. Activar aislamiento documental en el body
    document.body.classList.add('document-printing');

    // 5. Función de limpieza segura e idempotente
    const self = this;
    let cleaned = false;
    const cleanup = function() {
      if (cleaned) return;
      cleaned = true;
      self.status = 'cleanup';

      if (self._cleanupTimer) {
        clearTimeout(self._cleanupTimer);
        self._cleanupTimer = null;
      }

      if (self._afterPrintHandler) {
        window.removeEventListener('afterprint', self._afterPrintHandler);
        self._afterPrintHandler = null;
      }

      // Desactivar clase de aislamiento
      document.body.classList.remove('document-printing');

      // Vaciar contenedor oficial
      if (container) {
        container.innerHTML = '';
        container.className = 'hidden-on-screen';
      }

      // Remover estilo @page dinámico
      if (pageStyleEl) {
        if (typeof pageStyleEl.remove === 'function') {
          pageStyleEl.remove();
        } else if (pageStyleEl.parentNode) {
          pageStyleEl.parentNode.removeChild(pageStyleEl);
        }
      }

      // Restaurar título del documento
      try {
        document.title = self._originalTitle || 'Sistema de Control';
      } catch (e) {}

      self.status = 'idle';
      console.log(`[DocumentPrinter] Ciclo de impresión finalizado (${fmtKey}). Estado restaurado.`);
    };

    this._afterPrintHandler = cleanup;
    window.addEventListener('afterprint', cleanup, { once: true });

    // Temporizador de respaldo por si afterprint no dispara (ej. navegadores antiguos o cierre forzado)
    this._cleanupTimer = setTimeout(function() {
      if (self.status !== 'idle') {
        cleanup();
      }
    }, 15000);

    // 6. Lanzar impresión tras permitir al DOM procesar los estilos
    setTimeout(function() {
      try {
        window.print();
      } catch (err) {
        console.error('[DocumentPrinter] Error al invocar window.print():', err);
        cleanup();
      }
    }, 50);

    return true;
  }
};

// Exponer globalmente para la aplicación
window.DocumentPrinter = DocumentPrinter;

// ========================================================
// FASE 2E-1: FUNCIÓN DE PRUEBA SINTÉTICA (testPrintCore)
// Invocable desde la consola del navegador para verificar
// los 5 formatos de página sin alterar datos reales.
// ========================================================
window.testPrintCore = function(format) {
  const fmtKey = DocumentPrinter.normalizeFormat(format || 'letterPortrait');
  const fmtConfig = DocumentPrinter.FORMATS[fmtKey];

  console.log(`[testPrintCore] Iniciando prueba sintética para formato: ${fmtKey} (${fmtConfig.name})...`);

  let testHtml = '';

  if (fmtKey === 'ticket80') {
    testHtml = `
      <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px;">
        <h2 style="margin: 0; font-size: 15px; font-weight: 900; text-transform: uppercase;">EMPRESA DE PRUEBA S.A.</h2>
        <p style="margin: 2px 0; font-size: 10px;">RIF: J-99999999-9 &bull; Tel: +58 412 0000000</p>
        <p style="margin: 2px 0; font-size: 10px;">Calle Ficticia Edif. Demo Piso 1</p>
        <div style="margin-top: 6px; font-weight: bold; font-size: 12px; border: 1px solid #000; padding: 2px 4px; display: inline-block;">
          TICKET PRUEBA #${Math.floor(1000 + Math.random() * 9000)}
        </div>
        <p style="margin: 4px 0 0 0; font-size: 9px; color: #333;">Fecha: ${new Date().toLocaleString('es-VE')}</p>
      </div>

      <div style="font-size: 10px; margin-bottom: 8px; border-bottom: 1px solid #000; padding-bottom: 6px;">
        <div><strong>Cliente:</strong> CLIENTE SINTÉTICO DEMO</div>
        <div><strong>Doc:</strong> V-99887766 &bull; <strong>Condición:</strong> CONTADO</div>
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 8px;">
        <thead>
          <tr style="border-bottom: 1px solid #000;">
            <th style="text-align: left; padding: 2px 0;">Cant</th>
            <th style="text-align: left; padding: 2px 0;">Descripción</th>
            <th style="text-align: right; padding: 2px 0;">P.U ($)</th>
            <th style="text-align: right; padding: 2px 0;">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 2px 0;">2.00</td>
            <td style="padding: 2px 0;">Producto Sintético Alfa</td>
            <td style="text-align: right; padding: 2px 0;">15.00</td>
            <td style="text-align: right; padding: 2px 0;">30.00</td>
          </tr>
          <tr>
            <td style="padding: 2px 0;">1.00</td>
            <td style="padding: 2px 0;">Servicio de Prueba Beta</td>
            <td style="text-align: right; padding: 2px 0;">45.00</td>
            <td style="text-align: right; padding: 2px 0;">45.00</td>
          </tr>
          <tr>
            <td style="padding: 2px 0;">3.00</td>
            <td style="padding: 2px 0;">Insumo Sintético Gamma</td>
            <td style="text-align: right; padding: 2px 0;">8.50</td>
            <td style="text-align: right; padding: 2px 0;">25.50</td>
          </tr>
        </tbody>
      </table>

      <div style="border-top: 1px solid #000; padding-top: 6px; font-size: 10px; line-height: 1.4;">
        <div style="display: flex; justify-content: space-between;">
          <span>Subtotal:</span><strong>$100.50</strong>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>IVA (16%):</span><strong>$16.08</strong>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: bold; border-top: 1px dashed #000; margin-top: 4px; padding-top: 4px;">
          <span>TOTAL USD:</span><span>$116.58</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10px; color: #333;">
          <span>Total en Bs (Tasa 45.00):</span><strong>5,246.10 Bs.</strong>
        </div>
      </div>

      <div class="avoid-page-break" style="margin-top: 12px; text-align: center; font-size: 9px; color: #555; border-top: 1px dashed #999; padding-top: 6px;">
        <p style="margin: 0;">*** PRUEBA DE NÚCLEO DE IMPRESIÓN (FASE 2E-1) ***</p>
        <p style="margin: 2px 0;">Comprobante sintético sin validez comercial.</p>
      </div>
    `;
  } else {
    // Documento multipágina tipo Hoja (Carta o A4, Vertical u Horizontal)
    const isLandscape = fmtKey.includes('Landscape');

    let rowsHtml = '';
    for (let i = 1; i <= 35; i++) {
      rowsHtml += `
        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 10px;">
          <td style="padding: 5px 8px; font-family: monospace;">#00${i}</td>
          <td style="padding: 5px 8px; font-weight: 600;">Ítem de Prueba Sintética N° ${i}</td>
          <td style="padding: 5px 8px; color: #64748b;">Lote-DEMO-${100 + i}</td>
          <td style="padding: 5px 8px; text-align: right; font-weight: bold;">${(i * 1.5).toFixed(2)}</td>
          <td style="padding: 5px 8px; text-align: right;">$${(10.0 + i * 2.5).toFixed(2)}</td>
          <td style="padding: 5px 8px; text-align: right; font-weight: bold;">$${((i * 1.5) * (10.0 + i * 2.5)).toFixed(2)}</td>
          ${isLandscape ? `<td style="padding: 5px 8px; text-align: center; color: #0284c7;">Aprobado</td><td style="padding: 5px 8px; font-size: 9px; color: #94a3b8;">Verificado Ok</td>` : ''}
        </tr>
      `;
    }

    testHtml = `
      <div style="border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <h1 style="margin: 0; font-size: 18px; font-weight: 900; color: #0f172a; text-transform: uppercase;">
            CORPORACIÓN SINTÉTICA DEMO C.A.
          </h1>
          <p style="margin: 2px 0; font-size: 11px; color: #475569;">RIF: J-12345678-0 &bull; Dirección: Zona Industrial Norte Galpón 4</p>
          <p style="margin: 2px 0; font-size: 11px; color: #475569;">Teléfono: +58 212 555-0000 &bull; Email: auditoria@empresa-demo.com</p>
        </div>
        <div style="text-align: right;">
          <div style="display: inline-block; background: #0f172a; color: #ffffff; font-size: 10px; font-weight: bold; padding: 4px 10px; border-radius: 4px; text-transform: uppercase;">
            REPORTE SINTÉTICO MULTIPÁGINA
          </div>
          <p style="margin: 4px 0 0 0; font-size: 10px; color: #64748b;"><strong>Formato:</strong> ${fmtConfig.name}</p>
          <p style="margin: 2px 0 0 0; font-size: 10px; color: #64748b;"><strong>Emisión:</strong> ${new Date().toLocaleString('es-VE')}</p>
        </div>
      </div>

      <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; margin-bottom: 14px; font-size: 11px; display: grid; grid-template-columns: repeat(${isLandscape ? 4 : 3}, 1fr); gap: 8px;">
        <div><strong style="color: #64748b;">Entorno de Prueba:</strong> FASE 2E-1 Núcleo</div>
        <div><strong style="color: #64748b;">Total Registros:</strong> 35 filas de prueba</div>
        <div><strong style="color: #64748b;">Objetivo:</strong> Repetición thead y salto limpio</div>
        ${isLandscape ? '<div><strong style="color: #64748b;">Orientación:</strong> Horizontal (Landscape)</div>' : ''}
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 14px;">
        <thead style="display: table-header-group; background: #0f172a; color: #ffffff;">
          <tr style="font-size: 10px; text-transform: uppercase;">
            <th style="padding: 6px 8px; text-align: left;">Cód</th>
            <th style="padding: 6px 8px; text-align: left;">Descripción del Ítem</th>
            <th style="padding: 6px 8px; text-align: left;">Lote</th>
            <th style="padding: 6px 8px; text-align: right;">Cantidad</th>
            <th style="padding: 6px 8px; text-align: right;">Costo ($)</th>
            <th style="padding: 6px 8px; text-align: right;">Total ($)</th>
            ${isLandscape ? '<th style="padding: 6px 8px; text-align: center;">Estado</th><th style="padding: 6px 8px; text-align: left;">Auditoría</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <div class="avoid-page-break" style="margin-top: 16px; border-top: 2px solid #0f172a; padding-top: 10px; display: flex; justify-content: space-between; align-items: flex-start; font-size: 11px;">
        <div style="max-width: 50%;">
          <p style="margin: 0; font-weight: bold; color: #0f172a;">NOTAS DE CERTIFICACIÓN DE PRUEBA:</p>
          <p style="margin: 4px 0 0 0; font-size: 10px; color: #64748b; line-height: 1.3;">
            Este documento sintético comprueba que las tablas multipágina repiten la cabecera &lt;thead&gt; al cambiar de hoja y que las firmas finales y totales no sufren cortes ni desbordes de scroll.
          </p>
        </div>
        <div style="text-align: right; min-width: 220px;">
          <div style="display: flex; justify-content: space-between; padding: 2px 0;">
            <span style="color: #64748b;">Total Unidades:</span>
            <strong>945.00</strong>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 2px 0; border-top: 1px solid #cbd5e1; margin-top: 4px; font-size: 13px; font-weight: 900; color: #0f172a;">
            <span>TOTAL SINTÉTICO:</span>
            <span>$48,720.00</span>
          </div>
        </div>
      </div>

      <div class="avoid-page-break" style="margin-top: 36px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center; font-size: 10px; color: #475569;">
        <div>
          <div style="border-top: 1px solid #475569; width: 80%; margin: 0 auto; padding-top: 4px; font-weight: bold;">
            RESPONSABLE DE EMISIÓN
          </div>
          <span>Operador Sistema</span>
        </div>
        <div>
          <div style="border-top: 1px solid #475569; width: 80%; margin: 0 auto; padding-top: 4px; font-weight: bold;">
            AUDITORÍA Y CONTROL
          </div>
          <span>Revisión Conforme</span>
        </div>
      </div>
    `;
  }

  return DocumentPrinter.print({
    type: fmtKey,
    title: `Prueba Sintetica - ${fmtConfig.name}`,
    html: testHtml
  });
};

// ========================================================
// FASE 2E-2: PLANTILLAS DOCUMENTALES (DocumentTemplates)
// Separación entre lógica de presentación y motor de impresión
// ========================================================
const DocumentTemplates = {
  // Factura en Formato Ticket Térmico 80mm
  facturaTicket: function(f, config) {
    if (!f) return '<p>Error: Datos de factura no disponibles.</p>';
    const cfg = config || {};
    const esc = DocumentPrinter.escape;
    const isAnulada = String(f.estado).toLowerCase() === 'anulada';
    const isCredito = String(f.tipo_venta).toLowerCase() === 'credito';

    // 1. Marca de agua / Banner para Factura Anulada
    let anuladaHtml = '';
    if (isAnulada) {
      anuladaHtml = `
        <div style="border: 2px dashed #dc2626; background: #fef2f2; color: #dc2626; padding: 6px; text-align: center; font-weight: 900; font-size: 11px; margin-bottom: 6px;">
          *** FACTURA ANULADA ***<br><span style="font-size: 9px; font-weight: normal;">SIN VALIDEZ FISCAL NI COMERCIAL</span>
        </div>
      `;
    }

    // 2. Encabezado de la Empresa
    let headerHtml = `
      <div class="doc-ticket-header" style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
        ${anuladaHtml}
        <img id="businessLogoPlaceholder" class="hidden" src="" alt="Logo" style="max-height: 48px; max-width: 140px; margin: 0 auto 4px auto; display: none;">
        <h2 style="margin: 0; font-size: 14px; font-weight: 900; text-transform: uppercase;">${esc(cfg.nombre_negocio || 'Mi Negocio Comercial')}</h2>
        ${cfg.documento_fiscal ? `<p style="margin: 2px 0; font-size: 10px;">RIF: ${esc(cfg.documento_fiscal)}</p>` : ''}
        ${cfg.telefono ? `<p style="margin: 2px 0; font-size: 10px;">Tel: ${esc(cfg.telefono)}</p>` : ''}
        ${cfg.direccion ? `<p style="margin: 2px 0; font-size: 9px; color: #333;">${esc(cfg.direccion)}</p>` : ''}
        <div style="margin: 4px 0; display: inline-block; border: 1px solid #000; padding: 2px 6px; font-weight: 900; font-size: 11px;">
          FACTURA #${esc(f.numero_factura)}
        </div>
        <p style="margin: 2px 0 0 0; font-size: 9px; color: #444;">Fecha: ${typeof formatFecha === 'function' ? formatFecha(f.fecha) : esc(f.fecha)}</p>
      </div>
    `;

    // 3. Datos del Cliente y Condición de Venta
    let clientHtml = `
      <div style="font-size: 10px; border-bottom: 1px dashed #000; padding-bottom: 5px; margin-bottom: 5px; line-height: 1.35;">
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #444;">Cliente:</span>
          <strong>${esc(f.cliente_nombre || 'Consumidor Final')}</strong>
        </div>
        ${f.cliente_cedula ? `
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #444;">Doc / RIF:</span>
            <span>${esc(f.cliente_cedula)}</span>
          </div>
        ` : ''}
        ${f.cliente_telefono ? `
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #444;">Teléfono:</span>
            <span>${esc(f.cliente_telefono)}</span>
          </div>
        ` : ''}
        <div style="display: flex; justify-content: space-between; border-top: 1px dotted #ccc; margin-top: 3px; padding-top: 3px;">
          <span style="color: #444;">Condición:</span>
          <strong style="${isCredito ? 'color: #b45309;' : 'color: #047857;'}">${isCredito ? 'A CRÉDITO' : 'AL CONTADO'}</strong>
        </div>
        ${isCredito && f.fecha_vencimiento ? `
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #444;">Vencimiento:</span>
            <span>${typeof formatFecha === 'function' ? formatFecha(f.fecha_vencimiento) : esc(f.fecha_vencimiento)}</span>
          </div>
        ` : ''}
        ${isCredito && f.saldo_pendiente !== undefined ? `
          <div style="display: flex; justify-content: space-between; font-weight: bold; color: #b91c1c;">
            <span>Saldo por Cobrar:</span>
            <span>$${parseFloat(f.saldo_pendiente || 0).toFixed(2)}</span>
          </div>
        ` : ''}
      </div>
    `;

    // 4. Detalle de Ítems
    const detalles = f.detalles || f.items || [];
    let itemsRows = '';
    detalles.forEach(d => {
      const nombre = esc(d.nombre || d.nombre_producto || 'Producto');
      const codigo = d.codigo ? `[${esc(d.codigo)}] ` : '';
      const imp = d.impuesto_tipo === 'gravado' ? '(G)' : '(E)';
      const cant = parseFloat(d.cantidad || 0).toFixed(2);
      const pu = parseFloat(d.precio_unitario || 0).toFixed(2);
      const tot = parseFloat(d.total || 0).toFixed(2);

      itemsRows += `
        <tr style="border-bottom: 1px dotted #e5e7eb;">
          <td style="padding: 3px 0; vertical-align: top;">${cant}</td>
          <td style="padding: 3px 4px; vertical-align: top;">${codigo}${nombre} <small style="color: #666;">${imp}</small></td>
          <td style="padding: 3px 0; text-align: right; vertical-align: top;">$${pu}</td>
          <td style="padding: 3px 0; text-align: right; vertical-align: top; font-weight: bold;">$${tot}</td>
        </tr>
      `;
    });

    let itemsTableHtml = `
      <table style="width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 6px;">
        <thead>
          <tr style="border-bottom: 1px solid #000; font-size: 9px; text-transform: uppercase;">
            <th style="text-align: left; padding: 2px 0;">Cant</th>
            <th style="text-align: left; padding: 2px 4px;">Descripción</th>
            <th style="text-align: right; padding: 2px 0;">P.U</th>
            <th style="text-align: right; padding: 2px 0;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>
    `;

    // 5. Totales y Equivalencias
    const subtotal = parseFloat(f.subtotal || 0).toFixed(2);
    const iva = parseFloat(f.iva_total || 0).toFixed(2);
    const totalUsd = parseFloat(f.total_usd || 0).toFixed(2);
    const totalVes = parseFloat(f.total_ves || 0).toFixed(2);
    const totalCop = Math.round(f.total_cop || 0).toLocaleString('es-CO');
    const tasaVes = parseFloat(f.tasa_ves || 0).toFixed(2);
    const tasaCop = Math.round(f.tasa_cop || 0).toLocaleString('es-CO');

    let totalsHtml = `
      <div style="border-top: 1px solid #000; padding-top: 5px; margin-bottom: 6px; font-size: 10px; line-height: 1.4;">
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #444;">Subtotal:</span>
          <span>$${subtotal}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #444;">IVA (16%):</span>
          <span>$${iva}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 900; border-top: 1px dashed #000; margin-top: 3px; padding-top: 3px;">
          <span>TOTAL USD:</span>
          <span>$${totalUsd}</span>
        </div>
        ${parseFloat(totalVes) > 0 ? `
          <div style="display: flex; justify-content: space-between; font-size: 9px; color: #333;">
            <span>Total Bs (Tasa ${tasaVes}):</span>
            <strong>${totalVes} Bs.</strong>
          </div>
        ` : ''}
        ${parseFloat(f.total_cop || 0) > 0 ? `
          <div style="display: flex; justify-content: space-between; font-size: 9px; color: #333;">
            <span>Total COP (Tasa ${tasaCop}):</span>
            <strong>${totalCop} COP</strong>
          </div>
        ` : ''}
      </div>
    `;

    // 6. Desglose de Pagos
    const pagos = f.pagos || [];
    let paymentsRows = '';
    if (pagos.length > 0) {
      pagos.forEach(p => {
        const metodo = esc(p.metodo || 'Pago');
        const moneda = esc(p.moneda || 'USD');
        const montoMoneda = parseFloat(p.monto_moneda || 0).toLocaleString('es-VE');
        const eqUsd = parseFloat(p.equivalente_usd || 0).toFixed(2);
        const ref = p.referencia ? ` (Ref: ${esc(p.referencia)})` : '';
        paymentsRows += `
          <div style="display: flex; justify-content: space-between; font-size: 9px; color: #333;">
            <span>&bull; ${metodo} (${moneda}):</span>
            <span><strong>${montoMoneda} ${moneda}</strong> (≈ $${eqUsd})${ref}</span>
          </div>
        `;
      });
    } else {
      paymentsRows = `<div style="font-size: 9px; color: #666; font-style: italic;">Sin abono inicial / Total a crédito</div>`;
    }

    let paymentsHtml = `
      <div style="border-top: 1px dotted #999; padding-top: 4px; margin-bottom: 6px;">
        <span style="font-size: 9px; font-weight: bold; text-transform: uppercase; color: #444; display: block; margin-bottom: 2px;">Pagos Registrados:</span>
        ${paymentsRows}
      </div>
    `;

    // 7. Observaciones
    let notasHtml = '';
    if (f.notas && String(f.notas).trim()) {
      notasHtml = `
        <div style="border-top: 1px dotted #999; padding-top: 4px; margin-bottom: 6px; font-size: 9px; color: #333;">
          <strong>Notas:</strong> ${esc(f.notas)}
        </div>
      `;
    }

    // 8. Pie de Ticket
    let footerHtml = `
      <div class="avoid-page-break" style="border-top: 1px dashed #000; padding-top: 6px; text-align: center; font-size: 9px; color: #555;">
        <p style="margin: 0; font-weight: bold;">¡Gracias por su compra y confianza!</p>
        <p style="margin: 2px 0 0 0;">Comprobante generado electrónicamente.</p>
      </div>
    `;

    return `
      <div class="doc-factura doc-factura-ticket">
        ${headerHtml}
        ${clientHtml}
        ${itemsTableHtml}
        ${totalsHtml}
        ${paymentsHtml}
        ${notasHtml}
        ${footerHtml}
      </div>
    `;
  },

  // Factura Comercial en Hoja Completa (Carta / A4 Vertical)
  facturaHoja: function(f, config, paperFormat) {
    if (!f) return '<p>Error: Datos de factura no disponibles.</p>';
    const cfg = config || {};
    const esc = DocumentPrinter.escape;
    const isAnulada = String(f.estado).toLowerCase() === 'anulada';
    const isCredito = String(f.tipo_venta).toLowerCase() === 'credito';

    // 1. Banner Anulada
    let anuladaBanner = '';
    if (isAnulada) {
      anuladaBanner = `
        <div class="doc-anulada-banner">
          *** DOCUMENTO ANULADO &bull; SIN VALIDEZ FISCAL NI COMERCIAL ***
        </div>
      `;
    }

    // 2. Encabezado Corporativo
    let headerHtml = `
      <div class="doc-header">
        <div style="max-width: 60%;">
          <img id="businessLogoPlaceholder" class="hidden" src="" alt="Logo" style="max-height: 56px; max-width: 180px; margin-bottom: 6px; display: none;">
          <h1 class="doc-company-title">${esc(cfg.nombre_negocio || 'Mi Negocio Comercial')}</h1>
          ${cfg.documento_fiscal ? `<p style="margin: 2px 0; font-size: 11px; font-weight: bold; color: #475569;">RIF: ${esc(cfg.documento_fiscal)}</p>` : ''}
          ${cfg.direccion ? `<p style="margin: 2px 0; font-size: 11px; color: #64748b;">${esc(cfg.direccion)}</p>` : ''}
          ${cfg.telefono ? `<p style="margin: 2px 0; font-size: 11px; color: #64748b;">Teléfono: ${esc(cfg.telefono)}</p>` : ''}
        </div>
        <div style="text-align: right;">
          <div class="doc-invoice-badge">
            <span style="font-size: 12px; font-weight: 800; letter-spacing: 1px; display: block;">FACTURA DE VENTA</span>
            <span style="font-size: 15px; font-weight: 900; font-family: monospace;">N° ${esc(f.numero_factura)}</span>
          </div>
          <div style="margin-top: 6px; font-size: 10px; color: #475569; line-height: 1.4;">
            <p style="margin: 0;"><strong>Fecha de Emisión:</strong> ${typeof formatFecha === 'function' ? formatFecha(f.fecha) : esc(f.fecha)}</p>
            <p style="margin: 0;"><strong>Condición:</strong> <span style="font-weight: 800; ${isCredito ? 'color: #b45309;' : 'color: #047857;'}">${isCredito ? 'A CRÉDITO' : 'AL CONTADO'}</span></p>
            ${isCredito && f.fecha_vencimiento ? `<p style="margin: 0;"><strong>Vencimiento:</strong> ${typeof formatFecha === 'function' ? formatFecha(f.fecha_vencimiento) : esc(f.fecha_vencimiento)}</p>` : ''}
          </div>
        </div>
      </div>
    `;

    // 3. Ficha del Cliente
    let clientCardHtml = `
      <div class="doc-client-card">
        <div>
          <span style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #64748b; display: block; margin-bottom: 2px;">Cliente / Razón Social</span>
          <strong style="font-size: 13px; color: #0f172a;">${esc(f.cliente_nombre || 'Consumidor Final')}</strong>
          ${f.cliente_direccion ? `<p style="margin: 2px 0 0 0; font-size: 10px; color: #64748b;">${esc(f.cliente_direccion)}</p>` : ''}
        </div>
        <div style="display: grid; grid-template-columns: 1fr; gap: 2px; font-size: 11px;">
          <div><strong style="color: #64748b;">Cédula / RIF:</strong> <span style="font-family: monospace; font-weight: 600;">${esc(f.cliente_cedula || '-')}</span></div>
          <div><strong style="color: #64748b;">Teléfono:</strong> <span>${esc(f.cliente_telefono || '-')}</span></div>
          ${f.cliente_correo ? `<div><strong style="color: #64748b;">Correo:</strong> <span>${esc(f.cliente_correo)}</span></div>` : ''}
        </div>
      </div>
    `;

    // 4. Tabla de Ítems
    const detalles = f.detalles || f.items || [];
    let itemsRows = '';
    detalles.forEach((d, idx) => {
      const num = idx + 1;
      const codigo = esc(d.codigo || '—');
      const nombre = esc(d.nombre || d.nombre_producto || 'Producto');
      const tipo = d.tipo === 'servicio' ? 'Servicio' : 'Producto';
      const cant = parseFloat(d.cantidad || 0).toFixed(2);
      const pu = parseFloat(d.precio_unitario || 0).toFixed(2);
      const imp = d.impuesto_tipo === 'gravado' ? '16%' : 'Exento';
      const tot = parseFloat(d.total || 0).toFixed(2);

      itemsRows += `
        <tr>
          <td style="text-align: center; color: #64748b; font-family: monospace;">${num}</td>
          <td style="font-family: monospace; font-weight: 600;">${codigo}</td>
          <td><strong>${nombre}</strong></td>
          <td style="text-align: center; color: #64748b; font-size: 10px;">${tipo}</td>
          <td style="text-align: right; font-weight: 600;">${cant}</td>
          <td style="text-align: right; font-family: monospace;">$${pu}</td>
          <td style="text-align: center; font-size: 10px; color: ${d.impuesto_tipo === 'gravado' ? '#0f172a' : '#059669'};">${imp}</td>
          <td style="text-align: right; font-family: monospace; font-weight: 800;">$${tot}</td>
        </tr>
      `;
    });

    let tableHtml = `
      <table class="doc-table">
        <thead>
          <tr>
            <th style="width: 5%; text-align: center;">#</th>
            <th style="width: 15%; text-align: left;">Código</th>
            <th style="width: 40%; text-align: left;">Descripción</th>
            <th style="width: 10%; text-align: center;">Tipo</th>
            <th style="width: 8%; text-align: right;">Cant</th>
            <th style="width: 11%; text-align: right;">P. Unit ($)</th>
            <th style="width: 8%; text-align: center;">IVA</th>
            <th style="width: 13%; text-align: right;">Total ($)</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>
    `;

    // 5. Bloque inferior (Totales, Pagos y Notas)
    const subtotal = parseFloat(f.subtotal || 0).toFixed(2);
    const iva = parseFloat(f.iva_total || 0).toFixed(2);
    const totalUsd = parseFloat(f.total_usd || 0).toFixed(2);
    const totalVes = parseFloat(f.total_ves || 0).toFixed(2);
    const totalCop = Math.round(f.total_cop || 0).toLocaleString('es-CO');
    const tasaVes = parseFloat(f.tasa_ves || 0).toFixed(2);
    const tasaCop = Math.round(f.tasa_cop || 0).toLocaleString('es-CO');

    // Desglose de pagos
    const pagos = f.pagos || [];
    let paymentsRows = '';
    if (pagos.length > 0) {
      pagos.forEach(p => {
        const metodo = esc(p.metodo || 'Pago');
        const moneda = esc(p.moneda || 'USD');
        const montoMoneda = parseFloat(p.monto_moneda || 0).toLocaleString('es-VE');
        const eqUsd = parseFloat(p.equivalente_usd || 0).toFixed(2);
        const ref = p.referencia ? ` (Ref: ${esc(p.referencia)})` : '';
        paymentsRows += `
          <div style="display: flex; justify-content: space-between; padding: 2px 0; font-size: 10px; color: #334155;">
            <span>&bull; ${metodo} (${moneda}):</span>
            <span><strong>${montoMoneda} ${moneda}</strong> (≈ $${eqUsd})${ref}</span>
          </div>
        `;
      });
    } else {
      paymentsRows = `<div style="font-size: 10px; color: #64748b; font-style: italic;">Sin abono inicial registrado.</div>`;
    }

    let bottomGridHtml = `
      <div class="avoid-page-break doc-bottom-grid">
        <!-- Columna Izquierda: Pagos y Notas -->
        <div>
          <div style="border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 6px; padding: 8px 12px; margin-bottom: 8px;">
            <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #475569; display: block; margin-bottom: 4px;">Desglose de Pagos / Abonos</span>
            ${paymentsRows}
            ${isCredito && f.saldo_pendiente !== undefined ? `
              <div style="border-top: 1px solid #cbd5e1; margin-top: 4px; padding-top: 4px; display: flex; justify-content: space-between; font-weight: bold; color: #b91c1c; font-size: 11px;">
                <span>Saldo Pendiente de Cobro:</span>
                <span>$${parseFloat(f.saldo_pendiente || 0).toFixed(2)}</span>
              </div>
            ` : ''}
          </div>

          ${f.notas && String(f.notas).trim() ? `
            <div style="border: 1px solid #e2e8f0; background: #ffffff; border-radius: 6px; padding: 6px 10px; font-size: 10px; color: #475569;">
              <strong style="color: #0f172a;">Observaciones:</strong> ${esc(f.notas)}
            </div>
          ` : ''}
        </div>

        <!-- Columna Derecha: Totales y Equivalencias -->
        <div>
          <div class="doc-totals-box">
            <div style="display: flex; justify-content: space-between; padding: 3px 0;">
              <span style="color: #475569;">Subtotal Base:</span>
              <strong style="font-family: monospace;">$${subtotal}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 3px 0;">
              <span style="color: #475569;">IVA Total (16%):</span>
              <strong style="font-family: monospace;">$${iva}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 6px 0; border-top: 2px solid #0f172a; margin-top: 4px; font-size: 14px; font-weight: 900; color: #0f172a;">
              <span>TOTAL USD:</span>
              <span style="font-family: monospace;">$${totalUsd}</span>
            </div>
            ${parseFloat(totalVes) > 0 ? `
              <div style="display: flex; justify-content: space-between; padding: 2px 0; font-size: 10px; color: #334155; border-top: 1px dotted #cbd5e1; margin-top: 4px; padding-top: 4px;">
                <span>Total en Bolívares (Tasa ${tasaVes}):</span>
                <strong style="font-family: monospace;">${totalVes} Bs.</strong>
              </div>
            ` : ''}
            ${parseFloat(f.total_cop || 0) > 0 ? `
              <div style="display: flex; justify-content: space-between; padding: 2px 0; font-size: 10px; color: #334155;">
                <span>Total en Pesos COP (Tasa ${tasaCop}):</span>
                <strong style="font-family: monospace;">${totalCop} COP</strong>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    // 6. Firmas
    let signaturesHtml = `
      <div class="avoid-page-break doc-signatures">
        <div>
          <div style="border-top: 1px solid #475569; width: 75%; margin: 0 auto; padding-top: 4px; font-weight: bold;">
            EMISOR / FACTURACIÓN
          </div>
          <span style="font-size: 9px; color: #64748b;">Firma y Sello Comercial</span>
        </div>
        <div>
          <div style="border-top: 1px solid #475569; width: 75%; margin: 0 auto; padding-top: 4px; font-weight: bold;">
            RECIBIDO CONFORME
          </div>
          <span style="font-size: 9px; color: #64748b;">Firma y Sello del Cliente</span>
        </div>
      </div>
    `;

    return `
      <div class="doc-factura doc-factura-sheet">
        ${anuladaBanner}
        ${headerHtml}
        ${clientCardHtml}
        ${tableHtml}
        ${bottomGridHtml}
        ${signaturesHtml}
      </div>
    `;
  },

  facturaCarta: function(f, config) {
    return this.facturaHoja(f, config, 'letterPortrait');
  },

  facturaA4: function(f, config) {
    return this.facturaHoja(f, config, 'a4Portrait');
  },

  // ========================================================
  // FASE 2E-3: PLANTILLAS PARA NOTA DE DEVOLUCIÓN DE CLIENTE
  // ========================================================

  // Nota de Devolución en Formato Ticket Térmico 80mm
  devolucionTicket: function(dev, config) {
    if (!dev) return '<p>Error: Datos de devolución no disponibles.</p>';
    const cfg = config || {};
    const esc = DocumentPrinter.escape;
    const isTotal = String(dev.tipo_devolucion).toLowerCase() === 'total';
    const tipoDevLabel = isTotal ? 'DEVOLUCIÓN TOTAL' : 'DEVOLUCIÓN PARCIAL';

    // 1. Encabezado de la Empresa
    let headerHtml = `
      <div class="doc-ticket-header" style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
        <img id="businessLogoPlaceholder" class="hidden" src="" alt="Logo" style="max-height: 48px; max-width: 140px; margin: 0 auto 4px auto; display: none;">
        <h2 style="margin: 0; font-size: 14px; font-weight: 900; text-transform: uppercase;">${esc(cfg.nombre_negocio || 'Mi Negocio Comercial')}</h2>
        ${cfg.documento_fiscal ? `<p style="margin: 2px 0; font-size: 10px;">RIF: ${esc(cfg.documento_fiscal)}</p>` : ''}
        ${cfg.telefono ? `<p style="margin: 2px 0; font-size: 10px;">Tel: ${esc(cfg.telefono)}</p>` : ''}
        ${cfg.direccion ? `<p style="margin: 2px 0; font-size: 9px; color: #333;">${esc(cfg.direccion)}</p>` : ''}
        <div style="margin: 4px 0; display: inline-block; border: 1px solid #000; padding: 2px 6px; font-weight: 900; font-size: 11px; background: #ecfeff;">
          NOTA DE DEVOLUCIÓN #${esc(dev.numero_devolucion)}
        </div>
        <p style="margin: 2px 0 0 0; font-size: 9px; color: #444;">Fecha: ${typeof formatFecha === 'function' ? formatFecha(dev.fecha_emision) : esc(dev.fecha_emision)}</p>
      </div>
    `;

    // 2. Referencia, Factura de Origen, Cliente y Motivo
    const refFactura = dev.numero_factura ? `Factura #${esc(dev.numero_factura)}` : (dev.factura_id ? `Factura #FAC-${esc(dev.factura_id)}` : 'Devolución Libre / Manual');
    let refHtml = `
      <div style="font-size: 10px; border-bottom: 1px dashed #000; padding-bottom: 5px; margin-bottom: 5px; line-height: 1.35;">
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #444;">Tipo:</span>
          <strong>${tipoDevLabel}</strong>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #444;">Factura Origen:</span>
          <strong>${refFactura}</strong>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #444;">Cliente:</span>
          <strong>${esc(dev.cliente_nombre || 'Consumidor Final')}</strong>
        </div>
        ${dev.cliente_cedula ? `
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #444;">Doc / RIF:</span>
            <span>${esc(dev.cliente_cedula)}</span>
          </div>
        ` : ''}
        ${dev.cliente_telefono ? `
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #444;">Teléfono:</span>
            <span>${esc(dev.cliente_telefono)}</span>
          </div>
        ` : ''}
        <div style="border-top: 1px dotted #ccc; margin-top: 3px; padding-top: 3px;">
          <span style="color: #444; display: block; font-weight: bold;">Motivo Declarado:</span>
          <span style="font-style: italic; color: #222;">${esc(dev.motivo || '-')}</span>
        </div>
      </div>
    `;

    // 3. Detalle de Ítems Devueltos
    const items = dev.items || dev.detalles || [];
    let itemsRows = '';
    items.forEach(it => {
      const cant = parseFloat(it.cantidad || 0).toFixed(2);
      const nombre = esc(it.nombre || it.nombre_producto || 'Ítem Devuelto');
      const codigo = it.codigo ? `[${esc(it.codigo)}] ` : '';
      const pu = parseFloat(it.precio_unitario || 0).toFixed(2);
      const tot = parseFloat(it.total || it.subtotal || 0).toFixed(2);

      itemsRows += `
        <tr style="border-bottom: 1px dotted #e5e7eb;">
          <td style="padding: 3px 0; vertical-align: top;">${cant}</td>
          <td style="padding: 3px 4px; vertical-align: top;">${codigo}${nombre}</td>
          <td style="padding: 3px 0; text-align: right; vertical-align: top;">$${pu}</td>
          <td style="padding: 3px 0; text-align: right; vertical-align: top; font-weight: bold;">$${tot}</td>
        </tr>
      `;
    });

    let itemsTableHtml = `
      <table style="width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 6px;">
        <thead>
          <tr style="border-bottom: 1px solid #000; font-size: 9px; text-transform: uppercase;">
            <th style="text-align: left; padding: 2px 0;">Cant</th>
            <th style="text-align: left; padding: 2px 4px;">Descripción</th>
            <th style="text-align: right; padding: 2px 0;">P.U</th>
            <th style="text-align: right; padding: 2px 0;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>
    `;

    // 4. Totales y Equivalencias Multimoneda
    const subtotal = parseFloat(dev.subtotal_usd || 0).toFixed(2);
    const iva = parseFloat(dev.iva_usd || 0).toFixed(2);
    const totalUsd = parseFloat(dev.total_usd || 0).toFixed(2);
    const totalVes = parseFloat(dev.total_ves || 0).toFixed(2);
    const totalCop = Math.round(dev.total_cop || 0).toLocaleString('es-CO');
    const tasaVes = parseFloat(dev.tasa_ves || 0).toFixed(2);
    const tasaCop = Math.round(dev.tasa_cop || 0).toLocaleString('es-CO');

    let totalsHtml = `
      <div style="border-top: 1px solid #000; padding-top: 5px; margin-bottom: 6px; font-size: 10px; line-height: 1.4;">
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #444;">Subtotal Devuelto:</span>
          <span>$${subtotal}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #444;">IVA Reintegrado:</span>
          <span>$${iva}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 900; border-top: 1px dashed #000; margin-top: 3px; padding-top: 3px; color: #0891b2;">
          <span>TOTAL REEMBOLSADO:</span>
          <span>$${totalUsd}</span>
        </div>
        ${parseFloat(totalVes) > 0 ? `
          <div style="display: flex; justify-content: space-between; font-size: 9px; color: #333;">
            <span>Equivalente Bs (Tasa ${tasaVes}):</span>
            <strong>${totalVes} Bs.</strong>
          </div>
        ` : ''}
        ${parseFloat(dev.total_cop || 0) > 0 ? `
          <div style="display: flex; justify-content: space-between; font-size: 9px; color: #333;">
            <span>Equivalente COP (Tasa ${tasaCop}):</span>
            <strong>${totalCop} COP</strong>
          </div>
        ` : ''}
      </div>
    `;

    // 5. Desglose de Compensación / Reembolso
    const pagos = dev.pagos || [];
    let paymentsRows = '';
    if (pagos.length > 0) {
      pagos.forEach(p => {
        const metodo = esc(p.metodo || 'Reembolso');
        const moneda = esc(p.moneda || 'USD');
        const montoMoneda = p.moneda === 'COP'
          ? Math.round(p.monto_moneda || 0).toLocaleString('es-CO')
          : parseFloat(p.monto_moneda || 0).toFixed(2);
        const ref = p.referencia ? ` (Ref: ${esc(p.referencia)})` : '';
        paymentsRows += `
          <div style="display: flex; justify-content: space-between; font-size: 9px; color: #333;">
            <span>&bull; ${metodo} (${moneda}):</span>
            <span><strong>${montoMoneda} ${moneda}</strong>${ref}</span>
          </div>
        `;
      });
    } else {
      const metodoTxt = dev.metodo_reembolso ? esc(String(dev.metodo_reembolso).replace(/_/g, ' ').toUpperCase()) : 'EFECTIVO USD';
      paymentsRows = `<div style="font-size: 9px; color: #333;"><strong>${metodoTxt}</strong></div>`;
    }

    let paymentsHtml = `
      <div style="border-top: 1px dotted #999; padding-top: 4px; margin-bottom: 6px;">
        <span style="font-size: 9px; font-weight: bold; text-transform: uppercase; color: #444; display: block; margin-bottom: 2px;">Compensación / Reembolso:</span>
        ${paymentsRows}
      </div>
    `;

    // 6. Observaciones / Notas
    let notasHtml = '';
    if (dev.notas && String(dev.notas).trim()) {
      notasHtml = `
        <div style="border-top: 1px dotted #999; padding-top: 4px; margin-bottom: 6px; font-size: 9px; color: #333;">
          <strong>Notas:</strong> ${esc(dev.notas)}
        </div>
      `;
    }

    // 7. Firmas Compactas para Ticket
    let footerSignaturesHtml = `
      <div class="avoid-page-break" style="border-top: 1px dashed #000; padding-top: 8px; margin-top: 6px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; text-align: center; font-size: 8px; color: #333;">
          <div>
            <div style="border-top: 1px solid #000; margin: 0 4px; padding-top: 2px; font-weight: bold;">Firma Almacén / Caja</div>
            <p style="margin: 1px 0 0 0;">Mercancía Recibida en Stock</p>
          </div>
          <div>
            <div style="border-top: 1px solid #000; margin: 0 4px; padding-top: 2px; font-weight: bold;">Firma Cliente</div>
            <p style="margin: 1px 0 0 0;">Reembolso Recibido Conforme</p>
          </div>
        </div>
        <p style="margin: 6px 0 0 0; text-align: center; font-size: 8px; color: #666;">Comprobante de Devolución Oficial</p>
      </div>
    `;

    return `
      <div class="doc-devolucion doc-devolucion-ticket">
        ${headerHtml}
        ${refHtml}
        ${itemsTableHtml}
        ${totalsHtml}
        ${paymentsHtml}
        ${notasHtml}
        ${footerSignaturesHtml}
      </div>
    `;
  },

  // Nota de Devolución en Hoja Completa (Carta / A4 Vertical)
  devolucionHoja: function(dev, config, paperFormat) {
    if (!dev) return '<p>Error: Datos de devolución no disponibles.</p>';
    const cfg = config || {};
    const esc = DocumentPrinter.escape;
    const isTotal = String(dev.tipo_devolucion).toLowerCase() === 'total';
    const tipoDevLabel = isTotal ? 'DEVOLUCIÓN TOTAL' : 'DEVOLUCIÓN PARCIAL';
    const isA4 = paperFormat === 'a4Portrait';

    // 1. Encabezado Corporativo
    let headerHtml = `
      <div class="doc-header">
        <div style="max-width: 60%;">
          <img id="businessLogoPlaceholder" class="hidden" src="" alt="Logo" style="max-height: 56px; max-width: 180px; margin-bottom: 6px; display: none;">
          <h1 class="doc-company-title">${esc(cfg.nombre_negocio || 'Mi Negocio Comercial')}</h1>
          ${cfg.documento_fiscal ? `<p style="margin: 2px 0; font-size: 11px; font-weight: bold; color: #475569;">RIF: ${esc(cfg.documento_fiscal)}</p>` : ''}
          ${cfg.direccion ? `<p style="margin: 2px 0; font-size: 11px; color: #64748b;">${esc(cfg.direccion)}</p>` : ''}
          ${cfg.telefono ? `<p style="margin: 2px 0; font-size: 11px; color: #64748b;">Teléfono: ${esc(cfg.telefono)}</p>` : ''}
        </div>
        <div style="text-align: right;">
          <div class="doc-devolucion-badge">
            <span style="font-size: 12px; font-weight: 800; letter-spacing: 1px; display: block;">NOTA OFICIAL DE DEVOLUCIÓN</span>
            <span style="font-size: 15px; font-weight: 900; font-family: monospace;">N° ${esc(dev.numero_devolucion)}</span>
          </div>
          <div style="margin-top: 6px; font-size: 10px; color: #475569; line-height: 1.4;">
            <p style="margin: 0;"><strong>Fecha de Emisión:</strong> ${typeof formatFecha === 'function' ? formatFecha(dev.fecha_emision) : esc(dev.fecha_emision)}</p>
            <p style="margin: 0;"><strong>Modalidad:</strong> <span style="font-weight: 800; color: #0891b2;">${tipoDevLabel}</span></p>
            <p style="margin: 0;"><strong>Factura Relacionada:</strong> <span style="font-weight: 700; font-family: monospace;">${esc(dev.numero_factura || (dev.factura_id ? 'FAC-' + dev.factura_id : 'Manual / Libre'))}</span></p>
            ${dev.fecha_factura_original ? `<p style="margin: 0;"><strong>Fecha Factura:</strong> ${typeof formatFecha === 'function' ? formatFecha(dev.fecha_factura_original) : esc(dev.fecha_factura_original)}</p>` : ''}
          </div>
        </div>
      </div>
    `;

    // 2. Ficha de Cliente y Motivo
    let clientCardHtml = `
      <div class="doc-client-card">
        <div>
          <span style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #64748b; display: block; margin-bottom: 2px;">Cliente / Beneficiario del Reintegro</span>
          <strong style="font-size: 13px; color: #0f172a;">${esc(dev.cliente_nombre || 'Consumidor Final')}</strong>
          ${dev.cliente_direccion ? `<p style="margin: 2px 0 0 0; font-size: 10px; color: #64748b;">${esc(dev.cliente_direccion)}</p>` : ''}
        </div>
        <div style="display: grid; grid-template-columns: 1fr; gap: 2px; font-size: 11px;">
          <div><strong style="color: #64748b;">Cédula / RIF:</strong> <span style="font-family: monospace; font-weight: 600;">${esc(dev.cliente_cedula || '-')}</span></div>
          <div><strong style="color: #64748b;">Teléfono:</strong> <span>${esc(dev.cliente_telefono || '-')}</span></div>
          ${dev.cliente_correo ? `<div><strong style="color: #64748b;">Correo:</strong> <span>${esc(dev.cliente_correo)}</span></div>` : ''}
          <div style="border-top: 1px dotted #cbd5e1; margin-top: 4px; padding-top: 3px;">
            <strong style="color: #0891b2;">Motivo Declarado:</strong> <span style="font-style: italic;">${esc(dev.motivo || '-')}</span>
          </div>
        </div>
      </div>
    `;

    // 3. Tabla Completa de Ítems Devueltos
    const items = dev.items || dev.detalles || [];
    let itemsRows = '';
    items.forEach((it, idx) => {
      const num = idx + 1;
      const codigo = esc(it.codigo || '—');
      const nombre = esc(it.nombre || it.nombre_producto || 'Ítem Devuelto');
      const tipo = it.tipo === 'servicio' ? 'Servicio' : 'Producto';
      const cant = parseFloat(it.cantidad || 0).toFixed(2);
      const pu = parseFloat(it.precio_unitario || 0).toFixed(2);
      const imp = it.impuesto_tipo === 'gravado' ? '16%' : 'Exento';
      const tot = parseFloat(it.total || it.subtotal || 0).toFixed(2);

      itemsRows += `
        <tr>
          <td style="text-align: center; color: #64748b; font-family: monospace;">${num}</td>
          <td style="font-family: monospace; font-weight: 600;">${codigo}</td>
          <td><strong>${nombre}</strong></td>
          <td style="text-align: center; color: #64748b; font-size: 10px;">${tipo}</td>
          <td style="text-align: right; font-weight: 600;">${cant}</td>
          <td style="text-align: right; font-family: monospace;">$${pu}</td>
          <td style="text-align: center; font-size: 10px; color: ${it.impuesto_tipo === 'gravado' ? '#0f172a' : '#059669'};">${imp}</td>
          <td style="text-align: right; font-family: monospace; font-weight: 800; color: #0891b2;">$${tot}</td>
        </tr>
      `;
    });

    let tableHtml = `
      <table class="doc-table">
        <thead>
          <tr>
            <th style="width: 5%; text-align: center;">#</th>
            <th style="width: 15%; text-align: left;">Código</th>
            <th style="width: 38%; text-align: left;">Descripción del Ítem Devuelto</th>
            <th style="width: 10%; text-align: center;">Tipo</th>
            <th style="width: 8%; text-align: right;">Cant</th>
            <th style="width: 11%; text-align: right;">P. Unit ($)</th>
            <th style="width: 8%; text-align: center;">IVA</th>
            <th style="width: 13%; text-align: right;">Total ($)</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>
    `;

    // 4. Bloque Inferior: Desglose de Compensaciones y Totales
    const subtotal = parseFloat(dev.subtotal_usd || 0).toFixed(2);
    const iva = parseFloat(dev.iva_usd || 0).toFixed(2);
    const totalUsd = parseFloat(dev.total_usd || 0).toFixed(2);
    const totalVes = parseFloat(dev.total_ves || 0).toFixed(2);
    const totalCop = Math.round(dev.total_cop || 0).toLocaleString('es-CO');
    const tasaVes = parseFloat(dev.tasa_ves || 0).toFixed(2);
    const tasaCop = Math.round(dev.tasa_cop || 0).toLocaleString('es-CO');

    // Desglose de pagos / reembolsos
    const pagos = dev.pagos || [];
    let paymentsRows = '';
    if (pagos.length > 0) {
      pagos.forEach(p => {
        const metodo = esc(p.metodo || 'Reembolso');
        const moneda = esc(p.moneda || 'USD');
        const montoMoneda = p.moneda === 'COP'
          ? Math.round(p.monto_moneda || 0).toLocaleString('es-CO')
          : parseFloat(p.monto_moneda || 0).toFixed(2);
        const ref = p.referencia ? ` (Ref: ${esc(p.referencia)})` : '';
        paymentsRows += `
          <div style="display: flex; justify-content: space-between; padding: 2px 0; font-size: 10px; color: #334155;">
            <span>&bull; ${metodo} (${moneda}):</span>
            <span><strong>${montoMoneda} ${moneda}</strong>${ref}</span>
          </div>
        `;
      });
    } else {
      const metodoTxt = dev.metodo_reembolso ? esc(String(dev.metodo_reembolso).replace(/_/g, ' ').toUpperCase()) : 'EFECTIVO USD';
      paymentsRows = `<div style="font-size: 10px; color: #334155; font-weight: bold;">${metodoTxt}</div>`;
    }

    let bottomGridHtml = `
      <div class="avoid-page-break doc-bottom-grid">
        <!-- Columna Izquierda: Reembolsos y Observaciones -->
        <div>
          <div style="border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 6px; padding: 8px 12px; margin-bottom: 8px;">
            <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #475569; display: block; margin-bottom: 4px;">Desglose de Compensación / Reembolso</span>
            ${paymentsRows}
          </div>

          ${dev.notas && String(dev.notas).trim() ? `
            <div style="border: 1px solid #e2e8f0; background: #ffffff; border-radius: 6px; padding: 6px 10px; font-size: 10px; color: #475569;">
              <strong style="color: #0f172a;">Observaciones de Devolución:</strong> ${esc(dev.notas)}
            </div>
          ` : ''}
        </div>

        <!-- Columna Derecha: Totales y Equivalencias -->
        <div>
          <div class="doc-totals-box">
            <div style="display: flex; justify-content: space-between; padding: 3px 0;">
              <span style="color: #475569;">Subtotal Devuelto:</span>
              <strong style="font-family: monospace;">$${subtotal}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 3px 0;">
              <span style="color: #475569;">IVA Reintegrado:</span>
              <strong style="font-family: monospace;">$${iva}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 6px 0; border-top: 2px solid #0891b2; margin-top: 4px; font-size: 14px; font-weight: 900; color: #0891b2;">
              <span>TOTAL REEMBOLSADO:</span>
              <span style="font-family: monospace;">$${totalUsd}</span>
            </div>
            ${parseFloat(totalVes) > 0 ? `
              <div style="display: flex; justify-content: space-between; padding: 2px 0; font-size: 10px; color: #334155; border-top: 1px dotted #cbd5e1; margin-top: 4px; padding-top: 4px;">
                <span>Equivalente Bs (Tasa ${tasaVes}):</span>
                <strong style="font-family: monospace;">${totalVes} Bs.</strong>
              </div>
            ` : ''}
            ${parseFloat(dev.total_cop || 0) > 0 ? `
              <div style="display: flex; justify-content: space-between; padding: 2px 0; font-size: 10px; color: #334155;">
                <span>Equivalente Pesos COP (Tasa ${tasaCop}):</span>
                <strong style="font-family: monospace;">${totalCop} COP</strong>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    // 5. Firmas Legales
    let signaturesHtml = `
      <div class="avoid-page-break doc-signatures">
        <div>
          <div style="border-top: 1px solid #475569; width: 75%; margin: 0 auto; padding-top: 4px; font-weight: bold;">
            RESPONSABLE ALMACÉN / CAJA
          </div>
          <span style="font-size: 9px; color: #64748b;">Mercancía Reingresada Conforme a Inventario</span>
        </div>
        <div>
          <div style="border-top: 1px solid #475569; width: 75%; margin: 0 auto; padding-top: 4px; font-weight: bold;">
            CLIENTE / BENEFICIARIO
          </div>
          <span style="font-size: 9px; color: #64748b;">Importe y Reembolso Recibido Conforme</span>
        </div>
      </div>
    `;

    return `
      <div class="doc-devolucion doc-devolucion-sheet ${isA4 ? 'doc-a4-sheet' : ''}">
        ${headerHtml}
        ${clientCardHtml}
        ${tableHtml}
        ${bottomGridHtml}
        ${signaturesHtml}
      </div>
    `;
  },

  devolucionCarta: function(dev, config) {
    return this.devolucionHoja(dev, config, 'letterPortrait');
  },

  devolucionA4: function(dev, config) {
    return this.devolucionHoja(dev, config, 'a4Portrait');
  },

  // ========================================================
  // FASE 2E-3 (BLOQUE 2): PLANTILLAS PARA MOVIMIENTOS / AJUSTES
  // ========================================================

  // Movimiento de Inventario en Ticket Térmico 80mm
  movimientoTicket: function(data, config) {
    if (!data) return '<p>Error: Datos de movimiento no disponibles.</p>';
    const cfg = config || {};
    const esc = DocumentPrinter.escape;
    const titulo = getTituloMovimientoInventario(data);
    const sentido = (data.sentido || (data.tipo_ajuste === 'CARGO' ? 'ENTRADA' : 'SALIDA')).toUpperCase();
    const detalles = data.detalles || data.productos || [];
    const meta = construirMetaDocumentoAjuste(data);

    // 1. Encabezado de la Empresa
    let headerHtml = `
      <div class="doc-ticket-header" style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
        <img id="businessLogoPlaceholder" class="hidden" src="" alt="Logo" style="max-height: 48px; max-width: 140px; margin: 0 auto 4px auto; display: none;">
        <h2 style="margin: 0; font-size: 14px; font-weight: 900; text-transform: uppercase;">${esc(cfg.nombre_negocio || 'Mi Negocio Comercial')}</h2>
        ${cfg.documento_fiscal ? `<p style="margin: 2px 0; font-size: 10px;">RIF: ${esc(cfg.documento_fiscal)}</p>` : ''}
        ${cfg.telefono ? `<p style="margin: 2px 0; font-size: 10px;">Tel: ${esc(cfg.telefono)}</p>` : ''}
        ${cfg.direccion ? `<p style="margin: 2px 0; font-size: 9px; color: #333;">${esc(cfg.direccion)}</p>` : ''}
        ${meta.esCanonico ? `<p style="margin: 3px 0 0 0; font-size: 8px; font-weight: 800; letter-spacing: 0.4px;">COMPROBANTE OFICIAL DE AJUSTE DE INVENTARIO</p>` : ''}
        <div style="margin: 4px 0; border: 1px solid #000; padding: 3px 6px; font-weight: 900; font-size: 10px; background: #f0fdfa;">
          ${esc(titulo)}
        </div>
        <p style="margin: 2px 0 0 0; font-size: 11px; font-weight: 900; font-family: monospace;">N° ${esc(data.numero_ajuste || 'AJU')}</p>
        <p style="margin: 2px 0 0 0; font-size: 9px; color: #444;">Fecha: ${typeof formatFecha === 'function' ? formatFecha(data.fecha) : esc(data.fecha)}</p>
        ${meta.estadoTxt ? `<p style="margin: 2px 0 0 0; font-size: 10px; font-weight: 900; ${meta.anulado ? 'color: #b91c1c;' : ''}">ESTADO: ${esc(meta.estadoTxt)}</p>` : ''}
        ${meta.anulado ? `<div class="doc-anulada-banner" style="margin-top: 4px; border: 2px solid #b91c1c; color: #b91c1c; font-weight: 900; font-size: 11px; padding: 2px;">DOCUMENTO ANULADO</div>` : ''}
      </div>
    `;

    // 2. Metadatos, Sentido y Motivo
    let refHtml = `
      <div style="font-size: 10px; border-bottom: 1px dashed #000; padding-bottom: 5px; margin-bottom: 5px; line-height: 1.35;">
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #444;">Operación:</span>
          <strong>${esc(data.tipo_ajuste || 'AJUSTE')}</strong>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #444;">Sentido Físico:</span>
          <strong style="${sentido === 'ENTRADA' ? 'color: #047857;' : 'color: #b91c1c;'}">${sentido}</strong>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #444;">Responsable:</span>
          <span>${esc(data.usuario_nombre || `Usuario #${data.usuario_id || 1}`)}</span>
        </div>
        ${meta.subtipo ? `
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #444;">Subtipo:</span>
          <strong style="font-family: monospace; font-size: 9px;">${esc(meta.subtipo)}</strong>
        </div>` : ''}
        ${meta.documentoReferencia ? `
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #444;">Doc. Referencia:</span>
          <strong>${esc(meta.documentoReferencia)}</strong>
        </div>` : ''}
        ${meta.autorizadoPor ? `
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #444;">Autorizado por:</span>
          <strong>${esc(meta.autorizadoPor)}</strong>
        </div>` : ''}
        <div style="border-top: 1px dotted #ccc; margin-top: 3px; padding-top: 3px;">
          <span style="color: #444; display: block; font-weight: bold;">Motivo Declarado:</span>
          <span style="font-style: italic; color: #222;">${esc(data.motivo || '-')}</span>
        </div>
        ${data.observaciones ? `
          <div style="margin-top: 2px;">
            <span style="color: #444; font-weight: bold;">Observaciones:</span>
            <span style="color: #333;">${esc(data.observaciones)}</span>
          </div>
        ` : ''}
      </div>
    `;

    // 3. Detalle de Ítems Afectados
    let totalUnits = 0;
    let totalValuation = 0;
    let itemsRows = '';

    detalles.forEach(d => {
      const cant = parseFloat(d.cantidad || 0);
      const cu = parseFloat(d.costo_unitario || 0);
      const tot = parseFloat(d.costo_total !== undefined ? d.costo_total : (cant * cu));
      totalUnits += cant;
      totalValuation += tot;

      const codigo = esc(d.producto_codigo || d.codigo || '—');
      const nombre = esc(d.producto_nombre || d.nombre || 'Producto');
      const stkAnt = parseFloat(d.stock_anterior || 0).toFixed(2);
      const stkNue = parseFloat(d.stock_nuevo || 0).toFixed(2);

      itemsRows += `
        <tr style="border-bottom: 1px dotted #e5e7eb;">
          <td style="padding: 3px 0; vertical-align: top;">
            <div style="font-weight: bold;">[${codigo}] ${nombre}</div>
            <div style="font-size: 8px; color: #555;">Stock: ${stkAnt} &rarr; ${stkNue} &bull; Und: ${esc(meta.unidadTxt)}</div>
            <div style="font-size: 8px; color: #555;">CPP: ${_cppDocTxt(d.cpp_anterior)} &rarr; ${_cppDocTxt(d.cpp_nuevo)}</div>
          </td>
          <td style="padding: 3px 2px; text-align: center; vertical-align: top; font-weight: bold;">${cant.toFixed(2)}</td>
          <td style="padding: 3px 0; text-align: right; vertical-align: top;">$${cu.toFixed(2)}</td>
          <td style="padding: 3px 0; text-align: right; vertical-align: top; font-weight: bold;">$${tot.toFixed(2)}</td>
        </tr>
      `;
    });

    let itemsTableHtml = `
      <table style="width: 100%; border-collapse: collapse; font-size: 9px; margin-bottom: 6px;">
        <thead>
          <tr style="border-bottom: 1px solid #000; font-size: 8px; text-transform: uppercase;">
            <th style="text-align: left; padding: 2px 0;">Ítem / Stock</th>
            <th style="text-align: center; padding: 2px 2px;">Cant</th>
            <th style="text-align: right; padding: 2px 0;">Costo U.</th>
            <th style="text-align: right; padding: 2px 0;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>
    `;

    // 4. Resumen
    let summaryHtml = `
      <div style="border-top: 1px solid #000; padding-top: 4px; margin-bottom: 6px; font-size: 10px; line-height: 1.4;">
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #444;">Total Líneas / Ítems:</span>
          <strong>${detalles.length}</strong>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #444;">Total Unidades Afectadas:</span>
          <strong>${totalUnits.toFixed(2)}</strong>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #444;">Stock Resultante:</span>
          <strong>${esc(_stockResultanteDocTxt(detalles))}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 900; border-top: 1px dashed #000; margin-top: 3px; padding-top: 3px; color: #0d9488;">
          <span>VALORIZACIÓN TOTAL:</span>
          <span>$${totalValuation.toFixed(2)}</span>
        </div>
      </div>
      <div style="font-size: 8px; color: #333; border-top: 1px dashed #000; padding-top: 3px; margin-bottom: 4px; line-height: 1.35;">
        <strong>AUDITORÍA</strong><br>
        Usuario: ${esc(meta.usuarioTxt)}<br>
        Registro: ${esc(meta.registroTxt)}
        ${meta.relacionadoTxt ? `<br>Ajuste relacionado: ${esc(meta.relacionadoTxt)}` : ''}
        ${meta.anulado ? `<br>Anulado: ${esc(meta.fechaAnulacionTxt)}${meta.motivoAnulacion ? ' — ' + esc(meta.motivoAnulacion) : ''}` : ''}
      </div>
    `;

    // 5. Firmas Compactas
    let signaturesHtml = `
      <div class="avoid-page-break" style="border-top: 1px dashed #000; padding-top: 8px; margin-top: 6px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; text-align: center; font-size: 8px; color: #333;">
          <div>
            <div style="border-top: 1px solid #000; margin: 0 4px; padding-top: 2px; font-weight: bold;">RESPONSABLE</div>
            <p style="margin: 1px 0 0 0;">Firma de Ejecución</p>
          </div>
          <div>
            <div style="border-top: 1px solid #000; margin: 0 4px; padding-top: 2px; font-weight: bold;">AUTORIZADO POR</div>
            <p style="margin: 1px 0 0 0;">Control de Auditoría</p>
          </div>
        </div>
        <p style="margin: 6px 0 0 0; text-align: center; font-size: 8px; color: #666;">Comprobante Oficial de Inventario</p>
      </div>
    `;

    return `
      <div class="doc-movimiento doc-movimiento-ticket">
        ${headerHtml}
        ${refHtml}
        ${itemsTableHtml}
        ${summaryHtml}
        ${signaturesHtml}
      </div>
    `;
  },

  // Movimiento de Inventario en Hoja Completa (Carta / A4 Vertical)
  movimientoHoja: function(data, config, paperFormat) {
    if (!data) return '<p>Error: Datos de movimiento no disponibles.</p>';
    const cfg = config || {};
    const esc = DocumentPrinter.escape;
    const titulo = getTituloMovimientoInventario(data);
    const sentido = (data.sentido || (data.tipo_ajuste === 'CARGO' ? 'ENTRADA' : 'SALIDA')).toUpperCase();
    const isA4 = paperFormat === 'a4Portrait';
    const isLandscape = paperFormat === 'letterLandscape' || paperFormat === 'a4Landscape';
    const detalles = data.detalles || data.productos || [];
    const meta = construirMetaDocumentoAjuste(data);

    // 1. Encabezado Corporativo
    let headerHtml = `
      <div class="doc-header">
        <div style="max-width: 58%;">
          <img id="businessLogoPlaceholder" class="hidden" src="" alt="Logo" style="max-height: 56px; max-width: 180px; margin-bottom: 6px; display: none;">
          <h1 class="doc-company-title">${esc(cfg.nombre_negocio || 'Mi Negocio Comercial')}</h1>
          ${cfg.documento_fiscal ? `<p style="margin: 2px 0; font-size: 11px; font-weight: bold; color: #475569;">RIF: ${esc(cfg.documento_fiscal)}</p>` : ''}
          ${cfg.direccion ? `<p style="margin: 2px 0; font-size: 11px; color: #64748b;">${esc(cfg.direccion)}</p>` : ''}
          ${cfg.telefono ? `<p style="margin: 2px 0; font-size: 11px; color: #64748b;">Teléfono: ${esc(cfg.telefono)}</p>` : ''}
        </div>
        <div style="text-align: right; max-width: 42%;">
          <div class="doc-movimiento-badge">
            ${meta.esCanonico ? `<span style="font-size: 9px; font-weight: 700; letter-spacing: 0.5px; display: block;">COMPROBANTE OFICIAL DE AJUSTE DE INVENTARIO</span>` : ''}
            <span style="font-size: 11px; font-weight: 800; letter-spacing: 0.5px; display: block;">${esc(titulo)}</span>
            <span style="font-size: 15px; font-weight: 900; font-family: monospace;">N° ${esc(data.numero_ajuste || 'AJU')}</span>
          </div>
          <div style="margin-top: 6px; font-size: 10px; color: #475569; line-height: 1.4;">
            <p style="margin: 0;"><strong>Fecha de Operación:</strong> ${typeof formatFecha === 'function' ? formatFecha(data.fecha) : esc(data.fecha)}</p>
            <p style="margin: 0;"><strong>Sentido:</strong> <span style="font-weight: 800; ${sentido === 'ENTRADA' ? 'color: #047857;' : 'color: #b91c1c;'}">${sentido}</span> &bull; <strong>Operación:</strong> ${esc(data.tipo_ajuste || 'AJUSTE')}</p>
            <p style="margin: 0;"><strong>Responsable:</strong> <span>${esc(data.usuario_nombre || `Usuario #${data.usuario_id || 1}`)}</span></p>
            ${meta.estadoTxt ? `<p style="margin: 0;"><strong>Estado:</strong> <span style="font-weight: 900; ${meta.anulado ? 'color: #b91c1c;' : 'color: #047857;'}">${esc(meta.estadoTxt)}</span></p>` : ''}
          </div>
        </div>
      </div>
      ${meta.anulado ? `<div class="doc-anulada-banner avoid-page-break" style="border: 2px solid #b91c1c; color: #b91c1c; text-align: center; font-weight: 900; padding: 4px; margin: 6px 0; letter-spacing: 1px;">DOCUMENTO ANULADO — ${esc(meta.fechaAnulacionTxt)}${meta.motivoAnulacion ? ' — ' + esc(meta.motivoAnulacion) : ''}</div>` : ''}
    `;

    // 2. Ficha de Motivo y Justificación
    let infoCardHtml = `
      <div class="doc-info-card">
        <div>
          <span style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #64748b; display: block; margin-bottom: 2px;">Causal y Justificación Operativa</span>
          <strong style="font-size: 12px; color: #0f172a;">${esc(data.motivo || 'Ajuste formal de inventario')}</strong>
          ${meta.subtipo ? `<p style="margin: 2px 0 0 0; font-size: 10px; color: #334155;"><strong>Subtipo:</strong> <span style="font-family: monospace;">${esc(meta.subtipo)}</span></p>` : ''}
          ${meta.documentoReferencia ? `<p style="margin: 2px 0 0 0; font-size: 10px; color: #334155;"><strong>Documento de referencia:</strong> ${esc(meta.documentoReferencia)}</p>` : ''}
          ${meta.autorizadoPor ? `<p style="margin: 2px 0 0 0; font-size: 10px; color: #334155;"><strong>Autorizado por:</strong> ${esc(meta.autorizadoPor)}</p>` : ''}
        </div>
        <div>
          <span style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #64748b; display: block; margin-bottom: 2px;">Observaciones / Notas de Auditoría</span>
          <p style="margin: 0; font-size: 11px; color: #334155;">${esc(data.observaciones || 'Sin observaciones adicionales registradas.')}</p>
        </div>
      </div>
    `;

    // 3. Tabla Completa de Ítems Afectados
    let totalUnits = 0;
    let totalValuation = 0;
    let itemsRows = '';

    detalles.forEach((d, idx) => {
      const num = idx + 1;
      const cant = parseFloat(d.cantidad || 0);
      const cu = parseFloat(d.costo_unitario || 0);
      const tot = parseFloat(d.costo_total !== undefined ? d.costo_total : (cant * cu));
      totalUnits += cant;
      totalValuation += tot;

      const codigo = esc(d.producto_codigo || d.codigo || '—');
      const nombre = esc(d.producto_nombre || d.nombre || 'Producto');
      const stkAnt = parseFloat(d.stock_anterior || 0).toFixed(2);
      const stkNue = parseFloat(d.stock_nuevo || 0).toFixed(2);

      itemsRows += `
        <tr>
          <td style="text-align: center; color: #64748b; font-family: monospace;">${num}</td>
          <td style="font-family: monospace; font-weight: 600;">${codigo}</td>
          <td><strong>${nombre}</strong>${d.motivo_detalle ? `<br><small style="color: #64748b; font-style: italic;">${esc(d.motivo_detalle)}</small>` : ''}</td>
          <td style="text-align: center; color: #64748b;">${esc(meta.unidadTxt)}</td>
          <td style="text-align: right; font-weight: 700; font-family: monospace; ${sentido === 'ENTRADA' ? 'color: #047857;' : 'color: #b91c1c;'}">${sentido === 'ENTRADA' ? '+' : '-'}${cant.toFixed(2)}</td>
          <td style="text-align: center; font-family: monospace; color: #475569;">${stkAnt}</td>
          <td style="text-align: center; font-family: monospace; font-weight: 700; color: #0f172a;">${stkNue}</td>
          <td style="text-align: right; font-family: monospace; color: #475569;">${_cppDocTxt(d.cpp_anterior)}</td>
          <td style="text-align: right; font-family: monospace;">$${cu.toFixed(2)}</td>
          <td style="text-align: right; font-family: monospace; font-weight: 700;">${_cppDocTxt(d.cpp_nuevo)}</td>
          <td style="text-align: right; font-family: monospace; font-weight: 800; color: #0f766e;">$${tot.toFixed(2)}</td>
        </tr>
      `;
    });

    let tableHtml = `
      <table class="doc-table">
        <thead>
          <tr>
            <th style="width: 3%; text-align: center;">#</th>
            <th style="width: 10%; text-align: left;">Código</th>
            <th style="width: 24%; text-align: left;">Descripción del Producto</th>
            <th style="width: 5%; text-align: center;">Und.</th>
            <th style="width: 8%; text-align: right;">Cant. (${sentido === 'ENTRADA' ? '+' : '-'})</th>
            <th style="width: 8%; text-align: center;">Stock Ant.</th>
            <th style="width: 8%; text-align: center;">Stock Nue.</th>
            <th style="width: 8%; text-align: right;">CPP Ant.</th>
            <th style="width: 9%; text-align: right;">Costo U. Aplicado ($)</th>
            <th style="width: 8%; text-align: right;">CPP Nue.</th>
            <th style="width: 9%; text-align: right;">Valuación ($)</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>
    `;

    // 4. Bloque Inferior: Resumen Físico y Valuación
    let bottomGridHtml = `
      <div class="avoid-page-break doc-bottom-grid">
        <!-- Columna Izquierda: Información de Trazabilidad -->
        <div>
          <div style="border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 6px; padding: 8px 12px; font-size: 10px; color: #475569;">
            <span style="font-weight: 800; text-transform: uppercase; display: block; margin-bottom: 2px;">Certificación de Trazabilidad</span>
            <p style="margin: 0; line-height: 1.35;">
              Asiento formal auditado en el libro mayor persistente <code>inventario_movimientos</code>.
              Afectación física materializada en el catálogo de productos con respaldo de saldos anteriores y resultantes.
            </p>
          </div>
          <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; font-size: 10px; color: #475569; margin-top: 6px;">
            <span style="font-weight: 800; text-transform: uppercase; display: block; margin-bottom: 2px;">Auditoría</span>
            <p style="margin: 0; line-height: 1.4;">
              <strong>Usuario:</strong> ${esc(meta.usuarioTxt)}<br>
              <strong>Fecha/Hora de registro:</strong> ${esc(meta.registroTxt)}<br>
              <strong>Documento ID:</strong> ${esc(data.id !== undefined ? data.id : 'N/D')}
              ${meta.relacionadoTxt ? `<br><strong>Ajuste relacionado:</strong> ${esc(meta.relacionadoTxt)}` : ''}
              ${meta.anulado ? `<br><strong>Anulación:</strong> ${esc(meta.fechaAnulacionTxt)}${meta.motivoAnulacion ? ' — ' + esc(meta.motivoAnulacion) : ''}` : ''}
            </p>
          </div>
        </div>

        <!-- Columna Derecha: Totales Físicos y Valuación -->
        <div>
          <div class="doc-totals-box">
            <div style="display: flex; justify-content: space-between; padding: 3px 0;">
              <span style="color: #475569;">Líneas de Productos:</span>
              <strong style="font-family: monospace;">${detalles.length}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 3px 0;">
              <span style="color: #475569;">Total Unidades Afectadas:</span>
              <strong style="font-family: monospace;">${totalUnits.toFixed(2)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 3px 0;">
              <span style="color: #475569;">Stock Resultante:</span>
              <strong style="font-family: monospace;">${esc(_stockResultanteDocTxt(detalles))}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 6px 0; border-top: 2px solid #0d9488; margin-top: 4px; font-size: 13px; font-weight: 900; color: #0f766e;">
              <span>VALUACIÓN TOTAL:</span>
              <span style="font-family: monospace;">$${totalValuation.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    `;

    // 5. Firmas Formales
    let signaturesHtml = `
      <div class="avoid-page-break doc-signatures">
        <div>
          <div style="border-top: 1px solid #475569; width: 75%; margin: 0 auto; padding-top: 4px; font-weight: bold;">
            RESPONSABLE DE INVENTARIO
          </div>
          <span style="font-size: 9px; color: #64748b;">Firma y Sello de Almacén / Ejecución</span>
        </div>
        <div>
          <div style="border-top: 1px solid #475569; width: 75%; margin: 0 auto; padding-top: 4px; font-weight: bold;">
            AUTORIZADO POR
          </div>
          <span style="font-size: 9px; color: #64748b;">Firma y Sello de Auditoría / Gerencia</span>
        </div>
      </div>
    `;

    return `
      <div class="doc-movimiento doc-movimiento-sheet ${isA4 ? 'doc-a4-sheet doc-a4-movimiento' : ''} ${isLandscape ? 'doc-movimiento-hoja' : ''}">
        ${headerHtml}
        ${infoCardHtml}
        ${tableHtml}
        ${bottomGridHtml}
        ${signaturesHtml}
      </div>
    `;
  },

  movimientoCarta: function(data, config) {
    return this.movimientoHoja(data, config, 'letterPortrait');
  },

  movimientoA4: function(data, config) {
    return this.movimientoHoja(data, config, 'a4Portrait');
  },

  // ========================================================
  // CATÁLOGO CORPORATIVO DE PRODUCTOS (EDITORIAL & ÉLITE)
  // Con condicional estricto de existencias y diseño TAVO CLOUD
    // ========================================================
  // CATÁLOGO CORPORATIVO DE PRODUCTOS (EDITORIAL & ÉLITE)
  // Agrupado y ordenado por categorías, sin bolívares (Solo USD)
  // ========================================================
  catalogoProductos: function(productos, config, opciones) {
    const esc = DocumentPrinter.escape;
    const cfg = config || AppState.config || {};
    const opts = opciones || {};
    const mostrarStock = Boolean(opts.mostrarStock);
    const layout = opts.layout || 'grid'; // 'grid' | 'list'
    const prods = Array.isArray(productos) ? productos : [];

    // 1. Logotipo Corporativo
    let logoHtml = '';
    if (cfg.logo_url) {
      logoHtml = `<img src="${esc(cfg.logo_url)}" alt="Logo" style="max-height: 48px; max-width: 150px; object-fit: contain; margin-bottom: 2px;">`;
    } else {
      logoHtml = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
          <div style="width: 38px; height: 38px; border-radius: 10px; background: linear-gradient(135deg, #071B49, #0755C9); color: #00C6E8; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 16px; border: 1px solid #00C6E8;">
            TC
          </div>
          <span style="font-size: 13px; font-weight: 900; color: #071B49; letter-spacing: 0.5px;">TAVO CLOUD</span>
        </div>
      `;
    }

    // 2. Encabezado Institucional (Sin bolívares, solo USD)
    const hoyStr = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const tituloDoc = mostrarStock ? 'CATÁLOGO DE INVENTARIO' : 'CATÁLOGO DE PRODUCTOS';
    const subtituloDoc = mostrarStock ? 'Lista Oficial con Existencias Actuales' : 'Lista Oficial de Precios al Cliente';

    let headerHtml = `
      <div style="border-bottom: 2px solid #071B49; padding-bottom: 12px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;">
        <div style="display: flex; align-items: center; gap: 14px;">
          ${logoHtml}
          <div>
            <h1 style="margin: 0; font-size: 17px; font-weight: 900; color: #071B49; text-transform: uppercase; letter-spacing: -0.2px;">
              ${esc(cfg.nombre_negocio || 'TAVO CLOUD')}
            </h1>
            ${cfg.documento_fiscal ? `<p style="margin: 2px 0 0 0; font-size: 11px; font-weight: 700; color: #334155;">RIF: ${esc(cfg.documento_fiscal)}</p>` : ''}
            <p style="margin: 2px 0 0 0; font-size: 10px; color: #64748B;">
              ${cfg.telefono ? `<span><i class="fa-solid fa-phone" style="font-size: 9px; margin-right: 3px;"></i>${esc(cfg.telefono)}</span>` : ''}
              ${cfg.telefono && cfg.direccion ? ' &bull; ' : ''}
              ${cfg.direccion ? `<span>${esc(cfg.direccion)}</span>` : ''}
            </p>
          </div>
        </div>

        <div style="text-align: right; shrink-0;">
          <div style="display: inline-block; background: #071B49; color: #FFFFFF; font-size: 11px; font-weight: 800; padding: 4px 12px; border-radius: 6px; letter-spacing: 0.5px; text-transform: uppercase;">
            ${tituloDoc}
          </div>
          <div style="font-size: 9.5px; font-weight: 600; color: ${mostrarStock ? '#047857' : '#0755C9'}; margin-top: 3px;">
            ${subtituloDoc}
          </div>
          <div style="font-size: 9.5px; color: #64748B; margin-top: 2px;">
            Emisión: <strong>${hoyStr}</strong> &bull; Moneda: <strong>Dólares ($ USD)</strong>
          </div>
        </div>
      </div>
    `;

    // 3. Agrupación y Ordenamiento Estricto por Categoría
    let bodyHtml = '';

    if (prods.length === 0) {
      bodyHtml = `
        <div style="text-align: center; padding: 40px 20px; color: #94A3B8; font-size: 13px; font-style: italic;">
          No hay productos disponibles para mostrar con los filtros seleccionados.
        </div>
      `;
    } else {
      // Agrupar por categoría
      const categoriasMap = {};
      prods.forEach(p => {
        const cat = (p.categoria_nombre || 'General').trim();
        if (!categoriasMap[cat]) categoriasMap[cat] = [];
        categoriasMap[cat].push(p);
      });

      // Ordenar categorías alfabéticamente
      const sortedCategories = Object.keys(categoriasMap).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

      // Dentro de cada categoría, ordenar productos alfabéticamente
      sortedCategories.forEach(cat => {
        categoriasMap[cat].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }));
      });

      if (layout === 'list') {
        // Vista Lista Ejecutiva agrupada por categoría
        let tablesContent = '';
        sortedCategories.forEach(cat => {
          const catProds = categoriasMap[cat];
          let rowsHtml = '';
          catProds.forEach((p, idx) => {
            const num = idx + 1;
            const codigo = esc(p.codigo || '—');
            const nombre = esc(p.nombre || 'Producto');
            const precioTotal = parseFloat(p.precio_total || 0).toFixed(2);
            const stock = parseFloat(p.stock || 0);

            const imgMini = p.imagen 
              ? `<img src="${p.imagen}" alt="${nombre}" style="width: 32px; height: 32px; object-fit: contain; border-radius: 4px; border: 1px solid #E2E8F0; background: #F8FAFC;">`
              : `<div style="width: 32px; height: 32px; border-radius: 4px; background: #F1F5F9; border: 1px solid #E2E8F0; display: flex; align-items: center; justify-content: center; color: #94A3B8; font-size: 11px;"><i class="fa-solid fa-box"></i></div>`;

            let stockTd = '';
            if (mostrarStock) {
              stockTd = stock > 0
                ? `<td style="text-align: right; font-weight: 700; color: #047857; padding: 6px 8px;">${stock} unid.</td>`
                : `<td style="text-align: right; font-weight: 700; color: #B91C1C; padding: 6px 8px;">Agotado</td>`;
            }

            rowsHtml += `
              <tr style="break-inside: avoid; page-break-inside: avoid; border-bottom: 1px solid #F1F5F9;">
                <td style="text-align: center; color: #94A3B8; font-size: 9px; padding: 6px 4px;">${num}</td>
                <td style="padding: 4px 6px; text-align: center;">${imgMini}</td>
                <td style="font-family: monospace; font-size: 10px; font-weight: 700; color: #334155; padding: 6px 8px;">${codigo}</td>
                <td style="padding: 6px 8px;">
                  <strong style="color: #0F172A; font-size: 11px;">${nombre}</strong>
                  ${p.descripcion ? `<div style="font-size: 9px; color: #64748B;">${esc(p.descripcion)}</div>` : ''}
                </td>
                <td style="text-align: right; font-family: monospace; font-size: 12px; font-weight: 900; color: #0755C9; padding: 6px 8px;">
                  $${precioTotal} USD
                </td>
                ${stockTd}
              </tr>
            `;
          });

          tablesContent += `
            <tr style="background: #F1F5F9; border-top: 2px solid #071B49; border-bottom: 1px solid #CBD5E1; break-inside: avoid; page-break-inside: avoid; page-break-after: avoid;">
              <td colspan="${mostrarStock ? 6 : 5}" style="padding: 6px 10px; font-weight: 800; font-size: 11px; color: #071B49; text-transform: uppercase;">
                <i class="fa-solid fa-layer-group" style="color: #0755C9; margin-right: 6px;"></i>${esc(cat)} 
                <span style="font-size: 9px; font-weight: 600; color: #64748B; margin-left: 6px;">(${catProds.length} ${catProds.length === 1 ? 'producto' : 'productos'})</span>
              </td>
            </tr>
            ${rowsHtml}
          `;
        });

        bodyHtml = `
          <table style="width: 100%; border-collapse: collapse; font-size: 10.5px;">
            <thead>
              <tr style="background: #071B49; color: #FFFFFF; font-size: 10px; text-transform: uppercase;">
                <th style="padding: 7px 4px; text-align: center; width: 4%;">#</th>
                <th style="padding: 7px 6px; text-align: center; width: 6%;">Foto</th>
                <th style="padding: 7px 8px; text-align: left; width: 16%;">Código</th>
                <th style="padding: 7px 8px; text-align: left; width: ${mostrarStock ? '46%' : '56%'};">Producto</th>
                <th style="padding: 7px 8px; text-align: right; width: 18%;">Precio ($ USD)</th>
                ${mostrarStock ? '<th style="padding: 7px 8px; text-align: right; width: 12%;">Existencia</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${tablesContent}
            </tbody>
          </table>
        `;

      } else {
        // Vista Cuadrícula Editorial (Catálogo Élite Agrupado por Categorías)
        let sectionsHtml = '';

        sortedCategories.forEach(cat => {
          const catProds = categoriasMap[cat];
          let cardsHtml = '';

          catProds.forEach(p => {
            const codigo = esc(p.codigo || '—');
            const nombre = esc(p.nombre || 'Producto');
            const precioTotal = parseFloat(p.precio_total || 0).toFixed(2);
            const stock = parseFloat(p.stock || 0);

            // Imagen o Placeholder
            const imgBlock = p.imagen
              ? `<img src="${p.imagen}" alt="${nombre}" style="width: 100%; height: 100%; object-fit: contain; padding: 6px;">`
              : `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #94A3B8; font-size: 10px; font-weight: 600; gap: 4px;">
                  <i class="fa-solid fa-box" style="font-size: 26px; color: #CBD5E1;"></i>
                  <span style="font-size: 8.5px; color: #94A3B8; text-transform: uppercase;">${esc(cat)}</span>
                </div>
              `;

            // Badge de Existencia (CONDICIONAL ESTRICTO: NO APARECE SI mostrarStock=false)
            let stockBadgeHtml = '';
            if (mostrarStock) {
              if (stock > 0) {
                stockBadgeHtml = `
                  <div style="margin-top: 6px; background: #ECFDF5; border: 1px solid #A7F3D0; color: #065F46; font-size: 9.5px; font-weight: 700; padding: 2.5px 6px; border-radius: 4px; text-align: center; display: flex; align-items: center; justify-content: center; gap: 4px;">
                    <span style="display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: #059669;"></span>
                    <span>Stock: <strong>${stock}</strong> unid.</span>
                  </div>
                `;
              } else {
                stockBadgeHtml = `
                  <div style="margin-top: 6px; background: #FEF2F2; border: 1px solid #FECACA; color: #991B1B; font-size: 9.5px; font-weight: 700; padding: 2.5px 6px; border-radius: 4px; text-align: center;">
                    ✕ Agotado (0 unid.)
                  </div>
                `;
              }
            }

            cardsHtml += `
              <div class="doc-catalogo-card" style="border: 1px solid #E2E8F0; border-radius: 8px; background: #FFFFFF; overflow: hidden; display: flex; flex-direction: column; page-break-inside: avoid; break-inside: avoid;">
                <div style="width: 100%; height: 120px; background: #F8FAFC; border-bottom: 1px solid #F1F5F9; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                  ${imgBlock}
                </div>
                <div style="padding: 8px 10px; display: flex; flex-direction: column; flex: 1; justify-content: space-between;">
                  <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
                      <span style="font-family: monospace; font-size: 9px; font-weight: 700; color: #475569; background: #F1F5F9; padding: 1px 5px; border-radius: 3px;">${codigo}</span>
                      <span style="font-size: 8px; text-transform: uppercase; color: #64748B; font-weight: 700; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${esc(cat)}</span>
                    </div>
                    <h3 style="font-size: 11px; font-weight: 800; color: #0F172A; margin: 4px 0 2px 0; line-height: 1.25; min-height: 28px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                      ${nombre}
                    </h3>
                    ${p.descripcion ? `<p style="font-size: 8.5px; color: #64748B; margin: 0 0 4px 0; max-height: 22px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${esc(p.descripcion)}</p>` : ''}
                  </div>
                  <div>
                    <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 4px; border-top: 1px dashed #E2E8F0; padding-top: 4px;">
                      <div style="font-size: 15px; font-weight: 900; color: #0755C9;">$${precioTotal} <span style="font-size: 10px; font-weight: 700; color: #64748B;">USD</span></div>
                    </div>
                    ${stockBadgeHtml}
                  </div>
                </div>
              </div>
            `;
          });

          sectionsHtml += `
            <div style="margin-top: 14px; margin-bottom: 8px; break-inside: avoid; page-break-inside: avoid; page-break-after: avoid;">
              <div style="background: linear-gradient(135deg, #071B49 0%, #0755C9 100%); color: #FFFFFF; padding: 5px 12px; border-radius: 6px; display: flex; align-items: center; justify-content: space-between; border-left: 4px solid #00C6E8;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <i class="fa-solid fa-layer-group" style="color: #00C6E8; font-size: 10px;"></i>
                  <span style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">${esc(cat)}</span>
                </div>
                <span style="font-size: 9px; font-weight: 700; background: rgba(255,255,255,0.2); padding: 1px 7px; border-radius: 8px;">
                  ${catProds.length} ${catProds.length === 1 ? 'producto' : 'productos'}
                </span>
              </div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 12px;">
              ${cardsHtml}
            </div>
          `;
        });

        bodyHtml = sectionsHtml;
      }
    }

    // 4. Pie de Página Institucional (Solo USD)
    let footerHtml = `
      <div style="border-top: 1px solid #CBD5E1; padding-top: 8px; margin-top: 18px; display: flex; justify-content: space-between; align-items: center; font-size: 8.5px; color: #64748B; break-inside: avoid; page-break-inside: avoid;">
        <div>
          <strong>TAVO CLOUD Enterprise</strong> &bull; Precios expresados en Dólares Americanos (USD) sujetos a cambio sin previo aviso.
        </div>
        <div style="text-align: right;">
          ${cfg.telefono ? `<span>Contacto: <strong>${esc(cfg.telefono)}</strong></span> &bull; ` : ''}
          ${cfg.direccion ? `<span>${esc(cfg.direccion)}</span>` : ''}
        </div>
      </div>
    `;

    return `
      <div class="doc-sheet doc-letterPortrait doc-catalogo-sheet" style="padding: 10px; background: #FFFFFF;">
        ${headerHtml}
        ${bodyHtml}
        ${footerHtml}
      </div>
    `;
  }
};

// ========================================================
// DETERMINACIÓN DE TÍTULO DINÁMICO DE MOVIMIENTO DE INVENTARIO
// ========================================================
function getTituloMovimientoInventario(data) {
  if (!data) return 'COMPROBANTE OFICIAL DE MOVIMIENTO DE INVENTARIO';
  // FASE 2F-5C: Título dinámico por subtipo canónico (si existe). Registros legados conservan su título histórico.
  const subCanon = String(data.subtipo_ajuste || data.subtipo_movimiento || '').trim().toUpperCase();
  if (subCanon === 'ANULACION_AJUSTE') return 'REVERSIÓN — ANULACIÓN DE AJUSTE';
  const cfgCanon = (typeof obtenerConfigSubtipoAjuste === 'function') ? obtenerConfigSubtipoAjuste(subCanon) : null;
  if (cfgCanon) return cfgCanon.tituloDoc;
  const tipoAju = String(data.tipo_ajuste || '').trim().toLowerCase();
  const tipoMov = String(data.tipo_movimiento || '').trim().toLowerCase();
  const motivo = String(data.motivo || '').trim().toLowerCase();
  const all = `${tipoAju} ${tipoMov} ${motivo}`;

  // 1. Inventario Inicial
  if (all.includes('inicial') || all.includes('apertura')) {
    return 'ACTA FORMAL DE INVENTARIO INICIAL';
  }
  // 2. Merma
  if (all.includes('merma')) {
    return 'COMPROBANTE DE DESCARGO POR MERMA OPERATIVA';
  }
  // 3. Vencimiento
  if (all.includes('venc') || all.includes('caduc')) {
    return 'ACTA DE DESINCORPORACIÓN POR VENCIMIENTO';
  }
  // 4. Rotura / Daño
  if (all.includes('rotura') || all.includes('dano') || all.includes('daño') || all.includes('averia')) {
    return 'COMPROBANTE DE DESCARGO POR ROTURA / DAÑO';
  }
  // 5. Uso Interno
  if (all.includes('uso_interno') || all.includes('uso interno') || all.includes('consumo_interno') || all.includes('consumo interno')) {
    return 'VALE DE SALIDA PARA CONSUMO INTERNO';
  }
  // 6. Cargo por Ajuste Positivo
  if (tipoAju === 'cargo' || tipoMov === 'cargo' || tipoMov === 'cargo_ajuste' || (all.includes('cargo') && !all.includes('descargo'))) {
    return 'COMPROBANTE OFICIAL DE CARGO POR AJUSTE POSITIVO';
  }
  // 7. Descargo genérico si no coincide con los anteriores
  if (tipoAju === 'descargo' || tipoMov.startsWith('descargo') || all.includes('descargo')) {
    return 'COMPROBANTE DE DESCARGO DE INVENTARIO';
  }

  return 'COMPROBANTE OFICIAL DE MOVIMIENTO DE INVENTARIO';
}

// ========================================================
// FASE 2F-5C: METADATOS DOCUMENTALES DE AJUSTE (fuente única para todos los formatos)
// No inventa datos: lo no registrado en la base se muestra como N/D.
// ========================================================
function construirMetaDocumentoAjuste(data) {
  const d = data || {};
  const subtipo = String(d.subtipo_ajuste || '').trim().toUpperCase();
  const esCanonico = !!(typeof obtenerConfigSubtipoAjuste === 'function' && obtenerConfigSubtipoAjuste(subtipo));
  const estadoRaw = d.estado !== undefined && d.estado !== null ? String(d.estado).trim().toLowerCase() : '';
  const anulado = estadoRaw === 'anulado';
  const fmt = (f) => (f ? (typeof formatFecha === 'function' ? formatFecha(f) : String(f)) : '');
  let relacionadoTxt = '';
  if (d.ajuste_referencia_id) {
    const rel = (AppState && Array.isArray(AppState.historialAjustes)) ? AppState.historialAjustes.find(x => x.id === parseInt(d.ajuste_referencia_id, 10)) : null;
    relacionadoTxt = rel ? `${rel.numero_ajuste} (ID ${d.ajuste_referencia_id})` : `ID ${d.ajuste_referencia_id}`;
  }
  return {
    esCanonico,
    subtipo: subtipo || '',
    estadoTxt: estadoRaw ? (anulado ? 'ANULADO' : 'ACTIVO') : '',
    anulado,
    documentoReferencia: d.documento_referencia || '',
    autorizadoPor: d.autorizado_por || '',
    usuarioTxt: d.usuario_nombre || `Usuario #${d.usuario_id || 1}`,
    registroTxt: fmt(d.created_at || d.fecha) || 'N/D',
    relacionadoTxt,
    fechaAnulacionTxt: fmt(d.fecha_anulacion) || 'N/D',
    motivoAnulacion: d.motivo_anulacion || '',
    // El catálogo no registra unidad de medida: se informa N/D en lugar de inventar una.
    unidadTxt: d.unidad || 'N/D'
  };
}

function _cppDocTxt(v) {
  if (v === null || v === undefined || v === '' || !isFinite(Number(v))) return 'N/D';
  return '$' + Number(v).toFixed(4);
}

function _stockResultanteDocTxt(detalles) {
  const ds = detalles || [];
  if (ds.length === 0) return 'N/D';
  if (ds.length === 1) return parseFloat(ds[0].stock_nuevo || 0).toFixed(2);
  return 'Ver columna Stock Nue. por línea';
}

// ========================================================
// CONTROLADOR DE COMPROBANTE / DETALLE DE AJUSTE DE INVENTARIO
// ========================================================
function renderDetalleAjusteHTML(ajuste) {
  const a = ajuste || {};
  const meta = construirMetaDocumentoAjuste(a);
  const titulo = getTituloMovimientoInventario(a);
  const sentido = (a.sentido || (a.tipo_ajuste === 'CARGO' ? 'ENTRADA' : 'SALIDA')).toUpperCase();
  const detalles = a.detalles || [];
  const totalUnits = detalles.reduce((sum, d) => sum + parseFloat(d.cantidad || 0), 0);
  const totalCosto = detalles.reduce((sum, d) => sum + parseFloat(d.costo_total !== undefined ? d.costo_total : (d.cantidad * d.costo_unitario) || 0), 0);
  const fechaTxt = typeof formatFecha === 'function' ? formatFecha(a.fecha) : escapeHtml(a.fecha);
  const derivados = (AppState.historialAjustes || []).filter(x => parseInt(x.ajuste_referencia_id, 10) === parseInt(a.id, 10));

  const accionesHtml = meta.anulado
    ? `<div class="text-[11px] text-rose-700 font-semibold"><i class="fa-solid fa-ban mr-1"></i>Ajuste anulado: no admite nueva anulación. Disponible para consulta e impresión.</div>`
    : `<div class="flex flex-wrap gap-2">
         <button type="button" onclick="anularAjusteInventarioUI(${parseInt(a.id, 10)})" class="bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5"><i class="fa-solid fa-ban"></i> Anular ajuste</button>
         ${CONTRA_AJUSTE_FLUJO_BACKEND.disponible
           ? `<button type="button" onclick="prepararContraAjuste(${parseInt(a.id, 10)})" class="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5" title="Pre-llena un nuevo ajuste con ajuste_referencia_id. Se registra solo si usted lo confirma."><i class="fa-solid fa-right-left"></i> Crear contra-ajuste</button>`
           : `<button type="button" disabled class="bg-slate-100 text-slate-400 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold cursor-not-allowed">Crear contra-ajuste (no disponible)</button>`}
       </div>`;

  return `
    <div class="border-b pb-2 flex justify-between items-start">
      <div>
        <span class="inline-block px-2.5 py-0.5 rounded text-[11px] font-bold ${sentido === 'ENTRADA' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
          ${sentido} &bull; ${escapeHtml(a.tipo_ajuste)}
        </span>
        <span class="inline-block ml-1 px-2.5 py-0.5 rounded text-[11px] font-bold ${meta.anulado ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'}">${meta.anulado ? 'ANULADO' : 'ACTIVO'}</span>
        <h4 class="font-bold text-sm text-slate-800 mt-1">${escapeHtml(titulo)}</h4>
      </div>
      <span class="font-mono font-black text-sm text-teal-800">${escapeHtml(a.numero_ajuste)}</span>
    </div>

    <div>
      <div class="text-[10px] font-bold uppercase text-slate-500 mb-1">Documento</div>
      <div class="grid grid-cols-2 gap-x-3 gap-y-1 text-slate-600 text-[11px]">
        <div><strong>Número:</strong> ${escapeHtml(a.numero_ajuste || '—')}</div>
        <div><strong>Fecha:</strong> ${fechaTxt}</div>
        <div><strong>Estado:</strong> ${meta.anulado ? 'ANULADO' : 'ACTIVO'}</div>
        <div><strong>Usuario:</strong> ${escapeHtml(meta.usuarioTxt)}</div>
        <div class="col-span-2"><strong>Subtipo:</strong> <span class="font-mono">${escapeHtml(meta.subtipo || 'Sin subtipo (registro histórico)')}</span></div>
        <div class="col-span-2"><strong>Motivo:</strong> ${escapeHtml(a.motivo || '-')}</div>
        <div><strong>Referencia:</strong> ${escapeHtml(meta.documentoReferencia || 'N/D')}</div>
        <div><strong>Autorización:</strong> ${escapeHtml(meta.autorizadoPor || 'N/D')}</div>
        ${a.observaciones ? `<div class="col-span-2"><strong>Observaciones:</strong> ${escapeHtml(a.observaciones)}</div>` : ''}
        ${meta.anulado ? `<div class="col-span-2 text-rose-700"><strong>Anulación:</strong> ${escapeHtml(meta.fechaAnulacionTxt)}${meta.motivoAnulacion ? ' — ' + escapeHtml(meta.motivoAnulacion) : ''}</div>` : ''}
      </div>
    </div>

    <div class="border-t pt-2 overflow-x-auto">
      <div class="text-[10px] font-bold uppercase text-slate-500 mb-1">Producto y Valoración</div>
      <table class="w-full text-[11px] text-left">
        <thead>
          <tr class="border-b font-bold text-slate-700">
            <th class="py-1">Producto</th>
            <th class="py-1 text-right">Cant</th>
            <th class="py-1 text-center">Sentido / Subtipo</th>
            <th class="py-1 text-center">Stock Ant &rarr; Nue</th>
            <th class="py-1 text-center">CPP Ant &rarr; Nue</th>
            <th class="py-1 text-right">Costo U.</th>
            <th class="py-1 text-right">Valuación</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          ${detalles.map(d => `
            <tr>
              <td class="py-1">
                <span class="font-bold text-slate-900">${escapeHtml(d.producto_nombre || d.nombre || 'Producto')}</span>
                ${d.producto_codigo ? `<span class="block text-[10px] text-slate-400 font-mono">SKU ${escapeHtml(d.producto_codigo)}</span>` : ''}
                <span class="block text-[9px] text-slate-400 font-mono">documento_id=${escapeHtml(a.id)} &bull; documento_linea_id=${escapeHtml(d.id)}</span>
              </td>
              <td class="py-1 text-right font-mono font-bold">${parseFloat(d.cantidad || 0).toFixed(4)}</td>
              <td class="py-1 text-center text-[10px]">${sentido}<br><span class="font-mono text-slate-500">${escapeHtml(d.subtipo_movimiento || meta.subtipo || '—')}</span></td>
              <td class="py-1 text-center font-mono text-[10px] text-slate-500">${parseFloat(d.stock_anterior || 0).toFixed(4)} &rarr; ${parseFloat(d.stock_nuevo || 0).toFixed(4)}</td>
              <td class="py-1 text-center font-mono text-[10px]">${_cppDocTxt(d.cpp_anterior)} &rarr; <strong>${_cppDocTxt(d.cpp_nuevo)}</strong></td>
              <td class="py-1 text-right font-mono">$${parseFloat(d.costo_unitario || 0).toFixed(4)}</td>
              <td class="py-1 text-right font-mono font-bold">$${parseFloat(d.costo_total !== undefined ? d.costo_total : (d.cantidad * d.costo_unitario) || 0).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="border-t pt-2 flex justify-between font-bold text-slate-800 text-xs">
      <span>Total: ${detalles.length} ítem(s) &bull; ${totalUnits.toFixed(2)} unidades</span>
      <span class="text-teal-700 font-mono text-sm">Valuación Total: $${totalCosto.toFixed(2)}</span>
    </div>

    <div class="border-t pt-2 text-[11px] text-slate-600">
      <div class="text-[10px] font-bold uppercase text-slate-500 mb-1">Trazabilidad</div>
      <div><strong>documento_tipo:</strong> INVENTARIO_AJUSTE &bull; <strong>documento_id:</strong> ${escapeHtml(a.id)}</div>
      <div><strong>Ajuste relacionado (ajuste_referencia_id):</strong> ${escapeHtml(meta.relacionadoTxt || 'Ninguno')}</div>
      ${derivados.length ? `<div><strong>Contra-ajustes que lo referencian:</strong> ${derivados.map(x => escapeHtml(x.numero_ajuste)).join(', ')}</div>` : ''}
    </div>

    <div class="border-t pt-2 no-print" id="detalleAjusteAcciones">${accionesHtml}</div>
  `;
}

async function abrirComprobanteAjuste(ajusteId) {
  try {
    const res = await fetch(`/api/inventario/ajustes/${ajusteId}`);
    if (!res.ok) {
      alert('No se pudo cargar el comprobante del ajuste.');
      return;
    }
    const ajuste = await res.json();
    AppState.ultimoMovimientoInventario = ajuste;
    AppState.ultimoAjusteInventario = ajuste;
    AppState.ajustesDetalleCache = AppState.ajustesDetalleCache || {};
    if (ajuste && ajuste.id) AppState.ajustesDetalleCache[ajuste.id] = ajuste;

    const previewContainer = document.getElementById('previewComprobanteAjusteContenido');
    if (previewContainer) {
      previewContainer.innerHTML = renderDetalleAjusteHTML(ajuste);
    }

    const modal = document.getElementById('modalComprobanteAjuste');
    if (modal) modal.classList.remove('hidden');
  } catch (err) {
    console.error('Error al abrir comprobante de ajuste:', err);
    alert('Error al visualizar comprobante: ' + err.message);
  }
}

// ========================================================
// FASE 2F-5C: ANULACIÓN DIRECTA LIFO (POST /api/inventario/ajustes/:id/anular)
// ========================================================
function interpretarErrorAnulacionAjuste(mensaje) {
  const m = String(mensaje || '');
  if (m.includes('ANULACION_BLOQUEADA_MOVIMIENTOS_POSTERIORES')) return 'BLOQUEADA_MOVIMIENTOS_POSTERIORES';
  if (m.includes('PERIODO_CERRADO')) return 'PERIODO_CERRADO';
  if (m.includes('AJUSTE_YA_ANULADO')) return 'YA_ANULADO';
  if (m.includes('AJUSTE_NO_ENCONTRADO')) return 'NO_ENCONTRADO';
  if (m.includes('STOCK_NEGATIVO')) return 'STOCK_NEGATIVO';
  return 'ERROR';
}

async function anularAjusteInventarioUI(ajusteId) {
  const id = parseInt(ajusteId, 10);
  if (!id) return { estado: 'invalido' };
  const ref = (AppState.historialAjustes || []).find(x => x.id === id) || (AppState.ajustesDetalleCache || {})[id] || {};
  if (String(ref.estado || '').toLowerCase() === 'anulado') {
    showToast(`El ajuste ${ref.numero_ajuste || id} ya está anulado y no puede volver a anularse.`, 'error');
    return { estado: 'ya_anulado' };
  }
  if (AppState.ajusteAnulando) {
    showToast('Ya hay una anulación en proceso.', 'info');
    return { estado: 'en_proceso' };
  }

  const ok = (typeof confirm === 'function') ? confirm(`${MSG_CONFIRMACION_ANULACION_AJUSTE}\n\n¿Confirma la anulación del ajuste ${ref.numero_ajuste || ('#' + id)}?`) : false;
  if (!ok) return { estado: 'cancelado' };
  const motivo = (typeof prompt === 'function') ? prompt('Indique el motivo de la anulación:', 'Anulación por error de registro') : null;
  if (motivo === null) return { estado: 'cancelado' };
  if (!String(motivo).trim()) {
    showToast('Debe indicar un motivo válido para anular el ajuste.', 'error');
    return { estado: 'motivo_invalido' };
  }

  AppState.ajusteAnulando = true;
  try {
    const res = await fetch(`/api/inventario/ajustes/${id}/anular`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo: String(motivo).trim() })
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = (data && data.error) || `Error HTTP ${res.status}`;
      const tipo = interpretarErrorAnulacionAjuste(msg);
      if (tipo === 'BLOQUEADA_MOVIMIENTOS_POSTERIORES') {
        if (typeof alert === 'function') alert(MSG_ANULACION_BLOQUEADA_AJUSTE);
        showToast(MSG_ANULACION_BLOQUEADA_AJUSTE, 'error');
        return { estado: 'bloqueado', tipo, mensaje: msg };
      }
      if (tipo === 'PERIODO_CERRADO') {
        showToast('Ajuste perteneciente al período histórico certificado: no puede anularse directamente. Utilice un contra-ajuste.', 'error');
        return { estado: 'bloqueado', tipo, mensaje: msg };
      }
      showToast(msg, 'error');
      return { estado: 'error', tipo, mensaje: msg };
    }

    showToast(`Ajuste ${ref.numero_ajuste || id} anulado. Stock y CPP restaurados al estado anterior.`, 'success');
    if (AppState.ajustesDetalleCache) delete AppState.ajustesDetalleCache[id];
    try { await cargarHistorialAjustes(); } catch (e) {}
    try { if (typeof loadProductos === 'function') await loadProductos(); } catch (e) {}
    const modal = document.getElementById('modalComprobanteAjuste');
    if (modal && modal.classList && !modal.classList.contains('hidden')) {
      try { await abrirComprobanteAjuste(id); } catch (e) {}
    }
    return { estado: 'anulado', data };
  } catch (err) {
    showToast(err.message || 'Error al anular el ajuste', 'error');
    return { estado: 'error', mensaje: err.message };
  } finally {
    AppState.ajusteAnulando = false;
  }
}

// ========================================================
// FASE 2F-5C: PREPARACIÓN DE CONTRA-AJUSTE
// Solo pre-llena el formulario con ajuste_referencia_id. NO envía nada ni usa endpoints nuevos.
// El registro ocurre únicamente si el usuario confirma el formulario (POST /api/inventario/ajustes).
// ========================================================
async function prepararContraAjuste(ajusteId) {
  if (!CONTRA_AJUSTE_FLUJO_BACKEND.disponible) {
    showToast('Contra-ajuste no disponible en esta versión.', 'info');
    return null;
  }
  const id = parseInt(ajusteId, 10);
  let ajuste = (AppState.ajustesDetalleCache || {})[id];
  if (!ajuste || !ajuste.detalles) {
    const res = await fetch(`/api/inventario/ajustes/${id}`);
    if (!res.ok) { showToast('No se pudo cargar el ajuste a compensar.', 'error'); return null; }
    ajuste = await res.json();
  }
  if (String(ajuste.estado || '').toLowerCase() === 'anulado') {
    showToast('El ajuste está anulado: no requiere contra-ajuste.', 'info');
    return null;
  }
  const tipoContrario = String(ajuste.tipo_ajuste || '').toUpperCase() === 'CARGO' ? 'DESCARGO' : 'CARGO';
  cerrarModalComprobanteAjuste();
  openAjusteModal(tipoContrario, { contraAjusteDe: ajuste });
  return { tipo: tipoContrario, ajuste_referencia_id: id };
}

function cerrarModalComprobanteAjuste() {
  const modal = document.getElementById('modalComprobanteAjuste');
  if (modal) modal.classList.add('hidden');
}

async function abrirComprobanteDesdeKardex(ajusteId) {
  if (!ajusteId) {
    alert('No hay comprobante de ajuste asociado a este movimiento.');
    return;
  }
  await abrirComprobanteAjuste(ajusteId);
}

// ========================================================
// CONTROLADOR DE IMPRESIÓN DE MOVIMIENTO (DocumentPrinter)
// ========================================================
function imprimirMovimientoActual(formatoForzado) {
  const data = AppState.ultimoMovimientoInventario || AppState.ultimoAjusteInventario;
  if (!data) {
    alert('No hay información de ajuste o movimiento cargada para imprimir.');
    return false;
  }

  const select = document.getElementById('selectFormatoImpresionMovimiento');
  const formato = formatoForzado || (select ? select.value : 'letterPortrait') || 'letterPortrait';
  const cfg = AppState.config || {};

  let htmlDoc = '';
  let printType = 'letterPortrait';

  if (formato === 'ticket80') {
    htmlDoc = DocumentTemplates.movimientoTicket(data, cfg);
    printType = 'ticket80';
  } else if (formato === 'a4Portrait') {
    htmlDoc = DocumentTemplates.movimientoA4(data, cfg);
    printType = 'a4Portrait';
  } else if (formato === 'hoja' || formato === 'letterLandscape') {
    // Hoja: reutiliza la plantilla documental común movimientoHoja en el formato oficial existente Carta Horizontal
    htmlDoc = DocumentTemplates.movimientoHoja(data, cfg, 'letterLandscape');
    printType = 'letterLandscape';
  } else {
    htmlDoc = DocumentTemplates.movimientoCarta(data, cfg);
    printType = 'letterPortrait';
  }

  const numDoc = data.numero_ajuste || 'Ajuste';
  return DocumentPrinter.print({
    type: printType,
    title: `Comprobante Movimiento ${numDoc}`,
    html: htmlDoc
  });
}

// ========================================================
// CONTROLADOR DE IMPRESIÓN DE DEVOLUCIÓN (DocumentPrinter)
// ========================================================
function imprimirDevolucionActual(formatoForzado) {
  const dev = AppState.ultimaDevolucionEmitida;
  if (!dev) {
    alert('No hay información de devolución cargada para imprimir.');
    return false;
  }

  const select = document.getElementById('selectFormatoImpresionDevolucion');
  const formato = formatoForzado || (select ? select.value : 'letterPortrait') || 'letterPortrait';
  const cfg = AppState.config || {};

  let htmlDoc = '';
  let printType = 'letterPortrait';

  if (formato === 'ticket80') {
    htmlDoc = DocumentTemplates.devolucionTicket(dev, cfg);
    printType = 'ticket80';
  } else if (formato === 'a4Portrait') {
    htmlDoc = DocumentTemplates.devolucionA4(dev, cfg);
    printType = 'a4Portrait';
  } else {
    htmlDoc = DocumentTemplates.devolucionCarta(dev, cfg);
    printType = 'letterPortrait';
  }

  const numDoc = dev.numero_devolucion || 'Devolucion';
  return DocumentPrinter.print({
    type: printType,
    title: `Nota de Devolucion ${numDoc}`,
    html: htmlDoc
  });
}

// ========================================================
// CONTROLADOR DE IMPRESIÓN DE FACTURA (DocumentPrinter)
// ========================================================
function imprimirFacturaActual(formatoForzado) {
  const f = AppState.ultimaFacturaEmitida;
  if (!f) {
    alert('No hay información de factura cargada para imprimir.');
    return false;
  }

  const select = document.getElementById('selectFormatoImpresionFactura');
  const formato = formatoForzado || (select ? select.value : 'letterPortrait') || 'letterPortrait';
  const cfg = AppState.config || {};

  let htmlDoc = '';
  let printType = 'letterPortrait';

  if (formato === 'ticket80') {
    htmlDoc = DocumentTemplates.facturaTicket(f, cfg);
    printType = 'ticket80';
  } else if (formato === 'a4Portrait') {
    htmlDoc = DocumentTemplates.facturaA4(f, cfg);
    printType = 'a4Portrait';
  } else {
    htmlDoc = DocumentTemplates.facturaCarta(f, cfg);
    printType = 'letterPortrait';
  }

  const numDoc = f.numero_factura || 'Factura';
  return DocumentPrinter.print({
    type: printType,
    title: `Factura ${numDoc}`,
    html: htmlDoc
  });
}

// Compatibilidad Legacy
function imprimirFacturaLegacy() {
  window.print();
}

window.AppState = AppState;
window.DocumentTemplates = DocumentTemplates;
window.imprimirFacturaActual = imprimirFacturaActual;
window.imprimirFacturaLegacy = imprimirFacturaLegacy;
window.imprimirDevolucionActual = imprimirDevolucionActual;
window.imprimirTicketDevolucion = imprimirTicketDevolucion;
window.imprimirMovimientoActual = imprimirMovimientoActual;
window.abrirComprobanteAjuste = abrirComprobanteAjuste;
window.cerrarModalComprobanteAjuste = cerrarModalComprobanteAjuste;
window.abrirComprobanteDesdeKardex = abrirComprobanteDesdeKardex;
window.getTituloMovimientoInventario = getTituloMovimientoInventario;
window.anularAjusteInventarioUI = anularAjusteInventarioUI;
window.prepararContraAjuste = prepararContraAjuste;
window.renderDetalleAjusteHTML = renderDetalleAjusteHTML;
window.onAjusteSubtipoChange = onAjusteSubtipoChange;
window.openAjusteModal = openAjusteModal;
window.saveAjuste = saveAjuste;
window.AJUSTE_SUBTIPOS_UI = AJUSTE_SUBTIPOS_UI;
window.CONTRA_AJUSTE_FLUJO_BACKEND = CONTRA_AJUSTE_FLUJO_BACKEND;
window.MSG_ANULACION_BLOQUEADA_AJUSTE = MSG_ANULACION_BLOQUEADA_AJUSTE;
window.MSG_CONFIRMACION_ANULACION_AJUSTE = MSG_CONFIRMACION_ANULACION_AJUSTE;
window.verDetalleMovimientoKardex = verDetalleMovimientoKardex;
window.cerrarModalDetalleMovimiento = cerrarModalDetalleMovimiento;


// ========================================================
// FUNCIONES DE ANULACIÓN TRANSACCIONAL (FASE 4)
// ========================================================

async function anularFactura(facturaId, numFactura) {
  const motivo = prompt(`⚠️ ATENCIÓN: Vas a ANULAR la Factura #${numFactura}.\n\nEfectos inmediatos:\n• El stock vendido regresará (+) al inventario.\n• Si era a crédito, la cuenta por cobrar quedará anulada.\n• En el Libro de Ventas SENIAT aparecerá como ANULADA con monto 0,00 Bs.\n\nIngresa el motivo de la anulación:`, "Anulación por error en emisión");
  if (motivo === null) return;
  if (!motivo.trim()) {
    alert("Debes indicar un motivo válido para anular el documento.");
    return;
  }

  try {
    const res = await fetch(`/api/facturas/${facturaId}/anular`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo: motivo.trim() })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || data.message || "Error al anular factura");
    }
    alert(`✅ ${data.message}`);
    await loadFacturas();
    await loadProductos();
    await loadDashboard();
    if (typeof loadCxcConsolidado === 'function') loadCxcConsolidado();
  } catch (err) {
    alert("❌ No se pudo anular la factura: " + err.message);
  }
}

async function anularDevolucion(devId, numDev) {
  const motivo = prompt(`⚠️ ATENCIÓN: Vas a ANULAR la Nota de Devolución #${numDev}.\n\nEfectos inmediatos:\n• El stock devuelto se descontará (-) del inventario.\n• Si aplicaba a una factura a crédito, el saldo deudor del cliente se restituirá.\n\nIngresa el motivo de la anulación:`, "Reversión de nota de devolución");
  if (motivo === null) return;
  if (!motivo.trim()) {
    alert("Debes indicar un motivo válido para anular la devolución.");
    return;
  }

  try {
    const res = await fetch(`/api/devoluciones/${devId}/anular`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo: motivo.trim() })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || data.message || "Error al anular devolución");
    }
    alert(`✅ ${data.message}`);
    await loadDevoluciones();
    await loadProductos();
    await loadDashboard();
    if (typeof loadCxcConsolidado === 'function') loadCxcConsolidado();
  } catch (err) {
    alert("❌ No se pudo anular la devolución: " + err.message);
  }
}

async function anularCompra(compraId, numControl) {
  const motivo = prompt(`⚠️ ATENCIÓN: Vas a ANULAR la Compra #${numControl}.\n\nEfectos inmediatos:\n• Las unidades ingresadas se descontarán (-) del inventario.\n• La cuenta por pagar al proveedor quedará anulada.\n• Se excluirá del Libro de Compras.\n\nIngresa el motivo de la anulación:`, "Error en carga de factura de proveedor");
  if (motivo === null) return;
  if (!motivo.trim()) {
    alert("Debes indicar un motivo válido para anular la compra.");
    return;
  }

  try {
    const res = await fetch(`/api/compras/${compraId}/anular`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo: motivo.trim() })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || data.message || "Error al anular compra");
    }
    alert(`✅ ${data.message}`);
    await loadCompras();
    await loadProductos();
    await loadDashboard();
    if (typeof loadCxpConsolidado === 'function') loadCxpConsolidado();
  } catch (err) {
    alert("❌ No se pudo anular la compra: " + err.message);
  }
}

async function ejecutarAnulacionPagoSeleccionadoCXC(cxcId) {
  const selectEl = document.getElementById('selectPagoAnularCXC');
  if (!selectEl || selectEl.value === '') {
    alert('No hay ningún pago o abono seleccionado para anular.');
    return;
  }
  const abonoId = parseInt(selectEl.value, 10);
  const motivoEl = document.getElementById('motivoAnularPagoCXC');
  const motivo = (motivoEl && motivoEl.value.trim()) ? motivoEl.value.trim() : 'Reversión de cobro / abono aplicado';
  await anularAbonoCXC(abonoId, cxcId, motivo);
}

async function anularAbonoCXC(abonoId, cxcId, motivoExplicito = null) {
  const motivoInput = document.getElementById('motivoAnularPagoCXC');
  const motivo = (motivoExplicito || (motivoInput ? motivoInput.value : '') || 'Reversión de cobro / abono aplicado').trim();
  const btnPanel = document.getElementById('btnEjecutarAnulacionCXC');
  if (btnPanel) {
    btnPanel.disabled = true;
    btnPanel.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando anulación y restituyendo saldo...';
  }

  try {
    const res = await fetch(`/api/cxc/abonos/${abonoId}/anular`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo: motivo, cxc_id: cxcId })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || data.message || "Error al anular abono");
    }

    await verHistorialAbonosCXC(cxcId);
    const statusBox = document.getElementById('statusAnulacionCXC');
    if (statusBox) {
      statusBox.className = 'p-3 rounded-xl text-xs font-bold bg-emerald-50 border border-emerald-300 text-emerald-900 flex items-center gap-2';
      statusBox.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-600 text-sm"></i> <span>${escapeHtml(data.message || 'Pago anulado y saldo restituido correctamente.')}</span>`;
    }

    if (AppState.cxcClienteSeleccionado) {
      await verEstadoCuentaCliente(AppState.cxcClienteSeleccionado);
    }
    const modalAbono = document.getElementById('modalAbonoCXC');
    if (modalAbono && !modalAbono.classList.contains('hidden')) {
      await openModalAbonoCXC(cxcId);
    }
    await loadCxcConsolidado();
    await loadDashboard();
  } catch (err) {
    if (btnPanel) {
      btnPanel.disabled = false;
      btnPanel.innerHTML = '<i class="fa-solid fa-ban"></i> PROCESAR ANULACIÓN DE PAGO Y RESTITUIR SALDO';
    }
    const statusBox = document.getElementById('statusAnulacionCXC');
    if (statusBox) {
      statusBox.className = 'p-3 rounded-xl text-xs font-bold bg-rose-50 border border-rose-300 text-rose-900';
      statusBox.textContent = '❌ Error al anular abono: ' + err.message;
    } else {
      alert("❌ Error al anular abono: " + err.message);
    }
  }
}

async function ejecutarAnulacionPagoSeleccionadoCXP(cxpId) {
  const selectEl = document.getElementById('selectPagoAnularCXP');
  if (!selectEl || selectEl.value === '') {
    alert('No hay ningún pago o abono seleccionado para anular.');
    return;
  }
  const abonoId = parseInt(selectEl.value, 10);
  const motivoEl = document.getElementById('motivoAnularPagoCXP');
  const motivo = (motivoEl && motivoEl.value.trim()) ? motivoEl.value.trim() : 'Reversión de pago a proveedor';
  await anularAbonoCXP(abonoId, cxpId, motivo);
}

async function anularAbonoCXP(abonoId, cxpId, motivoExplicito = null) {
  const motivoInput = document.getElementById('motivoAnularPagoCXP');
  const motivo = (motivoExplicito || (motivoInput ? motivoInput.value : '') || 'Reversión de pago a proveedor').trim();
  const btnPanel = document.getElementById('btnEjecutarAnulacionCXP');
  if (btnPanel) {
    btnPanel.disabled = true;
    btnPanel.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando anulación y restituyendo deuda...';
  }

  try {
    const res = await fetch(`/api/cxp/abonos/${abonoId}/anular`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo: motivo, cxp_id: cxpId })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || data.message || "Error al anular pago");
    }

    await verHistorialAbonosCXP(cxpId);
    const statusBox = document.getElementById('statusAnulacionCXP');
    if (statusBox) {
      statusBox.className = 'p-3 rounded-xl text-xs font-bold bg-emerald-50 border border-emerald-300 text-emerald-900 flex items-center gap-2';
      statusBox.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-600 text-sm"></i> <span>${escapeHtml(data.message || 'Pago anulado y deuda restituida correctamente.')}</span>`;
    }

    if (AppState.cxpProveedorSeleccionado) {
      await verEstadoCuentaProveedor(AppState.cxpProveedorSeleccionado);
    }
    const modalAbono = document.getElementById('modalAbonoCXP');
    if (modalAbono && !modalAbono.classList.contains('hidden')) {
      await openModalAbonoCXP(cxpId);
    }
    await loadCxpConsolidado();
    await loadDashboard();
  } catch (err) {
    if (btnPanel) {
      btnPanel.disabled = false;
      btnPanel.innerHTML = '<i class="fa-solid fa-ban"></i> PROCESAR ANULACIÓN DE PAGO Y RESTITUIR DEUDA';
    }
    const statusBox = document.getElementById('statusAnulacionCXP');
    if (statusBox) {
      statusBox.className = 'p-3 rounded-xl text-xs font-bold bg-rose-50 border border-rose-300 text-rose-900';
      statusBox.textContent = '❌ Error al anular pago: ' + err.message;
    } else {
      alert("❌ Error al anular pago: " + err.message);
    }
  }
}

async function anularCuentaCXP(cxpId, numDoc) {
  const motivo = prompt(`⚠️ ¿Deseas ANULAR la cuenta por pagar directa ${numDoc ? '#' + numDoc : '#' + cxpId}?\n\nEl saldo pendiente pasará a $0.00 y dejará de figurar como deuda activa.\n\nIngresa el motivo de la anulación:`, "Anulación de cargo administrativo");
  if (motivo === null) return;
  if (!motivo.trim()) {
    alert("Debes ingresar un motivo válido.");
    return;
  }

  try {
    const res = await fetch(`/api/cxp/${cxpId}/anular`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo: motivo.trim() })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || data.message || "Error al anular cuenta por pagar");
    }
    alert(`✅ ${data.message}`);
    if (AppState.cxpProveedorSeleccionado) {
      await verEstadoCuentaProveedor(AppState.cxpProveedorSeleccionado);
    }
    await loadCxpConsolidado();
    await loadDashboard();
    if (AppState.currentView === 'reportes' && AppState.reportesTabActual === 'cxp') loadReporteCxp();
  } catch (err) {
    alert("❌ Error al anular cuenta: " + err.message);
  }
}

async function anularFacturaDesdeCXC(facturaId, numFactura) {
  await anularFactura(facturaId, numFactura);
  if (AppState.cxcClienteSeleccionado) {
    await verEstadoCuentaCliente(AppState.cxcClienteSeleccionado);
  }
  await loadCxcConsolidado();
  if (AppState.currentView === 'reportes' && AppState.reportesTabActual === 'cxc') loadReporteCxc();
}

async function anularCompraDesdeCXP(compraId, numControl) {
  await anularCompra(compraId, numControl);
  if (AppState.cxpProveedorSeleccionado) {
    await verEstadoCuentaProveedor(AppState.cxpProveedorSeleccionado);
  }
  await loadCxpConsolidado();
  if (AppState.currentView === 'reportes' && AppState.reportesTabActual === 'cxp') loadReporteCxp();
}

// ========================================================
// SISTEMA DE NOTIFICACIONES TOAST CORPORATIVO (ERP GRADE)
// ========================================================
function showToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('corporateToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'corporateToastContainer';
    container.className = 'fixed bottom-5 right-5 z-[9999] flex flex-col space-y-2 pointer-events-none max-w-sm w-full px-4';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'corporate-toast pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl shadow-lg border text-xs font-medium transition-all duration-300 transform translate-y-3 opacity-0';

  let icon = 'fa-circle-info';
  let colors = 'bg-white text-slate-800 border-slate-200';
  let iconColor = 'text-teal-600';

  if (type === 'success') {
    icon = 'fa-circle-check';
    colors = 'bg-white text-emerald-900 border-emerald-200 shadow-emerald-500/10';
    iconColor = 'text-emerald-500';
  } else if (type === 'error') {
    icon = 'fa-triangle-exclamation';
    colors = 'bg-white text-rose-900 border-rose-200 shadow-rose-500/10';
    iconColor = 'text-rose-500';
  } else if (type === 'warning') {
    icon = 'fa-circle-exclamation';
    colors = 'bg-white text-amber-900 border-amber-200 shadow-amber-500/10';
    iconColor = 'text-amber-500';
  }

  toast.className += ' ' + colors;
  toast.innerHTML = `
    <i class="fa-solid ${icon} text-base mt-0.5 shrink-0 ${iconColor}"></i>
    <div class="flex-1 min-w-0 pr-1 leading-snug">${escapeHtml(message)}</div>
    <button type="button" onclick="this.closest('.corporate-toast').remove()" class="text-slate-400 hover:text-slate-700 shrink-0 cursor-pointer">
      <i class="fa-solid fa-xmark text-sm"></i>
    </button>
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-3', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-x-3');
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 300);
  }, duration);
}
window.showToast = showToast;

// ========================================================
// MODAL ACERCA DEL SISTEMA & LICENCIA CORPORATIVA
// ========================================================
function openAcercaDeModal() {
  const modal = document.getElementById('modalAcercaDe');
  if (modal) modal.classList.remove('hidden');
}
window.openAcercaDeModal = openAcercaDeModal;

function closeAcercaDeModal() {
  const modal = document.getElementById('modalAcercaDe');
  if (modal) modal.classList.add('hidden');
}
window.closeAcercaDeModal = closeAcercaDeModal;

// ========================================================
// SIMULADOR RBAC: CONTROL DE ROLES (ADMINISTRADOR VS CAJERO)
// ========================================================
function initRolUsuario() {
  const rol = localStorage.getItem('sistema_perfil_rol') || 'admin';
  aplicarRolUsuario(rol);
}
window.initRolUsuario = initRolUsuario;

function toggleRolUsuario() {
  const actual = localStorage.getItem('sistema_perfil_rol') || 'admin';
  const nuevo = actual === 'admin' ? 'cajero' : 'admin';
  localStorage.setItem('sistema_perfil_rol', nuevo);
  aplicarRolUsuario(nuevo);
  showToast(`Modo de Operación cambiado a: ${nuevo === 'admin' ? 'Administrador' : 'Cajero (POS)'}`, 'info');
}
window.toggleRolUsuario = toggleRolUsuario;

function aplicarRolUsuario(rol) {
  const badgeText = document.getElementById('headerRoleText');
  const badgeContainer = document.getElementById('headerRoleBadge');

  if (rol === 'cajero') {
    document.body.classList.add('rol-cajero');
    if (badgeText) badgeText.textContent = 'Cajero (POS)';
    if (badgeContainer) {
      badgeContainer.className = 'inline-flex items-center text-[10px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200 transition cursor-pointer shadow-2xs';
    }
    // Si el usuario está en vistas administrativas exclusivas, dirigir a facturacion
    if (AppState.currentView === 'reportes') {
      navigate('facturacion');
    }
  } else {
    document.body.classList.remove('rol-cajero');
    if (badgeText) badgeText.textContent = 'Administrador';
    if (badgeContainer) {
      badgeContainer.className = 'inline-flex items-center text-[10px] font-bold text-teal-800 bg-teal-50 hover:bg-teal-100 px-2 py-0.5 rounded-full border border-teal-200 transition cursor-pointer shadow-2xs';
    }
  }
}
window.aplicarRolUsuario = aplicarRolUsuario;

// ========================================================
// ERGONOMÍA POS: ESCÁNER DE CÓDIGOS DE BARRA & TECLADO RÁPIDO
// ========================================================
function handlePosCatalogKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    handlePosBarcodeScan(event.target.value.trim());
  }
}
window.handlePosCatalogKeydown = handlePosCatalogKeydown;

function handlePosBarcodeScan(query) {
  if (!query) return;

  const q = query.toLowerCase();
  // 1. Buscar coincidencia exacta por código de producto o código de barras
  let prod = AppState.productos.find(p => (p.codigo && p.codigo.toLowerCase() === q) || (p.codigo_barras && p.codigo_barras.toLowerCase() === q));

  // 2. Si no hay coincidencia exacta por código, buscar coincidencia exacta por nombre
  if (!prod) {
    prod = AppState.productos.find(p => p.nombre && p.nombre.toLowerCase() === q);
  }

  // 3. Si no hay exacta, pero la búsqueda actual arroja un único producto
  if (!prod) {
    const filtrados = AppState.productos.filter(p => 
      (p.nombre && p.nombre.toLowerCase().includes(q)) || 
      (p.codigo && p.codigo.toLowerCase().includes(q))
    );
    if (filtrados.length === 1) {
      prod = filtrados[0];
    }
  }

  if (prod) {
    addPosItem(prod.id);
    showToast(`Ítem agregado: ${prod.nombre}`, 'success', 2200);
    const searchInput = document.getElementById('posSearchProduct');
    if (searchInput) {
      searchInput.value = '';
      renderPosCatalog();
      searchInput.focus();
    }
  } else {
    showToast(`No se encontró producto con código o nombre: "${query}"`, 'warning', 3000);
  }
}
window.handlePosBarcodeScan = handlePosBarcodeScan;

// Listener Global de Atajos de Teclado (F2, F4, F8, Escape)
window.addEventListener('keydown', (e) => {
  // Tecla Escape: cerrar cualquier modal activo
  if (e.key === 'Escape') {
    const openModals = document.querySelectorAll('.modal-overlay:not(.hidden)');
    if (openModals.length > 0) {
      e.preventDefault();
      openModals.forEach(m => m.classList.add('hidden'));
      return;
    }
  }

  // Atajos para la vista de Facturación / POS
  const isPosView = AppState.currentView === 'facturacion';
  if (isPosView) {
    if (e.key === 'F2') {
      e.preventDefault();
      const search = document.getElementById('posSearchProduct');
      if (search) {
        search.focus();
        search.select();
      }
    } else if (e.key === 'F4') {
      e.preventDefault();
      if (AppState.posCart && AppState.posCart.length > 0) {
        const btnContado = document.getElementById('btnProcesarContado');
        const btnCredito = document.getElementById('btnProcesarCredito');
        if (btnContado && !btnContado.classList.contains('hidden')) {
          btnContado.click();
        } else if (btnCredito && !btnCredito.classList.contains('hidden')) {
          btnCredito.click();
        }
      } else {
        showToast('El carrito está vacío. Agregue productos antes de cobrar (F2 para buscar).', 'warning');
      }
    } else if (e.key === 'F8') {
      e.preventDefault();
      if (AppState.posCart && AppState.posCart.length > 0) {
        if (confirm('¿Desea limpiar el carrito actual e iniciar una nueva venta?')) {
          limpiarPOS();
          showToast('Venta reiniciada.', 'info', 2000);
        }
      } else {
        limpiarPOS();
      }
    }
  }
});

/**
 * ============================================================================
 * MÓDULO DE TESORERÍA, CAJAS, ARQUEOS Y PAGOS N:M (FASE 2F-6D)
 * D-BIAN SYSTEM COMPUTER - Ing. José Morales
 * ============================================================================
 */

// Estado local de Tesorería
AppState.tesoreria = {
  cuentas: [],
  resumen: null,
  tabActual: 'movimientos',
  pagos: [],
  gastos: [],
  anticipos: [],
  cajasAbiertas: [],
  cobroNMDetalles: []
};

/**
 * Carga principal de la vista de Tesorería
 */
async function loadTesoreria() {
  try {
    const res = await fetch('/api/tesoreria/resumen');
    if (!res.ok) throw new Error('No se pudo cargar el resumen de tesorería');
    const json = await res.json();
    AppState.tesoreria.resumen = json.data;
    AppState.tesoreria.cuentas = json.data.cuentas || [];
    AppState.tesoreria.cajasAbiertas = json.data.cajas_abiertas || [];

    renderTesoreriaCards(AppState.tesoreria.resumen);
    renderTesoreriaTurnosBanner(AppState.tesoreria.cajasAbiertas);

    // Cargar la sub-pestaña activa
    cambiarTabTesoreria(AppState.tesoreria.tabActual || 'movimientos');
  } catch (err) {
    console.error('[Tesorería] Error al cargar:', err);
    if (typeof showToast === 'function') {
      showToast(err.message || 'Error al conectar con el servidor de tesorería', 'error');
    }
  }
}

/**
 * Renderiza las tarjetas de balance de cuentas
 */
function renderTesoreriaCards(resumen) {
  const container = document.getElementById('tesoreriaCuentasCardsContainer');
  if (!container) return;

  const cuentas = resumen.cuentas || [];
  const tasas = AppState.config || { tasa_ves: 45.0, tasa_cop: 4100.0 };
  const tVes = parseFloat(tasas.tasa_ves || 45.0);
  const tCop = parseFloat(tasas.tasa_cop || 4100.0);

  const getAccountIcon = (tipo, moneda) => {
    if (tipo === 'caja_efectivo') {
      return moneda === 'USD' ? 'fa-dollar-sign text-emerald-600 bg-emerald-50' : (moneda === 'VES' ? 'fa-money-bill-1 text-amber-600 bg-amber-50' : 'fa-coins text-teal-600 bg-teal-50');
    }
    return 'fa-building-columns text-sky-600 bg-sky-50';
  };

  const getSubtext = (c) => {
    const saldo = parseFloat(c.saldo_actual || 0);
    if (c.moneda === 'USD') {
      return `≈ ${(saldo * tVes).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.`;
    } else if (c.moneda === 'VES') {
      const eq = tVes > 0 ? (saldo / tVes) : 0;
      return `≈ $${eq.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
    } else if (c.moneda === 'COP') {
      const eq = tCop > 0 ? (saldo / tCop) : 0;
      return `≈ $${eq.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
    }
    return '';
  };

  container.innerHTML = cuentas.map(c => {
    const iconClass = getAccountIcon(c.tipo, c.moneda);
    const saldo = parseFloat(c.saldo_actual || 0);
    const formattedSaldo = c.moneda === 'USD'
      ? `$${saldo.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : (c.moneda === 'VES' ? `${saldo.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.` : `${saldo.toLocaleString('es-CO', { minimumFractionDigits: 0 })} COP`);

    // Verificar si tiene turno abierto
    const isOpen = (resumen.cajas_abiertas || []).some(a => a.cuenta_tesoreria_id === c.id);
    const statusBadge = c.tipo === 'caja_efectivo'
      ? (isOpen
        ? `<span class="text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full border border-emerald-300 flex items-center"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse"></span>Turno Abierto</span>`
        : `<span class="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">Turno Cerrado</span>`)
      : `<span class="text-[10px] font-bold text-sky-700 bg-sky-100/80 px-2 py-0.5 rounded-full border border-sky-300">Cuenta Activa</span>`;

    return `
      <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition">
        <div class="flex items-start justify-between">
          <div class="space-y-1">
            <span class="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">${c.nombre}</span>
            <h3 class="text-2xl font-black text-slate-900 font-mono tracking-tight">${formattedSaldo}</h3>
            <p class="text-xs font-mono text-slate-500 font-medium">${getSubtext(c)}</p>
          </div>
          <div class="w-12 h-12 rounded-2xl flex items-center justify-center text-xl shrink-0 ${iconClass}">
            <i class="fa-solid ${iconClass.split(' ')[0]}"></i>
          </div>
        </div>
        <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
          <span class="text-[11px] font-semibold text-slate-400 capitalize">${c.tipo.replace('_', ' ')}</span>
          ${statusBadge}
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Renderiza el banner de turnos abiertos
 */
function renderTesoreriaTurnosBanner(aperturas) {
  const container = document.getElementById('tesoreriaTurnosAlertaContainer');
  if (!container) return;

  if (!aperturas || aperturas.length === 0) {
    container.innerHTML = `
      <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between text-xs text-slate-600">
        <div class="flex items-center space-x-2">
          <i class="fa-solid fa-circle-info text-slate-400 text-sm"></i>
          <span>No hay turnos de caja de mostrador abiertos actualmente. Puede iniciar jornada haciendo clic en <strong>Abrir Caja</strong>.</span>
        </div>
        <button onclick="openModalAperturaCaja()" class="text-xs font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl transition">
          <i class="fa-solid fa-lock-open mr-1"></i>Abrir Caja
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="p-4 bg-emerald-50/80 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-emerald-900">
      <div class="flex items-center space-x-3">
        <div class="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
          <i class="fa-solid fa-cash-register text-base"></i>
        </div>
        <div>
          <h4 class="font-bold text-sm leading-tight text-emerald-950">Turno de Caja Activo: ${aperturas.map(a => a.cuenta_nombre).join(', ')}</h4>
          <p class="text-xs text-emerald-700 mt-0.5">Iniciado: ${aperturas[0].fecha_apertura} | Fondo Inicial: $${parseFloat(aperturas[0].monto_inicial_usd || 0).toFixed(2)} USD</p>
        </div>
      </div>
      <button onclick="openModalCierreCaja()" class="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs shadow-xs transition shrink-0">
        <i class="fa-solid fa-calculator mr-1.5"></i>Cerrar / Realizar Arqueo
      </button>
    </div>
  `;
}

/**
 * Cambia la sub-pestaña activa de tesorería
 */
function cambiarTabTesoreria(tabName) {
  AppState.tesoreria.tabActual = tabName;

  const tabs = ['movimientos', 'gastos', 'anticipos', 'arqueos'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tab-tesoreria-${t}`);
    const content = document.getElementById(`tesoreriaTabContent${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (btn) {
      if (t === tabName) {
        btn.classList.add('active-tab', 'border-teal-600', 'text-teal-700', 'font-bold');
        btn.classList.remove('border-transparent', 'text-slate-500', 'font-medium');
      } else {
        btn.classList.remove('active-tab', 'border-teal-600', 'text-teal-700', 'font-bold');
        btn.classList.add('border-transparent', 'text-slate-500', 'font-medium');
      }
    }
    if (content) {
      if (t === tabName) {
        content.classList.remove('hidden');
      } else {
        content.classList.add('hidden');
      }
    }
  });

  if (tabName === 'movimientos') loadTesoreriaMovimientos();
  if (tabName === 'gastos') loadTesoreriaGastos();
  if (tabName === 'anticipos') loadTesoreriaAnticipos();
  if (tabName === 'arqueos') loadTesoreriaArqueos();
}

/**
 * Carga el historial de pagos y movimientos
 */
async function loadTesoreriaMovimientos() {
  const tbody = document.getElementById('tablaPagosTesoreriaBody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="text-center py-8 text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Cargando movimientos...</td></tr>`;

  try {
    const tipo = document.getElementById('filtroTipoOperacionPago')?.value || '';
    const estado = document.getElementById('filtroEstadoPago')?.value || '';
    const params = new URLSearchParams();
    if (tipo) params.append('tipo_operacion', tipo);
    if (estado) params.append('estado', estado);

    const res = await fetch(`/api/pagos?${params.toString()}`);
    if (!res.ok) throw new Error('Error al consultar historial de pagos');
    const json = await res.json();
    AppState.tesoreria.pagos = json.data || [];
    renderTablaPagosTesoreria(AppState.tesoreria.pagos);
  } catch (err) {
    console.error('[Tesorería] Error al cargar pagos:', err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="text-center py-6 text-rose-500 font-semibold">${err.message}</td></tr>`;
  }
}

/**
 * Renderiza la tabla de pagos
 */
function renderTablaPagosTesoreria(pagos) {
  const tbody = document.getElementById('tablaPagosTesoreriaBody');
  if (!tbody) return;

  if (!pagos || pagos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-10 text-slate-400"><i class="fa-solid fa-folder-open text-2xl block mb-2 opacity-50"></i>No hay registros de pagos que coincidan con el filtro</td></tr>`;
    return;
  }

  tbody.innerHTML = pagos.map(p => {
    const estadoBadge = p.estado === 'activo'
      ? `<span class="bg-emerald-50 text-emerald-700 font-bold px-2.5 py-0.5 rounded-full border border-emerald-200/80 text-[10px]">Activo</span>`
      : `<span class="bg-rose-50 text-rose-700 font-bold px-2.5 py-0.5 rounded-full border border-rose-200/80 text-[10px]" title="Anulado: ${p.motivo_anulacion || ''}">Anulado</span>`;

    const opBadge = p.tipo_operacion === 'cobro_cliente'
      ? `<span class="text-teal-700 font-bold"><i class="fa-solid fa-arrow-down-left mr-1"></i>Cobro Cliente</span>`
      : (p.tipo_operacion === 'pago_proveedor'
        ? `<span class="text-rose-700 font-bold"><i class="fa-solid fa-arrow-up-right mr-1"></i>Pago Proveedor</span>`
        : `<span class="text-amber-700 font-bold"><i class="fa-solid fa-piggy-bank mr-1"></i>Anticipo</span>`);

    const terceroNombre = p.cliente_nombre || p.proveedor_nombre || `Tercero #${p.tercero_id}`;

    const anularBtn = p.estado === 'activo'
      ? `<button onclick="anularPagoModal(${p.id}, '${p.numero_pago}')" class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition" title="Anular Pago"><i class="fa-solid fa-ban text-xs"></i></button>`
      : `<span class="text-slate-300 text-xs">-</span>`;

    return `
      <tr class="hover:bg-slate-50/80 transition text-xs font-medium">
        <td class="py-3 px-4 font-mono">
          <strong class="text-slate-900 block font-bold">${p.numero_pago}</strong>
          <span class="text-[10px] text-slate-400">${p.fecha_pago || p.created_at}</span>
        </td>
        <td class="py-3 px-4">${opBadge}</td>
        <td class="py-3 px-4 font-semibold text-slate-800">${terceroNombre}</td>
        <td class="py-3 px-4 text-slate-600 max-w-xs truncate" title="${p.concepto || ''}">${p.concepto || '-'}</td>
        <td class="py-3 px-4 text-right font-mono font-black text-slate-900">$${parseFloat(p.monto_total_equivalente_usd || 0).toFixed(2)}</td>
        <td class="py-3 px-4 text-right font-mono text-emerald-700 font-bold">$${parseFloat(p.monto_aplicado_usd || 0).toFixed(2)}</td>
        <td class="py-3 px-4 text-right font-mono text-amber-700 font-bold">$${parseFloat(p.monto_no_aplicado_usd || 0).toFixed(2)}</td>
        <td class="py-3 px-4 text-center">${estadoBadge}</td>
        <td class="py-3 px-4 text-center">${anularBtn}</td>
      </tr>
    `;
  }).join('');
}

/**
 * Filtro instantáneo de la tabla de pagos
 */
function filtrarTablaPagosTesoreria() {
  const query = (document.getElementById('filtroBuscarPago')?.value || '').toLowerCase().trim();
  if (!query) {
    renderTablaPagosTesoreria(AppState.tesoreria.pagos);
    return;
  }
  const filtrados = (AppState.tesoreria.pagos || []).filter(p => {
    return (p.numero_pago || '').toLowerCase().includes(query) ||
           (p.cliente_nombre || '').toLowerCase().includes(query) ||
           (p.proveedor_nombre || '').toLowerCase().includes(query) ||
           (p.concepto || '').toLowerCase().includes(query);
  });
  renderTablaPagosTesoreria(filtrados);
}

/**
 * Carga gastos operativos
 */
async function loadTesoreriaGastos() {
  const tbody = document.getElementById('tablaGastosTesoreriaBody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Cargando gastos operativos...</td></tr>`;

  try {
    const res = await fetch('/api/gastos');
    if (!res.ok) throw new Error('Error al consultar gastos operativos');
    const json = await res.json();
    AppState.tesoreria.gastos = json.data || [];
    renderTablaGastosTesoreria(AppState.tesoreria.gastos);
  } catch (err) {
    console.error('[Tesorería] Error al cargar gastos:', err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-rose-500 font-semibold">${err.message}</td></tr>`;
  }
}

/**
 * Renderiza la tabla de gastos
 */
function renderTablaGastosTesoreria(gastos) {
  const tbody = document.getElementById('tablaGastosTesoreriaBody');
  if (!tbody) return;

  if (!gastos || gastos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-10 text-slate-400"><i class="fa-solid fa-receipt text-2xl block mb-2 opacity-50"></i>No hay gastos operativos registrados</td></tr>`;
    return;
  }

  tbody.innerHTML = gastos.map(g => {
    const tipoPagoBadge = g.tipo_pago === 'contado'
      ? `<span class="bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full border border-emerald-200 text-[10px]">Contado (${g.cuenta_nombre || 'Caja'})</span>`
      : `<span class="bg-amber-50 text-amber-700 font-bold px-2 py-0.5 rounded-full border border-amber-200 text-[10px]">Crédito (CxP #${g.cuenta_por_pagar_id || ''})</span>`;

    return `
      <tr class="hover:bg-slate-50/80 transition text-xs font-medium">
        <td class="py-3 px-4 font-mono">
          <strong class="text-slate-900 block font-bold">${g.numero_gasto}</strong>
          <span class="text-[10px] text-slate-400">${g.fecha_emision || g.created_at}</span>
        </td>
        <td class="py-3 px-4 capitalize font-semibold text-slate-700">${g.categoria_gasto}</td>
        <td class="py-3 px-4 font-bold text-slate-800">${g.beneficiario}</td>
        <td class="py-3 px-4 text-slate-600 max-w-xs truncate" title="${g.concepto || ''}">${g.concepto}</td>
        <td class="py-3 px-4">${tipoPagoBadge}</td>
        <td class="py-3 px-4 text-right font-mono font-bold text-slate-800">${parseFloat(g.monto_total_moneda || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })} ${g.moneda}</td>
        <td class="py-3 px-4 text-right font-mono font-black text-rose-700">$${parseFloat(g.monto_total_usd || 0).toFixed(2)} USD</td>
        <td class="py-3 px-4 text-center"><span class="bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-full text-[10px] capitalize">${g.estado}</span></td>
      </tr>
    `;
  }).join('');
}

/**
 * Filtro de gastos
 */
function filtrarTablaGastosTesoreria() {
  const query = (document.getElementById('filtroBuscarGasto')?.value || '').toLowerCase().trim();
  if (!query) {
    renderTablaGastosTesoreria(AppState.tesoreria.gastos);
    return;
  }
  const filtrados = (AppState.tesoreria.gastos || []).filter(g => {
    return (g.numero_gasto || '').toLowerCase().includes(query) ||
           (g.beneficiario || '').toLowerCase().includes(query) ||
           (g.concepto || '').toLowerCase().includes(query);
  });
  renderTablaGastosTesoreria(filtrados);
}

/**
 * Carga anticipos de clientes
 */
async function loadTesoreriaAnticipos() {
  const tbody = document.getElementById('tablaAnticiposTesoreriaBody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Cargando saldos a favor...</td></tr>`;

  try {
    // Si tenemos clientes, consultar anticipos de cada uno o de la lista general
    const clientesRes = await fetch('/api/clientes');
    const clientes = await clientesRes.json();
    let todosAnticipos = [];

    for (const c of (clientes || [])) {
      try {
        const aRes = await fetch(`/api/anticipos/cliente/${c.id}?solo_disponibles=false`);
        if (aRes.ok) {
          const aJson = await aRes.json();
          (aJson.data || []).forEach(ant => {
            ant.cliente_nombre = c.nombre;
            ant.cliente_cedula = c.documento;
            todosAnticipos.push(ant);
          });
        }
      } catch (e) {
        // Ignorar fallo de cliente individual
      }
    }

    AppState.tesoreria.anticipos = todosAnticipos;
    renderTablaAnticiposTesoreria(AppState.tesoreria.anticipos);
  } catch (err) {
    console.error('[Tesorería] Error al cargar anticipos:', err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-rose-500 font-semibold">${err.message}</td></tr>`;
  }
}

/**
 * Renderiza tabla de anticipos
 */
function renderTablaAnticiposTesoreria(anticipos) {
  const tbody = document.getElementById('tablaAnticiposTesoreriaBody');
  if (!tbody) return;

  if (!anticipos || anticipos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-slate-400"><i class="fa-solid fa-piggy-bank text-2xl block mb-2 opacity-50"></i>No hay saldos a favor registrados</td></tr>`;
    return;
  }

  tbody.innerHTML = anticipos.map(a => {
    const saldoDisp = parseFloat(a.saldo_disponible_usd || 0);
    const aplicarBtn = saldoDisp > 0
      ? `<button onclick="openModalAplicarAnticipo(${a.id}, ${a.tercero_id}, ${saldoDisp}, '${escapeHtml(a.cliente_nombre || '')}')" class="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold rounded-lg text-xs transition"><i class="fa-solid fa-check-to-slot mr-1"></i>Aplicar</button>`
      : `<span class="text-slate-400 text-xs">Totalmente aplicado</span>`;

    return `
      <tr class="hover:bg-slate-50/80 transition text-xs font-medium">
        <td class="py-3 px-4 font-mono font-bold text-slate-800">#${a.id} <span class="text-[10px] text-slate-400 block font-normal">${a.created_at}</span></td>
        <td class="py-3 px-4 font-bold text-slate-900">${a.cliente_nombre || 'Cliente #' + a.tercero_id}</td>
        <td class="py-3 px-4 font-mono text-slate-600">${a.pago_numero || 'Pago #' + a.pago_origen_id}</td>
        <td class="py-3 px-4 text-right font-mono font-bold text-slate-600">$${parseFloat(a.monto_original_usd || 0).toFixed(2)}</td>
        <td class="py-3 px-4 text-right font-mono font-black text-emerald-700 text-sm">$${saldoDisp.toFixed(2)}</td>
        <td class="py-3 px-4 text-center"><span class="bg-emerald-50 text-emerald-800 font-bold px-2 py-0.5 rounded-full text-[10px] capitalize">${a.estado}</span></td>
        <td class="py-3 px-4 text-center">${aplicarBtn}</td>
      </tr>
    `;
  }).join('');
}

/**
 * Filtro de anticipos
 */
function filtrarTablaAnticiposTesoreria() {
  const query = (document.getElementById('filtroBuscarAnticipo')?.value || '').toLowerCase().trim();
  if (!query) {
    renderTablaAnticiposTesoreria(AppState.tesoreria.anticipos);
    return;
  }
  const filtrados = (AppState.tesoreria.anticipos || []).filter(a => {
    return (a.cliente_nombre || '').toLowerCase().includes(query) ||
           (a.cliente_cedula || '').toLowerCase().includes(query);
  });
  renderTablaAnticiposTesoreria(filtrados);
}

/**
 * Carga el historial de arqueos y cierres
 */
async function loadTesoreriaArqueos() {
  const tbody = document.getElementById('tablaArqueosTesoreriaBody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Cargando historial de arqueos...</td></tr>`;

  try {
    // Tomar del resumen o endpoint
    const resumen = AppState.tesoreria.resumen;
    const cierres = resumen?.cierres_recientes || [];
    renderTablaArqueosTesoreria(cierres);
  } catch (err) {
    console.error('[Tesorería] Error al cargar arqueos:', err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-rose-500 font-semibold">${err.message}</td></tr>`;
  }
}

/**
 * Renderiza tabla de arqueos
 */
function renderTablaArqueosTesoreria(cierres) {
  const tbody = document.getElementById('tablaArqueosTesoreriaBody');
  if (!tbody) return;

  if (!cierres || cierres.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-10 text-slate-400"><i class="fa-solid fa-scale-balanced text-2xl block mb-2 opacity-50"></i>No hay registros de arqueos cerrados aún</td></tr>`;
    return;
  }

  tbody.innerHTML = cierres.map(c => {
    const dif = parseFloat(c.diferencia_usd || 0);
    const badgeArqueo = c.estado_arqueo === 'cuadrado'
      ? `<span class="bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full border border-emerald-200 text-[10px]"><i class="fa-solid fa-check mr-1"></i>Cuadrado</span>`
      : (c.estado_arqueo === 'sobrante'
        ? `<span class="bg-amber-50 text-amber-700 font-bold px-2 py-0.5 rounded-full border border-amber-200 text-[10px]"><i class="fa-solid fa-arrow-up mr-1"></i>Sobrante</span>`
        : `<span class="bg-rose-50 text-rose-700 font-bold px-2 py-0.5 rounded-full border border-rose-200 text-[10px]"><i class="fa-solid fa-arrow-down mr-1"></i>Faltante</span>`);

    return `
      <tr class="hover:bg-slate-50/80 transition text-xs font-medium">
        <td class="py-3 px-4 font-mono font-bold text-slate-800">#${c.id}</td>
        <td class="py-3 px-4 font-semibold text-slate-700">${c.cuenta_nombre || 'Caja'}</td>
        <td class="py-3 px-4 font-mono text-[11px]">${c.fecha_apertura}</td>
        <td class="py-3 px-4 font-mono text-[11px]">${c.fecha_cierre}</td>
        <td class="py-3 px-4 text-right font-mono font-bold text-slate-800">$${parseFloat(c.saldo_teorico_usd || 0).toFixed(2)}</td>
        <td class="py-3 px-4 text-right font-mono font-bold text-slate-900">$${parseFloat(c.saldo_real_fisico_usd || 0).toFixed(2)}</td>
        <td class="py-3 px-4 text-right font-mono font-black ${dif === 0 ? 'text-emerald-600' : (dif > 0 ? 'text-amber-600' : 'text-rose-600')}">${dif > 0 ? '+' : ''}$${dif.toFixed(2)}</td>
        <td class="py-3 px-4 text-center">${badgeArqueo}</td>
      </tr>
    `;
  }).join('');
}

// ============================================================================
// CONTROLADORES DE MODALES DE TESORERÍA
// ============================================================================

/**
 * Modal Apertura de Caja
 */
function openModalAperturaCaja() {
  const modal = document.getElementById('modalAperturaCaja');
  const select = document.getElementById('aperturaCuentaId');
  if (!modal || !select) return;

  // Filtrar solo cuentas tipo caja_efectivo
  const cajas = (AppState.tesoreria.cuentas || []).filter(c => c.tipo === 'caja_efectivo');
  select.innerHTML = cajas.map(c => `
    <option value="${c.id}">${c.nombre} (${c.moneda}) - Saldo actual: ${parseFloat(c.saldo_actual || 0).toFixed(2)}</option>
  `).join('');

  document.getElementById('aperturaMontoUsd').value = '0.00';
  document.getElementById('aperturaMontoMoneda').value = '0.00';
  document.getElementById('aperturaNotas').value = '';

  modal.classList.remove('hidden');
}

function closeModalAperturaCaja() {
  document.getElementById('modalAperturaCaja')?.classList.add('hidden');
}

async function submitAperturaCaja() {
  try {
    const cuentaId = parseInt(document.getElementById('aperturaCuentaId').value);
    const montoUsd = parseFloat(document.getElementById('aperturaMontoUsd').value || 0);
    const montoMoneda = parseFloat(document.getElementById('aperturaMontoMoneda').value || 0);
    const notas = document.getElementById('aperturaNotas').value.trim();

    const res = await fetch('/api/tesoreria/cajas/apertura', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cuenta_tesoreria_id: cuentaId,
        monto_inicial_usd: montoUsd,
        monto_inicial_moneda: montoMoneda,
        notas_apertura: notas,
        usuario_id: 1
      })
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error al abrir turno de caja');

    closeModalAperturaCaja();
    showToast(`Turno de caja #${json.data.id} abierto exitosamente`, 'success');
    loadTesoreria();
  } catch (err) {
    console.error('[Tesorería] Error apertura:', err);
    showToast(err.message || 'Error al abrir caja', 'error');
  }
}

/**
 * Modal Cierre de Caja y Arqueo
 */
function openModalCierreCaja() {
  const modal = document.getElementById('modalCierreCaja');
  const select = document.getElementById('cierreAperturaId');
  if (!modal || !select) return;

  const abiertas = AppState.tesoreria.cajasAbiertas || [];
  if (abiertas.length === 0) {
    showToast('No existen turnos de caja abiertos para cerrar.', 'warning');
    return;
  }

  select.innerHTML = abiertas.map(a => `
    <option value="${a.id}">${a.cuenta_nombre} (Abierta: ${a.fecha_apertura})</option>
  `).join('');

  actualizarInfoTurnoCierre();
  document.getElementById('cierreFisicoUsd').value = '0.00';
  document.getElementById('cierreFisicoMoneda').value = '0.00';
  document.getElementById('cierreNotas').value = '';

  modal.classList.remove('hidden');
}

function closeModalCierreCaja() {
  document.getElementById('modalCierreCaja')?.classList.add('hidden');
}

function actualizarInfoTurnoCierre() {
  const select = document.getElementById('cierreAperturaId');
  const id = parseInt(select?.value || 0);
  const turno = (AppState.tesoreria.cajasAbiertas || []).find(a => a.id === id);
  if (!turno) return;

  const fechaTxt = document.getElementById('cierreFechaAperturaTxt');
  const fondoTxt = document.getElementById('cierreFondoInicialTxt');
  if (fechaTxt) fechaTxt.textContent = turno.fecha_apertura;
  if (fondoTxt) fondoTxt.textContent = `$${parseFloat(turno.monto_inicial_usd || 0).toFixed(2)} USD`;
}

function calcularDiferenciaArqueoVisual() {
  // Función reactiva opcional para UX
}

async function submitCierreCaja() {
  try {
    const aperturaId = parseInt(document.getElementById('cierreAperturaId').value);
    const fisicoUsd = parseFloat(document.getElementById('cierreFisicoUsd').value || 0);
    const fisicoMoneda = parseFloat(document.getElementById('cierreFisicoMoneda').value || 0);
    const notas = document.getElementById('cierreNotas').value.trim();

    const res = await fetch('/api/tesoreria/cajas/cierre', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caja_apertura_id: aperturaId,
        saldo_real_fisico_usd: fisicoUsd,
        saldo_real_fisico_moneda: fisicoMoneda,
        notas_cierre: notas,
        usuario_id: 1
      })
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error al cerrar turno de caja');

    closeModalCierreCaja();
    const dif = parseFloat(json.data.diferencia_usd || 0);
    const estadoArqueo = json.data.estado_arqueo;
    const msg = `Arqueo: ${estadoArqueo.toUpperCase()} (Diferencia: ${dif >= 0 ? '+' : ''}$${dif.toFixed(2)} USD)`;
    showToast(msg, dif === 0 ? 'success' : 'warning', 4500);

    loadTesoreria();
  } catch (err) {
    console.error('[Tesorería] Error cierre:', err);
    showToast(err.message || 'Error al cerrar caja', 'error');
  }
}

/**
 * Modal Transferencia entre Cuentas
 */
function openModalTransferenciaTesoreria() {
  const modal = document.getElementById('modalTransferenciaTesoreria');
  const origenSel = document.getElementById('transOrigenId');
  const destinoSel = document.getElementById('transDestinoId');
  if (!modal || !origenSel || !destinoSel) return;

  const cuentas = AppState.tesoreria.cuentas || [];
  const optionsHtml = cuentas.map(c => `
    <option value="${c.id}" data-moneda="${c.moneda}">${c.nombre} (${c.moneda}) - Saldo: ${parseFloat(c.saldo_actual || 0).toFixed(2)}</option>
  `).join('');

  origenSel.innerHTML = optionsHtml;
  destinoSel.innerHTML = optionsHtml;

  if (cuentas.length > 1) {
    destinoSel.selectedIndex = 1;
  }

  document.getElementById('transMontoOrigen').value = '10.00';
  document.getElementById('transNotas').value = '';
  recalcularTransferenciaTesoreria();

  modal.classList.remove('hidden');
}

function closeModalTransferenciaTesoreria() {
  document.getElementById('modalTransferenciaTesoreria')?.classList.add('hidden');
}

function recalcularTransferenciaTesoreria() {
  const origenSel = document.getElementById('transOrigenId');
  const destinoSel = document.getElementById('transDestinoId');
  const montoOrigenInput = document.getElementById('transMontoOrigen');
  const tasaInput = document.getElementById('transTasa');
  const destinoTxt = document.getElementById('transMontoDestinoTxt');

  if (!origenSel || !destinoSel || !montoOrigenInput || !tasaInput || !destinoTxt) return;

  const optOrigen = origenSel.options[origenSel.selectedIndex];
  const optDestino = destinoSel.options[destinoSel.selectedIndex];
  const mOrigen = optOrigen?.getAttribute('data-moneda') || 'USD';
  const mDestino = optDestino?.getAttribute('data-moneda') || 'USD';
  const valOrigen = parseFloat(montoOrigenInput.value || 0);

  const tasas = AppState.config || { tasa_ves: 45.0, tasa_cop: 4100.0 };
  let sugerida = 1.0;

  if (mOrigen === 'USD' && mDestino === 'VES') sugerida = parseFloat(tasas.tasa_ves || 45.0);
  else if (mOrigen === 'USD' && mDestino === 'COP') sugerida = parseFloat(tasas.tasa_cop || 4100.0);
  else if (mOrigen === 'VES' && mDestino === 'USD') sugerida = parseFloat(tasas.tasa_ves || 45.0);
  else if (mOrigen === 'COP' && mDestino === 'USD') sugerida = parseFloat(tasas.tasa_cop || 4100.0);

  // Si el usuario no modificó manualmente, sugerir la tasa oficial
  if (tasaInput.dataset.manual !== 'true') {
    tasaInput.value = sugerida.toFixed(4);
  }

  const tasa = parseFloat(tasaInput.value || 1.0);
  let valDestino = 0;

  if (mOrigen === mDestino) {
    valDestino = valOrigen;
  } else if (mOrigen === 'USD') {
    valDestino = valOrigen * tasa;
  } else {
    valDestino = tasa > 0 ? (valOrigen / tasa) : 0;
  }

  destinoTxt.textContent = `${valDestino.toLocaleString(mDestino === 'USD' ? 'en-US' : 'es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${mDestino}`;
}

async function submitTransferenciaTesoreria() {
  try {
    const origenId = parseInt(document.getElementById('transOrigenId').value);
    const destinoId = parseInt(document.getElementById('transDestinoId').value);
    const montoOrigen = parseFloat(document.getElementById('transMontoOrigen').value || 0);
    const tasa = parseFloat(document.getElementById('transTasa').value || 1.0);
    const notas = document.getElementById('transNotas').value.trim();

    if (origenId === destinoId) {
      throw new Error('La cuenta origen y destino deben ser diferentes.');
    }
    if (montoOrigen <= 0) {
      throw new Error('El monto a transferir debe ser mayor a 0.');
    }

    const origenSel = document.getElementById('transOrigenId');
    const destinoSel = document.getElementById('transDestinoId');
    const mOrigen = origenSel.options[origenSel.selectedIndex]?.getAttribute('data-moneda') || 'USD';
    const mDestino = destinoSel.options[destinoSel.selectedIndex]?.getAttribute('data-moneda') || 'USD';
    let montoDestino = (mOrigen === mDestino) ? montoOrigen : (mOrigen === 'USD' ? montoOrigen * tasa : montoOrigen / tasa);

    const res = await fetch('/api/tesoreria/transferencias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cuenta_origen_id: origenId,
        cuenta_destino_id: destinoId,
        monto_origen: montoOrigen,
        monto_destino: montoDestino,
        tasa_cambio: tasa,
        notas: notas,
        usuario_id: 1
      })
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error al ejecutar transferencia');

    closeModalTransferenciaTesoreria();
    showToast('Transferencia ejecutada con éxito', 'success');
    loadTesoreria();
  } catch (err) {
    console.error('[Tesorería] Error transferencia:', err);
    showToast(err.message || 'Error en transferencia', 'error');
  }
}

/**
 * Modal Gasto Operativo
 */
function openModalGastoOperativo() {
  const modal = document.getElementById('modalGastoOperativo');
  const cuentaSel = document.getElementById('gastoCuentaId');
  if (!modal || !cuentaSel) return;

  const cuentas = AppState.tesoreria.cuentas || [];
  cuentaSel.innerHTML = cuentas.map(c => `
    <option value="${c.id}">${c.nombre} (${c.moneda})</option>
  `).join('');

  document.getElementById('gastoBeneficiario').value = '';
  document.getElementById('gastoBeneficiarioRif').value = '';
  document.getElementById('gastoMontoMoneda').value = '0.00';
  document.getElementById('gastoConcepto').value = '';

  actualizarTasaGastoOperativo();
  recalcularTotalUsdGasto();
  toggleCuentaGastoOperativo();

  modal.classList.remove('hidden');
}

function closeModalGastoOperativo() {
  document.getElementById('modalGastoOperativo')?.classList.add('hidden');
}

function toggleCuentaGastoOperativo() {
  const tipoPago = document.getElementById('gastoTipoPago')?.value;
  const container = document.getElementById('containerCuentaGasto');
  if (container) {
    if (tipoPago === 'contado') {
      container.classList.remove('hidden');
    } else {
      container.classList.add('hidden');
    }
  }
}

function actualizarTasaGastoOperativo() {
  const moneda = document.getElementById('gastoMoneda')?.value || 'USD';
  const tasaInput = document.getElementById('gastoTasaCambio');
  if (!tasaInput) return;

  const tasas = AppState.config || { tasa_ves: 45.0, tasa_cop: 4100.0 };
  if (moneda === 'USD') tasaInput.value = '1.0000';
  else if (moneda === 'VES') tasaInput.value = parseFloat(tasas.tasa_ves || 45.0).toFixed(4);
  else if (moneda === 'COP') tasaInput.value = parseFloat(tasas.tasa_cop || 4100.0).toFixed(4);

  recalcularTotalUsdGasto();
}

function recalcularTotalUsdGasto() {
  const moneda = document.getElementById('gastoMoneda')?.value || 'USD';
  const monto = parseFloat(document.getElementById('gastoMontoMoneda')?.value || 0);
  const tasa = parseFloat(document.getElementById('gastoTasaCambio')?.value || 1.0);
  const txt = document.getElementById('gastoTotalUsdTxt');

  let totalUsd = 0;
  if (moneda === 'USD') totalUsd = monto;
  else totalUsd = tasa > 0 ? (monto / tasa) : 0;

  if (txt) txt.textContent = `$${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
}

async function submitGastoOperativo() {
  try {
    const categoria = document.getElementById('gastoCategoria').value;
    const tipoPago = document.getElementById('gastoTipoPago').value;
    const beneficiario = document.getElementById('gastoBeneficiario').value.trim();
    const rif = document.getElementById('gastoBeneficiarioRif').value.trim();
    const moneda = document.getElementById('gastoMoneda').value;
    const montoMoneda = parseFloat(document.getElementById('gastoMontoMoneda').value || 0);
    const tasa = parseFloat(document.getElementById('gastoTasaCambio').value || 1.0);
    const cuentaId = tipoPago === 'contado' ? parseInt(document.getElementById('gastoCuentaId').value) : null;
    const concepto = document.getElementById('gastoConcepto').value.trim();

    if (!beneficiario) throw new Error('Debe indicar el beneficiario.');
    if (montoMoneda <= 0) throw new Error('El monto del gasto debe ser mayor a 0.');
    if (!concepto) throw new Error('Debe ingresar el concepto o descripción del gasto.');

    const res = await fetch('/api/gastos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categoria_gasto: categoria,
        tipo_pago: tipoPago,
        beneficiario: beneficiario,
        beneficiario_rif: rif,
        moneda: moneda,
        monto_total_moneda: montoMoneda,
        tasa_cambio: tasa,
        cuenta_tesoreria_id: cuentaId,
        concepto: concepto,
        usuario_id: 1
      })
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error al registrar gasto');

    closeModalGastoOperativo();
    showToast(`Gasto ${json.data.numero_gasto} registrado exitosamente`, 'success');
    loadTesoreria();
  } catch (err) {
    console.error('[Tesorería] Error gasto:', err);
    showToast(err.message || 'Error al guardar gasto', 'error');
  }
}

/**
 * Modal Cobro N:M y Anticipos
 */
async function openModalCobroMultipleNM() {
  const modal = document.getElementById('modalPagoMultipleNM');
  const clienteSel = document.getElementById('pagoNMClienteId');
  if (!modal || !clienteSel) return;

  try {
    const res = await fetch('/api/clientes');
    const clientes = await res.json();
    clienteSel.innerHTML = '<option value="">-- Seleccione un cliente --</option>' +
      (clientes || []).map(c => `<option value="${c.id}">${c.nombre} (${c.documento || 'S/D'})</option>`).join('');

    AppState.tesoreria.cobroNMDetalles = [];
    document.getElementById('pagoNMFacturasContainer').innerHTML = '<p class="text-xs text-slate-400 text-center py-4">Seleccione un cliente para ver facturas pendientes</p>';
    document.getElementById('pagoNMTotalDeudaTxt').textContent = 'Deuda Total: $0.00';
    document.getElementById('pagoNMConcepto').value = 'Cobro comercial de facturas';

    agregarFilaDetallePagoNM(); // Primera fila por defecto (USD)
    recalcularCobroMultipleNM();

    modal.classList.remove('hidden');
  } catch (err) {
    console.error('[Tesorería] Error abrir cobro N:M:', err);
    showToast('Error al cargar clientes', 'error');
  }
}

function closeModalPagoMultipleNM() {
  document.getElementById('modalPagoMultipleNM')?.classList.add('hidden');
}

async function cargarFacturasPendientesClienteNM() {
  const clienteId = parseInt(document.getElementById('pagoNMClienteId')?.value || 0);
  const container = document.getElementById('pagoNMFacturasContainer');
  const deudaTxt = document.getElementById('pagoNMTotalDeudaTxt');
  if (!container) return;

  if (!clienteId) {
    container.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">Seleccione un cliente para ver facturas pendientes</p>';
    if (deudaTxt) deudaTxt.textContent = 'Deuda Total: $0.00';
    return;
  }

  container.innerHTML = '<p class="text-xs text-slate-400 text-center py-4"><i class="fa-solid fa-spinner fa-spin mr-1"></i>Buscando facturas con saldo...</p>';

  try {
    const res = await fetch(`/api/cxc?cliente_id=${clienteId}&estado=pendiente`);
    const json = await res.json();
    const facturas = (json || []).filter(f => parseFloat(f.saldo_pendiente || 0) > 0);

    if (facturas.length === 0) {
      container.innerHTML = '<p class="text-xs text-emerald-600 font-bold text-center py-4"><i class="fa-solid fa-circle-check mr-1"></i>El cliente no posee facturas pendientes. Todo pago se registrará como Anticipo.</p>';
      if (deudaTxt) deudaTxt.textContent = 'Deuda Total: $0.00';
      recalcularCobroMultipleNM();
      return;
    }

    let sumaDeuda = 0;
    container.innerHTML = facturas.map((f, idx) => {
      const saldo = parseFloat(f.saldo_pendiente || 0);
      sumaDeuda += saldo;
      return `
        <label class="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer text-xs">
          <div class="flex items-center space-x-2">
            <input type="checkbox" name="facturaNMSelect" value="${f.id}" data-saldo="${saldo}" onchange="recalcularCobroMultipleNM()" checked class="rounded border-slate-300 text-teal-600 focus:ring-teal-500">
            <div>
              <strong class="text-slate-900 block font-mono">Factura #${f.numero_factura || f.id}</strong>
              <span class="text-[10px] text-slate-400">Emisión: ${f.fecha_emision || ''}</span>
            </div>
          </div>
          <div class="text-right">
            <span class="text-slate-400 text-[10px] block">Saldo Pendiente:</span>
            <strong class="font-mono text-rose-600 font-bold text-xs">$${saldo.toFixed(2)} USD</strong>
          </div>
        </label>
      `;
    }).join('');

    if (deudaTxt) deudaTxt.textContent = `Deuda Total: $${sumaDeuda.toFixed(2)}`;
    recalcularCobroMultipleNM();
  } catch (err) {
    console.error('[Tesorería] Error facturas cliente:', err);
    container.innerHTML = '<p class="text-xs text-rose-500 text-center py-4">Error al consultar facturas pendientes</p>';
  }
}

function agregarFilaDetallePagoNM() {
  const container = document.getElementById('pagoNMDetallesContainer');
  if (!container) return;

  const cuentas = AppState.tesoreria.cuentas || [];
  const idx = AppState.tesoreria.cobroNMDetalles.length;
  AppState.tesoreria.cobroNMDetalles.push({ id: idx });

  const tasas = AppState.config || { tasa_ves: 45.0, tasa_cop: 4100.0 };
  const fila = document.createElement('div');
  fila.id = `filaDetalleNM_${idx}`;
  fila.className = 'grid grid-cols-12 gap-2 items-center bg-white p-2 rounded-xl border border-slate-200 text-xs';
  fila.innerHTML = `
    <div class="col-span-4">
      <select id="nmDetalleCuenta_${idx}" onchange="actualizarMonedaFilaNM(${idx})" class="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold">
        ${cuentas.map(c => `<option value="${c.id}" data-moneda="${c.moneda}">${c.nombre} (${c.moneda})</option>`).join('')}
      </select>
    </div>
    <div class="col-span-3">
      <input type="number" step="0.01" min="0.01" id="nmDetalleMonto_${idx}" oninput="recalcularCobroMultipleNM()" placeholder="Monto" value="0.00" class="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold font-mono">
    </div>
    <div class="col-span-2">
      <input type="number" step="0.0001" min="0.0001" id="nmDetalleTasa_${idx}" oninput="recalcularCobroMultipleNM()" value="1.0000" class="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono">
    </div>
    <div class="col-span-2 text-right">
      <strong id="nmDetalleEqUsd_${idx}" class="font-mono text-slate-800 font-bold">$0.00</strong>
    </div>
    <div class="col-span-1 text-center">
      <button type="button" onclick="eliminarFilaDetallePagoNM(${idx})" class="text-slate-400 hover:text-rose-600"><i class="fa-solid fa-trash-can"></i></button>
    </div>
  `;
  container.appendChild(fila);
  actualizarMonedaFilaNM(idx);
}

function eliminarFilaDetallePagoNM(idx) {
  const fila = document.getElementById(`filaDetalleNM_${idx}`);
  if (fila) fila.remove();
  recalcularCobroMultipleNM();
}

function actualizarMonedaFilaNM(idx) {
  const sel = document.getElementById(`nmDetalleCuenta_${idx}`);
  const tasaInput = document.getElementById(`nmDetalleTasa_${idx}`);
  if (!sel || !tasaInput) return;

  const moneda = sel.options[sel.selectedIndex]?.getAttribute('data-moneda') || 'USD';
  const tasas = AppState.config || { tasa_ves: 45.0, tasa_cop: 4100.0 };

  if (moneda === 'USD') tasaInput.value = '1.0000';
  else if (moneda === 'VES') tasaInput.value = parseFloat(tasas.tasa_ves || 45.0).toFixed(4);
  else if (moneda === 'COP') tasaInput.value = parseFloat(tasas.tasa_cop || 4100.0).toFixed(4);

  recalcularCobroMultipleNM();
}

function recalcularCobroMultipleNM() {
  const container = document.getElementById('pagoNMDetallesContainer');
  if (!container) return;

  const filas = container.querySelectorAll('[id^="filaDetalleNM_"]');
  let totalRecibidoUsd = 0;

  filas.forEach(f => {
    const idx = f.id.replace('filaDetalleNM_', '');
    const sel = document.getElementById(`nmDetalleCuenta_${idx}`);
    const moneda = sel?.options[sel.selectedIndex]?.getAttribute('data-moneda') || 'USD';
    const monto = parseFloat(document.getElementById(`nmDetalleMonto_${idx}`)?.value || 0);
    const tasa = parseFloat(document.getElementById(`nmDetalleTasa_${idx}`)?.value || 1.0);
    const eqTxt = document.getElementById(`nmDetalleEqUsd_${idx}`);

    let eq = 0;
    if (moneda === 'USD') eq = monto;
    else eq = tasa > 0 ? (monto / tasa) : 0;

    if (eqTxt) eqTxt.textContent = `$${eq.toFixed(2)}`;
    totalRecibidoUsd += eq;
  });

  // Calcular deuda seleccionada
  const checks = document.querySelectorAll('input[name="facturaNMSelect"]:checked');
  let deudaSeleccionada = 0;
  checks.forEach(c => {
    deudaSeleccionada += parseFloat(c.getAttribute('data-saldo') || 0);
  });

  let aplicado = Math.min(totalRecibidoUsd, deudaSeleccionada);
  let anticipo = Math.max(0, totalRecibidoUsd - deudaSeleccionada);

  const recTxt = document.getElementById('pagoNMTotalRecibidoTxt');
  const aplTxt = document.getElementById('pagoNMTotalAplicadoTxt');
  const antTxt = document.getElementById('pagoNMAnticipoTxt');

  if (recTxt) recTxt.textContent = `$${totalRecibidoUsd.toFixed(2)}`;
  if (aplTxt) aplTxt.textContent = `$${aplicado.toFixed(2)}`;
  if (antTxt) antTxt.textContent = `$${anticipo.toFixed(2)}`;
}

async function submitCobroMultipleNM() {
  try {
    const clienteId = parseInt(document.getElementById('pagoNMClienteId').value);
    if (!clienteId) throw new Error('Debe seleccionar un cliente.');

    const concepto = document.getElementById('pagoNMConcepto').value.trim() || 'Cobro de facturas';

    // Desglose monetario
    const container = document.getElementById('pagoNMDetallesContainer');
    const filas = container.querySelectorAll('[id^="filaDetalleNM_"]');
    const detalles = [];

    filas.forEach(f => {
      const idx = f.id.replace('filaDetalleNM_', '');
      const sel = document.getElementById(`nmDetalleCuenta_${idx}`);
      const cuentaId = parseInt(sel?.value || 0);
      const moneda = sel?.options[sel.selectedIndex]?.getAttribute('data-moneda') || 'USD';
      const monto = parseFloat(document.getElementById(`nmDetalleMonto_${idx}`)?.value || 0);
      const tasa = parseFloat(document.getElementById(`nmDetalleTasa_${idx}`)?.value || 1.0);

      if (monto > 0 && cuentaId > 0) {
        detalles.push({
          cuenta_tesoreria_id: cuentaId,
          metodo_pago: moneda === 'USD' ? 'efectivo_usd' : (moneda === 'VES' ? 'pago_movil_ves' : 'efectivo_cop'),
          moneda: moneda,
          monto_moneda: monto,
          tasa_cambio: tasa,
          monto_equivalente_usd: moneda === 'USD' ? monto : monto / tasa
        });
      }
    });

    if (detalles.length === 0) throw new Error('Debe ingresar al menos un detalle de pago con monto mayor a 0.');

    // Calcular total disponible para aplicar
    const totalRecibido = detalles.reduce((sum, d) => sum + d.monto_equivalente_usd, 0);

    // Facturas seleccionadas y aplicaciones proporcionales/secuenciales
    const checks = document.querySelectorAll('input[name="facturaNMSelect"]:checked');
    const aplicaciones = [];
    let remanente = totalRecibido;

    checks.forEach(c => {
      if (remanente <= 0.001) return;
      const fId = parseInt(c.value);
      const saldoF = parseFloat(c.getAttribute('data-saldo') || 0);
      const amortizar = Math.min(remanente, saldoF);

      aplicaciones.push({
        cuenta_por_cobrar_id: fId,
        monto_aplicado_usd: round2(amortizar)
      });
      remanente -= amortizar;
    });

    const payload = {
      tipo_operacion: 'cobro_cliente',
      tercero_tipo: 'cliente',
      tercero_id: clienteId,
      concepto: concepto,
      detalles: detalles,
      aplicaciones: aplicaciones,
      usuario_id: 1
    };

    const res = await fetch('/api/pagos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error al procesar pago');

    closeModalPagoMultipleNM();
    const antGen = parseFloat(json.data.monto_no_aplicado_usd || 0);
    const msg = `Pago ${json.data.numero_pago} procesado exitosamente por $${parseFloat(json.data.monto_total_equivalente_usd).toFixed(2)} USD.` +
                (antGen > 0 ? ` (Anticipo generado: $${antGen.toFixed(2)} USD)` : '');
    showToast(msg, 'success', 5000);

    loadTesoreria();
  } catch (err) {
    console.error('[Tesorería] Error cobro N:M:', err);
    showToast(err.message || 'Error al procesar cobro', 'error');
  }
}

/**
 * Modal Aplicar Anticipo a Factura
 */
async function openModalAplicarAnticipo(anticipoId, clienteId, saldoDisp, clienteNombre) {
  const modal = document.getElementById('modalAplicarAnticipo');
  const facturaSel = document.getElementById('aplicarAnticipoFacturaId');
  if (!modal || !facturaSel) return;

  document.getElementById('aplicarAnticipoId').value = anticipoId;
  document.getElementById('aplicarAnticipoClienteTxt').textContent = clienteNombre;
  document.getElementById('aplicarAnticipoSaldoTxt').textContent = `$${parseFloat(saldoDisp).toFixed(2)} USD`;
  document.getElementById('aplicarAnticipoMontoUsd').value = parseFloat(saldoDisp).toFixed(2);

  facturaSel.innerHTML = '<option value="">Cargando facturas impagas...</option>';

  try {
    const res = await fetch(`/api/cxc?cliente_id=${clienteId}&estado=pendiente`);
    const json = await res.json();
    const facturas = (json || []).filter(f => parseFloat(f.saldo_pendiente || 0) > 0);

    if (facturas.length === 0) {
      showToast('El cliente no tiene facturas con saldo pendiente.', 'info');
      return;
    }

    facturaSel.innerHTML = facturas.map(f => `
      <option value="${f.id}" data-saldo="${f.saldo_pendiente}">Factura #${f.numero_factura || f.id} (Saldo: $${parseFloat(f.saldo_pendiente).toFixed(2)} USD)</option>
    `).join('');

    actualizarMontoSugeridoAnticipo();
    modal.classList.remove('hidden');
  } catch (err) {
    console.error('[Tesorería] Error facturas para anticipo:', err);
    showToast('Error al consultar facturas del cliente', 'error');
  }
}

function closeModalAplicarAnticipo() {
  document.getElementById('modalAplicarAnticipo')?.classList.add('hidden');
}

function actualizarMontoSugeridoAnticipo() {
  const sel = document.getElementById('aplicarAnticipoFacturaId');
  const opt = sel?.options[sel.selectedIndex];
  const saldoFactura = parseFloat(opt?.getAttribute('data-saldo') || 0);
  const saldoAnticipo = parseFloat(document.getElementById('aplicarAnticipoSaldoTxt')?.textContent.replace(/[^0-9.]/g, '') || 0);

  const sugerido = Math.min(saldoFactura, saldoAnticipo);
  const input = document.getElementById('aplicarAnticipoMontoUsd');
  if (input && sugerido > 0) {
    input.value = sugerido.toFixed(2);
  }
}

async function submitAplicarAnticipo() {
  try {
    const anticipoId = parseInt(document.getElementById('aplicarAnticipoId').value);
    const facturaId = parseInt(document.getElementById('aplicarAnticipoFacturaId').value);
    const monto = parseFloat(document.getElementById('aplicarAnticipoMontoUsd').value || 0);

    if (!facturaId) throw new Error('Debe seleccionar una factura.');
    if (monto <= 0) throw new Error('El monto a aplicar debe ser mayor a 0.');

    const res = await fetch('/api/anticipos/aplicar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        anticipo_id: anticipoId,
        aplicaciones: [{ cuenta_por_cobrar_id: facturaId, monto_aplicado_usd: monto }],
        usuario_id: 1
      })
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error al aplicar anticipo');

    closeModalAplicarAnticipo();
    showToast(`Anticipo aplicado exitosamente por $${monto.toFixed(2)} USD`, 'success');
    loadTesoreria();
  } catch (err) {
    console.error('[Tesorería] Error aplicar anticipo:', err);
    showToast(err.message || 'Error al aplicar anticipo', 'error');
  }
}

/**
 * Anulación de pago con confirmación
 */
async function anularPagoModal(pagoId, numeroPago) {
  const motivo = prompt(`¿Está seguro de anular el pago ${numeroPago}?\n\nEsta acción restituirá el saldo pendiente a las facturas y revertirá los fondos de caja.\nIndique el motivo de la anulación:`, 'Error de digitación / Solicitud del cliente');
  if (motivo === null) return; // Cancelado
  if (!motivo.trim()) {
    showToast('Debe ingresar un motivo para anular el pago.', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/pagos/${pagoId}/anular`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo: motivo.trim(), usuario_id: 1 })
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error al anular pago');

    showToast(`Pago ${numeroPago} anulado exitosamente`, 'success');
    loadTesoreria();
  } catch (err) {
    console.error('[Tesorería] Error anulación pago:', err);
    showToast(err.message || 'Error al anular pago', 'error');
  }
}

/**
 * Helper para redondeo exacto a 2 decimales
 */
function round2(val) {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * Helper para escapar HTML en cadenas dinámicas
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * ============================================================================
 * MÓDULO FRONTEND DE INTELIGENCIA ARTIFICIAL ORGÁNICA (FASE 3A)
 * D-BIAN SYSTEM COMPUTER - Ing. José Morales
 * ============================================================================
 */

AppState.iaDiagnosticoData = null;

/**
 * Carga el diagnóstico analítico de inventario desde el backend
 */
async function cargarDiagnosticoIaInventario() {
  const tbody = document.getElementById('iaTablaDiagnosticoBody');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-8 text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-2 text-indigo-600"></i>Analizando inventario con IA orgánica basada en CPP...</td></tr>`;
  }

  try {
    const res = await fetch('/api/ia/inventario/diagnostico');
    if (!res.ok) throw new Error('Error al consultar diagnóstico de IA');
    const json = await res.json();
    AppState.iaDiagnosticoData = json;

    renderIaMetricasPatrimoniales(json.resumen_patrimonial);
    renderIaAlertasBanner(json.alertas_gerenciales);
    renderIaTablaDiagnostico(json.analisis_productos);
  } catch (err) {
    console.error('[IA Inventario] Error al cargar:', err);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center py-6 text-rose-500 font-bold">${err.message}</td></tr>`;
    }
    if (typeof showToast === 'function') {
      showToast(err.message || 'Error al evaluar inventario con IA', 'error');
    }
  }
}

/**
 * Renderiza las tarjetas métricas del resumen patrimonial
 */
function renderIaMetricasPatrimoniales(resumen) {
  if (!resumen) return;

  const patUsd = document.getElementById('iaTotalPatrimonioUsd');
  const patBs = document.getElementById('iaTotalPatrimonioBs');
  const riesgUsd = document.getElementById('iaCapitalRiesgoUsd');
  const riesgPct = document.getElementById('iaCapitalRiesgoPct');
  const ahorroUsd = document.getElementById('iaAhorroComprasUsd');
  const scoreTxt = document.getElementById('iaScoreSaludTxt');
  const scoreDesc = document.getElementById('iaScoreSaludDesc');

  if (patUsd) patUsd.textContent = `$${parseFloat(resumen.total_valoracion_cpp_usd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (patBs) patBs.textContent = `${parseFloat(resumen.total_valoracion_cpp_ves || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.`;

  const capRiesgo = parseFloat(resumen.capital_en_riesgo_margen_negativo_usd || 0);
  if (riesgUsd) riesgUsd.textContent = `$${capRiesgo.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (riesgPct) {
    riesgPct.textContent = `${resumen.porcentaje_capital_en_riesgo}% del patrimonio comprometido`;
    riesgPct.className = capRiesgo > 0 ? 'text-xs text-rose-600 font-bold mt-0.5' : 'text-xs text-emerald-600 font-bold mt-0.5';
  }

  if (ahorroUsd) ahorroUsd.textContent = `$${parseFloat(resumen.ahorro_inmediato_compras_usd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const score = parseFloat(resumen.score_salud_inventario || 0);
  if (scoreTxt) scoreTxt.textContent = `${score.toFixed(0)} / 100`;
  if (scoreDesc) {
    if (score >= 85) {
      scoreDesc.textContent = 'Estado Excelente';
      scoreDesc.className = 'text-xs font-bold text-emerald-600 mt-0.5';
    } else if (score >= 60) {
      scoreDesc.textContent = 'Atención en Márgenes / Precios';
      scoreDesc.className = 'text-xs font-bold text-amber-600 mt-0.5';
    } else {
      scoreDesc.textContent = 'Riesgo Crítico de Venta a Pérdida';
      scoreDesc.className = 'text-xs font-bold text-rose-600 mt-0.5';
    }
  }
}

/**
 * Renderiza el banner de alertas críticas
 */
function renderIaAlertasBanner(alertas) {
  const container = document.getElementById('iaAlertasCriticasContainer');
  if (!container) return;

  if (!alertas || alertas.length === 0) {
    container.innerHTML = `
      <div class="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center space-x-2 text-xs text-emerald-800">
        <i class="fa-solid fa-circle-check text-emerald-600 text-sm"></i>
        <span>Todos los productos operan con márgenes positivos sobre el costo CPP auditado. Cero ventas a pérdida detectadas.</span>
      </div>
    `;
    return;
  }

  const criticas = alertas.filter(a => a.nivel === 'CRITICO');

  container.innerHTML = `
    <div class="p-4 bg-rose-50/90 border border-rose-200 rounded-2xl space-y-2 text-xs text-rose-950">
      <div class="flex items-center space-x-2.5 font-bold text-rose-900 text-sm">
        <i class="fa-solid fa-triangle-exclamation text-rose-600 text-base"></i>
        <span>Diagnóstico Crítico de Rentabilidad: ${criticas.length} Producto(s) con Venta a Pérdida</span>
      </div>
      <p class="text-rose-800">
        El motor de IA orgánica detectó que existe mercancía cuyo precio de venta en catálogo es inferior al Costo Promedio Ponderado (CPP) auditado. Cada venta a ese precio destruye patrimonio de la empresa.
      </p>
      <div class="mt-2 space-y-1.5 pt-2 border-t border-rose-200/80">
        ${alertas.map(a => `
          <div class="flex flex-col sm:flex-row sm:items-center justify-between p-2 bg-white/80 rounded-xl border border-rose-100 gap-1.5">
            <div>
              <strong class="text-rose-900 font-mono">[${a.codigo}] ${a.nombre}:</strong>
              <span class="text-slate-700 ml-1">${a.mensaje}</span>
            </div>
            <span class="text-emerald-800 font-bold bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200 text-[11px] whitespace-nowrap">
              ${a.recomendacion}
            </span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Renderiza la tabla analítica por producto
 */
function renderIaTablaDiagnostico(productos) {
  const tbody = document.getElementById('iaTablaDiagnosticoBody');
  if (!tbody) return;

  if (!productos || productos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-8 text-slate-400">No hay productos disponibles para análisis</td></tr>`;
    return;
  }

  tbody.innerHTML = productos.map(p => {
    const estadoBadge = p.estado_abastecimiento === 'SOBRESTOCK'
      ? `<span class="bg-indigo-50 text-indigo-700 font-bold px-2.5 py-0.5 rounded-full border border-indigo-200 text-[10px]"><i class="fa-solid fa-layer-group mr-1"></i>Sobrestock</span>`
      : (p.estado_abastecimiento === 'OPTIMO'
        ? `<span class="bg-emerald-50 text-emerald-700 font-bold px-2.5 py-0.5 rounded-full border border-emerald-200 text-[10px]"><i class="fa-solid fa-check mr-1"></i>Óptimo</span>`
        : `<span class="bg-rose-50 text-rose-700 font-bold px-2.5 py-0.5 rounded-full border border-rose-200 text-[10px]"><i class="fa-solid fa-triangle-exclamation mr-1"></i>${p.estado_abastecimiento}</span>`);

    const alertaBadge = p.alerta_rentabilidad === 'VENTA_A_PERDIDA'
      ? `<span class="bg-rose-600 text-white font-extrabold px-2 py-0.5 rounded-full text-[10px] animate-pulse">Venta a Pérdida</span>`
      : (p.alerta_rentabilidad === 'MARGEN_ESTRECHO'
        ? `<span class="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full text-[10px]">Margen Estrecho</span>`
        : `<span class="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full text-[10px]">Saludable</span>`);

    const margenColor = p.margen_unitario_usd < 0 ? 'text-rose-600 font-black' : (p.margen_porcentaje < 8 ? 'text-amber-600 font-bold' : 'text-emerald-700 font-bold');

    return `
      <tr class="hover:bg-slate-50/80 transition text-xs font-medium">
        <td class="py-3 px-4">
          <strong class="text-slate-900 block font-bold font-mono">[${p.codigo}]</strong>
          <span class="text-slate-600 text-[11px]">${p.nombre}</span>
        </td>
        <td class="py-3 px-4 text-right font-mono">
          <strong class="text-slate-900 block font-bold">${p.stock_actual} u</strong>
          <span class="text-[10px] text-slate-400">Mínimo: ${p.stock_minimo} u</span>
        </td>
        <td class="py-3 px-4 text-right font-mono font-bold text-slate-800">$${parseFloat(p.costo_cpp_usd).toFixed(2)}</td>
        <td class="py-3 px-4 text-right font-mono font-bold text-slate-900">$${parseFloat(p.precio_venta_usd).toFixed(2)}</td>
        <td class="py-3 px-4 text-right font-mono ${margenColor}">
          <span class="block">${p.margen_porcentaje > 0 ? '+' : ''}${parseFloat(p.margen_porcentaje).toFixed(1)}%</span>
          <span class="text-[10px] block font-normal">(${p.margen_unitario_usd > 0 ? '+' : ''}$${parseFloat(p.margen_unitario_usd).toFixed(2)})</span>
        </td>
        <td class="py-3 px-4 text-center">${estadoBadge}</td>
        <td class="py-3 px-4 text-center">${alertaBadge}</td>
        <td class="py-3 px-4 text-slate-600 text-[11px] max-w-xs leading-tight">${p.accion_abastecimiento}</td>
        <td class="py-3 px-4 text-center">
          <button onclick="openModalSimuladorPrecioIA(${p.id}, '${escapeHtml(p.nombre)}', ${p.stock_actual}, ${p.costo_cpp_usd}, ${p.precio_venta_usd})"
                  class="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold rounded-lg text-xs transition" title="Simular impacto de precio">
            <i class="fa-solid fa-chart-line mr-1"></i>Simular
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Modal Simulador de Precios
 */
function openModalSimuladorPrecioIA(prodId, nombre, stock, cpp, precioActual) {
  const modal = document.getElementById('modalSimuladorPrecioIA');
  if (!modal) return;

  document.getElementById('simuladorProductoId').value = prodId;
  document.getElementById('simProdNombreTxt').textContent = nombre;
  document.getElementById('simProdStockTxt').textContent = `${stock} unidades`;
  document.getElementById('simProdCppTxt').textContent = `$${parseFloat(cpp).toFixed(2)} USD`;
  document.getElementById('simProdPrecioActualTxt').textContent = `$${parseFloat(precioActual).toFixed(2)} USD`;

  // Sugerir nuevo precio saludable (mínimo costo CPP * 1.15)
  const sugerido = cpp > precioActual ? round2(cpp * 1.15) : round2(precioActual * 1.05);
  document.getElementById('simuladorNuevoPrecio').value = sugerido.toFixed(2);

  ejecutarSimulacionEnVivo();
  modal.classList.remove('hidden');
}

function closeModalSimuladorPrecioIA() {
  document.getElementById('modalSimuladorPrecioIA')?.classList.add('hidden');
}

async function ejecutarSimulacionEnVivo() {
  const prodId = parseInt(document.getElementById('simuladorProductoId')?.value || 0);
  const nuevoPrecio = parseFloat(document.getElementById('simuladorNuevoPrecio')?.value || 0);
  const container = document.getElementById('simuladorResultadosContainer');

  if (!container || !prodId || nuevoPrecio <= 0) return;

  try {
    const res = await fetch('/api/ia/inventario/simular-precio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ producto_id: prodId, nuevo_precio: nuevoPrecio })
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Error al simular');

    const act = json.precio_actual;
    const sim = json.precio_simulado;
    const dif = json.diferencial;

    const colorGanancia = dif.es_ganancia ? 'text-emerald-700' : 'text-rose-700';
    const bgCard = sim.nuevo_margen_unitario_usd >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200';

    container.innerHTML = `
      <div class="p-3 ${bgCard} border rounded-xl space-y-2">
        <div class="flex justify-between items-center font-bold">
          <span class="text-slate-700">Resultado Proyectado con Nuevo Precio:</span>
          <span class="font-mono text-sm ${colorGanancia}">
            ${sim.nuevo_margen_porcentaje >= 0 ? '+' : ''}${sim.nuevo_margen_porcentaje.toFixed(1)}% Margen
          </span>
        </div>
        <div class="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-200/60 font-mono">
          <div><span class="text-slate-500 block font-sans">Margen Unitario:</span><strong class="${colorGanancia}">$${sim.nuevo_margen_unitario_usd.toFixed(2)} USD / u</strong></div>
          <div><span class="text-slate-500 block font-sans">Utilidad Proyectada Stock:</span><strong class="${colorGanancia}">$${sim.nueva_utilidad_proyectada_stock.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</strong></div>
        </div>
      </div>
      <div class="p-2.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between font-mono text-xs">
        <span class="text-slate-600 font-sans">Impacto Patrimonial vs Precio Anterior:</span>
        <strong class="${colorGanancia} font-black text-sm">
          ${dif.incremento_ganancia_total_stock_usd >= 0 ? '+' : ''}$${dif.incremento_ganancia_total_stock_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
        </strong>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<p class="text-xs text-rose-500">${err.message}</p>`;
  }
}



// ==============================================================================
// FASE 3B: CFO COPILOT GERENCIAL - ASISTENTE FINANCIERO CONVERSACIONAL DETERMINISTA
// D-BIAN SYSTEM COMPUTER - Ing. José Morales
// Cero Alucinaciones | 100% Read-Only | Conexión en Tiempo Real a Datos Contables
// ==============================================================================

const cfoCopilotState = {
  historial: [],
  sugerenciasCargadas: false,
  consultando: false
};

function abrirModalCfoCopilot() {
  const modal = document.getElementById('modalCfoCopilot');
  if (!modal) return;
  modal.classList.remove('hidden');

  if (!cfoCopilotState.sugerenciasCargadas) {
    cargarSugerenciasCopilot();
  }

  if (cfoCopilotState.historial.length === 0) {
    renderizarMensajeInicialCopilot();
  }

  setTimeout(() => {
    document.getElementById('inputCfoCopilot')?.focus();
  }, 100);
}

function cerrarModalCfoCopilot() {
  document.getElementById('modalCfoCopilot')?.classList.add('hidden');
}

function limpiarInputCopilot() {
  const inp = document.getElementById('inputCfoCopilot');
  if (inp) {
    inp.value = '';
    inp.focus();
  }
}

function reiniciarConversacionCopilot() {
  cfoCopilotState.historial = [];
  const container = document.getElementById('cfoCopilotChatContainer');
  if (container) container.innerHTML = '';
  renderizarMensajeInicialCopilot();
}

async function cargarSugerenciasCopilot() {
  const container = document.getElementById('cfoCopilotSuggestionsContainer');
  if (!container) return;

  try {
    const res = await fetch('/api/ia/copilot/sugerencias');
    const json = await res.json();
    if (!res.ok || !json.sugerencias) return;

    container.innerHTML = json.sugerencias.map(s => `
      <button type="button" onclick="ejecutarPreguntaRapidaCopilot('${escapeHtml(s.texto)}')" class="inline-flex items-center px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/70 text-slate-700 hover:text-indigo-900 text-xs font-semibold shadow-2xs transition whitespace-nowrap active:scale-95">
        <i class="fa-solid fa-sparkles text-indigo-500 mr-1.5 text-[10px]"></i>
        <span>${escapeHtml(s.texto)}</span>
      </button>
    `).join('');

    cfoCopilotState.sugerenciasCargadas = true;
  } catch (err) {
    console.error('Error al cargar sugerencias de Copilot:', err);
  }
}

function ejecutarPreguntaRapidaCopilot(texto) {
  const inp = document.getElementById('inputCfoCopilot');
  if (inp) inp.value = texto;
  enviarConsultaCfoCopilot();
}

function renderizarMensajeInicialCopilot() {
  const container = document.getElementById('cfoCopilotChatContainer');
  if (!container) return;

  const msgId = 'copilot_msg_init';
  const html = `
    <div id="${msgId}" class="flex items-start space-x-3 max-w-3xl">
      <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-teal-500 flex items-center justify-center text-white shrink-0 shadow-sm">
        <span class="text-sm">🧠</span>
      </div>
      <div class="flex-1 bg-white border border-slate-200/90 rounded-2xl rounded-tl-sm p-4 shadow-xs text-xs space-y-3">
        <div class="flex justify-between items-center border-b border-slate-100 pb-2">
          <strong class="text-slate-800 font-extrabold text-sm">CFO Copilot Gerencial</strong>
          <span class="text-[10px] text-slate-400 font-mono">Modo: Auditoría Contable CPP</span>
        </div>
        <p class="text-slate-600 leading-relaxed">
          Bienvenido. Soy su <strong>Director Financiero de Inteligencia Artificial Orgánica</strong>.
          Estoy conectado directamente a la base de datos de su empresa y al motor de <strong>Costo Promedio Ponderado (CPP)</strong>.
        </p>
        <div class="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl space-y-1.5 text-indigo-950 font-medium">
          <p class="font-bold flex items-center text-indigo-900">
            <i class="fa-solid fa-circle-check text-indigo-600 mr-1.5 text-xs"></i>Garantía de Fidelidad Numérica:
          </p>
          <ul class="list-disc list-inside space-y-0.5 text-[11px] text-indigo-900/80">
            <li><strong>Cero Datos Fantasmas:</strong> Cada saldo y margen proviene de consultas SQL auditadas.</li>
            <li><strong>Inmunidad Patrimonial:</strong> Esta interfaz es estrictamente de lectura (READ-ONLY).</li>
            <li><strong>Multimoneda Oficial:</strong> Conversión operativa en tiempo real a tasas de BCV y TRM.</li>
          </ul>
        </div>
        <p class="text-slate-500 text-[11px]">
          Haga clic en cualquiera de las sugerencias rápidas arriba o escriba su duda directamente abajo (ej: <em>"¿Cuál es el balance 360?"</em> o <em>"¿Qué productos están a pérdida?"</em>).
        </p>
      </div>
    </div>
  `;

  container.innerHTML = html;
  cfoCopilotState.historial.push({ rol: 'asistente', contenido: 'Mensaje de bienvenida inicial' });
}

async function enviarConsultaCfoCopilot() {
  if (cfoCopilotState.consultando) return;

  const inp = document.getElementById('inputCfoCopilot');
  const pregunta = (inp?.value || '').trim();
  if (!pregunta) return;

  const container = document.getElementById('cfoCopilotChatContainer');
  if (!container) return;

  // 1. Renderizar mensaje del usuario
  const userHtml = `
    <div class="flex items-start justify-end space-x-2 max-w-2xl ml-auto">
      <div class="bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 shadow-sm text-xs font-medium">
        <p>${escapeHtml(pregunta)}</p>
      </div>
      <div class="w-7 h-7 rounded-lg bg-indigo-700 flex items-center justify-center text-white text-xs shrink-0">
        <i class="fa-solid fa-user"></i>
      </div>
    </div>
  `;
  container.insertAdjacentHTML('beforeend', userHtml);
  inp.value = '';

  // 2. Renderizar indicador de carga determinista
  const typingId = 'copilot_typing_' + Date.now();
  const typingHtml = `
    <div id="${typingId}" class="flex items-start space-x-3 max-w-xl">
      <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-teal-500 flex items-center justify-center text-white shrink-0 shadow-sm animate-pulse">
        <span class="text-sm">🧠</span>
      </div>
      <div class="bg-white border border-slate-200 rounded-2xl rounded-tl-sm p-3.5 shadow-xs text-xs text-slate-500 flex items-center space-x-2">
        <i class="fa-solid fa-circle-notch fa-spin text-indigo-600 text-sm"></i>
        <span>Consultando balance, existencias CPP y tesorería en tiempo real...</span>
      </div>
    </div>
  `;
  container.insertAdjacentHTML('beforeend', typingHtml);
  container.scrollTop = container.scrollHeight;

  cfoCopilotState.consultando = true;

  try {
    const res = await fetch('/api/ia/copilot/consulta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pregunta: pregunta })
    });

    const data = await res.json();
    document.getElementById(typingId)?.remove();

    if (!res.ok || data.status !== 'ok') {
      throw new Error(data.error || 'Error al procesar consulta contable');
    }

    // 3. Renderizar respuesta enriquecida
    renderizarRespuestaCopilot(data, container);

  } catch (err) {
    document.getElementById(typingId)?.remove();
    const errorHtml = `
      <div class="flex items-start space-x-3 max-w-xl">
        <div class="w-8 h-8 rounded-xl bg-rose-600 flex items-center justify-center text-white shrink-0">
          <i class="fa-solid fa-triangle-exclamation"></i>
        </div>
        <div class="bg-rose-50 border border-rose-200 rounded-2xl rounded-tl-sm p-3 text-xs text-rose-800">
          <strong class="block font-bold">Error al auditar datos:</strong>
          <span>${escapeHtml(err.message)}</span>
        </div>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', errorHtml);
  } finally {
    cfoCopilotState.consultando = false;
    container.scrollTop = container.scrollHeight;
  }
}

function renderizarRespuestaCopilot(data, container) {
  const kpis = data.kpis || [];
  const tablas = data.tablas || [];
  const alertas = data.alertas || [];
  const acciones = data.acciones_sugeridas || [];

  // Formatear markdown básico en el resumen
  let resumenHtml = escapeHtml(data.resumen_ejecutivo || '')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>');

  // KPI cards grid
  let kpisHtml = '';
  if (kpis.length > 0) {
    kpisHtml = `
      <div class="grid grid-cols-2 sm:grid-cols-${Math.min(kpis.length, 4)} gap-2 pt-2">
        ${kpis.map(k => {
          let badgeColor = 'bg-slate-50 border-slate-200 text-slate-800';
          let valColor = 'text-slate-900';
          if (k.tipo === 'primary') { badgeColor = 'bg-indigo-50/70 border-indigo-200 text-indigo-900'; valColor = 'text-indigo-700'; }
          else if (k.tipo === 'danger') { badgeColor = 'bg-rose-50 border-rose-200 text-rose-900'; valColor = 'text-rose-700'; }
          else if (k.tipo === 'warning') { badgeColor = 'bg-amber-50 border-amber-200 text-amber-900'; valColor = 'text-amber-800'; }
          else if (k.tipo === 'success') { badgeColor = 'bg-emerald-50 border-emerald-200 text-emerald-900'; valColor = 'text-emerald-700'; }

          return `
            <div class="p-2.5 rounded-xl border ${badgeColor} shadow-2xs space-y-0.5">
              <span class="text-[10px] text-slate-500 block font-medium leading-tight">${escapeHtml(k.etiqueta)}</span>
              <strong class="text-xs sm:text-sm font-extrabold font-mono block ${valColor}">${escapeHtml(k.valor)}</strong>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // Alertas
  let alertasHtml = '';
  if (alertas.length > 0) {
    alertasHtml = `
      <div class="space-y-1.5 pt-1">
        ${alertas.map(a => {
          let bg = a.nivel === 'danger' ? 'bg-rose-50 border-rose-200 text-rose-800' :
                   (a.nivel === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800');
          let icon = a.nivel === 'danger' ? 'fa-triangle-exclamation' : (a.nivel === 'warning' ? 'fa-circle-exclamation' : 'fa-circle-check');
          return `
            <div class="p-2.5 rounded-xl border ${bg} text-xs flex items-start space-x-2">
              <i class="fa-solid ${icon} mt-0.5 shrink-0"></i>
              <span class="leading-relaxed font-medium">${escapeHtml(a.mensaje)}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // Tabla compacta
  let tablasHtml = '';
  if (tablas.length > 0) {
    tablasHtml = tablas.map(t => `
      <div class="pt-2">
        <h5 class="text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1.5 flex items-center">
          <i class="fa-solid fa-table-list mr-1.5 text-indigo-600"></i>${escapeHtml(t.titulo)}
        </h5>
        <div class="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs max-h-56">
          <table class="w-full text-[11px] text-left border-collapse">
            <thead class="bg-slate-100 text-slate-600 font-bold sticky top-0 border-b border-slate-200">
              <tr>
                ${t.columnas.map(c => `<th class="p-2 whitespace-nowrap">${escapeHtml(c)}</th>`).join('')}
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              ${t.filas.map(f => `
                <tr class="hover:bg-slate-50 transition">
                  ${Object.values(f).map(val => `<td class="p-2 whitespace-nowrap font-medium text-slate-700">${escapeHtml(String(val))}</td>`).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `).join('');
  }

  // Acciones sugeridas (botones de navegación rápida)
  let accionesHtml = '';
  if (acciones.length > 0) {
    accionesHtml = `
      <div class="pt-2 flex flex-wrap gap-1.5 border-t border-slate-100">
        ${acciones.map(ac => `
          <button type="button" onclick="ejecutarAccionCopilot('${escapeHtml(ac.accion)}')" class="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold text-[11px] border border-indigo-200 shadow-2xs transition active:scale-95">
            <span>${escapeHtml(ac.texto)}</span>
            <i class="fa-solid fa-arrow-up-right-from-square ml-1.5 text-[9px]"></i>
          </button>
        `).join('')}
      </div>
    `;
  }

  const assistantHtml = `
    <div class="flex items-start space-x-3 max-w-3xl">
      <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-teal-500 flex items-center justify-center text-white shrink-0 shadow-sm">
        <span class="text-sm">🧠</span>
      </div>
      <div class="flex-1 bg-white border border-slate-200/90 rounded-2xl rounded-tl-sm p-4 shadow-xs text-xs space-y-3">
        <div class="flex justify-between items-center border-b border-slate-100 pb-2">
          <div class="flex items-center space-x-2">
            <strong class="text-slate-800 font-extrabold text-sm">${escapeHtml(data.titulo || 'Auditoría Gerencial')}</strong>
            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-100 text-indigo-700 font-mono">${escapeHtml(data.intent || 'GENERAL')}</span>
          </div>
          <span class="text-[10px] text-slate-400 font-mono">${new Date(data.timestamp).toLocaleTimeString()}</span>
        </div>

        <p class="text-slate-700 leading-relaxed text-xs">${resumenHtml}</p>

        ${kpisHtml}
        ${alertasHtml}
        ${tablasHtml}
        ${accionesHtml}
      </div>
    </div>
  `;

  container.insertAdjacentHTML('beforeend', assistantHtml);
  cfoCopilotState.historial.push({ rol: 'asistente', titulo: data.titulo, intent: data.intent });
}

function ejecutarAccionCopilot(accionJs) {
  cerrarModalCfoCopilot();
  try {
    if (accionJs.startsWith("navigate('") && accionJs.endsWith("')")) {
      const vista = accionJs.replace("navigate('", "").replace("')", "");
      navigate(vista);
    } else if (accionJs.startsWith("abrirSimuladorPrecioIA(")) {
      const prodId = parseInt(accionJs.replace("abrirSimuladorPrecioIA(", "").replace(")", ""));
      abrirSimuladorPrecioIA(prodId);
    } else if (accionJs === "abrirModalAperturaCaja()") {
      abrirModalAperturaCaja();
    } else if (accionJs === "abrirDiagnosticoIaProductos()") {
      navigate('productos');
      setTimeout(() => {
        document.getElementById('btnSubtabProdIa')?.click();
      }, 150);
    } else if (accionJs.startsWith("ejecutarPreguntaCopilot('")) {
      const p = accionJs.replace("ejecutarPreguntaCopilot('", "").replace("')", "");
      abrirModalCfoCopilot();
      ejecutarPreguntaRapidaCopilot(p);
    } else {
      new Function(accionJs)();
    }
  } catch (err) {
    console.error('Error ejecutando acción sugerida por Copilot:', err);
  }
}


// ========================================================
// MÓDULO: DEVOLUCIONES DE COMPRAS A PROVEEDORES (FASE 3B)
// ========================================================

AppState.devolucionesCompras = [];
AppState.compraSeleccionadaParaDev = null;
AppState.devolucionActualDetalle = null;

async function loadDevolucionesCompras() {
  try {
    const res = await fetch('/api/devoluciones-compras');
    if (!res.ok) throw new Error('Error al consultar historial de devoluciones');
    AppState.devolucionesCompras = await res.json();
    renderDevolucionesComprasKPIs();
    renderDevolucionesComprasHistorial();
    initDevolucionComprasForm();
  } catch (err) {
    console.error('[loadDevolucionesCompras]:', err);
    if (typeof showToast === 'function') {
      showToast('Error cargando historial de devoluciones a proveedores: ' + err.message, 'error');
    }
  }
}

function cambiarSubtabDevCompras(tab) {
  const nuevaContainer = document.getElementById('subtabDevCompNuevaContainer');
  const histContainer = document.getElementById('subtabDevCompHistorialContainer');
  const btnNueva = document.getElementById('btnSubtabDevCompNueva');
  const btnHist = document.getElementById('btnSubtabDevCompHistorial');

  if (tab === 'nueva') {
    if (nuevaContainer) nuevaContainer.classList.remove('hidden');
    if (histContainer) histContainer.classList.add('hidden');
    if (btnNueva) {
      btnNueva.className = 'bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow transition flex items-center';
    }
    if (btnHist) {
      btnHist.className = 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2 rounded-xl text-sm font-medium shadow-sm transition flex items-center';
    }
    initDevolucionComprasForm();
  } else {
    if (nuevaContainer) nuevaContainer.classList.add('hidden');
    if (histContainer) histContainer.classList.remove('hidden');
    if (btnHist) {
      btnHist.className = 'bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow transition flex items-center';
    }
    if (btnNueva) {
      btnNueva.className = 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2 rounded-xl text-sm font-medium shadow-sm transition flex items-center';
    }
    renderDevolucionesComprasHistorial();
  }
}

async function initDevolucionComprasForm() {
  const select = document.getElementById('devCompSelectCompra');
  const fechaInput = document.getElementById('devCompFecha');
  if (fechaInput && !fechaInput.value) {
    fechaInput.value = new Date().toISOString().split('T')[0];
  }
  if (!select) return;

  try {
    const res = await fetch('/api/compras');
    if (!res.ok) throw new Error('Error al cargar lista de compras');
    const compras = await res.json();
    
    // Solo compras no anuladas
    const comprasActivas = compras.filter(c => c.estado !== 'anulada');
    
    select.innerHTML = '<option value="">-- Selecciona una factura de compra registrada --</option>' +
      comprasActivas.map(c => {
        const numDoc = c.numero_factura || c.numero_control || `#${c.id}`;
        const prov = c.proveedor_nombre || 'Proveedor';
        const total = parseFloat(c.total || 0).toFixed(2);
        const fStr = (c.fecha || '').split('T')[0] || (c.fecha || '').substring(0, 10);
        return `<option value="${c.id}">[${fStr}] Factura ${escapeHtml(numDoc)} - ${escapeHtml(prov)} ($${total})</option>`;
      }).join('');

    // Resetear formulario si no hay compra seleccionada
    if (!select.value) {
      document.getElementById('devCompInfoCard')?.classList.add('hidden');
      document.getElementById('devCompItemsContainer')?.classList.add('hidden');
      AppState.compraSeleccionadaParaDev = null;
    }
  } catch (err) {
    console.error('[initDevolucionComprasForm]:', err);
  }
}

async function onSelectCompraDevolucion(compraId) {
  if (!compraId) {
    document.getElementById('devCompInfoCard')?.classList.add('hidden');
    document.getElementById('devCompItemsContainer')?.classList.add('hidden');
    AppState.compraSeleccionadaParaDev = null;
    return;
  }

  try {
    const res = await fetch(`/api/compras/${compraId}/items-para-devolucion`);
    if (!res.ok) throw new Error('No se pudieron obtener los renglones de la compra');
    const data = await res.json();
    AppState.compraSeleccionadaParaDev = data;

    // Llenar panel info
    document.getElementById('devCompProvNombre').textContent = data.proveedor_nombre || 'Proveedor';
    document.getElementById('devCompProvRif').textContent = `RIF: ${data.proveedor_rif || data.proveedor_cedula || 'N/A'} • Tel: ${data.proveedor_telefono || 'N/A'}`;
    document.getElementById('devCompFacturaNum').textContent = data.numero_factura || data.numero_control || `#${data.id}`;
    document.getElementById('devCompFechaCompra').textContent = (data.fecha || '').substring(0, 10);
    document.getElementById('devCompTotalOriginal').textContent = `$${parseFloat(data.total || 0).toFixed(2)}`;
    
    const saldoCxP = data.cxp ? parseFloat(data.cxp.saldo_pendiente || 0) : parseFloat(data.saldo_pendiente || 0);
    document.getElementById('devCompSaldoPendiente').textContent = `$${saldoCxP.toFixed(2)}`;

    document.getElementById('devCompInfoCard')?.classList.remove('hidden');

    // Renderizar tabla de renglones
    const tbody = document.getElementById('devCompItemsTableBody');
    if (!tbody) return;

    if (!data.items || data.items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center py-6 text-slate-400">Esta compra no tiene renglones de inventario asociados.</td></tr>';
      document.getElementById('devCompItemsContainer')?.classList.remove('hidden');
      return;
    }

    tbody.innerHTML = data.items.map((it, idx) => {
      const maxPermitido = parseFloat(it.max_permitido || 0);
      const stockAlm = parseFloat(it.stock_almacen || 0);
      const disableInput = maxPermitido <= 0.0001;
      const warningBadge = disableInput 
        ? (stockAlm <= 0.0001 ? '<span class="text-[10px] text-rose-600 font-bold block">Sin existencias en almacén</span>' : '<span class="text-[10px] text-amber-600 font-bold block">Totalmente devuelto previo</span>')
        : '';

      return `
        <tr class="hover:bg-slate-50 transition ${disableInput ? 'opacity-60 bg-slate-50/50' : ''}">
          <td class="py-2 px-3 font-mono text-[11px] text-slate-500">${escapeHtml(it.prod_codigo || '')}</td>
          <td class="py-2 px-3 font-semibold text-slate-800">
            ${escapeHtml(it.prod_nombre || it.nombre_producto || '')}
            ${warningBadge}
          </td>
          <td class="py-2 px-3 text-center text-slate-600 font-medium">${parseFloat(it.cantidad_comprada || 0)}</td>
          <td class="py-2 px-3 text-center text-slate-500">${parseFloat(it.cantidad_devuelta_previa || 0)}</td>
          <td class="py-2 px-3 text-center font-bold text-teal-700">${stockAlm}</td>
          <td class="py-2 px-3 text-center">
            <input type="number" step="any" min="0" max="${maxPermitido}" value="0"
                   id="devCant_${idx}"
                   data-idx="${idx}"
                   ${disableInput ? 'disabled' : ''}
                   oninput="calcularTotalesDevolucionCompra()"
                   class="w-24 text-center py-1 px-2 border border-slate-300 rounded-lg font-bold text-xs focus:ring-2 focus:ring-amber-500 ${disableInput ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white text-slate-900'}">
          </td>
          <td class="py-2 px-3 text-right font-medium text-slate-700">$${parseFloat(it.costo_unitario || 0).toFixed(2)}</td>
          <td class="py-2 px-3 text-right font-bold text-slate-900" id="devSubtotalRow_${idx}">$0.00</td>
        </tr>
      `;
    }).join('');

    document.getElementById('devCompItemsContainer')?.classList.remove('hidden');
    calcularTotalesDevolucionCompra();
  } catch (err) {
    console.error('[onSelectCompraDevolucion]:', err);
    if (typeof showToast === 'function') {
      showToast('Error al cargar datos de compra: ' + err.message, 'error');
    }
  }
}

function onSelectMotivoDevCompra(motivo) {
  const otroBox = document.getElementById('devCompMotivoOtroBox');
  if (otroBox) {
    if (motivo === 'OTRO') {
      otroBox.classList.remove('hidden');
      document.getElementById('devCompMotivoOtro')?.focus();
    } else {
      otroBox.classList.add('hidden');
    }
  }
}

function calcularTotalesDevolucionCompra() {
  if (!AppState.compraSeleccionadaParaDev || !AppState.compraSeleccionadaParaDev.items) return;

  const items = AppState.compraSeleccionadaParaDev.items;
  let subtotal = 0.0;
  let totalIva = 0.0;
  let itemsCount = 0;

  const ivaPct = (AppState.config && AppState.config.iva_porcentaje) ? (AppState.config.iva_porcentaje / 100.0) : 0.16;
  const tasaVes = (AppState.config && AppState.config.tasa_ves) ? AppState.config.tasa_ves : 45.0;

  items.forEach((it, idx) => {
    const input = document.getElementById(`devCant_${idx}`);
    const subtotalCell = document.getElementById(`devSubtotalRow_${idx}`);
    if (!input) return;

    let cant = parseFloat(input.value || 0);
    const maxPerm = parseFloat(it.max_permitido || 0);

    // Ajustar si excede
    if (cant > maxPerm) {
      cant = maxPerm;
      input.value = maxPerm;
    }
    if (cant < 0) {
      cant = 0;
      input.value = 0;
    }

    const costo = parseFloat(it.costo_unitario || 0);
    const subItm = cant * costo;
    const ivaItm = (it.impuesto_tipo === 'gravado') ? (subItm * ivaPct) : 0.0;

    if (cant > 0) itemsCount++;
    subtotal += subItm;
    totalIva += ivaItm;

    if (subtotalCell) {
      subtotalCell.textContent = `$${subItm.toFixed(2)}`;
    }
  });

  const totalUsd = subtotal + totalIva;
  const totalBs = totalUsd * tasaVes;

  const subEl = document.getElementById('devCompSubtotalUsd');
  if (subEl) subEl.textContent = `$${subtotal.toFixed(2)}`;
  const ivaEl = document.getElementById('devCompIvaUsd');
  if (ivaEl) ivaEl.textContent = `$${totalIva.toFixed(2)}`;
  const totUsdEl = document.getElementById('devCompTotalUsd');
  if (totUsdEl) totUsdEl.textContent = `$${totalUsd.toFixed(2)}`;
  const totBsEl = document.getElementById('devCompTotalBs');
  if (totBsEl) totBsEl.textContent = `${totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs.`;

  // Calcular efecto en CxP
  const saldoPendienteActual = AppState.compraSeleccionadaParaDev.cxp 
    ? parseFloat(AppState.compraSeleccionadaParaDev.cxp.saldo_pendiente || 0)
    : parseFloat(AppState.compraSeleccionadaParaDev.saldo_pendiente || 0);

  const msgEl = document.getElementById('devCompCxPEffectMsg');
  if (msgEl) {
    if (totalUsd <= 0.0001) {
      msgEl.innerHTML = 'Selecciona cantidades para calcular la reducción en la deuda con el proveedor.';
    } else if (saldoPendienteActual >= totalUsd - 0.0001) {
      const nuevoSaldo = Math.max(0.0, saldoPendienteActual - totalUsd);
      msgEl.innerHTML = `Se descontarán <strong>$${totalUsd.toFixed(2)}</strong> de la deuda en CxP. Nuevo saldo pendiente: <strong>$${nuevoSaldo.toFixed(2)}</strong>.`;
    } else {
      const desc = saldoPendienteActual;
      const saldoFavor = totalUsd - desc;
      msgEl.innerHTML = `Se liquidará el saldo pendiente de CxP ($${desc.toFixed(2)}) y el remanente de <strong>$${saldoFavor.toFixed(2)}</strong> quedará registrado como saldo a favor del proveedor.`;
    }
  }
}

async function procesarDevolucionCompra() {
  if (!AppState.compraSeleccionadaParaDev) {
    alert('Por favor selecciona primero una factura de compra.');
    return;
  }

  const compra = AppState.compraSeleccionadaParaDev;
  const items = compra.items || [];
  const itemsADevolver = [];

  items.forEach((it, idx) => {
    const input = document.getElementById(`devCant_${idx}`);
    if (!input) return;
    const cant = parseFloat(input.value || 0);
    if (cant > 0.0001) {
      itemsADevolver.push({
        compra_detalle_id: it.id,
        producto_id: it.producto_id,
        cantidad: cant,
        costo_unitario: parseFloat(it.costo_unitario || 0),
        impuesto_tipo: it.impuesto_tipo || 'exento'
      });
    }
  });

  if (itemsADevolver.length === 0) {
    alert('Debes indicar una cantidad a devolver mayor a 0 en al menos un producto.');
    return;
  }

  let motivo = document.getElementById('devCompMotivoSelect')?.value || 'Devolución de mercancía a proveedor';
  if (motivo === 'OTRO') {
    const otro = document.getElementById('devCompMotivoOtro')?.value.trim();
    if (!otro) {
      alert('Por favor especifica el motivo de la devolución en el campo de texto.');
      document.getElementById('devCompMotivoOtro')?.focus();
      return;
    }
    motivo = otro;
  }

  const fecha = document.getElementById('devCompFecha')?.value || new Date().toISOString().split('T')[0];
  const notas = document.getElementById('devCompNotas')?.value.trim() || '';

  const confirmMsg = `¿Confirmas registrar la DEVOLUCIÓN A PROVEEDOR?\n\n• Proveedor: ${compra.proveedor_nombre}\n• Ítems a devolver: ${itemsADevolver.length}\n• Se descontará el stock físico del almacén.\n• Se rebajará la Cuenta por Pagar (CxP).`;
  if (!confirm(confirmMsg)) return;

  const btn = document.getElementById('btnProcesarDevCompra');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i>Procesando...';
  }

  try {
    const res = await fetch('/api/devoluciones-compras', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        compra_id: compra.id,
        proveedor_id: compra.proveedor_id,
        motivo: motivo,
        fecha: fecha,
        items: itemsADevolver,
        notas: notas
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || data.message || 'Error al procesar devolución');
    }

    if (typeof showToast === 'function') {
      showToast(`✅ Devolución #${data.numero_devolucion} completada exitosamente. Stock y CxP actualizados.`, 'success');
    } else {
      alert(`✅ Devolución #${data.numero_devolucion} registrada exitosamente.`);
    }

    // Recargar datos y mostrar historial
    await loadDevolucionesCompras();
    await loadProductos();
    await loadDashboard();
    cambiarSubtabDevCompras('historial');
    
    // Abrir comprobante
    verDetalleDevolucionCompra(data.devolucion_id);
  } catch (err) {
    alert('❌ ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-check-circle mr-1.5"></i><span>Completar Devolución a Proveedor</span>';
    }
  }
}

function renderDevolucionesComprasKPIs() {
  const devs = AppState.devolucionesCompras || [];
  const activas = devs.filter(d => d.estado !== 'anulada');

  const count = activas.length;
  let totalUsd = 0.0;
  let totalBs = 0.0;
  let totalCxp = 0.0;

  activas.forEach(d => {
    totalUsd += parseFloat(d.total_usd || 0);
    totalBs += parseFloat(d.total_ves || 0);
    totalCxp += parseFloat(d.monto_descontado_cxp || 0);
  });

  const countEl = document.getElementById('kpiDevCompCount');
  if (countEl) countEl.textContent = count;
  const totUsdEl = document.getElementById('kpiDevCompTotalUsd');
  if (totUsdEl) totUsdEl.textContent = `$${totalUsd.toFixed(2)}`;
  const totBsEl = document.getElementById('kpiDevCompTotalBs');
  if (totBsEl) totBsEl.textContent = `${totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs.`;
  const cxpEl = document.getElementById('kpiDevCompDescontadoCxp');
  if (cxpEl) cxpEl.textContent = `$${totalCxp.toFixed(2)}`;
}

function renderDevolucionesComprasHistorial() {
  const tbody = document.getElementById('devolucionesComprasTableBody');
  if (!tbody) return;

  const devs = AppState.devolucionesCompras || [];
  const query = (document.getElementById('devCompHistorialSearchInput')?.value || '').toLowerCase().trim();

  const filtradas = devs.filter(d => {
    if (!query) return true;
    const num = (d.numero_devolucion || '').toLowerCase();
    const prov = (d.proveedor_nombre || '').toLowerCase();
    const fact = (d.numero_factura_proveedor || d.numero_control_compra || '').toLowerCase();
    const mot = (d.motivo || '').toLowerCase();
    return num.includes(query) || prov.includes(query) || fact.includes(query) || mot.includes(query);
  });

  if (filtradas.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-8 text-slate-400">
          <i class="fa-solid fa-boxes-packing text-3xl mb-2 text-slate-300 block"></i>
          No hay devoluciones registradas ${query ? 'que coincidan con la búsqueda' : 'en este momento'}.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtradas.map(d => {
    const esAnulada = d.estado === 'anulada';
    const numFact = d.numero_factura_proveedor || d.numero_control_compra || 'S/N';
    const fecha = (d.fecha_emision || '').substring(0, 10);
    const totalUsd = parseFloat(d.total_usd || 0).toFixed(2);
    const descCxp = parseFloat(d.monto_descontado_cxp || 0).toFixed(2);

    return `
      <tr class="hover:bg-slate-50 transition ${esAnulada ? 'opacity-50 bg-slate-50/50' : ''}">
        <td class="py-3 px-4 font-mono font-bold text-amber-800">
          ${escapeHtml(d.numero_devolucion || '')}
        </td>
        <td class="py-3 px-4 text-slate-600">${escapeHtml(fecha)}</td>
        <td class="py-3 px-4">
          <div class="font-bold text-slate-800">${escapeHtml(d.proveedor_nombre || '')}</div>
          <div class="text-[11px] text-slate-400">${escapeHtml(d.proveedor_rif || '')}</div>
        </td>
        <td class="py-3 px-4 text-slate-700 font-medium">${escapeHtml(numFact)}</td>
        <td class="py-3 px-4 text-slate-600 max-w-xs truncate" title="${escapeHtml(d.motivo || '')}">${escapeHtml(d.motivo || '')}</td>
        <td class="py-3 px-4 text-right font-extrabold text-slate-900">$${totalUsd}</td>
        <td class="py-3 px-4 text-right font-bold text-emerald-700">$${descCxp}</td>
        <td class="py-3 px-4 text-center">
          ${esAnulada 
            ? '<span class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">Anulada</span>' 
            : '<span class="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">Activa</span>'}
        </td>
        <td class="py-3 px-4 text-center">
          <div class="inline-flex items-center space-x-1">
            <button onclick="verDetalleDevolucionCompra(${d.id})" class="p-1.5 bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-800 rounded-lg transition" title="Ver Detalle y Comprobante">
              <i class="fa-solid fa-eye text-xs"></i>
            </button>
            ${!esAnulada ? `
              <button onclick="anularDevolucionCompra(${d.id}, '${escapeHtml(d.numero_devolucion)}')" class="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg transition" title="Anular Devolución">
                <i class="fa-solid fa-ban text-xs"></i>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function verDetalleDevolucionCompra(id) {
  try {
    const res = await fetch(`/api/devoluciones-compras/${id}`);
    if (!res.ok) throw new Error('No se pudo cargar el detalle de la devolución');
    const data = await res.json();
    AppState.devolucionActualDetalle = data;

    const modal = document.getElementById('modalNotaDebitoCompra');
    const container = document.getElementById('modalNdContenidoImprimible');
    if (!modal || !container) return;

    const fecha = (data.fecha_emision || '').substring(0, 10);
    const totalUsd = parseFloat(data.total_usd || 0).toFixed(2);
    const subtotalUsd = parseFloat(data.subtotal_usd || 0).toFixed(2);
    const ivaUsd = parseFloat(data.iva_usd || 0).toFixed(2);
    const totalBs = parseFloat(data.total_ves || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const descCxp = parseFloat(data.monto_descontado_cxp || 0).toFixed(2);
    const saldoFavor = parseFloat(data.monto_saldo_favor || 0).toFixed(2);
    const cfg = AppState.config || {};

    const detallesHtml = (data.detalles || []).map(dt => `
      <tr class="border-b border-slate-100">
        <td class="py-2 px-3 font-mono text-[11px]">${escapeHtml(dt.codigo || '')}</td>
        <td class="py-2 px-3 font-medium">${escapeHtml(dt.nombre_producto || '')}</td>
        <td class="py-2 px-3 text-center font-bold">${parseFloat(dt.cantidad)}</td>
        <td class="py-2 px-3 text-right">$${parseFloat(dt.costo_unitario).toFixed(2)}</td>
        <td class="py-2 px-3 text-right font-bold">$${parseFloat(dt.subtotal).toFixed(2)}</td>
      </tr>
    `).join('');

    container.innerHTML = `
      <!-- Encabezado Documento Oficial -->
      <div class="flex justify-between items-start pb-4 border-b-2 border-slate-800">
        <div>
          <h2 class="text-base font-black text-slate-900 tracking-tight">${escapeHtml(cfg.nombre_negocio || 'EMPRESA COMERCIAL')}</h2>
          <p class="text-xs text-slate-600 font-mono">RIF: ${escapeHtml(cfg.documento_fiscal || 'J-00000000-0')}</p>
          <p class="text-[11px] text-slate-500">${escapeHtml(cfg.direccion || '')} • Tel: ${escapeHtml(cfg.telefono || '')}</p>
        </div>
        <div class="text-right">
          <span class="inline-block bg-amber-100 text-amber-800 px-3 py-1 rounded-md text-xs font-black uppercase tracking-wider">
            NOTA DE DÉBITO A PROVEEDOR
          </span>
          <p class="font-mono font-bold text-sm text-slate-900 mt-1">${escapeHtml(data.numero_devolucion)}</p>
          <p class="text-[11px] text-slate-500">Fecha: ${escapeHtml(fecha)}</p>
        </div>
      </div>

      <!-- Datos del Proveedor y Factura Afectada -->
      <div class="grid grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
        <div>
          <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">DATOS DEL PROVEEDOR</span>
          <p class="font-bold text-slate-800 text-xs mt-0.5">${escapeHtml(data.proveedor_nombre || '')}</p>
          <p class="text-[11px] text-slate-600 font-mono">RIF: ${escapeHtml(data.proveedor_rif || 'N/A')}</p>
          <p class="text-[11px] text-slate-500">Tel: ${escapeHtml(data.proveedor_telefono || 'N/A')}</p>
        </div>
        <div>
          <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">DOCUMENTO DE COMPRA AFECTADO</span>
          <p class="font-bold text-slate-800 text-xs mt-0.5">Factura Proveedor: ${escapeHtml(data.numero_factura_proveedor || data.numero_control_compra || 'S/N')}</p>
          <p class="text-[11px] text-slate-500">Fecha Compra Original: ${(data.fecha_compra_original || '').substring(0, 10)}</p>
          <p class="text-[11px] text-slate-600 mt-0.5"><strong>Motivo:</strong> ${escapeHtml(data.motivo || '')}</p>
        </div>
      </div>

      <!-- Tabla de Ítems Devueltos -->
      <div class="border border-slate-200 rounded-xl overflow-hidden">
        <table class="w-full text-left text-xs">
          <thead>
            <tr class="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
              <th class="py-2 px-3">Código</th>
              <th class="py-2 px-3">Descripción de Mercancía</th>
              <th class="py-2 px-3 text-center">Cant.</th>
              <th class="py-2 px-3 text-right">Costo Unit.</th>
              <th class="py-2 px-3 text-right">Total ($)</th>
            </tr>
          </thead>
          <tbody>
            ${detallesHtml}
          </tbody>
        </table>
      </div>

      <!-- Resumen de Totales y Liquidación en CxP -->
      <div class="grid grid-cols-2 gap-4 items-start pt-2">
        <div class="bg-amber-50/70 p-3 rounded-xl border border-amber-200/80 text-[11px] text-amber-950 space-y-1">
          <p class="font-bold flex items-center">
            <i class="fa-solid fa-receipt mr-1 text-amber-700"></i>Afectación en Cuentas por Pagar:
          </p>
          <p>• Descontado directamente de deuda CxP: <strong>$${descCxp}</strong></p>
          ${parseFloat(saldoFavor) > 0 ? `<p>• Saldo a favor pendiente con proveedor: <strong>$${saldoFavor}</strong></p>` : ''}
          <p class="text-slate-500 text-[10px] mt-1">Este comprobante certifica la devolución formal de la mercancía y la rebaja de la cuenta pendiente.</p>
        </div>

        <div class="space-y-1 text-xs text-right">
          <div class="flex justify-between text-slate-500">
            <span>Subtotal:</span>
            <span class="font-bold text-slate-800">$${subtotalUsd}</span>
          </div>
          <div class="flex justify-between text-slate-500">
            <span>IVA:</span>
            <span class="font-bold text-slate-800">$${ivaUsd}</span>
          </div>
          <div class="flex justify-between text-sm font-black text-slate-900 border-t border-slate-200 pt-1">
            <span>Total Nota de Débito:</span>
            <span class="text-rose-600">$${totalUsd}</span>
          </div>
          <div class="flex justify-between text-xs text-slate-500">
            <span>Total en Bolívares (BCV):</span>
            <span class="font-bold text-slate-700">${totalBs} Bs.</span>
          </div>
        </div>
      </div>

      <!-- Firmas -->
      <div class="grid grid-cols-2 gap-10 pt-8 mt-6 border-t border-dashed border-slate-300 text-center text-[11px] text-slate-500">
        <div>
          <div class="border-t border-slate-400 mx-6 pt-1">Entregado por / Responsable Almacén</div>
        </div>
        <div>
          <div class="border-t border-slate-400 mx-6 pt-1">Recibido Conforme / Proveedor</div>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
  } catch (err) {
    alert('❌ ' + err.message);
  }
}

function cerrarModalNotaDebitoCompra() {
  document.getElementById('modalNotaDebitoCompra')?.classList.add('hidden');
}

function imprimirNotaDebitoCompraDirecta() {
  const content = document.getElementById('modalNdContenidoImprimible')?.innerHTML;
  if (!content) return;

  const w = window.open('', '_blank', 'width=800,height=900');
  w.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Nota de Débito a Proveedor</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      </style>
    </head>
    <body class="p-8 bg-white text-slate-800 font-sans" onload="window.print();">
      ${content}
    </body>
    </html>
  `);
  w.document.close();
}

async function anularDevolucionCompra(id, numDev) {
  const motivo = prompt(`⚠️ ATENCIÓN: Vas a ANULAR la Devolución a Proveedor #${numDev}.\n\nEfectos:\n• Las unidades devueltas se REINTEGRARÁN (+) al inventario.\n• La deuda en Cuentas por Pagar (CxP) se RESTABLECERÁ.\n\nIngresa el motivo de la anulación:`, 'Error en carga de devolución');
  if (motivo === null) return;
  if (!motivo.trim()) {
    alert('Debes indicar un motivo válido para anular la devolución.');
    return;
  }

  try {
    const res = await fetch(`/api/devoluciones-compras/${id}/anular`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo: motivo.trim() })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || data.message || 'Error al anular devolución');
    }

    if (typeof showToast === 'function') {
      showToast(`✅ Devolución #${numDev} anulada. Stock y deuda CxP restaurados.`, 'info');
    } else {
      alert(`✅ Devolución #${numDev} anulada exitosamente.`);
    }

    await loadDevolucionesCompras();
    await loadProductos();
    await loadDashboard();
  } catch (err) {
    alert('❌ ' + err.message);
  }
}

window.loadDevolucionesCompras = loadDevolucionesCompras;
window.cambiarSubtabDevCompras = cambiarSubtabDevCompras;
window.initDevolucionComprasForm = initDevolucionComprasForm;
window.onSelectCompraDevolucion = onSelectCompraDevolucion;
window.onSelectMotivoDevCompra = onSelectMotivoDevCompra;
window.calcularTotalesDevolucionCompra = calcularTotalesDevolucionCompra;
window.procesarDevolucionCompra = procesarDevolucionCompra;
window.renderDevolucionesComprasHistorial = renderDevolucionesComprasHistorial;
window.verDetalleDevolucionCompra = verDetalleDevolucionCompra;
window.cerrarModalNotaDebitoCompra = cerrarModalNotaDebitoCompra;
window.imprimirNotaDebitoCompraDirecta = imprimirNotaDebitoCompraDirecta;
window.anularDevolucionCompra = anularDevolucionCompra;


// ======================================================

// CONTROLADOR INTEGRAL DEL CATÁLOGO DE PRODUCTOS (PDF & WHATSAPP)
// ========================================================

function normalizarTelefonoWhatsApp(phoneStr, defaultCountry = '58') {
  if (!phoneStr) return '';
  let str = String(phoneStr).trim();
  let digits = str.replace(/[^0-9]/g, '');
  if (!digits) return '';

  // Si ya tiene código 58 y longitud >= 12 (ej: 584121234567)
  if (digits.startsWith('58') && digits.length >= 12) {
    return digits;
  }

  // Si empieza con 0 (ej: 0412, 0414, 0424, 0416, 0426, 0212), remover el 0 y anteponer 58
  if (digits.startsWith('0')) {
    return defaultCountry + digits.substring(1);
  }

  // Si tiene 10 dígitos y empieza por 412, 414, 424, 416, 426, 212
  if (digits.length === 10 && (digits.startsWith('412') || digits.startsWith('414') || digits.startsWith('424') || digits.startsWith('416') || digits.startsWith('426') || digits.startsWith('212'))) {
    return defaultCountry + digits;
  }

  return digits;
}

function autoNormalizarTelefonoInput(inputEl) {
  if (!inputEl) return;
  const val = inputEl.value.trim();
  const norm = normalizarTelefonoWhatsApp(val);
  if (norm) {
    inputEl.value = norm;
  }
}

function openCatalogoModal() {
  const modal = document.getElementById('modalCatalogoProductos');
  if (!modal) return;

  // 1. Poblar Selector de Categorías
  const catSel = document.getElementById('catalogoFilterCategoria');
  if (catSel && AppState.categorias) {
    catSel.innerHTML = '<option value="">Todas las Categorías</option>' +
      AppState.categorias.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
  }

  // 2. Poblar Selector de Clientes para WhatsApp
  const cliSel = document.getElementById('catalogoClienteSelect');
  if (cliSel && AppState.clientes) {
    cliSel.innerHTML = '<option value="">-- Seleccionar cliente del directorio... --</option>' +
      AppState.clientes.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)} (${escapeHtml(c.cedula)}) - ${escapeHtml(c.telefono || 'Sin telf')}</option>`).join('');
  }

  // 3. Resetear pestaña a Formato
  setCatalogoTab('formato');

  // 4. Actualizar estado visual de los radios y contador
  actualizarModoStockCatalogo();
  actualizarContadorCatalogo();

  modal.classList.remove('hidden');
}

function closeCatalogoModal() {
  const modal = document.getElementById('modalCatalogoProductos');
  if (modal) modal.classList.add('hidden');
}

function setCatalogoTab(tab) {
  const btnFormato = document.getElementById('tabBtnCatalogoFormato');
  const btnWhatsApp = document.getElementById('tabBtnCatalogoWhatsApp');
  const panelFormato = document.getElementById('panelCatalogoFormato');
  const panelWhatsApp = document.getElementById('panelCatalogoWhatsApp');

  if (tab === 'whatsapp') {
    if (btnFormato) {
      btnFormato.className = 'px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center bg-slate-100 text-slate-600 hover:bg-slate-200';
    }
    if (btnWhatsApp) {
      btnWhatsApp.className = 'px-4 py-2 rounded-xl text-xs font-bold transition flex items-center bg-[#071B49] text-white shadow-xs';
    }
    if (panelFormato) panelFormato.classList.add('hidden');
    if (panelWhatsApp) panelWhatsApp.classList.remove('hidden');
    actualizarPreviewWhatsAppCatalogo();
  } else {
    if (btnFormato) {
      btnFormato.className = 'px-4 py-2 rounded-xl text-xs font-bold transition flex items-center bg-[#071B49] text-white shadow-xs';
    }
    if (btnWhatsApp) {
      btnWhatsApp.className = 'px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center bg-slate-100 text-slate-600 hover:bg-slate-200';
    }
    if (panelFormato) panelFormato.classList.remove('hidden');
    if (panelWhatsApp) panelWhatsApp.classList.add('hidden');
  }
}

function actualizarModoStockCatalogo() {
  const radios = document.getElementsByName('catalogoStockOption');
  let selected = 'sin_stock';
  for (const r of radios) {
    if (r.checked) {
      selected = r.value;
      break;
    }
  }

  const cardOculto = document.getElementById('cardStockOculto');
  const cardVisible = document.getElementById('cardStockVisible');

  if (selected === 'con_stock') {
    if (cardVisible) {
      cardVisible.className = 'cursor-pointer border-2 border-emerald-600 bg-emerald-50/50 rounded-2xl p-3.5 flex flex-col justify-between transition relative';
    }
    if (cardOculto) {
      cardOculto.className = 'cursor-pointer border-2 border-slate-200 rounded-2xl p-3.5 flex flex-col justify-between transition relative hover:border-slate-300';
    }
  } else {
    if (cardOculto) {
      cardOculto.className = 'cursor-pointer border-2 border-blue-600 bg-blue-50/50 rounded-2xl p-3.5 flex flex-col justify-between transition relative';
    }
    if (cardVisible) {
      cardVisible.className = 'cursor-pointer border-2 border-slate-200 rounded-2xl p-3.5 flex flex-col justify-between transition relative hover:border-slate-300';
    }
  }

  actualizarContadorCatalogo();
  actualizarPreviewWhatsAppCatalogo();
}

function obtenerProductosFiltradosCatalogo() {
  const catId = document.getElementById('catalogoFilterCategoria')?.value || '';
  const tipo = document.getElementById('catalogoFilterTipo')?.value || '';
  const disp = document.getElementById('catalogoFilterDisponibilidad')?.value || 'todos';

  let list = AppState.productos || [];

  // Filtrar solo activos
  list = list.filter(p => p.activo !== 0);

  if (catId) {
    list = list.filter(p => String(p.categoria_id) === String(catId));
  }
  if (tipo) {
    list = list.filter(p => p.tipo === tipo);
  }
  if (disp === 'con_stock') {
    list = list.filter(p => parseFloat(p.stock || 0) > 0);
  }

  return list;
}

function actualizarContadorCatalogo() {
  const prods = obtenerProductosFiltradosCatalogo();
  const badge = document.getElementById('catalogoTotalItemsBadge');
  if (badge) {
    badge.textContent = `${prods.length} ${prods.length === 1 ? 'producto' : 'productos'}`;
  }
  actualizarPreviewWhatsAppCatalogo();
}

function seleccionarClienteParaWhatsAppCatalogo(clienteId) {
  if (!clienteId) return;
  const c = (AppState.clientes || []).find(cl => String(cl.id) === String(clienteId));
  if (!c) return;

  const telInput = document.getElementById('catalogoTelefonoWhatsApp');
  if (telInput) {
    const norm = normalizarTelefonoWhatsApp(c.telefono || '');
    telInput.value = norm;
  }
  actualizarPreviewWhatsAppCatalogo(c.nombre);
}

function actualizarPreviewWhatsAppCatalogo(nombreCliente = '') {
  const textarea = document.getElementById('catalogoMensajeWhatsAppPreview');
  const badgePdf = document.getElementById('catalogoModoPdfBadge');
  const nombrePdfEl = document.getElementById('catalogoArchivoPdfNombre');

  const opciones = obtenerOpcionesCatalogoActual();
  const cfg = AppState.config || {};
  const nombreNegocio = cfg.nombre_negocio || 'TAVO CLOUD';
  const cleanName = nombreNegocio.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = opciones.mostrarStock
    ? `Catalogo_Inventario_${cleanName}.pdf`
    : `Catalogo_Productos_${cleanName}.pdf`;

  if (nombrePdfEl) nombrePdfEl.textContent = fileName;
  if (badgePdf) {
    badgePdf.textContent = opciones.mostrarStock ? 'Inventario (Con Stock)' : 'Comercial (Sin Stock)';
    badgePdf.className = opciones.mostrarStock
      ? 'text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800'
      : 'text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800';
  }

  if (textarea) {
    const saludo = nombreCliente ? `Estimado/a ${nombreCliente}` : `Estimado/a cliente`;
    textarea.value = `¡Hola! ${saludo}, le adjuntamos nuestro Catálogo Oficial de Productos en formato PDF.

Quedamos atentos a sus pedidos y cotizaciones.
*${nombreNegocio}*`;
  }
}

function copiarTextoCatalogoWhatsApp() {
  const textarea = document.getElementById('catalogoMensajeWhatsAppPreview');
  if (!textarea || !textarea.value) return;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(textarea.value).then(() => {
      alert('✅ Mensaje de cortesía copiado.');
    }).catch(() => {
      textarea.select();
      document.execCommand('copy');
      alert('✅ Mensaje copiado.');
    });
  } else {
    textarea.select();
    document.execCommand('copy');
    alert('✅ Mensaje copiado.');
  }
}

function obtenerOpcionesCatalogoActual() {
  const radiosStock = document.getElementsByName('catalogoStockOption');
  let mostrarStock = false;
  for (const r of radiosStock) {
    if (r.checked && r.value === 'con_stock') {
      mostrarStock = true;
      break;
    }
  }

  const radiosLayout = document.getElementsByName('catalogoLayout');
  let layout = 'grid';
  for (const r of radiosLayout) {
    if (r.checked) {
      layout = r.value;
      break;
    }
  }

  return { mostrarStock, layout };
}

async function compartirCatalogoPdfWhatsApp() {
  const prods = obtenerProductosFiltradosCatalogo();
  if (prods.length === 0) {
    alert('No hay productos que coincidan con los filtros para generar el catálogo.');
    return;
  }

  const telInput = document.getElementById('catalogoTelefonoWhatsApp');
  const telRaw = telInput ? telInput.value.trim() : '';
  const telNorm = normalizarTelefonoWhatsApp(telRaw);

  const opciones = obtenerOpcionesCatalogoActual();
  const cfg = AppState.config || {};
  const nombreNegocio = cfg.nombre_negocio || 'TAVO CLOUD';
  const cleanName = nombreNegocio.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = opciones.mostrarStock
    ? `Catalogo_Inventario_${cleanName}.pdf`
    : `Catalogo_Productos_${cleanName}.pdf`;

  const btn = document.getElementById('btnCompartirPdfWhatsApp') || document.getElementById('btnEnviarWhatsAppFooter');
  const btnOriginalText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Generando Archivo PDF...';
  }

  try {
    const htmlDoc = DocumentTemplates.catalogoProductos(prods, cfg, opciones);

    // Contenedor temporal aislado para renderizado
    const tempDiv = document.createElement('div');
    tempDiv.id = 'tempPdfContainer';
    tempDiv.style.position = 'fixed';
    tempDiv.style.left = '-9999px';
    tempDiv.style.top = '0';
    tempDiv.style.width = '794px'; // 210mm a 96dpi (ancho estándar hoja)
    tempDiv.style.background = '#ffffff';
    tempDiv.innerHTML = htmlDoc;
    document.body.appendChild(tempDiv);

    let pdfBlob = null;
    let pdfFile = null;

    if (typeof html2pdf !== 'undefined') {
      const opt = {
        margin: [6, 6, 6, 6],
        filename: fileName,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' }
      };
      pdfBlob = await html2pdf().set(opt).from(tempDiv).outputPdf('blob');
      if (pdfBlob) {
        pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });
      }
    }

    if (tempDiv.parentNode) {
      tempDiv.parentNode.removeChild(tempDiv);
    }

    const textarea = document.getElementById('catalogoMensajeWhatsAppPreview');
    const customMsg = textarea ? textarea.value.trim() : `Estimado/a cliente, le adjuntamos nuestro Catálogo Oficial de Productos en formato PDF.

*${nombreNegocio}*`;
    const waUrl = telNorm
      ? `https://wa.me/${telNorm}?text=${encodeURIComponent(customMsg)}`
      : `https://wa.me/?text=${encodeURIComponent(customMsg)}`;

    // INTENTO 1: Web Share API (Móviles Android / iPhone / Windows moderno)
    // Permite pasar el ARCHIVO BINARIO REAL (.pdf) directamente a WhatsApp
    if (pdfFile && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
      try {
        await navigator.share({
          files: [pdfFile],
          title: fileName,
          text: customMsg
        });
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = btnOriginalText;
        }
        return;
      } catch (shareErr) {
        if (shareErr.name !== 'AbortError') {
          console.warn('[Catalogo] WebShare cancelado o no soportado:', shareErr);
        }
      }
    }

    // INTENTO 2: Descarga automática inmediata del archivo PDF + Apertura de WhatsApp
    if (pdfBlob) {
      const blobUrl = URL.createObjectURL(pdfBlob);
      const downloadLink = document.createElement('a');
      downloadLink.href = blobUrl;
      downloadLink.download = fileName;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    }

    // Abrir WhatsApp con el chat del número registrado
    window.open(waUrl, '_blank');

    // Notificación modal institucional con instrucciones asistidas
    mostrarModalPdfListoWhatsApp(fileName, telNorm);

  } catch (err) {
    console.error('Error generando PDF de catálogo:', err);
    imprimirCatalogoProductos();
    const customMsg = `Estimado/a cliente, le adjuntamos nuestro Catálogo Oficial de Productos en formato PDF.

*${nombreNegocio}*`;
    const waUrl = telNorm
      ? `https://wa.me/${telNorm}?text=${encodeURIComponent(customMsg)}`
      : `https://wa.me/?text=${encodeURIComponent(customMsg)}`;
    window.open(waUrl, '_blank');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = btnOriginalText;
    }
  }
}

function mostrarModalPdfListoWhatsApp(fileName, phone) {
  let modalAlert = document.getElementById('modalPdfGeneradoAlerta');
  if (modalAlert) modalAlert.remove();

  const formattedPhone = phone ? `+${phone}` : 'su cliente';

  const overlay = document.createElement('div');
  overlay.id = 'modalPdfGeneradoAlerta';
  overlay.className = 'fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4';
  overlay.innerHTML = `
    <div class="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
      <div class="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center text-3xl shadow-sm">
        <i class="fa-solid fa-file-pdf"></i>
      </div>
      <div>
        <h3 class="font-extrabold text-base text-slate-900">¡Archivo PDF Generado con Éxito!</h3>
        <p class="text-xs text-slate-600 mt-1 leading-relaxed">
          El archivo <strong>${fileName}</strong> se ha descargado a su equipo y se abrió la conversación de WhatsApp con <strong>${formattedPhone}</strong>.
        </p>
      </div>
      <div class="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 text-left text-[11px] text-emerald-950 flex items-start space-x-2.5">
        <i class="fa-solid fa-paperclip text-emerald-600 mt-0.5 text-base"></i>
        <span><strong>Envío del archivo:</strong> Arrastre el archivo descargado directamente a la ventana de WhatsApp abierta, o haga clic en el ícono de <strong>Adjuntar (📎 Documento)</strong> para enviarlo en 1 segundo.</span>
      </div>
      <button onclick="this.closest('#modalPdfGeneradoAlerta').remove()" class="w-full bg-[#071B49] hover:bg-[#0755C9] text-white py-2.5 rounded-xl font-bold text-xs transition shadow-sm">
        Entendido
      </button>
    </div>
  `;
  document.body.appendChild(overlay);
}

function imprimirCatalogoProductos() {
  const prods = obtenerProductosFiltradosCatalogo();
  if (prods.length === 0) {
    alert('No hay productos que coincidan con los filtros para generar el catálogo.');
    return;
  }

  const opciones = obtenerOpcionesCatalogoActual();
  const cfg = AppState.config || {};
  const htmlDoc = DocumentTemplates.catalogoProductos(prods, cfg, opciones);

  const docTitle = opciones.mostrarStock ? 'Catalogo_Inventario_TAVO_CLOUD' : 'Catalogo_Productos_TAVO_CLOUD';

  DocumentPrinter.print({
    type: 'letterPortrait',
    title: docTitle,
    html: htmlDoc
  });
}

function abrirVistaPreviaCatalogo() {
  const prods = obtenerProductosFiltradosCatalogo();
  const opciones = obtenerOpcionesCatalogoActual();
  const cfg = AppState.config || {};
  const htmlDoc = DocumentTemplates.catalogoProductos(prods, cfg, opciones);

  const modal = document.getElementById('modalVistaPreviaCatalogo');
  const container = document.getElementById('vistaPreviaCatalogoContenido');
  const titulo = document.getElementById('vistaPreviaCatalogoTitulo');

  if (titulo) {
    titulo.textContent = opciones.mostrarStock 
      ? 'Vista Previa: Catálogo de Inventario (Con Existencias)' 
      : 'Vista Previa: Catálogo Comercial (Sin Existencias)';
  }

  if (container) {
    container.innerHTML = htmlDoc;
  }

  if (modal) {
    modal.classList.remove('hidden');
  }
}

function cerrarVistaPreviaCatalogo() {
  const modal = document.getElementById('modalVistaPreviaCatalogo');
  if (modal) modal.classList.add('hidden');
}

// Exportar al ámbito global para llamadas onclick desde el DOM
window.openCatalogoModal = openCatalogoModal;
window.closeCatalogoModal = closeCatalogoModal;
window.setCatalogoTab = setCatalogoTab;
window.actualizarModoStockCatalogo = actualizarModoStockCatalogo;
window.actualizarContadorCatalogo = actualizarContadorCatalogo;
window.seleccionarClienteParaWhatsAppCatalogo = seleccionarClienteParaWhatsAppCatalogo;
window.actualizarPreviewWhatsAppCatalogo = actualizarPreviewWhatsAppCatalogo;
window.copiarTextoCatalogoWhatsApp = copiarTextoCatalogoWhatsApp;
window.compartirCatalogoPdfWhatsApp = compartirCatalogoPdfWhatsApp;
window.normalizarTelefonoWhatsApp = normalizarTelefonoWhatsApp;
window.autoNormalizarTelefonoInput = autoNormalizarTelefonoInput;
window.imprimirCatalogoProductos = imprimirCatalogoProductos;
window.abrirVistaPreviaCatalogo = abrirVistaPreviaCatalogo;
window.cerrarVistaPreviaCatalogo = cerrarVistaPreviaCatalogo;
