import { MetrosSelect } from '@components/common/MetrosSelect';
// Pantalla CarritoPage de Neodomus. Reúne el estado y las acciones de su vista.
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FaArrowLeft, FaChevronLeft, FaChevronRight, FaTrashCan, FaCartShopping, FaCircleCheck, FaExclamation, FaPen, FaTriangleExclamation } from 'react-icons/fa6';
import { useCart, type CartItem } from '@contexts/CartContext';
import { useAuth } from '@contexts/AuthContext';
import { useIdioma } from '@i18n/IdiomaContext';
import { PF_REDIRECT_AFTER_LOGIN_KEY } from '@utils/profileStorage';
import {
  productoDisponible,
  stockDisponibleProducto,
  stockDisponibleVariante,
} from '@utils/productoDisponibilidad';
import { precioUnitarioProducto, subtotalLinea } from '@utils/productoPrecio';
import api from '@services/api';
import ProductoCard from '@components/productos/ProductoCard';
import '@styles/carrito.css';
import '@styles/productos-publicos.css';

// Fallback de imagen para el carrito: la referencia del producto no siempre
// existe (URL de MinIO inalcanzable o recurso estático ausente). El primer
// error prueba el mismo recurso con la extensión .webp que usa el catálogo
// sembrado; el siguiente termina en el placeholder público. Nunca se muestra
// la imagen de otro producto.
const IMAGEN_DEFAULT = '/productos/default.png';

const dentroDeFallback = (img: HTMLImageElement) => {
  if (img.dataset.fallback === 'webp') {
    if (!img.getAttribute('src')?.includes(IMAGEN_DEFAULT)) img.src = IMAGEN_DEFAULT;
    return;
  }
  img.dataset.fallback = 'webp';
  const id = img.dataset.id_producto;
  img.src = id ? `/productos/${id}.webp` : IMAGEN_DEFAULT;
};

const itemKey = (item: { id_producto: number; color?: string; medida?: string; tamaño?: string; metros?: number; venta_por_metros?: boolean }) =>
  [item.id_producto, item.color?.toLowerCase(), (item.medida || item.tamaño || '').toLowerCase(), item.venta_por_metros && item.metros ? `${item.metros}m` : null].filter(Boolean).join('-');

const claveStock = (item: { id_producto: number; id_variante?: number; color?: string; medida?: string; tamaño?: string }) =>
  [
    item.id_producto,
    item.id_variante ?? '',
    item.color?.toLowerCase() ?? '',
    (item.medida || item.tamaño || '').toLowerCase(),
  ].join(':');

// Comunica con el backend mediante GET `/productos/${item.id_producto}`, GET '/productos/?limit=100'; accede a sessionStorage para conservar o recuperar datos locales.
const CarritoPage = () => {
  const navigate = useNavigate();
  const { t } = useIdioma();
  const { items, totalItems, totalPrice, updateQuantity, updateMetros, removeItem, clearCart, actualizarItem, tieneStockInsuficiente } = useCart();  const { isAuthenticated, rol } = useAuth();
  const [toast, setToast] = useState<{ msg: string; tipo: 'success' | 'error' } | null>(null);
  const [displayValues, setDisplayValues] = useState<Record<string, string>>({});
  const [sugeridos, setSugeridos] = useState<any[]>([]);
  const carouselRef = useRef<HTMLDivElement>(null);

  const totalTecnicos = Math.max(1, ...items.map((item) => item.tecnicos_requeridos || 1));

  const firmaValidacion = items.map(claveStock).join('|');

  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const showToast = (msg: string, tipo: 'success' | 'error' = 'success') => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3000);
  };

  const scrollSugeridos = (direccion: 'izq' | 'der') => {
    if (!carouselRef.current) return;
    carouselRef.current.scrollBy({
      left: direccion === 'izq' ? -300 : 300,
      behavior: 'smooth',
    });
  };

  const validarStockBackend = useCallback(async () => {
    for (const item of itemsRef.current) {
      try {
        const res = await api.get(`/productos/${item.id_producto}`);
        const producto = res.data;
        const medidaItem = (item.medida || item.tamaño || '').trim().toLowerCase();
        const variante = item.id_variante
          ? producto.variantes?.find((v: any) => v.id === item.id_variante)
          : item.color
            ? producto.variantes?.find((v: any) => {
                const medida = (v.etiqueta_medida || v.tamaño || '').trim().toLowerCase();
                return v.nombre === item.color && (!medidaItem || medida === medidaItem);
              })
            : null;
        const stock = variante
          ? stockDisponibleVariante(producto, variante)
          : (producto.variantes?.length ? 0 : stockDisponibleProducto(producto));
        actualizarItem(itemKey(item), {
          stock_maximo: stock,
          precio_venta_producto: precioUnitarioProducto(producto, variante),
        });
      } catch {
        actualizarItem(itemKey(item), { stock_maximo: 0 });
      }
    }
  }, [actualizarItem]);

  useEffect(() => {
    if (itemsRef.current.length > 0) {
      validarStockBackend();
    }
  }, [firmaValidacion, validarStockBackend]);

  // Productos sugeridos (WEB): disponibles, no en carrito, reales del sistema
  const idsCarrito = items.map(i => i.id_producto).join(',');
  useEffect(() => {
    // Comunica con el backend mediante GET '/productos/?limit=100'.
    const ids = new Set(idsCarrito ? idsCarrito.split(',').map(Number) : []);
    const cargarSugeridos = async () => {
      try {
        const res = await api.get('/productos/?limit=100');
        const lista: any[] = res.data?.data || res.data || [];
        let candidatos = lista.filter(p => productoDisponible(p) && !ids.has(p.id_producto));
        if (candidatos.length === 0) {
          candidatos = lista.filter(p => productoDisponible(p));
        }
        const mezclados = [...candidatos].sort(() => 0.5 - Math.random()).slice(0, 4);
        setSugeridos(mezclados);
      } catch {
        setSugeridos([]);
      }
    };
    cargarSugeridos();
  }, [idsCarrito]);

  // Sugeridos reutilizan la tarjeta completa de Productos (ProductoCard) con toda su lógica

  const handleEditar = (item: CartItem, key: string) => {
    const params = new URLSearchParams();
    params.set('editar', key);
    if (item.color) params.set('color', item.color);
    const medida = item.medida || item.tamaño;
    if (medida) params.set('medida', medida);
    if (item.metros != null) params.set('metros', String(item.metros));
    if (item.venta_por_metros) params.set('cantidad', String(item.cantidad));
    else params.set('cantidad', String(item.cantidad));
    if (item.venta_por_metros) params.set('unidades', String(item.cantidad));
    navigate(`/producto/${item.id_producto}?${params.toString()}`);
  };

  // accede a sessionStorage para conservar o recuperar datos locales.
  const handleFinalizar = () => {
    if (items.length === 0) {
      showToast(t('carrito.toastVacio'), 'error');
      return;
    }
    const tieneCero = items.some(item => !item.venta_por_metros && item.cantidad <= 0);
    if (tieneCero) {
      showToast('La cantidad de al menos un producto es 0. Ajusta las cantidades.', 'error');
      return;
    }
    if (tieneStockInsuficiente) {
      showToast('Algunos productos exceden el stock disponible. Ajusta las cantidades.', 'error');
      return;
    }
    if (isAuthenticated && rol === 'cliente') {
      navigate('/checkout');
      return;
    }
    sessionStorage.setItem(PF_REDIRECT_AFTER_LOGIN_KEY, '/checkout');
    navigate('/login');
  };

  const handleCantidadChange = (item: CartItem, delta: number) => {
    const key = itemKey(item);
    const nuevaCantidad = Math.max(1, item.cantidad + delta);
    const error = updateQuantity(key, nuevaCantidad);
    if (error) showToast(error, 'error');
  };

  const handleMetrosChange = (item: CartItem, nuevoMetros: number | string) => {
    const key = itemKey(item);
    const error = updateMetros(key, nuevoMetros);
    if (error) showToast(error, 'error');
  };

  return (
    <div className="carrito-page app-glass">
      {toast && (
        <div className={`carrito-toast ${toast.tipo}`}>
          {toast.tipo === 'success' ? <FaCircleCheck /> : <FaExclamation />}
          <span>{toast.msg}</span>
        </div>
      )}

      <main className="carrito-main">
        <header className="carrito-header">
          <div>
            <h1>{t('carrito.miCarrito')}</h1>
            <p>
              {totalItems > 0
                ? (totalItems === 1 ? t('carrito.unProducto', { n: totalItems }) : t('carrito.variosProductos', { n: totalItems }))
                : t('carrito.aunVacio')}
            </p>
          </div>
          <button type="button" className="carrito-back-btn" onClick={() => navigate('/productos')}>
            <FaArrowLeft /> {t('carrito.volverProductos')}
          </button>
        </header>

        {items.length === 0 ? (
          <div className="carrito-vacio">
            <FaCartShopping className="carrito-vacio-icon" />
            <h2>{t('carrito.vacio')}</h2>
            <p>{t('carrito.vacioExterior')}</p>
            <button type="button" className="carrito-vacio-btn" onClick={() => navigate('/productos')}>
              {t('carrito.explorar')}
            </button>
          </div>
        ) : (
          <div className="carrito-layout">
            <div className="carrito-items">
              {items.map(item => {
                const key = itemKey(item);
                return (
                  <article key={key} className="carrito-item">
                    <Link to={`/producto/${item.id_producto}`} className="carrito-item-img">
                      <img
                        src={item.imagen || IMAGEN_DEFAULT}
                        data-id_producto={item.id_producto}
                        alt={item.nombre_producto}
                        onError={(e) => dentroDeFallback(e.currentTarget)}
                      />
                    </Link>

                    <div className="carrito-item-info">
                      <Link to={`/producto/${item.id_producto}`} className="carrito-item-nombre">
                        {item.nombre_producto}
                      </Link>
                       {item.color && <span className="carrito-item-color">{t('carrito.color', { color: item.color })}</span>}
                       {(item.medida || (item as any).tamaño) && (
                         <span className="carrito-item-color">Medida: {(item as any).medida || (item as any).tamaño}</span>
                       )}
                      <span className="carrito-item-precio-unit">
                        ${item.precio_venta_producto.toLocaleString()} COP{item.venta_por_metros ? ' / metro' : ` ${t('carrito.unidad')}`}
                      </span>
                      {item.venta_por_metros && item.metros != null && (
                        <span className="carrito-item-metros">
                          {item.metros} m × {item.cantidad} {item.cantidad === 1 ? 'unidad' : 'unidades'} = {(item.metros * item.cantidad)} m total
                        </span>
                      )}
                      {item.tecnicos_requeridos != null && (
                        <span className="carrito-item-tecnicos">
                          {item.tecnicos_requeridos > 0
                            ? `Requiere ${item.tecnicos_requeridos > 1 ? item.tecnicos_requeridos + ' técnicos' : '1 técnico'}`
                            : 'Sin instalación'}
                        </span>
                      )}
                    </div>

                    <div className="carrito-item-controls">
                    <div className="carrito-cantidad">
                      {item.venta_por_metros ? (
                        <div className="carrito-metros-unidades">
                          <MetrosSelect className="carrito-metros-select" value={item.metros || 0}
                            max={item.stock_maximo == null ? null : item.stock_maximo / Math.max(1, item.cantidad)}
                            onChange={(value) => handleMetrosChange(item, String(value))}
                            aria-label="Metros por unidad" />
                          <div className="carrito-unidades-control">
                            <button
                              type="button"
                              onClick={() => handleCantidadChange(item, -1)}
                              aria-label="Reducir unidades"
                            >
                              −
                            </button>
                            <span>{item.cantidad} u.</span>
                            <button
                              type="button"
                              onClick={() => handleCantidadChange(item, 1)}
                              disabled={item.stock_maximo != null && item.stock_maximo < Infinity && (item.metros || 0) * (item.cantidad + 1) > item.stock_maximo}
                              aria-label="Aumentar unidades"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleCantidadChange(item, -1)}
                            aria-label="Reducir cantidad"
                          >
                            −
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            className="cantidad-input"
                            value={displayValues[itemKey(item)] ?? String(item.cantidad)}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^0-9]/g, '');
                              setDisplayValues(prev => ({ ...prev, [itemKey(item)]: val }));
                            }}
                            onBlur={(e) => {
                              const num = parseInt(e.target.value, 10);
                              if (isNaN(num) || num < 1) {
                                const error = updateQuantity(itemKey(item), 1);
                                if (error) showToast(error, 'error');
                              } else {
                                const error = updateQuantity(itemKey(item), num);
                                if (error) showToast(error, 'error');
                              }
                              setDisplayValues(prev => {
                                const next = { ...prev };
                                delete next[itemKey(item)];
                                return next;
                              });
                            }}
                            aria-label="Cantidad"
                          />
                          <button
                            type="button"
                            onClick={() => handleCantidadChange(item, 1)}
                            disabled={item.stock_maximo != null && item.stock_maximo < Infinity && item.cantidad >= item.stock_maximo}
                            aria-label="Aumentar cantidad"
                          >
                            +
                          </button>
                        </>
                      )}
                    </div>

                      {item.stock_maximo != null && item.stock_maximo < Infinity && (
                        (() => {
                          const actual = item.venta_por_metros ? (item.metros || 0) * (item.cantidad || 1) : item.cantidad;
                          const excede = actual > item.stock_maximo;
                          return (
                            <span className={`carrito-stock-badge ${excede ? 'excede' : 'ok'}`}>
                              <FaTriangleExclamation />
                              {excede
                                ? `Excede stock (${item.stock_maximo} ${item.venta_por_metros ? 'm' : 'u.'} disp.)`
                                : `${item.stock_maximo} ${item.venta_por_metros ? 'm' : 'u.'} disp.`}
                            </span>
                          );
                        })()
                      )}

                      <span className="carrito-item-subtotal">
                        ${subtotalLinea(
                          item.precio_venta_producto,
                          item.cantidad,
                          item.venta_por_metros ? item.metros || 0 : null,
                        ).toLocaleString()} COP
                      </span>

                      <button
                        type="button"
                        className="carrito-item-edit"
                        onClick={() => handleEditar(item, key)}
                        aria-label={t('common.editar')}
                        title={t('common.editar')}
                      >
                        <FaPen />
                      </button>

                      <button
                        type="button"
                        className="carrito-item-remove"
                        onClick={() => removeItem(key)}
                        aria-label={t('carrito.eliminarProducto')}
                        title={t('carrito.eliminar')}
                      >
                        <FaTrashCan />
                      </button>
                    </div>
                  </article>
                );
              })}

              <button type="button" className="carrito-clear" onClick={clearCart}>
                <FaTrashCan />
                {t('carrito.vaciar')}
              </button>

              {tieneStockInsuficiente && (
                <div className="carrito-stock-warning">
                  <FaTriangleExclamation />
                  <span>Algunos productos exceden el stock disponible. Reduce las cantidades para continuar.</span>
                </div>
              )}
            </div>

            <aside className="carrito-resumen">
              <h2>{t('carrito.resumen')}</h2>
              <div className="carrito-resumen-row">
                <span>{t('carrito.productos')} ({totalItems})</span>
                <span>${totalPrice.toLocaleString()} COP</span>
              </div>
              <div className="carrito-resumen-row">
                <span>{t('carrito.envio')}</span>
                <span>{t('carrito.seCalculaFinalizar')}</span>
              </div>
              {totalTecnicos > 0 && (
                <div className="carrito-resumen-row">
                  <span>{t('carrito.tecnicosNecesarios')}</span>
                  <span>{totalTecnicos === 1 ? '1 técnico' : `${totalTecnicos} técnicos`}</span>
                </div>
              )}
              <div className="carrito-resumen-total">
                <span>{t('carrito.total')}</span>
                <span>${totalPrice.toLocaleString()} COP</span>
              </div>
              <button type="button" className={`carrito-finalizar-btn ${tieneStockInsuficiente ? 'disabled' : ''}`} onClick={handleFinalizar} disabled={tieneStockInsuficiente}>
                {t('carrito.finalizarCompra')}
              </button>
              <p className="carrito-resumen-hint">{t('carrito.hintPago')}</p>
            </aside>
          </div>
        )}

        {items.length > 0 && sugeridos.length > 0 && (
          <section className="detalle-recomendados">
            <h3 className="detalle-recomendados-titulo">También te puede interesar</h3>
            <div className="detalle-recomendados-carousel-wrap">
              <button
                className="carousel-flecha carousel-flecha-izq"
                aria-label="Desplazar a la izquierda"
                onClick={() => scrollSugeridos('izq')}
              >
                <FaChevronLeft />
              </button>
              <div className="detalle-recomendados-carousel" ref={carouselRef}>
                <div className="productos-grid detalle-recomendados-grid">
                  {sugeridos.map(prod => (
                    <ProductoCard key={prod.id_producto} producto={prod} />
                  ))}
                </div>
              </div>
              <button
                className="carousel-flecha carousel-flecha-der"
                aria-label="Desplazar a la derecha"
                onClick={() => scrollSugeridos('der')}
              >
                <FaChevronRight />
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default CarritoPage;
