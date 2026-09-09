import { useEffect, useState, useCallback } from 'react';
import {
  FaCircleCheck,
  FaTruckFast,
  FaPercent,
  FaArrowTrendUp,
  FaCircleInfo,
  FaBoxesPacking,
  FaCheck,
} from 'react-icons/fa6';
import { useIdioma } from '@i18n/IdiomaContext';
import api from '@services/api';
import '@styles/notificaciones.css';

type TipoNotificacion = 'confirmacion' | 'pedido' | 'promocion' | 'novedad' | 'sistema' | 'entrega_programada';

interface Notificacion {
  id: number;
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  fecha: string;
  leida: boolean;
}

interface NotifBackend {
  id_notificacion: number;
  tipo: string;
  titulo: string;
  mensaje: string;
  fecha_creacion: string;
  leida: boolean;
}

const TIPO_META: Record<TipoNotificacion, { icono: React.ReactNode; etiqueta: string; clase: string }> = {
  confirmacion: { icono: <FaCircleCheck />, etiqueta: 'Cita confirmada', clase: 'notif-confirmacion' },
  pedido: { icono: <FaTruckFast />, etiqueta: 'Estado de pedido', clase: 'notif-pedido' },
  promocion: { icono: <FaPercent />, etiqueta: 'Promoción', clase: 'notif-promocion' },
  novedad: { icono: <FaArrowTrendUp />, etiqueta: 'Novedad', clase: 'notif-novedad' },
  sistema: { icono: <FaCircleInfo />, etiqueta: 'Sistema', clase: 'notif-sistema' },
  entrega_programada: { icono: <FaBoxesPacking />, etiqueta: 'Entrega programada', clase: 'notif-entrega' },
};

const TIPOS_CLIENTE = ['reembolso', 'entrega', 'producto', 'promocion', 'confirmacion', 'pedido', 'entrega_programada'];

const ETIQUETA_TRAD: Record<TipoNotificacion, string> = {
  confirmacion: 'notif.etiquetaConfirmacion',
  pedido: 'notif.etiquetaPedido',
  promocion: 'notif.etiquetaPromocion',
  novedad: 'notif.etiquetaNovedad',
  sistema: 'notif.etiquetaSistema',
  entrega_programada: 'notif.etiquetaEntregaProgramada',
};

const Notificaciones = () => {
  const { t } = useIdioma();
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await api.get<NotifBackend[]>('/notificaciones/mias');
      const datos = (res.data ?? [])
        .filter((n) => TIPOS_CLIENTE.includes(n.tipo))
        .map((n) => ({
          id: n.id_notificacion,
          tipo: (n.tipo as TipoNotificacion) || 'sistema',
          titulo: n.titulo,
          mensaje: n.mensaje,
          fecha: n.fecha_creacion,
          leida: n.leida,
        }));
      setNotificaciones(datos);
      setError(null);
    } catch {
      setError('No se pudieron cargar las notificaciones.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
    const intervalo = setInterval(() => void cargar(), 30_000);
    return () => clearInterval(intervalo);
  }, [cargar]);

  const marcarLeida = async (id: number) => {
    try {
      await api.patch(`/notificaciones/${id}/leida`);
      setNotificaciones((prev) =>
        prev.map((n) => (n.id === id ? { ...n, leida: true } : n))
      );
      window.dispatchEvent(new Event('notificaciones-refresh'));
    } catch {
      /* noop */
    }
  };

  return (
    <main className="notif-page app-glass">
      <section className="notif-content">
        <header className="notif-header">
          <div>
            <h1>{t('notif.titulo')}</h1>
            <p>{t('notif.subtitulo')}</p>
          </div>
        </header>

        {cargando && <p className="notif-vacio">Cargando...</p>}
        {error && <p className="notif-vacio">{error}</p>}
        {!cargando && notificaciones.length === 0 && (
          <p className="notif-vacio">Sin notificaciones</p>
        )}

        <div className="notif-list">
          {notificaciones.map((notificacion) => {
            const meta = TIPO_META[notificacion.tipo] ?? TIPO_META.sistema;
            return (
              <article
                key={notificacion.id}
                className={`notif-item ${meta.clase}`}
                style={{
                  opacity: notificacion.leida ? 0.6 : 1,
                  cursor: notificacion.leida ? 'default' : 'pointer',
                }}
                onClick={() => {
                  if (!notificacion.leida) marcarLeida(notificacion.id);
                }}
              >
                <div className="notif-item-icon">{meta.icono}</div>
                <div className="notif-item-body">
                  <div className="notif-item-top">
                    <span className="notif-badge">{t(ETIQUETA_TRAD[notificacion.tipo] ?? 'notif.etiquetaSistema')}</span>
                    <span className="notif-fecha">{notificacion.fecha?.slice(0, 10)}</span>
                  </div>
                  <h3 className="notif-titulo">{notificacion.titulo}</h3>
                  <p className="notif-mensaje">{notificacion.mensaje}</p>
                </div>
                {notificacion.leida && (
                  <div style={{ color: '#3d7a3d', marginLeft: 8, flexShrink: 0 }}>
                    <FaCheck />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
};

export default Notificaciones;
