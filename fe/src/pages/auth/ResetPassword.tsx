// Pantalla ResetPassword de Neodomus. Reúne el estado y las acciones de su vista.
import { useState, useEffect } from 'react';
import { useAuthModal } from '@contexts/AuthModalContext';
import api from '@services/api';
import { useIdioma } from '@i18n/IdiomaContext';

import '@styles/resetpassword.css';

// Comunica con el backend mediante POST '/auth/reset-password'.
const ResetPassword = () => {
  const { token, openAuth } = useAuthModal();
  const { t } = useIdioma();

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

  const [error, setError] = useState('');

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setError(t('auth.reset.errorToken'));
    }

    if (error) {
      const timer = setTimeout(() => {
        setError('');
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [token, error]);

  // Comunica con el backend mediante POST '/auth/reset-password'.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (loading) return;

    if (newPassword !== confirmPassword) {
      setError(t('perfil.contrasenasNoCoinciden'));
      return;
    }

    if (!allPasswordValid) {
      setError(
        t('auth.reset.errorRequisitos')
      );
      return;
    }

    setLoading(true);
    setError('');

    try {
      await api.post('/auth/reset-password', {
        token,
        new_password: newPassword,
      }, { timeout: 15000 });

      openAuth('ingresar');
    } catch (err: any) {
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        setError(t('auth.reset.errorTimeout'));
      } else if (err.response?.status === 403) {
        setError(
          t('auth.reset.errorIP')
        );
      } else if (err.response?.status === 429) {
        setError(t('auth.reset.errorRate'));
      } else {
        setError(
          err.response?.data?.detail ||
            t('auth.reset.errorGeneral')
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

        <h2>{t('auth.reset.enlaceInvalido')}</h2>

        <div className="error-message">
          {t('auth.reset.enlaceExpirado')}
        </div>

        <button
          className="btn-reset-submit"
          onClick={() => openAuth('recuperar')}
        >
          {t('auth.reset.solicitarNuevamente')}
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

        <h2>{t('perfil.nuevaContrasena')}</h2>

        <p className="reset-description">
          {t('auth.reset.descripcion')}
        </p>

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
            placeholder={t('perfil.nuevaContrasena')}
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
            {t('auth.reset.reqTitulo')}
          </p>
          <ul>
            <li className={passwordErrors.length ? 'valid' : 'invalid'}>
              {passwordErrors.length ? '✓' : '✗'} {t('perfil.reqLongitud')}
            </li>
            <li className={passwordErrors.lowercase ? 'valid' : 'invalid'}>
              {passwordErrors.lowercase ? '✓' : '✗'} {t('auth.reset.reqMinuscula')}
            </li>
            <li className={passwordErrors.uppercase ? 'valid' : 'invalid'}>
              {passwordErrors.uppercase ? '✓' : '✗'} {t('auth.reset.reqMayuscula')}
            </li>
            <li className={passwordErrors.number ? 'valid' : 'invalid'}>
              {passwordErrors.number ? '✓' : '✗'} {t('auth.reset.reqNumero')}
            </li>
            <li className={passwordErrors.special ? 'valid' : 'invalid'}>
              {passwordErrors.special ? '✓' : '✗'} {t('auth.reset.reqEspecial')}
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
            placeholder={t('auth.reset.placeholderConfirmar')}
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
            ? t('auth.reset.actualizando')
            : t('auth.reset.restablecer')}
        </button>

      </form>
  );
};

export default ResetPassword;

