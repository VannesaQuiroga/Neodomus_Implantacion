// Presenta las tarjetas de contenido informativo de domótica.
import fondo2 from '@assets/images/Fondo2.png';
import blog1 from '@assets/images/blog1.jpeg';
import blog2 from '@assets/images/blog2.jpeg';
import blog3 from '@assets/images/blog3.jpeg';
import { useIdioma } from '@i18n/IdiomaContext';
import '@styles/info_pages.css';

const Blog = () => {
  const { t } = useIdioma();

  return (
    <>
                  <div 
          className="login-background-layer" 
          style={{ backgroundImage: `url(${fondo2})` }} 
        />
        <div className="blog-title-container">
          <h1>{t('home.blog.titulo')}</h1>
        </div>
        <div className="blog-custom-grid">
          <div className="blog-item-box">
            <div className="blog-img-wrapper">
              <img src={blog1} alt={t('home.blog.altGenerico', { n: 1 })} />
            </div>
            <div className="blog-text-wrapper">
              <p>{t('home.blog.parrafo1')}</p>
            </div>
          </div>
          <div className="blog-item-box">
            <div className="blog-img-wrapper">
              <img src={blog2} alt={t('home.blog.altGenerico', { n: 2 })} />
            </div>
            <div className="blog-text-wrapper">
              <p>{t('home.blog.parrafo2')}</p>
            </div>
          </div>
          <div className="blog-item-box">
            <div className="blog-img-wrapper">
              <img src={blog3} alt={t('home.blog.altGenerico', { n: 3 })} />
            </div>
            <div className="blog-text-wrapper">
              <p>{t('home.blog.parrafo3Pregunta')}</p>
            </div>
          </div>
        </div>
    </>
  );
};

export default Blog;
