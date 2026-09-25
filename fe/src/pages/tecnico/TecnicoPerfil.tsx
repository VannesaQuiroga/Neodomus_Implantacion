import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@contexts/AuthContext';
import { useIdioma } from '@i18n/IdiomaContext';
import api from '@services/api';
import {
  FaUserShield,
  FaUserPen,
  FaCamera,
  FaLock,
  FaGlobe,
  FaCheck,
  FaXmark,
  FaTrashCan,
} from 'react-icons/fa6';
import '@styles/perfil-cliente.css';
import '@styles/admin-panel.css';
import EspecializacionesSelect from '@components/admin/EspecializacionesSelect';

import { getIniciales, getTechnicalAvatar, removeTechnicalAvatar, setTechnicalAvatar } from '@utils/profileStorage';
import SectionHeader from '@components/profile/SectionHeader';
import PasswordTab from '@components/profile/PasswordTab';
import LanguageTab from '@components/profile/LanguageTab';
import PerfilCuenta from '@components/profile/PerfilCuenta';

type TabTecnico = 'cuenta' | 'contrasena' | 'idioma';

interface PerfilTecnico {
  first_name: string;
  last_name: string;
  email: string;
  telefono_usuario?: number | null;
  documento_usuario?: number | null;
  certificacion_t?: string | null;
  especializaciones?: { id_especializacion: number; nombre: string; descripcion?: string | null }[];
  created_at?: string;
}

const TechnicalPerfil = () => {
  const { user, refreshUserProfile } = useAuth();
  const { t } = useIdioma();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activo, setActivo] = useState<TabTecnico>('cuenta');
  const [avatar, setAvatar] = useState<string | null>(() => getTechnicalAvatar());
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [email, setEmail] = useState('');
  const [emailOriginal, setEmailOriginal] = useState('');
  const [telefono, setTelefono] = useState('');
  const [documento, setDocumento] = useState('');
  const [certificacion, setCertificacion] = useState('');
  const [especializaciones, setEspecializaciones] = useState<
    { id_especializacion: number; nombre: string; descripcion?: string | null }[]
  >([]);
  const [catalogo, setCatalogo] = useState<
    { id_especializacion: number; nombre: string; descripcion?: string | null }[]
  >([]);
  const [gestionandoEsp, setGestionandoEsp] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [toast, setToast] = useState<{ msg: string; tipo: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    const cargarPerfil = async () => {
      setCargando(true);
      try {
        const res = await api.get<PerfilTecnico>('/users/me');
        setNombre(res.data.first_name || '');
        setApellido(res.data.last_name || '');
        setEmail(res.data.email || '');
        setEmailOriginal(res.data.email || '');
        setTelefono(res.data.telefono_usuario ? String(res.data.telefono_usuario) : '');
        setDocumento(res.data.documento_usuario ? String(res.data.documento_usuario) : '');
        setCertificacion(res.data.certificacion_t || '');
        setEspecializaciones(res.data.especializaciones || []);
      } catch (err) {
        console.error('Error cargando perfil del técnico:', err);
        const partes = (user?.nombre || t('tec.tecnico')).trim().split(' ');
        setNombre(partes[0] || '');
        setApellido(partes.slice(1).join(' ') || '');
        setEmail(user?.correo || '');
        setEmailOriginal(user?.correo || '');
      } finally {
        setCargando(false);
      }
    };
    cargarPerfil();
  }, [user]);

  useEffect(() => {
    const cargarCatalogo = async () => {
      try {
        const res = await api.get<
          { id_especializacion: number; nombre: string; descripcion?: string | null }[]
        >('/especializaciones');
        setCatalogo(res.data || []);
      } catch (err) {
        console.error('Error cargando catálogo de especializaciones:', err);
      }
    };
    cargarCatalogo();
  }, []);

  const handleEspecializacionesChange = async (nuevosIds: number[]) => {
    const actuales = especializaciones.map(e => e.id_especializacion);
    const agregados = nuevosIds.filter(id => !actuales.includes(id));
    const quitados = actuales.filter(id => !nuevosIds.includes(id));
    if (agregados.length === 0 && quitados.length === 0) return;
    setGestionandoEsp(true);
    try {
      let resultado: typeof especializaciones = [...especializaciones];
      for (const id of agregados) {
        const res = await api.post<{ mensaje: string; especializaciones: typeof especializaciones }>(
          `/tecnicos/mis-especializaciones/${id}`,
        );
        resultado = res.data.especializaciones || resultado;
      }
      for (const id of quitados) {
        const res = await api.delete<{ mensaje: string; especializaciones: typeof especializaciones }>(
          `/tecnicos/mis-especializaciones/${id}`,
        );
        resultado = res.data.especializaciones || resultado;
      }
      setEspecializaciones(resultado);
      if (agregados.length > 0) notify('Especialización agregada', 'success');
      if (quitados.length > 0) notify('Especialización quitada', 'info');
    } catch (err: any) {
      notify(err.response?.data?.detail || t('tec.errorGuardar'), 'error');
    } finally {
      setGestionandoEsp(false);
    }
  };

  useEffect(() => {
    const sync = () => {
      setAvatar(getTechnicalAvatar());
    };
    window.addEventListener('technical-profile-updated', sync);
    return () => window.removeEventListener('technical-profile-updated', sync);
  }, []);

  const notify = (msg: string, tipo: 'success' | 'error' | 'info' = 'success') => {
    setToast({ msg, tipo });
    window.setTimeout(() => setToast(null), 3200);
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      notify(t('tec.fotoPesada'), 'error');
      return;
    }
    try {
      const formData = new FormData();
      formData.append('archivo', file);
      const res = await api.post('/users/me/foto', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const url = res.data?.foto_url;
      if (url) {
        setAvatar(url);
        setTechnicalAvatar(url);
      }
      notify(t('tec.fotoActualizada'));
    } catch (err: any) {
      notify(err.response?.data?.detail || 'No se pudo subir la foto', 'error');
    }
  };

  const handleEliminarFoto = () => {
    setAvatar(null);
    removeTechnicalAvatar();
    notify(t('tec.fotoEliminada'));
  };

  const guardarCampo = async (payload: Record<string, unknown>) => {
    try {
      const body: Record<string, unknown> = { ...payload };
      const tel = String(body.telefono_usuario ?? '').replace(/\D/g, '');
      const doc = String(body.documento_usuario ?? '').replace(/\D/g, '');
      body.telefono_usuario = tel ? parseInt(tel, 10) : null;
      body.documento_usuario = doc ? parseInt(doc, 10) : null;
      await api.put('/users/me', body);
      if (typeof body.first_name === 'string' && typeof body.last_name === 'string') {
        setNombre(body.first_name.trim());
        setApellido(body.last_name.trim());
      }
      setTelefono(tel);
      setDocumento(doc);
      setCertificacion(String(body.certificacion_t ?? '').trim());
      await refreshUserProfile();
      window.dispatchEvent(new CustomEvent('technical-profile-updated'));
      notify(t('tec.cambiosGuardados'), 'success');
      return true;
    } catch (err: any) {
      const msg = err.response?.data?.detail;
      notify(typeof msg === 'string' ? msg : t('tec.errorGuardar'), 'error');
      return false;
    }
  };

  const nombreCompleto = `${nombre} ${apellido}`.trim() || user?.nombre || t('tec.tecnico');
  const correoUsuario = email || user?.correo || '';

  const renderCuenta = () => (
    <div className="pf-tab">
      <SectionHeader
        icon={<FaUserPen />}
        title={t('tec.informacionPersonal')}
        subtitle={t('tec.subInformacionPersonal')}
      />

      <div className="pf-avatar-zone">
        <div className="pf-avatar-big">
          {avatar ? (
            <img src={avatar} alt={t('tec.fotoPerfil')} />
          ) : (
            <span className="pf-avatar-iniciales" aria-hidden="true">{getIniciales(nombreCompleto)}</span>
          )}
          <button
            type="button"
            className="pf-avatar-camera"
            aria-label={t('tec.cambiarFoto')}
            onClick={() => fileInputRef.current?.click()}
          >
            <FaCamera />
          </button>
        </div>
        <div className="pf-avatar-text">
          <strong>{t('tec.fotoPerfil')}</strong>
          <span>{t('tec.fotoPerfilHint')}</span>
          <button
            type="button"
            className="pf-btn pf-btn-ghost"
            onClick={() => fileInputRef.current?.click()}
          >
            <FaCamera /> {t('tec.cambiarFoto')}
          </button>
          {avatar && (
            <button type="button" className="pf-btn pf-btn-danger" onClick={handleEliminarFoto}>
              <FaTrashCan /> {t('tec.eliminarFoto')}
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

      {cargando ? (
        <div className="ap-states">
          <div className="ap-loader" />
          <p className="ap-state-text">{t('tec.cargandoDatos')}</p>
        </div>
      ) : (
        <>
          <div className="pf-content-card" style={{ marginBottom: 16 }}>
            <h2 className="pf-section-title" style={{ marginTop: 0 }}>{t('tec.misEspecializaciones')}</h2>
            <div style={{ opacity: gestionandoEsp ? 0.6 : 1, pointerEvents: gestionandoEsp ? 'none' : 'auto' }}>
              <EspecializacionesSelect
                catalogo={catalogo.map(c => ({ id_especializacion: c.id_especializacion, nombre: c.nombre, descripcion: c.descripcion, activa: true }))}
                value={especializaciones.map(e => e.id_especializacion)}
                onChange={handleEspecializacionesChange}
                disabled={gestionandoEsp}
              />
            </div>
            <p className="ap-form-hint" style={{ marginTop: 8 }}>{t('tec.especializacionesHint')}</p>
          </div>
          <PerfilCuenta
          campos={[
            {
              clave: 'first_name',
              label: t('tec.nombre'),
              valor: nombre,
              placeholder: t('tec.placeholderNombre'),
              requerido: true,
              bloquearPortapapeles: true,
            },
            {
              clave: 'last_name',
              label: t('tec.apellidos'),
              valor: apellido,
              placeholder: t('tec.placeholderApellidos'),
              requerido: true,
              bloquearPortapapeles: true,
            },
            {
              clave: 'telefono_usuario',
              label: t('tec.telefono'),
              valor: telefono,
              tipo: 'tel',
              maxLength: 10,
              placeholder: t('tec.placeholderTelefono'),
              hint: t('perfil.maximo10'),
              bloquearPortapapeles: true,
            },
            {
              clave: 'documento_usuario',
              label: t('tec.documento'),
              valor: documento,
              tipo: 'tel',
              maxLength: 15,
              placeholder: t('tec.placeholderDocumento'),
            },
            {
              clave: 'certificacion_t',
              label: t('tec.especialidad'),
              valor: certificacion,
              placeholder: t('tec.placeholderEspecialidad'),
            },
          ]}
          email={email}
          emailOriginal={emailOriginal}
          rol={t('tec.tecnico')}
          notificar={notify}
          onEmailVerificado={(nuevo) => {
            setEmail(nuevo);
            setEmailOriginal(nuevo);
            refreshUserProfile();
            window.dispatchEvent(new CustomEvent('technical-profile-updated'));
          }}
          onGuardar={async (payload) => {
            const tel = String(payload.telefono_usuario ?? '').replace(/\D/g, '');
            if (tel && tel.length !== 10) {
              notify(t('perfil.telefono10'), 'error');
              return false;
            }
            return guardarCampo(payload);
          }}
        />
        </>
      )}
    </div>
  );

  const paneContent = () => {
    if (activo === 'contrasena') return <PasswordTab notify={notify} />;
    if (activo === 'idioma') return <LanguageTab notify={notify} />;
    return renderCuenta();
  };

  const navItems: { id: TabTecnico; label: string; icon: React.ReactNode }[] = [
    { id: 'cuenta', label: t('tec.miCuenta'), icon: <FaUserShield /> },
    { id: 'contrasena', label: t('tec.cambiarContrasena'), icon: <FaLock /> },
    { id: 'idioma', label: t('tec.idioma'), icon: <FaGlobe /> },
  ];

  return (
    <div className="ap-profile">
      <div className="perfil-shell">
        <aside className="perfil-sidebar">
          <div className="pf-usuario-card">
            <span className="pf-avatar-wrap">
              {avatar ? (
                <img src={avatar} alt={t('tec.fotoPerfil')} className="pf-avatar-img" />
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
            {navItems.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`pf-nav-item ${activo === item.id ? 'active' : ''}`}
                onClick={() => setActivo(item.id)}
              >
                <span className="pf-nav-icon">{item.icon}</span>
                <span className="pf-nav-label">{item.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <main className="perfil-content">
          <header className="pf-content-header">
            <div>
              <h1 className="pf-content-title">{t('tec.perfilTitulo')}</h1>
              <p className="pf-content-subtitle">{t('tec.perfilSubtitulo')}</p>
            </div>
            <span className="pf-breadcrumb">{t('tec.tecnico')}</span>
          </header>

          <AnimatePresence mode="wait">
            <motion.div
              key={activo}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              {paneContent()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            className={`pf-toast ${toast.tipo === 'error' ? 'error' : 'success'}`}
            initial={{ opacity: 0, y: -24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -24, scale: 0.96 }}
          >
            {toast.tipo === 'error' ? <FaXmark /> : <FaCheck />}
            <span>{toast.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TechnicalPerfil;
