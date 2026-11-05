import { describe, expect, it } from 'vitest';
import {
  precioOriginalProducto,
  precioUnitarioProducto,
  subtotalLinea,
  tienePromocionProducto,
} from './productoPrecio';

describe('productoPrecio', () => {
  it('usa el precio propio de la variante aunque el producto tenga promoción', () => {
    const producto = {
      precio_venta_producto: 1000,
      precio_final: 800,
      descuento_activo: 20,
    };
    expect(precioUnitarioProducto(producto, { precio: 750 })).toBe(750);
    expect(tienePromocionProducto(producto, { precio: 750 })).toBe(false);
    expect(precioOriginalProducto(producto, { precio: 750 })).toBeNull();
  });

  it('aplica la promoción del producto cuando la variante no tiene precio', () => {
    const producto = {
      precio_venta_producto: 1000,
      precio_final: 850,
      descuento_activo: 15,
    };
    expect(precioUnitarioProducto(producto, { precio: null })).toBe(850);
    expect(precioOriginalProducto(producto, { precio: null })).toBe(1000);
  });

  it('calcula el subtotal por metros sin redondear la longitud', () => {
    expect(subtotalLinea(1000, 3, 1.5)).toBe(4500);
    expect(subtotalLinea(333.335, 1, 1.5)).toBe(500);
  });

  it('cuantiza importes a dos decimales', () => {
    expect(precioUnitarioProducto({ precio_venta_producto: 10.005 })).toBe(10.01);
  });
});
