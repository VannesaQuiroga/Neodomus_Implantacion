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
  const select = screen.getByRole('combobox') as HTMLSelectElement;
  expect([...select.options].map(option => option.value)).toEqual(['0.5', '1', '1.5', '2', '2.5']);
  expect(screen.queryByRole('textbox')).toBeNull();
  fireEvent.change(select, { target: { value: '1.5' } });
  expect(select.value).toBe('1.5');
  expect(screen.getByLabelText('Subtotal').textContent).toBe('1500');
});
it('conserva un corte antiguo sin redondearlo y permite elegir uno nuevo', () => {
  render(<MetrosSelect aria-label="Metros" value={1.55} max={2} onChange={() => {}} />);
  const select = screen.getByRole('combobox') as HTMLSelectElement;
  expect(select.value).toBe('1.55');
  expect(select.selectedOptions[0].disabled).toBe(true);
  expect([...select.options].filter(o => !o.disabled).map(o => o.value)).toEqual(['0.5', '1', '1.5', '2']);
});
it('no permite elegir medidas si hay menos de medio metro', () => {
  render(<MetrosSelect aria-label="Metros" value={1} max={0.4} onChange={() => {}} />);
  expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true);
});
