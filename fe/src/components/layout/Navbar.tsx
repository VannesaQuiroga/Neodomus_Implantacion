// Componente de navegación y estructura visual: Navbar. Se reutiliza en las pantallas de su área.
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@contexts/AuthContext";
import { useAuthModal } from "@contexts/AuthModalContext";
import { useCart } from "@contexts/CartContext";
import { useState, useRef, useEffect } from "react";
import { FaRightFromBracket, FaCartShopping } from "react-icons/fa6";
import { getAvatar, getIniciales } from "@utils/profileStorage";
import { useIdioma } from "@i18n/IdiomaContext";
import { useNotificacionesRol } from "../../hooks/useAdminNotificaciones";
import NotificacionesBell from "./NotificacionesBell";
import api from "@services/api";

import logo from "@assets/images/Logo.jpg";
import helpIcon from "@assets/images/Icono.png";

import "../../styles/navbar.css";

// Comunica con el backend mediante GET "/clients/me"; registra escuchas de eventos para sincronizar la vista.
const Navbar = () => {
  const { user, rol, logout } = useAuth();
  const { openAuth } = useAuthModal();
  const { totalItems } = useCart();
  const { t } = useIdioma();
  const navigate = useNavigate();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const rolNotificaciones = rol === 'cliente' || rol === 'administrador' || rol === 'tecnico' ? rol : null;
  const { notificaciones, cargando, marcarLeida } = useNotificacionesRol(rolNotificaciones);

  const getPerfilPath = () => {
    if (rol === "cliente") return "/perfil";
    if (rol === "administrador") return "/perfil/admin";
    return "/perfil/tecnico";
  };

  useEffect(() => {
    const actualizarAvatar = () => {
      const savedAvatar = getAvatar();
      setAvatar(savedAvatar);
    };
    actualizarAvatar();
    window.addEventListener("client-profile-updated", actualizarAvatar);
    return () => window.removeEventListener("client-profile-updated", actualizarAvatar);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Si un administrador aprueba la inhabilitación de la cuenta, el backend
  // desactiva al cliente y /clients/me responde 401; el interceptor renueva el
  // token y, como el refresh también es rechazado, cierra la sesión al instante.
  useEffect(() => {
    if (rol !== "cliente") return;
    // Comunica con el backend mediante GET "/clients/me".
    const verificarCuenta = () => {
      api.get("/clients/me").catch(() => {
        /* el interceptor maneja el 401 y cierra sesión */
      });
    };
    verificarCuenta();
    const id = window.setInterval(verificarCuenta, 5000);
    const onVis = () => {
      if (document.visibilityState === "visible") verificarCuenta();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [rol]);

  const handleLogout = () => {
    logout();
    navigate("/login");
    setShowDropdown(false);
  };

  const nombreCompleto = user?.nombre || 'Usuario';
  const esFemenino = nombreCompleto.toLowerCase().endsWith('a') || false;

  const toggleDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDropdown(!showDropdown);
  };

  return (
    <div className="neodomus-header">
      <header>
        <div className="navbar">

          {/* Logo - Solo el logo principal */}
          <div className="logo">
            <Link to="/home">
              <img src={logo} alt="Logo Neodomus" />
            </Link>
          </div>

          {/* Menú */}
          <nav className="menu">
            {!rol ? (
              <>
                <Link to="/productos">{t('nav.productos')}</Link>
                <Link to="/info">{t('nav.sobreNosotros')}</Link>

                <Link to="/ayuda" className="icon-link">
                  {t('nav.ayuda')}
                  <img src={helpIcon} alt="Ayuda" />
                </Link>
              </>
            ) : (
              <>
                {rol === "cliente" && (
                  <>
                    <Link to="/productos">{t('nav.productos')}</Link>
                    <Link to="/cliente/tecnicos">{t('nav.tecnicos')}</Link>
                    <Link to="/cliente/citas">{t('nav.citas')}</Link>
                    <Link to="/cliente/ayuda">{t('nav.ayuda')}</Link>
                  </>
                )}

                {rol === "administrador" && (
                  <>
                    <Link to="/dashboard/admin">{t('nav.inicio')}</Link>
                    <Link to="/admin/productos">{t('nav.productos')}</Link>
                    <Link to="/admin/clientes">{t('nav.usuarios')}</Link>
                  </>
                )}

                {rol === "tecnico" && (
                  <>
                    <Link to="/dashboard/tecnico">{t('nav.inicio')}</Link>
                    <Link to="/tecnico/citas">{t('nav.citas')}</Link>
                    <Link to="/tecnico/entregas">{t('nav.entregas')}</Link>
                    <Link to="/tecnico/historial">{t('nav.servicios')}</Link>
                  </>
                )}
              </>
            )}
          </nav>

          {/* Parte derecha */}
          <div className="nav-right">
            {rol && (
              <NotificacionesBell
                notificaciones={notificaciones}
                cargando={cargando}
                verTodasTo="/notificaciones"
                marcarLeida={marcarLeida}
                buttonClassName="notif-button"
                iconClassName="notif-icon"
                ariaLabel={t('nav.verNotificaciones')}
              />
            )}

                <button
                  type="button"
                  className="cart-button"
                  onClick={() => navigate('/carrito')}
                  aria-label={t('nav.verCarrito')}
                  title={t('nav.verCarrito')}
                >
                  <FaCartShopping className="cart-icon" />
              {totalItems > 0 && <span className="cart-badge">{totalItems}</span>}
            </button>

            {!rol ? (
              <>
                <button type="button" className="btn-register" onClick={() => openAuth('registro')}>
                  {t('nav.registrarse')}
                </button>

                <button type="button" className="btn-login" onClick={() => openAuth('ingresar')}>
                  {t('nav.iniciarSesion')}
                </button>
              </>
            ) : (
              <div className="user-menu" ref={dropdownRef}>
                <div className="user-welcome" onClick={toggleDropdown}>
                  <div className="welcome-text">
                    <span className="welcome-greeting">{esFemenino ? t('nav.bienvenida') : t('nav.bienvenido')}</span>
                    <span className="welcome-name">{nombreCompleto}</span>
                  </div>
                  {avatar ? (
                    <img
                      src={avatar}
                      alt={`Perfil de ${nombreCompleto}`}
                      className="user-avatar"
                    />
                  ) : (
                    <span className="user-avatar user-avatar-iniciales" aria-hidden="true">
                      {getIniciales(nombreCompleto)}
                    </span>
                  )}
                </div>

                {showDropdown && (
                  <div className="user-dropdown">
                    <Link to={getPerfilPath()} className="dropdown-item" onClick={() => setShowDropdown(false)}>
                      {t('nav.miPerfil')}
                    </Link>
                    <button type="button" className="dropdown-item dropdown-logout" onClick={handleLogout}>
                      <FaRightFromBracket /> {t('nav.cerrarSesion')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </header>
    </div>
  );
};

export default Navbar;