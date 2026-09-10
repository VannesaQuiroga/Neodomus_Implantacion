import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@contexts/AuthContext';
import { useIdioma } from '@i18n/IdiomaContext';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  FaUserPen, FaLock, FaBox, FaStar, FaScrewdriverWrench,
  FaFileInvoice, FaGlobe, FaBell, FaXmark, FaCheck,
  FaCamera, FaUser, FaHeart, FaUserSlash, FaHourglassHalf,
  FaTrashCan, FaMoneyBillWave, FaCalendarCheck,
} from 'react-icons/fa6';
import type { ReactNode } from 'react';
import '@styles/perfil-cliente.css';
import { tabGet, tabSet } from '@utils/tabStorage';

import SectionHeader from '@components/profile/SectionHeader';
import PerfilCuenta from '@components/profile/PerfilCuenta';

import ReembolsosCliente from '@components/profile/ReembolsosCliente';
import OrdersTab from '@components/profile/OrdersTab';
import ServiciosTab from '@components/profile/ServiciosTab';
import ReviewsTab from '@components/profile/ReviewsTab';
import TechniciansTab from '@components/profile/TechniciansTab';
import FacturasTab from '@components/profile/FacturasTab';
import LanguageTab from '@components/profile/LanguageTab';
import NotificationsTab from '@components/profile/NotificationsTab';
import PasswordTab from '@components/profile/PasswordTab';

import { getAvatar, getIniciales, getMensajes, PF_AVATAR_KEY, removeAvatar } from '@utils/profileStorage';
import api from '@services/api';
import { useFavoritos } from '@utils/favoritos';

interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
  badge?: number;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

type ToastState = { msg: string; tipo: 'success' | 'error' | 'info' } | null;

interface ClientProfile {
  first_name: string;
  last_name: string;
  email: string;
  id_tipo_documento_c?: number | null;
  documento_cliente?: number | null;
  telefono_cliente?: number | null;
  address?: string | null;
}

interface Producto {
  id_producto: number;
  nombre_producto: string;
  precio_venta_producto: number;
  imagen_url?: string | null;
  id_cate_pr?: number;
  nombre_categoria?: string;
}

type TabId = 'perfil' | 'contrasena' | 'pedidos' | 'servicios' | 'resenas' | 'tecnicos' | 'facturas' | 'idioma' | 'notificaciones' | 'favoritos' | 'reembolsos';

const Perfil = () => {
  const { user, refreshUserProfile } = useAuth();
  const { t } = useIdioma();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as TabId) || 'perfil';
  const [activo, setActivo] = useState<TabId>(initialTab);
  const [toast, setToast] = useState<ToastState>(null);
  const [tick, setTick] = useState(0);
  const [confirmarInhabilitar, setConfirmarInhabilitar] = useState(false);
  const [enviandoSolicitud, setEnviandoSolicitud] = useState(false);
  const [solicitudEstado, setSolicitudEstado] = useState<string | null>(null);
  const [motivoSolicitud, setMotivoSolicitud] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estado para favoritos
  const { favoritos, quitarFavorito } = useFavoritos();
  const [productosFavoritos, setProductosFavoritos] = useState<Producto[]>([]);
  const [favoritosLoading, setFavoritosLoading] = useState(true);

  // Estado para edición de perfil
  const [avatar, setAvatarState] = useState<string | null>(getAvatar());
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [email, setEmail] = useState('');
  const [emailOriginal, setEmailOriginal] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState('');
  const [documento, setDocumento] = useState('');

  useEffect(() => {
    const sync = () => setTick((t) => t + 1);
    window.addEventListener('client-profile-updated', sync);
    return () => window.removeEventListener('client-profile-updated', sync);
  }, []);

  useEffect(() => {
    const savedAvatar = getAvatar();
    setAvatarState(savedAvatar);
  }, []);

  // Cargar productos favoritos
  useEffect(() => {
    const fetchFavoritos = async () => {
      if (favoritos.size === 0) {
        setProductosFavoritos([]);
        setFavoritosLoading(false);
        return;
      }
      setFavoritosLoading(true);
      try {
        const res = await api.get('/productos/?limit=100');
        const productosArray = res.data.data || [];
        const favoritosFiltrados = productosArray.filter((p: Producto) => favoritos.has(p.id_producto));
        setProductosFavoritos(favoritosFiltrados);
      } catch (err) {
        console.error('Error cargando favoritos:', err);
        setProductosFavoritos([]);
      } finally {
        setFavoritosLoading(false);
      }
    };
    fetchFavoritos();
  }, [favoritos]);

  // Cargar datos del perfil desde API
  useEffect(() => {
    const syncFromContext = () => {
      const partes = (user?.nombre || '').trim().split(' ');
      setNombre(partes[0] || '');
      setApellido(partes.slice(1).join(' ') || '');
      setEmail(user?.correo || '');
      setEmailOriginal(user?.correo || '');
    };
    syncFromContext();

    api
      .get<ClientProfile>('/clients/me')
      .then((res) => {
        setNombre(res.data.first_name || '');
        setApellido(res.data.last_name || '');
        setEmail(res.data.email || '');
        setEmailOriginal(res.data.email || '');
        setTelefono(res.data.telefono_cliente ? String(res.data.telefono_cliente) : '');
        setDireccion(res.data.address || '');
        setTipoDocumento(
          res.data.id_tipo_documento_c ? String(res.data.id_tipo_documento_c) : '',
        );
        setDocumento(
          res.data.documento_cliente ? String(res.data.documento_cliente) : '',
        );
      })
      .catch((err) => {
        if (err.response?.status === 403) syncFromContext();
      });
  }, [user]);

  const noLeidas = useMemo(() => getMensajes().filter((m) => !m.leido).length, [tick]);

  const notify = (msg: string, tipo: 'success' | 'error' | 'info' = 'success') => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3200);
  };

  const nombreCompleto = user?.nombre || 'Nombre Apellido';
  const correoUsuario = user?.correo || 'correo@ejemplo.com';

  const grupos: NavGroup[] = useMemo(
    () => [
      {
        label: t('perfil.cuenta'),
        items: [
          { id: 'perfil', label: t('perfil.miPerfil'), icon: <FaUser /> },
          { id: 'contrasena', label: t('perfil.cambiarContrasena'), icon: <FaLock /> },
        ],
      },
      {
        label: t('perfil.miActividad'),
        items: [
          { id: 'pedidos', label: t('perfil.misPedidos'), icon: <FaBox /> },
          { id: 'servicios', label: t('perfil.misServicios'), icon: <FaCalendarCheck /> },
          { id: 'favoritos', label: t('perfil.misFavoritos'), icon: <FaHeart /> },
          { id: 'reembolsos', label: t('perfil.misReembolsos'), icon: <FaMoneyBillWave /> },
          { id: 'resenas', label: t('perfil.misResenas'), icon: <FaStar /> },
          { id: 'tecnicos', label: t('perfil.misTecnicos'), icon: <FaScrewdriverWrench /> },
        ],
      },
      {
        label: t('perfil.preferencias'),
        items: [
          { id: 'facturas', label: t('perfil.misFacturas'), icon: <FaFileInvoice /> },
          { id: 'idioma', label: t('perfil.idioma'), icon: <FaGlobe /> },
          { id: 'notificaciones', label: t('perfil.notificaciones'), icon: <FaBell /> },
        ],
      },
    ],
    [noLeidas, t]
  );

  const tituloSeccion = useMemo(() => {
    for (const g of grupos) {
      const item = g.items.find((i) => i.id === activo);
      if (item) return item.label;
    }
    return t('perfil.miPerfil');
  }, [grupos, activo, t]);

  // Estado de la solicitud de inhabilitación
  useEffect(() => {
    api
      .get<{ estado: string }>('/clients/me/cuenta-solicitud')
      .then((res) => setSolicitudEstado(res.data.estado))
      .catch(() => setSolicitudEstado(null));
  }, []);

  const handleSolicitarInhabilitacion = async () => {
    if (!motivoSolicitud.trim()) {
      notify('Debes indicar el motivo de la inhabilitación', 'error');
      return;
    }
    setEnviandoSolicitud(true);
    try {
      await api.post('/clients/me/cuenta-solicitud', {
        tipo: 'inhabilitar',
        motivo: motivoSolicitud.trim(),
      });
      setSolicitudEstado('pendiente');
      setConfirmarInhabilitar(false);
      setMotivoSolicitud('');
      notify('Solicitud de inhabilitación enviada al administrador', 'success');
    } catch (err: any) {
      console.error(err);
      notify(err.response?.data?.detail || 'No se pudo enviar la solicitud', 'error');
      setConfirmarInhabilitar(false);
    } finally {
      setEnviandoSolicitud(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      notify('La imagen debe pesar menos de 5 MB', 'error');
      return;
    }
    try {
      const formData = new FormData();
      formData.append('archivo', file);
      const res = await api.post('/clients/me/foto', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const url = res.data?.foto_url;
      if (url) {
        setAvatarState(url);
        localStorage.setItem(PF_AVATAR_KEY, url);
        window.dispatchEvent(new CustomEvent('client-profile-updated'));
      }
      notify('Foto de perfil actualizada', 'success');
    } catch (err: any) {
      notify(err.response?.data?.detail || 'No se pudo subir la foto', 'error');
    }
  };

  const handleEliminarFoto = () => {
    setAvatarState(null);
    removeAvatar();
    notify(t('perfil.fotoEliminada'), 'success');
  };

  const guardarCampo = async (payload: Record<string, unknown>) => {
    try {
      const body: Record<string, unknown> = { ...payload };
      const tel = String(body.telefono_cliente ?? '').replace(/\D/g, '');
      body.telefono_cliente = tel ? parseInt(tel, 10) : null;
      const doc = String(body.documento_cliente ?? '').replace(/\D/g, '');
      body.documento_cliente = doc ? parseInt(doc, 10) : null;
      body.id_tipo_documento_c = body.id_tipo_documento_c
        ? parseInt(String(body.id_tipo_documento_c), 10)
        : null;
      await api.put('/clients/me', body);
      const storedUser = tabGet('user');
      if (storedUser) {
        try {
          const parsed = JSON.parse(storedUser);
          if (typeof body.first_name === 'string' && typeof body.last_name === 'string') {
            parsed.nombre = `${body.first_name.trim()} ${body.last_name.trim()}`.trim();
          }
          tabSet('user', JSON.stringify(parsed));
        } catch {
          /* noop */
        }
      }
      if (typeof body.first_name === 'string' && typeof body.last_name === 'string') {
        setNombre(body.first_name.trim());
        setApellido(body.last_name.trim());
      }
      setTelefono(tel);
      setDireccion(String(body.address ?? '').trim());
      setDocumento(doc);
      setTipoDocumento(body.id_tipo_documento_c ? String(body.id_tipo_documento_c) : '');
      window.dispatchEvent(new CustomEvent('client-profile-updated'));
      await refreshUserProfile();
      notify(t('perfil.cambiosGuardados'), 'success');
      return true;
    } catch (err: any) {
      console.error(err);
      const msg = err.response?.data?.detail;
      notify(typeof msg === 'string' ? msg : t('perfil.errorGuardar'), 'error');
      return false;
    }
  };

  const renderPerfilTab = () => (
    <div className="pf-tab">
      <SectionHeader
        icon={<FaUserPen />}
        title={t('perfil.miPerfil')}
        subtitle={t('perfil.perfilTabSub')}
      />

      <div className="pf-avatar-zone">
        <div className="pf-avatar-big">
          {avatar ? (
            <img src={avatar} alt={t('perfil.fotoPerfil')} />
          ) : (
            <span className="pf-avatar-iniciales" aria-hidden="true">{getIniciales(nombreCompleto)}</span>
          )}
          <button
            type="button"
            className="pf-avatar-camera"
            aria-label={t('perfil.cambiarFotoAria')}
            onClick={() => fileInputRef.current?.click()}
          >
            <FaCamera />
          </button>
        </div>
        <div className="pf-avatar-text">
          <strong>{t('perfil.fotoPerfil')}</strong>
          <span>{t('perfil.fotoPerfilHint')}</span>
          <button
            type="button"
            className="pf-btn pf-btn-ghost"
            onClick={() => fileInputRef.current?.click()}
          >
            <FaCamera /> {t('perfil.cambiarFoto')}
          </button>
          {avatar && (
            <button type="button" className="pf-btn pf-btn-danger" onClick={handleEliminarFoto}>
              <FaTrashCan /> {t('perfil.eliminarFoto')}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleAvatarChange}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      <PerfilCuenta
        campos={[
          {
            clave: 'first_name',
            label: t('perfil.nombre'),
            valor: nombre,
            placeholder: t('perfil.placeholderNombre'),
            requerido: true,
            bloquearPortapapeles: true,
          },
          {
            clave: 'last_name',
            label: t('perfil.apellidos'),
            valor: apellido,
            placeholder: t('perfil.placeholderApellidos'),
            requerido: true,
            bloquearPortapapeles: true,
          },
          {
            clave: 'id_tipo_documento_c',
            label: t('perfil.tipoDocumento'),
            valor: tipoDocumento,
            tipo: 'select',
            opciones: [
              { valor: '1', etiqueta: 'CC - Cédula de ciudadanía' },
              { valor: '2', etiqueta: 'CE - Cédula de extranjería' },
            ],
          },
          {
            clave: 'documento_cliente',
            label: t('perfil.numeroDocumento'),
            valor: documento,
            tipo: 'tel',
            maxLength: 10,
            placeholder: t('perfil.placeholderDocumento'),
            bloquearPortapapeles: true,
          },
          {
            clave: 'telefono_cliente',
            label: t('perfil.telefono'),
            valor: telefono,
            tipo: 'tel',
            maxLength: 10,
            placeholder: t('perfil.placeholderTelefono'),
            hint: t('perfil.maximo10'),
            bloquearPortapapeles: true,
          },
          {
            clave: 'address',
            label: t('perfil.direccionResidencia'),
            valor: direccion,
            placeholder: t('perfil.placeholderDireccion'),
          },
        ]}
        email={email}
        emailOriginal={emailOriginal}
        rol={t('perfil.cuentaCliente')}
        notificar={notify}
        onEmailVerificado={(nuevo) => {
          setEmail(nuevo);
          setEmailOriginal(nuevo);
          refreshUserProfile();
          window.dispatchEvent(new CustomEvent('client-profile-updated'));
        }}
        onGuardar={async (payload) => {
          const tel = String(payload.telefono_cliente ?? '').replace(/\D/g, '');
          if (tel && tel.length !== 10) {
            notify(t('perfil.telefono10'), 'error');
            return false;
          }
          return guardarCampo(payload);
        }}
      />

      <div className="pf-danger-zone">
        <span className="pf-danger-icon"><FaUserSlash /></span>
        <div className="pf-danger-info">
          <h3>{t('perfil.inhabilitarCuenta')}</h3>
          <p>
            {t('perfil.inhabilitarInfo')}
            {solicitudEstado === 'pendiente' && t('perfil.solicitudPendiente')}
            {solicitudEstado === 'rechazada' && t('perfil.solicitudRechazada')}
          </p>
        </div>
        <button
          type="button"
          className="pf-btn pf-btn-danger"
          onClick={() => {
            setMotivoSolicitud('');
            setConfirmarInhabilitar(true);
          }}
          disabled={solicitudEstado === 'pendiente'}
        >
          <FaUserSlash /> {t('perfil.inhabilitarCuenta')}
        </button>
      </div>
    </div>
  );

  const renderFavoritosTab = () => (
    <div className="pf-tab">
      <SectionHeader
        icon={<FaHeart />}
        title={t('perfil.misFavoritos')}
        subtitle={t('perfil.favoritosTabSub')}
      />

      {favoritosLoading ? (
        <div className="pf-empty">
          <div className="pf-empty-icon">⏳</div>
          <p>{t('common.cargando')}</p>
        </div>
      ) : productosFavoritos.length === 0 ? (
        <div className="pf-empty">
          <div className="pf-empty-icon">
            <FaHeart />
          </div>
          <p>{t('perfil.favoritosVacios')}</p>
          <p style={{ fontSize: '0.8rem', marginTop: '8px' }}>{t('perfil.favoritosVaciosHint')}</p>
        </div>
      ) : (
        <div className="pf-favoritos-grid">
          {productosFavoritos.map((producto) => (
            <div key={producto.id_producto} className="pf-favorito-card">
              <div className="pf-favorito-img-wrap">
                <img
                  src={producto.imagen_url || `/productos/${producto.id_producto}.jpg`}
                  alt={producto.nombre_producto}
                  className="pf-favorito-img"
                  loading="lazy"
                  onError={(e) => (e.currentTarget.src = '/productos/default.png')}
                />
                <button
                  type="button"
                  className="pf-favorito-remove"
                  onClick={() => {
                    quitarFavorito(producto.id_producto);
                    notify(t('perfil.eliminadoFavoritos'), 'info');
                  }}
                  aria-label={t('perfil.quitarDeFavoritos')}
                  title={t('perfil.quitarDeFavoritos')}
                >
                  <FaHeart style={{ color: '#e5484d' }} />
                </button>
              </div>
              <div className="pf-favorito-info">
                <h3 className="pf-favorito-nombre">{producto.nombre_producto}</h3>
                {producto.nombre_categoria && (
                  <span className="pf-favorito-categoria">{producto.nombre_categoria}</span>
                )}
                <div className="pf-favorito-precio">
                  <span className="pf-favorito-monto">${producto.precio_venta_producto.toLocaleString()}</span>
                  <span className="pf-favorito-sufijo">COP</span>
                </div>
                <button
                  type="button"
                  className="pf-btn pf-btn-primary pf-favorito-comprar"
                  onClick={() => navigate('/productos')}
                >
                  {t('perfil.verProducto')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="perfil-layout app-glass">
      <div className="perfil-shell">
        {/* ── Navegación lateral ─────────────────────────────── */}
        <aside className="perfil-sidebar">
          <div className="pf-usuario-card">
            <span className="pf-avatar-wrap">
              {avatar ? (
                <img src={avatar} alt={t('perfil.tuFotoPerfil')} className="pf-avatar-img" />
              ) : (
                <span className="pf-avatar-img pf-avatar-img-iniciales" aria-hidden="true">
                  {getIniciales(nombreCompleto)}
                </span>
              )}
            </span>
            <strong className="pf-usuario-nombre">{nombreCompleto}</strong>
            <span className="pf-usuario-correo">{correoUsuario}</span>
          </div>

          <nav className="pf-nav" aria-label={t('perfil.seccionesLabel')}>
            {grupos.map((grupo) => (
              <div className="pf-nav-group" key={grupo.label}>
                <span className="pf-nav-group-title">{grupo.label}</span>
                {grupo.items.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`pf-nav-item ${activo === item.id ? 'active' : ''}`}
                    onClick={() => setActivo(item.id as TabId)}
                  >
                    <span className="pf-nav-icon">{item.icon}</span>
                    <span className="pf-nav-label">{item.label}</span>
                    {item.badge ? <span className="pf-nav-badge">{item.badge}</span> : null}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        {/* ── Contenido ─────────────────────────────────────── */}
        <main className="perfil-content">
          <header className="pf-content-header">
            <div>
              <h1 className="pf-content-title">{t('perfil.miPerfil')}</h1>
              <p className="pf-content-subtitle">{t('perfil.subtituloHeader')}</p>
            </div>
            <span className="pf-breadcrumb">{tituloSeccion}</span>
          </header>

          <AnimatePresence mode="wait">
            <motion.section
              key={activo}
              className="pf-card"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              {activo === 'perfil' && renderPerfilTab()}
{activo === 'favoritos' && renderFavoritosTab()}
              {activo === 'contrasena' && <PasswordTab notify={notify} />}
              {activo === 'pedidos' && <OrdersTab notify={notify} />}
              {activo === 'servicios' && <ServiciosTab />}
              {activo === 'resenas' && <ReviewsTab notify={notify} />}
              {activo === 'reembolsos' && <ReembolsosCliente />}
              {activo === 'tecnicos' && <TechniciansTab />}
              {activo === 'facturas' && <FacturasTab />}
              {activo === 'idioma' && <LanguageTab notify={notify} />}
              {activo === 'notificaciones' && <NotificationsTab notify={notify} />}
            </motion.section>
          </AnimatePresence>
        </main>
      </div>

      {/* ── Toast ───────────────────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            className={`pf-toast ${toast.tipo}`}
            initial={{ opacity: 0, y: -24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -24, scale: 0.96 }}
          >
            {toast.tipo === 'error' ? <FaXmark /> : <FaCheck />}
            <span>{toast.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modal inhabilitar cuenta ─────────────────────────── */}
      {confirmarInhabilitar && (
        <div className="pf-modal-backdrop" onClick={() => !enviandoSolicitud && setConfirmarInhabilitar(false)}>
          <div className="pf-modal pf-modal-small" onClick={(e) => e.stopPropagation()}>
            <div className="pf-modal-header">
              <h3>Inhabilitar cuenta</h3>
              <button type="button" className="pf-modal-close" onClick={() => setConfirmarInhabilitar(false)} aria-label="Cerrar" disabled={enviandoSolicitud}>×</button>
            </div>
            <p className="pf-modal-text">¿Deseas enviar una solicitud de inhabilitación a tu cuenta? Un administrador deberá aprobarla antes de que quede inhabilitada. Podrás solicitar su habilitación más adelante.</p>
            <div className="pf-form-group" style={{ marginTop: 4 }}>
              <label className="pf-form-label" htmlFor="pf-motivo">
                Motivo de la inhabilitación *
              </label>
              <textarea
                id="pf-motivo"
                className="pf-form-input pf-textarea"
                value={motivoSolicitud}
                onChange={(e) => setMotivoSolicitud(e.target.value)}
                placeholder="Escribe el motivo por el cual deseas inhabilitar tu cuenta..."
                required
                disabled={enviandoSolicitud}
              />
            </div>
            <div className="pf-form-actions" style={{ marginTop: 16 }}>
              <button type="button" className="pf-btn pf-btn-ghost" onClick={() => setConfirmarInhabilitar(false)} disabled={enviandoSolicitud}>Cancelar</button>
              <button type="button" className="pf-btn pf-btn-danger" onClick={handleSolicitarInhabilitacion} disabled={enviandoSolicitud}>
                <FaHourglassHalf /> {enviandoSolicitud ? 'Enviando...' : 'Enviar solicitud'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Perfil;
