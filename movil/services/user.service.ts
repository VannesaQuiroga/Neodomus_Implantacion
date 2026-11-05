// ─────────────────────────────────────────────────────────────
// Servicio de perfil de usuario.
// Endpoints reales del backend (prefijo /api/v1):
// - Clientes:  GET /clients/me   (be/app/routers/clientes.py)
// - Empleados: GET /users/me     (be/app/routers/users.py)
// ─────────────────────────────────────────────────────────────

import { apiFetch } from "./api";
import type { UserType } from "./storage";

// Comunica con el backend mediante API "/clients/me", API "/users/me".
export const obtenerPerfil = (userType: UserType) =>
  userType === "client"
    ? apiFetch<Record<string, unknown>>("/clients/me")
    : apiFetch<Record<string, unknown>>("/users/me");
