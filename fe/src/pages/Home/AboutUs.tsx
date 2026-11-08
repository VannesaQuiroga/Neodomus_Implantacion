// Contenido institucional de presentación de Neodomus.
import fondo2 from '@assets/images/Fondo2.png';
import sobreImg from '@assets/images/sobre.jpeg';
import { useIdioma } from '@i18n/IdiomaContext';
import '@styles/info_pages.css';

const AboutUs = () => {
  const { t } = useIdioma();

  return (
    <div className="landing-sections-wrapper">
              <div 
          className="login-background-layer" 
          style={{ backgroundImage: `url(${fondo2})` }} 
        />
        <section className="info-section">
          <div className="about-layout">
            <div className="about-image-container">
              <img src={sobreImg} alt={t('home.about.altIlustracion')} />
            </div>
            <div className="about-text-block">
              <h1>{t('home.about.titulo')}</h1>
              <p>
                {t('home.about.historia1')}
              </p>
              <p>
                {t('home.about.historia2')}
              </p>
            </div>
          </div>
        </section>
    </div>
  );
};

export default AboutUs;
