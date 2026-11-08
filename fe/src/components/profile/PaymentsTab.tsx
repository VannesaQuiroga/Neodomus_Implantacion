// Presenta los datos de métodos de pago administrados desde el perfil.
import { useState } from 'react';
import { FaPlus, FaTrashCan, FaPencil, FaCreditCard, FaRegCreditCard, FaCheck } from 'react-icons/fa6';
import { getPagos, saveItem, PF_PAGOS_KEY, MetodoPago, TipoPago } from '@utils/profileStorage';
import { useIdioma } from '@i18n/IdiomaContext';
import SectionHeader from './SectionHeader';
import { NotifyFn } from './PersonalTab';

const tipoLabelKey: Record<TipoPago, string> = {
  tarjeta: 'perfil.pagos.tipoTarjeta',
  nequi: 'perfil.pagos.tipoNequi',
  pse: 'perfil.pagos.tipoPse',
};

const marcaNombre = (numero: string): string => {
  if (/^4/.test(numero)) return 'Visa';
  if (/^5[1-5]/.test(numero)) return 'Mastercard';
  return 'perfil.pagos.tipoTarjeta';
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
  const { t } = useIdioma();
  const [tipo, setTipo] = useState<TipoPago>(metodo?.tipo || 'tarjeta');
  const [titular, setTitular] = useState(metodo?.titular || '');
  const [numero, setNumero] = useState(metodo?.numero || '');
  const [expiracion, setExpiracion] = useState(metodo?.expiracion || '');
  const [error, setError] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const numeroLimpio = numero.replace(/\D/g, '');
    if (!titular.trim()) {
      setError(t('perfil.pagos.errorTitular'));
      return;
    }
    if (numeroLimpio.length < 8) {
      setError(t('perfil.pagos.errorNumeroCorto'));
      return;
    }
    onGuardar({ tipo, titular: titular.trim(), numero: numero.replace(/\s/g, ''), expiracion: expiracion || undefined });
  };

  return (
    <div role="button" tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') (e.currentTarget as HTMLElement).click(); }}  className="pf-modal-backdrop" onClick={onClose}>
      <div role="button" tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') (e.currentTarget as HTMLElement).click(); }}  className="pf-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pf-modal-header">
          <h3>{metodo ? t('perfil.pagos.editarTitulo') : t('perfil.pagos.agregarTitulo')}</h3>
          <button type="button" className="pf-modal-close" onClick={onClose} aria-label={t('common.cerrar')}>×</button>
        </div>
        <form className="pf-form" onSubmit={submit}>
          <div className="pf-form-group">
            <span className="pf-form-label">{t('perfil.pagos.tipoMetodo')}</span>
            <div className="pf-pay-type-select">
              {(Object.keys(tipoLabelKey) as TipoPago[]).map((tipoKey) => (
                <button
                  type="button"
                  key={tipoKey}
                  className={`pf-pay-type-btn ${tipo === tipoKey ? 'active' : ''}`}
                  onClick={() => setTipo(tipoKey)}
                >
                  {t(tipoLabelKey[tipoKey])}
                </button>
              ))}
            </div>
          </div>
          <div className="pf-form-group">
            <label className="pf-form-label" htmlFor="pf-pay-titular">{t('perfil.pagos.titular')}</label>
            <input
              id="pf-pay-titular"
              className="pf-form-input"
              type="text"
              value={titular}
              onChange={(e) => setTitular(e.target.value)}
              placeholder={t('perfil.pagos.placeholderTitular')}
            />
          </div>
          <div className="pf-form-group">
            <label className="pf-form-label" htmlFor="pf-pay-numero">
              {tipo === 'tarjeta' ? t('perfil.pagos.numeroTarjeta') : tipo === 'nequi' ? t('perfil.pagos.numeroNequi') : t('perfil.pagos.cuentaBancaria')}
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
              <label className="pf-form-label" htmlFor="pf-pay-exp">{t('perfil.pagos.fechaVencimiento')}</label>
              <input
                id="pf-pay-exp"
                className="pf-form-input"
                type="text"
                value={expiracion}
                onChange={(e) => setExpiracion(e.target.value.replace(/[^\d/]/g, ''))}
                placeholder={t('perfil.pagos.placeholderVencimiento')}
              />
            </div>
          )}
          {error && <div className="pf-message-error">{error}</div>}
          <div className="pf-form-actions">
            <button type="button" className="pf-btn pf-btn-ghost" onClick={onClose}>{t('common.cancelar')}</button>
            <button type="submit" className="pf-btn pf-btn-primary">
              <FaCheck /> {metodo ? t('perfil.guardarCambios') : t('perfil.pagos.agregarMetodo')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const PaymentsTab = ({ notify }: { notify: NotifyFn }) => {
  const { t } = useIdioma();
  const [pagos, setPagos] = useState<MetodoPago[]>(getPagos());
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<MetodoPago | null>(null);
  const [eliminando, setEliminando] = useState<MetodoPago | null>(null);

  const persistir = (next: MetodoPago[]) => saveItem(PF_PAGOS_KEY, next);

  const guardar = (data: Omit<MetodoPago, 'id' | 'predeterminado'>) => {
    let next: MetodoPago[];
    if (editando) {
      next = pagos.map((p) => (p.id === editando.id ? { ...editando, ...data } : p));
      notify(t('perfil.pagos.actualizado'), 'success');
    } else {
      const nuevo: MetodoPago = { ...data, id: `pay-${Date.now()}`, predeterminado: pagos.length === 0 };
      next = [...pagos, nuevo];
      notify(t('perfil.pagos.agregado'), 'success');
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
    notify(t('perfil.pagos.eliminado'), 'info');
  };

  const setPredeterminado = (id: string) => {
    const next = pagos.map((p) => ({ ...p, predeterminado: p.id === id }));
    setPagos(next);
    persistir(next);
    notify(t('perfil.pagos.predeterminadoActualizado'), 'success');
  };

  return (
    <div className="pf-tab">
      <SectionHeader
        icon={<FaCreditCard />}
        title={t('perfil.pagos.titulo')}
        subtitle={t('perfil.pagos.subtitulo')}
        action={
          <button type="button" className="pf-btn pf-btn-primary" onClick={() => { setEditando(null); setModalAbierto(true); }}>
            <FaPlus /> {t('perfil.pagos.agregarMetodo')}
          </button>
        }
      />

      {pagos.length === 0 ? (
        <div className="pf-empty">
          <span className="pf-empty-icon"><FaRegCreditCard /></span>
          <p>{t('perfil.pagos.vacio')}</p>
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
                    ? `${t(marcaNombre(pago.numero))} ${formatoNumero(pago.numero)}`
                    : `${t(tipoLabelKey[pago.tipo])} ${pago.numero}`}
                </span>
                <span className="pf-pay-extra">
                  {pago.predeterminado ? (
                    <span className="pf-pay-default">{t('perfil.pagos.predeterminado')}</span>
                  ) : pago.expiracion ? (
                    t('perfil.pagos.vence', { fecha: pago.expiracion })
                  ) : (
                    t('perfil.pagos.sinVencimiento')
                  )}
                </span>
              </div>
              <div className="pf-pay-actions">
                <button
                  type="button"
                  className="pf-icon-btn"
                  title={t('perfil.pagos.establecerPredeterminado')}
                  onClick={() => setPredeterminado(pago.id)}
                >
                  <FaCheck className={pago.predeterminado ? 'on' : ''} />
                </button>
                <button
                  type="button"
                  className="pf-icon-btn"
                  title={t('common.editar')}
                  onClick={() => { setEditando(pago); setModalAbierto(true); }}
                >
                  <FaPencil />
                </button>
                <button
                  type="button"
                  className="pf-icon-btn danger"
                  title={t('common.eliminar')}
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
        <div role="button" tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') (e.currentTarget as HTMLElement).click(); }}  className="pf-modal-backdrop" onClick={() => setEliminando(null)}>
          <div role="button" tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') (e.currentTarget as HTMLElement).click(); }}  className="pf-modal pf-modal-small" onClick={(e) => e.stopPropagation()}>
            <div className="pf-modal-header">
              <h3>{t('perfil.pagos.eliminarTitulo')}</h3>
              <button type="button" className="pf-modal-close" onClick={() => setEliminando(null)} aria-label={t('common.cerrar')}>×</button>
            </div>
            <p className="pf-modal-text">{t('perfil.pagos.eliminarMsg')}</p>
            <div className="pf-form-actions">
              <button type="button" className="pf-btn pf-btn-ghost" onClick={() => setEliminando(null)}>{t('common.cancelar')}</button>
              <button type="button" className="pf-btn pf-btn-danger" onClick={confirmarEliminar}>
                <FaTrashCan /> {t('common.eliminar')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentsTab;