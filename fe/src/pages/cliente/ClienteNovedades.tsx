import LocalizedNotificationText from '@components/common/LocalizedNotificationText';
// Pantalla ClienteNovedades de Neodomus. Reúne el estado y las acciones de su vista.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
  FaTicket,
} from 'react-icons/fa6';
import '@styles/admin-panel.css';
import '@styles/dashboard-admin.css';
import api from '@services/api';
import AuthImage from '@components/common/AuthImage';

interface EvidenciaNovedad {
  id_evidencia_n: number;
  url: string;
  descripcion: string | null;
  fecha_subida: string | null;
}

interface Novedad {
  id_novedad: number;
  tipo_novedad: string;
  tipo_novedad_label?: string;
  descripcion_novedad: string;
  prioridad: string;
  prioridad_label?: string;
  estado_novedad: string;
  estado_novedad_label?: string;
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
  cupon?: CuponCliente | null;
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

interface CuponCliente {
  id_cupon: number;
  codigo: string;
  tipo_descuento: string;
  valor_descuento: number;
  fecha_vencimiento: string | null;
  compra_minima: number;
  usos_maximos: number;
  usos_realizados: number;
  activo?: boolean;
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

// Comunica con el backend mediante GET '/novedades/cliente/novedades', GET `/novedades/${id}`.
const ClienteNovedades = () => {
  const [novedades, setNovedades] = useState<Novedad[]>([]);
  const [cargando, setCargando] = useState(true);
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null);
  const [detalle, setDetalle] = useState<NovedadDetalle | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [cupones, setCupones] = useState<CuponCliente[]>([]);

  // Comunica con el backend mediante GET '/novedades/cliente/novedades'.
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
    void cargar();
    const cargarCupones = () => api.get<CuponCliente[]>('/novedades/cliente/mis-cupones')
      .then((res) => setCupones(res.data || []))
      .catch(() => setCupones([]));
    void cargarCupones();
    const actualizar = () => {
      void cargar(true);
      void cargarCupones();
    };
    const i = window.setInterval(actualizar, 30000);
    window.addEventListener('focus', actualizar);
    return () => {
      window.clearInterval(i);
      window.removeEventListener('focus', actualizar);
    };
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

  // Comunica con el backend mediante GET `/novedades/${id}`.
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
            <LocalizedNotificationText message={toast.msg} />
          </motion.div>
        )}
      </AnimatePresence>

      <section
        aria-labelledby="mis-cupones-titulo"
        style={{
          marginBottom: 22,
          padding: 20,
          borderRadius: 16,
          border: '1px solid rgba(212,165,75,.3)',
          background: 'linear-gradient(135deg, rgba(212,165,75,.11), rgba(20,20,20,.72))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 id="mis-cupones-titulo" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
              <FaTicket style={{ color: '#d4a54b' }} /> Mis cupones disponibles
            </h2>
            <p style={{ margin: '6px 0 0', color: '#aaa', fontSize: 13 }}>
              Los cupones que recibes por tus novedades aparecen aquí y puedes usarlos al pagar.
            </p>
          </div>
          {cupones.length > 0 && <Link to="/checkout" className="ap-btn ap-btn-primary">Usar en mi compra</Link>}
        </div>
        {cupones.length === 0 ? (
          <p style={{ margin: '14px 0 0', color: '#999', fontSize: 13 }}>Todavía no tienes cupones disponibles.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 16 }}>
            {cupones.map((cupon) => (
              <article key={cupon.id_cupon} style={{ padding: 14, borderRadius: 12, background: 'rgba(0,0,0,.3)', border: '1px dashed rgba(212,165,75,.5)' }}>
                <strong style={{ display: 'block', color: '#f1d27b', fontSize: 16, letterSpacing: '.06em' }}>{cupon.codigo}</strong>
                <span style={{ display: 'block', color: '#fff', marginTop: 5, fontWeight: 700 }}>
                  {cupon.tipo_descuento === 'porcentaje' ? `${cupon.valor_descuento}% de descuento` : `${Number(cupon.valor_descuento).toLocaleString('es-CO')} COP de descuento`}
                </span>
                <span style={{ display: 'block', color: '#aaa', fontSize: 12, marginTop: 5 }}>
                  {cupon.fecha_vencimiento ? `Vence el ${formatFechaCorta(cupon.fecha_vencimiento)}` : 'Sin fecha de vencimiento'}
                  {' · '}{Math.max(0, cupon.usos_maximos - cupon.usos_realizados)} uso(s) disponible(s)
                </span>
              </article>
            ))}
          </div>
        )}
      </section>

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
                  <td style={{ fontSize: '0.85rem' }}>{n.tipo_novedad_label || n.tipo_novedad}</td>
                  <td style={{ fontSize: '0.85rem' }}>{n.tecnico_nombre || '—'}</td>
                  <td>
                    <span className={`ap-badge ${CLASE_ESTADO[n.estado_novedad] || 'neutral'}`}>
                      {n.estado_novedad_label || n.estado_novedad}
                    </span>
                  </td>
                  <td>
                    <span className={`ap-badge ${CLASE_PRIORIDAD[n.prioridad] || 'neutral'}`} style={{ fontSize: '0.7rem' }}>
                      {n.prioridad_label || n.prioridad}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.82rem', color: '#9f9f9f' }}>{formatFechaCorta(n.fecha_reporte)}</td>
                  <td style={{ fontSize: '0.82rem', color: n.mensaje_cliente ? '#f5c542' : '#8f8f8f' }}>
                    {n.mensaje_cliente ? (
                      <span role="button" tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') (e.currentTarget as HTMLElement).click(); }}  style={{ cursor: 'pointer' }} onClick={() => abrirDetalle(n.id_novedad)}>
                        <FaPaperPlane style={{ marginRight: 4 }} /> Mensaje recibido
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ fontSize: '0.82rem', color: n.solucion_cliente ? '#46d06f' : '#8f8f8f' }}>
                    {n.solucion_cliente ? (
                      <span role="button" tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') (e.currentTarget as HTMLElement).click(); }}  style={{ cursor: 'pointer' }} onClick={() => abrirDetalle(n.id_novedad)}>
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
                      {detalle.estado_novedad_label || detalle.estado_novedad}
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
                    <div className="ap-def-value" style={{ fontSize: '0.85rem' }}>{detalle.tipo_novedad_label || detalle.tipo_novedad}</div>
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
                          style={{ display: 'block', width: 90, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                          <AuthImage src={ev.url} alt="Evidencia" style={{ width: '100%', height: 90, objectFit: 'cover' }} />
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

                {detalle.cupon && (
                  <div style={{ padding: '12px 14px', background: 'rgba(212,165,75,.1)', border: '1px dashed rgba(212,165,75,.55)', borderRadius: 10, marginBottom: 18 }}>
                    <strong style={{ color: '#f1d27b' }}>Cupón de compensación: {detalle.cupon.codigo}</strong>
                    <p style={{ margin: '5px 0', color: '#fff' }}>
                      {detalle.cupon.tipo_descuento === 'porcentaje'
                        ? `${detalle.cupon.valor_descuento}% de descuento`
                        : `${Number(detalle.cupon.valor_descuento).toLocaleString('es-CO')} COP de descuento`}
                    </p>
                    <small style={{ color: '#fff' }}>
                      {detalle.cupon.activo && detalle.cupon.usos_realizados < detalle.cupon.usos_maximos
                        ? 'Disponible para usar al pagar'
                        : 'Este cupón ya no está disponible'}
                    </small>
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
    </motion.section>
  );
};

export default ClienteNovedades;
