// Pantalla AdminConsultas de Neodomus. Reúne el estado y las acciones de su vista.
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { useIdioma } from '@i18n/IdiomaContext';
import {
  FaCircleCheck,
  FaRotate,
  FaTriangleExclamation,
  FaUser,
  FaEnvelope,
  FaCalendarDays,
  FaUserSlash,
  FaUserCheck,
  FaUserGear,
  FaMagnifyingGlass,
} from 'react-icons/fa6';
import '@styles/admin-panel.css';
import '@styles/dashboard-admin.css';
import api from '@services/api';
import type { ClienteAdmin, SolicitudCuenta, SolicitudEmpleado, TecnicoAdmin } from '../../types';

type Vista = 'solicitudes' | 'cuentas';

type SolicitudCombinada =
  | { fuente: 'cliente'; data: SolicitudCuenta }
  | { fuente: 'empleado'; data: SolicitudEmpleado };

// Comunica con el backend mediante GET '/admin/account-requests', GET '/admin/account-requests/empleados', GET '/clients' y otras peticiones de esta vista.
const AdminConsultas = () => {
  const { idioma, t } = useIdioma();
  const location = useLocation();
  const [vista, setVista] = useState<Vista>('solicitudes');
  const [solicitudes, setSolicitudes] = useState<SolicitudCuenta[]>([]);
  const [solicitudesEmpleados, setSolicitudesEmpleados] = useState<SolicitudEmpleado[]>([]);
  const [clientes, setClientes] = useState<ClienteAdmin[]>([]);
  const [tecnicos, setTecnicos] = useState<TecnicoAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [resolviendo, setResolviendo] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [busquedaCuentas, setBusquedaCuentas] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [pagina, setPagina] = useState(1);

  const POR_PAGINA = 6;

  // Comunica con el backend mediante GET '/admin/account-requests', GET '/admin/account-requests/empleados'.
  const cargarSolicitudes = async () => {
    try {
      const [clientesRes, empleadosRes] = await Promise.all([
        api.get<SolicitudCuenta[]>('/admin/account-requests'),
        api.get<SolicitudEmpleado[]>('/admin/account-requests/empleados'),
      ]);
      setSolicitudes(clientesRes.data || []);
      setSolicitudesEmpleados(empleadosRes.data || []);
    } catch {
      /* silencioso */
    }
  };

  // Comunica con el backend mediante GET '/clients', GET '/tecnicos'.
  const cargarCuentas = async () => {
    try {
      const [clientesRes, tecnicosRes] = await Promise.all([
        api.get<ClienteAdmin[]>('/clients'),
        api.get<TecnicoAdmin[]>('/tecnicos'),
      ]);
      setClientes(clientesRes.data || []);
      setTecnicos(tecnicosRes.data || []);
    } catch {
      /* silencioso */
    }
  };

  const cargarTodo = async () => {
    setCargando(true);
    await Promise.all([cargarSolicitudes(), cargarCuentas()]);
    setCargando(false);
  };

  useEffect(() => {
    cargarTodo();
  }, []);

  useEffect(() => {
    const intervalo = window.setInterval(() => {
      cargarSolicitudes();
      cargarCuentas();
    }, 30000);
    return () => window.clearInterval(intervalo);
  }, []);

  useEffect(() => {
    if (location.hash === '#solicitudes-cuenta') {
      setVista('cuentas');
      const el = document.getElementById('solicitudes-cuenta');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.hash]);

  useEffect(() => {
    setPagina(1);
  }, [busqueda, filtroTipo]);

  const notify = (msg: string, tipo: 'ok' | 'err' = 'ok') => {
    setToast({ msg, tipo });
    window.setTimeout(() => setToast(null), 3200);
  };

  // Comunica con el backend mediante PUT `/admin/account-requests/${id}/${accion}`.
  const resolver = async (id: number, accion: 'aprobar' | 'rechazar') => {
    setResolviendo(`cliente-${id}`);
    try {
      await api.put(`/admin/account-requests/${id}/${accion}`);
      await cargarSolicitudes();
      await cargarCuentas();
      notify(accion === 'aprobar' ? t('adm.consultas.toastAprobada') : t('adm.consultas.toastRechazada'));
      window.dispatchEvent(new CustomEvent('admin-solicitudes-updated'));
    } catch (err: any) {
      notify(err.response?.data?.detail || t('adm.consultas.toastErrorProcesar'), 'err');
    } finally {
      setResolviendo(null);
    }
  };

  // Comunica con el backend mediante PUT `/admin/account-requests/empleados/${id}/${accion}`.
  const resolverEmpleado = async (id: number, accion: 'aprobar' | 'rechazar') => {
    setResolviendo(`emp-${id}`);
    try {
      await api.put(`/admin/account-requests/empleados/${id}/${accion}`);
      await cargarSolicitudes();
      await cargarCuentas();
      notify(accion === 'aprobar' ? t('adm.consultas.toastAprobada') : t('adm.consultas.toastRechazada'));
      window.dispatchEvent(new CustomEvent('admin-solicitudes-updated'));
    } catch (err: any) {
      notify(err.response?.data?.detail || t('adm.consultas.toastErrorProcesar'), 'err');
    } finally {
      setResolviendo(null);
    }
  };

  // Comunica con el backend mediante PUT `/clients/${id}/habilitar`.
  const habilitarCliente = async (id: number) => {
    setResolviendo(`cliente-${id}`);
    try {
      await api.put(`/clients/${id}/habilitar`);
      await cargarCuentas();
      notify(t('adm.consultas.toastClienteHabilitada'));
      window.dispatchEvent(new CustomEvent('admin-solicitudes-updated'));
    } catch (err: any) {
      notify(err.response?.data?.detail || t('adm.consultas.toastErrorHabilitar'), 'err');
    } finally {
      setResolviendo(null);
    }
  };

  // Comunica con el backend mediante PUT `/users/${id}`.
  const habilitarTecnico = async (id: number) => {
    setResolviendo(`tecnico-${id}`);
    try {
      await api.put(`/users/${id}`, { is_active: true });
      await cargarCuentas();
      notify(t('adm.consultas.toastTecnicoHabilitada'));
    } catch (err: any) {
      notify(err.response?.data?.detail || t('adm.consultas.toastErrorHabilitar'), 'err');
    } finally {
      setResolviendo(null);
    }
  };

  const solicitudesCombinadas: SolicitudCombinada[] = [
    ...solicitudes.map((s) => ({ fuente: 'cliente' as const, data: s })),
    ...solicitudesEmpleados.map((s) => ({ fuente: 'empleado' as const, data: s })),
  ].sort(
    (a, b) =>
      Date.parse(b.data.created_at || '') - Date.parse(a.data.created_at || ''),
  );

  const q = busqueda.trim().toLowerCase();
  const solicitudesFiltradas = solicitudesCombinadas.filter((item) => {
    if (filtroTipo !== 'todos') {
      if (filtroTipo === 'empleado') {
        if (item.fuente !== 'empleado') return false;
      } else if (item.fuente === 'empleado' || item.data.tipo !== filtroTipo) {
        return false;
      }
    }
    if (!q) return true;
    const nombre = item.fuente === 'empleado' ? item.data.empleado_nombre : item.data.cliente_nombre;
    const email = item.fuente === 'empleado' ? item.data.empleado_email : item.data.cliente_email;
    const motivo = item.fuente === 'cliente' ? item.data.motivo || '' : '';
    return `${nombre} ${email} ${motivo}`.toLowerCase().includes(q);
  });

  const totalPaginas = Math.max(1, Math.ceil(solicitudesFiltradas.length / POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const solicitudesVisibles = solicitudesFiltradas.slice(
    (paginaActual - 1) * POR_PAGINA,
    paginaActual * POR_PAGINA,
  );

  const pendientesCuenta =
    solicitudes.filter((s) => s.estado === 'pendiente').length +
    solicitudesEmpleados.filter((s) => s.estado === 'pendiente').length;

  const clientesInhabilitados = clientes.filter((c) => !c.is_active);
  const tecnicosInhabilitados = tecnicos.filter((t) => !t.is_active);
  const totalInhabilitadas = clientesInhabilitados.length + tecnicosInhabilitados.length;

  const qc = busquedaCuentas.trim().toLowerCase();
  const clientesInhabilitadosFiltrados = qc
    ? clientesInhabilitados.filter((c) =>
        `${c.first_name || ''} ${c.last_name || ''} ${c.email || ''}`.toLowerCase().includes(qc),
      )
    : clientesInhabilitados;
  const tecnicosInhabilitadosFiltrados = qc
    ? tecnicosInhabilitados.filter((t) =>
        `${t.first_name || ''} ${t.last_name || ''} ${t.email || ''}`.toLowerCase().includes(qc),
      )
    : tecnicosInhabilitados;

  const fechaLegible = (fecha?: string | null) => {
    if (!fecha) return '';
    try {
      return new Date(fecha).toLocaleDateString(idioma === 'en' ? 'en-US' : 'es-CO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  };

  const nombreCompleto = (nombre: string, apellido?: string) =>
    `${nombre} ${apellido || ''}`.trim();

  const renderTarjetaSolicitud = (item: SolicitudCombinada) => {
    if (item.fuente === 'empleado') {
      const s = item.data;
      const key = `emp-${s.id}`;
      return (
        <article className="scu-card" key={key}>
          <div className="scu-card-top">
            <span className="scu-tipo">
              <FaUserGear /> {t('adm.consultas.tipoHabilitacionTecnico')}
            </span>
            <span className="scu-estado pendiente">{t('adm.consultas.estadoPendiente')}</span>
          </div>
          <div className="scu-datos">
            <span className="scu-dato"><FaUser /> {s.empleado_nombre}</span>
            <span className="scu-dato"><FaEnvelope /> {s.empleado_email}</span>
            <span className="scu-dato"><FaCalendarDays /> {fechaLegible(s.created_at)}</span>
          </div>
          <div className="scu-acciones">
            <button
              type="button"
              className="solicitud-btn ok"
              disabled={resolviendo === key}
              onClick={() => resolverEmpleado(s.id, 'aprobar')}
            >
              <FaCircleCheck /> {t('adm.consultas.aprobar')}
            </button>
            <button
              type="button"
              className="solicitud-btn no"
              disabled={resolviendo === key}
              onClick={() => resolverEmpleado(s.id, 'rechazar')}
            >
              <FaUserCheck /> {t('adm.consultas.rechazar')}
            </button>
          </div>
        </article>
      );
    }

    const s = item.data;
    const key = `cliente-${s.id}`;
    const esPendiente = s.estado === 'pendiente';
    return (
      <article className="scu-card" key={key}>
        <div className="scu-card-top">
          <span className="scu-tipo">
            {s.tipo === 'habilitar' ? <FaUserCheck /> : <FaUserSlash />}
            {s.tipo === 'habilitar'
              ? t('adm.consultas.tipoHabilitacion')
              : t('adm.consultas.tipoInhabilitacion')}
          </span>
          <span className={`scu-estado ${esPendiente ? 'pendiente' : 'activa'}`}>
            {esPendiente ? t('adm.consultas.estadoPendiente') : s.estado}
          </span>
        </div>
        <div className="scu-datos">
          <span className="scu-dato"><FaUser /> {s.cliente_nombre}</span>
          <span className="scu-dato"><FaEnvelope /> {s.cliente_email}</span>
          <span className="scu-dato"><FaCalendarDays /> {fechaLegible(s.created_at)}</span>
        </div>
        {s.motivo && <p className="scu-motivo">{s.motivo}</p>}
        <div className="scu-acciones">
          {esPendiente ? (
            <>
              <button
                type="button"
                className="solicitud-btn ok"
                disabled={resolviendo === key}
                onClick={() => resolver(s.id, 'aprobar')}
              >
                <FaCircleCheck /> {t('adm.consultas.aprobar')}
              </button>
              <button
                type="button"
                className="solicitud-btn no"
                disabled={resolviendo === key}
                onClick={() => resolver(s.id, 'rechazar')}
              >
                <FaUserCheck /> {t('adm.consultas.rechazar')}
              </button>
            </>
          ) : (
            <span className={`solicitud-btn ${s.estado === 'aprobada' ? 'ok' : 'no'}`}>
              {s.estado === 'aprobada' ? t('adm.consultas.estadoAprobada') : t('adm.consultas.estadoRechazada')}
            </span>
          )}
        </div>
      </article>
    );
  };

  const renderTarjetaCuentaInhabilitada = (
    id: number,
    nombre: string,
    email: string,
    esTecnico: boolean,
  ) => (
    <article className="scu-card" key={`${esTecnico ? 'tecnico' : 'cliente'}-${id}`}>
      <div className="scu-card-top">
        <span className="scu-tipo">
          {esTecnico ? <FaUserGear /> : <FaUserSlash />}
          {esTecnico ? t('adm.consultas.tipoCuentaTecnico') : t('adm.consultas.tipoCuentaCliente')}
        </span>
        <span className="scu-estado inhabilitada">{t('adm.consultas.estadoInhabilitada')}</span>
      </div>
      <div className="scu-datos">
        <span className="scu-dato"><FaUser /> {nombre}</span>
        <span className="scu-dato"><FaEnvelope /> {email}</span>
      </div>
      <div className="scu-acciones">
        <button
          type="button"
          className="solicitud-btn ok"
          disabled={resolviendo === `${esTecnico ? 'tecnico' : 'cliente'}-${id}`}
          onClick={() => (esTecnico ? habilitarTecnico(id) : habilitarCliente(id))}
        >
          <FaCircleCheck /> {t('adm.consultas.habilitarCuenta')}
        </button>
      </div>
    </article>
  );

  return (
    <motion.section
      className="admin-panel"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="ap-header">
        <div>
          <h1 className="ap-title">
            {vista === 'cuentas' ? t('adm.consultas.tituloCuentas') : t('adm.consultas.titulo')}
          </h1>
          <p className="ap-subtitle">
            {vista === 'cuentas'
              ? t('adm.consultas.subtituloCuentas')
              : t('adm.consultas.subtitulo')}
          </p>
        </div>
        <div className="ap-header-right">
          <button
            type="button"
            className="ap-btn ap-btn-ghost"
            onClick={cargarTodo}
            disabled={cargando}
          >
            <FaRotate className={cargando ? 'spin' : ''} /> {t('adm.consultas.actualizar')}
          </button>
        </div>
      </div>

      <div className="ap-tabs" role="tablist" aria-label={t('adm.consultas.tabsAriaLabel')}>
        <button
          type="button"
          role="tab"
          aria-selected={vista === 'solicitudes'}
          className={`ap-tab ${vista === 'solicitudes' ? 'active' : ''}`}
          onClick={() => setVista('solicitudes')}
        >
          <FaUserSlash /> {t('adm.consultas.tabSolicitudes')}
          {pendientesCuenta > 0 && (
            <span className="ap-pill-count">
              {pendientesCuenta}
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={vista === 'cuentas'}
          className={`ap-tab ${vista === 'cuentas' ? 'active' : ''}`}
          onClick={() => setVista('cuentas')}
        >
          <FaUserCheck /> {t('adm.consultas.tabCuentas')}
          {totalInhabilitadas > 0 && <span className="ap-pill-count">{totalInhabilitadas}</span>}
        </button>
      </div>

      {vista === 'solicitudes' ? (
        <>
          {cargando ? (
            <div className="ap-card">
              <div className="ap-states">
                <span className="ap-loader" />
                <h3>{t('adm.consultas.cargandoSolicitudes')}</h3>
                <p>{t('adm.consultas.cargandoSolicitudesSub')}</p>
              </div>
            </div>
          ) : solicitudesCombinadas.length === 0 ? (
            <div className="ap-card">
              <div className="ap-states">
                <div className="ap-states-icon">
                  <FaUserSlash />
                </div>
                <h3>{t('adm.consultas.sinSolicitudes')}</h3>
                <p>{t('adm.consultas.sinSolicitudesSub')}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="ap-toolbar">
                <input
                  type="search"
                  className="ap-form-input"
                  placeholder={t('adm.consultas.buscarPlaceholder')}
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                />
                <select
                  className="ap-form-select"
                  value={filtroTipo}
                  onChange={(e) => setFiltroTipo(e.target.value)}
                >
                  <option value="todos">{t('adm.consultas.filtroTodos')}</option>
                  <option value="habilitar">{t('adm.consultas.filtroHabilitacion')}</option>
                  <option value="inhabilitar">{t('adm.consultas.filtroInhabilitacion')}</option>
                  <option value="empleado">{t('adm.consultas.filtroHabilitacionTecnico')}</option>
                </select>
              </div>
              <div className="solicitudes-list">
                {solicitudesVisibles.map(renderTarjetaSolicitud)}
              </div>
              {solicitudesFiltradas.length === 0 && (
                <div className="ap-card">
                  <div className="ap-states">
                    <div className="ap-states-icon">
                      <FaUserSlash />
                    </div>
                    <h3>{t('adm.consultas.sinResultados')}</h3>
                    <p>{t('adm.consultas.sinResultadosSub')}</p>
                  </div>
                </div>
              )}
              {totalPaginas > 1 && (
                <div className="ap-paginacion">
                  <button
                    type="button"
                    className="ap-page-btn"
                    disabled={paginaActual === 1}
                    onClick={() => setPagina(paginaActual - 1)}
                  >
                    ‹ {t('adm.consultas.anterior')}
                  </button>
                  <div className="ap-page-nums">
                    {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`ap-page-btn ${n === paginaActual ? 'active' : ''}`}
                        onClick={() => setPagina(n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="ap-page-btn"
                    disabled={paginaActual === totalPaginas}
                    onClick={() => setPagina(paginaActual + 1)}
                  >
                    {t('adm.consultas.siguiente')} ›
                  </button>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <div id="solicitudes-cuenta">
          {cargando ? (
            <div className="ap-card">
              <div className="ap-states">
                <span className="ap-loader" />
                <h3>{t('adm.consultas.cargandoCuentas')}</h3>
                <p>{t('adm.consultas.cargandoCuentasSub')}</p>
              </div>
            </div>
          ) : totalInhabilitadas === 0 ? (
            <div className="ap-card">
              <div className="ap-states">
                <div className="ap-states-icon">
                  <FaUserCheck />
                </div>
                <h3>{t('adm.consultas.sinCuentas')}</h3>
                <p>{t('adm.consultas.sinCuentasSub')}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="ap-toolbar">
                <form className="ap-search" onSubmit={(e) => e.preventDefault()}>
                  <FaMagnifyingGlass />
                  <input
                    type="text"
                    placeholder={t('adm.consultas.buscarCuentaPlaceholder')}
                    value={busquedaCuentas}
                    onChange={(e) => setBusquedaCuentas(e.target.value)}
                  />
                </form>
              </div>
              {clientesInhabilitadosFiltrados.length > 0 && (
                <>
                  <h2 className="ap-section-title">{t('adm.consultas.seccionClientes')}</h2>
                  <div className="solicitudes-list">
                    {clientesInhabilitadosFiltrados.map((c) =>
                      renderTarjetaCuentaInhabilitada(
                        c.id_cliente,
                        nombreCompleto(c.first_name, c.last_name),
                        c.email,
                        false,
                      ),
                    )}
                  </div>
                </>
              )}
              {tecnicosInhabilitadosFiltrados.length > 0 && (
                <>
                  <h2 className="ap-section-title">{t('adm.consultas.seccionTecnicos')}</h2>
                  <div className="solicitudes-list">
                    {tecnicosInhabilitadosFiltrados.map((t) =>
                      renderTarjetaCuentaInhabilitada(
                        t.id_usuario,
                        nombreCompleto(t.first_name, t.last_name),
                        t.email,
                        true,
                      ),
                    )}
                  </div>
                </>
              )}
              {qc &&
                clientesInhabilitadosFiltrados.length === 0 &&
                tecnicosInhabilitadosFiltrados.length === 0 && (
                  <div className="ap-card">
                    <div className="ap-states">
                      <div className="ap-states-icon">
                        <FaUserCheck />
                      </div>
                      <h3>{t('adm.consultas.sinResultados')}</h3>
                      <p>{t('adm.consultas.sinResultadosCuentasSub')}</p>
                    </div>
                  </div>
                )}
            </>
          )}
        </div>
      )}

      {toast && (
        <div className={`ap-toast ${toast.tipo}`}>
          {toast.tipo === 'ok' ? <FaCircleCheck /> : <FaTriangleExclamation />}
          {toast.msg}
        </div>
      )}
    </motion.section>
  );
};

export default AdminConsultas;
