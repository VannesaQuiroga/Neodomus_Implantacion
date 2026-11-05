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
import SectionHeader from './SectionHeader';

const TIPO_SERVICIO: Record<string, string> = {
  instalacion: 'Instalación',
  reparacion: 'Reparación',
  mantenimiento: 'Mantenimiento',
  revision: 'Revisión técnica',
  soporte: 'Soporte',
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

const formatearFecha = (fecha: string) => {
  try {
    return new Date(`${fecha}T00:00:00`).toLocaleDateString('es-CO', {
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
    cargar();
    const interval = setInterval(cargar, 60000);
    return () => {
      activo = false;
      clearInterval(interval);
    };
  }, []);

  const pasosDe = (c: CitaCliente) => [
    { paso: 'Solicitud registrada', completado: true },
    {
      paso: 'Técnico asignado',
      completado: Boolean(c.id_tecnico || c.nombre_tecnico || c.tecnico_nombre),
    },
    {
      paso: 'Cita confirmada',
      completado: c.estado === 'Confirmada' || c.estado === 'Finalizada',
    },
    { paso: 'Servicio realizado', completado: c.estado === 'Finalizada' },
  ];

  // Comunica con el backend mediante POST '/calificaciones'.
  const enviarCalificacion = async () => {
    if (!calificandoCita) return;
    if (ratingEstrellas < 1 || ratingEstrellas > 5) {
      setToast({ msg: 'Selecciona una calificación de 1 a 5 estrellas', tipo: 'error' });
      return;
    }
    setEnviandoRating(true);
    try {
      await api.post('/calificaciones', {
        id_cita: calificandoCita.id_cita,
        calificacion: ratingEstrellas,
        comentario: ratingComentario.trim() || undefined,
      });
      setToast({ msg: '¡Gracias por calificar al técnico!', tipo: 'success' });
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
        msg: err.response?.data?.detail || 'No se pudo guardar la calificación',
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
        title="Mis servicios"
        subtitle="Rastrea el estado de tus citas y servicios técnicos en tiempo real."
      />

      {loading ? (
        <div className="pf-empty">
          <p>Cargando tus servicios...</p>
        </div>
      ) : citas.length === 0 ? (
        <div className="pf-empty">
          <span className="pf-empty-icon"><FaCalendarCheck /></span>
          <p>No tienes servicios agendados. Cuando solicites una cita aparecerá aquí.</p>
        </div>
      ) : (
        <div className="pf-orders-list">
          {citas.map((cita) => {
            const abierta = expandida === cita.id_cita;
            const pasos = pasosDe(cita);
            const nombreTecnico =
              cita.tecnico_nombre || cita.nombre_tecnico || 'Por asignar';
            return (
              <div className="pf-order" key={cita.id_cita}>
                <div className="pf-order-top">
                  <div className="pf-order-id-col">
                    <span className="pf-order-id">#{cita.id_cita}</span>
                    <span className="pf-order-folio">
                      {TIPO_SERVICIO[cita.tipo_servicio] || cita.tipo_servicio}
                      {` · ${formatearFecha(cita.fecha)} · ${cita.hora}`}
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
                  <span>{abierta ? 'Ocultar rastreo del servicio' : 'Rastrear mi servicio'}</span>
                </button>

                {abierta && (
                  <div className="pf-order-details">
                    <div className="pf-detail-block">
                      <h4 className="pf-detail-title">Detalle del servicio</h4>
                      <div className="pf-detail-grid">
                        <div className="pf-detail-row">
                          <span className="pf-detail-label">Tipo de servicio</span>
                          <span className="pf-detail-value">
                            {TIPO_SERVICIO[cita.tipo_servicio] || cita.tipo_servicio}
                          </span>
                        </div>
                        <div className="pf-detail-row">
                          <span className="pf-detail-label">Fecha y hora</span>
                          <span className="pf-detail-value">
                            {formatearFecha(cita.fecha)} · {cita.hora}
                          </span>
                        </div>
                        <div className="pf-detail-row pf-detail-row-wide">
                          <span className="pf-detail-label">Dirección</span>
                          <span className="pf-detail-value">{cita.direccion || '—'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pf-detail-block">
                      <h4 className="pf-detail-title">Técnico asignado</h4>
                      {cita.id_tecnico || cita.nombre_tecnico || cita.tecnico_nombre ? (
                        <div className="pf-detail-grid">
                          <div className="pf-detail-row">
                            <span className="pf-detail-label">Técnico</span>
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
                              <span className="pf-detail-label">Especialidad</span>
                              <span className="pf-detail-value">
                                {cita.tecnico_certificacion}
                              </span>
                            </div>
                          )}
                          {cita.tecnico_telefono ? (
                            <div className="pf-detail-row">
                              <span className="pf-detail-label">Teléfono</span>
                              <span className="pf-detail-value">
                                <FaPhone style={{ marginRight: 6 }} />
                                {cita.tecnico_telefono}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <p className="pf-tracker-actualizado">
                          Aún no hay técnico asignado. Te notificaremos en cuanto se realice la asignación.
                        </p>
                      )}
                    </div>

                    {cita.estado === 'Cancelada' ? (
                      <div className="pf-detail-block">
                        <h4 className="pf-detail-title">Rastreo</h4>
                        <p className="pf-tracker-actualizado">
                          Esta cita fue cancelada. Puedes solicitar una nueva cuando quieras.
                        </p>
                      </div>
                    ) : (
                      <div className="pf-detail-block">
                        <h4 className="pf-detail-title">Rastreo del servicio</h4>
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
                          <FaStar /> Calificar técnico
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
        <div className="pf-modal-backdrop" onClick={() => setCalificandoCita(null)}>
          <div className="pf-modal pf-modal-small" onClick={(e) => e.stopPropagation()}>
            <div className="pf-modal-header">
              <h3><FaStar /> Califica al técnico</h3>
              <button type="button" className="pf-modal-close" onClick={() => setCalificandoCita(null)} aria-label="Cerrar">
                <FaXmark />
              </button>
            </div>
            <p style={{ color: '#c9b78f', fontSize: '0.9rem', margin: '0 0 12px' }}>
              {calificandoCita.tecnico_nombre || calificandoCita.nombre_tecnico || 'Técnico'} · {TIPO_SERVICIO[calificandoCita.tipo_servicio] || calificandoCita.tipo_servicio}
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
                  aria-label={`${n} estrellas`}
                >
                  <FaStar />
                </button>
              ))}
            </div>
            {ratingEstrellas > 0 && (
              <p style={{ textAlign: 'center', color: '#caa24d', fontSize: '0.88rem', fontWeight: 600, margin: '0 0 10px' }}>
                {ratingEstrellas === 1 && 'Malo'}
                {ratingEstrellas === 2 && 'Regular'}
                {ratingEstrellas === 3 && 'Bueno'}
                {ratingEstrellas === 4 && 'Muy bueno'}
                {ratingEstrellas === 5 && 'Excelente'}
              </p>
            )}
            <textarea
              className="pf-form-input pf-textarea"
              rows={3}
              placeholder="Comentario (opcional)..."
              value={ratingComentario}
              onChange={(e) => setRatingComentario(e.target.value)}
              maxLength={500}
              style={{ resize: 'vertical', minHeight: 60 }}
            />
            <div className="pf-form-actions" style={{ marginTop: 12 }}>
              <button type="button" className="pf-btn pf-btn-ghost" onClick={() => setCalificandoCita(null)} disabled={enviandoRating}>
                Cancelar
              </button>
              <button type="button" className="pf-btn pf-btn-primary" disabled={enviandoRating || ratingEstrellas < 1} onClick={enviarCalificacion}>
                {enviandoRating ? 'Enviando...' : <><FaStar /> Enviar calificación</>}
              </button>
            </div>
          </div>
        </div>
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
          {toast.msg}
        </div>
      )}
    </div>
  );
};

export default ServiciosTab;
