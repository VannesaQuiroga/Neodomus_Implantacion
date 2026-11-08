// src/pages/auth/VerifyEmail.tsx
import { useState, useEffect, useRef } from 'react';
import { useAuthModal } from '@contexts/AuthModalContext';
import api from '@services/api';
import { useIdioma } from '@i18n/IdiomaContext';
import '@styles/verify-email.css';

// Comunica con el backend mediante POST '/auth/verify-email', POST '/auth/resend-verification'.
const VerifyEmail = () => {
  const { email, openAuth } = useAuthModal();
  const { t } = useIdioma();
  
  // Estado para las 6 cajitas individuales del código
  const [codeArray, setCodeArray] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [canResend, setCanResend] = useState(true);
  const [countdown, setCountdown] = useState(0);

  // Referencias para controlar el salto automático entre inputs
  const inputRefs = useRef<HTMLInputElement[]>([]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0 && !canResend) {
      setCanResend(true);
    }
  }, [countdown, canResend]);

  // Maneja la escritura y el salto hacia adelante
  const handleInputChange = (value: string, index: number) => {
    const cleanValue = value.replace(/\D/g, ''); // Solo números
    if (!cleanValue) {
      const newArray = [...codeArray];
      newArray[index] = '';
      setCodeArray(newArray);
      return;
    }

    const lastChar = cleanValue.substring(cleanValue.length - 1);
    const newArray = [...codeArray];
    newArray[index] = lastChar;
    setCodeArray(newArray);

    // Si no es el último campo, saltar al siguiente de forma automática
    if (index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  // Maneja el borrado y el salto hacia atrás con Backspace
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace') {
      if (!codeArray[index] && index > 0) {
        const newArray = [...codeArray];
        newArray[index - 1] = '';
        setCodeArray(newArray);
        inputRefs.current[index - 1]?.focus();
      } else {
        const newArray = [...codeArray];
        newArray[index] = '';
        setCodeArray(newArray);
      }
    }
  };

  // Permite pegar un código completo de 6 dígitos
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').substring(0, 6);
    if (pastedData.length === 6) {
      const newArray = pastedData.split('');
      setCodeArray(newArray);
      inputRefs.current[5]?.focus();
    }
  };

  // Comunica con el backend mediante POST '/auth/verify-email'.
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalCode = codeArray.join('');
    
    if (finalCode.length !== 6) {
      setError(t('auth.verifyEmail.errorCodigo'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/verify-email', null, { params: { code: finalCode } });
      openAuth('ingresar');
    } catch (err: any) {
      setError(err.response?.data?.detail || t('auth.verifyEmail.errorGeneral'));
    } finally {
      setLoading(false);
    }
  };

  // Comunica con el backend mediante POST '/auth/resend-verification'.
  const handleResend = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!canResend) return;
    setCanResend(false);
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/resend-verification', { email });
      setCountdown(30);
    } catch (err: any) {
      setError(err.response?.data?.detail || t('auth.verifyEmail.errorReenvio'));
      setCanResend(true);
    } finally {
      setLoading(false);
    }
  };

  if (!email) {
    return (
      <div className="verify-form">
        <h2>{t('auth.verifyEmail.errorTitulo')}</h2>
        <div className="glow-line"></div>
        <p className="instruction-text">{t('auth.verifyEmail.errorEmail')}</p>
        <div className="back-to-login">
          <button type="button" className="back-link" onClick={() => openAuth('registro')}>
            <span className="back-arrow">←</span> {t('auth.verifyEmail.volverRegistro')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Tarjeta del formulario (se muestra dentro del modal sobre el catálogo) */}
        <form onSubmit={handleVerify} className="verify-form">
          
          {/* Icono de Correo Estilizado */}
          <div className="verify-icon-container">
            <div className="outer-circle">
              <div className="inner-circle">
                <svg className="mail-svg" viewBox="0 0 24 24" fill="none" stroke="#ffd700" strokeWidth="1.5">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                <div className="check-badge">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <h2>{t('auth.verifyEmail.titulo')}</h2>
          <div className="glow-line"></div>
          
          <p className="instruction-text">
            {t('auth.verifyEmail.instruccion')} <br />
            <strong className="user-email">{email || t('auth.verifyEmail.tuCorreo')}</strong>
          </p>
          
          {error && <div className="error-msg">{error}</div>}
          
          {/* Grilla de 6 inputs individuales */}
          <div className="otp-grid">
            {codeArray.map((digit, index) => (
              <input
                key={index}
                type="text"
                maxLength={1}
                value={digit}
                placeholder="-"
                ref={(el) => (inputRefs.current[index] = el as HTMLInputElement)}
                onChange={(e) => handleInputChange(e.target.value, index)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                onPaste={index === 0 ? handlePaste : undefined}
                disabled={loading}
              />
            ))}
          </div>

          {/* Indicador de expiración */}
          
          <div className="expiration-container">
              <svg className="shield-icon" viewBox="0 0 24 24" fill="none" stroke="#ffd700" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span>{t('auth.verifyEmail.expira')}</span>
            </div>

          {/* Botón principal estilizado y centrado */}
<button type="submit" className="btn-verify-submit" disabled={loading}>
  <svg className="btn-shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <polyline points="9 11 11 13 15 9" />
  </svg>
  <span className="btn-text">{loading ? t('auth.verifyEmail.verificando') : t('auth.verifyEmail.verificar')}</span>
</button>
          
          {/* Sección de Reenvío con Separadores */}
          <div className="divider-section">
            <span className="divider-text">{t('perfil.noRecibisteCodigo')}</span>
          </div>

          <div className="resend-action-container">
            <a
              href="#"
              onClick={handleResend}
              className={`resend-action-link ${!canResend ? 'disabled' : ''}`}
              style={{ pointerEvents: !canResend ? 'none' : 'auto' }}
            >
              <svg className="retry-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
              </svg>
              <span>{!canResend ? t('auth.verifyEmail.reenviarEn', { segundos: countdown }) : t('perfil.reenviarCodigo')}</span>
            </a>
          </div>

          {/* Enlace Volver al Inicio de Sesión */}
          <div className="back-to-login">
            <button type="button" className="back-link" onClick={() => openAuth('ingresar')}>
              <span className="back-arrow">←</span> {t('auth.verifyEmail.volverLogin')}
            </button>
          </div>

        </form>
    </>
  );
};

export default VerifyEmail;