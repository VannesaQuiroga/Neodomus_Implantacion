// Componente reutilizable CompletarDatosModal para componer la interfaz de Neodomus.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaUserPen, FaCircleExclamation, FaCircleCheck } from 'react-icons/fa6';
import { useAuth } from '@contexts/AuthContext';
import api from '@services/api';
import '@styles/auth-modal.css';
import '@styles/login.css';

// Comunica con el backend mediante PUT '/clients/me'.
const CompletarDatosModal = () => {
  const navigate = useNavigate();
  const { perfilIncompleto, rol, isAuthenticated, marcarPerfilCompleto, logout } = useAuth();
  const [tipoDocumento, setTipoDocumento] = useState('1');
  const [documento, setDocumento] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const visible = isAuthenticated && rol === 'cliente' && perfilIncompleto;

  useEffect(() => {
    if (visible) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [visible]);

  useEffect(() => {
    if (message || error) {
      const timer = setTimeout(() => {
        setMessage('');
        setError('');
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [message, error]);

  if (!visible) return null;

  // Comunica con el backend mediante PUT '/clients/me'.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setError('');

    const doc = parseInt(documento, 10);
    const tel = parseInt(telefono, 10);
    if (!doc || doc <= 0) {
      setError('Ingresa un número de documento válido');
      return;
    }
    if (!tel || String(telefono).length !== 10) {
      setError('Ingresa un número de teléfono válido (10 dígitos)');
      return;
    }
    if (!direccion.trim()) {
      setError('Ingresa tu dirección de residencia');
      return;
    }

    setLoading(true);
    try {
      await api.put('/clients/me', {
        id_tipo_documento_c: parseInt(tipoDocumento, 10),
        documento_cliente: doc,
        telefono_cliente: tel,
        address: direccion.trim(),
      });
      marcarPerfilCompleto();
      setMessage('¡Datos guardados! Tu cuenta está completa.');
      window.setTimeout(() => {
        navigate('/', { replace: true });
      }, 1200);
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || 'Error al guardar tus datos';
      setError(typeof errorMsg === 'string' ? errorMsg : 'Error al guardar tus datos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-modal-overlay" role="dialog" aria-modal="true" aria-label="Completar tus datos">
      <div className="auth-modal-content">
        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-logo">
            <FaUserPen />
          </div>
          <h2>Completa tus datos</h2>
          <p className="login-subtitle">
            Te registraste con Google y nos faltan algunos datos obligatorios para
            poder realizar pedidos y agendar instalaciones. Completa esta información
            para continuar usando la plataforma.
          </p>
          {message && <div className="success"><FaCircleCheck /> {message}</div>}
          {error && <div className="error"><FaCircleExclamation /> {error}</div>}

          <div className="login-input-wrapper">
            <select
              value={tipoDocumento}
              onChange={(e) => setTipoDocumento(e.target.value)}
              disabled={loading}
              className="login-select"
            >
              <option value="1">CC - Cédula de ciudadanía</option>
              <option value="2">CE - Cédula de extranjería</option>
            </select>
          </div>

          <div className="login-input-wrapper">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Número de documento"
              value={documento}
              onChange={(e) => setDocumento(e.target.value.replace(/\D/g, '').slice(0, 10))}
              maxLength={10}
              required
              disabled={loading}
              autoComplete="off"
            />
          </div>

          <div className="login-input-wrapper">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Teléfono (10 dígitos)"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value.replace(/\D/g, '').slice(0, 10))}
              maxLength={10}
              required
              disabled={loading}
              autoComplete="tel"
            />
          </div>

          <div className="login-input-wrapper">
            <input
              type="text"
              placeholder="Dirección de residencia"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              required
              disabled={loading}
              autoComplete="street-address"
            />
          </div>

          <button type="submit" disabled={loading}>
            {loading ? 'Guardando...' : 'Guardar mis datos'}
          </button>

          <button type="button" className="login-logout" onClick={logout}>
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
};

export default CompletarDatosModal;