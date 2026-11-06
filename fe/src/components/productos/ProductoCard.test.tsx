import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CartProvider, useCart } from '@contexts/CartContext';
import { IdiomaProvider } from '@i18n/IdiomaContext';
import ProductoCard, { type ProductoCardData } from './ProductoCard';

vi.mock('@contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: false, user: null, rol: null, loading: false }),
}));

const producto: ProductoCardData = {
  id_producto: 7,
  nombre_producto: 'Panel LED',
  precio_venta_producto: 1000,
  stock_producto: 10,
  tecnicos_requeridos: 0,
  variantes: [
    { id: 71, nombre: 'Rojo', hex: '#f00', precio: 750, stock: 3 },
    { id: 72, nombre: 'Azul', hex: '#00f', precio: 900, stock: 0 },
  ],
};

const SondaCarrito = () => {
  const { items } = useCart();
  return <pre data-testid="carrito">{JSON.stringify(items)}</pre>;
};

const renderCard = () =>
  render(
    <MemoryRouter>
      <IdiomaProvider>
        <CartProvider>
          <ProductoCard producto={producto} />
          <SondaCarrito />
        </CartProvider>
      </IdiomaProvider>
    </MemoryRouter>,
  );

describe('ProductoCard con variantes', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('muestra el precio de la variante disponible y permite cambiar cantidad', () => {
    renderCard();
    expect(screen.getByText('Precio unitario')).toBeTruthy();
    expect(
      screen.getByText(
        (contenido, nodo) =>
          nodo?.className === 'precio-monto' && contenido === `$${(750).toLocaleString()}`,
      ),
    ).toBeTruthy();
    expect(screen.getByText('COP')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: /Azul/i }) as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad' }));
    expect(
      document.querySelector('.subtotal-detalle')?.textContent,
    ).toBe(`Subtotal: 2 u. = $${(1500).toLocaleString()} COP`);
  });

  it('agrega al carrito la variante activa con su precio y stock', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar al carrito' }));

    const items = JSON.parse(screen.getByTestId('carrito').textContent || '[]');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id_producto: 7,
      id_variante: 71,
      color: 'Rojo',
      precio_venta_producto: 750,
      stock_maximo: 3,
      cantidad: 2,
    });
  });
});
