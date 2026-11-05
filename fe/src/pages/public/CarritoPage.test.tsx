// Escenarios del carrito con la página real y el CartProvider real.
// La red y la autenticación se simulada para aislar la UI; el localStorage de
// jsdom es real, así que también cubre la persistencia de las líneas.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdiomaProvider } from '@i18n/IdiomaContext';
import { CartProvider } from '@contexts/CartContext';
import api from '@services/api';
import CarritoPage from './CarritoPage';

const auth = vi.hoisted(() => ({
  current: { isAuthenticated: true, rol: 'cliente', user: { id: 1, correo: 'cliente@test.patito' } },
}));

vi.mock('@contexts/AuthContext', () => ({
  useAuth: () => auth.current,
}));

vi.mock('@components/productos/ProductoCard', () => ({
  default: ({ producto }: { producto: { id_producto: number; nombre_producto: string } }) => (
    <div data-testid="sugerido">{`${producto.id_producto}:${producto.nombre_producto}`}</div>
  ),
}));

vi.mock('@services/api', () => ({
  default: { get: vi.fn() },
}));

const rutaProducto = '/productos/1';
const rutaLista = '/productos/?limit=100';
const productoInicial = {
  id_producto: 1,
  nombre_producto: 'Tubería PVC',
  precio_venta_producto: 1000,
  imagen: '/productos/1.jpg',
  venta_por_metros: true,
  stock_producto: 20,
  variantes: [],
  prefijoKey: '',
};

const carritoDe = (item: {
  id_producto: number;
  nombre_producto: string;
  precio_venta_producto: number;
  imagen: string;
  cantidad: number;
  metros?: number;
  venta_por_metros?: boolean;
  stock_maximo?: number;
}) =>
  JSON.stringify([item]);

const productoRes = (overrides: Record<string, unknown> = {}) => ({
  data: {
    ...productoInicial,
    ...overrides,
  },
});

const respuestaLista = { data: [{ ...productoInicial, id_producto: 2, nombre_producto: 'Lámina' }] };

const renderCarrito = (carrito: string) => {
  localStorage.setItem('neodomus_carrito', carrito);
  return render(
    <MemoryRouter>
      <IdiomaProvider>
        <CartProvider>
          <CarritoPage />
        </CartProvider>
      </IdiomaProvider>
    </MemoryRouter>,
  );
};

const llamadasA = (ruta: string) => vi.mocked(api.get).mock.calls.filter(l => l[0] === ruta).length;

const guardarLinea = () => {
  const bruto = localStorage.getItem('neodomus_carrito');
  if (!bruto) throw new Error('cart expected');
  return JSON.parse(bruto)[0];
};

const boton = (nombre: string) => screen.getByRole('button', { name: nombre }) as HTMLButtonElement;

beforeEach(() => {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === rutaProducto) return productoRes();
    if (url === rutaLista) return respuestaLista;
    throw new Error(rutaInesperada(url));
  });
});

const rutaInesperada = (url: string) => `Ruta inesperada: ${url}`;

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

describe('CarritoPage', () => {
  it('hidratar stock живут y persiste fracciones sin revalidaciones duplicadas', async () => {
    renderCarrito(
      carritoDe({
        id_producto: 1,
        nombre_producto: 'Tubería PVC',
        precio_venta_producto: 1000,
        imagen: '/productos/1.jpg',
        cantidad: 1,
        venta_por_metros: true,
        metros: 1.5,
      }),
    );
    await screen.findByRole('combobox', { name: 'Metros por unidad' });
    await screen.findByText(/20 m disp\./);
    const linea = guardarLinea();
    expect(linea.metros).toBe(1.5);
    expect(linea.stock_maximo).toBe(20);
    await waitFor(() => {
      expect(llamadasA(rutaProducto)).toBe(1);
      expect(llamadasA(rutaLista)).toBe(1);
    });
  });

  it('seleccionar 2,5 m suma 5000 y después del render no duplica llamadas', async () => {
    renderCarrito(
      carritoDe({
        id_producto: 1,
        nombre_producto: 'Tubería PVC',
        precio_venta_producto: 1000,
        imagen: '/productos/1.jpg',
        cantidad: 1,
        venta_por_metros: true,
        metros: 1.5,
      }),
    );
    const combo = (await screen.findByRole('combobox', { name: 'Metros por unidad' })) as HTMLSelectElement;
    await screen.findByText(/20 m disp\./);
    await waitFor(() => {
      expect(llamadasA(rutaProducto)).toBe(1);
    });
    const antes = llamadasA(rutaProducto);
    fireEvent.change(combo, { target: { value: '2.5' } });
    await screen.findByText((_, nodo) => nodo?.className === 'carrito-item-subtotal' && nodo.textContent === '$2500 COP');
    await act(async () => {
      await Promise.resolve();
    });
    expect(llamadasA(rutaProducto)).toBe(antes);
    const linea = guardarLinea();
    expect(linea.metros).toBe(2.5);
    expect(linea.precio_venta_producto).toBe(1000);
    expect(linea.stock_maximo).toBe(20);
  });

  it(' actualizar stock/producto idéntico no escribe duplicados', async () => {
    renderCarrito(
      carritoDe({
        id_producto: 1,
        nombre_producto: 'Tubería PVC',
        precio_venta_producto: 1000,
        imagen: '/productos/1.jpg',
        cantidad: 2,
        venta_por_metros: true,
        metros: 1.5,
      }),
    );
    await screen.findByRole('combobox', { name: 'Metros por unidad' });
    await screen.findByText(/20 m disp\./);
    const linea = guardarLinea();
    expect(linea.stock_maximo).toBe(20);
    expect(linea.precio_venta_producto).toBe(1000);
    await waitFor(() => {
      expect(llamadasA(rutaProducto)).toBe(1);
    });
  });

  it('no reescribe el carrito durante un render estable', async () => {
    renderCarrito(
      carritoDe({
        id_producto: 1,
        nombre_producto: 'Tubería PVC',
        precio_venta_producto: 1000,
        imagen: '/productos/1.jpg',
        cantidad: 1,
        venta_por_metros: true,
        metros: 1.5,
        stock_maximo: 20,
      }),
    );
    await screen.findByText(/20 m disp\./);
    await waitFor(() => {
      expect(llamadasA(rutaProducto)).toBe(1);
    });

    const escribir = vi.spyOn(Storage.prototype, 'setItem');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    const escriturasCarrito = escribir.mock.calls.filter(([clave]) => clave === 'neodomus_carrito');
    expect(escriturasCarrito).toHaveLength(0);
    escribir.mockRestore();
  });

  it('hace exactamente un GET por ítem aunque cambie la cantidad', async () => {
    renderCarrito(
      carritoDe({
        id_producto: 1,
        nombre_producto: 'Tubería PVC',
        precio_venta_producto: 1000,
        imagen: '/productos/1.jpg',
        cantidad: 1,
        venta_por_metros: true,
        metros: 1.5,
      }),
    );
    const combo = (await screen.findByRole('combobox', { name: 'Metros por unidad' })) as HTMLSelectElement;
    await screen.findByText(/20 m disp\./);
    await waitFor(() => {
      expect(llamadasA(rutaProducto)).toBe(1);
      expect(llamadasA(rutaLista)).toBe(1);
    });
    const antes = llamadasA(rutaProducto);
    fireEvent.change(combo, { target: { value: '2' } });
    await screen.findByText((_, nodo) => nodo?.className === 'carrito-item-subtotal' && nodo.textContent === '$2000 COP');
    await act(async () => {
      await Promise.resolve();
    });
    expect(llamadasA(rutaProducto)).toBe(antes);
  });

  it('puede hidratar un corte de 1 m sin duplicar la operación', async () => {
    renderCarrito(
      carritoDe({
        id_producto: 1,
        nombre_producto: 'Tubería PVC',
        precio_venta_producto: 1000,
        imagen: '/productos/1.jpg',
        cantidad: 1,
        venta_por_metros: true,
        metros: 1,
      }),
    );
    await screen.findByRole('combobox', { name: 'Metros por unidad' });
    await screen.findByText(/20 m disp\./);
    const linea = guardarLinea();
    expect(linea.metros).toBe(1);
    expect(linea.stock_maximo).toBe(20);
  });

  it('un corte perdido (API falla) deja stock 0, avisa y bloquea el check-out', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === rutaProducto) throw new Error('sin backend');
      if (url === rutaLista) return respuestaLista;
      throw new Error(`Ruta inesperada: ${url}`);
    });
    renderCarrito(
      carritoDe({
        id_producto: 1,
        nombre_producto: 'Tubería PVC',
        precio_venta_producto: 1000,
        imagen: '/productos/1.jpg',
        cantidad: 1,
        venta_por_metros: true,
        metros: 1.5,
      }),
    );
    const combo = await screen.findByRole('combobox', { name: 'Metros por unidad' });
    await screen.findByText(/Excede stock \(0 m/);
    expect((combo as HTMLSelectElement).disabled).toBe(true);
    expect(boton('Finalizar compra').disabled).toBe(true);
    const linea = guardarLinea();
    expect(linea.stock_maximo).toBe(0);
    expect(llamadasA(rutaProducto)).toBe(1);
  });

  it('solo un GET de stock por ítem refactorado y a futuro', async () => {
    renderCarrito(
      carritoDe({
        id_producto: 1,
        nombre_producto: 'Tubería PVC',
        precio_venta_producto: 1000,
        imagen: '/productos/1.jpg',
        cantidad: 1,
        venta_por_metros: true,
        metros: 1.5,
      }),
    );
    await screen.findByRole('combobox', { name: 'Metros por unidad' });
    await screen.findByText(/20 m disp\./);
    await waitFor(() => {
      expect(llamadasA(rutaProducto)).toBe(1);
    });
  });

  it('un ítem con 0,5 m puede crecer a 1,5 m', async () => {
    renderCarrito(
      carritoDe({
        id_producto: 1,
        nombre_producto: 'Tubería PVC',
        precio_venta_producto: 1000,
        imagen: '/productos/1.jpg',
        cantidad: 1,
        venta_por_metros: true,
        metros: 0.5,
      }),
    );
    const combo = (await screen.findByRole('combobox', { name: 'Metros por unidad' })) as HTMLSelectElement;
    await screen.findByText(/20 m disp\./);
    fireEvent.change(combo, { target: { value: '1.5' } });
    await screen.findByText((_, nodo) => nodo?.className === 'carrito-item-subtotal' && nodo.textContent === '$1500 COP');
    const linea = guardarLinea();
    expect(linea.metros).toBe(1.5);
  });

  it('al aumentar unidades de 1,5 m cuando ya no hay stock, el botón se desactiva', async () => {
    renderCarrito(
      carritoDe({
        id_producto: 1,
        nombre_producto: 'Tubería PVC',
        precio_venta_producto: 1000,
        imagen: '/productos/1.jpg',
        cantidad: 10,
        venta_por_metros: true,
        metros: 2.5,
      }),
    );
    const combo = await screen.findByRole('combobox', { name: 'Metros por unidad' });
    await screen.findByText(/Excede stock \(20 m/);
    expect((combo as HTMLSelectElement).disabled).toBe(false);
    await waitFor(() => {
      expect(boton('Aumentar unidades').disabled).toBe(true);
    expect(boton('Finalizar compra').disabled).toBe(true);
    });
  });

  it('los sugeridos excluyen lo que ya está en el carrito', async () => {
    renderCarrito(
      carritoDe({
        id_producto: 1,
        nombre_producto: 'Tubería PVC',
        precio_venta_producto: 1000,
        imagen: '/productos/1.jpg',
        cantidad: 1,
        venta_por_metros: true,
        metros: 1.5,
      }),
    );
    await screen.findByRole('combobox', { name: 'Metros por unidad' });
    const sugeridos = await screen.findAllByTestId('sugerido');
    expect(sugeridos.map(n => n.textContent)).toEqual(['2:Lámina']);
  });

  it('el resumen usa el precio hidratado y el subtotal de la línea', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === rutaProducto) return productoRes({ precio_venta_producto: 2000 });
      if (url === rutaLista) return respuestaLista;
      throw new Error(`Ruta inesperada: ${url}`);
    });
    renderCarrito(
      carritoDe({
        id_producto: 1,
        nombre_producto: 'Tubería PVC',
        precio_venta_producto: 1000,
        imagen: '/productos/1.jpg',
        cantidad: 2,
        venta_por_metros: true,
        metros: 1.5,
      }),
    );
    await screen.findByRole('combobox', { name: 'Metros por unidad' });
    await screen.findByText((_, nodo) => nodo?.className === 'carrito-item-precio-unit' && nodo.textContent === '$2000 COP / metro');
    const subtotales = await screen.findAllByText((_, nodo) => nodo?.className === 'carrito-item-subtotal' && nodo.textContent === '$6000 COP');
    expect(subtotales.length).toBeGreaterThan(0);
  });
});
