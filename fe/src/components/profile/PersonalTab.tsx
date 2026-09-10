import { useState, useEffect, useRef } from 'react';
import { FaUserPen, FaCamera, FaTrashCan } from 'react-icons/fa6';
import api from '@services/api';
import { useAuth } from '@contexts/AuthContext';
import { useIdioma } from '@i18n/IdiomaContext';
import { getAvatar, getIniciales, PF_AVATAR_KEY, removeAvatar } from '@utils/profileStorage';
import SectionHeader from './SectionHeader';
import PerfilCuenta from './PerfilCuenta';

export type NotifyFn = (message: string, type?: 'success' | 'error' | 'info') => void;

interface PersonalTabProps {
  notify: NotifyFn;
  onProfileChanged: () => void;
}

interface ClientProfile {
  first_name: string;
  last_name: string;
  email: string;
  telefono_cliente?: number | null;
  address?: string | null;
}

const PersonalTab = ({ notify, onProfileChanged }: PersonalTabProps) => {
  const { user, refreshUserProfile } = useAuth();
  const { t } = useIdioma();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [avatar, setAvatar] = useState<string | null>(getAvatar());
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [email, setEmail] = useState('');
  const [emailOriginal, setEmailOriginal] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');

  useEffect(() => {
    const syncFromContext = () => {
      setNombre(user?.nombre?.split(' ')[0] || '');
      setApellido(user?.nombre?.split(' ').slice(1).join(' ') || '');
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
      })
      .catch((err) => {
        if (err.response?.status === 403) syncFromContext();
      });
  }, [user]);

  useEffect(() => {
    const sync = () => setAvatar(getAvatar());
    window.addEventListener('client-profile-updated', sync);
    return () => window.removeEventListener('client-profile-updated', sync);
  }, []);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      notify(t('perfil.fotoPesada'), 'error');
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
        setAvatar(url);
        localStorage.setItem(PF_AVATAR_KEY, url);
        window.dispatchEvent(new CustomEvent('client-profile-updated'));
      }
      notify(t('perfil.fotoActualizada'), 'success');
    } catch (err: any) {
      notify(err.response?.data?.detail || 'No se pudo subir la foto', 'error');
    }
  };

  const handleEliminarFoto = () => {
    setAvatar(null);
    removeAvatar();
    notify(t('perfil.fotoEliminada'), 'success');
  };

  const guardarCampo = async (payload: Record<string, unknown>) => {
    try {
      const body: Record<string, unknown> = { ...payload };
      const tel = String(body.telefono_cliente ?? '').replace(/\D/g, '');
      body.telefono_cliente = tel ? parseInt(tel, 10) : null;
      await api.put('/clients/me', body);
      if (typeof body.first_name === 'string' && typeof body.last_name === 'string') {
        setNombre(body.first_name.trim());
        setApellido(body.last_name.trim());
      }
      setTelefono(tel);
      setDireccion(String(body.address ?? '').trim());
      await refreshUserProfile();
      window.dispatchEvent(new CustomEvent('client-profile-updated'));
      onProfileChanged();
      notify(t('perfil.cambiosGuardados'), 'success');
      return true;
    } catch (err: any) {
      console.error(err);
      const msg = err.response?.data?.detail;
      notify(typeof msg === 'string' ? msg : t('perfil.errorGuardar'), 'error');
      return false;
    }
  };

  return (
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
            <span className="pf-avatar-iniciales" aria-hidden="true">{getIniciales(user?.nombre || '')}</span>
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
    </div>
  );
};

export default PersonalTab;
