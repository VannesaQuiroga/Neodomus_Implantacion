// ─────────────────────────────────────────────────────────────
// Servicio de autenticación.
//
// Endpoints REALES del backend (be/app/routers/auth.py, prefijo /api/v1/auth):
// registro (crea pending_registration y envía código al correo),
// verificación de correo (query param), login con tokens en el cuerpo,
// recuperación de contraseña con código de 6 dígitos y habilitación de cuenta.
// Rate limits backend: registro/reenvío/forgot 3/min · login/verify-code/reset 5/min.
// ─────────────────────────────────────────────────────────────

import { apiFetch } from "./api";
import type { UserType } from "./storage";

/** Respuesta real del backend: be/app/schemas/auth.py → TokenResponse. */
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user_type: UserType;
  rol?: string | null;
  password_reset_required?: boolean;
  perfil_incompleto?: boolean;
}

export interface DatosRegistroCliente {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  id_tipo_documento_c: number;
  documento_cliente: number;
  telefono_cliente: number;
  /** La WEB envía el MUNICIPIO en el campo "city". */
  city: string;
  address: string;
}

export interface SesionBackend {
  user_type?: UserType;
  rol?: string | null;
  uid?: number | null;
}

const json = (cuerpo: unknown) => JSON.stringify(cuerpo);

// ── Registro y verificación ───────────────────────────────────

export const registrarCliente = (datos: DatosRegistroCliente) =>
  apiFetch<{ msg: string }>("/auth/register/client", {
    method: "POST",
    body: json(datos),
  });

/** El backend recibe el código como query param (POST /auth/verify-email?code=). */
export const verificarCorreo = (code: string) =>
  apiFetch<{ msg: string }>(
    `/auth/verify-email?code=${encodeURIComponent(code)}`,
    { method: "POST" },
  );

// Comunica con el backend mediante API "/auth/resend-verification".
export const reenviarVerificacion = (email: string) =>
  apiFetch<Record<string, unknown>>("/auth/resend-verification", {
    method: "POST",
    body: json({ email }),
  });

// ── Login y sesión ───────────────────────────────────────────

export const iniciarSesion = (email: string, password: string) =>
  apiFetch<TokenResponse>("/auth/login", {
    method: "POST",
    body: json({ email, password }),
  });

/** Cuenta inhabilitada por administrador (la web lo ofrece desde el login). */
export const solicitarHabilitacion = (email: string, password: string) =>
  apiFetch<Record<string, unknown>>("/auth/solicitar-habilitacion", {
    method: "POST",
    body: json({ email, password }),
  });

// Comunica con el backend mediante API "/auth/logout".
export const cerrarSesionBackend = () =>
  apiFetch<{ msg: string }>("/auth/logout", { method: "POST" });

// Comunica con el backend mediante API "/auth/session".
export const validarSesionBackend = () =>
  apiFetch<SesionBackend>("/auth/session");

// ── Recuperación de contraseña (código de 6 dígitos) ─────────

export const solicitarRecuperacionPassword = (email: string) =>
  apiFetch<Record<string, unknown>>("/auth/forgot-password", {
    method: "POST",
    body: json({ email }),
  });

// Comunica con el backend mediante API "/auth/verify-code".
export const verificarCodigoRecuperacion = (email: string, code: string) =>
  apiFetch<{ valid: boolean; message?: string }>("/auth/verify-code", {
    method: "POST",
    body: json({ email, code }),
  });

/** `token` es el código de 6 dígitos validado previamente (igual que la WEB). */
export const restablecerPassword = (token: string, new_password: string) =>
  apiFetch<Record<string, unknown>>("/auth/reset-password", {
    method: "POST",
    body: json({ token, new_password }),
  });

// ── Cambio de contraseña con sesión activa ────────────────────

export const cambiarPassword = (current_password: string, new_password: string) =>
  apiFetch<Record<string, unknown>>("/auth/change-password", {
    method: "POST",
    body: json({ current_password, new_password }),
  });
