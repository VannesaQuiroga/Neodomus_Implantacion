// Pantalla TecnicoHistorial de Neodomus. Reúne el estado y las acciones de su vista.
import { useState, useEffect } from 'react';
import {
  FaCalendarDays,
  FaClock,
  FaClockRotateLeft,
  FaLocationDot,
  FaMagnifyingGlass,
  FaScrewdriverWrench,
  FaTruckFast,
  FaUserTie,
} from 'react-icons/fa6';
import { useIdioma } from '@i18n/IdiomaContext';
import api from '@services/api';
import AuthImage from '@components/common/AuthImage';
import '@styles/admin-panel.css';
import '@styles/dashboard-admin.css';

interface Cita {
  id_cita: number;
  fecha: string;
  hora: string;
  estado: string;
  tipo_servicio: string;
  cliente: string;
  direccion: string;
  telefono?: number | null;
  descripcion?: string | null;
  id_tecnico?: number | null;
  nombre_tecnico?: string | null;
  id_tecnico_2?: number | null;
  id_tecnico_3?: number | null;
  nombre_tecnico_2?: string | null;
  nombre_tecnico_3?: string | null;
  evidencias?: { url: string; descripcion?: string | null }[];
}





interface EntregaHistorial {
  id_pedido: number;
  cliente: string;
  fecha_entrega?: string | null;
  hora_entrega?: string | null;
  hora_entrega_fin?: string | null;
  estado_entrega?: string | null;
  evidencias_entrega?: string[];
  productos?: { descripcion: string; cantidad: number }[];
}

type Filtro = 'todas' | 'Finalizada' | 'Cancelada';
type FiltroEntrega = 'todas' | 'Recogido' | 'En camino' | 'Entregado';

const ESTADOS_HISTORIAL = ['Finalizada', 'Cancelada'];

const TIPO_SERVICIO: Record<string, string> = {
  instalacion: 'citas.instalacion',
  reparacion: 'citas.reparacion',
  mantenimiento: 'citas.mantenimiento',
  revision: 'citas.revisionTecnica',
  soporte: 'citas.soporte',
};

const ESTADO_BADGE: Record<string, string> = {
  Pendiente: 'pendiente',
  Confirmada: 'info',
  Finalizada: 'ok',
  Cancelada: 'err',
};

// Comunica con el backend mediante GET '/tecnicos/mis-citas', GET '/tecnicos/entregas'; programa una actualización periódica.
const TecnicoHistorial = () => {
  const { idioma, t } = useIdioma();
  const [vista, setVista] = useState<'citas' | 'entregas'>('citas');
  const [citas, setCitas] = useState<Cita[]>([]);
  const [entregas, setEntregas] = useState<EntregaHistorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [filtroEntrega, setFiltroEntrega] = useState<FiltroEntrega>('todas');
  const [busqueda, setBusqueda] = useState('');
  const [filtroFecha, setFiltroFecha] = useState('');
  const [filtroHora, setFiltroHora] = useState('');

  const hayFiltros =
    Boolean(busqueda.trim()) ||
    filtro !== 'todas' ||
    filtroEntrega !== 'todas' ||
    Boolean(filtroFecha) ||
    Boolean(filtroHora);

  // Al cambiar de pestaña el filtro de estado vuelve a "todas".
  useEffect(() => {
    setFiltro('todas');
    setFiltroEntrega('todas');
  }, [vista]);

  const limpiarFiltros = () => {
    setBusqueda('');
    setFiltro('todas');
    setFiltroEntrega('todas');
    setFiltroFecha('');
    setFiltroHora('');
  };

  // Comunica con el backend mediante GET '/tecnicos/mis-citas'.
  const fetchCitas = async () => {
    try {
      const res = await api.get('/tecnicos/mis-citas');
      setCitas(res.data);
    } catch (err) {
      console.error('Error al cargar historial:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCitas();
    const interval = setInterval(fetchCitas, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (vista !== 'entregas' || entregas.length > 0) return;
    let activo = true;
    // Comunica con el backend mediante GET '/tecnicos/entregas'.
    const cargarEntregas = async () => {
      try {
        const res = await api.get('/tecnicos/entregas');
        if (activo) setEntregas(res.data || []);
      } catch (err) {
        console.error('Error al cargar entregas:', err);
      }
    };
    cargarEntregas();
    return () => {
      activo = false;
    };
  }, [vista, entregas.length]);

  const entregasHistorial = entregas
    .filter((e) => e.estado_entrega === 'Entregado')
    .sort((a, b) =>
      (b.fecha_entrega || '').localeCompare(a.fecha_entrega || ''),
    );

  const qEntrega = busqueda.trim().toLowerCase();
  const qEntregasBusqueda = busqueda.trim().toLowerCase();
  const entregasVisibles = entregasHistorial.filter((e) => {
    if (filtroEntrega !== 'todas' && e.estado_entrega !== filtroEntrega) return false;
    if (filtroFecha && (e.fecha_entrega || '') !== filtroFecha) return false;
    if (filtroHora && (e.hora_entrega || '').slice(0, 5) !== filtroHora) return false;
    if (!qEntregasBusqueda) return true;
    const campos = [
      e.cliente,
      String(e.id_pedido),
      e.fecha_entrega || '',
      e.hora_entrega || '',
    ];
    return campos.some((v) => v.toLowerCase().includes(qEntrega));
  });

  const historial = citas
    .filter((c) => ESTADOS_HISTORIAL.includes(c.estado))
    .sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));

  const formatFecha = (fecha: string) => {
    const d = new Date(`${fecha}T00:00:00`);
    return d.toLocaleDateString(idioma === 'en' ? 'en-US' : 'es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const q = busqueda.trim().toLowerCase();
  const visibles = historial.filter((c) => {
    if (filtro !== 'todas' && c.estado !== filtro) return false;
    if (filtroFecha && c.fecha !== filtroFecha) return false;
    if (filtroHora && c.hora.slice(0, 5) !== filtroHora) return false;
    if (!q) return true;
    const campos = [
      c.cliente,
      c.telefono?.toString() || '',
      formatFecha(c.fecha),
      c.fecha,
      c.hora,
      t(TIPO_SERVICIO[c.tipo_servicio] || 'citas.servicioGeneral'),
      c.descripcion || '',
      c.direccion,
      c.nombre_tecnico || '',
      c.nombre_tecnico_2 || '',
      t(`citas.${c.estado.toLowerCase()}`),
    ];
    return campos.some((v) => v.toLowerCase().includes(q));
  });

  return (
    <div className="admin-panel">
      <header className="ap-header">
        <div>
          <h1 className="ap-title"><FaClockRotateLeft /> {t('tec.historialTitulo')}</h1>
          <p className="ap-subtitle">{t('tec.historialSub')}</p>
        </div>
        <div className="ap-header-right">
          <div className="ap-filtros-bar">
            <form className="ap-search ap-filtro-buscar" onSubmit={(e) => e.preventDefault()}>
              <FaMagnifyingGlass />
              <input
                type="text"
                placeholder={t('tec.buscarPlaceholder')}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </form>
            {vista === 'citas' ? (
              <select
                className="ap-filtro-estado"
                value={filtro}
                onChange={(e) => setFiltro(e.target.value as Filtro)}
                aria-label={t('tec.estado')}
              >
                <option value="todas">{t('tec.todas')}</option>
                <option value="Finalizada">{t('citas.finalizada')}</option>
                <option value="Cancelada">{t('citas.cancelada')}</option>
              </select>
            ) : (
              <select
                className="ap-filtro-estado"
                value={filtroEntrega}
                onChange={(e) => setFiltroEntrega(e.target.value as FiltroEntrega)}
                aria-label={t('tec.estado')}
              >
                <option value="todas">{t('tec.todas')}</option>
                <option value="Recogido">{t('tec.recogido')}</option>
                <option value="En camino">{t('tec.enCamino')}</option>
                <option value="Entregado">{t('tec.entregado')}</option>
              </select>
            )}
            <FaCalendarDays className="ap-filtros-icono" />
            <input
              type="date"
              className="ap-filtro-fecha"
              value={filtroFecha}
              onChange={(e) => setFiltroFecha(e.target.value)}
              aria-label={t('tec.fecha')}
              title={t('tec.fecha')}
            />
            <FaClock className="ap-filtros-icono" />
            <input
              type="time"
              className="ap-filtro-fecha ap-filtro-hora"
              value={filtroHora}
              onChange={(e) => setFiltroHora(e.target.value)}
              aria-label={t('tec.hora')}
              title={t('tec.hora')}
            />
            {hayFiltros && (
              <button
                type="button"
                className="ap-btn ap-btn-ghost ap-filtros-limpiar"
                onClick={limpiarFiltros}
              >
                Limpiar
              </button>
            )}
          </div>
          <div className="ap-tabs">
            <button
              type="button"
              className={`ap-btn ${vista === 'citas' ? 'ap-btn-primary' : 'ap-btn-ghost'}`}
              onClick={() => setVista('citas')}
            >
              <FaScrewdriverWrench /> Citas
            </button>
            <button
              type="button"
              className={`ap-btn ${vista === 'entregas' ? 'ap-btn-primary' : 'ap-btn-ghost'}`}
              onClick={() => setVista('entregas')}
            >
              <FaTruckFast /> Entregas
            </button>
          </div>
        </div>
      </header>

      {vista === 'entregas' ? (
        <div className="ap-card" style={{ marginTop: 8 }}>
          {loading || entregas.length === 0 ? (
            <div className="ap-states">
              <div className="ap-states-icon"><FaTruckFast /></div>
              <h3>{'No tienes entregas completadas todavía.'}</h3>
            </div>
          ) : entregasVisibles.length === 0 ? (
            <div className="ap-states">
              <div className="ap-states-icon"><FaMagnifyingGlass /></div>
              <h3>{t('tec.vacioHistorial')}</h3>
            </div>
          ) : (
            <div className="ap-table-wrap">
              <table className="ap-table">
                <thead>
                  <tr>
                    <th>{t('tec.cliente')}</th>
                    <th>Pedido</th>
                    <th>{t('tec.fecha')}</th>
                    <th>Franja</th>
                    <th>Productos</th>
                    <th>{t('tec.estado')}</th>
                    <th>Evidencia</th>
                  </tr>
                </thead>
                <tbody>
                  {entregasVisibles.map((e) => (
                    <tr key={e.id_pedido}>
                      <td><strong>{e.cliente}</strong></td>
                      <td>#{e.id_pedido}</td>
                      <td>
                        <FaCalendarDays />{' '}
                        {e.fecha_entrega
                          ? new Date(`${e.fecha_entrega}T00:00:00`).toLocaleDateString(idioma === 'en' ? 'en-US' : 'es-ES')
                          : '—'}
                      </td>
                      <td>
                        <FaClock />{' '}
                        {e.hora_entrega_fin
                          ? `${e.hora_entrega || ''} - ${e.hora_entrega_fin}`
                          : e.hora_entrega || '—'}
                      </td>
                      <td>
                        {(e.productos || []).map((p, i) => (
                          <div key={i} className="muted">
                            × {p.cantidad} {p.descripcion}
                          </div>
                        ))}
                      </td>
                      <td>
                        <span className="ap-badge ok">{e.estado_entrega}</span>
                      </td>
                      <td>
                        {e.evidencias_entrega && e.evidencias_entrega.length > 0 ? (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {e.evidencias_entrega.slice(0, 3).map((url) => (
                              <AuthImage
                                key={url}
                                src={url}
                                alt="Evidencia"
                                style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6 }}
                              />
                            ))}
                            {e.evidencias_entrega.length > 3 && (
                              <span className="muted">+{e.evidencias_entrega.length - 3}</span>
                            )}
                          </div>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
      <div className="ap-card" style={{ marginTop: 8 }}>
        {loading ? (
          <div className="ap-states">
            <span className="ap-loader" />
            <h3>{t('tec.cargandoCitas')}</h3>
          </div>
        ) : (
          <>
            {historial.length === 0 ? (
              <div className="ap-states">
                <div className="ap-states-icon"><FaClockRotateLeft /></div>
                <h3>{t('tec.vacioHistorial')}</h3>
                <p>{t('tec.vacioHistorialHint')}</p>
              </div>
            ) : visibles.length === 0 ? (
              <div className="ap-states">
                <div className="ap-states-icon"><FaMagnifyingGlass /></div>
                <h3>{t('tec.vacioHistorial')}</h3>
                <p>{t('tec.vacioHistorialHint')}</p>
              </div>
            ) : (
              <div className="ap-table-wrap">
                <table className="ap-table">
                  <thead>
                    <tr>
                      <th>{t('tec.cliente')}</th>
                      <th>{t('tec.fecha')}</th>
                      <th>{t('tec.hora')}</th>
                      <th>{t('tec.motivo')}</th>
                      <th>{t('tec.estado')}</th>
                      <th>{t('tec.tecnico')}</th>
                      <th>Evidencias</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map((cita) => (
                      <tr key={cita.id_cita}>
                        <td>
                          <strong>{cita.cliente}</strong>
                          {cita.telefono ? <div className="muted">{cita.telefono}</div> : null}
                        </td>
                        <td>
                          <FaCalendarDays /> {formatFecha(cita.fecha)}
                        </td>
                        <td>
                          <FaClock /> {cita.hora}
                        </td>
                        <td>
                          <FaScrewdriverWrench /> {t(TIPO_SERVICIO[cita.tipo_servicio] || 'citas.servicioGeneral')}
                          {cita.descripcion ? (
                            <div className="muted" style={{ marginTop: 4 }}>{cita.descripcion}</div>
                          ) : null}
                          <div className="muted" style={{ marginTop: 4 }}>
                            <FaLocationDot /> {cita.direccion}
                          </div>
                        </td>
                        <td>
                          <span className={`ap-badge ${ESTADO_BADGE[cita.estado] || 'neutral'}`}>
                            {t(`citas.${cita.estado.toLowerCase()}`)}
                          </span>
                        </td>
                        <td>
                          <FaUserTie /> {cita.nombre_tecnico || t('tec.tecnico')}
                          {cita.nombre_tecnico_2 ? <div className="muted"><FaUserTie /> {cita.nombre_tecnico_2}</div> : null}
                          {cita.nombre_tecnico_3 ? <div className="muted"><FaUserTie /> {cita.nombre_tecnico_3}</div> : null}
                        </td>
                        <td>
                          {cita.evidencias && cita.evidencias.length > 0 ? (
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {cita.evidencias.slice(0, 3).map((ev) => (
                                <AuthImage
                                  key={ev.url}
                                  src={ev.url}
                                  alt="Evidencia"
                                  style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6 }}
                                />
                              ))}
                              {cita.evidencias.length > 3 && (
                                <span className="muted">+{cita.evidencias.length - 3}</span>
                              )}
                            </div>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
      )}
    </div>
  );
};

export default TecnicoHistorial;
