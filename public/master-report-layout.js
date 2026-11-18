/**
 * ==============================================================================
 * MASTER REPORT LAYOUT & CORPORATE BRANDING ENGINE — TAVO CLOUD
 * ==============================================================================
 * Arquitectura de Plantilla Maestra para renderizado de documentos impresos 
 * (Facturas, Pedidos, Catálogos de Productos, Tickets Térmicos POS 80mm).
 * 
 * Reglas Multi-Tenant & Parametrización:
 * 1. Encabezado 100% Tenant Branding (Logo, Nombre, RIF, Tel, Dirección).
 * 2. Cero mención a "TAVO CLOUD" en el encabezado principal del cliente.
 * 3. Mención SaaS discreta únicamente en el pie de página (Footer).
 * 4. Parametrización dinámica por Tenant:
 *    - color_primario (Inyectado en encabezados de tabla A4)
 *    - mostrar_sku, mostrar_vendedor, mostrar_descuento_linea (Renderizado condicional)
 *    - logo_alineacion ('izquierda', 'centro', 'derecha')
 *    - texto_footer_factura, texto_header_ticket, texto_footer_ticket
 * ==============================================================================
 */

(function (global) {
  'use strict';

  const MasterReportLayout = {
    // Configuración por defecto estándar
    defaultPrintConfig: {
      color_primario: '#0f172a',
      mostrar_sku: true,
      mostrar_vendedor: true,
      mostrar_descuento_linea: true,
      logo_alineacion: 'centro',
      texto_footer_factura: 'Gracias por su compra. Conserve esta factura como comprobante de garantía.',
      texto_header_ticket: '*** COMPROBANTE DE COMPRA ***',
      texto_footer_ticket: '*** GRACIAS POR SU PREFERENCIA ***'
    },

    activePrintConfig: null,

    /**
     * Carga asíncrona de la configuración de impresión desde la API REST.
     */
    cargarConfigImpresion: async function () {
      try {
        const res = await fetch('/api/configuracion/impresion');
        if (res.ok) {
          const data = await res.json();
          this.activePrintConfig = Object.assign({}, this.defaultPrintConfig, data.config || data);
          return this.activePrintConfig;
        }
      } catch (e) {
        console.warn('[MasterReportLayout] Usando configuración de impresión por defecto:', e);
      }
      this.activePrintConfig = Object.assign({}, this.defaultPrintConfig);
      return this.activePrintConfig;
    },

    /**
     * Retorna la configuración activa o por defecto.
     */
    getPrintConfig: function (customConfig) {
      return Object.assign({}, this.defaultPrintConfig, this.activePrintConfig || {}, customConfig || {});
    },

    /**
     * Extrae iniciales alfanuméricas limpias de cualquier texto o nombre.
     */
    getIniciales: function (str) {
      if (!str || typeof str !== 'string') return 'TC';
      const clean = str.replace(/[^a-zA-Z0-9\s]/g, '').trim();
      const parts = clean.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return clean.substring(0, 2).toUpperCase() || 'TC';
    },

    /**
     * Escapa caracteres HTML para prevenir inyección de código.
     */
    escapeHtml: function (text) {
      if (text === null || text === undefined) return '';
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    },

    /**
     * Renderiza el Encabezado Corporativo Maestro (100% Tenant Branding).
     * @param {Object} tenant Datos de la empresa.
     * @param {Object} meta Metadatos del documento.
     * @param {Object} printConfig Configuración de impresión (alineación, etc.).
     */
    renderHeader: function (tenant, meta, printConfig) {
      const t = tenant || {};
      const m = meta || {};
      const pCfg = this.getPrintConfig(printConfig);
      const esc = this.escapeHtml;

      const nombre = (t.nombre_negocio || 'Mi Empresa Comercial').trim();
      const rif = t.documento_fiscal ? `RIF / NIT: ${esc(t.documento_fiscal)}` : '';
      const telefono = t.telefono ? `Tel: ${esc(t.telefono)}` : '';
      const direccion = t.direccion ? esc(t.direccion) : '';

      const tipoDoc = esc(m.tipo || 'DOCUMENTO OFICIAL');
      const subtituloDoc = esc(m.subtitulo || 'Lista Oficial de Precios en Dólares ($ USD)');
      const numeroDoc = m.numero ? `N° ${esc(m.numero)}` : '';
      const fechaDoc = m.fecha ? esc(m.fecha) : new Date().toLocaleDateString('es-VE');
      const monedaDoc = esc(m.moneda || 'Dólares ($ USD)');

      // Logo del Tenant o Avatar Tipográfico Limpio
      let logoHtml = '';
      if (t.logo_url) {
        logoHtml = `
          <div class="tenant-logo-wrapper flex items-center justify-center shrink-0">
            <img src="${esc(t.logo_url)}" alt="${esc(nombre)}" class="h-12 max-h-12 max-w-[170px] object-contain">
          </div>
        `;
      } else {
        const iniciales = this.getIniciales(nombre);
        logoHtml = `
          <div class="tenant-avatar w-12 h-12 rounded-lg bg-slate-900 text-white font-black flex items-center justify-center text-xl tracking-tight shrink-0 shadow-xs">
            ${iniciales}
          </div>
        `;
      }

      const contactoParts = [telefono, direccion].filter(Boolean).join(' &bull; ');

      // Manejo de alineación de logo según configuración (izquierda, centro, derecha)
      const alineacion = pCfg.logo_alineacion || 'centro';
      let layoutClases = 'flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3';
      let infoClases = 'flex items-center space-x-3.5';

      if (alineacion === 'centro') {
        layoutClases = 'flex flex-col items-center text-center justify-between gap-3 sm:flex-row sm:text-left';
      } else if (alineacion === 'derecha') {
        infoClases = 'flex items-center space-x-3.5 flex-row-reverse space-x-reverse';
      }

      return `
        <header class="master-header w-full border-b-2 border-slate-900 pb-3 mb-4 ${layoutClases}">
          <!-- Identidad Corporativa del Tenant -->
          <div class="${infoClases}">
            ${logoHtml}
            <div>
              <h1 class="text-lg sm:text-xl font-black text-slate-900 uppercase tracking-tight leading-tight">
                ${esc(nombre)}
              </h1>
              ${rif ? `<div class="text-xs font-semibold text-slate-700 font-mono leading-snug">${rif}</div>` : ''}
              ${contactoParts ? `<div class="text-[11px] text-slate-500 leading-tight">${contactoParts}</div>` : ''}
            </div>
          </div>

          <!-- Metadatos y Tipo de Documento -->
          <div class="text-left sm:text-right shrink-0">
            <div class="inline-block bg-slate-900 text-white text-[11px] font-black px-3 py-1 rounded-md uppercase tracking-wider">
              ${tipoDoc} ${numeroDoc}
            </div>
            <div class="text-[11px] font-semibold text-slate-700 mt-1">
              ${subtituloDoc}
            </div>
            <div class="text-[10px] text-slate-500 font-medium">
              Emisión: <strong class="text-slate-700">${fechaDoc}</strong> &bull; Moneda: <strong>${monedaDoc}</strong>
            </div>
          </div>
        </header>
      `;
    },

    /**
     * Renderiza el Pie de Página Maestro con atribución SaaS discreta.
     */
    renderFooter: function (tenant, printConfig) {
      const t = tenant || {};
      const pCfg = this.getPrintConfig(printConfig);
      const esc = this.escapeHtml;
      const nombre = (t.nombre_negocio || 'Mi Empresa Comercial').trim();
      const telefono = t.telefono ? `Tel: ${esc(t.telefono)}` : '';
      const direccion = t.direccion ? esc(t.direccion) : '';
      const contacto = [telefono, direccion].filter(Boolean).join(' &bull; ');
      const textoFooterCustom = esc(pCfg.texto_footer_factura || 'Gracias por su compra. Conserve esta factura como comprobante de garantía.');

      return `
        <footer class="master-footer w-full border-t border-slate-200 pt-3 mt-6 text-xs text-slate-500 break-inside-avoid page-break-inside-avoid">
          <div class="mb-2 text-center text-slate-700 font-medium text-[11px]">
            ${textoFooterCustom}
          </div>
          <div class="flex flex-col sm:flex-row items-center justify-between gap-1 text-[11px] text-slate-500 border-t border-slate-100 pt-1.5">
            <div>
              <strong class="text-slate-700 uppercase">${esc(nombre)}</strong> &bull; Documento Oficial.
            </div>
            ${contacto ? `<div class="text-slate-400">${contacto}</div>` : ''}
          </div>
          <!-- Atribución Discreta SaaS Requerida -->
          <div class="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-center text-[10px] text-slate-400">
            <span>Generado por <span class="font-bold text-slate-600">TAVO CLOUD</span> | <a href="https://www.tavocloud.com" target="_blank" rel="noopener" class="hover:underline text-slate-500">www.tavocloud.com</a></span>
          </div>
        </footer>
      `;
    },

    /**
     * Renderiza el separador visual de sección para categorías.
     */
    renderCategorySeparator: function (categoriaNombre, totalItems) {
      const esc = this.escapeHtml;
      const nombre = esc(categoriaNombre || 'General');
      const count = Number(totalItems || 0);

      return `
        <div class="categoria-separator w-full bg-slate-100 border-l-4 border-slate-800 px-4 py-2.5 rounded-r-md flex items-center justify-between my-4 break-inside-avoid page-break-inside-avoid page-break-after-avoid">
          <div class="flex items-center space-x-2.5">
            <span class="w-2 h-2 rounded-full bg-slate-700"></span>
            <h2 class="text-sm sm:text-base font-bold text-slate-800 uppercase tracking-wide leading-none">
              ${nombre}
            </h2>
          </div>
          <span class="text-xs font-semibold text-slate-600 bg-white px-2.5 py-0.5 rounded-full border border-slate-200">
            ${count} ${count === 1 ? 'ítem' : 'ítems'}
          </span>
        </div>
      `;
    },

    /**
     * Renderiza una tarjeta de producto en formato Grid corporativo.
     */
    renderProductCard: function (producto, opciones) {
      const p = producto || {};
      const opts = opciones || {};
      const esc = this.escapeHtml;

      const codigo = esc(p.codigo || 'S/C');
      const nombre = esc(p.nombre || 'Producto');
      const descripcion = p.descripcion ? esc(p.descripcion) : '';
      const precioNum = Number(p.precio_total || p.precio_base || 0);
      const precio = precioNum.toFixed(2);
      const stock = Number(p.stock_disponible !== undefined ? p.stock_disponible : p.stock || 0);

      let fotoHtml = '';
      if (p.imagen) {
        fotoHtml = `<img src="${esc(p.imagen)}" alt="${nombre}" class="w-full h-full object-cover">`;
      } else {
        const iniciales = this.getIniciales(nombre);
        fotoHtml = `
          <div class="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-400">
            <div class="w-12 h-12 rounded-full bg-slate-200/80 text-slate-600 font-bold flex items-center justify-center text-sm tracking-wider uppercase mb-1">
              ${iniciales}
            </div>
            <span class="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Sin Imagen</span>
          </div>
        `;
      }

      let stockHtml = '';
      if (opts.mostrarStock) {
        stockHtml = stock > 0
          ? `<span class="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Disp: ${stock}</span>`
          : `<span class="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">Agotado</span>`;
      }

      let waButtonHtml = '';
      if (opts.botonWhatsapp) {
        waButtonHtml = `
          <button type="button" onclick="pedirProductoPorWhatsApp('${codigo}', '${encodeURIComponent(p.nombre || '')}', '${precio}')" 
                  class="no-print p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition text-xs font-bold border border-emerald-200 cursor-pointer" 
                  title="Consultar por WhatsApp">
            <i class="fa-brands fa-whatsapp text-sm"></i>
          </button>
        `;
      }

      return `
        <div class="catalogo-card bg-white rounded-md border border-slate-200 overflow-hidden flex flex-col justify-between shadow-xs transition hover:shadow-md">
          <div class="w-full h-40 sm:h-44 bg-slate-50 relative overflow-hidden border-b border-slate-100 flex items-center justify-center">
            ${fotoHtml}
          </div>
          <div class="p-3.5 flex flex-col flex-1 justify-between space-y-2.5">
            <div>
              <div class="flex items-center justify-between">
                <span class="text-xs font-mono font-medium text-gray-500">${codigo}</span>
                ${stockHtml}
              </div>
              <h3 class="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug mt-1" title="${nombre}">
                ${nombre}
              </h3>
              ${descripcion ? `<p class="text-[11px] text-gray-500 line-clamp-1 mt-1">${descripcion}</p>` : ''}
            </div>
            <div class="pt-2 border-t border-slate-100 flex items-center justify-between">
              <div>
                <span class="text-[9px] uppercase font-bold text-gray-400 block leading-tight">Precio USD</span>
                <span class="text-lg font-bold text-gray-900 leading-tight">$${precio}</span>
              </div>
              ${waButtonHtml}
            </div>
          </div>
        </div>
      `;
    },

    /**
     * Agrupa un arreglo de productos por su categoría usando Array.prototype.reduce.
     */
    groupByCategory: function (productos) {
      if (!Array.isArray(productos)) return [];
      const map = productos.reduce(function (acc, p) {
        const cat = (p.categoria_nombre || 'General').trim();
        if (!acc[cat]) {
          acc[cat] = {
            categoria_id: p.categoria_id,
            categoria_nombre: cat,
            productos: []
          };
        }
        acc[cat].productos.push(p);
        return acc;
      }, {});

      return Object.values(map)
        .sort((a, b) => a.categoria_nombre.localeCompare(b.categoria_nombre, 'es', { sensitivity: 'base' }))
        .map(group => {
          group.productos.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }));
          return group;
        });
    },

    // ==============================================================================
    // DIRECTIVA 4: PLANTILLA PARAMETRIZADA DE FACTURA / PEDIDO (HOJA A4 / CARTA)
    // ==============================================================================
    renderFacturaA4: function (factura, configTenant, configImpresion) {
      const f = factura || {};
      const cfg = configTenant || {};
      const pCfg = this.getPrintConfig(configImpresion);
      const esc = this.escapeHtml;

      const isAnulada = String(f.estado).toLowerCase() === 'anulada';
      const isCredito = String(f.tipo_venta).toLowerCase() === 'credito';
      const colorPrimario = pCfg.color_primario || '#0f172a';
      const alineacionLogo = pCfg.logo_alineacion || 'centro';

      // 1. Banner Anulada
      let anuladaBanner = '';
      if (isAnulada) {
        anuladaBanner = `
          <div style="background: #fef2f2; border: 2px dashed #dc2626; color: #dc2626; padding: 8px; text-align: center; font-weight: 900; font-size: 13px; margin-bottom: 12px; letter-spacing: 1px;">
            *** DOCUMENTO ANULADO &bull; SIN VALIDEZ FISCAL NI COMERCIAL ***
          </div>
        `;
      }

      // 2. Encabezado con alineación dinámica de logo
      const nombreEmpresa = (cfg.nombre_negocio || 'Mi Empresa Comercial').trim();
      let logoHtml = '';
      if (cfg.logo_url) {
        logoHtml = `<img src="${esc(cfg.logo_url)}" alt="${esc(nombreEmpresa)}" style="max-height: 54px; max-width: 170px; object-fit: contain;">`;
      } else {
        const iniciales = this.getIniciales(nombreEmpresa);
        logoHtml = `
          <div style="width: 48px; height: 48px; border-radius: 8px; background: ${colorPrimario}; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 20px;">
            ${iniciales}
          </div>
        `;
      }

      let headerFlexAlign = 'justify-content: space-between; align-items: center;';
      if (alineacionLogo === 'centro') {
        headerFlexAlign = 'justify-content: space-between; align-items: center;';
      }

      let headerHtml = `
        <div class="doc-header" style="display: flex; ${headerFlexAlign} border-bottom: 2px solid ${colorPrimario}; padding-bottom: 12px; margin-bottom: 14px;">
          <div style="display: flex; align-items: center; gap: 14px; max-width: 60%;">
            ${logoHtml}
            <div>
              <h1 style="margin: 0; font-size: 19px; font-weight: 900; color: #0f172a; text-transform: uppercase; letter-spacing: -0.3px; line-height: 1.15;">
                ${esc(nombreEmpresa)}
              </h1>
              ${cfg.documento_fiscal ? `<p style="margin: 2px 0; font-size: 11px; font-weight: bold; color: #475569; font-family: monospace;">RIF / NIT: ${esc(cfg.documento_fiscal)}</p>` : ''}
              ${cfg.direccion ? `<p style="margin: 2px 0; font-size: 10.5px; color: #64748b;">${esc(cfg.direccion)}</p>` : ''}
              ${cfg.telefono ? `<p style="margin: 2px 0; font-size: 10.5px; color: #64748b;">Tel: ${esc(cfg.telefono)}</p>` : ''}
            </div>
          </div>
          <div style="text-align: right;">
            <div style="display: inline-block; background: ${colorPrimario}; color: #ffffff; padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">
              FACTURA DE VENTA
            </div>
            <div style="font-size: 15px; font-weight: 900; font-family: monospace; color: #0f172a; margin-top: 4px;">
              N° ${esc(f.numero_factura || '000000')}
            </div>
            <div style="margin-top: 4px; font-size: 10px; color: #475569; line-height: 1.4;">
              <p style="margin: 0;"><strong>Emisión:</strong> ${esc(f.fecha || new Date().toLocaleDateString('es-VE'))}</p>
              <p style="margin: 0;"><strong>Condición:</strong> <span style="font-weight: 800; ${isCredito ? 'color: #b45309;' : 'color: #047857;'}">${isCredito ? 'A CRÉDITO' : 'AL CONTADO'}</span></p>
            </div>
          </div>
        </div>
      `;

      // 3. Ficha de Cliente y Vendedor (Condicional)
      let vendedorCardHtml = '';
      if (pCfg.mostrar_vendedor && (f.vendedor_nombre || f.usuario_nombre)) {
        vendedorCardHtml = `<div><strong style="color: #64748b;">Vendedor:</strong> <span style="font-weight: 600; color: #0f172a;">${esc(f.vendedor_nombre || f.usuario_nombre)}</span></div>`;
      }

      let clientCardHtml = `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; display: grid; grid-template-columns: 2fr 1.5fr; gap: 12px;">
          <div>
            <span style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #64748b; display: block; margin-bottom: 2px;">Cliente / Razón Social</span>
            <strong style="font-size: 13px; color: #0f172a;">${esc(f.cliente_nombre || 'Consumidor Final')}</strong>
            ${f.cliente_direccion ? `<p style="margin: 2px 0 0 0; font-size: 10px; color: #64748b;">${esc(f.cliente_direccion)}</p>` : ''}
          </div>
          <div style="display: grid; grid-template-columns: 1fr; gap: 2px; font-size: 11px;">
            <div><strong style="color: #64748b;">Cédula / RIF:</strong> <span style="font-family: monospace; font-weight: 600;">${esc(f.cliente_cedula || '-')}</span></div>
            <div><strong style="color: #64748b;">Teléfono:</strong> <span>${esc(f.cliente_telefono || '-')}</span></div>
            ${vendedorCardHtml}
          </div>
        </div>
      `;

      // 4. Renderizado Condicional de Columnas en Tabla de Ítems
      const detalles = f.detalles || f.items || [];
      let rowsHtml = '';

      detalles.forEach((d, idx) => {
        const num = idx + 1;
        const codigo = esc(d.codigo || '—');
        const nombre = esc(d.nombre || d.nombre_producto || 'Producto');
        const cant = parseFloat(d.cantidad || 0).toFixed(2);
        const pu = parseFloat(d.precio_unitario || 0).toFixed(2);
        const imp = d.impuesto_tipo === 'gravado' ? '16%' : 'Exento';
        const tot = parseFloat(d.total || 0).toFixed(2);
        const descuento = parseFloat(d.descuento || d.descuento_porcentaje || 0);

        // Columnas Condicionales en TD
        const skuTd = pCfg.mostrar_sku 
          ? `<td style="font-family: monospace; font-size: 9.5px; font-weight: 600; color: #475569; padding: 6px 8px;">${codigo}</td>` 
          : '';

        const vendedorTd = pCfg.mostrar_vendedor 
          ? `<td style="text-align: center; font-size: 9.5px; color: #64748b; padding: 6px;">${esc(f.vendedor_nombre || 'Principal')}</td>` 
          : '';

        const descuentoTd = pCfg.mostrar_descuento_linea 
          ? `<td style="text-align: right; font-size: 10px; color: ${descuento > 0 ? '#b91c1c' : '#64748b'}; padding: 6px;">${descuento > 0 ? descuento + '%' : '0%'}</td>` 
          : '';

        rowsHtml += `
          <tr style="border-bottom: 1px solid #f1f5f9; page-break-inside: avoid; break-inside: avoid;">
            <td style="text-align: center; color: #94a3b8; font-family: monospace; font-size: 9px; padding: 6px 4px;">${num}</td>
            ${skuTd}
            <td style="padding: 6px 8px;">
              <strong style="color: #0f172a; font-size: 11px;">${nombre}</strong>
              ${d.descripcion ? `<div style="font-size: 9px; color: #64748b;">${esc(d.descripcion)}</div>` : ''}
            </td>
            ${vendedorTd}
            <td style="text-align: right; font-weight: 600; padding: 6px 8px; font-size: 11px;">${cant}</td>
            <td style="text-align: right; font-family: monospace; padding: 6px 8px; font-size: 11px;">$${pu}</td>
            ${descuentoTd}
            <td style="text-align: center; font-size: 9.5px; color: #475569; padding: 6px 8px;">${imp}</td>
            <td style="text-align: right; font-family: monospace; font-weight: 800; color: #0f172a; padding: 6px 8px; font-size: 11px;">$${tot}</td>
          </tr>
        `;
      });

      // Encabezados Condicionales en TH (Con color primario dinámico)
      const skuTh = pCfg.mostrar_sku ? `<th style="width: 14%; text-align: left; padding: 7px 8px;">Código SKU</th>` : '';
      const vendedorTh = pCfg.mostrar_vendedor ? `<th style="width: 12%; text-align: center; padding: 7px 6px;">Vendedor</th>` : '';
      const descuentoTh = pCfg.mostrar_descuento_linea ? `<th style="width: 9%; text-align: right; padding: 7px 6px;">Desc (%)</th>` : '';

      let tableHtml = `
        <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; margin-bottom: 14px;">
          <thead>
            <tr style="background-color: ${colorPrimario}; color: #ffffff; text-transform: uppercase; font-size: 9.5px; letter-spacing: 0.5px;">
              <th style="width: 4%; text-align: center; padding: 7px 4px;">#</th>
              ${skuTh}
              <th style="text-align: left; padding: 7px 8px;">Descripción</th>
              ${vendedorTh}
              <th style="width: 8%; text-align: right; padding: 7px 8px;">Cant</th>
              <th style="width: 12%; text-align: right; padding: 7px 8px;">P. Unit ($)</th>
              ${descuentoTh}
              <th style="width: 8%; text-align: center; padding: 7px 8px;">IVA</th>
              <th style="width: 13%; text-align: right; padding: 7px 8px;">Total ($)</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      `;

      // 5. Totales y Pagos
      const subtotal = parseFloat(f.subtotal || 0).toFixed(2);
      const iva = parseFloat(f.iva_total || 0).toFixed(2);
      const totalUsd = parseFloat(f.total_usd || 0).toFixed(2);

      let totalsHtml = `
        <div style="display: flex; justify-content: flex-end; margin-bottom: 14px;">
          <div style="width: 260px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; font-size: 11px;">
            <div style="display: flex; justify-content: space-between; padding: 2px 0; color: #475569;">
              <span>Subtotal:</span>
              <strong style="font-family: monospace;">$${subtotal}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 2px 0; color: #475569;">
              <span>IVA (16%):</span>
              <strong style="font-family: monospace;">$${iva}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 6px 0 2px 0; border-top: 2px solid ${colorPrimario}; margin-top: 4px; font-size: 13px; font-weight: 900; color: #0f172a;">
              <span>TOTAL USD:</span>
              <span style="font-family: monospace;">$${totalUsd}</span>
            </div>
          </div>
        </div>
      `;

      // 6. Pie de Página con texto parametrizado y crédito discreto
      let footerHtml = `
        <div class="master-footer" style="border-top: 1px solid #e2e8f0; padding-top: 10px; margin-top: 14px; font-size: 9.5px; color: #64748b; break-inside: avoid; page-break-inside: avoid;">
          <div style="text-align: center; font-weight: 600; color: #334155; margin-bottom: 6px;">
            ${esc(pCfg.texto_footer_factura)}
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 8.5px; color: #94a3b8; border-top: 1px solid #f1f5f9; pt: 4px;">
            <div>${esc(nombreEmpresa)} &bull; Sistema Comercial</div>
            <div>Generado por <strong style="color: #64748b;">TAVO CLOUD</strong> | www.tavocloud.com</div>
          </div>
        </div>
      `;

      return `
        <div class="doc-sheet doc-letterPortrait" style="width: 780px; box-sizing: border-box; padding: 20px 24px; background: #FFFFFF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a;">
          ${anuladaBanner}
          ${headerHtml}
          ${clientCardHtml}
          ${tableHtml}
          ${totalsHtml}
          ${footerHtml}
        </div>
      `;
    },

    // ==============================================================================
    // DIRECTIVA 5: SALIDA PARA IMPRESORA TÉRMICA POS (80MM MONOCROMÁTICA MONOSPACE)
    // ==============================================================================

    // ==============================================================================
    // DIRECTIVA 6: REPORTE DE CIERRE DE CAJA & ARQUEO Z (ESTÁNDAR ERP A4 / CARTA)
    // ==============================================================================
    renderReporteCierreZA4: function (reporteZ, configTenant, configImpresion) {
      const rep = reporteZ || {};
      const t = rep.turno || {};
      const esp = (rep.esperados && rep.esperados.por_metodo) ? rep.esperados.por_metodo : {};
      const dec = (rep.declarados && rep.declarados.por_metodo) ? rep.declarados.por_metodo : {};
      const difs = (rep.diferencias && rep.diferencias.por_metodo) ? rep.diferencias.por_metodo : {};
      const totMon = (rep.diferencias && rep.diferencias.totales_moneda) ? rep.diferencias.totales_moneda : {};
      const resumen = (rep.esperados && rep.esperados.resumen) ? rep.esperados.resumen : {};
      const cfg = configTenant || {};
      const pCfg = this.getPrintConfig(configImpresion);
      const esc = this.escapeHtml;

      const nombreEmpresa = (cfg.nombre_negocio || 'Mi Negocio Comercial').trim();
      const colorPrimario = pCfg.color_primario || '#0f172a';

      // 1. Encabezado Corporativo
      let logoHtml = '';
      if (cfg.logo_url) {
        logoHtml = `<img src="${esc(cfg.logo_url)}" alt="${esc(nombreEmpresa)}" style="max-height: 52px; max-width: 160px; object-fit: contain;">`;
      } else {
        const iniciales = this.getIniciales(nombreEmpresa);
        logoHtml = `
          <div style="width: 46px; height: 46px; border-radius: 8px; background: ${colorPrimario}; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 18px;">
            ${iniciales}
          </div>
        `;
      }

      let headerHtml = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid ${colorPrimario}; padding-bottom: 12px; margin-bottom: 16px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            ${logoHtml}
            <div>
              <div style="font-size: 18px; font-weight: 900; color: #0f172a; text-transform: uppercase;">${esc(nombreEmpresa)}</div>
              ${cfg.documento_fiscal ? `<div style="font-size: 11px; color: #475569; font-weight: 600;">RIF/NIT: ${esc(cfg.documento_fiscal)}</div>` : ''}
              ${cfg.direccion ? `<div style="font-size: 10px; color: #64748b;">${esc(cfg.direccion)}</div>` : ''}
              ${cfg.telefono ? `<div style="font-size: 10px; color: #64748b;">Tel: ${esc(cfg.telefono)}</div>` : ''}
            </div>
          </div>
          <div style="text-align: right;">
            <div style="display: inline-block; background: ${colorPrimario}; color: #FFFFFF; font-size: 12px; font-weight: 900; padding: 4px 10px; border-radius: 6px; letter-spacing: 0.5px; text-transform: uppercase;">
              REPORTE DE CIERRE Z
            </div>
            <div style="font-size: 15px; font-weight: 900; color: #0f172a; margin-top: 4px; font-family: monospace;">
              TURNO #${esc(String(t.id || '0').padStart(6, '0'))}
            </div>
            <div style="font-size: 10px; color: #64748b;">Emitido: ${esc(rep.fecha_reporte || new Date().toLocaleString())}</div>
          </div>
        </div>
      `;

      // 2. Ficha Técnica del Turno
      let fichaTurnoHtml = `
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; font-size: 11px;">
          <div>
            <span style="display: block; font-size: 9px; color: #64748b; font-weight: bold; text-transform: uppercase;">Caja / Terminal</span>
            <strong style="color: #0f172a;">${esc(t.caja_nombre || 'Caja Principal')}</strong>
          </div>
          <div>
            <span style="display: block; font-size: 9px; color: #64748b; font-weight: bold; text-transform: uppercase;">Cajero Responsable</span>
            <strong style="color: #0f172a;">${esc(t.usuario_nombre || t.username || 'Administrador')}</strong>
          </div>
          <div>
            <span style="display: block; font-size: 9px; color: #64748b; font-weight: bold; text-transform: uppercase;">Hora de Apertura</span>
            <span style="color: #334155; font-family: monospace;">${esc(t.fecha_apertura || '-')}</span>
          </div>
          <div>
            <span style="display: block; font-size: 9px; color: #64748b; font-weight: bold; text-transform: uppercase;">Hora de Cierre</span>
            <span style="color: #334155; font-family: monospace;">${esc(t.fecha_cierre || '-')}</span>
          </div>
        </div>
      `;

      // 3. Resumen Financiero por Moneda (Cuadre de Bóveda)
      const renderMonedaRow = (mon, label, fondo) => {
        const dat = totMon[mon] || { esperado: 0, declarado: 0, diferencia: 0, estado: 'EXACTO' };
        const fIni = parseFloat(fondo || 0);
        const espVal = parseFloat(dat.esperado || 0);
        const decVal = parseFloat(dat.declarado || 0);
        const difVal = parseFloat(dat.diferencia || 0);
        const st = dat.estado || 'EXACTO';

        let badgeBg = '#ecfdf5';
        let badgeColor = '#065f46';
        let badgeBorder = '#a7f3d0';
        if (st === 'FALTANTE') {
          badgeBg = '#fef2f2'; badgeColor = '#991b1b'; badgeBorder = '#fecaca';
        } else if (st === 'SOBRANTE') {
          badgeBg = '#eff6ff'; badgeColor = '#1e40af'; badgeBorder = '#bfdbfe';
        }

        const sym = mon === 'USD' ? '$' : (mon === 'VES' ? 'Bs. ' : 'COP $');

        return `
          <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
            <td style="padding: 8px 10px; font-weight: 800; color: #0f172a;">${esc(label)} (${esc(mon)})</td>
            <td style="padding: 8px 10px; text-align: right; font-family: monospace;">${sym}${fIni.toFixed(2)}</td>
            <td style="padding: 8px 10px; text-align: right; font-family: monospace; font-weight: 600;">${sym}${espVal.toFixed(2)}</td>
            <td style="padding: 8px 10px; text-align: right; font-family: monospace; font-weight: 800; color: #0f172a;">${sym}${decVal.toFixed(2)}</td>
            <td style="padding: 8px 10px; text-align: right; font-family: monospace; font-weight: 800; color: ${difVal < 0 ? '#dc2626' : (difVal > 0 ? '#2563eb' : '#16a34a')};">
              ${difVal >= 0 ? '+' : ''}${sym}${difVal.toFixed(2)}
            </td>
            <td style="padding: 8px 10px; text-align: center;">
              <span style="display: inline-block; background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeBorder}; padding: 2px 6px; border-radius: 4px; font-size: 9.5px; font-weight: 900; letter-spacing: 0.5px;">
                ${esc(st)}
              </span>
            </td>
          </tr>
        `;
      };

      let tablaMonedasHtml = `
        <div style="margin-bottom: 18px;">
          <div style="font-size: 12px; font-weight: 900; color: #0f172a; text-transform: uppercase; margin-bottom: 6px; display: flex; items-center: gap-6px;">
            <span>1. CONCILIACIÓN GENERAL POR DIVISA (MULTIMONEDA)</span>
          </div>
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
            <thead>
              <tr style="background: ${colorPrimario}; color: #FFFFFF; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">
                <th style="padding: 7px 10px; text-align: left;">Moneda</th>
                <th style="padding: 7px 10px; text-align: right;">Fondo Inicial</th>
                <th style="padding: 7px 10px; text-align: right;">Saldo Teórico</th>
                <th style="padding: 7px 10px; text-align: right;">Declarado Cajero</th>
                <th style="padding: 7px 10px; text-align: right;">Diferencia</th>
                <th style="padding: 7px 10px; text-align: center;">Auditoría</th>
              </tr>
            </thead>
            <tbody>
              ${renderMonedaRow('USD', 'Dólares Americanos', t.fondo_inicial_usd)}
              ${renderMonedaRow('VES', 'Bolívares Digitales', t.fondo_inicial_ves)}
              ${renderMonedaRow('COP', 'Pesos Colombianos', 0.0)}
            </tbody>
          </table>
        </div>
      `;

      // 4. Detalle de Arqueo por Método de Pago
      const metodosLabel = {
        'efectivo_usd': 'Efectivo USD (Bóveda)',
        'efectivo_ves': 'Efectivo VES (Bóveda)',
        'efectivo_cop': 'Efectivo Pesos COP',
        'pago_movil_ves': 'Pago Móvil VES',
        'punto_venta_ves': 'Punto de Venta VES (POS)',
        'zelle_usd': 'Zelle USD',
        'transferencia_ves': 'Transferencia Bancaria VES',
        'transferencia_usd': 'Transferencia Bancaria USD',
        'otros_usd': 'Otros Medios USD',
        'otros_ves': 'Otros Medios VES'
      };

      let metodosRows = '';
      for (const [k, d] of Object.entries(difs)) {
        if (d.esperado > 0 || d.declarado > 0) {
          const lbl = metodosLabel[k] || k.replace(/_/g, ' ').toUpperCase();
          const isUsd = k.endsWith('_usd');
          const isVes = k.endsWith('_ves');
          const sym = isUsd ? '$' : (isVes ? 'Bs. ' : 'COP $');
          const dif = parseFloat(d.diferencia || 0);

          metodosRows += `
            <tr style="border-bottom: 1px solid #f1f5f9; font-size: 10.5px;">
              <td style="padding: 6px 8px; font-weight: 600; color: #1e293b;">${esc(lbl)}</td>
              <td style="padding: 6px 8px; text-align: right; font-family: monospace;">${sym}${parseFloat(d.esperado || 0).toFixed(2)}</td>
              <td style="padding: 6px 8px; text-align: right; font-family: monospace; font-weight: 700;">${sym}${parseFloat(d.declarado || 0).toFixed(2)}</td>
              <td style="padding: 6px 8px; text-align: right; font-family: monospace; font-weight: 700; color: ${dif < 0 ? '#dc2626' : (dif > 0 ? '#2563eb' : '#16a34a')};">
                ${dif >= 0 ? '+' : ''}${sym}${dif.toFixed(2)}
              </td>
              <td style="padding: 6px 8px; text-align: center; font-size: 9px; font-weight: 800;">${esc(d.estado)}</td>
            </tr>
          `;
        }
      }

      let tablaMetodosHtml = `
        <div style="margin-bottom: 18px;">
          <div style="font-size: 12px; font-weight: 900; color: #0f172a; text-transform: uppercase; margin-bottom: 6px;">
            2. DESGLOSE DE ARQUEO POR MÉTODO DE PAGO
          </div>
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
            <thead>
              <tr style="background: #334155; color: #FFFFFF; font-size: 9.5px; text-transform: uppercase;">
                <th style="padding: 6px 8px; text-align: left;">Método / Canal</th>
                <th style="padding: 6px 8px; text-align: right;">Teórico</th>
                <th style="padding: 6px 8px; text-align: right;">Declarado</th>
                <th style="padding: 6px 8px; text-align: right;">Diferencia</th>
                <th style="padding: 6px 8px; text-align: center;">Estado</th>
              </tr>
            </thead>
            <tbody>
              ${metodosRows || '<tr><td colspan="5" style="text-align: center; padding: 8px; color: #94a3b8;">Sin movimientos registrados en este turno.</td></tr>'}
            </tbody>
          </table>
        </div>
      `;

      // 5. Movimientos de Caja y Gastos Operativos
      const movs = rep.movimientos || [];
      let movsRows = '';
      movs.forEach(m => {
        if (m.referencia === 'APERTURA') return;
        const isEgreso = m.tipo === 'EGRESO';
        const sym = m.moneda === 'USD' ? '$' : (m.moneda === 'VES' ? 'Bs. ' : 'COP $');
        movsRows += `
          <tr style="border-bottom: 1px solid #f8fafc; font-size: 10px;">
            <td style="padding: 5px 8px; font-family: monospace; color: #64748b;">${esc(m.created_at ? m.created_at.substring(11, 16) : '-')}</td>
            <td style="padding: 5px 8px; font-weight: 800; color: ${isEgreso ? '#dc2626' : '#16a34a'};">${esc(m.tipo)}</td>
            <td style="padding: 5px 8px; color: #1e293b;">${esc(m.concepto)}</td>
            <td style="padding: 5px 8px; color: #64748b;">${esc(m.metodo_pago)}</td>
            <td style="padding: 5px 8px; text-align: right; font-family: monospace; font-weight: 700; color: ${isEgreso ? '#dc2626' : '#16a34a'};">
              ${isEgreso ? '-' : '+'}${sym}${parseFloat(m.monto || 0).toFixed(2)}
            </td>
          </tr>
        `;
      });

      let tablaMovsHtml = `
        <div style="margin-bottom: 20px;">
          <div style="font-size: 12px; font-weight: 900; color: #0f172a; text-transform: uppercase; margin-bottom: 6px;">
            3. REGISTRO DE MOVIMIENTOS & GASTOS MENORES DEL TURNO
          </div>
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
            <thead>
              <tr style="background: #475569; color: #FFFFFF; font-size: 9.5px; text-transform: uppercase;">
                <th style="padding: 5px 8px; text-align: left;">Hora</th>
                <th style="padding: 5px 8px; text-align: left;">Tipo</th>
                <th style="padding: 5px 8px; text-align: left;">Concepto / Beneficiario</th>
                <th style="padding: 5px 8px; text-align: left;">Método</th>
                <th style="padding: 5px 8px; text-align: right;">Monto</th>
              </tr>
            </thead>
            <tbody>
              ${movsRows || '<tr><td colspan="5" style="text-align: center; padding: 6px; color: #94a3b8; font-size: 10px;">No hubo egresos ni ingresos manuales durante el turno.</td></tr>'}
            </tbody>
          </table>
        </div>
      `;

      // 6. Firmas de Conformidad
      let firmasHtml = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 36px; padding-top: 10px; page-break-inside: avoid;">
          <div style="text-align: center; border-top: 1px solid #94a3b8; padding-top: 6px;">
            <div style="font-size: 11px; font-weight: 800; color: #0f172a;">${esc(t.usuario_nombre || t.username || 'Cajero Responsable')}</div>
            <div style="font-size: 9.5px; color: #64748b; text-transform: uppercase;">Firma Cajero / Operador de Turno</div>
          </div>
          <div style="text-align: center; border-top: 1px solid #94a3b8; padding-top: 6px;">
            <div style="font-size: 11px; font-weight: 800; color: #0f172a;">Administración / Auditoría</div>
            <div style="font-size: 9.5px; color: #64748b; text-transform: uppercase;">Firma de Revisión y Recepción</div>
          </div>
        </div>
      `;

      // 7. Footer Corporativo SaaS
      let footerHtml = `
        <div style="margin-top: 24px; padding-top: 8px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 8.5px; color: #94a3b8;">
          <div>${esc(nombreEmpresa)} &bull; Módulo de Tesorería & Control de Caja</div>
          <div>Generado por <strong style="color: #64748b;">TAVO CLOUD</strong> | www.tavocloud.com</div>
        </div>
      `;

      return `
        <div class="doc-sheet doc-letterPortrait" style="width: 780px; box-sizing: border-box; padding: 22px 26px; background: #FFFFFF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a;">
          ${headerHtml}
          ${fichaTurnoHtml}
          ${tablaMonedasHtml}
          ${tablaMetodosHtml}
          ${tablaMovsHtml}
          ${firmasHtml}
          ${footerHtml}
        </div>
      `;
    },

    // ==============================================================================
    // DIRECTIVA 7: TICKET TÉRMICO DE CIERRE Z (80MM MONOCROMÁTICO POS)
    // ==============================================================================
    renderReporteCierreZTicket: function (reporteZ, configTenant, configImpresion) {
      const rep = reporteZ || {};
      const t = rep.turno || {};
      const esp = (rep.esperados && rep.esperados.por_metodo) ? rep.esperados.por_metodo : {};
      const dec = (rep.declarados && rep.declarados.por_metodo) ? rep.declarados.por_metodo : {};
      const difs = (rep.diferencias && rep.diferencias.por_metodo) ? rep.diferencias.por_metodo : {};
      const totMon = (rep.diferencias && rep.diferencias.totales_moneda) ? rep.diferencias.totales_moneda : {};
      const cfg = configTenant || {};
      const esc = this.escapeHtml;

      const nombreEmpresa = (cfg.nombre_negocio || 'Mi Negocio').trim();

      let lineasMetodos = '';
      for (const [k, d] of Object.entries(difs)) {
        if (d.esperado > 0 || d.declarado > 0) {
          const shortName = k.replace(/_usd|_ves|_cop/g, '').toUpperCase();
          const mon = k.endsWith('_usd') ? 'USD' : (k.endsWith('_ves') ? 'VES' : 'COP');
          lineasMetodos += `
            <div style="display: flex; justify-content: space-between; font-size: 9.5px; margin-bottom: 2px;">
              <span>${esc(shortName)} (${mon}):</span>
              <span>$${parseFloat(d.declarado || 0).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 8.5px; color: #333; margin-bottom: 3px;">
              <span>Teor: $${parseFloat(d.esperado || 0).toFixed(2)}</span>
              <span>Dif: ${d.diferencia >= 0 ? '+' : ''}${parseFloat(d.diferencia || 0).toFixed(2)} (${d.estado})</span>
            </div>
          `;
        }
      }

      return `
        <div class="doc-sheet doc-ticket" style="width: 100%; max-width: 280px; margin: 0 auto; padding: 6px; box-sizing: border-box; background: #ffffff; color: #000000; font-family: monospace, 'Courier New', Courier;">
          <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 5px; margin-bottom: 5px;">
            <div style="font-weight: 900; font-size: 13px;">${esc(nombreEmpresa)}</div>
            ${cfg.documento_fiscal ? `<div style="font-size: 9.5px;">RIF: ${esc(cfg.documento_fiscal)}</div>` : ''}
            <div style="font-weight: 900; font-size: 11px; margin-top: 4px;">*** CIERRE DE CAJA & ARQUEO Z ***</div>
            <div style="font-size: 10px;">TURNO #${esc(String(t.id || '0').padStart(6, '0'))}</div>
          </div>

          <div style="font-size: 9px; line-height: 1.3; border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 4px;">
            <div>CAJA: ${esc(t.caja_nombre || 'Caja Principal')}</div>
            <div>CAJERO: ${esc(t.usuario_nombre || t.username || 'Operador')}</div>
            <div>APERTURA: ${esc(t.fecha_apertura ? t.fecha_apertura.substring(0, 16) : '-')}</div>
            <div>CIERRE: ${esc(t.fecha_cierre ? t.fecha_cierre.substring(0, 16) : '-')}</div>
          </div>

          <div style="font-size: 9.5px; font-weight: bold; border-bottom: 1px dotted #000; padding-bottom: 2px; margin-bottom: 4px;">
            CONCILIACIÓN POR DIVISA
          </div>

          <div style="font-size: 9.5px; line-height: 1.35; border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 4px;">
            <div style="display: flex; justify-content: space-between;">
              <span>TOTAL USD ESPERADO:</span>
              <span>$${parseFloat(totMon.USD?.esperado || 0).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-weight: bold;">
              <span>TOTAL USD DECLARADO:</span>
              <span>$${parseFloat(totMon.USD?.declarado || 0).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-weight: bold;">
              <span>DIFERENCIA USD:</span>
              <span>${(totMon.USD?.diferencia || 0) >= 0 ? '+' : ''}$${parseFloat(totMon.USD?.diferencia || 0).toFixed(2)} (${totMon.USD?.estado || 'EXACTO'})</span>
            </div>

            <div style="border-top: 1px dotted #888; margin: 3px 0;"></div>

            <div style="display: flex; justify-content: space-between;">
              <span>TOTAL VES ESPERADO:</span>
              <span>Bs.${parseFloat(totMon.VES?.esperado || 0).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-weight: bold;">
              <span>TOTAL VES DECLARADO:</span>
              <span>Bs.${parseFloat(totMon.VES?.declarado || 0).toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-weight: bold;">
              <span>DIFERENCIA VES:</span>
              <span>${(totMon.VES?.diferencia || 0) >= 0 ? '+' : ''}Bs.${parseFloat(totMon.VES?.diferencia || 0).toFixed(2)} (${totMon.VES?.estado || 'EXACTO'})</span>
            </div>
          </div>

          <div style="font-size: 9.5px; font-weight: bold; border-bottom: 1px dotted #000; padding-bottom: 2px; margin-bottom: 4px;">
            DETALLE POR FORMA DE PAGO
          </div>
          <div style="border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 6px;">
            ${lineasMetodos}
          </div>

          <div style="margin-top: 20px; text-align: center; font-size: 8.5px;">
            <div style="border-top: 1px solid #000; width: 80%; margin: 0 auto 3px auto;"></div>
            <div>FIRMA CAJERO / RESPONSABLE</div>
          </div>

          <div style="text-align: center; font-size: 8px; color: #444; margin-top: 10px; border-top: 1px dotted #888; padding-top: 3px;">
            Generado por TAVO CLOUD | www.tavocloud.com
          </div>
        </div>
      `;
    },

    renderFacturaTicket: function (factura, configTenant, configImpresion) {
      const f = factura || {};
      const cfg = configTenant || {};
      const pCfg = this.getPrintConfig(configImpresion);
      const esc = this.escapeHtml;

      const nombreEmpresa = (cfg.nombre_negocio || 'Mi Negocio').trim();
      const isAnulada = String(f.estado).toLowerCase() === 'anulada';
      const isCredito = String(f.tipo_venta).toLowerCase() === 'credito';

      // 1. Cabecera Térmica (Monocromática, 100% Monospace)
      let headerTicketHtml = `
        <div style="text-align: center; font-family: monospace, 'Courier New', Courier; line-height: 1.2; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
          ${isAnulada ? '<div style="font-weight: 900; font-size: 13px;">*** ANULADA ***</div>' : ''}
          <div style="font-weight: 900; font-size: 14px; text-transform: uppercase;">${esc(nombreEmpresa)}</div>
          ${cfg.documento_fiscal ? `<div style="font-size: 10px;">RIF: ${esc(cfg.documento_fiscal)}</div>` : ''}
          ${cfg.telefono ? `<div style="font-size: 10px;">TEL: ${esc(cfg.telefono)}</div>` : ''}
          ${cfg.direccion ? `<div style="font-size: 9px;">${esc(cfg.direccion)}</div>` : ''}
          
          <!-- Encabezado de Ticket Parametrizado -->
          ${pCfg.texto_header_ticket ? `<div style="font-weight: bold; font-size: 10px; margin: 4px 0; border-top: 1px dashed #000; padding-top: 3px;">${esc(pCfg.texto_header_ticket)}</div>` : ''}

          <div style="font-weight: 900; font-size: 12px; margin-top: 4px;">FACTURA #${esc(f.numero_factura || '000000')}</div>
          <div style="font-size: 9px;">FECHA: ${esc(f.fecha || new Date().toLocaleDateString('es-VE'))}</div>
          <div style="font-size: 9px; font-weight: bold;">CONDICIÓN: ${isCredito ? 'CRÉDITO' : 'CONTADO'}</div>
        </div>
      `;

      // 2. Cliente y Vendedor (Condicional)
      let clienteHtml = `
        <div style="font-family: monospace, 'Courier New', Courier; font-size: 10px; line-height: 1.3; border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 4px;">
          <div>CLIENTE: <strong>${esc(f.cliente_nombre || 'Consumidor Final')}</strong></div>
          ${f.cliente_cedula ? `<div>DOC/RIF: ${esc(f.cliente_cedula)}</div>` : ''}
          ${pCfg.mostrar_vendedor && (f.vendedor_nombre || f.usuario_nombre) ? `<div>VENDEDOR: <strong>${esc(f.vendedor_nombre || f.usuario_nombre)}</strong></div>` : ''}
        </div>
      `;

      // 3. Renglones de Productos (Monocromáticos)
      const detalles = f.detalles || f.items || [];
      let itemsLines = '';

      detalles.forEach(d => {
        const codigo = esc(d.codigo || '');
        const nombre = esc(d.nombre || d.nombre_producto || 'Item');
        const cant = parseFloat(d.cantidad || 0).toFixed(2);
        const pu = parseFloat(d.precio_unitario || 0).toFixed(2);
        const tot = parseFloat(d.total || 0).toFixed(2);
        const descuento = parseFloat(d.descuento || d.descuento_porcentaje || 0);

        const skuLine = (pCfg.mostrar_sku && codigo) ? `[${codigo}] ` : '';
        const descLine = (pCfg.mostrar_descuento_linea && descuento > 0) ? ` (Desc: -${descuento}%)` : '';

        itemsLines += `
          <div style="margin-bottom: 3px;">
            <div style="font-weight: bold;">${skuLine}${nombre}${descLine}</div>
            <div style="display: flex; justify-content: space-between; padding-left: 6px;">
              <span>${cant} x $${pu}</span>
              <strong>$${tot}</strong>
            </div>
          </div>
        `;
      });

      let itemsHtml = `
        <div style="font-family: monospace, 'Courier New', Courier; font-size: 10px; border-bottom: 1px dashed #000; padding-bottom: 5px; margin-bottom: 5px;">
          <div style="font-size: 9px; font-weight: bold; border-bottom: 1px dotted #000; padding-bottom: 2px; margin-bottom: 3px; display: flex; justify-content: space-between;">
            <span>DESCRIPCIÓN</span>
            <span>TOTAL</span>
          </div>
          ${itemsLines}
        </div>
      `;

      // 4. Totales Térmicos
      const subtotal = parseFloat(f.subtotal || 0).toFixed(2);
      const iva = parseFloat(f.iva_total || 0).toFixed(2);
      const totalUsd = parseFloat(f.total_usd || 0).toFixed(2);

      let totalsTicketHtml = `
        <div style="font-family: monospace, 'Courier New', Courier; font-size: 10.5px; line-height: 1.35; border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 4px;">
          <div style="display: flex; justify-content: space-between;">
            <span>SUBTOTAL:</span>
            <span>$${subtotal}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>IVA (16%):</span>
            <span>$${iva}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-weight: 900; font-size: 12px; border-top: 1px dashed #000; margin-top: 2px; padding-top: 2px;">
            <span>TOTAL USD:</span>
            <span>$${totalUsd}</span>
          </div>
        </div>
      `;

      // 5. Pie de Página del Ticket Parametrizado
      let footerTicketHtml = `
        <div style="text-align: center; font-family: monospace, 'Courier New', Courier; font-size: 9.5px; line-height: 1.25; margin-top: 6px;">
          ${pCfg.texto_footer_ticket ? `<div style="font-weight: bold; margin-bottom: 4px;">${esc(pCfg.texto_footer_ticket)}</div>` : ''}
          <div style="font-size: 8px; color: #333; margin-top: 4px; border-top: 1px dotted #888; padding-top: 3px;">
            Generado por TAVO CLOUD | www.tavocloud.com
          </div>
        </div>
      `;

      return `
        <div class="doc-sheet doc-ticket" style="width: 100%; max-width: 280px; margin: 0 auto; padding: 8px; box-sizing: border-box; background: #ffffff; color: #000000; font-family: monospace, 'Courier New', Courier;">
          ${headerTicketHtml}
          ${clienteHtml}
          ${itemsHtml}
          ${totalsTicketHtml}
          ${footerTicketHtml}
        </div>
      `;
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MasterReportLayout;
  }
  global.MasterReportLayout = MasterReportLayout;

})(typeof window !== 'undefined' ? window : this);
