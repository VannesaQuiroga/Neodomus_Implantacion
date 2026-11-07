// Escenarios del selector compacto de metraje (mismo contrato que el antiguo
// <select> nativo: medios metros limitados por el stock, un corte antiguo se
// conserva sin redondear y bloqueo total cuando no hay medidas disponibles).
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { MetrosSelect } from './MetrosSelect';
afterEach(cleanup);

function Product() {
  const [metros, setMetros] = useState(1);
  return <><MetrosSelect aria-label="Metros" value={metros} max={2.75} onChange={setMetros} />
    <output aria-label="Subtotal">{metros * 1000}</output></>;
}

it('ofrece medios metros hasta el stock y actualiza el subtotal al seleccionar', () => {
  render(<Product />);
  fireEvent.click(screen.getByRole('button', { name: 'Metros' }));
  expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual([
    '0.5 m', '1 m', '1.5 m', '2 m', '2.5 m',
  ]);
  fireEvent.click(screen.getByRole('option', { name: '1.5 m' }));
  expect(screen.getByLabelText('Subtotal').textContent).toBe('1500');
});

it('conserva un corte antiguo sin redondearlo y permite elegir uno nuevo', () => {
  render(<MetrosSelect aria-label="Metros" value={1.55} max={2} onChange={() => {}} />);
  const disparador = screen.getByRole('button', { name: 'Metros' });
  // El corte antiguo sigue mostrándose tal cual (sin redondeo silencioso).
  expect(disparador.textContent).toContain('1.55');
  fireEvent.click(disparador);
  expect(screen.getByRole('option', { name: /elige una medida disponible/i })).toBeTruthy();
  expect(
    screen.getAllByRole('option').filter(o => o.getAttribute('aria-disabled') !== 'true').map(o => o.textContent),
  ).toEqual(['0.5 m', '1 m', '1.5 m', '2 m']);
});

it('no permite elegir medidas si hay menos de medio metro', () => {
  render(<MetrosSelect aria-label="Metros" value={1} max={0.4} onChange={() => {}} />);
  expect((screen.getByRole('button', { name: 'Metros' }) as HTMLButtonElement).disabled).toBe(true);
});
