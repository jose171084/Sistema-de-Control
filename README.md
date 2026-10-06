# Sistema de Control de Inventarios y Facturación Multimoneda

Sistema web profesional desarrollado con arquitectura modular en Python 3 y JavaScript para el control integral de inventarios, facturación con pagos mixtos y compras.

## Características Principales y Módulos

### 1. Módulo de Categorías (Clasificación Maestra)
- Clasificación estricta en dos grupos:
  1. **Servicios**: Todos los ítems asignados aquí **no manejan existencias** físicas (no se contabiliza stock ni se descuenta).
  2. **Productos**: Todos los ítems asignados aquí **controlan existencias** en inventario.
- Panel con badges diferenciados, conteo y reglas claras de existencia.

### 2. Módulo de Productos y Servicios
- Creación de catálogo para la venta con generación de códigos automáticos o personalizados.
- Clasificación de ítem (`Servicio` o `Producto`).
- Régimen de Impuesto: `Gravado` o `Exento`.
  - Si es **Gravado**: calcula automáticamente el **16% de IVA** sobre el precio base.
  - Muestra precio base, IVA calculado y precio total final con conversión en tiempo real a Bolívares y Pesos.
- Soporte para subir fotos o imágenes de los productos con vista previa.
- Si se clasifica como `Producto`: campo para ingresar y monitorear la **Cantidad (Stock actual)** y **Stock Mínimo** de alerta.

### 3. Módulo de Clientes
- Registro de clientes con campos:
  - Nombre / Razón Social
  - Cédula / RIF
  - Teléfono para WhatsApp (con botón de acceso rápido para iniciar chat directo en `https://wa.me/`)
  - Correo electrónico
  - Dirección fiscal / despacho

### 4. Módulo de Facturación (Punto de Venta Multimoneda)
- Enlazado en tiempo real con Productos y Clientes.
- Si el ítem facturado es **Producto**, valida disponibilidad y **resta automáticamente la cantidad** del inventario. Si es **Servicio**, no descuenta stock.
- **Formas de Pago y Pago Mixto Multimoneda**:
  - Dólar ($ / USD)
  - Bolívar (Bs. / VES)
  - Pesos Colombianos (COP)
  - Soporte de pagos divididos en varias monedas (ej. parte en USD efectivo, parte en Bolívares por Pago Móvil o Punto, y parte en Pesos).
  - Cálculo automático del monto cubierto, saldo pendiente y vuelto/cambio a entregar en la divisa deseada.
- Generación de comprobante / ticket con formato imprimible (`@media print` para tickets de 80mm o factura estándar) y botón para **enviar resumen por WhatsApp** al cliente con un solo clic.

### 5. Módulo de Compras
- Enlazado con Inventario: cada vez que se incluye una compra, **incrementa las cantidades** en los ítems clasificados como Productos y actualiza el costo.
- Enlazado con Proveedores.
- **Carga de compra con foto de la factura del proveedor**: soporte para subir foto física del comprobante con visor ampliado.
- Registro de fecha, costo unitario, IVA y número de control.
- **Creación en el acto**: Si el ítem comprado aún no existe en el catálogo, permite crearlo directamente desde el módulo de compras sin salir del flujo de trabajo.

### 6. Módulo de Proveedores
- Registro con Razón Social, Cédula/RIF, Teléfono para WhatsApp (con enlace directo), Correo y Dirección.

### 7. Panel de Tasas y Configuración
- Configuración de la tasa de cambio del Bolívar (Bs. / USD).
- Configuración de la tasa de cambio del Peso (COP / USD).
- Configuración del porcentaje de IVA (por defecto 16%).
- Datos fiscales de la empresa para el encabezado de las facturas.

---

## Cómo Ejecutar la Aplicación

No requiere instalaciones de paquetes externos (`pip`), funciona 100% con la librería estándar de Python 3.

### Opción 1: Con el lanzador rápido (Windows)
Haz doble clic sobre el archivo `run.bat`. Esto abrirá el navegador en `http://localhost:8000` e iniciará el servidor.

### Opción 2: Desde la terminal
```bash
python server.py
```
Luego abre tu navegador en:
`http://localhost:8000`
