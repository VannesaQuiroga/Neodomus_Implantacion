// Pruebas del hook real useAuthImage con el transporte simulado (solo se
// simula api.get; se ejecuta el código real del hook).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../services/api', () => ({
  default: { get: vi.fn() },
}));

import api from '../services/api';
import { useAuthImage } from './useAuthImage';

const mockedGet = api.get as unknown as ReturnType<typeof vi.fn>;

function blob(texto: string): Blob {
  return new Blob([texto], { type: 'image/jpeg' });
}

describe('useAuthImage', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    (globalThis as any).__objectUrls.creadas.length = 0;
    (globalThis as any).__objectUrls.revocadas.length = 0;
  });

  it('descarga autenticada correcta y sin token en la URL', async () => {
    mockedGet.mockResolvedValue({ data: blob('foto') });
    const { result } = renderHook(() => useAuthImage('/api/v1/tecnicos/evidencias/entrega/7/archivo'));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(false);
    expect(result.current.objectUrl).toMatch(/^blob:test\//);

    expect(mockedGet).toHaveBeenCalledTimes(1);
    const [url, opts] = mockedGet.mock.calls[0];
    expect(url).toBe('/api/v1/tecnicos/evidencias/entrega/7/archivo');
    expect(opts).toEqual({ responseType: 'blob' });
    // Sin token en la URL ni en el object URL.
    expect(url).not.toMatch(/token|access_token|Authorization/i);
    expect(result.current.objectUrl).not.toMatch(/token|access_token/i);
  });

  it('rechaza 401/403/404 y error de red sin reintentos', async () => {
    for (const status of [401, 403, 404]) {
      mockedGet.mockReset();
      mockedGet.mockRejectedValue(Object.assign(new Error('x'), { response: { status } }));
      const { result } = renderHook(() => useAuthImage('/a'));
      await waitFor(() => expect(result.current.error).toBe(true));
      expect(result.current.objectUrl).toBeNull();
      expect(mockedGet).toHaveBeenCalledTimes(1);
    }
    // Error de red (sin respuesta).
    mockedGet.mockReset();
    mockedGet.mockRejectedValue(new Error('Network Error'));
    const { result } = renderHook(() => useAuthImage('/b'));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.objectUrl).toBeNull();
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it('cambio de src: una descarga anterior pendiente no sobrescribe la nueva', async () => {
    let resolverA!: (v: { data: Blob }) => void;
    const promesaA = new Promise<{ data: Blob }>((res) => (resolverA = res));
    mockedGet.mockImplementationOnce(() => promesaA);
    mockedGet.mockImplementationOnce(() => Promise.resolve({ data: blob('B') }));

    const { result, rerender } = renderHook(({ src }) => useAuthImage(src), {
      initialProps: { src: '/a' },
    });
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(1));

    rerender({ src: '/b' });
    await waitFor(() => expect(result.current.objectUrl).toMatch(/^blob:test\//));
    const urlB = result.current.objectUrl;

    // Resolver la descarga anterior (A) DESPUÉS de que B ya se mostró.
    await act(async () => {
      resolverA({ data: blob('A') });
    });

    expect(result.current.objectUrl).toBe(urlB);
    // La descarga tardía de A se revocó al resolverse; B sigue mostrándose.
    expect((globalThis as any).__objectUrls.revocadas).not.toContain(urlB);
    expect((globalThis as any).__objectUrls.revocadas.length).toBe(1);
  });

  it('desmontaje libera el object URL temporal', async () => {
    mockedGet.mockResolvedValue({ data: blob('foto') });
    const { result, unmount } = renderHook(() => useAuthImage('/a'));
    await waitFor(() => expect(result.current.objectUrl).toMatch(/^blob:test\//));
    const url = result.current.objectUrl;
    unmount();
    expect((globalThis as any).__objectUrls.revocadas).toContain(url);
  });

  it('cierre de sesión invalida la evidencia anterior', async () => {
    mockedGet.mockResolvedValueOnce({ data: blob('anterior') });
    mockedGet.mockRejectedValueOnce(Object.assign(new Error('x'), { response: { status: 401 } }));

    const { result } = renderHook(() => useAuthImage('/a'));
    await waitFor(() => expect(result.current.objectUrl).toMatch(/^blob:test\//));
    const urlAnterior = result.current.objectUrl;

    await act(async () => {
      window.dispatchEvent(new Event('neodomus:sesion-expirada'));
    });

    await waitFor(() => expect(result.current.objectUrl).toBeNull());
    expect((globalThis as any).__objectUrls.revocadas).toContain(urlAnterior);
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it('no repite solicitudes si el transporte invalida la sesión', async () => {
    mockedGet.mockRejectedValue(new Error('Sin sesión'));
    mockedGet.mockImplementationOnce(async () => {
      window.dispatchEvent(new Event('neodomus:sesion-expirada'));
      throw new Error('Sesión terminada');
    });
    const { result } = renderHook(() => useAuthImage('/a'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.objectUrl).toBeNull();
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it('descarta una descarga pendiente tras logout y reanuda al iniciar otra sesión', async () => {
    let resolverAnterior!: (v: { data: Blob }) => void;
    mockedGet.mockImplementationOnce(() => new Promise((resolve) => { resolverAnterior = resolve; }));
    mockedGet.mockResolvedValueOnce({ data: blob('nueva cuenta') });
    const { result } = renderHook(() => useAuthImage('/misma-ruta'));
    await act(async () => { window.dispatchEvent(new Event('neodomus:sesion-expirada')); });
    expect(mockedGet).toHaveBeenCalledTimes(1);
    await act(async () => { resolverAnterior({ data: blob('cuenta anterior') }); });
    expect(result.current.objectUrl).toBeNull();
    expect((globalThis as any).__objectUrls.revocadas).toHaveLength(1);
    await act(async () => { window.dispatchEvent(new Event('neodomus:sesion-iniciada')); });
    await waitFor(() => expect(result.current.objectUrl).toMatch(/^blob:test\//));
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });
});
