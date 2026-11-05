// Presenta las solicitudes y el estado de los reembolsos del cliente.
import { useEffect, useMemo, useState } from 'react';
import { FaMagnifyingGlass } from 'react-icons/fa6';
import '@styles/perfil-cliente.css';
import api from '@services/api';

interface ReembolsoCliente {
  id_reembolso: number;
  id_cita: number | null;
  referencia: string;
  cliente_nombre: string | null;
  detalle: string | null;
  monto: number;
  estado: string;
  motivo: string | null;
  numero_transaccion_original: string | null;
  numero_transaccion_reembolso: string | null;
  created_at: string;
}

const formatoPeso = (value: number) =>
  value.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

const formatFecha = (fecha: string) => {
  if (!fecha) return '';
  const [y, m, d] = fecha.split('T')[0].split('-');
  return `${d}/${m}/${y}`;
};

const claseEstado = (estado: string) => {
  if (estado === 'Reembolsado') return 'ok';
  if (estado === 'Rechazado') return 'err';
  return 'proceso';
};

const textoEstado = (estado: string) =>
  estado === 'Procesando' ? 'En proceso' : estado;

// Comunica con el backend mediante GET '/reembolsos/mis'.
const ReembolsosCliente = () => {
  const [reembolsos, setReembolsos] = useState<ReembolsoCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroFecha, setFiltroFecha] = useState('');

  useEffect(() => {
    // Comunica con el backend mediante GET '/reembolsos/mis'.
    const cargarReembolsos = async () => {
      setLoading(true);
      try {
        const res = await api.get<ReembolsoCliente[]>('/reembolsos/mis');
        setReembolsos(res.data || []);
      } catch (err) {
        console.error('Error al cargar reembolsos:', err);
      } finally {
        setLoading(false);
      }
    };
    cargarReembolsos();
  }, []);

  const hayFiltros = Boolean(busqueda.trim()) || Boolean(filtroFecha);

  const limpiarFiltros = () => {
    setBusqueda('');
    setFiltroFecha('');
  };

  const filtrados = useMemo(() => {
    let resultado = [...reembolsos];

    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase();
      resultado = resultado.filter(
        (r) =>
          (r.cliente_nombre && r.cliente_nombre.toLowerCase().includes(q)) ||
          (r.motivo && r.motivo.toLowerCase().includes(q)) ||
          r.referencia.toLowerCase().includes(q)
      );
    }

    if (filtroFecha) {
      resultado = resultado.filter(
        (r) => (r.created_at || '').slice(0, 10) === filtroFecha
      );
    }

    return resultado;
  }, [reembolsos, busqueda, filtroFecha]);

  const totalDevuelto = useMemo(
    () =>
      reembolsos
        .filter((r) => r.estado === 'Reembolsado')
        .reduce((acc, r) => acc + Number(r.monto || 0), 0),
    [reembolsos]
  );

  const enProceso = reembolsos.filter((r) => r.estado === 'Pendiente' || r.estado === 'Procesando').length;

  const renderReembolsoItem = (r: ReembolsoCliente) => (
    <div className="pf-reembolso-item" key={r.id_reembolso}>
      <div className="pf-reembolso-info">
        <div className="pf-reembolso-cabecera">
          <span className={`pf-reembolso-estado ${claseEstado(r.estado)}`}>
            {textoEstado(r.estado)}
          </span>
          <span className="pf-reembolso-referencia">{r.referencia}</span>
        </div>
        <p className="pf-reembolso-motivo">{r.motivo || 'Sin motivo registrado'}</p>
        <p className="pf-reembolso-fecha">{formatFecha(r.created_at)}</p>
      </div>
      <div className="pf-reembolso-monto">
        <strong>{formatoPeso(r.monto)}</strong>
        {r.numero_transaccion_reembolso && (
          <span className="pf-reembolso-transaccion" title={r.numero_transaccion_reembolso}>
            Transacción: {r.numero_transaccion_reembolso}
          </span>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="pf-empty">
        <div className="pf-empty-icon">⏳</div>
        <p>{'Cargando reembolsos...'}</p>
      </div>
    );
  }

  return (
    <div className="pf-reembolsos-section">
      <div className="pf-reembolsos-header">
        <h3>{'Mis reembolsos'}</h3>
        <span className="pf-reembolsos-total">
          {formatoPeso(totalDevuelto)} <small>devueltos</small>
        </span>
      </div>

      <div className="pf-reembolsos-resumen">
        <span className="pf-reembolso-chip ok">
          {reembolsos.filter((r) => r.estado === 'Reembolsado').length} reembolsados
        </span>
        {enProceso > 0 && (
          <span className="pf-reembolso-chip proceso">{enProceso} en proceso</span>
        )}
        <span className="pf-reembolso-chip">{reembolsos.length} en total</span>
      </div>

      <div className="pf-reembolsos-toolbar">
        <div className="pf-buscar-wrap">
          <FaMagnifyingGlass />
          <input
            type="text"
            placeholder="Buscar por referencia o motivo..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            aria-label="Buscar reembolsos"
          />
        </div>
        <input
          type="date"
          className="pf-fecha-input"
          value={filtroFecha}
          onChange={(e) => setFiltroFecha(e.target.value)}
          aria-label="Filtrar por fecha"
          title="Filtrar por fecha"
        />
        {hayFiltros && (
          <button type="button" className="pf-btn pf-btn-ghost pf-reembolsos-limpiar" onClick={limpiarFiltros}>
            Limpiar
          </button>
        )}
      </div>

      {reembolsos.length === 0 ? (
        <div className="pf-empty">
          <div className="pf-empty-icon">•••</div>
          <p>{'No has recibido reembolsos aún'}</p>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="pf-empty">
          <div className="pf-empty-icon">•••</div>
          <p>{'No hay reembolsos con los filtros aplicados'}</p>
        </div>
      ) : (
        <div className="pf-reembolsos-lista">
          {filtrados.map((r) => renderReembolsoItem(r))}
        </div>
      )}
    </div>
  );
};

export default ReembolsosCliente;
