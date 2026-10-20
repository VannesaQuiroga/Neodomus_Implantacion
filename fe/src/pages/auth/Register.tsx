// src/pages/auth/Register.tsx
import { useState, useEffect } from 'react';
import { useAuthModal } from '@contexts/AuthModalContext';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '@contexts/AuthContext';
import api from '@services/api';
import { GOOGLE_LOGIN_HABILITADO } from '@utils/google';
import '@styles/register.css';    
     

interface FormData {
  nombre: string;
  apellido: string;
  tipo_documento: number;
  documento: string;
  ciudad: string;       
  municipio: string;    
  direccion: string;
  telefono: string;
  correo: string;
  contraseña: string;
}

// Única opción permitida: Bogotá con su municipio oficial
const regionesColombia: Record<string, string[]> = {
  "Bogotá": ["Bogotá D.C."]
};

// Comunica con el backend mediante POST '/auth/register/client'.
const Register = () => {
  const { openAuth, closeAuth } = useAuthModal();
  const { googleLogin } = useAuth();
  const [formData, setFormData] = useState<FormData>({
    nombre: '', apellido: '', tipo_documento: 2, documento: '', 
    ciudad: '', municipio: '', direccion: '', telefono: '', 
    correo: '', contraseña: '',
  });
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [confirmCorreo, setConfirmCorreo] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptCookies, setAcceptCookies] = useState(false);
  
  const [passwordErrors, setPasswordErrors] = useState({
    length: false,
    uppercase: false,
    lowercase: false,
    number: false,
    special: false,
  });

  const [municipiosDisponibles, setMunicipiosDisponibles] = useState<string[]>([]);

  const isFormComplete =
    formData.nombre.trim() !== '' &&
    formData.apellido.trim() !== '' &&
    formData.documento.trim() !== '' &&
    formData.telefono.trim() !== '' &&
    formData.ciudad !== '' &&
    formData.municipio !== '' &&
    formData.direccion.trim() !== '' &&
    formData.correo.trim() !== '' &&
    formData.contraseña.trim() !== '' &&
    confirmCorreo.trim() !== '' &&
    confirmPassword.trim() !== '' &&
    formData.correo === confirmCorreo &&
    formData.contraseña === confirmPassword &&
    acceptTerms &&
    acceptPrivacy &&
    acceptCookies;

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name } = e.target;
    let value = e.target.value;

    if (name === 'documento' || name === 'telefono') {
      value = value.replace(/\D/g, '').slice(0, 10);
    }

    if (name === 'ciudad') {
      setMunicipiosDisponibles(regionesColombia[value] || []);
      setFormData(prev => ({ ...prev, ciudad: value, municipio: '' }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
    
    if (name === 'contraseña') {
      setPasswordErrors({
        length: value.length >= 8,
        uppercase: /[A-Z]/.test(value),
        lowercase: /[a-z]/.test(value),
        number: /\d/.test(value),
        special: /[!@#$%^&*(),.?":{}|<>]/.test(value),
      });
    }
  };

  const validateForm = () => {
    const passwordValid = 
      passwordErrors.length &&
      passwordErrors.uppercase &&
      passwordErrors.lowercase &&
      passwordErrors.number &&
      passwordErrors.special;
    if (!passwordValid) {
      setError('La contraseña no cumple los requisitos.');
      return false;
    }
    if (formData.correo !== confirmCorreo) {
      setError('Los correos no coinciden.');
      return false;
    }
    if (formData.contraseña !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return false;
    }
    return true;
  };

  // Comunica con el backend mediante POST '/auth/register/client'.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validateForm()) return;
    if (loading) return;
    setLoading(true);
    try {
      const correoNorm = formData.correo.trim().toLowerCase();
      await api.post('/auth/register/client', {
        first_name: formData.nombre.trim(),
        last_name: formData.apellido.trim(),
        email: correoNorm,
        password: formData.contraseña,
        id_tipo_documento_c: parseInt(formData.tipo_documento as any),
        documento_cliente: parseInt(formData.documento),
        telefono_cliente: parseInt(formData.telefono),
        city: formData.municipio, 
        address: formData.direccion.trim(),
      }, { timeout: 15000 });
      openAuth('verificar-email', { email: correoNorm });
    } catch (err: any) {
      const status = err.response?.status;
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        setError('La solicitud tardó demasiado. Verifica tu conexión e inténtalo nuevamente.');
      } else if (status === 429) {
        setError('Demasiadas solicitudes. Espera un minuto antes de reintentar.');
      } else {
        setError(err.response?.data?.detail || 'Error al registrarse. Verifica los datos e inténtalo de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Tarjeta del formulario (se muestra dentro del modal sobre el catálogo) */}
        <form onSubmit={handleSubmit} className="register-form">
          {/* Avatar Icon Superior */}
          <div className="login-avatar-container">
            <div className="login-avatar-circle">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#ffd700" strokeWidth="1.5">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
          </div>


          <h2>Crear cuenta</h2>
          
          {error && <div className="error">{error}</div>}
          
          <div className="form-grid">
            {/* Pareja 1: nombres / apellidos */}
            <div className="input-group-block">
              <label>Nombres</label>
              <input name="nombre" placeholder="Ingresa tus nombres" value={formData.nombre} autoComplete="given-name" onChange={handleChange} required disabled={loading} />
            </div>
            <div className="input-group-block">
              <label>Apellidos</label>
              <input name="apellido" placeholder="Ingresa tus apellidos" value={formData.apellido} autoComplete="family-name" onChange={handleChange} required disabled={loading} />
            </div>
            
            {/* Pareja 2: tipo de documento / documento */}
            <div className="input-group-block">
              <label>Tipo documento</label>
              <div className="select-wrapper">
                <select name="tipo_documento" onChange={handleChange} disabled={loading} defaultValue="1">
                  <option value="1">CC</option>
                  <option value="2">CE</option>
                </select>
              </div>
            </div>
            <div className="input-group-block">
              <label>Documento</label>
              <input name="documento" placeholder="Ingresa tu número de documento" value={formData.documento} autoComplete="off" inputMode="numeric" pattern="[0-9]*" maxLength={10} onChange={handleChange} required disabled={loading} />
            </div>

            {/* Pareja 3: ciudad / municipio */}
            <div className="input-group-block">
              <label>Ciudad</label>
              <div className="select-wrapper">
                <select name="ciudad" onChange={handleChange} required disabled={loading} value={formData.ciudad}>
                  <option value="" disabled>Selecciona tu ciudad</option>
                  {Object.keys(regionesColombia).map((city) => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="input-group-block">
              <label>Municipio</label>
              <div className="select-wrapper">
                <select 
                  name="municipio" 
                  onChange={handleChange} 
                  required 
                  disabled={loading || !formData.ciudad} 
                  value={formData.municipio}
                >
                  <option value="" disabled>Selecciona tu municipio</option>
                  {municipiosDisponibles.map((mun) => (
                    <option key={mun} value={mun}>{mun}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Pareja 4: dirección / teléfono */}
            <div className="input-group-block">
              <label>Dirección</label>
              <input name="direccion" placeholder="Ingresa tu dirección" value={formData.direccion} autoComplete="street-address" onChange={handleChange} required disabled={loading} />
            </div>
            <div className="input-group-block">
              <label>Teléfono</label>
              <input name="telefono" placeholder="Ingresa tu número telefónico" value={formData.telefono} autoComplete="tel" inputMode="numeric" pattern="[0-9]*" maxLength={10} onChange={handleChange} required disabled={loading} />
            </div>

            {/* Pareja 5: correo / confirmación de correo */}
            <div className="input-group-block">
              <label>Correo</label>
              <input name="correo" type="email" placeholder="Ingresa tu correo" value={formData.correo} autoComplete="email" onChange={handleChange} required disabled={loading} />
            </div>
            <div className="input-group-block">
              <label>Confirmación de correo</label>
              <input
                type="email"
                placeholder="Confirma tu correo"
                value={confirmCorreo}
                onChange={(e) => setConfirmCorreo(e.target.value)}
                onPaste={(e) => e.preventDefault()}
                onCopy={(e) => e.preventDefault()}
                onCut={(e) => e.preventDefault()}
                onContextMenu={(e) => e.preventDefault()}
                required
                disabled={loading}
              />
            </div>
            
            {/* Pareja 6: contraseña / confirmación de contraseña */}
            <div className="input-group-block">
              <label>Contraseña</label>
              <div className="password-input-wrapper">
                <input
                  name="contraseña"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Ingresa tu contraseña"
                  value={formData.contraseña}
                  autoComplete="new-password"
                  onChange={handleChange}
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                      <line x1="21" y1="3" x2="3" y2="21"></line>
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div className="input-group-block">
              <label>Confirmación de contraseña</label>
              <div className="password-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Confirma tu contraseña"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onPaste={(e) => e.preventDefault()}
                  onCopy={(e) => e.preventDefault()}
                  onCut={(e) => e.preventDefault()}
                  onContextMenu={(e) => e.preventDefault()}
                  required
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          <div className="password-requirements">
            <p className="requirement-title">La contraseña debe contener:</p>
            <ul>
              <li className={passwordErrors.length ? 'valid' : 'invalid'}>
                {passwordErrors.length ? '✓' : '✗'} 8+ caracteres
              </li>
              <li className={passwordErrors.uppercase ? 'valid' : 'invalid'}>
                {passwordErrors.uppercase ? '✓' : '✗'} Una mayúscula
              </li>
              <li className={passwordErrors.lowercase ? 'valid' : 'invalid'}>
                {passwordErrors.lowercase ? '✓' : '✗'} Una minúscula
              </li>
              <li className={passwordErrors.number ? 'valid' : 'invalid'}>
                {passwordErrors.number ? '✓' : '✗'} Un número
              </li>
              <li className={passwordErrors.special ? 'valid' : 'invalid'}>
                {passwordErrors.special ? '✓' : '✗'} Carácter especial
              </li>
            </ul>
          </div>

          <div className="legal-checkboxes">
            <label className="checkbox-row">
              <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} disabled={loading} />
              <span>Acepto los <span className="gold-text">Términos de uso</span></span>
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={acceptPrivacy} onChange={(e) => setAcceptPrivacy(e.target.checked)} disabled={loading} />
              <span>Acepto la <span className="gold-text">Política de privacidad</span></span>
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={acceptCookies} onChange={(e) => setAcceptCookies(e.target.checked)} disabled={loading} />
              <span>Acepto la <span className="gold-text">Política de cookies</span></span>
            </label>
          </div>
          
          <button type="submit" className="btn-register-submit" disabled={!isFormComplete || loading}>
            {loading ? 'Registrando...' : 'Registrarse'}
          </button>

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
                        .then(() => closeAuth())
                        .catch((err) => {
                          setError(err.response?.data?.detail || 'Error al registrar con Google');
                        });
                    }
                  }}
                  onError={() => {
                    setError('No se pudo registrar con Google');
                  }}
                  theme="outline"
                  size="large"
                  text="signup_with"
                  shape="rectangular"
                />
              </div>
            </>
          )}
          
          {/* Sección de Login Rediseñada */}
          <div className="links">
            <span>¿Ya tienes una cuenta?</span>
            <button type="button" className="login-accent-link" onClick={() => openAuth('ingresar')}>Iniciar Sesión</button>
          </div>
        </form>
    </>
  );
};

export default Register;