// Presenta las valoraciones disponibles en el perfil del cliente.
// Aquí vive toda la información de reseñas: técnicos y productos de
// pedidos entregados. Mis pedidos solo muestra la información de la compra.
import { useEffect, useRef, useState } from 'react';
import { FaBoxOpen, FaCamera, FaRegStar, FaStar, FaUserTie } from 'react-icons/fa6';
import api from '@services/api';
import { useIdioma } from '@i18n/IdiomaContext';
import SectionHeader from './SectionHeader';
import { NotifyFn } from './PersonalTab';
import { pedidoCompletado } from '@utils/pedidos';

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

// Datos mínimos de la respuesta de GET '/pedidos/mis-pedidos' que necesita
// esta pestaña para detectar los productos que aún no tienen reseña.
interface DetallePedidoCliente {
  id_producto_d: number | null;
  nombre: string;
  es_servicio: boolean;
}

interface PedidoCliente {
  id_pedido: number;
  fecha?: string | null;
  detalles: DetallePedidoCliente[];
  estado_entrega?: string | null;
  cita?: { estado: string } | null;
  productos_calificables?: boolean;
}

// Producto de un pedido entregado que el cliente todavía no califica.
interface ProductoPendiente {
  id_pedido: number;
  id_producto: number;
  nombre: string;
  fecha?: string | null;
}

const formatearFecha = (fecha?: string | null, locale = 'es-CO') => {
  if (!fecha) return '';
  try {
    return new Date(fecha).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return fecha;
  }
};

// Comunica con el backend mediante GET '/calificaciones/mis-dadas', GET '/calificaciones/producto/mis-dadas' y GET '/pedidos/mis-pedidos'.
const ReviewsTab = ({ notify }: { notify: NotifyFn }) => {
  const { t, idioma } = useIdioma();
  const locale = idioma === 'en' ? 'en-US' : 'es-CO';
  const [seccion, setSeccion] = useState<'tecnicos' | 'productos'>('tecnicos');
  const [resenasProductos, setResenasProductos] = useState<ResenaProducto[]>([]);
  const [resenasTecnicos, setResenasTecnicos] = useState<ResenaTecnico[]>([]);
  const [loadingTecnicos, setLoadingTecnicos] = useState(true);
  const [loadingProductos, setLoadingProductos] = useState(true);

  // Productos de pedidos entregados pendientes de calificar.
  const [pendientesProducto, setPendientesProducto] = useState<ProductoPendiente[]>([]);
  const [ratingProducto, setRatingProducto] = useState<Record<string, number>>({});
  const [comentarioProducto, setComentarioProducto] = useState<Record<string, string>>({});
  const [guardandoProducto, setGuardandoProducto] = useState<string | null>(null);
  const fotosProducto = useRef<Record<string, File>>({});
  const fotoProductoRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [nombresFoto, setNombresFoto] = useState<Record<string, string>>({});

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

  // Carga las reseñas de productos y devuelve las claves pedido-producto ya calificadas.
  const cargarResenasProductos = async (): Promise<Set<string>> => {
    const res = await api.get<ResenaProducto[]>('/calificaciones/producto/mis-dadas');
    setResenasProductos(res.data || []);
    return new Set((res.data || []).map((r) => `${r.id_pedido}-${r.id_producto}`));
  };

  // Detecta los productos de pedidos entregados que aún no tienen reseña,
  // combinando los pedidos del cliente con las calificaciones existentes.
  const cargarPendientesProducto = async (calificadas: Set<string>) => {
    try {
      const res = await api.get<PedidoCliente[]>('/pedidos/mis-pedidos');
      const pendientes: ProductoPendiente[] = [];
      (res.data || []).forEach((pedido) => {
        if (!pedidoCompletado(pedido)) return;
        (pedido.detalles || []).forEach((detalle) => {
          if (detalle.es_servicio || detalle.id_producto_d == null) return;
          const clave = `${pedido.id_pedido}-${detalle.id_producto_d}`;
          if (calificadas.has(clave)) return;
          pendientes.push({
            id_pedido: pedido.id_pedido,
            id_producto: detalle.id_producto_d,
            nombre: detalle.nombre,
            fecha: pedido.fecha ?? null,
          });
        });
      });
      setPendientesProducto(pendientes);
    } catch (err) {
      console.error(err);
    }
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

    void (async () => {
      try {
        const calificadas = await cargarResenasProductos();
        await cargarPendientesProducto(calificadas);
      } catch (err) {
        console.error(err);
        notify(t('perfil.resenas.errorCargarProductos'), 'error');
      } finally {
        setLoadingProductos(false);
      }
    })();
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

  // Comunica con el backend mediante POST '/calificaciones/producto', POST `/calificaciones/producto/${id_pedido}/${id_producto}/foto`; prepara FormData para enviar campos y archivos.
  const guardarCalificacionProducto = async (producto: ProductoPendiente) => {
    const clave = `${producto.id_pedido}-${producto.id_producto}`;
    const nota = ratingProducto[clave] || 0;
    if (!nota) {
      notify(t('perfil.resenas.errorEstrellas'), 'error');
      return;
    }
    setGuardandoProducto(clave);
    try {
      await api.post('/calificaciones/producto', {
        id_pedido: producto.id_pedido,
        id_producto: producto.id_producto,
        calificacion: nota,
        comentario: comentarioProducto[clave]?.trim() || undefined,
      });
      // La foto es opcional; si falla no bloquea la calificación.
      const foto = fotosProducto.current[clave];
      if (foto) {
        try {
          const fd = new FormData();
          fd.append('file', foto);
          await api.post(
            `/calificaciones/producto/${producto.id_pedido}/${producto.id_producto}/foto`,
            fd,
          );
        } catch (err) {
          console.error(err);
        }
        delete fotosProducto.current[clave];
        setNombresFoto((prev) => {
          const next = { ...prev };
          delete next[clave];
          return next;
        });
      }
      notify(t('perfil.resenas.graciasProducto'), 'success');
      setRatingProducto((prev) => {
        const next = { ...prev };
        delete next[clave];
        return next;
      });
      setComentarioProducto((prev) => {
        const next = { ...prev };
        delete next[clave];
        return next;
      });
      const calificadas = await cargarResenasProductos();
      await cargarPendientesProducto(calificadas);
    } catch (err: any) {
      const detalle = err.response?.data?.detail;
      notify(
        typeof detalle === 'string' ? detalle : t('perfil.resenas.errorEnviarCalificacion'),
        'error',
      );
    } finally {
      setGuardandoProducto(null);
    }
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
                        <textarea
                          className="pf-resena-comentario"
                          rows={2}
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
          {pendientesProducto.length > 0 && (
            <>
              <h3 className="pf-resenas-subtitulo">
                <FaStar /> {t('perfil.resenas.porCalificar')}
              </h3>
              <p className="pf-resenas-hint">{t('perfil.resenas.porCalificarHint')}</p>
              <div className="pf-review-list">
                {pendientesProducto.map((producto) => {
                  const clave = `${producto.id_pedido}-${producto.id_producto}`;
                  return (
                    <div className="pf-review-item" key={clave}>
                      <div className="pf-review-main">
                        <span className="pf-review-img pf-product-review-img">
                          <FaBoxOpen />
                        </span>
                        <div className="pf-review-body">
                          <div className="pf-review-top">
                            <strong className="pf-review-producto">{producto.nombre}</strong>
                            <span className="pf-review-fecha">{formatearFecha(producto.fecha, locale)}</span>
                          </div>
                          <span className="pf-review-fecha">{t('perfil.resenas.pedidoNumero', { id: producto.id_pedido })}</span>
                          <div className="pf-stars-picker">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <button
                                key={s}
                                type="button"
                                aria-label={t('perfil.resenas.estrellas', { n: s })}
                                className={(ratingProducto[clave] ?? 0) >= s ? 'on' : ''}
                                onClick={() => setRatingProducto((prev) => ({ ...prev, [clave]: s }))}
                              >
                                <FaStar />
                              </button>
                            ))}
                          </div>
                          <textarea
                            className="pf-resena-comentario"
                            rows={2}
                            placeholder={t('perfil.resenas.experienciaProductoPlaceholder')}
                            maxLength={500}
                            value={comentarioProducto[clave] || ''}
                            onChange={(e) =>
                              setComentarioProducto((prev) => ({ ...prev, [clave]: e.target.value }))
                            }
                          />
                          <div className="pf-form-actions">
                            <button
                              type="button"
                              className="pf-btn pf-btn-primary"
                              disabled={guardandoProducto === clave}
                              onClick={() => guardarCalificacionProducto(producto)}
                            >
                              {guardandoProducto === clave
                                ? t('perfil.pedidos.enviando')
                                : t('perfil.resenas.guardarCalificacion')}
                            </button>
                            <input
                              ref={(el) => { fotoProductoRefs.current[clave] = el; }}
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              onChange={(e) => {
                                const archivo = e.target.files?.[0];
                                if (archivo) {
                                  fotosProducto.current[clave] = archivo;
                                  setNombresFoto((prev) => ({ ...prev, [clave]: archivo.name }));
                                }
                                e.target.value = '';
                              }}
                            />
                            <button
                              type="button"
                              className={`pf-resena-foto ${nombresFoto[clave] ? 'seleccionada' : ''}`}
                              title={t('perfil.resenas.adjuntarFotoTitle')}
                              onClick={() => fotoProductoRefs.current[clave]?.click()}
                            >
                              <FaCamera />{' '}
                              <span>{nombresFoto[clave] ? t('perfil.resenas.cambiarFoto') : t('perfil.resenas.adjuntarFoto')}</span>
                            </button>
                            {nombresFoto[clave] && (
                              <span className="pf-resena-foto-nombre" title={nombresFoto[clave]}>
                                {nombresFoto[clave]}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <h3 className="pf-resenas-subtitulo">
            <FaBoxOpen /> {t('perfil.resenas.calificacionesPedidos')}
          </h3>
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
        </div>
      )}
    </div>
  );
};

export default ReviewsTab;
