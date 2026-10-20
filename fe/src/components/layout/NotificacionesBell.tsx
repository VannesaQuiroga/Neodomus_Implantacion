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
  recordatorio_cita: <FaStar />,
  recordatorio_producto: <FaStar />,
};

export const ETIQUETA_TIPO: Record<TipoNotificacion, string> = {
  cuenta: 'Solicitud de cuenta',
  registro: 'Nuevo registro',
  cita: 'Cita e instalación',
  pedido: 'Pedido',
  stock: 'Stock agotado',
  sistema: 'Sistema',
  entrega: 'Entrega',
  reembolso: 'Reembolso',
  devolucion: 'Devolución',
  recogida: 'Recogida',
  producto: 'Producto nuevo',
  promocion: 'Promoción',
  recordatorio_cita: 'Encuesta de servicio',
  recordatorio_producto: 'Encuesta de productos',
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
}: NotificacionesBellProps) => {
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
        aria-label={ariaLabel}
        title={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <FaBell className={iconClassName || undefined} />
        {noLeidas > 0 && <span className="anr-badge">{noLeidas}</span>}
      </button>

      <div className={`anr-notif-panel ${open ? 'open' : ''}`}>
        <div className="anr-notif-head">
          <div>
            <strong>{titulo}</strong>
            {noLeidas > 0 && <span className="anr-notif-unread">{noLeidas} sin leer</span>}
          </div>
          <Link to={verTodasTo} className="anr-notif-ver" onClick={() => setOpen(false)}>
            Ver todas
          </Link>
        </div>

        <div className="anr-notif-list">
          {cargando ? (
            <div className="anr-notif-empty">Cargando...</div>
          ) : recientes.length === 0 ? (
            <div className="anr-notif-empty">
              <FaBell />
              No hay notificaciones
            </div>
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
                  <span className="anr-notif-tag">{ETIQUETA_TIPO[n.tipo]}</span>
                  <span className="anr-notif-titulo">{n.titulo}</span>
                  <span className="anr-notif-msg">{n.mensaje}</span>
                  {n.fecha && <span className="anr-notif-fecha">{n.fecha}</span>}
                </span>
                {!n.leida && <span className="anr-notif-dot" />}
              </Link>
            ))
          )}
        </div>

        <Link to={verTodasTo} className="anr-notif-footer" onClick={() => setOpen(false)}>
          Ver todas las notificaciones <FaArrowRight />
        </Link>
      </div>
    </div>
  );
};

export default NotificacionesBell;
