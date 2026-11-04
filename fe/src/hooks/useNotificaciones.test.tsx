import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNotificacionesRol } from './useAdminNotificaciones';
import api from '@services/api';

vi.mock('@contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 7, correo: 'admin@neodomus.test', nombre: 'Admin' },
  }),
}));

vi.mock('@services/api', () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

const STORAGE_KEY = 'notificaciones_leidas_administrador_7:admin@neodomus.test';

const productoAgotado = {
  id_producto: 9,
  nombre_producto: 'Bomba de agua',
  stock_producto: 0,
  variantes: [],
  fecha_registro_producto: '2026-10-01T10:00:00',
};

const configurarApi = () => {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/productos/?limit=100&estado=activo') {
      return { data: { data: [productoAgotado] } } as never;
    }
    return { data: [] } as never;
  });
  vi.mocked(api.patch).mockResolvedValue({ data: {} } as never);
};

describe('sincronización de notificaciones entre campana y apartado', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    configurarApi();
  });

  it('reduce el contador de otra instancia al marcar una notificación sintética', async () => {
    const campana = renderHook(() => useNotificacionesRol('administrador'));
    const apartado = renderHook(() => useNotificacionesRol('administrador'));

    await waitFor(() => {
      expect(campana.result.current.cargando).toBe(false);
      expect(apartado.result.current.cargando).toBe(false);
    });
    expect(campana.result.current.noLeidas).toBe(1);
    expect(apartado.result.current.noLeidas).toBe(1);

    await act(async () => {
      await campana.result.current.marcarLeida('stock-9');
    });

    await waitFor(() => {
      expect(campana.result.current.noLeidas).toBe(0);
      expect(apartado.result.current.noLeidas).toBe(0);
    });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')).toEqual({
      'stock-9': true,
    });
  });

  it('abre novedades y cupones del cliente en su módulo correspondiente', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [
        {
          id_notificacion: 1,
          tipo: 'novedad',
          titulo: 'Novedad del pedido',
          mensaje: 'El administrador respondió',
          leida: false,
          fecha_creacion: '2026-10-02T10:00:00',
        },
        {
          id_notificacion: 2,
          tipo: 'cupon',
          titulo: 'Cupón disponible',
          mensaje: 'Código: NEODOMUS10',
          leida: false,
          fecha_creacion: '2026-10-03T10:00:00',
        },
      ],
    } as never);

    const cliente = renderHook(() => useNotificacionesRol('cliente'));
    await waitFor(() => expect(cliente.result.current.cargando).toBe(false));

    const novedad = cliente.result.current.notificaciones.find((n) => n.tipo === 'novedad');
    const cupon = cliente.result.current.notificaciones.find((n) => n.tipo === 'cupon');

    expect(novedad?.accion).toEqual({
      to: '/perfil?tab=pedidos',
      label: 'Ver novedad',
    });
    expect(cupon?.accion).toEqual({
      to: '/productos',
      label: 'Usar cupón',
    });
  });

  it('persiste el leído al volver a montar el hook y marcar todas', async () => {
    const primera = renderHook(() => useNotificacionesRol('administrador'));

    await waitFor(() => expect(primera.result.current.cargando).toBe(false));
    expect(primera.result.current.noLeidas).toBe(1);

    await act(async () => {
      await primera.result.current.leerTodas();
    });
    expect(primera.result.current.noLeidas).toBe(0);

    primera.unmount();

    const segunda = renderHook(() => useNotificacionesRol('administrador'));
    await waitFor(() => expect(segunda.result.current.cargando).toBe(false));
    expect(segunda.result.current.noLeidas).toBe(0);
    expect(segunda.result.current.notificaciones[0]?.leida).toBe(true);
  });
});
