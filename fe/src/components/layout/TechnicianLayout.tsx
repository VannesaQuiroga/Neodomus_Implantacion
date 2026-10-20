// Componente de navegación y estructura visual: TechnicianLayout. Se reutiliza en las pantallas de su área.
import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import AmbientBackground from './AmbientBackground';
import TechnicianNavbar from './TechnicianNavbar';
import TechnicianSidebar from './TechnicianSidebar';
import AdminFooter from './AdminFooter';
import PasswordResetModal from '@components/profile/PasswordResetModal';
import { useAuth } from '@contexts/AuthContext';
import '@styles/admin-panel.css';

const TechnicianLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { passwordResetRequired } = useAuth();

  const cerrarSidebar = () => setSidebarOpen(false);

  return (
    <div className="admin-layout">
      <AmbientBackground />

      <TechnicianNavbar onMenuToggle={() => setSidebarOpen((v) => !v)} />

      <div className="admin-body">
        <div
          className={`admin-backdrop ${sidebarOpen ? 'show' : ''}`}
          onClick={cerrarSidebar}
          aria-hidden="true"
        />

        <TechnicianSidebar open={sidebarOpen} onNavigate={cerrarSidebar} />

        <main className="admin-content">
          <Outlet />
        </main>
      </div>

      <AdminFooter />

      {passwordResetRequired && <PasswordResetModal />}
    </div>
  );
};

export default TechnicianLayout;
