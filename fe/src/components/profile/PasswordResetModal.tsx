// Reúne los pasos del restablecimiento de contraseña dentro de un modal.
import { useState } from 'react';
import { FaEye, FaEyeSlash, FaLock, FaShieldHalved } from 'react-icons/fa6';
import { useAuth } from '@contexts/AuthContext';
import { useIdioma } from '@i18n/IdiomaContext';
import api from '@services/api';

// Comunica con el backend mediante POST '/auth/change-password'.
const PasswordResetModal = () => {
  const { user, setPasswordResetRequired, logout } = useAuth();
  const { t } = useIdioma();

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
    ? t('perfil.password.debil')
    : strength <= 3
    ? t('perfil.password.regular')
    : strength <= 4
    ? t('perfil.password.buena')
    : t('perfil.password.fuerte');

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
      setError(t('perfil.password.requisitos'));
      return;
    }
    if (pwdActual === pwdNueva) {
      setError(t('perfil.password.diferenteActual'));
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/change-password', {
        current_password: pwdActual,
        new_password: pwdNueva,
      });
      setSuccess(t('perfil.contrasenaActualizada'));
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
          {t('perfil.password.bienvenido', { nombre })}
        </h2>
        <p className="pwd-reset-subtitle">
          {t('perfil.password.subtitulo')}
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
                placeholder={t('perfil.contrasenaActual')}
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
                placeholder={t('perfil.nuevaContrasena')}
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
                <span className={hasMinLength ? 'ok' : ''}>{hasMinLength ? '✓' : '○'} {t('perfil.password.req8')}</span>
                <span className={hasUpper ? 'ok' : ''}>{hasUpper ? '✓' : '○'} {t('perfil.password.reqMayuscula')}</span>
                <span className={hasLower ? 'ok' : ''}>{hasLower ? '✓' : '○'} {t('perfil.password.reqMinuscula')}</span>
                <span className={hasNumber ? 'ok' : ''}>{hasNumber ? '✓' : '○'} {t('perfil.password.reqNumero')}</span>
                <span className={hasSpecial ? 'ok' : ''}>{hasSpecial ? '✓' : '○'} {t('perfil.password.reqEspecial')}</span>
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
                placeholder={t('perfil.confirmarNuevaContrasena')}
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
                {t('perfil.password.coinciden')}
              </p>
            )}
          </div>

          {error && <div className="pwd-reset-alert error">{error}</div>}
          {success && <div className="pwd-reset-alert success">{success}</div>}

          <button type="submit" className="pwd-reset-btn" disabled={!canSubmit}>
            {loading
              ? t('perfil.password.guardando')
              : t('perfil.password.guardar')}
          </button>
        </form>

        <button type="button" className="pwd-reset-logout" onClick={logout}>
          {t('nav.cerrarSesion')}
        </button>
      </div>
    </div>
  );
};

export default PasswordResetModal;
