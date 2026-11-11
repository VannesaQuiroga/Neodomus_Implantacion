import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IdiomaProvider } from '@i18n/IdiomaContext';
import NotificacionesBell from './NotificacionesBell';
import type { NotifAdmin } from '../../hooks/useAdminNotificaciones';

afterEach(cleanup);

const aviso: NotifAdmin = {
  id: 'plat-1',
  backendId: 1,
  tipo: 'pedido',
  titulo: 'Pedido listo',
  mensaje: 'Puedes recogerlo.',
  fecha: '27 oct 2026',
  timestamp: 1,
  leida: false,
  accion: { to: '/perfil', label: 'Ver pedido' },
};

describe('Campana de notificaciones', () => {
  it('marca como leída y navega al abrir una notificación', () => {
    const marcarLeida = vi.fn();
    render(
      // El componente usa useIdioma: el proveedor es parte de su contexto real.
      <IdiomaProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route
              path="/"
              element={
                <NotificacionesBell
                  notificaciones={[aviso]}
                  verTodasTo="/notificaciones"
                  marcarLeida={marcarLeida}
                />
              }
            />
            <Route path="/perfil" element={<div>DESTINO PEDIDO</div>} />
          </Routes>
        </MemoryRouter>
      </IdiomaProvider>,
    );

    // Etiqueta accesible actual del botón (traducida por IdiomaProvider):
    // aria-label = t('notif.verTodasNotif') cuando no se pasa ariaLabel.
    fireEvent.click(screen.getByLabelText('Ver todas las notificaciones'));
    fireEvent.click(screen.getByText('Pedido listo'));

    expect(marcarLeida).toHaveBeenCalledWith('plat-1');
    expect(screen.getByText('DESTINO PEDIDO')).toBeTruthy();
  });

  it('muestra el error sin inventar una lista vacía y permite reintentar', () => {
    const recargar = vi.fn();
    render(
      // El componente usa useIdioma: el proveedor es parte de su contexto real.
      <IdiomaProvider>
        <MemoryRouter>
          <NotificacionesBell
            notificaciones={[]}
            verTodasTo="/notificaciones"
            error="No se pudieron cargar las notificaciones."
            onRetry={recargar}
          />
        </MemoryRouter>
      </IdiomaProvider>,
    );

    fireEvent.click(screen.getByLabelText('Ver todas las notificaciones'));

    expect(screen.getByText('No se pudieron cargar las notificaciones.')).toBeTruthy();
    expect(screen.queryByText('No hay notificaciones')).toBeNull();
    fireEvent.click(screen.getByText('Reintentar'));
    expect(recargar).toHaveBeenCalledTimes(1);
  });
});
