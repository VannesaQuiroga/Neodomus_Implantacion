import { describe, expect, it } from 'vitest';
import {
  productoDisponible,
  stockDisponibleProducto,
  stockDisponibleVariante,
} from './productoDisponibilidad';

describe('disponibilidad de productos', () => {
  it('considera agotado el stock cero o inválido', () => {
    expect(productoDisponible({ stock_producto: 0 })).toBe(false);
    expect(productoDisponible({ stock_producto: -2 })).toBe(false);
    expect(productoDisponible({ stock_producto: null })).toBe(false);
    expect(productoDisponible({ stock_producto: 0.01 })).toBe(true);
  });

  it('usa la última unidad como disponible sin comparar contra un umbral', () => {
    expect(stockDisponibleProducto({ stock_producto: 1 })).toBe(1);
    expect(productoDisponible({ stock_producto: 1 })).toBe(true);
  });

  it('con variantes exige stock de variante y no suma inventarios incompatibles', () => {
    const producto = {
      stock_producto: 10,
      variantes: [{ stock: 3 }, { stock: 4 }],
    };
    expect(stockDisponibleProducto(producto)).toBe(4);

    expect(
      productoDisponible({ stock_producto: 10, variantes: [{ stock: 0 }] }),
    ).toBe(false);

    expect(
      productoDisponible({ stock_producto: 0, variantes: [{ stock: 5 }] }),
    ).toBe(false);
  });

  it('limita la variante al stock total del producto', () => {
    const producto = { stock_producto: 2, variantes: [{ stock: 9 }] };
    expect(stockDisponibleVariante(producto, { stock: 9 })).toBe(2);
    expect(stockDisponibleVariante(producto, { stock: 0 })).toBe(0);
    expect(stockDisponibleVariante(producto, null)).toBe(2);
  });

  it('conserva la precisión de productos por metros', () => {
    expect(stockDisponibleProducto({ stock_producto: 1.25 })).toBe(1.25);
    expect(stockDisponibleProducto({ stock_producto: 0.01 })).toBe(0.01);
    expect(productoDisponible({ stock_producto: 0.01 })).toBe(true);
  });
});
