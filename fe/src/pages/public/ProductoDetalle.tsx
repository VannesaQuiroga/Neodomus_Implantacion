import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { FaArrowLeft, FaHeart, FaCheck, FaTruckFast, FaShieldHalved, FaRotateLeft, FaUsers, FaChevronLeft, FaChevronRight } from 'react-icons/fa6';
import api from '@services/api';
import { useCart } from '@contexts/CartContext';
import { useFavoritos } from '@utils/favoritos';
import { useIdioma } from '@i18n/IdiomaContext';
import '@styles/producto-detalle.css';

interface Producto {
  id_producto: number;
  nombre_producto: string;
  marca?: string | null;
  colores_producto?: string | null;
  color_hex?: string | null;
  tamaño?: string | null;
  venta_por_metros?: boolean;
  precio_venta_producto: number;
  imagen_url?: string | null;
  id_cate_pr?: number;
  nombre_categoria?: string;
  stock_producto?: number;
  stock_estado?: 'disponible' | 'bajo' | 'agotado';
  descuento_activo?: number | null;
  precio_final?: number | null;
  promocion_hasta?: string | null;
  es_nuevo?: boolean;
  tecnicos_requeridos?: number;
  descripcion_producto?: string | null;
  caracteristicas_producto?: string | null;
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

const METROS_OPCIONES = [10, 20, 30, 40, 50];

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
    'Detección precisa de movimiento',
    'Alcance de hasta 8 metros',
    'Ángulo de detección de 90° a 110°',
    'Alimentación de bajo consumo',
    'Fácil instalación sin obras',
  ],
  2: [
    'Control central de todos tus dispositivos',
    'Compatibilidad con protocolos Wi-Fi y Zigbee',
    'App móvil para gestión remota',
    'Escenas y rutinas programables',
    'Actualizaciones de firmware automáticas',
  ],
  3: [
    'Iluminación regulable y personalizable',
    'Colores RGB y tonos de blanco',
    'Control por app y asistentes de voz',
    'Bajo consumo energético',
    'Larga vida útil de los LEDs',
  ],
  4: [
    'Automatización completa del hogar',
    'Programación de escenas por horarios',
    'Integración con sensores y cámaras',
    'Control por voz (Alexa, Google Home)',
    'Instalación guiada paso a paso',
  ],
  5: [
    'Conectividad de alto rendimiento',
    'Transmisión de datos estable y rápida',
    'Material de alta durabilidad',
    'Compatibilidad con routers estándar',
    'Presentaciones y longitudes variadas',
  ],
  6: [
    'Control de encendido y apagado remoto',
    'Monitoreo de consumo eléctrico',
    'Programación de horarios',
    'Protección contra sobrecargas',
    'Compatibilidad con asistentes de voz',
  ],
  7: [
    'Salida de voltaje estable',
    'Protección contra sobrevoltaje',
    'Alta eficiencia energética',
    'Conexión segura de terminales',
    'Uso continuo y confiable',
  ],
  8: [
    'Vigilancia y monitoreo 24/7',
    'Notificaciones en tiempo real',
    'Visión nocturna',
    'Grabación de alta definición',
    'Fácil configuración desde la app',
  ],
  9: [
    'Control de temperatura inteligente',
    'Programación por horarios y zonas',
    'Ahorro energético automático',
    'Control remoto desde la app',
    'Compatibilidad con asistentes de voz',
  ],
  10: [
    'Panel de control táctil intuitivo',
    'Gestión central de todo el hogar',
    'Pantalla de alta resolución',
    'Escenas personalizadas',
    'Interfaz en español',
  ],
};

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
    ) ||
    variantes.find((v) => v.nombre === color) ||
    null;
  const stockDisponible = varianteActiva
    ? (varianteActiva.stock ?? 0)
    : (producto?.stock_producto ?? 0);
  const precioBase = producto?.precio_final ?? producto?.precio_venta_producto ?? 0;
  // Precio de la variante elegida; si no define uno propio, el del producto.
  const precioUnitario = varianteActiva?.precio ?? precioBase;
  const precioFinal = precioUnitario;
  const tieneDescuento = producto?.precio_final != null && Boolean(producto?.descuento_activo && producto.descuento_activo > 0);
  const totalMetros = (producto?.venta_por_metros ? metros * unidadesMetros : 0);
  const maxUnidades = producto?.venta_por_metros && metros > 0 ? Math.max(1, Math.floor((stockDisponible || 0) / metros) || 1) : 99;
  const imagen =
    imagenActiva ||
    varianteActiva?.imagen_url ||
    producto?.imagen_url ||
    `/productos/${producto?.id_producto}.jpg`;

  // Galería: imagen principal siempre visible + imágenes propias de variantes.
  // Cada imagen lleva su color asociado para el vínculo bidireccional color<->imagen.
  const imagenesGaleria = useMemo(() => {
    const lista: { url: string; key: string; etiqueta: string; color: string | null; tamano: string }[] = [];
    if (producto?.imagen_url) {
      lista.push({
        url: producto.imagen_url,
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
    fetchProducto();
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
      // Selecciona la primera medida disponible si el producto las usa.
      if (usaTamanos) {
        const primeraVariante =
          producto.variantes?.find(v => v.nombre === colorInicial) ||
          producto.variantes?.[0];
        setTamano(
          (primeraVariante?.etiqueta_medida || primeraVariante?.tamaño || '').trim(),
        );
      } else {
        setTamano('');
      }
      const paramMetros = searchParams.get('metros');
      if (producto.venta_por_metros) {
        if (paramMetros) setMetros(METROS_OPCIONES.includes(Number(paramMetros)) ? Number(paramMetros) : 10);
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

  if (loading) return <div className="detalle-loading">Cargando producto...</div>;
  if (error || !producto)
    return (
      <div className="detalle-error">
        <p>{error || 'Producto no encontrado'}</p>
        <button type="button" className="detalle-back-btn" onClick={() => navigate('/productos')}>
          <FaArrowLeft /> Volver a productos
        </button>
      </div>
    );

  const paleta = paletaDe();
  const caracteristicas = (producto.caracteristicas_producto || '')
    .split('\n')
    .map((c) => c.replace(/^[-*\s]+/, '').trim())
    .filter(Boolean);
  const caracteristicasFinal = caracteristicas.length
    ? caracteristicas
    : CARACTERISTICAS[producto.id_cate_pr ?? 0] || CARACTERISTICAS[1];
  const categoria = producto.nombre_categoria || 'Producto';

  const descripcion = producto.descripcion_producto || `El ${producto.nombre_producto} pertenece a la categoría de ${categoria}. Diseñado para integrarse a la perfección en tu hogar inteligente, combina tecnología confiable con una instalación sencilla, garantizando el mejor rendimiento y la máxima comodidad para tu espacio.`;

  const esFav = producto ? esFavorito(producto.id_producto) : false;

  const handleToggleFavorito = () => {
    if (!producto) return;
    toggleFavorito(producto.id_producto);
    showToast(esFav ? 'Producto eliminado de favoritos' : 'Producto agregado a favoritos');
  };

  const handleAgregarAlCarrito = () => {
    if (stockDisponible <= 0) {
      showToast('No hay stock disponible para esta combinación de color/tamaño');
      return;
    }
    if (usaTamanos && !tamano) {
      showToast('Selecciona un tamaño disponible');
      return;
    }
    if (producto.venta_por_metros) {
      if (!metros || metros <= 0) {
        showToast('Ingresa una cantidad de metros válida');
        return;
      }
      if (!unidadesMetros || unidadesMetros < 1) {
        showToast('Ingresa una cantidad de unidades válida');
        return;
      }
      const totalSolicitado = metros * unidadesMetros;
      if (totalSolicitado > stockDisponible) {
        showToast(`Stock insuficiente: solo hay ${stockDisponible} m disponibles`);
        return;
      }
      if (editarKey) removeItem(editarKey);
      const error = addItem(
        {
          id_producto: producto.id_producto,
          nombre_producto: producto.nombre_producto,
          precio_venta_producto: precioFinal,
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
        showToast(`${unidadesMetros} × ${metros} m (${totalSolicitado} m) — ${producto.nombre_producto} ${t('productos.agregadoAlCarrito')}`);
      }
      return;
    }
    if (editarKey) removeItem(editarKey);
    const cantidadFinal = Math.min(Math.max(1, cantidad), stockDisponible);
    const error = addItem(
      {
        id_producto: producto.id_producto,
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
      showToast(`${cantidadFinal} x ${producto.nombre_producto} ${t('productos.agregadoAlCarrito')}`);
    }
  };

  return (
    <div className="detalle-page app-glass">
      {toast && <div className="detalle-toast">{toast}</div>}
      <main className="detalle-main">
        <button type="button" className="detalle-back-btn" onClick={() => navigate(editarKey ? '/carrito' : '/productos')}>
          <FaArrowLeft /> {editarKey ? 'Volver al carrito' : t('carrito.volverProductos')}
        </button>

        <nav className="detalle-breadcrumb" aria-label={t('detalle.ruta')}>
          <Link to="/productos">{t('nav.productos')}</Link>
          <span className="detalle-breadcrumb-sep">/</span>
          <span className="detalle-breadcrumb-cat">{categoria}</span>
          <span className="detalle-breadcrumb-sep">/</span>
          <span>{producto.nombre_producto}</span>
        </nav>

        <div className="detalle-layout">
          <div className="detalle-galeria">
            <div className="detalle-imagen-card">
              <div className="detalle-corner-badges">
                {tieneDescuento && (
                  <span className="detalle-promo-corner">Promoción -{producto.descuento_activo}%</span>
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
                alt={producto.nombre_producto}
                onError={(e) => (e.currentTarget.src = '/productos/default.png')}
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
            <h1 className="detalle-nombre">{producto.nombre_producto}</h1>
            {producto.marca && <span className="detalle-marca">Marca: {producto.marca}</span>}
            {producto.tamaño && <span className="detalle-marca">Tamaño: {producto.tamaño}</span>}

            <div className={`detalle-precio ${producto.venta_por_metros ? 'detalle-precio--metros' : ''}`}>
              {producto.venta_por_metros ? (
                <>
                  <div className="detalle-precio-total-row">
                    {tieneDescuento && (
                      <span className="detalle-precio-original">
                        ${(producto.precio_venta_producto * totalMetros).toLocaleString()}
                      </span>
                    )}
                    <span className="detalle-precio-monto">
                      ${(precioFinal * totalMetros).toLocaleString()}
                    </span>
                    <span className="detalle-precio-sufijo">COP</span>
                    {tieneDescuento && (
                      <span className="detalle-badge-descuento">-{producto.descuento_activo}%</span>
                    )}
                  </div>
                  <span className="detalle-precio-unitario">
                    ${precioFinal.toLocaleString()} COP / metro · {metros} m × {unidadesMetros} {unidadesMetros === 1 ? 'unidad' : 'unidades'} = {totalMetros} m total
                  </span>
                </>
              ) : (
                <>
                  {tieneDescuento && (
                    <span className="detalle-precio-original">
                      ${(producto.precio_venta_producto).toLocaleString()}
                    </span>
                  )}
                  <span className="detalle-precio-monto">
                    ${precioFinal.toLocaleString()}
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
                  ? `Disponible · ${stockDisponible} m${variantes.length ? ' en esta combinación' : ''} · ${totalMetros} m seleccionados`
                  : `Disponible · ${stockDisponible} u.${variantes.length ? ' en esta combinación' : ''}`
                : 'Sin stock en esta combinación'}
            </div>

            <p className="detalle-descripcion">{descripcion}</p>

            <div className="detalle-caracteristicas">
              <h3>Características principales</h3>
              <ul>
                {caracteristicasFinal.map(f => (
                  <li key={f}>
                    <FaCheck /> {f}
                  </li>
                ))}
              </ul>
            </div>

            <div className="detalle-compra">
              {usaTamanos && (
                <div className="detalle-metros">
                  <span className="detalle-metros-titulo">Elige la medida:</span>
                  <div className="detalle-metros-opciones">
                    {tamanosDisponibles.map(t => {
                      const variantesTamano = variantes.filter(
                        v => medidaDe(v) === t,
                      );
                      const stockTamano = variantesTamano.reduce(
                        (acc, v) => acc + (v.stock || 0),
                        0,
                      );
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
                <span className="detalle-label">Color: <strong>{color}</strong></span>
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
                    if (variante) {
                      agotado = (variante.stock ?? 0) <= 0;
                    } else if (esColorPrincipal) {
                      agotado = (producto.stock_producto ?? 0) <= 0;
                    }
                    return (
                      <button
                        key={c}
                        type="button"
                        className={`detalle-swatch ${color === c ? 'activo' : ''} ${agotado ? 'agotado' : ''}`}
                        onClick={() => { setColor(c); setImagenActiva(null); }}
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
                        <span className="detalle-metros-label">Metros por unidad</span>
                        <div className="detalle-metros-select-wrap">
                          <select
                            className="detalle-metros-select"
                            value={metros}
                            onChange={(e) => {
                              const nuevo = Number(e.target.value);
                              setMetros(nuevo);
                              if (nuevo * unidadesMetros > stockDisponible) {
                                const maxU = Math.max(1, Math.floor(stockDisponible / nuevo) || 1);
                                if (unidadesMetros > maxU) setUnidadesMetros(maxU);
                              }
                            }}
                            aria-label="Metros por unidad"
                          >
                            {METROS_OPCIONES.map(m => (
                              <option key={m} value={m}>{m} m</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="detalle-metros-campo detalle-unidades-campo">
                        <span className="detalle-metros-label">Unidades</span>
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
                              const num = parseInt(e.target.value, 10);
                              if (isNaN(num) || num < 1) {
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
                        <span>Precio por metro</span>
                        <strong>${precioUnitario.toLocaleString()} COP</strong>
                      </div>
                      <div className="detalle-precio-desglose-fila">
                        <span>Selección</span>
                        <span>{metros} m × {unidadesMetros} {unidadesMetros === 1 ? 'unidad' : 'unidades'}</span>
                      </div>
                      <div className="detalle-precio-desglose-fila detalle-precio-desglose-total">
                        <span>Total</span>
                        <strong>${(precioUnitario * totalMetros).toLocaleString()} COP</strong>
                      </div>
                      <span className="detalle-precio-desglose-meta">{totalMetros} m en total · ${precioUnitario.toLocaleString()} / m</span>
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
                        const num = parseInt(e.target.value, 10);
                        if (isNaN(num) || num < 1) {
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

                <button type="button" className="detalle-agregar-btn" onClick={handleAgregarAlCarrito}>
                  Agregar al carrito
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
                    producto.venta_por_metros ? precioUnitario * totalMetros : precioUnitario * cantidad
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
                  Combinaciones disponibles ({variantes.filter(v => (v.stock || 0) > 0).length}):
                </span>
                <div className="detalle-combos-grid">
                  {variantes.map((v) => {
                    const medida = medidaDe(v);
                    const activa =
                      v.nombre === color && (!usaTamanos || medida === tamano);
                    const agotada = (v.stock || 0) <= 0;
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
                              : `${v.stock} u. · $${Number(
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
                <span>Envío seguro a todo el país</span>
              </div>
              <div className="detalle-beneficio">
                <FaShieldHalved />
                <span>Garantía oficial Neodomus</span>
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

        {/* Recomendados — solo en pantallas grandes */}
        {recomendados.length > 0 && (
          <div className="detalle-recomendados">
            <h3 className="detalle-recomendados-titulo">También te puede interesar</h3>
            <div className="detalle-recomendados-wrap">
              <button className="carousel-flecha" onClick={() => scrollCarousel('izq')} aria-label="Anterior">
                <FaChevronLeft />
              </button>
              <div className="detalle-recomendados-carousel" ref={carouselRef}>
                {recomendados.map((p) => {
                  const img = p.imagen_url || `/productos/${p.id_producto}.jpg`;
                  const precio = p.precio_final ?? p.precio_venta_producto;
                  return (
                    <Link key={p.id_producto} to={`/producto/${p.id_producto}`} className="recomendado-card">
                      <div className="recomendado-img-wrap">
                        <img src={img} alt={p.nombre_producto} className="recomendado-img" loading="lazy" />
                        {p.descuento_activo != null && p.descuento_activo > 0 && (
                          <span className="recomendado-badge">-{p.descuento_activo}%</span>
                        )}
                      </div>
                      <div className="recomendado-info">
                        <span className="recomendado-nombre">{p.nombre_producto}</span>
                        <span className="recomendado-precio">${precio?.toLocaleString('es-CO')}</span>
                        {p.stock_estado === 'agotado' && <span className="recomendado-agotado">Agotado</span>}
                      </div>
                    </Link>
                  );
                })}
              </div>
              <button className="carousel-flecha" onClick={() => scrollCarousel('der')} aria-label="Siguiente">
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
