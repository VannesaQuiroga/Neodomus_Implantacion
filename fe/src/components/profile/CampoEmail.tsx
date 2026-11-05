// Campo de correo con controles de edición y verificación del perfil.
import { useEffect, useState } from 'react';
import {
  FaEnvelopeCircleCheck,
  FaPaperPlane,
  FaPen,
  FaRotate,
  FaShieldHalved,
  FaXmark,
} from 'react-icons/fa6';
import api from '@services/api';
import { useIdioma } from '@i18n/IdiomaContext';
import { bloquearTeclasPortapapeles, bloquearEventoPortapapeles } from '@utils/copyPaste';
import type { NotifyFn } from './PersonalTab';

interface CampoEmailProps {
  label: string;
  valor: string;
  emailOriginal: string;
  /** Cuando es true el componente arranca directamente en modo edición
   *  (se usa dentro del formulario "Editar perfil"). */
  modoEdicion?: boolean;
  /** Se llama con el valor del input cada vez que el usuario lo cambia. */
  onCambio?: (nuevo: string) => void;
  onVerificado: (nuevo: string) => void;
  notificar: NotifyFn;
}

const enmascararCorreo = (email: string): string => {
  const limpio = (email || '').trim();
  const [local, dominio] = limpio.split('@');
  if (!dominio) return limpio;
  const visible = local.length <= 3 ? local.slice(0, 1) : local.slice(0, 3);
  return `${visible}****@${dominio}`;
};

const VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const REENVIO_COOLDOWN = 30;

/**
 * Verificación del cambio de correo.
 *
 * Flujo: el usuario escribe el nuevo correo → SOLICITAR CÓDIGO (se envía un
 * código de 6 dígitos al correo actual, SIN ninguna confirmación adicional;
 * la confirmación general "¿Deseas realizar cambios?" ya ocurrió una sola
 * vez al pulsar EDITAR PERFIL) → el usuario ingresa el código → COMPROBAR →
 * el backend valida y aplica el cambio → "Correo verificado".
 *
 * El código nunca se genera en el frontend: lo genera y valida el backend.
 */
const CampoEmail = ({
  label,
  valor,
  emailOriginal,
  modoEdicion,
  onCambio,
  onVerificado,
  notificar,
}: CampoEmailProps) => {
  const { t } = useIdioma();
  const [editando, setEditando] = useState(Boolean(modoEdicion));
  const [borrador, setBorrador] = useState(valor);
  const [solicitando, setSolicitando] = useState(false);
  const [pasoCodigo, setPasoCodigo] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [verificando, setVerificando] = useState(false);
  const [verificado, setVerificado] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  const abrirEdicion = () => {
    setBorrador(valor);
    setEditando(true);
    setPasoCodigo(false);
    setCodigo('');
    setVerificado(false);
  };

  const cancelar = () => {
    setEditando(false);
    setPasoCodigo(false);
    setCodigo('');
    setVerificado(false);
    setCooldown(0);
  };

  const correoDiferente =
    borrador.trim().toLowerCase() !== (emailOriginal || '').trim().toLowerCase();

  // Comunica con el backend mediante POST '/auth/request-email-change'.
  const solicitarCodigo = async () => {
    if (solicitando || cooldown > 0) return;
    const nuevo = borrador.trim();
    if (!VALIDO.test(nuevo)) {
      notificar(t('perfil.emailErrorSolicitar'), 'error');
      return;
    }
    if (!correoDiferente) {
      notificar(t('perfil.emailDebeVerificar'), 'error');
      return;
    }
    setSolicitando(true);
    try {
      await api.post('/auth/request-email-change', { nuevo_email: nuevo });
      setPasoCodigo(true);
      setCodigo('');
      setCooldown(REENVIO_COOLDOWN);
      notificar(t('perfil.emailCodigoEnviado'), 'info');
    } catch (err: any) {
      const msg = err.response?.data?.detail;
      notificar(typeof msg === 'string' ? msg : t('perfil.emailErrorSolicitar'), 'error');
    } finally {
      setSolicitando(false);
    }
  };

  // Comunica con el backend mediante POST '/auth/verify-email-change'.
  const verificarCodigo = async () => {
    if (codigo.length !== 6) {
      notificar(t('perfil.emailCodigo6'), 'error');
      return;
    }
    setVerificando(true);
    try {
      await api.post('/auth/verify-email-change', {
        code: codigo,
        nuevo_email: borrador.trim(),
      });
      setVerificado(true);
      setCooldown(0);
      onVerificado(borrador.trim());
      notificar(t('perfil.emailVerificadoOk'), 'success');
    } catch (err: any) {
      const msg = err.response?.data?.detail;
      if (typeof msg === 'string') {
        notificar(
          msg.includes('expirado') ? t('perfil.codigoExpirado') : t('perfil.codigoIncorrecto'),
          'error',
        );
      } else {
        notificar(t('perfil.emailErrorVerificar'), 'error');
      }
    } finally {
      setVerificando(false);
    }
  };

  const propsPortapapeles = {
    onCopy: bloquearEventoPortapapeles,
    onCut: bloquearEventoPortapapeles,
    onPaste: bloquearEventoPortapapeles,
    onContextMenu: bloquearEventoPortapapeles,
    onKeyDown: bloquearTeclasPortapapeles,
  };

  if (!editando) {
    return (
      <div className="pf-campo">
        <div className="pf-campo-info">
          <span className="pf-campo-label">{label}</span>
          <span className="pf-campo-valor">{valor || '—'}</span>
        </div>
        <div className="pf-campo-acciones">
          <button
            type="button"
            className="pf-btn pf-btn-ghost pf-campo-editar"
            onClick={abrirEdicion}
            aria-label={`${t('perfil.editar')} ${label}`}
          >
            <FaPen /> {t('perfil.editar')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pf-campo">
      <div className="pf-campo-info">
        <span className="pf-campo-label">{label}</span>

        {!pasoCodigo && !verificado && (
          <>
            <input
              className="pf-form-input"
              type="email"
              value={borrador}
              onChange={(e) => {
                setBorrador(e.target.value);
                onCambio?.(e.target.value);
              }}
              autoFocus
              {...propsPortapapeles}
            />
            <span className="pf-campo-hint">{t('perfil.emailCambioHint')}</span>
          </>
        )}

        {pasoCodigo && !verificado && (
          <div className="pf-email-verify">
            <div className="pf-email-verify-head">
              <FaShieldHalved />
              <p>
                {t('perfil.emailCodigoEnviadoA')} <strong>{enmascararCorreo(emailOriginal)}</strong>
              </p>
            </div>
            <div className="pf-email-verify-code">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="pf-form-input"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                aria-label={t('perfil.emailCodigoLabel')}
                {...propsPortapapeles}
              />
              <button
                type="button"
                className="pf-btn pf-btn-primary"
                onClick={verificarCodigo}
                disabled={verificando}
              >
                {verificando ? t('perfil.emailVerificando') : t('perfil.verificarCodigo')}
              </button>
            </div>
            <div className="pf-email-verify-reenvio">
              <span>{t('perfil.noRecibisteCodigo')}</span>
              <button
                type="button"
                className="pf-btn pf-btn-ghost"
                onClick={solicitarCodigo}
                disabled={solicitando || cooldown > 0}
              >
                <FaRotate />{' '}
                {solicitando
                  ? t('perfil.emailEnviando')
                  : cooldown > 0
                    ? `${t('perfil.reenviarCodigo')} (${cooldown}s)`
                    : t('perfil.reenviarCodigo')}
              </button>
            </div>
            <button
              type="button"
              className="pf-btn pf-btn-ghost"
              onClick={() => {
                setPasoCodigo(false);
                setCooldown(0);
              }}
              disabled={solicitando || verificando}
              style={{ alignSelf: 'flex-start' }}
            >
              <FaPen /> {t('perfil.emailEditarCorreo')}
            </button>
          </div>
        )}

        {verificado && (
          <p className="pf-email-verify-ok">
            <FaEnvelopeCircleCheck /> {t('perfil.identidadVerificada')} —{' '}
            {t('perfil.identidadVerificadaMsg')}
          </p>
        )}
      </div>

      <div className="pf-campo-acciones">
        {!pasoCodigo && !verificado && correoDiferente && (
          <button
            type="button"
            className="pf-btn pf-btn-primary"
            onClick={solicitarCodigo}
            disabled={solicitando}
          >
            <FaPaperPlane />{' '}
            {solicitando ? t('perfil.emailEnviando') : t('perfil.emailSolicitarCodigo')}
          </button>
        )}
        {verificado && (
          <button type="button" className="pf-btn pf-btn-primary" onClick={() => setEditando(false)}>
            {t('perfil.aceptar')}
          </button>
        )}
        <button
          type="button"
          className="pf-btn pf-btn-ghost"
          onClick={cancelar}
          disabled={solicitando || verificando}
        >
          <FaXmark /> {t('perfil.cancelar')}
        </button>
      </div>
    </div>
  );
};

export default CampoEmail;
