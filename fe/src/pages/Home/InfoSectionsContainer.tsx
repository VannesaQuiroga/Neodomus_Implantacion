// Pantalla InfoSectionsContainer de Neodomus. Reúne el estado y las acciones de su vista.
import fondo2 from '@assets/images/Fondo2.png';
import sobreImg from '@assets/images/sobre.jpeg';
import blog1 from '@assets/images/blog1.jpeg';
import blog2 from '@assets/images/blog2.jpeg';
import blog3 from '@assets/images/blog3.jpeg';
import { FaShieldHalved, FaLightbulb, FaAward, FaHouseChimneyWindow } from 'react-icons/fa6';
import { useIdioma } from '@i18n/IdiomaContext';
import '@styles/info_pages.css';

const InfoSectionsContainer = () => {
  const { t } = useIdioma();

  return (
    <>
      <div className="landing-sections-wrapper app-glass">
        <div
          className="login-background-layer"
          style={{ backgroundImage: `url(${fondo2})` }}
        />

        {/* SECCIÓN SOBRE NOSOTROS — composición visual mejorada */}
        <section className="info-section info-section--sobre">
          <div className="about-layout">
            <div className="about-image-container">
              <img src={sobreImg} alt={t('home.about.alt')} />
              <span className="about-image-badge"><FaHouseChimneyWindow /> {t('home.about.badge')}</span>
            </div>
            <div className="about-text-block">
              <span className="about-kicker">{t('home.about.kicker')}</span>
              <h1>{t('home.about.titulo')}</h1>
              <p className="about-lead">
                {t('home.about.leadAntes')} <strong>Neodomus</strong> {t('home.about.leadDespues')}
              </p>
              <p>
                {t('home.about.parrafo1')}
              </p>
              <div className="about-features">
                <div className="about-feature">
                  <span className="about-feature-icon"><FaShieldHalved /></span>
                  <div>
                    <strong>{t('home.about.misionTitulo')}</strong>
                    <span>{t('home.about.misionTexto')}</span>
                  </div>
                </div>
                <div className="about-feature">
                  <span className="about-feature-icon"><FaLightbulb /></span>
                  <div>
                    <strong>{t('home.about.visionTitulo')}</strong>
                    <span>{t('home.about.visionTexto')}</span>
                  </div>
                </div>
              </div>
              <div className="about-stats">
                <div className="about-stat">
                  <strong>100%</strong>
                  <span>{t('home.about.statCompromiso')}</span>
                </div>
                <div className="about-stat">
                  <strong>24/7</strong>
                  <span>{t('home.about.statSoporte')}</span>
                </div>
                <div className="about-stat">
                  <strong>+500</strong>
                  <span>{t('home.about.statClientes')}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECCIÓN POR QUÉ CONTRATAR — tarjetas con ícono */}
        <section className="info-section info-section--why">
          <div className="why-title-container">
            <h1>{t('home.info.whyTitulo')}</h1>
            <p className="why-subtitle">{t('home.info.whySubtitulo')}</p>
          </div>
          <div className="why-custom-grid">
            <article className="card-gold-base card-gold-style">
              <span className="why-card-icon"><FaShieldHalved /></span>
              <h3>{t('home.info.cardConfianzaTitulo')}</h3>
              <p>{t('home.info.cardConfianzaTexto')}</p>
            </article>
            <article className="card-gold-base card-dark-style">
              <span className="why-card-icon"><FaLightbulb /></span>
              <h3>{t('home.info.cardInnovacionTitulo')}</h3>
              <p>{t('home.info.cardInnovacionTexto')}</p>
            </article>
            <article className="card-gold-base card-gold-style">
              <span className="why-card-icon"><FaAward /></span>
              <h3>{t('home.info.cardCalidadTitulo')}</h3>
              <p>{t('home.info.cardCalidadTexto')}</p>
            </article>
          </div>
        </section>

        {/* SECCIÓN BLOG — 3 tarjetas alineadas horizontalmente, mismo tamaño */}
        <section className="info-section info-section--blog">
          <div className="blog-title-container">
            <h1>{t('home.blog.titulo')}</h1>
            <p className="blog-subtitle">{t('home.blog.subtitulo')}</p>
          </div>
          <div className="blog-custom-grid">
            <article className="blog-item-box">
              <div className="blog-img-wrapper"><img src={blog1} alt={t('home.blog.alt1')} /></div>
              <div className="blog-text-wrapper">
                <span className="blog-category">{t('home.blog.categoria1')}</span>
                <h3 className="blog-item-title">{t('home.blog.titulo1')}</h3>
                <p>{t('home.blog.parrafo1')}</p>
              </div>
            </article>
            <article className="blog-item-box">
              <div className="blog-img-wrapper"><img src={blog2} alt={t('home.blog.alt2')} /></div>
              <div className="blog-text-wrapper">
                <span className="blog-category">{t('home.blog.categoria2')}</span>
                <h3 className="blog-item-title">{t('home.blog.titulo2')}</h3>
                <p>{t('home.blog.parrafo2')}</p>
              </div>
            </article>
            <article className="blog-item-box">
              <div className="blog-img-wrapper"><img src={blog3} alt={t('home.blog.alt3')} /></div>
              <div className="blog-text-wrapper">
                <span className="blog-category">{t('home.blog.categoria3')}</span>
                <h3 className="blog-item-title">{t('home.blog.titulo3')}</h3>
                <p>{t('home.blog.parrafo3')}</p>
              </div>
            </article>
          </div>
        </section>
      </div>
    </>
  );
};

export default InfoSectionsContainer;
