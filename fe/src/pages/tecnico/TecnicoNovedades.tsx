import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaTriangleExclamation,
  FaXmark,
  FaPlus,
  FaEye,
  FaShieldHalved,
} from 'react-icons/fa6';
import '@styles/admin-panel.css';
import '@styles/dashboard-admin.css';
import api from '@services/api';

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
  cliente_nombre: string | null;
  tecnico_nombre: string | null;
  accion_admin: string | null;
  fecha_resolucion: string | null;
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

const TIPOS_NOVEDAD = [
  'Retraso en entrega',
  'Cliente ausente',
  'Cliente no recibió el pedido',
  'Dirección incorrecta',
  'Producto dañado',
  'Producto faltante',
  'Producto equivocado',
  'Pérdida de producto',
  'Robo de productos',
  'Accidente',
  'Problema con el vehículo/transporte',
  'Problema técnico',
  'Problema durante una cita',
  'Cita no realizada',
  'Cita reprogramada',
  'Cliente solicita reprogramación',
  'Problema con instalación',
  'Retraso que afecta cita',
  'Otro',
];

const PRIORIDADES = [
  { valor: 'baja', label: 'Baja', color: '#6b7280' },
  { valor: 'normal', label: 'Normal', color: '#3b82f6' },
  { valor: 'alta', label: 'Alta', color: '#f59e0b' },
  { valor: 'urgente', label: 'Urgente', color: '#ef4444' },
];

const CLASE_ESTADO: Record<string, string> = {
  Pendiente: 'warn',
  'En revisión': 'info',
  Aprobada: 'ok',
  Rechazada: 'err',
  Resuelta: 'ok',
  Cerrada: 'neutral',
};

const CLASE_PRIORIDAD: Record<string, string> = {
  baja: 'neutral',
  normal: 'info',
  alta: 'warn',
  urgente: 'err',
};

const formatFecha = (f?: string | null) => {
  if (!f) return '—';
  return new Date(f).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
};

const TecnicoNovedades = () => {
  const [novedades, setNovedades] = useState<Novedad[]>([]);
  const [cargando, setCargando] = useState(true);
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [detalle, setDetalle] = useState<NovedadDetalle | null>(null);
  const [vista, setVista] = useState<'lista' | 'historial'>('lista');

  // Formulario
  const [tipoSeleccion, setTipoSeleccion] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [prioridad, setPrioridad] = useState('normal');
  const [idPedido, setIdPedido] = useState('');
  const [idCita, setIdCita] = useState('');
  const [lugar, setLugar] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cargar = async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    try {
      const res = await api.get<Novedad[]>('/novedades/mis-novedades');
      setNovedades(res.data);
    } catch {
      if (!silencioso) setToast({ msg: 'Error al cargar novedades', tipo: 'err' });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
    const intervalo = window.setInterval(() => cargar(true), 30000);
    return () => window.clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const abrirDetalle = async (id: number) => {
    try {
      const res = await api.get<NovedadDetalle>(`/novedades/${id}`);
      setDetalle(res.data);
    } catch {
      setToast({ msg: 'Error al cargar detalle', tipo: 'err' });
    }
  };

  const enviarNovedad = async () => {
    if (!tipoSeleccion || !descripcion.trim()) {
      setToast({ msg: 'Completa el tipo y la descripción', tipo: 'err' });
      return;
    }
    setEnviando(true);
    try {
      await api.post('/novedades', {
        tipo_novedad: tipoSeleccion,
        descripcion: descripcion.trim(),
        prioridad,
        id_pedido: idPedido ? parseInt(idPedido) : undefined,
        id_cita: idCita ? parseInt(idCita) : undefined,
        lugar_ocurrencia: lugar.trim() || undefined,
      });
      setToast({ msg: 'Novedad reportada correctamente', tipo: 'ok' });
      setMostrarForm(false);
      resetForm();
      await cargar();
    } catch (err: any) {
      setToast({ msg: err?.response?.data?.detail || 'Error al crear novedad', tipo: 'err' });
    } finally {
      setEnviando(false);
    }
  };

  const resetForm = () => {
    setTipoSeleccion('');
    setDescripcion('');
    setPrioridad('normal');
    setIdPedido('');
    setIdCita('');
    setLugar('');
  };

  return (
    <motion.section
      className="admin-panel"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="ap-card">
        <div className="ap-card-head">
          <h3><FaShieldHalved /> Novedades e incidencias</h3>
          <p>Reporta situaciones ocurridas durante entregas, citas o transporte</p>
        </div>

        {toast && (
          <p style={{ color: toast.tipo === 'ok' ? '#3d7a3d' : '#a33', fontWeight: 600 }}>
            {toast.msg}
          </p>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            className="ap-btn ap-btn-primary"
            onClick={() => { setMostrarForm(true); resetForm(); }}
          >
            <FaPlus style={{ marginRight: 4 }} /> Nueva novedad
          </button>
          <button
            type="button"
            className={`ap-btn ${vista === 'lista' ? 'ap-btn-primary' : ''}`}
            onClick={() => setVista('lista')}
          >
            Mis novedades
          </button>
          <button
            type="button"
            className={`ap-btn ${vista === 'historial' ? 'ap-btn-primary' : ''}`}
            onClick={() => setVista('historial')}
          >
            Historial
          </button>
        </div>

        {/* ── Formulario nueva novedad ──────────────────────── */}
        <AnimatePresence>
          {mostrarForm && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              style={{ overflow: 'hidden', marginBottom: 16 }}
            >
              <div className="ap-card" style={{ background: '#1a1a2e', border: '1px solid #333' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h4 style={{ margin: 0 }}>Nueva novedad</h4>
                  <button type="button" className="ap-btn" onClick={() => setMostrarForm(false)}>
                    <FaXmark />
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
                  <div className="ap-form-group">
                    <label className="ap-form-label">Tipo de novedad *</label>
                    <select
                      className="ap-form-select"
                      value={tipoSeleccion}
                      onChange={(e) => setTipoSeleccion(e.target.value)}
                    >
                      <option value="">Seleccionar tipo...</option>
                      {TIPOS_NOVEDAD.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <div className="ap-form-group">
                    <label className="ap-form-label">Prioridad</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {PRIORIDADES.map((p) => (
                        <button
                          key={p.valor}
                          type="button"
                          className="ap-btn"
                          style={{
                            background: prioridad === p.valor ? p.color : 'transparent',
                            color: prioridad === p.valor ? '#fff' : p.color,
                            border: `1px solid ${p.color}`,
                            fontSize: '0.8rem',
                            padding: '4px 10px',
                          }}
                          onClick={() => setPrioridad(p.valor)}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="ap-form-group">
                    <label className="ap-form-label">Pedido relacionado (opcional)</label>
                    <input
                      type="number"
                      className="ap-form-input"
                      placeholder="ID del pedido"
                      value={idPedido}
                      onChange={(e) => setIdPedido(e.target.value)}
                    />
                  </div>

                  <div className="ap-form-group">
                    <label className="ap-form-label">Cita relacionada (opcional)</label>
                    <input
                      type="number"
                      className="ap-form-input"
                      placeholder="ID de la cita"
                      value={idCita}
                      onChange={(e) => setIdCita(e.target.value)}
                    />
                  </div>

                  <div className="ap-form-group">
                    <label className="ap-form-label">Lugar de ocurrencia (opcional)</label>
                    <input
                      type="text"
                      className="ap-form-input"
                      placeholder="Ej: Av. Principal #123"
                      value={lugar}
                      onChange={(e) => setLugar(e.target.value)}
                    />
                  </div>
                </div>

                <div className="ap-form-group">
                  <label className="ap-form-label">Descripción *</label>
                  <textarea
                    className="ap-form-input"
                    rows={3}
                    placeholder="Describe la situación detalladamente..."
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    style={{ resize: 'vertical' }}
                  />
                </div>

                {tipoSeleccion === 'Robo de productos' && (
                  <div style={{
                    padding: '8px 12px',
                    background: '#2a1a1a',
                    border: '1px solid #ef4444',
                    borderRadius: 6,
                    fontSize: '0.85rem',
                    color: '#fca5a5',
                    marginBottom: 12,
                  }}>
                    <FaTriangleExclamation style={{ marginRight: 6 }} />
                    Incluye en la descripción: pedido afectado, productos, cantidades, fecha/hora aproximada, lugar y descripción detallada.
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="ap-btn ap-btn-primary"
                    disabled={enviando || !tipoSeleccion || !descripcion.trim()}
                    onClick={enviarNovedad}
                  >
                    {enviando ? 'Enviando...' : 'Enviar reporte'}
                  </button>
                  <button type="button" className="ap-btn" onClick={() => setMostrarForm(false)}>
                    Cancelar
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Lista de novedades ────────────────────────────── */}
        {cargando ? (
          <p style={{ color: '#9a8f78' }}>Cargando novedades...</p>
        ) : novedades.length === 0 ? (
          <p style={{ color: '#9a8f78' }}>No has reportado novedades aún</p>
        ) : (
          <div className="ap-table-wrap">
            <table className="ap-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Tipo</th>
                  <th>Prioridad</th>
                  <th>Estado</th>
                  <th>Pedido</th>
                  <th>Fecha</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {novedades.map((n) => (
                  <tr key={n.id_novedad}>
                    <td style={{ fontWeight: 600 }}>{n.id_novedad}</td>
                    <td>{n.tipo_novedad}</td>
                    <td>
                      <span className={`ap-badge ${CLASE_PRIORIDAD[n.prioridad] || 'neutral'}`}>
                        {n.prioridad}
                      </span>
                    </td>
                    <td>
                      <span className={`ap-badge ${CLASE_ESTADO[n.estado_novedad] || 'neutral'}`}>
                        {n.estado_novedad}
                      </span>
                    </td>
                    <td>{n.id_pedido ? `#${n.id_pedido}` : '—'}</td>
                    <td style={{ fontSize: '0.85rem' }}>{formatFecha(n.fecha_reporte)}</td>
                    <td>
                      <button
                        type="button"
                        className="ap-btn"
                        style={{ fontSize: '0.8rem', padding: '3px 8px' }}
                        onClick={() => abrirDetalle(n.id_novedad)}
                      >
                        <FaEye style={{ marginRight: 3 }} /> Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal de detalle ────────────────────────────────── */}
      <AnimatePresence>
        {detalle && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', zIndex: 1000, padding: 16,
            }}
            onClick={() => setDetalle(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              style={{
                background: '#1a1a2e', borderRadius: 12, padding: 24,
                maxWidth: 600, width: '100%', maxHeight: '80vh', overflow: 'auto',
                border: '1px solid #333',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ margin: 0 }}>Novedad #{detalle.id_novedad}</h3>
                <button type="button" className="ap-btn" onClick={() => setDetalle(null)}>
                  <FaXmark />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <strong>Tipo:</strong> {detalle.tipo_novedad}
                </div>
                <div>
                  <strong>Estado:</strong>{' '}
                  <span className={`ap-badge ${CLASE_ESTADO[detalle.estado_novedad] || 'neutral'}`}>
                    {detalle.estado_novedad}
                  </span>
                </div>
                <div>
                  <strong>Prioridad:</strong>{' '}
                  <span className={`ap-badge ${CLASE_PRIORIDAD[detalle.prioridad] || 'neutral'}`}>
                    {detalle.prioridad}
                  </span>
                </div>
                <div>
                  <strong>Pedido:</strong> {detalle.id_pedido ? `#${detalle.id_pedido}` : '—'}
                </div>
                <div>
                  <strong>Cita:</strong> {detalle.id_cita ? `#${detalle.id_cita}` : '—'}
                </div>
                <div>
                  <strong>Fecha:</strong> {formatFecha(detalle.fecha_reporte)}
                </div>
                {detalle.lugar_ocurrencia && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <strong>Lugar:</strong> {detalle.lugar_ocurrencia}
                  </div>
                )}
                <div style={{ gridColumn: '1 / -1' }}>
                  <strong>Descripción:</strong>
                  <p style={{ marginTop: 4, color: '#ccc' }}>{detalle.descripcion_novedad}</p>
                </div>
                {detalle.accion_admin && (
                  <div style={{ gridColumn: '1 / -1', padding: '8px 12px', background: '#1a2e1a', borderRadius: 6, border: '1px solid #3d7a3d' }}>
                    <strong>Acción del admin:</strong>
                    <p style={{ marginTop: 4 }}>{detalle.accion_admin}</p>
                  </div>
                )}
              </div>

              {/* Historial */}
              {detalle.historial && detalle.historial.length > 0 && (
                <div>
                  <h4 style={{ marginBottom: 8 }}>Historial</h4>
                  <div style={{ borderLeft: '2px solid #444', paddingLeft: 12 }}>
                    {detalle.historial.map((h) => (
                      <div key={h.id_historial} style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: '0.8rem', color: '#9a8f78' }}>
                          {formatFecha(h.fecha)} — {h.usuario_nombre || 'Sistema'}
                        </div>
                        <div style={{ fontWeight: 600 }}>{h.accion}</div>
                        {h.detalle && <div style={{ fontSize: '0.85rem', color: '#ccc' }}>{h.detalle}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
};

export default TecnicoNovedades;
