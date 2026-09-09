import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaShieldHalved,
  FaEye,
  FaXmark,
  FaTicket,
  FaCheck,
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
  id_tecnico: number | null;
  tecnico_nombre: string | null;
  cliente_nombre: string | null;
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

interface TecnicoSimple {
  id_tecnico: number;
  first_name: string;
  last_name: string;
}

const TIPOS = [
  'Retraso en entrega', 'Cliente ausente', 'Cliente no recibió el pedido',
  'Dirección incorrecta', 'Producto dañado', 'Producto faltante',
  'Producto equivocado', 'Pérdida de producto', 'Robo de productos',
  'Accidente', 'Problema con el vehículo/transporte', 'Problema técnico',
  'Problema durante una cita', 'Cita no realizada', 'Cita reprogramada',
  'Cliente solicita reprogramación', 'Problema con instalación',
  'Retraso que afecta cita', 'Otro',
];

const ESTADOS = ['Pendiente', 'En revisión', 'Aprobada', 'Rechazada', 'Resuelta', 'Cerrada'];
const PRIORIDADES = ['baja', 'normal', 'alta', 'urgente'];

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

const AdminNovedades = () => {
  const [novedades, setNovedades] = useState<Novedad[]>([]);
  const [tecnicos, setTecnicos] = useState<TecnicoSimple[]>([]);
  const [cargando, setCargando] = useState(true);
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null);

  // Filtros
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroPrioridad, setFiltroPrioridad] = useState('');
  const [filtroTecnico, setFiltroTecnico] = useState('');
  const [filtroPedido, setFiltroPedido] = useState('');

  // Detalle
  const [detalle, setDetalle] = useState<NovedadDetalle | null>(null);
  const [nuevoEstado, setNuevoEstado] = useState('');
  const [accionDetalle, setAccionDetalle] = useState('');

  // Cupón
  const [mostrarCupon, setMostrarCupon] = useState(false);
  const [cuponCodigo, setCuponCodigo] = useState('');
  const [cuponTipo, setCuponTipo] = useState('porcentaje');
  const [cuponValor, setCuponValor] = useState('');
  const [cuponVence, setCuponVence] = useState('');
  const [cuponUsos, setCuponUsos] = useState('1');

  const cargar = async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    try {
      const [novRes, tecRes] = await Promise.all([
        api.get<Novedad[]>('/novedades'),
        api.get<TecnicoSimple[]>('/tecnicos'),
      ]);
      setNovedades(novRes.data);
      setTecnicos(tecRes.data);
    } catch {
      if (!silencioso) setToast({ msg: 'Error al cargar novedades', tipo: 'err' });
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
    if (filtroTipo && n.tipo_novedad !== filtroTipo) return false;
    if (filtroPrioridad && n.prioridad !== filtroPrioridad) return false;
    if (filtroTecnico && n.id_tecnico !== parseInt(filtroTecnico)) return false;
    if (filtroPedido && n.id_pedido !== parseInt(filtroPedido)) return false;
    return true;
  });

  const abrirDetalle = async (id: number) => {
    try {
      const res = await api.get<NovedadDetalle>(`/novedades/${id}`);
      setDetalle(res.data);
      setNuevoEstado(res.data.estado_novedad);
      setAccionDetalle('');
    } catch {
      setToast({ msg: 'Error al cargar detalle', tipo: 'err' });
    }
  };

  const guardarEstado = async () => {
    if (!detalle || nuevoEstado === detalle.estado_novedad) return;
    try {
      await api.put(`/novedades/${detalle.id_novedad}/estado`, {
        nuevo_estado: nuevoEstado,
        accion_detalle: accionDetalle || undefined,
      });
      setToast({ msg: 'Estado actualizado', tipo: 'ok' });
      setDetalle(null);
      await cargar();
    } catch (err: any) {
      setToast({ msg: err?.response?.data?.detail || 'Error', tipo: 'err' });
    }
  };

  const generarCupon = async () => {
    if (!detalle || !cuponCodigo || !cuponValor) {
      setToast({ msg: 'Completa código y valor del cupón', tipo: 'err' });
      return;
    }
    try {
      await api.post(`/novedades/${detalle.id_novedad}/cupon`, {
        codigo: cuponCodigo,
        tipo_descuento: cuponTipo,
        valor_descuento: parseFloat(cuponValor),
        fecha_vencimiento: cuponVence || undefined,
        usos_maximos: parseInt(cuponUsos) || 1,
      });
      setToast({ msg: 'Cupón generado y cliente notificado', tipo: 'ok' });
      setMostrarCupon(false);
      setCuponCodigo('');
      setCuponValor('');
      setCuponVence('');
      await cargar();
    } catch (err: any) {
      setToast({ msg: err?.response?.data?.detail || 'Error al crear cupón', tipo: 'err' });
    }
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
          <p>Gestiona los reportes de los técnicos</p>
        </div>

        {toast && (
          <p style={{ color: toast.tipo === 'ok' ? '#3d7a3d' : '#a33', fontWeight: 600 }}>
            {toast.msg}
          </p>
        )}

        {/* ── Filtros ──────────────────────────────────────── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          <select className="ap-form-select" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={{ minWidth: 130 }}>
            <option value="">Todos los estados</option>
            {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <select className="ap-form-select" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} style={{ minWidth: 150 }}>
            <option value="">Todos los tipos</option>
            {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="ap-form-select" value={filtroPrioridad} onChange={(e) => setFiltroPrioridad(e.target.value)} style={{ minWidth: 120 }}>
            <option value="">Todas las prioridades</option>
            {PRIORIDADES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="ap-form-select" value={filtroTecnico} onChange={(e) => setFiltroTecnico(e.target.value)} style={{ minWidth: 150 }}>
            <option value="">Todos los técnicos</option>
            {tecnicos.map((t) => (
              <option key={t.id_tecnico} value={t.id_tecnico}>
                {[t.first_name, t.last_name].filter(Boolean).join(' ')}
              </option>
            ))}
          </select>
          <input
            type="number"
            className="ap-form-input"
            placeholder="Filtrar por pedido #"
            value={filtroPedido}
            onChange={(e) => setFiltroPedido(e.target.value)}
            style={{ maxWidth: 150 }}
          />
        </div>

        {/* ── Tabla ────────────────────────────────────────── */}
        {cargando ? (
          <p style={{ color: '#9a8f78' }}>Cargando novedades...</p>
        ) : filtradas.length === 0 ? (
          <p style={{ color: '#9a8f78' }}>No hay novedades con los filtros seleccionados</p>
        ) : (
          <div className="ap-table-wrap">
            <table className="ap-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Tipo</th>
                  <th>Técnico</th>
                  <th>Pedido</th>
                  <th>Prioridad</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((n) => (
                  <tr key={n.id_novedad}>
                    <td style={{ fontWeight: 600 }}>{n.id_novedad}</td>
                    <td>{n.tipo_novedad}</td>
                    <td>{n.tecnico_nombre || '—'}</td>
                    <td>{n.id_pedido ? `#${n.id_pedido}` : '—'}</td>
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
            onClick={() => { setDetalle(null); setMostrarCupon(false); }}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              style={{
                background: '#1a1a2e', borderRadius: 12, padding: 24,
                maxWidth: 700, width: '100%', maxHeight: '85vh', overflow: 'auto',
                border: '1px solid #333',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ margin: 0 }}>Novedad #{detalle.id_novedad}</h3>
                <button type="button" className="ap-btn" onClick={() => { setDetalle(null); setMostrarCupon(false); }}>
                  <FaXmark />
                </button>
              </div>

              {/* Info de la novedad */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div><strong>Tipo:</strong> {detalle.tipo_novedad}</div>
                <div><strong>Estado:</strong> <span className={`ap-badge ${CLASE_ESTADO[detalle.estado_novedad]}`}>{detalle.estado_novedad}</span></div>
                <div><strong>Prioridad:</strong> <span className={`ap-badge ${CLASE_PRIORIDAD[detalle.prioridad]}`}>{detalle.prioridad}</span></div>
                <div><strong>Técnico:</strong> {detalle.tecnico_nombre || '—'}</div>
                <div><strong>Pedido:</strong> {detalle.id_pedido ? `#${detalle.id_pedido}` : '—'}</div>
                <div><strong>Cita:</strong> {detalle.id_cita ? `#${detalle.id_cita}` : '—'}</div>
                <div><strong>Cliente:</strong> {detalle.cliente_nombre || '—'}</div>
                <div><strong>Fecha:</strong> {formatFecha(detalle.fecha_reporte)}</div>
                {detalle.lugar_ocurrencia && <div style={{ gridColumn: '1 / -1' }}><strong>Lugar:</strong> {detalle.lugar_ocurrencia}</div>}
                <div style={{ gridColumn: '1 / -1' }}>
                  <strong>Descripción:</strong>
                  <p style={{ marginTop: 4, color: '#ccc' }}>{detalle.descripcion_novedad}</p>
                </div>
              </div>

              {/* Cambiar estado */}
              <div style={{ padding: '12px', background: '#111', borderRadius: 8, marginBottom: 16 }}>
                <h4 style={{ marginTop: 0 }}>Cambiar estado</h4>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select
                    className="ap-form-select"
                    value={nuevoEstado}
                    onChange={(e) => setNuevoEstado(e.target.value)}
                    style={{ minWidth: 150 }}
                  >
                    {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>
                  <input
                    type="text"
                    className="ap-form-input"
                    placeholder="Acción o comentario (opcional)"
                    value={accionDetalle}
                    onChange={(e) => setAccionDetalle(e.target.value)}
                    style={{ flex: 1, minWidth: 200 }}
                  />
                  <button
                    type="button"
                    className="ap-btn ap-btn-primary"
                    disabled={nuevoEstado === detalle.estado_novedad}
                    onClick={guardarEstado}
                  >
                    <FaCheck style={{ marginRight: 4 }} /> Guardar
                  </button>
                </div>
              </div>

              {/* Generar cupón */}
              {detalle.id_cliente && (
                <div style={{ padding: '12px', background: '#111', borderRadius: 8, marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ marginTop: 0 }}>Compensación al cliente</h4>
                    <button
                      type="button"
                      className="ap-btn"
                      onClick={() => setMostrarCupon(!mostrarCupon)}
                    >
                      <FaTicket style={{ marginRight: 4 }} /> {mostrarCupon ? 'Cancelar' : 'Generar cupón'}
                    </button>
                  </div>
                  {mostrarCupon && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginTop: 12 }}>
                      <input
                        type="text"
                        className="ap-form-input"
                        placeholder="Código (ej: DEMORA123)"
                        value={cuponCodigo}
                        onChange={(e) => setCuponCodigo(e.target.value.toUpperCase())}
                      />
                      <select className="ap-form-select" value={cuponTipo} onChange={(e) => setCuponTipo(e.target.value)}>
                        <option value="porcentaje">Porcentaje (%)</option>
                        <option value="fijo">Valor fijo (COP)</option>
                      </select>
                      <input
                        type="number"
                        className="ap-form-input"
                        placeholder="Valor"
                        value={cuponValor}
                        onChange={(e) => setCuponValor(e.target.value)}
                      />
                      <input
                        type="date"
                        className="ap-form-input"
                        value={cuponVence}
                        onChange={(e) => setCuponVence(e.target.value)}
                      />
                      <input
                        type="number"
                        className="ap-form-input"
                        placeholder="Usos máximos"
                        value={cuponUsos}
                        onChange={(e) => setCuponUsos(e.target.value)}
                        min={1}
                      />
                      <button type="button" className="ap-btn ap-btn-primary" onClick={generarCupon}>
                        <FaTicket style={{ marginRight: 4 }} /> Crear cupón
                      </button>
                    </div>
                  )}
                </div>
              )}

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

export default AdminNovedades;
