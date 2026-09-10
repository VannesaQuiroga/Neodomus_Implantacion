import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  FaBoxOpen,
  FaCamera,
  FaCircleCheck,
  FaCircleInfo,
  FaClockRotateLeft,
  FaEnvelope,
  FaEye,
  FaLocationDot,
  FaMagnifyingGlass,
  FaPhone,
  FaPlus,
  FaTruckFast,
  FaUserTie,
  FaXmark,
} from 'react-icons/fa6';
import '@styles/admin-panel.css';
import '@styles/dashboard-admin.css';
import api from '@services/api';
import { useIdioma } from '@i18n/IdiomaContext';
import NuevaNovedadModal from '@components/tecnico/NuevaNovedadModal';

interface Recogida {
  id_devolucion: number;
  id_pedido?: number | null;
  producto: string;
  producto_imagen?: string | null;
  cliente: string;
  direccion: string;
  telefono?: number | null;
  email?: string | null;
  estado_devolucion: string;
  resolucion?: string | null;
  preferencia: string;
  recogida_estado: 'Asignada' | 'Recogida' | null;
  motivo?: string | null;
  fecha_solicitud?: string | null;
  evidencia_recogida_url?: string | null;
  fecha_recogida?: string | null;
  evidencia_cambio_url?: string | null;
  fecha_entrega_cambio?: string | null;
}

const API_HOST = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1').replace(
  /\/api\/v1\/?$/,
  '',
);

type Toast = { msg: string; tipo: 'success' | 'error' } | null;

const urlImagen = (url?: string | null) =>
  !url ? '' : url.startsWith('http') ? url : `${API_HOST}${url}`;

const TecnicoDevoluciones = () => {
  const { idioma, t } = useIdioma();
  const [activas, setActivas] = useState<Recogida[]>([]);
  const [historial, setHistorial] = useState<Recogida[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState(false);
  const [vista, setVista] = useState<'activas' | 'historial'>('activas');
  const [busqueda, setBusqueda] = useState('');
  const [subiendoRecogida, setSubiendoRecogida] = useState<number | null>(null);
  const [subiendoCambio, setSubiendoCambio] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<Recogida | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const recogidaRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const cambioRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // Novedad modal state
  const [novedadDevolucion, setNovedadDevolucion] = useState<Recogida | null>(null);

  const notificar = (msg: string, tipo: 'success' | 'error' = 'success') => {
    setToast({ msg, tipo });
    window.setTimeout(() => setToast(null), 3200);
  };

  const cargar = async () => {
    setLoading(true);
    setErrorCarga(false);
    try {
      const [resAct, resHist] = await Promise.all([
        api.get<Recogida[]>('/devoluciones/mis-recogidas'),
        api
          .get<Recogida[]>('/devoluciones/mis-recogidas', { params: { historial: true } })
          .catch(() => ({ data: [] as Recogida[] })),
      ]);
      setActivas(resAct.data || []);
      setHistorial(resHist.data || []);
    } catch (err) {
      console.error(err);
      setErrorCarga(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const confirmarRecogida = async (idDevolucion: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fd = new FormData();
    fd.append('file', files[0]);
    setSubiendoRecogida(idDevolucion);
    try {
      await api.post(`/devoluciones/${idDevolucion}/evidencia-recogida`, fd);
      notificar(t('tec.recogidaConfirmada'));
      await cargar();
    } catch (err: any) {
      notificar(err?.response?.data?.detail || t('tec.recogidaError'), 'error');
    } finally {
      setSubiendoRecogida(null);
    }
  };

  const confirmarCambio = async (idDevolucion: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fd = new FormData();
    fd.append('file', files[0]);
    setSubiendoCambio(idDevolucion);
    try {
      await api.post(`/devoluciones/${idDevolucion}/evidencia-cambio`, fd);
      notificar(t('tec.devCambioConfirmado'));
      await cargar();
    } catch (err: any) {
      notificar(err?.response?.data?.detail || t('tec.devErrorCambio'), 'error');
    } finally {
      setSubiendoCambio(null);
    }
  };

  const esCambio = (r: Recogida) =>
    r.resolucion?.toLowerCase() === 'cambio' ||
    (!r.resolucion && r.preferencia === 'producto');

  const lista = vista === 'activas' ? activas : historial;

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter((r) =>
      [
        r.cliente,
        r.producto,
        String(r.id_pedido ?? ''),
        String(r.id_devolucion),
        r.direccion,
        r.telefono ? String(r.telefono) : '',
        r.motivo || '',
        r.estado_devolucion,
        r.resolucion || '',
      ].some((v) => v.toLowerCase().includes(q)),
    );
  }, [lista, busqueda]);

  const porRecoger = activas.filter((r) => r.recogida_estado !== 'Recogida').length;
  const porEntregarCambio = activas.filter((r) => esCambio(r) && !r.evidencia_cambio_url).length;

  const formatFechaHora = (iso?: string | null) => {
    if (!iso) return t('tec.noRegistrado');
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(idioma === 'en' ? 'en-US' : 'es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const badgeEstado = (r: Recogida) => {
    if (r.estado_devolucion === 'Pendiente')
      return <span className="ap-badge pendiente">{t('tec.devEsperandoAprobacion')}</span>;
    if (r.estado_devolucion === 'Rechazada')
      return <span className="ap-badge err">{t('tec.devRechazada')}</span>;
    if (!r.evidencia_cambio_url && esCambio(r) && r.recogida_estado === 'Recogida')
      return <span className="ap-badge info">{t('tec.devPorEntregarTitulo')}</span>;
    if (r.recogida_estado === 'Recogida')
      return <span className="ap-badge ok"><FaCircleCheck /> {t('tec.recogidaHecha')}</span>;
    return <span className="ap-badge warn">{t('tec.recogidaPendiente')}</span>;
  };

  return (
    <motion.div
      className="admin-panel"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="ap-header">
        <div>
          <h1 className="ap-title"><FaBoxOpen /> {t('tec.devolTitulo')}</h1>
          <p className="ap-subtitle">{t('tec.devolSub')}</p>
        </div>
        <div className="ap-header-right">
          <div className="ap-tabs" role="tablist" aria-label={t('tec.devolTabsAria')}>
            <button
              type="button"
              role="tab"
              aria-selected={vista === 'activas'}
              className={`ap-tab ${vista === 'activas' ? 'active' : ''}`}
              onClick={() => setVista('activas')}
            >
              {t('tec.devActivas')}
              {porRecoger + porEntregarCambio > 0 && (
                <span className="ap-pill-count">{porRecoger + porEntregarCambio}</span>
              )}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={vista === 'historial'}
              className={`ap-tab ${vista === 'historial' ? 'active' : ''}`}
              onClick={() => setVista('historial')}
            >
              <FaClockRotateLeft /> {t('tec.historial')}
              {historial.length > 0 && (
                <span className="ap-pill-count">{historial.length}</span>
              )}
            </button>
          </div>
        </div>
      </div>

      <form className="ap-search" style={{ marginBottom: 14 }} onSubmit={(e) => e.preventDefault()}>
        <FaMagnifyingGlass />
        <input
          type="text"
          placeholder={t('tec.devBuscarPlaceholder')}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </form>

      {vista === 'activas' && !loading && !errorCarga && (
        <div className="admin-stats-grid">
          <div className="admin-stat-card">
            <div className="admin-stat-icon"><FaBoxOpen /></div>
            <div className="admin-stat-info">
              <div className="admin-stat-value">{activas.length}</div>
              <div className="admin-stat-label">{t('tec.devTotalActivas')}</div>
            </div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-icon"><FaTruckFast /></div>
            <div className="admin-stat-info">
              <div className="admin-stat-value">{porRecoger}</div>
              <div className="admin-stat-label">{t('tec.devPorRecoger')}</div>
            </div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-icon"><FaCamera /></div>
            <div className="admin-stat-info">
              <div className="admin-stat-value">{porEntregarCambio}</div>
              <div className="admin-stat-label">{t('tec.devPorEntregarCambio')}</div>
            </div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-icon"><FaClockRotateLeft /></div>
            <div className="admin-stat-info">
              <div className="admin-stat-value">{historial.length}</div>
              <div className="admin-stat-label">{t('tec.devCompletadas')}</div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="ap-card">
          <div className="ap-states">
            <span className="ap-loader" />
            <h3>{t('tec.cargandoCitas')}</h3>
          </div>
        </div>
      ) : errorCarga ? (
        <div className="ap-card">
          <div className="ap-states error">
            <div className="ap-states-icon"><FaCircleInfo /></div>
            <h3>{t('adm.instalaciones.errorTitulo')}</h3>
            <button type="button" className="ap-btn ap-btn-ghost" onClick={cargar}>
              {t('adm.instalaciones.reintentar')}
            </button>
          </div>
        </div>
      ) : visibles.length === 0 ? (
        <div className="ap-card">
          <div className="ap-states">
            <div className="ap-states-icon"><FaBoxOpen /></div>
            <h3>{busqueda ? t('tec.vacioHistorial') : t('tec.sinDevoluciones')}</h3>
            {!busqueda && <p>{t('tec.sinDevolucionesHint')}</p>}
          </div>
        </div>
      ) : (
        <div className="ap-card">
          {visibles.map((r) => {
            const cambioPendiente =
              r.recogida_estado === 'Recogida' &&
              esCambio(r) &&
              !r.evidencia_cambio_url &&
              r.estado_devolucion === 'Aprobada';
            return (
              <div key={r.id_devolucion} className="novedad-item">
                <div className="novedad-left">
                  <div className="icon-circle">
                    {r.producto_imagen ? (
                      <img
                        src={urlImagen(r.producto_imagen)}
                        alt={r.producto}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                      />
                    ) : (
                      <FaBoxOpen />
                    )}
                  </div>
                  <div>
                    <h3>
                      {r.producto}
                      <span className="muted" style={{ fontWeight: 'normal', marginLeft: 8 }}>
                        Devolución #{r.id_devolucion}
                        {r.id_pedido ? ` · Pedido #${r.id_pedido}` : ''}
                      </span>
                    </h3>
                    <p><FaUserTie style={{ marginRight: 6 }} />{r.cliente}{r.telefono ? ` · ${r.telefono}` : ''}</p>
                    <p><FaLocationDot style={{ marginRight: 6 }} />{r.direccion}</p>
                    {r.email && <p><FaEnvelope style={{ marginRight: 6 }} />{r.email}</p>}
                    {r.motivo && (
                      <p className="muted" style={{ marginTop: 4 }}>
                        {t('tec.motivo')}: “{r.motivo}”
                      </p>
                    )}
                    <p className="muted" style={{ marginTop: 4 }}>
                      {esCambio(r)
                        ? `${t('tec.preferenciaCliente')}: ${t('tec.preferenciaProducto')}`
                        : `${t('tec.preferenciaCliente')}: ${t('tec.preferenciaDinero')}`}
                      {r.resolucion ? ` · ${t('tec.devResolucion')}: ${r.resolucion}` : ''}
                    </p>
                    {r.fecha_solicitud && (
                      <p className="muted">{t('tec.fechaSolicitud')}: {formatFechaHora(r.fecha_solicitud)}</p>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                  {badgeEstado(r)}

                  {(r.evidencia_recogida_url || r.evidencia_cambio_url) && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {r.evidencia_recogida_url && (
                        <a href={urlImagen(r.evidencia_recogida_url)} target="_blank" rel="noopener noreferrer" title={t('tec.devEvidenciaRecogida')}>
                          <img
                            src={urlImagen(r.evidencia_recogida_url)}
                            alt={t('tec.devEvidenciaRecogida')}
                            style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8 }}
                          />
                        </a>
                      )}
                      {r.evidencia_cambio_url && (
                        <a href={urlImagen(r.evidencia_cambio_url)} target="_blank" rel="noopener noreferrer" title={t('tec.devEvidenciaCambio')}>
                          <img
                            src={urlImagen(r.evidencia_cambio_url)}
                            alt={t('tec.devEvidenciaCambio')}
                            style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8 }}
                          />
                        </a>
                      )}
                    </div>
                  )}

                  {r.recogida_estado !== 'Recogida' && r.estado_devolucion === 'Aprobada' && (
                    <>
                      <input
                        ref={(el) => { recogidaRefs.current[r.id_devolucion] = el; }}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        style={{ display: 'none' }}
                        onChange={(ev) => {
                          confirmarRecogida(r.id_devolucion, ev.target.files);
                          ev.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        className="ap-btn ap-btn-primary"
                        disabled={subiendoRecogida === r.id_devolucion}
                        onClick={() => recogidaRefs.current[r.id_devolucion]?.click()}
                      >
                        <FaCamera />
                        {subiendoRecogida === r.id_devolucion ? t('tec.procesando') : t('tec.devSubirRecogida')}
                      </button>
                    </>
                  )}

                  {cambioPendiente && (
                    <>
                      <input
                        ref={(el) => { cambioRefs.current[r.id_devolucion] = el; }}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        style={{ display: 'none' }}
                        onChange={(ev) => {
                          confirmarCambio(r.id_devolucion, ev.target.files);
                          ev.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        className="ap-btn ap-btn-ok"
                        disabled={subiendoCambio === r.id_devolucion}
                        onClick={() => cambioRefs.current[r.id_devolucion]?.click()}
                      >
                        <FaCamera />
                        {subiendoCambio === r.id_devolucion ? t('tec.procesando') : t('tec.devSubirCambio')}
                      </button>
                    </>
                  )}

                  <button type="button" className="ap-btn ap-btn-ghost" onClick={() => setDetalle(r)}>
                    <FaEye /> {t('tec.verDetalles')}
                  </button>

                  <button
                    type="button"
                    className="ap-btn ap-btn-ghost"
                    style={{ fontSize: '0.78rem', padding: '5px 12px', border: '1px solid rgba(212,165,75,0.3)', color: '#d4a54b' }}
                    onClick={() => setNovedadDevolucion(r)}
                  >
                    <FaPlus /> Agregar novedad
                  </button>

                  {r.fecha_recogida && (
                    <span style={{ fontSize: '0.75rem', color: '#9a8f78' }}>
                      {t('tec.recogidaHecha')}: {formatFechaHora(r.fecha_recogida)}
                    </span>
                  )}
                  {r.fecha_entrega_cambio && (
                    <span style={{ fontSize: '0.75rem', color: '#9a8f78' }}>
                      {t('tec.devCambioEntregadoEl')}: {formatFechaHora(r.fecha_entrega_cambio)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {detalle && (
          <div className="ap-modal-overlay">
          <div className="ap-modal ap-cita-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="ap-cita-modal-head">
              <div>
                <h3>{t('tec.devolDetalleTitulo')} #{detalle.id_devolucion}</h3>
                <p className="ap-cita-modal-fecha">
                  <FaBoxOpen /> {detalle.producto}
                  {detalle.id_pedido ? ` · Pedido #${detalle.id_pedido}` : ''}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {badgeEstado(detalle)}
                <button type="button" className="ap-modal-x" onClick={() => setDetalle(null)} aria-label={t('tec.cerrar')}>
                  <FaXmark />
                </button>
              </div>
            </div>

            <div className="ap-def-list">
              <div className="ap-def">
                <div className="ap-def-label">{t('tec.cliente')}</div>
                <div className="ap-def-value"><FaUserTie /> {detalle.cliente}</div>
              </div>
              <div className="ap-def">
                <div className="ap-def-label">{t('tec.telefono')}</div>
                <div className="ap-def-value"><FaPhone /> {detalle.telefono ?? t('tec.noRegistrado')}</div>
              </div>
              <div className="ap-def">
                <div className="ap-def-label">{t('tec.email')}</div>
                <div className="ap-def-value"><FaEnvelope /> {detalle.email || t('tec.noRegistrado')}</div>
              </div>
              <div className="ap-def">
                <div className="ap-def-label">{t('tec.devResolucion')}</div>
                <div className="ap-def-value">
                  {esCambio(detalle) ? t('tec.preferenciaProducto') : t('tec.preferenciaDinero')}
                  {detalle.resolucion ? ` (${detalle.resolucion})` : ''}
                </div>
              </div>
              <div className="ap-def full">
                <div className="ap-def-label">{t('tec.direccion')}</div>
                <div className="ap-def-value"><FaLocationDot /> {detalle.direccion}</div>
              </div>
              <div className="ap-def full">
                <div className="ap-def-label">{t('tec.motivo')}</div>
                <div className="ap-def-value">{detalle.motivo || t('tec.noRegistrado')}</div>
              </div>
              <div className="ap-def">
                <div className="ap-def-label">{t('tec.fechaSolicitud')}</div>
                <div className="ap-def-value">{formatFechaHora(detalle.fecha_solicitud)}</div>
              </div>
              <div className="ap-def">
                <div className="ap-def-label">{t('tec.recogidaHecha')}</div>
                <div className="ap-def-value">{formatFechaHora(detalle.fecha_recogida)}</div>
              </div>
              {esCambio(detalle) && (
                <div className="ap-def">
                  <div className="ap-def-label">{t('tec.devCambioEntregadoEl')}</div>
                  <div className="ap-def-value">{formatFechaHora(detalle.fecha_entrega_cambio)}</div>
                </div>
              )}
            </div>

            <div className="ap-evidencia-seccion">
              <div className="ap-evidencia-seccion-head">
                <h4><FaCamera /> {t('tec.evidencias')}</h4>
              </div>
              {!detalle.evidencia_recogida_url && !detalle.evidencia_cambio_url ? (
                <p className="muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>
                  {t('tec.sinEvidencias')}
                </p>
              ) : (
                <div className="ap-evidencias-grid">
                  {detalle.evidencia_recogida_url && (
                    <div className="ap-evidencia-thumb">
                      <a href={urlImagen(detalle.evidencia_recogida_url)} target="_blank" rel="noopener noreferrer">
                        <img src={urlImagen(detalle.evidencia_recogida_url)} alt={t('tec.devEvidenciaRecogida')} />
                      </a>
                      <span className="ap-evidencia-desc">{t('tec.devEvidenciaRecogida')}</span>
                    </div>
                  )}
                  {detalle.evidencia_cambio_url && (
                    <div className="ap-evidencia-thumb">
                      <a href={urlImagen(detalle.evidencia_cambio_url)} target="_blank" rel="noopener noreferrer">
                        <img src={urlImagen(detalle.evidencia_cambio_url)} alt={t('tec.devEvidenciaCambio')} />
                      </a>
                      <span className="ap-evidencia-desc">{t('tec.devEvidenciaCambio')}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="ap-modal-actions">
              <button type="button" className="ap-btn ap-btn-ghost" onClick={() => setDetalle(null)}>
                {t('tec.cerrar')}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`ap-toast ${toast.tipo === 'error' ? 'err' : 'ok'}`} role="status">
          {toast.msg}
        </div>
      )}

      <NuevaNovedadModal
        abierto={!!novedadDevolucion}
        onCerrar={() => setNovedadDevolucion(null)}
        onCreado={cargar}
        tipoOrigen="devolucion"
        idDevolucion={novedadDevolucion?.id_devolucion}
        idPedido={novedadDevolucion?.id_pedido ?? undefined}
        nombreCliente={novedadDevolucion?.cliente}
        referenciaLabel={`#${novedadDevolucion?.id_devolucion}`}
      />
    </motion.div>
  );
};

export default TecnicoDevoluciones;
