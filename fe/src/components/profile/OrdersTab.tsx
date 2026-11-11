// Presenta los pedidos y sus acciones de consulta desde el perfil del cliente.
import { Fragment, useEffect, useRef, useState } from 'react';
import {
  FaBoxOpen,
  FaChevronDown,
  FaChevronUp,
  FaCircleCheck,
  FaCircleExclamation,
  FaFilePdf,
  FaLocationDot,
  FaMinus,
  FaPlus,
  FaRotateLeft,
  FaXmark,
} from 'react-icons/fa6';
import api, { descargarFactura } from '@services/api';
import { useIdioma } from '@i18n/IdiomaContext';
import { formatMetros } from '@utils/metros';
import SectionHeader from './SectionHeader';
import { NotifyFn } from './PersonalTab';
import ModalPortal from '@components/common/ModalPortal';
import { pedidoCompletado } from '@utils/pedidos';

interface Detalle {
  id_detalle: number;
  id_producto_d: number | null;
  nombre: string;
  cantidad: number;
  metros: number | null;
  precio_unitario: number;
  subtotal: number;
  es_servicio: boolean;
  fecha_servicio?: string | null;
}

interface Factura {
  id_factura: number;
  numero_factura: string;
  enviada_por_correo: boolean;
  pdf_url?: string;
}

interface Pago {
  id_pago: number;
  metodo_pago?: string;
  metodo_pago_nombre?: string;
  estado: string;
  numero_transaccion?: string | null;
  codigo_punto_pago?: string | null;
  banco?: string | null;
  ultimos_digitos?: string | null;
}

interface CitaPedido {
  id_cita: number;
  estado: string;
  tipo_servicio?: string | null;
}

interface NovedadPedido {
  id_novedad: number;
  id_pedido: number | null;
  tipo_novedad: string;
  descripcion_novedad: string;
  estado_novedad: string;
  fecha_reporte: string | null;
  mensaje_cliente: string | null;
  solucion_cliente: string | null;
  cupon?: {
    codigo: string;
    tipo_descuento: string;
    valor_descuento: number;
    fecha_vencimiento: string | null;
    usos_maximos: number;
    usos_realizados: number;
    activo: boolean;
  } | null;
}

interface Pedido {
  id_pedido: number;
  fecha?: string | null;
  total: number;
  estado: string;
  pago?: Pago | null;
  factura?: Factura | null;
  detalles: Detalle[];
  fecha_entrega?: string | null;
  hora_entrega?: string | null;
  hora_entrega_fin?: string | null;
  id_tecnico_entrega?: number | null;
  nombre_tecnico_entrega?: string | null;
  telefono_tecnico_entrega?: string | null;
  foto_tecnico_entrega?: string | null;
  estado_entrega?: string | null;
  cita?: CitaPedido | null;
  productos_calificables?: boolean;
}

interface PasoSeguimiento {
  paso: string;
  completado: boolean;
}

interface Seguimiento {
  estado_entrega: string;
  pasos: PasoSeguimiento[];
  rango_entrega?: string | null;
  tecnico?: { nombre?: string; telefono?: string; foto?: string } | null;
  ubicacion?: { latitud: number; longitud: number; actualizado_en: string } | null;
}

interface ItemDevolucion {
  id_devolucion: number;
  id_producto: number;
  producto: string;
  cantidad: number;
  metros?: number | null;
  venta_por_metros?: boolean;
  precio_unitario: number;
  subtotal_linea: number;
  estado_linea: string;
  recogida_estado?: string | null;
  fecha_recogida?: string | null;
}

interface SolicitudDevolucion {
  id_solicitud: number;
  numero: string;
  id_pedido: number | null;
  motivo_tipo: string | null;
  motivo_label?: string | null;
  motivo_otro: string | null;
  comentario: string | null;
  estado: string;
  tipo_devolucion: 'parcial' | 'total';
  monto_total: number;
  resolucion: string | null;
  motivo_rechazo: string | null;
  observaciones_admin?: string | null;
  created_at: string | null;
  items: ItemDevolucion[];
  reembolso?: { estado: string; monto: number; numero_transaccion_reembolso?: string | null } | null;
}

interface LineaElegible {
  id_detalle: number;
  id_producto: number;
  nombre: string;
  cantidad_comprada: number;
  cantidad_disponible: number;
  precio_unitario: number;
  monto_maximo: number;
  /** Productos vendidos por metros: la devolución aplica al corte completo. */
  venta_por_metros?: boolean;
  metros_comprados?: number | null;
  metros_disponibles?: number | null;
}

interface ElegibilidadInfo {
  elegible: boolean;
  razon: string | null;
  pedido: { id_pedido: number; total: number; estado_entrega: string | null };
  productos: LineaElegible[];
  motivos: { key: string; label: string }[];
}

const ESTADO_DEV_CLASE: Record<string, string> = {
  Solicitada: '',
  'En revisión': 'pendiente',
  Aprobada: 'ok',
  'Producto en devolución': 'pendiente',
  Recibida: 'ok',
  'Reembolso procesado': 'ok',
  Rechazada: 'err',
};

const PASOS_PIPELINE = ['Solicitada', 'En revisión', 'Aprobada', 'Producto en devolución', 'Recibida', 'Reembolso procesado'];

const PASO_DEV_CLAVE: Record<string, string> = {
  Solicitada: 'perfil.pedidos.paso.solicitada',
  'En revisión': 'perfil.pedidos.paso.enRevision',
  Aprobada: 'perfil.pedidos.paso.aprobada',
  'Producto en devolución': 'perfil.pedidos.paso.productoDevolucion',
  Recibida: 'perfil.pedidos.paso.recibida',
  'Reembolso procesado': 'perfil.pedidos.paso.reembolsoProcesado',
};

const estadoColor: Record<string, string> = {
  Pagado: '#28a745',
  'Pago pendiente': '#d3ac4d',
  'Pago rechazado': '#dc3545',
  Cancelado: '#dc3545',
};

const formatoPeso = (value: number, locale = 'es-CO') =>
  value.toLocaleString(locale, { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

const formatearFecha = (fecha?: string | null, locale = 'es-CO') => {
  if (!fecha) return '';
  try {
    return new Date(fecha).toLocaleDateString(locale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return fecha;
  }
};

const pagoEstadoInfo = (estado?: string | null): { clave: string; clase: string } => {
  switch ((estado || '').toLowerCase()) {
    case 'aprobado':
    case 'pagado':
      return { clave: 'citas.estadoPago.aprobado', clase: 'ok' };
    case 'rechazado':
      return { clave: 'citas.estadoPago.rechazado', clase: 'error' };
    case 'pendiente':
      return { clave: 'citas.estadoPago.pendiente', clase: 'pendiente' };
    default:
      return { clave: '', clase: '' };
  }
};

// Comunica con el backend mediante GET '/pedidos/mis-pedidos', POST `/pedidos/${pedidoId}/confirmar-pago`, GET `/pedidos/${pedidoId}/seguimiento` y otras peticiones de esta vista; prepara FormData para enviar campos y archivos.
const OrdersTab = ({ notify }: { notify: NotifyFn }) => {
  const { t, idioma } = useIdioma();
  const locale = idioma === 'en' ? 'en-US' : 'es-CO';
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [novedadesPedido, setNovedadesPedido] = useState<NovedadPedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [confirmando, setConfirmando] = useState<number | null>(null);
  const [seguimientoDe, setSeguimientoDe] = useState<number | null>(null);
  const [seguimiento, setSeguimiento] = useState<Seguimiento | null>(null);
  const [solicitudesDev, setSolicitudesDev] = useState<SolicitudDevolucion[]>([]);

  // ── Wizard de devolución (paso 1: productos · paso 2: motivo · paso 3: resumen) ──
  const [wizardPedido, setWizardPedido] = useState<Pedido | null>(null);
  const [elegibilidad, setElegibilidad] = useState<ElegibilidadInfo | null>(null);
  const [cargandoEleg, setCargandoEleg] = useState(false);
  const [pasoWizard, setPasoWizard] = useState(1);
  const [seleccion, setSeleccion] = useState<Record<number, number>>({});
  const [motivoSel, setMotivoSel] = useState('');
  const [motivoOtroTxt, setMotivoOtroTxt] = useState('');
  const [comentarioTxt, setComentarioTxt] = useState('');
  const [enviandoDev, setEnviandoDev] = useState(false);
  const [detalleSolAbierta, setDetalleSolAbierta] = useState<number | null>(null);

  const pollRef = useRef<number | null>(null);

  const cargarNovedadesPedido = async () => {
    try {
      const res = await api.get<NovedadPedido[]>('/novedades/cliente/novedades');
      setNovedadesPedido(res.data || []);
    } catch (err) {
      console.error('No se pudieron cargar las novedades de pedidos:', err);
    }
  };

  // Comunica con el backend mediante GET '/pedidos/mis-pedidos'.
  const cargarPedidos = async () => {
    setLoading(true);
    try {
      const [res, novedadesRes] = await Promise.all([
        api.get<Pedido[]>('/pedidos/mis-pedidos'),
        api.get<NovedadPedido[]>('/novedades/cliente/novedades').catch(() => ({ data: [] as NovedadPedido[] })),
      ]);
      setPedidos(res.data || []);
      setNovedadesPedido(novedadesRes.data || []);
      setError('');
    } catch (err: any) {
      console.error(err);
      setError(t('perfil.pedidos.errorCargar'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void cargarPedidos();
  }, []);

  // Comunica con el backend mediante POST `/pedidos/${pedidoId}/confirmar-pago`.
  const confirmarPago = async (pedidoId: number) => {
    setConfirmando(pedidoId);
    try {
      await api.post(`/pedidos/${pedidoId}/confirmar-pago`);
      notify(t('perfil.pedidos.pagoConfirmado', { id: pedidoId }), 'success');
      await cargarPedidos();
    } catch (err: any) {
      const detalle = err.response?.data?.detail || t('perfil.pedidos.errorConfirmarPago');
      notify(typeof detalle === 'string' ? detalle : t('perfil.pedidos.errorConfirmarPago'), 'error');
    } finally {
      setConfirmando(null);
    }
  };

  // Comunica con el backend mediante GET `/pedidos/${pedidoId}/seguimiento`.
  const cargarSeguimiento = async (pedidoId: number) => {
    try {
      const res = await api.get<Seguimiento>(`/pedidos/${pedidoId}/seguimiento`);
      setSeguimiento(res.data);
      return res.data;
    } catch (err) {
      console.error(err);
      setSeguimiento(null);
      return null;
    }
  };

  const alternarRastreo = async (pedidoId: number) => {
    if (seguimientoDe === pedidoId) {
      setSeguimientoDe(null);
      setSeguimiento(null);
      return;
    }
    setSeguimientoDe(pedidoId);
    await cargarSeguimiento(pedidoId);
  };

  useEffect(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (seguimientoDe == null || seguimiento?.estado_entrega !== 'En camino') return;
    const pid = seguimientoDe;
    pollRef.current = window.setInterval(() => {
      void cargarSeguimiento(pid);
    }, 15000);
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [seguimientoDe, seguimiento?.estado_entrega]);

  // Comunica con el backend mediante GET '/devoluciones/mis-solicitudes'.
  const cargarDevoluciones = async () => {
    try {
      const res = await api.get<SolicitudDevolucion[]>('/devoluciones/mis-solicitudes');
      setSolicitudesDev(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  // ── Wizard de devolución ─────────────────────────────────────────
  const abrirWizard = async (pedido: Pedido) => {
    setWizardPedido(pedido);
    setCargandoEleg(true);
    setPasoWizard(1);
    setSeleccion({});
    setMotivoSel('');
    setMotivoOtroTxt('');
    setComentarioTxt('');
    try {
      const res = await api.get<ElegibilidadInfo>(`/devoluciones/elegibilidad/${pedido.id_pedido}`);
      if (!res.data.elegible) {
        notify(res.data.razon || t('perfil.pedidos.errorElegibilidad'), 'error');
        setWizardPedido(null);
        return;
      }
      setElegibilidad(res.data);
    } catch (err: any) {
      const detalle = err.response?.data?.detail;
      notify(typeof detalle === 'string' ? detalle : t('perfil.pedidos.errorCargarDevolucion'), 'error');
      setWizardPedido(null);
    } finally {
      setCargandoEleg(false);
    }
  };

  const cerrarWizard = () => {
    setWizardPedido(null);
    setElegibilidad(null);
  };

  const cambiarCantidad = (idProducto: number, delta: number, maximo: number) => {
    setSeleccion((prev) => {
      const actual = prev[idProducto] || 0;
      const nuevo = Math.min(maximo, Math.max(0, actual + delta));
      return { ...prev, [idProducto]: nuevo };
    });
  };

  // Los productos vendidos por metros se devuelven por el CORTE COMPLETO
  // (backend PEN-09): el checkbox marca el corte entero, sin steppers.
  const esLineaMetros = (linea: LineaElegible): boolean =>
    Boolean(linea.venta_por_metros) && (linea.metros_disponibles ?? 0) > 0;

  const itemsSeleccionados = (): {
    id_producto: number;
    cantidad: number;
    metros?: number;
  }[] =>
    Object.entries(seleccion)
      .map(([pid, cant]) => {
        const linea = elegibilidad?.productos.find((p) => p.id_producto === Number(pid));
        if (linea?.venta_por_metros && linea.metros_disponibles != null) {
          return { id_producto: Number(pid), cantidad: 1, metros: linea.metros_disponibles };
        }
        return { id_producto: Number(pid), cantidad: cant };
      })
      .filter((i) => (i.metros != null ? i.cantidad > 0 : i.cantidad > 0));

  const totalSeleccionado = (): number => {
    if (!elegibilidad) return 0;
    return itemsSeleccionados().reduce((acc, it) => {
      const linea = elegibilidad.productos.find((p) => p.id_producto === it.id_producto);
      if (!linea) return acc;
      const longitud = it.metros ?? it.cantidad;
      return acc + linea.precio_unitario * longitud;
    }, 0);
  };

  const continuarPaso1 = () => {
    if (itemsSeleccionados().length === 0) {
      notify(t('perfil.pedidos.errorSeleccionaProducto'), 'error');
      return;
    }
    setPasoWizard(2);
  };

  const continuarPaso2 = () => {
    if (!motivoSel) {
      notify(t('perfil.pedidos.errorSeleccionaMotivo'), 'error');
      return;
    }
    if (motivoSel === 'otro' && motivoOtroTxt.trim().length < 10) {
      notify(t('perfil.pedidos.errorMotivoCorto'), 'error');
      return;
    }
    setPasoWizard(3);
  };

  // Comunica con el backend mediante POST '/devoluciones/solicitudes'.
  const enviarSolicitud = async () => {
    if (!wizardPedido) return;
    setEnviandoDev(true);
    try {
      await api.post('/devoluciones/solicitudes', {
        id_pedido: wizardPedido.id_pedido,
        items: itemsSeleccionados(),
        motivo_tipo: motivoSel,
        motivo_otro: motivoSel === 'otro' ? motivoOtroTxt.trim() : undefined,
        comentario: comentarioTxt.trim() || undefined,
      });
      notify(
        t('perfil.pedidos.solicitudEnviada'),
        'success',
      );
      cerrarWizard();
      await cargarDevoluciones();
    } catch (err: any) {
      const detalle = err.response?.data?.detail;
      notify(typeof detalle === 'string' ? detalle : t('perfil.pedidos.errorEnviarSolicitud'), 'error');
    } finally {
      setEnviandoDev(false);
    }
  };

  return (
    <div className="pf-tab">
      <SectionHeader
        icon={<FaBoxOpen />}
        title={t('perfil.misPedidos')}
        subtitle={t('perfil.pedidos.subtitulo')}
      />

      {loading ? (
        <div className="pf-empty"><p>{t('perfil.pedidos.cargando')}</p></div>
      ) : error ? (
        <div className="pf-empty"><p>{error}</p></div>
      ) : pedidos.length === 0 ? (
        <div className="pf-empty">
          <span className="pf-empty-icon"><FaBoxOpen /></span>
          <p>{t('perfil.pedidos.vacio')}</p>
        </div>
      ) : (
        <div className="pf-orders-list">
          {pedidos.map((pedido) => {
            const abierto = expanded === pedido.id_pedido;
            const colorEstado = estadoColor[pedido.estado] || '#d3ac4d';
            const novedadesDelPedido = novedadesPedido.filter((n) => n.id_pedido === pedido.id_pedido);
            return (
              <div className="pf-order" key={pedido.id_pedido}>
                <div className="pf-order-top">
                  <div className="pf-order-id-col">
                    <span className="pf-order-id">#{pedido.id_pedido}</span>
                    <span className="pf-order-folio">
                      {pedido.factura?.numero_factura || t('perfil.pedidos.folioPedido', { id: pedido.id_pedido })}
                      {pedido.fecha ? ` · ${formatearFecha(pedido.fecha, locale)}` : ''}
                    </span>
                    {novedadesDelPedido.length > 0 && (
                      <span className="pf-order-novedad-badge">
                        <FaCircleExclamation /> {novedadesDelPedido.length === 1
                          ? t('perfil.pedidos.novedad', { n: novedadesDelPedido.length })
                          : t('perfil.pedidos.novedades', { n: novedadesDelPedido.length })}
                      </span>
                    )}
                  </div>
                  <div className="pf-order-stats">
                    <span className="pf-status-badge" style={{ background: colorEstado }}>
                      {pedido.estado}
                    </span>
                    <span className="pf-order-total">{formatoPeso(pedido.total, locale)}</span>
                  </div>
                </div>

                <button
                  type="button"
                  className="pf-order-toggle"
                  onClick={() => {
                    const nuevo = !abierto;
                    setExpanded(nuevo ? pedido.id_pedido : null);
                    if (nuevo) {
                      void cargarNovedadesPedido();
                      if (pedidoCompletado(pedido)) {
                        void cargarDevoluciones();
                      }
                      setSeguimientoDe(null);
                      setSeguimiento(null);
                    }
                  }}
                  aria-expanded={abierto}
                >
                  {abierto ? <FaChevronUp /> : <FaChevronDown />}
                  <span>{abierto ? t('perfil.pedidos.ocultarDetalle') : t('perfil.pedidos.verDetalle')}</span>
                </button>

                {abierto && (
                  <div className="pf-order-details">
                    {novedadesDelPedido.length > 0 && (
                      <div className="pf-detail-block pf-order-novedades">
                        <h4 className="pf-detail-title"><FaCircleExclamation /> {t('perfil.pedidos.novedadesTitulo')}</h4>
                        {novedadesDelPedido.map((n) => (
                            <article className="pf-order-novedad" key={n.id_novedad}>
                              <div className="pf-order-novedad-head">
                                <strong>{n.tipo_novedad}</strong>
                                <span className="pf-order-novedad-status">{n.estado_novedad}</span>
                              </div>
                              {n.fecha_reporte && <time>{formatearFecha(n.fecha_reporte, locale)}</time>}
                              <p>{n.descripcion_novedad}</p>
                              {n.mensaje_cliente && (
                                <div className="pf-order-novedad-answer">
                                  <strong>{t('perfil.pedidos.actualizacionEquipo')}</strong>
                                  <p>{n.mensaje_cliente}</p>
                                </div>
                              )}
                              {n.solucion_cliente && (
                                <div className="pf-order-novedad-answer">
                                  <strong>{t('perfil.pedidos.solucion')}</strong>
                                  <p>{n.solucion_cliente}</p>
                                </div>
                              )}
                              {n.cupon && (
                                <div className="pf-order-novedad-answer pf-order-novedad-cupon">
                                  <strong>{t('perfil.pedidos.cuponCompensacion')}</strong>
                                  <p>
                                    <b>{n.cupon.codigo}</b> · {n.cupon.tipo_descuento === 'porcentaje'
                                      ? t('perfil.pedidos.cuponPorcentaje', { valor: n.cupon.valor_descuento })
                                      : t('perfil.pedidos.cuponMonto', { valor: Number(n.cupon.valor_descuento).toLocaleString(locale) })}
                                  </p>
                                  <small style={{ color: '#fff' }}>
                                    {n.cupon.activo && n.cupon.usos_realizados < n.cupon.usos_maximos
                                      ? t('perfil.pedidos.cuponDisponible')
                                      : t('perfil.pedidos.cuponNoDisponible')}
                                    {n.cupon.fecha_vencimiento
                                      ? t('perfil.pedidos.cuponVence', { fecha: new Date(`${n.cupon.fecha_vencimiento}T00:00:00`).toLocaleDateString(locale) })
                                      : ''}
                                  </small>
                                </div>
                              )}
                            </article>
                          ))}
                      </div>
                    )}
                    <div className="pf-detail-block">
                      <h4 className="pf-detail-title">{t('carrito.productos')}</h4>
                      <div className="pf-order-items">
                        {pedido.detalles.map((item, idx) => (
                          <Fragment key={idx}>
                            <div className="pf-order-item">
                              <span className="pf-order-item-name">
                                {item.nombre}
                                {item.es_servicio ? ` ${t('perfil.pedidos.servicio')}` : ''}
                              </span>
                              <span className="pf-order-item-qty">
                                {item.metros != null ? `× ${item.metros} m` : `× ${item.cantidad}`}
                              </span>
                              <span className="pf-order-item-price">{formatoPeso(item.subtotal, locale)}</span>
                            </div>
                          </Fragment>
                        ))}
                      </div>
                    </div>

                    {/* ── Solicitudes de devolución del pedido ── */}
                    {pedidoCompletado(pedido) &&
                      solicitudesDev.some((s) => s.id_pedido === pedido.id_pedido) && (
                        <div className="pf-detail-block">
                          <h4 className="pf-detail-title">{t('perfil.pedidos.devoluciones')}</h4>
                          <div className="pf-dev-solicitudes">
                            {solicitudesDev
                              .filter((s) => s.id_pedido === pedido.id_pedido)
                              .map((s) => {
                                const abierta = detalleSolAbierta === s.id_solicitud;
                                const pasoIdx = PASOS_PIPELINE.indexOf(s.estado);
                                return (
                                  <div className="pf-dev-sol" key={s.id_solicitud}>
                                    <button
                                      type="button"
                                      className="pf-dev-sol-head"
                                      onClick={() => setDetalleSolAbierta(abierta ? null : s.id_solicitud)}
                                    >
                                      <span className="pf-dev-sol-num">
                                        <FaRotateLeft /> {t('perfil.pedidos.devolucionNumero', { numero: s.numero })}
                                      </span>
                                      <span className={`pf-dev-estado ${ESTADO_DEV_CLASE[s.estado] || ''}`}>
                                        {s.estado}
                                      </span>
                                      {abierta ? <FaChevronUp /> : <FaChevronDown />}
                                    </button>
                                    {abierta && (
                                      <div className="pf-dev-sol-body">
                                        {PASOS_PIPELINE.includes(s.estado) ? (
                                          <div className="pf-dev-pipeline">
                                            {PASOS_PIPELINE.map((paso, i) => (
                                              <span
                                                key={paso}
                                                className={`pf-dev-paso ${i <= pasoIdx ? 'done' : ''}`}
                                                title={t(PASO_DEV_CLAVE[paso] || paso)}
                                              >
                                                <FaCircleCheck />
                                                <small>{t(PASO_DEV_CLAVE[paso] || paso)}</small>
                                              </span>
                                            ))}
                                          </div>
                                        ) : (
                                          <p className="pf-dev-rechazo">
                                            <FaCircleExclamation /> {t('perfil.pedidos.devolucionRechazada')}
                                            {s.motivo_rechazo ? `: ${s.motivo_rechazo}` : ''}
                                          </p>
                                        )}
                                        <ul className="pf-dev-items">
                                          {s.items.map((it) => (
                                            <li key={it.id_devolucion}>
                                              <span>{it.producto}</span>
                                              <span className="pf-dev-item-cant">
                                                {it.venta_por_metros && it.metros != null
                                                  ? `× ${formatMetros(it.metros)} m`
                                                  : `× ${it.cantidad}`}
                                              </span>
                                              <span>{formatoPeso(it.subtotal_linea, locale)}</span>
                                            </li>
                                          ))}
                                        </ul>
                                        <div className="pf-dev-meta">
                                          <p>
                                            <strong>{t('perfil.pedidos.motivo')}</strong> {s.motivo_label}
                                            {s.motivo_otro ? ` — ${s.motivo_otro}` : ''}
                                          </p>
                                          {s.comentario && (
                                            <p>
                                              <strong>{t('perfil.pedidos.comentario')}</strong> {s.comentario}
                                            </p>
                                          )}
                                          <p>
                                            <strong>{t('perfil.pedidos.tipo')}</strong>{' '}
                                            {s.tipo_devolucion === 'total'
                                              ? t('perfil.pedidos.devolucionCompleta')
                                              : t('perfil.pedidos.devolucionParcial')}
                                          </p>
                                          <p className="pf-dev-total">
                                            <strong>{t('perfil.pedidos.totalADevolver', { monto: formatoPeso(s.monto_total, locale) })}</strong>
                                          </p>
                                          {s.reembolso?.numero_transaccion_reembolso && (
                                            <p className="pf-dev-transaccion">
                                              {t('perfil.pedidos.reembolsoTransaccion', {
                                                estado: s.reembolso.estado,
                                                numero: s.reembolso.numero_transaccion_reembolso,
                                              })}
                                            </p>
                                          )}
                                          {s.observaciones_admin && (
                                            <p>
                                              <strong>{t('perfil.pedidos.observaciones')}</strong> {s.observaciones_admin}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}

                    {pedido.pago && (
                      <div className="pf-detail-block">
                        <h4 className="pf-detail-title">{t('perfil.pedidos.pago')}</h4>
                        <div className="pf-detail-grid">
                          <div className="pf-detail-row">
                            <span className="pf-detail-label">{t('perfil.pedidos.estadoPago')}</span>
                            <span className={`pf-pago-estado ${pagoEstadoInfo(pedido.pago.estado).clase}`}>
                              {pagoEstadoInfo(pedido.pago.estado).clave
                                ? t(pagoEstadoInfo(pedido.pago.estado).clave)
                                : pedido.pago.estado || '—'}
                            </span>
                          </div>
                          {pedido.pago.metodo_pago_nombre || pedido.pago.metodo_pago ? (
                            <div className="pf-detail-row">
                              <span className="pf-detail-label">{t('perfil.pedidos.metodoPago')}</span>
                              <span className="pf-detail-value">
                                {pedido.pago.metodo_pago_nombre || pedido.pago.metodo_pago}
                              </span>
                            </div>
                          ) : null}
                          {pedido.pago.numero_transaccion && (
                            <div className="pf-detail-row pf-detail-row-wide">
                              <span className="pf-detail-label">{t('perfil.pedidos.numeroTransaccion')}</span>
                              <span className="pf-detail-value pf-detail-code">
                                {pedido.pago.numero_transaccion}
                              </span>
                            </div>
                          )}
                          {pedido.pago.codigo_punto_pago && (
                            <div className="pf-detail-row pf-detail-row-wide">
                              <span className="pf-detail-label">{t('perfil.pedidos.codigoPago')}</span>
                              <span className="pf-detail-value pf-detail-code">
                                {pedido.pago.codigo_punto_pago}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="pf-detail-block">
                      <h4 className="pf-detail-title">{t('perfil.pedidos.entregaRastreo')}</h4>
                      <div className="pf-detail-grid">
                        <div className="pf-detail-row">
                          <span className="pf-detail-label">{t('perfil.pedidos.fechaEntrega')}</span>
                          <span className="pf-detail-value">
                            {pedido.fecha_entrega
                              ? `${new Date(pedido.fecha_entrega).toLocaleDateString(locale)}`
                              : t('perfil.pedidos.porProgramar')}
                          </span>
                        </div>
                        {(pedido.hora_entrega || pedido.hora_entrega_fin) && (
                          <div className="pf-detail-row">
                            <span className="pf-detail-label">{t('perfil.pedidos.franjaEntrega')}</span>
                            <span className="pf-detail-value">
                              {pedido.hora_entrega_fin
                                ? t('perfil.pedidos.entreHoras', { inicio: pedido.hora_entrega || '', fin: pedido.hora_entrega_fin })
                                : pedido.hora_entrega}
                            </span>
                          </div>
                        )}
                        <div className="pf-detail-row">
                          <span className="pf-detail-label">{t('perfil.pedidos.estadoEntrega')}</span>
                          <span className="pf-detail-value">{pedido.estado_entrega || '—'}</span>
                        </div>
                        {pedido.nombre_tecnico_entrega && (
                          <div className="pf-detail-row">
                            <span className="pf-detail-label">{t('citas.tecnicoAsignado')}</span>
                            <span className="pf-order-tecnico-entrega">
                              {pedido.foto_tecnico_entrega && (
                                <img
                                  src={pedido.foto_tecnico_entrega}
                                  alt={pedido.nombre_tecnico_entrega}
                                  onError={(e) => (e.currentTarget.style.display = 'none')}
                                />
                              )}
                              {pedido.nombre_tecnico_entrega}
                            </span>
                          </div>
                        )}
                        {pedido.telefono_tecnico_entrega && (
                          <div className="pf-detail-row">
                            <span className="pf-detail-label">{t('perfil.pedidos.telefonoTecnico')}</span>
                            <span className="pf-detail-value">{pedido.telefono_tecnico_entrega}</span>
                          </div>
                        )}
                      </div>
                      {seguimientoDe === pedido.id_pedido && seguimiento && (
                        <div className="pf-tracker">
                          <div className="pf-tracker-pasos">
                            {seguimiento.pasos.map((p) => (
                              <div key={p.paso} className={`pf-tracker-paso ${p.completado ? 'done' : ''}`}>
                                <span className="pf-tracker-dot">{p.completado ? <FaCircleCheck /> : null}</span>
                                <span>{p.paso}</span>
                              </div>
                            ))}
                          </div>
                          {seguimiento.tecnico?.nombre && (
                            <p className="pf-tracker-tecnico">
                              {t('perfil.pedidos.tuTecnico', { nombre: seguimiento.tecnico.nombre })}
                              {seguimiento.tecnico.telefono ? ` · ${seguimiento.tecnico.telefono}` : ''}
                            </p>
                          )}
                          {seguimiento.rango_entrega && (
                            <p className="pf-tracker-actualizado">
                              {t('perfil.pedidos.franjaEntregaValor', { rango: seguimiento.rango_entrega })}
                            </p>
                          )}
                          {seguimiento.estado_entrega === 'En camino' &&
                            (seguimiento.ubicacion ? (
                              <>
                                <p className="pf-tracker-actualizado">
                                  {t('perfil.pedidos.ubicacionActualizada', {
                                    hora: new Date(seguimiento.ubicacion.actualizado_en).toLocaleTimeString(locale, {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    }),
                                  })}
                                </p>
                                <iframe
                                  title={t('perfil.pedidos.ubicacionTecnico')}
                                  className="pf-tracker-mapa"
                                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${seguimiento.ubicacion.longitud - 0.008}%2C${seguimiento.ubicacion.latitud - 0.005}%2C${seguimiento.ubicacion.longitud + 0.008}%2C${seguimiento.ubicacion.latitud + 0.005}&layer=mapnik&marker=${seguimiento.ubicacion.latitud}%2C${seguimiento.ubicacion.longitud}`}
                                />
                              </>
                            ) : (
                              <p className="pf-tracker-actualizado">
                                {t('perfil.pedidos.sinUbicacion')}
                              </p>
                            ))}
                        </div>
                      )}
                      {seguimientoDe === pedido.id_pedido && !seguimiento && (
                        <p className="pf-tracker-actualizado">{t('perfil.pedidos.cargandoRastreo')}</p>
                      )}
                      <button
                        type="button"
                        className="pf-rastreo-btn"
                        onClick={() => alternarRastreo(pedido.id_pedido)}
                      >
                        <FaLocationDot />
                        {seguimientoDe === pedido.id_pedido ? t('perfil.pedidos.ocultarRastreo') : t('perfil.pedidos.rastrear')}
                      </button>
                    </div>

                    <div className="pf-order-acciones">
                      {pedido.estado === 'Pago pendiente' && (
                        <button
                          type="button"
                          className="pf-order-confirmar"
                          onClick={() => confirmarPago(pedido.id_pedido)}
                          disabled={confirmando === pedido.id_pedido}
                        >
                          <FaCircleCheck />
                          {confirmando === pedido.id_pedido ? t('perfil.pedidos.confirmando') : t('perfil.pedidos.confirmarPago')}
                        </button>
                      )}
                      {pedido.factura?.pdf_url && (
                        <button
                          type="button"
                          className="pf-order-factura"
                          onClick={() => pedido.factura?.pdf_url && descargarFactura(pedido.factura.pdf_url)}
                        >
                          <FaFilePdf /> {t('perfil.pedidos.descargarFactura')}
                        </button>
                      )}
                    </div>

                    {pedidoCompletado(pedido) &&
                      pedido.detalles.some((d) => !d.es_servicio && d.id_producto_d != null) && (
                        <div className="pf-dev-cta">
                          <button
                            type="button"
                            className="pf-dev-btn"
                            onClick={() => abrirWizard(pedido)}
                          >
                            <FaRotateLeft /> {t('perfil.pedidos.solicitarDevolucion')}
                          </button>
                          <span className="pf-dev-cta-hint">
                            {t('perfil.pedidos.devolucionHint')}
                          </span>
                        </div>
                      )}

                    <div className="pf-order-detail-footer">
                      <strong className="pf-order-total-big">{t('perfil.pedidos.total', { monto: formatoPeso(pedido.total, locale) })}</strong>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal: wizard de solicitud de devolución ── */}
      {wizardPedido && (
        <ModalPortal>
          <div className="pf-modal-backdrop" onClick={cerrarWizard}>
            <div className="pf-modal pf-modal-dev" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('perfil.pedidos.modalTitulo', { id: wizardPedido.id_pedido })}>
              <div className="pf-modal-header">
                <h3>
                  <FaRotateLeft /> {t('perfil.pedidos.modalTitulo', { id: wizardPedido.id_pedido })}
                </h3>
                <button type="button" className="pf-modal-close" onClick={cerrarWizard} aria-label={t('common.cerrar')}>
                  <FaXmark />
                </button>
              </div>

            {cargandoEleg || !elegibilidad ? (
              <p className="pf-dev-cargando">{t('perfil.pedidos.cargandoProductos')}</p>
            ) : (
              <>
                <div className="pf-dev-pasos">
                  {['carrito.productos', 'perfil.pedidos.motivoPaso', 'perfil.pedidos.resumen'].map((clave, i) => (
                    <span key={clave} className={`pf-dev-paso-ind ${pasoWizard >= i + 1 ? 'activo' : ''}`}>
                      {i + 1}. {t(clave)}
                    </span>
                  ))}
                </div>

                {pasoWizard === 1 && (
                  <div className="pf-dev-body">
                    <p className="pf-dev-instruccion">
                      {t('perfil.pedidos.seleccionaProductos')}
                    </p>
                    {elegibilidad.productos.map((linea) => {
                      const cant = seleccion[linea.id_producto] || 0;
                      const agotada = linea.cantidad_disponible === 0;
                      const porMetros = esLineaMetros(linea);
                      return (
                        <label
                          key={linea.id_producto}
                          className={`pf-dev-linea ${cant > 0 ? 'seleccionada' : ''} ${agotada ? 'agotada' : ''}`}
                        >
                          <input
                            type="checkbox"
                            disabled={agotada}
                            checked={cant > 0}
                            onChange={(e) =>
                              setSeleccion((prev) => ({
                                ...prev,
                                [linea.id_producto]: e.target.checked ? Math.min(1, linea.cantidad_disponible) : 0,
                              }))
                            }
                          />
                          <span className="pf-dev-linea-info">
                            <strong>{linea.nombre}</strong>
                            <small>
                              {porMetros
                                ? t('perfil.pedidos.compradosPrecioMetros', {
                                    metros: formatMetros(linea.metros_disponibles ?? 0),
                                    precio: formatoPeso(linea.precio_unitario, locale),
                                  })
                                : t('perfil.pedidos.compradosPrecio', {
                                    comprados: linea.cantidad_comprada,
                                    precio: formatoPeso(linea.precio_unitario, locale),
                                  })}
                            </small>
                            {porMetros && (
                              <small>
                                {t('perfil.pedidos.corteCompleto', {
                                  metros: formatMetros(linea.metros_disponibles ?? 0),
                                })}
                                {' · '}
                                {t('perfil.pedidos.corteCompletoHint')}
                              </small>
                            )}
                          </span>
                          {agotada ? (
                            <span className="pf-dev-agotada">{t('perfil.pedidos.yaDevuelto')}</span>
                          ) : porMetros ? (
                            // Corte completo: todo o nada; el backend valida la cantidad exacta.
                            <strong className="pf-dev-metros">
                              {formatMetros(linea.metros_disponibles ?? 0)} m
                            </strong>
                          ) : (
                            <span className="pf-dev-cantidades">
                              <button
                                type="button"
                                aria-label={t('perfil.pedidos.quitarUnidad')}
                                disabled={cant === 0}
                                onClick={() => cambiarCantidad(linea.id_producto, -1, linea.cantidad_disponible)}
                              >
                                <FaMinus />
                              </button>
                              <strong>{cant}</strong>
                              <button
                                type="button"
                                aria-label={t('perfil.pedidos.agregarUnidad')}
                                disabled={cant >= linea.cantidad_disponible}
                                onClick={() => cambiarCantidad(linea.id_producto, 1, linea.cantidad_disponible)}
                              >
                                <FaPlus />
                              </button>
                            </span>
                          )}
                        </label>
                      );
                    })}
                    <div className="pf-dev-subtotal">
                      <span>{t('perfil.pedidos.subtotalDevolver')}</span>
                      <strong>{formatoPeso(totalSeleccionado(), locale)}</strong>
                    </div>
                    <div className="pf-form-actions">
                      <button type="button" className="pf-btn pf-btn-ghost" onClick={cerrarWizard}>
                        {t('common.cancelar')}
                      </button>
                      <button type="button" className="pf-btn pf-btn-primary" onClick={continuarPaso1}>
                        {t('perfil.pedidos.continuarDevolucion')}
                      </button>
                    </div>
                  </div>
                )}

                {pasoWizard === 2 && (
                  <div className="pf-dev-body">
                    <p className="pf-dev-instruccion">{t('perfil.pedidos.motivoPregunta')}</p>
                    <div className="pf-dev-motivos">
                      {(elegibilidad.motivos || []).map((m) => (
                        <label key={m.key} className={`pf-dev-motivo ${motivoSel === m.key ? 'sel' : ''}`}>
                          <input
                            type="radio"
                            name="motivo-dev"
                            checked={motivoSel === m.key}
                            onChange={() => setMotivoSel(m.key)}
                          />
                          {m.label}
                        </label>
                      ))}
                    </div>
                    {motivoSel === 'otro' && (
                      <textarea
                        className="pf-dev-textarea"
                        placeholder={t('perfil.pedidos.motivoPlaceholder')}
                        maxLength={1000}
                        value={motivoOtroTxt}
                        onChange={(e) => setMotivoOtroTxt(e.target.value)}
                      />
                    )}
                    <textarea
                      className="pf-dev-textarea"
                      placeholder={t('perfil.pedidos.comentarioPlaceholder')}
                      maxLength={1000}
                      value={comentarioTxt}
                      onChange={(e) => setComentarioTxt(e.target.value)}
                    />
                    <div className="pf-form-actions">
                      <button type="button" className="pf-btn pf-btn-ghost" onClick={() => setPasoWizard(1)}>
                        {t('perfil.pedidos.atras')}
                      </button>
                      <button type="button" className="pf-btn pf-btn-primary" onClick={continuarPaso2}>
                        {t('perfil.pedidos.verResumen')}
                      </button>
                    </div>
                  </div>
                )}

                {pasoWizard === 3 && (
                  <div className="pf-dev-body">
                    <h4 className="pf-dev-resumen-titulo">{t('perfil.pedidos.solicitudDevolucion')}</h4>
                    <p className="pf-dev-resumen-pedido">
                      {t('perfil.pedidos.pedidoLabel')} <strong>#{wizardPedido.id_pedido}</strong>
                    </p>
                    <ul className="pf-dev-items">
                      {itemsSeleccionados().map((it) => {
                        const linea = elegibilidad.productos.find((p) => p.id_producto === it.id_producto);
                        if (!linea) return null;
                        const porMetros = it.metros != null;
                        const longitud = it.metros ?? it.cantidad;
                        return (
                          <li key={it.id_producto}>
                            <span>{linea.nombre}</span>
                            <span className="pf-dev-item-cant">
                              {porMetros
                                ? `${formatMetros(longitud)} m`
                                : it.cantidad === 1
                                  ? t('perfil.pedidos.unidad', { n: it.cantidad })
                                  : t('perfil.pedidos.unidades', { n: it.cantidad })}
                            </span>
                            <span>{formatoPeso(linea.precio_unitario * longitud, locale)}</span>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="pf-dev-total-estimado">
                      {t('perfil.pedidos.totalEstimado', { monto: formatoPeso(totalSeleccionado(), locale) })}
                    </p>
                    <p className="pf-dev-nota">
                      {t('perfil.pedidos.notaReembolso')}
                    </p>
                    <div className="pf-form-actions">
                      <button type="button" className="pf-btn pf-btn-ghost" onClick={() => setPasoWizard(2)}>
                        {t('perfil.pedidos.atras')}
                      </button>
                      <button
                        type="button"
                        className="pf-btn pf-btn-primary"
                        disabled={enviandoDev}
                        onClick={enviarSolicitud}
                      >
                        {enviandoDev ? t('perfil.pedidos.enviando') : t('perfil.pedidos.solicitarDevolucion')}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
};

export default OrdersTab;
