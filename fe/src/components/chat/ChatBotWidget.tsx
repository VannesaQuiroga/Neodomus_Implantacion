// Componente reutilizable ChatBotWidget para componer la interfaz de Neodomus.
import { useEffect, useRef, useState } from 'react';
import { FaRobot, FaMessage, FaXmark } from 'react-icons/fa6';
import '@styles/chatbot.css';
import { BOT_INICIAL, BOT_SUGERENCIAS, responderBot } from '../../data/botData';

interface ChatMsg {
  de: 'bot' | 'usuario';
  texto: string;
}

// registra escuchas de eventos para sincronizar la vista.
const ChatBotWidget = () => {
  const [abierto, setAbierto] = useState(false);
  const [chats, setChats] = useState<ChatMsg[]>([{ de: 'bot', texto: BOT_INICIAL }]);
  const [input, setInput] = useState('');
  const [escribiendo, setEscribiendo] = useState(false);
  const msgsRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (msgsRef.current) {
      msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
    }
  }, [chats, escribiendo, abierto]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setAbierto(false);
      }
    };
    if (abierto) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [abierto]);

  const enviar = (texto: string) => {
    const mensaje = texto.trim();
    if (!mensaje || escribiendo) return;
    setChats((prev) => [...prev, { de: 'usuario', texto: mensaje }]);
    setInput('');
    setEscribiendo(true);
    window.setTimeout(() => {
      setChats((prev) => [...prev, { de: 'bot', texto: responderBot(mensaje) }]);
      setEscribiendo(false);
    }, 450);
  };

  return (
    <div className="cbw-wrap" ref={panelRef}>
      {abierto && (
        <div className="cbw-panel" role="dialog" aria-label="Asistente virtual Neodomus">
          <div className="cbw-header">
            <span className="cbw-header-avatar"><FaRobot /></span>
            <div className="cbw-header-info">
              <strong>Asistente Neodomus</strong>
              <span className="cbw-header-status">En línea</span>
            </div>
            <button
              type="button"
              className="cbw-close"
              onClick={() => setAbierto(false)}
              aria-label="Cerrar chat"
            >
              <FaXmark />
            </button>
          </div>

          <div className="cbw-msgs" ref={msgsRef}>
            {chats.map((msg, i) => (
              <div key={i} className={`cbw-msg ${msg.de}`}>
                {msg.de === 'bot' && (
                  <span className="cbw-avatar"><FaRobot /></span>
                )}
                <div className="cbw-bubble">{msg.texto}</div>
              </div>
            ))}
            {escribiendo && (
              <div className="cbw-msg bot">
                <span className="cbw-avatar"><FaRobot /></span>
                <div className="cbw-bubble typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
          </div>

          {!escribiendo && chats.length <= 1 && (
            <div className="cbw-sugs">
              {BOT_SUGERENCIAS.map((s) => (
                <button key={s} type="button" className="cbw-sug" onClick={() => enviar(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}

          <div className="cbw-input-row">
            <input
              type="text"
              className="cbw-input"
              placeholder="Escribe tu pregunta..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') enviar(input);
              }}
              aria-label="Escribe tu pregunta"
            />
            <button
              type="button"
              className="cbw-send"
              disabled={escribiendo}
              onClick={() => enviar(input)}
              aria-label="Enviar mensaje"
            >
              <FaMessage />
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className="cbw-fab"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-label={abierto ? 'Cerrar asistente virtual' : 'Abrir asistente virtual'}
        title="Asistente virtual"
      >
        {abierto ? <FaXmark /> : <FaRobot />}
      </button>
    </div>
  );
};

export default ChatBotWidget;