// Pruebas del CartContext real (web) con las fronteras externas simuladas
// (autenticación). localStorage es real (jsdom), por lo que se prueba también la
// persistencia y recuperación del carrito con fracciones.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { CartProvider, useCart } from './CartContext';

vi.mock('@contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, user: null, rol: null, loading: false }),
}));

const wrapper = ({ children }: { children: ReactNode }) => <CartProvider>{children}</CartProvider>;

// Réplica de la clave interna (itemKey) para dirigir updateMetros/updateQuantity.
const itemKey = (item: { id_producto: number; color?: string; medida?: string; tamaño?: string; metros?: number; venta_por_metros?: boolean }) =>
  [
    item.id_producto,
    item.color?.toLowerCase(),
    (item.medida || item.tamaño || '').toLowerCase(),
    item.venta_por_metros && item.metros ? `${item.metros}m` : null,
  ]
    .filter(Boolean)
    .join('-');

const productoMetros = {
  id_producto: 1,
  nombre_producto: 'Cable LED',
  precio_venta_producto: 1000,
  imagen: '/productos/1.jpg',
  venta_por_metros: true,
  stock_maximo: 10,
};

const productoUnidad = {
  id_producto: 2,
  nombre_producto: 'Sensor',
  precio_venta_producto: 5000,
  imagen: '/productos/2.jpg',
  stock_maximo: 10,
};

describe('CartContext (real)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('añade un corte fraccionario de 1,5 m y lo conserva', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => {
      result.current.addItem(productoMetros, 1, 1.5);
    });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].metros).toBe(1.5);
    expect(result.current.items[0].cantidad).toBe(1);
  });

  it('edita metros con coma decimal sin guardar estados inválidos', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => {
      result.current.addItem(productoMetros, 1, 1.5);
    });
    const key = itemKey(result.current.items[0]);
    act(() => {
      const err = result.current.updateMetros(key, '2,5');
      expect(err).toBeNull();
    });
    expect(result.current.items[0].metros).toBe(2.5);
  });

  it('rechaza precisión excesiva sin redondear silenciosamente', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => {
      result.current.addItem(productoMetros, 1, 1.5);
    });
    const key = itemKey(result.current.items[0]);
    let error: string | null = null;
    act(() => {
      error = result.current.updateMetros(key, '1.555');
    });
    expect(error).not.toBeNull();
    expect(result.current.items[0].metros).toBe(1.5); // sin cambios
  });

  it('persiste y recupera la fracción del carrito', () => {
    const primero = renderHook(() => useCart(), { wrapper });
    act(() => {
      primero.result.current.addItem(productoMetros, 1, 1.5);
    });
    primero.unmount();

    const segundo = renderHook(() => useCart(), { wrapper });
    expect(segundo.result.current.items).toHaveLength(1);
    expect(segundo.result.current.items[0].metros).toBe(1.5);
  });

  it('mantiene cantidades enteras para productos por unidad', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => {
      result.current.addItem(productoUnidad, 3);
    });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].cantidad).toBe(3);
    expect(result.current.items[0].metros).toBeUndefined();
  });
});
