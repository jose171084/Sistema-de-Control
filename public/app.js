/**
 * app.js - Lógica interactiva del Sistema de Inventario y Facturación Multimoneda
 */

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
    sidebarBg: '#1e293b',
    sidebarText: '#f8fafc',
    primaryColor: '#0284c7',
    primaryHover: '#0369a1',
    bgApp: '#f8fafc',
    headerBg: '#ffffff',
    btnFactura: '#0284c7',
    btnCompra: '#475569',
    btnCxc: '#0d9488',
    btnCxp: '#64748b',
    btnDevoluciones: '#0891b2',
    btnKardex: '#0284c7',
    btnFiscal: '#0369a1'
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
  titulo_app: "Inventario & Facturación",
  subtitulo_app: "Control Multimoneda",
  tab_dashboard: "Dashboard",
  tab_categorias: "1. Categorías",
  tab_productos: "2. Productos & Servicios",
  tab_clientes: "3. Clientes",
  tab_facturacion: "4. Facturación (Ventas)",
  tab_devoluciones: "5. Devoluciones & NC",
  tab_compras: "6. Compras",
  tab_proveedores: "7. Proveedores",
  tab_reportes: "8. Informes, Kardex & Fiscales",
  tab_cxc: "9. Cuentas por Cobrar",
  tab_cxp: "10. Cuentas por Pagar",
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

  // Fecha por defecto en compras (hoy)
  const today = new Date().toISOString().split('T')[0];
  const compraFechaInput = document.getElementById('compraFecha');
  if (compraFechaInput) compraFechaInput.value = today;

  // Iniciar con un pago por defecto en efectivo USD para mayor comodidad
  initDefaultPosPago();

  // Sincronizar automáticamente tasas oficiales si no se han actualizado hoy
  try {
    const hoyStr = new Date().toISOString().split('T')[0];
    const fechaActualizacion = AppState.config.fecha_tasas_actualizacion || '';
    if (!fechaActualizacion.startsWith(hoyStr)) {
      sincronizarTasasOficiales(true);
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

  // 1. Preferir lo devuelto por la Base de Datos
  if (AppState.config && AppState.config.tema_config) {
    temaGuardado = typeof AppState.config.tema_config === 'string' 
      ? JSON.parse(AppState.config.tema_config) 
      : AppState.config.tema_config;
  }
  if (AppState.config && AppState.config.labels_config) {
    labelsGuardados = typeof AppState.config.labels_config === 'string'
      ? JSON.parse(AppState.config.labels_config)
      : AppState.config.labels_config;
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

  // Si el tema guardado correspondía al tema antiguo por defecto, actualizar al nuevo tema Zen Fresco
  if (temaGuardado && (temaGuardado.primaryColor === '#4f46e5' || temaGuardado.sidebarBg === '#0f172a' || temaGuardado.sidebarBg === '#2d2e2f')) {
    temaGuardado = { ...DEFAULT_THEME, ...THEME_PRESETS.zen_fresco };
    try { localStorage.setItem('sis_tema', JSON.stringify(temaGuardado)); } catch(e) {}
  }

  // Asegurar que la pestaña 8 quede con su nombre consolidado
  if (labelsGuardados && (labelsGuardados.tab_reportes === '10. Reportes & Balances' || !labelsGuardados.tab_reportes)) {
    labelsGuardados.tab_reportes = DEFAULT_LABELS.tab_reportes;
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

  // Sincronizar pickers
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
    pickerBtnKardex: tema.btnKardex || '#4f46e5',
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
  aplicarTema(AppState.temaActual);
}

function aplicarPresetTema(presetKey) {
  const preset = THEME_PRESETS[presetKey];
  if (!preset) return;
  AppState.temaActual = { ...preset };
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
        btn.classList.add('text-indigo-600', 'border-b-2', 'border-indigo-600');
        btn.classList.remove('text-slate-500');
      } else {
        btn.classList.remove('text-indigo-600', 'border-b-2', 'border-indigo-600');
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
    customTabCompras: labels.tab_compras,
    customTabProveedores: labels.tab_proveedores,
    customTabCxc: labels.tab_cxc,
    customTabCxp: labels.tab_cxp,
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
    btnCxp: document.getElementById('pickerBtnCxp')?.value || '#e11d48',
    btnDevoluciones: document.getElementById('pickerBtnDevoluciones')?.value || '#0891b2',
    btnKardex: document.getElementById('pickerBtnKardex')?.value || '#4f46e5',
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
    tab_compras: document.getElementById('customTabCompras').value.trim() || DEFAULT_LABELS.tab_compras,
    tab_proveedores: document.getElementById('customTabProveedores').value.trim() || DEFAULT_LABELS.tab_proveedores,
    tab_cxc: document.getElementById('customTabCxc').value.trim() || DEFAULT_LABELS.tab_cxc,
    tab_cxp: document.getElementById('customTabCxp')?.value.trim() || DEFAULT_LABELS.tab_cxp,
    tab_reportes: document.getElementById('customTabReportes').value.trim() || DEFAULT_LABELS.tab_reportes,
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

  const views = ['dashboard', 'categorias', 'productos', 'clientes', 'facturacion', 'devoluciones', 'compras', 'proveedores', 'cxc', 'cxp', 'reportes'];
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
  const mobItems = ['dashboard', 'facturacion', 'productos', 'reportes'];
  mobItems.forEach(m => {
    const mobBtn = document.getElementById(`mob-nav-${m}`);
    if (mobBtn) {
      if (m === viewName) {
        mobBtn.classList.add('active');
      } else {
        mobBtn.classList.remove('active');
      }
    }
  });

  // Acciones específicas al entrar a una vista
  if (viewName === 'dashboard') loadDashboard();
  if (viewName === 'categorias') loadCategorias();
  if (viewName === 'productos') loadProductos();
  if (viewName === 'clientes') loadClientes();
  if (viewName === 'proveedores') loadProveedores();
  if (viewName === 'facturacion') {
    populatePosSelectors();
    renderPosCatalog();
    renderPosCart();
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
}

// Sincronización Automática de Tasas Oficiales (BCV & TRM)
async function sincronizarTasasOficiales(silent = false) {
  const icon = document.getElementById('iconSyncTasas');
  const btn = document.getElementById('btnSyncTasasSidebar');
  if (icon) icon.classList.add('fa-spin');
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
    if (btn) btn.disabled = false;
  }
}

function openConfigModal() {
  const cfg = AppState.config;
  document.getElementById('cfgTasaVes').value = cfg.tasa_ves;
  document.getElementById('cfgTasaCop').value = cfg.tasa_cop;
  document.getElementById('cfgIva').value = cfg.iva_porcentaje;
  document.getElementById('cfgNombreNegocio').value = cfg.nombre_negocio;
  document.getElementById('cfgRif').value = cfg.documento_fiscal;
  document.getElementById('cfgTelefono').value = cfg.telefono;
  document.getElementById('cfgDireccion').value = cfg.direccion;
  document.getElementById('modalConfig').classList.remove('hidden');
}

function closeConfigModal() {
  document.getElementById('modalConfig').classList.add('hidden');
}

async function saveConfig(e) {
  e.preventDefault();
  const payload = {
    tasa_ves: parseFloat(document.getElementById('cfgTasaVes').value),
    tasa_cop: parseFloat(document.getElementById('cfgTasaCop').value),
    iva_porcentaje: parseFloat(document.getElementById('cfgIva').value),
    nombre_negocio: document.getElementById('cfgNombreNegocio').value,
    documento_fiscal: document.getElementById('cfgRif').value,
    telefono: document.getElementById('cfgTelefono').value,
    direccion: document.getElementById('cfgDireccion').value
  };

  try {
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      AppState.config = { ...AppState.config, ...payload };
      updateConfigUI();
      closeConfigModal();
      if (AppState.currentView === 'facturacion') updatePosTotals();
      alert('Configuración y tasas de cambio actualizadas correctamente.');
    }
  } catch (err) {
    alert('Error al guardar configuración: ' + err.message);
  }
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
  document.getElementById('prodStock').value = prod.stock;
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
      alert(`Existencias insuficientes para '${prod.nombre}'. Disponibles: ${prod.stock}`);
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

    tbody.innerHTML = facturas.map(f => `
      <tr class="hover:bg-slate-50 transition">
        <td class="py-2.5 px-3 font-mono font-bold text-slate-800">${escapeHtml(f.numero_factura)}</td>
        <td class="py-2.5 px-3 text-xs text-slate-500">${formatFecha(f.fecha)}</td>
        <td class="py-2.5 px-3 font-medium text-slate-700">${escapeHtml(f.cliente_nombre)}</td>
        <td class="py-2.5 px-3 font-bold text-indigo-700">$${parseFloat(f.total_usd).toFixed(2)}</td>
        <td class="py-2.5 px-3 text-xs text-slate-600">${parseFloat(f.total_ves).toFixed(2)} Bs.</td>
        <td class="py-2.5 px-3 text-xs text-slate-600">${Math.round(f.total_cop).toLocaleString('es-CO')} COP</td>
        <td class="py-2.5 px-3 text-right">
          <button onclick="verFacturaEmitida(${f.id})" class="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold">
            <i class="fa-solid fa-receipt mr-1"></i>Ver
          </button>
        </td>
      </tr>
    `).join('');
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

  tbody.innerHTML = list.map(d => `
    <tr class="hover:bg-slate-50 transition border-b border-slate-100">
      <td class="py-3 px-4 font-mono font-bold text-cyan-700">${escapeHtml(d.numero_devolucion)}</td>
      <td class="py-3 px-4 font-mono text-xs text-slate-600 font-semibold">${escapeHtml(d.numero_factura || 'Manual (Sin Factura)')}</td>
      <td class="py-3 px-4">
        <p class="font-bold text-slate-900">${escapeHtml(d.cliente_nombre || 'Consumidor Final')}</p>
        <p class="text-[11px] text-slate-400 font-mono">${escapeHtml(d.cliente_cedula || '-')}</p>
      </td>
      <td class="py-3 px-4 text-xs text-slate-500">${formatFecha(d.fecha_emision)}</td>
      <td class="py-3 px-4 text-xs text-slate-700 max-w-xs truncate">${escapeHtml(d.motivo)}</td>
      <td class="py-3 px-4 text-right font-black text-rose-600 font-mono">$${parseFloat(d.total_usd).toFixed(2)}</td>
      <td class="py-3 px-4 text-right font-mono text-xs text-slate-600">${parseFloat(d.total_ves || 0).toFixed(2)} Bs.</td>
      <td class="py-3 px-4 text-center">
        <button onclick="abrirTicketDevolucion(${d.id})" class="px-2.5 py-1 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 rounded-lg text-xs font-semibold shadow-sm transition">
          <i class="fa-solid fa-receipt mr-1"></i>Ver Ticket
        </button>
      </td>
    </tr>
  `).join('');
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
  window.print();
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
    if (containerPagos) containerPagos.classList.remove('hidden');
    if (containerCredito) containerCredito.classList.add('hidden');
  } else {
    if (btnCredito) btnCredito.className = "px-3 py-1 rounded-md text-xs font-bold bg-rose-600 text-white shadow-xs transition";
    if (btnContado) btnContado.className = "px-3 py-1 rounded-md text-xs font-bold text-slate-600 hover:text-slate-900 transition";
    if (containerPagos) containerPagos.classList.add('hidden');
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
      return `
        <tr class="hover:bg-slate-50 transition">
          <td class="py-2.5 px-3 font-mono font-bold text-slate-800">${escapeHtml(c.numero_control)}</td>
          <td class="py-2.5 px-3 text-xs text-slate-500">${formatFecha(c.fecha)}</td>
          <td class="py-2.5 px-3 font-medium text-slate-700">${escapeHtml(c.proveedor_nombre)}</td>
          <td class="py-2.5 px-3 font-bold text-blue-700">$${parseFloat(c.total).toFixed(2)}</td>
          <td class="py-2.5 px-3">
            ${tieneFoto ? `
              <button onclick="verFotoFacturaGuardada('${c.foto_factura}')" class="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg font-semibold hover:bg-indigo-100">
                <i class="fa-solid fa-image mr-1"></i>Ver Foto
              </button>
            ` : `<span class="text-xs text-slate-400">Sin foto</span>`}
          </td>
          <td class="py-2.5 px-3 text-right">
            <span class="text-xs text-emerald-600 font-semibold"><i class="fa-solid fa-check mr-1"></i>Stock cargado</span>
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
      closeProveedorModal();
      await loadProveedores();
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
// MÓDULO 7: CUENTAS POR COBRAR (CXC)
// ========================================================
async function loadCxc() {
  try {
    // 1. Cargar resumen
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

    // 2. Cargar listado
    const search = document.getElementById('cxcSearchInput')?.value.trim() || '';
    const estado = AppState.cxcFilterEstado || 'todos';

    const params = new URLSearchParams();
    if (estado !== 'todos') params.append('estado', estado);
    if (search) params.append('q', search);

    const resList = await fetch(`/api/cxc?${params.toString()}`);
    if (resList.ok) {
      AppState.cxc = await resList.json();
      renderCxcTable();
    }
  } catch (err) {
    console.error("Error al cargar cuentas por cobrar:", err);
  }
}

function filterCxcEstado(estado) {
  AppState.cxcFilterEstado = estado;
  ['todos', 'pendiente', 'vencida', 'pagada'].forEach(e => {
    const btn = document.getElementById(`cxcFilter-${e}`);
    if (btn) {
      if (e === estado) {
        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white';
      } else {
        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200';
      }
    }
  });
  loadCxc();
}

function renderCxcTable() {
  const tbody = document.getElementById('cxcTableBody');
  if (!tbody) return;

  if (AppState.cxc.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-8 text-slate-400">No hay cuentas por cobrar en este criterio.</td></tr>`;
    return;
  }

  tbody.innerHTML = AppState.cxc.map(c => {
    const esVencida = c.estado !== 'pagada' && new Date(c.fecha_vencimiento) < new Date(new Date().toDateString());
    
    let badgeEstado = '';
    if (c.estado === 'pagada') {
      badgeEstado = `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800"><i class="fa-solid fa-check mr-1"></i>Pagada</span>`;
    } else if (esVencida) {
      badgeEstado = `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800"><i class="fa-solid fa-clock-rotate-left mr-1"></i>Vencida</span>`;
    } else if (c.estado === 'parcial') {
      badgeEstado = `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800"><i class="fa-solid fa-hourglass-half mr-1"></i>Abono Parcial</span>`;
    } else {
      badgeEstado = `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800"><i class="fa-solid fa-clock mr-1"></i>Pendiente</span>`;
    }

    const saldoBs = (c.saldo_pendiente * AppState.config.tasa_ves).toFixed(2);

    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="py-3 px-4 font-mono font-bold text-slate-900">${escapeHtml(c.numero_factura)}</td>
        <td class="py-3 px-4">
          <p class="font-bold text-slate-800">${escapeHtml(c.cliente_nombre)}</p>
          <p class="text-xs text-slate-400 font-mono">${escapeHtml(c.cliente_cedula)}</p>
        </td>
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
        <td class="py-3 px-4 text-right space-x-1">
          ${c.saldo_pendiente > 0.001 ? `
            <button onclick="abrirModalAbonoCXC(${c.id})" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition shadow-xs">
              <i class="fa-solid fa-hand-holding-dollar mr-1"></i>Abonar
            </button>
          ` : `
            <span class="px-2 py-1 text-slate-400 text-xs font-semibold">Saldada</span>
          `}
          <button onclick="verHistorialAbonosCXC(${c.id})" class="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Ver Historial de Abonos">
            <i class="fa-solid fa-list-ul"></i>
          </button>
          <button onclick="enviarRecordatorioWhatsAppCXC(${c.id})" class="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Enviar Recordatorio por WhatsApp">
            <i class="fa-brands fa-whatsapp text-sm"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Modal de Abonos a Cuenta por Cobrar
async function abrirModalAbonoCXC(cxcId) {
  try {
    const res = await fetch(`/api/cxc/${cxcId}`);
    if (!res.ok) return;
    const c = await res.json();
    AppState.abonoCxcActual = c;

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
        monto: parseFloat(c.saldo_pendiente)
      }
    ];
    renderAbonoPagos();

    document.getElementById('modalAbonoCXC').classList.remove('hidden');
  } catch (err) {
    console.error("Error abriendo abono:", err);
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
    monto: montoAuto
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
      <div class="flex items-center space-x-2 bg-slate-50 p-2 rounded-xl border border-slate-200 text-xs">
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
      referencia: ''
    };
  });

  if (pagos.length === 0) {
    alert('Ingresa al menos un monto de abono mayor a cero.');
    return;
  }

  const notas = document.getElementById('abonoNotas')?.value.trim() || 'Abono a cuenta por cobrar';

  try {
    const res = await fetch(`/api/cxc/${c.id}/abonos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pagos, notas })
    });

    if (res.ok) {
      const data = await res.json();
      closeModalAbonoCXC();
      alert(`¡Abono de $${data.monto_abono_usd.toFixed(2)} registrado exitosamente!\nNuevo saldo pendiente: $${data.nuevo_saldo_pendiente.toFixed(2)}`);
      await loadCxc();
      await loadDashboard();
    } else {
      const err = await res.json();
      alert('Error registrando abono: ' + (err.error || 'No se pudo guardar'));
    }
  } catch (err) {
    alert('Error al registrar abono: ' + err.message);
  }
}

async function verHistorialAbonosCXC(cxcId) {
  try {
    const res = await fetch(`/api/cxc/${cxcId}`);
    if (!res.ok) return;
    const c = await res.json();
    const content = document.getElementById('historialAbonosContent');

    let html = `
      <div class="bg-indigo-50/70 p-3 rounded-xl border border-indigo-200 text-xs space-y-1">
        <p><strong>Factura:</strong> ${escapeHtml(c.numero_factura)} &bull; <strong>Cliente:</strong> ${escapeHtml(c.cliente_nombre)}</p>
        <p><strong>Total Factura:</strong> $${parseFloat(c.monto_total).toFixed(2)} &bull; <strong>Total Abonado:</strong> $${parseFloat(c.monto_pagado).toFixed(2)}</p>
        <p><strong>Saldo Pendiente:</strong> <span class="font-bold text-rose-700">$${parseFloat(c.saldo_pendiente).toFixed(2)}</span></p>
      </div>
    `;

    if (!c.abonos || c.abonos.length === 0) {
      html += `<p class="text-center py-6 text-slate-400 text-xs">No se han registrado abonos a esta cuenta.</p>`;
    } else {
      html += c.abonos.map((ab, idx) => `
        <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5">
          <div class="flex justify-between items-center">
            <span class="font-bold text-slate-800">Abono #${c.abonos.length - idx} &bull; ${formatFecha(ab.fecha)}</span>
            <strong class="text-emerald-700 font-extrabold text-sm">+$${parseFloat(ab.monto_usd).toFixed(2)}</strong>
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
      `).join('');
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
// MÓDULO 8: CUENTAS POR PAGAR (CXP)
// ========================================================
async function loadCxp() {
  try {
    // 1. Cargar resumen estadístico
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

    // 2. Cargar listado filtrado
    const search = document.getElementById('cxpSearchInput')?.value.trim() || '';
    const estado = AppState.cxpFilterEstado || 'todos';

    const params = new URLSearchParams();
    if (estado !== 'todos') params.append('estado', estado);
    if (search) params.append('q', search);

    const resList = await fetch(`/api/cxp?${params.toString()}`);
    if (resList.ok) {
      AppState.cxp = await resList.json();
      renderCxpTable();
    }
  } catch (err) {
    console.error("Error al cargar cuentas por pagar:", err);
  }
}

function filterCxpEstado(estado) {
  AppState.cxpFilterEstado = estado;
  ['todos', 'pendiente', 'parcial', 'vencida', 'pagada'].forEach(e => {
    const btn = document.getElementById(`cxpFilter-${e}`);
    if (btn) {
      if (e === estado) {
        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 text-white';
      } else {
        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200';
      }
    }
  });
  loadCxp();
}

function renderCxpTable() {
  const tbody = document.getElementById('cxpTableBody');
  if (!tbody) return;

  if (AppState.cxp.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center py-8 text-slate-400">No hay cuentas por pagar en este criterio.</td></tr>`;
    return;
  }

  tbody.innerHTML = AppState.cxp.map(c => {
    const diasVenc = parseInt(c.dias_vencido) || 0;
    const esVencida = c.estado !== 'pagada' && diasVenc > 0;

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

    const saldoBs = parseFloat(c.saldo_ves || 0).toLocaleString('es-VE');
    const saldoCop = Math.round(c.saldo_cop || 0).toLocaleString('es-CO');

    const plazoHtml = esVencida 
      ? `<span class="text-rose-600 font-bold text-xs"><i class="fa-solid fa-triangle-exclamation mr-1"></i>Vencida (${diasVenc} d)</span>`
      : `<span class="text-slate-600 text-xs">${c.fecha_vencimiento}</span>`;

    const badgeTipo = c.tipo_registro === 'directo'
      ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">Gasto Directo</span>`
      : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">Compra Stock</span>`;

    const waPhone = (c.proveedor_telefono || '').replace(/[^0-9]/g, '');

    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="py-3 px-4 font-mono font-bold text-slate-900 text-xs">
          <p>${escapeHtml(c.numero_factura || '-')}</p>
          <span class="text-[10px] text-slate-400 font-sans font-normal">${escapeHtml(c.descripcion_concepto || 'Compra de mercancía')}</span>
        </td>
        <td class="py-3 px-4">
          <p class="font-bold text-slate-800 text-xs">${escapeHtml(c.proveedor_nombre)}</p>
          <p class="text-[11px] text-slate-400 font-mono">${escapeHtml(c.proveedor_cedula || '')}</p>
        </td>
        <td class="py-3 px-4">${badgeTipo}</td>
        <td class="py-3 px-4 text-xs text-slate-500">${formatFecha(c.fecha_emision)}</td>
        <td class="py-3 px-4 text-xs">${plazoHtml}</td>
        <td class="py-3 px-4 font-bold text-slate-700 text-xs">$${parseFloat(c.monto_total).toFixed(2)}</td>
        <td class="py-3 px-4 font-medium text-emerald-700 text-xs">$${parseFloat(c.monto_pagado).toFixed(2)}</td>
        <td class="py-3 px-4">
          <span class="font-black text-xs text-rose-600 block">$${parseFloat(c.saldo_pendiente).toFixed(2)}</span>
          <span class="text-[10px] text-slate-400">≈ ${saldoBs} Bs. | ${saldoCop} COP</span>
        </td>
        <td class="py-3 px-4 text-center">${badgeEstado}</td>
        <td class="py-3 px-4 text-right space-x-1 whitespace-nowrap">
          ${c.saldo_pendiente > 0.001 ? `
            <button onclick="abrirModalAbonoCXP(${c.id})" class="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition shadow-xs">
              <i class="fa-solid fa-money-bill-transfer mr-1"></i>Pagar
            </button>
          ` : `
            <span class="px-2 py-1 text-slate-400 text-xs font-semibold">Saldada</span>
          `}
          <button onclick="verHistorialAbonosCXP(${c.id})" class="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg text-xs" title="Historial de Pagos">
            <i class="fa-solid fa-clock-rotate-left"></i>
          </button>
          ${waPhone ? `
            <button onclick="enviarRecordatorioWhatsAppCXP(${c.id})" class="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg text-xs" title="Contactar Proveedor por WhatsApp">
              <i class="fa-brands fa-whatsapp"></i>
            </button>
          ` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

// Modal de Gasto Directo a Proveedor
function abrirModalDirectoCXP() {
  const pSelect = document.getElementById('cxpDirectoProveedor');
  if (pSelect) {
    pSelect.innerHTML = `<option value="">-- Seleccionar Proveedor --</option>` +
      AppState.proveedores.map(p => `
        <option value="${p.id}">${escapeHtml(p.nombre)} (${escapeHtml(p.cedula)})</option>
      `).join('');
  }

  document.getElementById('cxpDirectoConcepto').value = '';
  document.getElementById('cxpDirectoNumFactura').value = '';
  document.getElementById('cxpDirectoMonto').value = '';
  document.getElementById('cxpDirectoNotas').value = '';

  const today = new Date().toISOString().split('T')[0];
  document.getElementById('cxpDirectoFechaEmision').value = today;
  const dVenc = new Date();
  dVenc.setDate(dVenc.getDate() + 15);
  document.getElementById('cxpDirectoFechaVencimiento').value = dVenc.toISOString().split('T')[0];

  actualizarEquivalenciasCxpDirecto();
  document.getElementById('modalDirectoCXP').classList.remove('hidden');
}

function closeModalDirectoCXP() {
  document.getElementById('modalDirectoCXP').classList.add('hidden');
}

function actualizarEquivalenciasCxpDirecto() {
  const monto = parseFloat(document.getElementById('cxpDirectoMonto')?.value) || 0;
  const bs = (monto * AppState.config.tasa_ves).toFixed(2);
  const cop = Math.round(monto * AppState.config.tasa_cop).toLocaleString('es-CO');

  const elBs = document.getElementById('cxpDirectoMontoBs');
  if (elBs) elBs.textContent = `${parseFloat(bs).toLocaleString('es-VE')} Bs.`;
  const elCop = document.getElementById('cxpDirectoMontoCop');
  if (elCop) elCop.textContent = `${cop} COP`;
}

async function guardarDirectoCXP(e) {
  e.preventDefault();
  const provId = document.getElementById('cxpDirectoProveedor').value;
  const concepto = document.getElementById('cxpDirectoConcepto').value.trim();
  const numFactura = document.getElementById('cxpDirectoNumFactura').value.trim();
  const monto = parseFloat(document.getElementById('cxpDirectoMonto').value) || 0;
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
  if (!fechaVencimiento) {
    alert('Ingrese la fecha de vencimiento.');
    return;
  }

  const payload = {
    proveedor_id: parseInt(provId),
    descripcion_concepto: concepto,
    numero_factura: numFactura,
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
      loadCxp();
      loadDashboard();
    } else {
      const err = await res.json();
      alert('Error: ' + (err.error || 'No se pudo guardar la cuenta'));
    }
  } catch (err) {
    alert('Error de conexión: ' + err.message);
  }
}

// Modal de Abonos a Cuenta por Pagar
async function abrirModalAbonoCXP(cxpId) {
  try {
    const res = await fetch(`/api/cxp/${cxpId}`);
    if (!res.ok) return;
    const c = await res.json();
    AppState.abonoCxpActual = c;

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
        monto: parseFloat(c.saldo_pendiente)
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
    monto: montoAuto
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
      <div class="flex items-center space-x-2 bg-slate-50 p-2 rounded-xl border border-slate-200 text-xs">
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
      referencia: ''
    };
  });

  if (pagos.length === 0) {
    alert('Ingresa al menos un monto de pago mayor a cero.');
    return;
  }

  const payload = {
    pagos: pagos,
    notas: document.getElementById('abonoCxpNotas').value.trim()
  };

  try {
    const res = await fetch(`/api/cxp/${c.id}/abonos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      alert('¡Pago / Abono registrado exitosamente!');
      closeModalAbonoCXP();
      loadCxp();
      loadDashboard();
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

    let html = `
      <div class="bg-rose-50/70 p-3 rounded-xl border border-rose-200 text-xs space-y-1">
        <p><strong>Proveedor:</strong> ${escapeHtml(c.proveedor_nombre)} &bull; <strong>Doc:</strong> ${escapeHtml(c.numero_factura || '-')}</p>
        <p><strong>Concepto:</strong> ${escapeHtml(c.descripcion_concepto || 'Compra de mercancía')}</p>
        <p><strong>Total:</strong> $${parseFloat(c.monto_total).toFixed(2)} &bull; <strong>Pagado:</strong> $${parseFloat(c.monto_pagado).toFixed(2)}</p>
        <p><strong>Saldo Pendiente:</strong> <span class="font-bold text-rose-700">$${parseFloat(c.saldo_pendiente).toFixed(2)}</span></p>
      </div>
    `;

    if (!c.abonos || c.abonos.length === 0) {
      html += `<p class="text-center py-6 text-slate-400 text-xs">No se han registrado pagos para esta cuenta.</p>`;
    } else {
      html += c.abonos.map((ab, idx) => `
        <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5">
          <div class="flex justify-between items-center">
            <span class="font-bold text-slate-800">Pago #${c.abonos.length - idx} &bull; ${formatFecha(ab.fecha)}</span>
            <strong class="text-rose-700 font-extrabold text-sm">-$${parseFloat(ab.monto_usd).toFixed(2)}</strong>
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
      `).join('');
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
  if (tabName === 'kardex') loadReporteKardex();
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
        <td class="py-2.5 px-4 text-right space-x-1">
          <button onclick="enviarRecordatorioWhatsAppCXC(${c.id})" class="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Recordar por WhatsApp">
            <i class="fa-brands fa-whatsapp text-sm"></i>
          </button>
          ${saldo > 0.001 ? `
            <button onclick="abrirModalAbonoCXC(${c.id})" class="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold">
              Abonar
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
        <td class="py-2.5 px-4 text-right whitespace-nowrap">
          ${sal > 0.001 ? `
            <button onclick="navigate('cxp'); abrirModalAbonoCXP(${c.id});" class="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold">
              Pagar
            </button>
          ` : '<span class="text-slate-400 text-xs">-</span>'}
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
