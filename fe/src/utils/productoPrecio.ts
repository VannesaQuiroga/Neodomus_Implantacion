export interface ProductoPrecioDatos {
  precio_venta_producto?: number | null;
  precio_final?: number | null;
  descuento_activo?: number | null;
}

export interface VariantePrecioDatos {
  precio?: number | null;
}

const numero = (valor: number | null | undefined): number => {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export const redondearImporte = (valor: number): number =>
  Math.round((valor + Number.EPSILON) * 100) / 100;

export const tienePromocionProducto = (
  producto: ProductoPrecioDatos,
  variante?: VariantePrecioDatos | null,
): boolean =>
  variante?.precio == null &&
  producto.precio_final != null &&
  numero(producto.descuento_activo) > 0;

export const precioUnitarioProducto = (
  producto: ProductoPrecioDatos,
  variante?: VariantePrecioDatos | null,
): number => {
  if (variante?.precio != null) return redondearImporte(numero(variante.precio));
  return redondearImporte(
    numero(producto.precio_final ?? producto.precio_venta_producto),
  );
};

export const precioOriginalProducto = (
  producto: ProductoPrecioDatos,
  variante?: VariantePrecioDatos | null,
): number | null => {
  if (!tienePromocionProducto(producto, variante)) return null;
  return redondearImporte(numero(producto.precio_venta_producto));
};

export const subtotalLinea = (
  precioUnitario: number,
  cantidad: number,
  metros?: number | null,
): number => {
  const unidades = metros != null ? metros * cantidad : cantidad;
  return redondearImporte(precioUnitario * unidades);
};
