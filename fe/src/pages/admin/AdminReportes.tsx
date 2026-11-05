// Pantalla AdminReportes de Neodomus. Reúne el estado y las acciones de su vista.
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useIdioma } from '@i18n/IdiomaContext';
import {
  FaChartLine,
  FaCircleInfo,
  FaCircleCheck,
  FaRotate,
  FaWallet,
  FaBoxesStacked,
  FaUsers,
  FaClock,
  FaUserGear,
  FaBagShopping,
  FaCalendarCheck,
  FaArrowTrendUp,
  FaXmark,
  FaTriangleExclamation,
  FaFilePdf,
} from 'react-icons/fa6';
import '@styles/admin-panel.css';
import '@styles/dashboard-admin.css';
import api, { descargarReportePdf } from '@services/api';
import type { ReporteResumen } from '../../types';

// Comunica con el backend mediante GET '/reports/resumen'.
const AdminReportes = () => {
  const { t } = useIdioma();
  const [datos, setDatos] = useState<ReporteResumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [fechaInicio, setFechaInicio] = useState(() => {
    const hoy = new Date();
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [fechaFin, setFechaFin] = useState(() => {
    const hoy = new Date();
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  });
  const [rangoError, setRangoError] = useState<string | null>(null);
  const [descargando, setDescargando] = useState(false);

  const MESES = [
    t('adm.reportes.mesEne'),
    t('adm.reportes.mesFeb'),
    t('adm.reportes.mesMar'),
    t('adm.reportes.mesAbr'),
    t('adm.reportes.mesMay'),
    t('adm.reportes.mesJun'),
    t('adm.reportes.mesJul'),
    t('adm.reportes.mesAgo'),
    t('adm.reportes.mesSep'),
    t('adm.reportes.mesOct'),
    t('adm.reportes.mesNov'),
    t('adm.reportes.mesDic'),
  ];

  const rangoValido = (inicio: string, fin: string): boolean => {
    if (!inicio || !fin) {
      setRangoError(t('adm.reportes.rangoFechasRequeridas'));
      return false;
    }
    if (fin < inicio) {
      setRangoError(t('adm.reportes.rangoInvalido'));
      return false;
    }
    setRangoError(null);
    return true;
  };

  // Comunica con el backend mediante GET '/reports/resumen'.
  const cargar = async (inicio?: string, fin?: string) => {
    const ini = inicio ?? fechaInicio;
    const ffin = fin ?? fechaFin;
    if (!rangoValido(ini, ffin)) {
      setCargando(false);
      return;
    }
    setCargando(true);
    setError(false);
    try {
      const res = await api.get<ReporteResumen>('/reports/resumen', {
        params: { fecha_inicio: ini, fecha_fin: ffin },
      });
      setDatos(res.data);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const descargar = async () => {
    if (!rangoValido(fechaInicio, fechaFin)) return;
    setDescargando(true);
    try {
      await descargarReportePdf(
        { fechaInicio, fechaFin },
        t('adm.reportes.errorDescarga'),
      );
    } finally {
      setDescargando(false);
    }
  };

  const formatoPesos = (v: number) => `$${Math.round(v).toLocaleString('es-CO')}`;

  const formatoFecha = (v: string) => {
    if (!v) return '';
    const [y, m, d] = v.split('-');
    return `${d}/${m}/${y}`;
  };

  const mesLabel = (mes: string | null | undefined) => {
    if (!mes) return t('adm.reportes.sinFecha');
    const [y, m] = mes.split('-');
    return `${MESES[(parseInt(m, 10) || 1) - 1] ?? m} ${y}`;
  };

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
          <h1 className="ap-title">{t('adm.reportes.titulo')}</h1>
          <p className="ap-subtitle">{t('adm.reportes.subtitulo')}</p>
        </div>
        <div className="ap-header-right">
          <div className="ap-rango">
            <label className="ap-rango-label">
              <span>{t('adm.reportes.desde')}</span>
              <input
                type="date"
                className="ap-form-input"
                value={fechaInicio}
                max={fechaFin || undefined}
                onChange={(e) => setFechaInicio(e.target.value)}
              />
            </label>
            <label className="ap-rango-label">
              <span>{t('adm.reportes.hasta')}</span>
              <input
                type="date"
                className="ap-form-input"
                value={fechaFin}
                min={fechaInicio || undefined}
                onChange={(e) => setFechaFin(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="ap-btn ap-btn-ghost"
              onClick={() => cargar()}
              disabled={cargando}
              title={t('adm.reportes.aplicarRango')}
            >
              <FaRotate className={cargando ? 'spin' : ''} /> {t('adm.reportes.aplicarRango')}
            </button>
            <button
              type="button"
              className="ap-btn ap-btn-primary"
              onClick={descargar}
              disabled={descargando || cargando}
            >
              <FaFilePdf /> {descargando ? t('adm.reportes.descargando') : t('adm.reportes.descargarPdf')}
            </button>
          </div>
        </div>
      </div>

      {rangoError ? (
        <div className="ap-card">
          <div className="ap-states error">
            <div className="ap-states-icon">
              <FaTriangleExclamation />
            </div>
            <h3>{rangoError}</h3>
            <p>{t('adm.reportes.rangoErrorDesc')}</p>
          </div>
        </div>
      ) : cargando ? (
        <div className="ap-card">
          <div className="ap-states">
            <span className="ap-loader" />
            <h3>{t('adm.reportes.generando')}</h3>
            <p>{t('adm.reportes.generandoSub')}</p>
          </div>
        </div>
      ) : error ? (
        <div className="ap-card">
          <div className="ap-states error">
            <div className="ap-states-icon">
              <FaCircleInfo />
            </div>
            <h3>{t('adm.reportes.errorTitulo')}</h3>
            <p>{t('adm.reportes.errorSub')}</p>
            <button type="button" className="ap-btn ap-btn-ghost" onClick={() => cargar()}>
              {t('adm.reportes.reintentar')}
            </button>
          </div>
        </div>
      ) : datos ? (
        <>
          <div className="ap-card ap-rango-resumen">
            <FaCalendarCheck />{' '}
            <strong>
              {t('adm.reportes.rangoSeleccionado', {
                inicio: formatoFecha(fechaInicio),
                fin: formatoFecha(fechaFin),
              })}
            </strong>
          </div>
          <div className="ap-kpis">
            <div className="ap-card ap-kpi">
              <div className="ap-kpi-label">
                <FaWallet /> {t('adm.reportes.ventasTotales')}
              </div>
              <div className="ap-kpi-value">{formatoPesos(datos.ventas_total)}</div>
              <div className="ap-mini-sub">
                {t('adm.reportes.pedidosRegistrados', { n: datos.pedidos_total })}
              </div>
            </div>
            <div className="ap-card ap-kpi">
              <div className="ap-kpi-label">
                <FaBagShopping /> {t('adm.reportes.pedidos')}
              </div>
              <div className="ap-kpi-value">{datos.pedidos_total}</div>
              <div className="ap-mini-sub">
                {datos.pedidos_por_mes.length > 0
                  ? t('adm.reportes.conHistorico')
                  : t('adm.reportes.sinPedidos')}
              </div>
            </div>
            <div className="ap-card ap-kpi">
              <div className="ap-kpi-label">
                <FaUsers /> {t('adm.reportes.clientesRegistrados')}
              </div>
              <div className="ap-kpi-value">{datos.clientes_total}</div>
            </div>
            <div className="ap-card ap-kpi">
              <div className="ap-kpi-label">
                <FaCalendarCheck /> {t('adm.reportes.citasInstalaciones')}
              </div>
              <div className="ap-kpi-value">{datos.citas_total}</div>
              <div className="ap-mini-sub">
                {t('adm.reportes.citasResumen', {
                  pendientes: datos.citas_por_estado.Pendiente,
                  confirmadas: datos.citas_por_estado.Confirmada,
                  finalizadas: datos.citas_por_estado.Finalizada,
                })}
              </div>
            </div>
            <div className="ap-card ap-kpi">
              <div className="ap-kpi-label">
                <FaUserGear /> {t('adm.reportes.tecnicos')}
              </div>
              <div className="ap-kpi-value">
                {datos.tecnicos_activos}
                <span style={{ fontSize: '0.9rem', color: '#9f9f9f', fontWeight: 600 }}>
                  {' '}
                  / {datos.tecnicos_total}
                </span>
              </div>
              <div className="ap-mini-sub">{t('adm.reportes.tecnicosActivosSub')}</div>
            </div>
            <div className="ap-card ap-kpi">
              <div className="ap-kpi-label">
                <FaBoxesStacked /> {t('adm.reportes.productos')}
              </div>
              <div className="ap-kpi-value">{datos.productos_total}</div>
              <div className="ap-mini-sub">
                {t('adm.reportes.productosActivos', { n: datos.productos_activos })}
              </div>
            </div>
          </div>

          <div className="admin-dash-grid">
            <div className="admin-dash-col">
              <div className="ap-card">
                <div className="ap-card-head">
                  <h2>
                    <FaChartLine /> {t('adm.reportes.ventasPorMes')}
                  </h2>
                </div>
                {datos.pedidos_por_mes.length === 0 ? (
                  <p className="solicitudes-vacio">{t('adm.reportes.sinVentasGraficar')}</p>
                ) : (
                  <div className="ap-chart-wrap">
                    {datos.pedidos_por_mes.map((p) => (
                      <div className="ap-chart-bar-row" key={p.mes}>
                        <span className="ap-chart-row-mes">{mesLabel(p.mes)}</span>
                        <div
                          className="ap-chart-bar"
                          style={{ width: `${Math.max((p.ventas / maxVentas) * 100, 3)}%` }}
                        />
                        <span className="ap-chart-row-val">{formatoPesos(p.ventas)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="ap-card">
                <div className="ap-card-head">
                  <h2>
                    <FaArrowTrendUp /> {t('adm.reportes.productosMasVendidos')}
                  </h2>
                </div>
                {datos.productos_mas_vendidos.length === 0 ? (
                  <p className="solicitudes-vacio">{t('adm.reportes.sinVentasProductos')}</p>
                ) : (
                  <div className="ap-mini">
                    {datos.productos_mas_vendidos.map((p, i) => (
                      <div className="ap-mini-item" key={p.nombre_producto}>
                        <span className="ap-mini-icon">{i + 1}</span>
                        <div className="ap-mini-info">
                          <div className="ap-mini-title">{p.nombre_producto}</div>
                          <div className="ap-mini-sub">{t('adm.reportes.unidadesVendidas', { n: p.cantidad })}</div>
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
                    <FaCalendarCheck /> {t('adm.reportes.citasPorEstado')}
                  </h2>
                </div>
                <div className="ap-mini">
                  <div className="ap-mini-item">
                    <span className="ap-mini-icon" style={{ color: '#ffd700', borderColor: 'rgba(255,215,0,0.4)' }}>
                      <FaClock />
                    </span>
                    <div className="ap-mini-info">
                      <div className="ap-mini-title">{t('adm.reportes.estadoPendientes')}</div>
                      <div className="ap-mini-sub">{t('adm.reportes.estadoPendientesSub')}</div>
                    </div>
                    <span className="ap-mini-val">{datos.citas_por_estado.Pendiente}</span>
                  </div>
                  <div className="ap-mini-item">
                    <span className="ap-mini-icon" style={{ color: '#8ab4f8', borderColor: 'rgba(138,180,248,0.4)' }}>
                      <FaCircleCheck />
                    </span>
                    <div className="ap-mini-info">
                      <div className="ap-mini-title">{t('adm.reportes.estadoConfirmadas')}</div>
                      <div className="ap-mini-sub">{t('adm.reportes.estadoConfirmadasSub')}</div>
                    </div>
                    <span className="ap-mini-val">{datos.citas_por_estado.Confirmada}</span>
                  </div>
                  <div className="ap-mini-item">
                    <span className="ap-mini-icon" style={{ color: '#46d06f', borderColor: 'rgba(70,160,67,0.4)' }}>
                      <FaCircleCheck />
                    </span>
                    <div className="ap-mini-info">
                      <div className="ap-mini-title">{t('adm.reportes.estadoFinalizadas')}</div>
                      <div className="ap-mini-sub">{t('adm.reportes.estadoFinalizadasSub')}</div>
                    </div>
                    <span className="ap-mini-val">{datos.citas_por_estado.Finalizada}</span>
                  </div>
                  <div className="ap-mini-item">
                    <span className="ap-mini-icon" style={{ color: '#ff8f93', borderColor: 'rgba(229,72,77,0.4)' }}>
                      <FaXmark />
                    </span>
                    <div className="ap-mini-info">
                      <div className="ap-mini-title">{t('adm.reportes.estadoCanceladas')}</div>
                      <div className="ap-mini-sub">{t('adm.reportes.estadoCanceladasSub')}</div>
                    </div>
                    <span className="ap-mini-val">{datos.citas_por_estado.Cancelada}</span>
                  </div>
                </div>
              </div>

              <div className="ap-card">
                <div className="ap-card-head">
                  <h2>
                    <FaUsers /> {t('adm.reportes.resumenSistema')}
                  </h2>
                </div>
                <div className="ap-mini">
                  <div className="ap-mini-item">
                    <span className="ap-mini-icon">
                      <FaUsers />
                    </span>
                    <div className="ap-mini-info">
                      <div className="ap-mini-title">{t('adm.reportes.resumenClientes')}</div>
                      <div className="ap-mini-sub">{t('adm.reportes.resumenClientesSub')}</div>
                    </div>
                    <span className="ap-mini-val">{datos.clientes_total}</span>
                  </div>
                  <div className="ap-mini-item">
                    <span className="ap-mini-icon">
                      <FaUserGear />
                    </span>
                    <div className="ap-mini-info">
                      <div className="ap-mini-title">{t('adm.reportes.resumenTecnicos')}</div>
                      <div className="ap-mini-sub">{t('adm.reportes.resumenTecnicosSub')}</div>
                    </div>
                    <span className="ap-mini-val">{datos.tecnicos_activos}</span>
                  </div>
                  <div className="ap-mini-item">
                    <span className="ap-mini-icon">
                      <FaTriangleExclamation />
                    </span>
                    <div className="ap-mini-info">
                      <div className="ap-mini-title">{t('adm.reportes.resumenSolicitudes')}</div>
                      <div className="ap-mini-sub">{t('adm.reportes.resumenSolicitudesSub')}</div>
                    </div>
                    <span className="ap-mini-val">{datos.solicitudes_pendientes}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </motion.section>
  );
};

export default AdminReportes;