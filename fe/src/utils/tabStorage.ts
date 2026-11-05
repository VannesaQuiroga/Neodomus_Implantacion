// Almacenamiento de sesión con soporte multi-pestaña AISLADO.
// Cada pestaña/ventana tiene su propia sesión (usuario, tokens) mediante
// un prefijo por pestaña (sessionStorage). Esto permite mantener varias
// sesiones abiertas simultáneamente (ej. admin en una pestaña y cliente en
// otra) sin que se sobrescriban entre sí.

const SESSION_ID_KEY = 'neodomus_tab_session_id';
const SUFFIX = '__tab__';

// accede a sessionStorage para conservar o recuperar datos locales.
const getSessionId = (): string => {
  try {
    let id = sessionStorage.getItem(SESSION_ID_KEY);
    if (!id) {
      id = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_ID_KEY, id);
    }
    return id;
  } catch {
    return 'shared';
  }
};

const scoped = (key: string): string => `${getSessionId()}${SUFFIX}${key}`;

// ── Lectura: aislada por pestaña (con migración de sesión compartida legacy) ──
export const tabGet = (key: string): string | null => {
  try {
    const scopedKey = scoped(key);
    const val = localStorage.getItem(scopedKey);
    if (val) return val;
    // Migración: si esta pestaña no tiene sesión pero existe una sesión
    // legacy compartida (versión anterior con neodomus_shared_*), migrarla
    // a esta pestaña para no forzar re-login tras la actualización.
    const LEGACY_SHARED: Record<string, string> = {
      access_token: 'neodomus_shared_access_token',
      refresh_token: 'neodomus_shared_refresh_token',
      user: 'neodomus_shared_user',
    };
    const legacyKey = LEGACY_SHARED[key];
    if (legacyKey) {
      const legacyVal = localStorage.getItem(legacyKey);
      if (legacyVal) {
        localStorage.setItem(scopedKey, legacyVal);
        return legacyVal;
      }
    }
    return null;
  } catch {
    return null;
  }
};

// ── Escritura: aislada por pestaña ──
export const tabSet = (key: string, value: string): void => {
  try {
    localStorage.setItem(scoped(key), value);
  } catch {
    /* noop */
  }
};

// accede a localStorage para conservar o recuperar datos locales.
export const tabRemove = (key: string): void => {
  try {
    localStorage.removeItem(scoped(key));
  } catch {
    /* noop */
  }
};

// accede a localStorage para conservar o recuperar datos locales.
export const tabRemoveAll = (): void => {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.includes(SUFFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* noop */
  }
};

// Rota el id de sesión de ESTA pestaña para aislarla de otras pestañas.
// Se llama tras un login/logout exitoso para que la nueva sesión no herede
// ni contamine la de otra pestaña abierta con otro usuario.
export const rotateTabSessionId = (): void => {
  try {
    sessionStorage.setItem(
      SESSION_ID_KEY,
      `${Date.now()}_${Math.random().toString(36).slice(2, 10)}_${Math.random().toString(36).slice(2, 10)}`,
    );
  } catch {
    /* noop */
  }
};
