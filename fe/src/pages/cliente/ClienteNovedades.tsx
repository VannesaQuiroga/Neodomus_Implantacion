import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaShieldHalved,
  FaEye,
  FaXmark,
  FaCheck,
  FaMagnifyingGlass,
  FaUser,
  FaCalendarCheck,
  FaCircleInfo,
  FaLocationDot,
  FaTag,
  FaCamera,
  FaPaperPlane,
  FaBoxOpen,
  FaClockRotateLeft,
} from 'react-icons/fa6';
import '@styles/admin-panel.css';
import '@styles/dashboard-admin.css';
import api from '@services/api';

interface EvidenciaNovedad {
  id_evidencia_n: number;
  url: string;
  descripcion: string | null;
  fecha_subida: string | null;
}

interface Novedad {
  id_novedad: number;
  tipo_novedad: string;
  descripcion_novedad: string;
  prioridad: string;
  estado_novedad: string;
  fecha_reporte: string | null;
  lugar_ocurrencia: string | null;
  evidencia_url: string | null;
  id_pedido: number | null;
  id_cita: number | null;
  id_cliente: number | null;
  id_devolucion: number | null;
  id_tecnico: number | null;
  tecnico_nombre: string | null;
  cliente_nombre: string | null;
  accion_admin: string | null;
  mensaje_cliente: string | null;
  solucion_cliente: string | null;
  cliente_visible: boolean;
  fecha_resolucion: string | null;
  evidencias: EvidenciaNovedad[];
}

interface NovedadDetalle extends Novedad {
  historial: {
    id_historial: number;
    accion: string;
    detalle: string | null;
    fecha: string | null;
    usuario_nombre: string | null;
  }[];
}

const ESTADOS = ['Pendiente', 'En revisión', 'Aprobada', 'Rechazada', 'Resuelta', 'Cerrada'];

const CLASE_ESTADO: Record<string, string> = {
  Pendiente: 'warn', 'En revisión': 'info', Aprobada: 'ok',
  Rechazada: 'err', Resuelta: 'ok', Cerrada: 'neutral',
};
const CLASE_PRIORIDAD: Record<string, string> = {
  baja: 'neutral', normal: 'info', alta: 'warn', urgente: 'err',
};

const formatFecha = (f?: string | null) => {
  if (!f) return '—';
  return new Date(f).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
};

const formatFechaCorta = (f?: string | null) => {
  if (!f) return '—';
  return new Date(f).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
};

const ClienteNovedades = () => {
  const [novedades, setNovedades] = useState<Novedad[]>([]);
  const [cargando, setCargando] = useState(true);
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null);
  const [detalle, setDetalle] = useState<NovedadDetalle | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [evidenciaLupa, setEvidenciaLupa] = useState<string | null>(null);

  const cargar = async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    try {
      const res = await api.get<Novedad[]>('/novedades/cliente/novedades');
      setNovedades(res.data);
    } catch {
      if (!silencioso) setToast({ msg: 'Error al cargar tus novedades', tipo: 'err' });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
    const i = window.setInterval(() => cargar(true), 30000);
    return () => window.clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const filtradas = novedades.filter((n) => {
    if (filtroEstado && n.estado_novedad !== filtroEstado) return false;
    const q = busqueda.toLowerCase().trim();
    if (q) {
      const campos = [
        n.tipo_novedad, n.descripcion_novedad, n.lugar_ocurrencia,
        n.tecnico_nombre, n.cliente_nombre,
        n.id_pedido ? `#${n.id_pedido}` : '',
        n.id_cita ? `#${n.id_cita}` : '',
      ].filter(Boolean).join(' ').toLowerCase();
      if (!campos.includes(q)) return false;
    }
    return true;
  });

  const abrirDetalle = async (id: number) => {
    try {
      const res = await api.get<NovedadDetalle>(`/novedades/${id}`);
      setDetalle(res.data);
    } catch {
      setToast({ msg: 'Error al cargar detalle', tipo: 'err' });
    }
  };

  return (
    <motion.section
      className="admin-panel"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="ap-header">
        <div>
          <h1 className="ap-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <FaShieldHalved style={{ color: '#d4a54b' }} />
            Mis novedades
          </h1>
          <p className="ap-subtitle">
            Consulta el estado de tus reportes y las soluciones asignadas
          </p>
        </div>
        <div className="ap-header-right">
          <span style={{ color: '#9f9f9f', fontSize: '0.85rem' }}>
            {filtradas.length} de {novedades.length} novedades
          </span>
        </div>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`ap-toast ${toast.tipo}`}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="ap-pills" style={{ marginBottom: 20 }}>
        {ESTADOS.map((e) => (
          <button
            key={e}
            type="button"
            className={`ap-pill ${filtroEstado === e ? 'active' : ''}`}
            onClick={() => setFiltroEstado(filtroEstado === e ? '' : e)}
          >
            {e}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <div className="ap-search ap-search-larga" style={{ maxWidth: 420 }}>
          <FaMagnifyingGlass />
          <input
            type="text"
            placeholder="Buscar por tipo, técnico, descripción..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <select className="ap-filtro-estado" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      {cargando ? (
        <div className="ap-states">
          <div className="ap-loader" />
          <p>Cargando tus novedades...</p>
        </div>
      ) : filtradas.length === 0 ? (
        <div className="ap-states">
          <div className="ap-states-icon">
            <FaShieldHalved />
          </div>
          <h3>{filtradas.length === 0 && busqueda ? 'Sin resultados' : 'Sin novedades'}</h3>
          <p>
            {filtradas.length === 0 && busqueda
              ? 'No se encontraron novedades con tu búsqueda.'
              : 'Aun no has reportado ninguna novedad.'}
          </p>
        </div>
      ) : (
        <div className="ap-table-wrap">
          <table className="ap-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Tipo</th>
                <th>Técnico</th>
                <th>Estado</th>
                <th>Prioridad</th>
                <th>Fecha</th>
                <th>Mensaje del admin</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((n) => (
                <tr key={n.id_novedad}>
                  <td style={{ fontWeight: 700, color: '#d4a54b' }}>{n.id_novedad}</td>
                  <td style={{ fontSize: '0.85rem' }}>{n.tipo_novedad}</td>
                  <td style={{ fontSize: '0.85rem' }}>{n.tecnico_nombre || '—'}</td>
                  <td>
                    <span className={`ap-badge ${CLASE_ESTADO[n.estado_novedad] || 'neutral'}`}>
                      {n.estado_novedad}
                    </span>
                  </td>
                  <td>
                    <span className={`ap-badge ${CLASE_PRIORIDAD[n.prioridad] || 'neutral'}`} style={{ fontSize: '0.7rem' }}>
                      {n.prioridad}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.82rem', color: '#9f9f9f' }}>{formatFechaCorta(n.fecha_reporte)}</td>
                  <td style={{ fontSize: '0.82rem', color: n.mensaje_cliente ? '#f5c542' : '#8f8f8f' }}>
                    {n.mensaje_cliente ? (
                      <span style={{ cursor: 'pointer' }} onClick={() => abrirDetalle(n.id_novedad)}>
                        <FaPaperPlane style={{ marginRight: 4 }} /> Mensaje recibido
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ fontSize: '0.82rem', color: n.solucion_cliente ? '#46d06f' : '#8f8f8f' }}>
                    {n.solucion_cliente ? (
                      <span style={{ cursor: 'pointer' }} onClick={() => abrirDetalle(n.id_novedad)}>
                        <FaCheck style={{ marginRight: 4 }} /> Solución
                      </span>
                    ) : '—'}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="ap-btn ap-btn-ghost"
                      style={{ fontSize: '0.78rem', padding: '5px 12px' }}
                      onClick={() => abrirDetalle(n.id_novedad)}
                    >
                      <FaEye /> Ver detalle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de detalle */}
      <AnimatePresence>
        {detalle && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="ap-modal-overlay"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: 'spring', duration: 0.35 }}
              className="ap-modal ap-modal-panel"
              style={{ maxWidth: 640 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="ap-modal-head" style={{ padding: 0 }}>
                <div>
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
                    <span style={{ color: '#d4a54b' }}>Novedad #{detalle.id_novedad}</span>
                    <span className={`ap-badge ${CLASE_ESTADO[detalle.estado_novedad] || 'neutral'}`}>
                      {detalle.estado_novedad}
                    </span>
                  </h3>
                  <p style={{ margin: '4px 0 0', color: '#8f8f8f', fontSize: '0.82rem' }}>
                    {formatFecha(detalle.fecha_reporte)}
                  </p>
                </div>
                <button type="button" className="ap-modal-x" onClick={() => setDetalle(null)}>
                  <FaXmark />
                </button>
              </div>

              <div className="ap-modal-body" style={{ padding: '18px 0 0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 18 }}>
                  <div className="ap-def">
                    <div className="ap-def-label"><FaTag style={{ marginRight: 4 }} />Tipo</div>
                    <div className="ap-def-value" style={{ fontSize: '0.85rem' }}>{detalle.tipo_novedad}</div>
                  </div>
                  <div className="ap-def">
                    <div className="ap-def-label"><FaUser style={{ marginRight: 4 }} />Técnico</div>
                    <div className="ap-def-value" style={{ fontSize: '0.85rem' }}>{detalle.tecnico_nombre || '—'}</div>
                  </div>
                  {detalle.id_pedido && (
                    <div className="ap-def">
                      <div className="ap-def-label"><FaBoxOpen style={{ marginRight: 4 }} />Pedido</div>
                      <div className="ap-def-value" style={{ fontSize: '0.85rem', color: '#8ab4f8' }}>#{detalle.id_pedido}</div>
                    </div>
                  )}
                  {detalle.id_cita && (
                    <div className="ap-def">
                      <div className="ap-def-label"><FaCalendarCheck style={{ marginRight: 4 }} />Cita</div>
                      <div className="ap-def-value" style={{ fontSize: '0.85rem', color: '#c9a7ff' }}>#{detalle.id_cita}</div>
                    </div>
                  )}
                </div>

                {detalle.lugar_ocurrencia && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', marginBottom: 14 }}>
                    <FaLocationDot style={{ color: '#d4a54b', fontSize: '0.9rem', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.85rem', color: '#c9c9c9' }}>{detalle.lugar_ocurrencia}</span>
                  </div>
                )}

                <div style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, marginBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <FaCircleInfo style={{ color: '#d4a54b', fontSize: '0.85rem' }} />
                    <strong style={{ fontSize: '0.85rem', color: '#e6e6e6' }}>Descripción</strong>
                  </div>
                  <p style={{ margin: 0, color: '#bdbdbd', fontSize: '0.88rem', lineHeight: 1.65 }}>{detalle.descripcion_novedad}</p>
                </div>

                {detalle.evidencias && detalle.evidencias.length > 0 && (
                  <div style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, marginBottom: 18 }}>
                    <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#e6e6e6', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <FaCamera style={{ color: '#d4a54b' }} /> Evidencia ({detalle.evidencias.length})
                    </h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {detalle.evidencias.map((ev) => (
                        <div key={ev.id_evidencia_n}
                          onClick={() => setEvidenciaLupa(ev.url)}
                          style={{ display: 'block', width: 90, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}>
                          <img src={ev.url} alt="Evidencia" style={{ width: '100%', height: 90, objectFit: 'cover' }} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {detalle.accion_admin && (
                  <div style={{ padding: '12px 14px', background: 'rgba(46, 160, 67, 0.08)', border: '1px solid rgba(46, 160, 67, 0.3)', borderRadius: 10, marginBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <FaCheck style={{ color: '#46d06f', fontSize: '0.8rem' }} />
                      <strong style={{ fontSize: '0.82rem', color: '#46d06f' }}>Acción del admin</strong>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#c9c9c9' }}>{detalle.accion_admin}</p>
                  </div>
                )}

                {/* Mensaje del admin al cliente */}
                {detalle.mensaje_cliente && (
                  <div style={{ padding: '12px 14px', background: 'rgba(255, 200, 50, 0.08)', border: '1px solid rgba(255, 200, 50, 0.3)', borderRadius: 10, marginBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <FaPaperPlane style={{ color: '#f5c542', fontSize: '0.8rem' }} />
                      <strong style={{ fontSize: '0.82rem', color: '#f5c542' }}>Mensaje del administrador</strong>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#c9c9c9', lineHeight: 1.5 }}>{detalle.mensaje_cliente}</p>
                  </div>
                )}

                {/* Solución para el cliente */}
                {detalle.solucion_cliente && (
                  <div style={{ padding: '12px 14px', background: 'rgba(46, 160, 67, 0.08)', border: '1px solid rgba(46, 160, 67, 0.3)', borderRadius: 10, marginBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <FaCheck style={{ color: '#46d06f', fontSize: '0.8rem' }} />
                      <strong style={{ fontSize: '0.82rem', color: '#46d06f' }}>Solución</strong>
                      <span style={{ fontSize: '0.7rem', color: '#8f8f8f', marginLeft: 'auto' }}>
                        {detalle.cliente_visible ? 'Visible para ti' : 'Restringida'}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#c9c9c9', lineHeight: 1.5 }}>{detalle.solucion_cliente}</p>
                  </div>
                )}

                {detalle.historial && detalle.historial.length > 0 && (
                  <div style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, marginBottom: 6 }}>
                    <h4 style={{ margin: '0 0 14px', fontSize: '0.9rem', color: '#e6e6e6', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <FaClockRotateLeft style={{ color: '#d4a54b' }} /> Historial
                    </h4>
                    <div className="ap-historial-list">
                      {detalle.historial.map((h, idx) => (
                        <div key={h.id_historial} style={{ display: 'flex', gap: 12, padding: '10px 12px', background: idx === 0 ? 'rgba(212, 165, 75, 0.06)' : 'transparent', borderLeft: `3px solid ${idx === 0 ? '#d4a54b' : 'rgba(255,255,255,0.08)'}`, borderRadius: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                              <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#e6e6e6' }}>{h.accion}</span>
                              <span style={{ fontSize: '0.75rem', color: '#8f8f8f' }}>por {h.usuario_nombre || 'Sistema'}</span>
                            </div>
                            {h.detalle && <p style={{ margin: 0, fontSize: '0.82rem', color: '#bdbdbd', lineHeight: 1.5 }}>{h.detalle}</p>}
                          </div>
                          <span style={{ fontSize: '0.75rem', color: '#8f8f8f', whiteSpace: 'nowrap', flexShrink: 0 }}>{formatFecha(h.fecha)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {evidenciaLupa && (
        <div onClick={() => setEvidenciaLupa(null)} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 20 }}>
          <button type="button" onClick={() => setEvidenciaLupa(null)} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: '1.2rem' }}>
            <FaXmark />
          </button>
          <img src={evidenciaLupa} alt="Evidencia completa" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 10, objectFit: 'contain' }} />
        </div>
      )}
    </motion.section>
  );
};

export default ClienteNovedades;
