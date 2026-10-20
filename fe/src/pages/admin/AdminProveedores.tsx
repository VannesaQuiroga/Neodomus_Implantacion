// Pantalla AdminProveedores de Neodomus. Reúne el estado y las acciones de su vista.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FaTruckField, FaCircleInfo, FaPlus, FaXmark, FaTriangleExclamation, FaCircleCheck, FaBoxesStacked, FaPen, FaMagnifyingGlass } from 'react-icons/fa6';
import '@styles/admin-panel.css';
import '@styles/dashboard-admin.css';
import api from '@services/api';
import { useIdioma } from '@i18n/IdiomaContext';
import type { ProveedorAdmin, ProductoAdmin } from '../../types';

interface PaginaProductos {
  total: number;
  data: ProductoAdmin[];
}

const VACIO = {
  nombre_proveedor: '',
  contacto_proveedor: '',
  telefono_proveedor: '',
  correo_proveedor: '',
  direccion_proveedor: '',
};

// Comunica con el backend mediante GET '/productos/proveedores', GET '/productos/?limit=100', PUT `/productos/proveedores/${editandoId}` y otras peticiones de esta vista; registra escuchas de eventos para sincronizar la vista.
const AdminProveedores = () => {
  const { t } = useIdioma();
  const [proveedores, setProveedores] = useState<ProveedorAdmin[]>([]);
  const [productos, setProductos] = useState<ProductoAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null);

  // Comunica con el backend mediante GET '/productos/proveedores', GET '/productos/?limit=100'.
  const cargar = async () => {
    setCargando(true);
    setError(false);
    try {
      const [resProv, resPro] = await Promise.all([
        api.get<ProveedorAdmin[]>('/productos/proveedores'),
        api.get<PaginaProductos>('/productos/?limit=100'),
      ]);
      setProveedores(resProv.data || []);
      setProductos(resPro.data.data || []);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
    const handler = () => cargar();
    window.addEventListener('admin-producto-updated', handler);
    return () => window.removeEventListener('admin-producto-updated', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const notify = (msg: string, tipo: 'ok' | 'err' = 'ok') => {
    setToast({ msg, tipo });
    window.setTimeout(() => setToast(null), 3200);
  };

  const setCampo = (campo: keyof typeof VACIO, valor: string) =>
    setForm((prev) => ({ ...prev, [campo]: valor }));

  // Comunica con el backend mediante PUT `/productos/proveedores/${editandoId}`, POST '/productos/proveedores'.
  const crearProveedor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre_proveedor.trim()) {
      notify(t('adm.proveedores.errorNombre'), 'err');
      return;
    }
    setGuardando(true);
    try {
      if (editandoId !== null) {
        await api.put(`/productos/proveedores/${editandoId}`, {
          nombre_proveedor: form.nombre_proveedor.trim(),
          contacto_proveedor: form.contacto_proveedor.trim() || null,
          telefono_proveedor: form.telefono_proveedor.trim() || null,
          correo_proveedor: form.correo_proveedor.trim() || null,
          direccion_proveedor: form.direccion_proveedor.trim() || null,
        });
        notify(t('adm.proveedores.actualizadoOk'));
      } else {
        await api.post('/productos/proveedores', {
          nombre_proveedor: form.nombre_proveedor.trim(),
          contacto_proveedor: form.contacto_proveedor.trim() || null,
          telefono_proveedor: form.telefono_proveedor.trim() || null,
          correo_proveedor: form.correo_proveedor.trim() || null,
          direccion_proveedor: form.direccion_proveedor.trim() || null,
        });
        notify(t('adm.proveedores.agregadoOk'));
      }
      setMostrarNuevo(false);
      setEditandoId(null);
      setForm(VACIO);
      await cargar();
    } catch (err: any) {
      notify(err.response?.data?.detail || t('adm.proveedores.errorGuardar'), 'err');
    } finally {
      setGuardando(false);
    }
  };

  const abrirEdicion = (prov: ProveedorAdmin) => {
    setForm({
      nombre_proveedor: prov.nombre_proveedor || '',
      contacto_proveedor: prov.contacto_proveedor || '',
      telefono_proveedor: prov.telefono_proveedor || '',
      correo_proveedor: prov.correo_proveedor || '',
      direccion_proveedor: prov.direccion_proveedor || '',
    });
    setEditandoId(prov.id_proveedor);
    setMostrarNuevo(true);
  };

  const resumen = (idProveedor: number | null | undefined) => {
    const lista = productos.filter((p) => p.id_proveedor_pr === idProveedor);
    return {
      cantidad: lista.length,
      stock: lista.reduce((sum, p) => sum + (p.stock_producto || 0), 0),
    };
  };

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return proveedores;
    return proveedores.filter((prov) =>
      [
        prov.nombre_proveedor,
        prov.contacto_proveedor || '',
        prov.telefono_proveedor || '',
        prov.correo_proveedor || '',
        prov.direccion_proveedor || '',
      ].some((v) => v.toLowerCase().includes(q)),
    );
  }, [proveedores, busqueda]);

  return (
    <motion.section
      className="admin-panel"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="ap-header">
        <div>
          <h1 className="ap-title">{t('adm.proveedores.titulo')}</h1>
          <p className="ap-subtitle">
            {t('adm.proveedores.subtitulo')}
          </p>
        </div>
        <div className="ap-header-right">
          <button type="button" className="ap-btn ap-btn-primary" onClick={() => setMostrarNuevo(true)}>
            <FaPlus /> {t('adm.proveedores.nuevoProveedor')}
          </button>
        </div>
      </div>

      <form className="ap-search" style={{ marginBottom: 14 }} onSubmit={(e) => e.preventDefault()}>
        <FaMagnifyingGlass />
        <input
          type="text"
          placeholder={t('adm.proveedores.buscarPlaceholder')}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </form>

      {cargando ? (
        <div className="ap-card">
          <div className="ap-states">
            <span className="ap-loader" />
            <h3>{t('adm.proveedores.cargando')}</h3>
            <p>{t('adm.proveedores.cargandoDesc')}</p>
          </div>
        </div>
      ) : error ? (
        <div className="ap-card">
          <div className="ap-states error">
            <div className="ap-states-icon">
              <FaCircleInfo />
            </div>
            <h3>{t('adm.proveedores.errorTitulo')}</h3>
            <p>{t('adm.proveedores.errorDesc')}</p>
            <button type="button" className="ap-btn ap-btn-ghost" onClick={cargar}>
              {t('adm.proveedores.reintentar')}
            </button>
          </div>
        </div>
      ) : proveedores.length === 0 ? (
        <div className="ap-card">
          <div className="ap-states">
            <div className="ap-states-icon">
              <FaTruckField />
            </div>
            <h3>{t('adm.proveedores.sinProveedores')}</h3>
            <p>{t('adm.proveedores.sinProveedoresDesc')}</p>
          </div>
        </div>
      ) : visibles.length === 0 ? (
        <div className="ap-card">
          <div className="ap-states">
            <div className="ap-states-icon">
              <FaMagnifyingGlass />
            </div>
            <h3>{t('adm.proveedores.sinResultados')}</h3>
          </div>
        </div>
      ) : (
        <div className="ap-card">
          <div className="ap-table-wrap">
            <table className="ap-table">
              <thead>
                <tr>
                  <th>{t('adm.proveedores.colProveedor')}</th>
                  <th>{t('adm.proveedores.colContacto')}</th>
                  <th>{t('adm.proveedores.colTelefonoCorreo')}</th>
                  <th>{t('adm.proveedores.colProductos')}</th>
                  <th>{t('adm.proveedores.colStockTotal')}</th>
                  <th>{t('adm.proveedores.colAcciones')}</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((prov) => {
                  const r = resumen(prov.id_proveedor);
                  return (
                    <tr key={prov.id_proveedor}>
                      <td>
                        <div className="ap-cell-user">
                          <div className="an-icon cuenta" style={{ width: 38, height: 38, fontSize: 16 }}>
                            <FaTruckField />
                          </div>
                          <div>
                            <strong>{prov.nombre_proveedor}</strong>
                            {prov.direccion_proveedor && <span>{prov.direccion_proveedor}</span>}
                          </div>
                        </div>
                      </td>
                      <td>{prov.contacto_proveedor || <span className="muted">—</span>}</td>
                      <td>
                        {prov.telefono_proveedor && <div>{prov.telefono_proveedor}</div>}
                        {prov.correo_proveedor && <div className="muted" style={{ fontSize: 12 }}>{prov.correo_proveedor}</div>}
                        {!prov.telefono_proveedor && !prov.correo_proveedor && <span className="muted">—</span>}
                      </td>
                      <td>
                        <span className="ap-badge info">
                          <FaBoxesStacked style={{ marginRight: 6 }} />
                          {r.cantidad === 1
                            ? t('adm.proveedores.badgeProductoUno', { n: r.cantidad })
                            : t('adm.proveedores.badgeProductos', { n: r.cantidad })}
                        </span>
                      </td>
                      <td>
                        <span className="ap-badge ok">{t('adm.proveedores.stockUnidades', { n: r.stock })}</span>
                      </td>
                      <td>
                        <div className="ap-table-acciones">
                          <button type="button" className="ap-btn ap-btn-ghost" onClick={() => abrirEdicion(prov)}>
                            <FaPen /> {t('adm.proveedores.editar')}
                          </button>
                          <Link to={`/admin/productos?proveedor=${prov.id_proveedor}`} className="ap-btn ap-btn-ghost">
                            {t('adm.proveedores.verProductos')}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {mostrarNuevo && (
        <div className="ap-modal-overlay">
          <form className="ap-modal" onSubmit={crearProveedor} onClick={(e) => e.stopPropagation()}>
            <h3>
              <FaTruckField style={{ color: '#ffd98a', marginRight: 8 }} />
              {editandoId !== null ? t('adm.proveedores.editarTitulo') : t('adm.proveedores.nuevoTitulo')}
            </h3>
            <div className="ap-form-group">
              <label className="ap-form-label" htmlFor="apf-nombre">{t('adm.proveedores.nombreLabel')}</label>
              <input
                id="apf-nombre"
                className="ap-form-input"
                type="text"
                value={form.nombre_proveedor}
                onChange={(e) => setCampo('nombre_proveedor', e.target.value)}
                placeholder={t('adm.proveedores.nombrePlaceholder')}
              />
            </div>
            <div className="ap-form-group">
              <label className="ap-form-label" htmlFor="apf-contacto">{t('adm.proveedores.contactoLabel')}</label>
              <input
                id="apf-contacto"
                className="ap-form-input"
                type="text"
                value={form.contacto_proveedor}
                onChange={(e) => setCampo('contacto_proveedor', e.target.value)}
                placeholder={t('adm.proveedores.contactoPlaceholder')}
              />
            </div>
            <div className="ap-form-group">
              <label className="ap-form-label" htmlFor="apf-tel">{t('adm.proveedores.telefonoLabel')}</label>
              <input
                id="apf-tel"
                className="ap-form-input"
                type="text"
                value={form.telefono_proveedor}
                onChange={(e) => setCampo('telefono_proveedor', e.target.value.replace(/\D/g, ''))}
                placeholder={t('adm.proveedores.telefonoPlaceholder')}
              />
            </div>
            <div className="ap-form-group">
              <label className="ap-form-label" htmlFor="apf-correo">{t('adm.proveedores.correoLabel')}</label>
              <input
                id="apf-correo"
                className="ap-form-input"
                type="email"
                value={form.correo_proveedor}
                onChange={(e) => setCampo('correo_proveedor', e.target.value)}
                placeholder={t('adm.proveedores.correoPlaceholder')}
              />
            </div>
            <div className="ap-form-group">
              <label className="ap-form-label" htmlFor="apf-dir">{t('adm.proveedores.direccionLabel')}</label>
              <input
                id="apf-dir"
                className="ap-form-input"
                type="text"
                value={form.direccion_proveedor}
                onChange={(e) => setCampo('direccion_proveedor', e.target.value)}
                placeholder={t('adm.proveedores.direccionPlaceholder')}
              />
            </div>
            <div className="ap-modal-actions">
              <button type="button" className="ap-btn ap-btn-ghost" onClick={() => { setMostrarNuevo(false); setEditandoId(null); setForm(VACIO); }} disabled={guardando}>
                <FaXmark /> {t('adm.proveedores.cancelar')}
              </button>
              <button type="submit" className="ap-btn ap-btn-primary" disabled={guardando}>
                <FaPen /> {guardando ? t('adm.proveedores.guardando') : editandoId !== null ? t('adm.proveedores.guardarCambios') : t('adm.proveedores.agregarProveedor')}
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

export default AdminProveedores;
