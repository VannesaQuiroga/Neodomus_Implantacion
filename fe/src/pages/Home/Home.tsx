// Compone la portada pública y sus accesos principales.
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import fondo from '@assets/images/FONDO.png';
import '@styles/home.css';

// accede a localStorage para conservar o recuperar datos locales.
const HomePage = () => {
  const [logoutMessage, setLogoutMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const msg = localStorage.getItem('logoutMessage');
    if (msg) {
      setLogoutMessage(msg);
      localStorage.removeItem('logoutMessage');
      const timer = setTimeout(() => setLogoutMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <>

      
      {logoutMessage && <div className="logout-toast">{logoutMessage}</div>}
      
      <main className="hero" style={{ backgroundImage: `url(${fondo})` }}>
        <div className="overlay">
          <h1 className="main-title">NEODOMUS</h1>
          <h3>"NEODOMUS más que tecnología, una evolución."</h3>
          <p>
            En NEODOMUS ofrecemos soluciones integrales en tecnología, innovación y
            gestión de servicios, diseñadas para mejorar la seguridad, eficiencia y
            confianza de nuestros clientes.
          </p>
          <button className="btn-continuar" onClick={() => navigate('/info')}>
            <div className="icon-circle">
              <span className="arrow-icon">&gt;</span>
            </div>
            <span className="btn-text">CONTINUAR</span>
          </button>
        </div>

        <div className="floor-lights-container">
          <div className="light-track track-1"></div>
          <div className="light-track track-2"></div>
          <div className="light-track track-3"></div>
          <div className="light-track track-4"></div>
        </div>
      </main>

    </>
  );
};

export default HomePage;