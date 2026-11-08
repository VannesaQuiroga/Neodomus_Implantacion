// Componente de navegación y estructura visual: NotificacionesBell. Se reutiliza en las pantallas de su área.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FaArrowRight,
  FaBell,
  FaBoxArchive,
  FaBoxOpen,
  FaCalendarCheck,
  FaCircleInfo,
  FaMoneyBillWave,
  FaPercent,
  FaRotateLeft,
  FaStar,
  FaTruckFast,
  FaUserPlus,
  FaUserSlash,
} from 'react-icons/fa6';
import type { NotifAdmin, TipoNotificacion } from '../../hooks/useAdminNotificaciones';
import { useIdioma } from '@i18n/IdiomaContext';
import LocalizedNotificationText from '@components/common/LocalizedNotificationText';
import '@styles/admin-navbar.css';

export const ICONO_TIPO: Record<TipoNotificacion, React.ReactNode> = {
  cuenta: <FaUserSlash />,
  registro: <FaUserPlus />,
  cita: <FaCalendarCheck />,
  pedido: <FaBoxArchive />,
  stock: <FaBoxOpen />,
  sistema: <FaCircleInfo />,
  entrega: <FaTruckFast />,
  reembolso: <FaMoneyBillWave />,
  devolucion: <FaRotateLeft />,
  recogida: <FaBoxOpen />,
  producto: <FaBoxOpen />,
  promocion: <FaPercent />,
  novedad: <FaCircleInfo />,
  cupon: <FaPercent />,
  asignacion: <FaCalendarCheck />,
  recordatorio_cita: <FaStar />,
  recordatorio_producto: <FaStar />,
  respuesta_soporte: <FaCircleInfo />,
};

export const ETIQUETA_TIPO: Record<TipoNotificacion, string> = {
  cuenta: 'notif.tipo.cuenta',
  registro: 'notif.tipo.registro',
  cita: 'notif.tipo.cita',
  pedido: 'notif.tipo.pedido',
  stock: 'notif.tipo.stock',
  sistema: 'notif.tipo.sistema',
  entrega: 'notif.tipo.entrega',
  reembolso: 'notif.tipo.reembolso',
  devolucion: 'notif.tipo.devolucion',
  recogida: 'notif.tipo.recogida',
  producto: 'notif.tipo.producto',
  promocion: 'notif.tipo.promocion',
  novedad: 'notif.tipo.novedad',
  cupon: 'notif.tipo.cupon',
  asignacion: 'notif.tipo.asignacion',
  recordatorio_cita: 'notif.tipo.recordatorioCita',
  recordatorio_producto: 'notif.tipo.recordatorioProducto',
  respuesta_soporte: 'notif.tipo.respuestaSoporte',
};

interface NotificacionesBellProps {
  notificaciones: NotifAdmin[];
  cargando?: boolean;
  verTodasTo: string;
  marcarLeida?: (id: string) => void;
  buttonClassName?: string;
  iconClassName?: string;
  ariaLabel?: string;
  titulo?: string;
  error?: string | null;
  onRetry?: () => void | Promise<void>;
}

// registra escuchas de eventos para sincronizar la vista.
const NotificacionesBell = ({
  notificaciones,
  cargando = false,
  verTodasTo,
  marcarLeida,
  buttonClassName = 'anr-icon-btn',
  iconClassName = '',
  ariaLabel = 'Notificaciones',
  titulo = 'Notificaciones',
  error = null,
  onRetry,
}: NotificacionesBellProps) => {
  const { t } = useIdioma();
  const [open, setOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const noLeidas = notificaciones.filter((n) => !n.leida).length;
  const recientes = notificaciones.slice(0, 8);

  return (
    <div className="anr-notifs" ref={notifRef}>
      <button
        type="button"
        className={`${buttonClassName} ${open ? 'active' : ''}`}
        aria-label={ariaLabel === 'Notificaciones' ? t('notif.verTodasNotif') : ariaLabel}
        title={ariaLabel === 'Notificaciones' ? t('notif.verTodasNotif') : ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <FaBell className={iconClassName || undefined} />
        {noLeidas > 0 && <span className="anr-badge">{noLeidas}</span>}
      </button>

      <div className={`anr-notif-panel ${open ? 'open' : ''}`}>
        <div className="anr-notif-head">
          <div>
            <strong>{titulo === 'Notificaciones' ? t('notif.title') : titulo}</strong>
            {noLeidas > 0 && <span className="anr-notif-unread">{t('notif.sinLeer', { count: noLeidas })}</span>}
          </div>
          <Link to={verTodasTo} className="anr-notif-ver" onClick={() => setOpen(false)}>
            {t('notif.verTodas')}
          </Link>
        </div>

        {error && (
          <div className="anr-notif-empty" role="alert">
            <span><LocalizedNotificationText message={error} /></span>
            {onRetry && (
              <button type="button" className="anr-notif-ver" onClick={() => void onRetry()}>
                {t('notif.reintentar')}
              </button>
            )}
          </div>
        )}

        <div className="anr-notif-list">
          {cargando ? (
            <div className="anr-notif-empty">{t('notif.cargando')}</div>
          ) : recientes.length === 0 ? (
            error ? null : (
              <div className="anr-notif-empty">
                <FaBell />
                {t('notif.vacio')}
              </div>
            )
          ) : (
            recientes.map((n) => (
              <Link
                key={n.id}
                to={n.accion?.to || verTodasTo}
                className={`anr-notif-item ${n.leida ? '' : 'unread'}`}
                onClick={() => {
                  if (marcarLeida && !n.leida) marcarLeida(n.id);
                  setOpen(false);
                }}
              >
                <span className={`anr-notif-ico ${n.tipo}`}>{ICONO_TIPO[n.tipo]}</span>
                <span className="anr-notif-info">
                  <span className="anr-notif-tag">{t(ETIQUETA_TIPO[n.tipo])}</span>
                  <span className="anr-notif-titulo"><LocalizedNotificationText message={n.titulo} /></span>
                  <span className="anr-notif-msg"><LocalizedNotificationText message={n.mensaje} /></span>
                  {n.accion?.label && <span className="anr-notif-msg"><LocalizedNotificationText message={n.accion.label} /></span>}
                  {n.fecha && <span className="anr-notif-fecha">{n.fecha}</span>}
                </span>
                {!n.leida && <span className="anr-notif-dot" />}
              </Link>
            ))
          )}
        </div>

        <Link to={verTodasTo} className="anr-notif-footer" onClick={() => setOpen(false)}>
          {t('notif.verTodasNotif')} <FaArrowRight />
        </Link>
      </div>
    </div>
  );
};

export default NotificacionesBell;
