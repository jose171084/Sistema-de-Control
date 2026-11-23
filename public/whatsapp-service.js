/* ==========================================================================
 * TAVO CLOUD - Motor Centralizado de Envios Directos por WhatsApp (Nivel 1)
 * Cero dependencias externas. Compatible con Browser y Node.js (UMD).
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TavoWhatsApp = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ICONS = Object.freeze({
    sparkles: String.fromCodePoint(0x2728),
    wave: String.fromCodePoint(0x1F44B),
    pointRight: String.fromCodePoint(0x1F449),
    check: String.fromCodePoint(0x2705),
    bag: String.fromCodePoint(0x1F6CD, 0xFE0F),
    receipt: String.fromCodePoint(0x1F9FE),
    doc: String.fromCodePoint(0x1F4C4),
    money: String.fromCodePoint(0x1F4B5),
    calendar: String.fromCodePoint(0x1F4C5),
    clock: String.fromCodePoint(0x23F0),
    returnIcon: String.fromCodePoint(0x21A9, 0xFE0F),
    box: String.fromCodePoint(0x1F4E6)
  });

  function _toNum(v, fallback = 0) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function _fmtUsd(v) {
    return `$${_toNum(v, 0).toFixed(2)}`;
  }

  function _fmtVes(v) {
    return _toNum(v, 0).toLocaleString('es-VE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function _fmtCop(v) {
    return Math.round(_toNum(v, 0)).toLocaleString('es-CO');
  }

  function _fmtFecha(raw) {
    if (!raw) return '-';
    const s = String(raw).trim();
    if (!s) return '-';
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
    }
    return s.slice(0, 16);
  }

  function _cleanText(v, fallback = '') {
    if (v === null || v === undefined) return fallback;
    const s = String(v).trim();
    return s || fallback;
  }

  function normalizarTelefono(rawPhone) {
    if (!rawPhone) return '';
    let digits = String(rawPhone).replace(/\D/g, '');
    if (!digits) return '';

    if (digits.startsWith('00')) {
      digits = digits.slice(2);
    }
    if (!digits || digits.length < 10) return '';

    // 11 digitos empezando por 0 (Venezuela nacional: 0412, 0414, 0416, 0424, 0426, 02xx)
    if (digits.length === 11 && digits.startsWith('0')) {
      return '58' + digits.slice(1);
    }

    // 10 digitos sin cero inicial Venezuela (412, 414, 416, 424, 426 o fijos 2xx)
    if (digits.length === 10 && (/^(412|414|416|424|426)/.test(digits) || digits.startsWith('2'))) {
      return '58' + digits;
    }

    // 10 digitos celulares Colombia (300-359)
    if (digits.length === 10 && digits.startsWith('3')) {
      return '57' + digits;
    }

    // 11 a 15 digitos con codigo de pais valido (58, 57, 1, etc.)
    if (digits.length >= 11 && digits.length <= 15 && !digits.startsWith('0')) {
      return digits;
    }

    return '';
  }

  function sanitizarMensaje(texto) {
    if (!texto) return '';
    let s = String(texto);
    s = s.replace(/\r\n?/g, '\n');
    // Convertir **texto** (Markdown) a *texto* (sintaxis real WhatsApp)
    s = s.replace(/\*\*([^*\n]+?)\*\*/g, '*$1*');
    // Eliminar barras separadoras excesivas
    s = s.replace(/\u2501{6,}/g, '');
    // Limpiar espacios al final de cada linea y colapsar saltos excesivos
    s = s.split('\n').map(line => line.replace(/[ \t]+$/g, '')).join('\n');
    s = s.replace(/\n{3,}/g, '\n\n');
    return s.trim();
  }

  function buildUrl(telefonoRaw, mensaje) {
    const tel = normalizarTelefono(telefonoRaw);
    const cleanMsg = sanitizarMensaje(mensaje);
    const encoded = encodeURIComponent(cleanMsg);
    return tel
      ? `https://api.whatsapp.com/send?phone=${tel}&text=${encoded}`
      : `https://api.whatsapp.com/send?text=${encoded}`;
  }

  function enviar(telefonoRaw, mensaje) {
    const url = buildUrl(telefonoRaw, mensaje);
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    return url;
  }

  // ========================================================================
  // PLANTILLAS PROFESIONALES UNIFICADAS
  // ========================================================================

  function buildMensajeCatalogo({ config, clienteNombre, categoriaNombre, modo, urlCatalogo } = {}) {
    const cfg = config || {};
    const negocio = _cleanText(cfg.nombre_negocio, 'Nuestro Catálogo');
    const cli = _cleanText(clienteNombre);
    const cat = _cleanText(categoriaNombre);
    const link = _cleanText(urlCatalogo, typeof window !== 'undefined' ? `${window.location.origin}/catalogo` : '/catalogo');

    const saludo = cli ? `¡Hola, *${cli}*! ${ICONS.wave}` : `¡Hola! ${ICONS.wave}`;
    const filtroInfo = cat && !cat.toLowerCase().includes('todas')
      ? ` (Categoría: *${cat}*)`
      : '';
    const stockNota = modo === 'con_stock' ? ' con disponibilidad actualizada' : '';

    const lineas = [
      `*${negocio.toUpperCase()}* ${ICONS.sparkles}`,
      '',
      saludo,
      `Te compartimos nuestro *Catálogo Oficial de Productos*${filtroInfo}${stockNota} ${ICONS.bag}:`,
      '',
      `${ICONS.pointRight} ${link}`,
      '',
      `${ICONS.doc} Desde ese enlace puedes ver fotos, precios actualizados y descargar el catálogo en PDF si lo deseas.`,
      '',
      'Avísame por aquí qué productos te interesan y con gusto te preparo tu pedido o cotización.'
    ];

    return sanitizarMensaje(lineas.join('\n'));
  }

  function buildMensajeFactura({ factura, config } = {}) {
    const f = factura || {};
    const cfg = config || {};
    const negocio = _cleanText(cfg.nombre_negocio, 'Empresa Comercial');
    const num = _cleanText(f.numero_factura || f.numero, '00000001');
    const fecha = _fmtFecha(f.fecha || f.fecha_emision);
    const cliente = _cleanText(f.cliente_nombre, 'Consumidor Final');
    const cedula = _cleanText(f.cliente_cedula);
    const esCredito = String(f.tipo_venta || '').toLowerCase() === 'credito';

    const detalles = Array.isArray(f.detalles) ? f.detalles : (Array.isArray(f.items) ? f.items : []);
    const itemsLines = detalles.map(d => {
      const cant = _toNum(d.cantidad, 1);
      const nom = _cleanText(d.nombre_producto || d.nombre, 'Producto');
      const tot = _toNum(d.total !== undefined ? d.total : d.subtotal, 0);
      return `• ${cant} x ${nom} — ${_fmtUsd(tot)}`;
    });

    const subtotal = _toNum(f.subtotal, 0);
    const iva = _toNum(f.iva_total, 0);
    const igtfUsd = _toNum(f.igtf_monto_usd, 0);
    const igtfPct = _toNum(f.igtf_porcentaje || cfg.igtf_porcentaje, 3.0);
    const totalUsd = _toNum(f.total_usd !== undefined ? f.total_usd : f.total, subtotal + iva);
    const totalOpUsd = _toNum(f.total_operacion_usd, totalUsd + igtfUsd);
    const tasaVes = _toNum(f.tasa_ves || cfg.tasa_ves, 0);
    const totalOpVes = _toNum(f.total_operacion_ves, _toNum(f.total_ves, totalOpUsd * tasaVes));
    const tasaCop = _toNum(f.tasa_cop || cfg.tasa_cop, 0);
    const totalCop = _toNum(f.total_cop, tasaCop > 0 ? totalOpUsd * tasaCop : 0);

    const pagos = Array.isArray(f.pagos) ? f.pagos : [];
    const pagosLines = pagos.map(p => {
      const mon = _cleanText(p.moneda, 'USD').toUpperCase();
      const met = _cleanText(p.metodo, mon);
      const mFmt = mon === 'COP' ? `${_fmtCop(p.monto_moneda)} COP` : (mon === 'VES' ? `${_fmtVes(p.monto_moneda)} Bs.` : _fmtUsd(p.monto_moneda));
      return `• ${met} (${mon}): ${mFmt}`;
    });

    const lineas = [
      `${ICONS.receipt} *FACTURA N° ${num}* — *${negocio}*`,
      `${ICONS.calendar} Fecha: ${fecha}`,
      `Cliente: *${cliente}*${cedula ? ` (${cedula})` : ''}`,
      `Condición: *${esCredito ? 'CRÉDITO' : 'CONTADO'}*`
    ];

    if (esCredito) {
      if (f.fecha_vencimiento) lineas.push(`${ICONS.clock} Vencimiento: *${_fmtFecha(f.fecha_vencimiento)}*`);
      lineas.push(`Saldo Pendiente: *${_fmtUsd(f.saldo_pendiente)} USD*`);
    }

    if (itemsLines.length > 0) {
      lineas.push('', '*Detalle:*', ...itemsLines);
    }

    lineas.push(
      '',
      `${ICONS.money} *Resumen Fiscal:*`,
      `Subtotal: ${_fmtUsd(subtotal)}`,
      `IVA: ${_fmtUsd(iva)}`
    );

    if (igtfUsd > 0) {
      lineas.push(`IGTF (${igtfPct.toFixed(0)}%): ${_fmtUsd(igtfUsd)}`);
    }

    lineas.push(`*TOTAL: ${_fmtUsd(totalOpUsd)} USD*`);
    if (totalOpVes > 0) {
      const tasaTxt = tasaVes > 0 ? ` (Tasa BCV ${_fmtVes(tasaVes)})` : '';
      lineas.push(`Equiv. Bs.: ${_fmtVes(totalOpVes)} Bs.${tasaTxt}`);
    }
    if (totalCop > 0) {
      lineas.push(`Equiv. COP: ${_fmtCop(totalCop)} COP`);
    }

    if (pagosLines.length > 0) {
      lineas.push('', '*Forma de Pago:*', ...pagosLines);
    }

    lineas.push('', `${ICONS.sparkles} ¡Gracias por su compra!`);
    return sanitizarMensaje(lineas.join('\n'));
  }

  function buildMensajeDevolucion({ devolucion, config } = {}) {
    const dev = devolucion || {};
    const cfg = config || {};
    const negocio = _cleanText(cfg.nombre_negocio, 'Empresa Comercial');
    const num = _cleanText(dev.numero_devolucion, '00000001');
    const fecha = _fmtFecha(dev.fecha_emision);
    const cliente = _cleanText(dev.cliente_nombre, 'Consumidor Final');
    const factAfect = _cleanText(dev.factura_numero_afectada || dev.numero_factura);
    const factFecha = _fmtFecha(dev.factura_fecha_afectada || dev.fecha_factura_original);
    const motivo = _cleanText(dev.motivo, 'Devolución / Ajuste');

    const items = Array.isArray(dev.items) ? dev.items : (Array.isArray(dev.detalles) ? dev.detalles : []);
    const itemsLines = items.map(it => {
      const cant = _toNum(it.cantidad, 1);
      const nom = _cleanText(it.nombre || it.nombre_producto, 'Producto');
      const tot = _toNum(it.total !== undefined ? it.total : it.subtotal, 0);
      return `• ${cant} x ${nom} — ${_fmtUsd(tot)}`;
    });

    const igtfUsd = _toNum(dev.igtf_monto_usd, 0);
    const totalUsd = _toNum(dev.total_usd, 0);
    const totalOpUsd = _toNum(dev.total_operacion_usd, totalUsd + igtfUsd);
    const tasaVes = _toNum(dev.tasa_ves || cfg.tasa_ves, 0);
    const totalOpVes = _toNum(dev.total_operacion_ves, _toNum(dev.total_ves, totalOpUsd * tasaVes));
    const totalCop = _toNum(dev.total_cop, 0);

    const pagos = Array.isArray(dev.pagos) ? dev.pagos : [];
    const reembolsoTxt = pagos.length > 0
      ? pagos.map(p => {
          const mon = _cleanText(p.moneda, 'USD').toUpperCase();
          const met = _cleanText(p.metodo, mon);
          const mFmt = mon === 'COP' ? `${_fmtCop(p.monto_moneda)} COP` : (mon === 'VES' ? `${_fmtVes(p.monto_moneda)} Bs.` : _fmtUsd(p.monto_moneda));
          return `${met} (${mFmt})`;
        }).join(', ')
      : _cleanText(dev.metodo_reembolso, 'Reembolso').replace(/_/g, ' ');

    const lineas = [
      `${ICONS.returnIcon} *NOTA DE CRÉDITO / DEVOLUCIÓN N° ${num}* — *${negocio}*`,
      `${ICONS.calendar} Fecha: ${fecha}`,
      `Cliente: *${cliente}*`,
      '',
      `${ICONS.doc} *Documento Afectado:*`,
      factAfect
        ? `Factura Afectada: *${factAfect}*`
        : 'Origen: Devolución Manual',
      ...(factAfect ? [`Fecha Factura: ${factFecha}`] : []),
      `Motivo: ${motivo}`
    ];

    if (itemsLines.length > 0) {
      lineas.push('', '*Ítems Devueltos:*', ...itemsLines);
    }

    lineas.push(
      '',
      `${ICONS.money} *Total Devuelto: ${_fmtUsd(totalOpUsd)} USD*`
    );
    if (igtfUsd > 0) {
      lineas.push(`Incluye IGTF: ${_fmtUsd(igtfUsd)} USD`);
    }
    if (totalOpVes > 0) {
      lineas.push(`Equiv. Bs.: ${_fmtVes(totalOpVes)} Bs.`);
    }
    if (totalCop > 0) {
      lineas.push(`Equiv. COP: ${_fmtCop(totalCop)} COP`);
    }
    lineas.push(`Reembolso / Compensación: *${reembolsoTxt}*`);

    return sanitizarMensaje(lineas.join('\n'));
  }

  function buildMensajePedido({ pedido, config } = {}) {
    const p = pedido || {};
    const cfg = config || {};
    const negocio = _cleanText(cfg.nombre_negocio, 'Empresa Comercial');
    const num = _cleanText(p.numero_pedido, '00000001');
    const fecha = _fmtFecha(p.fecha);
    const cliente = _cleanText(p.cliente_nombre, 'Cliente');
    const vendedor = _cleanText(p.vendedor_nombre, 'Mostrador');
    const esCredito = String(p.condicion_pago || '').toLowerCase() === 'credito';
    const condTxt = esCredito ? `Crédito (${p.dias_credito || 15} días)` : 'Contado';
    const vigencia = p.fecha_vencimiento ? _fmtFecha(p.fecha_vencimiento) : '-';

    const items = Array.isArray(p.items) ? p.items : (Array.isArray(p.detalles) ? p.detalles : []);
    const itemsLines = items.map(it => {
      const cant = _toNum(it.cantidad_aprobada !== undefined && it.cantidad_aprobada !== null ? it.cantidad_aprobada : it.cantidad, 1);
      const nom = _cleanText(it.producto_nombre || it.nombre || it.nombre_producto, 'Producto');
      const sub = _toNum(it.subtotal !== undefined ? it.subtotal : it.total, cant * _toNum(it.precio_unitario, 0));
      return `• ${cant} x ${nom} — ${_fmtUsd(sub)}`;
    });

    const totalUsd = _toNum(p.total_usd, 0);
    const tasaVes = _toNum(p.tasa_ves || cfg.tasa_ves, 0);
    const totalVes = _toNum(p.total_ves, tasaVes > 0 ? totalUsd * tasaVes : 0);

    const lineas = [
      `${ICONS.box} *PEDIDO / PREVENTA N° ${num}* — *${negocio}*`,
      `${ICONS.calendar} Fecha: ${fecha}`,
      `Cliente: *${cliente}*`,
      `Vendedor: ${vendedor}`,
      `Condición: *${condTxt}*`,
      `${ICONS.clock} Válido hasta: ${vigencia}`
    ];

    if (itemsLines.length > 0) {
      lineas.push('', '*Ítems Solicitados:*', ...itemsLines);
    }

    lineas.push('', `${ICONS.money} *Total Estimado: ${_fmtUsd(totalUsd)} USD*`);
    if (totalVes > 0) {
      lineas.push(`Equiv. Bs.: ${_fmtVes(totalVes)} Bs.`);
    }

    lineas.push('', '_Pedido sujeto a aprobación administrativa y disponibilidad de inventario._');
    return sanitizarMensaje(lineas.join('\n'));
  }

  function buildMensajeReciboAbonoCxC({ cuenta, abono, config } = {}) {
    const c = cuenta || {};
    const ab = abono || {};
    const cfg = config || {};
    const negocio = _cleanText(cfg.nombre_negocio, 'Empresa Comercial');
    const cliente = _cleanText(c.cliente_nombre, 'Cliente');
    const numFact = _cleanText(c.numero_factura, '-');
    const numRec = _cleanText(ab.numero_recibo || (ab.id ? String(ab.id) : ''));
    const fecha = _fmtFecha(ab.fecha || new Date().toISOString());
    const montoUsd = _toNum(ab.monto_usd !== undefined ? ab.monto_usd : ab.monto_abono_usd, 0);

    const nuevoSaldo = ab.nuevo_saldo_pendiente !== undefined
      ? Math.max(0, _toNum(ab.nuevo_saldo_pendiente, 0))
      : Math.max(0, _toNum(c.saldo_pendiente, 0));

    const pagos = Array.isArray(ab.pagos) ? ab.pagos : [];
    const pagosLines = pagos.map(p => {
      const mon = _cleanText(p.moneda, 'USD').toUpperCase();
      const met = _cleanText(p.metodo, mon);
      const mFmt = mon === 'COP' ? `${_fmtCop(p.monto_moneda)} COP` : (mon === 'VES' ? `${_fmtVes(p.monto_moneda)} Bs.` : _fmtUsd(p.monto_moneda));
      return `• ${met} (${mon}): ${mFmt} (≈ ${_fmtUsd(p.equivalente_usd !== undefined ? p.equivalente_usd : p.monto_moneda)})`;
    });

    const lineas = [
      `${ICONS.check} *RECIBO DE PAGO / ABONO${numRec ? ` N° ${numRec}` : ''}* — *${negocio}*`,
      `${ICONS.calendar} Fecha: ${fecha}`,
      `Cliente: *${cliente}*`,
      `Factura Abonada: *#${numFact}*`,
      `${ICONS.money} Monto Abonado: *${_fmtUsd(montoUsd)} USD*`
    ];

    if (pagosLines.length > 0) {
      lineas.push('', '*Detalle del Pago:*', ...pagosLines);
    }

    lineas.push('');
    if (nuevoSaldo <= 0.005) {
      lineas.push(`Nuevo Saldo Pendiente: *CUENTA SALDADA* ($0.00) ${ICONS.check}`);
    } else {
      lineas.push(`Nuevo Saldo Pendiente: *${_fmtUsd(nuevoSaldo)} USD*`);
    }
    lineas.push('', `${ICONS.sparkles} ¡Muchas gracias por su pago!`);

    return sanitizarMensaje(lineas.join('\n'));
  }

  function buildMensajeRecordatorioCxC({ cuenta, config } = {}) {
    const c = cuenta || {};
    const cfg = config || {};
    const negocio = _cleanText(cfg.nombre_negocio, 'Empresa Comercial');
    const cliente = _cleanText(c.cliente_nombre, 'Cliente');
    const numFact = _cleanText(c.numero_factura, '-');
    const totalFact = _toNum(c.monto_total, 0);
    const pagado = _toNum(c.monto_pagado, 0);
    const saldoUsd = _toNum(c.saldo_pendiente, 0);
    const tasaVes = _toNum(cfg.tasa_ves, 0);
    const saldoBs = tasaVes > 0 ? saldoUsd * tasaVes : 0;

    let estadoVenc = '';
    if (c.fecha_vencimiento) {
      const hoyStr = new Date().toISOString().slice(0, 10);
      const vencIso = String(c.fecha_vencimiento).slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(vencIso)) {
        if (vencIso < hoyStr) estadoVenc = ' *(VENCIDA)*';
        else if (vencIso === hoyStr) estadoVenc = ' *(Vence HOY)*';
        else estadoVenc = ' (Próxima a vencer)';
      }
    }

    const lineas = [
      `${ICONS.wave} ¡Hola, *${cliente}*! Te saludamos de *${negocio}*.`,
      '',
      `Te recordamos amablemente el estado de tu Factura *#${numFact}*:`,
      `${ICONS.doc} Total Factura: ${_fmtUsd(totalFact)}`,
      `${ICONS.check} Abonado: ${_fmtUsd(pagado)}`,
      `${ICONS.money} *Saldo Pendiente: ${_fmtUsd(saldoUsd)} USD*${saldoBs > 0 ? ` (≈ ${_fmtVes(saldoBs)} Bs. a tasa BCV)` : ''}`,
      `${ICONS.clock} Vencimiento: *${_fmtFecha(c.fecha_vencimiento)}*${estadoVenc}`,
      '',
      'Por favor confírmanos cuando realices tu pago para emitir tu recibo de inmediato. ¡Que tengas excelente día!'
    ];

    return sanitizarMensaje(lineas.join('\n'));
  }

  return Object.freeze({
    ICONS,
    normalizarTelefono,
    sanitizarMensaje,
    buildUrl,
    enviar,
    buildMensajeCatalogo,
    buildMensajeFactura,
    buildMensajeDevolucion,
    buildMensajePedido,
    buildMensajeReciboAbonoCxC,
    buildMensajeRecordatorioCxC
  });
}));
