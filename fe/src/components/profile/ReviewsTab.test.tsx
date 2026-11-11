// Garantiza que Mis reseñas concentre las calificaciones: pendientes de
// productos entregados y reseñas ya enviadas, sin reseñas locales falsas.
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdiomaProvider } from '@i18n/IdiomaContext';
import api from '@services/api';
import ReviewsTab from './ReviewsTab';

vi.mock('@services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const notify = vi.fn();

// Cambia a la pestaña de productos dentro de Mis reseñas.
const irAProductos = async () => {
  const toggle = await screen.findByRole('button', { name: 'Productos' });
  toggle.click();
};

const pedidoCompletadoConProductoPendiente = {
  id_pedido: 12,
  fecha: '2026-10-05T10:00:00',
  detalles: [
    { id_producto_d: 9, nombre: 'Cámara IP 1080p', es_servicio: false },
    { id_producto_d: 31, nombre: 'Sensor de movimiento', es_servicio: false },
  ],
  estado_entrega: 'Entregado',
  productos_calificables: true,
};

const resenaYaEnviada = {
  id_calificacion_producto: 1,
  id_pedido: 12,
  id_producto: 9,
  nombre_producto: 'Cámara IP 1080p',
  producto_imagen: null,
  calificacion: 4,
  comentario: 'Buen producto',
  foto_url: null,
  created_at: '2026-11-01T12:00:00',
};

afterEach(cleanup);

describe('Mis reseñas · productos', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/calificaciones/mis-dadas') return { data: [] } as never;
      if (url === '/citas/mis-citas') return { data: [] } as never;
      if (url === '/calificaciones/producto/mis-dadas')
        return { data: [resenaYaEnviada] } as never;
      if (url === '/pedidos/mis-pedidos')
        return { data: [pedidoCompletadoConProductoPendiente] } as never;
      return { data: [] } as never;
    });
  });

  it('muestra los productos entregados sin calificar con su selector de estrellas', async () => {
    render(
      <MemoryRouter>
        <IdiomaProvider>
          <ReviewsTab notify={notify} />
        </IdiomaProvider>
      </MemoryRouter>,
    );

    await irAProductos();
    await screen.findByText('Productos por calificar');
    expect(screen.getByText('Sensor de movimiento')).toBeTruthy();
    const item = screen.getByText('Sensor de movimiento').closest('.pf-review-item');
    expect(item).not.toBeNull();
    expect(within(item as HTMLElement).getByText('Pedido #12')).toBeTruthy();
    expect((item as HTMLElement).querySelectorAll('.pf-stars-picker button').length).toBe(5);
  });

  it('lista las calificaciones de productos ya enviadas', async () => {
    render(
      <MemoryRouter>
        <IdiomaProvider>
          <ReviewsTab notify={notify} />
        </IdiomaProvider>
      </MemoryRouter>,
    );

    await irAProductos();
    await screen.findByText('Productos por calificar');
    await screen.findByText('Calificaciones de tus pedidos');
    const item = screen.getByText('Cámara IP 1080p').closest('.pf-review-item');
    expect(item).not.toBeNull();
    expect((item as HTMLElement).querySelectorAll('.pf-stars .on').length).toBe(4);
  });

  it('no presenta reseñas locales guardadas en el navegador', async () => {
    render(
      <MemoryRouter>
        <IdiomaProvider>
          <ReviewsTab notify={notify} />
        </IdiomaProvider>
      </MemoryRouter>,
    );

    await irAProductos();
    await screen.findByText('Productos por calificar');
    expect(screen.queryByText('Reseñas guardadas en este perfil')).toBeNull();
    expect(screen.queryByRole('button', { name: /Escribir reseña/ })).toBeNull();
  });
});
