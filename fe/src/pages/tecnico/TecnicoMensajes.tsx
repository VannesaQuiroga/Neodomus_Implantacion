// Pantalla TecnicoMensajes de Neodomus. Reúne el estado y las acciones de su vista.
import { useState, useEffect } from 'react';
import { FaEnvelope, FaMessage, FaUserTie } from 'react-icons/fa6';
import { useIdioma } from '@i18n/IdiomaContext';
import api from '@services/api';
import { tabGet } from '@utils/tabStorage';
import '@styles/admin-panel.css';

const MENSAJES_KEY = 'tecMensajes';

interface Mensaje {
  de: 'cliente' | 'tecnico';
  texto: string;
  hora: string;
}

interface Conversacion {
  id: number;
  cliente: string;
  email: string;
  mensajes: Mensaje[];
  leido: boolean;
}

interface Cliente {
  id_cliente: number;
  nombre: string;
  email?: string | null;
}

// accede a localStorage para conservar o recuperar datos locales.
const cargarConversaciones = (): Conversacion[] => {
  try {
    const raw = localStorage.getItem(MENSAJES_KEY);
    if (raw) return JSON.parse(raw) as Conversacion[];
  } catch {
    // almacenamiento corrupto: se re-sembrará
  }
  return [];
};

// accede a localStorage para conservar o recuperar datos locales.
const guardarConversaciones = (conversaciones: Conversacion[]) => {
  try {
    localStorage.setItem(MENSAJES_KEY, JSON.stringify(conversaciones));
  } catch {
    // almacenamiento no disponible: continuamos igual
  }
};

const sembrarConversaciones = (clientes: Cliente[], tecnicoNombre: string): Conversacion[] => {
  const previas = cargarConversaciones();
  if (previas.length > 0) return previas;

  const ahora = new Date().toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const nuevas: Conversacion[] = clientes.slice(0, 5).map((cliente, i) => ({
    id: cliente.id_cliente,
    cliente: cliente.nombre,
    email: cliente.email || '',
    leido: i !== 0,
    mensajes: [
      {
        de: 'cliente',
        texto: `Hola, soy ${cliente.nombre}. Quería confirmar los detalles de mi cita agendada con Neodomus.`,
        hora: ahora,
      },
      {
        de: 'tecnico',
        texto: `Hola ${cliente.nombre}, soy ${tecnicoNombre}. Claro, ya tengo tu cita registrada y estaré atento. ¡Saludos!`,
        hora: ahora,
      },
    ],
  }));

  guardarConversaciones(nuevas);
  return nuevas;
};

// Comunica con el backend mediante GET '/tecnicos/mis-clientes'.
const TecnicoMensajes = () => {
  const { t } = useIdioma();
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [activaId, setActivaId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Comunica con el backend mediante GET '/tecnicos/mis-clientes'.
    const cargar = async () => {
      try {
        const res = await api.get('/tecnicos/mis-clientes');
        const clientes = (Array.isArray(res.data) ? res.data : []) as Cliente[];
        const storedUser = tabGet('user');
        let tecnicoNombre = 'Técnico';
        if (storedUser) {
          try {
            tecnicoNombre = (JSON.parse(storedUser).nombre as string) || tecnicoNombre;
          } catch {
            // ignorar
          }
        }
        const sembradas = sembrarConversaciones(clientes, tecnicoNombre);
        setConversaciones(sembradas);
        if (sembradas.length > 0 && activaId === null) {
          setActivaId(sembradas[0].id);
        }
      } catch (err) {
        console.error('Error cargando mensajes:', err);
      } finally {
        setLoading(false);
      }
    };
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abrirConversacion = (id: number) => {
    setActivaId(id);
    setConversaciones((prev) => {
      const siguiente = prev.map((c) => (c.id === id ? { ...c, leido: true } : c));
      guardarConversaciones(siguiente);
      return siguiente;
    });
  };

  const activa = conversaciones.find((c) => c.id === activaId) || null;
  const noLeidas = conversaciones.filter((c) => !c.leido).length;

  return (
    <div className="admin-panel">
      <header className="ap-header">
        <div>
          <h1 className="ap-title"><FaMessage /> {t('tec.mensajesTitulo')}</h1>
          <p className="ap-subtitle">{t('tec.mensajesSub')}</p>
        </div>
        {noLeidas > 0 && (
          <div className="ap-header-right">
            <span className="ap-badge warn">{t('tec.nuevo')} · {noLeidas}</span>
          </div>
        )}
      </header>

      <div className="ap-card" style={{ marginTop: 8 }}>
        {loading ? (
          <div className="ap-states">
            <span className="ap-loader" />
            <h3>{t('tec.cargandoDatos')}</h3>
          </div>
        ) : conversaciones.length === 0 ? (
          <div className="ap-states">
            <div className="ap-states-icon"><FaEnvelope /></div>
            <h3>{t('tec.sinMensajes')}</h3>
            <p>{t('tec.sinMensajesHint')}</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 0.9fr) 1.4fr', gap: 16 }}>
            <div
              className="ap-table-wrap"
              style={{ maxHeight: 520, overflowY: 'auto', border: 'none', background: 'transparent' }}
            >
              <div style={{ padding: '10px 4px', color: '#9f9f9f', fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {t('tec.conversaciones')}
              </div>
              {conversaciones.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => abrirConversacion(c.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '12px 10px',
                    marginBottom: 6,
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: activaId === c.id ? 'rgba(212,165,75,0.10)' : 'rgba(255,255,255,0.02)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span className="ap-initials">
                    {c.cliente.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('')}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ display: 'block', color: '#e6e6e6', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.cliente}
                    </strong>
                    <span style={{ display: 'block', color: '#9f9f9f', fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.mensajes[c.mensajes.length - 1]?.texto}
                    </span>
                  </div>
                  {!c.leido && <span className="ap-badge warn">{t('tec.nuevo')}</span>}
                </button>
              ))}
            </div>

            <div
              style={{
                border: '1px solid rgba(255,255,255,0.09)',
                borderRadius: 16,
                background: 'rgba(17,17,17,0.75)',
                minHeight: 480,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {!activa ? (
                <div className="ap-states" style={{ flex: 1 }}>
                  <div className="ap-states-icon"><FaMessage /></div>
                  <h3>{t('tec.mensajeVacio')}</h3>
                </div>
              ) : (
                <>
                  <div
                    style={{
                      padding: '14px 18px',
                      borderBottom: '1px solid rgba(255,255,255,0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <span className="ap-initials">
                      {activa.cliente.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('')}
                    </span>
                    <div>
                      <strong style={{ color: '#fff', fontSize: '0.9rem', display: 'block' }}>{activa.cliente}</strong>
                      <span style={{ color: '#9f9f9f', fontSize: '0.75rem' }}>{activa.email || '—'}</span>
                    </div>
                  </div>

                  <div style={{ flex: 1, padding: '16px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {activa.mensajes.map((m, i) => (
                      <div
                        key={i}
                        style={{
                          alignSelf: m.de === 'tecnico' ? 'flex-end' : 'flex-start',
                          maxWidth: '75%',
                          padding: '10px 14px',
                          borderRadius: 14,
                          background: m.de === 'tecnico' ? 'rgba(212,165,75,0.16)' : 'rgba(255,255,255,0.05)',
                          border: `1px solid ${m.de === 'tecnico' ? 'rgba(212,165,75,0.35)' : 'rgba(255,255,255,0.08)'}`,
                        }}
                      >
                        <p style={{ margin: 0, color: '#e6e6e6', fontSize: '0.85rem' }}>{m.texto}</p>
                        <span style={{ display: 'block', marginTop: 4, color: '#9f9f9f', fontSize: '0.68rem' }}>
                          {m.de === 'tecnico' ? t('tec.tecnico') : t('tec.cliente')} · {m.hora}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div style={{ padding: '12px 18px', borderTop: '1px solid rgba(255,255,255,0.08)', color: '#9f9f9f', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FaUserTie /> {t('tec.responde')}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TecnicoMensajes;
