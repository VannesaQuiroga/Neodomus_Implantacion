import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Paginacion } from './Paginacion';

afterEach(cleanup);

const boton = (texto: string) => screen.getByText(texto) as HTMLButtonElement;

describe('Paginacion', () => {
  it('no renderiza si hay una sola página', () => {
    render(<Paginacion page={1} totalPages={1} onPageChange={vi.fn()} />);
    expect(screen.queryByText('Anterior')).toBeNull();
    expect(screen.queryByText('Siguiente')).toBeNull();
  });

  it('llama onPageChange al cambiar de página', () => {
    const onChange = vi.fn();
    render(<Paginacion page={1} totalPages={3} onPageChange={onChange} />);
    expect(boton('Anterior').disabled).toBe(true);
    expect(boton('Siguiente').disabled).toBe(false);

    fireEvent.click(screen.getByLabelText('Ir a la página 3'));
    expect(onChange).toHaveBeenCalledWith(3);

    fireEvent.click(boton('Siguiente'));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('deshabilita siguiente en la última página y marca la activa', () => {
    render(<Paginacion page={3} totalPages={3} onPageChange={vi.fn()} />);
    expect(boton('Siguiente').disabled).toBe(true);
    expect(boton('Anterior').disabled).toBe(false);
    expect(screen.getByLabelText('Ir a la página 3').getAttribute('aria-current')).toBe('page');
  });
});
