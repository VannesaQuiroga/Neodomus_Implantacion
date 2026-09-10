import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  FaBoxOpen,
  FaCalendarCheck,
  FaCalendarDays,
  FaCamera,
  FaCircleCheck,
  FaCircleInfo,
  FaEnvelope,
  FaLocationDot,
  FaPhone,
  FaPlus,
  FaTruckFast,
  FaUsers,
} from 'react-icons/fa6';
import '@styles/admin-panel.css';
import '@styles/dashboard-admin.css';
import api from '@services/api';
import { useIdioma } from '@i18n/IdiomaContext';
import NuevaNovedadModal from '@components/tecnico/NuevaNovedadModal';

interface CitaEntrega {
  id_cita: number;
  tipo_servicio?: string | null;
  fecha?: string | null;
  hora?: string | null;
  direccion?: string | null;
  estado?: string | null;
  tecnico?: string | null;
}

interface Entrega {
  id_pedido: number;
  cliente: string;
  telefono?: number | null;
  email?: string | null;
  direccion?: string | null;
  fecha_entrega?: string | null;
  hora_entrega?: string | null;
  hora_entrega_fin?: string | null;
  estado_entrega?: string | null;
  evidencias_entrega?: string[];
  productos?: { descripcion: string; cantidad: number; subtotal: number }[];
  cita?: CitaEntrega | null;
}

interface Recogida {
  id_devolucion: number;
  id_pedido?: number | null;
  producto: string;
  cliente: string;
  direccion: string;
  telefono?: number | null;
  estado_devolucion: string;
  preferencia: string;
  recogida_estado: 'Asignada' | 'Recogida' | null;
  motivo?: string | null;
  evidencia_recogida_url?: string | null;
  fecha_recogida?: string | null;
}

const API_HOST = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1').replace(/\/api\/v1\/?$/, '');

const urlEvidencia = (url: string) => (url.startsWith('http') ? url : `${API_HOST}${url}`);

type Toast = { msg: string; tipo: 'success' | 'error' } | null;

const TechnicianEntregas = () => {
  const { t } = useIdioma();
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [recogidas, setRecogidas] = useState<Recogida[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState(false);
  const [updatingEntrega, setUpdatingEntrega] = useState<number | null>(null);
  const [compartiendoUbicacion, setCompartiendoUbicacion] = useState(false);
  const [subiendoRecogida, setSubiendoRecogida] = useState<number | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const watchIdRef = useRef<number | null>(null);
  const recogidaRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // Novedad modal state
  const [novedadPedido, setNovedadPedido] = useState<Entrega | null>(null);

  const notificar = (msg: string, tipo: 'success' | 'error' = 'success') => {
    setToast({ msg, tipo });
    window.setTimeout(() => setToast(null), 3200);
  };

  const cargar = async () => {
    setLoading(true);
    setErrorCarga(false);
    try {
      const [res, resRec] = await Promise.all([
        api.get<Entrega[]>('/tecnicos/entregas'),
        api
          .get<Recogida[]>('/devoluciones/mis-recogidas')
          .catch(() => ({ data: [] as Recogida[] })),
      ]);
      setEntregas(res.data || []);
      setRecogidas(resRec.data || []);
    } catch (err) {
      console.error(err);
      setErrorCarga(true);
    } finally {
      setLoading(false);
    }
  };

  const confirmarRecogida = async (idDevolucion: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fd = new FormData();
    fd.append('file', files[0]);
    setSubiendoRecogida(idDevolucion);
    try {
      await api.post(`/devoluciones/${idDevolucion}/evidencia-recogida`, fd);
      notificar(t('tec.recogidaConfirmada'));
      await cargar();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || t('tec.recogidaError');
      notificar(msg, 'error');
    } finally {
      setSubiendoRecogida(null);
    }
  };

  useEffect(() => {
    cargar();
    return () => detenerUbicacion();
  }, []);

  const actualizarEntrega = async (pedidoId: number, nuevoEstado: string) => {
    setUpdatingEntrega(pedidoId);
    try {
      await api.put(`/tecnicos/entregas/${pedidoId}/estado`, { estado: nuevoEstado });
      notificar(
        nuevoEstado === 'Recogido'
          ? t('tec.avisoRecogido')
          : nuevoEstado === 'En camino'
            ? t('tec.avisoEnCamino')
            : t('tec.avisoEntregado'),
      );
      await cargar();
    } catch (err: any) {
      console.error(err);
      notificar(err.response?.data?.detail || t('tec.errorEstado'), 'error');
    } finally {
      setUpdatingEntrega(null);
    }
  };

  const detenerUbicacion = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setCompartiendoUbicacion(false);
  };

  const compartirUbicacion = () => {
    if (!('geolocation' in navigator)) {
      notificar(t('tec.ubicacionNoSoportada'), 'error');
      return;
    }
    if (compartiendoUbicacion) {
      detenerUbicacion();
      return;
    }
    if (watchIdRef.current !== null) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        try {
          await api.post('/tecnicos/ubicacion', {
            latitud: pos.coords.latitude,
            longitud: pos.coords.longitude,
          });
        } catch (err) {
          console.error(err);
        }
      },
      (err) => {
        console.error(err);
        detenerUbicacion();
        notificar(t('tec.ubicacionPermisoDenegado'), 'error');
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    );
    setCompartiendoUbicacion(true);
  };

  const enCamino = entregas.filter((e) => e.estado_entrega === 'En camino').length;
  // Las entregas ya marcadas como Entregado (con evidencia subida o sin fotos
  // pendientes) pasan al HISTORIAL y desaparecen de esta lista.
  const entregasActivas = entregas.filter(
    (e) =>
      e.estado_entrega !== 'Entregado' ||
      (e.evidencias_entrega || []).length === 0,
  );

  const evidenciaRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [subiendoEvidenciaId, setSubiendoEvidenciaId] = useState<number | null>(null);

  const subirEvidencias = async (pedidoId: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setSubiendoEvidenciaId(pedidoId);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append('files', f));
      await api.post(`/tecnicos/entregas/${pedidoId}/evidencias`, fd);
      // Con la evidencia subida se marca Entregado automáticamente.
      await api.put(`/tecnicos/entregas/${pedidoId}/estado`, { estado: 'Entregado' });
      notificar('Pedido entregado con evidencias guardadas');
      await cargar();
    } catch (err: any) {
      notificar(err.response?.data?.detail || 'No se pudieron guardar las evidencias', 'error');
    } finally {
      setSubiendoEvidenciaId(null);
    }
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
          <h1 className="ap-title"><FaTruckFast /> {t('tec.entregasTitulo')}</h1>
          <p className="ap-subtitle">
            {entregas.length > 0
              ? t('tec.entregasSubConteo', { n: entregas.length })
              : t('tec.sinEntregas')}
          </p>
        </div>
        <div className="ap-header-right">
          {enCamino > 0 && (
            <span className="ap-badge info">
              {t('tec.enCaminoConteo', { n: enCamino })}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="ap-card">
          <div className="ap-states">
            <span className="ap-loader" />
            <h3>{t('tec.cargandoEntregas')}</h3>
          </div>
        </div>
      ) : errorCarga ? (
        <div className="ap-card">
          <div className="ap-states error">
            <div className="ap-states-icon">
              <FaCircleInfo />
            </div>
            <h3>{t('adm.instalaciones.errorTitulo')}</h3>
            <button type="button" className="ap-btn ap-btn-ghost" onClick={cargar}>
              {t('adm.instalaciones.reintentar')}
            </button>
          </div>
        </div>
      ) : entregasActivas.length === 0 ? (
        <div className="ap-card">
          <div className="ap-states">
            <div className="ap-states-icon">
              <FaTruckFast />
            </div>
            <h3>{t('tec.sinEntregas')}</h3>
          </div>
        </div>
      ) : (
        <div className="ap-card">
          {entregasActivas.map((e) => (
            <div key={e.id_pedido} className="novedad-item">
              <div className="novedad-left">
                <div className="icon-circle"><FaTruckFast /></div>
                <div>
                  <h3>
                    {e.cliente}
                    <span className="muted" style={{ fontWeight: 'normal', marginLeft: 8 }}>
                      Pedido #{e.id_pedido}
                    </span>
                  </h3>
                  <p><FaCalendarDays style={{ marginRight: 6 }} />
                    {e.fecha_entrega
                      ? new Date(e.fecha_entrega).toLocaleDateString('es-CO', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })
                      : ''}{' '}
                    · {e.hora_entrega_fin ? `Entre ${e.hora_entrega || '10:00'} y ${e.hora_entrega_fin}` : (e.hora_entrega || '')}
                  </p>
                  <p><FaLocationDot style={{ marginRight: 6 }} />{e.direccion || t('tec.noRegistrado')}</p>
                  <p><FaPhone style={{ marginRight: 6 }} />{e.telefono ?? t('tec.noRegistrado')}</p>
                  {e.email ? <p><FaEnvelope style={{ marginRight: 6 }} />{e.email}</p> : null}
                  {e.cita && (
                    <p className="ap-entrega-cita">
                      <FaCalendarCheck style={{ marginRight: 6 }} />
                      <strong>
                        Adjunta al servicio: {e.cita.tipo_servicio || 'Instalación'}
                        {e.cita.fecha
                          ? ` · ${new Date(e.cita.fecha).toLocaleDateString('es-CO', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })}`
                          : ''}
                        {e.cita.hora ? ` · ${e.cita.hora}` : ''}
                      </strong>
                      {e.cita.estado ? (
                        <span className={`ap-badge ${e.cita.estado === 'Finalizada' ? 'ok' : 'pendiente'}`} style={{ marginLeft: 8 }}>
                          {e.cita.estado}
                        </span>
                      ) : null}
                    </p>
                  )}
                  {e.productos && e.productos.length > 0 && (
                    <div className="ap-entrega-productos">
                      {e.productos.map((p, idx) => (
                        <span key={idx}>× {p.cantidad} {p.descripcion}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                <span
                  className={`ap-badge ${
                    e.estado_entrega === 'Entregado'
                      ? 'ok'
                      : e.estado_entrega === 'En camino'
                        ? 'info'
                        : e.estado_entrega === 'Recogido'
                          ? 'proceso'
                          : 'pendiente'
                  }`}
                >
                  {e.estado_entrega || 'Asignada'}
                </span>
                {e.estado_entrega !== 'Entregado' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {e.estado_entrega !== 'Recogido' && e.estado_entrega !== 'En camino' && (
                      <button
                        type="button"
                        className="ap-btn ap-btn-primary"
                        disabled={updatingEntrega === e.id_pedido}
                        onClick={() => actualizarEntrega(e.id_pedido, 'Recogido')}
                      >
                        {updatingEntrega === e.id_pedido ? t('tec.procesando') : t('tec.yaRecogido')}
                      </button>
                    )}
                    {e.estado_entrega === 'Recogido' && (
                      <button
                        type="button"
                        className="ap-btn ap-btn-primary"
                        disabled={updatingEntrega === e.id_pedido}
                        onClick={() => actualizarEntrega(e.id_pedido, 'En camino')}
                      >
                        {updatingEntrega === e.id_pedido ? t('tec.procesando') : t('tec.enCamino')}
                      </button>
                    )}
                    {e.estado_entrega === 'En camino' && (
                      <button
                        type="button"
                        className="ap-btn ap-btn-ok"
                        disabled={updatingEntrega === e.id_pedido}
                        onClick={() => evidenciaRefs.current[e.id_pedido]?.click()}
                        title="Al elegir las fotos el pedido se marca como Entregado"
                      >
                        <FaCircleCheck />
                        {updatingEntrega === e.id_pedido ? t('tec.procesando') : t('tec.entregado')}
                      </button>
                    )}
                  </div>
                )}
                {e.estado_entrega === 'En camino' && (
                  <button
                    type="button"
                    className={`ap-btn ${compartiendoUbicacion ? 'ap-btn-ghost' : 'ap-btn-primary'}`}
                    onClick={compartirUbicacion}
                    title={t('tec.compartirUbicacionTitle')}
                  >
                    <FaLocationDot />
                    {compartiendoUbicacion ? t('tec.detenerUbicacion') : t('tec.compartirUbicacion')}
                  </button>
                )}
                {e.estado_entrega === 'Entregado' &&
                  (e.evidencias_entrega || []).length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {(e.evidencias_entrega || []).slice(0, 3).map((url) => (
                        <a key={url} href={urlEvidencia(url)} target="_blank" rel="noopener noreferrer">
                          <img
                            src={urlEvidencia(url)}
                            alt="Evidencia"
                            style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8 }}
                          />
                        </a>
                      ))}
                      {(e.evidencias_entrega || []).length > 3 && (
                        <span className="muted">+{(e.evidencias_entrega || []).length - 3}</span>
                      )}
                    </div>
                  )}
                {e.estado_entrega === 'Entregado' && (
                  <button
                    type="button"
                    className="ap-btn ap-btn-ghost"
                    disabled={subiendoEvidenciaId === e.id_pedido}
                    onClick={() => evidenciaRefs.current[e.id_pedido]?.click()}
                  >
                    <FaCamera /> Agregar más fotos
                  </button>
                )}
                <button
                  type="button"
                  className="ap-btn ap-btn-ghost"
                  style={{ fontSize: '0.78rem', padding: '5px 12px', border: '1px solid rgba(212,165,75,0.3)', color: '#d4a54b' }}
                  onClick={() => setNovedadPedido(e)}
                >
                  <FaPlus /> Agregar novedad
                </button>
                {/* Input oculto compartido: lo abre el botón Entregado para
                    adjuntar las fotos obligatorias antes de cambiar el estado */}
                <input
                  ref={(el) => { evidenciaRefs.current[e.id_pedido] = el; }}
                  type="file"
                  accept="image/*"
                  multiple
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={(ev) => {
                    subirEvidencias(e.id_pedido, ev.target.files);
                    ev.target.value = '';
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {recogidas.length > 0 && (
        <div className="ap-card" style={{ marginTop: 18 }}>
          <div className="ap-card-head">
            <h3>
              <FaBoxOpen /> {t('tec.recogidasTitulo')}
            </h3>
            <p>{t('tec.recogidasDesc')}</p>
          </div>
          <div className="ap-tarifas-grid">
            {recogidas.map((r) => (
              <div className="ap-tarifa-item" key={r.id_devolucion} style={{ alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <span className="ap-tarifa-nombre" style={{ display: 'block' }}>
                    Devolución #{r.id_devolucion} · {r.producto}
                  </span>
                  <span style={{ fontSize: '0.82rem', color: '#9a8f78', display: 'block' }}>
                    <FaUsers /> {r.cliente}
                    {r.telefono ? ` · ${r.telefono}` : ''}
                  </span>
                  <span style={{ fontSize: '0.82rem', color: '#9a8f78', display: 'block' }}>
                    <FaLocationDot /> {r.direccion}
                  </span>
                  {r.motivo && (
                    <span style={{ fontSize: '0.78rem', color: '#9a8f78', display: 'block' }}>
                      Motivo: {r.motivo}
                    </span>
                  )}
                </div>
                <div className="ap-tarifa-valor" style={{ flexWrap: 'wrap', gap: 6, maxWidth: 260 }}>
                  <span className={`ap-badge ${r.recogida_estado === 'Recogida' ? 'ok' : 'warn'}`}>
                    {r.recogida_estado === 'Recogida'
                      ? t('tec.recogidaHecha')
                      : t('tec.recogidaPendiente')}
                  </span>
                  {r.recogida_estado === 'Recogida' && r.evidencia_recogida_url && (
                    <a href={r.evidencia_recogida_url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={r.evidencia_recogida_url}
                        alt="Evidencia de recogida"
                        style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8 }}
                      />
                    </a>
                  )}
                  {r.recogida_estado !== 'Recogida' && (
                    <>
                      <button
                        type="button"
                        className="ap-btn ap-btn-primary"
                        disabled={subiendoRecogida === r.id_devolucion}
                        onClick={() => recogidaRefs.current[r.id_devolucion]?.click()}
                      >
                        <FaCamera />
                        {subiendoRecogida === r.id_devolucion
                          ? t('tec.procesando')
                          : t('tec.recogidaSubirEvidencia')}
                      </button>
                      <input
                        ref={(el) => { recogidaRefs.current[r.id_devolucion] = el; }}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        style={{ display: 'none' }}
                        onChange={(ev) => {
                          confirmarRecogida(r.id_devolucion, ev.target.files);
                          ev.target.value = '';
                        }}
                      />
                    </>
                  )}
                  {r.recogida_estado === 'Recogida' && r.fecha_recogida && (
                    <span style={{ fontSize: '0.75rem', color: '#9a8f78' }}>
                      {new Date(r.fecha_recogida).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {toast && (
        <div className={`ap-toast ${toast.tipo === 'error' ? 'err' : 'ok'}`} role="status">
          {toast.msg}
        </div>
      )}

      <NuevaNovedadModal
        abierto={!!novedadPedido}
        onCerrar={() => setNovedadPedido(null)}
        onCreado={cargar}
        tipoOrigen="pedido"
        idPedido={novedadPedido?.id_pedido}
        nombreCliente={novedadPedido?.cliente}
        referenciaLabel={`#${novedadPedido?.id_pedido}`}
      />
    </motion.div>
  );
};

export default TechnicianEntregas;

