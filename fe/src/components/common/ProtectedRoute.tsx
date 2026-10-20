// Controla el acceso a las rutas protegidas según el estado de autenticación.
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

export const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { isAuthenticated, loading, rol } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="ap-loader-page">Cargando...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (allowedRoles && (!rol || !allowedRoles.includes(rol))) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};