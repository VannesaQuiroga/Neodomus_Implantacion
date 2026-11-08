// Presenta la información de técnicos dentro del perfil del cliente.
import { useEffect, useState } from 'react';
import {
  FaHeart,
  FaPhone,
  FaScrewdriverWrench,
  FaWhatsapp,
} from 'react-icons/fa6';
import api from '@services/api';
import { useIdioma } from '@i18n/IdiomaContext';
import SectionHeader from './SectionHeader';
import { useTecnicosFavoritos } from '@utils/tecnicosFavoritos';

interface TecnicoPublico {
  id_tecnico: number;
  first_name: string;
  last_name: string;
  certificacion_t?: string | null;
  is_active: boolean;
  disponible: boolean;
  telefono?: number | null;
  foto_url?: string | null;
  calificacion?: number | null;
}

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

// Comunica con el backend mediante GET '/tecnicos/publicos'.
const TechniciansTab = () => {
  const { t } = useIdioma();
  const [tecnicos, setTecnicos] = useState<TecnicoPublico[]>([]);
  const [loading, setLoading] = useState(true);
  const { esFavorito, toggleFavorito } = useTecnicosFavoritos();

  useEffect(() => {
    let activo = true;
    // Comunica con el backend mediante GET '/tecnicos/publicos'.
    const cargar = async () => {
      try {
        const res = await api.get<TecnicoPublico[]>('/tecnicos/publicos');
        if (activo) setTecnicos(res.data || []);
      } catch (err) {
        console.error('Error cargando técnicos:', err);
        if (activo) setTecnicos([]);
      } finally {
        if (activo) setLoading(false);
      }
    };
    void cargar();
    return () => { activo = false; };
  }, []);

  // Solo los que el cliente marcó como favoritos.
  const favoritosInfo = tecnicos.filter((tecnico) => esFavorito(tecnico.id_tecnico));

  return (
    <div className="pf-tab">
      <SectionHeader
        icon={<FaScrewdriverWrench />}
        title={t('perfil.misTecnicos')}
        subtitle={t('perfil.tecnicosAsignados.subtitulo')}
      />

      {loading ? (
        <div className="pf-empty">
          <p>{t('common.cargando')}</p>
        </div>
      ) : favoritosInfo.length === 0 ? (
        <div className="pf-empty">
          <span className="pf-empty-icon"><FaHeart /></span>
          <p>{t('perfil.tecnicosAsignados.vacio')}</p>
          <p style={{ fontSize: '0.8rem', color: '#9a8f78', marginTop: 4 }}>
            {t('perfil.tecnicosAsignados.vacioHint')}
          </p>
        </div>
      ) : (
        <div className="pf-tech-grid">
          {favoritosInfo.map((tecnico) => {
            const nombre = `${tecnico.first_name} ${tecnico.last_name}`.trim();
            return (
              <div className={`pf-tech-card${esFavorito(tecnico.id_tecnico) ? ' pf-tec-favorito' : ''}`} key={tecnico.id_tecnico}>
                <div className="pf-tech-head">
                  <span className="pf-tech-avatar">
                    {tecnico.foto_url ? (
                      <img
                        src={tecnico.foto_url}
                        alt={nombre}
                        style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                        onError={(e) => (e.currentTarget.src = '/assets/images/perfil.png')}
                      />
                    ) : (
                      initials(nombre)
                    )}
                  </span>
                  <button
                    type="button"
                    className="pf-fav-toggle on"
                    onClick={() => toggleFavorito(tecnico.id_tecnico)}
                    aria-label={t('perfil.quitarDeFavoritos')}
                    title={t('perfil.quitarDeFavoritos')}
                  >
                    ✕
                  </button>
                </div>

                <div className="pf-tech-info">
                  <h3 className="pf-tech-nombre">{nombre}</h3>
                  {tecnico.certificacion_t && (
                    <span className="pf-tech-especialidad">{tecnico.certificacion_t}</span>
                  )}
                  {tecnico.calificacion != null && tecnico.calificacion > 0 && (
                    <span className="pf-tech-calif">★ {Number(tecnico.calificacion).toFixed(1)}</span>
                  )}
                </div>

                <div className="pf-tech-actions">
                  {tecnico.telefono ? (
                    <a
                      className="pf-btn pf-btn-ghost"
                      href={`tel:+57${String(tecnico.telefono).replace(/\D/g, '')}`}
                    >
                      <FaPhone /> {t('perfil.tecnicosAsignados.llamar')}
                    </a>
                  ) : null}
                  {tecnico.telefono ? (
                    <a
                      className="pf-btn pf-btn-ghost"
                      href={`https://wa.me/57${String(tecnico.telefono).replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <FaWhatsapp /> {t('perfil.tecnicosAsignados.mensaje')}
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TechniciansTab;
