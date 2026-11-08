// Permite al administrador consultar y filtrar sus avisos.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaUserPlus,
  FaCalendarCheck,
  FaUserSlash,
  FaBoxArchive,
  FaBoxOpen,
  FaCircleInfo,
  FaBell,
  FaArrowRight,
  FaMoneyBillWave,
  FaPercent,
  FaRotateLeft,
  FaStar,
  FaTruckFast,
} from 'react-icons/fa6';
import '@styles/admin-panel.css';
import '@styles/dashboard-admin.css';
import { useIdioma } from '@i18n/IdiomaContext';
import { useAdminNotificaciones, type TipoNotificacion } from '../../hooks/useAdminNotificaciones';
import { ETIQUETA_TIPO } from '../../components/layout/NotificacionesBell';
import LocalizedNotificationText from '@components/common/LocalizedNotificationText';

const FILTROS: { id: 'todas' | TipoNotificacion; labelKey: string }[] = [
  { id: 'todas', labelKey: 'adm.notificaciones.filtroTodas' },
  { id: 'cuenta', labelKey: 'adm.notificaciones.filtroCuenta' },
  { id: 'stock', labelKey: 'adm.notificaciones.filtroStock' },
];

const ICONO_TIPO: Record<TipoNotificacion, React.ReactNode> = {
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
};

const AdminNotificaciones = () => {
  const { t } = useIdioma();
  const { notificaciones, cargando, noLeidas, error, recargar, marcarLeida, leerTodas } =
    useAdminNotificaciones();
  const [filtro, setFiltro] = useState<'todas' | TipoNotificacion>('todas');

  const visibles = useMemo(
    () => (filtro === 'todas' ? notificaciones : notificaciones.filter((n) => n.tipo === filtro)),
    [notificaciones, filtro]
  );

  const conteo = (tipo: 'todas' | TipoNotificacion) =>
    tipo === 'todas' ? notificaciones.length : notificaciones.filter((n) => n.tipo === tipo).length;

  return (
    <motion.section
      className="admin-panel"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="ap-header">
        <div>
          <h1 className="ap-title">{t('adm.notificaciones.titulo')}</h1>
          <p className="ap-subtitle">{t('adm.notificaciones.subtitulo')}</p>
        </div>
        <div className="ap-header-right">
          <span className="welcome-badge">
            <FaBell />
            {t('adm.notificaciones.sinLeer', { n: noLeidas })}
          </span>
          <button
            type="button"
            className="ap-btn ap-btn-ghost"
            onClick={() => void leerTodas()}
            disabled={noLeidas === 0}
          >
            {t('notif.marcarTodas')}
          </button>
        </div>
      </div>

      {error && !cargando && (
        <div className="ap-card" role="alert">
          <div className="ap-states error">
            <div className="ap-states-icon">
              <FaCircleInfo />
            </div>
            <h3>{error}</h3>
            <button type="button" className="ap-btn ap-btn-ghost" onClick={() => void recargar()}>
              {t('notif.reintentar')}
            </button>
          </div>
        </div>
      )}

      <div className="ap-pills">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`ap-pill ${filtro === f.id ? 'active' : ''}`}
            onClick={() => setFiltro(f.id)}
          >
            {t(f.labelKey)}
            <span className="ap-pill-count">{conteo(f.id)}</span>
          </button>
        ))}
      </div>

      {cargando ? (
        <div className="ap-card">
          <div className="ap-states">
            <span className="ap-loader" />
            <h3>{t('adm.notificaciones.cargando')}</h3>
            <p>{t('adm.notificaciones.cargandoDesc')}</p>
          </div>
        </div>
      ) : visibles.length === 0 ? (
        error ? null : (
          <div className="ap-card">
            <div className="ap-states">
              <div className="ap-states-icon">
                <FaBell />
              </div>
              <h3>{t('adm.notificaciones.vacio')}</h3>
              <p>{t('adm.notificaciones.vacioDesc')}</p>
              <button type="button" className="ap-btn ap-btn-ghost" onClick={() => recargar()}>
                {t('adm.notificaciones.actualizar')}
              </button>
            </div>
          </div>
        )
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={filtro}
            className="an-list"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {visibles.map((notificacion) => (
              <article
                key={notificacion.id}
                className={`an-item ${notificacion.tipo} ${notificacion.leida ? '' : 'unread'}`}
                style={{ cursor: notificacion.leida ? 'default' : 'pointer' }}
                onClick={() => {
                  if (!notificacion.leida) marcarLeida(notificacion.id);
                }}
              >
                <div className={`an-icon ${notificacion.tipo}`}>{ICONO_TIPO[notificacion.tipo]}</div>
                <div className="an-body">
                  <div className="an-top">
                  <span className="an-type">{t(ETIQUETA_TIPO[notificacion.tipo])}</span>
                    {!notificacion.leida && <span className="ap-badge warn">{t('adm.notificaciones.nueva')}</span>}
                    {notificacion.fecha && <span className="an-fecha">{notificacion.fecha}</span>}
                  </div>
                  <h3 className="an-title"><LocalizedNotificationText message={notificacion.titulo} /></h3>
                  <p className="an-msg"><LocalizedNotificationText message={notificacion.mensaje} /></p>
                  {notificacion.accion && (
                    <div className="an-actions">
                      <Link
                        to={notificacion.accion.to}
                        className="ap-btn ap-btn-ghost"
                        onClick={() => {
                          if (!notificacion.leida) void marcarLeida(notificacion.id);
                        }}
                      >
                        <LocalizedNotificationText message={notificacion.accion.label} /> <FaArrowRight />
                      </Link>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </motion.div>
        </AnimatePresence>
      )}
    </motion.section>
  );
};

export default AdminNotificaciones;
