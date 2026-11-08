import { useIdioma } from '@i18n/IdiomaContext';
import { traducirMensajeNotificacion } from '@i18n/translations';

interface LocalizedNotificationTextProps {
  message: string;
}

/** Localizes legacy notification strings at their display boundary. */
export default function LocalizedNotificationText({ message }: LocalizedNotificationTextProps) {
  const { idioma } = useIdioma();
  return <>{traducirMensajeNotificacion(message, idioma)}</>;
}
