export interface ProductoConStock {
  stock_producto?: number | null;
  stock_disponible?: number | null;
  disponible?: boolean;
  variantes?: { stock?: number | null }[] | null;
}

const cantidad = (valor: number | null | undefined): number => {
  const numero = Number(valor ?? 0);
  return Number.isFinite(numero) && numero > 0 ? numero : 0;
};

export const stockDisponibleProducto = (producto: ProductoConStock): number => {
  const total = cantidad(producto.stock_producto);
  if (total <= 0) return 0;

  const variantes = producto.variantes ?? [];
  if (variantes.length > 0) {
    const mejorVariante = Math.max(0, ...variantes.map((v) => cantidad(v.stock)));
    return Math.min(total, mejorVariante);
  }
  return total;
};

export const stockDisponibleVariante = (
  producto: ProductoConStock,
  variante: { stock?: number | null } | null | undefined,
): number => {
  const total = cantidad(producto.stock_producto);
  if (total <= 0) return 0;
  if (!variante) return stockDisponibleProducto(producto);
  return Math.min(total, cantidad(variante.stock));
};

export const productoDisponible = (producto: ProductoConStock): boolean =>
  stockDisponibleProducto(producto) > 0;
