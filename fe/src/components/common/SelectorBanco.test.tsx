// Contrato del SelectorBanco (reutilizado por checkout y pagos de citas):
// la selección vive en el padre (valor controlado) y debe verse claramente
// una vez elegida; el menú lista todos los bancos con scroll interno.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SelectorBanco } from './SelectorBanco';
afterEach(cleanup);

const setUp = (onChange = vi.fn()) => {
  render(
    <SelectorBanco
      bancos={['Bancolombia', 'Banco de Bogotá', 'Banco Davivienda']}
      value=""
      onChange={onChange}
      ariaLabel="Banco"
    />,
  );
  return onChange;
};

describe('SelectorBanco', () => {
  it('muestra el placeholder y lista todos los bancos al abrir', () => {
    setUp();
    const disparador = screen.getByRole('button', { name: 'Banco' });
    expect(disparador.textContent).toContain('Selecciona tu banco');
    fireEvent.click(disparador);
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Bancolombia',
      'Banco de Bogotá',
      'Banco Davivienda',
    ]);
  });

  it('guarda el banco elegido: el disparador muestra la selección y onChange la recibe', () => {
    const onChange = vi.fn();
    render(
      <SelectorBanco
        bancos={['Bancolombia', 'Banco de Bogotá', 'Banco Davivienda']}
        value="Banco de Bogotá"
        onChange={onChange}
        ariaLabel="Banco"
      />,
    );
    expect(screen.getByRole('button', { name: 'Banco' }).textContent).toContain('Banco de Bogotá');
    fireEvent.click(screen.getByRole('button', { name: 'Banco' }));
    fireEvent.click(screen.getByRole('option', { name: 'Bancolombia' }));
    expect(onChange).toHaveBeenCalledWith('Bancolombia');
  });

  it('distingue la opción seleccionada y marca solo esa', () => {
    render(
      <SelectorBanco
        bancos={['Bancolombia', 'Banco Davivienda']}
        value="Bancolombia"
        onChange={vi.fn()}
        ariaLabel="Banco"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Banco' }));
    expect(screen.getByRole('option', { name: 'Bancolombia' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('option', { name: 'Banco Davivienda' }).getAttribute('aria-selected')).toBe('false');
  });

  it('siempre despliega hacia abajo, incluso junto al borde inferior de la pantalla', () => {
    render(
      <SelectorBanco
        bancos={['Bancolombia', 'Banco Davivienda']}
        value=""
        onChange={vi.fn()}
        ariaLabel="Banco"
      />,
    );
    // Simula el disparador pegado al borde inferior (donde un <select> nativo
    // abría hacia arriba y el footer estorbaba).
    const disparador = screen.getByRole('button', { name: 'Banco' });
    vi.spyOn(disparador as HTMLButtonElement, 'getBoundingClientRect').mockReturnValue({
      bottom: 750,
      top: 714,
      left: 100,
      width: 300,
      height: 36,
      right: 400,
      x: 100,
      y: 714,
      toJSON: () => ({}),
    } as DOMRect);
    fireEvent.click(disparador);
    const menu = screen.getByRole('listbox');
    expect(menu.style.top).toBe('756px');     // nace bajo el borde inferior: SIEMPRE abajo
    expect(menu.style.maxHeight).toBe('120px'); // poco espacio: altura mínima con scroll
    expect(menu.style.bottom).toBe('');       // y nunca hacia arriba
  });

  it('la selección sobrevive al cierre por clic-fuera y a reabrir el menú', () => {
    render(
      <SelectorBanco
        bancos={['Bancolombia', 'Banco de Bogotá']}
        value="Bancolombia"
        onChange={vi.fn()}
        ariaLabel="Banco"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Banco' }));
    // Clic fuera del menú (cierre): la selección del padre sigue intacta.
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('option')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Banco' }));
    expect(screen.getByRole('option', { name: /Bancolombia/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('cierra el menú con Escape', () => {
    setUp();
    fireEvent.click(screen.getByRole('button', { name: 'Banco' }));
    expect(screen.getAllByRole('option').length).toBe(3);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('option')).toBeNull();
  });
});
