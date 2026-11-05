import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePaginacion } from './usePaginacion';

const filas = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));

describe('usePaginacion', () => {
  it('devuelve la primera página y el total de páginas', () => {
    const { result } = renderHook(() => usePaginacion(filas(25), 10));
    expect(result.current.page).toBe(1);
    expect(result.current.total).toBe(25);
    expect(result.current.totalPages).toBe(3);
    expect(result.current.pageItems).toHaveLength(10);
  });

  it('numera consecutivamente entre páginas', () => {
    const { result } = renderHook(() => usePaginacion(filas(25), 10));
    expect(result.current.numeroFila(0)).toBe(1);
    act(() => result.current.setPage(3));
    expect(result.current.numeroFila(0)).toBe(21);
    expect(result.current.pageItems).toHaveLength(5);
  });

  it('mantiene una página válida al encoger la lista (última página vacía)', () => {
    const { result, rerender } = renderHook(
      ({ items }: { items: { id: number }[] }) => usePaginacion(items, 10),
      { initialProps: { items: filas(25) } },
    );
    act(() => result.current.setPage(3));
    expect(result.current.page).toBe(3);

    rerender({ items: filas(20) });
    expect(result.current.page).toBe(2);
    expect(result.current.totalPages).toBe(2);
    expect(result.current.pageItems).toHaveLength(10);
  });

  it('lista vacía: una sola página y sin filas', () => {
    const { result } = renderHook(() => usePaginacion([], 10));
    expect(result.current.total).toBe(0);
    expect(result.current.totalPages).toBe(1);
    expect(result.current.pageItems).toHaveLength(0);
  });

  it('reset vuelve a la primera página', () => {
    const { result } = renderHook(() => usePaginacion(filas(25), 10));
    act(() => result.current.setPage(2));
    act(() => result.current.reset());
    expect(result.current.page).toBe(1);
  });
});
