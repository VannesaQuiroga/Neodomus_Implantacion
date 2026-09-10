import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '@contexts/CartContext';
import { useFavoritos } from '@utils/favoritos';
import { useIdioma } from '@i18n/IdiomaContext';
import '@styles/productos-publicos.css';

interface ProductoVariante {
  id: number;
  nombre: string;
  hex?: string | null;
  tamaño?: string | null;
  ancho_cm?: number | null;
  alto_cm?: number | null;
  etiqueta_medida?: string | null;
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
  stock_estado?: 'disponible' | 'bajo' | 'agotado';
  tecnicos_requeridos?: number;
  variantes?: ProductoVariante[];
}

interface Props {
  producto: ProductoCardData;
}

const METROS_OPCIONES = [10, 20, 30, 40, 50];

const ProductoCard = ({ producto }: Props) => {
  const { addItem } = useCart();
  const { t } = useIdioma();
  const { favoritos, toggleFavorito } = useFavoritos();

  const [cantidad, setCantidad] = useState(1);
  const [metros, setMetros] = useState(10);
  const [unidades, setUnidades] = useState(1);
  const [displayUnidades, setDisplayUnidades] = useState<string | undefined>(undefined);
  const [toast, setToast] = useState('');

  const esFavorito = favoritos.has(producto.id_producto);
  const esPorMetros = Boolean(producto.venta_por_metros);
  const tieneDescuento = producto.precio_final != null && producto.descuento_activo && producto.descuento_activo > 0;
  const precioFinal = producto.precio_final ?? producto.precio_venta_producto;

  const stockDe = (p: ProductoCardData) => {
    if (p.variantes && p.variantes.length > 0) {
      return p.variantes.reduce((acc, v) => acc + (v.stock || 0), 0);
    }
    return p.stock_producto ?? Infinity;
  };

  const stockTotal = stockDe(producto);
  const stockDisponible = Number.isFinite(stockTotal) ? stockTotal : null;
  const esStockAgotado = stockDisponible !== null && stockDisponible <= 0;
  const esStockBajo = stockDisponible !== null && stockDisponible > 0 && stockDisponible <= 5;
  const stockTexto = stockDisponible !== null
    ? esPorMetros
      ? `${stockDisponible} m disponibles`
      : `${stockDisponible} ${stockDisponible === 1 ? 'unidad' : 'unidades'} disponibles`
    : null;

  const totalMetrosCard = metros * unidades;

  const getImagen = (p: ProductoCardData) => {
    if (p.imagen_url) return p.imagen_url;
    return `/productos/${p.id_producto}.jpg`;
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleAddToCart = () => {
    const precio = precioFinal;
    if (esPorMetros) {
      const stock = stockDe(producto);
      const total = metros * unidades;
      if (total > stock) {
        showToast(`Stock insuficiente: solo ${stock} m disponibles`);
        return;
      }
      const err = addItem(
        {
          id_producto: producto.id_producto,
          nombre_producto: producto.nombre_producto,
          precio_venta_producto: precio,
          imagen: getImagen(producto),
          venta_por_metros: true,
          stock_maximo: stock,
          metros,
          tecnicos_requeridos: producto.tecnicos_requeridos,
        },
        unidades,
        metros
      );
      if (err) showToast(err);
      else showToast(`${unidades} × ${metros} m (${total} m) — ${producto.nombre_producto}`);
    } else {
      const stock = stockDe(producto);
      if (Number.isFinite(stock) && cantidad > stock) {
        showToast(`Stock insuficiente: solo ${stock} ${stock === 1 ? 'unidad' : 'unidades'} disponibles`);
        return;
      }
      if (Number.isFinite(stock) && stock <= 0) {
        showToast('Producto sin stock disponible');
        return;
      }
      const err = addItem(
        {
          id_producto: producto.id_producto,
          nombre_producto: producto.nombre_producto,
          precio_venta_producto: precio,
          imagen: getImagen(producto),
          stock_maximo: Number.isFinite(stock) ? stock : undefined,
          tecnicos_requeridos: producto.tecnicos_requeridos,
        },
        cantidad
      );
      if (err) showToast(err);
      else showToast(t('productos.agregadoMsg', { nombre: producto.nombre_producto }));
    }
  };

  const disminuirCantidad = () => setCantidad(prev => Math.max(1, prev - 1));
  const aumentarCantidad = () => {
    const stock = stockDe(producto);
    setCantidad(prev => {
      if (prev >= stock) return prev;
      return prev + 1;
    });
  };

  const disminuirUnidades = () => setUnidades(prev => Math.max(1, prev - 1));
  const aumentarUnidades = () => {
    const stock = stockDe(producto);
    const maxU = Number.isFinite(stock) ? Math.max(1, Math.floor(stock / metros) || 1) : Infinity;
    setUnidades(prev => (prev >= maxU ? prev : prev + 1));
  };

  const handleMetrosChange = (m: number) => {
    setMetros(m);
    const stock = stockDe(producto);
    if (Number.isFinite(stock) && m * unidades > stock) {
      const maxU = Math.max(1, Math.floor(stock / m) || 1);
      if (unidades > maxU) setUnidades(maxU);
    }
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
            {`Requiere ${producto.tecnicos_requeridos && producto.tecnicos_requeridos > 1 ? producto.tecnicos_requeridos + ' técnicos' : '1 técnico'}`}
          </span>
          <div className={`producto-footer ${esPorMetros ? 'producto-footer--con-metros' : 'producto-footer--sin-metros'} ${producto.variantes?.length ? 'producto-footer--con-variantes' : 'producto-footer--sin-variantes'}`}>
            <div className="precio-bloque">
              {esPorMetros ? (
                <>
                  <span className="precio-unitario">{precioFinal.toLocaleString()} COP / metro</span>
                  <div className="precio-producto">
                    {tieneDescuento && (
                      <span className="precio-original">
                        ${(producto.precio_venta_producto * totalMetrosCard).toLocaleString()}
                      </span>
                    )}
                    <span className="precio-monto">
                      ${(precioFinal * totalMetrosCard).toLocaleString()}
                    </span>
                    <span className="precio-sufijo">COP</span>
                    {tieneDescuento && (
                      <span className="badge-descuento">-{producto.descuento_activo}%</span>
                    )}
                  </div>
                  <span className="precio-seleccion-detalle">{metros} m × {unidades} {unidades === 1 ? 'unidad' : 'unidades'} = {totalMetrosCard} m total</span>
                </>
              ) : (
                <>
                  <span className="precio-unitario precio-unitario--placeholder" aria-hidden="true">—</span>
                  <div className="precio-producto">
                    {tieneDescuento && (
                      <span className="precio-original">
                        ${producto.precio_venta_producto.toLocaleString()}
                      </span>
                    )}
                    <span className="precio-monto">
                      ${precioFinal.toLocaleString()}
                    </span>
                    <span className="precio-sufijo">COP</span>
                    {tieneDescuento && (
                      <span className="badge-descuento">-{producto.descuento_activo}%</span>
                    )}
                  </div>
                  <span className="precio-seleccion-detalle precio-seleccion-detalle--placeholder" aria-hidden="true">—</span>
                </>
              )}
            </div>
            {stockTexto && (
              <span className={`stock-disponible ${esStockAgotado ? 'stock-disponible--agotado' : ''} ${esStockBajo ? 'stock-disponible--bajo' : ''}`}>
                <span className="stock-disponible__dot" aria-hidden="true"></span>
                {esStockAgotado ? 'Sin stock' : `Disponibles: ${stockTexto}`}
              </span>
            )}
            {(producto.variantes?.length ?? 0) > 0 ? (
              <div className="combos-mini">
                {producto.variantes!.slice(0, 4).map((v) => {
                  const medida = v.etiqueta_medida || v.tamaño || '';
                  const agotada = (v.stock || 0) <= 0;
                  return (
                    <span
                      key={v.id}
                      className={`combo-chip ${agotada ? 'agotado' : ''}`}
                      title={`${v.nombre}${medida ? ` · ${medida}` : ''} — ${agotada ? 'Sin stock' : `${v.stock} u.`}`}
                    >
                      <i className="combo-dot" style={{ background: v.hex || '#d4a54b' }} />
                      {medida && <b>{medida}</b>}
                      {agotada ? ' ✕' : ` · ${v.stock}`}
                    </span>
                  );
                })}
                {(producto.variantes!.length > 4) && (
                  <span className="combo-chip mas">+{producto.variantes!.length - 4}</span>
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
                  <select
                    className="metros-select"
                    value={metros}
                    onChange={(e) => handleMetrosChange(Number(e.target.value))}
                    aria-label="Metros"
                  >
                    {METROS_OPCIONES.map(m => (
                      <option key={m} value={m}>{m} m</option>
                    ))}
                  </select>
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
                          const stock = stockDe(producto);
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
                        disabled={Number.isFinite(stockTotal) && unidades >= Math.max(1, Math.floor(stockTotal / metros) || 1)}
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
                      disabled={Number.isFinite(stockTotal) && cantidad >= stockTotal}
                      aria-label="Aumentar cantidad"
                    >+</button>
                  </div>
                </div>
              )}
            </div>
            <button
              className="btn-agregar btn-agregar--footer"
              onClick={handleAddToCart}
              disabled={esStockAgotado}
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
