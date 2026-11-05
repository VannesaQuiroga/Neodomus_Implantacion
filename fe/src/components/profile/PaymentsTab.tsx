// Presenta los datos de métodos de pago administrados desde el perfil.
import { useState } from 'react';
import { FaPlus, FaTrashCan, FaPencil, FaCreditCard, FaRegCreditCard, FaCheck } from 'react-icons/fa6';
import { getPagos, saveItem, PF_PAGOS_KEY, MetodoPago, TipoPago } from '@utils/profileStorage';
import SectionHeader from './SectionHeader';
import { NotifyFn } from './PersonalTab';

const tipoLabel: Record<TipoPago, string> = {
  tarjeta: 'Tarjeta',
  nequi: 'Nequi',
  pse: 'PSE',
};

const marcaNombre = (numero: string): string => {
  if (/^4/.test(numero)) return 'Visa';
  if (/^5[1-5]/.test(numero)) return 'Mastercard';
  return 'Tarjeta';
};

const formatoNumero = (numero: string): string => {
  const limpio = numero.replace(/\D/g, '');
  if (limpio.length <= 4) return limpio;
  return limpio.slice(0, 4) + ' •••• •••• ' + limpio.slice(-4);
};

interface PayFormProps {
  metodo: MetodoPago | null;
  onClose: () => void;
  onGuardar: (data: Omit<MetodoPago, 'id' | 'predeterminado'>) => void;
}

const PayFormModal = ({ metodo, onClose, onGuardar }: PayFormProps) => {
  const [tipo, setTipo] = useState<TipoPago>(metodo?.tipo || 'tarjeta');
  const [titular, setTitular] = useState(metodo?.titular || '');
  const [numero, setNumero] = useState(metodo?.numero || '');
  const [expiracion, setExpiracion] = useState(metodo?.expiracion || '');
  const [error, setError] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const numeroLimpio = numero.replace(/\D/g, '');
    if (!titular.trim()) {
      setError('Ingresa el titular del método de pago');
      return;
    }
    if (numeroLimpio.length < 8) {
      setError('El número ingresado es demasiado corto');
      return;
    }
    onGuardar({ tipo, titular: titular.trim(), numero: numero.replace(/\s/g, ''), expiracion: expiracion || undefined });
  };

  return (
    <div className="pf-modal-backdrop" onClick={onClose}>
      <div className="pf-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pf-modal-header">
          <h3>{metodo ? 'Editar método de pago' : 'Agregar método de pago'}</h3>
          <button type="button" className="pf-modal-close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        <form className="pf-form" onSubmit={submit}>
          <div className="pf-form-group">
            <span className="pf-form-label">Tipo de método</span>
            <div className="pf-pay-type-select">
              {(Object.keys(tipoLabel) as TipoPago[]).map((t) => (
                <button
                  type="button"
                  key={t}
                  className={`pf-pay-type-btn ${tipo === t ? 'active' : ''}`}
                  onClick={() => setTipo(t)}
                >
                  {tipoLabel[t]}
                </button>
              ))}
            </div>
          </div>
          <div className="pf-form-group">
            <label className="pf-form-label" htmlFor="pf-pay-titular">Titular</label>
            <input
              id="pf-pay-titular"
              className="pf-form-input"
              type="text"
              value={titular}
              onChange={(e) => setTitular(e.target.value)}
              placeholder="Nombre como aparece en el método"
            />
          </div>
          <div className="pf-form-group">
            <label className="pf-form-label" htmlFor="pf-pay-numero">
              {tipo === 'tarjeta' ? 'Número de tarjeta' : tipo === 'nequi' ? 'Número de celular (Nequi)' : 'Cuenta bancaria'}
            </label>
            <input
              id="pf-pay-numero"
              className="pf-form-input"
              type="text"
              inputMode="numeric"
              value={numero}
              onChange={(e) => setNumero(e.target.value.replace(/\D/g, ''))}
              placeholder={tipo === 'tarjeta' ? '1234 5678 9012 3456' : '300 123 4567'}
            />
          </div>
          {tipo === 'tarjeta' && (
            <div className="pf-form-group">
              <label className="pf-form-label" htmlFor="pf-pay-exp">Fecha de vencimiento</label>
              <input
                id="pf-pay-exp"
                className="pf-form-input"
                type="text"
                value={expiracion}
                onChange={(e) => setExpiracion(e.target.value.replace(/[^\d/]/g, ''))}
                placeholder="MM/AA"
              />
            </div>
          )}
          {error && <div className="pf-message-error">{error}</div>}
          <div className="pf-form-actions">
            <button type="button" className="pf-btn pf-btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="pf-btn pf-btn-primary">
              <FaCheck /> {metodo ? 'Guardar cambios' : 'Agregar método'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const PaymentsTab = ({ notify }: { notify: NotifyFn }) => {
  const [pagos, setPagos] = useState<MetodoPago[]>(getPagos());
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<MetodoPago | null>(null);
  const [eliminando, setEliminando] = useState<MetodoPago | null>(null);

  const persistir = (next: MetodoPago[]) => saveItem(PF_PAGOS_KEY, next);

  const guardar = (data: Omit<MetodoPago, 'id' | 'predeterminado'>) => {
    let next: MetodoPago[];
    if (editando) {
      next = pagos.map((p) => (p.id === editando.id ? { ...editando, ...data } : p));
      notify('Método de pago actualizado', 'success');
    } else {
      const nuevo: MetodoPago = { ...data, id: `pay-${Date.now()}`, predeterminado: pagos.length === 0 };
      next = [...pagos, nuevo];
      notify('Método de pago agregado', 'success');
    }
    setPagos(next);
    persistir(next);
    setModalAbierto(false);
    setEditando(null);
  };

  const confirmarEliminar = () => {
    if (!eliminando) return;
    const next = pagos.filter((p) => p.id !== eliminando.id);
    if (eliminando.predeterminado && next.length > 0) next[0].predeterminado = true;
    setPagos(next);
    persistir(next);
    setEliminando(null);
    notify('Método de pago eliminado', 'info');
  };

  const setPredeterminado = (id: string) => {
    const next = pagos.map((p) => ({ ...p, predeterminado: p.id === id }));
    setPagos(next);
    persistir(next);
    notify('Método de pago predeterminado actualizado', 'success');
  };

  return (
    <div className="pf-tab">
      <SectionHeader
        icon={<FaCreditCard />}
        title="Métodos de pago"
        subtitle="Administra las tarjetas y cuentas asociadas a tu cuenta."
        action={
          <button type="button" className="pf-btn pf-btn-primary" onClick={() => { setEditando(null); setModalAbierto(true); }}>
            <FaPlus /> Agregar método
          </button>
        }
      />

      {pagos.length === 0 ? (
        <div className="pf-empty">
          <span className="pf-empty-icon"><FaRegCreditCard /></span>
          <p>No tienes métodos de pago registrados.</p>
        </div>
      ) : (
        <div className="pf-pay-list">
          {pagos.map((pago) => (
            <div className={`pf-pay-card ${pago.predeterminado ? 'predeterminado' : ''}`} key={pago.id}>
              <span className={`pf-pay-brand ${pago.tipo}${pago.tipo === 'tarjeta' ? (marcaNombre(pago.numero) === 'Visa' ? ' visa' : ' master') : ''}`}>
                <FaCreditCard />
              </span>
              <div className="pf-pay-info">
                <span className="pf-pay-titular">{pago.titular}</span>
                <span className="pf-pay-numero">
                  {pago.tipo === 'tarjeta'
                    ? `${marcaNombre(pago.numero)} ${formatoNumero(pago.numero)}`
                    : `${tipoLabel[pago.tipo]} ${pago.numero}`}
                </span>
                <span className="pf-pay-extra">
                  {pago.predeterminado ? (
                    <span className="pf-pay-default">Predeterminado</span>
                  ) : pago.expiracion ? (
                    `Vence ${pago.expiracion}`
                  ) : (
                    'Sin vencimiento'
                  )}
                </span>
              </div>
              <div className="pf-pay-actions">
                <button
                  type="button"
                  className="pf-icon-btn"
                  title="Establecer como predeterminado"
                  onClick={() => setPredeterminado(pago.id)}
                >
                  <FaCheck className={pago.predeterminado ? 'on' : ''} />
                </button>
                <button
                  type="button"
                  className="pf-icon-btn"
                  title="Editar"
                  onClick={() => { setEditando(pago); setModalAbierto(true); }}
                >
                  <FaPencil />
                </button>
                <button
                  type="button"
                  className="pf-icon-btn danger"
                  title="Eliminar"
                  onClick={() => setEliminando(pago)}
                >
                  <FaTrashCan />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalAbierto && (
        <PayFormModal
          metodo={editando}
          onClose={() => { setModalAbierto(false); setEditando(null); }}
          onGuardar={guardar}
        />
      )}

      {eliminando && (
        <div className="pf-modal-backdrop" onClick={() => setEliminando(null)}>
          <div className="pf-modal pf-modal-small" onClick={(e) => e.stopPropagation()}>
            <div className="pf-modal-header">
              <h3>Eliminar método de pago</h3>
              <button type="button" className="pf-modal-close" onClick={() => setEliminando(null)} aria-label="Cerrar">×</button>
            </div>
            <p className="pf-modal-text">¿Seguro que deseas eliminar este método de pago? Esta acción no se puede deshacer.</p>
            <div className="pf-form-actions">
              <button type="button" className="pf-btn pf-btn-ghost" onClick={() => setEliminando(null)}>Cancelar</button>
              <button type="button" className="pf-btn pf-btn-danger" onClick={confirmarEliminar}>
                <FaTrashCan /> Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentsTab;