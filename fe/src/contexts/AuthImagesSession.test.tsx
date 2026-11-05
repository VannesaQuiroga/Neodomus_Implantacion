import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { useAuthImage } from '../hooks/useAuthImage';
import { tabGet } from '../utils/tabStorage';
import api from '../services/api';

vi.mock('../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), defaults: { headers: { common: {} } } },
  refreshAccessToken: vi.fn(),
}));

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

describe('AuthProvider e imágenes privadas', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    (globalThis as any).__objectUrls.creadas.length = 0;
    (globalThis as any).__objectUrls.revocadas.length = 0;
    vi.mocked(api.post).mockImplementation(async (url) => ({ data: url === '/auth/logout' ? {} : {
      access_token: 'token-sintetico', refresh_token: 'refresh-sintetico',
      user_type: 'client', rol: 'cliente', first_name: 'Prueba', last_name: 'Cuenta', id: 1,
    } }));
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === '/evidencia') {
        if (!tabGet('access_token')) throw new Error('Sin sesión');
        return { data: new Blob(['evidencia sintética']) };
      }
      return { data: { first_name: 'Prueba', last_name: 'Cuenta', email: 'fixture@example.test',
        id_tipo_documento_c: 1, documento_cliente: 1, telefono_cliente: 1, address: 'Prueba' } };
    });
  });

  it.each(['password', 'google'])('login %s y logout reales invalidan imágenes sin volver a descargarlas', async (method) => {
    const { result } = renderHook(() => ({ auth: useAuth(), image: useAuthImage('/evidencia') }), { wrapper });
    await waitFor(() => expect(result.current.auth.loading).toBe(false));
    await act(async () => {
      if (method === 'google') await result.current.auth.googleLogin('credencial-sintetica');
      else await result.current.auth.login('fixture@example.test', 'password-sintetico');
    });
    await waitFor(() => expect(result.current.image.objectUrl).toMatch(/^blob:test\//));
    const previous = result.current.image.objectUrl;
    const downloads = () => vi.mocked(api.get).mock.calls.filter(([url]) => url === '/evidencia').length;
    const beforeLogout = downloads();
    await act(async () => { result.current.auth.logout(); });
    expect(result.current.auth.isAuthenticated).toBe(false);
    expect(result.current.image.objectUrl).toBeNull();
    expect(downloads()).toBe(beforeLogout);
    expect((globalThis as any).__objectUrls.revocadas).toContain(previous);
    await act(async () => { await result.current.auth.login('otra@example.test', 'password-sintetico'); });
    await waitFor(() => expect(result.current.image.objectUrl).toMatch(/^blob:test\//));
    expect(result.current.image.objectUrl).not.toBe(previous);
    expect(downloads()).toBe(beforeLogout + 1);
  });
});
