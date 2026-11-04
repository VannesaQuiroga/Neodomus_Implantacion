import { useCallback, useEffect, useRef, useState } from 'react';
import { BOT_INICIAL, responderBot } from '../data/botData';

export interface ChatMsg {
  de: 'bot' | 'usuario';
  texto: string;
}

export const BOT_ERROR = 'No se pudo obtener una respuesta. Intenta de nuevo.';

export const useBotChat = (demoraMs = 450) => {
  const [chats, setChats] = useState<ChatMsg[]>([{ de: 'bot', texto: BOT_INICIAL }]);
  const [input, setInput] = useState('');
  const [escribiendo, setEscribiendo] = useState(false);
  const timerRef = useRef<number | null>(null);
  const enviandoRef = useRef(false);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
    [],
  );

  const enviar = useCallback(
    (texto: string) => {
      const mensaje = texto.trim();
      if (!mensaje || enviandoRef.current) return;

      enviandoRef.current = true;
      setChats((prev) => [...prev, { de: 'usuario', texto: mensaje }]);
      setInput('');
      setEscribiendo(true);

      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        try {
          const respuesta = responderBot(mensaje);
          setChats((prev) => [...prev, { de: 'bot', texto: respuesta }]);
        } catch {
          setChats((prev) => [...prev, { de: 'bot', texto: BOT_ERROR }]);
        } finally {
          enviandoRef.current = false;
          setEscribiendo(false);
        }
      }, demoraMs);
    },
    [demoraMs],
  );

  return { chats, input, setInput, escribiendo, enviar };
};
