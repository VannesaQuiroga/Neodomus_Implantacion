import { useEffect, useMemo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FaBoxOpen, FaCalendarDay, FaClock } from 'react-icons/fa6';
import api from '@services/api';
import { useIdioma } from '@i18n/IdiomaContext';
import '@styles/admin-panel.css';
import '@styles/dashboard-admin.css';

interface PedidoEntrega {
  id_pedido: number;
  cliente: string | null;
  direccion: string | null;
  telefono: number | null;
  fecha_entrega: string | null;
  hora_entrega: string | null;
  hora_entrega_fin: string | null;
  estado_entrega: string | null;
  id_tecnico_entrega: number | null;
  nombre_tecnico: string | null;
  productos: string[];
}

interface TecnicoSimple {
  id_tecnico: number;
  first_name: string;
  last_name: string;
  is_active?: boolean;
}

const ESTADO_CLASE: Record<string, string> = {
  Asignada: 'warn',
  'En camino': 'warn',
  Entregado: 'ok',
  Cancelada: 'err',
};

const AdminPedidos = () => {
  const { t } = useIdioma();
  const [pedidos, setPedidos] = useState<PedidoEntrega[]>([]);
  const [tecnicos, setTecnicos] = useState<TecnicoSimple[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardandoId, setGuardandoId] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null);

  // Edición de fecha/hora por pedido
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [fechaSeleccion, setFechaSeleccion] = useState('');
  const [horaSeleccion, setHoraSeleccion] = useState('');
  const [horaFinSeleccion, setHoraFinSeleccion] = useState('');
  const [horariosDisponibles, setHorariosDisponibles] = useState<string[]>([]);
  const [cargandoHorarios, setCargandoHorarios] = useState(false);

  // Fecha mínima (hoy) — se recalcula automáticamente al cambiar de día
  const [hoyStr, setHoyStr] = useState(() => new Date().toISOString().split('T')[0]);
  const [ahoraMinutos, setAhoraMinutos] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  // Auto-actualizar la fecha mínima cuando cambia el día
  useEffect(() => {
    const intervalo = window.setInterval(() => {
      const now = new Date();
      const nuevaFecha = now.toISOString().split('T')[0];
      setHoyStr(nuevaFecha);
      setAhoraMinutos(now.getHours() * 60 + now.getMinutes());
    }, 60000); // Cada minuto
    return () => window.clearInterval(intervalo);
  }, []);

  const cargar = async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    try {
      const [entregasRes, tecnicosRes] = await Promise.all([
        api.get<PedidoEntrega[]>('/pedidos/admin/entregas'),
        api.get<TecnicoSimple[]>('/tecnicos'),
      ]);
      setPedidos(entregasRes.data);
      setTecnicos(tecnicosRes.data);
    } catch {
      if (!silencioso) setToast({ msg: t('adm.pedidos.errorCargar'), tipo: 'err' });
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
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return pedidos;
    return pedidos.filter(
      (p) =>
        String(p.id_pedido).includes(q) ||
        (p.cliente || '').toLowerCase().includes(q) ||
        p.productos.some((prod) => prod.toLowerCase().includes(q)) ||
        (p.nombre_tecnico || '').toLowerCase().includes(q),
    );
  }, [pedidos, busqueda]);

  // Horarios de fin: disponibles desde hora inicio + 1h
  const horariosFinFiltrados = useMemo(() => {
    if (!horaSeleccion) return [];
    const [hhIni, mmIni] = horaSeleccion.split(':').map(Number);
    const iniMin = hhIni * 60 + mmIni + 60; // mínimo 1 hora después
    return horariosDisponibles.filter((h) => {
      const [hh, mm] = h.split(':').map(Number);
      const hMin = hh * 60 + mm;
      return hMin > iniMin;
    });
  }, [horaSeleccion, horariosDisponibles]);

  // Cargar horarios disponibles del backend al cambiar fecha o técnico
  const cargarHorarios = useCallback(async (fecha: string, tecnicoId?: number | null) => {
    if (!fecha) { setHorariosDisponibles([]); return; }
    setCargandoHorarios(true);
    try {
      const params: Record<string, string> = { fecha };
      if (tecnicoId) params.tecnico_id = String(tecnicoId);
      const res = await api.get<string[]>('/pedidos/admin/horarios-disponibles', { params });
      setHorariosDisponibles(res.data);
    } catch {
      setHorariosDisponibles([]);
    } finally {
      setCargandoHorarios(false);
    }
  }, []);

  const abrirEditor = useCallback((pedido: PedidoEntrega) => {
    setEditandoId(pedido.id_pedido);
    setFechaSeleccion(pedido.fecha_entrega || hoyStr);
    setHoraSeleccion(pedido.hora_entrega || '');
    setHoraFinSeleccion(pedido.hora_entrega_fin || '');
    // Cargar horarios disponibles del backend
    const fecha = pedido.fecha_entrega || hoyStr;
    cargarHorarios(fecha, pedido.id_tecnico_entrega);
  }, [hoyStr, cargarHorarios]);

  const cancelarEdicion = () => {
    setEditandoId(null);
    setFechaSeleccion('');
    setHoraSeleccion('');
    setHoraFinSeleccion('');
  };

  const guardarFechaHora = async (pedido: PedidoEntrega) => {
    if (!fechaSeleccion) {
      setToast({ msg: 'Selecciona una fecha de entrega', tipo: 'err' });
      return;
    }
    // Validación frontend: fecha no puede ser pasada
    if (fechaSeleccion < hoyStr) {
      setToast({ msg: 'No es posible programar una entrega en una fecha pasada', tipo: 'err' });
      return;
    }
    // Validación frontend: si es hoy, hora no puede ser pasada
    if (fechaSeleccion === hoyStr && horaSeleccion) {
      const [hh, mm] = horaSeleccion.split(':').map(Number);
      if (hh * 60 + mm <= ahoraMinutos) {
        setToast({ msg: 'El horario seleccionado ya pasó. Seleccione un horario disponible', tipo: 'err' });
        return;
      }
    }
    setGuardandoId(pedido.id_pedido);
    try {
      await api.put(`/pedidos/admin/${pedido.id_pedido}/entrega`, {
        id_tecnico: pedido.id_tecnico_entrega,
        fecha_entrega: fechaSeleccion,
        hora_entrega: horaSeleccion || null,
        hora_entrega_fin: horaFinSeleccion || null,
      });
      setToast({ msg: 'Fecha y hora de entrega actualizadas', tipo: 'ok' });
      cancelarEdicion();
      await cargar();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || t('adm.pedidos.errorActualizar');
      setToast({ msg, tipo: 'err' });
    } finally {
      setGuardandoId(null);
    }
  };

  const cambiarEncargado = async (pedido: PedidoEntrega, valor: string) => {
    setGuardandoId(pedido.id_pedido);
    try {
      await api.put(`/pedidos/admin/${pedido.id_pedido}/entrega`, {
        id_tecnico: valor ? parseInt(valor, 10) : null,
      });
      setToast({ msg: t('adm.pedidos.actualizado'), tipo: 'ok' });
      await cargar();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || t('adm.pedidos.errorActualizar');
      setToast({ msg, tipo: 'err' });
    } finally {
      setGuardandoId(null);
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
          <h3>
            <FaBoxOpen /> {t('adm.pedidos.titulo')}
          </h3>
          <p>{t('adm.pedidos.desc')}</p>
        </div>

        <div className="ap-form-group" style={{ maxWidth: 360 }}>
          <input
            type="text"
            className="ap-form-input"
            placeholder={t('adm.pedidos.buscar')}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        {toast && (
          <p style={{ color: toast.tipo === 'ok' ? '#3d7a3d' : '#a33', fontWeight: 600 }}>
            {toast.msg}
          </p>
        )}

        {cargando ? (
          <p style={{ color: '#9a8f78' }}>{t('adm.pedidos.cargando')}</p>
        ) : filtrados.length === 0 ? (
          <p style={{ color: '#9a8f78' }}>{t('adm.pedidos.sinPedidos')}</p>
        ) : (
          <div className="ap-table-wrap">
            <table className="ap-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('adm.pedidos.cliente') || 'Cliente'}</th>
                  <th>{t('adm.pedidos.productos') || 'Productos'}</th>
                  <th><FaCalendarDay style={{ marginRight: 4 }} /> {t('adm.pedidos.fechaEntrega') || 'Fecha entrega'}</th>
                  <th>Estado</th>
                  <th>{t('adm.pedidos.tecnicoEncargado')}</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => (
                  <tr key={p.id_pedido}>
                    <td style={{ fontWeight: 600 }}>{p.id_pedido}</td>
                    <td>{p.cliente || '—'}</td>
                    <td style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.productos.length > 0 ? p.productos.join(', ') : '—'}
                    </td>
                    <td>
                      {editandoId === p.id_pedido ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200 }}>
                          <input
                            type="date"
                            className="ap-form-input"
                            value={fechaSeleccion}
                            min={hoyStr}
                            onChange={(e) => {
                              setFechaSeleccion(e.target.value);
                              setHoraSeleccion('');
                              setHoraFinSeleccion('');
                              cargarHorarios(e.target.value, p.id_tecnico_entrega);
                            }}
                            style={{ fontSize: '0.85rem' }}
                          />
                          <div style={{ display: 'flex', gap: 6 }}>
                            <select
                              className="ap-form-select"
                              value={horaSeleccion}
                              onChange={(e) => {
                                setHoraSeleccion(e.target.value);
                                setHoraFinSeleccion('');
                              }}
                              style={{ fontSize: '0.85rem', flex: 1 }}
                            >
                              <option value="">Hora inicio</option>
                              {horariosDisponibles.map((h) => (
                                <option key={h} value={h}>{h}</option>
                              ))}
                            </select>
                            <select
                              className="ap-form-select"
                              value={horaFinSeleccion}
                              disabled={!horaSeleccion}
                              onChange={(e) => setHoraFinSeleccion(e.target.value)}
                              style={{ fontSize: '0.85rem', flex: 1 }}
                            >
                              <option value="">Hora fin</option>
                              {horariosFinFiltrados.map((h) => (
                                <option key={h} value={h}>{h}</option>
                              ))}
                            </select>
                          </div>
                          {fechaSeleccion === hoyStr && horariosDisponibles.length === 0 && !cargandoHorarios && (
                            <span style={{ fontSize: '0.75rem', color: '#e5484d' }}>
                              <FaClock style={{ marginRight: 3 }} />
                              No hay horarios disponibles para hoy
                            </span>
                          )}
                          {cargandoHorarios && (
                            <span style={{ fontSize: '0.75rem', color: '#9a8f78' }}>
                              Cargando horarios...
                            </span>
                          )}
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              type="button"
                              className="ap-btn ap-btn-primary"
                              style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                              disabled={guardandoId === p.id_pedido || !fechaSeleccion}
                              onClick={() => guardarFechaHora(p)}
                            >
                              {guardandoId === p.id_pedido ? 'Guardando...' : 'Guardar'}
                            </button>
                            <button
                              type="button"
                              className="ap-btn"
                              style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                              onClick={cancelarEdicion}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="ap-btn"
                          style={{
                            background: 'none',
                            border: '1px dashed #666',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontSize: '0.85rem',
                            color: '#ccc',
                          }}
                          onClick={() => abrirEditor(p)}
                          disabled={guardandoId === p.id_pedido}
                        >
                          {p.fecha_entrega
                            ? `${p.fecha_entrega} ${p.hora_entrega || ''}${p.hora_entrega_fin ? ` - ${p.hora_entrega_fin}` : ''}`
                            : '— Asignar fecha —'}
                        </button>
                      )}
                    </td>
                    <td>
                      <span className={`ap-badge ${ESTADO_CLASE[p.estado_entrega || ''] || 'neutral'}`}>
                        {p.estado_entrega || t('adm.pedidos.sinEstado')}
                      </span>
                    </td>
                    <td>
                      <select
                        className="ap-form-select"
                        value={p.id_tecnico_entrega?.toString() || ''}
                        disabled={guardandoId === p.id_pedido}
                        onChange={(e) => cambiarEncargado(p, e.target.value)}
                        style={{ minWidth: 160 }}
                      >
                        <option value="">{t('adm.instalaciones.sinAsignar')}</option>
                        {tecnicos.map((tec) => (
                          <option key={tec.id_tecnico} value={tec.id_tecnico}>
                            {[tec.first_name, tec.last_name].filter(Boolean).join(' ').trim() ||
                              `Técnico #${tec.id_tecnico}`}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.section>
  );
};

export default AdminPedidos;
