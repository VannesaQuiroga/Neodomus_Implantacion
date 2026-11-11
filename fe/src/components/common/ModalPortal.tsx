// Monta modales directamente en <body> mediante un portal.
// Necesario porque clases del layout (pf-card, pf-tab, etc.) usan
// backdrop-filter/transform, lo que convierte a esos contenedores en
// "containing block" de position:fixed y deja los modales recortados
// dentro de la tarjeta en lugar de cubrir toda la pantalla.
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

const ModalPortal = ({ children }: { children: ReactNode }) =>
  createPortal(children, document.body);

export default ModalPortal;
