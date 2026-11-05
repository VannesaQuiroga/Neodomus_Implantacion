import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOT_CONFIRMACION, BOT_DESPEDIDA, responderBot } from '../../data/botData';
import { BOT_ERROR } from '../../hooks/useBotChat';
import ChatBotWidget from './ChatBotWidget';

vi.mock('../../data/botData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/botData')>();
  return { ...actual, responderBot: vi.fn(actual.responderBot) };
});

const responder = vi.mocked(responderBot);

const abrirChat = () => {
  render(<ChatBotWidget />);
  fireEvent.click(screen.getByLabelText('Abrir asistente virtual'));
  return {
    input: screen.getByLabelText('Escribe tu pregunta') as HTMLInputElement,
    send: screen.getByLabelText('Enviar mensaje') as HTMLButtonElement,
  };
};

const responderAhora = () => act(() => vi.advanceTimersByTime(450));

describe('ChatBotWidget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    responder.mockReset();
    responder.mockImplementation((texto) => `respuesta a ${texto}`);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('acepta tres preguntas seguidas por Enter y botón, sin enviar vacíos', () => {
    const { input, send } = abrirChat();

    fireEvent.change(input, { target: { value: 'uno' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    responderAhora();

    fireEvent.change(input, { target: { value: 'dos' } });
    fireEvent.click(send);
    responderAhora();
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(send);
    expect(responder).toHaveBeenCalledTimes(2);

    fireEvent.change(input, { target: { value: 'tres' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    responderAhora();

    expect(responder).toHaveBeenCalledTimes(3);
    expect(responder).toHaveBeenNthCalledWith(1, 'uno');
    expect(responder).toHaveBeenNthCalledWith(2, 'dos');
    expect(responder).toHaveBeenNthCalledWith(3, 'tres');
    expect(screen.getAllByText(/^(uno|dos|tres)$/)).toHaveLength(3);
    expect(screen.getByText('respuesta a tres')).toBeTruthy();
    expect(input.value).toBe('');
    expect(send.disabled).toBe(false);
  });

  it('muestra error y permite preguntar de nuevo', () => {
    const { input, send } = abrirChat();
    responder.mockImplementationOnce(() => {
      throw new Error('fallo simulado');
    });

    fireEvent.change(input, { target: { value: 'falla' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    responderAhora();

    expect(screen.getByText(BOT_ERROR)).toBeTruthy();
    expect(send.disabled).toBe(false);
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: 'recupera' } });
    fireEvent.click(send);
    responderAhora();

    expect(screen.getByText('respuesta a recupera')).toBeTruthy();
    expect(responder).toHaveBeenCalledTimes(2);
    expect(send.disabled).toBe(false);
  });

  it('bloquea doble clic y conserva una sola respuesta pendiente al cerrar y reabrir', () => {
    const { input, send } = abrirChat();

    fireEvent.change(input, { target: { value: 'pendiente' } });
    fireEvent.click(send);
    fireEvent.click(send);

    expect(screen.getAllByText('pendiente')).toHaveLength(1);
    expect(responder).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Cerrar chat'));
    expect(screen.queryByRole('dialog', { name: /Asistente virtual Neodomus/ })).toBeNull();
    fireEvent.click(screen.getByLabelText('Abrir asistente virtual'));
    expect(screen.getByRole('dialog', { name: /Asistente virtual Neodomus/ })).toBeTruthy();

    const inputReabierto = screen.getByLabelText('Escribe tu pregunta') as HTMLInputElement;
    const sendReabierto = screen.getByLabelText('Enviar mensaje') as HTMLButtonElement;
    responderAhora();

    expect(responder).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('respuesta a pendiente')).toHaveLength(1);
    expect(inputReabierto.value).toBe('');
    expect(sendReabierto.disabled).toBe(false);
    expect(document.activeElement).toBe(inputReabierto);
  });

  it('pregunta si puede ayudar, muestra sugerencias y reinicia al saludar', () => {
    const { input, send } = abrirChat();

    fireEvent.change(input, { target: { value: 'uno' } });
    fireEvent.click(send);
    responderAhora();

    expect(screen.getByText(BOT_CONFIRMACION)).toBeTruthy();
    expect(screen.getByText('Sí')).toBeTruthy();
    expect(screen.getByText('No')).toBeTruthy();

    fireEvent.click(screen.getByText('Sí'));
    responderAhora();
    expect(screen.getByText('Preguntas frecuentes:')).toBeTruthy();

    fireEvent.change(input, { target: { value: 'dos' } });
    fireEvent.click(send);
    responderAhora();
    fireEvent.click(screen.getByText('No'));
    responderAhora();

    expect(screen.getByText(BOT_DESPEDIDA)).toBeTruthy();
    expect(screen.queryByText('Preguntas frecuentes:')).toBeNull();

    fireEvent.change(input, { target: { value: 'hola' } });
    fireEvent.click(send);
    responderAhora();

    expect(screen.getByText('Preguntas frecuentes:')).toBeTruthy();
    expect(responder).not.toHaveBeenCalledWith('hola');
  });

  it('cancela la respuesta pendiente al desmontar', () => {
    const { input } = abrirChat();

    fireEvent.change(input, { target: { value: 'cancelar' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    cleanup();
    act(() => vi.advanceTimersByTime(450));

    expect(responder).not.toHaveBeenCalled();
  });
});
