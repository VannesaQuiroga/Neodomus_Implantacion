// Pantalla AdminProductos de Neodomus. Reúne el estado y las acciones de su vista.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FaBoxOpen,
  FaCircleInfo,
  FaPlus,
  FaMagnifyingGlass,
  FaXmark,
  FaPaperPlane,
  FaTruckField,
  FaTriangleExclamation,
  FaCircleCheck,
} from 'react-icons/fa6';
import '@styles/admin-panel.css';
import '@styles/dashboard-admin.css';
import api from '@services/api';
import { useIdioma } from '@i18n/IdiomaContext';
import { badgeStock, textoStock } from '../../constants';
import type { ProductoAdmin, ProveedorAdmin } from '../../types';

interface PaginaProductos {
  total: number;
  total_pages?: number;
  data: ProductoAdmin[];
}

// Comunica con el backend mediante GET `/productos/?${params.toString()}`, PUT `/productos/${producto.id_producto}`, PUT `/productos/${producto.id_producto}/visibilidad` y otras peticiones de esta vista; registra escuchas de eventos para sincronizar la vista.
const AdminProductos = () => {
  const { t } = useIdioma();
  const [productos, setProductos] = useState<ProductoAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [mostrarSolicitud, setMostrarSolicitud] = useState(false);
  // Cantidades por línea "{id_producto}:{id_variante ?? 0}" para poder pedir
  // varias presentaciones (colores/medidas) del mismo producto.
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [marcaSel, setMarcaSel] = useState<Record<number, string>>({});
  const [solicitando, setSolicitando] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null);
  const [proveedores, setProveedores] = useState<ProveedorAdmin[]>([]);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const categoriaId = searchParams.get('categoria');
  const proveedorId = searchParams.get('proveedor');
  const nombreProveedor = productos[0]?.nombre_proveedor || t('adm.productos.proveedorSeleccionado');

  // Comunica con el backend mediante GET `/productos/?${params.toString()}`.
  const cargar = async (search = '', silencioso = false, pagina: number = page) => {
    if (!silencioso) setCargando(true);
    if (!silencioso) setError(false);
    try {
      const params = new URLSearchParams({ limit: '10', page: String(pagina) });
      params.set('estado', filtroEstado);
      if (search.trim()) params.set('search', search.trim());
      if (categoriaId && /^\d+$/.test(categoriaId)) params.set('categoria', categoriaId);
      if (proveedorId && /^\d+$/.test(proveedorId)) params.set('proveedor', proveedorId);
      const res = await api.get<PaginaProductos>(`/productos/?${params.toString()}`);
      setProductos(res.data.data || []);
      setTotal(res.data.total ?? 0);
      setTotalPages(res.data.total_pages ?? 1);
    } catch {
      if (!silencioso) setError(true);
    } finally {
      if (!silencioso) setCargando(false);
    }
  };

  const irPagina = (n: number) => {
    if (n < 1 || n > totalPages) return;
    setPage(n);
    cargar('', false, n);
  };

  const notify = (msg: string, tipo: 'ok' | 'err' = 'ok') => {
    setToast({ msg, tipo });
    window.setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    cargar('');
    const handler = () => cargar('', true);
    window.addEventListener('admin-producto-updated', handler);
    return () => window.removeEventListener('admin-producto-updated', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tiempo real: stock/precio/visibilidad se actualiza solo cada 15 s y al volver a la pestaña (cliente y admin sincronizados tras una compra).
  useEffect(() => {
    const refetch = () => cargar(busqueda, true);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, filtroEstado, categoriaId, proveedorId, page]);

  useEffect(() => {
    api
      .get<ProveedorAdmin[]>('/productos/proveedores')
      .then((res) => setProveedores(res.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setPage(1);
    cargar('', false, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriaId]);

  useEffect(() => {
    setPage(1);
    cargar('', false, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proveedorId]);

  useEffect(() => {
    setPage(1);
    cargar('', false, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    cargar(busqueda.trim(), false, 1);
  };

  // Comunica con el backend mediante PUT `/productos/${producto.id_producto}`.
  const toggleEstado = async (producto: ProductoAdmin) => {
    try {
      const nuevoEstado = producto.estado_producto === 'activo' ? 'inactivo' : 'activo';
      await api.put(`/productos/${producto.id_producto}`, {
        nombre_producto: producto.nombre_producto,
        marca: producto.marca ?? null,
        venta_por_metros: !!producto.venta_por_metros,
        referencia_producto: producto.referencia_producto ?? null,
        id_proveedor_pr: producto.id_proveedor_pr ?? null,
        precio_compra_producto: producto.precio_compra_producto ?? null,
        precio_venta_producto: producto.precio_venta_producto,
        imagen_url: producto.imagen_url ?? null,
        id_cate_pr: producto.id_cate_pr ?? null,
        descripcion_producto: producto.descripcion_producto ?? null,
        colores_producto: producto.colores_producto ?? null,
        estado_producto: nuevoEstado,
        stock_producto: producto.stock_producto ?? 0,
        descuento_activo: producto.descuento_activo ?? null,
        promocion_hasta: producto.promocion_hasta ?? null,
      });
      window.dispatchEvent(new CustomEvent('admin-producto-updated'));
      await cargar('');
    } catch {
      setError(true);
    }
  };

  // Comunica con el backend mediante PUT `/productos/${producto.id_producto}/visibilidad`.
  const toggleVisibilidad = async (producto: ProductoAdmin) => {
    try {
      const res = await api.put(`/productos/${producto.id_producto}/visibilidad`);
      notify(res.data?.mensaje || 'Visibilidad actualizada');
      window.dispatchEvent(new CustomEvent('admin-producto-updated'));
      await cargar('');
    } catch (err: any) {
      notify(err.response?.data?.detail || 'Error al cambiar visibilidad', 'err');
    }
  };

  const formatoPrecio = (valor: number) => `$${valor.toLocaleString('es-CO')}`;

  const claveLinea = (idProducto: number, idVariante?: number | null) =>
    `${idProducto}:${idVariante ?? 0}`;

  const etiquetaVariante = (v: NonNullable<ProductoAdmin['variantes']>[number]) => {
    const partes = [v.nombre];
    if (v.etiqueta_medida) partes.push(v.etiqueta_medida);
    else if (v.tamaño) partes.push(v.tamaño);
    else if (v.ancho_cm && v.alto_cm) partes.push(`${v.ancho_cm}×${v.alto_cm} cm`);
    return partes.filter(Boolean).join(' · ');
  };

  const abrirSolicitud = (idProducto?: number) => {
    const inicial: Record<string, string> = {};
    const marcasIniciales: Record<number, string> = {};
    productos.forEach((p) => {
      marcasIniciales[p.id_producto] = p.marca || '';
      if (p.variantes?.length) {
        p.variantes.forEach((v) => {
          inicial[claveLinea(p.id_producto, v.id)] =
            p.id_producto === idProducto && v.id === p.variantes![0].id ? '1' : '';
        });
      } else {
        inicial[claveLinea(p.id_producto)] = p.id_producto === idProducto ? '1' : '';
      }
    });
    setCantidades(inicial);
    setMarcaSel(marcasIniciales);
    setMostrarSolicitud(true);
  };

  // Comunica con el backend mediante POST `/productos/proveedores/${proveedorId}/solicitar-reabastecimiento`.
  const solicitarReabastecimiento = async (e: React.FormEvent) => {
    e.preventDefault();
    type ItemSolicitud = {
      id_producto: number;
      cantidad: number;
      id_variante?: number;
      marca?: string;
    };
    const items: ItemSolicitud[] = [];
    for (const p of productos) {
      const porMetros = !!p.venta_por_metros;
      if (p.variantes?.length) {
        for (const v of p.variantes) {
          const crudo = cantidades[claveLinea(p.id_producto, v.id)] || '';
          const cantidad = porMetros ? parseFloat(crudo || '0') : parseInt(crudo || '0', 10);
          if (!Number.isFinite(cantidad) || cantidad <= 0) continue;
          items.push({
            id_producto: p.id_producto,
            cantidad,
            id_variante: v.id,
            marca: marcaSel[p.id_producto]?.trim() || p.marca || undefined,
          });
        }
      } else {
        const crudo = cantidades[claveLinea(p.id_producto)] || '';
        const cantidad = porMetros ? parseFloat(crudo || '0') : parseInt(crudo || '0', 10);
        if (!Number.isFinite(cantidad) || cantidad <= 0) continue;
        items.push({
          id_producto: p.id_producto,
          cantidad,
          marca: marcaSel[p.id_producto]?.trim() || p.marca || undefined,
        });
      }
    }
    if (items.length === 0) {
      notify(t('adm.productos.notifyCantidad'), 'err');
      return;
    }
    setSolicitando(true);
    try {
      const res = await api.post(`/productos/proveedores/${proveedorId}/solicitar-reabastecimiento`, items);
      setMostrarSolicitud(false);
      notify(res.data?.msg || t('adm.productos.notifyEnviada'));
    } catch (err: any) {
      notify(err.response?.data?.detail || t('adm.productos.notifyError'), 'err');
    } finally {
      setSolicitando(false);
    }
  };

  return (
    <motion.section
      className="admin-panel"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="ap-header">
        <div>
          <h1 className="ap-title">{t('adm.productos.titulo')}</h1>
          <p className="ap-subtitle">
            {total > 0
              ? t('adm.productos.subtituloConteo', { n: total })
              : t('adm.productos.subtituloVacio')}
          </p>
        </div>
        <div className="ap-header-right">
          <Link
            to={
              categoriaId
                ? `/admin/productos/nuevo?categoria=${categoriaId}`
                : proveedorId
                  ? `/admin/productos/nuevo?proveedor=${proveedorId}`
                  : '/admin/productos/nuevo'
            }
            className="ap-btn ap-btn-primary"
          >
            <FaPlus /> {t('adm.productos.nuevoProducto')}
          </Link>
        </div>
      </div>

      <div className="ap-filters" style={{ marginBottom: 20 }}>
        <form className="ap-search" onSubmit={handleSearch}>
          <FaMagnifyingGlass />
          <input
            type="text"
            placeholder={t('adm.productos.buscarPlaceholder')}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </form>
        <select
          className="ap-filtro-estado"
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          title={t('adm.productos.filtroVisibilidadTitle')}
        >
          <option value="todos">{t('adm.productos.filtroTodosEstados')}</option>
          <option value="activo">{t('adm.productos.filtroSoloActivos')}</option>
          <option value="inactivo">{t('adm.productos.filtroSoloOcultos')}</option>
        </select>
        <select
          className="ap-filtro-estado"
          value={proveedorId || ''}
          onChange={(e) => {
            const v = e.target.value;
            setBusqueda('');
            navigate(v ? `/admin/productos?proveedor=${v}` : '/admin/productos');
          }}
          title={t('adm.productos.filtroProveedorTitle')}
        >
          <option value="">{t('adm.productos.todosProveedores')}</option>
          {proveedores.map((pr) => (
            <option key={pr.id_proveedor} value={pr.id_proveedor}>
              {pr.nombre_proveedor}
            </option>
          ))}
        </select>
        {categoriaId && (
          <button
            type="button"
            className="ap-badge info"
            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}
            onClick={() => {
              setBusqueda('');
              navigate('/admin/productos');
            }}
            title={t('adm.productos.quitarFiltroCategoriaTitle')}
          >
            {t('adm.productos.categoriaFiltro', {
              nombre: productos[0]?.nombre_categoria || t('adm.productos.categoriaSeleccionada'),
            })}{' '}
            <FaXmark />
          </button>
        )}
      </div>

      {cargando ? (
        <div className="ap-card">
          <div className="ap-states">
            <span className="ap-loader" />
            <h3>{t('adm.productos.cargandoTitulo')}</h3>
            <p>{t('adm.productos.cargandoTexto')}</p>
          </div>
        </div>
      ) : error ? (
        <div className="ap-card">
          <div className="ap-states error">
            <div className="ap-states-icon">
              <FaCircleInfo />
            </div>
            <h3>{t('adm.productos.errorTitulo')}</h3>
            <p>{t('adm.productos.errorTexto')}</p>
            <button type="button" className="ap-btn ap-btn-ghost" onClick={() => cargar('')}>
              {t('adm.productos.reintentar')}
            </button>
          </div>
        </div>
      ) : productos.length === 0 ? (
        <div className="ap-card">
          <div className="ap-states">
            <div className="ap-states-icon">
              <FaBoxOpen />
            </div>
            <h3>{busqueda || categoriaId ? t('adm.productos.sinResultados') : t('adm.productos.sinProductos')}</h3>
            <p>
              {busqueda
                ? t('adm.productos.sinResultadosTexto', { busqueda: busqueda.trim() })
                : categoriaId
                  ? t('adm.productos.sinCategoriaTexto')
                  : t('adm.productos.sinProductosTexto')}
            </p>
            {!busqueda && !categoriaId && (
              <Link
                to={categoriaId ? `/admin/productos/nuevo?categoria=${categoriaId}` : '/admin/productos/nuevo'}
                className="ap-btn ap-btn-primary"
              >
                <FaPlus /> {t('adm.productos.crearPrimerProducto')}
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="ap-card">
          <div className="ap-table-wrap">
            <table className="ap-table">
              <thead>
                <tr>
                  <th>{t('adm.productos.tabProducto')}</th>
                  <th>{t('adm.productos.tabCategoria')}</th>
                  <th>{t('adm.productos.tabStock')}</th>
                  <th>{t('adm.productos.tabEstado')}</th>
                  <th>Visible cliente</th>
                  <th>{t('adm.productos.tabPrecio')}</th>
                  <th>{t('adm.productos.tabAcciones')}</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((producto) => (
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
                        <span className="ap-badge neutral">{t('adm.productos.sinCategoriaBadge')}</span>
                      )}
                    </td>
                    <td>
                      <span className={`ap-badge ${badgeStock(producto.stock_producto)}`}>
                        {textoStock(producto.stock_producto)}
                      </span>
                    </td>
                    <td>
                      <span className={`ap-badge ${producto.estado_producto === 'activo' ? 'ok' : 'err'}`}>
                        {producto.estado_producto === 'activo' ? t('adm.productos.estadoActivo') : t('adm.productos.estadoInactivo')}
                      </span>
                    </td>
                    <td>
                      <label className="ap-toggle" title={producto.visible_cliente !== false ? 'Ocultar del catálogo público' : 'Mostrar en catálogo público'}>
                        <input
                          type="checkbox"
                          checked={producto.visible_cliente !== false}
                          onChange={() => toggleVisibilidad(producto)}
                        />
                        <span className="ap-toggle-slider" />
                        <span className="ap-toggle-label">
                          {producto.visible_cliente !== false ? 'Visible' : 'Oculto'}
                        </span>
                      </label>
                    </td>
                    <td>
                      {producto.descuento_activo && producto.descuento_activo > 0 ? (
                        <>
                          <span className="muted" style={{ textDecoration: 'line-through' }}>
                            {formatoPrecio(producto.precio_venta_producto)}
                          </span>{' '}
                          <strong style={{ color: '#ffd98a' }}>
                            {formatoPrecio(producto.precio_final ?? producto.precio_venta_producto)}
                          </strong>{' '}
                          <span className="ap-badge err">-{producto.descuento_activo}%</span>
                          {producto.promocion_hasta && (
                            <span className="muted" style={{ display: 'block', fontSize: 11, marginTop: 2 }}>
                              {t('adm.productos.promoHasta', { fecha: producto.promocion_hasta })}
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <strong style={{ color: '#ffd98a' }}>{formatoPrecio(producto.precio_venta_producto)}</strong>{' '}
                          <span className="muted">COP</span>
                        </>
                      )}
                    </td>
                    <td>
                      <div className="ap-table-acciones">
                        <Link to={`/admin/productos/${producto.id_producto}`} className="ap-btn ap-btn-ghost">
                          {t('adm.productos.gestionar')}
                        </Link>
                        <button
                          type="button"
                          className={`ap-btn ${producto.estado_producto === 'activo' ? 'ap-btn-danger' : 'ap-btn-primary'}`}
                          title={producto.estado_producto === 'activo' ? t('adm.productos.ocultarTitle') : t('adm.productos.mostrarTitle')}
                          onClick={() => toggleEstado(producto)}
                        >
                          {producto.estado_producto === 'activo' ? t('adm.productos.ocultar') : t('adm.productos.mostrar')}
                        </button>
                        {proveedorId && (
                          <button
                            type="button"
                            className="ap-btn ap-btn-primary"
                            title={t('adm.productos.solicitarMasTitle', { nombre: producto.nombre_producto, proveedor: nombreProveedor })}
                            onClick={() => abrirSolicitud(producto.id_producto)}
                          >
                            <FaPaperPlane /> {t('adm.productos.solicitarMas')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="ap-paginacion">
              <button
                type="button"
                className="ap-page-btn"
                disabled={page <= 1}
                onClick={() => irPagina(page - 1)}
              >
                ‹ {t('adm.productos.anterior')}
              </button>
              <div className="ap-page-nums">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`ap-page-btn ${n === page ? 'active' : ''}`}
                    onClick={() => irPagina(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="ap-page-btn"
                disabled={page >= totalPages}
                onClick={() => irPagina(page + 1)}
              >
                {t('adm.productos.siguiente')} ›
              </button>
            </div>
          )}
        </div>
      )}

      {mostrarSolicitud && proveedorId && (
        <div className="ap-modal-overlay">
          <form className="ap-modal" onSubmit={solicitarReabastecimiento} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <h3>
              <FaTruckField style={{ color: '#ffd98a', marginRight: 8 }} />
              {t('adm.productos.modalTitulo', { proveedor: nombreProveedor })}
            </h3>
            <p>{t('adm.productos.modalTexto')}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 420, overflowY: 'auto' }}>
              {productos.map((p) => {
                const porMetros = !!p.venta_por_metros;
                return (
                  <div
                    key={p.id_producto}
                    style={{ border: '1px solid rgba(212,165,75,0.25)', borderRadius: 12, padding: '10px 12px', background: 'rgba(255,255,255,0.05)' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <img
                        src={p.imagen_url || `/productos/${p.id_producto}.jpg`}
                        alt=""
                        className="ap-thumb"
                        onError={(e) => (e.currentTarget.src = '/productos/default.png')}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong
                          style={{ display: 'block', fontSize: 13, color: '#ffffff', fontWeight: 700, lineHeight: 1.35, overflowWrap: 'break-word', textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}
                          title={p.nombre_producto}
                        >
                          {p.nombre_producto}
                        </strong>
                        <span style={{ fontSize: 11, color: '#c9c9c9' }}>
                          {t('adm.productos.stockActual', { stock: p.stock_producto ?? 0 })}
                          {porMetros ? ` · ${t('adm.productos.ventaMetros')}` : ''}
                        </span>
                      </div>
                    </div>

                    {p.variantes?.length ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                        {p.variantes.map((v) => (
                          <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {v.hex && (
                              <span
                                title={v.nombre}
                                style={{ width: 14, height: 14, borderRadius: '50%', background: v.hex, border: '1px solid rgba(255,255,255,0.35)', flexShrink: 0 }}
                              />
                            )}
                            <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: '#e0d9c8', overflowWrap: 'anywhere' }}>
                              {etiquetaVariante(v)}
                              <span style={{ color: '#9a8f78' }}> · stock {v.stock ?? 0}</span>
                            </span>
                            <input
                              type="number"
                              min="0"
                              step={porMetros ? '0.5' : '1'}
                              className="ap-form-input"
                              style={{ width: 92 }}
                              placeholder={porMetros ? '0 m' : '0'}
                              value={cantidades[claveLinea(p.id_producto, v.id)] ?? ''}
                              onChange={(e) =>
                                setCantidades((prev) => ({ ...prev, [claveLinea(p.id_producto, v.id)]: e.target.value }))
                              }
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                        <input
                          type="number"
                          min="0"
                          step={porMetros ? '0.5' : '1'}
                          className="ap-form-input"
                          style={{ width: 92 }}
                          placeholder={porMetros ? '0 m' : '0'}
                          value={cantidades[claveLinea(p.id_producto)] ?? ''}
                          onChange={(e) =>
                            setCantidades((prev) => ({ ...prev, [claveLinea(p.id_producto)]: e.target.value }))
                          }
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="ap-modal-actions">
              <button type="button" className="ap-btn ap-btn-ghost" onClick={() => setMostrarSolicitud(false)} disabled={solicitando}>
                <FaXmark /> {t('adm.productos.cancelar')}
              </button>
              <button type="submit" className="ap-btn ap-btn-primary" disabled={solicitando}>
                <FaPaperPlane /> {solicitando ? t('adm.productos.enviando') : t('adm.productos.enviarSolicitud')}
              </button>
            </div>
          </form>
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

export default AdminProductos;