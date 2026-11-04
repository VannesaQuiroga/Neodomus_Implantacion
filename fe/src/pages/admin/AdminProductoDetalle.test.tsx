import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdiomaProvider } from '@i18n/IdiomaContext';
import api from '@services/api';
import AdminProductoDetalle from './AdminProductoDetalle';

vi.mock('@services/api', () => ({
  default: { get: vi.fn() },
}));

const renderDetalle = (ruta: string) =>
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <IdiomaProvider>
        <Routes>
          <Route path="/admin/productos/:id" element={<AdminProductoDetalle />} />
          <Route path="/admin/productos" element={<div>listado</div>} />
        </Routes>
      </IdiomaProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  localStorage.clear();
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/productos/categorias') return { data: [] };
    if (url === '/productos/proveedores') return { data: [] };
    if (url === '/especializaciones') return { data: [] };
    throw new Error(`Ruta inesperada: ${url}`);
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

describe('AdminProductoDetalle: volver conservando filtros', () => {
  it.each([
    ['categoria', '5'],
    ['proveedor', '9'],
  ])('conserva %s en el enlace Volver', async (filtro, valor) => {
    renderDetalle(`/admin/productos/nuevo?${filtro}=${valor}`);
    const volver = await screen.findByRole('link', { name: /Volver a productos/i });
    expect(volver.getAttribute('href')).toBe(`/admin/productos?${filtro}=${valor}`);
  });

  it('ignora filtros no numéricos', async () => {
    renderDetalle('/admin/productos/nuevo?categoria=abc');
    const volver = await screen.findByRole('link', { name: /Volver a productos/i });
    expect(volver.getAttribute('href')).toBe('/admin/productos');
  });
});
