// Componente reutilizable EspecializacionesSelect para componer la interfaz de Neodomus.
import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { FaChevronDown, FaXmark, FaCheck } from 'react-icons/fa6';
import type { Especializacion } from '../../types';

interface Props {
  catalogo: Especializacion[];
  value: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
}

// registra escuchas de eventos para sincronizar la vista.
const EspecializacionesSelect = ({ catalogo, value, onChange, disabled }: Props) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

  const seleccionadas = catalogo.filter(e => value.includes(e.id_especializacion));

  const toggle = (id: number) => {
    if (value.includes(id)) {
      onChange(value.filter(v => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  const remove = (id: number) => {
    onChange(value.filter(v => v !== id));
  };

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const spaceBelow = viewportH - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const preferBelow = spaceBelow >= 220 || spaceBelow >= spaceAbove;
    const maxHeight = preferBelow ? Math.min(268, Math.max(160, spaceBelow)) : Math.min(268, Math.max(160, spaceAbove));
    const top = preferBelow ? rect.bottom + 8 : Math.max(8, rect.top - maxHeight - 8);
    setPos({ top, left: rect.left, width: rect.width, maxHeight });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, catalogo.length]);

  useEffect(() => {
    if (!open) return;
    const handleReposition = () => updatePosition();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      const insideTrigger = containerRef.current?.contains(target);
      const insideDropdown = dropdownRef.current?.contains(target);
      if (insideTrigger || insideDropdown) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    if (open) {
      document.addEventListener('pointerdown', onPointerDown);
      document.addEventListener('keydown', onEsc);
    }
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="esp-select">
      <button
        ref={triggerRef}
        type="button"
        className={`esp-select-trigger ${open ? 'open' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={() => !disabled && setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
      >
        <span className="esp-select-placeholder">
          {seleccionadas.length === 0
            ? 'Seleccionar especializaciones'
            : `${seleccionadas.length} seleccionada${seleccionadas.length > 1 ? 's' : ''}`}
        </span>
        <span className={`esp-select-chevron ${open ? 'open' : ''}`}>
          <FaChevronDown />
        </span>
      </button>

      {open && pos && createPortal(
        <div
          ref={dropdownRef}
          className="esp-select-dropdown"
          role="listbox"
          aria-multiselectable="true"
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: pos.width,
            maxHeight: pos.maxHeight,
          }}
          onWheel={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {catalogo.length === 0 ? (
            <div className="esp-select-empty">No hay especializaciones disponibles</div>
          ) : (
            catalogo.map(esp => {
              const activa = value.includes(esp.id_especializacion);
              return (
                <button
                  key={esp.id_especializacion}
                  type="button"
                  role="option"
                  aria-selected={activa}
                  className={`esp-select-option ${activa ? 'activa' : ''} ${!esp.activa ? 'inactiva' : ''}`}
                  onClick={() => toggle(esp.id_especializacion)}
                  title={esp.descripcion || esp.nombre}
                >
                  <span className={`esp-select-checkbox ${activa ? 'checked' : ''}`}>
                    {activa && <FaCheck />}
                  </span>
                  <span className="esp-select-option-text">
                    <span className="esp-select-option-nombre">{esp.nombre}</span>
                    {esp.descripcion && <span className="esp-select-option-desc">{esp.descripcion}</span>}
                  </span>
                  {!esp.activa && <span className="esp-select-inactiva">Inactiva</span>}
                </button>
              );
            })
          )}
        </div>,
        document.body
      )}

      {seleccionadas.length > 0 && (
        <div className="esp-select-chips">
          {seleccionadas.map(esp => (
            <span key={esp.id_especializacion} className="esp-select-chip">
              {esp.nombre}
              <button
                type="button"
                className="esp-select-chip-remove"
                onClick={() => remove(esp.id_especializacion)}
                aria-label={`Quitar ${esp.nombre}`}
              >
                <FaXmark />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default EspecializacionesSelect;
