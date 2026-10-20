// Pantalla VerifyCode de Neodomus. Reúne el estado y las acciones de su vista.
import { useState, useEffect } from 'react';
import { useAuthModal } from '@contexts/AuthModalContext';
import api from '@services/api';
import '@styles/verifyCode.css';

// Comunica con el backend mediante POST '/auth/verify-code', POST '/auth/forgot-password'.
const VerifyCode = () => {
  const { email, openAuth } = useAuthModal();

  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const [countdown, setCountdown] = useState(600);

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;

    return `${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  };

  // Comunica con el backend mediante POST '/auth/verify-code'.
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();

    const fullCode = code.join('');

    if (fullCode.length !== 6) {
      setError('Ingresa el código de 6 dígitos');
      return;
    }

    if (loading) return;
    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      await api.post('/auth/verify-code', {
        email,
        code: fullCode,
      }, { timeout: 15000 });

      openAuth('restablecer', { token: fullCode });
    } catch (err: any) {
      const status = err.response?.status;
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        setError('La verificación tardó demasiado. Inténtalo nuevamente.');
      } else if (status === 429) {
        setError('Demasiados intentos. Espera un momento antes de reintentar.');
      } else {
        setError(
          err.response?.data?.detail ||
            'Código inválido o expirado. Verifica el código e inténtalo de nuevo.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  // Comunica con el backend mediante POST '/auth/forgot-password'.
  const handleResend = async (
    e: React.MouseEvent
  ) => {
    e.preventDefault();

    if (countdown > 480) return;
    if (resendLoading) return;

    setResendLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      await api.post('/auth/forgot-password', {
        email,
      }, { timeout: 15000 });

      setSuccessMsg(
        'Si el correo está registrado, recibirás un nuevo código en breve.'
      );

      setCountdown(600);
    } catch (err: any) {
      const status = err.response?.status;
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        setError('El reenvío tardó demasiado. Inténtalo nuevamente.');
      } else if (status === 429) {
        setError('Demasiadas solicitudes. Espera un minuto antes de reintentar.');
      } else {
        setError(
          err.response?.data?.detail ||
            'No fue posible reenviar el código. Inténtalo nuevamente.'
        );
      }
    } finally {
      setResendLoading(false);
    }
  };

  if (!email) {
    return (
      /* Tarjeta del formulario (se muestra dentro del modal sobre el catálogo) */
      <div className="verify-card">
        <h2>Error</h2>

        <p className="forgot-instruction-text">
          No se proporcionó un correo electrónico válido.
        </p>

        <div className="forgot-back-to-login">
          <button
            type="button"
            onClick={() => openAuth('recuperar')}
            className="forgot-back-link"
          >
            ← Volver
          </button>
        </div>
      </div>
    );
  }

  return (
    /* Tarjeta del formulario (se muestra dentro del modal sobre el catálogo) */
    <form
      onSubmit={handleVerify}
      className="verify-card"
    >
        <div className="login-avatar-container">
          <div className="forgot-avatar-circle">
            <svg
              className="forgot-mail-svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ffd700"
              strokeWidth="1.5"
            >
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>

            <div className="lock-badge">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="#000000"
                strokeWidth="2.5"
              >
                <rect
                  x="3"
                  y="11"
                  width="18"
                  height="11"
                  rx="2"
                  ry="2"
                />

                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
          </div>
        </div>

        <h2>Código de seguridad</h2>

        <p className="forgot-instruction-text">
          Ingresa el código de 6 dígitos enviado a
          <br />
          <span className="user-email">
            {email}
          </span>
        </p>

        <p className="security-note">
          Por seguridad, este código solo puede
          utilizarse una vez.
        </p>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="success-message">
            {successMsg}
          </div>
        )}

        <div className="otp-grid">
          {code.map((digit, i) => (
            <input
              key={i}
              type="text"
              maxLength={1}
              value={digit}
              placeholder="-"
              autoComplete="one-time-code"
              disabled={loading}
              onChange={(e) => {
                const val =
                  e.target.value.replace(/\D/g, '');

                const newCode = [...code];

                newCode[i] = val;

                setCode(newCode);

                if (val && i < 5) {
                  const nextInput =
                    document.querySelectorAll(
                      '.otp-grid input'
                    )[i + 1] as HTMLInputElement;

                  nextInput?.focus();
                }
              }}
              onKeyDown={(e) => {
                if (
                  e.key === 'Backspace' &&
                  !digit &&
                  i > 0
                ) {
                  const prevInput =
                    document.querySelectorAll(
                      '.otp-grid input'
                    )[i - 1] as HTMLInputElement;

                  prevInput?.focus();
                }
              }}
            />
          ))}
        </div>

        <div className="expiration-container">
          <svg
            className="shield-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
            />
            <polyline points="12 6 12 12 16 14" />
          </svg>

          <span>
            El código expirará en{' '}
            <span className="brand-gold">
              {formatTime(countdown)}
            </span>
          </span>
        </div>

        <button
          type="submit"
          className="btn-verify-submit"
          disabled={loading}
        >
          <svg
            className="btn-shield"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <polyline points="9 11 11 13 15 9" />
          </svg>

          <span>
            {loading
              ? 'Confirmando...'
              : 'Confirmar código'}
          </span>

          <span className="btn-arrow">
            →
          </span>
        </button>

        <div className="login-divider">
          <div className="divider-circle"></div>
        </div>

        <div className="resend-action-container">
          <p className="no-account-text">
            ¿No recibiste el código?
          </p>

          <a
            href="#"
            onClick={handleResend}
            className={`resend-action-link ${
              resendLoading ? 'disabled' : ''
            }`}
            style={{
              pointerEvents: resendLoading
                ? 'none'
                : 'auto',
            }}
          >
            <svg
              className="retry-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>

            <span>
              {resendLoading
                ? 'Reenviando...'
                : 'Reenviar código'}
            </span>
          </a>
        </div>

        <div className="forgot-back-to-login">
          <button
            type="button"
            onClick={() => openAuth('ingresar')}
            className="forgot-back-link"
          >
            ← Volver al inicio de sesión
          </button>
        </div>
      </form>
  );
};

export default VerifyCode;
