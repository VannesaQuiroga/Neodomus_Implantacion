// Espera a que termine la carga de sesión; permite la ruta interna o redirige al acceso.
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@contexts/AuthContext';

const PrivateRoute = () => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div>Cargando...</div>;
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

export default PrivateRoute;