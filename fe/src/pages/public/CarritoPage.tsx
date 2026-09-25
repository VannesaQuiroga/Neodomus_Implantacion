import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FaArrowLeft, FaTrashCan, FaCartShopping, FaCircleCheck, FaExclamation, FaPen, FaTriangleExclamation } from 'react-icons/fa6';
import { useCart, type CartItem } from '@contexts/CartContext';
import { useAuth } from '@contexts/AuthContext';
import { useIdioma } from '@i18n/IdiomaContext';
import { PF_REDIRECT_AFTER_LOGIN_KEY } from '@utils/profileStorage';
import api from '@services/api';
import ProductoCard from '@components/productos/ProductoCard';
import '@styles/carrito.css';
import '@styles/productos-publicos.css';

const CarritoPage = () => {
  const navigate = useNavigate();
  const { t } = useIdioma();
  const { items, totalItems, totalPrice, updateQuantity, updateMetros, removeItem, clearCart, actualizarStock, tieneStockInsuficiente } = useCart();
  const { isAuthenticated, rol } = useAuth();
  const [toast, setToast] = useState<{ msg: string; tipo: 'success' | 'error' } | null>(null);
  const [displayValues, setDisplayValues] = useState<Record<string, string>>({});
  const [sugeridos, setSugeridos] = useState<any[]>([]);

  const totalTecnicos = Math.max(1, ...items.map((item) => item.tecnicos_requeridos || 1));

  const showToast = (msg: string, tipo: 'success' | 'error' = 'success') => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3000);
  };

  const METROS_OPCIONES = [10, 20, 30, 40, 50];
  const itemKey = (item: { id_producto: number; color?: string; medida?: string; tamaño?: string; metros?: number; venta_por_metros?: boolean }) =>
    [item.id_producto, item.color?.toLowerCase(), (item.medida || item.tamaño || '').toLowerCase(), item.venta_por_metros && item.metros ? `${item.metros}m` : null].filter(Boolean).join('-');

  const validarStockBackend = useCallback(async () => {
    for (const item of items) {
      try {
        const res = await api.get(`/productos/${item.id_producto}`);
        const stock = item.venta_por_metros
          ? (res.data.stock_producto ?? 0)
          : (item.id_variante
              ? (res.data.variantes?.find((v: any) => v.id === item.id_variante)?.stock ?? 0)
              : (res.data.stock_producto ?? 0));
        actualizarStock(itemKey(item), stock);
      } catch {
        /* noop */
      }
    }
  }, [items, actualizarStock]);

  useEffect(() => {
    if (items.length > 0) {
      validarStockBackend();
    }
  }, [items.length]);

  // Productos sugeridos (WEB): disponibles, no en carrito, reales del sistema
  useEffect(() => {
    const cargarSugeridos = async () => {
      try {
        const res = await api.get('/productos/?limit=100');
        const lista: any[] = res.data?.data || res.data || [];
        const idsEnCarrito = new Set(items.map(i => i.id_producto));
        const conStock = (p: any) => {
          const stock = p.variantes?.length
            ? p.variantes.reduce((a: number, v: any) => a + (v.stock || 0), 0)
            : (p.stock_producto ?? 0);
          return stock > 0;
        };
        let candidatos = lista.filter(p => conStock(p) && !idsEnCarrito.has(p.id_producto));
        if (candidatos.length === 0) {
          candidatos = lista.filter(p => conStock(p));
        }
        const mezclados = [...candidatos].sort(() => 0.5 - Math.random()).slice(0, 4);
        setSugeridos(mezclados);
      } catch {
        setSugeridos([]);
      }
    };
    cargarSugeridos();
  }, [items]);

  // Sugeridos reutilizan la tarjeta completa de Productos (ProductoCard) con toda su lógica

  const handleEditar = (item: CartItem, key: string) => {
    const params = new URLSearchParams();
    params.set('editar', key);
    if (item.color) params.set('color', item.color);
    if (item.metros != null) params.set('metros', String(item.metros));
    if (item.venta_por_metros) params.set('cantidad', String(item.cantidad));
    else params.set('cantidad', String(item.cantidad));
    if (item.venta_por_metros) params.set('unidades', String(item.cantidad));
    navigate(`/producto/${item.id_producto}?${params.toString()}`);
  };

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

  const handleMetrosChange = (item: CartItem, nuevoMetros: number) => {
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
                        src={item.imagen}
                        alt={item.nombre_producto}
                        onError={(e) => (e.currentTarget.src = '/productos/default.png')}
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
                          <select
                            className="carrito-metros-select"
                            value={item.metros}
                            onChange={(e) => handleMetrosChange(item, Number(e.target.value))}
                            aria-label="Metros por unidad"
                          >
                            {METROS_OPCIONES.map(m => (
                              <option key={m} value={m}>{m} m</option>
                            ))}
                          </select>
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
                        ${(item.precio_venta_producto * (item.venta_por_metros ? (item.metros || 0) * (item.cantidad || 1) : item.cantidad)).toLocaleString()} COP
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
          <section className="carrito-sugeridos">
            <header className="carrito-sugeridos-header">
              <h2>Productos sugeridos</h2>
              <p>También te puede interesar</p>
            </header>
            <div className="productos-grid">
              {sugeridos.map(prod => (
                <ProductoCard key={prod.id_producto} producto={prod} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default CarritoPage;
