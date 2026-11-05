import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdiomaProvider } from '@i18n/IdiomaContext';
import api from '@services/api';
import AdminDashboard from './AdminDashboard';

vi.mock('@services/api', () => ({
  default: { get: vi.fn() },
}));

afterEach(cleanup);

describe('KPI de citas del dashboard administrativo', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        ventas_total: 0,
        pedidos_total: 0,
        pedidos_por_mes: [],
        productos_mas_vendidos: [],
        clientes_total: 0,
        citas_total: 3,
        citas_por_estado: {
          Pendiente: 3,
          Confirmada: 0,
          Finalizada: 0,
          Cancelada: 0,
        },
        citas_por_mes: [],
        tecnicos_total: 0,
        tecnicos_activos: 0,
        productos_total: 0,
        productos_activos: 0,
        solicitudes_pendientes: 0,
      },
    });
  });

  it('muestra el total cuando todas las citas están pendientes', async () => {
    render(
      <MemoryRouter>
        <IdiomaProvider>
          <AdminDashboard />
        </IdiomaProvider>
      </MemoryRouter>,
    );

    const etiquetas = await screen.findAllByText('Citas');
    const tarjeta = etiquetas
      .map((etiqueta) => etiqueta.closest('.ap-kpi'))
      .find((elemento) => elemento !== null);
    expect(tarjeta).not.toBeNull();
    expect(within(tarjeta as HTMLElement).getByText('3')).toBeTruthy();
    expect(
      within(tarjeta as HTMLElement).getByText(/3 pendientes/),
    ).toBeTruthy();
  });
});
