// Restringe la navegación al rol permitido y redirige al espacio correspondiente del usuario.
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';

export type Rol = 'cliente' | 'administrador' | 'tecnico';

const RUTA_POR_ROL: Record<Rol, string> = {
  cliente: '/productos',
  administrador: '/dashboard/admin',
  tecnico: '/dashboard/tecnico',
};

interface RoleRouteProps {
  allowed: Rol[];
}

/**
 * Guard de separación de roles: valida en cada navegación (incluido atrás/adelante
 * del navegador) que el usuario autenticado tenga el rol permitido para la ruta.
 * Si no coincide, redirige al contexto del propio rol.
 */
const RoleRoute = ({ allowed }: RoleRouteProps) => {
  const { isAuthenticated, loading, rol } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="ap-loader-page">Cargando...</div>;
  }

  if (!isAuthenticated || !rol) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const rolOriginal = rol.toLowerCase();
  const rolNormalizado: Rol = rolOriginal === 'admin' ? 'administrador' : (rolOriginal as Rol);
  if (!allowed.includes(rolNormalizado)) {
    const destino = RUTA_POR_ROL[rolNormalizado] ?? '/productos';
    return <Navigate to={destino} replace />;
  }

  return <Outlet />;
};

export default RoleRoute;