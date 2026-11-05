// Reúne los pasos del restablecimiento de contraseña dentro de un modal.
import { useState } from 'react';
import { FaEye, FaEyeSlash, FaLock, FaShieldHalved } from 'react-icons/fa6';
import { useAuth } from '@contexts/AuthContext';
import { useIdioma } from '@i18n/IdiomaContext';
import api from '@services/api';

// Comunica con el backend mediante POST '/auth/change-password'.
const PasswordResetModal = () => {
  const { user, setPasswordResetRequired, logout } = useAuth();
  const { idioma, t } = useIdioma();

  const [pwdActual, setPwdActual] = useState('');
  const [pwdNueva, setPwdNueva] = useState('');
  const [pwdConfirmar, setPwdConfirmar] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showActual, setShowActual] = useState(false);
  const [showNueva, setShowNueva] = useState(false);
  const [showConfirmar, setShowConfirmar] = useState(false);

  const hasMinLength = pwdNueva.length >= 8;
  const hasUpper = /[A-Z]/.test(pwdNueva);
  const hasLower = /[a-z]/.test(pwdNueva);
  const hasNumber = /\d/.test(pwdNueva);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(pwdNueva);
  const passwordsMatch = pwdNueva.length > 0 && pwdNueva === pwdConfirmar;

  const strength = [hasMinLength, hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;
  const strengthPercent = (strength / 5) * 100;
  const strengthColor = strength <= 2 ? '#e74c3c' : strength <= 3 ? '#f39c12' : strength <= 4 ? '#3498db' : '#2ecc71';
  const strengthLabel = strength <= 2
    ? (idioma === 'en' ? 'Weak' : 'Debil')
    : strength <= 3
    ? (idioma === 'en' ? 'Fair' : 'Regular')
    : strength <= 4
    ? (idioma === 'en' ? 'Good' : 'Buena')
    : (idioma === 'en' ? 'Strong' : 'Fuerte');

  const canSubmit = pwdActual && pwdNueva && pwdConfirmar && strength === 5 && passwordsMatch && !loading;

  // Comunica con el backend mediante POST '/auth/change-password'.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!pwdActual || !pwdNueva || !pwdConfirmar) {
      setError(t('perfil.validacionesContrasena'));
      return;
    }
    if (pwdNueva !== pwdConfirmar) {
      setError(t('perfil.contrasenasNoCoinciden'));
      return;
    }
    if (strength < 5) {
      setError(idioma === 'en'
        ? 'The password does not meet all requirements'
        : 'La contraseña no cumple todos los requisitos');
      return;
    }
    if (pwdActual === pwdNueva) {
      setError(idioma === 'en'
        ? 'The new password must be different from the current one'
        : 'La nueva contraseña debe ser diferente a la actual');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/change-password', {
        current_password: pwdActual,
        new_password: pwdNueva,
      });
      setSuccess(idioma === 'en'
        ? 'Password updated successfully!'
        : 'Contraseña actualizada correctamente');
      setPasswordResetRequired(false);
    } catch (err: any) {
      setError(err.response?.data?.detail || t('perfil.errorCambiarContrasena'));
    } finally {
      setLoading(false);
    }
  };

  const nombre = user?.nombre?.split(' ')[0] || t('tec.tecnico');

  return (
    <div className="pwd-reset-overlay">
      <div className="pwd-reset-modal">
        <div className="pwd-reset-icon">
          <FaShieldHalved />
        </div>

        <h2 className="pwd-reset-title">
          {idioma === 'en' ? 'Welcome,' : 'Bienvenido,'} {nombre}
        </h2>
        <p className="pwd-reset-subtitle">
          {idioma === 'en'
            ? 'For security, you must change your temporary password before continuing.'
            : 'Por seguridad, debes cambiar tu contraseña temporal antes de continuar.'}
        </p>

        <form onSubmit={handleSubmit} className="pwd-reset-form">
          <div className="pwd-reset-field">
            <label className="pwd-reset-label">{t('perfil.contrasenaActual')}</label>
            <div className="pwd-reset-input-wrap">
              <FaLock className="pwd-reset-field-icon" />
              <input
                type={showActual ? 'text' : 'password'}
                value={pwdActual}
                onChange={(e) => setPwdActual(e.target.value)}
                placeholder={idioma === 'en' ? 'Current password' : 'Contraseña actual'}
                autoComplete="current-password"
              />
              <button type="button" className="pwd-reset-toggle" onClick={() => setShowActual(!showActual)}>
                {showActual ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </div>

          <div className="pwd-reset-field">
            <label className="pwd-reset-label">{t('perfil.nuevaContrasena')}</label>
            <div className="pwd-reset-input-wrap">
              <FaLock className="pwd-reset-field-icon" />
              <input
                type={showNueva ? 'text' : 'password'}
                value={pwdNueva}
                onChange={(e) => setPwdNueva(e.target.value)}
                placeholder={idioma === 'en' ? 'New password' : 'Nueva contraseña'}
                autoComplete="new-password"
              />
              <button type="button" className="pwd-reset-toggle" onClick={() => setShowNueva(!showNueva)}>
                {showNueva ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </div>

          {pwdNueva && (
            <div className="pwd-reset-strength">
              <div className="pwd-reset-strength-bar">
                <div
                  className="pwd-reset-strength-fill"
                  style={{ width: `${strengthPercent}%`, backgroundColor: strengthColor }}
                />
              </div>
              <span className="pwd-reset-strength-label" style={{ color: strengthColor }}>
                {strengthLabel} ({strength}/5)
              </span>
              <div className="pwd-reset-checklist">
                <span className={hasMinLength ? 'ok' : ''}>{hasMinLength ? '✓' : '○'} {idioma === 'en' ? '8+ characters' : '8+ caracteres'}</span>
                <span className={hasUpper ? 'ok' : ''}>{hasUpper ? '✓' : '○'} {idioma === 'en' ? 'Uppercase' : 'Mayúscula'}</span>
                <span className={hasLower ? 'ok' : ''}>{hasLower ? '✓' : '○'} {idioma === 'en' ? 'Lowercase' : 'Minúscula'}</span>
                <span className={hasNumber ? 'ok' : ''}>{hasNumber ? '✓' : '○'} {idioma === 'en' ? 'Number' : 'Número'}</span>
                <span className={hasSpecial ? 'ok' : ''}>{hasSpecial ? '✓' : '○'} {idioma === 'en' ? 'Special char' : 'Carácter especial'}</span>
              </div>
            </div>
          )}

          <div className="pwd-reset-field">
            <label className="pwd-reset-label">{t('perfil.confirmarNuevaContrasena')}</label>
            <div className="pwd-reset-input-wrap">
              <FaLock className="pwd-reset-field-icon" />
              <input
                type={showConfirmar ? 'text' : 'password'}
                value={pwdConfirmar}
                onChange={(e) => setPwdConfirmar(e.target.value)}
                placeholder={idioma === 'en' ? 'Confirm new password' : 'Confirmar nueva contraseña'}
                autoComplete="new-password"
              />
              <button type="button" className="pwd-reset-toggle" onClick={() => setShowConfirmar(!showConfirmar)}>
                {showConfirmar ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
            {pwdConfirmar && !passwordsMatch && (
              <p className="pwd-reset-hint error">
                {t('perfil.contrasenasNoCoinciden')}
              </p>
            )}
            {pwdConfirmar && passwordsMatch && (
              <p className="pwd-reset-hint ok">
                {idioma === 'en' ? '✓ Passwords match' : '✓ Las contraseñas coinciden'}
              </p>
            )}
          </div>

          {error && <div className="pwd-reset-alert error">{error}</div>}
          {success && <div className="pwd-reset-alert success">{success}</div>}

          <button type="submit" className="pwd-reset-btn" disabled={!canSubmit}>
            {loading
              ? (idioma === 'en' ? 'Saving...' : 'Guardando...')
              : (idioma === 'en' ? 'Save new password' : 'Guardar nueva contraseña')}
          </button>
        </form>

        <button type="button" className="pwd-reset-logout" onClick={logout}>
          {idioma === 'en' ? 'Sign out' : 'Cerrar sesión'}
        </button>
      </div>
    </div>
  );
};

export default PasswordResetModal;
