// ─────────────────────────────────────────────────────────────
// Persistencia local de la sesión (tokens + tipo de usuario).
// Único punto del proyecto que toca AsyncStorage.
// ─────────────────────────────────────────────────────────────

import AsyncStorage from "@react-native-async-storage/async-storage";

const ACCESS_TOKEN_KEY = "neodomus.session.access_token";
const REFRESH_TOKEN_KEY = "neodomus.session.refresh_token";
const USER_TYPE_KEY = "neodomus.session.user_type";
const CORREO_KEY = "neodemus.session.correo";
const ROL_KEY = "neodomus.session.rol";

export type UserType = "employee" | "client";
export type Rol = "cliente" | "tecnico" | "administrador" | "admin" | null;

export interface SesionGuardada {
  accessToken: string;
  refreshToken: string;
  userType: UserType;
  /** Correo de la cuenta; permite separar favoritos por identidad sin red. */
  correo?: string;
  rol?: string | null;
}

// accede a AsyncStorage para conservar o recuperar datos locales.
export async function guardarSesion(sesion: SesionGuardada): Promise<void> {
  const pares: [string, string][] = [
    [ACCESS_TOKEN_KEY, sesion.accessToken],
    [REFRESH_TOKEN_KEY, sesion.refreshToken],
    [USER_TYPE_KEY, sesion.userType],
  ];
  if (sesion.correo) pares.push([CORREO_KEY, sesion.correo]);
  if (sesion.rol) pares.push([ROL_KEY, sesion.rol]);
  await AsyncStorage.multiSet(pares);
}

// accede a AsyncStorage para conservar o recuperar datos locales.
export async function obtenerSesion(): Promise<SesionGuardada | null> {
  const pares = await AsyncStorage.multiGet([
    ACCESS_TOKEN_KEY,
    REFRESH_TOKEN_KEY,
    USER_TYPE_KEY,
    CORREO_KEY,
    ROL_KEY,
  ]);

  const accessToken = pares[0][1];
  const refreshToken = pares[1][1];
  const userType = pares[2][1];
  const correo = pares[3][1] ?? undefined;
  const rol = pares[4][1] ?? null;

  if (!accessToken || !refreshToken) return null;
  if (userType !== "employee" && userType !== "client") return null;

  return { accessToken, refreshToken, userType, correo, rol };
}

// accede a AsyncStorage para conservar o recuperar datos locales.
export async function borrarSesion(): Promise<void> {
  await AsyncStorage.multiRemove([
    ACCESS_TOKEN_KEY,
    REFRESH_TOKEN_KEY,
    USER_TYPE_KEY,
    CORREO_KEY,
    ROL_KEY,
  ]);
}
