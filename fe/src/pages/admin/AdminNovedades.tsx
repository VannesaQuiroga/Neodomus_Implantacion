import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaShieldHalved,
  FaEye,
  FaXmark,
  FaTicket,
  FaCheck,
  FaMagnifyingGlass,
  FaRotateLeft,
  FaUser,
  FaTruck,
  FaCalendarCheck,
  FaFileInvoice,
  FaLocationDot,
  FaCircleInfo,
  FaClockRotateLeft,
  FaTag,
  FaCamera,
  FaPaperPlane,
  FaUserGear,
  FaBoxOpen,
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

const ICONO_PRIORIDAD: Record<string, string> = {
  urgente: '#ef4444', alta: '#f59e0b', normal: '#3b82f6', baja: '#6b7280',
};

const formatFecha = (f?: string | null) => {
  if (!f) return '—';
  return new Date(f).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
};

const formatFechaCorta = (f?: string | null) => {
  if (!f) return '—';
  return new Date(f).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
};

const AdminNovedades = () => {
  const [novedades, setNovedades] = useState<Novedad[]>([]);
  const [tecnicos, setTecnicos] = useState<TecnicoSimple[]>([]);
  const [cargando, setCargando] = useState(true);
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null);

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroPrioridad, setFiltroPrioridad] = useState('');
  const [filtroTecnico, setFiltroTecnico] = useState('');
  const [filtroPedido, setFiltroPedido] = useState('');
  const [filtroRelacion, setFiltroRelacion] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroConEvidencia, setFiltroConEvidencia] = useState('');

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

  // Responder novedad
  const [respuestaAdmin, setRespuestaAdmin] = useState('');
  const [enviandoRespuesta, setEnviandoRespuesta] = useState(false);

  // Mensaje/solución al cliente
  const [mensajeCliente, setMensajeCliente] = useState('');
  const [solucionCliente, setSolucionCliente] = useState('');
  const [clienteVisible, setClienteVisible] = useState(false);
  const [enviandoMensaje, setEnviandoMensaje] = useState(false);

  // Cambiar técnico
  const [mostrarCambioTecnico, setMostrarCambioTecnico] = useState(false);
  const [nuevoTecnicoId, setNuevoTecnicoId] = useState('');
  const [motivoCambio, setMotivoCambio] = useState('');
  const [evidenciaLupa, setEvidenciaLupa] = useState<string | null>(null);
  const [enviandoCambio, setEnviandoCambio] = useState(false);

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

  const filtradas = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return novedades.filter((n) => {
      if (filtroEstado && n.estado_novedad !== filtroEstado) return false;
      if (filtroTipo && n.tipo_novedad !== filtroTipo) return false;
      if (filtroPrioridad && n.prioridad !== filtroPrioridad) return false;
      if (filtroTecnico && n.id_tecnico !== parseInt(filtroTecnico)) return false;
      if (filtroPedido) {
        const num = parseInt(filtroPedido);
        if (!n.id_pedido || n.id_pedido !== num) return false;
      }
      if (filtroRelacion === 'pedido' && !n.id_pedido) return false;
      if (filtroRelacion === 'cita' && !n.id_cita) return false;
      if (filtroRelacion === 'devolucion' && !n.id_devolucion) return false;
      if (filtroRelacion === 'pedido_cita' && (!n.id_pedido || !n.id_cita)) return false;
      if (filtroCliente && n.id_cliente !== parseInt(filtroCliente)) return false;
      if (filtroConEvidencia === 'si' && (!n.evidencias || n.evidencias.length === 0)) return false;
      if (filtroConEvidencia === 'no' && n.evidencias && n.evidencias.length > 0) return false;
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
  }, [novedades, busqueda, filtroEstado, filtroTipo, filtroPrioridad, filtroTecnico, filtroPedido, filtroRelacion, filtroCliente, filtroConEvidencia]);

  const hayFiltros = busqueda || filtroEstado || filtroTipo || filtroPrioridad || filtroTecnico || filtroPedido || filtroRelacion || filtroCliente || filtroConEvidencia;

  const limpiarFiltros = () => {
    setBusqueda('');
    setFiltroEstado('');
    setFiltroTipo('');
    setFiltroPrioridad('');
    setFiltroTecnico('');
    setFiltroPedido('');
    setFiltroRelacion('');
    setFiltroCliente('');
    setFiltroConEvidencia('');
  };

  const contarPorEstado = useMemo(() => {
    const counts: Record<string, number> = {};
    novedades.forEach((n) => {
      counts[n.estado_novedad] = (counts[n.estado_novedad] || 0) + 1;
    });
    return counts;
  }, [novedades]);

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

  const enviarRespuesta = async () => {
    if (!detalle || !respuestaAdmin.trim()) {
      setToast({ msg: 'Escribe una respuesta', tipo: 'err' });
      return;
    }
    setEnviandoRespuesta(true);
    try {
      await api.post(`/novedades/${detalle.id_novedad}/responder`, {
        respuesta: respuestaAdmin.trim(),
      });
      setToast({ msg: 'Respuesta enviada y técnico notificado', tipo: 'ok' });
      setRespuestaAdmin('');
      await cargar();
      await abrirDetalle(detalle.id_novedad);
    } catch (err: any) {
      setToast({ msg: err?.response?.data?.detail || 'Error al responder', tipo: 'err' });
    } finally {
      setEnviandoRespuesta(false);
    }
  };

  const enviarMensajeCliente = async () => {
    if (!detalle || !mensajeCliente.trim()) {
      setToast({ msg: 'Escribe un mensaje para el cliente', tipo: 'err' });
      return;
    }
    setEnviandoMensaje(true);
    try {
      await api.post(`/novedades/${detalle.id_novedad}/mensaje-cliente`, {
        mensaje_cliente: mensajeCliente.trim(),
        solucion_cliente: solucionCliente.trim() || undefined,
        cliente_visible: clienteVisible,
      });
      setToast({ msg: 'Mensaje y solución enviados al cliente', tipo: 'ok' });
      setMensajeCliente('');
      setSolucionCliente('');
      setClienteVisible(false);
      await abrirDetalle(detalle.id_novedad);
      await cargar();
    } catch (err: any) {
      setToast({ msg: err?.response?.data?.detail || 'Error al enviar mensaje', tipo: 'err' });
    } finally {
      setEnviandoMensaje(false);
    }
  };

  const cambiarTecnico = async () => {
    if (!detalle || !nuevoTecnicoId) {
      setToast({ msg: 'Selecciona un técnico', tipo: 'err' });
      return;
    }
    setEnviandoCambio(true);
    try {
      await api.put(`/novedades/${detalle.id_novedad}/cambiar-tecnico`, {
        id_nuevo_tecnico: parseInt(nuevoTecnicoId),
        motivo: motivoCambio.trim() || undefined,
      });
      setToast({ msg: 'Técnico cambiado y notificaciones enviadas', tipo: 'ok' });
      setMostrarCambioTecnico(false);
      setNuevoTecnicoId('');
      setMotivoCambio('');
      await cargar();
      await abrirDetalle(detalle.id_novedad);
    } catch (err: any) {
      setToast({ msg: err?.response?.data?.detail || 'Error al cambiar técnico', tipo: 'err' });
    } finally {
      setEnviandoCambio(false);
    }
  };

  return (
    <motion.section
      className="admin-panel"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="ap-header">
        <div>
          <h1 className="ap-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <FaShieldHalved style={{ color: '#d4a54b' }} />
            Historial de novedades
          </h1>
          <p className="ap-subtitle">
            Gestiona los reportes de los técnicos, responde y genera compensaciones
          </p>
        </div>
        <div className="ap-header-right">
          <span style={{ color: '#9f9f9f', fontSize: '0.85rem' }}>
            {filtradas.length} de {novedades.length} novedades
          </span>
        </div>
      </div>

      {/* ── Toast ──────────────────────────────────────────── */}
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

      {/* ── Resumen rápido por estado ─────────────────────── */}
      <div className="ap-pills" style={{ marginBottom: 20 }}>
        {ESTADOS.map((e) => (
          <button
            key={e}
            type="button"
            className={`ap-pill ${filtroEstado === e ? 'active' : ''}`}
            onClick={() => setFiltroEstado(filtroEstado === e ? '' : e)}
          >
            {e}
            <span className="ap-pill-count">{contarPorEstado[e] || 0}</span>
          </button>
        ))}
      </div>

      {/* ── Filtros ──────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <div className="ap-search ap-search-larga" style={{ maxWidth: 420 }}>
          <FaMagnifyingGlass />
          <input
            type="text"
            placeholder="Buscar por técnico, cliente, tipo, descripción..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        <select className="ap-filtro-estado" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        <select className="ap-filtro-estado" value={filtroPrioridad} onChange={(e) => setFiltroPrioridad(e.target.value)}>
          <option value="">Todas las prioridades</option>
          {PRIORIDADES.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
        </select>

        <select className="ap-filtro-estado" value={filtroTecnico} onChange={(e) => setFiltroTecnico(e.target.value)}>
          <option value="">Todos los técnicos</option>
          {tecnicos.map((t) => (
            <option key={t.id_tecnico} value={t.id_tecnico}>
              {[t.first_name, t.last_name].filter(Boolean).join(' ')}
            </option>
          ))}
        </select>

        <select className="ap-filtro-estado" value={filtroRelacion} onChange={(e) => setFiltroRelacion(e.target.value)}>
          <option value="">Todos los origenes</option>
          <option value="pedido">Solo Pedidos</option>
          <option value="cita">Solo Citas</option>
          <option value="pedido_cita">Pedido + Cita</option>
          <option value="devolucion">Solo Devoluciones</option>
        </select>

        <select className="ap-filtro-estado" value={filtroConEvidencia} onChange={(e) => setFiltroConEvidencia(e.target.value)}>
          <option value="">Todas las evidencias</option>
          <option value="si">Con evidencia</option>
          <option value="no">Sin evidencia</option>
        </select>

        <div className="ap-search" style={{ maxWidth: 160 }}>
          <FaUser style={{ position: 'absolute', left: 12, color: '#8f8f8f', fontSize: '0.8rem', pointerEvents: 'none' }} />
          <input
            type="number"
            placeholder="# Cliente"
            value={filtroCliente}
            onChange={(e) => setFiltroCliente(e.target.value)}
            style={{ paddingLeft: 34 }}
          />
        </div>

        <div className="ap-search" style={{ maxWidth: 160 }}>
          <FaFileInvoice style={{ position: 'absolute', left: 12, color: '#8f8f8f', fontSize: '0.8rem', pointerEvents: 'none' }} />
          <input
            type="number"
            placeholder="# Pedido"
            value={filtroPedido}
            onChange={(e) => setFiltroPedido(e.target.value)}
            style={{ paddingLeft: 34 }}
          />
        </div>

        {hayFiltros && (
          <button
            type="button"
            className="ap-btn ap-btn-ghost"
            style={{ fontSize: '0.8rem', padding: '8px 14px' }}
            onClick={limpiarFiltros}
          >
            <FaRotateLeft /> Limpiar
          </button>
        )}
      </div>

      {/* ── Tabla ────────────────────────────────────────── */}
      {cargando ? (
        <div className="ap-states">
          <div className="ap-loader" />
          <p>Cargando novedades...</p>
        </div>
      ) : filtradas.length === 0 ? (
        <div className="ap-states">
          <div className="ap-states-icon">
            <FaShieldHalved />
          </div>
          <h3>{hayFiltros ? 'Sin resultados' : 'Sin novedades aun'}</h3>
          <p>
            {hayFiltros
              ? 'No se encontraron novedades con los filtros seleccionados. Prueba ajustar la busqueda.'
              : 'Aun no se han reportado novedades por los tecnicos.'}
          </p>
          {hayFiltros && (
            <button type="button" className="ap-btn ap-btn-primary" onClick={limpiarFiltros}>
              <FaRotateLeft /> Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="ap-table-wrap">
          <table className="ap-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Tipo</th>
                <th>Tecnico</th>
                <th>Cliente</th>
                <th>Origen</th>
                <th>Prioridad</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th>Mensaje</th>
                <th>Solución</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((n) => (
                <tr key={n.id_novedad}>
                  <td style={{ fontWeight: 700, color: '#d4a54b' }}>{n.id_novedad}</td>
                  <td>
                    <span style={{ fontSize: '0.85rem' }}>{n.tipo_novedad}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="ap-initials" style={{ width: 30, height: 30, fontSize: '0.7rem' }}>
                        {n.tecnico_nombre ? n.tecnico_nombre.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?'}
                      </div>
                      <span style={{ fontSize: '0.85rem' }}>{n.tecnico_nombre || '—'}</span>
                    </div>
                  </td>
                  <td style={{ fontSize: '0.85rem' }}>{n.cliente_nombre || '—'}</td>
                  <td>
                    {n.id_pedido ? (
                      <span className="ap-badge info" style={{ fontSize: '0.7rem' }}>
                        <FaFileInvoice style={{ fontSize: '0.6rem' }} /> #{n.id_pedido}
                      </span>
                    ) : n.id_cita ? (
                      <span className="ap-badge proceso" style={{ fontSize: '0.7rem' }}>
                        <FaCalendarCheck style={{ fontSize: '0.6rem' }} /> Cita #{n.id_cita}
                      </span>
                    ) : n.id_devolucion ? (
                      <span className="ap-badge warn" style={{ fontSize: '0.7rem' }}>
                        <FaBoxOpen style={{ fontSize: '0.6rem' }} /> Dev #{n.id_devolucion}
                      </span>
                    ) : (
                      <span className="ap-badge neutral" style={{ fontSize: '0.7rem' }}>Sin origen</span>
                    )}
                  </td>
                  <td>
                    <span className={`ap-badge ${CLASE_PRIORIDAD[n.prioridad] || 'neutral'}`} style={{ fontSize: '0.7rem' }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
                        background: ICONO_PRIORIDAD[n.prioridad] || '#6b7280',
                      }} />
                      {n.prioridad}
                    </span>
                  </td>
                  <td>
                    <span className={`ap-badge ${CLASE_ESTADO[n.estado_novedad] || 'neutral'}`}>
                      {n.estado_novedad}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.82rem', color: '#9f9f9f', whiteSpace: 'nowrap' }}>
                    {formatFechaCorta(n.fecha_reporte)}
                  </td>
                  <td style={{ fontSize: '0.82rem', color: n.mensaje_cliente ? '#f5c542' : '#8f8f8f' }}>
                    {n.mensaje_cliente ? (
                      <span style={{ cursor: 'pointer' }} onClick={() => abrirDetalle(n.id_novedad)}>
                        <FaPaperPlane style={{ marginRight: 4 }} /> Enviado
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ fontSize: '0.82rem', color: n.solucion_cliente ? '#46d06f' : '#8f8f8f' }}>
                    {n.solucion_cliente ? (
                      <span style={{ cursor: 'pointer' }} onClick={() => abrirDetalle(n.id_novedad)}>
                        <FaCheck style={{ marginRight: 4 }} /> {n.cliente_visible ? 'Visible' : 'Oculta'}
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

      {/* ── Modal de detalle ────────────────────────────────── */}
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
              style={{ maxWidth: 680 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
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
                <button
                  type="button"
                  className="ap-modal-x"
                  onClick={() => { setDetalle(null); setMostrarCupon(false); }}
                >
                  <FaXmark />
                </button>
              </div>

              {/* Body */}
              <div className="ap-modal-body" style={{ padding: '18px 0 0' }}>
                {/* Info cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 18 }}>
                  <div className="ap-def">
                    <div className="ap-def-label"><FaTag style={{ marginRight: 4 }} />Tipo</div>
                    <div className="ap-def-value" style={{ fontSize: '0.85rem' }}>{detalle.tipo_novedad}</div>
                  </div>
                  <div className="ap-def">
                    <div className="ap-def-label">Prioridad</div>
                    <div className="ap-def-value">
                      <span className={`ap-badge ${CLASE_PRIORIDAD[detalle.prioridad] || 'neutral'}`} style={{ fontSize: '0.75rem' }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
                          background: ICONO_PRIORIDAD[detalle.prioridad] || '#6b7280',
                        }} />
                        {detalle.prioridad}
                      </span>
                    </div>
                  </div>
                  <div className="ap-def">
                    <div className="ap-def-label"><FaTruck style={{ marginRight: 4 }} />Tecnico</div>
                    <div className="ap-def-value" style={{ fontSize: '0.85rem' }}>{detalle.tecnico_nombre || '—'}</div>
                  </div>
                  <div className="ap-def">
                    <div className="ap-def-label"><FaUser style={{ marginRight: 4 }} />Cliente</div>
                    <div className="ap-def-value" style={{ fontSize: '0.85rem' }}>{detalle.cliente_nombre || '—'}</div>
                  </div>
                  {detalle.id_pedido && (
                    <div className="ap-def">
                      <div className="ap-def-label"><FaFileInvoice style={{ marginRight: 4 }} />Pedido</div>
                      <div className="ap-def-value" style={{ fontSize: '0.85rem', color: '#8ab4f8' }}>#{detalle.id_pedido}</div>
                    </div>
                  )}
                  {detalle.id_cita && (
                    <div className="ap-def">
                      <div className="ap-def-label"><FaCalendarCheck style={{ marginRight: 4 }} />Cita</div>
                      <div className="ap-def-value" style={{ fontSize: '0.85rem', color: '#c9a7ff' }}>#{detalle.id_cita}</div>
                    </div>
                  )}
                  {detalle.id_devolucion && (
                    <div className="ap-def">
                      <div className="ap-def-label"><FaBoxOpen style={{ marginRight: 4 }} />Devolución</div>
                      <div className="ap-def-value" style={{ fontSize: '0.85rem', color: '#f59e0b' }}>#{detalle.id_devolucion}</div>
                    </div>
                  )}
                </div>

                {detalle.lugar_ocurrencia && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', marginBottom: 14 }}>
                    <FaLocationDot style={{ color: '#d4a54b', fontSize: '0.9rem', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.85rem', color: '#c9c9c9' }}>{detalle.lugar_ocurrencia}</span>
                  </div>
                )}

                {/* Descripcion */}
                <div style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, marginBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <FaCircleInfo style={{ color: '#d4a54b', fontSize: '0.85rem' }} />
                    <strong style={{ fontSize: '0.85rem', color: '#e6e6e6' }}>Descripcion</strong>
                  </div>
                  <p style={{ margin: 0, color: '#bdbdbd', fontSize: '0.88rem', lineHeight: 1.65 }}>{detalle.descripcion_novedad}</p>
                </div>

                {/* Evidencias */}
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
                          {ev.fecha_subida && (
                            <div style={{ padding: '3px 6px', fontSize: '0.65rem', color: '#8f8f8f', textAlign: 'center', background: 'rgba(0,0,0,0.4)' }}>
                              {formatFechaCorta(ev.fecha_subida)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Accion admin previa */}
                {detalle.accion_admin && (
                  <div style={{ padding: '12px 14px', background: 'rgba(46, 160, 67, 0.08)', border: '1px solid rgba(46, 160, 67, 0.3)', borderRadius: 10, marginBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <FaCheck style={{ color: '#46d06f', fontSize: '0.8rem' }} />
                      <strong style={{ fontSize: '0.82rem', color: '#46d06f' }}>Accion del admin</strong>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#c9c9c9' }}>{detalle.accion_admin}</p>
                  </div>
                )}

                {/* Mensaje al cliente */}
                {detalle.mensaje_cliente && (
                  <div style={{ padding: '12px 14px', background: 'rgba(255, 200, 50, 0.08)', border: '1px solid rgba(255, 200, 50, 0.3)', borderRadius: 10, marginBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <FaPaperPlane style={{ color: '#f5c542', fontSize: '0.8rem' }} />
                      <strong style={{ fontSize: '0.82rem', color: '#f5c542' }}>Mensaje al cliente</strong>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#c9c9c9', lineHeight: 1.5 }}>{detalle.mensaje_cliente}</p>
                    {detalle.solucion_cliente && (
                      <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(46, 160, 67, 0.06)', borderRadius: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <FaCheck style={{ color: '#46d06f', fontSize: '0.75rem' }} />
                          <strong style={{ fontSize: '0.8rem', color: '#46d06f' }}>Solución</strong>
                          <span style={{ fontSize: '0.7rem', color: '#8f8f8f', marginLeft: 'auto' }}>
                            {detalle.cliente_visible ? 'Visible para cliente' : 'Oculto'}
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#c9c9c9', lineHeight: 1.5 }}>{detalle.solucion_cliente}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Cambiar estado */}
                <div style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, marginBottom: 18 }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#e6e6e6', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FaCheck style={{ color: '#d4a54b' }} /> Cambiar estado
                  </h4>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select
                      className="ap-filtro-estado"
                      value={nuevoEstado}
                      onChange={(e) => setNuevoEstado(e.target.value)}
                      style={{ minWidth: 160 }}
                    >
                      {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
                    </select>
                    <input
                      type="text"
                      className="ap-form-input"
                      placeholder="Comentario o accion (opcional)"
                      value={accionDetalle}
                      onChange={(e) => setAccionDetalle(e.target.value)}
                      style={{ flex: 1, minWidth: 200, height: 40 }}
                    />
                    <button
                      type="button"
                      className="ap-btn ap-btn-primary"
                      disabled={nuevoEstado === detalle.estado_novedad}
                      onClick={guardarEstado}
                      style={{ height: 40 }}
                    >
                      <FaCheck /> Guardar
                    </button>
                  </div>
                </div>

                {/* Responder novedad */}
                <div style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, marginBottom: 18 }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#e6e6e6', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FaPaperPlane style={{ color: '#d4a54b' }} /> Responder novedad
                  </h4>
                  <textarea
                    className="ap-form-textarea"
                    rows={2}
                    placeholder="Escribe una respuesta o instrucción para el técnico..."
                    value={respuestaAdmin}
                    onChange={(e) => setRespuestaAdmin(e.target.value)}
                    style={{ marginBottom: 10 }}
                  />
                  <button
                    type="button"
                    className="ap-btn ap-btn-primary"
                    disabled={enviandoRespuesta || !respuestaAdmin.trim()}
                    onClick={enviarRespuesta}
                    style={{ height: 36 }}
                  >
                    <FaPaperPlane /> {enviandoRespuesta ? 'Enviando...' : 'Enviar respuesta'}
                  </button>
                </div>

                {/* Enviar mensaje/solución al cliente */}
                <div style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, marginBottom: 18 }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#e6e6e6', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FaPaperPlane style={{ color: '#f5c542' }} /> Enviar solución al cliente
                  </h4>
                  <textarea
                    className="ap-form-textarea"
                    rows={2}
                    placeholder="Mensaje para el cliente (obligatorio)"
                    value={mensajeCliente}
                    onChange={(e) => setMensajeCliente(e.target.value)}
                    style={{ marginBottom: 8 }}
                  />
                  <textarea
                    className="ap-form-textarea"
                    rows={2}
                    placeholder="Solución detallada (opcional)"
                    value={solucionCliente}
                    onChange={(e) => setSolucionCliente(e.target.value)}
                    style={{ marginBottom: 10 }}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: '0.85rem', color: '#bdbdbd', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={clienteVisible}
                      onChange={(e) => setClienteVisible(e.target.checked)}
                    />
                    Hacer visible para el cliente
                  </label>
                  <button
                    type="button"
                    className="ap-btn"
                    style={{ background: '#f5c542', color: '#000', fontWeight: 600, height: 36 }}
                    disabled={enviandoMensaje || !mensajeCliente.trim()}
                    onClick={enviarMensajeCliente}
                  >
                    <FaPaperPlane /> {enviandoMensaje ? 'Enviando...' : 'Enviar al cliente'}
                  </button>
                </div>

                {/* Cambiar técnico */}
                {(detalle.id_pedido || detalle.id_cita) && (
                  <div style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, marginBottom: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#e6e6e6', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <FaUserGear style={{ color: '#d4a54b' }} /> Cambiar técnico
                      </h4>
                      <button
                        type="button"
                        className={`ap-btn ${mostrarCambioTecnico ? 'ap-btn-danger' : 'ap-btn-ghost'}`}
                        style={{ fontSize: '0.8rem', padding: '7px 14px' }}
                        onClick={() => setMostrarCambioTecnico(!mostrarCambioTecnico)}
                      >
                        <FaUserGear /> {mostrarCambioTecnico ? 'Cancelar' : 'Cambiar técnico'}
                      </button>
                    </div>
                    <AnimatePresence>
                      {mostrarCambioTecnico && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          style={{ overflow: 'hidden' }}
                        >
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginTop: 14 }}>
                            <select
                              className="ap-filtro-estado"
                              value={nuevoTecnicoId}
                              onChange={(e) => setNuevoTecnicoId(e.target.value)}
                              style={{ height: 40 }}
                            >
                              <option value="">Seleccionar técnico...</option>
                              {tecnicos.map((t) => (
                                <option key={t.id_tecnico} value={t.id_tecnico}>
                                  {[t.first_name, t.last_name].filter(Boolean).join(' ')}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              className="ap-form-input"
                              placeholder="Motivo del cambio (opcional)"
                              value={motivoCambio}
                              onChange={(e) => setMotivoCambio(e.target.value)}
                              style={{ height: 40 }}
                            />
                            <button
                              type="button"
                              className="ap-btn ap-btn-primary"
                              disabled={enviandoCambio || !nuevoTecnicoId}
                              onClick={cambiarTecnico}
                              style={{ height: 40 }}
                            >
                              <FaUserGear /> {enviandoCambio ? 'Cambiando...' : 'Confirmar cambio'}
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* Generar cupon */}
                {detalle.id_cliente && (
                  <div style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, marginBottom: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#e6e6e6', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <FaTicket style={{ color: '#d4a54b' }} /> Compensacion al cliente
                      </h4>
                      <button
                        type="button"
                        className={`ap-btn ${mostrarCupon ? 'ap-btn-danger' : 'ap-btn-ghost'}`}
                        style={{ fontSize: '0.8rem', padding: '7px 14px' }}
                        onClick={() => setMostrarCupon(!mostrarCupon)}
                      >
                        <FaTicket /> {mostrarCupon ? 'Cancelar' : 'Generar cupon'}
                      </button>
                    </div>
                    <AnimatePresence>
                      {mostrarCupon && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          style={{ overflow: 'hidden' }}
                        >
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginTop: 14 }}>
                            <input
                              type="text"
                              className="ap-form-input"
                              placeholder="Codigo (ej: DEMORA123)"
                              value={cuponCodigo}
                              onChange={(e) => setCuponCodigo(e.target.value.toUpperCase())}
                              style={{ height: 40 }}
                            />
                            <select className="ap-filtro-estado" value={cuponTipo} onChange={(e) => setCuponTipo(e.target.value)} style={{ height: 40 }}>
                              <option value="porcentaje">Porcentaje (%)</option>
                              <option value="fijo">Valor fijo (COP)</option>
                            </select>
                            <input
                              type="number"
                              className="ap-form-input"
                              placeholder="Valor"
                              value={cuponValor}
                              onChange={(e) => setCuponValor(e.target.value)}
                              style={{ height: 40 }}
                            />
                            <input
                              type="date"
                              className="ap-form-input"
                              value={cuponVence}
                              onChange={(e) => setCuponVence(e.target.value)}
                              style={{ height: 40 }}
                            />
                            <input
                              type="number"
                              className="ap-form-input"
                              placeholder="Usos maximos"
                              value={cuponUsos}
                              onChange={(e) => setCuponUsos(e.target.value)}
                              min={1}
                              style={{ height: 40 }}
                            />
                            <button type="button" className="ap-btn ap-btn-primary" onClick={generarCupon} style={{ height: 40 }}>
                              <FaTicket /> Crear cupon
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* Historial */}
                {detalle.historial && detalle.historial.length > 0 && (
                  <div style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, marginBottom: 6 }}>
                    <h4 style={{ margin: '0 0 14px', fontSize: '0.9rem', color: '#e6e6e6', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <FaClockRotateLeft style={{ color: '#d4a54b' }} /> Historial
                    </h4>
                    <div className="ap-historial-list">
                      {detalle.historial.map((h, idx) => (
                        <div
                          key={h.id_historial}
                          style={{
                            display: 'flex', gap: 12, padding: '10px 12px',
                            background: idx === 0 ? 'rgba(212, 165, 75, 0.06)' : 'transparent',
                            borderLeft: `3px solid ${idx === 0 ? '#d4a54b' : 'rgba(255,255,255,0.08)'}`,
                            borderRadius: 8,
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                              <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#e6e6e6' }}>{h.accion}</span>
                              <span style={{ fontSize: '0.75rem', color: '#8f8f8f' }}>por {h.usuario_nombre || 'Sistema'}</span>
                            </div>
                            {h.detalle && (
                              <p style={{ margin: 0, fontSize: '0.82rem', color: '#bdbdbd', lineHeight: 1.5 }}>{h.detalle}</p>
                            )}
                          </div>
                          <span style={{ fontSize: '0.75rem', color: '#8f8f8f', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {formatFecha(h.fecha)}
                          </span>
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

      {/* Lightbox de evidencia */}
      {evidenciaLupa && (
        <div
          onClick={() => setEvidenciaLupa(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.85)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', padding: 20,
          }}
        >
          <button
            type="button"
            onClick={() => setEvidenciaLupa(null)}
            style={{
              position: 'absolute', top: 16, right: 16,
              background: 'rgba(255,255,255,0.15)', border: 'none',
              borderRadius: '50%', width: 40, height: 40,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#fff', fontSize: '1.2rem',
            }}
          >
            <FaXmark />
          </button>
          <img
            src={evidenciaLupa}
            alt="Evidencia completa"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 10, objectFit: 'contain' }}
          />
        </div>
      )}
    </motion.section>
  );
};

export default AdminNovedades;
