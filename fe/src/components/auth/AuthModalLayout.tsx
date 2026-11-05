// Componente reutilizable AuthModalLayout para componer la interfaz de Neodomus.
import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import ProductosPublicos from '@pages/public/ProductosPublicos';
import '@styles/auth-modal.css';

const AuthModalLayout = () => {
  const navigate = useNavigate();

  const close = () => navigate('/productos');

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <>
      <ProductosPublicos />
      <div className="auth-modal-overlay">
        <button
          type="button"
          className="auth-modal-close"
          onClick={(e) => {
            e.stopPropagation();
            close();
          }}
          aria-label="Cerrar"
        >
          <span aria-hidden="true">&times;</span>
        </button>
        <div className="auth-modal-content" onClick={(e) => e.stopPropagation()}>
          <Outlet />
        </div>
      </div>
    </>
  );
};

export default AuthModalLayout;