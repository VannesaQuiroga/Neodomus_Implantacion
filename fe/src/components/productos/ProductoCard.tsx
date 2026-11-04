import { MetrosSelect } from '@components/common/MetrosSelect';
// Tarjeta de producto usada en las listas del catálogo web.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '@contexts/CartContext';
import { useFavoritos } from '@utils/favoritos';
import { useIdioma } from '@i18n/IdiomaContext';
import { stockDisponibleProducto, stockDisponibleVariante } from '@utils/productoDisponibilidad';
import {
  precioOriginalProducto,
  precioUnitarioProducto,
  subtotalLinea,
} from '@utils/productoPrecio';
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
  nombre_producto: string;
  precio_venta_producto: number;
  imagen_url?: string | null;
  id_cate_pr?: number;
  nombre_categoria?: string;
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
  const stockTexto = esPorMetros
    ? `${stockDisponible} m disponibles`
    : `${stockDisponible} ${stockDisponible === 1 ? 'unidad' : 'unidades'} disponibles`;

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

  const getImagen = (p: ProductoCardData) => {
    if (p.imagen_url) return p.imagen_url;
    return `/productos/${p.id_producto}.jpg`;
  };

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
      showToast('Selecciona una variante disponible');
      return;
    }
    if (stockDisponible <= 0) {
      showToast('Producto sin stock disponible');
      return;
    }
    if (esPorMetros) {
      const total = metros * unidades;
      if (metros <= 0 || total > stockDisponible) {
        showToast(`Stock insuficiente: solo ${stockDisponible} m disponibles`);
        return;
      }
      const err = addItem(
        {
          id_producto: producto.id_producto,
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
      else showToast(`${unidades} x ${metros} m (${total} m) - ${producto.nombre_producto}`);
    } else {
      if (cantidad > stockDisponible) {
        showToast(`Stock insuficiente: solo ${stockDisponible} ${stockDisponible === 1 ? 'unidad' : 'unidades'} disponibles`);
        return;
      }
      const err = addItem(
        {
          id_producto: producto.id_producto,
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
      else showToast(t('productos.agregadoMsg', { nombre: producto.nombre_producto }));
    }
  };

  const disminuirCantidad = () => setCantidad(prev => Math.max(1, prev - 1));
  const aumentarCantidad = () => {
    setCantidad(prev => {
      if (prev >= stockDisponible) return prev;
      return prev + 1;
    });
  };

  const disminuirUnidades = () => setUnidades(prev => Math.max(1, prev - 1));
  const aumentarUnidades = () => {
    const maxU = Math.max(1, Math.floor(stockDisponible / Math.max(metros, 0.5)) || 1);
    setUnidades(prev => (prev >= maxU ? prev : prev + 1));
  };

  return (
    <>
      {toast && <div className="cart-toast">{toast}</div>}
      <div className="card-producto">
        <div className="img-contenedor">
          <div className="corner-badges">
            {producto.es_nuevo && <span className="nuevo-corner">Nuevo</span>}
            {tieneDescuento && <span className="promo-corner">Promoción</span>}
          </div>
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
            <Link to={`/producto/${producto.id_producto}`} aria-label={`Ver detalle de ${producto.nombre_producto}`}>
              <img
                src={getImagen(producto)}
                alt={producto.nombre_producto}
                className="img-producto"
                loading="lazy"
                onError={(e) => (e.currentTarget.src = '/productos/default.png')}
              />
            </Link>
          </div>
        </div>
        <div className="info-producto">
          <Link to={`/producto/${producto.id_producto}`} className="nombre-producto-link">
            <h3 className="nombre-producto">{producto.nombre_producto}</h3>
          </Link>
          {producto.nombre_categoria && (
            <span className="categoria-producto">{producto.nombre_categoria}</span>
          )}
          <span className="categoria-producto">
            {producto.tecnicos_requeridos && producto.tecnicos_requeridos > 0
              ? `Requiere ${producto.tecnicos_requeridos > 1 ? producto.tecnicos_requeridos + ' técnicos' : '1 técnico'}`
              : 'Sin instalación'}
          </span>
          <div className={`producto-footer ${esPorMetros ? 'producto-footer--con-metros' : 'producto-footer--sin-metros'} ${producto.variantes?.length ? 'producto-footer--con-variantes' : 'producto-footer--sin-variantes'}`}>
            <div className="precio-bloque">
              {esPorMetros ? (
                <>
                  <span className="precio-unitario">Precio unitario: ${precioUnitario.toLocaleString()} COP / metro</span>
                  <div className="precio-producto">
                    {tieneDescuento && (
                      <span className="precio-original">
                        ${subtotalLinea(precioOriginal!, unidades, metros).toLocaleString()}
                      </span>
                    )}
                    <span className="precio-monto">
                      ${totalLinea.toLocaleString()}
                    </span>
                    <span className="precio-sufijo">COP</span>
                    {tieneDescuento && (
                      <span className="badge-descuento">-{producto.descuento_activo}%</span>
                    )}
                  </div>
                  <span className="precio-seleccion-detalle">
                    Subtotal: {metros} m x {unidades} {unidades === 1 ? 'unidad' : 'unidades'} = {totalMetrosCard} m
                  </span>
                </>
              ) : (
                <>
                  <span className="precio-unitario">Precio unitario: ${precioUnitario.toLocaleString()} COP</span>
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
                  <span className="precio-seleccion-detalle">
                    Subtotal: {cantidad} u. x ${precioUnitario.toLocaleString()} = ${totalLinea.toLocaleString()} COP
                  </span>
                </>
              )}
            </div>
            {stockTexto && (
              <span className={`stock-disponible ${esStockAgotado ? 'stock-disponible--agotado' : ''} ${esStockBajo ? 'stock-disponible--bajo' : ''}`}>
                <span className="stock-disponible__dot" aria-hidden="true"></span>
                {esStockAgotado ? 'Sin stock' : `Disponibles: ${stockTexto}`}
              </span>
            )}
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
                      title={`${v.nombre}${medida ? ` - ${medida}` : ''} - ${agotada ? 'Sin stock' : `${stockVariante} u. disponibles`}`}
                    >
                      <i className="combo-dot" style={{ background: v.hex || '#d4a54b' }} />
                      <b>{v.nombre}</b>
                      {medida && <span> - {medida}</span>}
                      {agotada && <span> (agotado)</span>}
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
            <div className="selectores-bloque">
              {esPorMetros ? (
                <div className="metros-control-grid">
                  <MetrosSelect className="metros-select" value={metros} max={stockDisponible / Math.max(1, unidades)}
                    aria-label="Metros" onChange={(m) => {
                      setMetros(m);
                      const stock = stockDisponible;
                      if (Number.isFinite(stock) && m * unidades > stock) {
                        setUnidades(Math.max(1, Math.floor(stock / m)));
                      }
                    }} />

                  <div className="cantidad-row">
                    <span className="cantidad-label">Cantidad:</span>
                    <div className="cantidad-control">
                      <button type="button" onClick={disminuirUnidades} aria-label="Reducir unidades">−</button>
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
                          const num = parseInt(raw, 10);
                          const stock = stockDisponible;
                          const maxU = Number.isFinite(stock) ? Math.max(1, Math.floor(stock / metros) || 1) : Infinity;
                          if (raw === '' || isNaN(num) || num < 1) {
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
                        aria-label="Unidades"
                      />
                      <button
                        type="button"
                        onClick={aumentarUnidades}
                        disabled={unidades >= Math.max(1, Math.floor(stockDisponible / Math.max(metros, 0.5)) || 1)}
                        aria-label="Aumentar unidades"
                      >+</button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="cantidad-row">
                  <span className="cantidad-label">Cantidad:</span>
                  <div className="cantidad-control">
                    <button type="button" onClick={disminuirCantidad} disabled={cantidad <= 1} aria-label="Reducir cantidad">−</button>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="cantidad-input"
                      value={String(cantidad)}
                      readOnly
                      aria-label="Cantidad"
                    />
                    <button
                      type="button"
                      onClick={aumentarCantidad}
                      disabled={cantidad >= stockDisponible}
                      aria-label="Aumentar cantidad"
                    >+</button>
                  </div>
                </div>
              )}
            </div>
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
      </div>
    </>
  );
};

export default ProductoCard;
