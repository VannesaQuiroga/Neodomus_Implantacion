import { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import api, { refreshAccessToken } from '@services/api';
import { tabGet, tabRemove, tabSet, rotateTabSessionId } from '../utils/tabStorage';
import { removeAvatar, removeTechnicalAvatar, removeAdminAvatar } from '../utils/profileStorage';

interface User {
  id: number;
  nombre: string;
  correo: string;
  rol: string;
}

interface AuthContextType {
  user: User | null;
  rol: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  passwordResetRequired: boolean;
  setPasswordResetRequired: (flag: boolean) => void;
  perfilIncompleto: boolean;
  marcarPerfilCompleto: () => void;
  login: (email: string, password: string) => Promise<void>;
  googleLogin: (credential: string) => Promise<void>;
  logout: () => void;
  refreshUserProfile: () => Promise<void>;
}

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user_type: string;
  rol?: string;
  role?: string;
  nombre?: string;
  first_name?: string;
  last_name?: string;
  id?: number;
  password_reset_required?: boolean;
  perfil_incompleto?: boolean;
}

interface ClientProfile {
  first_name: string;
  last_name: string;
  email: string;
  telefono_cliente?: number | null;
  address?: string | null;
  documento_cliente?: number | null;
  id_tipo_documento_c?: number | null;
}

interface EmployeeProfile {
  id_usuario: number;
  first_name: string;
  last_name: string;
  email: string;
  is_active?: boolean;
}

const PASSWORD_RESET_KEY = 'password_reset_required';
const PERFIL_INCOMPLETO_KEY = 'perfil_incompleto';

const ROLES_VALIDOS = ['administrador', 'admin', 'cliente', 'tecnico'];

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [rol, setRol] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordResetRequired, setPasswordResetRequiredState] = useState(
    () => tabGet(PASSWORD_RESET_KEY) === '1',
  );
  const [perfilIncompleto, setPerfilIncompletoState] = useState(
    () => tabGet(PERFIL_INCOMPLETO_KEY) === '1',
  );

  const setPasswordResetRequired = (flag: boolean) => {
    setPasswordResetRequiredState(flag);
    if (flag) {
      tabSet(PASSWORD_RESET_KEY, '1');
    } else {
      tabRemove(PASSWORD_RESET_KEY);
    }
  };

  const setPerfilIncompleto = (flag: boolean) => {
    setPerfilIncompletoState(flag);
    if (flag) {
      tabSet(PERFIL_INCOMPLETO_KEY, '1');
    } else {
      tabRemove(PERFIL_INCOMPLETO_KEY);
    }
  };

  const marcarPerfilCompleto = () => {
    setPerfilIncompleto(false);
  };

  const refreshUserProfile = async () => {
    try {
      // Base: usuario almacenado (no depende del estado capturado)
      let base: User | null = null;
      const storedRaw = tabGet('user');
      if (storedRaw) {
        try {
          base = JSON.parse(storedRaw) as User;
        } catch {
          base = null;
        }
      }
      // El backend identifica a los empleados (administrador, tecnico, etc.) con
      // su rol propio; solo los clientes usan "cliente".
      const isEmployee = (base?.rol || '') !== 'cliente';

      let firstName = '';
      let lastName = '';
      let email = base?.correo || '';
      let fotoUrl: string | null = null;
      if (isEmployee) {
        const res = await api.get<EmployeeProfile>('/users/me');
        const profile = res.data;
        firstName = profile.first_name || '';
        lastName = profile.last_name || '';
        email = profile.email || email;
        fotoUrl = (profile as any).foto_url ?? null;
      } else {
        const res = await api.get<ClientProfile>('/clients/me');
        const profile = res.data;
        firstName = profile.first_name || '';
        lastName = profile.last_name || '';
        email = profile.email || email;
        fotoUrl = (profile as any).foto_url ?? null;
        // Datos obligatorios que faltan (cuentas creadas con Google)
        const incompleto = !(
          profile.id_tipo_documento_c &&
          profile.documento_cliente &&
          profile.telefono_cliente &&
          (profile.address || '').trim()
        );
        setPerfilIncompleto(incompleto);
      }
      // Sincronizar foto de perfil desde el backend (fuente de verdad)
      if (fotoUrl) {
        const key = isEmployee ? 'technicalAvatar' : 'clientAvatar';
        const current = localStorage.getItem(key);
        if (current !== fotoUrl) {
          localStorage.setItem(key, fotoUrl);
          window.dispatchEvent(new CustomEvent(isEmployee ? 'technical-profile-updated' : 'client-profile-updated'));
        }
      }
      const firstNameResolved = firstName || base?.nombre?.split(' ')[0] || '';
      const lastNameResolved = lastName || (base?.nombre?.split(' ').slice(1).join(' ') || '');
      const fullName = (firstNameResolved && lastNameResolved) ? `${firstNameResolved} ${lastNameResolved}` : (firstNameResolved || base?.nombre || '');
      const updatedUser: User = {
        id: base?.id ?? 0,
        nombre: fullName.trim(),
        correo: email,
        rol: base?.rol || '',
      };
      tabSet('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
      if (updatedUser.rol) setRol(updatedUser.rol);
    } catch (error) {
      console.error('Error refreshing user profile:', error);
    }
  };

  useEffect(() => {
    // Flag global: mientras dura la validación inicial, el interceptor y el
    // listener de neodomus:sesion-expirada NO deben cerrar sesión.  Sin esto,
    // si el access_token expiró (60 min), el interceptor llama clearSession()
    // → dispara neodomus:sesion-expirada → el listener limpia el estado React
    // ANTES de que validarSesionInicial termine de intentar el refresh.
    (window as any).__neodomus_validando_sesion = true;

    const validarSesionInicial = async () => {
      const storedUser = tabGet('user');
      if (!storedUser) return;
      let base: User | null = null;
      try {
        base = JSON.parse(storedUser) as User;
      } catch {
        tabRemove('user');
        return;
      }
      try {
        const ses = await api.get('/auth/session');
        const rolRecordado = (base.rol || '').toLowerCase();
        const esCliente = rolRecordado === 'cliente';
        const esAdmin = rolRecordado === 'admin' || rolRecordado === 'administrador';
        const sesTipo = ses.data?.user_type;
        const sesRol = String(ses.data?.rol || '').toLowerCase();
        const tipoCoincide = esCliente ? sesTipo === 'client' : sesTipo === 'employee';
        const rolesEquivalentes =
          esAdmin
            ? sesRol === 'admin' || sesRol === 'administrador'
            : rolRecordado === '' || sesRol === rolRecordado;
        if (!tipoCoincide || (sesTipo !== 'client' && !rolesEquivalentes)) {
          throw new Error('La sesión pertenece a otra cuenta');
        }
        setUser(base);
        setRol(base.rol);
        setIsAuthenticated(true);
        refreshUserProfile();
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 401) {
          // Access token expiró: intentar refrescar antes de cerrar sesión
          const resultado = await refreshAccessToken();
          if (resultado.ok) {
            try {
              const ses2 = await api.get('/auth/session');
              const rolRecordado = (base.rol || '').toLowerCase();
              const esCliente = rolRecordado === 'cliente';
              const esAdmin = rolRecordado === 'admin' || rolRecordado === 'administrador';
              const sesTipo = ses2.data?.user_type;
              const sesRol = String(ses2.data?.rol || '').toLowerCase();
              const tipoCoincide = esCliente ? sesTipo === 'client' : sesTipo === 'employee';
              const rolesEquivalentes =
                esAdmin
                  ? sesRol === 'admin' || sesRol === 'administrador'
                  : rolRecordado === '' || sesRol === rolRecordado;
              if (!tipoCoincide || (sesTipo !== 'client' && !rolesEquivalentes)) {
                throw new Error('La sesión pertenece a otra cuenta');
              }
              setUser(base);
              setRol(base.rol);
              setIsAuthenticated(true);
              refreshUserProfile();
              return;
            } catch {
              // Refresh funcionó pero la sesión sigue inválida
            }
          }
          // Solo cerrar sesión si el refresh token es inválido (401).
          // Si es error de red (backend reiniciándose), mantener la sesión
          // para que al recargar la página siga viva.
          if (resultado.authError) {
            ['user', 'access_token', 'refresh_token', PASSWORD_RESET_KEY, PERFIL_INCOMPLETO_KEY].forEach(
              (k) => tabRemove(k),
            );
            setUser(null);
            setRol(null);
            setIsAuthenticated(false);
          } else {
            // Error de red: confiar en los datos almacenados
            setUser(base);
            setRol(base.rol);
            setIsAuthenticated(true);
          }
        } else if (err?.message === 'La sesión pertenece a otra cuenta') {
          ['user', 'access_token', 'refresh_token', PASSWORD_RESET_KEY, PERFIL_INCOMPLETO_KEY].forEach(
            (k) => tabRemove(k),
          );
          setUser(null);
          setRol(null);
          setIsAuthenticated(false);
        } else {
          setUser(base);
          setRol(base.rol);
          setIsAuthenticated(true);
        }
      }
    };
    validarSesionInicial().finally(() => {
      (window as any).__neodomus_validando_sesion = false;
      setLoading(false);
    });

    // Auto-corrección multi-pestaña: si otra pestaña inició sesión con otra
    // cuenta, las cookies (compartidas) cambian y los endpoints de esta
    // pestaña devuelven 401/403. El hook de notificaciones dispara este
    // evento y aquí se re-sincroniza el rol recordado con la cookie real.
    const revalidar = () => {
      validarSesionInicial().finally(() => setLoading(false));
    };
    window.addEventListener('neodomus:revalidar-sesion', revalidar);

    // Cuando el interceptor detecta token expirado y no puede refrescar,
    // dispara este evento para limpiar el estado React sin redirigir
    // agresivamente (la redirección la maneja RoleRoute).
    const onSesionExpirada = () => {
      if ((window as any).__neodomus_validando_sesion) return;
      setUser(null);
      setRol(null);
      setIsAuthenticated(false);
    };
    window.addEventListener('neodomus:sesion-expirada', onSesionExpirada);

    return () => {
      window.removeEventListener('neodomus:revalidar-sesion', revalidar);
      window.removeEventListener('neodomus:sesion-expirada', onSesionExpirada);
    };
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await api.post<LoginResponse>('/auth/login', { email, password });
      const data = response.data;
      const userRol = (data.rol || data.role || '').toLowerCase();
      if (!userRol || !ROLES_VALIDOS.includes(userRol)) {
        throw new Error('La cuenta no tiene un rol válido asignado. Contacta al administrador.');
      }
      // Rotar SOLO tras un login exitoso: si las credenciales eran inválidas,
      // esta pestaña conserva cualquier sesión heredada de otra pestaña.
      rotateTabSessionId();
      // Almacenar tokens por pestaña para soporte multi-pestaña.
      // Cada pestaña usa sus propios tokens via Authorization header.
      tabSet('access_token', data.access_token);
      tabSet('refresh_token', data.refresh_token);

      // Usar first_name y last_name del API si están disponibles, sino fallback a nombre o email
      const firstName = data.first_name || '';
      const lastName = data.last_name || '';
      const fullName = (firstName && lastName) ? `${firstName} ${lastName}` : (data.nombre || email.split('@')[0]);
      
      const userData: User = {
        id: data.id || 0,
        nombre: fullName.trim(),
        correo: email,
        rol: userRol,
      };
      tabSet('user', JSON.stringify(userData));
      setUser(userData);
      setRol(userRol);
      setIsAuthenticated(true);
      setPasswordResetRequiredState(data.password_reset_required === true);
      if (data.password_reset_required === true) {
        tabSet(PASSWORD_RESET_KEY, '1');
      } else {
        tabRemove(PASSWORD_RESET_KEY);
      }
      setPerfilIncompleto(Boolean(data.perfil_incompleto));

      // Limpiar avatares de usuarios anteriores en este navegador.
      // Cada usuario tiene su propia foto de perfil; no debe mostrarse
      // la del anterior.
      removeAvatar();
      removeTechnicalAvatar();
      removeAdminAvatar();

      // Obtener nombre real del perfil
      await refreshUserProfile();
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const googleLogin = async (credential: string) => {
    try {
      const response = await api.post<LoginResponse>('/auth/google', { credential });
      const data = response.data;
      const userRol = (data.rol || data.role || 'cliente').toLowerCase();
      if (!userRol || !ROLES_VALIDOS.includes(userRol)) {
        throw new Error('La cuenta no tiene un rol válido asignado. Contacta al administrador.');
      }
      rotateTabSessionId();
      // Almacenar tokens por pestaña para soporte multi-pestaña.
      tabSet('access_token', data.access_token);
      tabSet('refresh_token', data.refresh_token);

      const firstName = data.first_name || '';
      const lastName = data.last_name || '';
      const fullName = (firstName && lastName) ? `${firstName} ${lastName}` : (data.nombre || 'Usuario Google');

      const userData: User = {
        id: data.id || 0,
        nombre: fullName.trim(),
        correo: '',
        rol: userRol,
      };
      tabSet('user', JSON.stringify(userData));
      setUser(userData);
      setRol(userRol);
      setIsAuthenticated(true);
      setPasswordResetRequiredState(data.password_reset_required === true);
      if (data.password_reset_required === true) {
        tabSet(PASSWORD_RESET_KEY, '1');
      } else {
        tabRemove(PASSWORD_RESET_KEY);
      }
      setPerfilIncompleto(Boolean(data.perfil_incompleto));
      removeAvatar();
      removeTechnicalAvatar();
      removeAdminAvatar();
      await refreshUserProfile();
    } catch (error) {
      console.error('Google login error:', error);
      throw error;
    }
  };

  const logout = () => {
    // Cierra la sesión en el servidor (elimina las cookies HttpOnly).
    api.post('/auth/logout').catch(() => {
      /* noop: el cierre local procede igual */
    });
    // Rotar el id de sesión PRIMERO: si esta pestaña heredó el id de otra
    // (abierta por ctrl+click), las claves que se limpian serán las del id
    // nuevo (vacío) y la sesión de la otra pestaña queda intacta.
    rotateTabSessionId();
    tabRemove('access_token');
    tabRemove('refresh_token');
    tabRemove('user');
    tabRemove(PASSWORD_RESET_KEY);
    tabRemove(PERFIL_INCOMPLETO_KEY);
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
    setRol(null);
    setIsAuthenticated(false);
    setPasswordResetRequiredState(false);
    setPerfilIncompletoState(false);
  };

  return (
    <AuthContext.Provider value={{ user, rol, isAuthenticated, loading, passwordResetRequired, setPasswordResetRequired, perfilIncompleto, marcarPerfilCompleto, login, googleLogin, logout, refreshUserProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};