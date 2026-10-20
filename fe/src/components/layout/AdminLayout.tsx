// Componente de navegación y estructura visual: AdminLayout. Se reutiliza en las pantallas de su área.
import { Outlet, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import AmbientBackground from './AmbientBackground';
import AdminNavbar from './AdminNavbar';
import AdminSidebar from './AdminSidebar';
import AdminFooter from './AdminFooter';
import { useAdminNotificaciones } from '../../hooks/useAdminNotificaciones';
import { useAuth } from '@contexts/AuthContext';
import '@styles/admin-panel.css';

// registra escuchas de eventos para sincronizar la vista.
const AdminLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { notificaciones, cargando, noLeidas, recargar, marcarLeida } = useAdminNotificaciones();
  const { passwordResetRequired } = useAuth();

  useEffect(() => {
    const onSolicitudesUpdated = () => {
      recargar();
    };
    window.addEventListener('admin-solicitudes-updated', onSolicitudesUpdated);
    return () => window.removeEventListener('admin-solicitudes-updated', onSolicitudesUpdated);
  }, [recargar]);

  const cerrarSidebar = () => setSidebarOpen(false);

  if (passwordResetRequired) {
    return <Navigate to="/cambiar-password-obligatorio" replace />;
  }

  return (
    <div className="admin-layout">
      <AmbientBackground />

      <AdminNavbar
        onMenuToggle={() => setSidebarOpen((v) => !v)}
        notificaciones={notificaciones}
        cargandoNotificaciones={cargando}
        marcarLeida={marcarLeida}
      />

      <div className="admin-body">
        <div
          className={`admin-backdrop ${sidebarOpen ? 'show' : ''}`}
          onClick={cerrarSidebar}
          aria-hidden="true"
        />
        <AdminSidebar
          open={sidebarOpen}
          pendientes={noLeidas}
          onNavigate={cerrarSidebar}
        />
        <main className="admin-content">
          <Outlet />
        </main>
      </div>

      <AdminFooter />
    </div>
  );
};

export default AdminLayout;
