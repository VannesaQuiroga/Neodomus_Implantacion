import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdiomaProvider } from '@i18n/IdiomaContext';
import api from '@services/api';
import Notificaciones from './Notificaciones';

const auth = vi.hoisted(() => ({
  current: {
    user: { id: 1, nombre: 'Cliente', correo: 'cliente@test.com', rol: 'cliente' },
    rol: 'cliente',
  },
}));

vi.mock('@contexts/AuthContext', () => ({
  useAuth: () => auth.current,
}));

vi.mock('@services/api', () => ({
  default: { get: vi.fn(), patch: vi.fn() },
}));

const notificacion = (overrides: Record<string, unknown> = {}) => ({
  id_notificacion: 10,
  tipo: 'pedido',
  titulo: 'Pedido listo',
  mensaje: 'Tu pedido está disponible.',
  leida: false,
  fecha_creacion: '2026-10-27T10:00:00',
  ...overrides,
});

const renderizar = () =>
  render(
    <MemoryRouter initialEntries={['/notificaciones']}>
      <IdiomaProvider>
        <Routes>
          <Route path="/notificaciones" element={<Notificaciones />} />
          <Route path="/perfil" element={<div>DESTINO PERFIL</div>} />
        </Routes>
      </IdiomaProvider>
    </MemoryRouter>,
  );

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

describe('Apartado de notificaciones', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({ data: [notificacion()] });
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
  });

  it('marca una sola vez al abrir y navega al destino correcto', async () => {
    let leida = false;
    vi.mocked(api.get).mockImplementation(async () => ({
      data: [notificacion({ leida })],
    }));
    vi.mocked(api.patch).mockImplementation(async () => {
      leida = true;
      return { data: {} };
    });

    renderizar();
    const titulo = await screen.findByText('Pedido listo');
    act(() => titulo.click());

    expect(await screen.findByText('DESTINO PERFIL')).toBeTruthy();
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));
    expect(api.patch).toHaveBeenCalledWith('/notificaciones/10/leida');
  });

  it('no descuenta ni oculta el error si la API falla, y permite reintentar', async () => {
    let leida = false;
    vi.mocked(api.get).mockImplementation(async () => ({
      data: [
        notificacion({
          id_notificacion: 11,
          tipo: 'sistema',
          titulo: 'Aviso',
          leida,
        }),
      ],
    }));
    vi.mocked(api.patch).mockRejectedValueOnce(new Error('sin red'));

    renderizar();
    const titulo = await screen.findByText('Aviso');
    act(() => titulo.click());

    expect(
      await screen.findByText('No se pudo marcar la notificación como leída.'),
    ).toBeTruthy();
    expect(screen.getByText('1 sin leer')).toBeTruthy();

    vi.mocked(api.patch).mockImplementationOnce(async () => {
      leida = true;
      return { data: {} };
    });
    act(() => titulo.click());
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('0 sin leer')).toBeTruthy());
  });

  it('marca todas en backend y actualiza el contador tras recargar', async () => {
    let todasLeidas = false;
    vi.mocked(api.get).mockImplementation(async () => ({
      data: [
        notificacion({ id_notificacion: 20, leida: todasLeidas }),
        notificacion({
          id_notificacion: 21,
          tipo: 'cita',
          titulo: 'Cita confirmada',
          leida: todasLeidas,
        }),
      ],
    }));
    vi.mocked(api.patch).mockImplementation(async () => {
      todasLeidas = true;
      return { data: {} };
    });

    renderizar();
    await screen.findByText('Cita confirmada');
    expect(screen.getByText('2 sin leer')).toBeTruthy();

    act(() => screen.getByText('Marcar todas como leídas').click());

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/notificaciones/leer-todas'),
    );
    await waitFor(() => expect(screen.getByText('0 sin leer')).toBeTruthy());
  });
});
