// Presenta los avisos de la cuenta y sus opciones de lectura.
import { useState } from 'react';
import { FaBell, FaCartShopping, FaTags, FaScrewdriverWrench, FaEnvelopeOpenText, FaShield } from 'react-icons/fa6';
import type { ReactNode } from 'react';
import { getNotificaciones, saveItem, PF_NOTIF_KEY, NotificacionPrefs } from '@utils/profileStorage';
import SectionHeader from './SectionHeader';
import { NotifyFn } from './PersonalTab';

interface Opcion {
  key: keyof NotificacionPrefs;
  titulo: string;
  desc: string;
  icono: ReactNode;
}

const opciones: Opcion[] = [
  { key: 'pedidos', titulo: 'Estado de mis pedidos', desc: 'Actualizaciones sobre compras, envíos y entregas.', icono: <FaCartShopping /> },
  { key: 'promociones', titulo: 'Promociones y ofertas', desc: 'Descuentos y novedades exclusivas de Neodomus.', icono: <FaTags /> },
  { key: 'tecnicos', titulo: 'Servicios y técnicos', desc: 'Confirmaciones de citas, visitas y resultados.', icono: <FaScrewdriverWrench /> },
  { key: 'boletines', titulo: 'Boletín informativo', desc: 'Consejos de domótica y mejoras del hogar.', icono: <FaEnvelopeOpenText /> },
  { key: 'seguridad', titulo: 'Alertas de seguridad', desc: 'Accesos a tu cuenta y cambios en tu información.', icono: <FaShield /> },
];

const NotificationsTab = ({ notify }: { notify: NotifyFn }) => {
  const [prefs, setPrefs] = useState<NotificacionPrefs>(getNotificaciones());

  const alternar = (key: keyof NotificacionPrefs) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    saveItem(PF_NOTIF_KEY, next);
    notify(next[key] ? 'Notificaciones activadas' : 'Notificaciones desactivadas', 'success');
  };

  return (
    <div className="pf-tab">
      <SectionHeader
        icon={<FaBell />}
        title="Notificaciones"
        subtitle="Controla qué notificaciones deseas recibir."
      />

      <div className="pf-notif-list">
        {opciones.map((opcion) => (
          <div className="pf-notif-item" key={opcion.key}>
            <span className="pf-notif-icon">{opcion.icono}</span>
            <div className="pf-notif-info">
              <strong className="pf-notif-titulo">{opcion.titulo}</strong>
              <span className="pf-notif-desc">{opcion.desc}</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs[opcion.key]}
              aria-label={opcion.titulo}
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