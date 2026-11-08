import LocalizedNotificationText from '@components/common/LocalizedNotificationText';
import { MetrosSelect } from '@components/common/MetrosSelect';
// Tarjeta de producto rediseñada — estilo premium oscuro con borde dorado.
// Reutiliza exactamente el mismo CarritoContext, lógica de stock, variantes,
// favoritos y precios que la sección anterior.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '@contexts/CartContext';
import { useFavoritos } from '@utils/favoritos';
import { useIdioma } from '@i18n/IdiomaContext';
import {
  stockDisponibleProducto,
  stockDisponibleVariante,
} from '@utils/productoDisponibilidad';
import {
  precioOriginalProducto,
  precioUnitarioProducto,
  subtotalLinea,
} from '@utils/productoPrecio';
import { aplicarFallbackImagenProducto, resolverImagenProducto } from '@utils/productImages';
import '@styles/productos-publicos.css';

interface ProductoVariante {
  id: number;
  nombre: string;
  hex?: string | null;
  tamaño?: string | null;
  ancho_cm?: number | null;
  alto_cm?: number | null;
  etiqueta_medida?: string | null;
  precio?: number | null;
  stock: number;
}

export interface ProductoCardData {
  id_producto: number;
  referencia_producto?: string | null;
  nombre_producto: string;
  nombre_producto_label?: string;
  precio_venta_producto: number;
  imagen_url?: string | null;
  id_cate_pr?: number;
  nombre_categoria?: string;
  nombre_categoria_label?: string;
  venta_por_metros?: boolean;
  descuento_activo?: number | null;
  precio_final?: number | null;
  promocion_hasta?: string | null;
  es_nuevo?: boolean;
  stock_producto?: number;
  stock_disponible?: number;
  disponible?: boolean;
  stock_estado?: 'disponible' | 'bajo' | 'agotado';
  tecnicos_requeridos?: number;
  variantes?: ProductoVariante[];
}

interface Props {
  producto: ProductoCardData;
}

const ProductoCard = ({ producto }: Props) => {
  const { addItem } = useCart();
  const { t } = useIdioma();
  const { favoritos, toggleFavorito } = useFavoritos();

  const variantes = producto.variantes ?? [];
  const [varianteId, setVarianteId] = useState<number | null>(() => {
    const disponibles = variantes.filter((v) => stockDisponibleVariante(producto, v) > 0);
    return (disponibles[0] ?? variantes[0])?.id ?? null;
  });
  const [cantidad, setCantidad] = useState(1);
  const [displayValue, setDisplayValue] = useState('1');
  const [metros, setMetros] = useState(10);
  const [unidades, setUnidades] = useState(1);
  const [displayUnidades, setDisplayUnidades] = useState<string | undefined>(undefined);
  const [toast, setToast] = useState('');

  const esFavorito = favoritos.has(producto.id_producto);
  const esPorMetros = Boolean(producto.venta_por_metros);
  const varianteActiva = variantes.find((v) => v.id === varianteId) ?? null;
  const tieneVariantes = variantes.length > 0;
  const precioUnitario = precioUnitarioProducto(producto, varianteActiva);
  const precioOriginal = precioOriginalProducto(producto, varianteActiva);
  const tieneDescuento = precioOriginal != null;

  const stockTotal = stockDisponibleProducto(producto);
  const stockDisponible = tieneVariantes
    ? (varianteActiva ? stockDisponibleVariante(producto, varianteActiva) : 0)
    : stockTotal;
  const esStockAgotado = stockDisponible <= 0;
  const esStockBajo = stockDisponible > 0 && stockDisponible <= 5;
  const stockLabel = esPorMetros
    ? t('productos.disponibilidadMetros', { count: stockDisponible })
    : t('productos.disponibilidadUnidades', {
        count: stockDisponible,
        unit: t(stockDisponible === 1 ? 'productos.unidad' : 'productos.unidades'),
      });
  const nombreVisible = producto.nombre_producto_label || producto.nombre_producto;

  const totalMetrosCard = metros * unidades;
  const totalLinea = esPorMetros
    ? subtotalLinea(precioUnitario, unidades, metros)
    : subtotalLinea(precioUnitario, cantidad);

  useEffect(() => {
    if (!tieneVariantes) {
      if (varianteId !== null) setVarianteId(null);
      return;
    }
    const actual = varianteActiva;
    if (!actual || stockDisponibleVariante(producto, actual) <= 0) {
      const siguiente =
        variantes.find((v) => stockDisponibleVariante(producto, v) > 0) ?? variantes[0];
      if (siguiente && siguiente.id !== varianteId) setVarianteId(siguiente.id);
    }
  }, [producto, varianteId, tieneVariantes, varianteActiva, variantes]);

  useEffect(() => {
    if (stockDisponible <= 0) return;
    setCantidad((prev) => Math.min(Math.max(1, prev), Math.max(1, Math.floor(stockDisponible))));
    if (!esPorMetros) return;
    setUnidades((prev) => {
      const maxU = Math.max(
        1,
        Math.floor(stockDisponible / Math.max(metros, 0.5)) || 1,
      );
      return Math.min(Math.max(1, prev), maxU);
    });
    setMetros((prev) => {
      const maxM = Math.floor((stockDisponible / Math.max(1, unidades)) * 2) / 2;
      return maxM > 0 ? Math.min(prev, maxM) : prev;
    });
  }, [varianteId, stockDisponible, esPorMetros]);

  const getImagen = resolverImagenProducto;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const datosVariante = varianteActiva
    ? {
        color: varianteActiva.nombre,
        tamaño: varianteActiva.etiqueta_medida || varianteActiva.tamaño || undefined,
        medida: varianteActiva.etiqueta_medida || varianteActiva.tamaño || undefined,
        id_variante: varianteActiva.id,
      }
    : {};

  const handleAddToCart = () => {
    if (tieneVariantes && !varianteActiva) {
      showToast(t('productos.seleccionaVariante'));
      return;
    }
    if (stockDisponible <= 0) {
      showToast(t('productos.sinStockDisponible'));
      return;
    }
    if (esPorMetros) {
      const total = metros * unidades;
      if (metros <= 0 || total > stockDisponible) {
        showToast(t('productos.stockInsuficienteMetros', { count: stockDisponible }));
        return;
      }
      const err = addItem(
        {
          id_producto: producto.id_producto,
          referencia_producto: producto.referencia_producto,
          nombre_producto: producto.nombre_producto,
          precio_venta_producto: precioUnitario,
          imagen: getImagen(producto),
          venta_por_metros: true,
          stock_maximo: stockDisponible,
          metros,
          tecnicos_requeridos: producto.tecnicos_requeridos,
          ...datosVariante,
        },
        unidades,
        metros
      );
      if (err) showToast(err);
      else showToast(`${unidades} × ${metros} m (${total} m) — ${nombreVisible}`);
    } else {
      if (cantidad > stockDisponible) {
        showToast(t('productos.stockInsuficienteUnidades', {
          count: stockDisponible,
          unit: t(stockDisponible === 1 ? 'productos.unidad' : 'productos.unidades'),
        }));
        return;
      }
      const err = addItem(
        {
          id_producto: producto.id_producto,
          referencia_producto: producto.referencia_producto,
          nombre_producto: producto.nombre_producto,
          precio_venta_producto: precioUnitario,
          imagen: getImagen(producto),
          stock_maximo: stockDisponible,
          tecnicos_requeridos: producto.tecnicos_requeridos,
          ...datosVariante,
        },
        cantidad
      );
      if (err) showToast(err);
      else showToast(t('productos.agregadoMsg', { nombre: nombreVisible }));
    }
  };

  const disminuirCantidad = () => setCantidad(prev => {
    const nueva = Math.max(1, prev - 1);
    setDisplayValue(String(nueva));
    return nueva;
  });
  const aumentarCantidad = () => {
    setCantidad(prev => {
      if (prev >= stockDisponible) return prev;
      const nueva = prev + 1;
      setDisplayValue(String(nueva));
      return nueva;
    });
  };

  const handleCantidadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    setDisplayValue(val);
  };

  const handleCantidadBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    const num = Number.parseInt(raw, 10);
    if (raw === '' || Number.isNaN(num) || num < 1) {
      setCantidad(1);
      setDisplayValue('1');
    } else {
      const newCantidad = num > stockDisponible ? stockDisponible : num;
      setCantidad(newCantidad);
      setDisplayValue(String(newCantidad));
    }
  };

  const disminuirUnidades = () => setUnidades(prev => Math.max(1, prev - 1));
  const aumentarUnidades = () => {
    const maxU = Math.max(1, Math.floor(stockDisponible / Math.max(metros, 0.5)) || 1);
    setUnidades(prev => (prev >= maxU ? prev : prev + 1));
  };

  return (
    <>
      {toast && <div className="cart-toast"><LocalizedNotificationText message={toast} /></div>}
      <div className="card-producto">
        {/* Imagen superior centrada */}
        <div className="img-contenedor">
          {/* Favoritos esquina superior derecha */}
          <button
            type="button"
            className={`btn-favorito ${esFavorito ? 'activo' : ''}`}
            onClick={() => toggleFavorito(producto.id_producto)}
            aria-label={esFavorito ? t('productos.quitarFavoritos') : t('productos.agregarFavoritos')}
            title={esFavorito ? t('productos.quitarFavoritos') : t('productos.agregarFavoritos')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          </button>
          <div className="img-producto-wrap">
            <Link to={`/producto/${producto.id_producto}`} aria-label={t('productos.verDetalleDe', { name: nombreVisible })}>
              <img
                src={getImagen(producto)}
                alt={nombreVisible}
                className="img-producto"
                loading="lazy"
                onError={(e) => aplicarFallbackImagenProducto(e.currentTarget, producto.referencia_producto)}
              />
            </Link>
          </div>
          {/* Corner badges (Nuevo / Promoción) */}
          <div className="corner-badges">
            {producto.es_nuevo && <span className="nuevo-corner">{t('productos.nuevo')}</span>}
            {tieneDescuento && <span className="promo-corner">{t('productos.promocion')}</span>}
          </div>
        </div>

        {/* Información del producto */}
        <div className="info-producto">
          {/* Nombre */}
          <Link to={`/producto/${producto.id_producto}`} className="nombre-producto-link">
            <h3 className="nombre-producto">{nombreVisible}</h3>
          </Link>

          {/* Categoría badge dorada */}
          <span
            className="categoria-producto"
            style={{ visibility: producto.nombre_categoria ? 'visible' : 'hidden' }}
            aria-hidden={!producto.nombre_categoria}
          >
            {producto.nombre_categoria_label || producto.nombre_categoria || '\u00a0'}
          </span>

          {/* Etiqueta de requisitos técnicos */}
          <span
            className="tecnico-requisito"
            style={{ visibility: producto.tecnicos_requeridos && producto.tecnicos_requeridos > 0 ? 'visible' : 'hidden' }}
            aria-hidden={!producto.tecnicos_requeridos}
          >
            {producto.tecnicos_requeridos && producto.tecnicos_requeridos > 0
              ? t(producto.tecnicos_requeridos === 1 ? 'productos.tecnicosUno' : 'productos.tecnicosVarios', { count: producto.tecnicos_requeridos })
              : '\u00a0'}
          </span>

          {/* Separador horizontal */}
          <div className="separador" />

          {/* Precios */}
          <div className="precio-bloque">
            <span className="precio-unitario">
              {t(esPorMetros ? 'productos.precioPorMetro' : 'productos.precioUnitario')}
            </span>
            <div className="precio-producto">
              {tieneDescuento && (
                <span className="precio-original">
                  ${precioOriginal!.toLocaleString()}
                </span>
              )}
              <span className="precio-monto">
                ${precioUnitario.toLocaleString()}
              </span>
              <span className="precio-sufijo">COP</span>
              {tieneDescuento && (
                <span className="badge-descuento">-{producto.descuento_activo}%</span>
              )}
            </div>
          </div>

          {/* Subtotal calculado */}
          <span className="subtotal-detalle">
            {t('productos.subtotal', { quantity: esPorMetros ? `${metros} m × ${unidades}` : `${cantidad} u.` })}{' '}
            <span className="subtotal-detalle-valor">${totalLinea.toLocaleString()} COP</span>
          </span>

          {/* Disponibilidad con punto verde */}
          <span className={`stock-disponible ${esStockAgotado ? 'stock-disponible--agotado' : ''} ${esStockBajo ? 'stock-disponible--bajo' : ''}`}>
            <span className="stock-disponible__dot" aria-hidden="true"></span>
            {esStockAgotado ? t('productos.sinStock') : stockLabel}
          </span>

          {/* Variantes (chips de color/tamaño) */}
          {variantes.length > 0 ? (
            <div className="combos-mini">
              {variantes.slice(0, 4).map((v) => {
                const medida = v.etiqueta_medida || v.tamaño || '';
                const stockVariante = stockDisponibleVariante(producto, v);
                const agotada = stockVariante <= 0;
                const activa = varianteActiva?.id === v.id;
                return (
                  <button
                    type="button"
                    key={v.id}
                    className={`combo-chip ${agotada ? 'agotado' : ''} ${activa ? 'activo' : ''}`}
                    disabled={agotada}
                    onClick={() => setVarianteId(v.id)}
                    aria-pressed={activa}
                    title={`${v.nombre}${medida ? ` - ${medida}` : ''} - ${agotada ? t('productos.sinStock') : t('productos.stockVariante', { count: stockVariante })}`}
                  >
                    <i className="combo-dot" style={{ background: v.hex || '#d4a54b' }} />
                    <b>{v.nombre}</b>
                    {medida && <span> - {medida}</span>}
                    {agotada && <span> ({t('productos.agotado')})</span>}
                  </button>
                );
              })}
              {(variantes.length > 4) && (
                <span className="combo-chip mas">+{variantes.length - 4}</span>
              )}
            </div>
          ) : (
            <div className="combos-mini combos-mini--placeholder" aria-hidden="true">
              <span className="combo-chip" style={{ visibility: 'hidden' }}>.</span>
            </div>
          )}

          {/* Selector de cantidad */}
          <div className="selectores-bloque">
            {esPorMetros ? (
              <div className="metros-control-grid">
                <MetrosSelect className="metros-select" value={metros} max={stockDisponible / Math.max(1, unidades)}
                  aria-label={t('productos.metrosLabel')} onChange={(m) => {
                    setMetros(m);
                    const stock = stockDisponible;
                    if (Number.isFinite(stock) && m * unidades > stock) {
                      setUnidades(Math.max(1, Math.floor(stock / m)));
                    }
                  }} />
                <div className="cantidad-row">
                  <span className="cantidad-label">{t('productos.unidadesLabel')}</span>
                  <div className="cantidad-control">
                    <button type="button" onClick={disminuirUnidades} aria-label={t('productos.reducirUnidades')}>−</button>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="cantidad-input"
                      value={displayUnidades !== undefined ? displayUnidades : String(unidades)}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        setDisplayUnidades(val);
                      }}
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        const num = Number.parseInt(raw, 10);
                        const stock = stockDisponible;
                        const maxU = Number.isFinite(stock) ? Math.max(1, Math.floor(stock / metros) || 1) : Infinity;
                        if (raw === '' || Number.isNaN(num) || num < 1) {
                          setUnidades(1);
                        } else {
                          setUnidades(num > maxU ? maxU : num);
                        }
                        setDisplayUnidades(undefined);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      aria-label={t('productos.unidadesLabel')}
                    />
                    <button
                      type="button"
                      onClick={aumentarUnidades}
                      disabled={unidades >= Math.max(1, Math.floor(stockDisponible / Math.max(metros, 0.5)) || 1)}
                      aria-label={t('productos.aumentarUnidades')}
                    >+</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="cantidad-row">
                <span className="cantidad-label">{t('productos.cantidadLabel')}</span>
                <div className="cantidad-control">
                  <button type="button" onClick={disminuirCantidad} disabled={cantidad <= 1} aria-label={t('productos.reducirCantidad')}>−</button>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="cantidad-input"
                    value={displayValue}
                    onChange={handleCantidadChange}
                    onBlur={handleCantidadBlur}
                    aria-label={t('productos.cantidadLabel')}
                  />
                  <button
                    type="button"
                    onClick={aumentarCantidad}
                    disabled={cantidad >= stockDisponible}
                    aria-label={t('productos.aumentarCantidad')}
                  >+</button>
                </div>
              </div>
            )}
          </div>

          {/* Botón agregar al carrito */}
          <button
            className="btn-agregar btn-agregar--footer"
            onClick={handleAddToCart}
            disabled={esStockAgotado || (tieneVariantes && !varianteActiva) || (esPorMetros && (metros <= 0 || totalMetrosCard > stockDisponible))}
            title={esStockAgotado ? 'Sin stock disponible' : undefined}
          >
            <span>{t('productos.agregarCarrito')}</span>
            <svg className="icono-carrito" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
};

export default ProductoCard;
