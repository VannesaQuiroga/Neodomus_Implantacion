// Pantalla ForgotPassword de Neodomus. Reúne el estado y las acciones de su vista.

import "../../styles/forgot-password.css";
import { useState } from 'react';
import { useAuthModal } from '@contexts/AuthModalContext';
import api from '@services/api';
import { useIdioma } from '@i18n/IdiomaContext';


// Comunica con el backend mediante POST '/auth/forgot-password'.
const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { openAuth } = useAuthModal();
  const { t } = useIdioma();

  // Comunica con el backend mediante POST '/auth/forgot-password'.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    setMessage('');
    setError('');

    const emailRegex = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
    if (!emailRegex.test(trimmed)) {
      setError(t('auth.recover.errorCorreo'));
      return;
    }

    // Evita múltiples envíos simultáneos
    if (loading) return;
    setLoading(true);

    try {
      await api.post('/auth/forgot-password', { email: trimmed }, { timeout: 15000 });
      // Éxito: el backend responde inmediatamente (background) con mensaje genérico
      // por seguridad. Avanza al paso de verificación solo si la solicitud fue
      // aceptada (no si hubo error de red/SMTP/timeout).
      openAuth('verificar-codigo', { email: trimmed });
    } catch (err: any) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        setError(t('auth.recover.errorTimeout'));
      } else if (status === 429) {
        setError(t('auth.recover.errorRate'));
      } else if (detail) {
        setError(typeof detail === 'string' ? detail : t('auth.recover.errorEnvio'));
      } else if (!err.response) {
        setError(t('auth.recover.errorConexion'));
      } else {
        setError(t('auth.recover.errorGeneral'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    /* Tarjeta del formulario (se muestra dentro del modal sobre el catálogo) */
    <form onSubmit={handleSubmit} className="forgot-card">
      {/* Icono Superior */}
          <div className="forgot-avatar-circle">
            <svg className="forgot-mail-svg" viewBox="0 0 24 24" fill="none" stroke="#ffd700" strokeWidth="1.5">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            <div className="lock-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="2.5">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
          </div>

          <h2>{t('auth.recover.titulo')}</h2>
          <p className="forgot-instruction-text">
            {t('auth.recover.instruccionInicio')} <span className="brand-gold">{t('auth.recover.codigo')}</span> {t('auth.recover.instruccionFin')}
          </p>

          {message && <div className="success-message">{message}</div>}
          {error && <div className="error-message">{error}</div>}
          
          <div className="login-input-wrapper">
            <input 
              type="email" 
              placeholder={t('auth.recover.placeholderCorreo')}
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
              disabled={loading} 
            />
          </div>

          <button type="submit" className="btn-forgot-submit" disabled={loading}>
            <span>{loading ? t('auth.recover.enviando') : t('auth.recover.enviar')}</span>
          </button>

          <div className="forgot-security-notice">
            <p>{t('auth.recover.avisoInicio')} <span className="brand-gold">{t('auth.recover.codigoSeguro')}</span> {t('auth.recover.avisoFin')}</p>
          </div>

          <div className="forgot-back-to-login">
            <button type="button" onClick={() => openAuth('ingresar')} className="forgot-back-link">
              ← {t('auth.recover.volverLogin')}
            </button>
          </div>
        </form>
  );
};

export default ForgotPassword;
