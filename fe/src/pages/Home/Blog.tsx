// Presenta las tarjetas de contenido informativo de domótica.
import fondo2 from '@assets/images/Fondo2.png';
import blog1 from '@assets/images/blog1.jpeg';
import blog2 from '@assets/images/blog2.jpeg';
import blog3 from '@assets/images/blog3.jpeg';
import '@styles/info_pages.css';

const Blog = () => {
  return (
    <>
                  <div 
          className="login-background-layer" 
          style={{ backgroundImage: `url(${fondo2})` }} 
        />
        <div className="blog-title-container">
          <h1>Blog</h1>
        </div>
        <div className="blog-custom-grid">
          <div className="blog-item-box">
            <div className="blog-img-wrapper">
              <img src={blog1} alt="Blog 1" />
            </div>
            <div className="blog-text-wrapper">
              <p>La automatización del hogar ya no es cosa del futuro: en Neodomus hacemos posible que vivas en una casa inteligente hoy mismo.</p>
            </div>
          </div>
          <div className="blog-item-box">
            <div className="blog-img-wrapper">
              <img src={blog2} alt="Blog 2" />
            </div>
            <div className="blog-text-wrapper">
              <p>Confort, seguridad y ahorro de energía en un solo lugar. Así es la experiencia que solo Neodomus puede ofrecerte.</p>
            </div>
          </div>
          <div className="blog-item-box">
            <div className="blog-img-wrapper">
              <img src={blog3} alt="Blog 3" />
            </div>
            <div className="blog-text-wrapper">
              <p>¿Sabías que Neodomus es pionera en llevar la domótica a los hogares de Colombia, convirtiéndose en referente de innovación y tecnología?</p>
            </div>
          </div>
        </div>
    </>
  );
};

export default Blog;