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
  FaStar,
  FaXmark,
} from 'react-icons/fa6';
import api, { descargarFactura } from '@services/api';
import SectionHeader from './SectionHeader';
import { NotifyFn } from './PersonalTab';

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

interface CalificacionProducto {
  id_calificacion_producto: number;
  id_producto: number;
  calificacion: number;
  comentario?: string | null;
}

interface ItemDevolucion {
  id_devolucion: number;
  id_producto: number;
  producto: string;
  cantidad: number;
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

const estadoColor: Record<string, string> = {
  Pagado: '#28a745',
  'Pago pendiente': '#d3ac4d',
  'Pago rechazado': '#dc3545',
  Cancelado: '#dc3545',
};

const formatoPeso = (value: number) =>
  value.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

const formatearFecha = (fecha?: string | null) => {
  if (!fecha) return '';
  try {
    return new Date(fecha).toLocaleDateString('es-CO', {
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

const pagoEstadoInfo = (estado?: string | null): { texto: string; clase: string } => {
  switch ((estado || '').toLowerCase()) {
    case 'aprobado':
    case 'pagado':
      return { texto: 'Pago aprobado', clase: 'ok' };
    case 'rechazado':
      return { texto: 'Pago rechazado', clase: 'error' };
    case 'pendiente':
      return { texto: 'Pago pendiente', clase: 'pendiente' };
    default:
      return { texto: estado || '—', clase: '' };
  }
};

// El pedido está completado cuando el técnico marcó la entrega como
// "Entregado" o cuando la cita de instalación quedó "Finalizada".
const pedidoCompletado = (pedido: Pedido): boolean =>
  pedido.productos_calificables === true ||
  pedido.estado_entrega === 'Entregado' ||
  pedido.cita?.estado === 'Finalizada';

// Comunica con el backend mediante GET '/pedidos/mis-pedidos', POST `/pedidos/${pedidoId}/confirmar-pago`, GET `/pedidos/${pedidoId}/seguimiento` y otras peticiones de esta vista; prepara FormData para enviar campos y archivos.
const OrdersTab = ({ notify }: { notify: NotifyFn }) => {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [confirmando, setConfirmando] = useState<number | null>(null);
  const [seguimientoDe, setSeguimientoDe] = useState<number | null>(null);
  const [seguimiento, setSeguimiento] = useState<Seguimiento | null>(null);
  const [califsPorProducto, setCalifsPorProducto] = useState<Record<number, CalificacionProducto>>({});
  const [solicitudesDev, setSolicitudesDev] = useState<SolicitudDevolucion[]>([]);
  const [ratingSel, setRatingSel] = useState<Record<number, number>>({});
  const [comentarioSel, setComentarioSel] = useState<Record<number, string>>({});
  const [guardandoCalif, setGuardandoCalif] = useState<number | null>(null);

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

  const fotoCalifRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const fotosCalif = useRef<Record<number, File>>({});
  const pollRef = useRef<number | null>(null);

  // Comunica con el backend mediante GET '/pedidos/mis-pedidos'.
  const cargarPedidos = async () => {
    setLoading(true);
    try {
      const res = await api.get<Pedido[]>('/pedidos/mis-pedidos');
      setPedidos(res.data || []);
      setError('');
    } catch (err: any) {
      console.error(err);
      setError('No se pudieron cargar tus pedidos. Intenta más tarde.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarPedidos();
  }, []);

  // Comunica con el backend mediante POST `/pedidos/${pedidoId}/confirmar-pago`.
  const confirmarPago = async (pedidoId: number) => {
    setConfirmando(pedidoId);
    try {
      await api.post(`/pedidos/${pedidoId}/confirmar-pago`);
      notify(`Pago del pedido #${pedidoId} confirmado. ¡Gracias!`, 'success');
      await cargarPedidos();
    } catch (err: any) {
      const detalle = err.response?.data?.detail || 'No se pudo confirmar el pago.';
      notify(typeof detalle === 'string' ? detalle : 'No se pudo confirmar el pago.', 'error');
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
      cargarSeguimiento(pid);
    }, 15000);
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [seguimientoDe, seguimiento?.estado_entrega]);

  // Comunica con el backend mediante GET `/calificaciones/producto/pedido/${pedido.id_pedido}`, GET '/devoluciones/mis-solicitudes'.
  const cargarResenas = async (pedido: Pedido) => {
    if (!pedidoCompletado(pedido)) return;
    try {
      const res = await api.get<{ calificaciones: CalificacionProducto[] }>(
        `/calificaciones/producto/pedido/${pedido.id_pedido}`,
      );
      const mapa: Record<number, CalificacionProducto> = {};
      (res.data?.calificaciones || []).forEach((c) => {
        mapa[c.id_producto] = c;
      });
      setCalifsPorProducto(mapa);
    } catch (err) {
      console.error(err);
    }
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
        notify(res.data.razon || 'Este pedido no es elegible para devolución.', 'error');
        setWizardPedido(null);
        return;
      }
      setElegibilidad(res.data);
    } catch (err: any) {
      const detalle = err.response?.data?.detail;
      notify(typeof detalle === 'string' ? detalle : 'No se pudo cargar la devolución.', 'error');
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

  const itemsSeleccionados = (): { id_producto: number; cantidad: number }[] =>
    Object.entries(seleccion)
      .map(([pid, cant]) => ({ id_producto: Number(pid), cantidad: cant }))
      .filter((i) => i.cantidad > 0);

  const totalSeleccionado = (): number => {
    if (!elegibilidad) return 0;
    return itemsSeleccionados().reduce((acc, it) => {
      const linea = elegibilidad.productos.find((p) => p.id_producto === it.id_producto);
      return acc + (linea ? linea.precio_unitario * it.cantidad : 0);
    }, 0);
  };

  const continuarPaso1 = () => {
    if (itemsSeleccionados().length === 0) {
      notify('Selecciona al menos un producto para devolver.', 'error');
      return;
    }
    setPasoWizard(2);
  };

  const continuarPaso2 = () => {
    if (!motivoSel) {
      notify('Selecciona el motivo de la devolución.', 'error');
      return;
    }
    if (motivoSel === 'otro' && motivoOtroTxt.trim().length < 10) {
      notify('Cuéntanos brevemente el motivo (mínimo 10 caracteres).', 'error');
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
        `Tu solicitud de devolución fue enviada. Recibirás una notificación con el estado.`,
        'success',
      );
      cerrarWizard();
      await cargarResenas(wizardPedido);
    } catch (err: any) {
      const detalle = err.response?.data?.detail;
      notify(typeof detalle === 'string' ? detalle : 'No se pudo enviar la solicitud.', 'error');
    } finally {
      setEnviandoDev(false);
    }
  };

  // Comunica con el backend mediante POST '/calificaciones/producto', POST `/calificaciones/producto/${pedido.id_pedido}/${item.id_producto_d}/foto`; prepara FormData para enviar campos y archivos.
  const guardarCalificacion = async (pedido: Pedido, item: Detalle) => {
    if (!item.id_producto_d) return;
    const nota = ratingSel[item.id_producto_d];
    if (!nota) {
      notify('Selecciona una cantidad de estrellas antes de enviar.', 'error');
      return;
    }
    setGuardandoCalif(item.id_producto_d);
    try {
      await api.post('/calificaciones/producto', {
        id_pedido: pedido.id_pedido,
        id_producto: item.id_producto_d,
        calificacion: nota,
        comentario: comentarioSel[item.id_producto_d]?.trim() || undefined,
      });
      // Subir foto si el cliente seleccionó una.
      const foto = fotosCalif.current[item.id_producto_d];
      if (foto) {
        const fd = new FormData();
        fd.append('file', foto);
        try {
          await api.post(
            `/calificaciones/producto/${pedido.id_pedido}/${item.id_producto_d}/foto`,
            fd,
          );
        } catch {
          /* la foto es opcional; si falla no bloquea la calificación */
        }
        delete fotosCalif.current[item.id_producto_d];
      }
      notify('¡Gracias por tu calificación!', 'success');
      await cargarResenas(pedido);
    } catch (err: any) {
      const detalle = err.response?.data?.detail;
      notify(typeof detalle === 'string' ? detalle : 'No se pudo enviar tu calificación.', 'error');
    } finally {
      setGuardandoCalif(null);
    }
  };

  return (
    <div className="pf-tab">
      <SectionHeader
        icon={<FaBoxOpen />}
        title="Mis pedidos"
        subtitle="Consulta el historial de tus compras, su estado y descarga tus facturas."
      />

      {loading ? (
        <div className="pf-empty"><p>Cargando tus pedidos...</p></div>
      ) : error ? (
        <div className="pf-empty"><p>{error}</p></div>
      ) : pedidos.length === 0 ? (
        <div className="pf-empty">
          <span className="pf-empty-icon"><FaBoxOpen /></span>
          <p>No tienes pedidos todavía. Cuando realices una compra, aparecerá aquí.</p>
        </div>
      ) : (
        <div className="pf-orders-list">
          {pedidos.map((pedido) => {
            const abierto = expanded === pedido.id_pedido;
            const colorEstado = estadoColor[pedido.estado] || '#d3ac4d';
            return (
              <div className="pf-order" key={pedido.id_pedido}>
                <div className="pf-order-top">
                  <div className="pf-order-id-col">
                    <span className="pf-order-id">#{pedido.id_pedido}</span>
                    <span className="pf-order-folio">
                      {pedido.factura?.numero_factura || `Pedido ${pedido.id_pedido}`}
                      {pedido.fecha ? ` · ${formatearFecha(pedido.fecha)}` : ''}
                    </span>
                  </div>
                  <div className="pf-order-stats">
                    <span className="pf-status-badge" style={{ background: colorEstado }}>
                      {pedido.estado}
                    </span>
                    <span className="pf-order-total">{formatoPeso(pedido.total)}</span>
                  </div>
                </div>

                <button
                  type="button"
                  className="pf-order-toggle"
                  onClick={() => {
                    const nuevo = !abierto;
                    setExpanded(nuevo ? pedido.id_pedido : null);
                    if (nuevo && pedidoCompletado(pedido)) {
                      cargarResenas(pedido);
                      setSeguimientoDe(null);
                      setSeguimiento(null);
                    }
                  }}
                  aria-expanded={abierto}
                >
                  {abierto ? <FaChevronUp /> : <FaChevronDown />}
                  <span>{abierto ? 'Ocultar detalle' : 'Ver detalle del pedido'}</span>
                </button>

                {abierto && (
                  <div className="pf-order-details">
                    <div className="pf-detail-block">
                      <h4 className="pf-detail-title">Productos</h4>
                      <div className="pf-order-items">
                        {pedido.detalles.map((item, idx) => {
                          const esProducto = !item.es_servicio && item.id_producto_d != null;
                          const calif = esProducto ? califsPorProducto[item.id_producto_d!] : undefined;
                          return (
                            <Fragment key={idx}>
                              <div className="pf-order-item">
                                <span className="pf-order-item-name">
                                  {item.nombre}
                                  {item.es_servicio ? ' (servicio)' : ''}
                                </span>
                                <span className="pf-order-item-qty">
                                  {item.metros != null ? `× ${item.metros} m` : `× ${item.cantidad}`}
                                </span>
                                <span className="pf-order-item-price">{formatoPeso(item.subtotal)}</span>
                              </div>
                              {esProducto && pedidoCompletado(pedido) && (
                                <div className="pf-resena">
                                  {calif ? (
                                    <div className="pf-resena-guardada">
                                      <span className="pf-stars-static" aria-label={`${calif.calificacion} de 5`}>
                                        {[1, 2, 3, 4, 5].map((s) => (
                                          <FaStar key={s} className={s <= calif.calificacion ? 'on' : ''} />
                                        ))}
                                      </span>
                                      Tu calificación
                                      {calif.comentario ? <em>“{calif.comentario}”</em> : null}
                                    </div>
                                  ) : (
                                    <div className="pf-resena-form">
                                      <div className="pf-resena-row">
                                        <span className="pf-resena-label">Califica este producto:</span>
                                        <span className="pf-stars-picker">
                                          {[1, 2, 3, 4, 5].map((s) => (
                                            <button
                                              key={s}
                                              type="button"
                                              aria-label={`${s} estrellas`}
                                              className={(ratingSel[item.id_producto_d!] ?? 0) >= s ? 'on' : ''}
                                              onClick={() =>
                                                setRatingSel((prev) => ({ ...prev, [item.id_producto_d!]: s }))
                                              }
                                            >
                                              <FaStar />
                                            </button>
                                          ))}
                                        </span>
                                      </div>
                                      <input
                                        type="text"
                                        className="pf-resena-comentario"
                                        placeholder="Cuéntanos tu experiencia (opcional)"
                                        maxLength={500}
                                        value={comentarioSel[item.id_producto_d!] || ''}
                                        onChange={(e) =>
                                          setComentarioSel((prev) => ({
                                            ...prev,
                                            [item.id_producto_d!]: e.target.value,
                                          }))
                                        }
                                      />
                                      <div className="pf-resena-actions">
                                        <button
                                          type="button"
                                          className="pf-resena-guardar"
                                          disabled={guardandoCalif === item.id_producto_d}
                                          onClick={() => guardarCalificacion(pedido, item)}
                                        >
                                          {guardandoCalif === item.id_producto_d ? 'Enviando...' : 'Enviar'}
                                        </button>
                                        <input
                                          ref={(el) => { fotoCalifRefs.current[item.id_producto_d!] = el; }}
                                          type="file"
                                          accept="image/*"
                                          capture="environment"
                                          style={{ display: 'none' }}
                                          onChange={(ev) => {
                                            if (ev.target.files?.[0]) {
                                              fotosCalif.current[item.id_producto_d!] = ev.target.files[0];
                                            }
                                            ev.target.value = '';
                                          }}
                                        />
                                        <button
                                          type="button"
                                          className="pf-btn pf-btn-ghost"
                                          title="Adjuntar foto del producto"
                                          onClick={() => fotoCalifRefs.current[item.id_producto_d!]?.click()}
                                        >
                                          📷
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </Fragment>
                          );
                        })}
                      </div>
                    </div>

                    {/* ── Solicitudes de devolución del pedido ── */}
                    {pedidoCompletado(pedido) &&
                      solicitudesDev.some((s) => s.id_pedido === pedido.id_pedido) && (
                        <div className="pf-detail-block">
                          <h4 className="pf-detail-title">Devoluciones</h4>
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
                                        <FaRotateLeft /> Devolución {s.numero}
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
                                                title={paso}
                                              >
                                                <FaCircleCheck />
                                                <small>{paso}</small>
                                              </span>
                                            ))}
                                          </div>
                                        ) : (
                                          <p className="pf-dev-rechazo">
                                            <FaCircleExclamation /> Devolución rechazada
                                            {s.motivo_rechazo ? `: ${s.motivo_rechazo}` : ''}
                                          </p>
                                        )}
                                        <ul className="pf-dev-items">
                                          {s.items.map((it) => (
                                            <li key={it.id_devolucion}>
                                              <span>{it.producto}</span>
                                              <span className="pf-dev-item-cant">× {it.cantidad}</span>
                                              <span>{formatoPeso(it.subtotal_linea)}</span>
                                            </li>
                                          ))}
                                        </ul>
                                        <div className="pf-dev-meta">
                                          <p>
                                            <strong>Motivo:</strong> {s.motivo_label}
                                            {s.motivo_otro ? ` — ${s.motivo_otro}` : ''}
                                          </p>
                                          {s.comentario && (
                                            <p>
                                              <strong>Comentario:</strong> {s.comentario}
                                            </p>
                                          )}
                                          <p>
                                            <strong>Tipo:</strong>{' '}
                                            {s.tipo_devolucion === 'total'
                                              ? 'Devolución completa del pedido'
                                              : 'Devolución parcial'}
                                          </p>
                                          <p className="pf-dev-total">
                                            <strong>Total a devolver: {formatoPeso(s.monto_total)}</strong>
                                          </p>
                                          {s.reembolso?.numero_transaccion_reembolso && (
                                            <p className="pf-dev-transaccion">
                                              Reembolso {s.reembolso.estado} · Transacción{' '}
                                              {s.reembolso.numero_transaccion_reembolso}
                                            </p>
                                          )}
                                          {s.observaciones_admin && (
                                            <p>
                                              <strong>Observaciones:</strong> {s.observaciones_admin}
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
                        <h4 className="pf-detail-title">Pago</h4>
                        <div className="pf-detail-grid">
                          <div className="pf-detail-row">
                            <span className="pf-detail-label">Estado del pago</span>
                            <span className={`pf-pago-estado ${pagoEstadoInfo(pedido.pago.estado).clase}`}>
                              {pagoEstadoInfo(pedido.pago.estado).texto}
                            </span>
                          </div>
                          {pedido.pago.metodo_pago_nombre || pedido.pago.metodo_pago ? (
                            <div className="pf-detail-row">
                              <span className="pf-detail-label">Método de pago</span>
                              <span className="pf-detail-value">
                                {pedido.pago.metodo_pago_nombre || pedido.pago.metodo_pago}
                              </span>
                            </div>
                          ) : null}
                          {pedido.pago.numero_transaccion && (
                            <div className="pf-detail-row pf-detail-row-wide">
                              <span className="pf-detail-label">Número de transacción</span>
                              <span className="pf-detail-value pf-detail-code">
                                {pedido.pago.numero_transaccion}
                              </span>
                            </div>
                          )}
                          {pedido.pago.codigo_punto_pago && (
                            <div className="pf-detail-row pf-detail-row-wide">
                              <span className="pf-detail-label">Código de pago</span>
                              <span className="pf-detail-value pf-detail-code">
                                {pedido.pago.codigo_punto_pago}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="pf-detail-block">
                      <h4 className="pf-detail-title">Entrega y rastreo</h4>
                      <div className="pf-detail-grid">
                        <div className="pf-detail-row">
                          <span className="pf-detail-label">Fecha de entrega</span>
                          <span className="pf-detail-value">
                            {pedido.fecha_entrega
                              ? `${new Date(pedido.fecha_entrega).toLocaleDateString('es-CO')}`
                              : 'Por programar'}
                          </span>
                        </div>
                        {(pedido.hora_entrega || pedido.hora_entrega_fin) && (
                          <div className="pf-detail-row">
                            <span className="pf-detail-label">Franja de entrega</span>
                            <span className="pf-detail-value">
                              {pedido.hora_entrega_fin
                                ? `Entre ${pedido.hora_entrega} y ${pedido.hora_entrega_fin}`
                                : pedido.hora_entrega}
                            </span>
                          </div>
                        )}
                        <div className="pf-detail-row">
                          <span className="pf-detail-label">Estado de la entrega</span>
                          <span className="pf-detail-value">{pedido.estado_entrega || '—'}</span>
                        </div>
                        {pedido.nombre_tecnico_entrega && (
                          <div className="pf-detail-row">
                            <span className="pf-detail-label">Técnico asignado</span>
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
                            <span className="pf-detail-label">Teléfono del técnico</span>
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
                              Tu técnico: {seguimiento.tecnico.nombre}
                              {seguimiento.tecnico.telefono ? ` · ${seguimiento.tecnico.telefono}` : ''}
                            </p>
                          )}
                          {seguimiento.rango_entrega && (
                            <p className="pf-tracker-actualizado">
                              Franja de entrega: {seguimiento.rango_entrega}
                            </p>
                          )}
                          {seguimiento.estado_entrega === 'En camino' &&
                            (seguimiento.ubicacion ? (
                              <>
                                <p className="pf-tracker-actualizado">
                                  Ubicación actualizada a las{' '}
                                  {new Date(seguimiento.ubicacion.actualizado_en).toLocaleTimeString('es-CO', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </p>
                                <iframe
                                  title="Ubicación del técnico"
                                  className="pf-tracker-mapa"
                                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${seguimiento.ubicacion.longitud - 0.008}%2C${seguimiento.ubicacion.latitud - 0.005}%2C${seguimiento.ubicacion.longitud + 0.008}%2C${seguimiento.ubicacion.latitud + 0.005}&layer=mapnik&marker=${seguimiento.ubicacion.latitud}%2C${seguimiento.ubicacion.longitud}`}
                                />
                              </>
                            ) : (
                              <p className="pf-tracker-actualizado">
                                El técnico aún no ha compartido su ubicación.
                              </p>
                            ))}
                        </div>
                      )}
                      {seguimientoDe === pedido.id_pedido && !seguimiento && (
                        <p className="pf-tracker-actualizado">Cargando rastreo...</p>
                      )}
                      <button
                        type="button"
                        className="pf-rastreo-btn"
                        onClick={() => alternarRastreo(pedido.id_pedido)}
                      >
                        <FaLocationDot />
                        {seguimientoDe === pedido.id_pedido ? 'Ocultar rastreo' : 'Rastrear mi pedido'}
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
                          {confirmando === pedido.id_pedido ? 'Confirmando...' : 'Confirmar pago'}
                        </button>
                      )}
                      {pedido.factura?.pdf_url && (
                        <button
                          type="button"
                          className="pf-order-factura"
                          onClick={() => pedido.factura?.pdf_url && descargarFactura(pedido.factura.pdf_url)}
                        >
                          <FaFilePdf /> Descargar factura PDF
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
                            <FaRotateLeft /> Solicitar devolución
                          </button>
                          <span className="pf-dev-cta-hint">
                            Puedes devolver uno, varios o todos los productos del pedido.
                          </span>
                        </div>
                      )}

                    <div className="pf-order-detail-footer">
                      <strong className="pf-order-total-big">Total: {formatoPeso(pedido.total)}</strong>
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
        <div className="pf-modal-backdrop" onClick={cerrarWizard}>
          <div className="pf-modal pf-modal-dev" onClick={(e) => e.stopPropagation()}>
            <div className="pf-modal-header">
              <h3>
                <FaRotateLeft /> Solicitar devolución · Pedido #{wizardPedido.id_pedido}
              </h3>
              <button type="button" className="pf-modal-close" onClick={cerrarWizard} aria-label="Cerrar">
                <FaXmark />
              </button>
            </div>

            {cargandoEleg || !elegibilidad ? (
              <p className="pf-dev-cargando">Cargando productos del pedido...</p>
            ) : (
              <>
                <div className="pf-dev-pasos">
                  {['Productos', 'Motivo', 'Resumen'].map((nombre, i) => (
                    <span key={nombre} className={`pf-dev-paso-ind ${pasoWizard >= i + 1 ? 'activo' : ''}`}>
                      {i + 1}. {nombre}
                    </span>
                  ))}
                </div>

                {pasoWizard === 1 && (
                  <div className="pf-dev-body">
                    <p className="pf-dev-instruccion">
                      Selecciona los productos a devolver y cuántas unidades.
                    </p>
                    {elegibilidad.productos.map((linea) => {
                      const cant = seleccion[linea.id_producto] || 0;
                      const agotada = linea.cantidad_disponible === 0;
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
                              Comprados: {linea.cantidad_comprada} · Precio:{' '}
                              {formatoPeso(linea.precio_unitario)}
                            </small>
                          </span>
                          {agotada ? (
                            <span className="pf-dev-agotada">Ya devuelto / en proceso</span>
                          ) : (
                            <span className="pf-dev-cantidades" onClick={(e) => e.preventDefault()}>
                              <button
                                type="button"
                                aria-label="Quitar unidad"
                                disabled={cant === 0}
                                onClick={() => cambiarCantidad(linea.id_producto, -1, linea.cantidad_disponible)}
                              >
                                <FaMinus />
                              </button>
                              <strong>{cant}</strong>
                              <button
                                type="button"
                                aria-label="Agregar unidad"
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
                      <span>Subtotal a devolver:</span>
                      <strong>{formatoPeso(totalSeleccionado())}</strong>
                    </div>
                    <div className="pf-form-actions">
                      <button type="button" className="pf-btn pf-btn-ghost" onClick={cerrarWizard}>
                        Cancelar
                      </button>
                      <button type="button" className="pf-btn pf-btn-primary" onClick={continuarPaso1}>
                        Continuar devolución
                      </button>
                    </div>
                  </div>
                )}

                {pasoWizard === 2 && (
                  <div className="pf-dev-body">
                    <p className="pf-dev-instruccion">¿Cuál es el motivo de la devolución?</p>
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
                        placeholder="Explica brevemente el motivo (mínimo 10 caracteres)"
                        maxLength={1000}
                        value={motivoOtroTxt}
                        onChange={(e) => setMotivoOtroTxt(e.target.value)}
                      />
                    )}
                    <textarea
                      className="pf-dev-textarea"
                      placeholder="Comentario adicional (opcional)"
                      maxLength={1000}
                      value={comentarioTxt}
                      onChange={(e) => setComentarioTxt(e.target.value)}
                    />
                    <div className="pf-form-actions">
                      <button type="button" className="pf-btn pf-btn-ghost" onClick={() => setPasoWizard(1)}>
                        Atrás
                      </button>
                      <button type="button" className="pf-btn pf-btn-primary" onClick={continuarPaso2}>
                        Ver resumen
                      </button>
                    </div>
                  </div>
                )}

                {pasoWizard === 3 && (
                  <div className="pf-dev-body">
                    <h4 className="pf-dev-resumen-titulo">Solicitud de devolución</h4>
                    <p className="pf-dev-resumen-pedido">
                      Pedido: <strong>#{wizardPedido.id_pedido}</strong>
                    </p>
                    <ul className="pf-dev-items">
                      {itemsSeleccionados().map((it) => {
                        const linea = elegibilidad.productos.find((p) => p.id_producto === it.id_producto);
                        if (!linea) return null;
                        return (
                          <li key={it.id_producto}>
                            <span>{linea.nombre}</span>
                            <span className="pf-dev-item-cant">
                              {it.cantidad} unidad{it.cantidad > 1 ? 'es' : ''}
                            </span>
                            <span>{formatoPeso(linea.precio_unitario * it.cantidad)}</span>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="pf-dev-total-estimado">
                      Total estimado a devolver: <strong>{formatoPeso(totalSeleccionado())}</strong>
                    </p>
                    <p className="pf-dev-nota">
                      El reembolso se calcula únicamente sobre los productos y cantidades
                      seleccionadas. Un técnico pasará a recogerlos una vez aprobada la
                      solicitud.
                    </p>
                    <div className="pf-form-actions">
                      <button type="button" className="pf-btn pf-btn-ghost" onClick={() => setPasoWizard(2)}>
                        Atrás
                      </button>
                      <button
                        type="button"
                        className="pf-btn pf-btn-primary"
                        disabled={enviandoDev}
                        onClick={enviarSolicitud}
                      >
                        {enviandoDev ? 'Enviando...' : 'Solicitar devolución'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default OrdersTab;
