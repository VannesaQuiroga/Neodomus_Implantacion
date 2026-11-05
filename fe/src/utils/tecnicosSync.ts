// Sincronización de cambios de técnicos entre pestañas.
// Cuando el administrador crea/edita/habilita/desactiva un técnico, se avisa
// a todas las demás pestañas (BroadcastChannel, misma pestaña vía evento de
// ventana) para que recarguen su lista sin intervención del usuario.

const CANAL = 'neodomus-tecnicos';

export const notificarCambiosTecnicos = (): void => {
  try {
    const canal = new BroadcastChannel(CANAL);
    canal.postMessage({ tipo: 'tecnicos-actualizados', ts: Date.now() });
    canal.close();
  } catch {
    /* navegador sin soporte */
  }
  window.dispatchEvent(new CustomEvent('tecnicos-actualizados'));
};

type Cancelar = () => void;

// registra escuchas de eventos para sincronizar la vista.
export const suscribirCambiosTecnicos = (callback: Cancelar): Cancelar => {
  let canal: BroadcastChannel | null = null;
  try {
    canal = new BroadcastChannel(CANAL);
    canal.onmessage = callback;
  } catch {
    canal = null;
  }
  window.addEventListener('tecnicos-actualizados', callback);
  return () => {
    if (canal) canal.close();
    window.removeEventListener('tecnicos-actualizados', callback);
  };
};
