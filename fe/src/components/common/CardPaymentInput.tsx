import type { InputHTMLAttributes } from 'react';

type Field = 'number' | 'expiry' | 'cvv';
interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  field: Field;
  value: string;
  onValueChange: (value: string) => void;
}

// Limitar también el valor recibido cubre pegado y eventos de entrada externos.
// La validez de la tarjeta y de la fecha sigue comprobándose en el servidor.
export function CardPaymentInput({ field, value, onValueChange, ...props }: Props) {
  const maxLength = field === 'number' ? 19 : field === 'expiry' ? 5 : 4;
  return <input {...props} type={field === 'cvv' ? 'password' : 'text'}
    // Sin autoguardado/autocompletado del navegador: al tratar estos campos
    // como datos de tarjeta, Chrome los pinta con fondo claro (autofill).
    autoComplete="off"
    inputMode={field === 'expiry' ? 'text' : 'numeric'} maxLength={maxLength}
    value={value} onChange={(event) => {
      const clean = event.target.value.replace(field === 'expiry' ? /[^\d/]/g : /\D/g, '');
      onValueChange(clean.slice(0, maxLength));
    }} />;
}
