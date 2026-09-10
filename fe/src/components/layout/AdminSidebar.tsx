import { NavLink } from "react-router-dom";
import { useIdioma } from "@i18n/IdiomaContext";
import {
  FaHouse,
  FaBell,
  FaTags,
  FaUserGear,
  FaCalendarCheck,
  FaEnvelopeOpenText,
  FaUsers,
  FaChartColumn,
  FaTruckField,
  FaRotateLeft,
  FaBoxOpen,
  FaShieldHalved,
} from "react-icons/fa6";
import "../../styles/admin-sidebar.css";

interface AdminSidebarProps {
  open: boolean;
  pendientes: number;
  onNavigate?: () => void;
}

interface Seccion {
  titulo: string;
  links: { to: string; icon: React.ReactNode; label: string; badge?: number }[];
}

const AdminSidebar = ({ open, pendientes, onNavigate }: AdminSidebarProps) => {
  const { t } = useIdioma();

  const secciones: Seccion[] = [
    {
      titulo: t('adm.sidebar.panel'),
      links: [
        { to: "/dashboard/admin", icon: <FaHouse />, label: t('adm.sidebar.inicio') },
        {
          to: "/admin/notificaciones",
          icon: <FaBell />,
          label: t('adm.sidebar.notificaciones'),
          badge: pendientes,
        },
      ],
    },
    {
      titulo: t('adm.sidebar.gestion'),
      links: [
        { to: "/admin/catalogo", icon: <FaTags />, label: t('adm.sidebar.catalogo') },
        { to: "/admin/tecnicos", icon: <FaUserGear />, label: t('adm.sidebar.tecnicos') },
        { to: "/admin/instalaciones", icon: <FaCalendarCheck />, label: t('adm.sidebar.citas') },
        { to: "/admin/pedidos", icon: <FaBoxOpen />, label: t('adm.sidebar.pedidos') },
        { to: "/admin/clientes", icon: <FaUsers />, label: t('adm.sidebar.clientes') },
        { to: "/admin/proveedores", icon: <FaTruckField />, label: t('adm.sidebar.proveedores') },
      ],
    },
    {
      titulo: t('adm.sidebar.sistema'),
      links: [
        { to: "/admin/consultas", icon: <FaEnvelopeOpenText />, label: t('adm.sidebar.solicitudes') },
        { to: "/admin/devoluciones", icon: <FaRotateLeft />, label: t('adm.sidebar.devoluciones') },
        { to: "/admin/novedades", icon: <FaShieldHalved />, label: 'Historial de novedades' },
        { to: "/admin/reportes", icon: <FaChartColumn />, label: t('adm.sidebar.reportes') },
      ],
    },
  ];

  return (
    <aside className={`admin-sidebar ${open ? 'open' : ''}`}>
      <nav className="sidebar-nav" aria-label={t('adm.sidebar.menuAria')}>
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
                {link.badge ? <span className="sidebar-badge">{link.badge}</span> : null}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
};

export default AdminSidebar;