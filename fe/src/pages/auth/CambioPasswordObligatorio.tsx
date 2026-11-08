// Solicita cambiar la contraseña cuando la cuenta requiere actualizarla antes de continuar.
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaKey, FaCircleExclamation } from 'react-icons/fa6';
import { useAuth } from '@contexts/AuthContext';
import api from '@services/api';
import { useIdioma } from '@i18n/IdiomaContext';
import '@styles/login.css';

// Comunica con el backend mediante POST '/auth/change-password'.
const CambioPasswordObligatorio = () => {
  const navigate = useNavigate();
  const { rol, logout, setPasswordResetRequired } = useAuth();
  const { t } = useIdioma();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError('');
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Comunica con el backend mediante POST '/auth/change-password'.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError(t('auth.forceChange.errorNoCoinciden'));
      return;
    }
    if (!/^(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z])(?=\D*\d)(?=[^!@#$%^&*(),.?":{}|<>]*[!@#$%^&*(),.?":{}|<>]).{8,}$/.test(newPassword)) {
      setError(t('auth.forceChange.errorRequisitos'));
      return;
    }
    if (currentPassword === newPassword) {
      setError(t('perfil.password.diferenteActual'));
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPasswordResetRequired(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      if (rol === 'administrador' || rol === 'admin') {
        navigate('/dashboard/admin', { replace: true });
      } else {
        navigate('/dashboard/tecnico', { replace: true });
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || t('perfil.errorCambiarContrasena');
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-logo">
            <FaKey />
          </div>
          <h2>{t('auth.forceChange.titulo')}</h2>
          <p className="login-subtitle">
            {t('auth.forceChange.subtitulo')}
          </p>
          {error && <div className="error"><FaCircleExclamation /> {error}</div>}

          <div className="login-input-wrapper">
            <input
              type={showCurrent ? 'text' : 'password'}
              placeholder={t('auth.forceChange.placeholderTemporal')}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <button type="button" className="login-password-toggle" onClick={() => setShowCurrent(!showCurrent)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {showCurrent ? (
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                ) : (
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                )}
              </svg>
            </button>
          </div>

          <div className="login-input-wrapper">
            <input
              type={showNew ? 'text' : 'password'}
              placeholder={t('perfil.nuevaContrasena')}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              disabled={loading}
              autoComplete="new-password"
            />
            <button type="button" className="login-password-toggle" onClick={() => setShowNew(!showNew)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {showNew ? (
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                ) : (
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                )}
              </svg>
            </button>
          </div>

          <div className="login-input-wrapper">
            <input
              type={showConfirm ? 'text' : 'password'}
              placeholder={t('perfil.confirmarNuevaContrasena')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={loading}
              autoComplete="new-password"
            />
            <button type="button" className="login-password-toggle" onClick={() => setShowConfirm(!showConfirm)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {showConfirm ? (
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                ) : (
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                )}
              </svg>
            </button>
          </div>

          <button type="submit" disabled={loading}>
            {loading ? t('perfil.password.guardando') : t('perfil.cambiarContrasena')}
          </button>

          <button type="button" className="login-logout" onClick={logout}>
            {t('nav.cerrarSesion')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CambioPasswordObligatorio;