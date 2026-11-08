// ─────────────────────────────────────────────────────────────
// Configuración centralizada de conexión al backend.
//
// La URL se define UNA sola vez mediante la variable de entorno
// EXPO_PUBLIC_API_URL (Expo la lee de movil/.env al compilar).
// Ver movil/.env.example para los valores según entorno.
//
// Aquí SOLO se añade el prefijo /api/v1 que usa todo el backend,
// de modo que ningún servicio necesita saber host ni puerto.
// ─────────────────────────────────────────────────────────────

function obtenerHostDesdeExpo(): string | null {
  try {
    // Expo expone el host donde corre Metro (ej. 192.168.1.10:8081) — útil para derivar la IP LAN del backend.
    const Constants = require("expo-constants").default;
    const hostUri: string | undefined =
      Constants?.expoConfig?.hostUri || (Constants?.manifest as any)?.hostUri || (Constants?.manifest2 as any)?.extra?.hostUri;
    if (hostUri) {
      const host = hostUri.split(":")[0];
      if (host && host !== "localhost" && host !== "127.0.0.1") {
        return `http://${host}:8000`;
      }
    }
  } catch {}
  return null;
}

// El desbroce de "slashes" finales se hace con bucle y no con regex: evita
// el retroceso super lineal señalado por S8786 y es equivalente.
let URL_SIN_PREFIJO = (
  process.env.EXPO_PUBLIC_API_URL ||
  obtenerHostDesdeExpo() ||
  "http://10.0.2.2:8000"
);
// HTTP se admite solo en desarrollo para el emulador y la red local.
// En una build distribuida, la API debe publicarse detrás de HTTPS.
if (!__DEV__ && URL_SIN_PREFIJO.startsWith("http://")) {
  throw new Error("EXPO_PUBLIC_API_URL debe usar HTTPS en producción.");
}
while (URL_SIN_PREFIJO.endsWith("/")) {
  URL_SIN_PREFIJO = URL_SIN_PREFIJO.slice(0, -1);
}

/** Base completa para todas las peticiones: <host>:<puerto>/api/v1 */
export const API_BASE_URL = `${URL_SIN_PREFIJO}/api/v1`;

/** Host base sin /api/v1 (útil para recursos estáticos como /uploads). */
export const BACKEND_HOST_URL = URL_SIN_PREFIJO;
