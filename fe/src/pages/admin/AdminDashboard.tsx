import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  FaBoxesStacked,
  FaCalendarCheck,
  FaUsers,
  FaChartLine,
  FaWallet,
  FaUserGear,
  FaBagShopping,
  FaArrowRight,
  FaBell,
  FaArrowTrendUp,
  FaRotate,
  FaCircleInfo,
  FaBolt,
  FaEnvelopeOpenText,
  FaTruckField,
  FaUserShield,
} from 'react-icons/fa6';
import '@styles/admin-panel.css';
import '@styles/dashboard-admin.css';
import api from '@services/api';
import { useIdioma } from '@i18n/IdiomaContext';
import type { ReporteResumen } from '../../types';


const AccesosRapidos = [
  {
    to: '/admin/productos',
    icon: <FaBoxesStacked />,
    labelKey: 'adm.dashboard.accesoCatalogo',
    descKey: 'adm.dashboard.accesoCatalogoDesc',
  },
  {
    to: '/admin/proveedores',
    icon: <FaTruckField />,
    labelKey: 'adm.dashboard.accesoProveedores',
    descKey: 'adm.dashboard.accesoProveedoresDesc',
  },
  {
    to: '/admin/tecnicos',
    icon: <FaUserGear />,
    labelKey: 'adm.dashboard.accesoTecnicos',
    descKey: 'adm.dashboard.accesoTecnicosDesc',
  },
  {
    to: '/admin/instalaciones',
    icon: <FaCalendarCheck />,
    labelKey: 'adm.dashboard.accesoCitas',
    descKey: 'adm.dashboard.accesoCitasDesc',
  },
  {
    to: '/admin/clientes',
    icon: <FaUsers />,
    labelKey: 'adm.dashboard.accesoClientes',
    descKey: 'adm.dashboard.accesoClientesDesc',
  },
  {
    to: '/admin/consultas',
    icon: <FaEnvelopeOpenText />,
    labelKey: 'adm.dashboard.accesoSolicitudes',
    descKey: 'adm.dashboard.accesoSolicitudesDesc',
  },
  {
    to: '/admin/reportes',
    icon: <FaChartLine />,
    labelKey: 'adm.dashboard.accesoReportes',
    descKey: 'adm.dashboard.accesoReportesDesc',
  },
  {
    to: '/admin/notificaciones',
    icon: <FaBell />,
    labelKey: 'adm.dashboard.accesoNotificaciones',
    descKey: 'adm.dashboard.accesoNotificacionesDesc',
  },
  {
    to: '/perfil/admin',
    icon: <FaUserShield />,
    labelKey: 'adm.dashboard.accesoMiPerfil',
    descKey: 'adm.dashboard.accesoMiPerfilDesc',
  },
];

const formatoPesos = (v: number) => `$${Math.round(v).toLocaleString('es-CO')}`;

const AdminDashboard = () => {
  const { t, idioma } = useIdioma();
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [datos, setDatos] = useState<ReporteResumen | null>(null);

  const cargar = async (silencioso = false) => {
    if (!silencioso) {
      setCargando(true);
      setError(false);
    }
    try {
      const report = await api.get<ReporteResumen>('/reports/resumen');
      setDatos(report.data);
    } catch {
      if (!silencioso) setError(true);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
    // Tiempo real: refresco silencioso cada 30 s para ver datos actuales.
    const intervalo = window.setInterval(() => cargar(true), 10000);
    return () => window.clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hoy = new Date().toLocaleDateString(idioma === 'en' ? 'en-US' : 'es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const maxVentas = Math.max(...(datos?.pedidos_por_mes ?? []).map((p) => p.ventas), 0) || 1;

  return (
    <motion.section
      className="admin-panel"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="ap-header">
        <div>
          <h1 className="ap-title">{t('adm.dashboard.titulo')}</h1>
          <p className="ap-subtitle">{t('adm.dashboard.subtitulo', { hoy })}</p>
        </div>
        <div className="ap-header-right">
          <button type="button" className="ap-btn ap-btn-ghost" onClick={() => cargar()} disabled={cargando}>
            <FaRotate className={cargando ? 'spin' : ''} /> {t('adm.dashboard.actualizar')}
          </button>
        </div>
      </div>

      {error ? (
        <div className="ap-card">
          <div className="ap-states error">
            <div className="ap-states-icon">
              <FaCircleInfo />
            </div>
            <h3>{t('adm.dashboard.errorCargar')}</h3>
            <button type="button" className="ap-btn ap-btn-ghost" onClick={() => cargar()}>
              {t('adm.dashboard.reintentar')}
            </button>
          </div>
        </div>
      ) : cargando || !datos ? (
        <div className="ap-card">
          <div className="ap-states">
            <span className="ap-loader" />
            <h3>{t('adm.dashboard.cargando')}</h3>
          </div>
        </div>
      ) : (
        <>
          <div className="ap-kpis">
            <div className="ap-card ap-kpi">
              <div className="ap-kpi-label">
                <FaWallet /> {t('adm.dashboard.kpiVentas')}
              </div>
              <div className="ap-kpi-value">{formatoPesos(datos.ventas_total)}</div>
              <div className="ap-mini-sub">{t('adm.dashboard.pedidosRegistrados', { n: datos.pedidos_total })}</div>
            </div>
            <div className="ap-card ap-kpi">
              <div className="ap-kpi-label">
                <FaBagShopping /> {t('adm.dashboard.kpiPedidos')}
              </div>
              <div className="ap-kpi-value">{datos.pedidos_total}</div>
              <div className="ap-mini-sub">
                {datos.pedidos_por_mes.length > 0 ? t('adm.dashboard.conHistorico') : t('adm.dashboard.sinPedidos')}
              </div>
            </div>
            <div className="ap-card ap-kpi">
              <div className="ap-kpi-label">
                <FaUsers /> {t('adm.dashboard.kpiClientes')}
              </div>
              <div className="ap-kpi-value">{datos.clientes_total}</div>
            </div>
            <div className="ap-card ap-kpi">
              <div className="ap-kpi-label">
                <FaCalendarCheck /> {t('adm.dashboard.kpiCitas')}
              </div>
              <div className="ap-kpi-value">{datos.citas_por_estado.Confirmada || 0}</div>
              <div className="ap-mini-sub">{t('adm.dashboard.citasPendientes', { n: datos.citas_por_estado.Pendiente || 0 })}</div>
            </div>
            <div className="ap-card ap-kpi">
              <div className="ap-kpi-label">
                <FaUserGear /> {t('adm.dashboard.kpiTecnicos')}
              </div>
              <div className="ap-kpi-value">
                {datos.tecnicos_activos}
                <span style={{ fontSize: '0.9rem', color: '#9f9f9f', fontWeight: 600 }}>
                  {' '}
                  {t('adm.dashboard.tecnicosActivos', { n: datos.tecnicos_total })}
                </span>
              </div>
            </div>
            <div className="ap-card ap-kpi">
              <div className="ap-kpi-label">
                <FaBoxesStacked /> {t('adm.dashboard.kpiProductos')}
              </div>
              <div className="ap-kpi-value">{datos.productos_total}</div>
              <div className="ap-mini-sub">{t('adm.dashboard.productosActivos', { n: datos.productos_activos })}</div>
            </div>
          </div>



          <div className="admin-dash-grid">
            <div className="admin-dash-col">
              <div className="ap-card">
                <div className="ap-card-head">
                  <h2>
                    <FaChartLine /> {t('adm.dashboard.ventasPorMes')}
                  </h2>
                  <Link to="/admin/reportes" className="ap-btn ap-btn-ghost">
                    {t('adm.dashboard.verReportes')} <FaArrowRight />
                  </Link>
                </div>
                {datos.pedidos_por_mes.length === 0 ? (
                  <p className="solicitudes-vacio">{t('adm.dashboard.sinVentasGrafico')}</p>
                ) : (
                  <div className="ap-chart-wrap">
                    {datos.pedidos_por_mes.map((p) => {
                      if (!p.mes) return null;
                      const [y, m] = p.mes.split('-');
                      return (
                        <div className="ap-chart-bar-row" key={p.mes}>
                          <span className="ap-chart-row-mes">{`${new Date(
                            Number(y),
                            (parseInt(m, 10) || 1) - 1,
                            1
                          ).toLocaleDateString(idioma === 'en' ? 'en-US' : 'es-CO', { month: 'short' })} ${y}`}</span>
                          <div
                            className="ap-chart-bar"
                            style={{ width: `${Math.max((p.ventas / maxVentas) * 100, 3)}%` }}
                          />
                          <span className="ap-chart-row-val">{formatoPesos(p.ventas)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="ap-card">
                <div className="ap-card-head">
                  <h2>
                    <FaArrowTrendUp /> {t('adm.dashboard.productosMasVendidos')}
                  </h2>
                </div>
                {datos.productos_mas_vendidos.length === 0 ? (
                  <p className="solicitudes-vacio">{t('adm.dashboard.sinVentasProductos')}</p>
                ) : (
                  <div className="ap-mini">
                    {datos.productos_mas_vendidos.slice(0, 5).map((p, i) => (
                      <div className="ap-mini-item" key={p.nombre_producto}>
                        <span className="ap-mini-icon">{i + 1}</span>
                        <div className="ap-mini-info">
                          <div className="ap-mini-title">{p.nombre_producto}</div>
                          <div className="ap-mini-sub">{t('adm.dashboard.unidades', { n: p.cantidad })}</div>
                        </div>
                        <span className="ap-mini-val">{formatoPesos(p.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="admin-dash-col">
              <div className="ap-card">
                <div className="ap-card-head">
                  <h2>
                    <FaBolt /> {t('adm.dashboard.accesosRapidos')}
                  </h2>
                </div>
                <div className="ap-acciones">
                  {AccesosRapidos.map((a) => (
                    <Link to={a.to} className="ap-accion" key={a.to}>
                      <span className="ap-accion-icon">{a.icon}</span>
                      <span>
                        <strong>{t(a.labelKey)}</strong>
                        <em>{t(a.descKey)}</em>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </motion.section>
  );
};

export default AdminDashboard;