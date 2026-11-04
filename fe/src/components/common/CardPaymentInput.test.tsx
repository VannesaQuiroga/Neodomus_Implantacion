import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CardPaymentInput } from './CardPaymentInput';

afterEach(cleanup);
function Form({ field }: { field: 'number' | 'expiry' | 'cvv' }) {
  const [value, setValue] = useState('');
  return <CardPaymentInput aria-label="Dato de pago" field={field} value={value} onValueChange={setValue} />;
}
describe('Entrada real de datos de tarjeta', () => {
  it.each([
    ['number', '4242 4242 4242 4242 999999', '4242424242424242999', 19],
    ['expiry', '12/299999', '12/29', 5],
    ['cvv', '12a345678', '1234', 4],
  ] as const)('limita %s al recibir una entrada larga', (field, input, expected, limit) => {
    render(<Form field={field} />);
    const element = screen.getByLabelText('Dato de pago') as HTMLInputElement;
    fireEvent.change(element, { target: { value: input } });
    expect(element.value).toBe(expected);
    expect(element.maxLength).toBe(limit);
    fireEvent.change(element, { target: { value: '' } });
    expect(element.value).toBe('');
  });
  it('permite editar una fecha parcial y completar MM/AA', () => {
    render(<Form field="expiry" />);
    const element = screen.getByLabelText('Dato de pago') as HTMLInputElement;
    for (const value of ['1', '12', '12/', '12/2', '12/29']) {
      fireEvent.change(element, { target: { value } });
      expect(element.value).toBe(value);
    }
  });
});
