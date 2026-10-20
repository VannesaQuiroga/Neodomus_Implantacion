// Pantalla ResetPassword de Neodomus. Reúne el estado y las acciones de su vista.
import { useState, useEffect } from 'react';
import { useAuthModal } from '@contexts/AuthModalContext';
import api from '@services/api';

import '@styles/resetpassword.css';

// Comunica con el backend mediante POST '/auth/reset-password'.
const ResetPassword = () => {
  const { token, openAuth } = useAuthModal();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [passwordErrors, setPasswordErrors] = useState({
    length: false,
    lowercase: false,
    uppercase: false,
    number: false,
    special: false,
  });

  const allPasswordValid =
    passwordErrors.length &&
    passwordErrors.lowercase &&
    passwordErrors.uppercase &&
    passwordErrors.number &&
    passwordErrors.special;

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Token no válido');
    }

    if (message || error) {
      const timer = setTimeout(() => {
        setMessage('');
        setError('');
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [token, message, error]);

  // Comunica con el backend mediante POST '/auth/reset-password'.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (loading) return;

    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    if (!allPasswordValid) {
      setError(
        'La contraseña no cumple los requisitos.'
      );
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      await api.post('/auth/reset-password', {
        token,
        new_password: newPassword,
      }, { timeout: 15000 });

      setMessage(
        'Contraseña actualizada correctamente. Volviendo al inicio de sesión...'
      );

      window.setTimeout(() => openAuth('ingresar'), 900);
    } catch (err: any) {
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        setError('La solicitud tardó demasiado. Verifica tu conexión e inténtalo nuevamente.');
      } else if (err.response?.status === 403) {
        setError(
          'Este enlace fue solicitado desde otra IP. Solicita un nuevo restablecimiento.'
        );
      } else if (err.response?.status === 429) {
        setError('Demasiadas solicitudes. Espera un minuto antes de reintentar.');
      } else {
        setError(
          err.response?.data?.detail ||
            'Error al restablecer la contraseña. Verifica el código e inténtalo de nuevo.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      /* Tarjeta del formulario (se muestra dentro del modal sobre el catálogo) */
      <div className="reset-card">

        <h2>Enlace inválido</h2>

        <div className="error-message">
          El enlace ha expirado o no es válido.
        </div>

        <button
          className="btn-reset-submit"
          onClick={() => openAuth('recuperar')}
        >
          Solicitar nuevamente
        </button>

      </div>
    );
  }

  return (
    /* Tarjeta del formulario (se muestra dentro del modal sobre el catálogo) */
    <form
      onSubmit={handleSubmit}
      className="reset-card"
    >

      <div className="reset-avatar-circle">

        🔒

      </div>

        <h2>Nueva contraseña</h2>

        <p className="reset-description">
          Crea una nueva contraseña segura para
          acceder nuevamente a tu cuenta.
        </p>

        {message && (
          <div className="success-message">
            {message}
          </div>
        )}

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="reset-input-wrapper">
          <input
            type={
              showPassword ? 'text' : 'password'
            }
            placeholder="Nueva contraseña"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              setPasswordErrors({
                length: e.target.value.length >= 8,
                lowercase: /[a-z]/.test(e.target.value),
                uppercase: /[A-Z]/.test(e.target.value),
                number: /[0-9]/.test(e.target.value),
                special: /[!@#$%^&*(),.?":{}|<>]/.test(e.target.value),
              });
            }}
            required
            disabled={loading}
            autoComplete="new-password"
          />

          <button
            type="button"
            className="password-toggle"
            onClick={() =>
              setShowPassword(!showPassword)
            }
          >
            
          </button>
        </div>

        <div className="password-requirements">
          <p className="requirement-title">
            La contraseña debe contener:
          </p>
          <ul>
            <li className={passwordErrors.length ? 'valid' : 'invalid'}>
              {passwordErrors.length ? '✓' : '✗'} Mínimo 8 caracteres
            </li>
            <li className={passwordErrors.lowercase ? 'valid' : 'invalid'}>
              {passwordErrors.lowercase ? '✓' : '✗'} Una letra minúscula
            </li>
            <li className={passwordErrors.uppercase ? 'valid' : 'invalid'}>
              {passwordErrors.uppercase ? '✓' : '✗'} Una letra mayúscula
            </li>
            <li className={passwordErrors.number ? 'valid' : 'invalid'}>
              {passwordErrors.number ? '✓' : '✗'} Un número
            </li>
            <li className={passwordErrors.special ? 'valid' : 'invalid'}>
              {passwordErrors.special ? '✓' : '✗'} Un carácter especial
            </li>
          </ul>
        </div>

        <div className="reset-input-wrapper">
          <input
            type={
              showConfirmPassword
                ? 'text'
                : 'password'
            }
            placeholder="Confirmar contraseña"
            value={confirmPassword}
            onChange={(e) =>
              setConfirmPassword(
                e.target.value
              )
            }
            required
            disabled={loading}
            autoComplete="new-password"
          />

          <button
            type="button"
            className="password-toggle"
            onClick={() =>
              setShowConfirmPassword(
                !showConfirmPassword
              )
            }
          >
            
          </button>
        </div>

        <button
          type="submit"
          className="btn-reset-submit"
          disabled={loading || !allPasswordValid}
        >
          {loading
            ? 'Actualizando...'
            : 'Restablecer contraseña'}
        </button>

      </form>
  );
};

export default ResetPassword;

