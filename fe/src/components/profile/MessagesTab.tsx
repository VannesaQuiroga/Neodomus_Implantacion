// Presenta los mensajes guardados en profileStorage y permite marcarlos como leídos.
import { useState } from 'react';
import {
  FaEnvelopeOpenText, FaArrowLeft, FaBox, FaScrewdriverWrench, FaShield, FaTags,
} from 'react-icons/fa6';
import type { ReactNode } from 'react';
import { getMensajes, saveItem, PF_MENSAJES_KEY, Mensaje } from '@utils/profileStorage';
import SectionHeader from './SectionHeader';

const tipoIcono: Record<Mensaje['tipo'], ReactNode> = {
  pedido: <FaBox />,
  tecnico: <FaScrewdriverWrench />,
  cuenta: <FaShield />,
  promo: <FaTags />,
};

const tipoClase: Record<Mensaje['tipo'], string> = {
  pedido: 'pedido',
  tecnico: 'tecnico',
  cuenta: 'cuenta',
  promo: 'promo',
};

type Filtro = 'todas' | 'noLeidas';

const MessagesTab = ({ onDataChanged }: { onDataChanged: () => void }) => {
  const [mensajes, setMensajes] = useState<Mensaje[]>(getMensajes());
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [seleccionado, setSeleccionado] = useState<Mensaje | null>(null);

  const noLeidas = mensajes.filter((m) => !m.leido).length;
  const visibles = filtro === 'noLeidas' ? mensajes.filter((m) => !m.leido) : mensajes;

  const markRead = (msg: Mensaje) => {
    setSeleccionado(msg);
    if (!msg.leido) {
      const next = mensajes.map((m) => (m.id === msg.id ? { ...m, leido: true } : m));
      setMensajes(next);
      saveItem(PF_MENSAJES_KEY, next);
      onDataChanged();
    }
  };

  const marcarTodas = () => {
    const next = mensajes.map((m) => ({ ...m, leido: true }));
    setMensajes(next);
    saveItem(PF_MENSAJES_KEY, next);
    onDataChanged();
  };

  return (
    <div className="pf-tab">
      <SectionHeader
        icon={<FaEnvelopeOpenText />}
        title="Mis mensajes"
        subtitle="Conversaciones y notificaciones de la plataforma."
        action={
          noLeidas > 0 ? (
            <button type="button" className="pf-btn pf-btn-ghost" onClick={marcarTodas}>
              Marcar todas como leídas
            </button>
          ) : undefined
        }
      />

      {seleccionado ? (
        <div className="pf-msg-detail">
          <div className="pf-msg-detail-head">
            <button type="button" className="pf-btn pf-btn-ghost" onClick={() => setSeleccionado(null)}>
              <FaArrowLeft /> Volver
            </button>
            <span className={`pf-msg-detail-tag ${tipoClase[seleccionado.tipo]}`}>{seleccionado.de}</span>
          </div>
          <h3 className="pf-msg-detail-asunto">{seleccionado.asunto}</h3>
          <span className="pf-msg-detail-fecha">{seleccionado.fecha}</span>
          <p className="pf-msg-detail-cuerpo">{seleccionado.cuerpo}</p>
        </div>
      ) : (
        <>
          <div className="pf-filter-bar">
            <button
              type="button"
              className={`pf-filter-btn ${filtro === 'todas' ? 'active' : ''}`}
              onClick={() => setFiltro('todas')}
            >
              Todas
            </button>
            <button
              type="button"
              className={`pf-filter-btn ${filtro === 'noLeidas' ? 'active' : ''}`}
              onClick={() => setFiltro('noLeidas')}
            >
              No leídas{noLeidas > 0 ? ` (${noLeidas})` : ''}
            </button>
          </div>

          {visibles.length === 0 ? (
            <div className="pf-empty">
              <span className="pf-empty-icon"><FaEnvelopeOpenText /></span>
              <p>{filtro === 'noLeidas' ? 'No tienes mensajes sin leer.' : 'No tienes mensajes todavía.'}</p>
            </div>
          ) : (
            <div className="pf-msg-list">
              {visibles.map((msg) => (
                <button
                  type="button"
                  className={`pf-msg-item ${msg.leido ? '' : 'unread'}`}
                  key={msg.id}
                  onClick={() => markRead(msg)}
                >
                  <span className={`pf-msg-avatar ${tipoClase[msg.tipo]}`}>{tipoIcono[msg.tipo]}</span>
                  <span className="pf-msg-body">
                    <span className="pf-msg-asunto">{msg.asunto}</span>
                    <span className="pf-msg-preview">{msg.preview}</span>
                  </span>
                  <span className="pf-msg-meta">
                    <span className="pf-msg-fecha">{msg.fecha}</span>
                    {!msg.leido && <span className="pf-msg-dot" />}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MessagesTab;