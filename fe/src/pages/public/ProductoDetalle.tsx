import LocalizedNotificationText from '@components/common/LocalizedNotificationText';
import { MetrosSelect } from '@components/common/MetrosSelect';
// Pantalla ProductoDetalle de Neodomus. Reúne el estado y las acciones de su vista.
import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { FaArrowLeft, FaHeart, FaCheck, FaTruckFast, FaShieldHalved, FaRotateLeft, FaUsers, FaChevronLeft, FaChevronRight } from 'react-icons/fa6';
import ProductoCard from '@components/productos/ProductoCard';
import api from '@services/api';
import { useCart } from '@contexts/CartContext';
import { useFavoritos } from '@utils/favoritos';
import { useIdioma } from '@i18n/IdiomaContext';
import { parseMetros } from '@utils/metros';
import { stockDisponibleProducto, stockDisponibleVariante } from '@utils/productoDisponibilidad';
import {
  precioOriginalProducto,
  precioUnitarioProducto,
  subtotalLinea,
} from '@utils/productoPrecio';
import { aplicarFallbackImagenProducto, imagenPorReferencia, resolverImagenProducto } from '@utils/productImages';
import '@styles/producto-detalle.css';

interface Producto {
  id_producto: number;
  referencia_producto?: string | null;
  nombre_producto: string;
  nombre_producto_label?: string;
  marca?: string | null;
  colores_producto?: string | null;
  color_hex?: string | null;
  tamaño?: string | null;
  venta_por_metros?: boolean;
  precio_venta_producto: number;
  imagen_url?: string | null;
  id_cate_pr?: number;
  nombre_categoria?: string;
  nombre_categoria_label?: string;
  stock_producto?: number;
  stock_disponible?: number;
  disponible?: boolean;
  stock_estado?: 'disponible' | 'bajo' | 'agotado';
  descuento_activo?: number | null;
  precio_final?: number | null;
  promocion_hasta?: string | null;
  es_nuevo?: boolean;
  tecnicos_requeridos?: number;
  descripcion_producto?: string | null;
  descripcion_producto_label?: string | null;
  caracteristicas_producto?: string | null;
  caracteristicas_producto_label?: string | null;
  variantes?: {
    id: number;
    nombre: string;
    hex?: string | null;
    tamaño?: string | null;
    ancho_cm?: number | null;
    alto_cm?: number | null;
    etiqueta_medida?: string | null;
    precio?: number | null;
    imagen_url?: string | null;
    stock: number;
  }[];
}

const PALETAS: Record<number, string[]> = {
  1: ['Blanco', 'Negro', 'Gris'],
  2: ['Blanco', 'Negro', 'Plata'],
  3: ['Blanco cálido', 'Blanco frío', 'RGB'],
  4: ['Negro', 'Blanco'],
  5: ['Azul', 'Amarillo', 'Negro'],
  6: ['Blanco', 'Negro'],
  7: ['Negro'],
  8: ['Blanco', 'Negro'],
  9: ['Blanco', 'Gris', 'Negro'],
  10: ['Blanco', 'Gris'],
};

const COLOR_HEX: Record<string, string> = {
  'Blanco': '#f5f5f5',
  'Blanco cálido': '#ffe9c7',
  'Blanco frío': '#e8f4ff',
  'Negro': '#1e1e1e',
  'Gris': '#9e9e9e',
  'Plata': '#c0c0c0',
  'Azul': '#2f6fed',
  'Amarillo': '#f6c344',
  'RGB': 'linear-gradient(135deg, #ff4d4d, #ffd700, #2f6fed, #7c4dff)',
};

const CARACTERISTICAS: Record<number, string[]> = {
  1: [
    'productos.caracteristica.sensor.precision',
    'productos.caracteristica.sensor.alcance',
    'productos.caracteristica.sensor.angulo',
    'productos.caracteristica.sensor.consumo',
    'productos.caracteristica.sensor.instalacion',
  ],
  2: [
    'productos.caracteristica.controlador.central',
    'productos.caracteristica.controlador.protocolos',
    'productos.caracteristica.controlador.app',
    'productos.caracteristica.controlador.escenas',
    'productos.caracteristica.controlador.actualizaciones',
  ],
  3: [
    'productos.caracteristica.iluminacion.personalizable',
    'productos.caracteristica.iluminacion.colores',
    'productos.caracteristica.iluminacion.asistentes',
    'productos.caracteristica.iluminacion.consumo',
    'productos.caracteristica.iluminacion.vida',
  ],
  4: [
    'productos.caracteristica.automatizacion.completa',
    'productos.caracteristica.automatizacion.horarios',
    'productos.caracteristica.automatizacion.integracion',
    'productos.caracteristica.automatizacion.voz',
    'productos.caracteristica.automatizacion.instalacion',
  ],
  5: [
    'productos.caracteristica.conectividad.rendimiento',
    'productos.caracteristica.conectividad.datos',
    'productos.caracteristica.conectividad.durabilidad',
    'productos.caracteristica.conectividad.router',
    'productos.caracteristica.conectividad.longitudes',
  ],
  6: [
    'productos.caracteristica.energia.remoto',
    'productos.caracteristica.energia.monitoreo',
    'productos.caracteristica.energia.horarios',
    'productos.caracteristica.energia.proteccion',
    'productos.caracteristica.energia.asistentes',
  ],
  7: [
    'productos.caracteristica.fuente.estable',
    'productos.caracteristica.fuente.sobrevoltaje',
    'productos.caracteristica.fuente.eficiencia',
    'productos.caracteristica.fuente.terminales',
    'productos.caracteristica.fuente.continuo',
  ],
  8: [
    'productos.caracteristica.seguridad.vigilancia',
    'productos.caracteristica.seguridad.notificaciones',
    'productos.caracteristica.seguridad.nocturna',
    'productos.caracteristica.seguridad.grabacion',
    'productos.caracteristica.seguridad.configuracion',
  ],
  9: [
    'productos.caracteristica.clima.temperatura',
    'productos.caracteristica.clima.horarios',
    'productos.caracteristica.clima.ahorro',
    'productos.caracteristica.clima.remoto',
    'productos.caracteristica.energia.asistentes',
  ],
  10: [
    'productos.caracteristica.interfaz.panel',
    'productos.caracteristica.interfaz.gestion',
    'productos.caracteristica.interfaz.pantalla',
    'productos.caracteristica.interfaz.escenas',
    'productos.caracteristica.interfaz.idioma',
  ],
};

// Comunica con el backend mediante GET `/productos/${id}`; registra escuchas de eventos para sincronizar la vista.
const ProductoDetalle = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { addItem, removeItem } = useCart();
  const { t } = useIdioma();
  const { esFavorito, toggleFavorito } = useFavoritos();

  const editarKey = searchParams.get('editar');

  const [producto, setProducto] = useState<Producto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [color, setColor] = useState('');
  const [tamano, setTamano] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [displayValue, setDisplayValue] = useState('1');
  const [metros, setMetros] = useState(10);
  const [unidadesMetros, setUnidadesMetros] = useState(1);
  const [imagenActiva, setImagenActiva] = useState<string | null>(null);
  const [displayUnidades, setDisplayUnidades] = useState('1');
  const [toast, setToast] = useState('');
  const [recomendados, setRecomendados] = useState<Producto[]>([]);
  const carouselRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const variantes = producto?.variantes || [];
  // Color principal del producto (primera opción del selector de color).
  const colorPrincipal = (producto?.colores_producto || '').trim();
  // Paleta combinada: color principal + colores de variantes (sin duplicados).
  const paletaDe = (): string[] => {
    const lista: string[] = [];
    if (colorPrincipal) lista.push(colorPrincipal);
    for (const v of variantes) {
      if (!lista.includes(v.nombre)) lista.push(v.nombre);
    }
    if (lista.length === 0) {
      return PALETAS[producto?.id_cate_pr ?? 0] || ['Blanco', 'Negro', 'Gris'];
    }
    return lista;
  };
  // Etiqueta de medida de cada variante ("150 cm por 100 cm" o texto libre).
  const medidaDe = (v: { etiqueta_medida?: string | null; tamaño?: string | null }) =>
    (v.etiqueta_medida || v.tamaño || '').trim();
  // El producto usa medidas si alguna variante las define.
  const usaTamanos = variantes.some((v) => medidaDe(v));
  const tamanosDisponibles = Array.from(
    new Set(variantes.map((v) => medidaDe(v)).filter(Boolean)),
  );
  const varianteActiva =
    variantes.find(
      (v) =>
        v.nombre === color &&
        (!usaTamanos || medidaDe(v) === tamano),
    ) ?? null;
  const stockDisponible = producto
    ? (varianteActiva
        ? stockDisponibleVariante(producto, varianteActiva)
        : (variantes.length ? 0 : stockDisponibleProducto(producto)))
    : 0;
  const precioBase = producto?.precio_final ?? producto?.precio_venta_producto ?? 0;
  const precioUnitario = producto ? precioUnitarioProducto(producto, varianteActiva) : 0;
  const precioOriginal = producto ? precioOriginalProducto(producto, varianteActiva) : null;
  const tieneDescuento = precioOriginal != null;
  const totalMetros = (producto?.venta_por_metros ? metros * unidadesMetros : 0);
  const maxUnidades = producto?.venta_por_metros && metros > 0 ? Math.max(1, Math.floor((stockDisponible || 0) / metros) || 1) : 99;
  const puedeAgregar =
    stockDisponible > 0 &&
    (!variantes.length || Boolean(varianteActiva)) &&
    (!producto?.venta_por_metros || (metros > 0 && totalMetros <= stockDisponible));
  const imagen =
    imagenActiva ||
    varianteActiva?.imagen_url ||
    (producto ? resolverImagenProducto(producto) : '/productos/default.png');

  // Galería: imagen principal siempre visible + imágenes propias de variantes.
  // Cada imagen lleva su color asociado para el vínculo bidireccional color<->imagen.
  const imagenesGaleria = useMemo(() => {
    const lista: { url: string; key: string; etiqueta: string; color: string | null; tamano: string }[] = [];
    const imagenPrincipal = producto
      ? producto.imagen_url || imagenPorReferencia(producto.referencia_producto)
      : undefined;
    if (imagenPrincipal) {
      lista.push({
        url: imagenPrincipal,
        key: 'principal',
        etiqueta: 'Principal',
        color: colorPrincipal || null,
        tamano: '',
      });
    }
    for (const v of variantes) {
      if (v.imagen_url && !lista.some((x) => x.url === v.imagen_url)) {
        lista.push({
          url: v.imagen_url,
          key: `v-${v.id}`,
          etiqueta: medidaDe(v) ? `${v.nombre} · ${medidaDe(v)}` : v.nombre,
          color: v.nombre,
          tamano: medidaDe(v),
        });
      }
    }
    return lista;
  }, [producto, variantes, colorPrincipal]);

  // Al cambiar de color/medida se descarta la miniatura elegida a mano y se
  // vuelve a la imagen que corresponda (variante activa o principal).
  useEffect(() => {
    setImagenActiva(null);
  }, [color, tamano]);

  useEffect(() => {
    // Comunica con el backend mediante GET `/productos/${id}`.
    const fetchProducto = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/productos/${id}`);
        setProducto(res.data);
      } catch (err: any) {
        console.error(err);
        setError(err.response?.data?.detail || 'Producto no encontrado');
      } finally {
        setLoading(false);
      }
    };
    void fetchProducto();
  }, [id]);

  // Cargar productos recomendados: misma categoría primero, luego las demás
  useEffect(() => {
    if (!producto?.id_cate_pr) return;
    api
      .get('/productos/?limit=100')
      .then((res) => {
        const todos: Producto[] = res.data.data || [];
        const mismosCat = todos.filter(
          (p) => p.id_cate_pr === producto.id_cate_pr && p.id_producto !== producto.id_producto,
        );
        const otrosCat = todos.filter(
          (p) => p.id_cate_pr !== producto.id_cate_pr && p.id_producto !== producto.id_producto,
        );
        setRecomendados([...mismosCat, ...otrosCat].slice(0, 15));
      })
      .catch(() => {});
  }, [producto?.id_cate_pr, producto?.id_producto]);

  const scrollCarousel = (direccion: 'izq' | 'der') => {
    if (!carouselRef.current) return;
    const amount = 300;
    carouselRef.current.scrollBy({
      left: direccion === 'izq' ? -amount : amount,
      behavior: 'smooth',
    });
  };

  useEffect(() => {
    // Comunica con el backend mediante GET `/productos/${id}`.
    const refetch = () => {
      api.get(`/productos/${id}`).then((res) => setProducto(res.data)).catch(() => undefined);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refetch();
    };
    window.addEventListener('focus', refetch);
    document.addEventListener('visibilitychange', onVisibility);
    const interval = window.setInterval(refetch, 15000);
    return () => {
      window.removeEventListener('focus', refetch);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(interval);
    };
  }, [id]);

  // Clamp cantidad when stock changes (e.g. variant switch)
  useEffect(() => {
    if (!producto?.venta_por_metros && stockDisponible > 0) {
      if (cantidad > stockDisponible) {
        setCantidad(stockDisponible);
        setDisplayValue(String(stockDisponible));
      }
    }
  }, [stockDisponible, producto?.venta_por_metros]);

  useEffect(() => {
    if (producto) {
      const paleta = paletaDe();
      const paramColor = searchParams.get('color');
      const colorInicial = paramColor && paleta.includes(paramColor) ? paramColor : paleta[0];
      setColor(colorInicial);
      // Selecciona la combinación solicitada o la primera disponible.
      if (producto.variantes?.length) {
        const paramMedida = (searchParams.get('medida') || '').trim();
        const delColor = producto.variantes.filter(v => v.nombre === colorInicial);
        const primeraVariante =
          delColor.find(v => paramMedida && medidaDe(v) === paramMedida && (v.stock || 0) > 0) ||
          delColor.find(v => (v.stock || 0) > 0) ||
          delColor[0] ||
          producto.variantes.find(v => (v.stock || 0) > 0) ||
          producto.variantes[0];
        if (primeraVariante) {
          setColor(primeraVariante.nombre);
          setTamano(usaTamanos ? medidaDe(primeraVariante) : '');
        }
      } else {
        setTamano('');
      }
      const paramMetros = searchParams.get('metros');
      if (producto.venta_por_metros) {
        if (paramMetros) {
          const r = parseMetros(paramMetros);
          if (r.valor != null) {
            setMetros(r.valor);
          }
        }
        const paramUnidades = searchParams.get('unidades') || searchParams.get('cantidad');
        if (paramUnidades) {
          const u = Math.max(1, Number(paramUnidades) || 1);
          setUnidadesMetros(u);
          setDisplayUnidades(String(u));
        } else {
          setUnidadesMetros(1);
          setDisplayUnidades('1');
        }
      }
      const paramCantidad = searchParams.get('cantidad');
      if (!producto.venta_por_metros && paramCantidad) {
        const c = Math.max(1, Number(paramCantidad) || 1);
        setCantidad(c);
        setDisplayValue(String(c));
      }
    }
  }, [producto, searchParams]);

  if (loading) return <div className="detalle-loading">{t('productos.cargandoDetalle')}</div>;
  if (error || !producto)
    return (
      <div className="detalle-error">
        <p>{error || t('productos.noEncontrado')}</p>
        <button type="button" className="detalle-back-btn" onClick={() => navigate('/productos')}>
          <FaArrowLeft /> {t('productos.volverCatalogo')}
        </button>
      </div>
    );

  const paleta = paletaDe();
  const caracteristicas = (producto.caracteristicas_producto_label || producto.caracteristicas_producto || '')
    .split('\n')
    .map((c) => c.replace(/^[-*\s]+/, '').trim())
    .filter(Boolean);
  const caracteristicasFinal = caracteristicas.length
    ? caracteristicas
    : CARACTERISTICAS[producto.id_cate_pr ?? 0] || CARACTERISTICAS[1];
  const nombreVisible = producto.nombre_producto_label || producto.nombre_producto;
  const categoria = producto.nombre_categoria_label || producto.nombre_categoria || t('productos.producto');

  const descripcion = producto.descripcion_producto_label || producto.descripcion_producto || t('productos.descripcionGenerica', { nombre: nombreVisible, categoria });

  const esFav = producto ? esFavorito(producto.id_producto) : false;

  const handleToggleFavorito = () => {
    if (!producto) return;
    toggleFavorito(producto.id_producto);
    showToast(t(esFav ? 'productos.favoritoQuitado' : 'productos.favoritoAgregado'));
  };

  const handleAgregarAlCarrito = () => {
    if (stockDisponible <= 0) {
      showToast(t('productos.colorTallaSinStock'));
      return;
    }
    if (usaTamanos && !tamano) {
      showToast(t('productos.seleccionaTalla'));
      return;
    }
    if (producto.venta_por_metros) {
      if (!metros || metros <= 0) {
        showToast(t('productos.cantidadMetrosInvalida'));
        return;
      }
      if (!unidadesMetros || unidadesMetros < 1) {
        showToast(t('productos.cantidadUnidadesInvalida'));
        return;
      }
      const totalSolicitado = metros * unidadesMetros;
      if (totalSolicitado > stockDisponible) {
        showToast(t('productos.stockInsuficienteMetros', { count: stockDisponible }));
        return;
      }
      if (editarKey) removeItem(editarKey);
      const error = addItem(
        {
          id_producto: producto.id_producto,
          referencia_producto: producto.referencia_producto,
          nombre_producto: producto.nombre_producto,
          precio_venta_producto: precioUnitario,
          imagen,
          venta_por_metros: true,
          color,
          tamaño: tamano,
          medida: tamano,
          id_variante: varianteActiva?.id,
          tecnicos_requeridos: producto.tecnicos_requeridos || 1,
          stock_maximo: stockDisponible,
          metros,
        },
        unidadesMetros,
        metros
      );
      if (error) { showToast(error); return; }
      if (editarKey) {
        navigate('/carrito');
      } else {
        showToast(`${unidadesMetros} × ${metros} m (${totalSolicitado} m) — ${nombreVisible} ${t('productos.agregadoAlCarrito')}`);
      }
      return;
    }
    if (editarKey) removeItem(editarKey);
    const cantidadFinal = Math.min(Math.max(1, cantidad), stockDisponible);
    const error = addItem(
      {
        id_producto: producto.id_producto,
        referencia_producto: producto.referencia_producto,
        nombre_producto: producto.nombre_producto,
        precio_venta_producto: precioUnitario,
        imagen,
        color,
        tamaño: tamano,
        medida: tamano,
        id_variante: varianteActiva?.id,
        tecnicos_requeridos: producto.tecnicos_requeridos || 1,
        stock_maximo: stockDisponible,
      },
      cantidadFinal
    );
    if (error) { showToast(error); return; }
    if (editarKey) {
      navigate('/carrito');
    } else {
      showToast(`${cantidadFinal} × ${nombreVisible} ${t('productos.agregadoAlCarrito')}`);
    }
  };

  return (
    <div className="detalle-page app-glass">
      {toast && <div className="detalle-toast"><LocalizedNotificationText message={toast} /></div>}
      <main className="detalle-main">
        <button type="button" className="detalle-back-btn" onClick={() => navigate(editarKey ? '/carrito' : '/productos')}>
          <FaArrowLeft /> {editarKey ? 'Volver al carrito' : t('carrito.volverProductos')}
        </button>

        <nav className="detalle-breadcrumb" aria-label={t('detalle.ruta')}>
          <Link to="/productos">{t('nav.productos')}</Link>
          <span className="detalle-breadcrumb-sep">/</span>
          <span className="detalle-breadcrumb-cat">{categoria}</span>
          <span className="detalle-breadcrumb-sep">/</span>
          <span>{nombreVisible}</span>
        </nav>

        <div className="detalle-layout">
          <div className="detalle-galeria">
            <div className="detalle-imagen-card">
              <div className="detalle-corner-badges">
                {tieneDescuento && (
                  <span className="detalle-promo-corner">{t('productos.promocionDetalle', { discount: producto.descuento_activo ?? 0 })}</span>
                )}
              </div>
              <button
                type="button"
                className={`detalle-fav-btn ${esFav ? 'activo' : ''}`}
                onClick={handleToggleFavorito}
                aria-label={esFav ? t('productos.quitarFavoritos') : t('productos.agregarFavoritos')}
                title={esFav ? t('productos.quitarFavoritos') : t('productos.agregarFavoritos')}
              >
                <FaHeart />
              </button>
              <img
                src={imagen}
                alt={nombreVisible}
                onError={(e) => aplicarFallbackImagenProducto(e.currentTarget, producto.referencia_producto)}
              />
            </div>

            {imagenesGaleria.length > 1 && (
              <div className="detalle-miniaturas">
                {imagenesGaleria.map((g) => (
                  <button
                    key={g.key}
                    type="button"
                    className={`detalle-miniatura ${imagen === g.url ? 'activa' : ''}`}
                    onClick={() => {
                      if (g.color) {
                        setColor(g.color);
                        if (g.tamano) setTamano(g.tamano);
                        setImagenActiva(null);
                      } else {
                        setImagenActiva(g.url);
                      }
                    }}
                    title={g.etiqueta}
                    aria-label={g.etiqueta}
                  >
                    <img
                      src={g.url}
                      alt={g.etiqueta}
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="detalle-info">
            <span className="detalle-categoria">{categoria}</span>
            <h1 className="detalle-nombre">{nombreVisible}</h1>
            {producto.marca && <span className="detalle-marca">{t('productos.marca')} {producto.marca}</span>}
            {producto.tamaño && <span className="detalle-marca">{t('productos.tamano')} {producto.tamaño}</span>}

            <div className={`detalle-precio ${producto.venta_por_metros ? 'detalle-precio--metros' : ''}`}>
              {producto.venta_por_metros ? (
                <>
                  <div className="detalle-precio-total-row">
                    {tieneDescuento && (
                      <span className="detalle-precio-original">
                        ${subtotalLinea(precioOriginal!, unidadesMetros, metros).toLocaleString()}
                      </span>
                    )}
                    <span className="detalle-precio-monto">
                      ${subtotalLinea(precioUnitario, unidadesMetros, metros).toLocaleString()}
                    </span>
                    <span className="detalle-precio-sufijo">COP</span>
                    {tieneDescuento && (
                      <span className="detalle-badge-descuento">-{producto.descuento_activo}%</span>
                    )}
                  </div>
                  <span className="detalle-precio-unitario">
                    ${precioUnitario.toLocaleString()} COP / metro · {metros} m × {unidadesMetros} {unidadesMetros === 1 ? 'unidad' : 'unidades'} = {totalMetros} m total
                  </span>
                </>
              ) : (
                <>
                  {tieneDescuento && (
                    <span className="detalle-precio-original">
                      ${precioOriginal!.toLocaleString()}
                    </span>
                  )}
                  <span className="detalle-precio-monto">
                    ${subtotalLinea(precioUnitario, cantidad).toLocaleString()}
                  </span>
                  <span className="detalle-precio-sufijo">COP</span>
                  {tieneDescuento && (
                    <span className="detalle-badge-descuento">-{producto.descuento_activo}%</span>
                  )}
                </>
              )}
            </div>

            <div className={`detalle-disponibilidad ${stockDisponible <= 0 ? 'agotado' : ''}`}>
              {stockDisponible > 0 ? <FaCheck /> : <FaRotateLeft />}
              {stockDisponible > 0
                ? producto.venta_por_metros
                  ? t('productos.detalleDisponibleMetros', {
                      count: stockDisponible,
                      combination: variantes.length ? t('productos.enEstaCombinacion') : '',
                      selected: totalMetros,
                    })
                  : t('productos.detalleDisponibleUnidades', {
                      count: stockDisponible,
                      combination: variantes.length ? t('productos.enEstaCombinacion') : '',
                    })
                : t('productos.sinStockCombinacion')}
            </div>

            <p className="detalle-descripcion">{descripcion}</p>

            <div className="detalle-caracteristicas">
              <h3>{t('productos.caracteristicasPrincipales')}</h3>
              <ul>
                {caracteristicasFinal.map(f => (
                  <li key={f}>
                    <FaCheck /> {f.startsWith('productos.caracteristica.') ? t(f) : f}
                  </li>
                ))}
              </ul>
            </div>

            <div className="detalle-compra">
              {usaTamanos && (
                <div className="detalle-metros">
                  <span className="detalle-metros-titulo">{t('productos.eligeMedida')}</span>
                  <div className="detalle-metros-opciones">
                    {tamanosDisponibles.map(t => {
                      const variantesTamano = variantes.filter(
                        v => medidaDe(v) === t,
                      );
                      const stockTamano = producto
                        ? Math.max(
                            0,
                            ...variantesTamano.map((v) => stockDisponibleVariante(producto, v)),
                          )
                        : 0;
                      const precioTamano =
                        variantesTamano.find(v => v.precio != null)?.precio ??
                        precioBase;
                      return (
                        <button
                          key={t}
                          type="button"
                          className={`detalle-metro-chip ${tamano === t ? 'activo' : ''}`}
                          onClick={() => {
                            setTamano(t);
                            setImagenActiva(null);
                            // Si el color actual no existe en esa medida, cambia
                            // al primer color disponible con esa medida.
                            const compatible = variantes.find(
                              v =>
                                medidaDe(v) === t &&
                                v.nombre === color &&
                                (v.stock || 0) > 0,
                            );
                            if (!compatible) {
                              const alt = variantes.find(
                                v =>
                                  medidaDe(v) === t &&
                                  (v.stock || 0) > 0,
                              );
                              if (alt) setColor(alt.nombre);
                            }
                          }}
                          disabled={stockTamano <= 0}
                          aria-label={`Medida ${t}`}
                        >
                          {t}
                          {stockTamano <= 0 && ' (agotado)'}
                          {precioTamano !== precioBase && stockTamano > 0
                            ? ` · $${Number(precioTamano).toLocaleString()}`
                            : ''}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="detalle-colores">
                <span className="detalle-label">{t('productos.colorLabel')} <strong>{color}</strong></span>
                <div className="detalle-colores-swatches">
                  {paleta.map(c => {
                    const esColorPrincipal = c === colorPrincipal;
                    const variante = usaTamanos
                      ? variantes.find(v => v.nombre === c && medidaDe(v) === tamano)
                      : variantes.find(v => v.nombre === c);
                    const fondo = (
                      (esColorPrincipal ? producto.color_hex : null) ||
                      variante?.hex ||
                      COLOR_HEX[c] ||
                      '#ccc'
                    ).trim();
                    const esDegradado = fondo.startsWith('linear');
                    let agotado = false;
                    if (producto) {
                      agotado = variante
                        ? stockDisponibleVariante(producto, variante) <= 0
                        : (variantes.length > 0 || (esColorPrincipal && stockDisponibleProducto(producto) <= 0));
                    }
                    return (
                      <button
                        key={c}
                        type="button"
                        className={`detalle-swatch ${color === c ? 'activo' : ''} ${agotado ? 'agotado' : ''}`}
                        onClick={() => {
                          setColor(c);
                          if (usaTamanos) {
                            const compatible = variantes.find(
                              v => v.nombre === c && medidaDe(v) === tamano && (v.stock || 0) > 0,
                            );
                            if (!compatible) {
                              const alternativa = variantes.find(
                                v => v.nombre === c && (v.stock || 0) > 0,
                              );
                              if (alternativa) setTamano(medidaDe(alternativa));
                            }
                          }
                          setImagenActiva(null);
                        }}
                        disabled={agotado}
                        aria-label={`Color ${c}${agotado ? ' (sin stock)' : ''}`}
                        title={agotado ? `${c} — sin stock` : c}
                      >
                        <span
                          className="detalle-swatch-circle"
                          style={
                            esDegradado
                              ? { background: fondo }
                              : { background: fondo || '#ccc', opacity: agotado ? 0.35 : 1 }
                          }
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="detalle-cantidad-row">
                {producto.venta_por_metros ? (
                  <div className="detalle-metros-bloque">
                    <div className="detalle-metros-controles">
                      <div className="detalle-metros-campo">
                        <span className="detalle-metros-label">{t('productos.metrosPorUnidad')}</span>
                        <div className="detalle-metros-select-wrap">
                          <MetrosSelect className="detalle-metros-select" value={metros} max={stockDisponible / Math.max(1, unidadesMetros)}
                            aria-label="Metros por unidad" onChange={(nuevo) => {
                              setMetros(nuevo);
                              const maxU = Math.max(1, Math.floor(stockDisponible / nuevo));
                              if (unidadesMetros > maxU) setUnidadesMetros(maxU);
                            }} />
                          <span className="detalle-metros-unidad">m</span>
                        </div>

                      </div>
                      <div className="detalle-metros-campo detalle-unidades-campo">
                        <span className="detalle-metros-label">{t('productos.unidadesDetalle')}</span>
                        <div className="detalle-cantidad detalle-cantidad--compact">
                          <button
                            type="button"
                            onClick={() => {
                              const nueva = Math.max(1, unidadesMetros - 1);
                              setUnidadesMetros(nueva);
                              setDisplayUnidades(String(nueva));
                            }}
                            aria-label="Reducir unidades"
                          >
                            −
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            className="cantidad-input"
                            value={displayUnidades}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^0-9]/g, '');
                              setDisplayUnidades(val);
                            }}
                            onBlur={(e) => {
                              const num = Number.parseInt(e.target.value, 10);
                              if (Number.isNaN(num) || num < 1) {
                                setUnidadesMetros(1);
                                setDisplayUnidades('1');
                              } else {
                                const maxU = Math.max(1, Math.floor(stockDisponible / metros) || 99);
                                const newUnidades = num > maxU ? maxU : num;
                                setUnidadesMetros(newUnidades);
                                setDisplayUnidades(String(newUnidades));
                              }
                            }}
                            aria-label="Unidades"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const nueva = Math.min(unidadesMetros + 1, maxUnidades);
                              setUnidadesMetros(nueva);
                              setDisplayUnidades(String(nueva));
                            }}
                            disabled={unidadesMetros >= maxUnidades}
                            aria-label="Aumentar unidades"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="detalle-precio-desglose">
                      <div className="detalle-precio-desglose-fila">
                        <span>{t('productos.precioPorMetroDetalle')}</span>
                        <strong>${precioUnitario.toLocaleString()} COP</strong>
                      </div>
                      <div className="detalle-precio-desglose-fila">
                        <span>{t('productos.seleccion')}</span>
                        <span>{metros} m × {unidadesMetros} {t(unidadesMetros === 1 ? 'productos.unidad' : 'productos.unidades')}</span>
                      </div>
                      <div className="detalle-precio-desglose-fila detalle-precio-desglose-total">
                        <span>{t('productos.total')}</span>
                        <strong>${subtotalLinea(precioUnitario, unidadesMetros, metros).toLocaleString()} COP</strong>
                      </div>
                      <span className="detalle-precio-desglose-meta">{t('productos.totalMetros', { count: totalMetros, price: precioUnitario.toLocaleString() })}</span>
                    </div>
                  </div>
                ) : (
                  <div className="detalle-cantidad">
                    <button
                      type="button"
                      onClick={() => {
                        const nueva = Math.max(1, cantidad - 1);
                        setCantidad(nueva);
                        setDisplayValue(String(nueva));
                      }}
                      aria-label="Reducir cantidad"
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="cantidad-input"
                      value={displayValue}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        setDisplayValue(val);
                      }}
                      onBlur={(e) => {
                        const num = Number.parseInt(e.target.value, 10);
                        if (Number.isNaN(num) || num < 1) {
                          setCantidad(1);
                          setDisplayValue('1');
                        } else {
                          const newCantidad = num > stockDisponible ? stockDisponible : num;
                          setCantidad(newCantidad);
                          setDisplayValue(String(newCantidad));
                        }
                      }}
                      aria-label="Cantidad"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const nueva = Math.min(cantidad + 1, stockDisponible);
                        setCantidad(nueva);
                        setDisplayValue(String(nueva));
                      }}
                      disabled={cantidad >= stockDisponible}
                      aria-label="Aumentar cantidad"
                    >
                      +
                    </button>
                  </div>
                )}

                <button type="button" className="detalle-agregar-btn" onClick={handleAgregarAlCarrito} disabled={!puedeAgregar}>
                  {t('productos.agregarCarrito')}
                </button>

                <button
                  type="button"
                  className={`detalle-favorito-btn ${esFav ? 'activo' : ''}`}
                  onClick={handleToggleFavorito}
                >
                  <FaHeart />
                </button>
              </div>

              <p className="detalle-subtotal">
                Subtotal:{' '}
                <strong>
                  $
                  {(
                    producto.venta_por_metros ? subtotalLinea(precioUnitario, unidadesMetros, metros) : subtotalLinea(precioUnitario, cantidad)
                  ).toLocaleString()}{' '}
                  COP
                </strong>
                {producto.venta_por_metros && (
                  <span className="detalle-subtotal-detalle"> · ${precioUnitario.toLocaleString()} / m · {totalMetros} m</span>
                )}
              </p>
            </div>

            {variantes.length > 0 && (
              <div className="detalle-combos">
                <span className="detalle-label">
                  Combinaciones disponibles ({variantes.filter(v => producto && stockDisponibleVariante(producto, v) > 0).length}):
                </span>
                <div className="detalle-combos-grid">
                  {variantes.map((v) => {
                    const medida = medidaDe(v);
                    const activa =
                      v.nombre === color && (!usaTamanos || medida === tamano);
                    const agotada = !producto || stockDisponibleVariante(producto, v) <= 0;
                    const fondo = (v.hex || COLOR_HEX[v.nombre] || '#ccc').trim();
                    return (
                      <button
                        key={v.id}
                        type="button"
                        className={`detalle-combo ${activa ? 'activo' : ''}`}
                        disabled={agotada}
                        onClick={() => {
                          setColor(v.nombre);
                          if (usaTamanos) setTamano(medida);
                        }}
                        title={agotada ? 'Sin stock' : 'Elegir esta combinación'}
                      >
                        <span
                          className="detalle-combo-color"
                          style={{ background: fondo }}
                        />
                        <span className="detalle-combo-info">
                          <strong>{v.nombre}</strong>
                          {medida && <em>{medida}</em>}
                          <small>
                            {agotada
                              ? 'Agotado'
                              : `${producto ? stockDisponibleVariante(producto, v) : 0} u. · $${Number(
                                  v.precio ?? precioBase,
                                ).toLocaleString()}`}
                          </small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="detalle-beneficios">
              <div className="detalle-beneficio">
                <FaTruckFast />
                <span>{t('productos.envioSeguro')}</span>
              </div>
              <div className="detalle-beneficio">
                <FaShieldHalved />
                <span>{t('productos.garantiaOficial')}</span>
              </div>
              <div className="detalle-beneficio">
                <FaUsers />
                <span>
                  {producto.tecnicos_requeridos && producto.tecnicos_requeridos > 0
                    ? `Requiere ${producto.tecnicos_requeridos > 1 ? producto.tecnicos_requeridos + ' técnicos' : '1 técnico'} para su instalación`
                    : 'No requiere instalación'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Recomendados — mismo diseño premium que la página de productos */}
        {recomendados.length > 0 && (
          <div className="detalle-recomendados">
            <h3 className="detalle-recomendados-titulo">{t('productos.recomendadosTitulo')}</h3>
            <div className="detalle-recomendados-carousel-wrap">
              <button
                className="carousel-flecha carousel-flecha-izq"
                onClick={() => scrollCarousel('izq')}
                aria-label="Desplazar a la izquierda"
              >
                <FaChevronLeft />
              </button>
              <div className="detalle-recomendados-carousel" ref={carouselRef}>
                <div className="productos-grid detalle-recomendados-grid">
                  {recomendados.map((p) => (
                    <ProductoCard key={p.id_producto} producto={p} />
                  ))}
                </div>
              </div>
              <button
                className="carousel-flecha carousel-flecha-der"
                onClick={() => scrollCarousel('der')}
                aria-label="Desplazar a la derecha"
              >
                <FaChevronRight />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default ProductoDetalle;
