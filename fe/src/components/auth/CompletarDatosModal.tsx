// Componente reutilizable CompletarDatosModal para componer la interfaz de Neodomus.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaUserPen, FaCircleExclamation, FaCircleCheck } from 'react-icons/fa6';
import { useAuth } from '@contexts/AuthContext';
import api from '@services/api';
import { useIdioma } from '@i18n/IdiomaContext';
import '@styles/auth-modal.css';
import '@styles/login.css';

// Comunica con el backend mediante PUT '/clients/me'.
const CompletarDatosModal = () => {
  const navigate = useNavigate();
  const { perfilIncompleto, rol, isAuthenticated, marcarPerfilCompleto, logout } = useAuth();
  const { t } = useIdioma();
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

    const doc = Number.parseInt(documento, 10);
    const tel = Number.parseInt(telefono, 10);
    if (!doc || doc <= 0) {
      setError(t('auth.data.errorDocumento'));
      return;
    }
    if (!tel || String(telefono).length !== 10) {
      setError(t('auth.data.errorTelefono'));
      return;
    }
    if (!direccion.trim()) {
      setError(t('auth.data.errorDireccion'));
      return;
    }

    setLoading(true);
    try {
      await api.put('/clients/me', {
        id_tipo_documento_c: Number.parseInt(tipoDocumento, 10),
        documento_cliente: doc,
        telefono_cliente: tel,
        address: direccion.trim(),
      });
      marcarPerfilCompleto();
      setMessage(t('auth.data.guardado'));
      window.setTimeout(() => {
        navigate('/', { replace: true });
      }, 1200);
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || t('auth.data.errorGuardar');
      setError(typeof errorMsg === 'string' ? errorMsg : t('auth.data.errorGuardar'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-modal-overlay" role="dialog" aria-modal="true" aria-label={t('auth.data.ariaModal')}>
      <div className="auth-modal-content">
        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-logo">
            <FaUserPen />
          </div>
          <h2>{t('auth.data.titulo')}</h2>
          <p className="login-subtitle">
            {t('auth.data.subtitulo')}
          </p>
          {message && <div className="success"><FaCircleCheck /> {message}</div>}
          {error && <div className="error"><FaCircleExclamation /> {error}</div>}

          <div className="complete-data-field">
            <label htmlFor="complete-data-document-type">{t('perfil.tipoDocumento')}</label>
            <div className="login-input-wrapper">
              <select
                id="complete-data-document-type"
                value={tipoDocumento}
                onChange={(e) => setTipoDocumento(e.target.value)}
                disabled={loading}
                className="login-select"
              >
                <option value="1">{t('perfil.datos.docCC')}</option>
                <option value="2">{t('perfil.datos.docCE')}</option>
              </select>
            </div>
          </div>

          <div className="complete-data-field">
            <label htmlFor="complete-data-document">{t('perfil.numeroDocumento')}</label>
            <div className="login-input-wrapper">
              <input
                id="complete-data-document"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder={t('auth.data.placeholderDocumento')}
                value={documento}
                onChange={(e) => setDocumento(e.target.value.replace(/\D/g, '').slice(0, 10))}
                maxLength={10}
                required
                disabled={loading}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="complete-data-field">
            <label htmlFor="complete-data-phone">{t('perfil.telefono')}</label>
            <div className="login-input-wrapper">
              <input
                id="complete-data-phone"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder={t('auth.data.placeholderTelefono')}
                value={telefono}
                onChange={(e) => setTelefono(e.target.value.replace(/\D/g, '').slice(0, 10))}
                maxLength={10}
                required
                disabled={loading}
                autoComplete="tel"
              />
            </div>
          </div>

          <div className="complete-data-field">
            <label htmlFor="complete-data-address">{t('perfil.direccionResidencia')}</label>
            <div className="login-input-wrapper">
              <input
                id="complete-data-address"
                type="text"
                placeholder={t('auth.data.placeholderDireccion')}
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                required
                disabled={loading}
                autoComplete="street-address"
              />
            </div>
          </div>

          <button type="submit" disabled={loading}>
            {loading ? t('perfil.password.guardando') : t('auth.data.guardar')}
          </button>

          <button type="button" className="login-logout" onClick={logout}>
            {t('nav.cerrarSesion')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CompletarDatosModal;
