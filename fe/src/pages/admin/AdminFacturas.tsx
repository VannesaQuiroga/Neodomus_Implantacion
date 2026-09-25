import { useEffect, useMemo, useState } from 'react';
import { FaFileInvoice, FaFilePdf, FaEnvelope } from 'react-icons/fa6';
import api, { descargarFactura } from '@services/api';
import '@styles/admin-panel.css';

interface FacturaAdmin {
  id_factura: number;
  numero_factura: string;
  fecha_factura: string | null;
  monto_total: number;
  metodo_pago: string | null;
  estado_pago: string | null;
  enviada_por_correo: boolean;
  nombre_cliente: string;
  email_cliente: string | null;
  pedido: { id_pedido: number; total: number; estado: string } | null;
  cita: { id_cita: number; tipo_servicio: string; fecha: string | null; costo: number } | null;
  pdf_url: string | null;
}

const formatoPeso = (value: number) =>
  value.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

const formatearFecha = (fecha?: string | null) => {
  if (!fecha) return '';
  try {
    return new Date(fecha).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return fecha;
  }
};

const AdminFacturas = () => {
  const [facturas, setFacturas] = useState<FacturaAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [descargandoId, setDescargandoId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null);

  const cargar = async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    try {
      const res = await api.get<FacturaAdmin[]>('/pedidos/admin/facturas');
      setFacturas(res.data);
    } catch {
      if (!silencioso) setToast({ msg: 'Error al cargar facturas', tipo: 'err' });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
    const intervalo = window.setInterval(() => cargar(true), 30000);
    return () => window.clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return facturas;
    return facturas.filter(
      (f) =>
        f.numero_factura.toLowerCase().includes(q) ||
        f.nombre_cliente.toLowerCase().includes(q) ||
        (f.email_cliente || '').toLowerCase().includes(q) ||
        (f.pedido ? String(f.pedido.id_pedido).includes(q) : false) ||
        (f.cita ? String(f.cita.id_cita).includes(q) : false),
    );
  }, [facturas, busqueda]);

  const descargar = async (factura: FacturaAdmin) => {
    if (!factura.pdf_url) return;
    setDescargandoId(factura.id_factura);
    try {
      await descargarFactura(factura.pdf_url);
    } catch {
      setToast({ msg: 'Error al descargar la factura', tipo: 'err' });
    } finally {
      setDescargandoId(null);
    }
  };

  return (
    <div className="ap-container">
      {toast && (
        <div className={`ap-toast ${toast.tipo === 'ok' ? 'ap-toast-ok' : 'ap-toast-err'}`}>
          {toast.msg}
        </div>
      )}

      <div className="ap-header">
        <h1><FaFileInvoice /> Facturas</h1>
        <p>Gestiona y descarga las facturas generadas por pedidos y servicios.</p>
      </div>

      <div className="ap-toolbar">
        <input
          type="text"
          placeholder="Buscar por número, cliente, pedido o cita..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="ap-search"
        />
        <span className="ap-count">{filtradas.length} factura(s)</span>
      </div>

      {cargando ? (
        <div className="ap-loader">Cargando facturas...</div>
      ) : filtradas.length === 0 ? (
        <div className="ap-empty">
          <FaFileInvoice size={40} />
          <p>No hay facturas registradas.</p>
        </div>
      ) : (
        <div className="ap-table-wrap">
          <table className="ap-table">
            <thead>
              <tr>
                <th>N° Factura</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Referencia</th>
                <th>Monto</th>
                <th>Pago</th>
                <th>Correo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((f) => (
                <tr key={f.id_factura}>
                  <td className="ap-td-bold">{f.numero_factura}</td>
                  <td>{formatearFecha(f.fecha_factura)}</td>
                  <td>{f.nombre_cliente || '—'}</td>
                  <td>
                    {f.pedido ? (
                      <span className="ap-badge ap-badge-ok">Pedido</span>
                    ) : (
                      <span className="ap-badge ap-badge-warn">Cita</span>
                    )}
                  </td>
                  <td>
                    {f.pedido
                      ? `#${f.pedido.id_pedido}`
                      : f.cita
                        ? `Cita #${f.cita.id_cita}`
                        : '—'}
                  </td>
                  <td className="ap-td-bold">{formatoPeso(f.monto_total)}</td>
                  <td>{f.estado_pago || '—'}</td>
                  <td>
                    {f.enviada_por_correo ? (
                      <span title="Enviada"><FaEnvelope color="#28a745" /></span>
                    ) : (
                      <span title="No enviada">—</span>
                    )}
                  </td>
                  <td>
                    {f.pdf_url && (
                      <button
                        className="ap-btn ap-btn-sm ap-btn-icon"
                        onClick={() => descargar(f)}
                        disabled={descargandoId === f.id_factura}
                        title="Descargar PDF"
                      >
                        <FaFilePdf />
                        {descargandoId === f.id_factura ? '...' : ' PDF'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminFacturas;
