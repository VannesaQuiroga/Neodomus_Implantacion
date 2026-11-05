// Pantalla ForgotPassword de Neodomus. Reúne el estado y las acciones de su vista.

import "../../styles/forgot-password.css";
import { useState } from 'react';
import { useAuthModal } from '@contexts/AuthModalContext';
import api from '@services/api';


// Comunica con el backend mediante POST '/auth/forgot-password'.
const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { openAuth } = useAuthModal();

  // Comunica con el backend mediante POST '/auth/forgot-password'.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    setMessage('');
    setError('');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      setError('Correo electrónico inválido');
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
        setError('La solicitud tardó demasiado. Verifica tu conexión e inténtalo nuevamente.');
      } else if (status === 429) {
        setError('Demasiadas solicitudes. Espera un minuto antes de reintentar.');
      } else if (detail) {
        setError(typeof detail === 'string' ? detail : 'Error al enviar la solicitud');
      } else if (!err.response) {
        setError('No se pudo conectar con el servidor. Verifica tu conexión.');
      } else {
        setError('No fue posible enviar el código. Verifica tu correo e inténtalo nuevamente.');
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

          <h2>Recuperar contraseña</h2>
          <p className="forgot-instruction-text">
            Ingresa tu correo electrónico y te enviaremos un <span className="brand-gold">código</span> para restablecer tu contraseña.
          </p>

          {message && <div className="success-message">{message}</div>}
          {error && <div className="error-message">{error}</div>}
          
          <div className="login-input-wrapper">
            <input 
              type="email" 
              placeholder="Tu correo electrónico" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
              disabled={loading} 
            />
          </div>

          <button type="submit" className="btn-forgot-submit" disabled={loading}>
            <span>{loading ? 'Enviando...' : 'Enviar código'}</span>
          </button>

          <div className="forgot-security-notice">
            <p>Te enviaremos un <span className="brand-gold">código seguro</span> a tu correo.</p>
          </div>

          <div className="forgot-back-to-login">
            <button type="button" onClick={() => openAuth('ingresar')} className="forgot-back-link">
              ← Volver al inicio de sesión
            </button>
          </div>
        </form>
  );
};

export default ForgotPassword;