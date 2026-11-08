// Selector de bancos (PSE) reutilizable por el checkout de productos y el
// pago de citas. Este control vive en un portal (position: fixed) y SIEMPRE
// despliega hacia abajo: puede flotar sobre el footer sin ocultarlo ni
// deformar el layout; cuando el espacio es poco, la lista se reduce y se
// recorre con su scroll interno. La selección vive en el PADRE (valor
// controlado): aquí solo se comunica el banco elegido por onChange, y el clic
// sobre una opción no puede cortarse por el cierre de clic-fuera.
import { useLayoutEffect, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaCheck } from 'react-icons/fa6';
// Sus estilos viajan con el componente: garantizados en cualquier módulo
// que lo use, sin depender de hojas globales.
import './SelectorBanco.css';

interface SelectorBancoProps {
  id?: string;
  bancos: string[];
  value: string;
  onChange: (banco: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  classNameTrigger?: string;
  classNameMenu?: string;
}

const ALTURA_MAXIMA_MENU = 240;

function posicionMenu(rect: DOMRect) {
  // SIEMPRE hacia abajo. Altura mínima 120 px: aunque falte espacio el menú
  // mantiene su scroll interno y todos los bancos alcanzan mediante scroll.
  const espacioAbajo = window.innerHeight - rect.bottom - 12;
  return {
    top: rect.bottom + 6,
    left: rect.left,
    width: Math.max(rect.width, 260),
    altura: Math.max(120, Math.min(ALTURA_MAXIMA_MENU, espacioAbajo)),
  };
}

export function SelectorBanco({
  id,
  bancos,
  value,
  onChange,
  placeholder = 'Selecciona tu banco',
  ariaLabel = 'Banco',
  classNameTrigger = '',
  classNameMenu = '',
}: SelectorBancoProps) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; altura: number } | null>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const contenedorRef = useRef<HTMLSpanElement>(null);

  // Posición síncrona ANTES del primer paint: el menú jamás se pinta un
  // instante al final del body (junto al footer) ni con coordenadas nulas.
  useLayoutEffect(() => {
    if (!abierto) return;
    const rect = botonRef.current?.getBoundingClientRect();
    if (rect) setPos(posicionMenu(rect));
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const calcular = () => {
      const rect = botonRef.current?.getBoundingClientRect();
      if (rect) setPos(posicionMenu(rect));
    };
    const recalcular = () => calcular();
    const alClicFuera = (e: PointerEvent) => {
      const objetivo = e.target as Node;
      const dentro = contenedorRef.current?.contains(objetivo) || menuRef.current?.contains(objetivo);
      if (!dentro) setAbierto(false);
    };
    const alEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    window.addEventListener('resize', recalcular);
    window.addEventListener('scroll', recalcular, true);
    document.addEventListener('pointerdown', alClicFuera);
    document.addEventListener('keydown', alEscape);
    return () => {
      window.removeEventListener('resize', recalcular);
      window.removeEventListener('scroll', recalcular, true);
      document.removeEventListener('pointerdown', alClicFuera);
      document.removeEventListener('keydown', alEscape);
    };
  }, [abierto]);

  return (
    <span ref={contenedorRef}>
      <button
        type="button"
        ref={botonRef}
        id={id}
        className={`${classNameTrigger} ${value ? 'con-valor' : ''}`}
        onClick={() => setAbierto((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label={ariaLabel}
      >
        {value
          ? <span>{value}</span>
          : <span className="selector-banco-placeholder">{placeholder}</span>}
      </button>
      {abierto && createPortal(
        <ul
          ref={menuRef}
          className={`selector-banco-menu ${classNameMenu}`}
          role="listbox"
          aria-label={ariaLabel}
          style={{
            position: 'fixed',
            top: pos?.top,
            left: pos?.left,
            width: pos?.width,
            maxHeight: pos?.altura,
          }}
        >
          {bancos.map((banco) => (
            <li key={banco}>
              <button
                type="button"
                role="option"
                aria-selected={banco === value}
                // Elección a prueba del cierre por clic-fuera: el pointerdown
                // de la opción no deve llegar al listener del documento.
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  onChange(banco);
                  setAbierto(false);
                }}
              >
                <span>{banco}</span>
                {banco === value && <FaCheck aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </span>
  );
}

export default SelectorBanco;
