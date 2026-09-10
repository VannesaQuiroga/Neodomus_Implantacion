import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaXmark,
  FaPlus,
  FaCamera,
  FaTrash,
  FaPaperPlane,
  FaArrowRight,
  FaArrowLeft,
  FaFileInvoice,
  FaCalendarCheck,
  FaBoxOpen,
  FaUser,
} from 'react-icons/fa6';
import '@styles/admin-panel.css';
import '@styles/dashboard-admin.css';
import api from '@services/api';

const TIPOS_NOVEDAD = [
  'Retraso en entrega',
  'Cliente ausente',
  'Cliente no recibió el pedido',
  'Dirección incorrecta',
  'Producto dañado',
  'Producto faltante',
  'Producto equivocado',
  'Pérdida de producto',
  'Robo de productos',
  'Accidente',
  'Problema con el vehículo/transporte',
  'Problema técnico',
  'Problema durante una cita',
  'Cita no realizada',
  'Cita reprogramada',
  'Cliente solicita reprogramación',
  'Problema con instalación',
  'Retraso que afecta cita',
  'Otro',
];

const TIPOS_DEVOLUCION = [
  'Producto recibido con daños',
  'Producto incompleto',
  'Cliente no tenía el producto disponible',
  'Producto diferente al solicitado',
  'Devolución no realizada',
  'Problema durante la recogida',
  'Otro',
];

const PRIORIDADES = [
  { valor: 'baja', label: 'Baja', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', bgActive: 'rgba(148,163,184,0.25)' },
  { valor: 'normal', label: 'Normal', color: '#d4a54b', bg: 'rgba(212,165,75,0.12)', bgActive: 'rgba(212,165,75,0.25)' },
  { valor: 'alta', label: 'Alta', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', bgActive: 'rgba(245,158,11,0.25)' },
  { valor: 'urgente', label: 'Urgente', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', bgActive: 'rgba(239,68,68,0.25)' },
];

interface NuevaNovedadModalProps {
  abierto: boolean;
  onCerrar: () => void;
  onCreado: () => void;
  tipoOrigen: 'pedido' | 'cita' | 'devolucion';
  idPedido?: number;
  idCita?: number;
  idDevolucion?: number;
  idCliente?: number;
  nombreCliente?: string;
  referenciaLabel?: string;
}

type PasoFormulario = 'detalle' | 'evidencia';

const NuevaNovedadModal = ({
  abierto,
  onCerrar,
  onCreado,
  tipoOrigen,
  idPedido,
  idCita,
  idDevolucion,
  idCliente,
  nombreCliente,
  referenciaLabel,
}: NuevaNovedadModalProps) => {
  const [paso, setPaso] = useState<PasoFormulario>('detalle');
  const [tipoSeleccion, setTipoSeleccion] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [prioridad, setPrioridad] = useState('normal');
  const [lugar, setLugar] = useState('');
  const [evidenciaPreview, setEvidenciaPreview] = useState<string | null>(null);
  const [evidenciaFile, setEvidenciaFile] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const resetForm = () => {
    setPaso('detalle');
    setTipoSeleccion('');
    setDescripcion('');
    setPrioridad('normal');
    setLugar('');
    setEvidenciaFile(null);
    setEvidenciaPreview(null);
    setToast(null);
  };

  const cerrar = () => {
    resetForm();
    onCerrar();
  };

  const onEvidenciaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setToast({ msg: 'La imagen no puede superar 5 MB', tipo: 'err' });
      return;
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      setToast({ msg: 'Formato no permitido (JPG, PNG, WEBP o GIF)', tipo: 'err' });
      return;
    }
    setEvidenciaFile(file);
    setEvidenciaPreview(URL.createObjectURL(file));
  };

  const eliminarEvidencia = () => {
    setEvidenciaFile(null);
    if (evidenciaPreview) URL.revokeObjectURL(evidenciaPreview);
    setEvidenciaPreview(null);
  };

  const tiposDisponibles = tipoOrigen === 'devolucion' ? TIPOS_DEVOLUCION : TIPOS_NOVEDAD;
  const canSubmit = tipoSeleccion && descripcion.trim();

  const enviarNovedad = async () => {
    if (!tipoSeleccion || !descripcion.trim()) {
      setToast({ msg: 'Completa el tipo y la descripcion', tipo: 'err' });
      return;
    }

    setEnviando(true);
    try {
      const payload: Record<string, unknown> = {
        tipo_novedad: tipoSeleccion,
        descripcion: descripcion.trim(),
        prioridad,
        id_pedido: idPedido ?? null,
        id_cita: idCita ?? null,
        id_cliente: idCliente ?? null,
        id_devolucion: idDevolucion ?? null,
        lugar_ocurrencia: lugar.trim() || undefined,
      };

      const res = await api.post<{ id_novedad: number; mensaje: string }>('/novedades', payload);

      if (evidenciaFile && res.data.id_novedad) {
        const formData = new FormData();
        formData.append('file', evidenciaFile);
        try {
          await api.post(`/novedades/${res.data.id_novedad}/evidencia`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch {
          setToast({ msg: 'Novedad creada pero error al subir evidencia', tipo: 'err' });
        }
      }

      setToast({ msg: 'Novedad registrada correctamente', tipo: 'ok' });
      setTimeout(() => {
        resetForm();
        onCreado();
        onCerrar();
      }, 1000);
    } catch (err: any) {
      setToast({ msg: err?.response?.data?.detail || 'Error al crear novedad', tipo: 'err' });
    } finally {
      setEnviando(false);
    }
  };

  if (!abierto) return null;

  const iconOrigen = tipoOrigen === 'pedido' ? <FaFileInvoice /> : tipoOrigen === 'cita' ? <FaCalendarCheck /> : <FaBoxOpen />;
  const labelOrigen = tipoOrigen === 'pedido' ? 'Pedido' : tipoOrigen === 'cita' ? 'Cita' : 'Devolucion';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="ap-modal-overlay"
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.92, opacity: 0 }}
          transition={{ type: 'spring', duration: 0.35 }}
          className="ap-modal ap-modal-panel"
          style={{ maxWidth: 560 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="ap-modal-head">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
              <FaPlus style={{ color: '#d4a54b' }} />
              <span style={{ color: '#d4a54b' }}>Agregar novedad</span>
            </h3>
            <button type="button" className="ap-modal-x" onClick={cerrar}>
              <FaXmark />
            </button>
          </div>

          {/* Toast */}
          <AnimatePresence>
            {toast && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`ap-toast ${toast.tipo}`}
                style={{ margin: '10px 16px' }}
              >
                {toast.msg}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Step indicators */}
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', padding: '14px 0' }}>
            {(['detalle', 'evidencia'] as PasoFormulario[]).map((p, i) => {
              const currentIdx = ['detalle', 'evidencia'].indexOf(paso);
              const isActive = p === paso;
              const isDone = i < currentIdx;
              return (
                <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isActive ? '#d4a54b' : isDone ? 'rgba(212,165,75,0.3)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${isActive ? '#d4a54b' : isDone ? '#d4a54b' : 'rgba(255,255,255,0.12)'}`,
                    fontSize: '0.72rem', fontWeight: 700, color: isActive || isDone ? '#000' : '#555',
                  }}>
                    {i + 1}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: isActive ? '#d4a54b' : '#666', fontWeight: isActive ? 600 : 400 }}>
                    {p === 'detalle' ? 'Detalle' : 'Evidencia'}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="ap-modal-body" style={{ padding: '0 16px 16px' }}>
            {/* Origin summary */}
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 8, padding: '8px 12px',
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 8, marginBottom: 14, fontSize: '0.82rem',
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#d4a54b' }}>
                {iconOrigen} {labelOrigen} {referenciaLabel || ''}
              </span>
              {nombreCliente && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#8f8f8f' }}>
                  <FaUser style={{ fontSize: '0.7rem' }} /> {nombreCliente}
                </span>
              )}
            </div>

            {/* PASO 1: Detalle */}
            {paso === 'detalle' && (
              <div>
                <div className="ap-form-grid" style={{ marginBottom: 14 }}>
                  <div className="ap-form-group">
                    <label className="ap-form-label">Tipo de novedad *</label>
                    <select
                      className="ap-form-select"
                      value={tipoSeleccion}
                      onChange={(e) => setTipoSeleccion(e.target.value)}
                    >
                      <option value="">Seleccionar tipo...</option>
                      {tiposDisponibles.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <div className="ap-form-group">
                    <label className="ap-form-label">Prioridad</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {PRIORIDADES.map((p) => (
                        <button
                          key={p.valor}
                          type="button"
                          className="ap-btn"
                          style={{
                            background: prioridad === p.valor ? p.bgActive : p.bg,
                            color: prioridad === p.valor ? p.color : '#8a8a8a',
                            border: `1px solid ${prioridad === p.valor ? p.color : 'rgba(255,255,255,0.1)'}`,
                            fontSize: '0.78rem',
                            padding: '6px 14px',
                            borderRadius: 8,
                            fontWeight: prioridad === p.valor ? 700 : 500,
                            transition: 'all 0.18s ease',
                          }}
                          onClick={() => setPrioridad(p.valor)}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="ap-form-group full">
                    <label className="ap-form-label">Lugar de ocurrencia</label>
                    <input
                      type="text"
                      className="ap-form-input"
                      placeholder="Ej: Av. Principal #123"
                      value={lugar}
                      onChange={(e) => setLugar(e.target.value)}
                    />
                  </div>
                </div>

                <div className="ap-form-group" style={{ marginBottom: 14 }}>
                  <label className="ap-form-label">Descripcion *</label>
                  <textarea
                    className="ap-form-textarea"
                    rows={3}
                    placeholder="Describe la situacion detalladamente..."
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" className="ap-btn ap-btn-ghost" onClick={cerrar}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="ap-btn ap-btn-primary"
                    disabled={!tipoSeleccion || !descripcion.trim()}
                    onClick={() => setPaso('evidencia')}
                  >
                    Siguiente <FaArrowRight />
                  </button>
                </div>
              </div>
            )}

            {/* PASO 2: Evidencia */}
            {paso === 'evidencia' && (
              <div>
                <label className="ap-form-label">Evidencia de la novedad</label>
                <p style={{ fontSize: '0.78rem', color: '#8f8f8f', margin: '0 0 14px' }}>Opcional: adjunta una foto como evidencia</p>

                {evidenciaPreview ? (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{
                      position: 'relative', borderRadius: 10, overflow: 'hidden',
                      border: '1px solid rgba(255,255,255,0.1)', maxHeight: 220,
                    }}>
                      <img src={evidenciaPreview} alt="Evidencia" style={{ width: '100%', maxHeight: 220, objectFit: 'cover' }} />
                      <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        display: 'flex', justifyContent: 'center', gap: 10, padding: 8,
                        background: 'rgba(0,0,0,0.7)',
                      }}>
                        <label className="ap-btn ap-btn-ghost" style={{ fontSize: '0.78rem', padding: '6px 12px', cursor: 'pointer' }}>
                          <FaCamera /> Cambiar
                          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onEvidenciaChange} />
                        </label>
                        <button type="button" className="ap-btn" style={{ fontSize: '0.78rem', padding: '6px 12px', background: 'rgba(239,68,68,0.8)', color: '#fff', border: 'none' }} onClick={eliminarEvidencia}>
                          <FaTrash /> Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                    <label style={{
                      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                      padding: '24px 16px', background: 'rgba(255,255,255,0.02)',
                      border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 12, cursor: 'pointer',
                    }}>
                      <div style={{
                        width: 48, height: 48, borderRadius: '50%', background: 'rgba(212,165,75,0.12)',
                        border: '1px solid rgba(212,165,75,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginBottom: 8,
                      }}>
                        <FaCamera style={{ color: '#d4a54b', fontSize: '1.1rem' }} />
                      </div>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#e6e6e6' }}>Subir foto</span>
                      <span style={{ fontSize: '0.75rem', color: '#8f8f8f', marginTop: 2 }}>JPG, PNG, WEBP (max 5MB)</span>
                      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }} onChange={onEvidenciaChange} />
                    </label>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                  <button type="button" className="ap-btn ap-btn-ghost" onClick={() => setPaso('detalle')}>
                    <FaArrowLeft /> Atras
                  </button>
                  <button
                    type="button"
                    className="ap-btn ap-btn-primary"
                    disabled={enviando || !canSubmit}
                    onClick={enviarNovedad}
                  >
                    <FaPaperPlane />
                    {enviando ? 'Enviando...' : 'Guardar novedad'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default NuevaNovedadModal;
