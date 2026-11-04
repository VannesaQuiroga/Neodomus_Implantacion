import { useEffect, useMemo, useState } from 'react';

/**
 * Paginación client-side sobre una lista ya filtrada/ordenada.
 *
 * - Aplica los filtros ANTES de paginar: recibe la lista ya filtrada.
 * - Mantiene la página dentro de un rango válido cuando el total cambia
 *   (p. ej. al eliminar el último registro de la última página).
 * - `numeroFila(i)` devuelve la numeración consecutiva entre páginas
 *   (independiente del ID real, que siguen usando las acciones).
 */
export function usePaginacion<T>(items: T[], pageSize = 10) {
  const [page, setPage] = useState(1);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  const reset = () => setPage(1);

  const numeroFila = (indexEnPagina: number) => (page - 1) * pageSize + indexEnPagina + 1;

  return { page, setPage, totalPages, total, pageItems, reset, numeroFila };
}
