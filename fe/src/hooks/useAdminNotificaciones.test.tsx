import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@services/api';
import { useNotificacionesRol } from './useAdminNotificaciones';

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

const plataforma = (id: number, titulo: string) => ({
  id_notificacion: id,
  tipo: 'sistema',
  titulo,
  mensaje: 'Mensaje',
  leida: false,
  fecha_creacion: '2026-10-27T10:00:00',
});

const respuestaAdmin = (plataformaData: unknown[] = [], productos: unknown[] = []) =>
  async (url: string) => {
    if (url.startsWith('/notificaciones/mias')) return { data: plataformaData };
    if (url.startsWith('/productos/')) return { data: { data: productos } };
    return { data: [] };
  };

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

describe('Hook compartido de notificaciones', () => {
  beforeEach(() => {
    auth.current = {
      user: { id: 1, nombre: 'Cliente', correo: 'cliente@test.com', rol: 'cliente' },
      rol: 'cliente',
    };
  });

  it('evita PATCH duplicado con doble clic', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [plataforma(30, 'Aviso único')],
    });
    let resolver: (value: unknown) => void = () => {};
    vi.mocked(api.patch).mockImplementation(
      () => new Promise((resolve) => { resolver = resolve; }) as any,
    );

    const { result } = renderHook(() => useNotificacionesRol('cliente'));
    await waitFor(() => expect(result.current.noLeidas).toBe(1));

    let primera: Promise<boolean> = Promise.resolve(false);
    let segunda: Promise<boolean> = Promise.resolve(false);
    await act(async () => {
      primera = result.current.marcarLeida('plat-30');
      segunda = result.current.marcarLeida('plat-30');
      resolver({ data: {} });
      await Promise.all([primera, segunda]);
    });

    expect(api.patch).toHaveBeenCalledTimes(1);
    expect(await primera).toBe(true);
    expect(await segunda).toBe(false);
  });

  it('mantiene el contador y expone error si falla el PATCH; permite reintentar', async () => {
    let leida = false;
    vi.mocked(api.get).mockImplementation(async () => ({
      data: [{ ...plataforma(31, 'Aviso con fallo'), leida }],
    }));
    vi.mocked(api.patch).mockRejectedValueOnce(new Error('sin red'));

    const { result } = renderHook(() => useNotificacionesRol('cliente'));
    await waitFor(() => expect(result.current.noLeidas).toBe(1));

    let resultado = true;
    await act(async () => {
      resultado = await result.current.marcarLeida('plat-31');
    });

    expect(resultado).toBe(false);
    expect(result.current.noLeidas).toBe(1);
    expect(result.current.error).toBe(
      'No se pudo marcar la notificación como leída.',
    );

    vi.mocked(api.patch).mockImplementationOnce(async () => {
      leida = true;
      return { data: {} };
    });
    await act(async () => {
      resultado = await result.current.marcarLeida('plat-31');
    });
    expect(resultado).toBe(true);
    await waitFor(() => expect(result.current.noLeidas).toBe(0));
    expect(result.current.error).toBeNull();
  });

  it('ignora la respuesta tardía de la cuenta anterior al cambiar de sesión', async () => {
    let resolverAnterior: (value: unknown) => void = () => {};
    vi.mocked(api.get).mockImplementation((async (url: string) => {
      if (!url.startsWith('/notificaciones/mias')) return { data: [] };
      if (auth.current.user.id === 1) {
        return new Promise((resolve) => { resolverAnterior = resolve; });
      }
      return { data: [plataforma(41, 'Aviso cuenta nueva')] };
    }) as any);

    const { result, rerender } = renderHook(() => useNotificacionesRol('cliente'));
    expect(result.current.cargando).toBe(true);

    auth.current = {
      user: { id: 2, nombre: 'Otra', correo: 'otra@test.com', rol: 'cliente' },
      rol: 'cliente',
    };
    rerender();

    await waitFor(() =>
      expect(result.current.notificaciones.map((n) => n.titulo)).toEqual([
        'Aviso cuenta nueva',
      ]),
    );

    await act(async () => {
      resolverAnterior({ data: [plataforma(40, 'Aviso cuenta anterior')] });
    });

    expect(result.current.notificaciones.map((n) => n.titulo)).toEqual([
      'Aviso cuenta nueva',
    ]);
  });

  it('guarda las leídas derivadas por rol y cuenta', async () => {
    auth.current = {
      user: { id: 7, nombre: 'Admin A', correo: 'a@test.com', rol: 'administrador' },
      rol: 'administrador',
    };
    vi.mocked(api.get).mockImplementation(
      respuestaAdmin([], [
        {
          id_producto: 5,
          nombre_producto: 'Bomba',
          stock_producto: 0,
          variantes: [],
          fecha_registro_producto: '2026-10-01T00:00:00',
        },
      ]) as any,
    );

    const { result, rerender } = renderHook(() =>
      useNotificacionesRol('administrador'),
    );
    await waitFor(() =>
      expect(result.current.notificaciones[0]?.id).toBe('stock-5'),
    );
    expect(result.current.noLeidas).toBe(1);

    await act(async () => {
      await result.current.marcarLeida('stock-5');
    });
    expect(result.current.noLeidas).toBe(0);
    expect(api.patch).not.toHaveBeenCalled();
    expect(localStorage.getItem('notificaciones_leidas_administrador_7:a@test.com')).toBeTruthy();

    auth.current = {
      user: { id: 8, nombre: 'Admin B', correo: 'b@test.com', rol: 'administrador' },
      rol: 'administrador',
    };
    rerender();

    await waitFor(() => expect(result.current.noLeidas).toBe(1));
    expect(
      localStorage.getItem('notificaciones_leidas_administrador_8:b@test.com'),
    ).toBeNull();
  });
});
