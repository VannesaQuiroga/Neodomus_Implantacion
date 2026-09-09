import { NavLink } from "react-router-dom";
import { useIdioma } from "@i18n/IdiomaContext";
import {
  FaBoxOpen,
  FaHouse,
  FaCalendarCheck,
  FaClockRotateLeft,
  FaTruckFast,
  FaUsers,
  FaStar,
  FaShieldHalved,
} from "react-icons/fa6";
import "@styles/admin-sidebar.css";

interface TechnicianSidebarProps {
  open: boolean;
  onNavigate?: () => void;
}

interface Seccion {
  titulo: string;
  links: { to: string; icon: React.ReactNode; label: string }[];
}

const TechnicianSidebar = ({ open, onNavigate }: TechnicianSidebarProps) => {
  const { t } = useIdioma();

  const secciones: Seccion[] = [
    {
      titulo: t('tec.panel'),
      links: [
        { to: "/dashboard/tecnico", icon: <FaHouse />, label: t('tec.inicio') },
      ],
    },
    {
      titulo: t('tec.servicios'),
      links: [
        { to: "/tecnico/citas", icon: <FaCalendarCheck />, label: t('tec.misCitas') },
        { to: "/tecnico/entregas", icon: <FaTruckFast />, label: t('nav.entregas') },
        { to: "/tecnico/devoluciones", icon: <FaBoxOpen />, label: t('tec.devoluciones') },
        { to: "/tecnico/novedades", icon: <FaShieldHalved />, label: 'Novedades' },
        { to: "/tecnico/historial", icon: <FaClockRotateLeft />, label: t('tec.historial') },
      ],
    },
    {
      titulo: t('tec.clientes'),
      links: [
        { to: "/tecnico/clientes", icon: <FaUsers />, label: t('tec.clientes') },
      ],
    },
    {
      titulo: t('tec.calificaciones'),
      links: [
        { to: "/tecnico/calificaciones", icon: <FaStar />, label: t('tec.misCalificaciones') },
      ],
    },
  ];

  return (
    <aside className={`admin-sidebar ${open ? 'open' : ''}`}>
      <nav className="sidebar-nav" aria-label={t('tec.menuTecnico')}>
        {secciones.map((seccion) => (
          <div key={seccion.titulo}>
            <span className="sidebar-section-title">{seccion.titulo}</span>
            {seccion.links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={onNavigate}
                className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
              >
                <span className="sidebar-icon">{link.icon}</span>
                <span className="sidebar-label">{link.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
};

export default TechnicianSidebar;
