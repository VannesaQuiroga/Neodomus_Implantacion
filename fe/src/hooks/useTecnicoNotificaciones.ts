// Hook reutilizable useTecnicoNotificaciones; concentra esta lógica para las pantallas que lo utilizan.
import { useCallback, useEffect, useState } from 'react';
import api from '@services/api';
import type { NotifAdmin, TipoNotificacion } from './useAdminNotificaciones';

interface NotifPlataforma {
  id_notificacion: number;
  tipo: string;
  titulo: string;
  mensaje: string;
  leida: boolean;
  fecha_creacion?: string | null;
}

const TIPOS_PLATAFORMA: TipoNotificacion[] = ['entrega', 'cita', 'recogida', 'reembolso'];

const rutaPorTipo = (tipo: string): { to: string; label: string } => {
  if (tipo === 'recogida') return { to: '/tecnico/devoluciones', label: 'Ver devoluciones' };
  if (tipo === 'cita' || tipo === 'entrega') return { to: '/tecnico/citas', label: 'Ver mis citas' };
  return { to: '/dashboard/tecnico', label: 'Ver panel' };
};

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

// Comunica con el backend mediante GET '/notificaciones/mias', PATCH `/notificaciones/${id}/leida`, PATCH '/notificaciones/leer-todas'; registra escuchas de eventos para sincronizar la vista.
export const useTecnicoNotificaciones = () => {
  const [notificaciones, setNotificaciones] = useState<NotifAdmin[]>([]);
  const [cargando, setCargando] = useState(true);

  const recargar = useCallback(async (opciones?: { silencioso?: boolean }) => {
    if (!opciones?.silencioso) setCargando(true);
    try {
      const res = await api.get<NotifPlataforma[]>('/notificaciones/mias');
      const items = (res.data || []).map((n) => ({
        id: String(n.id_notificacion),
        tipo: ((TIPOS_PLATAFORMA as string[]).includes(n.tipo) ? n.tipo : 'sistema') as TipoNotificacion,
        titulo: n.titulo,
        mensaje: n.mensaje,
        fecha: formatoFecha(n.fecha_creacion),
        timestamp: Date.parse(n.fecha_creacion || '') || 0,
        leida: n.leida,
        accion: rutaPorTipo(n.tipo),
      }));
      setNotificaciones(items);
    } catch {
      setNotificaciones([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    recargar();
    const intervalo = window.setInterval(() => recargar({ silencioso: true }), 30000);
    const onRefresh = () => recargar({ silencioso: true });
    window.addEventListener('notificaciones-refresh', onRefresh);
    return () => {
      window.clearInterval(intervalo);
      window.removeEventListener('notificaciones-refresh', onRefresh);
    };
  }, [recargar]);

  const marcarLeida = useCallback(
    async (id: string) => {
      setNotificaciones((prev) => prev.map((n) => (n.id === id ? { ...n, leida: true } : n)));
      try {
        await api.patch(`/notificaciones/${id}/leida`);
      } catch {
        recargar({ silencioso: true });
      }
    },
    [recargar]
  );

  const leerTodas = useCallback(async () => {
    setNotificaciones((prev) => prev.map((n) => ({ ...n, leida: true })));
    try {
      await api.patch('/notificaciones/leer-todas');
    } catch {
      recargar({ silencioso: true });
    }
  }, [recargar]);

  const noLeidas = notificaciones.filter((n) => !n.leida).length;

  return { notificaciones, cargando, noLeidas, recargar, marcarLeida, leerTodas };
};