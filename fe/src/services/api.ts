// Cliente de comunicación con el backend y tratamiento compartido de las peticiones.
import axios from 'axios';
import { tabGet, tabRemove, tabSet } from '../utils/tabStorage';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

// ────────────────────────────────────────────────────────────────
// Refresco de token (persistencia de sesión por pestaña)
// ────────────────────────────────────────────────────────────────

const clearSession = () => {
  tabRemove('access_token');
  tabRemove('refresh_token');
  tabRemove('user');
  tabRemove('password_reset_required');
  tabRemove('perfil_incompleto');
  // Disparar evento para que AuthContext reaccione ( limpia estado React ).
  // La redirección la maneja AuthContext / RoleRoute, NO aquí, para evitar
  // ciclos al recargar la página (el interceptor limpiaba y redirigía antes
  // de que React terminara de montar).
  window.dispatchEvent(new Event('neodomus:sesion-expirada'));
};

// Intenta renovar la sesión usando el refresh token de la pestaña.
export const refreshAccessToken = async (): Promise<{ ok: boolean; authError: boolean }> => {
  const refreshToken = tabGet('refresh_token');
  if (!refreshToken) return { ok: false, authError: false };
  try {
    const res = await axios.post(
      `${BASE_URL}/auth/refresh`,
      { refresh_token: refreshToken },
      {
        withCredentials: false,
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      },
    );
    // Almacenar los nuevos tokens en la pestaña
    if (res.data?.access_token) {
      tabSet('access_token', res.data.access_token);
    }
    if (res.data?.refresh_token) {
      tabSet('refresh_token', res.data.refresh_token);
    }
    return { ok: true, authError: false };
  } catch (err: any) {
    // Si el backend respondió 401, el refresh token es inválido → borrar sesión
    if (err.response?.status === 401) {
      return { ok: false, authError: true };
    }
    // Cualquier otro error (red, timeout, 500, backend reiniciándose) → NO borrar
    return { ok: false, authError: false };
  }
};

// ────────────────────────────────────────────────────────────────
// Cliente axios
// ────────────────────────────────────────────────────────────────

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: false,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Accept': 'application/json; charset=utf-8',
  },
  responseType: 'json',
  responseEncoding: 'utf8',
});

// Cuando el cuerpo es FormData (subida de archivos) hay que dejar que el
// navegador fije multipart/form-data con su boundary: el Content-Type JSON
// por defecto hacía que axios serializara el FormData a JSON y el backend
// rechazara con 422 ("file required").
api.interceptors.request.use((config) => {
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    delete config.headers['Content-Type'];
    if (config.headers.common) delete config.headers.common['Content-Type'];
  }
  // Enviar token de la pestaña via Authorization header para soporte multi-pestaña.
  const tabToken = tabGet('access_token');
  if (tabToken) {
    config.headers.Authorization = `Bearer ${tabToken}`;
  }
  return config;
});

// Interceptor de respuesta:
//  - En error 401 renueva la sesión (refresh token de la pestaña) y reintenta.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error;

    // FastAPI 422 devuelve `detail` como ARRAY de objetos; si alguna pantalla
    // lo renderiza directo crashea React (pantalla en negro). Se normaliza a
    // un string seguro para toda la app.
    if (response?.data?.detail && typeof response.data.detail !== 'string') {
      response.data.detail = 'La solicitud no es válida: revisa los datos o el archivo enviado.';
    }

    const originalRequest: any = config;
    const url: string = originalRequest?.url || '';

    const isAuthEndpoint =
      url.includes('/auth/login') || url.includes('/auth/refresh') || url.includes('/auth/session');

    if (
      response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthEndpoint
    ) {
      originalRequest._retry = true;
      const resultado = await refreshAccessToken();
      if (resultado.ok) {
        return api(originalRequest);
      }
      // Solo borrar sesión si el refresh token es realmente inválido (401).
      // Si es error de red (backend reiniciándose, timeout, 500), mantener
      // los tokens para que al recargar la página la sesión siga viva.
      if (resultado.authError && !(window as any).__neodomus_validando_sesion) {
        clearSession();
      }
    }

    return Promise.reject(error);
  }
);

export default api;

// ────────────────────────────────────────────────────────────────
// Descarga de factura PDF autenticada
// ────────────────────────────────────────────────────────────────

export const descargarFactura = async (pdfUrl: string) => {
  try {
    const res = await api.get(pdfUrl.replace(/^\/api\/v1/, ''), {
      responseType: 'blob',
    });
    const blob = new Blob([res.data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `factura_${(pdfUrl.match(/\/(\d+)\/factura/) || [])[1] || ''}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (err: any) {
    let msg = 'No se pudo descargar la factura.';
    if (err.response?.data instanceof Blob) {
      try {
        const parsed = JSON.parse(await err.response.data.text());
        if (parsed?.detail) msg = parsed.detail;
      } catch {
        /* noop */
      }
    }
    window.alert(msg);
  }
};

// ────────────────────────────────────────────────────────────────
// Descarga del reporte general del panel en PDF
// ────────────────────────────────────────────────────────────────

export const descargarReportePdf = async (
  rango?: { fechaInicio?: string; fechaFin?: string },
  mensajeError = 'No se pudo descargar el reporte.',
) => {
  try {
    const params: Record<string, string> = {};
    if (rango?.fechaInicio) params.fecha_inicio = rango.fechaInicio;
    if (rango?.fechaFin) params.fecha_fin = rango.fechaFin;
    const res = await api.get('/reports/pdf', {
      params,
      responseType: 'blob',
    });
    const blob = new Blob([res.data], {
      type: 'application/pdf',
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cd = res.headers?.['content-disposition'] as string | undefined;
    const match = cd ? /filename="?([^"]+)"?/.exec(cd) : null;
    a.download = match?.[1] || 'Reporte_NEODOMUS.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (err: any) {
    let msg = mensajeError;
    if (err.response?.data instanceof Blob) {
      try {
        const parsed = JSON.parse(await err.response.data.text());
        if (parsed?.detail) msg = parsed.detail;
      } catch {
        /* noop */
      }
    }
    window.alert(msg);
  }
};
