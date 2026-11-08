// Presenta los avisos de la cuenta y sus opciones de lectura.
import { useState } from 'react';
import { FaBell, FaCartShopping, FaTags, FaScrewdriverWrench, FaEnvelopeOpenText, FaShield } from 'react-icons/fa6';
import type { ReactNode } from 'react';
import { getNotificaciones, saveItem, PF_NOTIF_KEY, NotificacionPrefs } from '@utils/profileStorage';
import { useIdioma } from '@i18n/IdiomaContext';
import SectionHeader from './SectionHeader';
import { NotifyFn } from './PersonalTab';

interface Opcion {
  key: keyof NotificacionPrefs;
  tituloKey: string;
  descKey: string;
  icono: ReactNode;
}

const opciones: Opcion[] = [
  { key: 'pedidos', tituloKey: 'perfil.notificacionesTab.pedidosTitulo', descKey: 'perfil.notificacionesTab.pedidosDesc', icono: <FaCartShopping /> },
  { key: 'promociones', tituloKey: 'perfil.notificacionesTab.promocionesTitulo', descKey: 'perfil.notificacionesTab.promocionesDesc', icono: <FaTags /> },
  { key: 'tecnicos', tituloKey: 'perfil.notificacionesTab.tecnicosTitulo', descKey: 'perfil.notificacionesTab.tecnicosDesc', icono: <FaScrewdriverWrench /> },
  { key: 'boletines', tituloKey: 'perfil.notificacionesTab.boletinTitulo', descKey: 'perfil.notificacionesTab.boletinDesc', icono: <FaEnvelopeOpenText /> },
  { key: 'seguridad', tituloKey: 'perfil.notificacionesTab.seguridadTitulo', descKey: 'perfil.notificacionesTab.seguridadDesc', icono: <FaShield /> },
];

const NotificationsTab = ({ notify }: { notify: NotifyFn }) => {
  const { t } = useIdioma();
  const [prefs, setPrefs] = useState<NotificacionPrefs>(getNotificaciones());

  const alternar = (key: keyof NotificacionPrefs) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    saveItem(PF_NOTIF_KEY, next);
    notify(next[key] ? t('perfil.notificacionesTab.activadas') : t('perfil.notificacionesTab.desactivadas'), 'success');
  };

  return (
    <div className="pf-tab">
      <SectionHeader
        icon={<FaBell />}
        title={t('perfil.notificaciones')}
        subtitle={t('perfil.notificacionesTab.subtitulo')}
      />

      <div className="pf-notif-list">
        {opciones.map((opcion) => (
          <div className="pf-notif-item" key={opcion.key}>
            <span className="pf-notif-icon">{opcion.icono}</span>
            <div className="pf-notif-info">
              <strong className="pf-notif-titulo">{t(opcion.tituloKey)}</strong>
              <span className="pf-notif-desc">{t(opcion.descKey)}</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs[opcion.key]}
              aria-label={t(opcion.tituloKey)}
              className={`pf-switch ${prefs[opcion.key] ? 'on' : ''}`}
              onClick={() => alternar(opcion.key)}
            >
              <span className="pf-switch-thumb" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default NotificationsTab;