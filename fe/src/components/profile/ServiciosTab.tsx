import LocalizedNotificationText from '@components/common/LocalizedNotificationText';
// Presenta las citas y servicios del cliente dentro de su perfil.
import { useEffect, useState } from 'react';
import {
  FaCalendarCheck,
  FaCircleCheck,
  FaLocationDot,
  FaPhone,
  FaScrewdriverWrench,
  FaStar,
  FaXmark,
} from 'react-icons/fa6';
import api from '@services/api';
import { useIdioma } from '@i18n/IdiomaContext';
import SectionHeader from './SectionHeader';
import ModalPortal from '@components/common/ModalPortal';

const TIPO_SERVICIO: Record<string, string> = {
  instalacion: 'citas.instalacion',
  reparacion: 'citas.reparacion',
  mantenimiento: 'citas.mantenimiento',
  revision: 'citas.revisionTecnica',
  soporte: 'citas.soporte',
};

interface CitaCliente {
  id_cita: number;
  estado: string;
  tipo_servicio: string;
  fecha: string;
  hora: string;
  direccion: string;
  id_tecnico?: number | null;
  nombre_tecnico?: string | null;
  tecnico_nombre?: string | null;
  tecnico_telefono?: number | null;
  tecnico_email?: string | null;
  tecnico_foto_url?: string | null;
  tecnico_certificacion?: string | null;
}

const hoyISO = () => {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
};

const formatearFecha = (fecha: string, locale = 'es-CO') => {
  try {
    return new Date(`${fecha}T00:00:00`).toLocaleDateString(locale, {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return fecha;
  }
};

const estadoClase = (estado: string) => {
  switch (estado) {
    case 'Finalizada':
      return 'ok';
    case 'Cancelada':
      return 'err';
    case 'Confirmada':
      return 'info';
    default:
      return 'pendiente';
  }
};

type CitaOrdenada = CitaCliente & { esPasada: boolean; calificada?: boolean };

// Comunica con el backend mediante GET '/citas/mis-citas', POST '/calificaciones'; programa una actualización periódica.
const ServiciosTab = () => {
  const { t, idioma } = useIdioma();
  const locale = idioma === 'en' ? 'en-US' : 'es-CO';
  const [citas, setCitas] = useState<CitaOrdenada[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandida, setExpandida] = useState<number | null>(null);
  const [calificandoCita, setCalificandoCita] = useState<CitaOrdenada | null>(null);
  const [ratingEstrellas, setRatingEstrellas] = useState(0);
  const [ratingComentario, setRatingComentario] = useState('');
  const [enviandoRating, setEnviandoRating] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tipo: 'success' | 'error' } | null>(null);

  useEffect(() => {
    let activo = true;
    // Comunica con el backend mediante GET '/citas/mis-citas'.
    const cargar = async () => {
      try {
        const res = await api.get<CitaCliente[]>('/citas/mis-citas');
        const hoy = hoyISO();
        const ordenadas: CitaOrdenada[] = (Array.isArray(res.data) ? res.data : [])
          .map((c) => ({ ...c, esPasada: c.fecha < hoy }))
          .sort((a, b) => {
            if (a.esPasada !== b.esPasada) return a.esPasada ? 1 : -1;
            if (a.esPasada) return b.fecha.localeCompare(a.fecha) || b.hora.localeCompare(a.hora);
            return a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora);
          });
        if (activo) setCitas(ordenadas);
      } catch (err) {
        console.error('Error cargando servicios:', err);
        if (activo) setCitas([]);
      } finally {
        if (activo) setLoading(false);
      }
    };
    void cargar();
    const interval = setInterval(cargar, 60000);
    return () => {
      activo = false;
      clearInterval(interval);
    };
  }, []);

  const tipoServicioTexto = (tipo: string) => {
    const clave = TIPO_SERVICIO[tipo];
    return clave ? t(clave) : tipo;
  };

  const pasosDe = (c: CitaCliente) => [
    { paso: t('perfil.servicios.paso.solicitud'), completado: true },
    {
      paso: t('perfil.servicios.paso.tecnico'),
      completado: Boolean(c.id_tecnico || c.nombre_tecnico || c.tecnico_nombre),
    },
    {
      paso: t('perfil.servicios.paso.confirmada'),
      completado: c.estado === 'Confirmada' || c.estado === 'Finalizada',
    },
    { paso: t('perfil.servicios.paso.realizado'), completado: c.estado === 'Finalizada' },
  ];

  // Comunica con el backend mediante POST '/calificaciones'.
  const enviarCalificacion = async () => {
    if (!calificandoCita) return;
    if (ratingEstrellas < 1 || ratingEstrellas > 5) {
      setToast({ msg: t('perfil.servicios.errorEstrellas'), tipo: 'error' });
      return;
    }
    setEnviandoRating(true);
    try {
      await api.post('/calificaciones', {
        id_cita: calificandoCita.id_cita,
        calificacion: ratingEstrellas,
        comentario: ratingComentario.trim() || undefined,
      });
      setToast({ msg: t('perfil.servicios.graciasCalificacion'), tipo: 'success' });
      setCalificandoCita(null);
      setRatingEstrellas(0);
      setRatingComentario('');
      // Marcar la cita como calificada localmente
      setCitas((prev) =>
        prev.map((c) =>
          c.id_cita === calificandoCita.id_cita ? { ...c, calificada: true } : c
        )
      );
    } catch (err: any) {
      setToast({
        msg: err.response?.data?.detail || t('perfil.servicios.errorGuardar'),
        tipo: 'error',
      });
    } finally {
      setEnviandoRating(false);
    }
  };

  return (
    <div className="pf-tab">
      <SectionHeader
        icon={<FaScrewdriverWrench />}
        title={t('perfil.misServicios')}
        subtitle={t('perfil.servicios.subtitulo')}
      />

      {loading ? (
        <div className="pf-empty">
          <p>{t('perfil.servicios.cargando')}</p>
        </div>
      ) : citas.length === 0 ? (
        <div className="pf-empty">
          <span className="pf-empty-icon"><FaCalendarCheck /></span>
          <p>{t('perfil.servicios.vacio')}</p>
        </div>
      ) : (
        <div className="pf-orders-list">
          {citas.map((cita) => {
            const abierta = expandida === cita.id_cita;
            const pasos = pasosDe(cita);
            const nombreTecnico =
              cita.tecnico_nombre || cita.nombre_tecnico || t('perfil.servicios.porAsignar');
            return (
              <div className="pf-order" key={cita.id_cita}>
                <div className="pf-order-top">
                  <div className="pf-order-id-col">
                    <span className="pf-order-id">#{cita.id_cita}</span>
                    <span className="pf-order-folio">
                      {tipoServicioTexto(cita.tipo_servicio)}
                      {` · ${formatearFecha(cita.fecha, locale)} · ${cita.hora}`}
                    </span>
                  </div>
                  <div className="pf-order-stats">
                    <span className={`pf-status-badge ${estadoClase(cita.estado)}`}>
                      {cita.estado}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  className="pf-order-toggle"
                  onClick={() => setExpandida(abierta ? null : cita.id_cita)}
                  aria-expanded={abierta}
                >
                  <FaLocationDot />
                  <span>{abierta ? t('perfil.servicios.ocultarRastreo') : t('perfil.servicios.rastrear')}</span>
                </button>

                {abierta && (
                  <div className="pf-order-details">
                    <div className="pf-detail-block">
                      <h4 className="pf-detail-title">{t('perfil.servicios.detalle')}</h4>
                      <div className="pf-detail-grid">
                        <div className="pf-detail-row">
                          <span className="pf-detail-label">{t('citas.tipoServicio')}</span>
                          <span className="pf-detail-value">
                            {tipoServicioTexto(cita.tipo_servicio)}
                          </span>
                        </div>
                        <div className="pf-detail-row">
                          <span className="pf-detail-label">{t('perfil.servicios.fechaHora')}</span>
                          <span className="pf-detail-value">
                            {formatearFecha(cita.fecha, locale)} · {cita.hora}
                          </span>
                        </div>
                        <div className="pf-detail-row pf-detail-row-wide">
                          <span className="pf-detail-label">{t('citas.direccion')}</span>
                          <span className="pf-detail-value">{cita.direccion || '—'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pf-detail-block">
                      <h4 className="pf-detail-title">{t('citas.tecnicoAsignado')}</h4>
                      {cita.id_tecnico || cita.nombre_tecnico || cita.tecnico_nombre ? (
                        <div className="pf-detail-grid">
                          <div className="pf-detail-row">
                            <span className="pf-detail-label">{t('tec.tecnico')}</span>
                            <span className="pf-order-tecnico-entrega">
                              {cita.tecnico_foto_url && (
                                <img
                                  src={cita.tecnico_foto_url}
                                  alt={nombreTecnico}
                                  onError={(e) => (e.currentTarget.style.display = 'none')}
                                />
                              )}
                              {nombreTecnico}
                            </span>
                          </div>
                          {cita.tecnico_certificacion && (
                            <div className="pf-detail-row">
                              <span className="pf-detail-label">{t('perfil.servicios.especialidad')}</span>
                              <span className="pf-detail-value">
                                {cita.tecnico_certificacion}
                              </span>
                            </div>
                          )}
                          {cita.tecnico_telefono ? (
                            <div className="pf-detail-row">
                              <span className="pf-detail-label">{t('perfil.telefono')}</span>
                              <span className="pf-detail-value">
                                <FaPhone style={{ marginRight: 6 }} />
                                {cita.tecnico_telefono}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <p className="pf-tracker-actualizado">
                          {t('perfil.servicios.sinTecnico')}
                        </p>
                      )}
                    </div>

                    {cita.estado === 'Cancelada' ? (
                      <div className="pf-detail-block">
                        <h4 className="pf-detail-title">{t('perfil.servicios.rastreo')}</h4>
                        <p className="pf-tracker-actualizado">
                          {t('perfil.servicios.citaCancelada')}
                        </p>
                      </div>
                    ) : (
                      <div className="pf-detail-block">
                        <h4 className="pf-detail-title">{t('perfil.servicios.rastreoServicio')}</h4>
                        <div className="pf-tracker">
                          <div className="pf-tracker-pasos">
                            {pasos.map((p) => (
                              <div
                                key={p.paso}
                                className={`pf-tracker-paso ${p.completado ? 'done' : ''}`}
                              >
                                <span className="pf-tracker-dot">
                                  {p.completado ? <FaCircleCheck /> : null}
                                </span>
                                <span>{p.paso}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {cita.estado === 'Finalizada' && !cita.calificada && (
                      <div className="pf-detail-block">
                        <button
                          type="button"
                          className="pf-btn pf-btn-primary"
                          style={{ width: '100%', marginTop: 8 }}
                          onClick={() => {
                            setCalificandoCita(cita);
                            setRatingEstrellas(0);
                            setRatingComentario('');
                          }}
                        >
                          <FaStar /> {t('perfil.servicios.calificarTecnico')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de calificación */}
      {calificandoCita && (
        <ModalPortal>
          <div role="button" tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') (e.currentTarget as HTMLElement).click(); }}  className="pf-modal-backdrop" onClick={() => setCalificandoCita(null)}>
            <div role="button" tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') (e.currentTarget as HTMLElement).click(); }}  className="pf-modal pf-modal-small" onClick={(e) => e.stopPropagation()}>
            <div className="pf-modal-header">
              <h3><FaStar /> {t('perfil.servicios.modalTitulo')}</h3>
              <button type="button" className="pf-modal-close" onClick={() => setCalificandoCita(null)} aria-label={t('common.cerrar')}>
                <FaXmark />
              </button>
            </div>
            <p style={{ color: '#c9b78f', fontSize: '0.9rem', margin: '0 0 12px' }}>
              {calificandoCita.tecnico_nombre || calificandoCita.nombre_tecnico || t('tec.tecnico')} · {tipoServicioTexto(calificandoCita.tipo_servicio)}
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRatingEstrellas(n)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '1.8rem',
                    color: n <= ratingEstrellas ? '#ffc94d' : '#4a4236',
                    cursor: 'pointer',
                    transition: 'color 0.15s, transform 0.15s',
                    transform: n <= ratingEstrellas ? 'scale(1.1)' : 'none',
                  }}
                  aria-label={t('perfil.servicios.estrellas', { n })}
                >
                  <FaStar />
                </button>
              ))}
            </div>
            {ratingEstrellas > 0 && (
              <p style={{ textAlign: 'center', color: '#caa24d', fontSize: '0.88rem', fontWeight: 600, margin: '0 0 10px' }}>
                {ratingEstrellas === 1 && t('perfil.servicios.rating.malo')}
                {ratingEstrellas === 2 && t('perfil.servicios.rating.regular')}
                {ratingEstrellas === 3 && t('perfil.servicios.rating.bueno')}
                {ratingEstrellas === 4 && t('perfil.servicios.rating.muyBueno')}
                {ratingEstrellas === 5 && t('perfil.servicios.rating.excelente')}
              </p>
            )}
            <textarea
              className="pf-form-input pf-textarea"
              rows={3}
              placeholder={t('perfil.servicios.comentarioPlaceholder')}
              value={ratingComentario}
              onChange={(e) => setRatingComentario(e.target.value)}
              maxLength={500}
              style={{ resize: 'vertical', minHeight: 60 }}
            />
            <div className="pf-form-actions" style={{ marginTop: 12 }}>
              <button type="button" className="pf-btn pf-btn-ghost" onClick={() => setCalificandoCita(null)} disabled={enviandoRating}>
                {t('common.cancelar')}
              </button>
              <button type="button" className="pf-btn pf-btn-primary" disabled={enviandoRating || ratingEstrellas < 1} onClick={enviarCalificacion}>
                {enviandoRating ? t('perfil.servicios.enviando') : <><FaStar /> {t('perfil.servicios.enviarCalificacion')}</>}
              </button>
            </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 3000,
            background: toast.tipo === 'success' ? '#1a2e1a' : '#2e1a1a',
            color: toast.tipo === 'success' ? '#8fd98a' : '#e5484d',
            border: `1px solid ${toast.tipo === 'success' ? '#2f5b50' : '#5b2f2f'}`,
            borderRadius: 10,
            padding: '12px 18px',
            fontSize: '0.88rem',
            boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
          }}
        >
          <LocalizedNotificationText message={toast.msg} />
        </div>
      )}
    </div>
  );
};

export default ServiciosTab;
