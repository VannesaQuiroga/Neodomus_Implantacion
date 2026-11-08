// Hook compartido de notificaciones para campana y apartado.
import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@services/api';
import { useAuth } from '@contexts/AuthContext';
import type {
  ProductoAdmin,
  SolicitudCuenta,
  SolicitudEmpleado,
} from '../types';

export type TipoNotificacion =
  | 'cuenta'
  | 'registro'
  | 'cita'
  | 'pedido'
  | 'stock'
  | 'sistema'
  | 'entrega'
  | 'reembolso'
  | 'devolucion'
  | 'producto'
  | 'promocion'
  | 'recogida'
  | 'novedad'
  | 'cupon'
  | 'asignacion'
  | 'recordatorio_cita'
  | 'recordatorio_producto'
  | 'respuesta_soporte';

export interface NotifAdmin {
  id: string;
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  fecha: string;
  leida: boolean;
  timestamp: number;
  accion?: { to: string; label: string };
  backendId?: number;
}

export type RolNotificaciones = 'administrador' | 'tecnico' | 'cliente';

interface PaginaProductos {
  data: ProductoAdmin[];
}

interface CitaReasignar {
  id_cita: number;
  id_cliente: number;
  cliente_nombre?: string | null;
  cliente_email?: string | null;
  cliente_telefono?: number | null;
  tipo_servicio: string;
  fecha: string;
  hora: string;
  direccion: string;
  estado: string;
  tecnico_actual_id?: number | null;
  tecnico_actual?: string | null;
  tecnico_actual_email?: string | null;
}

interface NotifPlataforma {
  id_notificacion: number;
  tipo: string;
  titulo: string;
  mensaje: string;
  leida: boolean;
  fecha_creacion?: string | null;
}

const TIPOS_VALIDOS: TipoNotificacion[] = [
  'cuenta',
  'registro',
  'cita',
  'pedido',
  'stock',
  'sistema',
  'entrega',
  'reembolso',
  'devolucion',
  'producto',
  'promocion',
  'recogida',
  'novedad',
  'cupon',
  'asignacion',
  'recordatorio_cita',
  'recordatorio_producto',
  'respuesta_soporte',
];

const ACCIONES_PLATAFORMA: Record<
  RolNotificaciones,
  Record<string, { to: string; label: string }>
> = {
  administrador: {
    reembolso: { to: '/admin/devoluciones', label: 'Ver reembolsos' },
    devolucion: { to: '/admin/devoluciones', label: 'Ver devoluciones' },
    cita: { to: '/admin/instalaciones', label: 'Ver citas' },
    pedido: { to: '/admin/pedidos', label: 'Ver pedidos' },
    entrega: { to: '/admin/pedidos', label: 'Ver entregas' },
    recogida: { to: '/admin/devoluciones', label: 'Ver devoluciones' },
    producto: { to: '/admin/productos', label: 'Ver productos' },
    promocion: { to: '/admin/novedades', label: 'Ver novedades' },
    novedad: { to: '/admin/novedades', label: 'Ver novedades' },
    cupon: { to: '/admin/novedades', label: 'Ver cupones' },
    asignacion: { to: '/admin/instalaciones', label: 'Ver citas' },
    cuenta: { to: '/admin/consultas#solicitudes-cuenta', label: 'Revisar solicitudes' },
    registro: { to: '/admin/clientes', label: 'Ver clientes' },
    stock: { to: '/admin/productos', label: 'Reabastecer' },
    sistema: { to: '/admin/notificaciones', label: 'Ver notificaciones' },
    recordatorio_cita: { to: '/admin/instalaciones', label: 'Ver citas' },
    recordatorio_producto: { to: '/admin/productos', label: 'Ver productos' },
  },
  tecnico: {
    recogida: { to: '/tecnico/devoluciones', label: 'Ver devoluciones' },
    devolucion: { to: '/tecnico/devoluciones', label: 'Ver devoluciones' },
    cita: { to: '/tecnico/citas', label: 'Ver mis citas' },
    entrega: { to: '/tecnico/entregas', label: 'Ver mis entregas' },
    reembolso: { to: '/tecnico/devoluciones', label: 'Ver devoluciones' },
    pedido: { to: '/tecnico/entregas', label: 'Ver mis entregas' },
    producto: { to: '/tecnico/novedades', label: 'Ver novedades' },
    promocion: { to: '/tecnico/novedades', label: 'Ver novedades' },
    novedad: { to: '/tecnico/novedades', label: 'Ver novedades' },
    cupon: { to: '/tecnico/novedades', label: 'Ver novedades' },
    asignacion: { to: '/tecnico/citas', label: 'Ver mis citas' },
    sistema: { to: '/dashboard/tecnico', label: 'Ver panel' },
    cuenta: { to: '/dashboard/tecnico', label: 'Ver panel' },
    registro: { to: '/dashboard/tecnico', label: 'Ver panel' },
    stock: { to: '/dashboard/tecnico', label: 'Ver panel' },
    recordatorio_cita: { to: '/tecnico/citas', label: 'Ver mis citas' },
    recordatorio_producto: { to: '/tecnico/entregas', label: 'Ver mis entregas' },
  },
  cliente: {
    respuesta_soporte: { to: '/ayuda', label: 'Ver respuesta de soporte' },
    devolucion: { to: '/perfil?tab=pedidos', label: 'Ver mis devoluciones' },
    reembolso: { to: '/perfil?tab=reembolsos', label: 'Ver mis reembolsos' },
    cita: { to: '/cliente/citas?vista=mis-citas', label: 'Ver mis citas' },
    recordatorio_cita: { to: '/cliente/citas?vista=mis-citas', label: 'Calificar servicio' },
    pedido: { to: '/perfil?tab=pedidos', label: 'Ver mis pedidos' },
    entrega: { to: '/perfil?tab=pedidos', label: 'Ver mis pedidos' },
    recogida: { to: '/perfil?tab=pedidos', label: 'Ver mis pedidos' },
    producto: { to: '/productos', label: 'Ver productos' },
    promocion: { to: '/productos', label: 'Ver promociones' },
    novedad: { to: '/perfil?tab=pedidos', label: 'Ver novedad' },
    cupon: { to: '/productos', label: 'Usar cupón' },
    asignacion: { to: '/perfil?tab=pedidos', label: 'Ver asignación' },
    recordatorio_producto: { to: '/perfil?tab=pedidos', label: 'Calificar productos' },
    sistema: { to: '/notificaciones', label: 'Ver notificaciones' },
    cuenta: { to: '/perfil', label: 'Ver mi perfil' },
    registro: { to: '/perfil', label: 'Ver mi perfil' },
    stock: { to: '/productos', label: 'Ver productos' },
  },
};

const formatoFecha = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatoFechaHora = (fecha?: string | null, hora?: string | null) => {
  if (!fecha) return '';
  const d = new Date(`${fecha}T${hora || '00:00'}`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const timestampFechaHora = (fecha?: string | null, hora?: string | null) => {
  if (!fecha) return 0;
  const ts = Date.parse(`${fecha}T${hora || '00:00'}`);
  return Number.isNaN(ts) ? 0 : ts;
};

const nombreServicio = (tipo?: string | null) => {
  const t = (tipo || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (t.includes('instalacion')) return 'instalación';
  if (t.includes('mantenimiento')) return 'mantenimiento';
  if (t.includes('reparacion')) return 'reparación';
  if (t.includes('revision')) return 'revisión';
  return tipo || 'servicio';
};

const normalizarTipo = (tipo: string): TipoNotificacion =>
  TIPOS_VALIDOS.includes(tipo as TipoNotificacion)
    ? (tipo as TipoNotificacion)
    : 'sistema';

const accionPlataforma = (rol: RolNotificaciones, tipo: string, titulo?: string) => {
  if (rol === 'cliente' && tipo === 'respuesta_soporte') {
    const idSolicitud = titulo?.match(/solicitud #(\d+)/i)?.[1];
    const query = new URLSearchParams({ tab: 'mis-solicitudes' });
    if (idSolicitud) query.set('id', idSolicitud);
    return { to: `/ayuda?${query.toString()}`, label: 'Ver respuesta de soporte' };
  }

  return ACCIONES_PLATAFORMA[rol][tipo] ?? {
    to: rol === 'administrador'
      ? '/admin/notificaciones'
      : rol === 'tecnico'
        ? '/dashboard/tecnico'
        : '/notificaciones',
    label: 'Ver notificación',
  };
};

const claveStorage = (rol: RolNotificaciones, cuenta: string) =>
  `notificaciones_leidas_${rol}_${cuenta}`;

const leerLeidasStorage = (clave: string): Record<string, boolean> => {
  if (!clave) return {};
  try {
    const guardadas = JSON.parse(localStorage.getItem(clave) || '{}');
    return guardadas && typeof guardadas === 'object' && !Array.isArray(guardadas)
      ? guardadas
      : {};
  } catch {
    return {};
  }
};

const guardarLeidasStorage = (clave: string, leidas: Record<string, boolean>) => {
  if (!clave) return;
  try {
    localStorage.setItem(clave, JSON.stringify(leidas));
  } catch {
    /* noop */
  }
};

export const useNotificacionesRol = (rol: RolNotificaciones | null) => {
  const { user } = useAuth();
  const cuenta = user ? `${user.id}:${user.correo}` : 'anon';
  const storageKey = rol ? claveStorage(rol, cuenta) : '';

  const [notificaciones, setNotificaciones] = useState<NotifAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const leidasRef = useRef<Record<string, boolean>>({});
  const notificacionesRef = useRef(notificaciones);
  const cuentaRef = useRef(storageKey);
  const peticionRef = useRef(0);
  const marcandoRef = useRef<Set<string>>(new Set());

  notificacionesRef.current = notificaciones;

  useEffect(() => {
    cuentaRef.current = storageKey;
    leidasRef.current = leerLeidasStorage(storageKey);
  }, [storageKey]);

  const recargar = useCallback(async (opciones?: { silencioso?: boolean }) => {
    if (!rol) {
      peticionRef.current += 1;
      setNotificaciones([]);
      setError(null);
      setCargando(false);
      return;
    }

    const peticion = ++peticionRef.current;
    if (!opciones?.silencioso) setCargando(true);

    leidasRef.current = leerLeidasStorage(storageKey);

    try {
      let notis: NotifAdmin[] = [];

      if (rol === 'administrador') {
        const [solsRes, prodsRes, solsEmpRes, reasigRes, plataformaRes] = await Promise.all([
          api.get<SolicitudCuenta[]>('/admin/account-requests'),
          api.get<PaginaProductos>('/productos/?limit=100&estado=activo'),
          api.get<SolicitudEmpleado[]>('/admin/account-requests/empleados'),
          api.get<CitaReasignar[]>('/citas/admin/reasignar-pendientes'),
          api.get<NotifPlataforma[]>('/notificaciones/mias'),
        ]);
        const solicitudes = solsRes.data || [];
        const solicitudesEmpleados = solsEmpRes.data || [];
        const productos = prodsRes.data?.data || [];
        const porReasignar = reasigRes.data || [];
        const plataforma = (plataformaRes.data || []).map((n) => ({
          id: `plat-${n.id_notificacion}`,
          backendId: n.id_notificacion,
          tipo: normalizarTipo(n.tipo),
          titulo: n.titulo,
          mensaje: n.mensaje,
          fecha: formatoFecha(n.fecha_creacion),
          timestamp: Date.parse(n.fecha_creacion || '') || 0,
          leida: Boolean(n.leida),
          accion: accionPlataforma(rol, n.tipo, n.titulo),
        }));

        const agotados = productos.filter(
          (p) => Number(p.stock_producto) <= 0 && !(p.variantes || []).some((v) => v.stock > 0),
        );

        notis = [
          ...plataforma,
          ...agotados.map((p) => ({
            id: `stock-${p.id_producto}`,
            tipo: 'stock' as TipoNotificacion,
            titulo: 'Producto agotado',
            mensaje: `${p.nombre_producto} quedó sin stock y ya no se muestra en la tienda`,
            fecha: formatoFecha(p.fecha_registro_producto),
            timestamp: Date.parse(p.fecha_registro_producto || '') || 0,
            leida: Boolean(leidasRef.current[`stock-${p.id_producto}`]),
            accion: { to: `/admin/productos/${p.id_producto}`, label: 'Reabastecer' },
          })),
          ...solicitudes.map((s) => ({
            id: `solicitud-${s.id}`,
            tipo: 'cuenta' as TipoNotificacion,
            titulo:
              s.tipo === 'habilitar'
                ? `Solicitud para habilitar la cuenta de ${s.cliente_nombre}`
                : `Solicitud para inhabilitar la cuenta de ${s.cliente_nombre}`,
            mensaje: s.motivo || 'El cliente envió la solicitud sin especificar un motivo.',
            fecha: formatoFecha(s.created_at),
            timestamp: Date.parse(s.created_at || '') || 0,
            leida: s.estado !== 'pendiente' || Boolean(leidasRef.current[`solicitud-${s.id}`]),
            accion: { to: '/admin/consultas#solicitudes-cuenta', label: 'Revisar solicitudes' },
          })),
          ...solicitudesEmpleados.map((s) => ({
            id: `solicitud-emp-${s.id}`,
            tipo: 'cuenta' as TipoNotificacion,
            titulo: `Solicitud para habilitar la cuenta del técnico ${s.empleado_nombre}`,
            mensaje: 'El técnico solicitó que su cuenta sea habilitada nuevamente.',
            fecha: formatoFecha(s.created_at),
            timestamp: Date.parse(s.created_at || '') || 0,
            leida: s.estado !== 'pendiente' || Boolean(leidasRef.current[`solicitud-emp-${s.id}`]),
            accion: { to: '/admin/consultas#solicitudes-cuenta', label: 'Revisar solicitudes' },
          })),
          ...porReasignar.map((c) => ({
            id: `reasignar-${c.id_cita}`,
            tipo: 'cita' as TipoNotificacion,
            titulo: `Cita por reasignar de ${c.cliente_nombre || 'cliente'}`,
            mensaje: `${nombreServicio(c.tipo_servicio)} el ${formatoFechaHora(c.fecha, c.hora)} a las ${c.hora} — el técnico ${c.tecnico_actual || 'asignado'} fue inhabilitado`,
            fecha: formatoFechaHora(c.fecha, c.hora),
            timestamp: timestampFechaHora(c.fecha, c.hora),
            leida: Boolean(leidasRef.current[`reasignar-${c.id_cita}`]),
            accion: { to: '/admin/instalaciones', label: 'Reasignar' },
          })),
        ];
      } else {
        const plataformaRes = await api.get<NotifPlataforma[]>('/notificaciones/mias');
        notis = (plataformaRes.data || []).map((n) => ({
          id: `plat-${n.id_notificacion}`,
          backendId: n.id_notificacion,
          tipo: normalizarTipo(n.tipo),
          titulo: n.titulo,
          mensaje: n.mensaje,
          fecha: formatoFecha(n.fecha_creacion),
          timestamp: Date.parse(n.fecha_creacion || '') || 0,
          leida: Boolean(n.leida),
          accion: accionPlataforma(rol, n.tipo, n.titulo),
        }));
      }

      if (peticion !== peticionRef.current) return;

      const ordenadas = notis.sort((a, b) => b.timestamp - a.timestamp);
      setNotificaciones(ordenadas.slice(0, 60));
      setError(null);
    } catch (err: any) {
      if (peticion !== peticionRef.current) return;
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        window.dispatchEvent(new CustomEvent('neodomus:revalidar-sesion'));
      }
      setError('No se pudieron cargar las notificaciones.');
    } finally {
      if (peticion === peticionRef.current) setCargando(false);
    }
  }, [rol, storageKey]);

  useEffect(() => {
    if (!rol) {
      peticionRef.current += 1;
      setNotificaciones([]);
      setCargando(false);
      return;
    }
    void recargar();
    return () => {
      peticionRef.current += 1;
    };
  }, [rol, storageKey, recargar]);

  useEffect(() => {
    if (!rol) return;
    const intervalo = window.setInterval(() => {
      void recargar({ silencioso: true });
    }, 30000);
    return () => window.clearInterval(intervalo);
  }, [rol, recargar]);

  useEffect(() => {
    const onRefresh = () => {
      void recargar({ silencioso: true });
    };
    window.addEventListener('notificaciones-refresh', onRefresh);
    return () => window.removeEventListener('notificaciones-refresh', onRefresh);
  }, [recargar]);

  const marcarLeida = useCallback(async (id: string): Promise<boolean> => {
    if (!rol || marcandoRef.current.has(id)) return false;
    const actual = notificacionesRef.current.find((n) => n.id === id);
    if (!actual) return false;
    if (actual.leida) return true;

    const cuentaAlIniciar = cuentaRef.current;
    // Marcado optimista: el punto deja de contar al instante; si el PATCH
    // falla, se restituye el estado previo de esa notificación.
    marcandoRef.current.add(id);

    setNotificaciones((prev) =>
      prev.map((n) => (n.id === id ? { ...n, leida: true } : n)),
    );

    try {
      if (actual.backendId != null) {
        await api.patch(`/notificaciones/${actual.backendId}/leida`);
        if (cuentaRef.current !== cuentaAlIniciar) {
          setNotificaciones((prev) =>
            prev.map((n) => (n.id === id ? { ...n, leida: false } : n)),
          );
          return false;
        }
      }

      if (actual.backendId == null && !leidasRef.current[id]) {
        const next = { ...leidasRef.current, [id]: true };
        leidasRef.current = next;
        guardarLeidasStorage(storageKey, next);
      }

      setError(null);
      window.dispatchEvent(new Event('notificaciones-refresh'));
      return true;
    } catch {
      if (cuentaRef.current === cuentaAlIniciar) {
        setNotificaciones((prev) =>
          prev.map((n) => (n.id === id ? { ...n, leida: false } : n)),
        );
        setError('No se pudo marcar la notificación como leída.');
      }
      return false;
    } finally {
      marcandoRef.current.delete(id);
    }
  }, [rol, storageKey]);

  const leerTodas = useCallback(async (): Promise<boolean> => {
    if (!rol) return false;
    const actuales = notificacionesRef.current;
    if (actuales.length === 0 || actuales.every((n) => n.leida)) return true;

    const cuentaAlIniciar = cuentaRef.current;
    // Escala del marcado: el contador debe irse a cero de inmediato; si el
    // PATCH falla, se restituye el estado previo en lugar de engañar al usuario.
    const idsPrevioSinLeer = actuales.filter((n) => !n.leida).map((n) => n.id);
    const debeParcharServidor = actuales.some((n) => n.backendId != null && !n.leida);

    setNotificaciones((prev) => prev.map((n) => ({ ...n, leida: true })));

    try {
      if (debeParcharServidor) {
        await api.patch('/notificaciones/leer-todas');
        if (cuentaRef.current !== cuentaAlIniciar) return false;
      }

      const derivadas = actuales.filter((n) => n.backendId == null).map((n) => n.id);

      if (derivadas.length > 0) {
        const next = { ...leidasRef.current };
        derivadas.forEach((id) => {
          next[id] = true;
        });
        leidasRef.current = next;
        guardarLeidasStorage(storageKey, next);
      }

      setError(null);
      window.dispatchEvent(new Event('notificaciones-refresh'));
      return true;
    } catch {
      if (cuentaRef.current === cuentaAlIniciar) {
        // Reversión exacta: solo vuelven a "sin leer" las que antes lo estaban.
        setNotificaciones((prev) =>
          prev.map((n) => (idsPrevioSinLeer.includes(n.id) ? { ...n, leida: false } : n)),
        );
        setError('No se pudieron marcar las notificaciones como leídas.');
      }
      return false;
    }
  }, [rol, storageKey]);

  const noLeidas = notificaciones.filter((n) => !n.leida).length;

  return { notificaciones, cargando, noLeidas, error, recargar, marcarLeida, leerTodas };
};

export const useAdminNotificaciones = () => useNotificacionesRol('administrador');
