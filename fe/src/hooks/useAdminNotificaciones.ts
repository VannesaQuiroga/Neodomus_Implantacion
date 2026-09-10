import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@services/api';
import type {
  ProductoAdmin,
  SolicitudCuenta,
  SolicitudEmpleado,
} from '../types';

export type TipoNotificacion = 'cuenta' | 'registro' | 'cita' | 'pedido' | 'stock' | 'sistema' | 'entrega' | 'reembolso' | 'devolucion' | 'producto' | 'promocion' | 'recogida' | 'recordatorio_cita' | 'recordatorio_producto';

export interface NotifAdmin {
  id: string;
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  fecha: string;
  leida: boolean;
  timestamp: number;
  accion?: { to: string; label: string };
}

export type RolNotificaciones = 'administrador' | 'tecnico' | 'cliente';

interface PaginaProductos {
  data: ProductoAdmin[];
}

interface CitaTecnico {
  id_cita: number;
  fecha: string;
  hora: string;
  estado: string;
  tipo_servicio: string;
  cliente: string;
}

interface CitaCliente {
  id_cita: number;
  estado: string;
  created_at?: string | null;
  tipo_servicio: string;
  fecha: string;
  hora: string;
}

interface PedidoCliente {
  id_pedido: number;
  fecha?: string | null;
  total?: number | null;
  estado?: string | null;
}

interface NotifPlataforma {
  id_notificacion: number;
  tipo: string;
  titulo: string;
  mensaje: string;
  leida: boolean;
  fecha_creacion?: string | null;
}

const TIPOS_PLATAFORMA_CLIENTE: TipoNotificacion[] = [
  'reembolso',
  'entrega',
  'devolucion',
  'producto',
  'promocion',
  'recordatorio_cita',
  'recordatorio_producto',
];

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

const formatoFecha = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatoFechaHora = (fecha?: string | null, hora?: string | null) => {
  if (!fecha) return '';
  const d = new Date(`${fecha}T${hora || '00:00'}`);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const timestampFechaHora = (fecha?: string | null, hora?: string | null) => {
  if (!fecha) return 0;
  const ts = Date.parse(`${fecha}T${hora || '00:00'}`);
  return isNaN(ts) ? 0 : ts;
};

const nombreServicio = (tipo?: string | null) => {
  const t = (tipo || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (t.includes('instalacion')) return 'instalación';
  if (t.includes('mantenimiento')) return 'mantenimiento';
  if (t.includes('reparacion')) return 'reparación';
  if (t.includes('revision')) return 'revisión';
  return tipo || 'servicio';
};

const esInstalacionNotif = (tipo?: string | null) => {
  const t = (tipo || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return t.includes('instalacion');
};

const claveStorage = (rol: RolNotificaciones) => `notificaciones_leidas_${rol}`;

const usarLeidasStorage = (rol: RolNotificaciones): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem(claveStorage(rol)) || '{}');
  } catch {
    return {};
  }
};

export const useNotificacionesRol = (rol: RolNotificaciones | null) => {
  const [notificaciones, setNotificaciones] = useState<NotifAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [leidas, setLeidas] = useState<Record<string, boolean>>(() =>
    rol ? usarLeidasStorage(rol) : {},
  );

  // Ref espejo: el poll del intervalo captura una sola instancia de
  // `recargar`, así que debe leer SIEMPRE el valor vigente de `leidas`.
  const leidasRef = useRef(leidas);
  useEffect(() => {
    leidasRef.current = leidas;
  }, [leidas]);

  const marcarLeida = (id: string) => {
    if (!rol) return;
    setNotificaciones((prev) =>
      prev.map((n) => (n.id === id ? { ...n, leida: true } : n)),
    );
    setLeidas((prev) => {
      if (prev[id]) return prev;
      const next = { ...prev, [id]: true };
      localStorage.setItem(claveStorage(rol), JSON.stringify(next));
      return next;
    });
    // Si es una notificación de plataforma (plat-), marcar en el backend
    if (id.startsWith('plat-')) {
      const backendId = id.replace('plat-', '');
      api.patch(`/notificaciones/${backendId}/leida`).catch(() => {});
    }
    // Notificar a otros componentes que el conteo cambió
    window.dispatchEvent(new Event('notificaciones-refresh'));
  };

  const recargar = useCallback(async (opciones?: { silencioso?: boolean }) => {
    if (!rol) {
      setCargando(false);
      return;
    }
    if (!opciones?.silencioso) setCargando(true);
    try {
      let notis: NotifAdmin[] = [];

      if (rol === 'administrador') {
        const [solsRes, prodsRes, solsEmpRes, reasigRes] = await Promise.all([
          api.get<SolicitudCuenta[]>('/admin/account-requests'),
          api.get<PaginaProductos>('/productos/?limit=100&estado=activo'),
          api.get<SolicitudEmpleado[]>('/admin/account-requests/empleados'),
          api.get<CitaReasignar[]>('/citas/admin/reasignar-pendientes'),
        ]);
        const solicitudes = solsRes.data || [];
        const solicitudesEmpleados = solsEmpRes.data || [];
        const productos = prodsRes.data?.data || [];
        const porReasignar = reasigRes.data || [];

        const agotados = productos.filter(
          (p) => Number(p.stock_producto) <= 0 && !(p.variantes || []).some((v) => v.stock > 0)
        );

        notis = [
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
      } else if (rol === 'tecnico') {
        const [citasRes, notisRes] = await Promise.all([
          api.get<CitaTecnico[]>('/tecnicos/mis-citas'),
          api.get<NotifPlataforma[]>('/notificaciones/mias').catch(() => ({ data: [] as NotifPlataforma[] })),
        ]);
        const citas = citasRes.data || [];

        // Notificaciones de plataforma del técnico (recogidas de devoluciones,
        // citas, etc.) con enlace directo a su módulo.
        const plataforma = ((notisRes.data || []) as NotifPlataforma[]).map((n) => ({
          id: `plat-${n.id_notificacion}`,
          tipo: (n.tipo === 'recogida' ? 'entrega' : n.tipo) as TipoNotificacion,
          titulo: n.titulo,
          mensaje: n.mensaje,
          fecha: formatoFecha(n.fecha_creacion),
          timestamp: Date.parse(n.fecha_creacion || '') || 0,
          leida: n.leida || Boolean(leidasRef.current[`plat-${n.id_notificacion}`]),
          accion:
            n.tipo === 'recogida'
              ? { to: '/tecnico/devoluciones', label: 'Ver devoluciones' }
              : { to: '/tecnico/citas', label: 'Ver mis citas' },
        }));

        notis = [
          ...plataforma,
          ...citas.map((c) => ({
            id: `cita-${c.id_cita}`,
            tipo: 'cita' as TipoNotificacion,
            titulo: esInstalacionNotif(c.tipo_servicio)
              ? 'Instalación agendada'
              : (c.estado === 'Confirmada' ? 'Cita confirmada' : 'Nueva cita asignada'),
            mensaje: `Servicio de ${nombreServicio(c.tipo_servicio)} para ${c.cliente} el ${formatoFechaHora(c.fecha, c.hora)} a las ${c.hora}`,
            fecha: formatoFechaHora(c.fecha, c.hora),
            timestamp: timestampFechaHora(c.fecha, c.hora),
            leida: c.estado !== 'Pendiente' && c.estado !== 'Confirmada'
              ? true
              : Boolean(leidasRef.current[`cita-${c.id_cita}`]),
            accion: { to: '/tecnico/citas', label: 'Ver mis citas' },
          })),
        ];
      } else {
        const [citasRes, pedidosRes, notisRes] = await Promise.all([
          api.get<CitaCliente[]>('/citas/mis-citas'),
          api.get<PedidoCliente[]>('/pedidos/mis-pedidos'),
          api.get<NotifPlataforma[]>('/notificaciones/mias'),
        ]);
        const citas = citasRes.data || [];
        const pedidos = pedidosRes.data || [];

        const plataforma = ((notisRes.data || []) as NotifPlataforma[])
          .filter((n) => (TIPOS_PLATAFORMA_CLIENTE as string[]).includes(n.tipo))
          .map((n) => ({
            id: `plat-${n.id_notificacion}`,
            tipo: n.tipo as TipoNotificacion,
            titulo: n.titulo,
            mensaje: n.mensaje,
            fecha: formatoFecha(n.fecha_creacion),
            timestamp: Date.parse(n.fecha_creacion || '') || 0,
            leida: n.leida || Boolean(leidasRef.current[`plat-${n.id_notificacion}`]),
            accion:
              n.tipo === 'devolucion'
                ? { to: '/perfil?tab=pedidos', label: 'Ver mis devoluciones' }
                : n.tipo === 'recordatorio_cita'
                  ? { to: '/cliente/citas?vista=mis-citas', label: 'Calificar servicio' }
                  : n.tipo === 'recordatorio_producto'
                    ? { to: '/perfil?tab=pedidos', label: 'Calificar productos' }
                    : { to: '/perfil?tab=reembolsos', label: 'Ver mis reembolsos' },
          }));

        notis = [
          ...plataforma,
          ...citas.map((c) => ({
            id: `cita-${c.id_cita}`,
            tipo: 'cita' as TipoNotificacion,
            titulo: esInstalacionNotif(c.tipo_servicio)
              ? 'Instalación agendada'
              : (c.estado === 'Confirmada' ? 'Cita confirmada' : 'Solicitud de cita registrada'),
            mensaje: `Tienes una cita de ${nombreServicio(c.tipo_servicio)} el ${formatoFechaHora(c.fecha, c.hora)} a las ${c.hora}`,
            fecha: formatoFechaHora(c.fecha, c.hora),
            timestamp: timestampFechaHora(c.fecha, c.hora),
            leida: c.estado !== 'Pendiente' && c.estado !== 'Confirmada'
              ? true
              : Boolean(leidasRef.current[`cita-${c.id_cita}`]),
            accion: { to: '/cliente/citas?vista=mis-citas', label: 'Ver mis citas' },
          })),
          ...pedidos.map((p) => ({
            id: `pedido-${p.id_pedido}`,
            tipo: 'pedido' as TipoNotificacion,
            titulo: 'Nuevo pedido',
            mensaje: `Tu pedido #${p.id_pedido} por $${Number(p.total || 0).toLocaleString()} está ${p.estado?.toLowerCase() || 'en proceso'}`,
            fecha: formatoFecha(p.fecha),
            timestamp: Date.parse(p.fecha || '') || 0,
            leida: p.estado !== 'Pago pendiente' && p.estado !== 'Pagado'
              ? true
              : Boolean(leidasRef.current[`pedido-${p.id_pedido}`]),
            accion: { to: '/perfil?tab=pedidos', label: 'Ver mis pedidos' },
          })),
        ];
      }

      const ordenadas = notis.sort((a, b) => b.timestamp - a.timestamp);
      setNotificaciones(ordenadas.slice(0, 60));
    } catch (err: any) {
      setNotificaciones([]);
      // 401/403 en los endpoints del rol = la cookie del navegador pertenece a
      // OTRA cuenta (se inició sesión en otra pestaña). Se pide a AuthContext
      // revalidar la pestaña para que deje de sondear con un rol que ya no es
      // suyo (evita los bucles de 403 en el panel administrativo).
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        window.dispatchEvent(new CustomEvent('neodomus:revalidar-sesion'));
      }
    } finally {
      setCargando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rol]);

  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!rol) return;
    const intervalo = window.setInterval(() => {
      recargar({ silencioso: true });
    }, 30000);
    return () => window.clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rol]);

  useEffect(() => {
    const onRefresh = () => recargar({ silencioso: true });
    window.addEventListener('notificaciones-refresh', onRefresh);
    return () => window.removeEventListener('notificaciones-refresh', onRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rol]);

  const noLeidas = notificaciones.filter((n) => !n.leida).length;

  return { notificaciones, cargando, noLeidas, recargar, marcarLeida };
};

export const useAdminNotificaciones = () => useNotificacionesRol('administrador');
