// Pantalla Login de Neodomus. Reúne el estado y las acciones de su vista.
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCircleExclamation } from 'react-icons/fa6';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '@contexts/AuthContext';
import { useAuthModal } from '@contexts/AuthModalContext';
import { PF_REDIRECT_AFTER_LOGIN_KEY } from '@utils/profileStorage';
import api from '@services/api';
import { GOOGLE_LOGIN_HABILITADO } from '@utils/google';
import '@styles/login.css';

const REMEMBERED_EMAIL_KEY = 'neodomus_remembered_email';
// Clave legado: versiones anteriores guardaban la contraseña en texto plano.
// Se limpia al montar y nunca se vuelve a escribir.
const LEGACY_REMEMBERED_PASSWORD_KEY = 'neodomus_remembered_password';

// Comunica con el backend mediante POST '/auth/solicitar-habilitacion'; accede a sessionStorage y localStorage para conservar o recuperar datos locales.
const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Solo redirige automáticamente cuando el inicio de sesión ocurrió en esta
  // pestaña. Si la pestaña heredó la sesión de otra (duplicar pestaña o abrir
  // un link en pestaña nueva), se permite iniciar sesión con otra cuenta sin
  // afectar la sesión original.
  const [sesionIniciadaAqui, setSesionIniciadaAqui] = useState(false);
  const { login, googleLogin, user, isAuthenticated, passwordResetRequired } = useAuth();
  const { openAuth, closeAuth } = useAuthModal();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [cuentaInhabilitada, setCuentaInhabilitada] = useState(false);
  const [enviandoSolicitud, setEnviandoSolicitud] = useState(false);
  const [solicitudEnviada, setSolicitudEnviada] = useState(false);
  const [emailSinVerificar, setEmailSinVerificar] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !user?.rol || !sesionIniciadaAqui) return;
    closeAuth();
    const rol = user.rol;
    if (passwordResetRequired && rol !== 'cliente') {
      if (rol === 'tecnico') {
        navigate('/dashboard/tecnico', { replace: true });
      } else {
        navigate('/cambiar-password-obligatorio', { replace: true });
      }
      return;
    }
    const destino = sessionStorage.getItem(PF_REDIRECT_AFTER_LOGIN_KEY);
    if (destino) {
      sessionStorage.removeItem(PF_REDIRECT_AFTER_LOGIN_KEY);
      if (rol === 'cliente') {
        navigate(destino, { replace: true });
        return;
      }
    }
    if (rol === 'administrador' || rol === 'admin') {
      navigate('/dashboard/admin', { replace: true });
    } else if (rol === 'cliente') {
      navigate('/productos', { replace: true });
    } else if (rol === 'tecnico') {
      navigate('/dashboard/tecnico', { replace: true });
    }
  }, [isAuthenticated, user, sesionIniciadaAqui, navigate, closeAuth]);

  // Restaurar el correo guardado con "Recordarme" (nunca la contraseña).
  useEffect(() => {
    // Limpieza de instalaciones antiguas que guardaban la contraseña.
    try {
      localStorage.removeItem(LEGACY_REMEMBERED_PASSWORD_KEY);
    } catch {
      /* noop */
    }
    const savedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY);
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  // accede a localStorage para conservar o recuperar datos locales.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCuentaInhabilitada(false);
    setSolicitudEnviada(false);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Ingresa un correo electrónico válido');
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      setSesionIniciadaAqui(true);
      if (rememberMe) {
        // Solo se recuerda el correo; jamás la contraseña.
        localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
      } else {
        localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      }
    } catch (err: any) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail || 'Error al iniciar sesión';
      if (status === 403 && typeof detail === 'string' && detail.toLowerCase().includes('inhabilitada')) {
        setCuentaInhabilitada(true);
      }
      if (status === 403 && typeof detail === 'string' && detail.toLowerCase().includes('verificado')) {
        setEmailSinVerificar(true);
      }
      if (status === 401) {
        setError('Correo o contraseña incorrectos. Verifica tus datos e inténtalo de nuevo.');
      } else {
        setError(detail);
      }
    } finally {
      setLoading(false);
    }
  };

  // Comunica con el backend mediante POST '/auth/solicitar-habilitacion'.
  const handleSolicitarHabilitacion = async () => {
    setEnviandoSolicitud(true);
    setError('');
    try {
      await api.post('/auth/solicitar-habilitacion', { email, password });
      setSolicitudEnviada(true);
      setCuentaInhabilitada(false);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'No se pudo enviar la solicitud');
    } finally {
      setEnviandoSolicitud(false);
    }
  };

  return (
    <>
      
      {/* Tarjeta del formulario (se muestra dentro del modal sobre el catálogo) */}
        <form onSubmit={handleSubmit} className="login-card">
          
          {/* Avatar Icon Superior */}
          <div className="login-avatar-container">
            <div className="login-avatar-circle">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#ffd700" strokeWidth="1.5">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
          </div>

          <h2>Iniciar sesión</h2>
          <p className="welcome-text">Bienvenido de nuevo a <span className="brand-gold">NEODOMUS</span></p>

          {/* Área de alerta con altura fija para que el modal no cambie de tamaño */}
          <div className="login-error-slot">
            {error && (
              <div className="login-error-box">
                <FaCircleExclamation />
                <span>{error}</span>
              </div>
            )}
          </div>
          
          {/* Input de Correo */}
          <div className="login-input-wrapper">
            <input
              type="email"
              placeholder="Correo electrónico"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              autoComplete="email"
            />
          </div>

          {/* Input de Contraseña */}
<div className="login-input-wrapper">
  <input
    type={showPassword ? 'text' : 'password'}
    placeholder="Contraseña"
    value={password}
    onChange={(e) => setPassword(e.target.value)}
    required
    autoComplete="current-password"
  />
  <button
    type="button"
    className="login-password-toggle"
    onClick={() => setShowPassword(!showPassword)}
  >
    {/* Icono SVG que podemos pintar de blanco */}
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      {showPassword ? (
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
      ) : (
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      )}
    </svg>
  </button>
</div>

          <button type="submit" className="btn-login-submit" disabled={loading}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>

          {solicitudEnviada && (
            <div className="login-reactivate-box success">
              <p>Solicitud de habilitación enviada. El administrador revisará tu caso y, si la aprueba, podrás iniciar sesión nuevamente.</p>
            </div>
          )}

          {cuentaInhabilitada && (
            <div className="login-reactivate-box">
              <p>Tu cuenta está inhabilitada por un administrador. Puedes solicitar que sea habilitada nuevamente.</p>
              <button type="button" className="btn-reactivate" onClick={handleSolicitarHabilitacion} disabled={enviandoSolicitud}>
                {enviandoSolicitud ? 'Enviando...' : 'Solicitar habilitación de la cuenta'}
              </button>
            </div>
          )}

          {emailSinVerificar && (
            <div className="login-reactivate-box">
              <p>Tu correo aún no ha sido verificado. Debes ingresar el código de verificación para poder iniciar sesión.</p>
              <button
                type="button"
                className="btn-reactivate"
                onClick={() => openAuth('verificar-email', { email })}
              >
                Verificar mi correo
              </button>
            </div>
          )}

          <div className="login-options-row">
            <label className="remember-me-label">
              <input 
                type="checkbox" 
                checked={rememberMe} 
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={loading}
              />
              <span>Recordarme</span>
            </label>
            <button type="button" className="forgot-password-link" onClick={() => openAuth('recuperar')}>
              ¿Olvidaste tu contraseña?
            </button>
          </div>

          {GOOGLE_LOGIN_HABILITADO && (
            <>
              <div className="login-divider">
                <div className="divider-circle"></div>
              </div>

              <div className="google-login-wrap">
                <GoogleLogin
                  onSuccess={(credentialResponse) => {
                    if (credentialResponse.credential) {
                      googleLogin(credentialResponse.credential)
                        .then(() => setSesionIniciadaAqui(true))
                        .catch((err) => {
                          setError(err.response?.data?.detail || 'Error al iniciar sesión con Google');
                        });
                    }
                  }}
                  onError={() => {
                    setError('No se pudo iniciar sesión con Google');
                  }}
                  theme="outline"
                  size="large"
                  text="signin_with"
                  shape="rectangular"
                />
              </div>
            </>
          )}

          <div className="register-redirect-section">
            <span>¿No tienes una cuenta?</span>
            <button type="button" className="register-gold-link" onClick={() => openAuth('registro')}>Registrarse</button>
          </div>

        </form>
      
    </>
  );
};

export default Login;