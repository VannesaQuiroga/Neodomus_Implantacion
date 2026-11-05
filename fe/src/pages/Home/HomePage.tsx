// Sección de entrada de la portada pública.
import { useNavigate } from 'react-router-dom';
import fondo from '@assets/images/FONDO.png';
import '@styles/home.css';


const HomePage = () => {
  const navigate = useNavigate();
  return (
    <>
                  <div 
          className="login-background-layer" 
          style={{ backgroundImage: `url(${fondo})` }} 
        />
        <div className="overlay">
          <h1 className="main-title">NEODOMUS</h1>
          <h3>"NEODOMUS más que tecnología, una evolución."</h3>
          <p>
            En NEODOMUS ofrecemos soluciones integrales en tecnología, innovación y gestión de servicios.
          </p>
          <button className="btn-continuar" onClick={() => navigate('/info')}>CONTINUAR</button>
        </div>
    </>
  );
};
export default HomePage;