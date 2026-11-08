// Presenta las solicitudes y el estado de los reembolsos del cliente.
import { useEffect, useMemo, useState } from 'react';
import { FaMagnifyingGlass } from 'react-icons/fa6';
import '@styles/perfil-cliente.css';
import api from '@services/api';
import { useIdioma } from '@i18n/IdiomaContext';

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
  estado === 'Procesando' ? 'perfil.reembolsos.enProceso' : estado;

// Comunica con el backend mediante GET '/reembolsos/mis'.
const ReembolsosCliente = () => {
  const { t } = useIdioma();
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
    void cargarReembolsos();
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
            {t(textoEstado(r.estado))}
          </span>
          <span className="pf-reembolso-referencia">{r.referencia}</span>
        </div>
        <p className="pf-reembolso-motivo">{r.motivo || t('perfil.reembolsos.sinMotivo')}</p>
        <p className="pf-reembolso-fecha">{formatFecha(r.created_at)}</p>
      </div>
      <div className="pf-reembolso-monto">
        <strong>{formatoPeso(r.monto)}</strong>
        {r.numero_transaccion_reembolso && (
          <span className="pf-reembolso-transaccion" title={r.numero_transaccion_reembolso}>
            {t('perfil.reembolsos.transaccion', { numero: r.numero_transaccion_reembolso })}
          </span>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="pf-empty">
        <div className="pf-empty-icon">⏳</div>
        <p>{t('perfil.reembolsos.cargando')}</p>
      </div>
    );
  }

  return (
    <div className="pf-reembolsos-section">
      <div className="pf-reembolsos-header">
        <h3>{t('perfil.misReembolsos')}</h3>
        <span className="pf-reembolsos-total">
          {formatoPeso(totalDevuelto)} <small>{t('perfil.reembolsos.devueltos')}</small>
        </span>
      </div>

      <div className="pf-reembolsos-resumen">
        <span className="pf-reembolso-chip ok">
          {t('perfil.reembolsos.reembolsados', { n: reembolsos.filter((r) => r.estado === 'Reembolsado').length })}
        </span>
        {enProceso > 0 && (
          <span className="pf-reembolso-chip proceso">{t('perfil.reembolsos.enProcesoConteo', { n: enProceso })}</span>
        )}
        <span className="pf-reembolso-chip">{t('perfil.reembolsos.total', { n: reembolsos.length })}</span>
      </div>

      <div className="pf-reembolsos-toolbar">
        <div className="pf-buscar-wrap">
          <FaMagnifyingGlass />
          <input
            type="text"
            placeholder={t('perfil.reembolsos.buscarPlaceholder')}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            aria-label={t('perfil.reembolsos.buscarAria')}
          />
        </div>
        <input
          type="date"
          className="pf-fecha-input"
          value={filtroFecha}
          onChange={(e) => setFiltroFecha(e.target.value)}
          aria-label={t('perfil.reembolsos.filtrarFecha')}
          title={t('perfil.reembolsos.filtrarFecha')}
        />
        {hayFiltros && (
          <button type="button" className="pf-btn pf-btn-ghost pf-reembolsos-limpiar" onClick={limpiarFiltros}>
            {t('perfil.reembolsos.limpiar')}
          </button>
        )}
      </div>

      {reembolsos.length === 0 ? (
        <div className="pf-empty">
          <div className="pf-empty-icon">•••</div>
          <p>{t('perfil.reembolsos.vacio')}</p>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="pf-empty">
          <div className="pf-empty-icon">•••</div>
          <p>{t('perfil.reembolsos.sinFiltros')}</p>
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
