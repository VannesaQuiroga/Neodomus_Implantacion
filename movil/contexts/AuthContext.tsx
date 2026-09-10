// ─────────────────────────────────────────────────────────────
// Contexto global de autenticación móvil.
//
// - Restaura la sesión guardada (AsyncStorage) al arrancar la app.
// - iniciarSesion(): login en el backend, guarda tokens + correo y consulta
//   el perfil (/clients/me o /users/me, igual que la WEB) para el nombre.
// - cerrarSesion(): avisa al backend (mejor esfuerzo), limpia tokens y datos.
// - Expone usuario { correo } para que FavoritosContext separe visitante/cuenta.
// ─────────────────────────────────────────────────────────────

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  cerrarSesionBackend,
  iniciarSesion as iniciarSesionApi,
} from "@/services/auth.services";
import { apiFetch } from "@/services/api";
import {
  borrarSesion,
  guardarSesion,
  obtenerSesion,
  type UserType,
} from "@/services/storage";

/** Igual que la web: { id, nombre, correo, userType, rol }. */
export interface UsuarioActual {
  id: number;
  nombre: string;
  correo: string;
  userType: UserType;
  rol?: string | null;
}

interface PerfilBackend {
  id_cliente?: number;
  id_usuario?: number;
  first_name?: string;
  last_name?: string;
  foto_url?: string | null;
}

interface AuthContextValue {
  /** true mientras se restaura la sesión guardada al arrancar. */
  cargando: boolean;
  autenticado: boolean;
  userType: UserType | null;
  rol: string | null;
  usuario: UsuarioActual | null;
  /** Foto de perfil local (dataURL), como la web en localStorage. */
  avatar: string | null;
  setAvatar: (dataUrl: string | null) => void;
  iniciarSesion: (email: string, password: string) => Promise<void>;
  cerrarSesion: () => Promise<void>;
  /**
   * Reconsulta el perfil del usuario autenticado (GET /clients/me o
   * /users/me) y actualiza el estado global. Única fuente de verdad:
   * BD → backend → estado → navbar + perfil.
   */
  actualizarUsuario: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function construirUsuario(
  correo: string,
  userType: UserType,
  rol?: string | null,
): Promise<UsuarioActual & { foto_url?: string | null }> {
  const base: UsuarioActual & { foto_url?: string | null } = {
    id: 0,
    nombre: correo ? correo.split("@")[0] : "Usuario",
    correo,
    userType,
    rol: rol ?? null,
    foto_url: null,
  };
  try {
    const endpoint = userType === "client" ? "/clients/me" : "/users/me";
    const perfil = await apiFetch<PerfilBackend>(endpoint);
    const nombreCompleto =
      `${perfil.first_name ?? ""} ${perfil.last_name ?? ""}`.trim();
    return {
      ...base,
      id: perfil.id_cliente ?? perfil.id_usuario ?? base.id,
      correo: correo || base.nombre,
      nombre: nombreCompleto || base.nombre,
      rol: rol ?? base.rol,
      foto_url: perfil.foto_url ?? null,
    };
  } catch {
    return base;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [cargando, setCargando] = useState(true);
  const [usuario, setUsuario] = useState<UsuarioActual | null>(null);
  const [avatar, setAvatarEstado] = useState<string | null>(null);

  const setAvatar = useCallback((dataUrl: string | null) => {
    setAvatarEstado(dataUrl);
    if (dataUrl) {
      AsyncStorage.setItem("clientAvatar", dataUrl).catch(() => {});
    } else {
      AsyncStorage.removeItem("clientAvatar").catch(() => {});
    }
  }, []);

  // Restaurar sesión persistida al arrancar la app.
  useEffect(() => {
    let activo = true;

    obtenerSesion()
      .then(async (sesion) => {
        if (!activo || !sesion) return null;
        let rol = sesion.rol ?? null;
        if (!rol) {
          try {
            const ses = await apiFetch<{ rol?: string; role?: string; user_type?: string }>("/auth/session");
            rol = (ses.rol || ses.role || null) as string | null;
            if (rol && rol !== sesion.rol) {
              await guardarSesion({ ...sesion, rol });
            }
          } catch {}
        }
        return construirUsuario(sesion.correo ?? "", sesion.userType, rol);
      })
      .then((restaurado) => {
        if (activo && restaurado && restaurado.correo) {
          setUsuario(restaurado);
          setAvatarEstado(restaurado.foto_url ?? null);
        }
      })
      .catch(() => {
        // Sesión corrupta/inválida → limpiar y continuar como invitado.
        return borrarSesion();
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    return () => {
      activo = false;
    };
  }, []);

  const iniciarSesion = useCallback(async (email: string, password: string) => {
    const respuesta = await iniciarSesionApi(email, password);
    const rol = (respuesta as any).rol || (respuesta as any).role || null;

    await guardarSesion({
      accessToken: respuesta.access_token,
      refreshToken: respuesta.refresh_token,
      userType: respuesta.user_type,
      correo: email,
      rol: rol ?? undefined,
    });

    const perfil = await construirUsuario(email, respuesta.user_type, rol);
    setUsuario(perfil);
    setAvatarEstado(perfil.foto_url ?? null);
  }, []);

  const cerrarSesion = useCallback(async () => {
    try {
      await cerrarSesionBackend();
    } catch {
      // Aunque el backend falle (offline, token ya inválido), la sesión local se cierra igual.
    }
    await borrarSesion();
    setUsuario(null);
  }, []);

  // Reconsulta el perfil del usuario autenticado y refresca el estado
  // global (nombre/correo). Lo usa Mi perfil tras guardar cambios para
  // que el NAVBAR se actualice inmediatamente, sin reiniciar la app.
  const actualizarUsuario = useCallback(async () => {
    const sesion = await obtenerSesion();
    if (!sesion) return;
    try {
      const actualizado = await construirUsuario(
        sesion.correo ?? "",
        sesion.userType,
        sesion.rol ?? null,
      );
      if (actualizado.correo) {
        setUsuario(actualizado);
        setAvatarEstado(actualizado.foto_url ?? null);
      }
    } catch {
      // Si falla la consulta, se conserva el estado actual.
    }
  }, []);

  const valor = useMemo<AuthContextValue>(
    () => ({
      cargando,
      autenticado: usuario !== null,
      userType: usuario?.userType ?? null,
      rol: usuario?.rol ?? null,
      usuario,
      avatar,
      setAvatar,
      iniciarSesion,
      cerrarSesion,
      actualizarUsuario,
    }),
    [cargando, usuario, avatar, setAvatar, iniciarSesion, cerrarSesion, actualizarUsuario],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const contexto = useContext(AuthContext);
  if (!contexto) {
    throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  }
  return contexto;
}
