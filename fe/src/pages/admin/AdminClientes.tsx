// Pantalla AdminClientes de Neodomus. Reúne el estado y las acciones de su vista.
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaUsers, FaCircleInfo, FaMagnifyingGlass, FaEye, FaPowerOff, FaXmark, FaSpinner, FaBox, FaWrench, FaRotateLeft } from 'react-icons/fa6';
import '@styles/admin-panel.css';
import '@styles/dashboard-admin.css';
import api from '@services/api';
import { useIdioma } from '@i18n/IdiomaContext';
import type { ClienteAdmin } from '../../types';

interface PedidoCliente {
  id_pedido: number;
  fecha: string | null;
  total: number;
  estado: string;
  estado_entrega: string | null;
  fecha_entrega: string | null;
  detalles?: {
    nombre: string;
    cantidad: number;
    precio_unitario: number;
    subtotal: number;
    es_servicio: boolean;
  }[];
  pago?: {
    metodo_pago: string;
    estado: string;
    monto: number;
  } | null;
  factura?: {
    numero_factura: string;
    monto_total: number;
    pdf_url: string | null;
  } | null;
}

interface ServicioCliente {
  id_cita: number;
  tipo_servicio: string;
  fecha: string | null;
  hora: string;
  direccion: string;
  descripcion?: string | null;
  estado: string;
  costo_cita?: number | null;
  metodo_pago?: string | null;
  estado_pago?: string | null;
  created_at?: string | null;
  nombre_tecnico?: string | null;
}

interface DevolucionCliente {
  id_devolucion: number;
  motivo?: string | null;
  descripcion?: string | null;
  estado: string;
  cantidad?: number;
  created_at?: string | null;
  resuelta_at?: string | null;
  pedido?: { id_pedido: number; total: number } | null;
  producto?: { id_producto: number; nombre: string } | null;
}

type TabHistorial = 'pedidos' | 'servicios' | 'devoluciones';

// Comunica con el backend mediante GET '/clients', GET `/clients/${cliente.id_cliente}/pedidos`, GET `/clients/${cliente.id_cliente}/servicios` y otras peticiones de esta vista; crea una URL temporal para acceder al archivo recibido.
const AdminClientes = () => {
  const { t, idioma } = useIdioma();
  const [clientes, setClientes] = useState<ClienteAdmin[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  // Modal detalle
  const [clienteDetalle, setClienteDetalle] = useState<ClienteAdmin | null>(null);
  const [pedidos, setPedidos] = useState<PedidoCliente[]>([]);
  const [servicios, setServicios] = useState<ServicioCliente[]>([]);
  const [devoluciones, setDevoluciones] = useState<DevolucionCliente[]>([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [tabHistorial, setTabHistorial] = useState<TabHistorial>('pedidos');
  const [busquedaHistorial, setBusquedaHistorial] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  // Deshabilitar/habilitar
  const [confirmModal, setConfirmModal] = useState<{ cliente: ClienteAdmin; accion: 'inhabilitar' | 'habilitar' } | null>(null);
  const [procesando, setProcesando] = useState(false);

  // Comunica con el backend mediante GET '/clients'.
  const cargar = async () => {
    setCargando(true);
    setError(false);
    try {
      const res = await api.get<ClienteAdmin[]>('/clients');
      setClientes(res.data || []);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const filtrados = clientes.filter((c) => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    return (
      c.first_name.toLowerCase().includes(q) ||
      c.last_name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.documento_cliente?.toString() || '').includes(q) ||
      (c.telefono_cliente?.toString() || '').includes(q)
    );
  });

  const formatoFecha = (f: string | null | undefined) => {
    if (!f) return '—';
    try {
      return new Date(f).toLocaleDateString(idioma === 'en' ? 'en-US' : 'es-CO');
    } catch {
      return f;
    }
  };

  const formatoTel = (t: number | null | undefined) => (t ? `${t}` : '—');

  const formatoMoneda = (v: number) => `$${Number(v || 0).toLocaleString()}`;

  const filtrarHistorial = <T extends Record<string, any>>(items: T[], camposBusqueda: string[]): T[] => {
    let resultado = items;
    if (busquedaHistorial) {
      const q = busquedaHistorial.toLowerCase();
      resultado = resultado.filter((item) =>
        camposBusqueda.some((campo) => String(item[campo] || '').toLowerCase().includes(q))
      );
    }
    if (fechaDesde) {
      resultado = resultado.filter((item) => {
        const fecha = item.fecha || item.fecha_entrega || item.created_at;
        return fecha && fecha >= fechaDesde;
      });
    }
    if (fechaHasta) {
      resultado = resultado.filter((item) => {
        const fecha = item.fecha || item.fecha_entrega || item.created_at;
        return fecha && fecha <= fechaHasta;
      });
    }
    return resultado;
  };

  // Comunica con el backend mediante GET `/clients/${cliente.id_cliente}/pedidos`, GET `/clients/${cliente.id_cliente}/servicios`, GET `/clients/${cliente.id_cliente}/devoluciones`.
  const abrirDetalle = async (cliente: ClienteAdmin) => {
    setClienteDetalle(cliente);
    setCargandoHistorial(true);
    setTabHistorial('pedidos');
    setBusquedaHistorial('');
    setFechaDesde('');
    setFechaHasta('');
    setPedidos([]);
    setServicios([]);
    setDevoluciones([]);
    try {
      const [resPed, resServ, resDev] = await Promise.allSettled([
        api.get<PedidoCliente[]>(`/clients/${cliente.id_cliente}/pedidos`),
        api.get<ServicioCliente[]>(`/clients/${cliente.id_cliente}/servicios`),
        api.get<DevolucionCliente[]>(`/clients/${cliente.id_cliente}/devoluciones`),
      ]);
      setPedidos(resPed.status === 'fulfilled' ? (resPed.value.data || []) : []);
      setServicios(resServ.status === 'fulfilled' ? (resServ.value.data || []) : []);
      setDevoluciones(resDev.status === 'fulfilled' ? (resDev.value.data || []) : []);
      if (resDev.status === 'rejected') {
        console.warn('Devoluciones no disponibles para cliente', cliente.id_cliente, resDev.reason);
      }
    } catch {
      setPedidos([]);
      setServicios([]);
      setDevoluciones([]);
    } finally {
      setCargandoHistorial(false);
    }
  };

  const ejecutarAccion = async () => {
    if (!confirmModal || procesando) return;
    setProcesando(true);
    try {
      const endpoint = confirmModal.accion === 'inhabilitar'
        ? `/clients/${confirmModal.cliente.id_cliente}/inhabilitar`
        : `/clients/${confirmModal.cliente.id_cliente}/habilitar`;
      await api.put(endpoint);
      setConfirmModal(null);
      await cargar();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Error al procesar la acción');
    } finally {
      setProcesando(false);
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
          <h1 className="ap-title">{t('adm.clientes.titulo')}</h1>
          <p className="ap-subtitle">
            {clientes.length > 0
              ? t('adm.clientes.subtituloConteo', { n: clientes.length })
              : t('adm.clientes.subtituloVacio')}
          </p>
        </div>
      </div>

      <div className="ap-filters" style={{ marginBottom: 20 }}>
        <form className="ap-search" onSubmit={(e) => e.preventDefault()}>
          <FaMagnifyingGlass />
          <input
            type="text"
            placeholder={t('adm.clientes.buscarPlaceholder')}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </form>
      </div>

      {cargando ? (
        <div className="ap-card">
          <div className="ap-states">
            <span className="ap-loader" />
            <h3>{t('adm.clientes.cargando')}</h3>
            <p>{t('adm.clientes.cargandoDesc')}</p>
          </div>
        </div>
      ) : error ? (
        <div className="ap-card">
          <div className="ap-states error">
            <div className="ap-states-icon">
              <FaCircleInfo />
            </div>
            <h3>{t('adm.clientes.errorTitulo')}</h3>
            <p>{t('adm.clientes.errorDesc')}</p>
            <button type="button" className="ap-btn ap-btn-ghost" onClick={cargar}>
              {t('adm.clientes.reintentar')}
            </button>
          </div>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="ap-card">
          <div className="ap-states">
            <div className="ap-states-icon">
              <FaUsers />
            </div>
            <h3>{busqueda ? t('adm.clientes.sinResultados') : t('adm.clientes.noHayClientes')}</h3>
            <p>
              {busqueda
                ? t('adm.clientes.sinResultadosDetalle', { q: busqueda.trim() })
                : t('adm.clientes.vacioDetalle')}
            </p>
          </div>
        </div>
      ) : (
        <div className="ap-card">
          <div className="ap-table-wrap">
            <table className="ap-table">
              <thead>
                <tr>
                  <th>{t('adm.clientes.colCliente')}</th>
                  <th>{t('adm.clientes.colTelefono')}</th>
                  <th>{t('adm.clientes.colRegistro')}</th>
                  <th>{t('adm.clientes.colPedidos')}</th>
                  <th>{t('adm.clientes.colCitas')}</th>
                  <th>{t('adm.clientes.colCuenta')}</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => (
                  <tr key={c.id_cliente}>
                    <td>
                      <div className="ap-cell-user">
                        <span className="ap-initials" aria-hidden="true">
                          {(c.first_name || '?')[0]}
                          {(c.last_name || '')[0]}
                        </span>
                        <div>
                          <strong>
                            {c.first_name} {c.last_name}
                          </strong>
                          <span>{c.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="muted">{formatoTel(c.telefono_cliente)}</td>
                    <td className="muted">{formatoFecha(c.created_at)}</td>
                    <td>
                      <button
                        type="button"
                        className="ap-btn-link"
                        onClick={() => abrirDetalle(c)}
                        title="Ver pedidos del cliente"
                      >
                        <span className="ap-badge info" style={{ cursor: 'pointer' }}>
                          {t('adm.clientes.pedidos', { n: c.pedidos_count ?? 0 })}
                        </span>
                      </button>
                    </td>
                    <td>
                      <span className="ap-badge neutral">{t('adm.clientes.citas', { n: c.citas_count ?? 0 })}</span>
                    </td>
                    <td>
                      <span className={`ap-badge ${c.is_active ? 'ok' : 'err'}`}>
                        {c.is_active ? t('adm.clientes.activa') : t('adm.clientes.inhabilitada')}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button
                          type="button"
                          className="ap-btn ap-btn-ghost"
                          onClick={() => abrirDetalle(c)}
                          title="Ver detalle"
                          style={{ padding: '4px 8px' }}
                        >
                          <FaEye />
                        </button>
                        <button
                          type="button"
                          className={`ap-btn ${c.is_active ? 'ap-btn-warn' : 'ap-btn-ok'}`}
                          onClick={() => setConfirmModal({
                            cliente: c,
                            accion: c.is_active ? 'inhabilitar' : 'habilitar',
                          })}
                          title={c.is_active ? 'Inhabilitar cuenta' : 'Habilitar cuenta'}
                          style={{ padding: '4px 10px', fontSize: 12 }}
                        >
                          <FaPowerOff />
                          {c.is_active ? ' Inhabilitar' : ' Habilitar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal Detalle Cliente ── */}
      <AnimatePresence>
        {clienteDetalle && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setClienteDetalle(null)}
          >
            <motion.div
              className="modal-content"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 850, height: '75vh', display: 'flex', flexDirection: 'column' }}
            >
              {/* Header */}
              <div className="ap-modal-header">
                <h2 style={{ margin: 0, fontSize: 18, color: '#f0e6d2' }}>Detalle del cliente</h2>
                <button type="button" className="ap-btn ap-btn-ghost" onClick={() => setClienteDetalle(null)}>
                  <FaXmark />
                </button>
              </div>

              {/* Info del cliente */}
              <div style={{ padding: '0 0 16px', flex: 1, overflowY: 'auto', minHeight: 0 }}>
                <div className="ap-cell-user" style={{ marginBottom: 16 }}>
                  <span className="ap-initials" style={{ width: 48, height: 48, fontSize: 18 }}>
                    {(clienteDetalle.first_name || '?')[0]}
                    {(clienteDetalle.last_name || '')[0]}
                  </span>
                  <div>
                    <strong style={{ fontSize: 16, color: '#f0e6d2' }}>
                      {clienteDetalle.first_name} {clienteDetalle.last_name}
                    </strong>
                    <span style={{ display: 'block', color: '#9a8e7e', fontSize: 13 }}>{clienteDetalle.email}</span>
                    <span style={{ display: 'block', color: '#9a8e7e', fontSize: 13 }}>
                      Tel: {formatoTel(clienteDetalle.telefono_cliente)} · Doc: {clienteDetalle.documento_cliente || '—'}
                    </span>
                    <span style={{ display: 'block', color: '#9a8e7e', fontSize: 13 }}>
                      Dirección: {clienteDetalle.address || '—'}
                    </span>
                    <span style={{ display: 'block', color: '#9a8e7e', fontSize: 13 }}>
                      Registro: {formatoFecha(clienteDetalle.created_at)}
                    </span>
                  </div>
                </div>

                {/* Filtros */}
                <div className="ap-historial-filtros">
                  <form className="ap-search" onSubmit={(e) => e.preventDefault()} style={{ flex: 1, minWidth: 180 }}>
                    <FaMagnifyingGlass />
                    <input
                      type="text"
                      placeholder="Buscar..."
                      value={busquedaHistorial}
                      onChange={(e) => setBusquedaHistorial(e.target.value)}
                    />
                  </form>
                  <input
                    type="date"
                    className="ap-form-input"
                    value={fechaDesde}
                    onChange={(e) => setFechaDesde(e.target.value)}
                    style={{ width: 150, fontSize: 12 }}
                  />
                  <span style={{ color: '#9a8e7e' }}>—</span>
                  <input
                    type="date"
                    className="ap-form-input"
                    value={fechaHasta}
                    onChange={(e) => setFechaHasta(e.target.value)}
                    style={{ width: 150, fontSize: 12 }}
                  />
                </div>

                {/* Tabs */}
                <div className="ap-tabs">
                  <button
                    type="button"
                    className={`ap-tab ${tabHistorial === 'pedidos' ? 'active' : ''}`}
                    onClick={() => setTabHistorial('pedidos')}
                  >
                    <FaBox /> Pedidos ({pedidos.length})
                  </button>
                  <button
                    type="button"
                    className={`ap-tab ${tabHistorial === 'servicios' ? 'active' : ''}`}
                    onClick={() => setTabHistorial('servicios')}
                  >
                    <FaWrench /> Servicios ({servicios.length})
                  </button>
                  <button
                    type="button"
                    className={`ap-tab ${tabHistorial === 'devoluciones' ? 'active' : ''}`}
                    onClick={() => setTabHistorial('devoluciones')}
                  >
                    <FaRotateLeft /> Devoluciones ({devoluciones.length})
                  </button>
                </div>

                {/* Contenido */}
                {cargandoHistorial ? (
                  <div style={{ textAlign: 'center', padding: 32 }}>
                    <FaSpinner className="spin" style={{ fontSize: 28, color: '#d4a54b' }} />
                    <p style={{ color: '#9a8e7e', marginTop: 10 }}>Cargando historial...</p>
                  </div>
                ) : (
                  <>
                    {/* ── PEDIDOS ── */}
                    {tabHistorial === 'pedidos' && (() => {
                      const items = filtrarHistorial(pedidos, ['estado', 'estado_entrega']);
                      return items.length === 0 ? (
                        <div className="ap-historial-empty">
                          {pedidos.length === 0 ? 'Este cliente no tiene pedidos registrados.' : 'No hay pedidos que coincidan.'}
                        </div>
                      ) : (
                        <div className="ap-historial-list">
                          {items.map((p) => (
                            <div key={p.id_pedido} className="ap-historial-card">
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <div>
                                  <strong style={{ color: '#f0e6d2' }}>Pedido #{p.id_pedido}</strong>
                                  <span style={{ marginLeft: 8, color: '#9a8e7e', fontSize: 13 }}>{formatoFecha(p.fecha)}</span>
                                </div>
                                <span className={`ap-badge ${p.estado?.includes('Pag') ? 'ok' : p.estado?.includes('rechaz') ? 'err' : 'info'}`}>
                                  {p.estado}
                                </span>
                              </div>
                              {p.detalles && p.detalles.length > 0 && (
                                <div style={{ marginBottom: 8 }}>
                                  {p.detalles.map((d, idx) => (
                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0', borderBottom: '1px solid rgba(212,165,75,0.1)' }}>
                                      <span style={{ color: '#c9c0ab' }}>
                                        {d.es_servicio ? '[Servicio] ' : ''}{d.nombre}
                                        {d.cantidad > 1 ? ` x${d.cantidad}` : ''}
                                      </span>
                                      <span style={{ fontWeight: 600, color: '#d4a54b' }}>{formatoMoneda(d.subtotal)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(212,165,75,0.15)' }}>
                                <span style={{ fontWeight: 700, fontSize: 14, color: '#f0e6d2' }}>Total: {formatoMoneda(p.total)}</span>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                  {p.pago && (
                                    <span className="ap-badge neutral" style={{ fontSize: 11 }}>
                                      {p.pago.metodo_pago} · {p.pago.estado}
                                    </span>
                                  )}
                                  {p.factura?.numero_factura && (
                                    <button
                                      type="button"
                                      className="ap-btn ap-btn-ghost"
                                      style={{ padding: '2px 8px', fontSize: 11 }}
                                      onClick={async () => {
                                        try {
                                          const res = await api.get(`/pedidos/admin/${p.id_pedido}/factura`, { responseType: 'blob' });
                                          const blob = new Blob([res.data], { type: 'application/pdf' });
                                          const url = URL.createObjectURL(blob);
                                          window.open(url, '_blank');
                                          setTimeout(() => URL.revokeObjectURL(url), 10000);
                                        } catch {
                                          alert('No se pudo generar la factura');
                                        }
                                      }}
                                    >
                                      Factura PDF
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* ── SERVICIOS ── */}
                    {tabHistorial === 'servicios' && (() => {
                      const items = filtrarHistorial(servicios, ['tipo_servicio', 'estado', 'direccion', 'nombre_tecnico']);
                      return items.length === 0 ? (
                        <div className="ap-historial-empty">
                          {servicios.length === 0 ? 'Este cliente no tiene servicios registrados.' : 'No hay servicios que coincidan.'}
                        </div>
                      ) : (
                        <div className="ap-historial-list">
                          {items.map((s) => (
                            <div key={s.id_cita} className="ap-historial-card">
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                <div>
                                  <strong style={{ color: '#f0e6d2' }}>{s.tipo_servicio}</strong>
                                  <span style={{ marginLeft: 8, color: '#9a8e7e', fontSize: 13 }}>{formatoFecha(s.fecha)} {s.hora}</span>
                                </div>
                                <span className={`ap-badge ${s.estado === 'Finalizada' ? 'ok' : s.estado === 'Cancelada' ? 'err' : 'info'}`}>
                                  {s.estado}
                                </span>
                              </div>
                              <div style={{ fontSize: 13, color: '#c9c0ab', marginBottom: 4 }}>
                                <span>Dirección: {s.direccion || '—'}</span>
                                {s.nombre_tecnico && <span style={{ marginLeft: 12 }}>Técnico: {s.nombre_tecnico}</span>}
                              </div>
                              {s.descripcion && (
                                <div style={{ fontSize: 12, color: '#9a8e7e', marginBottom: 4 }}>Descripción: {s.descripcion}</div>
                              )}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(212,165,75,0.1)' }}>
                                <span style={{ fontWeight: 700, color: '#d4a54b' }}>
                                  {s.costo_cita ? formatoMoneda(s.costo_cita) : '—'}
                                </span>
                                <span className="ap-badge neutral" style={{ fontSize: 11 }}>
                                  {s.metodo_pago || '—'} · {s.estado_pago || '—'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* ── DEVOLUCIONES ── */}
                    {tabHistorial === 'devoluciones' && (() => {
                      const items = filtrarHistorial(devoluciones, ['motivo', 'estado', 'producto', 'pedido']);
                      return items.length === 0 ? (
                        <div className="ap-historial-empty">
                          {devoluciones.length === 0 ? 'Este cliente no tiene devoluciones registradas.' : 'No hay devoluciones que coincidan.'}
                        </div>
                      ) : (
                        <div className="ap-historial-list">
                          {items.map((d) => (
                            <div key={d.id_devolucion} className="ap-historial-card">
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                <div>
                                  <strong style={{ color: '#f0e6d2' }}>Devolución #{d.id_devolucion}</strong>
                                  <span style={{ marginLeft: 8, color: '#9a8e7e', fontSize: 13 }}>{formatoFecha(d.created_at)}</span>
                                </div>
                                <span className={`ap-badge ${d.estado === 'Aprobada' ? 'ok' : d.estado === 'Rechazada' ? 'err' : 'info'}`}>
                                  {d.estado}
                                </span>
                              </div>
                              {d.producto && (
                                <div style={{ fontSize: 13, color: '#c9c0ab', marginBottom: 4 }}>
                                  Producto: {d.producto.nombre} {d.cantidad && d.cantidad > 1 ? `(x${d.cantidad})` : ''}
                                </div>
                              )}
                              {d.pedido && (
                                <div style={{ fontSize: 12, color: '#9a8e7e', marginBottom: 4 }}>
                                  Pedido: #{d.pedido.id_pedido}
                                </div>
                              )}
                              {d.motivo && (
                                <div style={{ fontSize: 12, color: '#9a8e7e', marginBottom: 4 }}>Motivo: {d.motivo}</div>
                              )}
                              {d.resuelta_at && (
                                <div style={{ fontSize: 11, color: '#9a8e7e', marginTop: 4 }}>
                                  Resuelta: {formatoFecha(d.resuelta_at)}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modal Confirmar Acción ── */}
      <AnimatePresence>
        {confirmModal && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !procesando && setConfirmModal(null)}
          >
            <motion.div
              className="modal-content"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 420, padding: 24, borderRadius: 12, background: '#1a1714', border: '1px solid rgba(212, 165, 75, 0.25)' }}
            >
              <h3 style={{ margin: '0 0 12px', fontSize: 17, color: '#f0e6d2' }}>
                {confirmModal.accion === 'inhabilitar' ? 'Inhabilitar cuenta' : 'Habilitar cuenta'}
              </h3>
              <p style={{ color: '#c9c0ab', margin: '0 0 16px', fontSize: 14 }}>
                {confirmModal.accion === 'inhabilitar'
                  ? `¿Estás seguro de inhabilitar la cuenta de ${confirmModal.cliente.first_name} ${confirmModal.cliente.last_name}? El cliente no podrá iniciar sesión.`
                  : `¿Estás seguro de habilitar la cuenta de ${confirmModal.cliente.first_name} ${confirmModal.cliente.last_name}? El cliente podrá iniciar sesión nuevamente.`}
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="ap-btn ap-btn-ghost"
                  onClick={() => setConfirmModal(null)}
                  disabled={procesando}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={`ap-btn ${confirmModal.accion === 'inhabilitar' ? 'ap-btn-warn' : 'ap-btn-ok'}`}
                  onClick={ejecutarAccion}
                  disabled={procesando}
                >
                  {procesando ? <FaSpinner className="spin" /> : <FaPowerOff />}
                  {confirmModal.accion === 'inhabilitar' ? ' Inhabilitar' : ' Habilitar'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
};

export default AdminClientes;
