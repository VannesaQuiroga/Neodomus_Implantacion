// Presenta el catálogo desde la navegación del administrador.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FaTags, FaCircleInfo, FaBoxOpen, FaPen, FaArrowRight, FaPlus, FaMagnifyingGlass, FaEye, FaEyeSlash, FaCircleCheck, FaTriangleExclamation } from 'react-icons/fa6';
import '@styles/admin-panel.css';
import '@styles/dashboard-admin.css';
import api from '@services/api';
import { useIdioma } from '@i18n/IdiomaContext';
import { badgeStock, textoStock } from '../../constants';
import type { CategoriaAdmin, ProductoAdmin } from '../../types';

interface PaginaProductos {
  total: number;
  data: ProductoAdmin[];
}

// Comunica con el backend mediante GET '/productos/categorias', GET '/productos/?limit=100', PUT `/productos/${producto.id_producto}/visibilidad`; registra escuchas de eventos para sincronizar la vista.
const AdminCatalogo = () => {
  const { t } = useIdioma();
  const [categorias, setCategorias] = useState<CategoriaAdmin[]>([]);
  const [productos, setProductos] = useState<ProductoAdmin[]>([]);
  const [vista, setVista] = useState<'todos' | 'categorias'>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null);
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 10;

  useEffect(() => {
    // Comunica con el backend mediante GET '/productos/categorias', GET '/productos/?limit=100'.
    const cargar = () => {
      Promise.all([
        api.get<CategoriaAdmin[]>('/productos/categorias'),
        api.get<PaginaProductos>('/productos/?limit=100'),
      ])
        .then(([resCat, resPro]) => {
          setCategorias(resCat.data || []);
          setProductos(resPro.data.data || []);
        })
        .catch(() => setError(true))
        .finally(() => setCargando(false));
    };
    cargar();
    const handler = () => cargar();
    window.addEventListener('admin-producto-updated', handler);
    return () => window.removeEventListener('admin-producto-updated', handler);
  }, []);

  const notify = (msg: string, tipo: 'ok' | 'err' = 'ok') => {
    setToast({ msg, tipo });
    window.setTimeout(() => setToast(null), 3000);
  };

  // Comunica con el backend mediante PUT `/productos/${producto.id_producto}/visibilidad`.
  const toggleVisibilidad = async (producto: ProductoAdmin) => {
    const previo = producto.visible_cliente !== false;
    setProductos((prev) => prev.map((p) => (p.id_producto === producto.id_producto ? { ...p, visible_cliente: !previo } : p)));
    try {
      const res = await api.put(`/productos/${producto.id_producto}/visibilidad`);
      const nuevo = res.data?.visible_cliente;
      if (typeof nuevo === 'boolean') {
        setProductos((prev) => prev.map((p) => (p.id_producto === producto.id_producto ? { ...p, visible_cliente: nuevo } : p)));
      }
      notify(res.data?.mensaje || (nuevo ?? !previo ? 'Producto visible en tienda' : 'Producto oculto de la tienda'));
      window.dispatchEvent(new CustomEvent('admin-producto-updated'));
    } catch (err: any) {
      setProductos((prev) => prev.map((p) => (p.id_producto === producto.id_producto ? { ...p, visible_cliente: previo } : p)));
      notify(err.response?.data?.detail || 'Error al cambiar visibilidad', 'err');
    }
  };

  const conteoPorCategoria = (id: number) => productos.filter((p) => p.id_cate_pr === id).length;
  const formatoPrecio = (valor: number) => `$${valor.toLocaleString('es-CO')}`;

  const q = busqueda.trim().toLowerCase();
  const productosFiltrados = q
    ? productos.filter((p) =>
        `${p.nombre_producto} ${p.marca || ''} ${p.referencia_producto || ''} ${p.nombre_categoria || ''} ID ${p.id_producto}`
          .toLowerCase()
          .includes(q),
      )
    : productos;

  const totalPaginas = Math.max(1, Math.ceil(productosFiltrados.length / POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const productosPaginados = productosFiltrados.slice(
    (paginaActual - 1) * POR_PAGINA,
    paginaActual * POR_PAGINA,
  );

  return (
    <motion.section
      className="admin-panel"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="ap-header">
        <div>
          <h1 className="ap-title">{t('adm.catalogo.titulo')}</h1>
          <p className="ap-subtitle">
            {vista === 'todos'
              ? t('adm.catalogo.subtituloTodos')
              : categorias.length === 1
                ? t('adm.catalogo.subtituloCategoriasUno', { n: categorias.length })
                : t('adm.catalogo.subtituloCategorias', { n: categorias.length })}
          </p>
        </div>
        <div className="ap-header-right">
          <span className="welcome-badge">
            <FaTags />
            {categorias.length === 1
              ? t('adm.catalogo.badgeCategoriaUno', { n: categorias.length })
              : t('adm.catalogo.badgeCategorias', { n: categorias.length })}
          </span>
        </div>
      </div>

      <div className="ap-filters" style={{ marginBottom: 20 }}>
        {vista === 'todos' && (
          <form className="ap-search" onSubmit={(e) => e.preventDefault()}>
            <FaMagnifyingGlass />
            <input
              type="text"
              placeholder={t('adm.catalogo.buscarPlaceholder')}
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setPagina(1);
              }}
            />
          </form>
        )}
        <select
          className="ap-filtro-estado"
          value={vista}
          onChange={(e) => setVista(e.target.value as 'todos' | 'categorias')}
          title={t('adm.catalogo.verSelect')}
          style={{ minWidth: 220 }}
        >
          <option value="todos">{t('adm.catalogo.opcionTodos')}</option>
          <option value="categorias">{t('adm.catalogo.opcionCategorias')}</option>
        </select>
        <Link to="/admin/productos/nuevo" className="ap-btn ap-btn-primary" style={{ marginLeft: 'auto' }}>
          <FaPlus /> {t('adm.catalogo.nuevoProducto')}
        </Link>
      </div>

      {cargando ? (
        <div className="ap-card">
          <div className="ap-states">
            <span className="ap-loader" />
            <h3>{t('adm.catalogo.cargando')}</h3>
            <p>{t('adm.catalogo.cargandoDesc')}</p>
          </div>
        </div>
      ) : error ? (
        <div className="ap-card">
          <div className="ap-states error">
            <div className="ap-states-icon">
              <FaCircleInfo />
            </div>
            <h3>{t('adm.catalogo.errorTitulo')}</h3>
            <p>{t('adm.catalogo.errorDesc')}</p>
            <button type="button" className="ap-btn ap-btn-ghost" onClick={() => window.location.reload()}>
              {t('adm.catalogo.reintentar')}
            </button>
          </div>
        </div>
      ) : vista === 'categorias' ? (
        categorias.length === 0 ? (
          <div className="ap-card">
            <div className="ap-states">
              <div className="ap-states-icon">
                <FaTags />
              </div>
              <h3>{t('adm.catalogo.sinCategorias')}</h3>
              <p>{t('adm.catalogo.sinCategoriasDesc')}</p>
            </div>
          </div>
        ) : (
          <div className="ap-grid">
            {categorias.map((categoria) => {
              const cantidad = conteoPorCategoria(categoria.id_categoria);
              return (
                <div key={categoria.id_categoria} className="ap-grid-item">
                  <div className="ap-grid-item-top">
                    <div className="an-icon cuenta">
                      <FaTags />
                    </div>
                    <span className="ap-badge info">
                      {cantidad === 1
                        ? t('adm.catalogo.badgeProductoUno', { n: cantidad })
                        : t('adm.catalogo.badgeProductos', { n: cantidad })}
                    </span>
                  </div>
                  <h3>{categoria.nombre_categoria}</h3>
                  <p>{categoria.descripcion || t('adm.catalogo.sinDescripcion')}</p>
                  <Link
                    to={`/admin/productos?categoria=${categoria.id_categoria}`}
                    className="ap-btn ap-btn-ghost"
                    style={{ marginTop: 'auto' }}
                  >
                    {t('adm.catalogo.verProductos')} <FaArrowRight />
                  </Link>
                </div>
              );
            })}
          </div>
        )
      ) : q && productosFiltrados.length === 0 ? (
        <div className="ap-card">
          <div className="ap-states">
            <div className="ap-states-icon">
              <FaCircleInfo />
            </div>
            <h3>{t('adm.catalogo.sinResultados')}</h3>
            <p>{t('adm.catalogo.sinResultadosDesc')}</p>
          </div>
        </div>
      ) : productos.length === 0 ? (
        <div className="ap-card">
          <div className="ap-states">
            <div className="ap-states-icon">
              <FaBoxOpen />
            </div>
            <h3>{t('adm.catalogo.sinProductos')}</h3>
            <p>{t('adm.catalogo.sinProductosDesc')}</p>
            <Link to="/admin/productos/nuevo" className="ap-btn ap-btn-primary">
              {t('adm.catalogo.crearPrimerProducto')}
            </Link>
          </div>
        </div>
      ) : (
        <div className="ap-card">
          <div className="ap-table-wrap">
            <table className="ap-table">
              <thead>
                <tr>
                  <th>{t('adm.catalogo.colProducto')}</th>
                  <th>{t('adm.catalogo.colCategoria')}</th>
                  <th>{t('adm.catalogo.colStock')}</th>
                  <th>{t('adm.catalogo.colPrecio')}</th>
                  <th>Visible</th>
                  <th>{t('adm.catalogo.colAcciones')}</th>
                </tr>
              </thead>
              <tbody>
                {productosPaginados.map((producto) => (
                  <tr key={producto.id_producto}>
                    <td>
                      <div className="ap-cell-user">
                        <img
                          src={producto.imagen_url || `/productos/${producto.id_producto}.jpg`}
                          alt={producto.nombre_producto}
                          className="ap-thumb"
                          onError={(e) => (e.currentTarget.src = '/productos/default.png')}
                        />
                        <div>
                          <strong>{producto.nombre_producto}</strong>
                          <span>
                            ID {producto.id_producto}
                            {producto.marca ? ` · ${producto.marca}` : ''}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      {producto.nombre_categoria ? (
                        <span className="ap-badge info">{producto.nombre_categoria}</span>
                      ) : (
                        <span className="ap-badge neutral">{t('adm.catalogo.sinCategoria')}</span>
                      )}
                    </td>
                    <td>
                      <span className={`ap-badge ${badgeStock(producto.stock_producto)}`}>
                        {textoStock(producto.stock_producto)}
                      </span>
                    </td>
                    <td>
                      <strong style={{ color: '#ffd98a' }}>{formatoPrecio(producto.precio_venta_producto)}</strong>{' '}
                      <span className="muted">COP</span>
                    </td>
                    <td>
                      <label className="ap-toggle" title={producto.visible_cliente !== false ? 'Ocultar del catálogo público' : 'Mostrar en catálogo público'}>
                        <input
                          type="checkbox"
                          checked={producto.visible_cliente !== false}
                          onChange={() => toggleVisibilidad(producto)}
                        />
                        <span className="ap-toggle-slider" />
                        <span className="ap-toggle-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {producto.visible_cliente !== false ? <FaEye /> : <FaEyeSlash />} {producto.visible_cliente !== false ? 'Visible' : 'Oculto'}
                        </span>
                      </label>
                    </td>
                    <td>
                      <Link to={`/admin/productos/${producto.id_producto}`} className="ap-btn ap-btn-ghost">
                        <FaPen /> {t('adm.catalogo.gestionar')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPaginas > 1 && (
            <div className="ap-paginacion">
              <button
                type="button"
                className="ap-page-btn"
                disabled={paginaActual === 1}
                onClick={() => setPagina(paginaActual - 1)}
              >
                ‹ {t('adm.catalogo.anterior')}
              </button>
              <div className="ap-page-nums">
                {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`ap-page-btn ${n === paginaActual ? 'active' : ''}`}
                    onClick={() => setPagina(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="ap-page-btn"
                disabled={paginaActual === totalPaginas}
                onClick={() => setPagina(paginaActual + 1)}
              >
                {t('adm.catalogo.siguiente')} ›
              </button>
            </div>
          )}
        </div>
      )}
      {toast && (
        <div className={`ap-toast ${toast.tipo}`}>
          {toast.tipo === 'ok' ? <FaCircleCheck /> : <FaTriangleExclamation />}
          {toast.msg}
        </div>
      )}
    </motion.section>
  );
};

export default AdminCatalogo;
