// Presenta las valoraciones recibidas por el técnico.
import { useEffect, useMemo, useState } from 'react';
import {
  FaStar,
  FaUser,
  FaCalendarDays,
  FaMagnifyingGlass,
} from 'react-icons/fa6';
import { useAuth } from '@contexts/AuthContext';
import { useIdioma } from '@i18n/IdiomaContext';
import api from '@services/api';
import '@styles/admin-panel.css';
import '@styles/dashboard-admin.css';

interface CalificacionRecibida {
  id_calificacion: number;
  calificacion: number;
  comentario?: string | null;
  cliente?: string;
  created_at?: string | null;
}

interface ResumenCalificaciones {
  promedio?: number | null;
  total?: number;
  calificaciones?: CalificacionRecibida[];
}

// Comunica con el backend mediante GET '/calificaciones/mis'.
const Calificaciones = () => {
  const { user } = useAuth();
  const { idioma, t } = useIdioma();
  const [resumen, setResumen] = useState<ResumenCalificaciones>({});
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroFecha, setFiltroFecha] = useState('');

  const hayFiltros = Boolean(busqueda.trim()) || Boolean(filtroFecha);

  const limpiarFiltros = () => {
    setBusqueda('');
    setFiltroFecha('');
  };

  useEffect(() => {
    // Comunica con el backend mediante GET '/calificaciones/mis'.
    const fetchCalificaciones = async () => {
      try {
        const res = await api.get('/calificaciones/mis');
        setResumen(res.data || {});
      } catch (err) {
        console.error('Error al cargar calificaciones:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchCalificaciones();
  }, []);

  const todas = useMemo(() => resumen.calificaciones || [], [resumen]);

  const filtradas = useMemo(() => {
    let resultado = [...todas];

    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase();
      resultado = resultado.filter((c) =>
        `${c.cliente || ''} ${c.comentario || ''}`.toLowerCase().includes(q)
      );
    }

    if (filtroFecha) {
      resultado = resultado.filter(
        (c) => (c.created_at || '').slice(0, 10) === filtroFecha
      );
    }

    return resultado;
  }, [todas, busqueda, filtroFecha]);

  const renderCalificacionItem = (c: CalificacionRecibida) => (
    <div key={c.id_calificacion} className="novedad-item">
      <div className="novedad-left">
        <div className="icon-circle"><FaUser /></div>
        <div>
          <h3>{c.cliente || 'Cliente'}</h3>
          <p style={{ color: '#ffc94d' }}>
            {'★'.repeat(Math.min(5, Math.max(1, c.calificacion)))}
          </p>
          {c.comentario ? (
            <p className="muted">{c.comentario}</p>
          ) : null}
          {c.created_at && (
            <p className="muted">
              {new Date(c.created_at).toLocaleDateString(idioma === 'en' ? 'en-US' : 'es-ES')}
            </p>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        <span className="ap-badge ok">
          {t('tec.calificacion')} {c.calificacion}
        </span>
      </div>
    </div>
  );

  const renderEmpty = (icon: React.ReactNode, titulo: string, hint: string) => (
    <div className="ap-states">
      <div className="ap-states-icon">{icon}</div>
      <h3>{titulo}</h3>
      <p>{hint}</p>
    </div>
  );

  return (
    <div className="admin-panel">
      <header className="ap-header">
        <div>
          <h1 className="ap-title">
            {t('tec.misCalificaciones', { nombre: user?.nombre?.split(' ')[0] || t('tec.tecnico') })}
          </h1>
          <p className="ap-subtitle">{t('tec.resumenJornada')}</p>
        </div>

        <div className="ap-header-right">
          <div className="ap-filtros-bar">
            <FaCalendarDays className="ap-filtros-icono" />
            <input
              type="date"
              className="ap-filtro-fecha"
              value={filtroFecha}
              onChange={(e) => setFiltroFecha(e.target.value)}
              aria-label="Fecha"
              title="Fecha"
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
        </div>
      </header>

      <form
        className="ap-search ap-search-larga"
        style={{ marginBottom: 20 }}
        onSubmit={(e) => e.preventDefault()}
      >
        <FaMagnifyingGlass />
        <input
          type="text"
          placeholder={t('tec.buscarCliente')}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </form>

      <div className="ap-grid">
        <div className="ap-card" style={{ borderLeft: '4px solid #d4a54b' }}>
          <div className="ap-card-head">
            <h2><FaStar /> {t('tec.calificacionesRecibidas')}</h2>
          </div>

          {loading ? (
            <div className="ap-states">
              <span className="ap-loader" />
              <h3>{t('tec.cargandoCalificaciones')}</h3>
            </div>
          ) : (
            <div className="ap-carrusel">
              {resumen.promedio != null && (resumen.total ?? 0) > 0 ? (
                <>
                  <div className="ap-card" style={{ marginBottom: '20px' }}>
                    <div className="ap-card-head">
                      <h3>{t('tec.promedioCalificacion')}</h3>
                      <span className="ap-badge ok">
                        ★ {Number(resumen.promedio).toFixed(1)}
                      </span>
                    </div>
                    <p>{t('tec.de', { total: resumen.total ?? 0 })}</p>
                  </div>

                  <div className="ap-card" style={{ marginBottom: '20px' }}>
                    <div className="ap-card-head">
                      <h3>{t('tec.masCalificadas')}</h3>
                    </div>
                    {filtradas.length > 0 ? (
                      filtradas.slice(0, 5).map((c) => renderCalificacionItem(c))
                    ) : (
                      <p style={{ margin: '0', color: '#bdbdbd' }}>{t('tec.sinCalificaciones')}</p>
                    )}
                  </div>
                </>
              ) : (
                renderEmpty(
                  <FaStar />,
                  t('tec.sinCalificaciones'),
                  t('tec.sinCalificacionesHint')
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Calificaciones;
