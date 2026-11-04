import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AvatarFoto } from './AvatarFoto';

afterEach(cleanup);

describe('AvatarFoto', () => {
  it('muestra iniciales sin foto', () => {
    render(<AvatarFoto src={null} iniciales="JC" />);
    expect(screen.getByText('JC')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('muestra la imagen cuando hay src', () => {
    render(<AvatarFoto src="http://x/perfil.png" iniciales="JC" alt="Técnico" />);
    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('http://x/perfil.png');
    expect(screen.getByText('JC')).toBeTruthy();
  });

  it('cae a iniciales si la imagen falla', () => {
    render(<AvatarFoto src="http://x/rota.png" iniciales="JC" alt="Técnico" />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('JC')).toBeTruthy();
  });

  it('se recupera al recibir una URL nueva tras un fallo', () => {
    const { rerender } = render(<AvatarFoto src="http://x/rota.png" iniciales="JC" alt="Técnico" />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).toBeNull();

    rerender(<AvatarFoto src="http://x/nueva.png" iniciales="JC" alt="Técnico" />);
    expect((screen.getByRole('img') as HTMLImageElement).getAttribute('src')).toBe('http://x/nueva.png');
  });
});
