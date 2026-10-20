// Agrupa los manejadores que bloquean las acciones de portapapeles en los campos que los utilizan.
import type { ClipboardEvent, KeyboardEvent, MouseEvent } from 'react';

export const bloquearTeclasPortapapeles = (e: KeyboardEvent<HTMLElement>) => {
  if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x'].includes(e.key.toLowerCase())) {
    e.preventDefault();
  }
};

export const bloquearEventoPortapapeles = (
  e: ClipboardEvent<HTMLElement> | MouseEvent<HTMLElement>,
) => {
  e.preventDefault();
};