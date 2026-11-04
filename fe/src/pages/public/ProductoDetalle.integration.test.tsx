import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, Link } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdiomaProvider } from '@i18n/IdiomaContext';
import { CartProvider } from '@contexts/CartContext';
import api from '@services/api';
import ProductoDetalle from './ProductoDetalle';
import CarritoPage from './CarritoPage';
import CheckoutPage from './CheckoutPage';

vi.mock('@contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    rol: 'cliente',
    user: { id: 1, correo: 'cliente@test.patito' },
    loading: false,
  }),
}));

vi.mock('@components/productos/ProductoCard', () => ({
  default: ({ producto }: { producto: { nombre_producto: string } }) => (
    <div data-testid="sugerido">{producto.nombre_producto}</div>
  ),
}));

vi.mock('@services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const productoVariantes = {
  id_producto: 7,
  nombre_producto: 'Panel LED',
  precio_venta_producto: 1000,
  imagen_url: '/productos/7.jpg',
  venta_por_metros: false,
  stock_producto: 10,
  colores_producto: 'Rojo',
  id_cate_pr: 1,
  tecnicos_requeridos: 0,
  variantes: [
    { id: 71, nombre: 'Rojo', hex: '#f00', precio: 750, stock: 4 },
    { id: 72, nombre: 'Azul', hex: '#00f', precio: 900, stock: 0 },
  ],
};

const productoMetros = {
  id_producto: 1,
  nombre_producto: 'Tubería PVC',
  precio_venta_producto: 1000,
  imagen_url: '/productos/1.jpg',
  venta_por_metros: true,
  stock_producto: 20,
  id_cate_pr: 1,
  tecnicos_requeridos: 0,
  variantes: [],
};

const renderFlujo = (ruta: string) =>
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <IdiomaProvider>
        <CartProvider>
          <Link to="/carrito">Abrir carrito</Link>
          <Routes>
            <Route path="/producto/:id" element={<ProductoDetalle />} />
            <Route path="/carrito" element={<CarritoPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
          </Routes>
        </CartProvider>
      </IdiomaProvider>
    </MemoryRouter>,
  );

const productoPorId = (url: string) => {
  if (url === '/productos/7') return productoVariantes;
  if (url === '/productos/1') return productoMetros;
  return null;
};

const irAlCheckoutYRegistrarPedido = async () => {
  fireEvent.click(screen.getByRole('link', { name: 'Abrir carrito' }));
  await screen.findByRole('heading', { name: 'Mi carrito' });
  fireEvent.click(screen.getByRole('button', { name: 'Finalizar compra' }));
  await screen.findByRole('heading', { name: 'Finalizar compra' });

  fireEvent.click(screen.getByRole('button', { name: /Punto de pago/ }));
  const puntoPago = screen
    .getAllByRole('combobox')
    .find((el) => Array.from((el as HTMLSelectElement).options).some((o) => o.value === 'Efecty')) as
    | HTMLSelectElement
    | undefined;
  if (!puntoPago) throw new Error('selector de punto de pago no encontrado');
  fireEvent.change(puntoPago, { target: { value: 'Efecty' } });
  fireEvent.click(screen.getByRole('button', { name: 'Pagar y confirmar' }));

  await waitFor(() => {
    expect(vi.mocked(api.post).mock.calls.some(([url]) => url === '/pedidos')).toBe(true);
  });
  const llamada = vi.mocked(api.post).mock.calls.find(([url]) => url === '/pedidos');
  return llamada?.[1] as {
    items: { id_producto: number; cantidad: number; metros?: number; color?: string; id_variante?: number }[];
  };
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    const producto = productoPorId(url);
    if (producto) return { data: producto };
    if (url === '/productos/?limit=100') return { data: { data: [productoVariantes, productoMetros] } };
    if (url === '/pedidos/metodos-pago') return { data: { bancos: [] } };
    if (url === '/clients/me') return { data: { address: 'Calle 1 # 2-3' } };
    throw new Error(`Ruta inesperada: ${url}`);
  });
  vi.mocked(api.post).mockImplementation(async (url: string) => {
    if (url === '/pedidos/recomendacion-tecnicos') {
      return {
        data: {
          tiempo_total_horas: 1,
          tecnicos_necesarios: 1,
          especializaciones_requeridas: [],
          tecnicos_sugeridos: [],
        },
      };
    }
    if (url === '/pedidos') {
      return {
        data: {
          pago: { estado: 'aprobado', numero_transaccion: 'TX-TEST' },
          pedido: { id_pedido: 99, total: 1500 },
          factura: { numero_factura: 'FAC-TEST' },
        },
      };
    }
    throw new Error(`Ruta POST inesperada: ${url}`);
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
});

// Recorrido pesado: renderiza 3 páginas y encadena varios findBy/waitFor con
// timers reales. En la suite completa (paralela, I/O alto del working tree en
// Desktop) el timeout por defecto de 5000 ms se excede por contención; aislado
// pasa en ~3 s. Se da margen explícito (15000 ms) sin omitir aserciones.
describe('ProductoDetalle -> carrito -> checkout', () => {
  it('conserva cantidad y variante hasta el pedido', async () => {
    renderFlujo('/producto/7');
    await screen.findByRole('button', { name: 'Agregar al carrito' });

    fireEvent.click(screen.getByRole('button', { name: 'Aumentar cantidad' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar al carrito' }));

    fireEvent.click(screen.getByRole('link', { name: 'Abrir carrito' }));
    await screen.findByText('Color: Rojo');
    const linea = JSON.parse(localStorage.getItem('neodomus_carrito') || '[]')[0];
    expect(linea).toMatchObject({
      id_producto: 7,
      id_variante: 71,
      color: 'Rojo',
      cantidad: 2,
      precio_venta_producto: 750,
    });

    const pedido = await irAlCheckoutYRegistrarPedido();
    expect(pedido.items).toEqual([
      expect.objectContaining({
        id_producto: 7,
        cantidad: 2,
        color: 'Rojo',
        id_variante: 71,
      }),
    ]);
  }, 15000);

  it('conserva metros y unidades hasta el pedido', async () => {
    renderFlujo('/producto/1');
    const metros = (await screen.findByRole('combobox', { name: 'Metros por unidad' })) as HTMLSelectElement;
    fireEvent.change(metros, { target: { value: '1.5' } });

    const unidades = screen.getByRole('textbox', { name: 'Unidades' });
    fireEvent.change(unidades, { target: { value: '2' } });
    fireEvent.blur(unidades);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar al carrito' }));

    fireEvent.click(screen.getByRole('link', { name: 'Abrir carrito' }));
    await screen.findByText(/1\.5 m .* 2 unidades = 3 m/);
    const resumenCarrito = document.querySelector('.carrito-items')?.textContent || '';
    expect(resumenCarrito).toContain('Tubería PVC');

    fireEvent.click(screen.getByRole('button', { name: 'Finalizar compra' }));
    await screen.findByRole('heading', { name: 'Finalizar compra' });
    const resumenCheckout = document.querySelector('.checkout-resumen-items')?.textContent || '';
    expect(resumenCheckout).toContain('Tubería PVC');
    expect(resumenCheckout).toContain('3 m');

    fireEvent.click(screen.getByRole('button', { name: /Punto de pago/ }));
    const puntoPago = screen
      .getAllByRole('combobox')
      .find((el) => Array.from((el as HTMLSelectElement).options).some((o) => o.value === 'Efecty')) as
      | HTMLSelectElement
      | undefined;
    if (!puntoPago) throw new Error('selector de punto de pago no encontrado');
    fireEvent.change(puntoPago, { target: { value: 'Efecty' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pagar y confirmar' }));

    await waitFor(() => {
      expect(vi.mocked(api.post).mock.calls.some(([url]) => url === '/pedidos')).toBe(true);
    });
    const llamada = vi.mocked(api.post).mock.calls.find(([url]) => url === '/pedidos');
    expect(llamada?.[1]).toEqual({
      items: [
        expect.objectContaining({
          id_producto: 1,
          cantidad: 1,
          metros: 3,
          id_variante: undefined,
        }),
      ],
      servicios: [],
      pago: expect.objectContaining({ metodo: 'punto_pago', punto_pago: 'Efecty' }),
    });
  }, 15000);
});
