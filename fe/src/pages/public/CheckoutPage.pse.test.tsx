// Recorrido completo del pago PSE en CheckoutPage con la página real:
// abrir el selector, elegir un banco, comprobar que queda visible en el
// disparador y en el estado del formulario, y que el payload enviado al
// backend contiene el banco elegido (sin el error de banco faltante).
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdiomaProvider } from '@i18n/IdiomaContext';
import api from '@services/api';
import CheckoutPage from './CheckoutPage';

const auth = vi.hoisted(() => ({
  current: {
    isAuthenticated: true,
    rol: 'cliente',
    user: { id: 1, nombre: 'Cliente Test', correo: 'cliente@test.patito' },
    loading: false,
  },
}));

const cart = vi.hoisted(() => ({
  current: {
    items: [
      {
        id_producto: 1,
        nombre_producto: 'Tubería PVC',
        precio_venta_producto: 5000,
        imagen: '/productos/1.jpg',
        cantidad: 1,
      },
    ],
    totalPrice: 5000,
    totalItems: 1,
    clearCart: vi.fn(),
  },
}));

vi.mock('@contexts/AuthContext', () => ({
  useAuth: () => auth.current,
}));

vi.mock('@contexts/CartContext', () => ({
  useCart: () => cart.current,
}));

vi.mock('@services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  descargarFactura: vi.fn(),
  descargarReportePdf: vi.fn(),
}));

const respuestaResumenPago = {
  data: {
    pedido: { id_pedido: 55, total: 5000 },
    pago: { estado: 'aprobado', numero_transaccion: 'PSE-1', banco: 'Banco de Bogotá' },
    factura: { numero_factura: 'FAC-1', enviada_por_correo: true },
    pdf_url: '/pedidos/55/factura',
  },
};

beforeEach(() => {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/pedidos/metodos-pago') {
      return { data: { bancos: ['Bancolombia', 'Banco de Bogotá', 'Banco Davivienda'] } };
    }
    if (url === '/clients/me') return { data: { address: 'Calle 1 # 2-3' } };
    if (url === '/novedades/cliente/mis-cupones') return { data: [] };
    if (typeof url === 'string' && url.startsWith('/tecnicos/publicos')) return { data: [] };
    throw new Error(`Ruta inesperada: ${url}`);
  });
  vi.mocked(api.post).mockImplementation(async (url: string) => {
    if (url === '/pedidos') return respuestaResumenPago;
    if (url === '/pedidos/recomendacion-tecnicos') {
      return {
        data: { tecnicos_necesarios: 1, horas_por_tecnico: 1, especializaciones_requeridas: [], tecnicos_sugeridos: [] },
      };
    }
    throw new Error(`Ruta inesperada: ${url}`);
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
});

const checkout = () =>
  render(
    <MemoryRouter initialEntries={['/checkout']}>
      <IdiomaProvider>
        <CheckoutPage />
      </IdiomaProvider>
    </MemoryRouter>,
  );

describe('CheckoutPage · pago PSE', () => {
  it('guarda el banco seleccionado, lo mantiene visible y lo envía al backend', async () => {
    checkout();

    // Elegir el método PSE.
    await screen.findByText('Resumen del pedido');
    fireEvent.click(screen.getByRole('button', { name: /PSE/ }));

    // Abrir el selector de bancos y elegir uno.
    const disparador = await screen.findByRole('button', { name: 'Banco' });
    fireEvent.click(disparador);
    const opciones = await screen.findAllByRole('option');
    expect(opciones.map((o) => o.textContent)).toContain('Banco de Bogotá');
    fireEvent.click(screen.getByRole('option', { name: 'Banco de Bogotá' }));

    // La selección queda VISIBLE en el disparador (estado del formulario).
    expect(screen.getByRole('button', { name: 'Banco' }).textContent).toContain('Banco de Bogotá');

    // Resultado de simulación y confirmar: no debe existir el error de banco faltante.
    const simulacion = screen.getAllByRole('combobox').find((el) =>
      Array.from((el as HTMLSelectElement).options).some((o) => o.value === 'aprobado'),
    ) as HTMLSelectElement;
    fireEvent.change(simulacion, { target: { value: 'aprobado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pagar y confirmar' }));

    await waitFor(() => {
      expect(vi.mocked(api.post).mock.calls.some(([ruta]) => ruta === '/pedidos')).toBe(true);
    });
    const llamada = vi.mocked(api.post).mock.calls.find(([ruta]) => ruta === '/pedidos');
    const cuerpo = (llamada?.[1] ?? {}) as { pago: { banco: string; metodo: string } };
    expect(cuerpo.pago.banco).toBe('Banco de Bogotá');
    expect(cuerpo.pago.metodo).toBe('pse');

    await waitFor(() => {
      expect(screen.getByText('¡Pago exitoso!')).toBeTruthy();
    });
    expect(screen.queryByText(/Selecciona un banco/i)).toBeNull();
  });

  it('sin elegir banco muestra el aviso y NO envía el pago', async () => {
    checkout();
    await screen.findByText('Resumen del pedido');
    fireEvent.click(screen.getByRole('button', { name: /PSE/ }));
    await screen.findByRole('button', { name: 'Banco' });
    fireEvent.click(screen.getByRole('button', { name: 'Pagar y confirmar' }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('Selecciona un banco para pagar por PSE.')).toBeTruthy();
    expect(vi.mocked(api.post).mock.calls.some(([ruta]) => ruta === '/pedidos')).toBe(false);
  });
});
