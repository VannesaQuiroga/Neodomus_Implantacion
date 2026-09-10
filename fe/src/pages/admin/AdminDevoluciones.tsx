import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  FaCircleInfo,
  FaCircleCheck,
  FaMoneyBillWave,
  FaRotate,
  FaRotateLeft,
  FaEye,
} from 'react-icons/fa6';
import '@styles/admin-panel.css';
import '@styles/dashboard-admin.css';
import api from '@services/api';
import { useIdioma } from '@i18n/IdiomaContext';

interface ItemDevolucion {
  id_devolucion: number;
  id_producto: number;
  producto: string;
  cantidad: number;
  precio_unitario: number;
  subtotal_linea: number;
  estado_linea: string;
  recogida_estado?: string | null;
  id_tecnico_recogida?: number | null;
  tecnico_recogida_nombre?: string | null;
}

interface SolicitudItem {
  id_solicitud: number;
  numero: string;
  id_pedido: number | null;
  cliente: string | null;
  cliente_email?: string | null;
  motivo_tipo: string | null;
  motivo_label?: string | null;
  motivo_otro: string | null;
  comentario: string | null;
  estado: string;
  tipo_devolucion: 'parcial' | 'total';
  monto_total: number;
  resolucion: string | null;
  motivo_rechazo: string | null;
  observaciones_admin: string | null;
  created_at: string | null;
  resuelta_at: string | null;
  items: ItemDevolucion[];
  todos_recogidos?: boolean;
  reembolso?: {
    id_reembolso: number;
    estado: string;
    monto: number;
    numero_transaccion_reembolso?: string | null;
  } | null;
}

interface ReembolsoItem {
  id_reembolso: number;
  id_cita: number | null;
  referencia: string;
  cliente_nombre: string | null;
  detalle: string | null;
  monto: number;
  costo_original?: number | null;
  estado: string;
  motivo: string | null;
  numero_transaccion_original: string | null;
  numero_transaccion_reembolso: string | null;
  created_at: string;
}

interface ElegibleItem {
  tipo: 'cita' | 'pedido';
  id_cita?: number | null;
  id_pedido?: number | null;
  etiqueta: string;
  monto_pagado: number;
}

const claveElegible = (e: ElegibleItem) =>
  e.tipo === 'cita' ? `c-${e.id_cita}` : `p-${e.id_pedido}`;

type Vista = 'solicitudes' | 'reembolsos';

const ESTADO_CLASE: Record<string, string> = {
  Solicitada: 'pendiente',
  'En revisión': 'info',
  Aprobada: 'ok',
  'Producto en devolución': 'proceso',
  Recibida: 'ok',
  'Reembolso procesado': 'ok',
  Rechazada: 'err',
};

const formatoPeso = (value: number) =>
  value.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

const formatFecha = (fecha: string) => {
  if (!fecha) return '';
  const f = fecha.split('T')[0].split('-');
  return `${f[2]}/${f[1]}/${f[0]}`;
};

const AdminDevoluciones = () => {
  const { t } = useIdioma();
  const [vista, setVista] = useState<Vista>('solicitudes');
  const [solicitudes, setSolicitudes] = useState<SolicitudItem[]>([]);
  const [reembolsos, setReembolsos] = useState<ReembolsoItem[]>([]);
  const [elegibles, setElegibles] = useState<ElegibleItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [procesando, setProcesando] = useState<number | null>(null);
  const [tecnicos, setTecnicos] = useState<{ id: number; nombre: string; is_active: boolean }[]>([]);

  // Modales de acción
  const [rechazarSol, setRechazarSol] = useState<SolicitudItem | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [aprobarSol, setAprobarSol] = useState<SolicitudItem | null>(null);
  const [resolucionSel, setResolucionSel] = useState<'Reembolso' | 'Cambio'>('Reembolso');
  const [detalleSol, setDetalleSol] = useState<SolicitudItem | null>(null);
  const [observacionesTxt, setObservacionesTxt] = useState('');
  const [reasignandoLinea, setReasignandoLinea] = useState<number | null>(null);

  const [selReembolso, setSelReembolso] = useState('');
  const [motivoReembolso, setMotivoReembolso] = useState('');
  const [retencionPct, setRetencionPct] = useState('');
  const [creandoReembolso, setCreandoReembolso] = useState(false);
  const [procesandoReembolso, setProcesandoReembolso] = useState<number | null>(null);
  const [porcentajes, setPorcentajes] = useState<Record<number, string>>({});
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null);

  const notify = (msg: string, tipo: 'ok' | 'err' = 'ok') => {
    setToast({ msg, tipo });
    window.setTimeout(() => setToast(null), 3200);
  };

  const cargar = async (silencioso = false): Promise<SolicitudItem[]> => {
    if (!silencioso) setCargando(true);
    setError(false);
    try {
      const [resS, resR, resE, resT] = await Promise.all([
        api.get<SolicitudItem[]>('/devoluciones/admin/solicitudes'),
        api.get<ReembolsoItem[]>('/reembolsos').catch(() => ({ data: [] as ReembolsoItem[] })),
        api.get<ElegibleItem[]>('/reembolsos/elegibles').catch(() => ({ data: [] as ElegibleItem[] })),
        api.get<{ id_tecnico: number; first_name: string; last_name: string; is_active: boolean }[]>(
          '/tecnicos',
        ).catch(() => ({ data: [] })),
      ]);
      const fresh = resS.data || [];
      setSolicitudes(fresh);
      // Mantener el modal abierto con datos frescos tras una acción.
      setDetalleSol((prev) =>
        prev ? fresh.find((s) => s.id_solicitud === prev.id_solicitud) ?? prev : prev,
      );
      setReembolsos(resR.data || []);
      setElegibles(resE.data || []);
      setTecnicos(
        (resT.data || []).map((x) => ({
          id: x.id_tecnico,
          nombre: `${x.first_name} ${x.last_name}`.trim(),
          is_active: !!x.is_active,
        })),
      );
      return fresh;
    } catch {
      if (!silencioso) setError(true);
      return [];
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
    // Tiempo real: refresco silencioso cada 30 s para ver datos actuales.
    const intervalo = window.setInterval(() => cargar(true), 30000);
    return () => window.clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cambiarEstado = async (
    s: SolicitudItem,
    estado: string,
    extra: Record<string, unknown> = {},
  ) => {
    setProcesando(s.id_solicitud);
    try {
      await api.put(`/devoluciones/admin/solicitudes/${s.id_solicitud}/estado`, {
        estado,
        ...extra,
      });
      notify(`${s.numero} → ${estado}`);
      await cargar();
    } catch (err: any) {
      const msg = err.response?.data?.detail;
      notify(typeof msg === 'string' ? msg : 'No se pudo actualizar la devolución', 'err');
    } finally {
      setProcesando(null);
    }
  };

  const guardarObservaciones = async () => {
    if (!detalleSol) return;
    setProcesando(detalleSol.id_solicitud);
    try {
      await api.put(`/devoluciones/admin/solicitudes/${detalleSol.id_solicitud}/estado`, {
        observaciones: observacionesTxt,
      });
      notify('Observaciones guardadas');
      await cargar();
      setDetalleSol(null);
    } catch (err: any) {
      const msg = err.response?.data?.detail;
      notify(typeof msg === 'string' ? msg : 'No se pudieron guardar las observaciones', 'err');
    } finally {
      setProcesando(null);
    }
  };

  const confirmarRechazo = async () => {
    if (!rechazarSol) return;
    if (motivoRechazo.trim().length < 5) {
      notify('Indica el motivo del rechazo', 'err');
      return;
    }
    await cambiarEstado(rechazarSol, 'Rechazada', { motivo_rechazo: motivoRechazo.trim() });
    setRechazarSol(null);
    setMotivoRechazo('');
  };

  const confirmarAprobacion = async () => {
    if (!aprobarSol) return;
    await cambiarEstado(aprobarSol, 'Aprobada', { resolucion: resolucionSel });
    setAprobarSol(null);
  };

  const reasignarTecnico = async (idDevolucion: number, idTecnico: number) => {
    if (!idTecnico) return;
    setReasignandoLinea(idDevolucion);
    try {
      const res = await api.put(`/devoluciones/admin/${idDevolucion}/reasignar-tecnico`, {
        id_tecnico: idTecnico,
      });
      notify(res.data?.mensaje || 'Técnico reasignado');
      await cargar();
    } catch (err: any) {
      const msg = err.response?.data?.detail;
      notify(typeof msg === 'string' ? msg : 'No se pudo reasignar el técnico', 'err');
    } finally {
      setReasignandoLinea(null);
    }
  };

  // ── Reembolsos manuales (pestaña existente) ─────────────────────
  const seleccionarElegible = (valor: string) => {
    setSelReembolso(valor);
    const elegida = elegibles.find((e) => claveElegible(e) === valor);
    setRetencionPct(elegida ? '15' : '');
  };

  const crearReembolso = async () => {
    if (!selReembolso) {
      notify(t('adm.instalaciones.reembolsoEligeCita'), 'err');
      return;
    }
    const pctRetencion = parseFloat(retencionPct);
    if (Number.isNaN(pctRetencion) || pctRetencion < 0 || pctRetencion > 100) {
      notify('Indica un porcentaje de retención válido (0–100)', 'err');
      return;
    }
    const elegida = elegibles.find((e) => claveElegible(e) === selReembolso);
    const montoCliente = elegida ? Math.round(elegida.monto_pagado * (1 - pctRetencion / 100)) : 0;
    if (!elegida || montoCliente <= 0) {
      notify('El reembolso debe ser mayor a 0', 'err');
      return;
    }
    setCreandoReembolso(true);
    try {
      await api.post('/reembolsos', {
        ...(elegida.tipo === 'cita'
          ? { id_cita: elegida.id_cita }
          : { id_pedido: elegida.id_pedido }),
        monto: montoCliente,
        motivo: motivoReembolso.trim() || undefined,
      });
      notify(t('adm.instalaciones.reembolsoExito'));
      setSelReembolso('');
      setRetencionPct('');
      setMotivoReembolso('');
      await cargar();
    } catch (err: any) {
      const msg = err.response?.data?.detail;
      notify(typeof msg === 'string' ? msg : t('adm.instalaciones.reembolsoError'), 'err');
    } finally {
      setCreandoReembolso(false);
    }
  };

  const reprocesarReembolso = async (id: number) => {
    setProcesandoReembolso(id);
    try {
      const pct = porcentajes[id];
      await api.post(`/reembolsos/${id}/procesar`, {
        porcentaje_cliente: pct ? parseFloat(pct) : null,
      });
      notify(t('adm.instalaciones.reembolsoExito'));
      await cargar();
    } catch (err: any) {
      const msg = err.response?.data?.detail;
      notify(typeof msg === 'string' ? msg : t('adm.instalaciones.reembolsoError'), 'err');
    } finally {
      setProcesandoReembolso(null);
    }
  };

  const pendientes = solicitudes.filter(
    (s) => s.estado === 'Solicitada' || s.estado === 'En revisión',
  ).length;

  const abrirDetalle = (s: SolicitudItem) => {
    setDetalleSol(s);
    setObservacionesTxt(s.observaciones_admin || '');
  };

  return (
    <motion.div
      className="admin-panel"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="ap-header">
        <div>
          <h1 className="ap-title">{t('adm.devoluciones.titulo')}</h1>
          <p className="ap-subtitle">{t('adm.devoluciones.subtitulo')}</p>
        </div>
        <div className="ap-header-right">
          <button type="button" className="ap-btn ap-btn-ghost" onClick={() => cargar()} disabled={cargando}>
            <FaRotate className={cargando ? 'spin' : ''} /> {t('adm.consultas.actualizar')}
          </button>
        </div>
      </div>

      <div className="ap-tabs" role="tablist" aria-label={t('adm.devoluciones.tabsAria')}>
        <button
          type="button"
          role="tab"
          aria-selected={vista === 'solicitudes'}
          className={`ap-tab ${vista === 'solicitudes' ? 'active' : ''}`}
          onClick={() => setVista('solicitudes')}
        >
          <FaRotateLeft /> Devoluciones
          {pendientes > 0 && <span className="ap-pill-count">{pendientes}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={vista === 'reembolsos'}
          className={`ap-tab ${vista === 'reembolsos' ? 'active' : ''}`}
          onClick={() => setVista('reembolsos')}
        >
          <FaMoneyBillWave /> Reembolsos
        </button>
      </div>

      {cargando ? (
        <div className="ap-card">
          <div className="ap-states">
            <span className="ap-loader" />
            <h3>{t('adm.consultas.cargandoSolicitudes')}</h3>
          </div>
        </div>
      ) : error ? (
        <div className="ap-card">
          <div className="ap-states error">
            <div className="ap-states-icon">
              <FaCircleInfo />
            </div>
            <h3>{t('adm.instalaciones.errorTitulo')}</h3>
            <p>{t('adm.instalaciones.errorDesc')}</p>
            <button type="button" className="ap-btn ap-btn-ghost" onClick={() => cargar()}>
              {t('adm.instalaciones.reintentar')}
            </button>
          </div>
        </div>
      ) : vista === 'solicitudes' ? (
        solicitudes.length === 0 ? (
          <div className="ap-card">
            <div className="ap-states">
              <div className="ap-states-icon">
                <FaRotateLeft />
              </div>
              <h3>No hay solicitudes de devolución</h3>
              <p>Cuando los clientes soliciten devoluciones aparecerán aquí.</p>
            </div>
          </div>
        ) : (
          <div className="ap-grid">
            {solicitudes.map((s) => (
              <div className="ap-grid-item" key={s.id_solicitud}>
                <div className="ap-grid-item-top">
                  <span className="ap-initials">
                    {(s.cliente || '?').split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
                  </span>
                  <span className={`ap-badge ${ESTADO_CLASE[s.estado] || ''}`}>{s.estado}</span>
                </div>
                <h4 style={{ margin: '10px 0 2px', fontSize: '0.95rem' }}>
                  {s.numero} · Pedido #{s.id_pedido ?? '—'}
                  <span
                    className={`ap-badge ${s.tipo_devolucion === 'total' ? 'ok' : 'info'}`}
                    style={{ marginLeft: 8 }}
                  >
                    {s.tipo_devolucion === 'total' ? 'Total' : 'Parcial'}
                  </span>
                </h4>
                <p style={{ margin: 0, color: '#c9c0ab', fontSize: '0.8rem' }}>
                  {s.cliente || '—'} · {formatFecha(s.created_at || '')}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: '0.82rem', fontWeight: 600 }}>
                  {formatoPeso(s.monto_total)} · {s.items.length} producto(s)
                </p>
                {s.motivo_label && (
                  <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: '#d4a54b' }}>
                    Motivo: {s.motivo_label}
                    {s.motivo_otro ? ` — “${s.motivo_otro}”` : ''}
                  </p>
                )}
                {s.comentario && (
                  <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#bdbdbd', overflowWrap: 'anywhere' }}>
                    “{s.comentario}”
                  </p>
                )}
                {s.motivo_rechazo && (
                  <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: '#ff9b9b' }}>
                    Rechazada: {s.motivo_rechazo}
                  </p>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  {(s.estado === 'Solicitada' || s.estado === 'En revisión') && (
                    <>
                      {s.estado === 'Solicitada' && (
                        <button
                          type="button"
                          className="ap-btn ap-btn-ghost"
                          disabled={procesando === s.id_solicitud}
                          onClick={() => cambiarEstado(s, 'En revisión')}
                        >
                          En revisión
                        </button>
                      )}
                      <button
                        type="button"
                        className="ap-btn ap-btn-primary"
                        disabled={procesando === s.id_solicitud}
                        onClick={() => {
                          setResolucionSel('Reembolso');
                          setAprobarSol(s);
                        }}
                      >
                        Aprobar
                      </button>
                      <button
                        type="button"
                        className="ap-btn ap-btn-ghost"
                        disabled={procesando === s.id_solicitud}
                        onClick={() => {
                          setMotivoRechazo('');
                          setRechazarSol(s);
                        }}
                      >
                        Rechazar
                      </button>
                    </>
                  )}
                  {s.estado === 'Aprobada' && (
                    <button
                      type="button"
                      className="ap-btn ap-btn-primary"
                      disabled={procesando === s.id_solicitud}
                      onClick={() => cambiarEstado(s, 'Producto en devolución')}
                    >
                      Producto en devolución
                    </button>
                  )}
                  {s.estado === 'Producto en devolución' && (
                    <button
                      type="button"
                      className="ap-btn ap-btn-primary"
                      disabled={procesando === s.id_solicitud}
                      onClick={() => cambiarEstado(s, 'Recibida')}
                    >
                      Marcar recibida
                    </button>
                  )}
                  {s.estado === 'Recibida' && s.resolucion === 'Reembolso' && (
                    <button
                      type="button"
                      className="ap-btn ap-btn-primary"
                      disabled={procesando === s.id_solicitud}
                      onClick={() => cambiarEstado(s, 'Reembolso procesado')}
                    >
                      Confirmar reembolso
                    </button>
                  )}
                  <button
                    type="button"
                    className="ap-btn ap-btn-ghost"
                    onClick={() => abrirDetalle(s)}
                  >
                    <FaEye /> Ver detalles
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          <div className="ap-card ap-tarifas-card">
            <div className="ap-card-head">
              <h3><FaMoneyBillWave /> {t('adm.devoluciones.crearTitulo')}</h3>
              <p>{t('adm.devoluciones.crearDesc')}</p>
            </div>
            <div className="ap-tarifas-grid">
              <div className="ap-tarifa-item" style={{ alignItems: 'stretch', gap: 8 }}>
                <label className="ap-tarifa-nombre" htmlFor="dev-cita">
                  {t('adm.instalaciones.reembolsoCita')}
                </label>
                <select
                  id="dev-cita"
                  className="ap-form-input"
                  value={selReembolso}
                  onChange={(e) => seleccionarElegible(e.target.value)}
                >
                  <option value="">{t('adm.instalaciones.reembolsoSelecciona')}</option>
                  {elegibles.map((e) => (
                    <option key={claveElegible(e)} value={claveElegible(e)}>
                      {e.etiqueta} — {formatoPeso(e.monto_pagado)}
                    </option>
                  ))}
                </select>
                <div className="ap-tarifa-editar">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    className="ap-form-input"
                    placeholder="% retención admin"
                    value={retencionPct}
                    onChange={(e) => setRetencionPct(e.target.value)}
                  />
                  <input
                    type="text"
                    className="ap-form-input"
                    placeholder={t('adm.instalaciones.reembolsoMotivo')}
                    value={motivoReembolso}
                    onChange={(e) => setMotivoReembolso(e.target.value)}
                  />
                  <button
                    type="button"
                    className="ap-btn ap-btn-primary"
                    disabled={creandoReembolso || !selReembolso || !retencionPct}
                    onClick={crearReembolso}
                  >
                    {creandoReembolso
                      ? t('adm.instalaciones.procesando')
                      : t('adm.instalaciones.reembolsar')}
                  </button>
                </div>
                {selReembolso && retencionPct && (() => {
                  const elegida = elegibles.find((e) => claveElegible(e) === selReembolso);
                  if (!elegida) return null;
                  const pct = parseFloat(retencionPct);
                  const alCliente = Math.round(elegida.monto_pagado * (1 - pct / 100));
                  const retenido = elegida.monto_pagado - alCliente;
                  return (
                    <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: '0.8rem' }}>
                      <span style={{ color: '#46d06f', fontWeight: 700 }}>
                        Cliente recibe: {formatoPeso(alCliente)}
                      </span>
                      <span style={{ color: '#d4a54b', fontWeight: 700 }}>
                        Admin retiene: {formatoPeso(retenido)} ({pct}%)
                      </span>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          <div className="ap-card">
            <div className="ap-card-head">
              <h3><FaMoneyBillWave /> {t('adm.devoluciones.historialTitulo')}</h3>
              <p>{t('adm.devoluciones.historialDesc')}</p>
            </div>
            <div className="ap-tarifas-grid">
              {reembolsos.length === 0 ? (
                <p style={{ color: '#9a8f78' }}>{t('adm.instalaciones.sinReembolsos')}</p>
              ) : (
                reembolsos.map((r) => (
                  <div className="ap-tarifa-item" key={r.id_reembolso} style={{ alignItems: 'flex-start' }}>
                    <div>
                      <span className="ap-tarifa-nombre" style={{ display: 'block' }}>
                        {r.referencia}
                        {r.cliente_nombre ? ` · ${r.cliente_nombre}` : ''}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: '#9a8f78' }}>
                        {r.detalle ? `${r.detalle} · ` : ''}
                        {r.numero_transaccion_reembolso || '—'}
                      </span>
                    </div>
                    <div className="ap-tarifa-valor">
                      <strong>{formatoPeso(r.monto)}</strong>
                      <span
                        className={`ap-badge ${
                          r.estado === 'Reembolsado' ? 'ok' : r.estado === 'Rechazado' ? 'err' : 'warn'
                        }`}
                      >
                        {r.estado}
                      </span>
                      {(r.estado === 'Pendiente' || r.estado === 'Rechazado') && (
                        <div style={{ marginTop: 8, padding: '10px 12px', background: 'rgba(212,165,75,0.06)', borderRadius: 10, border: '1px solid rgba(212,165,75,0.2)' }}>
                          {r.costo_original != null && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.78rem', color: '#9f9f9f' }}>
                              <span>Costo original:</span>
                              <strong style={{ color: '#eaeaea' }}>{formatoPeso(r.costo_original)}</strong>
                            </div>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <label
                              htmlFor={`pct-${r.id_reembolso}`}
                              style={{ fontSize: '0.72rem', color: '#9f9f9f', whiteSpace: 'nowrap' }}
                            >
                              % a reembolsar:
                            </label>
                            <input
                              id={`pct-${r.id_reembolso}`}
                              type="number"
                              min="1"
                              max="100"
                              placeholder="85"
                              value={porcentajes[r.id_reembolso] ?? ''}
                              onChange={(e) =>
                                setPorcentajes((prev) => ({
                                  ...prev,
                                  [r.id_reembolso]: e.target.value,
                                }))
                              }
                              className="ap-form-input"
                              style={{ width: 70, height: 32, fontSize: '0.8rem' }}
                            />
                            <span style={{ color: '#9f9f9f', fontSize: '0.78rem' }}>%</span>
                            {porcentajes[r.id_reembolso] && (() => {
                              const base = r.costo_original ?? r.monto;
                              return (
                                <span style={{ color: '#46d06f', fontSize: '0.82rem', fontWeight: 700 }}>
                                  → {formatoPeso(base * parseFloat(porcentajes[r.id_reembolso] || '0') / 100)} al cliente
                                </span>
                              );
                            })()}
                            <button
                              type="button"
                              className="ap-btn ap-btn-primary"
                              disabled={procesandoReembolso === r.id_reembolso || !porcentajes[r.id_reembolso]}
                              onClick={() => reprocesarReembolso(r.id_reembolso)}
                            >
                              <FaCircleCheck /> Confirmar reembolso
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Modal: aprobar con resolución ── */}
      {aprobarSol && (
        <div className="ap-modal-overlay">
          <div className="ap-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="ap-modal-head">
              <h3>Aprobar {aprobarSol.numero}</h3>
              <button type="button" className="ap-modal-x" onClick={() => setAprobarSol(null)}>×</button>
            </div>
            <div className="ap-modal-body">
              <p style={{ margin: '0 0 10px', fontSize: '0.85rem', color: '#bdbdbd' }}>
                ¿Cómo quieres resolver esta devolución? El cliente será notificado.
              </p>
              <label className="ap-form-label">Resolución</label>
              <select
                className="ap-form-select"
                value={resolucionSel}
                onChange={(e) => setResolucionSel(e.target.value as 'Reembolso' | 'Cambio')}
              >
                <option value="Reembolso">Reembolso del dinero ({formatoPeso(aprobarSol.monto_total)})</option>
                <option value="Cambio">Envío de producto de cambio</option>
              </select>
            </div>
            <div className="ap-modal-actions">
              <button type="button" className="ap-btn ap-btn-ghost" onClick={() => setAprobarSol(null)}>
                Cancelar
              </button>
              <button type="button" className="ap-btn ap-btn-primary" onClick={confirmarAprobacion}>
                Aprobar devolución
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: rechazar con motivo ── */}
      {rechazarSol && (
        <div className="ap-modal-overlay">
          <div className="ap-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="ap-modal-head">
              <h3>Rechazar {rechazarSol.numero}</h3>
              <button type="button" className="ap-modal-x" onClick={() => setRechazarSol(null)}>×</button>
            </div>
            <div className="ap-modal-body">
              <label className="ap-form-label">Motivo del rechazo *</label>
              <textarea
                className="ap-form-textarea"
                rows={3}
                placeholder="Explica al cliente por qué se rechaza su solicitud..."
                value={motivoRechazo}
                onChange={(e) => setMotivoRechazo(e.target.value)}
              />
            </div>
            <div className="ap-modal-actions">
              <button type="button" className="ap-btn ap-btn-ghost" onClick={() => setRechazarSol(null)}>
                Cancelar
              </button>
              <button type="button" className="ap-btn ap-btn-primary" onClick={confirmarRechazo}>
                Rechazar devolución
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: detalle de la solicitud ── */}
      {detalleSol && (
        <div className="ap-modal-overlay">
          <div className="ap-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ap-modal-head">
              <h3>Devolución {detalleSol.numero}</h3>
              <button type="button" className="ap-modal-x" onClick={() => setDetalleSol(null)}>×</button>
            </div>
            <div className="ap-modal-body">
              <dl className="ap-def-list">
                <div className="ap-def"><span className="ap-def-label">Pedido</span><span className="ap-def-value">#{detalleSol.id_pedido ?? '—'}</span></div>
                <div className="ap-def"><span className="ap-def-label">Estado</span><span className="ap-def-value"><span className={`ap-badge ${ESTADO_CLASE[detalleSol.estado] || ''}`}>{detalleSol.estado}</span></span></div>
                <div className="ap-def"><span className="ap-def-label">Fecha de solicitud</span><span className="ap-def-value">{formatFecha(detalleSol.created_at || '')}</span></div>
                <div className="ap-def"><span className="ap-def-label">Valor a devolver</span><span className="ap-def-value">{formatoPeso(detalleSol.monto_total)}</span></div>
                <div className="ap-def full"><span className="ap-def-label">Cliente</span><span className="ap-def-value">{detalleSol.cliente}{detalleSol.cliente_email ? ` · ${detalleSol.cliente_email}` : ''}</span></div>
                <div className="ap-def full"><span className="ap-def-label">Tipo</span><span className="ap-def-value">{detalleSol.tipo_devolucion === 'total' ? 'Devolución total del pedido' : 'Devolución parcial'}</span></div>
                <div className="ap-def full"><span className="ap-def-label">Motivo</span><span className="ap-def-value">{detalleSol.motivo_label}{detalleSol.motivo_otro ? ` — ${detalleSol.motivo_otro}` : ''}</span></div>
                {detalleSol.comentario && <div className="ap-def full"><span className="ap-def-label">Comentario del cliente</span><span className="ap-def-value">{detalleSol.comentario}</span></div>}
                {detalleSol.resolucion && <div className="ap-def"><span className="ap-def-label">Resolución</span><span className="ap-def-value">{detalleSol.resolucion}</span></div>}
                {detalleSol.motivo_rechazo && <div className="ap-def full"><span className="ap-def-label">Motivo del rechazo</span><span className="ap-def-value" style={{ color: '#ff8f93' }}>{detalleSol.motivo_rechazo}</span></div>}
                {detalleSol.reembolso && (
                  <div className="ap-def full">
                    <span className="ap-def-label">Reembolso</span>
                    <span className="ap-def-value">
                      {formatoPeso(detalleSol.reembolso.monto)} · {detalleSol.reembolso.estado}
                      {detalleSol.reembolso.numero_transaccion_reembolso
                        ? ` · ${detalleSol.reembolso.numero_transaccion_reembolso}`
                        : ''}
                    </span>
                  </div>
                )}
              </dl>

              <h4 style={{ margin: '14px 0 6px', fontSize: '0.9rem' }}>Productos a devolver</h4>
              <ul className="ap-dev-items">
                {detalleSol.items.map((it) => {
                  const recogidaHecha = it.recogida_estado === 'Recogida';
                  return (
                    <li key={it.id_devolucion} className="ap-dev-item">
                      <div>
                        <strong>{it.producto}</strong>
                        <small>
                          {it.cantidad} × {formatoPeso(it.precio_unitario)} = {formatoPeso(it.subtotal_linea)}
                          {' · '}
                          {recogidaHecha
                            ? 'Recogido por el técnico'
                            : it.recogida_estado === 'Asignada'
                              ? 'Recogida pendiente'
                              : 'Sin recogida'}
                        </small>
                        {it.tecnico_recogida_nombre && (
                          <small style={{ display: 'block', color: '#d4a54b' }}>
                            Técnico: {it.tecnico_recogida_nombre}
                          </small>
                        )}
                      </div>
                      {recogidaHecha ? (
                        <span className="ap-badge ok" style={{ whiteSpace: 'nowrap' }}>
                          Recogida confirmada
                        </span>
                      ) : (
                        <select
                          className="ap-form-select ap-dev-tecnico-select"
                          value={String(it.id_tecnico_recogida ?? '')}
                          disabled={reasignandoLinea === it.id_devolucion}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (v && v !== it.id_tecnico_recogida) {
                              reasignarTecnico(it.id_devolucion, v);
                            }
                          }}
                        >
                          <option value="">
                            {it.id_tecnico_recogida
                              ? '— Cambiar técnico —'
                              : '— Asignar técnico —'}
                          </option>
                          {tecnicos.map((tc) => (
                            <option key={tc.id} value={tc.id}>
                              {tc.nombre}
                              {tc.is_active ? '' : ' (inactivo)'}
                            </option>
                          ))}
                        </select>
                      )}
                    </li>
                  );
                })}
              </ul>

              <label className="ap-form-label" style={{ marginTop: 12 }}>
                Observaciones internas
              </label>
              <textarea
                className="ap-form-textarea"
                rows={3}
                placeholder="Notas del equipo sobre esta devolución..."
                value={observacionesTxt}
                onChange={(e) => setObservacionesTxt(e.target.value)}
              />
            </div>
            <div className="ap-modal-actions">
              <button type="button" className="ap-btn ap-btn-ghost" onClick={() => setDetalleSol(null)}>
                Cerrar
              </button>
              <button
                type="button"
                className="ap-btn ap-btn-primary"
                disabled={procesando === detalleSol.id_solicitud}
                onClick={guardarObservaciones}
              >
                Guardar observaciones
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`ap-toast ${toast.tipo}`} role="status">
          {toast.msg}
        </div>
      )}
    </motion.div>
  );
};

export default AdminDevoluciones;
