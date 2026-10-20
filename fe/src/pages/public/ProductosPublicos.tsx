// Presenta el catálogo público y sus filtros de búsqueda.
import { useState, useEffect } from 'react';
import { FaMagnifyingGlass } from 'react-icons/fa6';
import api from '@services/api';
import { useIdioma } from '@i18n/IdiomaContext';
import ProductoCard from '@components/productos/ProductoCard';
import '@styles/productos-publicos.css';

interface Producto {
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
  variantes?: {
    id: number;
    nombre: string;
    hex?: string | null;
    tamaño?: string | null;
    ancho_cm?: number | null;
    alto_cm?: number | null;
    etiqueta_medida?: string | null;
    stock: number;
  }[];
}

interface Categoria {
  id_categoria: number;
  nombre_categoria: string;
  descripcion: string;
}

// Comunica con el backend mediante GET '/productos/categorias', GET '/productos/?limit=100'; registra escuchas de eventos para sincronizar la vista.
const ProductosPublicos = () => {
  const { t } = useIdioma();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(8);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<number | null>(null);

  useEffect(() => {
    // Comunica con el backend mediante GET '/productos/categorias'.
    const fetchCategorias = async () => {
      try {
        const res = await api.get('/productos/categorias');
        setCategorias(res.data);
      } catch (err) {
        console.error('Error cargando categorías:', err);
      }
    };
    fetchCategorias();
  }, []);

  // Comunica con el backend mediante GET '/productos/?limit=100'.
  const cargarProductos = async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    try {
      const res = await api.get('/productos/?limit=100');
      const productosArray = res.data.data || [];
      setProductos(productosArray);
    } catch (err: any) {
      console.error(err);
      if (!silencioso) setError(err.response?.data?.detail || 'Error al cargar productos');
    } finally {
      if (!silencioso) setLoading(false);
    }
  };

  useEffect(() => {
    cargarProductos();
  }, []);

  useEffect(() => {
    const refetch = () => cargarProductos(true);
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
  }, []);

  const productosFiltrados = productos.filter(producto => {
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

  if (loading) return <div className="loading">{t('common.cargando')}</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <main className="productos-page app-glass">
      <section className="productos">
        <div className="productos-header">
          <div>
            <h1>{t('nav.productos')}</h1>
            <p>{t('productos.subtitulo')}</p>
          </div>
        </div>

        <div className="barra-superior">
          <div className="buscador">
            <FaMagnifyingGlass className="icono-buscar" />
            <input type="text" placeholder={t('productos.buscarProducto')} value={searchTerm} onChange={handleSearchChange} />
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
          <div className="loading">{t('productos.sinResultados')}</div>
        ) : (
          <>
            <div className="productos-grid">
              {currentProductos.map(producto => (
                <ProductoCard key={producto.id_producto} producto={producto} />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="paginacion">
                <button className="page-nav" onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} aria-label="Página anterior">‹</button>
                {getPageNumbers().map((item, idx) => (
                  <button
                    key={idx}
                    className={`page-number ${item === currentPage ? 'active' : ''}`}
                    onClick={() => typeof item === 'number' && handlePageChange(item)}
                    disabled={item === '...'}
                  >
                    {item}
                  </button>
                ))}
                <button className="page-nav" onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} aria-label="Página siguiente">›</button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
};

export default ProductosPublicos;
