import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Perfil from './Perfil';
import api from '@services/api';

vi.mock('@contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 3, nombre: 'Cliente Prueba', correo: 'cliente@neodomus.test' },
    refreshUserProfile: vi.fn(),
  }),
}));

vi.mock('@i18n/IdiomaContext', () => ({
  useIdioma: () => ({ t: (clave: string) => clave }),
}));

vi.mock('@services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));

const { favoritosVacios, quitarFavoritoMock } = vi.hoisted(() => ({
  favoritosVacios: new Set<number>(),
  quitarFavoritoMock: vi.fn(),
}));

vi.mock('@utils/favoritos', () => ({
  useFavoritos: () => ({ favoritos: favoritosVacios, quitarFavorito: quitarFavoritoMock }),
}));

vi.mock('@components/profile/SectionHeader', () => ({ default: () => null }));
vi.mock('@components/profile/PerfilCuenta', () => ({ default: () => null }));
vi.mock('@components/profile/ReembolsosCliente', () => ({ default: () => null }));
vi.mock('@components/profile/OrdersTab', () => ({ default: () => null }));
vi.mock('@components/profile/ServiciosTab', () => ({ default: () => null }));
vi.mock('@components/profile/ReviewsTab', () => ({ default: () => null }));
vi.mock('@components/profile/TechniciansTab', () => ({ default: () => null }));
vi.mock('@components/profile/FacturasTab', () => ({ default: () => null }));
vi.mock('@components/profile/LanguageTab', () => ({ default: () => null }));
vi.mock('@components/profile/NotificationsTab', () => ({ default: () => null }));
vi.mock('@components/profile/PasswordTab', () => ({ default: () => null }));

function NavegacionPrueba() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate('/perfil?tab=reembolsos')}>
        ir a reembolsos
      </button>
      <button type="button" onClick={() => navigate('/perfil')}>
        ir a perfil
      </button>
    </>
  );
}

const botonActivo = (texto: string) =>
  screen.getByText(texto, { selector: '.pf-nav-label' }).closest('button');

afterEach(cleanup);

describe('sección activa del perfil según la URL', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/clients/me') {
        return {
          data: {
            first_name: 'Cliente',
            last_name: 'Prueba',
            email: 'cliente@neodomus.test',
          },
        } as never;
      }
      if (url === '/clients/me/cuenta-solicitud') {
        return { data: { estado: 'sin_solicitud' } } as never;
      }
      return { data: [] } as never;
    });
  });

  it('abre la pestaña de la notificación aunque el perfil ya esté montado', async () => {
    render(
      <MemoryRouter initialEntries={['/perfil?tab=pedidos']}>
        <Perfil />
        <NavegacionPrueba />
      </MemoryRouter>,
    );

    expect(botonActivo('perfil.misPedidos')?.className).toContain('active');

    fireEvent.click(screen.getByRole('button', { name: 'ir a reembolsos' }));

    await waitFor(() => {
      expect(botonActivo('perfil.misReembolsos')?.className).toContain('active');
    });
    expect(botonActivo('perfil.misPedidos')?.className).not.toContain('active');

    fireEvent.click(screen.getByRole('button', { name: 'ir a perfil' }));

    await waitFor(() => {
      expect(botonActivo('perfil.miPerfil')?.className).toContain('active');
    });
  });
});
