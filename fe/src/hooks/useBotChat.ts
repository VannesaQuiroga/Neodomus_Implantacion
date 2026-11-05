import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BOT_AFIRMACION,
  BOT_CONFIRMACION,
  BOT_DESPEDIDA,
  BOT_INICIAL,
  esSaludo,
  responderBot,
} from '../data/botData';

export interface ChatMsg {
  de: 'bot' | 'usuario';
  texto: string;
}

export const BOT_ERROR = 'No se pudo obtener una respuesta. Intenta de nuevo.';

export const useBotChat = (demoraMs = 450) => {
  const [chats, setChats] = useState<ChatMsg[]>([{ de: 'bot', texto: BOT_INICIAL }]);
  const [input, setInput] = useState('');
  const [escribiendo, setEscribiendo] = useState(false);
  const [esperandoConfirmacion, setEsperandoConfirmacion] = useState(false);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(true);
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

  const responderTrasDemora = useCallback(
    (responder: () => void) => {
      setEscribiendo(true);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        try {
          responder();
        } finally {
          enviandoRef.current = false;
          setEscribiendo(false);
        }
      }, demoraMs);
    },
    [demoraMs],
  );

  const enviar = useCallback(
    (texto: string) => {
      const mensaje = texto.trim();
      if (!mensaje || enviandoRef.current) return;

      const esHola = esSaludo(mensaje);
      enviandoRef.current = true;
      setChats((prev) => [...prev, { de: 'usuario', texto: mensaje }]);
      setInput('');
      setEsperandoConfirmacion(false);
      setMostrarSugerencias(false);

      responderTrasDemora(() => {
        if (esHola) {
          setChats([{ de: 'bot', texto: BOT_INICIAL }]);
          setMostrarSugerencias(true);
          return;
        }

        let respuesta: string;
        try {
          respuesta = responderBot(mensaje);
        } catch {
          respuesta = BOT_ERROR;
        }
        setChats((prev) => [
          ...prev,
          { de: 'bot', texto: respuesta },
          { de: 'bot', texto: BOT_CONFIRMACION },
        ]);
        setEsperandoConfirmacion(true);
      });
    },
    [responderTrasDemora],
  );

  const confirmar = useCallback(
    (respuesta: 'si' | 'no') => {
      if (enviandoRef.current) return;

      enviandoRef.current = true;
      setEsperandoConfirmacion(false);
      setMostrarSugerencias(false);
      setChats((prev) => [
        ...prev,
        { de: 'usuario', texto: respuesta === 'si' ? 'Sí' : 'No' },
      ]);

      responderTrasDemora(() => {
        if (respuesta === 'si') {
          setChats((prev) => [...prev, { de: 'bot', texto: BOT_AFIRMACION }]);
          setMostrarSugerencias(true);
        } else {
          setChats((prev) => [...prev, { de: 'bot', texto: BOT_DESPEDIDA }]);
        }
      });
    },
    [responderTrasDemora],
  );

  return {
    chats,
    input,
    setInput,
    escribiendo,
    enviar,
    confirmar,
    esperandoConfirmacion,
    mostrarSugerencias,
  };
};
