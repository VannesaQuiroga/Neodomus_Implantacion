// Pantalla TecnicosPage de Neodomus. Reúne el estado y las acciones de su vista.
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';
import { useAuthModal } from '@contexts/AuthModalContext';
import { useIdioma } from '@i18n/IdiomaContext';
import { FaUserTie, FaCheck, FaArrowLeft, FaHeart } from 'react-icons/fa6';
import '@styles/perfil-cliente.css';
import api from '@services/api';
import { tituloNombre } from '@utils/formatoNombre';
import { suscribirCambiosTecnicos } from '@utils/tecnicosSync';
import { useTecnicosFavoritos } from '@utils/tecnicosFavoritos';

interface Tecnico {
  id: number;
  nombre: string;
  apellido: string;
  foto_url?: string | null;
  especialidad: string;
  anios_experiencia: number;
  calificacion: number;
  total_calificaciones: number;
  disponible: boolean;
  descripcion?: string;
}

interface TecnicoPublico {
  id_tecnico: number;
  first_name: string;
  last_name: string;
  certificacion_t?: string | null;
  is_active: boolean;
  calificacion?: number | null;
  total_calificaciones?: number | null;
}

// Comunica con el backend mediante GET '/tecnicos/publicos'.
const TecnicosPage = () => {
  const { isAuthenticated } = useAuth();
  const { openAuth } = useAuthModal();
  const { t } = useIdioma();
  const navigate = useNavigate();
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoverTecnico, setHoverTecnico] = useState<number | null>(null);
  const { esFavorito: esTecFavorito, toggleFavorito: toggleFavTecnico } = useTecnicosFavoritos();

  useEffect(() => {
    let activo = true;
    // Comunica con el backend mediante GET '/tecnicos/publicos'.
    const fetchTecnicos = async (silencioso = false) => {
      if (!silencioso) setLoading(true);
      try {
        const res = await api.get<TecnicoPublico[]>('/tecnicos/publicos');
        const data = res.data;
        const reales = (Array.isArray(data) ? data : []).map((t) => ({
          id: t.id_tecnico,
          nombre: tituloNombre(t.first_name),
          apellido: tituloNombre(t.last_name),
          foto_url: null,
          especialidad: t.certificacion_t || '',
          anios_experiencia: 0,
          calificacion: t.calificacion ?? 0,
          total_calificaciones: t.total_calificaciones ?? 0,
          disponible: t.is_active,
        }));
        if (activo) setTecnicos(reales);
      } catch (err: any) {
        console.warn('No se pudieron cargar los técnicos reales:', err.message);
        if (activo) setTecnicos([]);
      } finally {
        if (activo) setLoading(false);
      }
    };
    fetchTecnicos();

    // Tiempo real: cambios del administrador en esta u otra pestaña.
    const cancelarSuscripcion = suscribirCambiosTecnicos(() => fetchTecnicos(true));
    // Respaldo: refresco silencioso periódico.
    const intervalo = window.setInterval(() => fetchTecnicos(true), 30000);

    return () => {
      activo = false;
      cancelarSuscripcion();
      window.clearInterval(intervalo);
    };
  }, []);

  const renderStars = (rating: number) => {
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.5;
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      if (i <= full) stars.push(<span key={i} className="star-full">★</span>);
      else if (i === full + 1 && half) stars.push(<span key={i} className="star-half">★</span>);
      else stars.push(<span key={i} className="star-empty">☆</span>);
    }
    return stars;
  };

  const handleSeleccionar = (tecnico: Tecnico) => {
    if (!isAuthenticated) {
      openAuth('ingresar');
      return;
    }
    const nombre = `${tecnico.nombre} ${tecnico.apellido}`;
    navigate(`/cliente/citas?tecnico=${tecnico.id}&nombre=${encodeURIComponent(nombre)}`);
  };

  if (loading) return <div className="tecnicos-page-loading">{t('common.cargando')}</div>;

  return (
    <div className="tecnicos-page app-glass">
      <main className="tecnicos-main">
        <header className="tecnicos-header">
          <button type="button" className="tecnicos-back-btn" onClick={() => navigate('/productos')}>
            <FaArrowLeft /> {t('citas.volverProductos')}
          </button>
          <div className="tecnicos-header-content">
            <h1 className="tecnicos-title">{t('tecnicos.titulo')}</h1>
            <p className="tecnicos-subtitle">{t('tecnicos.subtitulo')}</p>
          </div>
        </header>

        <div className="tecnicos-grid">
          {tecnicos.map((tecnico) => (
            <article key={tecnico.id} className="tecnico-card">
              <div className="tecnico-card-header">
                <div className="tecnico-avatar-wrap">
                  <img
                    src={tecnico.foto_url || '/assets/images/perfil.png'}
                    alt={`${tecnico.nombre} ${tecnico.apellido}`}
                    className="tecnico-avatar"
                    onError={(e) => (e.currentTarget.src = '/assets/images/perfil.png')}
                  />
                  {tecnico.disponible && <span className="tecnico-badge disponible">{t('citas.tecnicoDisponible')}</span>}
                  {!tecnico.disponible && <span className="tecnico-badge ocupado">{t('citas.tecnicoOcupado')}</span>}
                </div>
                <button
                  type="button"
                  className={`tecnicos-fav-btn ${esTecFavorito(tecnico.id) ? 'activo' : ''}`}
                  onClick={() => toggleFavTecnico(tecnico.id)}
                  onMouseEnter={() => setHoverTecnico(tecnico.id)}
                  onMouseLeave={() => setHoverTecnico(null)}
                  aria-label={esTecFavorito(tecnico.id) ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                  title={esTecFavorito(tecnico.id) ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                >
                  <FaHeart
                    style={{
                      fill:
                        esTecFavorito(tecnico.id) || hoverTecnico === tecnico.id
                          ? '#ff4d6d'
                          : 'rgba(255,255,255,0.65)',
                      transition: 'fill 0.15s ease',
                    }}
                  />
                </button>
              </div>
              <div className="tecnico-card-body">
                <h3 className="tecnico-nombre">{tecnico.nombre} {tecnico.apellido}</h3>
                <p className="tecnico-especialidad">{tecnico.especialidad}</p>
                <div className="tecnico-meta">
                  {tecnico.anios_experiencia > 0 && (
                    <span className="tecnico-meta-item">
                      <FaUserTie /> {tecnico.anios_experiencia}+ {t('common.años')} exp.
                    </span>
                  )}
                  {tecnico.calificacion > 0 && (
                    <span className="tecnico-meta-item estrellas">
                      {renderStars(tecnico.calificacion)}
                      <span className="rating-value">
                        {tecnico.calificacion.toFixed(1)}
                        {tecnico.total_calificaciones > 0 &&
                          ` (${tecnico.total_calificaciones})`}
                      </span>
                    </span>
                  )}
                </div>
                {tecnico.descripcion && (
                  <p className="tecnico-descripcion">{tecnico.descripcion}</p>
                )}
              </div>
              <div className="tecnico-card-footer">
                <button
                  type="button"
                  className="tecnico-btn tecnico-btn-primary"
                  onClick={() => handleSeleccionar(tecnico)}
                  disabled={!tecnico.disponible || !isAuthenticated}
                >
                  <FaCheck /> {tecnico.disponible ? (isAuthenticated ? t('tecnicos.seleccionarTecnico') : t('nav.iniciarSesion')) : t('citas.tecnicoNoDisponible')}
                </button>
              </div>
            </article>
          ))}
        </div>

        {tecnicos.length === 0 && (
          <div className="tecnicos-empty">
            <FaUserTie className="tecnicos-empty-icon" />
            <p>{t('tecnicos.vacios')}</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default TecnicosPage;