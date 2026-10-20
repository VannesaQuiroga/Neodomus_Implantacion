// Componente reutilizable ConfirmDialog para componer la interfaz de Neodomus.
import { FaXmark } from 'react-icons/fa6';
import { useIdioma } from '@i18n/IdiomaContext';
import '@styles/admin-panel.css';

interface ConfirmDialogProps {
  abierto: boolean;
  mensaje: string;
  titulo?: string;
  aceptando?: boolean;
  labelAceptar?: string;
  labelCancelar?: string;
  onCancelar: () => void;
  onAceptar: () => void;
}

const ConfirmDialog = ({
  abierto,
  mensaje,
  titulo,
  aceptando,
  labelAceptar,
  labelCancelar,
  onCancelar,
  onAceptar,
}: ConfirmDialogProps) => {
  const { t } = useIdioma();
  if (!abierto) return null;

  return (
    <div className="ap-modal-overlay" role="dialog" aria-modal="true">
      <div className="ap-modal">
        <div className="ap-modal-head">
          <h3>{titulo || t('perfil.confirmarCambiosTitulo')}</h3>
          <button
            type="button"
            className="ap-modal-x"
            onClick={onCancelar}
            disabled={aceptando}
            aria-label={t('perfil.cancelar')}
          >
            <FaXmark />
          </button>
        </div>
        <p>{mensaje}</p>
        <div className="ap-modal-actions">
          <button
            type="button"
            className="ap-btn ap-btn-ghost"
            onClick={onCancelar}
            disabled={aceptando}
          >
            {labelCancelar || t('perfil.cancelar')}
          </button>
          <button
            type="button"
            className="ap-btn ap-btn-primary"
            onClick={onAceptar}
            disabled={aceptando}
          >
            {aceptando ? t('perfil.guardando') : labelAceptar || t('perfil.aceptar')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;