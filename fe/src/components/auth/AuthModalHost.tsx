import { useEffect } from 'react';
import { useAuthModal } from '@contexts/AuthModalContext';
import Login from '@pages/auth/Login';
import Register from '@pages/auth/Register';
import ForgotPassword from '@pages/auth/ForgotPassword';
import VerifyCode from '@pages/auth/VerifyCode';
import ResetPassword from '@pages/auth/ResetPassword';
import VerifyEmail from '@pages/auth/VerifyEmail';
import '@styles/auth-modal.css';

const AuthModalHost = () => {
  const { step, closeAuth } = useAuthModal();

  useEffect(() => {
    if (!step) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [step]);

  if (!step) return null;

  return (
    <div className="auth-modal-overlay">
      <button
        type="button"
        className="auth-modal-close"
        onClick={(e) => {
          e.stopPropagation();
          closeAuth();
        }}
        aria-label="Cerrar"
      >
        <span aria-hidden="true">&times;</span>
      </button>
      <div
        key={step}
        className="auth-modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'auth-modal-fade 0.2s ease' }}
      >
        {step === 'ingresar' && <Login />}
        {step === 'registro' && <Register />}
        {step === 'recuperar' && <ForgotPassword />}
        {step === 'verificar-codigo' && <VerifyCode />}
        {step === 'verificar-email' && <VerifyEmail />}
        {step === 'restablecer' && <ResetPassword />}
      </div>
    </div>
  );
};

export default AuthModalHost;
