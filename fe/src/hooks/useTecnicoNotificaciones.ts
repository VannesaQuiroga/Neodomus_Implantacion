// Hook de notificaciones del técnico: comparte estado y contador con la campana.
import { useNotificacionesRol } from './useAdminNotificaciones';

export const useTecnicoNotificaciones = () => useNotificacionesRol('tecnico');
