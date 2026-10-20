// Componente de navegación y estructura visual: AdminNavbar. Se reutiliza en las pantallas de su área.
import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaBars, FaChevronDown, FaRightFromBracket, FaUserShield } from 'react-icons/fa6';
import { useAuth } from '@contexts/AuthContext';
import { useIdioma } from '@i18n/IdiomaContext';
import { getAdminAvatar, getIniciales } from '@utils/profileStorage';
import { tabGet } from '@utils/tabStorage';
import logo from '@assets/images/Logo.jpg';
import type { NotifAdmin } from '../../hooks/useAdminNotificaciones';
import NotificacionesBell from './NotificacionesBell';
import "../../styles/admin-navbar.css";

interface AdminNavbarProps {
  onMenuToggle: () => void;
  notificaciones: NotifAdmin[];
  cargandoNotificaciones?: boolean;
  marcarLeida?: (id: string) => void;
}

// registra escuchas de eventos para sincronizar la vista.
const AdminNavbar = ({ onMenuToggle, notificaciones, cargandoNotificaciones = false, marcarLeida }: AdminNavbarProps) => {
  const { t } = useIdioma();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const handler = () => forceUpdate(v => v + 1);
    window.addEventListener('admin-profile-updated', handler);
    return () => window.removeEventListener('admin-profile-updated', handler);
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

  const avatar = getAdminAvatar();
  const userData = (() => {
    try {
      const stored = tabGet('user');
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          nombre: parsed.nombre || t('adm.navbar.administrador'),
          correo: parsed.correo || 'admin@neodomus.com',
        };
      }
    } catch {}
    return { nombre: t('adm.navbar.administrador'), correo: 'admin@neodomus.com' };
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
          aria-label={t('adm.navbar.abrirMenu')}
          title={t('adm.navbar.abrirMenu')}
        >
          <FaBars />
        </button>

        <Link to="/dashboard/admin" className="anr-brand" title={t('adm.navbar.panel')}>
          <img src={logo} alt="Neodomus" />
          <div>
            <span className="anr-brand-name">NEODOMUS</span>
            <span className="anr-brand-sub">{t('adm.navbar.administrador')}</span>
          </div>
        </Link>

        <div className="anr-spacer" />

        <div className="anr-actions">
          <NotificacionesBell
            notificaciones={notificaciones}
            cargando={cargandoNotificaciones}
            verTodasTo="/admin/notificaciones"
            marcarLeida={marcarLeida}
            titulo={t('adm.navbar.notificaciones')}
          />

          <span className="anr-sep" />

          <div className="anr-profile" ref={dropdownRef}>
            <button
              type="button"
              className={`anr-user-btn ${open ? 'open' : ''}`}
              onClick={() => setOpen(v => !v)}
              aria-expanded={open}
              aria-label={t('adm.navbar.menuPerfil')}
            >
              {avatar ? (
                <img src={avatar} alt={t('adm.navbar.perfilDe', { nombre: userData.nombre })} className="anr-avatar" />
              ) : (
                <span className="anr-avatar anr-avatar-iniciales" aria-hidden="true">
                  {getIniciales(userData.nombre)}
                </span>
              )}
              <span className="anr-user-info">
                <span className="anr-user-name">{userData.nombre}</span>
                <span className="anr-user-role">{t('adm.navbar.administrador')}</span>
              </span>
              <FaChevronDown className="anr-chevron" />
            </button>

            <div className={`anr-dropdown ${open ? 'open' : ''}`}>
              <Link to="/perfil/admin" className="anr-dd-item" onClick={() => setOpen(false)}>
                <FaUserShield /> {t('adm.sidebar.miPerfil')}
              </Link>
              <div className="anr-dd-sep" />
              <button type="button" className="anr-dd-item danger" onClick={handleLogout}>
                <FaRightFromBracket /> {t('adm.navbar.cerrarSesion')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default AdminNavbar;