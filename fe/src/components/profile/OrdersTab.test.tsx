// Garantiza que Mis pedidos sea solo historial de compras: sin estrellas ni
// formularios de calificación, conservando productos, valores y devoluciones.
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdiomaProvider } from '@i18n/IdiomaContext';
import api, { descargarFactura } from '@services/api';
import OrdersTab from './OrdersTab';

vi.mock('@services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  descargarFactura: vi.fn(),
}));

const notify = vi.fn();

const pedidoEntregado = {
  id_pedido: 12,
  fecha: '2026-10-05T10:00:00',
  total: 245000,
  estado: 'Pagado',
  pago: null,
  factura: null,
  detalles: [
    {
      id_detalle: 1,
      id_producto_d: 9,
      nombre: 'Cámara IP 1080p',
      cantidad: 1,
      metros: null,
      precio_unitario: 245000,
      subtotal: 245000,
      es_servicio: false,
    },
  ],
  estado_entrega: 'Entregado',
  productos_calificables: true,
  cita: null,
};

afterEach(cleanup);

describe('Mis pedidos · separación con reseñas', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/pedidos/mis-pedidos') return { data: [pedidoEntregado] } as never;
      if (url === '/novedades/cliente/novedades') return { data: [] } as never;
      if (url === '/devoluciones/mis-solicitudes') return { data: [] } as never;
      return { data: [] } as never;
    });
  });

  const abrirDetalle = async () => {
    const toggle = await screen.findByRole('button', { name: /Ver detalle del pedido/ });
    toggle.click();
    await screen.findByText('Cámara IP 1080p');
  };

  it('muestra el producto con su cantidad y valor', async () => {
    render(
      <MemoryRouter>
        <IdiomaProvider>
          <OrdersTab notify={notify} />
        </IdiomaProvider>
      </MemoryRouter>,
    );

    await abrirDetalle();

    const precio = [...document.querySelectorAll('.pf-order-item-price')].find((el) =>
      /245/.test(el.textContent || ''),
    );
    expect(precio).toBeTruthy();
    const total = [...document.querySelectorAll('.pf-order-total-big')].find((el) =>
      /245/.test(el.textContent || ''),
    );
    expect(total).toBeTruthy();
  });

  it('no muestra estrellas ni formularios de calificación al abrir el detalle', async () => {
    render(
      <MemoryRouter>
        <IdiomaProvider>
          <OrdersTab notify={notify} />
        </IdiomaProvider>
      </MemoryRouter>,
    );

    await abrirDetalle();

    expect(
      document.querySelectorAll('.pf-stars, .pf-stars-static, .pf-stars-picker, .pf-resena-form')
        .length,
    ).toBe(0);
    expect(screen.queryByText(/Califica este producto/)).toBeNull();
    expect(screen.queryByText(/Tu calificación/)).toBeNull();
  });

  it('conserva la acción de solicitar devolución en pedidos entregados', async () => {
    render(
      <MemoryRouter>
        <IdiomaProvider>
          <OrdersTab notify={notify} />
        </IdiomaProvider>
      </MemoryRouter>,
    );

    await abrirDetalle();

    expect(await screen.findByText('Solicitar devolución')).toBeTruthy();
    expect(descargarFactura).not.toHaveBeenCalled();
  });
});
