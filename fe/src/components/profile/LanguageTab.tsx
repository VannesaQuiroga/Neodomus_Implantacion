// Selector del idioma usado para presentar la interfaz.
import { useIdioma } from '@i18n/IdiomaContext';
import { IDIOMAS_DISPONIBLES, type Idioma } from '@i18n/translations';
import { FaGlobe, FaCheck } from 'react-icons/fa6';
import SectionHeader from './SectionHeader';
import { NotifyFn } from './PersonalTab';

const LanguageTab = ({ notify }: { notify: NotifyFn }) => {
  const { idioma, setIdioma, t } = useIdioma();

  const elegir = (codigo: Idioma) => {
    setIdioma(codigo);
    notify(t('perfil.lenguajeGuardado'), 'success');
  };

  return (
    <div className="pf-tab">
      <SectionHeader
        icon={<FaGlobe />}
        title={t('perfil.idioma')}
        subtitle={t('perfil.idiomaSubtitulo')}
      />

      <div className="pf-lang-list">
        {IDIOMAS_DISPONIBLES.map((opcion) => {
          const activo = idioma === opcion.codigo;
          return (
            <button
              type="button"
              key={opcion.codigo}
              className={`pf-lang-item ${activo ? 'active' : ''}`}
              onClick={() => elegir(opcion.codigo)}
            >
              <span className="pf-lang-banda">{opcion.bandera}</span>
              <span className="pf-lang-datos">
                <strong className="pf-lang-nombre">{opcion.nombreNativo}</strong>
                <span className="pf-lang-nativo">{opcion.nombre}</span>
              </span>
              {activo && (
                <span className="pf-lang-check"><FaCheck /></span>
              )}
            </button>
          );
        })}
      </div>
      <p className="pf-lang-nota">{t('perfil.idiomaSubtitulo')}</p>
    </div>
  );
};

export default LanguageTab;