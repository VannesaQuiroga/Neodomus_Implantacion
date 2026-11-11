import LocalizedNotificationText from '@components/common/LocalizedNotificationText';
// Pantalla AdminNovedades de Neodomus. ReÃºne el estado y las acciones de su vista.
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
import AuthImage from '@components/common/AuthImage';
import { Paginacion } from '@components/common/Paginacion';
import { usePaginacion } from '../../hooks/usePaginacion';
import { useIdioma } from '@i18n/IdiomaContext';
import { activarConTeclado } from '@utils/keyboard';

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
  cupon?: {
    codigo: string;
    tipo_descuento: string;
    valor_descuento: number;
    activo: boolean;
    usos_maximos: number;
    usos_realizados: number;
  } | null;
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
  'Retraso en entrega', 'Cliente ausente', 'Cliente no recibiÃ³ el pedido',
  'DirecciÃ³n incorrecta', 'Producto daÃ±ado', 'Producto faltante',
  'Producto equivocado', 'PÃ©rdida de producto', 'Robo de productos',
  'Accidente', 'Problema con el vehÃ­culo/transporte', 'Problema tÃ©cnico',
  'Problema durante una cita', 'Cita no realizada', 'Cita reprogramada',
  'Cliente solicita reprogramaciÃ³n', 'Problema con instalaciÃ³n',
  'Retraso que afecta cita', 'Otro',
];

const ESTADOS = ['Pendiente', 'En revisiÃ³n', 'Aprobada', 'Rechazada', 'Resuelta', 'Cerrada'];
const PRIORIDADES = ['baja', 'normal', 'alta', 'urgente'];

const CLASE_ESTADO: Record<string, string> = {
  Pendiente: 'warn', 'En revisiÃ³n': 'info', Aprobada: 'ok',
  Rechazada: 'err', Resuelta: 'ok', Cerrada: 'neutral',
};
const CLASE_PRIORIDAD: Record<string, string> = {
  baja: 'neutral', normal: 'info', alta: 'warn', urgente: 'err',
};

const ICONO_PRIORIDAD: Record<string, string> = {
  urgente: '#ef4444', alta: '#f59e0b', normal: '#3b82f6', baja: '#6b7280',
};

const formatFecha = (f: string | null | undefined, idioma: string) => {
  if (!f) return 'â€”';
  return new Date(f).toLocaleString(idioma === 'en' ? 'en-US' : 'es-CO', { dateStyle: 'medium', timeStyle: 'short' });
};

const formatFechaCorta = (f: string | null | undefined, idioma: string) => {
  if (!f) return 'â€”';
  return new Date(f).toLocaleDateString(idioma === 'en' ? 'en-US' : 'es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Comunica con el backend mediante GET '/novedades', GET '/tecnicos', GET `/novedades/${id}` y otras peticiones de esta vista.
const AdminNovedades = () => {
  const { t, idioma } = useIdioma();
  const traducirValor = (grupo: string, valor: string) => {
    const clave = `novedades.admin.${grupo}.${valor}`;
    const traduccion = t(clave);
    return traduccion === clave ? valor : traduccion;
  };
  const traducirTipo = (tipo: string) => traducirValor('tipo', tipo);
  const traducirEstado = (estado: string) => traducirValor('estado', estado);
  const traducirPrioridad = (prioridad: string) => traducirValor('prioridad', prioridad);
  const [novedades, setNovedades] = useState<Novedad[]>([]);
  const [tecnicos, setTecnicos] = useState<TecnicoSimple[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
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

  // CupÃ³n
  const [mostrarCupon, setMostrarCupon] = useState(false);
  const [cuponCodigo, setCuponCodigo] = useState('');
  const [cuponTipo, setCuponTipo] = useState('porcentaje');
  const [cuponValor, setCuponValor] = useState('');
  const [cuponVence, setCuponVence] = useState('');
  const [cuponUsos, setCuponUsos] = useState('1');
  const [generandoCupon, setGenerandoCupon] = useState(false);

  // Responder novedad
  const [respuestaAdmin, setRespuestaAdmin] = useState('');
  const [enviandoRespuesta, setEnviandoRespuesta] = useState(false);

  // Mensaje/soluciÃ³n al cliente
  const [mensajeCliente, setMensajeCliente] = useState('');
  const [solucionCliente, setSolucionCliente] = useState('');
  const [clienteVisible, setClienteVisible] = useState(false);
  const [enviandoMensaje, setEnviandoMensaje] = useState(false);

  // Cambiar tÃ©cnico
  const [mostrarCambioTecnico, setMostrarCambioTecnico] = useState(false);
  const [nuevoTecnicoId, setNuevoTecnicoId] = useState('');
  const [motivoCambio, setMotivoCambio] = useState('');
  const [enviandoCambio, setEnviandoCambio] = useState(false);

  // Comunica con el backend mediante GET '/novedades', GET '/tecnicos'.
  const cargar = async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    setError(false);
    try {
      const [novRes, tecRes] = await Promise.all([
        api.get<Novedad[]>('/novedades'),
        api.get<TecnicoSimple[]>('/tecnicos'),
      ]);
      setNovedades(novRes.data);
      setTecnicos(tecRes.data);
    } catch {
      if (!silencioso) setError(true);
      else setToast({ msg: t('novedades.admin.errorCargaToast'), tipo: 'err' });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargar();
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
      if (filtroTecnico && n.id_tecnico !== Number.parseInt(filtroTecnico)) return false;
      if (filtroPedido) {
        const num = Number.parseInt(filtroPedido);
        if (!n.id_pedido || n.id_pedido !== num) return false;
      }
      if (filtroRelacion === 'pedido' && !n.id_pedido) return false;
      if (filtroRelacion === 'cita' && !n.id_cita) return false;
      if (filtroRelacion === 'devolucion' && !n.id_devolucion) return false;
      if (filtroRelacion === 'pedido_cita' && (!n.id_pedido || !n.id_cita)) return false;
      if (filtroCliente && n.id_cliente !== Number.parseInt(filtroCliente)) return false;
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

  const { page, setPage, totalPages, pageItems, numeroFila } = usePaginacion(filtradas, 10);

  // Al cambiar cualquier filtro/bÃºsqueda se vuelve a una pÃ¡gina vÃ¡lida (la 1).
  useEffect(() => {
    setPage(1);
  }, [busqueda, filtroEstado, filtroTipo, filtroPrioridad, filtroTecnico, filtroPedido, filtroRelacion, filtroCliente, filtroConEvidencia, setPage]);

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

  // Comunica con el backend mediante GET `/novedades/${id}`.
  const abrirDetalle = async (id: number) => {
    try {
      const res = await api.get<NovedadDetalle>(`/novedades/${id}`);
      setDetalle(res.data);
      setNuevoEstado(res.data.estado_novedad);
      setAccionDetalle('');
    } catch {
      setToast({ msg: t('novedades.admin.detalleError'), tipo: 'err' });
    }
  };

  // Comunica con el backend mediante PUT `/novedades/${detalle.id_novedad}/estado`.
  const guardarEstado = async () => {
    if (!detalle || nuevoEstado === detalle.estado_novedad) return;
    try {
      await api.put(`/novedades/${detalle.id_novedad}/estado`, {
        nuevo_estado: nuevoEstado,
        accion_detalle: accionDetalle || undefined,
      });
      setToast({ msg: t('novedades.admin.estadoActualizado'), tipo: 'ok' });
      setDetalle(null);
      await cargar();
    } catch (err: any) {
      setToast({ msg: err?.response?.data?.detail || t('novedades.admin.errorGenerico'), tipo: 'err' });
    }
  };

  // Comunica con el backend mediante POST `/novedades/${detalle.id_novedad}/cupon`.
  const generarCupon = async () => {
    if (!detalle || !cuponCodigo.trim() || !cuponValor || generandoCupon) {
      setToast({ msg: t('novedades.admin.cuponCamposObligatorios'), tipo: 'err' });
      return;
    }
    setGenerandoCupon(true);
    try {
      await api.post(`/novedades/${detalle.id_novedad}/cupon`, {
        codigo: cuponCodigo.trim().toUpperCase(),
        tipo_descuento: cuponTipo,
        valor_descuento: Number.parseFloat(cuponValor),
        fecha_vencimiento: cuponVence || undefined,
        usos_maximos: Number.parseInt(cuponUsos) || 1,
      });
      setToast({ msg: t('novedades.admin.cuponGenerado'), tipo: 'ok' });
      setMostrarCupon(false);
      setCuponCodigo('');
      setCuponValor('');
      setCuponVence('');
      await cargar();
      await abrirDetalle(detalle.id_novedad);
    } catch (err: any) {
      setToast({ msg: err?.response?.data?.detail || t('novedades.admin.errorCrearCupon'), tipo: 'err' });
    } finally {
      setGenerandoCupon(false);
    }
  };

  // Comunica con el backend mediante POST `/novedades/${detalle.id_novedad}/responder`.
  const enviarRespuesta = async () => {
    if (!detalle || !respuestaAdmin.trim()) {
      setToast({ msg: t('novedades.admin.escribeRespuesta'), tipo: 'err' });
      return;
    }
    setEnviandoRespuesta(true);
    try {
      await api.post(`/novedades/${detalle.id_novedad}/responder`, {
        respuesta: respuestaAdmin.trim(),
      });
      setToast({ msg: t('novedades.admin.respuestaTecnicoNotificado'), tipo: 'ok' });
      setRespuestaAdmin('');
      await cargar();
      await abrirDetalle(detalle.id_novedad);
    } catch (err: any) {
      setToast({ msg: err?.response?.data?.detail || t('novedades.admin.errorResponder'), tipo: 'err' });
    } finally {
      setEnviandoRespuesta(false);
    }
  };

  // Comunica con el backend mediante POST `/novedades/${detalle.id_novedad}/mensaje-cliente`.
  const enviarMensajeCliente = async () => {
    if (!detalle || !mensajeCliente.trim()) {
      setToast({ msg: t('novedades.admin.escribeMensajeCliente'), tipo: 'err' });
      return;
    }
    setEnviandoMensaje(true);
    try {
      await api.post(`/novedades/${detalle.id_novedad}/mensaje-cliente`, {
        mensaje_cliente: mensajeCliente.trim(),
        solucion_cliente: solucionCliente.trim() || undefined,
        cliente_visible: clienteVisible,
      });
      setToast({ msg: t('novedades.admin.solucionEnviada'), tipo: 'ok' });
      setMensajeCliente('');
      setSolucionCliente('');
      setClienteVisible(false);
      await abrirDetalle(detalle.id_novedad);
      await cargar();
    } catch (err: any) {
      setToast({ msg: err?.response?.data?.detail || t('novedades.admin.errorEnviarMensaje'), tipo: 'err' });
    } finally {
      setEnviandoMensaje(false);
    }
  };

  // Comunica con el backend mediante PUT `/novedades/${detalle.id_novedad}/cambiar-tecnico`.
  const cambiarTecnico = async () => {
    if (!detalle || !nuevoTecnicoId) {
      setToast({ msg: t('novedades.admin.seleccionaTecnicoError'), tipo: 'err' });
      return;
    }
    setEnviandoCambio(true);
    try {
      await api.put(`/novedades/${detalle.id_novedad}/cambiar-tecnico`, {
        id_nuevo_tecnico: Number.parseInt(nuevoTecnicoId),
        motivo: motivoCambio.trim() || undefined,
      });
      setToast({ msg: t('novedades.admin.tecnicoNotificado'), tipo: 'ok' });
      setMostrarCambioTecnico(false);
      setNuevoTecnicoId('');
      setMotivoCambio('');
      await cargar();
      await abrirDetalle(detalle.id_novedad);
    } catch (err: any) {
      setToast({ msg: err?.response?.data?.detail || t('novedades.admin.errorCambiarTecnico'), tipo: 'err' });
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
      {/* â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="ap-header">
        <div>
          <h1 className="ap-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <FaShieldHalved style={{ color: '#d4a54b' }} />
            {t('novedades.admin.titulo')}
          </h1>
          <p className="ap-subtitle">
            {t('novedades.admin.subtitulo')}
          </p>
        </div>
        <div className="ap-header-right">
          <span style={{ color: '#9f9f9f', fontSize: '0.85rem' }}>
            {t('novedades.admin.contador', { visibles: filtradas.length, total: novedades.length })}
          </span>
        </div>
      </div>

      {/* â”€â”€ Toast â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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

      {/* â”€â”€ Resumen rÃ¡pido por estado â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="ap-pills" style={{ marginBottom: 20 }}>
        {ESTADOS.map((e) => (
          <button
            key={e}
            type="button"
            className={`ap-pill ${filtroEstado === e ? 'active' : ''}`}
            onClick={() => setFiltroEstado(filtroEstado === e ? '' : e)}
          >
            {traducirEstado(e)}
            <span className="ap-pill-count">{contarPorEstado[e] || 0}</span>
          </button>
        ))}
      </div>

      {/* â”€â”€ Filtros â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <div className="ap-search ap-search-larga" style={{ maxWidth: 420 }}>
          <FaMagnifyingGlass />
          <input
            type="text"
            placeholder={t('novedades.admin.buscarPlaceholder')}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        <select className="ap-filtro-estado" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
          <option value="">{t('novedades.admin.todosTipos')}</option>
          {TIPOS.map((tipo) => <option key={tipo} value={tipo}>{traducirTipo(tipo)}</option>)}
        </select>

        <select className="ap-filtro-estado" value={filtroPrioridad} onChange={(e) => setFiltroPrioridad(e.target.value)}>
          <option value="">{t('novedades.admin.todasPrioridades')}</option>
          {PRIORIDADES.map((p) => <option key={p} value={p}>{traducirPrioridad(p)}</option>)}
        </select>

        <select className="ap-filtro-estado" value={filtroTecnico} onChange={(e) => setFiltroTecnico(e.target.value)}>
          <option value="">{t('novedades.admin.todosTecnicos')}</option>
          {tecnicos.map((t) => (
            <option key={t.id_tecnico} value={t.id_tecnico}>
              {[t.first_name, t.last_name].filter(Boolean).join(' ')}
            </option>
          ))}
        </select>

        <select className="ap-filtro-estado" value={filtroRelacion} onChange={(e) => setFiltroRelacion(e.target.value)}>
          <option value="">{t('novedades.admin.todosOrigenes')}</option>
          <option value="pedido">{t('novedades.admin.soloPedidos')}</option>
          <option value="cita">{t('novedades.admin.soloCitas')}</option>
          <option value="pedido_cita">{t('novedades.admin.pedidoCita')}</option>
          <option value="devolucion">{t('novedades.admin.soloDevoluciones')}</option>
        </select>

        <select className="ap-filtro-estado" value={filtroConEvidencia} onChange={(e) => setFiltroConEvidencia(e.target.value)}>
          <option value="">{t('novedades.admin.todasEvidencias')}</option>
          <option value="si">{t('novedades.admin.conEvidencia')}</option>
          <option value="no">{t('novedades.admin.sinEvidencia')}</option>
        </select>

        <div className="ap-search" style={{ maxWidth: 160 }}>
          <FaUser style={{ position: 'absolute', left: 12, color: '#8f8f8f', fontSize: '0.8rem', pointerEvents: 'none' }} />
          <input
            type="number"
            placeholder={t('novedades.admin.buscarClienteId')}
            value={filtroCliente}
            onChange={(e) => setFiltroCliente(e.target.value)}
            style={{ paddingLeft: 34 }}
          />
        </div>

        <div className="ap-search" style={{ maxWidth: 160 }}>
          <FaFileInvoice style={{ position: 'absolute', left: 12, color: '#8f8f8f', fontSize: '0.8rem', pointerEvents: 'none' }} />
          <input
            type="number"
            placeholder={t('novedades.admin.buscarPedidoId')}
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
            <FaRotateLeft /> {t('novedades.admin.limpiar')}
          </button>
        )}
      </div>

      {/* â”€â”€ Tabla â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {cargando ? (
        <div className="ap-states">
          <div className="ap-loader" />
          <p>{t('novedades.admin.cargando')}</p>
        </div>
      ) : error ? (
        <div className="ap-states error">
          <div className="ap-states-icon">
            <FaCircleInfo />
          </div>
          <h3>{t('novedades.admin.errorCargaTitulo')}</h3>
          <p>{t('novedades.admin.errorCargaDetalle')}</p>
          <button type="button" className="ap-btn ap-btn-primary" onClick={() => cargar()}>
            <FaRotateLeft /> {t('novedades.admin.reintentar')}
          </button>
        </div>
      ) : filtradas.length === 0 ? (
        <div className="ap-states">
          <div className="ap-states-icon">
            <FaShieldHalved />
          </div>
          <h3>{hayFiltros ? t('novedades.admin.sinResultados') : t('novedades.admin.sinNovedades')}</h3>
          <p>
            {hayFiltros
              ? t('novedades.admin.sinResultadosDetalle')
              : t('novedades.admin.sinNovedadesDetalle')}
          </p>
          {hayFiltros && (
            <button type="button" className="ap-btn ap-btn-primary" onClick={limpiarFiltros}>
              <FaRotateLeft /> {t('novedades.admin.limpiarFiltros')}
            </button>
          )}
        </div>
      ) : (
        <>
        <div className="ap-table-wrap">
          <table className="ap-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t('novedades.admin.col.tipo')}</th>
                <th>{t('novedades.admin.col.tecnico')}</th>
                <th>{t('novedades.admin.col.cliente')}</th>
                <th>{t('novedades.admin.col.origen')}</th>
                <th>{t('novedades.admin.col.prioridad')}</th>
                <th>{t('novedades.admin.col.estado')}</th>
                <th>{t('novedades.admin.col.fecha')}</th>
                <th>{t('novedades.admin.col.mensaje')}</th>
                <th>{t('novedades.admin.col.solucion')}</th>
                <th>{t('novedades.admin.col.acciones')}</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((n, idx) => (
                <tr key={n.id_novedad}>
                  <td style={{ fontWeight: 700, color: '#d4a54b' }}>{numeroFila(idx)}</td>
                  <td>
                    <span style={{ fontSize: '0.85rem' }}>{n.tipo_novedad_label || traducirTipo(n.tipo_novedad)}</span>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: '#8f8f8f' }}>ID {n.id_novedad}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="ap-initials" style={{ width: 30, height: 30, fontSize: '0.7rem' }}>
                        {n.tecnico_nombre ? n.tecnico_nombre.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '?'}
                      </div>
                      <span style={{ fontSize: '0.85rem' }}>{n.tecnico_nombre || 'â€”'}</span>
                    </div>
                  </td>
                  <td style={{ fontSize: '0.85rem' }}>{n.cliente_nombre || 'â€”'}</td>
                  <td>
                    {n.id_pedido ? (
                      <span className="ap-badge info" style={{ fontSize: '0.7rem' }}>
                        <FaFileInvoice style={{ fontSize: '0.6rem' }} /> #{n.id_pedido}
                      </span>
                    ) : n.id_cita ? (
                      <span className="ap-badge proceso" style={{ fontSize: '0.7rem' }}>
                        <FaCalendarCheck style={{ fontSize: '0.6rem' }} /> {t('novedades.admin.cita')} #{n.id_cita}
                      </span>
                    ) : n.id_devolucion ? (
                      <span className="ap-badge warn" style={{ fontSize: '0.7rem' }}>
                        <FaBoxOpen style={{ fontSize: '0.6rem' }} /> {t('novedades.admin.devolucion')} #{n.id_devolucion}
                      </span>
                    ) : (
                      <span className="ap-badge neutral" style={{ fontSize: '0.7rem' }}>{t('novedades.admin.sinOrigen')}</span>
                    )}
                  </td>
                  <td>
                    <span className={`ap-badge ${CLASE_PRIORIDAD[n.prioridad] || 'neutral'}`} style={{ fontSize: '0.7rem' }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
                        background: ICONO_PRIORIDAD[n.prioridad] || '#6b7280',
                      }} />
                      {n.prioridad_label || traducirPrioridad(n.prioridad)}
                    </span>
                  </td>
                  <td>
                    <span className={`ap-badge ${CLASE_ESTADO[n.estado_novedad] || 'neutral'}`}>
                      {n.estado_novedad_label || traducirEstado(n.estado_novedad)}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.82rem', color: '#9f9f9f', whiteSpace: 'nowrap' }}>
                    {formatFechaCorta(n.fecha_reporte, idioma)}
                  </td>
                  <td style={{ fontSize: '0.82rem', color: n.mensaje_cliente ? '#f5c542' : '#8f8f8f' }}>
                    {n.mensaje_cliente ? (
                      <span role="button" tabIndex={0} onKeyDown={activarConTeclado} style={{ cursor: 'pointer' }} onClick={() => abrirDetalle(n.id_novedad)}>
                        <FaPaperPlane style={{ marginRight: 4 }} /> Enviado
                      </span>
                    ) : 'â€”'}
                  </td>
                  <td style={{ fontSize: '0.82rem', color: n.solucion_cliente ? '#46d06f' : '#8f8f8f' }}>
                    {n.solucion_cliente ? (
                      <span role="button" tabIndex={0} onKeyDown={activarConTeclado} style={{ cursor: 'pointer' }} onClick={() => abrirDetalle(n.id_novedad)}>
                        <FaCheck style={{ marginRight: 4 }} /> {n.cliente_visible ? 'Visible' : 'Oculta'}
                      </span>
                    ) : 'â€”'}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="ap-btn ap-btn-ghost"
                      style={{ fontSize: '0.78rem', padding: '5px 12px' }}
                      onClick={() => abrirDetalle(n.id_novedad)}
                    >
                      <FaEye /> {t('novedades.admin.verDetalle')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Paginacion page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}

      {/* â”€â”€ Modal de detalle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
                    <span style={{ color: '#d4a54b' }}>{t('novedades.admin.detalle', { id: detalle.id_novedad })}</span>
                    <span className={`ap-badge ${CLASE_ESTADO[detalle.estado_novedad] || 'neutral'}`}>
                      {detalle.estado_novedad_label || traducirEstado(detalle.estado_novedad)}
                    </span>
                  </h3>
                  <p style={{ margin: '4px 0 0', color: '#8f8f8f', fontSize: '0.82rem' }}>
                    {formatFecha(detalle.fecha_reporte, idioma)}
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
                    <div className="ap-def-label"><FaTag style={{ marginRight: 4 }} />{t('novedades.admin.col.tipo')}</div>
                    <div className="ap-def-value" style={{ fontSize: '0.85rem' }}>{detalle.tipo_novedad_label || traducirTipo(detalle.tipo_novedad)}</div>
                  </div>
                  <div className="ap-def">
                    <div className="ap-def-label">{t('novedades.admin.col.prioridad')}</div>
                    <div className="ap-def-value">
                      <span className={`ap-badge ${CLASE_PRIORIDAD[detalle.prioridad] || 'neutral'}`} style={{ fontSize: '0.75rem' }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
                          background: ICONO_PRIORIDAD[detalle.prioridad] || '#6b7280',
                        }} />
                        {detalle.prioridad_label || traducirPrioridad(detalle.prioridad)}
                      </span>
                    </div>
                  </div>
                  <div className="ap-def">
                    <div className="ap-def-label"><FaTruck style={{ marginRight: 4 }} />{t('novedades.admin.col.tecnico')}</div>
                    <div className="ap-def-value" style={{ fontSize: '0.85rem' }}>{detalle.tecnico_nombre || 'â€”'}</div>
                  </div>
                  <div className="ap-def">
                    <div className="ap-def-label"><FaUser style={{ marginRight: 4 }} />{t('novedades.admin.col.cliente')}</div>
                    <div className="ap-def-value" style={{ fontSize: '0.85rem' }}>{detalle.cliente_nombre || 'â€”'}</div>
                  </div>
                  {detalle.id_pedido && (
                    <div className="ap-def">
                      <div className="ap-def-label"><FaFileInvoice style={{ marginRight: 4 }} />{t('novedades.admin.pedido')}</div>
                      <div className="ap-def-value" style={{ fontSize: '0.85rem', color: '#8ab4f8' }}>#{detalle.id_pedido}</div>
                    </div>
                  )}
                  {detalle.id_cita && (
                    <div className="ap-def">
                      <div className="ap-def-label"><FaCalendarCheck style={{ marginRight: 4 }} />{t('novedades.admin.cita')}</div>
                      <div className="ap-def-value" style={{ fontSize: '0.85rem', color: '#c9a7ff' }}>#{detalle.id_cita}</div>
                    </div>
                  )}
                  {detalle.id_devolucion && (
                    <div className="ap-def">
                      <div className="ap-def-label"><FaBoxOpen style={{ marginRight: 4 }} />{t('novedades.admin.devolucion')}</div>
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
                    <strong style={{ fontSize: '0.85rem', color: '#e6e6e6' }}>{t('novedades.admin.descripcion')}</strong>
                  </div>
                  <p style={{ margin: 0, color: '#bdbdbd', fontSize: '0.88rem', lineHeight: 1.65 }}>{detalle.descripcion_novedad}</p>
                </div>

                {/* Evidencias */}
                {detalle.evidencias && detalle.evidencias.length > 0 && (
                  <div style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, marginBottom: 18 }}>
                    <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#e6e6e6', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <FaCamera style={{ color: '#d4a54b' }} /> {t('novedades.admin.evidencia')} ({detalle.evidencias.length})
                    </h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {detalle.evidencias.map((ev) => (
                        <div key={ev.id_evidencia_n}
                          style={{ display: 'block', width: 90, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                          <AuthImage src={ev.url} alt={t('novedades.admin.evidencia')} style={{ width: '100%', height: 90, objectFit: 'cover' }} />
                          {ev.fecha_subida && (
                            <div style={{ padding: '3px 6px', fontSize: '0.65rem', color: '#8f8f8f', textAlign: 'center', background: 'rgba(0,0,0,0.4)' }}>
                              {formatFechaCorta(ev.fecha_subida, idioma)}
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
                      <strong style={{ fontSize: '0.82rem', color: '#46d06f' }}>{t('novedades.admin.accionAdmin')}</strong>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#c9c9c9' }}>{detalle.accion_admin}</p>
                  </div>
                )}

                {/* Mensaje al cliente */}
                {detalle.mensaje_cliente && (
                  <div style={{ padding: '12px 14px', background: 'rgba(255, 200, 50, 0.08)', border: '1px solid rgba(255, 200, 50, 0.3)', borderRadius: 10, marginBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <FaPaperPlane style={{ color: '#f5c542', fontSize: '0.8rem' }} />
                      <strong style={{ fontSize: '0.82rem', color: '#f5c542' }}>{t('novedades.admin.mensajeCliente')}</strong>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#c9c9c9', lineHeight: 1.5 }}>{detalle.mensaje_cliente}</p>
                    {detalle.solucion_cliente && (
                      <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(46, 160, 67, 0.06)', borderRadius: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <FaCheck style={{ color: '#46d06f', fontSize: '0.75rem' }} />
                          <strong style={{ fontSize: '0.8rem', color: '#46d06f' }}>{t('novedades.admin.col.solucion')}</strong>
                          <span style={{ fontSize: '0.7rem', color: '#8f8f8f', marginLeft: 'auto' }}>
                            {detalle.cliente_visible ? t('novedades.admin.visibleCliente') : t('novedades.admin.oculto')}
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#c9c9c9', lineHeight: 1.5 }}>{detalle.solucion_cliente}</p>
                      </div>
                    )}
                  </div>
                )}

                {detalle.cupon && (
                  <div style={{ padding: '12px 14px', background: 'rgba(212,165,75,.1)', border: '1px dashed rgba(212,165,75,.55)', borderRadius: 10, marginBottom: 18 }}>
                    <strong style={{ color: '#f1d27b' }}>{t('novedades.admin.cuponCreado', { codigo: detalle.cupon.codigo })}</strong>
                    <p style={{ margin: '5px 0 0', color: '#ddd' }}>
                      {detalle.cupon.tipo_descuento === 'porcentaje'
                        ? t('novedades.admin.descuento', { valor: detalle.cupon.valor_descuento })
                        : t('novedades.admin.descuentoFijo', { valor: Number(detalle.cupon.valor_descuento).toLocaleString(idioma === 'en' ? 'en-US' : 'es-CO') })}
                      {' Â· '}{detalle.cupon.activo && detalle.cupon.usos_realizados < detalle.cupon.usos_maximos ? t('novedades.admin.disponible') : t('novedades.admin.noDisponible')}
                    </p>
                  </div>
                )}

                {/* Cambiar estado */}
                <div style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, marginBottom: 18 }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#e6e6e6', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FaCheck style={{ color: '#d4a54b' }} /> {t('novedades.admin.cambiarEstado')}
                  </h4>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select
                      className="ap-filtro-estado"
                      value={nuevoEstado}
                      onChange={(e) => setNuevoEstado(e.target.value)}
                      style={{ minWidth: 160 }}
                    >
                      {ESTADOS.map((e) => <option key={e} value={e}>{traducirEstado(e)}</option>)}
                    </select>
                    <input
                      type="text"
                      className="ap-form-input"
                      placeholder={t('novedades.admin.comentarioPlaceholder')}
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
                      <FaCheck /> {t('novedades.admin.guardar')}
                    </button>
                  </div>
                </div>

                {/* Responder novedad */}
                <div style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, marginBottom: 18 }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#e6e6e6', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FaPaperPlane style={{ color: '#d4a54b' }} /> {t('novedades.admin.responderNovedad')}
                  </h4>
                  <textarea
                    className="ap-form-textarea"
                    rows={2}
                    placeholder={t('novedades.admin.respuestaPlaceholder')}
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
                    <FaPaperPlane /> {enviandoRespuesta ? t('novedades.admin.enviando') : t('novedades.admin.enviarRespuesta')}
                  </button>
                </div>

                {/* Enviar mensaje/soluciÃ³n al cliente */}
                <div style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, marginBottom: 18 }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#e6e6e6', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FaPaperPlane style={{ color: '#f5c542' }} /> {t('novedades.admin.enviarSolucion')}
                  </h4>
                  <textarea
                    className="ap-form-textarea"
                    rows={2}
                    placeholder={t('novedades.admin.mensajeObligatorio')}
                    value={mensajeCliente}
                    onChange={(e) => setMensajeCliente(e.target.value)}
                    style={{ marginBottom: 8 }}
                  />
                  <textarea
                    className="ap-form-textarea"
                    rows={2}
                    placeholder={t('novedades.admin.solucionOpcional')}
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
                    {t('novedades.admin.hacerVisible')}
                  </label>
                  <button
                    type="button"
                    className="ap-btn"
                    style={{ background: '#f5c542', color: '#000', fontWeight: 600, height: 36 }}
                    disabled={enviandoMensaje || !mensajeCliente.trim()}
                    onClick={enviarMensajeCliente}
                  >
                    <FaPaperPlane /> {enviandoMensaje ? t('novedades.admin.enviando') : t('novedades.admin.enviarCliente')}
                  </button>
                </div>

                {/* Cambiar tÃ©cnico */}
                {(detalle.id_pedido || detalle.id_cita) && (
                  <div style={{ padding: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, marginBottom: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#e6e6e6', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <FaUserGear style={{ color: '#d4a54b' }} /> {t('novedades.admin.cambiarTecnico')}
                      </h4>
                      <button
                        type="button"
                        className={`ap-btn ${mostrarCambioTecnico ? 'ap-btn-danger' : 'ap-btn-ghost'}`}
                        style={{ fontSize: '0.8rem', padding: '7px 14px' }}
                        onClick={() => setMostrarCambioTecnico(!mostrarCambioTecnico)}
                      >
                        <FaUserGear /> {mostrarCambioTecnico ? t('novedades.admin.cancelar') : t('novedades.admin.cambiarTecnico')}
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
                              <option value="">{t('novedades.admin.seleccionarTecnico')}</option>
                              {tecnicos.map((t) => (
                                <option key={t.id_tecnico} value={t.id_tecnico}>
                                  {[t.first_name, t.last_name].filter(Boolean).join(' ')}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              className="ap-form-input"
                              placeholder={t('novedades.admin.motivoCambio')}
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
                              <FaUserGear /> {enviandoCambio ? t('novedades.admin.cambiando') : t('novedades.admin.confirmarCambio')}
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
                        <FaTicket style={{ color: '#d4a54b' }} /> {t('novedades.admin.compensacion')}
                      </h4>
                      <button
                        type="button"
                        className={`ap-btn ${mostrarCupon ? 'ap-btn-danger' : 'ap-btn-ghost'}`}
                        style={{ fontSize: '0.8rem', padding: '7px 14px' }}
                        onClick={() => setMostrarCupon(!mostrarCupon)}
                      >
                        <FaTicket /> {mostrarCupon ? t('novedades.admin.cancelar') : t('novedades.admin.generarCupon')}
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
                              placeholder={t('novedades.admin.codigoEjemplo')}
                              value={cuponCodigo}
                              onChange={(e) => setCuponCodigo(e.target.value.toUpperCase())}
                              style={{ height: 40 }}
                            />
                            <select className="ap-filtro-estado" value={cuponTipo} onChange={(e) => setCuponTipo(e.target.value)} style={{ height: 40 }}>
                              <option value="porcentaje">{t('novedades.admin.porcentaje')}</option>
                              <option value="fijo">{t('novedades.admin.valorFijo')}</option>
                            </select>
                            <input
                              type="number"
                              className="ap-form-input"
                              placeholder={t('novedades.admin.valor')}
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
                              placeholder={t('novedades.admin.usosMaximos')}
                              value={cuponUsos}
                              onChange={(e) => setCuponUsos(e.target.value)}
                              min={1}
                              style={{ height: 40 }}
                            />
                            <button type="button" className="ap-btn ap-btn-primary" onClick={generarCupon} disabled={generandoCupon} style={{ height: 40 }}>
                              <FaTicket /> {generandoCupon ? t('novedades.admin.creando') : t('novedades.admin.crearCupon')}
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
                      <FaClockRotateLeft style={{ color: '#d4a54b' }} /> {t('novedades.admin.historial')}
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
                              <span style={{ fontSize: '0.75rem', color: '#8f8f8f' }}>{t('novedades.admin.porSistema', { usuario: h.usuario_nombre || t('novedades.admin.sistema') })}</span>
                            </div>
                            {h.detalle && (
                              <p style={{ margin: 0, fontSize: '0.82rem', color: '#bdbdbd', lineHeight: 1.5 }}>{h.detalle}</p>
                            )}
                          </div>
                          <span style={{ fontSize: '0.75rem', color: '#8f8f8f', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {formatFecha(h.fecha, idioma)}
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
    </motion.section>
  );
};

export default AdminNovedades;
