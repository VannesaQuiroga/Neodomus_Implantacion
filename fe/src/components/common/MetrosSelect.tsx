// Selector compacto de metraje: desplegable propio con scroll interno.
// Reemplaza al <select> nativo únicamente en la presentación: un popup de
// altura controlada (240 px) que el navegador no puede agrandar, se despliega
// hacia abajo (o hacia arriba si no hay espacio) y no altera el layout de la
// tarjeta ni su contenedor. Conserva la lógica exacta de opciones (pasos de
// 0,5 m limitados por el stock disponible) y la validación al elegir.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatMetros } from '@utils/metros';

interface Props {
  value: number;
  max: number | null | undefined;
  onChange: (value: number) => void;
  className?: string;
  'aria-label'?: string;
}

export function MetrosSelect({ value, max, onChange, className, ...props }: Props) {
  const pasos = max != null && Number.isFinite(max) ? Math.max(0, Math.floor(max * 2)) : 0;
  const disponible = value > 0 && Number.isInteger(value * 2) && value * 2 <= pasos;
  const opciones = Array.from({ length: pasos }, (_, index) => (index + 1) / 2);

  const [abierto, setAbierto] = useState(false);
  const botonRef = useRef<HTMLButtonElement>(null);
  const contenedorRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null);

  const calcularPosicion = () => {
    const rect = botonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const espacioAbajo = window.innerHeight - rect.bottom - 12;
    const espacioArriba = rect.top - 12;
    // El máxido de altura lo aplica el CSS del menú (240 px con scroll).
    const haciaAbajo = espacioAbajo >= 120 || espacioAbajo >= espacioArriba;
    setPos(
      haciaAbajo
        ? { top: rect.bottom + 6, left: rect.left, width: Math.max(rect.width, 140), }
      : { bottom: window.innerHeight - rect.top + 6, left: rect.left, width: Math.max(rect.width, 140), }
    );
  };

  useLayoutEffect(() => {
    if (!abierto) return;
    calcularPosicion();
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const recalcular = () => calcularPosicion();
    const alAgregarFuera = (e: PointerEvent) => {
      const dentro = contenedorRef.current?.contains(e.target as Node)
        || menuRef.current?.contains(e.target as Node);
      if (!dentro) setAbierto(false);
    };
    const alEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    window.addEventListener('resize', recalcular);
    window.addEventListener('scroll', recalcular, true);
    document.addEventListener('pointerdown', alAgregarFuera);
    document.addEventListener('keydown', alEscape);
    return () => {
      window.removeEventListener('resize', recalcular);
      window.removeEventListener('scroll', recalcular, true);
      document.removeEventListener('pointerdown', alAgregarFuera);
      document.removeEventListener('keydown', alEscape);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const elegir = (metros: number) => {
    if (metros > 0 && Number.isInteger(metros * 2) && metros * 2 <= pasos) {
      onChange(metros);
    }
    setAbierto(false);
  };

  return (
    <span className="metros-select-wrap" ref={contenedorRef}>
      <button
        {...props}
        ref={botonRef}
        type="button"
        className={className ?? 'metros-select'}
        disabled={pasos === 0}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => setAbierto((prev) => !prev)}
      >
        {formatMetros(value)} m
      </button>
      {abierto && createPortal(
        <div
          ref={menuRef}
          className="metros-menu"
          role="listbox"
          style={{
            position: 'fixed',
            top: pos?.top,
            bottom: pos?.bottom,
            left: pos?.left,
            width: pos?.width,
          }}
        >
          {!disponible && (
            <div className="metros-menu-aviso" role="option" aria-selected="false" aria-disabled="true">
              {pasos ? `${formatMetros(value)} m — elige una medida disponible` : 'sin medidas disponibles'}
            </div>
          )}
          {opciones.map((metros) => (
            <button
              key={metros}
              type="button"
              role="option"
              aria-selected={metros === value}
              className={`metros-menu-opcion ${metros === value ? 'seleccionada' : ''}`}
              onClick={() => elegir(metros)}
            >
              {formatMetros(metros)} m
            </button>
          ))}
        </div>,
        document.body,
      )}
    </span>
  );
}
