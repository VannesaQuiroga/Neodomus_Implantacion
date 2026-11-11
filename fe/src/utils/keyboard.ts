// Agrupa los manejadores de teclado compartidos por la interfaz.
// Evita que la pulsación de ENTER o ESPACIO dentro de un campo de texto
// (textarea, input, select) dispare acciones de contenedores externos,
// como el cierre de un modal o la activación de una tarjeta.
import type { KeyboardEvent } from 'react';

// Indica si el evento de teclado se originó en un control de formulario editable.
const esControlFormulario = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.tagName === 'TEXTAREA' ||
    target.tagName === 'INPUT' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable);

// Activación accesible de contenedores con role="button" que no son botones
// reales (tarjetas, enlaces compuestos, etc.). Reproduce el comportamiento de
// un <button>: Enter o Espacio ejecutan la acción y Espacio no hace scroll.
// Si el foco está dentro de un campo de formulario, la pulsación se ignora
// para no interrumpir la escritura (por ejemplo, un salto de línea en un textarea).
export const activarConTeclado = (e: KeyboardEvent<HTMLElement>) => {
  if (esControlFormulario(e.target)) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    (e.currentTarget as HTMLElement).click();
  }
};

// Detiene la propagación de las teclas de activación cuando el foco está en
// un campo de formulario dentro de un contenedor con manejadores de teclado
// (por ejemplo, un modal). Así el ENTER inserta el salto de línea y el
// contenido escrito no se pierde ni se envía por accidente.
export const detenerTeclasFormulario = (e: KeyboardEvent<HTMLElement>) => {
  if (esControlFormulario(e.target)) e.stopPropagation();
};
