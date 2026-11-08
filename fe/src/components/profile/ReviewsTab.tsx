// Presenta las valoraciones disponibles en el perfil del cliente.
import { useEffect, useState } from 'react';
import { FaRegStar, FaStar, FaUserTie, FaBoxOpen, FaPlus, FaTrashCan } from 'react-icons/fa6';
import api from '@services/api';
import { useIdioma } from '@i18n/IdiomaContext';
import { getResenas, saveItem, PF_RESENAS_KEY, Resena } from '@utils/profileStorage';
import SectionHeader from './SectionHeader';
import { NotifyFn } from './PersonalTab';

interface ResenaTecnico {
  id_calificacion: number;
  calificacion: number;
  comentario?: string | null;
  created_at?: string | null;
  id_cita: number;
  id_tecnico: number;
  nombre_tecnico?: string | null;
  foto_tecnico?: string | null;
  tipo_servicio?: string | null;
  fecha_cita?: string | null;
  hora_cita?: string | null;
}

interface CitaPendiente {
  id_cita: number;
  estado: string;
  calificada?: boolean;
  nombre_tecnico?: string | null;
  tecnico_foto_url?: string | null;
  tipo_servicio?: string | null;
  fecha?: string | null;
  hora?: string | null;
}

interface ResenaProducto {
  id_calificacion_producto: number;
  id_pedido: number;
  id_producto: number;
  nombre_producto: string;
  producto_imagen?: string | null;
  calificacion: number;
  comentario?: string | null;
  foto_url?: string | null;
  created_at?: string | null;
}

const productosSugeridos = [
  'Kit domótica Neodomus Smart Home',
  'Cámara IP 4K exterior',
  'Sensor de movimiento Wi-Fi',
  'Enchufe inteligente Wi-Fi',
];

const PRODUCTO_CLAVE: Record<string, string> = {
  'Kit domótica Neodomus Smart Home': 'perfil.resenas.productoSugerido.kit',
  'Cámara IP 4K exterior': 'perfil.resenas.productoSugerido.camara',
  'Sensor de movimiento Wi-Fi': 'perfil.resenas.productoSugerido.sensor',
  'Enchufe inteligente Wi-Fi': 'perfil.resenas.productoSugerido.enchufe',
};

const formatearFecha = (fecha?: string | null, locale = 'es-CO') => {
  if (!fecha) return '';
  try {
    return new Date(fecha).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return fecha;
  }
};

// Comunica con el backend mediante GET '/calificaciones/mis-dadas' y GET '/calificaciones/producto/mis-dadas'.
const ReviewsTab = ({ notify, onGoOrders }: { notify: NotifyFn; onGoOrders: () => void }) => {
  const { t, idioma } = useIdioma();
  const locale = idioma === 'en' ? 'en-US' : 'es-CO';
  const [seccion, setSeccion] = useState<'tecnicos' | 'productos'>('tecnicos');
  const [resenasProductos, setResenasProductos] = useState<ResenaProducto[]>([]);
  const [resenasTecnicos, setResenasTecnicos] = useState<ResenaTecnico[]>([]);
  const [loadingTecnicos, setLoadingTecnicos] = useState(true);
  const [loadingProductos, setLoadingProductos] = useState(true);
  const [resenasLocales, setResenasLocales] = useState<Resena[]>(getResenas());
  const [mostrarFormLocal, setMostrarFormLocal] = useState(false);
  const [productoLocal, setProductoLocal] = useState(productosSugeridos[0]);
  const [ratingLocal, setRatingLocal] = useState(5);
  const [comentarioLocal, setComentarioLocal] = useState('');

  // Técnicos pendientes de calificar (citas finalizadas sin reseña).
  const [pendientes, setPendientes] = useState<CitaPendiente[]>([]);
  const [ratingPend, setRatingPend] = useState<Record<number, number>>({});
  const [comentarioPend, setComentarioPend] = useState<Record<number, string>>({});
  const [guardandoPend, setGuardandoPend] = useState<number | null>(null);

  // Comunica con el backend mediante GET '/calificaciones/mis-dadas'.
  const cargarResenasTecnicos = async () => {
    const res = await api.get<ResenaTecnico[]>('/calificaciones/mis-dadas');
    setResenasTecnicos(res.data || []);
  };

  useEffect(() => {
    cargarResenasTecnicos()
      .catch((err) => {
        console.error(err);
        notify(t('perfil.resenas.errorCargarTecnicos'), 'error');
      })
      .finally(() => setLoadingTecnicos(false));

    api
      .get<CitaPendiente[]>('/citas/mis-citas')
      .then((res) => {
        setPendientes(
          (res.data || []).filter((c) => c.estado === 'Finalizada' && c.calificada === false),
        );
      })
      .catch((err) => console.error(err));

    api.get<ResenaProducto[]>('/calificaciones/producto/mis-dadas')
      .then((res) => setResenasProductos(res.data || []))
      .catch((err) => {
        console.error(err);
        notify(t('perfil.resenas.errorCargarProductos'), 'error');
      })
      .finally(() => setLoadingProductos(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Comunica con el backend mediante POST '/calificaciones'.
  const guardarCalificacionTecnico = async (cita: CitaPendiente) => {
    const nota = ratingPend[cita.id_cita] || 0;
    if (!nota) {
      notify(t('perfil.resenas.errorEstrellas'), 'error');
      return;
    }
    setGuardandoPend(cita.id_cita);
    try {
      await api.post('/calificaciones', {
        id_cita: cita.id_cita,
        calificacion: nota,
        comentario: comentarioPend[cita.id_cita]?.trim() || undefined,
      });
      notify(t('perfil.resenas.graciasTecnico'), 'success');
      setPendientes((prev) => prev.filter((c) => c.id_cita !== cita.id_cita));
      setRatingPend((prev) => {
        const next = { ...prev };
        delete next[cita.id_cita];
        return next;
      });
      setComentarioPend((prev) => {
        const next = { ...prev };
        delete next[cita.id_cita];
        return next;
      });
      await cargarResenasTecnicos();
    } catch (err) {
      console.error(err);
      notify(t('perfil.resenas.errorEnviarCalificacion'), 'error');
    } finally {
      setGuardandoPend(null);
    }
  };

  const guardarResenaLocal = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!comentarioLocal.trim()) {
      notify(t('perfil.resenas.errorComentario'), 'error');
      return;
    }
    const nueva: Resena = {
      id: `r-${Date.now()}`,
      producto: productoLocal,
      productoImg: '/productos/1.jpg',
      calificacion: ratingLocal,
      comentario: comentarioLocal.trim(),
      fecha: new Date().toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }),
    };
    const siguiente = [nueva, ...resenasLocales];
    setResenasLocales(siguiente);
    saveItem(PF_RESENAS_KEY, siguiente);
    setComentarioLocal('');
    setMostrarFormLocal(false);
    notify(t('perfil.resenas.guardadaLocal'), 'success');
  };

  const eliminarResenaLocal = (id: string) => {
    const siguiente = resenasLocales.filter((resena) => resena.id !== id);
    setResenasLocales(siguiente);
    saveItem(PF_RESENAS_KEY, siguiente);
    notify(t('perfil.resenas.eliminada'), 'info');
  };

  return (
    <div className="pf-tab">
      <SectionHeader
        icon={<FaStar />}
        title={t('perfil.misResenas')}
        subtitle={t('perfil.resenas.subtitulo')}
      />

      <div className="pf-resenas-toggle">
        <button
          type="button"
          className={seccion === 'tecnicos' ? 'activo' : ''}
          onClick={() => setSeccion('tecnicos')}
        >
          <FaUserTie /> {t('nav.tecnicos')}
        </button>
        <button
          type="button"
          className={seccion === 'productos' ? 'activo' : ''}
          onClick={() => setSeccion('productos')}
        >
          <FaStar /> {t('carrito.productos')}
        </button>
      </div>

      {seccion === 'tecnicos' ? (
        <div className="pf-resenas-seccion">
          {pendientes.length > 0 && (
            <>
              <h3 className="pf-resenas-subtitulo">
                <FaStar /> {t('perfil.resenas.tecnicosPorCalificar')}
              </h3>
              <div className="pf-review-list">
                {pendientes.map((cita) => (
                  <div className="pf-review-item" key={`p-${cita.id_cita}`}>
                    <div className="pf-review-main">
                      <span className="pf-review-img pf-review-avatar">
                        {cita.tecnico_foto_url ? (
                          <img
                            src={cita.tecnico_foto_url}
                            alt={cita.nombre_tecnico || t('tec.tecnico')}
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        ) : (
                          <FaUserTie />
                        )}
                      </span>
                      <div className="pf-review-body">
                        <div className="pf-review-top">
                          <strong className="pf-review-producto">
                            {cita.nombre_tecnico || t('tec.tecnico')}
                            {cita.tipo_servicio ? ` · ${cita.tipo_servicio}` : ''}
                          </strong>
                          <span className="pf-review-fecha">
                            {cita.fecha ? `${formatearFecha(cita.fecha, locale)}${cita.hora ? ` · ${cita.hora}` : ''}` : ''}
                          </span>
                        </div>
                        <div className="pf-stars-picker">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <button
                              key={s}
                              type="button"
                              aria-label={t('perfil.resenas.estrellas', { n: s })}
                              className={(ratingPend[cita.id_cita] ?? 0) >= s ? 'on' : ''}
                              onClick={() =>
                                setRatingPend((prev) => ({ ...prev, [cita.id_cita]: s }))
                              }
                            >
                              <FaStar />
                            </button>
                          ))}
                        </div>
                        <input
                          type="text"
                          className="pf-resena-comentario"
                          placeholder={t('perfil.resenas.experienciaPlaceholder')}
                          maxLength={500}
                          value={comentarioPend[cita.id_cita] || ''}
                          onChange={(e) =>
                            setComentarioPend((prev) => ({
                              ...prev,
                              [cita.id_cita]: e.target.value,
                            }))
                          }
                        />
                        <div className="pf-form-actions" style={{ marginTop: 8 }}>
                          <button
                            type="button"
                            className="pf-btn pf-btn-primary"
                            disabled={guardandoPend === cita.id_cita}
                            onClick={() => guardarCalificacionTecnico(cita)}
                          >
                            {guardandoPend === cita.id_cita ? t('citas.guardando') : t('perfil.resenas.guardarCalificacion')}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <h3 className="pf-resenas-subtitulo">
            <FaUserTie /> {t('perfil.resenas.tecnicosAtendieron')}
          </h3>
          {loadingTecnicos ? (
            <div className="pf-empty"><p>{t('perfil.resenas.cargandoTecnicos')}</p></div>
          ) : resenasTecnicos.length === 0 ? (
            <div className="pf-empty">
              <span className="pf-empty-icon"><FaRegStar /></span>
              <p>{t('perfil.resenas.sinTecnicos')}</p>
              <p className="pf-empty-hint">
                {t('perfil.resenas.sinTecnicosHint')}
              </p>
            </div>
          ) : (
            <div className="pf-review-list">
              {resenasTecnicos.map((resena) => (
                <div className="pf-review-item" key={`t-${resena.id_calificacion}`}>
                  <div className="pf-review-main">
                    <span className="pf-review-img pf-review-avatar">
                      {resena.foto_tecnico ? (
                        <img
                          src={resena.foto_tecnico}
                          alt={resena.nombre_tecnico || t('tec.tecnico')}
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      ) : (
                        <FaUserTie />
                      )}
                    </span>
                    <div className="pf-review-body">
                      <div className="pf-review-top">
                        <strong className="pf-review-producto">
                          {resena.nombre_tecnico || t('tec.tecnico')}
                          {resena.tipo_servicio ? ` · ${resena.tipo_servicio}` : ''}
                        </strong>
                        <span className="pf-review-fecha">
                          {resena.fecha_cita ? `${formatearFecha(resena.fecha_cita, locale)}${resena.hora_cita ? ` · ${resena.hora_cita}` : ''}` : ''}
                        </span>
                      </div>
                      <div className="pf-stars">
                        {[...Array(5)].map((_, i) => (
                          <FaStar key={i} className={i < resena.calificacion ? 'on' : 'off'} />
                        ))}
                      </div>
                      {resena.comentario ? (
                        <p className="pf-review-comentario">{resena.comentario}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="pf-resenas-seccion">
          <div className="pf-resenas-cabecera">
            <h3 className="pf-resenas-subtitulo">{t('carrito.productos')}</h3>
            <div className="pf-resenas-acciones">
              <button type="button" className="pf-btn pf-btn-ghost" onClick={() => setMostrarFormLocal((actual) => !actual)}>
                <FaPlus /> {mostrarFormLocal ? t('perfil.resenas.cerrarForm') : t('perfil.resenas.escribir')}
              </button>
              <button type="button" className="pf-btn pf-btn-primary" onClick={onGoOrders}>
                <FaBoxOpen /> {t('perfil.resenas.calificarDesdePedidos')}
              </button>
            </div>
          </div>
          {mostrarFormLocal && (
            <form className="pf-review-form" onSubmit={guardarResenaLocal}>
              <div className="pf-form-grid">
                <div className="pf-form-group">
                  <label className="pf-form-label" htmlFor="pf-res-producto">{t('perfil.resenas.producto')}</label>
                  <select id="pf-res-producto" className="pf-form-input" value={productoLocal} onChange={(e) => setProductoLocal(e.target.value)}>
                    {productosSugeridos.map((nombre) => <option key={nombre} value={nombre}>{t(PRODUCTO_CLAVE[nombre] || nombre)}</option>)}
                  </select>
                </div>
                <div className="pf-form-group">
                  <span className="pf-form-label">{t('perfil.resenas.calificacion')}</span>
                  <div className="pf-rating-input">
                    {[1, 2, 3, 4, 5].map((nota) => (
                      <button key={nota} type="button" className={nota <= ratingLocal ? 'on' : ''} aria-label={t('perfil.resenas.estrellas', { n: nota })} onClick={() => setRatingLocal(nota)}><FaStar /></button>
                    ))}
                  </div>
                </div>
                <div className="pf-form-group pf-form-span">
                  <label className="pf-form-label" htmlFor="pf-res-comentario">{t('perfil.resenas.tuExperiencia')}</label>
                  <textarea id="pf-res-comentario" className="pf-form-input pf-textarea" rows={3} value={comentarioLocal} onChange={(e) => setComentarioLocal(e.target.value)} placeholder={t('perfil.resenas.experienciaProductoPlaceholder')} />
                </div>
              </div>
              <div className="pf-form-actions"><button type="submit" className="pf-btn pf-btn-primary">{t('perfil.resenas.guardarResena')}</button></div>
            </form>
          )}
          {resenasProductos.length > 0 && <h4 className="pf-resenas-subtitulo">{t('perfil.resenas.calificacionesPedidos')}</h4>}
          {loadingProductos ? (
            <div className="pf-empty"><p>{t('perfil.resenas.cargandoProductos')}</p></div>
          ) : resenasProductos.length === 0 ? (
            <div className="pf-empty">
              <span className="pf-empty-icon"><FaRegStar /></span>
              <p>{t('perfil.resenas.sinProductos')}</p>
              <p className="pf-empty-hint">{t('perfil.resenas.sinProductosHint')}</p>
            </div>
          ) : (
            <div className="pf-review-list">
              {resenasProductos.map((resena) => (
                <div className="pf-review-item" key={resena.id_calificacion_producto}>
                  <div className="pf-review-main">
                    <span className="pf-review-img pf-product-review-img">
                      <img
                        src={resena.foto_url || resena.producto_imagen || ''}
                        alt={resena.nombre_producto}
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                      <span className="pf-stars pf-stars-overlay">
                        {[...Array(5)].map((_, i) => (
                          <FaStar key={i} className={i < resena.calificacion ? 'on' : 'off'} />
                        ))}
                      </span>
                    </span>
                    <div className="pf-review-body">
                      <div className="pf-review-top">
                        <strong className="pf-review-producto">{resena.nombre_producto}</strong>
                        <span className="pf-review-fecha">{formatearFecha(resena.created_at, locale)}</span>
                      </div>
                      <span className="pf-review-fecha">{t('perfil.resenas.pedidoNumero', { id: resena.id_pedido })}</span>
                      {resena.comentario && <p className="pf-review-comentario">{resena.comentario}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {resenasLocales.length > 0 && (
            <>
              <h4 className="pf-resenas-subtitulo pf-resenas-locales-titulo">{t('perfil.resenas.guardadas')}</h4>
              <div className="pf-review-list pf-review-list-locales" aria-label={t('perfil.resenas.guardadas')}>
                {resenasLocales.map((resena) => (
                  <div className="pf-review-item" key={resena.id}>
                    <div className="pf-review-main">
                      <span className="pf-review-img">
                        <img src={resena.productoImg} alt={t(PRODUCTO_CLAVE[resena.producto] || resena.producto)} onError={(e) => { e.currentTarget.style.opacity = '0.12'; }} />
                      </span>
                      <div className="pf-review-body">
                        <div className="pf-review-top"><strong className="pf-review-producto">{t(PRODUCTO_CLAVE[resena.producto] || resena.producto)}</strong><span className="pf-review-fecha">{resena.fecha}</span></div>
                        <div className="pf-stars">{[1, 2, 3, 4, 5].map((nota) => <FaStar key={nota} className={nota <= resena.calificacion ? 'on' : 'off'} />)}</div>
                        <p className="pf-review-comentario">{resena.comentario}</p>
                      </div>
                    </div>
                    <div className="pf-review-actions"><button type="button" className="pf-icon-btn danger" onClick={() => eliminarResenaLocal(resena.id)} title={t('perfil.resenas.eliminarLocal')}><FaTrashCan /></button></div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ReviewsTab;
