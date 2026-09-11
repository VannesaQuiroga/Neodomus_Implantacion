// src/App.tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import RoleRoute from '@components/layout/RoleRoute';
import ScrollToTop from '@components/layout/ScrollToTop';
import AuthModalHost from '@components/auth/AuthModalHost';
import CompletarDatosModal from '@components/auth/CompletarDatosModal';
import AuthRouteBridge from '@components/auth/AuthRouteBridge';
import ChatBotWidget from '@components/chat/ChatBotWidget';
import { useAuth } from '@contexts/AuthContext';
import { ProtectedRoute } from '@components/common/ProtectedRoute';
import HomePage from '@pages/Home/Home';
import InfoSectionsContainer from '@pages/Home/InfoSectionsContainer';
import ChangePassword from '@pages/auth/ChangePassword';
import ClientDashboard from '@pages/cliente/ClientDashboard';
import AdminDashboard from '@pages/admin/AdminDashboard';
import TechnicianDashboard from '@pages/tecnico/TechnicianDashboard';
import Perfil from '@pages/cliente/Perfil';
import TecnicosPage from '@pages/cliente/TecnicosPage';
import CitasPage from '@pages/cliente/CitasPage';
import AyudaPage from '@pages/cliente/AyudaPage';
import AdminPerfil from '@pages/admin/AdminPerfil';
import AdminNotificaciones from '@pages/admin/AdminNotificaciones';
import AdminProductos from '@pages/admin/AdminProductos';
import AdminProductoDetalle from '@pages/admin/AdminProductoDetalle';
import AdminCatalogo from '@pages/admin/AdminCatalogo';
import AdminTecnicos from '@pages/admin/AdminTecnicos';
import AdminInstalaciones from '@pages/admin/AdminInstalaciones';
import AdminPedidos from '@pages/admin/AdminPedidos';
import AdminFacturas from '@pages/admin/AdminFacturas';
import AdminConsultas from '@pages/admin/AdminConsultas';
import AdminClientes from '@pages/admin/AdminClientes';
import AdminProveedores from '@pages/admin/AdminProveedores';
import AdminReportes from '@pages/admin/AdminReportes';
import TecnicoPerfil from '@pages/tecnico/TecnicoPerfil';
import TecnicoCitas from '@pages/tecnico/TecnicoCitas';
import TecnicoHistorial from '@pages/tecnico/TecnicoHistorial';
import TecnicoClientes from '@pages/tecnico/TecnicoClientes';
import TecnicoMensajes from '@pages/tecnico/TecnicoMensajes';
import TecnicoDevoluciones from '@pages/tecnico/TecnicoDevoluciones';
import Calificaciones from '@pages/tecnico/Calificaciones';
import TechnicianEntregas from '@pages/tecnico/TechnicianEntregas';
import AdminDevoluciones from '@pages/admin/AdminDevoluciones';
import AdminNovedades from '@pages/admin/AdminNovedades';
import TecnicoNovedades from '@pages/tecnico/TecnicoNovedades';
import ClienteNovedades from '@pages/cliente/ClienteNovedades';
import ProductosPublicos from '@pages/public/ProductosPublicos';
import ProductoDetalle from '@pages/public/ProductoDetalle';
import CarritoPage from '@pages/public/CarritoPage';
import CheckoutPage from '@pages/public/CheckoutPage';
import Notificaciones from '@pages/public/Notificaciones';
import TerminosUso from '@pages/legal/TerminosUso';
import PoliticaPrivacidad from '@pages/legal/PoliticaPrivacidad';
import PoliticaCookies from '@pages/legal/PoliticaCookies';
import Contacto from '@pages/legal/Contacto';
import MainLayout from './components/layout/MainLayout';
import AdminLayout from './components/layout/AdminLayout';
import TechnicianLayout from './components/layout/TechnicianLayout';
import CambioPasswordObligatorio from '@pages/auth/CambioPasswordObligatorio';

const ChatBotGate = () => {
  const { rol, loading } = useAuth();
  if (loading) return null;
  if (rol === 'administrador' || rol === 'tecnico' || rol === 'empleado') return null;
  return <ChatBotWidget />;
};

function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        {/* ── Público / visitante ─────────────────────────── */}
        <Route element={<MainLayout />}>
          <Route path="/" element={<ProductosPublicos />} />
          <Route path="/productos" element={<ProductosPublicos />} />
          <Route path="/producto/:id" element={<ProductoDetalle />} />
          <Route path="/carrito" element={<CarritoPage />} />
          <Route path="/checkout" element={<ProtectedRoute allowedRoles={['cliente']}><CheckoutPage /></ProtectedRoute>} />
          <Route path="/dashboard/cliente" element={<ProtectedRoute allowedRoles={['cliente']}><ClientDashboard /></ProtectedRoute>} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/info" element={<InfoSectionsContainer />} />
          <Route path="/ayuda" element={<AyudaPage />} />
          <Route path="/terminos" element={<TerminosUso />} />
          <Route path="/privacidad" element={<PoliticaPrivacidad />} />
          <Route path="/cookies" element={<PoliticaCookies />} />
          <Route path="/contacto" element={<Contacto />} />
          <Route path="/notificaciones" element={<Notificaciones />} />

          <Route path="/login" element={<AuthRouteBridge step="ingresar" />} />
          <Route path="/register" element={<AuthRouteBridge step="registro" />} />
          <Route path="/forgot-password" element={<AuthRouteBridge step="recuperar" />} />
          <Route path="/verify-code" element={<AuthRouteBridge step="verificar-codigo" />} />
          <Route path="/reset-password" element={<AuthRouteBridge step="restablecer" />} />
          <Route path="/verify-email" element={<AuthRouteBridge step="verificar-email" />} />
        </Route>

        {/* ── Cambio de contraseña obligatorio (técnico/admin) ── */}
        <Route path="/cambiar-password-obligatorio" element={<CambioPasswordObligatorio />} />

        {/* ── Cliente (contexto usuario) ──────────────────── */}
        <Route element={<RoleRoute allowed={['cliente']} />}>
          <Route element={<MainLayout />}>
            <Route path="/perfil" element={<Perfil />} />
            <Route path="/cliente/tecnicos" element={<TecnicosPage />} />
            <Route path="/cliente/citas" element={<CitasPage />} />
            <Route path="/cliente/novedades" element={<ClienteNovedades />} />
            <Route path="/cliente/ayuda" element={<AyudaPage />} />
            <Route path="/cambiar-password" element={<ChangePassword />} />
          </Route>
        </Route>

        {/* ── Técnico (contexto técnico) ──────────────────── */}
        <Route element={<RoleRoute allowed={['tecnico']} />}>
          <Route element={<TechnicianLayout />}>
            <Route path="/dashboard/tecnico" element={<TechnicianDashboard />} />
            <Route path="/perfil/tecnico" element={<TecnicoPerfil />} />
            <Route path="/tecnico/citas" element={<TecnicoCitas />} />
            <Route path="/tecnico/historial" element={<TecnicoHistorial />} />
            <Route path="/tecnico/clientes" element={<TecnicoClientes />} />
            <Route path="/tecnico/mensajes" element={<TecnicoMensajes />} />
            <Route path="/tecnico/calificaciones" element={<Calificaciones />} />
            <Route path="/tecnico/entregas" element={<TechnicianEntregas />} />
            <Route path="/tecnico/devoluciones" element={<TecnicoDevoluciones />} />
            <Route path="/tecnico/novedades" element={<TecnicoNovedades />} />
          </Route>
        </Route>

        {/* ── Administrador (contexto admin) ──────────────── */}
        <Route element={<RoleRoute allowed={['administrador']} />}>
          <Route element={<AdminLayout />}>
            <Route path="/dashboard/admin" element={<AdminDashboard />} />
            <Route path="/perfil/admin" element={<AdminPerfil />} />
            <Route path="/admin/notificaciones" element={<AdminNotificaciones />} />
            <Route path="/admin/productos" element={<AdminProductos />} />
            <Route path="/admin/productos/nuevo" element={<AdminProductoDetalle />} />
            <Route path="/admin/productos/:id" element={<AdminProductoDetalle />} />
            <Route path="/admin/catalogo" element={<AdminCatalogo />} />
            <Route path="/admin/tecnicos" element={<AdminTecnicos />} />
            <Route path="/admin/instalaciones" element={<AdminInstalaciones />} />
<Route path="/admin/pedidos" element={<AdminPedidos />} />
<Route path="/admin/facturas" element={<AdminFacturas />} />
            <Route path="/admin/consultas" element={<AdminConsultas />} />
<Route path="/admin/devoluciones" element={<AdminDevoluciones />} />
            <Route path="/admin/novedades" element={<AdminNovedades />} />
            <Route path="/admin/clientes" element={<AdminClientes />} />
            <Route path="/admin/proveedores" element={<AdminProveedores />} />
            <Route path="/admin/reportes" element={<AdminReportes />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <AuthModalHost />
      <CompletarDatosModal />
      <ChatBotGate />
    </>
  );
}

export default App;