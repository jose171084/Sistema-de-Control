/**
 * ==============================================================================
 * MASTER REPORT LAYOUT & ESTUDIO UNIVERSAL DE DOCUMENTOS — TAVO CLOUD
 * ==============================================================================
 * Motor Universal de Maquetación e Impresión Multi-Documento:
 * - Soporta 20 tipos de documentos (Comerciales, Tesorería, Libros SENIAT y Reportes).
 * - Configuración JSON independiente por doc_type con herencia global opcional.
 * - Alineación real de logotipo (izquierda, centro, derecha) y tamaños (sm/md/lg).
 * - Columnas dinámicas activables/desactivables y regla @page dinámica.
 * - Conversión multimoneda USD / VES / COP y soporte térmico 80mm / 58mm.
 * ==============================================================================
 */

(function (global) {
  'use strict';

  const LOGO_HEIGHT_MAP = { sm: '36px', md: '54px', lg: '74px' };
  const FONT_FAMILY_MAP = {
    sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', Times, serif",
    mono: "'Courier New', Courier, monospace"
  };
  const FONT_SCALE_MAP = { compacto: '10px', normal: '11.5px', grande: '13px' };
  const ROW_PAD_MAP = { compacta: '3px 5px', normal: '6px 8px', amplia: '9px 10px' };

  function makeDefaultFmt(docType, categoria, etiqueta, overrides) {
    const base = {
      doc_type: docType,
      categoria: categoria,
      etiqueta: etiqueta,
      tamano_papel: 'letter',
      orientacion: 'portrait',
      margen_mm: 10,
      escala_fuente: 'normal',
      familia_fuente: 'sans',
      titulo_documento: 'DOCUMENTO OFICIAL',
      subtitulo_documento: '',
      color_primario: '#0f172a',
      color_secundario: '#0284c7',
      mostrar_logo: true,
      logo_tamano: 'md',
      logo_alineacion: 'izquierda',
      mostrar_rif: true,
      mostrar_direccion: true,
      mostrar_telefono: true,
      mostrar_fecha_impresion: true,
      mostrar_paginacion: true,
      columnas: {},
      densidad_filas: 'normal',
      zebra_striping: true,
      mostrar_equivalente_ves: true,
      mostrar_equivalente_cop: false,
      mostrar_tasas_cambio: true,
      mostrar_desglose_pagos: true,
      mostrar_cuentas_bancarias: false,
      texto_cuentas_bancarias: 'Banco Mercantil / Banesco • Pago Móvil: 0412-0000000 / RIF J-00000000-0',
      mostrar_sku: true,
      mostrar_vendedor: true,
      mostrar_descuento_linea: true,
      modo_forma_libre: false,
      margen_superior_forma_libre_mm: 35,
      texto_encabezado_extra: '',
      texto_pie_pagina: 'Documento oficial emitido por el sistema.',
      mostrar_firmas: false,
      firmas: ['Elaborado por', 'Revisado / Contabilidad', 'Recibido Conforme'],
      mostrar_marca_saas: true,
      css_personalizado: ''
    };
    return Object.assign(base, overrides || {});
  }

  // Registro maestro de los 20 tipos de documento + etiquetas humanas de sus columnas
  const DOCUMENT_REGISTRY = [
    {
      doc_type: 'factura_a4',
      categoria: 'Comerciales',
      etiqueta: 'Factura / Nota (Hoja A4/Carta)',
      icono: 'fa-file-invoice-dollar',
      colsMeta: [
        { key: 'num', label: 'N° Línea (#)' },
        { key: 'sku', label: 'Código / SKU' },
        { key: 'descripcion', label: 'Descripción' },
        { key: 'vendedor', label: 'Vendedor' },
        { key: 'cantidad', label: 'Cantidad' },
        { key: 'precio_unitario', label: 'Precio Unitario' },
        { key: 'descuento', label: 'Descuento (%)' },
        { key: 'iva', label: 'Alícuota IVA' },
        { key: 'total', label: 'Total Renglón' }
      ],
      defaults: makeDefaultFmt('factura_a4', 'Comerciales', 'Factura / Nota (Hoja A4/Carta)', {
        margen_mm: 12,
        titulo_documento: 'FACTURA DE VENTA',
        subtitulo_documento: 'Comprobante Fiscal y Comercial',
        columnas: { num: true, sku: true, descripcion: true, vendedor: true, cantidad: true, precio_unitario: true, descuento: true, iva: true, total: true },
        mostrar_firmas: true,
        firmas: ['Emisor / Facturación', 'Recibido Conforme'],
        texto_pie_pagina: 'Gracias por su compra. Conserve esta factura como comprobante de garantía.'
      })
    },
    {
      doc_type: 'factura_ticket',
      categoria: 'Comerciales',
      etiqueta: 'Ticket Térmico Venta (POS 80/58mm)',
      icono: 'fa-receipt',
      colsMeta: [
        { key: 'sku', label: 'Código / SKU' },
        { key: 'descripcion', label: 'Descripción Ítem' },
        { key: 'vendedor', label: 'Vendedor' },
        { key: 'cantidad', label: 'Cantidad' },
        { key: 'precio_unitario', label: 'Precio Unitario' },
        { key: 'descuento', label: 'Descuento (%)' },
        { key: 'iva', label: 'Indicador IVA' },
        { key: 'total', label: 'Total Renglón' }
      ],
      defaults: makeDefaultFmt('factura_ticket', 'Comerciales', 'Ticket Térmico Venta (POS 80/58mm)', {
        tamano_papel: 'ticket_80',
        margen_mm: 2,
        escala_fuente: 'compacto',
        familia_fuente: 'mono',
        logo_alineacion: 'centro',
        titulo_documento: 'FACTURA DE VENTA',
        subtitulo_documento: '*** COMPROBANTE DE COMPRA ***',
        columnas: { sku: true, descripcion: true, vendedor: true, cantidad: true, precio_unitario: true, descuento: true, iva: true, total: true },
        mostrar_firmas: false,
        firmas: [],
        texto_encabezado_extra: '*** COMPROBANTE DE COMPRA ***',
        texto_pie_pagina: '*** GRACIAS POR SU PREFERENCIA ***'
      })
    },
    {
      doc_type: 'pedido_preventa',
      categoria: 'Comerciales',
      etiqueta: 'Pedido / Preventa Comercial',
      icono: 'fa-clipboard-list',
      colsMeta: [
        { key: 'num', label: 'N° (#)' },
        { key: 'sku', label: 'Código / SKU' },
        { key: 'descripcion', label: 'Descripción' },
        { key: 'cant_pedida', label: 'Cant. Pedida' },
        { key: 'cant_aprobada', label: 'Cant. Aprobada' },
        { key: 'precio_unitario', label: 'Precio Unit.' },
        { key: 'iva', label: 'IVA' },
        { key: 'subtotal', label: 'Subtotal' }
      ],
      defaults: makeDefaultFmt('pedido_preventa', 'Comerciales', 'Pedido / Preventa Comercial', {
        margen_mm: 12,
        titulo_documento: 'ORDEN DE PEDIDO / PREVENTA',
        subtitulo_documento: 'Solicitud Comercial Sujeta a Aprobación',
        columnas: { num: true, sku: true, descripcion: true, cant_pedida: true, cant_aprobada: true, precio_unitario: true, iva: true, subtotal: true },
        mostrar_desglose_pagos: false,
        mostrar_firmas: true,
        firmas: ['Asesor de Ventas', 'Cliente / Solicitante', 'Aprobación Despacho'],
        texto_pie_pagina: 'Presupuesto / Preventa sujeto a disponibilidad de inventario al momento de facturar.'
      })
    },
    {
      doc_type: 'nota_credito_devolucion',
      categoria: 'Comerciales',
      etiqueta: 'Nota de Crédito / Devolución',
      icono: 'fa-rotate-left',
      colsMeta: [
        { key: 'num', label: 'N° (#)' },
        { key: 'sku', label: 'Código / SKU' },
        { key: 'descripcion', label: 'Descripción Ítem' },
        { key: 'tipo', label: 'Tipo' },
        { key: 'cantidad', label: 'Cantidad' },
        { key: 'precio_unitario', label: 'Precio Unit.' },
        { key: 'iva', label: 'IVA' },
        { key: 'total', label: 'Total Devuelto' }
      ],
      defaults: makeDefaultFmt('nota_credito_devolucion', 'Comerciales', 'Nota de Crédito / Devolución', {
        margen_mm: 12,
        titulo_documento: 'NOTA OFICIAL DE DEVOLUCIÓN',
        subtitulo_documento: 'Reintegro de Mercancía y Crédito a Cliente',
        columnas: { num: true, sku: true, descripcion: true, tipo: true, cantidad: true, precio_unitario: true, iva: true, total: true },
        mostrar_firmas: true,
        firmas: ['Responsable Almacén / Caja', 'Cliente / Beneficiario'],
        texto_pie_pagina: 'Mercancía reingresada conforme a inventario.'
      })
    },
    {
      doc_type: 'nota_debito_ajuste',
      categoria: 'Comerciales',
      etiqueta: 'Nota de Débito / Ajuste Inventario',
      icono: 'fa-boxes-packing',
      colsMeta: [
        { key: 'num', label: 'N° (#)' },
        { key: 'codigo', label: 'Código' },
        { key: 'descripcion', label: 'Descripción' },
        { key: 'unidad', label: 'Unidad' },
        { key: 'cantidad', label: 'Cantidad' },
        { key: 'stock_anterior', label: 'Stock Ant.' },
        { key: 'stock_nuevo', label: 'Stock Nue.' },
        { key: 'cpp_anterior', label: 'CPP Ant.' },
        { key: 'costo_unitario', label: 'Costo Unit.' },
        { key: 'cpp_nuevo', label: 'CPP Nue.' },
        { key: 'valuacion', label: 'Valuación' }
      ],
      defaults: makeDefaultFmt('nota_debito_ajuste', 'Comerciales', 'Nota de Débito / Ajuste Inventario', {
        margen_mm: 10,
        titulo_documento: 'COMPROBANTE DE AJUSTE / NOTA DÉBITO',
        subtitulo_documento: 'Movimiento Formal de Almacén y Costeo CPP',
        columnas: { num: true, codigo: true, descripcion: true, unidad: true, cantidad: true, stock_anterior: true, stock_nuevo: true, cpp_anterior: true, costo_unitario: true, cpp_nuevo: true, valuacion: true },
        mostrar_desglose_pagos: false,
        mostrar_firmas: true,
        firmas: ['Responsable de Inventario', 'Autorizado por / Auditoría'],
        texto_pie_pagina: 'Asiento formal auditado en el libro de movimientos de inventario.'
      })
    },
    {
      doc_type: 'recibo_pago_cxc',
      categoria: 'Comerciales',
      etiqueta: 'Recibo de Cobro / Abono CxC',
      icono: 'fa-hand-holding-dollar',
      colsMeta: [
        { key: 'metodo', label: 'Método de Pago' },
        { key: 'moneda', label: 'Moneda' },
        { key: 'monto_moneda', label: 'Monto Original' },
        { key: 'tasa_cambio', label: 'Tasa Aplicada' },
        { key: 'equivalente_usd', label: 'Equiv. USD' },
        { key: 'referencia', label: 'Referencia' }
      ],
      defaults: makeDefaultFmt('recibo_pago_cxc', 'Comerciales', 'Recibo de Cobro / Abono CxC', {
        tamano_papel: 'half_letter',
        margen_mm: 10,
        titulo_documento: 'RECIBO OFICIAL DE COBRO (CXC)',
        subtitulo_documento: 'Comprobante de Amortización de Deuda Cliente',
        columnas: { metodo: true, moneda: true, monto_moneda: true, tasa_cambio: true, equivalente_usd: true, referencia: true },
        mostrar_firmas: true,
        firmas: ['Recibido por (Caja / Cobranza)', 'Cliente Pagador'],
        texto_pie_pagina: 'Abono aplicado satisfactoriamente al estado de cuenta del cliente.'
      })
    },
    {
      doc_type: 'recibo_pago_cxp',
      categoria: 'Comerciales',
      etiqueta: 'Comprobante de Pago CxP',
      icono: 'fa-money-check-dollar',
      colsMeta: [
        { key: 'metodo', label: 'Método de Pago' },
        { key: 'moneda', label: 'Moneda' },
        { key: 'monto_moneda', label: 'Monto Original' },
        { key: 'tasa_cambio', label: 'Tasa Aplicada' },
        { key: 'equivalente_usd', label: 'Equiv. USD' },
        { key: 'referencia', label: 'Referencia' }
      ],
      defaults: makeDefaultFmt('recibo_pago_cxp', 'Comerciales', 'Comprobante de Pago CxP', {
        tamano_papel: 'half_letter',
        margen_mm: 10,
        titulo_documento: 'COMPROBANTE DE EGRESO / PAGO (CXP)',
        subtitulo_documento: 'Soporte de Amortización a Proveedor',
        columnas: { metodo: true, moneda: true, monto_moneda: true, tasa_cambio: true, equivalente_usd: true, referencia: true },
        mostrar_firmas: true,
        firmas: ['Pagado por (Tesorería)', 'Recibido Conforme (Proveedor)'],
        texto_pie_pagina: 'Pago registrado en cuentas por pagar a proveedores.'
      })
    },
    {
      doc_type: 'catalogo_productos',
      categoria: 'Comerciales',
      etiqueta: 'Catálogo Visual de Productos',
      icono: 'fa-book-open',
      colsMeta: [
        { key: 'foto', label: 'Fotografía / Avatar' },
        { key: 'codigo', label: 'Código SKU' },
        { key: 'descripcion', label: 'Descripción' },
        { key: 'stock', label: 'Disponibilidad Stock' },
        { key: 'precio_usd', label: 'Precio USD' },
        { key: 'precio_ves', label: 'Equiv. Bolívares' }
      ],
      defaults: makeDefaultFmt('catalogo_productos', 'Comerciales', 'Catálogo Visual de Productos', {
        margen_mm: 10,
        titulo_documento: 'CATÁLOGO DE PRODUCTOS',
        subtitulo_documento: 'Lista Oficial de Precios al Cliente',
        columnas: { foto: true, codigo: true, descripcion: true, stock: true, precio_usd: true, precio_ves: false },
        mostrar_desglose_pagos: false,
        mostrar_firmas: false,
        firmas: [],
        texto_pie_pagina: 'Precios sujetos a cambio sin previo aviso según tasa BCV del día.'
      })
    },

    // --- TESORERÍA ---
    {
      doc_type: 'cierre_z_a4',
      categoria: 'Tesorería',
      etiqueta: 'Cierre Z & Arqueo (Hoja A4/Carta)',
      icono: 'fa-cash-register',
      colsMeta: [
        { key: 'moneda', label: 'Moneda / Divisa' },
        { key: 'fondo_inicial', label: 'Fondo Inicial' },
        { key: 'saldo_teorico', label: 'Saldo Teórico' },
        { key: 'declarado', label: 'Declarado Cajero' },
        { key: 'diferencia', label: 'Diferencia' },
        { key: 'auditoria', label: 'Auditoría' },
        { key: 'movimientos_detalle', label: 'Tabla de Movimientos Menores' }
      ],
      defaults: makeDefaultFmt('cierre_z_a4', 'Tesorería', 'Cierre Z & Arqueo (Hoja A4/Carta)', {
        margen_mm: 10,
        titulo_documento: 'REPORTE DE CIERRE Z & ARQUEO',
        subtitulo_documento: 'Conciliación Multimoneda y Cierre de Turno',
        columnas: { moneda: true, fondo_inicial: true, saldo_teorico: true, declarado: true, diferencia: true, auditoria: true, movimientos_detalle: true },
        mostrar_firmas: true,
        firmas: ['Cajero / Operador de Turno', 'Administración / Auditoría'],
        texto_pie_pagina: 'Arqueo cerrado y auditado en el módulo de tesorería.'
      })
    },
    {
      doc_type: 'cierre_z_ticket',
      categoria: 'Tesorería',
      etiqueta: 'Ticket Térmico Cierre Z (POS 80/58mm)',
      icono: 'fa-print',
      colsMeta: [
        { key: 'conciliacion_divisas', label: 'Conciliación Divisas' },
        { key: 'detalle_metodos', label: 'Desglose por Método' },
        { key: 'diferencias', label: 'Mostrar Diferencias' }
      ],
      defaults: makeDefaultFmt('cierre_z_ticket', 'Tesorería', 'Ticket Térmico Cierre Z (POS 80/58mm)', {
        tamano_papel: 'ticket_80',
        margen_mm: 2,
        escala_fuente: 'compacto',
        familia_fuente: 'mono',
        logo_alineacion: 'centro',
        titulo_documento: 'CIERRE DE CAJA & ARQUEO Z',
        subtitulo_documento: 'Resumen Térmico de Turno',
        columnas: { conciliacion_divisas: true, detalle_metodos: true, diferencias: true },
        mostrar_firmas: true,
        firmas: ['Firma Cajero / Responsable'],
        texto_pie_pagina: 'Cierre Z emitido desde terminal POS.'
      })
    },

    // --- LIBROS SENIAT ---
    {
      doc_type: 'libro_ventas_seniat',
      categoria: 'Libros SENIAT',
      etiqueta: 'Libro de Ventas SENIAT',
      icono: 'fa-scale-balanced',
      colsMeta: [
        { key: 'num_oper', label: 'N° Oper' },
        { key: 'fecha', label: 'Fecha' },
        { key: 'rif_cedula', label: 'RIF / Cédula' },
        { key: 'razon_social', label: 'Razón Social' },
        { key: 'num_factura', label: 'N° Factura' },
        { key: 'num_control', label: 'N° Control' },
        { key: 'nota_deb_cred', label: 'Nota Déb/Créd' },
        { key: 'factura_afectada', label: 'Fact. Afectada' },
        { key: 'tipo_transaccion', label: 'Tipo Transacción' },
        { key: 'total_ventas_iva', label: 'Total Ventas c/IVA' },
        { key: 'ventas_exentas', label: 'Ventas Exentas' },
        { key: 'base_imponible', label: 'Base Imponible' },
        { key: 'alicuota_iva', label: '% Alícuota' },
        { key: 'debito_fiscal_iva', label: 'Débito Fiscal IVA' },
        { key: 'iva_retenido', label: 'IVA Retenido' },
        { key: 'igtf_percibido', label: 'IGTF Percibido' },
        { key: 'equiv_usd', label: 'Equiv. USD' }
      ],
      defaults: makeDefaultFmt('libro_ventas_seniat', 'Libros SENIAT', 'Libro de Ventas SENIAT', {
        orientacion: 'landscape',
        margen_mm: 8,
        escala_fuente: 'compacto',
        titulo_documento: 'LIBRO DE VENTAS FISCALES (SENIAT)',
        subtitulo_documento: 'Reglamento de la Ley del IVA — Art. 76 y 77 (Venezuela)',
        columnas: {
          num_oper: true, fecha: true, rif_cedula: true, razon_social: true,
          num_factura: true, num_control: true, nota_deb_cred: true, factura_afectada: true, tipo_transaccion: true,
          total_ventas_iva: true, ventas_exentas: true, base_imponible: true,
          alicuota_iva: true, debito_fiscal_iva: true, iva_retenido: true, igtf_percibido: true, equiv_usd: true
        },
        mostrar_desglose_pagos: false,
        mostrar_firmas: true,
        firmas: ['Elaborado por', 'Revisado / Contador Público', 'Gerencia / Representante Legal'],
        texto_pie_pagina: 'Libro auxiliar de ventas conforme a normativa SENIAT vigente.'
      })
    },
    {
      doc_type: 'libro_compras_seniat',
      categoria: 'Libros SENIAT',
      etiqueta: 'Libro de Compras SENIAT',
      icono: 'fa-file-contract',
      colsMeta: [
        { key: 'num_oper', label: 'N° Oper' },
        { key: 'fecha', label: 'Fecha' },
        { key: 'rif_proveedor', label: 'RIF Proveedor' },
        { key: 'razon_social', label: 'Razón Social' },
        { key: 'num_factura', label: 'N° Factura' },
        { key: 'num_control', label: 'N° Control' },
        { key: 'num_planilla_import', label: 'N° Planilla Import' },
        { key: 'total_compras_iva', label: 'Total Compras c/IVA' },
        { key: 'compras_exentas', label: 'Compras Exentas' },
        { key: 'base_imponible', label: 'Base Imponible' },
        { key: 'alicuota_iva', label: '% Alícuota' },
        { key: 'credito_fiscal_iva', label: 'Crédito Fiscal IVA' },
        { key: 'retencion_iva', label: 'Retención IVA' },
        { key: 'equiv_usd', label: 'Equiv. USD' }
      ],
      defaults: makeDefaultFmt('libro_compras_seniat', 'Libros SENIAT', 'Libro de Compras SENIAT', {
        orientacion: 'landscape',
        margen_mm: 8,
        escala_fuente: 'compacto',
        titulo_documento: 'LIBRO DE COMPRAS FISCALES (SENIAT)',
        subtitulo_documento: 'Reglamento de la Ley del IVA — Art. 75 (Venezuela)',
        columnas: {
          num_oper: true, fecha: true, rif_proveedor: true, razon_social: true,
          num_factura: true, num_control: true, num_planilla_import: false,
          total_compras_iva: true, compras_exentas: true, base_imponible: true,
          alicuota_iva: true, credito_fiscal_iva: true, retencion_iva: true, equiv_usd: true
        },
        mostrar_desglose_pagos: false,
        mostrar_firmas: true,
        firmas: ['Elaborado por', 'Revisado / Contador Público', 'Gerencia / Representante Legal'],
        texto_pie_pagina: 'Libro auxiliar de compras conforme a normativa SENIAT vigente.'
      })
    },
    {
      doc_type: 'libro_inventario_art177',
      categoria: 'Libros SENIAT',
      etiqueta: 'Libro de Inventario Art. 177 R-LISLR',
      icono: 'fa-landmark',
      colsMeta: [
        { key: 'codigo', label: 'Código' },
        { key: 'descripcion', label: 'Descripción' },
        { key: 'unid_inicial', label: 'Unid. Inicial' },
        { key: 'costo_inicial', label: 'Costo Inicial' },
        { key: 'entradas_cant_monto', label: 'Entradas Cant / Monto' },
        { key: 'salidas_cant_monto', label: 'Salidas Cant / Monto' },
        { key: 'unid_final', label: 'Unid. Final' },
        { key: 'costo_cpp', label: 'Costo CPP' },
        { key: 'valor_final_bs_usd', label: 'Valor Final Bs / USD' }
      ],
      defaults: makeDefaultFmt('libro_inventario_art177', 'Libros SENIAT', 'Libro de Inventario Art. 177 R-LISLR', {
        orientacion: 'landscape',
        margen_mm: 8,
        escala_fuente: 'compacto',
        titulo_documento: 'LIBRO DE INVENTARIO DE MERCANCÍAS (ART. 177 R-LISLR)',
        subtitulo_documento: 'Registro Detallado Mensual de Entradas, Salidas y Existencias Valoradas',
        columnas: {
          codigo: true, descripcion: true, unid_inicial: true, costo_inicial: true,
          entradas_cant_monto: true, salidas_cant_monto: true,
          unid_final: true, costo_cpp: true, valor_final_bs_usd: true
        },
        mostrar_desglose_pagos: false,
        mostrar_firmas: true,
        firmas: ['Almacén / Inventario', 'Contador Público', 'Representante Legal'],
        texto_pie_pagina: 'Registro emitido en cumplimiento del Artículo 177 del Reglamento de la LISLR.'
      })
    },

    // --- REPORTES GERENCIALES & ESTADOS DE CUENTA ---
    {
      doc_type: 'kardex',
      categoria: 'Reportes',
      etiqueta: 'Kardex Físico y Valorado CPP',
      icono: 'fa-layer-group',
      colsMeta: [
        { key: 'fecha', label: 'Fecha' },
        { key: 'tipo_mov', label: 'Tipo Movimiento' },
        { key: 'documento', label: 'Documento / Ref' },
        { key: 'tercero', label: 'Tercero' },
        { key: 'concepto', label: 'Concepto' },
        { key: 'entradas', label: 'Entradas (Cant/Total)' },
        { key: 'salidas', label: 'Salidas (Cant/Total)' },
        { key: 'saldo_cant', label: 'Saldo Unidades' },
        { key: 'costo_cpp', label: 'Costo Unit. / CPP' },
        { key: 'saldo_valor', label: 'Saldo Valor ($)' }
      ],
      defaults: makeDefaultFmt('kardex', 'Reportes', 'Kardex Físico y Valorado CPP', {
        orientacion: 'landscape',
        margen_mm: 8,
        escala_fuente: 'compacto',
        titulo_documento: 'KARDEX DETALLADO DE INVENTARIO',
        subtitulo_documento: 'Trazabilidad de Entradas, Salidas y Costo Promedio Ponderado',
        columnas: { fecha: true, tipo_mov: true, documento: true, tercero: true, concepto: true, entradas: true, salidas: true, saldo_cant: true, costo_cpp: true, saldo_valor: true },
        mostrar_desglose_pagos: false,
        mostrar_firmas: true,
        firmas: ['Elaborado por', 'Auditoría de Inventario'],
        texto_pie_pagina: 'Movimiento auditado desde el libro mayor de inventario.'
      })
    },
    {
      doc_type: 'inventario_valorado',
      categoria: 'Reportes',
      etiqueta: 'Inventario General Valorado',
      icono: 'fa-boxes-stacked',
      colsMeta: [
        { key: 'codigo', label: 'Código' },
        { key: 'descripcion', label: 'Descripción' },
        { key: 'categoria', label: 'Categoría' },
        { key: 'tipo', label: 'Tipo' },
        { key: 'existencia', label: 'Existencia' },
        { key: 'costo_unitario', label: 'Costo Unit.' },
        { key: 'costo_total', label: 'Costo Total' },
        { key: 'precio_venta', label: 'Precio Venta' },
        { key: 'valor_venta', label: 'Valor Venta Total' }
      ],
      defaults: makeDefaultFmt('inventario_valorado', 'Reportes', 'Inventario General Valorado', {
        margen_mm: 10,
        titulo_documento: 'REPORTE GENERAL DE VALORACIÓN DE INVENTARIO',
        subtitulo_documento: 'Catálogo Consolidado con Costo CPP, Precio y Margen Proyectado',
        columnas: { codigo: true, descripcion: true, categoria: true, tipo: true, existencia: true, costo_unitario: true, costo_total: true, precio_venta: true, valor_venta: true },
        mostrar_desglose_pagos: false,
        mostrar_firmas: true,
        firmas: ['Elaborado por', 'Revisado por', 'Gerencia General'],
        texto_pie_pagina: 'Valoración calculada al costo promedio ponderado vigente.'
      })
    },
    {
      doc_type: 'inventario_simple',
      categoria: 'Reportes',
      etiqueta: 'Inventario Rápido de Existencias',
      icono: 'fa-list-check',
      colsMeta: [
        { key: 'codigo', label: 'Código' },
        { key: 'descripcion', label: 'Descripción del Ítem' },
        { key: 'categoria', label: 'Categoría' },
        { key: 'existencia', label: 'Cantidad en Stock' }
      ],
      defaults: makeDefaultFmt('inventario_simple', 'Reportes', 'Inventario Rápido de Existencias', {
        margen_mm: 10,
        titulo_documento: 'INFORME SIMPLIFICADO DE STOCK Y EXISTENCIAS',
        subtitulo_documento: 'Listado Operativo de Conteo Físico de Almacén',
        columnas: { codigo: true, descripcion: true, categoria: true, existencia: true },
        mostrar_desglose_pagos: false,
        mostrar_firmas: true,
        firmas: ['Responsable de Conteo', 'Supervisor de Almacén'],
        texto_pie_pagina: 'Hoja de conteo operativo de almacén.'
      })
    },
    {
      doc_type: 'ventas_diarias',
      categoria: 'Reportes',
      etiqueta: 'Reporte de Ventas Diarias',
      icono: 'fa-calendar-day',
      colsMeta: [
        { key: 'num_factura', label: 'N° Factura' },
        { key: 'hora', label: 'Fecha / Hora' },
        { key: 'cliente', label: 'Cliente' },
        { key: 'condicion', label: 'Condición' },
        { key: 'total_usd', label: 'Total USD' },
        { key: 'equiv_ves', label: 'Equiv. Bs.' },
        { key: 'equiv_cop', label: 'Equiv. COP' },
        { key: 'desglose_pagos', label: 'Desglose de Pagos' }
      ],
      defaults: makeDefaultFmt('ventas_diarias', 'Reportes', 'Reporte de Ventas Diarias', {
        margen_mm: 10,
        titulo_documento: 'REPORTE DE VENTAS DIARIAS',
        subtitulo_documento: 'Desglose de Facturación y Cobros Multimoneda del Día',
        columnas: { num_factura: true, hora: true, cliente: true, condicion: true, total_usd: true, equiv_ves: true, equiv_cop: true, desglose_pagos: true },
        mostrar_equivalente_cop: true,
        mostrar_firmas: true,
        firmas: ['Cajero / Facturación', 'Administración'],
        texto_pie_pagina: 'Consolidado diario de facturación comercial.'
      })
    },
    {
      doc_type: 'ventas_mensuales',
      categoria: 'Reportes',
      etiqueta: 'Reporte Consolidado Mensual',
      icono: 'fa-chart-column',
      colsMeta: [
        { key: 'mes', label: 'Mes' },
        { key: 'num_facturas', label: 'N° Facturas' },
        { key: 'total_usd', label: 'Total USD' },
        { key: 'equiv_ves', label: 'Equivalente Bs.' },
        { key: 'equiv_cop', label: 'Equivalente COP' }
      ],
      defaults: makeDefaultFmt('ventas_mensuales', 'Reportes', 'Reporte Consolidado Mensual', {
        margen_mm: 10,
        titulo_documento: 'REPORTE CONSOLIDADO MENSUAL DE VENTAS',
        subtitulo_documento: 'Evolución Mensual de Ingresos y Volumen de Facturas',
        columnas: { mes: true, num_facturas: true, total_usd: true, equiv_ves: true, equiv_cop: true },
        mostrar_desglose_pagos: false,
        mostrar_equivalente_cop: true,
        mostrar_firmas: true,
        firmas: ['Administración', 'Gerencia General'],
        texto_pie_pagina: 'Resumen gerencial anual de facturación.'
      })
    },
    {
      doc_type: 'estado_cuenta_cxc',
      categoria: 'Reportes',
      etiqueta: 'Estado de Cuenta Clientes (CxC)',
      icono: 'fa-user-clock',
      colsMeta: [
        { key: 'factura', label: 'N° Factura / Doc' },
        { key: 'cliente', label: 'Cliente / Cédula' },
        { key: 'emision', label: 'Emisión' },
        { key: 'vencimiento', label: 'Vencimiento' },
        { key: 'total_usd', label: 'Total USD' },
        { key: 'abonado_usd', label: 'Abonado USD' },
        { key: 'saldo_usd', label: 'Saldo Pendiente' },
        { key: 'saldo_ves', label: 'Saldo Bs.' },
        { key: 'estado', label: 'Estado' }
      ],
      defaults: makeDefaultFmt('estado_cuenta_cxc', 'Reportes', 'Estado de Cuenta Clientes (CxC)', {
        margen_mm: 10,
        titulo_documento: 'ESTADO DE CUENTAS POR COBRAR (CXC)',
        subtitulo_documento: 'Detalle de Créditos, Abonos Aplicados y Saldos Pendientes',
        columnas: { factura: true, cliente: true, emision: true, vencimiento: true, total_usd: true, abonado_usd: true, saldo_usd: true, saldo_ves: true, estado: true },
        mostrar_desglose_pagos: false,
        mostrar_firmas: true,
        firmas: ['Crédito y Cobranza', 'Cliente / Conformidad'],
        texto_pie_pagina: 'Estado de cuenta emitido según registros vigentes de cartera.'
      })
    },
    {
      doc_type: 'estado_cuenta_cxp',
      categoria: 'Reportes',
      etiqueta: 'Estado de Cuenta Proveedores (CxP)',
      icono: 'fa-truck-field',
      colsMeta: [
        { key: 'documento', label: 'Factura / Control' },
        { key: 'proveedor', label: 'Proveedor' },
        { key: 'concepto', label: 'Concepto' },
        { key: 'vencimiento', label: 'Vencimiento' },
        { key: 'total_usd', label: 'Monto Total' },
        { key: 'pagado_usd', label: 'Pagado USD' },
        { key: 'saldo_usd', label: 'Saldo Deudor' },
        { key: 'saldo_ves', label: 'Saldo Bs.' },
        { key: 'estado', label: 'Estado' }
      ],
      defaults: makeDefaultFmt('estado_cuenta_cxp', 'Reportes', 'Estado de Cuenta Proveedores (CxP)', {
        margen_mm: 10,
        titulo_documento: 'ESTADO DE CUENTAS POR PAGAR (CXP)',
        subtitulo_documento: 'Detalle de Obligaciones, Pagos Realizados y Saldo a Proveedores',
        columnas: { documento: true, proveedor: true, concepto: true, vencimiento: true, total_usd: true, pagado_usd: true, saldo_usd: true, saldo_ves: true, estado: true },
        mostrar_desglose_pagos: false,
        mostrar_firmas: true,
        firmas: ['Tesorería / Cuentas por Pagar', 'Contabilidad'],
        texto_pie_pagina: 'Estado de pasivos comerciales emitido por tesorería.'
      })
    }
  ];

  const REGISTRY_MAP = DOCUMENT_REGISTRY.reduce(function (acc, item) {
    acc[item.doc_type] = item;
    return acc;
  }, {});

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function fmtVes(num) {
    return parseFloat(num || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtCop(num) {
    return Math.round(parseFloat(num || 0)).toLocaleString('es-CO');
  }

  const MasterReportLayout = {
    DOCUMENT_REGISTRY: DOCUMENT_REGISTRY,
    REGISTRY_MAP: REGISTRY_MAP,

    defaultPrintConfig: deepClone(REGISTRY_MAP.factura_a4.defaults),
    formatsMap: {},
    activePrintConfig: null,

    sanitizeCss: function (cssText) {
      if (!cssText) return '';
      let s = String(cssText);
      s = s.replace(/<\/?\s*script[^>]*>/gi, '');
      s = s.replace(/<\/?\s*style[^>]*>/gi, '');
      s = s.replace(/expression\s*\(/gi, '/*blocked*/(');
      s = s.replace(/javascript\s*:/gi, 'blocked:');
      s = s.replace(/vbscript\s*:/gi, 'blocked:');
      s = s.replace(/@import\b/gi, '/*@import*/');
      s = s.replace(/behavior\s*:/gi, '/*behavior*/:');
      s = s.replace(/[<>]/g, '');
      return s.slice(0, 4000).trim();
    },

    cargarFormatos: async function () {
      try {
        const res = await fetch('/api/formatos');
        if (res.ok) {
          const payload = await res.json();
          const map = payload.formatos || payload || {};
          this.formatsMap = map;
          if (map.factura_a4) {
            this.activePrintConfig = deepClone(map.factura_a4);
          }
          return this.formatsMap;
        }
      } catch (e) {
        console.warn('[MasterReportLayout] Usando formatos por defecto:', e);
      }
      // Fallback limpio a defaults de fábrica
      const fallback = {};
      DOCUMENT_REGISTRY.forEach(r => { fallback[r.doc_type] = deepClone(r.defaults); });
      this.formatsMap = fallback;
      this.activePrintConfig = deepClone(fallback.factura_a4);
      return this.formatsMap;
    },

    cargarConfigImpresion: async function () {
      const all = await this.cargarFormatos();
      return all.factura_a4 || deepClone(this.defaultPrintConfig);
    },

    getDocFormat: function (docType, customOverride) {
      const reg = REGISTRY_MAP[docType] || REGISTRY_MAP.factura_a4;
      const base = deepClone(reg.defaults);
      const stored = (this.formatsMap && this.formatsMap[docType]) ? this.formatsMap[docType] : {};
      const legacy = (!this.formatsMap || !this.formatsMap[docType]) ? (this.activePrintConfig || {}) : {};
      const over = customOverride || {};

      const mergedCols = Object.assign({}, base.columnas || {}, stored.columnas || {}, over.columnas || {});
      const merged = Object.assign({}, base, legacy, stored, over);
      merged.columnas = mergedCols;

      // Sincronizar banderas legacy si fueron pasadas manualmente en override
      if (over.mostrar_sku !== undefined && 'sku' in merged.columnas && (!over.columnas || over.columnas.sku === undefined)) {
        merged.columnas.sku = Boolean(over.mostrar_sku);
      }
      if (over.mostrar_vendedor !== undefined && 'vendedor' in merged.columnas && (!over.columnas || over.columnas.vendedor === undefined)) {
        merged.columnas.vendedor = Boolean(over.mostrar_vendedor);
      }
      if (over.mostrar_descuento_linea !== undefined && 'descuento' in merged.columnas && (!over.columnas || over.columnas.descuento === undefined)) {
        merged.columnas.descuento = Boolean(over.mostrar_descuento_linea);
      }

      if (!Array.isArray(merged.firmas)) {
        merged.firmas = deepClone(base.firmas);
      }
      return merged;
    },

    getPrintConfig: function (customConfig) {
      return this.getDocFormat('factura_a4', customConfig);
    },

    getIniciales: function (str) {
      if (!str || typeof str !== 'string') return 'TC';
      const clean = str.replace(/[^a-zA-Z0-9\s]/g, '').trim();
      const parts = clean.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return clean.substring(0, 2).toUpperCase() || 'TC';
    },

    escapeHtml: function (text) {
      if (text === null || text === undefined) return '';
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    },

    getPageCssRule: function (fmt) {
      const paper = fmt.tamano_papel || 'letter';
      const orient = fmt.orientacion === 'landscape' ? 'landscape' : 'portrait';
      const margin = Number.isFinite(Number(fmt.margen_mm)) ? Math.max(0, Math.min(40, Number(fmt.margen_mm))) : 10;

      if (paper === 'ticket_80') return `@page { size: 80mm auto; margin: ${margin}mm 1.5mm; }`;
      if (paper === 'ticket_58') return `@page { size: 58mm auto; margin: ${margin}mm 1mm; }`;

      let sizeToken = 'letter';
      if (paper === 'a4') sizeToken = 'A4';
      else if (paper === 'legal') sizeToken = 'legal';
      else if (paper === 'half_letter') {
        sizeToken = orient === 'landscape' ? '8.5in 5.5in' : '5.5in 8.5in';
        return `@page { size: ${sizeToken}; margin: ${margin}mm; }`;
      }
      return `@page { size: ${sizeToken} ${orient}; margin: ${margin}mm; }`;
    },

    getSheetWidthCss: function (fmt) {
      const paper = fmt.tamano_papel || 'letter';
      if (paper === 'ticket_58') return '216px';
      if (paper === 'ticket_80') return '298px';
      if (fmt.orientacion === 'landscape') return '1040px';
      if (paper === 'half_letter') return '520px';
      return '780px';
    },

    getScopedStyleBlock: function (fmt, scopeClass) {
      const f = fmt || this.getDocFormat('factura_a4');
      const pageRule = this.getPageCssRule(f);
      const fontFamily = FONT_FAMILY_MAP[f.familia_fuente] || FONT_FAMILY_MAP.sans;
      const baseFontSize = FONT_SCALE_MAP[f.escala_fuente] || FONT_SCALE_MAP.normal;
      const customCss = this.sanitizeCss(f.css_personalizado);

      return `
        <style>
          ${pageRule}
          .${scopeClass} {
            font-family: ${fontFamily};
            font-size: ${baseFontSize};
            color: #0f172a;
            box-sizing: border-box;
            background: #ffffff;
          }
          .${scopeClass} table { width: 100%; border-collapse: collapse; }
          .${scopeClass} thead { display: table-header-group; }
          .${scopeClass} tfoot { display: table-footer-group; }
          .${scopeClass} tr, .${scopeClass} .avoid-page-break { page-break-inside: avoid; break-inside: avoid; }
          ${f.zebra_striping ? `.${scopeClass} table.mrl-table tbody tr:nth-child(even) { background-color: #f8fafc; }` : ''}
          @media print {
            .${scopeClass} { width: 100% !important; max-width: 100% !important; padding: 0 !important; margin: 0 !important; box-shadow: none !important; }
          }
          ${customCss}
        </style>
      `;
    },

    /**
     * Renderizador Universal de Encabezado (Alineación real Izquierda / Centro / Derecha).
     */
    renderUniversalHeader: function (meta, configTenant, fmt) {
      const t = configTenant || {};
      const m = meta || {};
      const f = fmt || this.getDocFormat('factura_a4');
      const esc = this.escapeHtml;

      const colorPrim = f.color_primario || '#0f172a';
      const colorSec = f.color_secundario || '#0284c7';
      const nombre = (t.nombre_negocio || 'Mi Empresa Comercial').trim();
      const rif = (f.mostrar_rif !== false && t.documento_fiscal) ? `RIF / NIT: ${esc(t.documento_fiscal)}` : '';
      const telefono = (f.mostrar_telefono !== false && t.telefono) ? `Tel: ${esc(t.telefono)}` : '';
      const direccion = (f.mostrar_direccion !== false && t.direccion) ? esc(t.direccion) : '';
      const contactoParts = [telefono, direccion].filter(Boolean).join(' &bull; ');

      const tituloDoc = esc(f.titulo_documento || m.tipo || 'DOCUMENTO OFICIAL');
      const subtituloDoc = esc(f.subtitulo_documento || m.subtitulo || '');
      const numeroDoc = m.numero ? `N° ${esc(m.numero)}` : '';
      const fechaDoc = m.fecha ? esc(m.fecha) : new Date().toLocaleDateString('es-VE');
      const tasaVes = parseFloat(t.tasa_ves || 0);
      const tasaCop = parseFloat(t.tasa_cop || 0);

      let logoHtml = '';
      if (f.mostrar_logo !== false) {
        const logoH = LOGO_HEIGHT_MAP[f.logo_tamano] || LOGO_HEIGHT_MAP.md;
        if (t.logo_url) {
          logoHtml = `<img src="${esc(t.logo_url)}" alt="${esc(nombre)}" style="height: ${logoH}; max-height: ${logoH}; max-width: 190px; width: auto; object-fit: contain; display: block;">`;
        } else {
          const boxSize = f.logo_tamano === 'sm' ? '36px' : (f.logo_tamano === 'lg' ? '64px' : '48px');
          const fontSize = f.logo_tamano === 'sm' ? '14px' : (f.logo_tamano === 'lg' ? '24px' : '18px');
          logoHtml = `
            <div style="width: ${boxSize}; height: ${boxSize}; border-radius: 8px; background: ${colorPrim}; color: #ffffff; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: ${fontSize}; flex-shrink: 0;">
              ${this.getIniciales(nombre)}
            </div>
          `;
        }
      }

      const tasasMetaHtml = f.mostrar_tasas_cambio !== false && (tasaVes > 0 || tasaCop > 0)
        ? `<div style="font-size: 9.5px; color: #64748b; margin-top: 2px;">Tasas Ref.: BCV ${tasaVes.toFixed(2)} Bs.${tasaCop > 0 ? ` | TRM ${Math.round(tasaCop).toLocaleString('es-CO')} COP` : ''}</div>`
        : '';

      const metaExtraBadge = m.extraMetaHtml ? `<div style="margin-top: 3px; font-size: 10px; color: #475569;">${m.extraMetaHtml}</div>` : '';

      const badgeHtml = `
        <div style="display: inline-block; background: ${colorPrim}; color: #ffffff; padding: 5px 12px; border-radius: 6px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">
          ${tituloDoc}${numeroDoc ? ` &bull; ${numeroDoc}` : ''}
        </div>
        ${subtituloDoc ? `<div style="font-size: 10.5px; font-weight: 700; color: ${colorSec}; margin-top: 4px;">${subtituloDoc}</div>` : ''}
        ${f.mostrar_fecha_impresion !== false ? `<div style="font-size: 10px; color: #475569; margin-top: 2px;"><strong>Emisión:</strong> ${fechaDoc}</div>` : ''}
        ${tasasMetaHtml}
        ${metaExtraBadge}
      `;

      const empresaInfoHtml = `
        <div>
          <h1 style="margin: 0; font-size: 18px; font-weight: 900; color: #0f172a; text-transform: uppercase; letter-spacing: -0.3px; line-height: 1.15;">
            ${esc(nombre)}
          </h1>
          ${rif ? `<div style="margin: 2px 0; font-size: 11px; font-weight: 700; color: #334155; font-family: monospace;">${rif}</div>` : ''}
          ${contactoParts ? `<div style="font-size: 10px; color: #64748b; line-height: 1.35;">${contactoParts}</div>` : ''}
        </div>
      `;

      const extraHeaderBanner = f.texto_encabezado_extra
        ? `<div style="background: #f8fafc; border-left: 3px solid ${colorSec}; padding: 5px 10px; margin-bottom: 10px; font-size: 10px; color: #334155; font-weight: 600;">${esc(f.texto_encabezado_extra)}</div>`
        : '';

      const align = f.logo_alineacion || 'izquierda';
      let headerBody = '';

      if (align === 'centro') {
        headerBody = `
          <div class="mrl-header mrl-logo-centro" data-logo-align="centro" style="border-bottom: 2px solid ${colorPrim}; padding-bottom: 12px; margin-bottom: 14px; text-align: center;">
            ${logoHtml ? `<div style="display: flex; justify-content: center; margin-bottom: 6px;">${logoHtml}</div>` : ''}
            ${empresaInfoHtml}
            <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed #cbd5e1;">
              ${badgeHtml}
            </div>
          </div>
        `;
      } else if (align === 'derecha') {
        headerBody = `
          <div class="mrl-header mrl-logo-derecha" data-logo-align="derecha" style="display: flex; justify-content: space-between; align-items: center; gap: 16px; border-bottom: 2px solid ${colorPrim}; padding-bottom: 12px; margin-bottom: 14px;">
            <div style="text-align: left; max-width: 42%;">
              ${badgeHtml}
            </div>
            <div style="display: flex; align-items: center; flex-direction: row-reverse; gap: 12px; text-align: right; max-width: 58%;">
              ${logoHtml}
              ${empresaInfoHtml}
            </div>
          </div>
        `;
      } else {
        headerBody = `
          <div class="mrl-header mrl-logo-izquierda" data-logo-align="izquierda" style="display: flex; justify-content: space-between; align-items: center; gap: 16px; border-bottom: 2px solid ${colorPrim}; padding-bottom: 12px; margin-bottom: 14px;">
            <div style="display: flex; align-items: center; gap: 12px; text-align: left; max-width: 58%;">
              ${logoHtml}
              ${empresaInfoHtml}
            </div>
            <div style="text-align: right; max-width: 42%;">
              ${badgeHtml}
            </div>
          </div>
        `;
      }

      return headerBody + extraHeaderBanner;
    },

    renderHeader: function (tenant, meta, printConfig) {
      return this.renderUniversalHeader(meta, tenant, this.getDocFormat('catalogo_productos', printConfig));
    },

    renderUniversalFooter: function (configTenant, fmt) {
      const t = configTenant || {};
      const f = fmt || this.getDocFormat('factura_a4');
      const esc = this.escapeHtml;
      const colorPrim = f.color_primario || '#0f172a';
      const nombreEmpresa = (t.nombre_negocio || 'Mi Empresa Comercial').trim();

      let bancosHtml = '';
      if (f.mostrar_cuentas_bancarias && f.texto_cuentas_bancarias) {
        bancosHtml = `
          <div class="avoid-page-break" style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; margin-top: 12px; font-size: 10px; color: #334155;">
            <strong style="color: ${colorPrim}; text-transform: uppercase; font-size: 9px; display: block; margin-bottom: 2px;">Datos Bancarios / Cuentas de Pago</strong>
            <div style="white-space: pre-line;">${esc(f.texto_cuentas_bancarias)}</div>
          </div>
        `;
      }

      let firmasHtml = '';
      const firmasList = Array.isArray(f.firmas) ? f.firmas.filter(x => String(x || '').trim()) : [];
      if (f.mostrar_firmas && firmasList.length > 0) {
        const cols = Math.min(3, firmasList.length);
        firmasHtml = `
          <div class="avoid-page-break" style="display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 28px; margin-top: 32px; padding-top: 8px; text-align: center; font-size: 10px; color: #475569;">
            ${firmasList.slice(0, 3).map(lbl => `
              <div>
                <div style="border-top: 1px solid #64748b; width: 85%; margin: 0 auto; padding-top: 5px; font-weight: 800; color: #0f172a; text-transform: uppercase; font-size: 9.5px;">
                  ${esc(lbl)}
                </div>
                <span style="font-size: 8.5px; color: #94a3b8;">Firma y Sello</span>
              </div>
            `).join('')}
          </div>
        `;
      }

      const saasHtml = f.mostrar_marca_saas !== false
        ? `<div style="margin-top: 6px; font-size: 8.5px; color: #94a3b8; text-align: center;">Generado por <strong style="color: #64748b;">TAVO CLOUD</strong> | www.tavocloud.com</div>`
        : '';

      const pageMark = f.mostrar_paginacion !== false
        ? `<span>Emisión Digital Oficial</span>`
        : '';

      return `
        ${bancosHtml}
        ${firmasHtml}
        <footer class="master-footer avoid-page-break" style="border-top: 1px solid #e2e8f0; padding-top: 10px; margin-top: 16px; font-size: 9.5px; color: #64748b;">
          ${f.texto_pie_pagina ? `<div style="text-align: center; font-weight: 600; color: #334155; margin-bottom: 6px;">${esc(f.texto_pie_pagina)}</div>` : ''}
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 8.5px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 4px;">
            <div>${esc(nombreEmpresa)} &bull; Documento Oficial</div>
            ${pageMark}
          </div>
          ${saasHtml}
        </footer>
      `;
    },

    renderFooter: function (tenant, printConfig) {
      return this.renderUniversalFooter(tenant, this.getDocFormat('factura_a4', printConfig));
    },

    /**
     * Motor Universal de Tablas Dinámicas (SENIAT, Reportes, Kardex, CxC/CxP, Facturas/Pedidos).
     */
    renderTablaUniversal: function (docType, meta, columnsDef, rows, totals, configTenant, customFmt) {
      const fmt = this.getDocFormat(docType, customFmt);
      const esc = this.escapeHtml;
      const scopeClass = `mrl-doc-${docType.replace(/[^a-zA-Z0-9_-]/g, '')}`;
      const pad = ROW_PAD_MAP[fmt.densidad_filas] || ROW_PAD_MAP.normal;
      const colorPrim = fmt.color_primario || '#0f172a';
      const widthCss = this.getSheetWidthCss(fmt);
      const marginPx = fmt.orientacion === 'landscape' ? '18px 20px' : '20px 24px';

      const visibleCols = (columnsDef || []).filter(col => !fmt.columnas || fmt.columnas[col.key] !== false);
      const headerHtml = this.renderUniversalHeader(meta || {}, configTenant || {}, fmt);

      let kpiStripHtml = '';
      if (meta && Array.isArray(meta.kpis) && meta.kpis.length > 0) {
        const colsKpi = Math.min(4, meta.kpis.length);
        kpiStripHtml = `
          <div class="avoid-page-break" style="display: grid; grid-template-columns: repeat(${colsKpi}, 1fr); gap: 8px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; margin-bottom: 12px; text-align: center;">
            ${meta.kpis.map(k => `
              <div>
                <div style="font-size: 8.5px; font-weight: 800; text-transform: uppercase; color: #64748b;">${esc(k.label)}</div>
                <div style="font-size: 13px; font-weight: 900; color: ${k.color || '#0f172a'}; margin-top: 2px;">${esc(k.value)}</div>
                ${k.sub ? `<div style="font-size: 9px; color: #64748b;">${esc(k.sub)}</div>` : ''}
              </div>
            `).join('')}
          </div>
        `;
      }

      const infoCardHtml = meta && meta.infoCardHtml ? meta.infoCardHtml : '';

      const thHtml = visibleCols.map(c => {
        const align = c.align || 'left';
        const w = c.width ? `width: ${c.width};` : '';
        return `<th style="${w} text-align: ${align}; padding: ${pad}; font-size: 9px; text-transform: uppercase; letter-spacing: 0.3px;">${esc(c.label)}</th>`;
      }).join('');

      const rowsArr = Array.isArray(rows) ? rows : [];
      let tbodyHtml = '';
      if (rowsArr.length === 0) {
        tbodyHtml = `<tr><td colspan="${Math.max(1, visibleCols.length)}" style="text-align: center; padding: 18px; color: #94a3b8; font-style: italic;">No hay registros para mostrar en este período.</td></tr>`;
      } else {
        tbodyHtml = rowsArr.map((r, idx) => {
          const rowBg = (r && r._highlightRow) ? 'background-color: #fef2f2; color: #881337;' : '';
          const tds = visibleCols.map(col => {
            const align = col.align || 'left';
            const rawVal = typeof col.render === 'function' ? col.render(r, idx) : esc(r[col.key] !== undefined && r[col.key] !== null ? r[col.key] : '-');
            const styleExtra = col.cellStyle ? col.cellStyle(r) : (col.mono ? 'font-family: monospace;' : '');
            return `<td style="text-align: ${align}; padding: ${pad}; border-bottom: 1px solid #e2e8f0; ${styleExtra}">${rawVal}</td>`;
          }).join('');
          return `<tr style="${rowBg}">${tds}</tr>`;
        }).join('');
      }

      let tfootHtml = '';
      if (totals && typeof totals === 'object' && visibleCols.length > 0) {
        const totTds = visibleCols.map((col, idx) => {
          const align = col.align || 'left';
          if (idx === 0 && totals._label && totals[col.key] === undefined) {
            return `<td style="text-align: left; padding: ${pad}; font-weight: 900; text-transform: uppercase;">${esc(totals._label)}</td>`;
          }
          const val = totals[col.key] !== undefined ? totals[col.key] : '';
          return `<td style="text-align: ${align}; padding: ${pad}; font-weight: 900; font-family: monospace;">${val}</td>`;
        }).join('');
        tfootHtml = `
          <tfoot>
            <tr style="background: #f1f5f9; border-top: 2px solid ${colorPrim}; color: #0f172a;">
              ${totTds}
            </tr>
          </tfoot>
        `;
      }

      const tableHtml = visibleCols.length > 0 ? `
        <table class="mrl-table" style="width: 100%; border-collapse: collapse; margin-bottom: 12px; border: 1px solid #e2e8f0;">
          <thead>
            <tr style="background-color: ${colorPrim}; color: #ffffff;">
              ${thHtml}
            </tr>
          </thead>
          <tbody>
            ${tbodyHtml}
          </tbody>
          ${tfootHtml}
        </table>
      ` : '';

      const extraBottomHtml = meta && meta.extraBottomHtml ? meta.extraBottomHtml : '';
      const footerHtml = this.renderUniversalFooter(configTenant || {}, fmt);

      return `
        ${this.getScopedStyleBlock(fmt, scopeClass)}
        <div class="doc-sheet mrl-doc-root ${scopeClass}" style="width: ${widthCss}; max-width: 100%; padding: ${marginPx}; margin: 0 auto;">
          ${meta && meta.anuladaBanner ? meta.anuladaBanner : ''}
          ${headerHtml}
          ${infoCardHtml}
          ${kpiStripHtml}
          ${tableHtml}
          ${extraBottomHtml}
          ${footerHtml}
        </div>
      `;
    },

    // Helper para bloques de totales multimoneda en documentos comerciales (Factura/Pedido/Devolución)
    _buildTotalsMultiMonedaHtml: function (obj, fmt, configTenant, labelTotal) {
      const d = obj || {};
      const cfg = configTenant || {};
      const colorPrim = fmt.color_primario || '#0f172a';
      const tasaVes = parseFloat(d.tasa_ves || cfg.tasa_ves || 0);
      const tasaCop = parseFloat(d.tasa_cop || cfg.tasa_cop || 0);
      const subtotal = parseFloat(d.subtotal || d.subtotal_usd || 0);
      const iva = parseFloat(d.iva_total || d.iva_usd || 0);
      const totalUsd = parseFloat(d.total_usd || d.total || 0);
      const totalVes = parseFloat(d.total_ves || (totalUsd * tasaVes) || 0);
      const totalCop = parseFloat(d.total_cop || (totalUsd * tasaCop) || 0);

      return `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; font-size: 11px;">
          <div style="display: flex; justify-content: space-between; padding: 2px 0; color: #475569;">
            <span>Subtotal Base:</span>
            <strong style="font-family: monospace;">$${subtotal.toFixed(2)}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 2px 0; color: #475569;">
            <span>IVA Total:</span>
            <strong style="font-family: monospace;">$${iva.toFixed(2)}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0 3px 0; border-top: 2px solid ${colorPrim}; margin-top: 4px; font-size: 13.5px; font-weight: 900; color: #0f172a;">
            <span>${this.escapeHtml(labelTotal || 'TOTAL USD')}:</span>
            <span style="font-family: monospace;">$${totalUsd.toFixed(2)}</span>
          </div>
          ${fmt.mostrar_equivalente_ves !== false && totalVes > 0 ? `
            <div style="display: flex; justify-content: space-between; padding: 2px 0; font-size: 10px; color: #334155; border-top: 1px dotted #cbd5e1; margin-top: 4px; padding-top: 4px;">
              <span>Equiv. Bolívares (${tasaVes.toFixed(2)}):</span>
              <strong style="font-family: monospace;">${fmtVes(totalVes)} Bs.</strong>
            </div>
          ` : ''}
          ${fmt.mostrar_equivalente_cop && totalCop > 0 ? `
            <div style="display: flex; justify-content: space-between; padding: 2px 0; font-size: 10px; color: #334155;">
              <span>Equiv. Pesos COP (${Math.round(tasaCop).toLocaleString('es-CO')}):</span>
              <strong style="font-family: monospace;">${fmtCop(totalCop)} COP</strong>
            </div>
          ` : ''}
        </div>
      `;
    },

    _buildPagosBreakdownHtml: function (pagos, isCredito, saldoPendiente, notas) {
      const esc = this.escapeHtml;
      const pList = Array.isArray(pagos) ? pagos : [];
      let rows = '';
      if (pList.length > 0) {
        rows = pList.map(p => {
          const metodo = esc(p.metodo || p.metodo_pago || 'Pago');
          const mon = esc(p.moneda || 'USD');
          const montoM = mon === 'COP' ? fmtCop(p.monto_moneda) : parseFloat(p.monto_moneda || 0).toFixed(2);
          const eq = parseFloat(p.equivalente_usd || 0).toFixed(2);
          const ref = p.referencia ? ` (Ref: ${esc(p.referencia)})` : '';
          return `
            <div style="display: flex; justify-content: space-between; padding: 2px 0; font-size: 10px; color: #334155;">
              <span>&bull; ${metodo} (${mon}):</span>
              <span><strong>${montoM} ${mon}</strong> (≈ $${eq})${ref}</span>
            </div>
          `;
        }).join('');
      } else {
        rows = `<div style="font-size: 10px; color: #64748b; font-style: italic;">${isCredito ? 'Operación a crédito sin abono inicial.' : 'Sin desglose de pagos registrado.'}</div>`;
      }

      return `
        <div>
          <div style="border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 8px; padding: 8px 12px; margin-bottom: 6px;">
            <span style="font-size: 9.5px; font-weight: 800; text-transform: uppercase; color: #475569; display: block; margin-bottom: 4px;">Desglose de Pagos / Abonos</span>
            ${rows}
            ${isCredito && saldoPendiente !== undefined ? `
              <div style="border-top: 1px solid #cbd5e1; margin-top: 4px; padding-top: 4px; display: flex; justify-content: space-between; font-weight: 800; color: #b91c1c; font-size: 10.5px;">
                <span>Saldo Pendiente:</span>
                <span>$${parseFloat(saldoPendiente || 0).toFixed(2)}</span>
              </div>
            ` : ''}
          </div>
          ${notas ? `<div style="border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 10px; font-size: 10px; color: #475569;"><strong>Observaciones:</strong> ${esc(notas)}</div>` : ''}
        </div>
      `;
    },

    // Renderizador de Tickets Térmicos Monocromáticos (80mm / 58mm)
    _renderThermalTicket: function (docType, data, configTenant, fmt) {
      const t = configTenant || {};
      const esc = this.escapeHtml;
      const scopeClass = `mrl-ticket-${docType.replace(/[^a-zA-Z0-9_-]/g, '')}`;
      const widthCss = fmt.tamano_papel === 'ticket_58' ? '216px' : '296px';
      const fontSz = fmt.tamano_papel === 'ticket_58' ? '9px' : '10px';
      const nombreEmpresa = (t.nombre_negocio || 'Mi Negocio').trim();
      const align = fmt.logo_alineacion || 'centro';
      const textAlign = align === 'derecha' ? 'right' : (align === 'izquierda' ? 'left' : 'center');

      let logoHtml = '';
      if (fmt.mostrar_logo && t.logo_url) {
        const lh = fmt.logo_tamano === 'sm' ? '28px' : (fmt.logo_tamano === 'lg' ? '52px' : '38px');
        logoHtml = `<img src="${esc(t.logo_url)}" alt="Logo" style="max-height: ${lh}; max-width: 140px; object-fit: contain; margin-bottom: 4px; display: inline-block;">`;
      }

      const d = data || {};
      let bodySection = '';

      if (docType === 'cierre_z_ticket') {
        const tr = d.turno || {};
        const difs = (d.diferencias && d.diferencias.por_metodo) ? d.diferencias.por_metodo : {};
        const totMon = (d.diferencias && d.diferencias.totales_moneda) ? d.diferencias.totales_moneda : {};

        let lineasMetodos = '';
        if (fmt.columnas.detalle_metodos !== false) {
          for (const [k, dv] of Object.entries(difs)) {
            if (dv.esperado > 0 || dv.declarado > 0) {
              const shortName = k.replace(/_usd|_ves|_cop/g, '').toUpperCase();
              const mon = k.endsWith('_usd') ? 'USD' : (k.endsWith('_ves') ? 'VES' : 'COP');
              lineasMetodos += `
                <div style="display: flex; justify-content: space-between;">
                  <span>${esc(shortName)} (${mon}):</span>
                  <strong>$${parseFloat(dv.declarado || 0).toFixed(2)}</strong>
                </div>
                ${fmt.columnas.diferencias !== false ? `
                  <div style="display: flex; justify-content: space-between; font-size: 8.5px; color: #333; margin-bottom: 2px;">
                    <span>Teor: $${parseFloat(dv.esperado || 0).toFixed(2)}</span>
                    <span>Dif: ${dv.diferencia >= 0 ? '+' : ''}${parseFloat(dv.diferencia || 0).toFixed(2)} (${esc(dv.estado)})</span>
                  </div>
                ` : ''}
              `;
            }
          }
        }

        bodySection = `
          <div style="text-align: center; font-weight: 900; font-size: 11px; margin-top: 3px;">${esc(fmt.titulo_documento)}</div>
          <div style="text-align: center; font-size: 10px; border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 4px;">
            TURNO #${esc(String(tr.id || '0').padStart(6, '0'))}
          </div>
          <div style="font-size: 9px; line-height: 1.3; border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 4px;">
            <div>CAJA: ${esc(tr.caja_nombre || 'Caja Principal')}</div>
            <div>CAJERO: ${esc(tr.usuario_nombre || tr.username || 'Operador')}</div>
            <div>APERTURA: ${esc((tr.fecha_apertura || '-').substring(0, 16))}</div>
            <div>CIERRE: ${esc((tr.fecha_cierre || '-').substring(0, 16))}</div>
          </div>
          ${fmt.columnas.conciliacion_divisas !== false ? `
            <div style="font-weight: bold; border-bottom: 1px dotted #000; padding-bottom: 2px; margin-bottom: 3px;">CONCILIACIÓN POR DIVISA</div>
            <div style="border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 4px; line-height: 1.35;">
              <div style="display: flex; justify-content: space-between;"><span>USD ESPERADO:</span><span>$${parseFloat(totMon.USD?.esperado || 0).toFixed(2)}</span></div>
              <div style="display: flex; justify-content: space-between; font-weight: bold;"><span>USD DECLARADO:</span><span>$${parseFloat(totMon.USD?.declarado || 0).toFixed(2)}</span></div>
              <div style="display: flex; justify-content: space-between; border-top: 1px dotted #888; margin-top: 2px; padding-top: 2px;"><span>VES ESPERADO:</span><span>Bs.${fmtVes(totMon.VES?.esperado || 0)}</span></div>
              <div style="display: flex; justify-content: space-between; font-weight: bold;"><span>VES DECLARADO:</span><span>Bs.${fmtVes(totMon.VES?.declarado || 0)}</span></div>
            </div>
          ` : ''}
          ${lineasMetodos ? `
            <div style="font-weight: bold; border-bottom: 1px dotted #000; padding-bottom: 2px; margin-bottom: 3px;">DETALLE FORMA DE PAGO</div>
            <div style="border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 6px;">${lineasMetodos}</div>
          ` : ''}
        `;
      } else {
        // Ticket Venta / Devolución / Movimiento / Recibo
        const isAnulada = String(d.estado || '').toLowerCase() === 'anulada' || String(d.estado || '').toLowerCase() === 'anulado';
        const isCredito = String(d.tipo_venta || d.condicion_pago || '').toLowerCase() === 'credito';
        const numDoc = d.numero_factura || d.numero_devolucion || d.numero_ajuste || d.numero_pedido || d.numero_recibo || '000001';
        const detalles = d.detalles || d.items || [];
        const tasaVes = parseFloat(d.tasa_ves || t.tasa_ves || 0);
        const tasaCop = parseFloat(d.tasa_cop || t.tasa_cop || 0);
        const totalUsd = parseFloat(d.total_usd || d.monto_usd || d.total || 0);
        const totalVes = parseFloat(d.total_ves || (totalUsd * tasaVes) || 0);
        const totalCop = parseFloat(d.total_cop || (totalUsd * tasaCop) || 0);

        let itemsLines = '';
        detalles.forEach(item => {
          const sku = (fmt.columnas.sku !== false && item.codigo) ? `[${esc(item.codigo)}] ` : '';
          const nombre = esc(item.nombre || item.nombre_producto || item.producto_nombre || 'Ítem');
          const cant = parseFloat(item.cantidad || 0).toFixed(2);
          const pu = parseFloat(item.precio_unitario || item.costo_unitario || 0).toFixed(2);
          const tot = parseFloat(item.total || item.subtotal || 0).toFixed(2);
          const desc = parseFloat(item.descuento || item.descuento_porcentaje || 0);
          const descTxt = (fmt.columnas.descuento !== false && desc > 0) ? ` (-${desc}%)` : '';
          const ivaTag = fmt.columnas.iva !== false ? (item.impuesto_tipo === 'gravado' ? ' (G)' : ' (E)') : '';

          itemsLines += `
            <div style="margin-bottom: 3px;">
              ${fmt.columnas.descripcion !== false ? `<div style="font-weight: bold;">${sku}${nombre}${ivaTag}${descTxt}</div>` : ''}
              <div style="display: flex; justify-content: space-between; padding-left: 4px;">
                <span>${fmt.columnas.cantidad !== false ? cant : ''}${fmt.columnas.precio_unitario !== false ? ` x $${pu}` : ''}</span>
                ${fmt.columnas.total !== false ? `<strong>$${tot}</strong>` : ''}
              </div>
            </div>
          `;
        });

        const pagosHtml = (fmt.mostrar_desglose_pagos && Array.isArray(d.pagos) && d.pagos.length > 0)
          ? `
            <div style="border-top: 1px dotted #888; padding-top: 4px; margin-bottom: 5px;">
              <div style="font-weight: bold; font-size: 9px; margin-bottom: 2px;">PAGOS:</div>
              ${d.pagos.map(p => `<div style="display: flex; justify-content: space-between; font-size: 9px;"><span>&bull; ${esc(p.metodo || p.metodo_pago)} (${esc(p.moneda)})</span><strong>${parseFloat(p.monto_moneda || 0).toFixed(2)} ${esc(p.moneda)}</strong></div>`).join('')}
            </div>
          ` : '';

        bodySection = `
          ${isAnulada ? '<div style="font-weight: 900; text-align: center; border: 1px solid #000; padding: 2px; margin-bottom: 4px;">*** DOCUMENTO ANULADO ***</div>' : ''}
          ${fmt.texto_encabezado_extra ? `<div style="text-align: center; font-weight: bold; margin: 3px 0; border-top: 1px dashed #000; padding-top: 3px;">${esc(fmt.texto_encabezado_extra)}</div>` : ''}
          <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 4px;">
            <div style="font-weight: 900; font-size: 11px;">${esc(fmt.titulo_documento)} #${esc(numDoc)}</div>
            ${fmt.mostrar_fecha_impresion !== false ? `<div style="font-size: 9px;">FECHA: ${esc(d.fecha || d.fecha_emision || new Date().toLocaleString('es-VE'))}</div>` : ''}
            <div style="font-size: 9px; font-weight: bold;">CONDICIÓN: ${isCredito ? 'CRÉDITO' : 'CONTADO'}</div>
          </div>
          <div style="font-size: 9.5px; border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 4px; line-height: 1.3;">
            <div>CLIENTE: <strong>${esc(d.cliente_nombre || 'Consumidor Final')}</strong></div>
            ${d.cliente_cedula ? `<div>DOC/RIF: ${esc(d.cliente_cedula)}</div>` : ''}
            ${(fmt.columnas.vendedor !== false && fmt.mostrar_vendedor !== false && (d.vendedor_nombre || d.usuario_nombre)) ? `<div>VENDEDOR: <strong>${esc(d.vendedor_nombre || d.usuario_nombre)}</strong></div>` : ''}
          </div>
          ${itemsLines ? `
            <div style="border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 4px;">
              <div style="font-weight: bold; font-size: 9px; border-bottom: 1px dotted #000; padding-bottom: 2px; margin-bottom: 3px; display: flex; justify-content: space-between;">
                <span>DETALLE</span><span>TOTAL</span>
              </div>
              ${itemsLines}
            </div>
          ` : ''}
          <div style="border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 4px; line-height: 1.35;">
            <div style="display: flex; justify-content: space-between;"><span>SUBTOTAL:</span><span>$${parseFloat(d.subtotal || d.subtotal_usd || 0).toFixed(2)}</span></div>
            <div style="display: flex; justify-content: space-between;"><span>IVA:</span><span>$${parseFloat(d.iva_total || d.iva_usd || 0).toFixed(2)}</span></div>
            <div style="display: flex; justify-content: space-between; font-weight: 900; font-size: 11.5px; border-top: 1px dashed #000; margin-top: 2px; padding-top: 2px;">
              <span>TOTAL USD:</span><span>$${totalUsd.toFixed(2)}</span>
            </div>
            ${fmt.mostrar_equivalente_ves !== false && totalVes > 0 ? `<div style="display: flex; justify-content: space-between; font-size: 9px;"><span>Total Bs (${tasaVes.toFixed(2)}):</span><strong>${fmtVes(totalVes)} Bs.</strong></div>` : ''}
            ${fmt.mostrar_equivalente_cop && totalCop > 0 ? `<div style="display: flex; justify-content: space-between; font-size: 9px;"><span>Total COP:</span><strong>${fmtCop(totalCop)} COP</strong></div>` : ''}
          </div>
          ${pagosHtml}
        `;
      }

      const firmasTicket = (fmt.mostrar_firmas && Array.isArray(fmt.firmas) && fmt.firmas.length > 0)
        ? `
          <div style="margin-top: 16px; text-align: center; font-size: 8.5px;">
            ${fmt.firmas.slice(0, 2).map(lbl => `<div style="border-top: 1px solid #000; width: 82%; margin: 12px auto 2px auto; padding-top: 2px; font-weight: bold;">${esc(lbl)}</div>`).join('')}
          </div>
        ` : '';

      return `
        ${this.getScopedStyleBlock(fmt, scopeClass)}
        <div class="doc-sheet doc-ticket ${scopeClass}" style="width: ${widthCss}; max-width: 100%; margin: 0 auto; padding: 8px; font-family: 'Courier New', Courier, monospace; font-size: ${fontSz}; color: #000000; background: #ffffff;">
          <div style="text-align: ${textAlign}; border-bottom: 1px dashed #000; padding-bottom: 5px; margin-bottom: 5px;">
            ${logoHtml ? `<div>${logoHtml}</div>` : ''}
            <div style="font-weight: 900; font-size: 13px; text-transform: uppercase;">${esc(nombreEmpresa)}</div>
            ${fmt.mostrar_rif !== false && t.documento_fiscal ? `<div style="font-size: 9.5px;">RIF: ${esc(t.documento_fiscal)}</div>` : ''}
            ${fmt.mostrar_telefono !== false && t.telefono ? `<div style="font-size: 9.5px;">TEL: ${esc(t.telefono)}</div>` : ''}
            ${fmt.mostrar_direccion !== false && t.direccion ? `<div style="font-size: 8.5px;">${esc(t.direccion)}</div>` : ''}
          </div>
          ${bodySection}
          ${firmasTicket}
          <div style="text-align: center; font-size: 9px; margin-top: 6px;">
            ${fmt.texto_pie_pagina ? `<div style="font-weight: bold; margin-bottom: 4px;">${esc(fmt.texto_pie_pagina)}</div>` : ''}
            ${fmt.mostrar_marca_saas !== false ? `<div style="font-size: 8px; color: #444; border-top: 1px dotted #888; padding-top: 3px;">Generado por TAVO CLOUD | www.tavocloud.com</div>` : ''}
          </div>
        </div>
      `;
    },

    /**
     * RENDERIZADOR UNIVERSAL PRINCIPAL PARA LOS 20 DOCUMENTOS DEL ERP.
     */
    renderDocumento: function (docType, data, configTenant, customFormatOverride) {
      const reg = REGISTRY_MAP[docType];
      if (!reg) {
        return `<div style="padding: 20px; color: #b91c1c;">Tipo de documento desconocido: ${this.escapeHtml(docType)}</div>`;
      }

      const fmt = this.getDocFormat(docType, customFormatOverride);
      const cfg = configTenant || {};
      const esc = this.escapeHtml;
      const d = (data && typeof data === 'object') ? data : this.getSampleData(docType, cfg);

      // Determinar si se trata de un documento fiscal venezolano unificado (Factura / NC / ND)
      const isInvAjuste = docType === 'nota_debito_ajuste' && (
        Boolean(d.tipo_ajuste) ||
        (Array.isArray(d.detalles || d.items) && (d.detalles || d.items).some(x => x && (x.stock_anterior !== undefined || x.cpp_anterior !== undefined)))
      );
      if (
        docType === 'factura_a4' ||
        docType === 'factura_ticket' ||
        docType === 'nota_credito_devolucion' ||
        (docType === 'nota_debito_ajuste' && !isInvAjuste)
      ) {
        const fiscalKind = docType === 'nota_credito_devolucion'
          ? 'NOTA DE CRÉDITO'
          : (docType === 'nota_debito_ajuste' ? 'NOTA DE DÉBITO' : 'FACTURA');
        if (fmt.tamano_papel === 'ticket_58') {
          return this.renderDocumentoFiscalTicket58(fiscalKind, d, cfg, fmt);
        }
        if (fmt.tamano_papel === 'ticket_80' || docType === 'factura_ticket') {
          return this.renderDocumentoFiscalTicket80(fiscalKind, d, cfg, fmt);
        }
        if (fmt.tamano_papel === 'half_letter') {
          return this.renderDocumentoFiscalMediaCarta(fiscalKind, d, cfg, fmt);
        }
        return this.renderDocumentoFiscalCarta(fiscalKind, d, cfg, fmt);
      }

      // Si otro tipo de documento elige papel térmico 80/58mm o es cierre_z_ticket
      if (docType === 'cierre_z_ticket' || fmt.tamano_papel === 'ticket_80' || fmt.tamano_papel === 'ticket_58') {
        return this._renderThermalTicket(docType, d, cfg, fmt);
      }

      // 2. PEDIDO / PREVENTA COMERCIAL
      if (docType === 'pedido_preventa') {
        const isCredito = String(d.condicion_pago || '').toLowerCase() === 'credito';
        const infoCardHtml = `
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; display: grid; grid-template-columns: 1.6fr 1.4fr; gap: 12px;">
            <div>
              <span style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #64748b; display: block;">Cliente / Solicitante</span>
              <strong style="font-size: 13px; color: #0f172a;">${esc(d.cliente_nombre || 'Cliente')}</strong>
              <p style="margin: 2px 0 0 0; font-size: 10px; color: #64748b;">Cédula/RIF: ${esc(d.cliente_cedula || '-')} ${d.zona_nombre ? `• Zona: ${esc(d.zona_nombre)}` : ''}</p>
            </div>
            <div style="font-size: 10.5px; line-height: 1.45;">
              <div><strong style="color: #64748b;">Estado:</strong> <strong>${esc(d.estado || 'PENDIENTE')}</strong></div>
              <div><strong style="color: #64748b;">Asesor:</strong> ${esc(d.vendedor_nombre || 'Fuerza de Ventas')}</div>
              <div><strong style="color: #64748b;">Condición:</strong> ${isCredito ? `Crédito (${d.dias_credito || 15} días)` : 'Contado'}</div>
            </div>
          </div>
        `;
        const cols = [
          { key: 'num', label: '#', align: 'center', width: '5%', render: (_, i) => i + 1 },
          { key: 'sku', label: 'Código', width: '14%', mono: true, render: r => esc(r.producto_codigo || r.codigo || '—') },
          { key: 'descripcion', label: 'Descripción', render: r => `<strong>${esc(r.producto_nombre || r.nombre || 'Producto')}</strong>` },
          { key: 'cant_pedida', label: 'Pedida', align: 'right', width: '10%', mono: true, render: r => parseFloat(r.cantidad || 0).toFixed(2) },
          { key: 'cant_aprobada', label: 'Aprobada', align: 'right', width: '10%', mono: true, render: r => parseFloat(r.cantidad_aprobada !== undefined && r.cantidad_aprobada !== null ? r.cantidad_aprobada : (r.cantidad || 0)).toFixed(2) },
          { key: 'precio_unitario', label: 'P. Unit ($)', align: 'right', width: '12%', mono: true, render: r => `$${parseFloat(r.precio_unitario || 0).toFixed(2)}` },
          { key: 'iva', label: 'IVA', align: 'center', width: '8%', render: r => (r.impuesto_tipo === 'gravado' ? '16%' : 'Exento') },
          { key: 'subtotal', label: 'Subtotal ($)', align: 'right', width: '13%', mono: true, render: r => `<strong>$${parseFloat(r.subtotal || 0).toFixed(2)}</strong>` }
        ];
        const extraBottomHtml = `
          <div class="avoid-page-break" style="display: grid; grid-template-columns: 1.3fr 1fr; gap: 14px; align-items: start; margin-top: 8px;">
            <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px; font-size: 10px; color: #475569;">
              <strong>Notas del Pedido:</strong> ${esc(d.notas || 'Sin observaciones adicionales.')}
            </div>
            ${this._buildTotalsMultiMonedaHtml(d, fmt, cfg, 'TOTAL PEDIDO USD')}
          </div>
        `;
        return this.renderTablaUniversal(docType, { numero: d.numero_pedido || 'PED-001', fecha: d.fecha, infoCardHtml, extraBottomHtml }, cols, d.items || [], null, cfg, fmt);
      }

      // 4. NOTA DE DÉBITO / AJUSTE DE INVENTARIO (Control Interno de Almacén CPP)
      if (docType === 'nota_debito_ajuste') {
        const sentido = String(d.sentido || (d.tipo_ajuste === 'CARGO' ? 'ENTRADA' : 'SALIDA')).toUpperCase();
        const isAnulado = String(d.estado || '').toLowerCase() === 'anulado';
        const anuladaBanner = isAnulado ? `<div style="background:#fef2f2;border:2px dashed #dc2626;color:#dc2626;padding:6px;text-align:center;font-weight:900;margin-bottom:8px;">DOCUMENTO ANULADO</div>` : '';
        const infoCardHtml = `
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; display: grid; grid-template-columns: 1.5fr 1.5fr; gap: 12px;">
            <div>
              <span style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #64748b; display: block;">Causal / Concepto</span>
              <strong style="font-size: 12px; color: #0f172a;">${esc(d.motivo || 'Nota de Débito / Ajuste Formal')}</strong>
              ${d.proveedor_nombre ? `<p style="margin: 2px 0 0 0; font-size: 10px; color: #334155;">Proveedor: ${esc(d.proveedor_nombre)}</p>` : ''}
            </div>
            <div style="font-size: 10.5px; line-height: 1.45;">
              <div><strong style="color: #64748b;">Operación:</strong> ${esc(d.tipo_ajuste || 'AJUSTE')} (${sentido})</div>
              <div><strong style="color: #64748b;">Responsable:</strong> ${esc(d.usuario_nombre || 'Sistema')}</div>
              <div><strong style="color: #64748b;">Doc. Ref:</strong> ${esc(d.documento_referencia || d.numero_factura || '-')}</div>
            </div>
          </div>
        `;
        const cols = [
          { key: 'num', label: '#', align: 'center', width: '4%', render: (_, i) => i + 1 },
          { key: 'codigo', label: 'Código', width: '11%', mono: true, render: r => esc(r.producto_codigo || r.codigo || '—') },
          { key: 'descripcion', label: 'Descripción', render: r => `<strong>${esc(r.producto_nombre || r.nombre || 'Producto')}</strong>` },
          { key: 'unidad', label: 'Und', align: 'center', width: '6%', render: r => esc(r.unidad || 'UND') },
          { key: 'cantidad', label: 'Cant.', align: 'right', width: '8%', mono: true, render: r => parseFloat(r.cantidad || 0).toFixed(2) },
          { key: 'stock_anterior', label: 'Stk Ant', align: 'center', width: '7%', mono: true, render: r => parseFloat(r.stock_anterior || 0).toFixed(0) },
          { key: 'stock_nuevo', label: 'Stk Nue', align: 'center', width: '7%', mono: true, render: r => parseFloat(r.stock_nuevo || 0).toFixed(0) },
          { key: 'cpp_anterior', label: 'CPP Ant', align: 'right', width: '8%', mono: true, render: r => `$${parseFloat(r.cpp_anterior || 0).toFixed(2)}` },
          { key: 'costo_unitario', label: 'Costo U.', align: 'right', width: '9%', mono: true, render: r => `$${parseFloat(r.costo_unitario || 0).toFixed(2)}` },
          { key: 'cpp_nuevo', label: 'CPP Nue', align: 'right', width: '8%', mono: true, render: r => `$${parseFloat(r.cpp_nuevo || 0).toFixed(2)}` },
          { key: 'valuacion', label: 'Valuación', align: 'right', width: '10%', mono: true, render: r => `<strong>$${parseFloat(r.costo_total || r.total || (parseFloat(r.cantidad || 0) * parseFloat(r.costo_unitario || 0))).toFixed(2)}</strong>` }
        ];
        const rowsList = d.detalles || d.items || [];
        const totalVal = rowsList.reduce((acc, r) => acc + parseFloat(r.costo_total || r.total || (parseFloat(r.cantidad || 0) * parseFloat(r.costo_unitario || 0))), 0);
        const extraBottomHtml = `
          <div style="display:flex;justify-content:flex-end;margin-top:6px;">
            <div style="min-width:250px;">${this._buildTotalsMultiMonedaHtml({ subtotal: totalVal, iva_total: 0, total_usd: d.total_usd || totalVal }, fmt, cfg, 'VALUACIÓN TOTAL USD')}</div>
          </div>
        `;
        return this.renderTablaUniversal(docType, { numero: d.numero_ajuste || d.numero_devolucion || 'AJU-001', fecha: d.fecha || d.fecha_emision, anuladaBanner, infoCardHtml, extraBottomHtml }, cols, rowsList, null, cfg, fmt);
      }

      // 5. RECIBOS DE PAGO CXC Y CXP
      if (docType === 'recibo_pago_cxc' || docType === 'recibo_pago_cxp') {
        const isCxc = docType === 'recibo_pago_cxc';
        const terceroLabel = isCxc ? 'Cliente Pagador' : 'Proveedor Beneficiario';
        const infoCardHtml = `
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; display: grid; grid-template-columns: 1.6fr 1.4fr; gap: 12px;">
            <div>
              <span style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #64748b; display: block;">${terceroLabel}</span>
              <strong style="font-size: 13px; color: #0f172a;">${esc(d.tercero_nombre || d.cliente_nombre || d.proveedor_nombre || 'Tercero')}</strong>
              <p style="margin: 2px 0 0 0; font-size: 10px; color: #64748b;">RIF / CI: ${esc(d.tercero_cedula || d.cliente_cedula || d.proveedor_cedula || '-')}</p>
            </div>
            <div style="font-size: 10.5px; line-height: 1.45;">
              <div><strong style="color: #64748b;">Documento Afectado:</strong> ${esc(d.numero_documento || d.numero_factura || 'Cuenta')}</div>
              <div><strong style="color: #64748b;">Saldo Anterior:</strong> $${parseFloat(d.saldo_anterior_usd || 0).toFixed(2)}</div>
              <div><strong style="color: ${isCxc ? '#047857' : '#0284c7'};">Saldo Restante:</strong> <strong>$${parseFloat(d.saldo_restante_usd || 0).toFixed(2)}</strong></div>
            </div>
          </div>
        `;
        const cols = [
          { key: 'metodo', label: 'Método de Pago', render: r => `<strong>${esc(r.metodo || r.metodo_pago || 'Efectivo')}</strong>` },
          { key: 'moneda', label: 'Moneda', align: 'center', width: '10%', mono: true, render: r => esc(r.moneda || 'USD') },
          { key: 'monto_moneda', label: 'Monto Recibido', align: 'right', width: '18%', mono: true, render: r => (r.moneda === 'COP' ? fmtCop(r.monto_moneda) : parseFloat(r.monto_moneda || 0).toFixed(2)) },
          { key: 'tasa_cambio', label: 'Tasa', align: 'right', width: '14%', mono: true, render: r => parseFloat(r.tasa_cambio || 1).toFixed(2) },
          { key: 'equivalente_usd', label: 'Equivalente USD', align: 'right', width: '18%', mono: true, render: r => `<strong>$${parseFloat(r.equivalente_usd || 0).toFixed(2)}</strong>` },
          { key: 'referencia', label: 'Referencia', width: '18%', mono: true, render: r => esc(r.referencia || '-') }
        ];
        const montoUsd = parseFloat(d.monto_usd || 0);
        const extraBottomHtml = `
          <div style="display:flex;justify-content:space-between;align-items:start;gap:14px;margin-top:8px;">
            <div style="flex:1;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:10px;color:#475569;">
              <strong>Concepto / Notas:</strong> ${esc(d.notas || 'Abono aplicado a cuenta.')}
            </div>
            <div style="min-width:240px;">${this._buildTotalsMultiMonedaHtml({ subtotal: montoUsd, iva_total: 0, total_usd: montoUsd }, fmt, cfg, 'TOTAL ABONO APLICADO USD')}</div>
          </div>
        `;
        return this.renderTablaUniversal(docType, { numero: d.numero_recibo || `REC-${d.id || '001'}`, fecha: d.fecha, infoCardHtml, extraBottomHtml }, cols, d.pagos || [], null, cfg, fmt);
      }

      // 6. CATÁLOGO VISUAL DE PRODUCTOS
      if (docType === 'catalogo_productos') {
        const prods = Array.isArray(d.productos) ? d.productos : (Array.isArray(d) ? d : []);
        const scopeClass = 'mrl-doc-catalogo';
        const tasaVes = parseFloat(cfg.tasa_ves || 45);
        const mostrarStock = fmt.columnas.stock !== false && (d.mostrarStock !== false);
        const groups = this.groupByCategory(prods);
        const colorPrim = fmt.color_primario || '#0f172a';
        const headerHtml = this.renderUniversalHeader({ numero: '', fecha: new Date().toLocaleDateString('es-VE') }, cfg, fmt);
        const footerHtml = this.renderUniversalFooter(cfg, fmt);

        let bodyHtml = '';
        if (groups.length === 0) {
          bodyHtml = `<div style="text-align:center;padding:30px;color:#94a3b8;">No hay productos en el catálogo.</div>`;
        } else {
          groups.forEach(gr => {
            bodyHtml += `
              <div style="margin: 12px 0 8px 0; background: #f1f5f9; border-left: 4px solid ${colorPrim}; padding: 5px 10px; border-radius: 0 6px 6px 0; display:flex; justify-content:space-between; align-items:center;" class="avoid-page-break">
                <strong style="text-transform:uppercase; font-size:11px;">${esc(gr.categoria_nombre)}</strong>
                <span style="font-size:9.5px; color:#475569;">${gr.productos.length} ítem(s)</span>
              </div>
              <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 12px;">
                ${gr.productos.map(p => {
                  const precioUsd = parseFloat(p.precio_total || p.precio || p.precio_base || 0);
                  const stk = parseFloat(p.stock_disponible !== undefined ? p.stock_disponible : p.stock || 0);
                  return `
                    <div class="avoid-page-break" style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #ffffff; display: flex; flex-direction: column; justify-content: space-between;">
                      ${fmt.columnas.foto !== false ? `
                        <div style="height: 82px; background: #f8fafc; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid #f1f5f9;">
                          ${p.imagen ? `<img src="${esc(p.imagen)}" alt="${esc(p.nombre)}" style="max-height:100%;max-width:100%;object-fit:contain;">` : `<div style="width:34px;height:34px;border-radius:50%;background:#e2e8f0;color:#475569;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;">${this.getIniciales(p.nombre)}</div>`}
                        </div>
                      ` : ''}
                      <div style="padding: 8px;">
                        ${fmt.columnas.codigo !== false ? `<div style="font-family:monospace;font-size:9px;color:#64748b;">${esc(p.codigo || 'S/C')}</div>` : ''}
                        ${fmt.columnas.descripcion !== false ? `<div style="font-weight:700;font-size:11px;color:#0f172a;margin:2px 0;">${esc(p.nombre)}</div>` : ''}
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;border-top:1px solid #f1f5f9;padding-top:4px;">
                          <div>
                            ${fmt.columnas.precio_usd !== false ? `<div style="font-weight:900;font-size:13px;color:${colorPrim};">$${precioUsd.toFixed(2)}</div>` : ''}
                            ${fmt.columnas.precio_ves ? `<div style="font-size:9px;color:#64748b;">${fmtVes(precioUsd * tasaVes)} Bs.</div>` : ''}
                          </div>
                          ${mostrarStock ? `<span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:4px;background:${stk > 0 ? '#ecfdf5' : '#fef2f2'};color:${stk > 0 ? '#065f46' : '#991b1b'};">${stk > 0 ? `Disp: ${stk}` : 'Agotado'}</span>` : ''}
                        </div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            `;
          });
        }

        return `
          ${this.getScopedStyleBlock(fmt, scopeClass)}
          <div class="doc-sheet mrl-doc-root ${scopeClass}" style="width: ${this.getSheetWidthCss(fmt)}; padding: 20px 24px; margin: 0 auto;">
            ${headerHtml}
            ${bodyHtml}
            ${footerHtml}
          </div>
        `;
      }

      // 7. CIERRE Z A4 / CARTA
      if (docType === 'cierre_z_a4') {
        const tr = d.turno || {};
        const totMon = (d.diferencias && d.diferencias.totales_moneda) ? d.diferencias.totales_moneda : {};
        const difs = (d.diferencias && d.diferencias.por_metodo) ? d.diferencias.por_metodo : {};
        const movs = (d.movimientos || []).filter(m => m.referencia !== 'APERTURA');

        const monedaRows = [
          { moneda: 'Dólares Americanos (USD)', fondo: tr.fondo_inicial_usd || 0, sym: '$', dat: totMon.USD || {} },
          { moneda: 'Bolívares Digitales (VES)', fondo: tr.fondo_inicial_ves || 0, sym: 'Bs. ', dat: totMon.VES || {} },
          { moneda: 'Pesos Colombianos (COP)', fondo: 0, sym: 'COP $', dat: totMon.COP || {} }
        ];

        const infoCardHtml = `
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; font-size: 10.5px;">
            <div><span style="display:block;font-size:8.5px;color:#64748b;font-weight:bold;text-transform:uppercase;">Caja / Terminal</span><strong>${esc(tr.caja_nombre || 'Caja Principal')}</strong></div>
            <div><span style="display:block;font-size:8.5px;color:#64748b;font-weight:bold;text-transform:uppercase;">Cajero</span><strong>${esc(tr.usuario_nombre || tr.username || 'Administrador')}</strong></div>
            <div><span style="display:block;font-size:8.5px;color:#64748b;font-weight:bold;text-transform:uppercase;">Apertura</span><span style="font-family:monospace;">${esc(tr.fecha_apertura || '-')}</span></div>
            <div><span style="display:block;font-size:8.5px;color:#64748b;font-weight:bold;text-transform:uppercase;">Cierre</span><span style="font-family:monospace;">${esc(tr.fecha_cierre || '-')}</span></div>
          </div>
        `;

        const cols = [
          { key: 'moneda', label: 'Divisa', render: r => `<strong>${esc(r.moneda)}</strong>` },
          { key: 'fondo_inicial', label: 'Fondo Inicial', align: 'right', mono: true, render: r => `${r.sym}${parseFloat(r.fondo || 0).toFixed(2)}` },
          { key: 'saldo_teorico', label: 'Saldo Teórico', align: 'right', mono: true, render: r => `${r.sym}${parseFloat(r.dat.esperado || 0).toFixed(2)}` },
          { key: 'declarado', label: 'Declarado Cajero', align: 'right', mono: true, render: r => `<strong>${r.sym}${parseFloat(r.dat.declarado || 0).toFixed(2)}</strong>` },
          { key: 'diferencia', label: 'Diferencia', align: 'right', mono: true, render: r => { const df = parseFloat(r.dat.diferencia || 0); return `<strong style="color:${df < 0 ? '#dc2626' : (df > 0 ? '#2563eb' : '#16a34a')}">${df >= 0 ? '+' : ''}${r.sym}${df.toFixed(2)}</strong>`; } },
          { key: 'auditoria', label: 'Auditoría', align: 'center', render: r => `<strong>${esc(r.dat.estado || 'EXACTO')}</strong>` }
        ];

        const metodosHtml = Object.entries(difs).filter(([, dv]) => dv.esperado > 0 || dv.declarado > 0).map(([k, dv]) => `
          <tr>
            <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;font-weight:600;">${esc(k.replace(/_/g, ' ').toUpperCase())}</td>
            <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace;">${parseFloat(dv.esperado || 0).toFixed(2)}</td>
            <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace;font-weight:700;">${parseFloat(dv.declarado || 0).toFixed(2)}</td>
            <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace;">${parseFloat(dv.diferencia || 0).toFixed(2)} (${esc(dv.estado)})</td>
          </tr>
        `).join('');

        const movsBlock = fmt.columnas.movimientos_detalle !== false ? `
          <div style="margin-top: 10px;">
            <div style="font-size:10.5px;font-weight:800;text-transform:uppercase;margin-bottom:4px;">Desglose por Canal de Pago y Movimientos</div>
            ${metodosHtml ? `<table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;margin-bottom:8px;font-size:10px;"><thead><tr style="background:#334155;color:#fff;"><th style="padding:5px 8px;text-align:left;">Canal</th><th style="padding:5px 8px;text-align:right;">Teórico</th><th style="padding:5px 8px;text-align:right;">Declarado</th><th style="padding:5px 8px;text-align:right;">Dif.</th></tr></thead><tbody>${metodosHtml}</tbody></table>` : ''}
            ${movs.length > 0 ? `<div style="font-size:9.5px;color:#475569;"><strong>${movs.length} movimiento(s) en turno</strong> registrados en caja.</div>` : ''}
          </div>
        ` : '';

        return this.renderTablaUniversal(
          docType,
          { numero: `TURNO #${String(tr.id || '0').padStart(6, '0')}`, fecha: d.fecha_reporte || new Date().toLocaleString('es-VE'), infoCardHtml, extraBottomHtml: movsBlock },
          cols,
          monedaRows,
          null,
          cfg,
          fmt
        );
      }

      // 8. LIBRO DE VENTAS SENIAT
      if (docType === 'libro_ventas_seniat') {
        const r = d.resumen || d.totales || {};
        const items = d.items || d.registros || [];
        const esEspecial = Number(cfg.es_contribuyente_especial || d.es_contribuyente_especial || (d.contribuyente && d.contribuyente.es_contribuyente_especial) || 0) === 1;
        const kpis = [
          { label: 'Total Ventas (Bs.)', value: `${fmtVes(r.total_ventas_ves || 0)} Bs.`, sub: `$${parseFloat(r.total_ventas_usd || 0).toFixed(2)}` },
          { label: 'Base Imponible (16%)', value: `${fmtVes(r.total_base_imponible_ves || 0)} Bs.`, color: '#4338ca', sub: `$${parseFloat(r.total_base_imponible_usd || 0).toFixed(2)}` },
          { label: 'Débito Fiscal IVA', value: `${fmtVes(r.total_iva_ves || 0)} Bs.`, color: '#be123c', sub: `$${parseFloat(r.total_iva_usd || 0).toFixed(2)}` },
          { label: 'Ventas Exentas', value: `${fmtVes(r.total_exento_ves || 0)} Bs.`, sub: `$${parseFloat(r.total_exento_usd || 0).toFixed(2)}` }
        ];
        if (esEspecial) {
          kpis.push({ label: 'IGTF Percibido', value: `${fmtVes(r.total_igtf_ves || r.total_igtf_percibido_ves || 0)} Bs.`, color: '#b45309', sub: `$${parseFloat(r.total_igtf_usd || r.total_igtf_percibido_usd || 0).toFixed(2)}` });
        }
        const cols = [
          { key: 'num_oper', label: 'N° Oper', align: 'center', mono: true, render: it => esc(it.operacion_nro) },
          { key: 'fecha', label: 'Fecha', mono: true, render: it => esc(it.fecha) },
          { key: 'rif_cedula', label: 'RIF / Cédula', mono: true, render: it => esc(it.cliente_rif) },
          { key: 'razon_social', label: 'Razón Social', render: it => esc(it.cliente_nombre) },
          { key: 'num_factura', label: 'N° Factura', mono: true, render: it => `<strong>${esc(it.numero_factura || '-')}</strong>` },
          { key: 'num_control', label: 'N° Control', mono: true, render: it => esc(it.numero_control || '-') },
          { key: 'nota_deb_cred', label: 'Nota Déb/Créd', mono: true, render: it => esc(it.numero_nota_credito || it.numero_nota_deb_cred || '-') },
          { key: 'factura_afectada', label: 'Fact. Afectada', mono: true, render: it => esc(it.factura_afectada || '-') },
          { key: 'tipo_transaccion', label: 'Tipo', align: 'center', render: it => `<strong>${esc(it.tipo_transaccion || '01-REG')}</strong>` },
          { key: 'total_ventas_iva', label: 'Total Ventas c/IVA', align: 'right', mono: true, render: it => `<strong>${fmtVes(it.total_ventas_ves)}</strong>` },
          { key: 'ventas_exentas', label: 'Ventas Exentas', align: 'right', mono: true, render: it => fmtVes(it.ventas_exentas_ves) },
          { key: 'base_imponible', label: 'Base Imponible', align: 'right', mono: true, render: it => fmtVes(it.base_imponible_ves) },
          { key: 'alicuota_iva', label: '% Alíc.', align: 'center', render: it => esc(it.alicuota_iva || '16%') },
          { key: 'debito_fiscal_iva', label: 'Débito Fiscal IVA', align: 'right', mono: true, render: it => `<strong style="color:#be123c;">${fmtVes(it.iva_debito_ves)}</strong>` },
          { key: 'iva_retenido', label: 'IVA Retenido', align: 'right', mono: true, render: it => fmtVes(it.iva_retenido_ves || 0) }
        ];
        if (esEspecial) {
          cols.push({ key: 'igtf_percibido', label: 'IGTF Percibido (Bs.)', align: 'right', mono: true, render: it => `<strong style="color:#b45309;">${fmtVes(it.igtf_monto_ves || 0)}</strong>` });
        }
        cols.push({ key: 'equiv_usd', label: 'Equiv. USD', align: 'right', mono: true, render: it => `$${parseFloat(it.total_ventas_usd || 0).toFixed(2)}` });
        const rows = items.map(it => Object.assign({}, it, { _highlightRow: Boolean(it.es_devolucion) }));
        const totals = {
          _label: 'TOTALES SENIAT',
          total_ventas_iva: fmtVes(r.total_ventas_ves || 0),
          ventas_exentas: fmtVes(r.total_exento_ves || 0),
          base_imponible: fmtVes(r.total_base_imponible_ves || 0),
          debito_fiscal_iva: fmtVes(r.total_iva_ves || 0),
          iva_retenido: fmtVes(r.total_iva_retenido_ves || 0),
          igtf_percibido: fmtVes(r.total_igtf_ves || r.total_igtf_percibido_ves || 0),
          equiv_usd: `$${parseFloat(r.total_ventas_usd || 0).toFixed(2)}`
        };
        const periodoStr = d.mes && d.anio ? `${d.mes}/${d.anio}` : (d.periodo || '');
        return this.renderTablaUniversal(docType, { numero: periodoStr, kpis }, cols, rows, totals, cfg, fmt);
      }

      // 9. LIBRO DE COMPRAS SENIAT
      if (docType === 'libro_compras_seniat') {
        const r = d.resumen || d.totales || {};
        const items = d.items || d.registros || [];
        const kpis = [
          { label: 'Total Compras (Bs.)', value: `${fmtVes(r.total_compras_ves || 0)} Bs.`, sub: `$${parseFloat(r.total_compras_usd || 0).toFixed(2)}` },
          { label: 'Base Imponible', value: `${fmtVes(r.total_base_imponible_ves || 0)} Bs.`, color: '#4338ca', sub: `$${parseFloat(r.total_base_imponible_usd || 0).toFixed(2)}` },
          { label: 'Crédito Fiscal IVA', value: `${fmtVes(r.total_iva_ves || 0)} Bs.`, color: '#047857', sub: `$${parseFloat(r.total_iva_usd || 0).toFixed(2)}` },
          { label: 'Compras Exentas', value: `${fmtVes(r.total_exento_ves || 0)} Bs.`, sub: `$${parseFloat(r.total_exento_usd || 0).toFixed(2)}` }
        ];
        const cols = [
          { key: 'num_oper', label: 'N° Oper', align: 'center', mono: true, render: it => esc(it.operacion_nro) },
          { key: 'fecha', label: 'Fecha', mono: true, render: it => esc(it.fecha) },
          { key: 'rif_proveedor', label: 'RIF Proveedor', mono: true, render: it => esc(it.proveedor_rif) },
          { key: 'razon_social', label: 'Razón Social', render: it => esc(it.proveedor_nombre) },
          { key: 'num_factura', label: 'N° Factura', mono: true, render: it => `<strong>${esc(it.numero_factura || '-')}</strong>` },
          { key: 'num_control', label: 'N° Control', mono: true, render: it => esc(it.numero_control || '-') },
          { key: 'num_planilla_import', label: 'Planilla Imp.', mono: true, render: it => esc(it.numero_planilla_importacion || '-') },
          { key: 'total_compras_iva', label: 'Total Compras c/IVA', align: 'right', mono: true, render: it => `<strong>${fmtVes(it.total_compras_ves)}</strong>` },
          { key: 'compras_exentas', label: 'Compras Exentas', align: 'right', mono: true, render: it => fmtVes(it.compras_exentas_ves) },
          { key: 'base_imponible', label: 'Base Imponible', align: 'right', mono: true, render: it => fmtVes(it.base_imponible_ves) },
          { key: 'alicuota_iva', label: '% Alíc.', align: 'center', render: it => esc(it.alicuota_iva || '16%') },
          { key: 'credito_fiscal_iva', label: 'Crédito Fiscal IVA', align: 'right', mono: true, render: it => `<strong style="color:#047857;">${fmtVes(it.iva_credito_ves)}</strong>` },
          { key: 'retencion_iva', label: 'Retención IVA', align: 'right', mono: true, render: it => fmtVes(it.iva_retenido_ves || 0) },
          { key: 'equiv_usd', label: 'Equiv. USD', align: 'right', mono: true, render: it => `$${parseFloat(it.total_compras_usd || 0).toFixed(2)}` }
        ];
        const totals = {
          _label: 'TOTALES SENIAT',
          total_compras_iva: fmtVes(r.total_compras_ves || 0),
          compras_exentas: fmtVes(r.total_exento_ves || 0),
          base_imponible: fmtVes(r.total_base_imponible_ves || 0),
          credito_fiscal_iva: fmtVes(r.total_iva_ves || 0),
          retencion_iva: fmtVes(r.total_iva_retenido_ves || 0),
          equiv_usd: `$${parseFloat(r.total_compras_usd || 0).toFixed(2)}`
        };
        const periodoStr = d.mes && d.anio ? `${d.mes}/${d.anio}` : (d.periodo || '');
        return this.renderTablaUniversal(docType, { numero: periodoStr, kpis }, cols, items, totals, cfg, fmt);
      }

      // 10. LIBRO DE INVENTARIO ART. 177 R-LISLR
      if (docType === 'libro_inventario_art177') {
        const r = d.resumen || d.totales || {};
        const items = d.items || d.articulos || [];
        const kpis = [
          { label: 'Inv. Inicial (Bs.)', value: `${fmtVes(r.total_inicial_ves || 0)} Bs.`, sub: `$${parseFloat(r.total_inicial_usd || 0).toFixed(2)}` },
          { label: 'Entradas Mes (Bs.)', value: `${fmtVes(r.total_entradas_ves || 0)} Bs.`, color: '#047857', sub: `$${parseFloat(r.total_entradas_usd || 0).toFixed(2)}` },
          { label: 'Salidas Mes (Bs.)', value: `${fmtVes(r.total_salidas_ves || 0)} Bs.`, color: '#be123c', sub: `$${parseFloat(r.total_salidas_usd || 0).toFixed(2)}` },
          { label: 'Inv. Final (Bs.)', value: `${fmtVes(r.total_final_ves || 0)} Bs.`, color: '#3730a3', sub: `$${parseFloat(r.total_final_usd || 0).toFixed(2)}` }
        ];
        const cols = [
          { key: 'codigo', label: 'Código', mono: true, render: it => `<strong>${esc(it.codigo)}</strong>` },
          { key: 'descripcion', label: 'Descripción Mercancía', render: it => esc(it.nombre) },
          { key: 'unid_inicial', label: 'Unid. Ini', align: 'right', mono: true, render: it => it.inicial_cant },
          { key: 'costo_inicial', label: 'Val. Ini Bs.', align: 'right', mono: true, render: it => fmtVes(it.inicial_total_ves ?? it.inicial_valor_ves ?? 0) },
          { key: 'entradas_cant_monto', label: 'Entradas (Cant / Bs.)', align: 'right', mono: true, render: it => `${it.entradas_cant} / ${fmtVes(it.entradas_total_ves ?? it.entradas_valor_ves ?? 0)}` },
          { key: 'salidas_cant_monto', label: 'Salidas (Cant / Bs.)', align: 'right', mono: true, render: it => `${it.salidas_cant} / ${fmtVes(it.salidas_total_ves ?? it.salidas_valor_ves ?? 0)}` },
          { key: 'unid_final', label: 'Unid. Fin', align: 'right', mono: true, render: it => `<strong>${it.final_cant}</strong>` },
          { key: 'costo_cpp', label: 'Costo CPP ($)', align: 'right', mono: true, render: it => `$${parseFloat(it.costo_unit_usd ?? it.costo_unitario ?? 0).toFixed(2)}` },
          { key: 'valor_final_bs_usd', label: 'Valor Final Bs. / USD', align: 'right', mono: true, render: it => `<strong>${fmtVes(it.final_total_ves ?? it.final_valor_ves ?? 0)} Bs.</strong>` }
        ];
        const totals = {
          _label: 'TOTALES ART. 177',
          costo_inicial: fmtVes(r.total_inicial_ves || 0),
          entradas_cant_monto: fmtVes(r.total_entradas_ves || 0),
          salidas_cant_monto: fmtVes(r.total_salidas_ves || 0),
          valor_final_bs_usd: `${fmtVes(r.total_final_ves || 0)} Bs.`
        };
        return this.renderTablaUniversal(docType, { numero: d.periodo || d.periodo_mes || '', kpis }, cols, items, totals, cfg, fmt);
      }

      // 11. KARDEX FÍSICO Y VALORADO
      if (docType === 'kardex') {
        const p = d.producto || {};
        const r = d.resumen || {};
        const movs = d.movimientos || [];
        const kpis = [
          { label: 'Artículo', value: `${p.codigo || ''} - ${p.nombre || 'General'}` },
          { label: 'Stock Inicial', value: String(r.stock_inicial || 0) },
          { label: 'Entradas / Salidas', value: `+${r.total_entradas || 0} / -${r.total_salidas || 0}` },
          { label: 'Saldo Actual', value: `${r.stock_actual || 0} ($${parseFloat(r.valor_total_actual || 0).toFixed(2)})`, color: '#0e7490' }
        ];
        const cols = [
          { key: 'fecha', label: 'Fecha', mono: true, render: m => esc(m.fecha) },
          { key: 'tipo_mov', label: 'Tipo', render: m => `<strong>${esc(m.tipo_movimiento)}</strong>` },
          { key: 'documento', label: 'Documento', mono: true, render: m => esc(m.documento || '-') },
          { key: 'tercero', label: 'Tercero', render: m => esc(m.tercero || '-') },
          { key: 'concepto', label: 'Concepto', render: m => esc(m.concepto || '-') },
          { key: 'entradas', label: 'Entradas', align: 'right', mono: true, render: m => (m.entrada_cant > 0 ? `<span style="color:#047857;">+${m.entrada_cant} ($${parseFloat(m.entrada_total || 0).toFixed(2)})</span>` : '-') },
          { key: 'salidas', label: 'Salidas', align: 'right', mono: true, render: m => (m.salida_cant > 0 ? `<span style="color:#be123c;">-${m.salida_cant} ($${parseFloat(m.salida_total || 0).toFixed(2)})</span>` : '-') },
          { key: 'saldo_cant', label: 'Saldo Und', align: 'right', mono: true, render: m => `<strong>${m.saldo_cant}</strong>` },
          { key: 'costo_cpp', label: 'Costo CPP', align: 'right', mono: true, render: m => `$${parseFloat(m.saldo_unit || m.costo_unit || 0).toFixed(2)}` },
          { key: 'saldo_valor', label: 'Saldo Valor', align: 'right', mono: true, render: m => `<strong>$${parseFloat(m.saldo_total || 0).toFixed(2)}</strong>` }
        ];
        return this.renderTablaUniversal(docType, { numero: p.codigo || '', kpis }, cols, movs, null, cfg, fmt);
      }

      // 12. INVENTARIO GENERAL VALORADO
      if (docType === 'inventario_valorado') {
        const r = d.resumen || {};
        const items = d.items || [];
        const kpis = [
          { label: 'Costo Inventario', value: `$${parseFloat(r.total_costo_inventario_usd || 0).toFixed(2)}` },
          { label: 'Valor Venta Est.', value: `$${parseFloat(r.total_venta_estimada_usd || 0).toFixed(2)}`, color: '#047857' },
          { label: 'Ganancia Proyectada', value: `$${parseFloat(r.ganancia_estimada_usd || 0).toFixed(2)}`, color: '#4338ca' },
          { label: 'Unidades Físicas', value: String(r.total_unidades_stock || 0) }
        ];
        const cols = [
          { key: 'codigo', label: 'Código', mono: true, render: i => esc(i.codigo || '-') },
          { key: 'descripcion', label: 'Descripción', render: i => `<strong>${esc(i.nombre)}</strong>` },
          { key: 'categoria', label: 'Categoría', render: i => esc(i.categoria_nombre || '-') },
          { key: 'tipo', label: 'Tipo', align: 'center', render: i => esc(i.tipo) },
          { key: 'existencia', label: 'Stock', align: 'right', mono: true, render: i => (i.tipo === 'producto' ? i.stock : '-') },
          { key: 'costo_unitario', label: 'Costo Unit.', align: 'right', mono: true, render: i => `$${parseFloat(i.costo || 0).toFixed(2)}` },
          { key: 'costo_total', label: 'Costo Total', align: 'right', mono: true, render: i => `<strong>$${parseFloat(i.costo_total_stock || 0).toFixed(2)}</strong>` },
          { key: 'precio_venta', label: 'P. Venta', align: 'right', mono: true, render: i => `$${parseFloat(i.precio || 0).toFixed(2)}` },
          { key: 'valor_venta', label: 'Valor Venta', align: 'right', mono: true, render: i => `<strong>$${parseFloat(i.valor_venta_stock || 0).toFixed(2)}</strong>` }
        ];
        const totals = {
          _label: 'TOTALES',
          existencia: String(r.total_unidades_stock || 0),
          costo_total: `$${parseFloat(r.total_costo_inventario_usd || 0).toFixed(2)}`,
          valor_venta: `$${parseFloat(r.total_venta_estimada_usd || 0).toFixed(2)}`
        };
        return this.renderTablaUniversal(docType, { kpis }, cols, items, totals, cfg, fmt);
      }

      // 13. INVENTARIO SIMPLE
      if (docType === 'inventario_simple') {
        const items = Array.isArray(d.productos) ? d.productos : (d.items || []);
        const totalStock = items.reduce((a, b) => a + parseFloat(b.stock || 0), 0);
        const kpis = [
          { label: 'Total Ítems', value: String(items.length) },
          { label: 'Unidades Físicas Totales', value: String(totalStock), color: '#047857' }
        ];
        const cols = [
          { key: 'codigo', label: 'Código', width: '18%', mono: true, render: p => `<strong>${esc(p.codigo || '-')}</strong>` },
          { key: 'descripcion', label: 'Nombre / Descripción', render: p => esc(p.nombre) },
          { key: 'categoria', label: 'Categoría', width: '24%', render: p => esc(p.categoria_nombre || '-') },
          { key: 'existencia', label: 'Cantidad Stock', width: '18%', align: 'right', mono: true, render: p => `<strong>${p.stock}</strong>` }
        ];
        return this.renderTablaUniversal(docType, { kpis }, cols, items, { _label: 'TOTAL UNIDADES', existencia: String(totalStock) }, cfg, fmt);
      }

      // 14. VENTAS DIARIAS
      if (docType === 'ventas_diarias') {
        const r = d.resumen || {};
        const facturas = d.facturas || [];
        const kpis = [
          { label: 'Total Facturado USD', value: `$${parseFloat(r.total_ventas_usd || 0).toFixed(2)}`, color: '#047857' },
          { label: 'Divisas USD Recibido', value: `$${parseFloat(r.total_usd_recibido || 0).toFixed(2)}` },
          { label: 'Bolívares (VES)', value: `${fmtVes(r.total_ves_recibido || 0)} Bs.` },
          { label: 'Pesos (COP)', value: `${fmtCop(r.total_cop_recibido || 0)} COP` }
        ];
        const cols = [
          { key: 'num_factura', label: 'N° Factura', mono: true, render: f => `<strong>${esc(f.numero_factura)}</strong>` },
          { key: 'hora', label: 'Fecha / Hora', render: f => esc(f.fecha) },
          { key: 'cliente', label: 'Cliente', render: f => esc(f.cliente_nombre) },
          { key: 'condicion', label: 'Condición', align: 'center', render: f => esc(String(f.tipo_venta || '').toUpperCase()) },
          { key: 'total_usd', label: 'Total USD', align: 'right', mono: true, render: f => `<strong>$${parseFloat(f.total_usd || 0).toFixed(2)}</strong>` },
          { key: 'equiv_ves', label: 'Equiv. Bs.', align: 'right', mono: true, render: f => `${fmtVes(f.total_ves || 0)} Bs.` },
          { key: 'equiv_cop', label: 'Equiv. COP', align: 'right', mono: true, render: f => `${fmtCop(f.total_cop || 0)} COP` },
          { key: 'desglose_pagos', label: 'Pagos', render: f => esc((f.pagos || []).map(p => `${p.metodo}: ${parseFloat(p.monto_moneda).toFixed(2)} ${p.moneda}`).join(' | ') || (f.tipo_venta === 'credito' ? 'Crédito' : '-')) }
        ];
        const totalUsd = parseFloat(r.total_ventas_usd || 0);
        const totals = {
          _label: 'TOTAL DÍA',
          total_usd: `$${totalUsd.toFixed(2)}`,
          equiv_ves: `${fmtVes(totalUsd * (cfg.tasa_ves || 1))} Bs.`,
          equiv_cop: `${fmtCop(totalUsd * (cfg.tasa_cop || 1))} COP`
        };
        return this.renderTablaUniversal(docType, { numero: d.fecha || '', kpis }, cols, facturas, totals, cfg, fmt);
      }

      // 15. VENTAS MENSUALES
      if (docType === 'ventas_mensuales') {
        const r = d.resumen || {};
        const meses = d.meses || [];
        const kpis = [
          { label: 'Total Facturado Año', value: `$${parseFloat(r.total_facturado_usd || 0).toFixed(2)}`, color: '#4338ca' },
          { label: 'Facturas Emitidas', value: String(r.total_facturas_emitidas || 0) },
          { label: 'Ticket Promedio', value: `$${parseFloat(r.ticket_promedio_usd || 0).toFixed(2)}`, color: '#047857' }
        ];
        const cols = [
          { key: 'mes', label: 'Mes', render: m => `<strong>${esc(m.nombre_mes)}</strong>` },
          { key: 'num_facturas', label: 'N° Facturas', align: 'right', mono: true, render: m => m.total_facturas },
          { key: 'total_usd', label: 'Total USD', align: 'right', mono: true, render: m => `<strong>$${parseFloat(m.total_usd || 0).toFixed(2)}</strong>` },
          { key: 'equiv_ves', label: 'Equivalente Bs.', align: 'right', mono: true, render: m => `${fmtVes(m.total_ves || 0)} Bs.` },
          { key: 'equiv_cop', label: 'Equivalente COP', align: 'right', mono: true, render: m => `${fmtCop(m.total_cop || 0)} COP` }
        ];
        const totals = { _label: 'TOTAL ANUAL', num_facturas: String(r.total_facturas_emitidas || 0), total_usd: `$${parseFloat(r.total_facturado_usd || 0).toFixed(2)}` };
        return this.renderTablaUniversal(docType, { numero: String(d.anio || new Date().getFullYear()), kpis }, cols, meses, totals, cfg, fmt);
      }

      // 16. ESTADO DE CUENTA CXC
      if (docType === 'estado_cuenta_cxc') {
        const r = d.resumen || {};
        const cuentas = d.cuentas || [];
        const kpis = [
          { label: 'Cartera Pendiente', value: `$${parseFloat(r.total_saldo_pendiente_usd || 0).toFixed(2)}`, color: '#be123c' },
          { label: 'Cuentas Activas', value: String(r.total_cuentas_pendientes || cuentas.length) },
          { label: 'Deuda Vencida', value: `$${parseFloat(r.total_vencido_usd || 0).toFixed(2)}`, color: '#dc2626' },
          { label: 'Total Abonado', value: `$${parseFloat(r.total_abonado_usd || 0).toFixed(2)}`, color: '#047857' }
        ];
        const cols = [
          { key: 'factura', label: 'Factura', mono: true, render: c => `<strong>${esc(c.numero_factura || '-')}</strong>` },
          { key: 'cliente', label: 'Cliente', render: c => `${esc(c.cliente_nombre || '')} (${esc(c.cliente_cedula || '')})` },
          { key: 'emision', label: 'Emisión', mono: true, render: c => esc(c.fecha_emision || '-') },
          { key: 'vencimiento', label: 'Vencimiento', mono: true, render: c => esc(c.fecha_vencimiento || '-') },
          { key: 'total_usd', label: 'Total ($)', align: 'right', mono: true, render: c => `$${parseFloat(c.monto_total || 0).toFixed(2)}` },
          { key: 'abonado_usd', label: 'Abonado ($)', align: 'right', mono: true, render: c => `<span style="color:#047857;">$${parseFloat(c.monto_pagado || 0).toFixed(2)}</span>` },
          { key: 'saldo_usd', label: 'Saldo ($)', align: 'right', mono: true, render: c => `<strong style="color:#be123c;">$${parseFloat(c.saldo_pendiente || 0).toFixed(2)}</strong>` },
          { key: 'saldo_ves', label: 'Saldo Bs.', align: 'right', mono: true, render: c => `${fmtVes(c.saldo_ves || 0)} Bs.` },
          { key: 'estado', label: 'Estado', align: 'center', render: c => esc(String(c.estado || 'PENDIENTE').toUpperCase()) }
        ];
        const totals = {
          _label: 'TOTAL CARTERA',
          total_usd: `$${cuentas.reduce((a, c) => a + parseFloat(c.monto_total || 0), 0).toFixed(2)}`,
          abonado_usd: `$${cuentas.reduce((a, c) => a + parseFloat(c.monto_pagado || 0), 0).toFixed(2)}`,
          saldo_usd: `$${parseFloat(r.total_saldo_pendiente_usd || 0).toFixed(2)}`,
          saldo_ves: `${fmtVes(r.total_saldo_pendiente_ves || 0)} Bs.`
        };
        return this.renderTablaUniversal(docType, { kpis }, cols, cuentas, totals, cfg, fmt);
      }

      // 17. ESTADO DE CUENTA CXP
      if (docType === 'estado_cuenta_cxp') {
        const r = d.resumen || {};
        const cuentas = d.cuentas || [];
        const kpis = [
          { label: 'Pasivo Pendiente', value: `$${parseFloat(r.total_saldo_pendiente_usd || 0).toFixed(2)}`, color: '#be123c' },
          { label: 'Cuentas por Pagar', value: String(r.total_cuentas_pendientes || cuentas.length) },
          { label: 'Deuda Vencida', value: `$${parseFloat(r.total_vencido_usd || 0).toFixed(2)}`, color: '#dc2626' },
          { label: 'Total Pagado', value: `$${parseFloat(r.total_pagado_usd || 0).toFixed(2)}`, color: '#047857' }
        ];
        const cols = [
          { key: 'documento', label: 'Factura / Control', mono: true, render: c => `<strong>${esc(c.numero_factura || '-')}</strong>` },
          { key: 'proveedor', label: 'Proveedor', render: c => `${esc(c.proveedor_nombre || '')} (${esc(c.proveedor_cedula || '')})` },
          { key: 'concepto', label: 'Concepto', render: c => esc(c.descripcion_concepto || 'Compra') },
          { key: 'vencimiento', label: 'Vencimiento', mono: true, render: c => esc(c.fecha_vencimiento || '-') },
          { key: 'total_usd', label: 'Total ($)', align: 'right', mono: true, render: c => `$${parseFloat(c.monto_total || 0).toFixed(2)}` },
          { key: 'pagado_usd', label: 'Pagado ($)', align: 'right', mono: true, render: c => `<span style="color:#047857;">$${parseFloat(c.monto_pagado || 0).toFixed(2)}</span>` },
          { key: 'saldo_usd', label: 'Saldo ($)', align: 'right', mono: true, render: c => `<strong style="color:#be123c;">$${parseFloat(c.saldo_pendiente || 0).toFixed(2)}</strong>` },
          { key: 'saldo_ves', label: 'Saldo Bs.', align: 'right', mono: true, render: c => `${fmtVes(c.saldo_ves || 0)} Bs.` },
          { key: 'estado', label: 'Estado', align: 'center', render: c => esc(String(c.estado || 'PENDIENTE').toUpperCase()) }
        ];
        const totals = {
          _label: 'TOTAL PASIVOS',
          total_usd: `$${cuentas.reduce((a, c) => a + parseFloat(c.monto_total || 0), 0).toFixed(2)}`,
          pagado_usd: `$${cuentas.reduce((a, c) => a + parseFloat(c.monto_pagado || 0), 0).toFixed(2)}`,
          saldo_usd: `$${parseFloat(r.total_saldo_pendiente_usd || 0).toFixed(2)}`,
          saldo_ves: `${fmtVes(r.total_saldo_pendiente_ves || 0)} Bs.`
        };
        return this.renderTablaUniversal(docType, { kpis }, cols, cuentas, totals, cfg, fmt);
      }

      return `<div style="padding:20px;">Formato ${esc(docType)} sin plantilla asignada.</div>`;
    },

    /**
     * Datos realistas de ejemplo para la Vista Previa en Vivo del Estudio de Formatos.
     */
    getSampleData: function (docType, configTenant) {
      const cfg = configTenant || {};
      const tasaVes = parseFloat(cfg.tasa_ves || 45);
      const tasaCop = parseFloat(cfg.tasa_cop || 4100);
      const hoy = new Date().toLocaleDateString('es-VE');

      if (docType === 'factura_a4' || docType === 'factura_ticket') {
        return {
          numero_factura: 'FAC-000148',
          fecha: hoy,
          tipo_venta: 'contado',
          tasa_ves: tasaVes,
          tasa_cop: tasaCop,
          cliente_nombre: 'Inversiones Comerciales Alfa C.A.',
          cliente_cedula: 'J-40112233-9',
          cliente_telefono: '+58 412 5551234',
          cliente_direccion: 'Av. Bolívar Norte, Torre Empresarial Piso 3',
          vendedor_nombre: 'Carlos Mendoza',
          subtotal: 125.00,
          iva_total: 20.00,
          total_usd: 145.00,
          total_ves: 145.00 * tasaVes,
          total_cop: 145.00 * tasaCop,
          pagos: [
            { metodo: 'Efectivo USD', moneda: 'USD', monto_moneda: 100.00, equivalente_usd: 100.00 },
            { metodo: 'Pago Móvil', moneda: 'VES', monto_moneda: 45.00 * tasaVes, equivalente_usd: 45.00, referencia: '998812' }
          ],
          detalles: [
            { codigo: 'PRD-001', nombre: 'Harina de Trigo Especial 1kg', cantidad: 50, precio_unitario: 1.50, descuento: 5, impuesto_tipo: 'gravado', total: 75.00 },
            { codigo: 'PRD-002', nombre: 'Aceite Vegetal Comestible 1L', cantidad: 20, precio_unitario: 2.50, descuento: 0, impuesto_tipo: 'exento', total: 50.00 }
          ]
        };
      }
      if (docType === 'pedido_preventa') {
        return {
          numero_pedido: 'PED-0042',
          fecha: hoy,
          estado: 'PENDIENTE',
          condicion_pago: 'credito',
          dias_credito: 15,
          cliente_nombre: 'Supermercado La Victoria',
          cliente_cedula: 'J-31223344-1',
          zona_nombre: 'Zona Norte',
          vendedor_nombre: 'Ana Torres',
          subtotal: 300.00,
          iva_total: 48.00,
          total_usd: 348.00,
          items: [
            { producto_codigo: 'SKU-10', producto_nombre: 'Café Molido Gourmet 500g', cantidad: 40, cantidad_aprobada: 40, precio_unitario: 5.00, impuesto_tipo: 'gravado', subtotal: 200.00 },
            { producto_codigo: 'SKU-22', producto_nombre: 'Azúcar Refinada 1kg', cantidad: 100, cantidad_aprobada: 90, precio_unitario: 1.00, impuesto_tipo: 'exento', subtotal: 100.00 }
          ]
        };
      }
      if (docType === 'nota_credito_devolucion') {
        return {
          numero_devolucion: 'DEV-00019',
          numero_factura: 'FAC-000130',
          fecha_emision: hoy,
          tipo_devolucion: 'parcial',
          motivo: 'Empaque averiado en transporte',
          cliente_nombre: 'Distribuidora Beta C.A.',
          cliente_cedula: 'J-29887766-0',
          subtotal_usd: 50.00,
          iva_usd: 8.00,
          total_usd: 58.00,
          pagos: [{ metodo: 'Nota de Crédito / Caja', moneda: 'USD', monto_moneda: 58.00, equivalente_usd: 58.00 }],
          items: [{ codigo: 'PRD-009', nombre: 'Leche en Polvo 900g', tipo: 'producto', cantidad: 10, precio_unitario: 5.00, impuesto_tipo: 'gravado', total: 58.00 }]
        };
      }
      if (docType === 'nota_debito_ajuste') {
        return {
          numero_ajuste: 'AJU-00031',
          fecha: hoy,
          tipo_ajuste: 'DESCARGO',
          sentido: 'SALIDA',
          motivo: 'Merma verificada en conteo físico mensual',
          usuario_nombre: 'Supervisor Almacén',
          documento_referencia: 'ACTA-2026-11',
          detalles: [{ producto_codigo: 'PRD-015', producto_nombre: 'Jugo Pasteurizado 1L', cantidad: 6, stock_anterior: 50, stock_nuevo: 44, cpp_anterior: 1.80, costo_unitario: 1.80, cpp_nuevo: 1.80, costo_total: 10.80 }]
        };
      }
      if (docType === 'recibo_pago_cxc' || docType === 'recibo_pago_cxp') {
        return {
          id: 88,
          numero_recibo: docType === 'recibo_pago_cxc' ? 'REC-CXC-0088' : 'PAG-CXP-0041',
          fecha: hoy,
          tercero_nombre: docType === 'recibo_pago_cxc' ? 'Comercializadora Sur C.A.' : 'Importadora Mayorista Global',
          tercero_cedula: 'J-30445566-7',
          numero_documento: docType === 'recibo_pago_cxc' ? 'FAC-000112' : 'CMP-0094',
          saldo_anterior_usd: 250.00,
          monto_usd: 150.00,
          saldo_restante_usd: 100.00,
          notas: 'Abono parcial confirmado en tesorería.',
          pagos: [
            { metodo: 'Zelle USD', moneda: 'USD', monto_moneda: 100.00, tasa_cambio: 1.0, equivalente_usd: 100.00, referencia: 'Z-78912' },
            { metodo: 'Transferencia VES', moneda: 'VES', monto_moneda: 50.00 * tasaVes, tasa_cambio: tasaVes, equivalente_usd: 50.00, referencia: '004512' }
          ]
        };
      }
      if (docType === 'catalogo_productos') {
        return {
          mostrarStock: true,
          productos: [
            { codigo: 'CAT-01', nombre: 'Arroz Blanco Tipo I 1kg', categoria_nombre: 'Alimentos', precio_total: 1.40, stock: 120 },
            { codigo: 'CAT-02', nombre: 'Aceite Vegetal 1L', categoria_nombre: 'Alimentos', precio_total: 2.80, stock: 45 },
            { codigo: 'CAT-03', nombre: 'Detergente Multiuso 2kg', categoria_nombre: 'Limpieza', precio_total: 4.50, stock: 18 }
          ]
        };
      }
      if (docType === 'cierre_z_a4' || docType === 'cierre_z_ticket') {
        return {
          fecha_reporte: hoy,
          turno: { id: 14, caja_nombre: 'Caja Principal #1', usuario_nombre: 'Administrador', fecha_apertura: '2026-11-22 08:00', fecha_cierre: '2026-11-22 18:30', fondo_inicial_usd: 50.0, fondo_inicial_ves: 1000.0 },
          diferencias: {
            totales_moneda: {
              USD: { esperado: 450.00, declarado: 450.00, diferencia: 0.0, estado: 'EXACTO' },
              VES: { esperado: 9500.00, declarado: 9500.00, diferencia: 0.0, estado: 'EXACTO' },
              COP: { esperado: 0, declarado: 0, diferencia: 0, estado: 'EXACTO' }
            },
            por_metodo: {
              efectivo_usd: { esperado: 250.00, declarado: 250.00, diferencia: 0, estado: 'EXACTO' },
              zelle_usd: { esperado: 200.00, declarado: 200.00, diferencia: 0, estado: 'EXACTO' },
              pago_movil_ves: { esperado: 9500.00, declarado: 9500.00, diferencia: 0, estado: 'EXACTO' }
            }
          },
          movimientos: []
        };
      }
      if (docType === 'libro_ventas_seniat') {
        return {
          mes: '11',
          anio: '2026',
          resumen: { total_ventas_ves: 11600.0, total_ventas_usd: 257.78, total_base_imponible_ves: 10000.0, total_base_imponible_usd: 222.22, total_iva_ves: 1600.0, total_iva_usd: 35.56, total_exento_ves: 0.0, total_exento_usd: 0.0, total_iva_retenido_ves: 0.0 },
          items: [
            { operacion_nro: 1, fecha: '2026-11-18', cliente_rif: 'J-30112233-4', cliente_nombre: 'Distribuidora Central C.A.', numero_factura: '0000145', numero_control: '00-000145', numero_nota_credito: '-', tipo_transaccion: '01-REG', total_ventas_ves: 5800.0, ventas_exentas_ves: 0.0, base_imponible_ves: 5000.0, alicuota_iva: '16%', iva_debito_ves: 800.0, iva_retenido_ves: 0.0, total_ventas_usd: 128.89 },
            { operacion_nro: 2, fecha: '2026-11-20', cliente_rif: 'V-18445566', cliente_nombre: 'María González', numero_factura: '0000146', numero_control: '00-000146', numero_nota_credito: '-', tipo_transaccion: '01-REG', total_ventas_ves: 5800.0, ventas_exentas_ves: 0.0, base_imponible_ves: 5000.0, alicuota_iva: '16%', iva_debito_ves: 800.0, iva_retenido_ves: 0.0, total_ventas_usd: 128.89 }
          ]
        };
      }
      if (docType === 'libro_compras_seniat') {
        return {
          mes: '11',
          anio: '2026',
          resumen: { total_compras_ves: 5800.0, total_compras_usd: 128.89, total_base_imponible_ves: 5000.0, total_base_imponible_usd: 111.11, total_iva_ves: 800.0, total_iva_usd: 17.78, total_exento_ves: 0.0, total_exento_usd: 0.0, total_iva_retenido_ves: 600.0 },
          items: [
            { operacion_nro: 1, fecha: '2026-11-15', proveedor_rif: 'J-29110022-8', proveedor_nombre: 'Alimentos Nacionales S.A.', numero_factura: 'F-99102', numero_control: '00-009910', numero_planilla_importacion: '-', tipo_transaccion: '01-REG', total_compras_ves: 5800.0, compras_exentas_ves: 0.0, base_imponible_ves: 5000.0, alicuota_iva: '16%', iva_credito_ves: 800.0, iva_retenido_ves: 600.0, total_compras_usd: 128.89 }
          ]
        };
      }
      if (docType === 'libro_inventario_art177') {
        return {
          periodo: '11/2026',
          resumen: { total_inicial_ves: 4500.0, total_inicial_usd: 100.0, total_entradas_ves: 2250.0, total_entradas_usd: 50.0, total_salidas_ves: 1350.0, total_salidas_usd: 30.0, total_final_ves: 5400.0, total_final_usd: 120.0 },
          items: [
            { codigo: 'SKU-01', nombre: 'Harina Precocida 1kg', inicial_cant: 100, inicial_total_ves: 4500.0, entradas_cant: 50, entradas_total_ves: 2250.0, salidas_cant: 30, salidas_total_ves: 1350.0, final_cant: 120, costo_unit_usd: 1.0, final_total_ves: 5400.0 }
          ]
        };
      }
      if (docType === 'kardex') {
        return {
          producto: { codigo: 'SKU-01', nombre: 'Router Dual Band AC1200' },
          resumen: { stock_inicial: 10, total_entradas: 20, total_salidas: 5, stock_actual: 25, valor_total_actual: 625.0 },
          movimientos: [
            { fecha: '2026-11-10', tipo_movimiento: 'COMPRA', documento: 'CMP-012', tercero: 'Tech Import', concepto: 'Reposición', entrada_cant: 20, entrada_total: 500.0, salida_cant: 0, salida_total: 0, saldo_cant: 30, saldo_unit: 25.0, saldo_total: 750.0 },
            { fecha: '2026-11-18', tipo_movimiento: 'VENTA', documento: 'FAC-148', tercero: 'Cliente Final', concepto: 'Venta POS', entrada_cant: 0, entrada_total: 0, salida_cant: 5, salida_total: 125.0, saldo_cant: 25, saldo_unit: 25.0, saldo_total: 625.0 }
          ]
        };
      }
      if (docType === 'inventario_valorado' || docType === 'inventario_simple') {
        return {
          resumen: { total_costo_inventario_usd: 1250.0, total_venta_estimada_usd: 1850.0, ganancia_estimada_usd: 600.0, total_unidades_stock: 140 },
          items: [
            { codigo: 'PRD-01', nombre: 'Producto Demo Alfa', categoria_nombre: 'General', tipo: 'producto', stock: 80, costo: 10.0, costo_total_stock: 800.0, precio: 15.0, valor_venta_stock: 1200.0 },
            { codigo: 'PRD-02', nombre: 'Producto Demo Beta', categoria_nombre: 'Accesorios', tipo: 'producto', stock: 60, costo: 7.5, costo_total_stock: 450.0, precio: 10.83, valor_venta_stock: 650.0 }
          ]
        };
      }
      if (docType === 'ventas_diarias') {
        return {
          fecha: hoy,
          resumen: { total_ventas_usd: 345.0, total_usd_recibido: 200.0, total_ves_recibido: 6525.0, total_cop_recibido: 0 },
          facturas: [
            { numero_factura: 'FAC-147', fecha: '09:40 AM', cliente_nombre: 'Cliente Contado', tipo_venta: 'contado', total_usd: 145.0, total_ves: 145.0 * tasaVes, total_cop: 145.0 * tasaCop, pagos: [{ metodo: 'Efectivo USD', moneda: 'USD', monto_moneda: 145.0 }] },
            { numero_factura: 'FAC-148', fecha: '11:15 AM', cliente_nombre: 'Corporación Norte', tipo_venta: 'credito', total_usd: 200.0, total_ves: 200.0 * tasaVes, total_cop: 200.0 * tasaCop, pagos: [] }
          ]
        };
      }
      if (docType === 'ventas_mensuales') {
        return {
          anio: 2026,
          resumen: { total_facturado_usd: 14500.0, total_facturas_emitidas: 112, ticket_promedio_usd: 129.46 },
          meses: [
            { nombre_mes: 'Octubre', total_facturas: 54, total_usd: 6800.0, total_ves: 6800.0 * tasaVes, total_cop: 6800.0 * tasaCop },
            { nombre_mes: 'Noviembre', total_facturas: 58, total_usd: 7700.0, total_ves: 7700.0 * tasaVes, total_cop: 7700.0 * tasaCop }
          ]
        };
      }
      if (docType === 'estado_cuenta_cxc') {
        return {
          resumen: { total_saldo_pendiente_usd: 420.0, total_saldo_pendiente_ves: 420.0 * tasaVes, total_cuentas_pendientes: 2, total_vencido_usd: 120.0, total_abonado_usd: 180.0 },
          cuentas: [
            { numero_factura: 'FAC-110', cliente_nombre: 'Cliente Demo S.A.', cliente_cedula: 'J-30112233-4', fecha_emision: '2026-11-01', fecha_vencimiento: '2026-11-15', monto_total: 300.0, monto_pagado: 180.0, saldo_pendiente: 120.0, saldo_ves: 120.0 * tasaVes, estado: 'parcial' },
            { numero_factura: 'FAC-148', cliente_nombre: 'Cliente Demo S.A.', cliente_cedula: 'J-30112233-4', fecha_emision: '2026-11-20', fecha_vencimiento: '2026-12-05', monto_total: 300.0, monto_pagado: 0.0, saldo_pendiente: 300.0, saldo_ves: 300.0 * tasaVes, estado: 'pendiente' }
          ]
        };
      }
      if (docType === 'estado_cuenta_cxp') {
        return {
          resumen: { total_saldo_pendiente_usd: 650.0, total_saldo_pendiente_ves: 650.0 * tasaVes, total_cuentas_pendientes: 1, total_vencido_usd: 0.0, total_pagado_usd: 350.0 },
          cuentas: [
            { numero_factura: 'PROV-901', proveedor_nombre: 'Importadora Global S.A.', proveedor_cedula: 'J-40998877-1', descripcion_concepto: 'Lote Mercancía Noviembre', fecha_vencimiento: '2026-12-10', monto_total: 1000.0, monto_pagado: 350.0, saldo_pendiente: 650.0, saldo_ves: 650.0 * tasaVes, estado: 'parcial' }
          ]
        };
      }
      return {};
    },

    // ==========================================================================
    // MÉTODOS LEGACY COMPATIBLES (REDIRIGIDOS AL MOTOR UNIVERSAL)
    // ==========================================================================
    groupByCategory: function (productos) {
      if (!Array.isArray(productos)) return [];
      const map = productos.reduce(function (acc, p) {
        const cat = (p.categoria_nombre || 'General').trim();
        if (!acc[cat]) {
          acc[cat] = { categoria_id: p.categoria_id, categoria_nombre: cat, productos: [] };
        }
        acc[cat].productos.push(p);
        return acc;
      }, {});
      return Object.values(map)
        .sort((a, b) => a.categoria_nombre.localeCompare(b.categoria_nombre, 'es', { sensitivity: 'base' }))
        .map(g => {
          g.productos.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }));
          return g;
        });
    },

    renderCategorySeparator: function (categoriaNombre, totalItems) {
      const esc = this.escapeHtml;
      const nombre = esc(categoriaNombre || 'General');
      const count = Number(totalItems || 0);
      return `
        <div class="categoria-separator w-full bg-slate-100 border-l-4 border-slate-800 px-4 py-2.5 rounded-r-md flex items-center justify-between my-4 break-inside-avoid">
          <div class="flex items-center space-x-2.5">
            <span class="w-2 h-2 rounded-full bg-slate-700"></span>
            <h2 class="text-sm sm:text-base font-bold text-slate-800 uppercase tracking-wide leading-none">${nombre}</h2>
          </div>
          <span class="text-xs font-semibold text-slate-600 bg-white px-2.5 py-0.5 rounded-full border border-slate-200">${count} ${count === 1 ? 'ítem' : 'ítems'}</span>
        </div>
      `;
    },

    renderProductCard: function (producto, opciones) {
      const p = producto || {};
      const opts = opciones || {};
      const esc = this.escapeHtml;
      const codigo = esc(p.codigo || 'S/C');
      const nombre = esc(p.nombre || 'Producto');
      const precio = Number(p.precio_total || p.precio_base || 0).toFixed(2);
      const stock = Number(p.stock_disponible !== undefined ? p.stock_disponible : p.stock || 0);
      const imgHtml = p.imagen
        ? `<img src="${esc(p.imagen)}" alt="${nombre}" class="w-full h-full object-cover">`
        : `<div class="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-400"><div class="w-12 h-12 rounded-full bg-slate-200/80 text-slate-600 font-bold flex items-center justify-center text-sm uppercase mb-1">${this.getIniciales(nombre)}</div><span class="text-[9px] font-semibold uppercase">Sin Imagen</span></div>`;
      const stockHtml = opts.mostrarStock
        ? (stock > 0 ? `<span class="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Disp: ${stock}</span>` : `<span class="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">Agotado</span>`)
        : '';
      const waHtml = opts.botonWhatsapp
        ? `<button type="button" onclick="pedirProductoPorWhatsApp('${codigo}', '${encodeURIComponent(p.nombre || '')}', '${precio}')" class="no-print p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition text-xs font-bold border border-emerald-200 cursor-pointer"><i class="fa-brands fa-whatsapp text-sm"></i></button>`
        : '';
      return `
        <div class="catalogo-card bg-white rounded-md border border-slate-200 overflow-hidden flex flex-col justify-between shadow-xs">
          <div class="w-full h-40 sm:h-44 bg-slate-50 relative overflow-hidden border-b border-slate-100 flex items-center justify-center">${imgHtml}</div>
          <div class="p-3.5 flex flex-col flex-1 justify-between space-y-2.5">
            <div>
              <div class="flex items-center justify-between"><span class="text-xs font-mono font-medium text-gray-500">${codigo}</span>${stockHtml}</div>
              <h3 class="text-sm font-semibold text-gray-900 line-clamp-2 mt-1">${nombre}</h3>
            </div>
            <div class="pt-2 border-t border-slate-100 flex items-center justify-between">
              <div><span class="text-[9px] uppercase font-bold text-gray-400 block">Precio USD</span><span class="text-lg font-bold text-gray-900">$${precio}</span></div>
              ${waHtml}
            </div>
          </div>
        </div>
      `;
    },

    /**
     * Convierte un monto numérico a letras en español (formato fiscal venezolano).
     */
    numeroALetras: function (monto, moneda = 'USD', incluirMoneda = true) {
      const n = Math.abs(parseFloat(monto || 0));
      const entero = Math.floor(n + 1e-9);
      const centavos = Math.round((n - entero) * 100);
      const decStr = String(centavos === 100 ? 0 : centavos).padStart(2, '0');
      const intVal = centavos === 100 ? entero + 1 : entero;

      const UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
        'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
        'VEINTE', 'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
      const DECENAS = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
      const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

      function menorMil(num) {
        if (num === 0) return '';
        if (num === 100) return 'CIEN';
        const c = Math.floor(num / 100);
        const r = num % 100;
        let res = c > 0 ? CENTENAS[c] : '';
        if (r > 0) {
          if (res) res += ' ';
          if (r < 30) res += UNIDADES[r];
          else {
            const d = Math.floor(r / 10);
            const u = r % 10;
            res += DECENAS[d] + (u > 0 ? ` Y ${UNIDADES[u]}` : '');
          }
        }
        return res;
      }

      function enteroALetras(num) {
        if (num === 0) return 'CERO';
        if (num >= 1000000000) return String(num);
        const millones = Math.floor(num / 1000000);
        const restoM = num % 1000000;
        const miles = Math.floor(restoM / 1000);
        const unidades = restoM % 1000;
        const partes = [];
        if (millones > 0) partes.push(millones === 1 ? 'UN MILLÓN' : `${menorMil(millones)} MILLONES`);
        if (miles > 0) partes.push(miles === 1 ? 'MIL' : `${menorMil(miles)} MIL`);
        if (unidades > 0) partes.push(menorMil(unidades));
        return partes.join(' ');
      }

      let letras = enteroALetras(intVal);
      // Ajuste final "UN" -> "UNO" cuando no precede moneda masculina o suena mejor: "CIENTO UNO", pero "UN DÓLAR"
      if (incluirMoneda) {
        const mUpper = String(moneda || 'USD').toUpperCase();
        const nomMon = mUpper === 'VES' || mUpper === 'BS'
          ? (intVal === 1 ? 'BOLÍVAR' : 'BOLÍVARES')
          : (mUpper === 'COP' ? (intVal === 1 ? 'PESO' : 'PESOS') : (intVal === 1 ? 'DÓLAR' : 'DÓLARES'));
        return `${letras} ${nomMon} CON ${decStr}/100`;
      }
      return `${letras} CON ${decStr}/100`;
    },

    _buildLightweightQrSvg: function (payloadText, sizePx = 64) {
      const s = String(payloadText || 'TAVO-CLOUD');
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      const grid = 15;
      const cell = sizePx / grid;
      let rects = '';
      for (let r = 0; r < grid; r++) {
        for (let c = 0; c < grid; c++) {
          const inTL = r < 5 && c < 5;
          const inTR = r < 5 && c >= grid - 5;
          const inBL = r >= grid - 5 && c < 5;
          let dark = false;
          if (inTL || inTR || inBL) {
            const lr = inBL ? r - (grid - 5) : r;
            const lc = inTR ? c - (grid - 5) : c;
            dark = lr === 0 || lr === 4 || lc === 0 || lc === 4 || (lr === 2 && lc === 2);
          } else {
            const seed = ((h >>> ((r + c) % 24)) ^ (r * 31 + c * 17) ^ s.charCodeAt((r * grid + c) % s.length)) & 1;
            dark = seed === 1;
          }
          if (dark) {
            rects += `<rect x="${(c * cell).toFixed(1)}" y="${(r * cell).toFixed(1)}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}" fill="#000"/>`;
          }
        }
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="0 0 ${sizePx} ${sizePx}" style="display:block;margin:4px auto;background:#fff;">${rects}</svg>`;
    },

    _normalizeFiscalDocKind: function (tipoDoc) {
      const s = String(tipoDoc || 'FACTURA').toUpperCase().trim();
      if (s.includes('CRÉDITO') || s.includes('CREDITO') || s === 'NOTA_CREDITO_DEVOLUCION' || s === 'NC') return 'NOTA DE CRÉDITO';
      if (s.includes('DÉBITO') || s.includes('DEBITO') || s === 'NOTA_DEBITO_AJUSTE' || s === 'ND') return 'NOTA DE DÉBITO';
      return 'FACTURA';
    },

    _extractFiscalMetrics: function (tipoDoc, data, configTenant) {
      const kind = this._normalizeFiscalDocKind(tipoDoc);
      const d = data || {};
      const cfg = configTenant || {};
      const tasaVes = parseFloat(d.tasa_ves || cfg.tasa_ves || 45);
      const tasaCop = parseFloat(d.tasa_cop || cfg.tasa_cop || 4100);
      const detalles = Array.isArray(d.detalles) ? d.detalles : (Array.isArray(d.items) ? d.items : []);

      let exentoUsd = 0;
      let baseGravUsd = 0;
      let ivaUsd = 0;
      let descuentoTotalUsd = 0;

      detalles.forEach(it => {
        const cant = parseFloat(it.cantidad || 1);
        const pu = parseFloat(it.precio_unitario || 0);
        const subLine = it.subtotal !== undefined ? parseFloat(it.subtotal) : (cant * pu);
        const descPct = parseFloat(it.descuento || it.descuento_porcentaje || 0);
        if (descPct > 0 && descPct < 100) {
          descuentoTotalUsd += Math.max(0, (cant * pu) - subLine);
        }
        const imp = String(it.impuesto_tipo || 'gravado').toLowerCase();
        if (imp === 'exento') {
          exentoUsd += parseFloat(it.total !== undefined ? it.total : subLine);
        } else {
          baseGravUsd += subLine;
          const ivaLine = it.iva_unitario !== undefined ? (parseFloat(it.iva_unitario) * cant) : (parseFloat(it.total || subLine) - subLine);
          ivaUsd += Math.max(0, ivaLine);
        }
      });

      const subtotalNetoUsd = parseFloat(d.subtotal !== undefined ? d.subtotal : (d.subtotal_usd !== undefined ? d.subtotal_usd : (exentoUsd + baseGravUsd)));
      const ivaTotalUsd = parseFloat(d.iva_total !== undefined ? d.iva_total : (d.iva_usd !== undefined ? d.iva_usd : ivaUsd));
      const totalVentaUsd = parseFloat(d.total_usd !== undefined ? d.total_usd : (d.total !== undefined ? d.total : (subtotalNetoUsd + ivaTotalUsd)));
      if (detalles.length === 0) {
        if (ivaTotalUsd > 0) baseGravUsd = subtotalNetoUsd;
        else exentoUsd = subtotalNetoUsd;
      }

      const esEspecial = Number(cfg.es_contribuyente_especial) === 1 || Number(d.igtf_monto_usd || 0) > 0;
      const baseIgtfUsd = parseFloat(d.base_igtf_usd || 0);
      const igtfPct = parseFloat(d.igtf_porcentaje || cfg.igtf_porcentaje || 3.0);
      const igtfMontoUsd = parseFloat(d.igtf_monto_usd || 0);
      const igtfMontoVes = parseFloat(d.igtf_monto_ves || (igtfMontoUsd * tasaVes));
      const totalOperacionUsd = parseFloat(d.total_operacion_usd || (totalVentaUsd + igtfMontoUsd));
      const totalOperacionVes = parseFloat(d.total_operacion_ves || (totalOperacionUsd * tasaVes));
      const totalVentaVes = parseFloat(d.total_ves || (totalVentaUsd * tasaVes));
      const totalOpCop = parseFloat(d.total_cop || (totalOperacionUsd * tasaCop));

      const correlativo = kind === 'FACTURA'
        ? (d.numero_factura || d.numero_documento || '00000001')
        : (d.numero_devolucion || d.numero_nota || d.numero_ajuste || d.numero_documento || d.numero_factura || '00000001');
      const fechaEmision = d.fecha || d.fecha_emision || new Date().toLocaleString('es-VE');
      const factAfectadaNum = d.factura_numero_afectada || (kind !== 'FACTURA' ? (d.numero_factura || d.documento_referencia || '') : '');
      const factAfectadaFecha = d.factura_fecha_afectada || d.fecha_factura_original || '';
      const factAfectadaCtrl = d.factura_control_afectado || d.numero_control_afectado || '';
      const motivo = d.motivo || '';

      return {
        kind, d, cfg, detalles, tasaVes, tasaCop,
        exentoUsd, baseGravUsd, descuentoTotalUsd,
        subtotalNetoUsd, ivaTotalUsd, totalVentaUsd, totalVentaVes,
        esEspecial, baseIgtfUsd, igtfPct, igtfMontoUsd, igtfMontoVes,
        totalOperacionUsd, totalOperacionVes, totalOpCop,
        correlativo, fechaEmision,
        factAfectadaNum, factAfectadaFecha, factAfectadaCtrl, motivo
      };
    },

    _renderFiscalSheetUnified: function (tipoDoc, data, configTenant, customOverride, mode) {
      const m = this._extractFiscalMetrics(tipoDoc, data, configTenant);
      const docTypeKey = m.kind === 'NOTA DE CRÉDITO'
        ? 'nota_credito_devolucion'
        : (m.kind === 'NOTA DE DÉBITO' ? 'nota_debito_ajuste' : 'factura_a4');

      const basePaper = mode === 'media_carta' ? 'half_letter' : 'letter';
      const mergedOverride = Object.assign({ tamano_papel: basePaper }, customOverride || {});
      const fmt = this.getDocFormat(docTypeKey, mergedOverride);
      if (mode === 'media_carta') fmt.tamano_papel = 'half_letter';

      const esc = this.escapeHtml;
      const colorPrim = fmt.color_primario || '#0f172a';
      const colorSec = fmt.color_secundario || '#0284c7';
      const isMedia = mode === 'media_carta';
      const sheetW = isMedia ? '216mm' : '216mm';
      const sheetMinH = isMedia ? '140mm' : '279mm';
      const padMm = Number.isFinite(Number(fmt.margen_mm)) ? Number(fmt.margen_mm) : 10;
      const scopeClass = `mrl-fiscal-${mode}-${docTypeKey}`;
      const isNC = m.kind === 'NOTA DE CRÉDITO';
      const isND = m.kind === 'NOTA DE DÉBITO';
      const isNota = isNC || isND;

      // Encabezado (soporte Forma Libre Preimpresa vs Estándar con Alineación Real de Logo)
      const formaLibreSpacerMm = Number.isFinite(Number(fmt.margen_superior_forma_libre_mm)) ? Number(fmt.margen_superior_forma_libre_mm) : 35;
      const headerHtml = fmt.modo_forma_libre
        ? `<div class="mrl-forma-libre-spacer" style="height: ${formaLibreSpacerMm}mm; border-bottom: 1px dashed #cbd5e1; margin-bottom: 8px; display:flex; align-items:flex-end; justify-content:flex-end; padding-bottom:4px;">
             <div style="text-align:right; font-size:10px; line-height:1.35;">
               <strong style="font-size:13px; color:${colorPrim};">${esc(fmt.titulo_documento || m.kind)} N° ${esc(m.correlativo)}</strong>
               <div>Emisión: ${esc(m.fechaEmision)}</div>
             </div>
           </div>`
        : this.renderUniversalHeader(
            { tipo: fmt.titulo_documento || m.kind, numero: m.correlativo, fecha: m.fechaEmision },
            m.cfg,
            Object.assign({}, fmt, { titulo_documento: fmt.titulo_documento || m.kind })
          );

      // Bloque Obligatorio Documento Afectado para NC / ND
      const docAfectadoHtml = isNota ? `
        <div class="mrl-doc-afectado-box" style="background: ${isNC ? '#ecfeff' : '#fff7ed'}; border: 1.5px solid ${isNC ? '#0891b2' : '#ea580c'}; border-radius: 6px; padding: 7px 12px; margin-bottom: 10px; font-size: 10.5px;">
          <div style="font-weight: 900; text-transform: uppercase; color: ${isNC ? '#0e7490' : '#c2410c'}; font-size: 9.5px; letter-spacing: 0.4px; margin-bottom: 3px;">
            DOCUMENTO FISCAL AFECTADO (PROVIDENCIA SENIAT 0071)
          </div>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
            <div><strong>N° Factura Afectada:</strong> <span style="font-family:monospace;font-weight:900;">${esc(m.factAfectadaNum || 'SIN REFERENCIA')}</span></div>
            <div><strong>Fecha Factura Afectada:</strong> <span style="font-family:monospace;">${esc(m.factAfectadaFecha || '-')}</span></div>
            <div>${m.factAfectadaCtrl ? `<strong>N° Control Afectado:</strong> <span style="font-family:monospace;">${esc(m.factAfectadaCtrl)}</span>` : `<strong>Modalidad:</strong> ${esc(String(m.d.tipo_devolucion || 'Fiscal').toUpperCase())}`}</div>
          </div>
          ${m.motivo ? `<div style="margin-top: 3px;"><strong>Motivo:</strong> <em>${esc(m.motivo)}</em></div>` : ''}
        </div>
      ` : '';

      const isCredito = String(m.d.tipo_venta || m.d.condicion_pago || '').toLowerCase() === 'credito';
      const clientBoxHtml = `
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; margin-bottom: 10px; display: grid; grid-template-columns: 1.5fr 1.2fr; gap: 10px; font-size: 10.5px;">
          <div style="line-height: 1.4;">
            <span style="font-size: 8.5px; font-weight: 800; text-transform: uppercase; color: #64748b; display: block;">Datos del Cliente / Adquirente</span>
            <strong style="font-size: 12px; color: #0f172a;">${esc(m.d.cliente_nombre || 'Consumidor Final')}</strong>
            <div><strong>RIF / Cédula:</strong> <span style="font-family: monospace;">${esc(m.d.cliente_cedula || '-')}</span> &bull; <strong>Tel:</strong> ${esc(m.d.cliente_telefono || '-')}</div>
            <div><strong>Dirección Fiscal:</strong> ${esc(m.d.cliente_direccion || 'No registrada')}</div>
          </div>
          <div style="line-height: 1.4; border-left: 1px dashed #cbd5e1; padding-left: 10px;">
            <div><strong>Documento:</strong> <span style="font-weight:900;color:${colorPrim};">${esc(m.kind)} #${esc(m.correlativo)}</span></div>
            <div><strong>Emisión:</strong> ${esc(m.fechaEmision)}</div>
            ${m.d.fecha_vencimiento ? `<div><strong>Vencimiento:</strong> ${esc(m.d.fecha_vencimiento)}</div>` : ''}
            <div><strong>Condición:</strong> <span style="font-weight:800;color:${isCredito ? '#b45309' : '#047857'};">${isCredito ? 'A CRÉDITO' : 'AL CONTADO'}</span></div>
            ${(fmt.columnas.vendedor !== false && fmt.mostrar_vendedor !== false && (m.d.vendedor_nombre || m.d.usuario_nombre)) ? `<div><strong>Vendedor:</strong> ${esc(m.d.vendedor_nombre || m.d.usuario_nombre)}</div>` : ''}
          </div>
        </div>
      `;

      // Tabla dinámica de ítems respetando columnas configurables en Estudio
      const colsDef = [
        { key: 'sku', label: 'Código SKU', width: '13%', mono: true, render: r => esc(r.codigo || '—') },
        { key: 'descripcion', label: 'Descripción', render: r => `<strong>${esc(r.nombre || r.nombre_producto || 'Producto')}</strong>` },
        { key: 'iva', label: '% IVA', align: 'center', width: '8%', render: r => (r.impuesto_tipo === 'gravado' ? '16%' : 'Exento') },
        { key: 'cantidad', label: 'Cantidad', align: 'right', width: '9%', mono: true, render: r => parseFloat(r.cantidad || 0).toFixed(2) },
        { key: 'precio_unitario', label: 'Precio Unit.', align: 'right', width: '12%', mono: true, render: r => `$${parseFloat(r.precio_unitario || 0).toFixed(2)}` },
        { key: 'descuento', label: 'Desc (%)', align: 'right', width: '8%', render: r => `${parseFloat(r.descuento || r.descuento_porcentaje || 0)}%` },
        { key: 'total', label: 'Total ($)', align: 'right', width: '13%', mono: true, render: r => `<strong>$${parseFloat(r.total || r.subtotal || 0).toFixed(2)}</strong>` }
      ];
      const visibleCols = colsDef.filter(c => !fmt.columnas || fmt.columnas[c.key] !== false);
      const padCell = isMedia ? '4px 6px' : (ROW_PAD_MAP[fmt.densidad_filas] || '5px 8px');
      const tableHtml = visibleCols.length > 0 ? `
        <table class="mrl-table" style="width: 100%; border-collapse: collapse; margin-bottom: 10px; border: 1px solid #cbd5e1; font-size: ${isMedia ? '9.5px' : '10.5px'};">
          <thead>
            <tr style="background-color: ${colorPrim}; color: #ffffff;">
              ${visibleCols.map(c => `<th style="${c.width ? `width:${c.width};` : ''} text-align:${c.align || 'left'}; padding:${padCell}; font-size:8.5px; text-transform:uppercase;">${esc(c.label)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${m.detalles.map(it => `<tr>${visibleCols.map(c => `<td style="text-align:${c.align || 'left'}; padding:${padCell}; border-bottom:1px solid #e2e8f0; ${c.mono ? 'font-family:monospace;' : ''}">${c.render(it)}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      ` : '';

      const aplicaIgtf = m.esEspecial && m.igtfMontoUsd > 0;
      const leyendaIgtfHtml = aplicaIgtf ? `
        <div style="margin-top: 6px; padding: 6px 8px; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 5px; font-size: 9px; color: #78350f; line-height: 1.35;">
          <strong>Gaceta Oficial N° 42.339 del 17/03/2022 (Decreto SNAT/2022/000013):</strong> Agente de Percepción IGTF (${m.igtfPct.toFixed(0)}%) sobre pagos en divisas: <strong>$${m.igtfMontoUsd.toFixed(2)} USD</strong> (${fmtVes(m.igtfMontoVes)} Bs.).
        </div>
      ` : '';

      const sonLetrasUsd = this.numeroALetras(m.totalOperacionUsd, 'USD', true);
      const sonLetrasVes = fmt.mostrar_equivalente_ves !== false ? this.numeroALetras(m.totalOperacionVes, 'VES', true) : '';

      const pieDosColsHtml = `
        <div class="avoid-page-break" style="display: grid; grid-template-columns: 1.25fr 1fr; gap: 12px; align-items: start; margin-top: 6px;">
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; font-size: 9.8px; line-height: 1.45;">
            <div style="display:flex;justify-content:space-between;"><span>Total Neto:</span><strong style="font-family:monospace;">$${m.subtotalNetoUsd.toFixed(2)}</strong></div>
            <div style="display:flex;justify-content:space-between;"><span>Descuento:</span><strong style="font-family:monospace;">$${m.descuentoTotalUsd.toFixed(2)}</strong></div>
            <div><strong>Detalle / Comentario:</strong> ${esc(m.d.notas || (isNota ? m.motivo : 'Operación comercial regular.'))}</div>
            <div><strong>Factor de Cambio BCV:</strong> <span style="font-family:monospace;">${m.tasaVes.toFixed(2)} Bs./USD</span></div>
            <div><strong>Monto Total en USD:</strong> <strong style="font-family:monospace;">$${m.totalOperacionUsd.toFixed(2)} USD</strong></div>
            <div style="margin-top:4px; padding-top:4px; border-top:1px dashed #cbd5e1;">
              <strong>Son:</strong> ${esc(sonLetrasUsd)}${sonLetrasVes ? `<br><span style="color:#475569;font-size:9px;">(${esc(sonLetrasVes)})</span>` : ''}
            </div>
            ${leyendaIgtfHtml}
            ${fmt.mostrar_desglose_pagos ? this._buildPagosBreakdownHtml(m.d.pagos, isCredito, m.d.saldo_pendiente, '') : ''}
          </div>
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; font-size: 10px; line-height: 1.5;">
            <div style="display:flex;justify-content:space-between;"><span>Bienes o Servicios Exentos/Exonerados:</span><strong style="font-family:monospace;">$${m.exentoUsd.toFixed(2)}</strong></div>
            <div style="display:flex;justify-content:space-between;"><span>Base Imponible (16%):</span><strong style="font-family:monospace;">$${m.baseGravUsd.toFixed(2)}</strong></div>
            <div style="display:flex;justify-content:space-between;"><span>I.V.A. (16%):</span><strong style="font-family:monospace;">$${m.ivaTotalUsd.toFixed(2)}</strong></div>
            <div style="display:flex;justify-content:space-between;border-top:1px solid #cbd5e1;margin-top:3px;padding-top:3px;font-weight:800;">
              <span>Monto Total de la Venta:</span><span style="font-family:monospace;">$${m.totalVentaUsd.toFixed(2)}</span>
            </div>
            ${aplicaIgtf ? `
              <div style="display:flex;justify-content:space-between;color:#92400e;margin-top:3px;"><span>Base del IGTF (${m.igtfPct.toFixed(0)}%):</span><strong style="font-family:monospace;">$${m.baseIgtfUsd.toFixed(2)}</strong></div>
              <div style="display:flex;justify-content:space-between;color:#92400e;"><span>Monto IGTF (${m.igtfPct.toFixed(0)}%):</span><strong style="font-family:monospace;">$${m.igtfMontoUsd.toFixed(2)}</strong></div>
            ` : ''}
            <div style="display:flex;justify-content:space-between;border-top:2px solid ${colorPrim};margin-top:4px;padding-top:4px;font-size:12px;font-weight:900;color:#0f172a;">
              <span>${aplicaIgtf ? 'MONTO TOTAL DE LA OPERACIÓN:' : 'TOTAL A PAGAR USD:'}</span>
              <span style="font-family:monospace;">$${m.totalOperacionUsd.toFixed(2)}</span>
            </div>
            ${fmt.mostrar_equivalente_ves !== false ? `
              <div style="display:flex;justify-content:space-between;font-size:9.8px;color:#334155;margin-top:3px;border-top:1px dotted #cbd5e1;padding-top:3px;">
                <span>Total en Bolívares (Bs.):</span><strong style="font-family:monospace;">${fmtVes(m.totalOperacionVes)} Bs.</strong>
              </div>
            ` : ''}
            ${fmt.mostrar_equivalente_cop ? `
              <div style="display:flex;justify-content:space-between;font-size:9.5px;color:#334155;">
                <span>Total en Pesos (COP):</span><strong style="font-family:monospace;">${fmtCop(m.totalOpCop)} COP</strong>
              </div>
            ` : ''}
          </div>
        </div>
      `;

      const pageSizeRule = isMedia
        ? `@page { size: 216mm 140mm; margin: ${padMm}mm; }`
        : `@page { size: ${fmt.tamano_papel === 'a4' ? 'A4' : (fmt.tamano_papel === 'legal' ? 'legal' : 'letter')} ${fmt.orientacion === 'landscape' ? 'landscape' : 'portrait'}; margin: ${padMm}mm; }`;

      const footerHtml = fmt.modo_forma_libre ? '' : this.renderUniversalFooter(m.cfg, fmt);

      return `
        ${this.getScopedStyleBlock(fmt, scopeClass)}
        <style>@media print { ${pageSizeRule} }</style>
        <div class="doc-sheet mrl-doc-root ${scopeClass}" data-fiscal-format="${esc(mode)}" style="width:${sheetW}; max-width:100%; min-height:${isMedia ? 'auto' : '240mm'}; padding:14px 18px; margin:0 auto; background:#fff; color:#0f172a;">
          ${headerHtml}
          ${docAfectadoHtml}
          ${clientBoxHtml}
          ${tableHtml}
          ${pieDosColsHtml}
          ${footerHtml}
        </div>
      `;
    },

    renderDocumentoFiscalCarta: function (tipoDoc, data, configTenant, customOverride) {
      return this._renderFiscalSheetUnified(tipoDoc, data, configTenant, customOverride, 'carta');
    },

    renderDocumentoFiscalMediaCarta: function (tipoDoc, data, configTenant, customOverride) {
      return this._renderFiscalSheetUnified(tipoDoc, data, configTenant, customOverride, 'media_carta');
    },

    _renderFiscalTicketUnified: function (tipoDoc, data, configTenant, customOverride, mmWidth) {
      const m = this._extractFiscalMetrics(tipoDoc, data, configTenant);
      const is58 = mmWidth === 58;
      const docTypeKey = m.kind === 'NOTA DE CRÉDITO' ? 'nota_credito_devolucion' : (m.kind === 'NOTA DE DÉBITO' ? 'nota_debito_ajuste' : 'factura_ticket');
      const paperTok = is58 ? 'ticket_58' : 'ticket_80';
      const fmt = this.getDocFormat(docTypeKey, Object.assign({ tamano_papel: paperTok }, customOverride || {}));
      const esc = this.escapeHtml;
      const maxW = is58 ? '200px' : '280px';
      const fontSz = is58 ? '9px' : '10px';
      const isNota = m.kind === 'NOTA DE CRÉDITO' || m.kind === 'NOTA DE DÉBITO';
      const aplicaIgtf = m.esEspecial && m.igtfMontoUsd > 0;
      const empresaNombre = (m.cfg.nombre_negocio || 'MI EMPRESA COMERCIAL').trim();
      const align = fmt.logo_alineacion || 'centro';
      const textAlign = align === 'derecha' ? 'right' : (align === 'izquierda' ? 'left' : 'center');

      const docAfectadoTicketHtml = isNota ? `
        <div style="border: 1px dashed #000; padding: 3px 4px; margin: 4px 0; font-size: ${is58 ? '8.5px' : '9px'}; line-height: 1.3;">
          <div style="font-weight:900;">${is58 ? 'FACT. AFECTADA:' : 'FACTURA AFECTADA:'} ${esc(m.factAfectadaNum || 'SIN REF.')}</div>
          <div>${is58 ? 'FECHA FACT.:' : 'FECHA FACTURA:'} ${esc(m.factAfectadaFecha || '-')}</div>
          ${m.factAfectadaCtrl ? `<div>CTRL AFECT.: ${esc(m.factAfectadaCtrl)}</div>` : ''}
          ${m.motivo ? `<div>MOTIVO: ${esc(m.motivo.slice(0, is58 ? 28 : 44))}</div>` : ''}
        </div>
      ` : '';

      let itemsHtml = '';
      m.detalles.forEach(it => {
        const sku = (fmt.columnas.sku !== false && it.codigo) ? `[${esc(it.codigo)}] ` : '';
        const nom = esc(it.nombre || it.nombre_producto || 'Ítem');
        const tagIva = it.impuesto_tipo === 'gravado' ? '(G)' : '(E)';
        const cant = parseFloat(it.cantidad || 1);
        const pu = parseFloat(it.precio_unitario || 0);
        const tot = parseFloat(it.total || it.subtotal || (cant * pu));
        const desc = parseFloat(it.descuento || it.descuento_porcentaje || 0);
        const descStr = (fmt.columnas.descuento !== false && desc > 0) ? ` -${desc}%` : '';

        if (is58) {
          // Línea 1: Descripción + (G)/(E) (máx ~32 chars wrap seguro), Línea 2: cant x p.unit + total
          itemsHtml += `
            <div style="margin-bottom:3px;">
              <div style="font-weight:bold;word-break:break-word;">${sku}${nom.slice(0, 27)} ${tagIva}${descStr}</div>
              <div style="display:flex;justify-content:space-between;">
                <span>${cant.toFixed(cant % 1 === 0 ? 0 : 2)} x $${pu.toFixed(2)}</span>
                <strong>$${tot.toFixed(2)}</strong>
              </div>
            </div>
          `;
        } else {
          itemsHtml += `
            <div style="margin-bottom:3px;">
              <div style="display:flex;justify-content:space-between;gap:4px;">
                <span style="font-weight:bold;">${sku}${nom} ${tagIva}${descStr}</span>
                <strong>$${tot.toFixed(2)}</strong>
              </div>
              ${cant !== 1 ? `<div style="font-size:9px;padding-left:6px;">${cant.toFixed(cant % 1 === 0 ? 0 : 2)} x $${pu.toFixed(2)}</div>` : ''}
            </div>
          `;
        }
      });

      const pagosList = Array.isArray(m.d.pagos) ? m.d.pagos : [];
      const totalPagadoUsd = pagosList.reduce((acc, p) => acc + parseFloat(p.equivalente_usd || 0), 0);
      const cambioUsd = Math.max(0, totalPagadoUsd - m.totalOperacionUsd);
      const pagosHtml = (fmt.mostrar_desglose_pagos && pagosList.length > 0) ? `
        <div style="border-top: 1px dashed #000; padding-top: 3px; margin-top: 4px; font-size: ${is58 ? '8.5px' : '9px'};">
          <div style="font-weight:bold;">${isNota ? 'REEMBOLSO / PAGOS:' : 'FORMAS DE PAGO:'}</div>
          ${pagosList.map(p => `<div style="display:flex;justify-content:space-between;"><span>${esc(p.metodo || p.moneda)}</span><span>${parseFloat(p.monto_moneda || 0).toFixed(2)} ${esc(p.moneda || 'USD')}</span></div>`).join('')}
          ${cambioUsd > 0.005 ? `<div style="display:flex;justify-content:space-between;font-weight:bold;"><span>CAMBIO USD:</span><span>$${cambioUsd.toFixed(2)}</span></div>` : ''}
        </div>
      ` : '';

      const qrSvg = this._buildLightweightQrSvg(`${m.kind}|${m.correlativo}|${m.totalOperacionUsd.toFixed(2)}|${m.cfg.documento_fiscal || ''}`, is58 ? 52 : 64);

      return `
        <style>@media print { @page { size: ${mmWidth}mm auto; margin: ${Number(fmt.margen_mm || 2)}mm 1mm; } }</style>
        <div class="doc-sheet doc-ticket mrl-fiscal-${paperTok}" data-fiscal-format="${paperTok}" style="width:${maxW}; max-width:${maxW}; margin:0 auto; padding:${is58 ? '4px' : '6px'}; font-family:'Courier New', Courier, monospace; font-size:${fontSz}; color:#000; background:#fff; line-height:1.28;">
          <div style="text-align:${textAlign}; border-bottom:1px dashed #000; padding-bottom:4px; margin-bottom:4px;">
            ${fmt.mostrar_logo && m.cfg.logo_url ? `<img src="${esc(m.cfg.logo_url)}" alt="Logo" style="max-height:${is58 ? '28px' : '38px'};object-fit:contain;margin:0 auto 3px auto;display:block;">` : ''}
            <div style="font-weight:900; font-size:${is58 ? '10.5px' : '12px'}; text-transform:uppercase;">${esc(empresaNombre)}</div>
            ${fmt.mostrar_rif !== false && m.cfg.documento_fiscal ? `<div>RIF: ${esc(m.cfg.documento_fiscal)}</div>` : ''}
            ${fmt.mostrar_telefono !== false && m.cfg.telefono ? `<div>TEL: ${esc(m.cfg.telefono)}</div>` : ''}
            ${fmt.mostrar_direccion !== false && m.cfg.direccion ? `<div style="font-size:${is58 ? '8px' : '8.5px'};">${esc(m.cfg.direccion)}</div>` : ''}
          </div>
          <div style="text-align:center; border-bottom:1px dashed #000; padding-bottom:4px; margin-bottom:4px;">
            <div style="font-weight:900; font-size:${is58 ? '10px' : '11px'};">${esc(m.kind)} #${esc(m.correlativo)}</div>
            <div>FECHA: ${esc(m.fechaEmision)}</div>
            <div>CAJA/CAJERO: ${esc(m.d.vendedor_nombre || m.d.usuario_nombre || 'Principal')}</div>
          </div>
          <div style="border-bottom:1px dashed #000; padding-bottom:4px; margin-bottom:4px;">
            <div>CLIENTE: <strong>${esc(m.d.cliente_nombre || 'Consumidor Final')}</strong></div>
            <div>RIF/CI: ${esc(m.d.cliente_cedula || '-')}</div>
          </div>
          ${docAfectadoTicketHtml}
          <div style="border-bottom:1px dashed #000; padding-bottom:4px; margin-bottom:4px;">
            ${itemsHtml}
          </div>
          <div style="line-height:1.35;">
            <div style="display:flex;justify-content:space-between;"><span>SUBTTL:</span><span>$${m.subtotalNetoUsd.toFixed(2)}</span></div>
            <div style="display:flex;justify-content:space-between;"><span>EXENTO:</span><span>$${m.exentoUsd.toFixed(2)}</span></div>
            <div style="display:flex;justify-content:space-between;"><span>BI G16.00%:</span><span>$${m.baseGravUsd.toFixed(2)}</span></div>
            <div style="display:flex;justify-content:space-between;"><span>IVA G16.00%:</span><span>$${m.ivaTotalUsd.toFixed(2)}</span></div>
            ${aplicaIgtf ? `
              <div style="display:flex;justify-content:space-between;border-top:1px dotted #000;margin-top:2px;padding-top:2px;"><span>BASE IGTF ${m.igtfPct.toFixed(0)}%:</span><span>$${m.baseIgtfUsd.toFixed(2)}</span></div>
              <div style="display:flex;justify-content:space-between;"><span>IGTF ${m.igtfPct.toFixed(0)}%:</span><span>$${m.igtfMontoUsd.toFixed(2)}</span></div>
            ` : ''}
            <div style="display:flex;justify-content:space-between;font-weight:900;font-size:${is58 ? '10px' : '11px'};border-top:1px dashed #000;margin-top:2px;padding-top:2px;">
              <span>TOTAL:</span><span>$${m.totalOperacionUsd.toFixed(2)}</span>
            </div>
            ${fmt.mostrar_equivalente_ves !== false ? `<div style="display:flex;justify-content:space-between;"><span>TOTAL BS:</span><strong>${fmtVes(m.totalOperacionVes)} Bs</strong></div>` : ''}
            ${fmt.mostrar_equivalente_cop ? `<div style="display:flex;justify-content:space-between;"><span>TOTAL COP:</span><strong>${fmtCop(m.totalOpCop)} COP</strong></div>` : ''}
          </div>
          ${pagosHtml}
          <div style="text-align:center;margin-top:5px;">
            ${qrSvg}
            ${fmt.texto_pie_pagina ? `<div style="font-weight:bold;margin-top:2px;">${esc(fmt.texto_pie_pagina)}</div>` : ''}
            ${fmt.mostrar_marca_saas !== false ? `<div style="font-size:8px;margin-top:2px;">TAVO CLOUD</div>` : ''}
          </div>
        </div>
      `;
    },

    renderDocumentoFiscalTicket80: function (tipoDoc, data, configTenant, customOverride) {
      return this._renderFiscalTicketUnified(tipoDoc, data, configTenant, customOverride, 80);
    },

    renderDocumentoFiscalTicket58: function (tipoDoc, data, configTenant, customOverride) {
      return this._renderFiscalTicketUnified(tipoDoc, data, configTenant, customOverride, 58);
    },

    renderFacturaA4: function (factura, configTenant, customOverride) {
      return this.renderDocumento('factura_a4', factura, configTenant, customOverride);
    },

    renderFacturaTicket: function (factura, configTenant, customOverride) {
      return this.renderDocumento('factura_ticket', factura, configTenant, customOverride);
    },

    renderReporteCierreZA4: function (reporteZ, configTenant, customOverride) {
      return this.renderDocumento('cierre_z_a4', reporteZ, configTenant, customOverride);
    },

    renderReporteCierreZTicket: function (reporteZ, configTenant, customOverride) {
      return this.renderDocumento('cierre_z_ticket', reporteZ, configTenant, customOverride);
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MasterReportLayout;
  }
  global.MasterReportLayout = MasterReportLayout;

})(typeof window !== 'undefined' ? window : globalThis);
