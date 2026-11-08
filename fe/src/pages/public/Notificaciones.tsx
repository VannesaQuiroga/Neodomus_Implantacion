// Apartado de notificaciones: comparte fuente, leído y contador con la campana.
import { Link } from 'react-router-dom';
import { FaBell, FaCheck, FaCircleInfo } from 'react-icons/fa6';
import { useAuth } from '@contexts/AuthContext';
import { useIdioma } from '@i18n/IdiomaContext';
import {
  ETIQUETA_TIPO,
  ICONO_TIPO,
} from '../../components/layout/NotificacionesBell';
import {
  useNotificacionesRol,
  type RolNotificaciones,
} from '../../hooks/useAdminNotificaciones';
import '@styles/notificaciones.css';
import LocalizedNotificationText from '@components/common/LocalizedNotificationText';

const Notificaciones = () => {
  const { t } = useIdioma();
  const { rol } = useAuth();
  const rolNotificaciones =
    rol === 'cliente' || rol === 'administrador' || rol === 'tecnico'
      ? (rol as RolNotificaciones)
      : null;
  const {
    notificaciones,
    cargando,
    noLeidas,
    error,
    recargar,
    marcarLeida,
    leerTodas,
  } = useNotificacionesRol(rolNotificaciones);

  return (
    <main className="notif-page app-glass">
      <section className="notif-content">
        <header className="notif-header">
          <div>
            <h1>{t('notif.titulo')}</h1>
            <p>{t('notif.subtitulo')}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="notif-badge">{t('notif.sinLeer', { count: noLeidas })}</span>
            <button
              type="button"
              className="notif-marcar-todas"
              onClick={() => void leerTodas()}
              disabled={noLeidas === 0}
            >
              {t('notif.marcarTodas')}
            </button>
          </div>
        </header>

        {error && (
          <div className="notif-vacio" role="alert">
            <p>{error}</p>
            <button type="button" className="notif-reintentar" onClick={() => void recargar()}>
              {t('notif.reintentar')}
            </button>
          </div>
        )}

        {cargando && <p className="notif-vacio">{t('adm.notificaciones.cargando')}</p>}
        {!cargando && !error && notificaciones.length === 0 && (
          <p className="notif-vacio">{t('notif.vacio')}</p>
        )}

        <div className="notif-list">
          {notificaciones.map((notificacion) => (
            <Link
              key={notificacion.id}
              to={notificacion.accion?.to || '/notificaciones'}
              className={`notif-item notif-${notificacion.tipo}`}
              style={{
                opacity: notificacion.leida ? 0.6 : 1,
                cursor: notificacion.leida ? 'default' : 'pointer',
              }}
              onClick={() => {
                if (!notificacion.leida) void marcarLeida(notificacion.id);
              }}
            >
              <div className="notif-item-icon">
                {ICONO_TIPO[notificacion.tipo] ?? <FaCircleInfo />}
              </div>
              <div className="notif-item-body">
                <div className="notif-item-top">
                  <span className="notif-badge">
                    {t(ETIQUETA_TIPO[notificacion.tipo] ?? 'notif.tipo.sistema')}
                  </span>
                  <span className="notif-fecha">{notificacion.fecha}</span>
                </div>
                <h3 className="notif-titulo"><LocalizedNotificationText message={notificacion.titulo} /></h3>
                <p className="notif-mensaje"><LocalizedNotificationText message={notificacion.mensaje} /></p>
                {notificacion.accion && (
                  <span className="notif-accion"><LocalizedNotificationText message={notificacion.accion.label} /></span>
                )}
              </div>
              {notificacion.leida ? (
                <div style={{ color: '#3d7a3d', marginLeft: 8, flexShrink: 0 }}>
                  <FaCheck />
                </div>
              ) : (
                <FaBell style={{ marginLeft: 8, flexShrink: 0 }} />
              )}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
};

export default Notificaciones;
