// Sección de entrada de la portada pública.
import { useNavigate } from 'react-router-dom';
import { useIdioma } from '@i18n/IdiomaContext';
import fondo from '@assets/images/FONDO.png';
import '@styles/home.css';


const HomePage = () => {
  const { t } = useIdioma();
  const navigate = useNavigate();
  return (
    <>
                  <div 
          className="login-background-layer" 
          style={{ backgroundImage: `url(${fondo})` }} 
        />
        <div className="overlay">
          <h1 className="main-title">NEODOMUS</h1>
          <h3>{t('home.info.herofrase')}</h3>
          <p>
            {t('home.info.herodescripcionCorta')}
          </p>
          <button className="btn-continuar" onClick={() => navigate('/info')}>{t('home.info.herocontinuar')}</button>
        </div>
    </>
  );
};
export default HomePage;
