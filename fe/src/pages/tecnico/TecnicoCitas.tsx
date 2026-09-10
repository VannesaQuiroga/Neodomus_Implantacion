import { useState, useEffect, useCallback } from 'react';
import {
  FaCalendarCheck,
  FaCalendarDays,
  FaCircleExclamation,
  FaClock,
  FaEnvelope,
  FaIdCard,
  FaLocationDot,
  FaMagnifyingGlass,
  FaPhone,
  FaPlus,
  FaScrewdriverWrench,
  FaUserTie,
  FaXmark,
  FaChartSimple,
} from 'react-icons/fa6';
import { useIdioma } from '@i18n/IdiomaContext';
import api from '@services/api';
import '@styles/admin-panel.css';
import '@styles/dashboard-admin.css';
import '@styles/citas.css';
import NuevaNovedadModal from '@components/tecnico/NuevaNovedadModal';

interface Cita {
  id_cita: number;
  fecha: string;
  hora: string;
  estado: string;
  tipo_servicio: string;
  cliente: string;
  direccion: string;
  telefono?: number | null;
  email?: string | null;
  documento_tipo?: string | null;
  documento_numero?: number | null;
  descripcion?: string | null;
  id_tecnico?: number | null;
  nombre_tecnico?: string | null;
  id_tecnico_2?: number | null;
  id_tecnico_3?: number | null;
  nombre_tecnico_2?: string | null;
  nombre_tecnico_3?: string | null;
  costo_cita?: number | null;
  id_comision_c?: number | null;
  comision_porcentaje?: number | null;
  comision_valor?: number | null;
}

const ESTADOS_ACTIVAS = ['Pendiente', 'Confirmada'];

const POR_PAGINA = 6;

const TIPO_SERVICIO: Record<string, string> = {
  instalacion: 'citas.instalacion',
  reparacion: 'citas.reparacion',
  mantenimiento: 'citas.mantenimiento',
  revision: 'citas.revisionTecnica',
  soporte: 'citas.soporte',
};

const ESTADO_COLORES: Record<string, { color: string; bg: string; border: string }> = {
  Pendiente: { color: '#ffd700', bg: 'rgba(255,215,0,0.1)', border: 'rgba(255,215,0,0.35)' },
  Confirmada: { color: '#3ddc84', bg: 'rgba(61,220,132,0.1)', border: 'rgba(61,220,132,0.35)' },
  Finalizada: { color: '#8ab4f8', bg: 'rgba(138,180,248,0.1)', border: 'rgba(138,180,248,0.35)' },
  Cancelada: { color: '#e5484d', bg: 'rgba(229,72,77,0.1)', border: 'rgba(229,72,77,0.35)' },
};

const TecnicoCitas = () => {
  const { idioma, t } = useIdioma();
  const [citas, setCitas] = useState<Cita[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [busqueda, setBusqueda] = useState('');
  const [fechaFiltro, setFechaFiltro] = useState('');
  const [horaFiltro, setHoraFiltro] = useState('');

  const [reagendando, setReagendando] = useState<Cita | null>(null);
  const [nuevaFecha, setNuevaFecha] = useState('');
  const [nuevaHora, setNuevaHora] = useState('');
  const [horasDisponibles, setHorasDisponibles] = useState<string[]>([]);
  const [cargandoHoras, setCargandoHoras] = useState(false);
  const [enviandoReagendamiento, setEnviandoReagendamiento] = useState(false);
  const [toastReagendar, setToastReagendar] = useState<{ msg: string; tipo: 'success' | 'error' } | null>(null);

  const [novedadCita, setNovedadCita] = useState<Cita | null>(null);

  const fetchCitas = async () => {
    try {
      const res = await api.get('/tecnicos/mis-citas');
      setCitas(res.data);
    } catch (err) {
      console.error('Error al cargar citas:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCitas();
    const interval = setInterval(fetchCitas, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatFecha = (fecha: string) => {
    const d = new Date(`${fecha}T00:00:00`);
    return d.toLocaleDateString(idioma === 'en' ? 'en-US' : 'es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const formatFechaCorta = (fecha: string) => {
    const d = new Date(`${fecha}T00:00:00`);
    return d.toLocaleDateString(idioma === 'en' ? 'en-US' : 'es-ES', {
      day: 'numeric',
      month: 'short',
    });
  };

  const cargarHorasDisponibles = useCallback(async (citaId: number, fecha: string) => {
    if (!fecha) {
      setHorasDisponibles([]);
      return;
    }
    setCargandoHoras(true);
    try {
      const res = await api.get<string[]>(`/tecnicos/citas/${citaId}/horas-disponibles`, {
        params: { fecha },
      });
      setHorasDisponibles(res.data);
      setNuevaHora('');
    } catch (err) {
      console.error('Error al cargar horas:', err);
      setHorasDisponibles([]);
    } finally {
      setCargandoHoras(false);
    }
  }, []);

  useEffect(() => {
    if (reagendando && nuevaFecha) {
      cargarHorasDisponibles(reagendando.id_cita, nuevaFecha);
    } else {
      setHorasDisponibles([]);
    }
  }, [reagendando, nuevaFecha, cargarHorasDisponibles]);

  const iniciarReagendar = (cita: Cita) => {
    setReagendando(cita);
    setNuevaFecha(cita.fecha);
    setNuevaHora('');
    setToastReagendar(null);
  };

  const cancelarReagendar = () => {
    setReagendando(null);
    setNuevaFecha('');
    setNuevaHora('');
    setHorasDisponibles([]);
    setToastReagendar(null);
  };

  const confirmarReagendar = async () => {
    if (!reagendando || !nuevaFecha || !nuevaHora) return;
    setEnviandoReagendamiento(true);
    setToastReagendar(null);
    try {
      await api.put(`/tecnicos/citas/${reagendando.id_cita}/reagendar`, {
        fecha: nuevaFecha,
        hora: nuevaHora,
        id_comision: reagendando.id_comision_c ?? 0,
      });
      setToastReagendar({ msg: t('tec.reagendada'), tipo: 'success' });
      fetchCitas();
      setTimeout(() => cancelarReagendar(), 2000);
    } catch (err: any) {
      console.error(err);
      setToastReagendar({
        msg: err.response?.data?.detail || t('tec.errorReagendar'),
        tipo: 'error',
      });
    } finally {
      setEnviandoReagendamiento(false);
    }
  };

  const q = busqueda.trim().toLowerCase();
  const activas = citas
    .filter((c) => ESTADOS_ACTIVAS.includes(c.estado))
    .filter((c) => {
      if (fechaFiltro && c.fecha !== fechaFiltro) return false;
      if (horaFiltro && c.hora !== horaFiltro) return false;
      if (!q) return true;
      const campos = [
        c.cliente,
        c.documento_numero?.toString() || '',
        c.telefono?.toString() || '',
        c.email || '',
        t(TIPO_SERVICIO[c.tipo_servicio] || 'citas.servicioGeneral'),
        formatFecha(c.fecha),
        c.fecha,
        c.hora,
        c.direccion,
        c.nombre_tecnico || '',
        c.nombre_tecnico_2 || '',
        t(`citas.${c.estado.toLowerCase()}`),
      ];
      return campos.some((v) => v.toLowerCase().includes(q));
    })
    .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));

  const sinResultados = activas.length === 0 && citas.length > 0;

  const totalPaginas = Math.max(1, Math.ceil(activas.length / POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const citasPagina = activas.slice(
    (paginaActual - 1) * POR_PAGINA,
    paginaActual * POR_PAGINA,
  );

  const formatMoneda = (valor: number) =>
    valor.toLocaleString(idioma === 'en' ? 'en-US' : 'es-CO', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });

  const hoyMinimo = (() => {
    const h = new Date();
    h.setDate(h.getDate() + 1);
    return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
  })();

  const pendientes = citas.filter((c) => c.estado === 'Pendiente').length;
  const confirmadas = citas.filter((c) => c.estado === 'Confirmada').length;

  return (
    <div className="admin-panel">
      <header className="ap-header">
        <div>
          <h1 className="ap-title"><FaCalendarCheck /> {t('tec.misCitas')}</h1>
          <p className="ap-subtitle">{t('tec.misCitasSub')}</p>
        </div>
      </header>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
        <div style={{
          background: 'linear-gradient(135deg, rgba(255,215,0,0.08), rgba(255,215,0,0.03))',
          border: '1px solid rgba(255,215,0,0.2)',
          borderRadius: 14, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'rgba(255,215,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#ffd700', fontSize: '1.1rem', flexShrink: 0
          }}><FaClock /></div>
          <div>
            <div style={{ color: '#9f9f9f', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Pendientes</div>
            <div style={{ color: '#ffd700', fontSize: '1.5rem', fontWeight: 800 }}>{pendientes}</div>
          </div>
        </div>
        <div style={{
          background: 'linear-gradient(135deg, rgba(61,220,132,0.08), rgba(61,220,132,0.03))',
          border: '1px solid rgba(61,220,132,0.2)',
          borderRadius: 14, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'rgba(61,220,132,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#3ddc84', fontSize: '1.1rem', flexShrink: 0
          }}><FaCalendarCheck /></div>
          <div>
            <div style={{ color: '#9f9f9f', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Confirmadas</div>
            <div style={{ color: '#3ddc84', fontSize: '1.5rem', fontWeight: 800 }}>{confirmadas}</div>
          </div>
        </div>
        <div style={{
          background: 'linear-gradient(135deg, rgba(138,180,248,0.08), rgba(138,180,248,0.03))',
          border: '1px solid rgba(138,180,248,0.2)',
          borderRadius: 14, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'rgba(138,180,248,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#8ab4f8', fontSize: '1.1rem', flexShrink: 0
          }}><FaChartSimple /></div>
          <div>
            <div style={{ color: '#9f9f9f', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Total Activas</div>
            <div style={{ color: '#8ab4f8', fontSize: '1.5rem', fontWeight: 800 }}>{activas.length}</div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
        <form className="ap-search" style={{ flex: '1 1 240px', minWidth: 240, margin: 0 }} onSubmit={(e) => e.preventDefault()}>
          <FaMagnifyingGlass />
          <input
            type="text"
            placeholder={t('tec.buscarPlaceholder')}
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }}
          />
        </form>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginLeft: 'auto' }}>
          <input
            type="date"
            className="ap-filtro-fecha"
            title={t('tec.filtrarFecha')}
            value={fechaFiltro}
            onChange={(e) => { setFechaFiltro(e.target.value); setPagina(1); }}
          />
          <select
            className="ap-filtro-estado"
            value={horaFiltro}
            onChange={(e) => { setHoraFiltro(e.target.value); setPagina(1); }}
          >
            <option value="">{t('tec.todasHoras')}</option>
            {Array.from({ length: 11 }, (_, i) => `${(i + 8).toString().padStart(2, '0')}:00`).map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
          {fechaFiltro && (
            <button type="button" className="ap-btn ap-btn-ghost" onClick={() => { setFechaFiltro(''); setPagina(1); }}>
              <FaXmark /> {t('tec.quitarFiltro')}
            </button>
          )}
        </div>
      </div>

      {/* Lista de citas */}
      <div className="ap-card" style={{ marginTop: 0 }}>
        {loading ? (
          <div className="ap-states">
            <span className="ap-loader" />
            <h3>{t('tec.cargandoCitas')}</h3>
          </div>
        ) : citas.length === 0 ? (
          <div className="ap-states">
            <div className="ap-states-icon"><FaCalendarDays /></div>
            <h3>{t('tec.vacioCitas')}</h3>
            <p>{t('tec.vacioCitasHint')}</p>
          </div>
        ) : sinResultados ? (
          <div className="ap-states">
            <div className="ap-states-icon"><FaMagnifyingGlass /></div>
            <h3>{t('tec.sinResultadosFiltro')}</h3>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {citasPagina.map((cita) => {
              const ec = ESTADO_COLORES[cita.estado] || ESTADO_COLORES.Pendiente;
              return (
                <div key={cita.id_cita} style={{
                  background: 'linear-gradient(180deg, #1c1c1c, #161616)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  borderRadius: 16, padding: '20px 24px',
                  transition: 'border-color 0.2s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(212,165,75,0.35)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)')}
                >
                  {/* Top row: cliente + badge */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <span style={{ color: '#fff', fontSize: '1rem', fontWeight: 700 }}>{cita.cliente}</span>
                        <span style={{
                          fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                          padding: '4px 12px', borderRadius: 999,
                          color: ec.color, background: ec.bg, border: `1px solid ${ec.border}`,
                        }}>
                          {t(`citas.${cita.estado.toLowerCase()}`)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', color: '#9f9f9f', fontSize: '0.85rem' }}>
                        {cita.documento_numero && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <FaIdCard /> {cita.documento_tipo || 'CC'} {cita.documento_numero}
                          </span>
                        )}
                        {cita.telefono && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <FaPhone /> {cita.telefono}
                          </span>
                        )}
                        {cita.email && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <FaEnvelope /> {cita.email}
                          </span>
                        )}
                      </div>
                    </div>
                    <span style={{ color: '#d4a54b', fontWeight: 800, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>#{cita.id_cita}</span>
                  </div>

                  {/* Info grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#ccc', fontSize: '0.88rem' }}>
                      <FaCalendarDays style={{ color: '#d4a54b', flexShrink: 0 }} />
                      <div>
                        <div style={{ fontWeight: 600 }}>{formatFechaCorta(cita.fecha)}</div>
                        <div style={{ color: '#8a8a8a', fontSize: '0.78rem' }}>{formatFecha(cita.fecha)}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#ccc', fontSize: '0.88rem' }}>
                      <FaClock style={{ color: '#d4a54b', flexShrink: 0 }} />
                      <span style={{ fontWeight: 600 }}>{cita.hora}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#ccc', fontSize: '0.88rem' }}>
                      <FaScrewdriverWrench style={{ color: '#d4a54b', flexShrink: 0 }} />
                      <span>{t(TIPO_SERVICIO[cita.tipo_servicio] || 'citas.servicioGeneral')}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#ccc', fontSize: '0.88rem' }}>
                      <FaUserTie style={{ color: '#d4a54b', flexShrink: 0 }} />
                      <span>{cita.nombre_tecnico || t('tec.tecnico')}</span>
                    </div>
                  </div>

                  {/* Dirección */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#8a8a8a', fontSize: '0.84rem', marginBottom: 8, paddingLeft: 2 }}>
                    <FaLocationDot style={{ color: '#d4a54b', flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cita.direccion}>{cita.direccion}</span>
                  </div>

                  {/* Descripción */}
                  {cita.descripcion && (
                    <div style={{
                      padding: '4px 8px', background: 'rgba(255,255,255,0.03)',
                      borderLeft: '3px solid #d4a54b', borderRadius: 4,
                      color: '#9f9f9f', fontSize: '0.72rem', lineHeight: 1.3, marginBottom: 8,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      maxWidth: '50%',
                    }} title={cita.descripcion}>
                      {cita.descripcion}
                    </div>
                  )}

                  {/* Comisión + acciones */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <div>
                      {cita.comision_valor != null ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
                            padding: '4px 10px', borderRadius: 999,
                            color: '#46d06f', background: 'rgba(46,160,67,0.13)',
                            border: '1px solid rgba(46,160,67,0.4)',
                          }}>
                            {t('tec.comision')} {cita.comision_porcentaje != null ? `${cita.comision_porcentaje}%` : ''}
                          </span>
                          <span style={{ color: '#8a8a8a', fontSize: '0.82rem' }}>{formatMoneda(cita.comision_valor)}</span>
                        </div>
                      ) : (
                        <span style={{ color: '#6b6b6b', fontSize: '0.82rem' }}>{t('tec.sinComision')}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {(cita.estado === 'Pendiente' || cita.estado === 'Confirmada') && (
                        <button
                          className="ap-btn ap-btn-secondary ap-btn-small"
                          onClick={() => iniciarReagendar(cita)}
                          style={{ fontSize: '0.8rem', padding: '8px 14px' }}
                        >
                          <FaCalendarDays /> {t('tec.reagendar')}
                        </button>
                      )}
                      <button
                        type="button"
                        className="ap-btn ap-btn-ghost"
                        style={{ fontSize: '0.8rem', padding: '8px 14px', border: '1px solid rgba(212,165,75,0.3)', color: '#d4a54b' }}
                        onClick={() => setNovedadCita(cita)}
                        title="Agregar novedad a esta cita"
                      >
                        <FaPlus /> Novedad
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && totalPaginas > 1 && (
          <div className="ap-paginacion">
            <button
              type="button"
              className="ap-page-btn"
              disabled={paginaActual === 1}
              onClick={() => setPagina(paginaActual - 1)}
            >
              ‹ {t('tec.anterior')}
            </button>
            <div className="ap-page-nums">
              {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`ap-page-btn ${n === paginaActual ? 'active' : ''}`}
                  onClick={() => setPagina(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="ap-page-btn"
              disabled={paginaActual === totalPaginas}
              onClick={() => setPagina(paginaActual + 1)}
            >
              {t('tec.siguiente')} ›
            </button>
          </div>
        )}
      </div>

      {activas.length > 0 && (
        <div className="ap-card" style={{ marginTop: 20, borderLeft: '4px solid #d4a54b' }}>
          <p style={{ margin: 0, color: '#dcdcdc', fontSize: '0.9rem' }}>
            <FaCircleExclamation style={{ marginRight: 8, color: '#d4a54b' }} />
            {t('tec.tienesPendientes', { n: activas.length })}
          </p>
        </div>
      )}

      {reagendando && (
        <div className="ap-modal-overlay" onClick={cancelarReagendar}>
          <div className="ap-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="ap-modal-head">
              <div>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FaCalendarDays style={{ color: '#d4a54b' }} /> {t('tec.reagendarTitulo')}
                </h3>
                <p style={{ color: '#9f9f9f', fontSize: '0.82rem', marginTop: 4 }}>{t('tec.reagendarSub')}</p>
              </div>
              <button type="button" className="ap-modal-x" onClick={cancelarReagendar}>
                <FaXmark />
              </button>
            </div>

            {/* Resumen de la cita actual */}
            <div style={{
              background: 'rgba(212,165,75,0.06)', border: '1px solid rgba(212,165,75,0.2)',
              borderRadius: 12, padding: '14px 16px', marginTop: 14
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <FaIdCard style={{ color: '#d4a54b' }} />
                <span style={{ color: '#f0c96f', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {t('tec.datosCita')}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                <div>
                  <span style={{ color: '#8a8a8a', fontSize: '0.72rem', textTransform: 'uppercase' }}>{t('tec.cliente')}</span>
                  <p style={{ color: '#fff', fontSize: '0.88rem', margin: '2px 0 0', fontWeight: 600 }}>{reagendando.cliente}</p>
                </div>
                <div>
                  <span style={{ color: '#8a8a8a', fontSize: '0.72rem', textTransform: 'uppercase' }}>{t('tec.motivo')}</span>
                  <p style={{ color: '#fff', fontSize: '0.88rem', margin: '2px 0 0', fontWeight: 600 }}>
                    {t(TIPO_SERVICIO[reagendando.tipo_servicio] || 'citas.servicioGeneral')}
                  </p>
                </div>
                <div>
                  <span style={{ color: '#8a8a8a', fontSize: '0.72rem', textTransform: 'uppercase' }}>{t('tec.fechaActual')}</span>
                  <p style={{ color: '#fff', fontSize: '0.88rem', margin: '2px 0 0', fontWeight: 600 }}>{formatFecha(reagendando.fecha)}</p>
                </div>
                <div>
                  <span style={{ color: '#8a8a8a', fontSize: '0.72rem', textTransform: 'uppercase' }}>{t('tec.horaActual')}</span>
                  <p style={{ color: '#fff', fontSize: '0.88rem', margin: '2px 0 0', fontWeight: 600 }}>{reagendando.hora}</p>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <span style={{ color: '#8a8a8a', fontSize: '0.72rem', textTransform: 'uppercase' }}>{t('tec.direccion')}</span>
                  <p style={{ color: '#fff', fontSize: '0.88rem', margin: '2px 0 0', fontWeight: 600 }}>{reagendando.direccion}</p>
                </div>
                <div>
                  <span style={{ color: '#8a8a8a', fontSize: '0.72rem', textTransform: 'uppercase' }}><FaUserTie /> {t('tec.tecnico')}</span>
                  <p style={{ color: '#fff', fontSize: '0.88rem', margin: '2px 0 0', fontWeight: 600 }}>
                    {reagendando.nombre_tecnico || '-'}
                    {reagendando.nombre_tecnico_2 ? `, ${reagendando.nombre_tecnico_2}` : ''}
                    {reagendando.nombre_tecnico_3 ? `, ${reagendando.nombre_tecnico_3}` : ''}
                  </p>
                </div>
                {reagendando.descripcion && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={{ color: '#8a8a8a', fontSize: '0.72rem', textTransform: 'uppercase' }}>{t('tec.descripcion')}</span>
                    <p style={{ color: '#ccc', fontSize: '0.84rem', margin: '2px 0 0', lineHeight: 1.5 }}>{reagendando.descripcion}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Selector de nueva fecha */}
            <div style={{ marginTop: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#d4a54b', fontSize: '0.8rem', fontWeight: 600, marginBottom: 6 }}>
                <FaCalendarDays /> {t('tec.nuevaFecha')}
              </label>
              <input
                type="date"
                value={nuevaFecha}
                min={hoyMinimo}
                onChange={(e) => setNuevaFecha(e.target.value)}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 12,
                  border: '1px solid rgba(212,165,75,0.4)', background: '#0f0f0f',
                  color: '#f0c96f', fontSize: '0.88rem', fontFamily: 'inherit', outline: 'none',
                  boxSizing: 'border-box', colorScheme: 'dark',
                }}
              />
            </div>

            {/* Selector de nueva hora */}
            <div style={{ marginTop: 14 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#d4a54b', fontSize: '0.8rem', fontWeight: 600, marginBottom: 6 }}>
                <FaClock /> {t('tec.nuevaHora')}
              </label>
              {!nuevaFecha && (
                <p style={{ color: '#8a8a8a', fontSize: '0.8rem', margin: 0 }}>{t('tec.seleccionaFecha')}</p>
              )}
              {nuevaFecha && cargandoHoras && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
                  <span className="ap-loader" />
                </div>
              )}
              {nuevaFecha && !cargandoHoras && horasDisponibles.length === 0 && (
                <p style={{ color: '#8a8a8a', fontSize: '0.8rem', margin: 0 }}>{t('tec.sinHorasDisponibles')}</p>
              )}
              {nuevaFecha && !cargandoHoras && horasDisponibles.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {horasDisponibles.map((hora) => (
                    <button
                      key={hora}
                      type="button"
                      style={{
                        background: nuevaHora === hora ? 'linear-gradient(135deg, #ffd700, #d4a54b)' : '#161616',
                        border: nuevaHora === hora ? 'none' : '1px solid rgba(255,255,255,0.12)',
                        color: nuevaHora === hora ? '#141414' : '#ccc',
                        fontWeight: nuevaHora === hora ? 700 : 500,
                        fontFamily: 'inherit', fontSize: '0.86rem',
                        padding: '9px 16px', borderRadius: 10,
                        cursor: 'pointer', transition: 'all 0.18s ease',
                        minWidth: 70,
                      }}
                      onClick={() => setNuevaHora(hora)}
                    >
                      {hora}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {toastReagendar && (
              <div style={{
                marginTop: 12, padding: '10px 14px', borderRadius: 10, fontSize: '0.84rem', fontWeight: 600,
                ...(toastReagendar.tipo === 'success'
                  ? { background: 'rgba(46,160,67,0.12)', border: '1px solid rgba(46,160,67,0.4)', color: '#46d06f' }
                  : { background: 'rgba(229,72,77,0.12)', border: '1px solid rgba(229,72,77,0.4)', color: '#ff8f93' }),
              }}>
                {toastReagendar.msg}
              </div>
            )}

            <p style={{ color: '#8a8a8a', fontSize: '0.78rem', margin: '12px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
              <FaCircleExclamation style={{ color: '#d4a54b' }} />
              {t('tec.reagendarNota')}
            </p>

            <div className="ap-modal-actions" style={{ marginTop: 14 }}>
              <button
                type="button"
                className="ap-btn ap-btn-ghost"
                onClick={cancelarReagendar}
                disabled={enviandoReagendamiento}
              >
                {t('tec.cancelarReagendar')}
              </button>
              <button
                type="button"
                className="ap-btn ap-btn-primary"
                disabled={!nuevaFecha || !nuevaHora || enviandoReagendamiento}
                onClick={confirmarReagendar}
                style={{ background: 'linear-gradient(135deg, #ffd700, #d4a54b)', color: '#141414', fontWeight: 700 }}
              >
                {enviandoReagendamiento ? t('citas.guardando') : t('tec.confirmarReagendar')}
              </button>
            </div>
          </div>
        </div>
      )}

      <NuevaNovedadModal
        abierto={!!novedadCita}
        onCerrar={() => setNovedadCita(null)}
        onCreado={fetchCitas}
        tipoOrigen="cita"
        idCita={novedadCita?.id_cita}
        idCliente={undefined}
        nombreCliente={novedadCita?.cliente}
        referenciaLabel={`#${novedadCita?.id_cita}`}
      />
    </div>
  );
};

export default TecnicoCitas;
