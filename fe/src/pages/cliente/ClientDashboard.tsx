import { useState, useEffect } from 'react';
import api from '@services/api';
import { useCart } from '@contexts/CartContext';
import '@styles/client-dashboard.css';
import carritoIcon from '@assets/images/Carrito.png';
import buscadorIcon from '@assets/images/buscador.png';

interface Producto {
  id_producto: number;
  nombre_producto: string;
  precio_venta_producto: number;
  precio_final?: number;
  descuento_activo?: number | null;
  imagen_url?: string | null;
  id_cate_pr?: number;
  nombre_categoria?: string;
  stock_producto?: number;
  colores_producto?: string | null;
  color_hex?: string | null;
  variantes?: { stock: number }[];
}

interface Categoria {
  id_categoria: number;
  nombre_categoria: string;
  descripcion: string;
}

const ClientDashboard = () => {
  const { addItem } = useCart();
  const [todosProductos, setTodosProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(8);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<number | null>(null);
  const [cantidades, setCantidades] = useState<{ [key: number]: number }>({});
  const [displayValues, setDisplayValues] = useState<{ [key: number]: string }>({});
  const [cartMessage, setCartMessage] = useState('');

  useEffect(() => {
    const fetchCategorias = async () => {
      try {
        const res = await api.get('/productos/categorias');
        setCategorias(res.data);
      } catch (error) {
        console.error('Error cargando categorías:', error);
      }
    };
    fetchCategorias();
  }, []);

  useEffect(() => {
    const fetchProductos = async (silencioso = false) => {
      if (!silencioso) setLoading(true);
      try {
        const res = await api.get('/productos/?limit=100');
        const productosArray = res.data.data || [];
        setTodosProductos(productosArray);
        if (!silencioso) setError('');
      } catch (err) {
        console.error('Error cargando productos:', err);
        if (!silencioso) setError('No se pudieron cargar los productos. Intenta más tarde.');
      } finally {
        if (!silencioso) setLoading(false);
      }
    };
    fetchProductos();
    const refetch = () => fetchProductos(true);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refetch();
    };
    window.addEventListener('focus', refetch);
    document.addEventListener('visibilitychange', onVisibility);
    const interval = window.setInterval(refetch, 30000);
    return () => {
      window.removeEventListener('focus', refetch);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(interval);
    };
  }, []);

  const productosFiltrados = todosProductos.filter(producto => {
    const matchesSearch = producto.nombre_producto.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategoria = categoriaSeleccionada ? producto.id_cate_pr === categoriaSeleccionada : true;
    return matchesSearch && matchesCategoria;
  });

  const totalPages = Math.ceil(productosFiltrados.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentProductos = productosFiltrados.slice(startIndex, startIndex + itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoriaSeleccionada, itemsPerPage]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleItemsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setItemsPerPage(Number(e.target.value));
    setCurrentPage(1);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const stockDe = (p: Producto) => {
    if (p.variantes && p.variantes.length > 0) {
      return p.variantes.reduce((acc, v) => acc + (v.stock || 0), 0);
    }
    return p.stock_producto ?? Infinity;
  };

  const handleCantidad = (id: number, delta: number) => {
    const producto = todosProductos.find(p => p.id_producto === id);
    const stock = producto ? stockDe(producto) : Infinity;
    setCantidades(prev => {
      const actual = prev[id] || 1;
      const nuevo = Math.max(1, actual + delta);
      return { ...prev, [id]: Math.min(nuevo, stock) };
    });
  };

  const handleAddToCart = (id_producto: number) => {
    const cantidad = cantidades[id_producto] || 1;
    const producto = todosProductos.find((p) => p.id_producto === id_producto);
    if (!producto) return;
    addItem(
      {
        id_producto: producto.id_producto,
        nombre_producto: producto.nombre_producto,
        precio_venta_producto: producto.precio_final ?? producto.precio_venta_producto,
        imagen: getImagen(producto),
      },
      cantidad
    );
    setCartMessage(`${cantidad} × ${producto.nombre_producto} agregado al carrito`);
    setTimeout(() => setCartMessage(''), 3000);
  };

  const getImagen = (producto: Producto) => {
    if (producto.imagen_url) return producto.imagen_url;
    return `/productos/${producto.id_producto}.jpg`;
  };

  const getPageNumbers = (): (number | string)[] => {
    const delta = 2;
    const range: number[] = [];
    const rangeWithDots: (number | string)[] = [];
    let l: number | undefined;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) range.push(i);
    }
    range.forEach((i) => {
      if (l !== undefined) {
        if (i - l === 2) rangeWithDots.push(l + 1);
        else if (i - l !== 1) rangeWithDots.push('...');
      }
      rangeWithDots.push(i);
      l = i;
    });
    return rangeWithDots;
  };

  if (loading) return <div className="loading">Cargando productos...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <>
      {cartMessage && <div className="cart-toast">{cartMessage}</div>}
      <main className="productos-page">
        <section className="productos">
          <div className="barra-superior">
            <div className="buscador">
              <img src={buscadorIcon} alt="buscar" className="icono-buscar" />
              <input type="text" placeholder="Buscar" value={searchTerm} onChange={handleSearchChange} />
            </div>
            <div className="controls-right">
              <select className="select-paginas" value={itemsPerPage} onChange={handleItemsPerPageChange}>
                <option value={8}>8 por página</option>
                <option value={16}>16 por página</option>
                <option value={24}>24 por página</option>
              </select>
              <select
                className="select-categoria"
                value={categoriaSeleccionada || ''}
                onChange={(e) => setCategoriaSeleccionada(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Todas las categorías</option>
                {categorias.map(cat => (
                  <option key={cat.id_categoria} value={cat.id_categoria}>{cat.nombre_categoria}</option>
                ))}
              </select>
            </div>
          </div>

          {currentProductos.length === 0 ? (
            <div className="loading">No hay productos que coincidan con la búsqueda.</div>
          ) : (
            <>
              <div className="productos-grid">
                {currentProductos.map(producto => {
                  const precioMostrar = producto.precio_final ?? producto.precio_venta_producto;
                  const tieneDescuento = producto.descuento_activo != null && producto.precio_final != null && producto.precio_final < producto.precio_venta_producto;
                  return (
                    <div key={producto.id_producto} className="card-producto">
                      <div className="img-contenedor">
                        <img
                          src={getImagen(producto)}
                          alt={producto.nombre_producto}
                          className="img-producto"
                          onError={(e) => (e.currentTarget.src = '/productos/default.png')}
                        />
                      </div>
                      <div className="info-producto">
                        <h3>{producto.nombre_producto}</h3>
                        {producto.nombre_categoria && <span className="categoria-badge">{producto.nombre_categoria}</span>}
                        {producto.colores_producto && (
                          <span
                            className="categoria-badge"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 4 }}
                          >
                            {producto.color_hex && (
                              <span
                                style={{
                                  width: 12,
                                  height: 12,
                                  borderRadius: '50%',
                                  background: producto.color_hex,
                                  border: '1px solid rgba(0,0,0,0.25)',
                                  flexShrink: 0,
                                }}
                              />
                            )}
                            {producto.colores_producto}
                          </span>
                        )}
                        <div className="precio">
                          {tieneDescuento ? (
                            <>
                              <span className="precio-original">${producto.precio_venta_producto.toLocaleString()}</span>
                              <span className="precio-final">${precioMostrar.toLocaleString()}</span>
                              <span className="descuento-badge">-{producto.descuento_activo}%</span>
                            </>
                          ) : (
                            <span>${precioMostrar.toLocaleString()}</span>
                          )}
                        </div>
                        <div className="acciones-producto">
                          <button className="btn-comprar" onClick={() => handleAddToCart(producto.id_producto)}>COMPRAR</button>
                          <div className="lado-derecho">
                            <button className="btn-mas" onClick={() => handleCantidad(producto.id_producto, 1)} disabled={(cantidades[producto.id_producto] || 1) >= stockDe(producto)}>+</button>
                            <input
                              type="text"
                              inputMode="numeric"
                              className="cantidad-input"
                              value={displayValues[producto.id_producto] ?? String(cantidades[producto.id_producto] || 1)}
                              onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9]/g, '');
                                setDisplayValues(prev => ({ ...prev, [producto.id_producto]: val }));
                              }}
                              onBlur={(e) => {
                                const num = parseInt(e.target.value, 10);
                                if (isNaN(num) || num < 1) {
                                  setCantidades(prev => ({ ...prev, [producto.id_producto]: 1 }));
                                  setDisplayValues(prev => ({ ...prev, [producto.id_producto]: '' }));
                                } else {
                                  const stock = stockDe(producto);
                                  const final = num > stock ? stock : num;
                                  setCantidades(prev => ({ ...prev, [producto.id_producto]: final }));
                                  setDisplayValues(prev => ({ ...prev, [producto.id_producto]: '' }));
                                }
                              }}
                              aria-label="Cantidad"
                            />
                            <button className="btn-menos" onClick={() => handleCantidad(producto.id_producto, -1)}>-</button>
                            <img src={carritoIcon} alt="Carrito" className="icono-carrito" onClick={() => handleAddToCart(producto.id_producto)} style={{ cursor: 'pointer' }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {totalPages > 1 && (
                <div className="paginacion">
                  <button onClick={() => handlePageChange(1)} disabled={currentPage === 1}>◀◀</button>
                  <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1}>◀</button>
                  {getPageNumbers().map((item, idx) => (
                    <button key={idx} className={item === currentPage ? 'active' : ''} onClick={() => typeof item === 'number' && handlePageChange(item)} disabled={item === '...'}>
                      {item}
                    </button>
                  ))}
                  <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages}>▶</button>
                  <button onClick={() => handlePageChange(totalPages)} disabled={currentPage === totalPages}>▶▶</button>
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </>
  );
};

export default ClientDashboard;