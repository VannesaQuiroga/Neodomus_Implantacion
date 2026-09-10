import { useEffect, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaTriangleExclamation,
  FaXmark,
  FaPlus,
  FaEye,
  FaShieldHalved,
  FaMagnifyingGlass,
  FaRotateLeft,
  FaFileInvoice,
  FaCalendarCheck,
  FaCircleInfo,
  FaLocationDot,
  FaClockRotateLeft,
  FaTag,
  FaUser,
  FaCheck,
  FaPaperPlane,
  FaCamera,
  FaTrash,
  FaArrowRight,
  FaArrowLeft,
  FaChevronRight,
  FaBoxOpen,
} from 'react-icons/fa6';
import '@styles/admin-panel.css';
import '@styles/dashboard-admin.css';
import api from '@services/api';

// ── Interfaces ──────────────────────────────────────────────

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
  cliente_nombre: string | null;
  tecnico_nombre: string | null;
  accion_admin: string | null;
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

interface ClienteBusqueda {
  id_cliente: number;
  nombre: string;
  email: string | null;
  telefono: number | null;
  documento: number | null;
  direccion: string | null;
}

interface PedidoCliente {
  id_pedido: number;
  fecha_pedido: string | null;
  estado_pedido: string | null;
  total: number | null;
  fecha_entrega: string | null;
  hora_entrega: string | null;
  hora_entrega_fin: string | null;
  estado_entrega: string | null;
  nombre_tecnico: string | null;
  detalles: { producto: string | null; cantidad: number | null; precio: number | null }[];
}

interface CitaCliente {
  id_cita: number;
  fecha: string | null;
  hora: string;
  tipo_servicio: string;
  especialidad: string | null;
  estado: string;
  direccion: string;
  descripcion: string | null;
  costo: number | null;
  nombre_tecnico: string | null;
  id_tecnico: number | null;
}

interface EvidenciaNovedad {
  id_evidencia_n: number;
  url: string;
  descripcion: string | null;
  fecha_subida: string | null;
}

// ── Constants ───────────────────────────────────────────────

const TIPOS_NOVEDAD = [
  'Retraso en entrega',
  'Cliente ausente',
  'Cliente no recibio el pedido',
  'Direccion incorrecta',
  'Producto danado',
  'Producto faltante',
  'Producto equivocado',
  'Perdida de producto',
  'Robo de productos',
  'Accidente',
  'Problema con el vehiculo/transporte',
  'Problema tecnico',
  'Problema durante una cita',
  'Cita no realizada',
  'Cita reprogramada',
  'Cliente solicita reprogramacion',
  'Problema con instalacion',
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
  'En revision': 'info',
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

type PasoFormulario = 'cliente' | 'origen' | 'detalle' | 'evidencia';

// ── Component ───────────────────────────────────────────────

const TecnicoNovedades = () => {
  const [novedades, setNovedades] = useState<Novedad[]>([]);
  const [cargando, setCargando] = useState(true);
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [detalle, setDetalle] = useState<NovedadDetalle | null>(null);

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroPrioridad, setFiltroPrioridad] = useState('');
  const [filtroRelacion, setFiltroRelacion] = useState('');

  // Formulario — paso
  const [paso, setPaso] = useState<PasoFormulario>('cliente');

  // Paso 1: Cliente
  const [clientesBusqueda, setClientesBusqueda] = useState<ClienteBusqueda[]>([]);
  const [clienteSeleccion, setClienteSeleccion] = useState<ClienteBusqueda | null>(null);
  const [textoCliente, setTextoCliente] = useState('');
  const [buscandoClientes, setBuscandoClientes] = useState(false);

  // Paso 2: Origen
  const [pedidos, setPedidos] = useState<PedidoCliente[]>([]);
  const [citas, setCitas] = useState<CitaCliente[]>([]);
  const [pedidoSeleccion, setPedidoSeleccion] = useState<PedidoCliente | null>(null);
  const [citaSeleccion, setCitaSeleccion] = useState<CitaCliente | null>(null);
  const [cargandoOrigen, setCargandoOrigen] = useState(false);

  // Paso 3: Detalle
  const [tipoSeleccion, setTipoSeleccion] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [prioridad, setPrioridad] = useState('normal');
  const [lugar, setLugar] = useState('');

  // Paso 4: Evidencia
  const [evidenciaPreview, setEvidenciaPreview] = useState<string | null>(null);
  const [evidenciaFile, setEvidenciaFile] = useState<File | null>(null);

  const [enviando, setEnviando] = useState(false);

  // ── Data loading ──────────────────────────────────────────

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

  // ── Client search ─────────────────────────────────────────

  const onBuscarCliente = useCallback(async (texto: string) => {
    setTextoCliente(texto);
    if (texto.length < 2) {
      setClientesBusqueda([]);
      return;
    }
    setBuscandoClientes(true);
    try {
      const res = await api.get<ClienteBusqueda[]>('/novedades/clientes-buscar', { params: { q: texto } });
      setClientesBusqueda(res.data);
    } catch {
      setClientesBusqueda([]);
    } finally {
      setBuscandoClientes(false);
    }
  }, []);

  const seleccionarCliente = async (c: ClienteBusqueda) => {
    setClienteSeleccion(c);
    setTextoCliente(c.nombre);
    setClientesBusqueda([]);
    setPaso('origen');

    setCargandoOrigen(true);
    try {
      const [pedsRes, citsRes] = await Promise.all([
        api.get<PedidoCliente[]>(`/novedades/clientes/${c.id_cliente}/pedidos`),
        api.get<CitaCliente[]>(`/novedades/clientes/${c.id_cliente}/citas`),
      ]);
      setPedidos(pedsRes.data);
      setCitas(citsRes.data);
    } catch {
      setToast({ msg: 'Error al cargar pedidos/citas', tipo: 'err' });
    } finally {
      setCargandoOrigen(false);
    }
  };

  const seleccionarPedido = (p: PedidoCliente) => {
    setPedidoSeleccion(p);
    if (!citaSeleccion) {
      const citaRelacionada = citas.find((c) => c.fecha === p.fecha_entrega);
      if (citaRelacionada) setCitaSeleccion(citaRelacionada);
    }
    setPaso('detalle');
  };

  const seleccionarCita = (c: CitaCliente) => {
    setCitaSeleccion(c);
    setPaso('detalle');
  };

  // ── Evidence ──────────────────────────────────────────────

  const onEvidenciaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setToast({ msg: 'La imagen no puede superar 5 MB', tipo: 'err' });
      return;
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      setToast({ msg: 'Formato no permitido (usa JPG, PNG, WEBP o GIF)', tipo: 'err' });
      return;
    }
    setEvidenciaFile(file);
    setEvidenciaPreview(URL.createObjectURL(file));
  };

  const eliminarEvidencia = () => {
    setEvidenciaFile(null);
    if (evidenciaPreview) URL.revokeObjectURL(evidenciaPreview);
    setEvidenciaPreview(null);
  };

  // ── Submit ────────────────────────────────────────────────

  const enviarNovedad = async () => {
    if (!tipoSeleccion || !descripcion.trim()) {
      setToast({ msg: 'Completa el tipo y la descripcion', tipo: 'err' });
      return;
    }
    if (!pedidoSeleccion && !citaSeleccion) {
      setToast({ msg: 'Selecciona al menos un pedido o cita', tipo: 'err' });
      return;
    }

    setEnviando(true);
    try {
      const res = await api.post<{ id_novedad: number; mensaje: string }>('/novedades', {
        tipo_novedad: tipoSeleccion,
        descripcion: descripcion.trim(),
        prioridad,
        id_pedido: pedidoSeleccion?.id_pedido ?? null,
        id_cita: citaSeleccion?.id_cita ?? null,
        id_cliente: clienteSeleccion?.id_cliente ?? null,
        lugar_ocurrencia: lugar.trim() || undefined,
      });

      // Upload evidence if present
      if (evidenciaFile && res.data.id_novedad) {
        const formData = new FormData();
        formData.append('file', evidenciaFile);
        try {
          await api.post(`/novedades/${res.data.id_novedad}/evidencia`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch {
          setToast({ msg: 'Novedad creada pero error al subir evidencia', tipo: 'err' });
        }
      }

      setToast({ msg: 'Novedad reportada correctamente', tipo: 'ok' });
      resetForm();
      await cargar();
    } catch (err: any) {
      setToast({ msg: err?.response?.data?.detail || 'Error al crear novedad', tipo: 'err' });
    } finally {
      setEnviando(false);
    }
  };

  const resetForm = () => {
    setMostrarForm(false);
    setPaso('cliente');
    setClienteSeleccion(null);
    setTextoCliente('');
    setPedidoSeleccion(null);
    setCitaSeleccion(null);
    setPedidos([]);
    setCitas([]);
    setTipoSeleccion('');
    setDescripcion('');
    setPrioridad('normal');
    setLugar('');
    eliminarEvidencia();
  };

  // ── Detail ────────────────────────────────────────────────

  const abrirDetalle = async (id: number) => {
    try {
      const res = await api.get<NovedadDetalle>(`/novedades/${id}`);
      setDetalle(res.data);
    } catch {
      setToast({ msg: 'Error al cargar detalle', tipo: 'err' });
    }
  };

  // ── Filtered list ─────────────────────────────────────────

  const filtradas = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return novedades.filter((n) => {
      if (filtroEstado && n.estado_novedad !== filtroEstado) return false;
      if (filtroPrioridad && n.prioridad !== filtroPrioridad) return false;
      if (filtroRelacion === 'pedido' && !n.id_pedido) return false;
      if (filtroRelacion === 'cita' && !n.id_cita) return false;
      if (filtroRelacion === 'devolucion' && !n.id_devolucion) return false;
      if (q) {
        const campos = [
          n.tipo_novedad, n.descripcion_novedad, n.lugar_ocurrencia, n.cliente_nombre,
          n.id_pedido ? `#${n.id_pedido}` : '',
          n.id_cita ? `#${n.id_cita}` : '',
        ].filter(Boolean).join(' ').toLowerCase();
        if (!campos.includes(q)) return false;
      }
      return true;
    });
  }, [novedades, busqueda, filtroEstado, filtroPrioridad, filtroRelacion]);

  const hayFiltros = busqueda || filtroEstado || filtroPrioridad || filtroRelacion;

  const limpiarFiltros = () => {
    setBusqueda('');
    setFiltroEstado('');
    setFiltroPrioridad('');
    setFiltroRelacion('');
  };

  const contarPorEstado = useMemo(() => {
    const counts: Record<string, number> = {};
    novedades.forEach((n) => {
      counts[n.estado_novedad] = (counts[n.estado_novedad] || 0) + 1;
    });
    return counts;
  }, [novedades]);

  const canSubmit = tipoSeleccion && descripcion.trim() && (pedidoSeleccion || citaSeleccion);

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
            Consulta y registra novedades de entregas, citas y devoluciones
          </p>
        </div>
        <div className="ap-header-right">
          <button
            type="button"
            className="ap-btn ap-btn-primary"
            onClick={() => { resetForm(); setMostrarForm(true); }}
          >
            <FaPlus /> Agregar novedad
          </button>
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

      {/* ── Status pills ──────────────────────────────────── */}
      <div className="ap-pills" style={{ marginBottom: 20 }}>
        <button
          type="button"
          className={`ap-pill ${filtroEstado === '' && !hayFiltros ? 'active' : ''}`}
          onClick={() => { limpiarFiltros(); }}
        >
          Todas
          <span className="ap-pill-count">{novedades.length}</span>
        </button>
        {Object.entries(contarPorEstado).map(([estado, count]) => (
          <button
            key={estado}
            type="button"
            className={`ap-pill ${filtroEstado === estado ? 'active' : ''}`}
            onClick={() => setFiltroEstado(filtroEstado === estado ? '' : estado)}
          >
            {estado}
            <span className="ap-pill-count">{count}</span>
          </button>
        ))}
      </div>

      {/* ── Filters ──────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <div className="ap-search" style={{ maxWidth: 340 }}>
          <FaMagnifyingGlass />
          <input
            type="text"
            placeholder="Buscar por tipo, cliente, pedido..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        <select className="ap-filtro-estado" value={filtroPrioridad} onChange={(e) => setFiltroPrioridad(e.target.value)}>
          <option value="">Todas las prioridades</option>
          {PRIORIDADES.map((p) => <option key={p.valor} value={p.valor}>{p.label}</option>)}
        </select>

        <select className="ap-filtro-estado" value={filtroRelacion} onChange={(e) => setFiltroRelacion(e.target.value)}>
          <option value="">Todos los origenes</option>
          <option value="pedido">Solo Pedidos</option>
          <option value="cita">Solo Citas</option>
          <option value="devolucion">Solo Devoluciones</option>
        </select>

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

        <span style={{ marginLeft: 'auto', color: '#8f8f8f', fontSize: '0.82rem' }}>
          {filtradas.length} de {novedades.length} novedades
        </span>
      </div>

      {/* ── Formulario nueva novedad (multi-step) ──────────── */}
      <AnimatePresence>
        {mostrarForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden', marginBottom: 20 }}
          >
            <div className="ap-card" style={{ borderColor: 'rgba(212, 165, 75, 0.4)' }}>
              <div className="ap-card-head">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: '1rem' }}>
                  <FaPlus style={{ color: '#d4a54b' }} /> Agregar novedad
                </h3>
                <button type="button" className="ap-modal-x" onClick={resetForm}>
                  <FaXmark />
                </button>
              </div>

              {/* Step indicators */}
              <div style={{ display: 'flex', gap: 16, justifyContent: 'center', padding: '14px 0' }}>
                {(['cliente', 'origen', 'detalle', 'evidencia'] as PasoFormulario[]).map((p, i) => {
                  const pasos: PasoFormulario[] = ['cliente', 'origen', 'detalle', 'evidencia'];
                  const currentIdx = pasos.indexOf(paso);
                  const isActive = p === paso;
                  const isDone = i < currentIdx;
                  return (
                    <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: isActive ? '#d4a54b' : isDone ? 'rgba(212,165,75,0.3)' : 'rgba(255,255,255,0.06)',
                        border: `1px solid ${isActive ? '#d4a54b' : isDone ? '#d4a54b' : 'rgba(255,255,255,0.12)'}`,
                        fontSize: '0.72rem', fontWeight: 700, color: isActive || isDone ? '#000' : '#555',
                      }}>
                        {i + 1}
                      </div>
                      <span style={{ fontSize: '0.75rem', color: isActive ? '#d4a54b' : '#666', fontWeight: isActive ? 600 : 400 }}>
                        {p === 'cliente' ? 'Cliente' : p === 'origen' ? 'Origen' : p === 'detalle' ? 'Detalle' : 'Evidencia'}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div style={{ padding: '0 0 14px' }}>
                {/* ── PASO 1: Buscar cliente ──────────────────── */}
                {paso === 'cliente' && (
                  <div>
                    <label className="ap-form-label">Buscar cliente</label>
                    <p style={{ fontSize: '0.78rem', color: '#8f8f8f', margin: '0 0 8px' }}>Nombre, documento, email o telefono</p>
                    <div style={{ position: 'relative' }}>
                      <div className="ap-search" style={{ maxWidth: '100%' }}>
                        <FaMagnifyingGlass />
                        <input
                          type="text"
                          placeholder="Escribe para buscar..."
                          value={textoCliente}
                          onChange={(e) => onBuscarCliente(e.target.value)}
                          autoFocus
                        />
                        {buscandoClientes && (
                          <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>
                            <div className="ap-loader" style={{ width: 16, height: 16 }} />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Selected client */}
                    {clienteSeleccion && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                        background: 'rgba(212,165,75,0.08)', border: '1px solid rgba(212,165,75,0.3)',
                        borderRadius: 10, marginTop: 10,
                      }}>
                        <FaCheck style={{ color: '#d4a54b', fontSize: '0.9rem' }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#e6e6e6' }}>{clienteSeleccion.nombre}</div>
                          <div style={{ fontSize: '0.78rem', color: '#8f8f8f' }}>
                            {clienteSeleccion.documento ? `Doc: ${clienteSeleccion.documento}` : ''}
                            {clienteSeleccion.telefono ? ` · Tel: ${clienteSeleccion.telefono}` : ''}
                          </div>
                        </div>
                        <button type="button" className="ap-btn ap-btn-ghost" style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                          onClick={() => { setClienteSeleccion(null); setTextoCliente(''); }}>
                          <FaXmark />
                        </button>
                      </div>
                    )}

                    {/* Search results */}
                    {clientesBusqueda.length > 0 && (
                      <div style={{ marginTop: 8, maxHeight: 220, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}>
                        {clientesBusqueda.map((c) => (
                          <button
                            key={c.id_cliente}
                            type="button"
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                              padding: '10px 14px', background: 'transparent', border: 'none',
                              borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer',
                              color: '#e6e6e6', textAlign: 'left',
                            }}
                            onClick={() => seleccionarCliente(c)}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                          >
                            <div style={{
                              width: 32, height: 32, borderRadius: '50%', background: 'rgba(212,165,75,0.15)',
                              border: '1px solid rgba(212,165,75,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '0.7rem', fontWeight: 700, color: '#d4a54b', flexShrink: 0,
                            }}>
                              {c.nombre.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{c.nombre}</div>
                              <div style={{ fontSize: '0.75rem', color: '#8f8f8f' }}>
                                {c.email || ''}{c.documento ? ` · Doc: ${c.documento}` : ''}
                              </div>
                            </div>
                            <FaChevronRight style={{ color: '#555', fontSize: '0.7rem' }} />
                          </button>
                        ))}
                      </div>
                    )}

                    {!clienteSeleccion && textoCliente.length >= 2 && clientesBusqueda.length === 0 && !buscandoClientes && (
                      <p style={{ fontSize: '0.82rem', color: '#6b7280', textAlign: 'center', marginTop: 16 }}>No se encontraron clientes</p>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                      <button
                        type="button"
                        className="ap-btn ap-btn-primary"
                        disabled={!clienteSeleccion}
                        onClick={() => setPaso('origen')}
                      >
                        Siguiente <FaArrowRight />
                      </button>
                    </div>
                  </div>
                )}

                {/* ── PASO 2: Seleccionar origen ──────────────── */}
                {paso === 'origen' && (
                  <div>
                    <label className="ap-form-label">Seleccionar origen</label>
                    <p style={{ fontSize: '0.78rem', color: '#8f8f8f', margin: '0 0 12px' }}>
                      Pedidos y citas de {clienteSeleccion?.nombre}
                    </p>

                    {cargandoOrigen ? (
                      <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
                        <div className="ap-loader" />
                      </div>
                    ) : (
                      <>
                        {/* Pedidos */}
                        {pedidos.length > 0 && (
                          <div style={{ marginBottom: 14 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: '0.82rem', fontWeight: 600, color: '#d4a54b' }}>
                              <FaFileInvoice /> Pedidos
                            </div>
                            <div style={{ display: 'grid', gap: 6 }}>
                              {pedidos.map((p) => (
                                <button
                                  key={p.id_pedido}
                                  type="button"
                                  style={{
                                    display: 'block', width: '100%', textAlign: 'left',
                                    padding: '10px 14px',
                                    background: pedidoSeleccion?.id_pedido === p.id_pedido ? 'rgba(212,165,75,0.08)' : 'rgba(255,255,255,0.02)',
                                    border: `1px solid ${pedidoSeleccion?.id_pedido === p.id_pedido ? '#d4a54b' : 'rgba(255,255,255,0.08)'}`,
                                    borderRadius: 10, cursor: 'pointer', color: '#e6e6e6',
                                  }}
                                  onClick={() => seleccionarPedido(p)}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Pedido #{p.id_pedido}</span>
                                    <span className="ap-badge neutral" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>{p.estado_pedido || '—'}</span>
                                  </div>
                                  <div style={{ fontSize: '0.78rem', color: '#8f8f8f' }}>
                                    {p.fecha_entrega ? `Entrega: ${formatFechaCorta(p.fecha_entrega)}` : 'Sin fecha'}
                                    {p.hora_entrega ? ` ${p.hora_entrega}` : ''}
                                  </div>
                                  {p.detalles.length > 0 && (
                                    <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 2 }}>
                                      {p.detalles.map((d) => d.producto).filter(Boolean).join(', ').slice(0, 80)}
                                    </div>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Citas */}
                        {citas.length > 0 && (
                          <div style={{ marginBottom: 14 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: '0.82rem', fontWeight: 600, color: '#d4a54b' }}>
                              <FaCalendarCheck /> Citas
                            </div>
                            <div style={{ display: 'grid', gap: 6 }}>
                              {citas.map((c) => (
                                <button
                                  key={c.id_cita}
                                  type="button"
                                  style={{
                                    display: 'block', width: '100%', textAlign: 'left',
                                    padding: '10px 14px',
                                    background: citaSeleccion?.id_cita === c.id_cita ? 'rgba(212,165,75,0.08)' : 'rgba(255,255,255,0.02)',
                                    border: `1px solid ${citaSeleccion?.id_cita === c.id_cita ? '#d4a54b' : 'rgba(255,255,255,0.08)'}`,
                                    borderRadius: 10, cursor: 'pointer', color: '#e6e6e6',
                                  }}
                                  onClick={() => seleccionarCita(c)}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Cita #{c.id_cita}</span>
                                    <span className="ap-badge neutral" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>{c.estado}</span>
                                  </div>
                                  <div style={{ fontSize: '0.78rem', color: '#8f8f8f' }}>
                                    {formatFechaCorta(c.fecha)} · {c.hora}
                                  </div>
                                  <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 2 }}>
                                    {c.tipo_servicio}{c.especialidad ? ` · ${c.especialidad}` : ''}
                                  </div>
                                  <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>{c.direccion}</div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {pedidos.length === 0 && citas.length === 0 && (
                          <p style={{ fontSize: '0.85rem', color: '#6b7280', textAlign: 'center', padding: 20 }}>
                            Este cliente no tiene pedidos ni citas relacionados contigo.
                          </p>
                        )}

                        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 10 }}>
                          <button type="button" className="ap-btn ap-btn-ghost" onClick={() => setPaso('cliente')}>
                            <FaArrowLeft /> Atras
                          </button>
                          <button
                            type="button"
                            className="ap-btn ap-btn-primary"
                            disabled={!pedidoSeleccion && !citaSeleccion}
                            onClick={() => setPaso('detalle')}
                          >
                            Siguiente <FaArrowRight />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* ── PASO 3: Detalle ────────────────────────── */}
                {paso === 'detalle' && (
                  <div>
                    {/* Origin summary */}
                    <div style={{
                      display: 'flex', flexWrap: 'wrap', gap: 8, padding: '8px 12px',
                      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 8, marginBottom: 14, fontSize: '0.82rem',
                    }}>
                      {pedidoSeleccion && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#8ab4f8' }}>
                          <FaFileInvoice style={{ fontSize: '0.7rem' }} /> Pedido #{pedidoSeleccion.id_pedido}
                        </span>
                      )}
                      {citaSeleccion && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#c9a7ff' }}>
                          <FaCalendarCheck style={{ fontSize: '0.7rem' }} /> Cita · {formatFechaCorta(citaSeleccion.fecha)} {citaSeleccion.hora}
                        </span>
                      )}
                      {clienteSeleccion && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#8f8f8f' }}>
                          <FaUser style={{ fontSize: '0.7rem' }} /> {clienteSeleccion.nombre}
                        </span>
                      )}
                    </div>

                    <div className="ap-form-grid" style={{ marginBottom: 14 }}>
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
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {PRIORIDADES.map((p) => (
                            <button
                              key={p.valor}
                              type="button"
                              className="ap-btn"
                              style={{
                                background: prioridad === p.valor ? p.color : 'transparent',
                                color: prioridad === p.valor ? '#fff' : p.color,
                                border: `1px solid ${p.color}`,
                                fontSize: '0.78rem',
                                padding: '5px 12px',
                              }}
                              onClick={() => setPrioridad(p.valor)}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="ap-form-group full">
                        <label className="ap-form-label">Lugar de ocurrencia</label>
                        <input
                          type="text"
                          className="ap-form-input"
                          placeholder="Ej: Av. Principal #123"
                          value={lugar}
                          onChange={(e) => setLugar(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="ap-form-group" style={{ marginBottom: 14 }}>
                      <label className="ap-form-label">Descripcion *</label>
                      <textarea
                        className="ap-form-textarea"
                        rows={3}
                        placeholder="Describe la situacion detalladamente..."
                        value={descripcion}
                        onChange={(e) => setDescripcion(e.target.value)}
                      />
                    </div>

                    {tipoSeleccion === 'Robo de productos' && (
                      <div style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                        padding: '10px 14px', background: 'rgba(239, 68, 68, 0.08)',
                        border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: 10,
                        marginBottom: 14, fontSize: '0.82rem', color: '#fca5a5',
                      }}>
                        <FaTriangleExclamation style={{ marginTop: 2, flexShrink: 0 }} />
                        <span>Incluye en la descripcion: pedido afectado, productos, cantidades, fecha/hora aproximada, lugar y descripcion detallada.</span>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                      <button type="button" className="ap-btn ap-btn-ghost" onClick={() => setPaso('origen')}>
                        <FaArrowLeft /> Atras
                      </button>
                      <button
                        type="button"
                        className="ap-btn ap-btn-primary"
                        disabled={!tipoSeleccion || !descripcion.trim()}
                        onClick={() => setPaso('evidencia')}
                      >
                        Siguiente <FaArrowRight />
                      </button>
                    </div>
                  </div>
                )}

                {/* ── PASO 4: Evidencia ──────────────────────── */}
                {paso === 'evidencia' && (
                  <div>
                    <label className="ap-form-label">Evidencia de la novedad</label>
                    <p style={{ fontSize: '0.78rem', color: '#8f8f8f', margin: '0 0 14px' }}>Opcional: adjunta una foto como evidencia</p>

                    {evidenciaPreview ? (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{
                          position: 'relative', borderRadius: 10, overflow: 'hidden',
                          border: '1px solid rgba(255,255,255,0.1)', maxHeight: 220,
                        }}>
                          <img src={evidenciaPreview} alt="Evidencia" style={{ width: '100%', maxHeight: 220, objectFit: 'cover' }} />
                          <div style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0,
                            display: 'flex', justifyContent: 'center', gap: 10, padding: 8,
                            background: 'rgba(0,0,0,0.7)',
                          }}>
                            <label className="ap-btn ap-btn-ghost" style={{ fontSize: '0.78rem', padding: '6px 12px', cursor: 'pointer' }}>
                              <FaCamera /> Cambiar
                              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onEvidenciaChange} />
                            </label>
                            <button type="button" className="ap-btn" style={{ fontSize: '0.78rem', padding: '6px 12px', background: 'rgba(239,68,68,0.8)', color: '#fff', border: 'none' }} onClick={eliminarEvidencia}>
                              <FaTrash /> Eliminar
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                        <label style={{
                          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                          padding: '24px 16px', background: 'rgba(255,255,255,0.02)',
                          border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 12, cursor: 'pointer',
                        }}>
                          <div style={{
                            width: 48, height: 48, borderRadius: '50%', background: 'rgba(212,165,75,0.12)',
                            border: '1px solid rgba(212,165,75,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            marginBottom: 8,
                          }}>
                            <FaCamera style={{ color: '#d4a54b', fontSize: '1.1rem' }} />
                          </div>
                          <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#e6e6e6' }}>Subir foto</span>
                          <span style={{ fontSize: '0.75rem', color: '#8f8f8f', marginTop: 2 }}>JPG, PNG, WEBP (max 5MB)</span>
                          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }} onChange={onEvidenciaChange} />
                        </label>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                      <button type="button" className="ap-btn ap-btn-ghost" onClick={() => setPaso('detalle')}>
                        <FaArrowLeft /> Atras
                      </button>
                      <button
                        type="button"
                        className="ap-btn ap-btn-primary"
                        disabled={enviando || !canSubmit}
                        onClick={enviarNovedad}
                      >
                        <FaPaperPlane />
                        {enviando ? 'Enviando...' : 'Enviar reporte'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── List ──────────────────────────────────────────── */}
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
              ? 'No se encontraron novedades con los filtros seleccionados.'
              : 'Aun no has reportado novedades. Usa el boton "Nueva novedad" para crear una.'}
          </p>
          {hayFiltros ? (
            <button type="button" className="ap-btn ap-btn-primary" onClick={limpiarFiltros}>
              <FaRotateLeft /> Limpiar filtros
            </button>
          ) : (
            <button type="button" className="ap-btn ap-btn-primary" onClick={() => { resetForm(); setMostrarForm(true); }}>
              <FaPlus /> Agregar novedad
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
                <th>Prioridad</th>
                <th>Estado</th>
                <th>Origen</th>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Evidencia</th>
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
                  <td style={{ fontSize: '0.85rem' }}>{n.cliente_nombre || '—'}</td>
                  <td style={{ fontSize: '0.82rem', color: '#9f9f9f', whiteSpace: 'nowrap' }}>
                    {formatFechaCorta(n.fecha_reporte)}
                  </td>
                  <td>
                    {n.evidencias && n.evidencias.length > 0 ? (
                      <span className="ap-badge ok" style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <FaCamera style={{ fontSize: '0.6rem' }} /> {n.evidencias.length}
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: '#555' }}>—</span>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="ap-btn ap-btn-ghost"
                      style={{ fontSize: '0.78rem', padding: '5px 12px' }}
                      onClick={() => abrirDetalle(n.id_novedad)}
                    >
                      <FaEye /> Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Detail modal ────────────────────────────────────── */}
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
              style={{ maxWidth: 620 }}
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
                <button type="button" className="ap-modal-x" onClick={() => setDetalle(null)}>
                  <FaXmark />
                </button>
              </div>

              {/* Body */}
              <div className="ap-modal-body" style={{ padding: '18px 0 0' }}>
                {/* Info grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 18 }}>
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
                  {detalle.cliente_nombre && (
                    <div className="ap-def">
                      <div className="ap-def-label"><FaUser style={{ marginRight: 4 }} />Cliente</div>
                      <div className="ap-def-value" style={{ fontSize: '0.85rem' }}>{detalle.cliente_nombre}</div>
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

                {/* Evidences */}
                {detalle.evidencias && detalle.evidencias.length > 0 && (
                  <div style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, marginBottom: 18 }}>
                    <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#e6e6e6', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <FaCamera style={{ color: '#d4a54b' }} /> Evidencia
                    </h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {detalle.evidencias.map((ev) => (
                        <a key={ev.id_evidencia_n} href={ev.url} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'block', width: 90, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                          <img src={ev.url} alt="Evidencia" style={{ width: '100%', height: 90, objectFit: 'cover' }} />
                          {ev.fecha_subida && (
                            <div style={{ padding: '3px 6px', fontSize: '0.65rem', color: '#8f8f8f', textAlign: 'center', background: 'rgba(0,0,0,0.4)' }}>
                              {formatFechaCorta(ev.fecha_subida)}
                            </div>
                          )}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Accion admin */}
                {detalle.accion_admin && (
                  <div style={{ padding: '12px 14px', background: 'rgba(46, 160, 67, 0.08)', border: '1px solid rgba(46, 160, 67, 0.3)', borderRadius: 10, marginBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <FaCheck style={{ color: '#46d06f', fontSize: '0.8rem' }} />
                      <strong style={{ fontSize: '0.82rem', color: '#46d06f' }}>Respuesta del admin</strong>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#c9c9c9' }}>{detalle.accion_admin}</p>
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
    </motion.section>
  );
};

export default TecnicoNovedades;
