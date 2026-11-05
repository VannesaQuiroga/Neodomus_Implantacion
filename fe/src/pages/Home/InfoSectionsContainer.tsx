// Pantalla InfoSectionsContainer de Neodomus. Reúne el estado y las acciones de su vista.
import fondo2 from '@assets/images/Fondo2.png';
import sobreImg from '@assets/images/sobre.jpeg';
import blog1 from '@assets/images/blog1.jpeg';
import blog2 from '@assets/images/blog2.jpeg';
import blog3 from '@assets/images/blog3.jpeg';
import { FaShieldHalved, FaLightbulb, FaAward, FaHouseChimneyWindow } from 'react-icons/fa6';
import '@styles/info_pages.css';

const InfoSectionsContainer = () => {
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
              <img src={sobreImg} alt="Sobre Neodomus" />
              <span className="about-image-badge"><FaHouseChimneyWindow /> Hogar inteligente</span>
            </div>
            <div className="about-text-block">
              <span className="about-kicker">Más que tecnología, una evolución</span>
              <h1>Sobre Nosotros</h1>
              <p className="about-lead">
                En <strong>Neodomus</strong> ofrecemos soluciones innovadoras y confiables que generan valor real a nuestros clientes.
              </p>
              <p>
                Nos enfocamos en la calidad, la tecnología y la confianza, brindando servicios eficientes que se adaptan a cada necesidad. Transformamos ideas en resultados y nos consolidamos como un aliado estratégico que impulsa tu evolución.
              </p>
              <div className="about-features">
                <div className="about-feature">
                  <span className="about-feature-icon"><FaShieldHalved /></span>
                  <div>
                    <strong>Nuestra misión</strong>
                    <span>Transformar ideas en resultados tangibles con tecnología confiable.</span>
                  </div>
                </div>
                <div className="about-feature">
                  <span className="about-feature-icon"><FaLightbulb /></span>
                  <div>
                    <strong>Nuestra visión</strong>
                    <span>Ser el aliado estratégico que impulse el crecimiento inteligente.</span>
                  </div>
                </div>
              </div>
              <div className="about-stats">
                <div className="about-stat">
                  <strong>100%</strong>
                  <span>Compromiso</span>
                </div>
                <div className="about-stat">
                  <strong>24/7</strong>
                  <span>Soporte</span>
                </div>
                <div className="about-stat">
                  <strong>+500</strong>
                  <span>Clientes</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECCIÓN POR QUÉ CONTRATAR — tarjetas con ícono */}
        <section className="info-section info-section--why">
          <div className="why-title-container">
            <h1>Porque contratar NEODOMUS</h1>
            <p className="why-subtitle">Tres razones para confiar tu hogar a la innovación.</p>
          </div>
          <div className="why-custom-grid">
            <article className="card-gold-base card-gold-style">
              <span className="why-card-icon"><FaShieldHalved /></span>
              <h3>Confianza y seriedad</h3>
              <p>Trabajamos con transparencia y compromiso en cada proyecto, garantizando seguridad en cada instalación.</p>
            </article>
            <article className="card-gold-base card-dark-style">
              <span className="why-card-icon"><FaLightbulb /></span>
              <h3>Innovación real</h3>
              <p>Soluciones modernas y personalizadas que se adaptan a tu rutina y evolucionan contigo.</p>
            </article>
            <article className="card-gold-base card-gold-style">
              <span className="why-card-icon"><FaAward /></span>
              <h3>Calidad garantizada</h3>
              <p>Resultados eficientes y duraderos, con materiales certificados y garantía Neodomus.</p>
            </article>
          </div>
        </section>

        {/* SECCIÓN BLOG — 3 tarjetas alineadas horizontalmente, mismo tamaño */}
        <section className="info-section info-section--blog">
          <div className="blog-title-container">
            <h1>Blog</h1>
            <p className="blog-subtitle">Ideas, tendencias y consejos para un hogar más inteligente.</p>
          </div>
          <div className="blog-custom-grid">
            <article className="blog-item-box">
              <div className="blog-img-wrapper"><img src={blog1} alt="Hogar inteligente hoy" /></div>
              <div className="blog-text-wrapper">
                <span className="blog-category">Domótica</span>
                <h3 className="blog-item-title">Automatización al alcance</h3>
                <p>La automatización del hogar ya no es cosa del futuro: en Neodomus hacemos posible que vivas en una casa inteligente hoy mismo.</p>
              </div>
            </article>
            <article className="blog-item-box">
              <div className="blog-img-wrapper"><img src={blog2} alt="Confort y ahorro" /></div>
              <div className="blog-text-wrapper">
                <span className="blog-category">Confort & Ahorro</span>
                <h3 className="blog-item-title">Confort, seguridad y ahorro</h3>
                <p>Confort, seguridad y ahorro de energía en un solo lugar. Así es la experiencia que solo Neodomus puede ofrecerte.</p>
              </div>
            </article>
            <article className="blog-item-box">
              <div className="blog-img-wrapper"><img src={blog3} alt="Pioneros en domótica" /></div>
              <div className="blog-text-wrapper">
                <span className="blog-category">Innovación · Colombia</span>
                <h3 className="blog-item-title">Pioneros en Colombia</h3>
                <p>Neodomus es pionera en llevar la domótica a los hogares de Colombia, referente de innovación y tecnología.</p>
              </div>
            </article>
          </div>
        </section>
      </div>
    </>
  );
};

export default InfoSectionsContainer;
