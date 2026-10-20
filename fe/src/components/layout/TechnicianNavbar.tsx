// Componente de navegación y estructura visual: TechnicianNavbar. Se reutiliza en las pantallas de su área.
import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaBars, FaChevronDown, FaRightFromBracket, FaUserGear } from 'react-icons/fa6';
import { useAuth } from '@contexts/AuthContext';
import { useIdioma } from '@i18n/IdiomaContext';
import { useTecnicoNotificaciones } from '../../hooks/useTecnicoNotificaciones';
import NotificacionesBell from './NotificacionesBell';
import logo from '@assets/images/Logo.jpg';
import { getIniciales, getTechnicalAvatar } from '@utils/profileStorage';
import { tabGet } from '@utils/tabStorage';
import '@styles/admin-navbar.css';

interface TechnicianNavbarProps {
  onMenuToggle: () => void;
}

// registra escuchas de eventos para sincronizar la vista.
const TechnicianNavbar = ({ onMenuToggle }: TechnicianNavbarProps) => {
  const { logout } = useAuth();
  const { t } = useIdioma();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [, forceUpdate] = useState(0);
  const { notificaciones, cargando, marcarLeida } = useTecnicoNotificaciones();

  useEffect(() => {
    const handler = () => forceUpdate(v => v + 1);
    window.addEventListener('technical-profile-updated', handler);
    return () => window.removeEventListener('technical-profile-updated', handler);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const avatar = getTechnicalAvatar();
const userData = (() => {
    try {
      const stored = tabGet('user');
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          nombre: parsed.nombre || t('tec.tecnico'),
          correo: parsed.correo || '',
        };
      }
    } catch {}
    return { nombre: 'Técnico', correo: 'tecnico@neodomus.com' };
  })();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="admin-navbar">
      <div className="anr-inner">
        <button
          type="button"
          className="anr-menu-btn"
          onClick={onMenuToggle}
          aria-label={t('tec.abrirMenu')}
          title={t('tec.abrirMenu')}
        >
          <FaBars />
        </button>

        <Link to="/dashboard/tecnico" className="anr-brand" title={t('tec.panelTecnico')}>
          <img src={logo} alt="Neodomus" />
          <div>
            <span className="anr-brand-name">NEODOMUS</span>
            <span className="anr-brand-sub">{t('tec.tecnico')}</span>
          </div>
        </Link>

        <div className="anr-spacer" />

        <div className="anr-actions">
          <NotificacionesBell
            notificaciones={notificaciones}
            cargando={cargando}
            verTodasTo="/dashboard/tecnico"
            marcarLeida={marcarLeida}
            ariaLabel={t('tec.notificaciones')}
            titulo={t('tec.notificaciones')}
          />

          <span className="anr-sep" />

          <div className="anr-profile" ref={dropdownRef}>
            <button
              type="button"
              className={`anr-user-btn ${open ? 'open' : ''}`}
              onClick={() => setOpen(v => !v)}
              aria-expanded={open}
              aria-label={t('tec.menuPerfil')}
            >
              {avatar ? (
                <img src={avatar} alt={`${t('tec.perfilTitulo')} ${userData.nombre}`} className="anr-avatar" />
              ) : (
                <span className="anr-avatar anr-avatar-iniciales" aria-hidden="true">
                  {getIniciales(userData.nombre)}
                </span>
              )}
              <span className="anr-user-info">
                <span className="anr-user-name">{userData.nombre}</span>
                <span className="anr-user-role">{t('tec.tecnico')}</span>
              </span>
              <FaChevronDown className="anr-chevron" />
            </button>

            <div className={`anr-dropdown ${open ? 'open' : ''}`}>
              <Link to="/perfil/tecnico" className="anr-dd-item" onClick={() => setOpen(false)}>
                <FaUserGear /> {t('tec.miPerfil')}
              </Link>
              <div className="anr-dd-sep" />
              <button type="button" className="anr-dd-item danger" onClick={handleLogout}>
                <FaRightFromBracket /> {t('tec.cerrarSesion')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default TechnicianNavbar;
