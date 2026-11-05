// Expone la configuración del acceso con Google a partir de las variables de entorno de la web.
// El Client ID de OAuth es público (viaja en el bundle), por lo que se deja un
// valor por defecto para que el botón funcione al clonar el proyecto sin .env.
export const GOOGLE_CLIENT_ID_FALLBACK =
  '230717458999-qlm6dpfl8ui8idqfupgfr8lou9k48i0f.apps.googleusercontent.com';

export const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID_FALLBACK;
export const GOOGLE_LOGIN_HABILITADO = Boolean(GOOGLE_CLIENT_ID);