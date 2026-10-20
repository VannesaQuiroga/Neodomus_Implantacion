// Solicita cambiar la contraseña cuando la cuenta requiere actualizarla antes de continuar.
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaKey, FaCircleExclamation, FaCircleCheck } from 'react-icons/fa6';
import { useAuth } from '@contexts/AuthContext';
import api from '@services/api';
import '@styles/login.css';

// Comunica con el backend mediante POST '/auth/change-password'.
const CambioPasswordObligatorio = () => {
  const navigate = useNavigate();
  const { rol, logout, setPasswordResetRequired } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (message || error) {
      const timer = setTimeout(() => {
        setMessage('');
        setError('');
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [message, error]);

  // Comunica con el backend mediante POST '/auth/change-password'.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Las nuevas contraseñas no coinciden');
      return;
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/.test(newPassword)) {
      setError('La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula, un número y un carácter especial');
      return;
    }
    if (currentPassword === newPassword) {
      setError('La nueva contraseña debe ser diferente a la actual');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPasswordResetRequired(false);
      setMessage('Contraseña actualizada correctamente. Ya puedes usar tu cuenta.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      window.setTimeout(() => {
        if (rol === 'administrador' || rol === 'admin') {
          navigate('/dashboard/admin', { replace: true });
        } else {
          navigate('/dashboard/tecnico', { replace: true });
        }
      }, 1200);
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || 'Error al cambiar la contraseña';
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
          <h2>Debes cambiar tu contraseña</h2>
          <p className="login-subtitle">
            El administrador estableció una contraseña temporal para tu cuenta.
            Por seguridad, debes crear una nueva contraseña personal antes de continuar.
          </p>
          {message && <div className="success"><FaCircleCheck /> {message}</div>}
          {error && <div className="error"><FaCircleExclamation /> {error}</div>}

          <div className="login-input-wrapper">
            <input
              type={showCurrent ? 'text' : 'password'}
              placeholder="Contraseña temporal (la que te dio el administrador)"
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
              placeholder="Nueva contraseña"
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
              placeholder="Confirmar nueva contraseña"
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
            {loading ? 'Guardando...' : 'Cambiar contraseña'}
          </button>

          <button type="button" className="login-logout" onClick={logout}>
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
};

export default CambioPasswordObligatorio;