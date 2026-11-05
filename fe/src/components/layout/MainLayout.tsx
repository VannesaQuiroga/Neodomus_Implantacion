// Componente de navegación y estructura visual: MainLayout. Se reutiliza en las pantallas de su área.
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import AmbientBackground from './AmbientBackground';

const MainLayout = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AmbientBackground />
      <Navbar />
      <main style={{ flex: 1 }}>
        {/* El Outlet renderiza la página que corresponda según la ruta */}
        <Outlet />
      </main>
      <Footer />
    </div>
  );
};

export default MainLayout;
