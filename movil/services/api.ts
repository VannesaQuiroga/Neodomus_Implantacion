// ─────────────────────────────────────────────────────────────
// Capa única de comunicación con el backend.
//
// - Prefijo base centralizado en @/constants/api (sin IPs en código).
// - Inyecta Authorization: Bearer si hay sesión guardada.
// - Renueva el access token una vez vía POST /auth/refresh ante un 401.
// - Normaliza los errores del backend (FastAPI devuelve {detail}).
// ─────────────────────────────────────────────────────────────

import { API_BASE_URL } from "@/constants/api";
import {
  borrarSesion,
  guardarSesion,
  obtenerSesion,
  type SesionGuardada,
} from "./storage";

const TIMEOUT_MS = 15000;

/** Error de API con código HTTP para manejarlo desde las pantallas. */
export class ApiError extends Error {
  readonly status: number;

  constructor(mensaje: string, status: number) {
    super(mensaje);
    this.name = "ApiError";
    this.status = status;
  }
}

type OpcionesRequest = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

function parsearJsonSeguro(texto: string): unknown {
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

function extraerDetalle(data: unknown, status: number): string {
  const detalle =
    typeof data === "object" && data !== null
      ? (data as Record<string, unknown>).detail
      : undefined;

  if (typeof detalle === "string" && detalle.trim()) return detalle;

  // Errores de validación de FastAPI: detail es un array.
  if (Array.isArray(detalle) && detalle.length > 0) {
    const mensajes = detalle
      .map((item) =>
        typeof item === "object" && item !== null && "msg" in item
          ? String((item as Record<string, unknown>).msg)
          : null,
      )
      .filter(Boolean);
    if (mensajes.length > 0) return mensajes.join(" · ");
  }

  const mensaje =
    typeof data === "object" && data !== null
      ? (data as Record<string, unknown>).message
      : undefined;
  if (typeof mensaje === "string" && mensaje.trim()) return mensaje;

  const fallbacks: Record<number, string> = {
    400: "Petición inválida.",
    401: "Credenciales inválidas o sesión expirada.",
    403: "No tienes permisos para esta operación.",
    404: "Recurso no encontrado.",
    429: "Demasiados intentos. Espera un momento e inténtalo de nuevo.",
    500: "Error interno del servidor.",
  };

  return fallbacks[status] ?? `Error inesperado (código ${status}).`;
}

async function renovarAccessToken(refreshToken: string): Promise<SesionGuardada | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
    };

    if (!data.access_token || !data.refresh_token) return null;

    const sesionActual = await obtenerSesion();
    const nuevaSesion: SesionGuardada = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      userType: sesionActual?.userType ?? "client",
    };

    await guardarSesion(nuevaSesion);
    return nuevaSesion;
  } catch {
    return null;
  }
}

async function request<T>(
  endpoint: string,
  options: OpcionesRequest,
  yaRenovado: boolean,
): Promise<T> {
  const sesion = await obtenerSesion();

  const controller = new AbortController();
  const temporizador = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    const isMultipart = options.body instanceof FormData;
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        ...(!isMultipart ? { "Content-Type": "application/json" } : {}),
        ...(sesion ? { Authorization: `Bearer ${sesion.accessToken}` } : {}),
        ...options.headers,
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      // El host no contestó a tiempo: IP/puerto equivocado, firewall o red.
      throw new ApiError(
        "El servidor tardó demasiado en responder. Verifica que el backend esté corriendo y que la app apunte a la IP correcta de tu red.",
        0,
      );
    }
    // Fallo de red puro: host inalcanzable / sin conexión.
    throw new ApiError(
      "No se pudo conectar con el servidor. Verifica tu conexión Wi-Fi y que el backend esté corriendo.",
      0,
    );
  } finally {
    clearTimeout(temporizador);
  }

  // Sesión expirada → renovar tokens una vez y repetir la petición.
  if (response.status === 401 && sesion && !yaRenovado) {
    const nuevaSesion = await renovarAccessToken(sesion.refreshToken);
    if (nuevaSesion) {
      return request<T>(endpoint, options, true);
    }
    await borrarSesion();
  }

  const texto = await response.text();
  const data = parsearJsonSeguro(texto);

  if (!response.ok) {
    throw new ApiError(extraerDetalle(data, response.status), response.status);
  }

  return data as T;
}

/** Petición autenticada al backend. `endpoint` empieza con "/", p. ej. "/auth/login". */
export async function apiFetch<T = unknown>(
  endpoint: string,
  options: OpcionesRequest = {},
): Promise<T> {
  return request<T>(endpoint, options, false);
}
