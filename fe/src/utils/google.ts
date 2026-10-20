// Expone la configuración del acceso con Google a partir de las variables de entorno de la web.
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
export const GOOGLE_LOGIN_HABILITADO = Boolean(GOOGLE_CLIENT_ID);