// Helpers compartidos para las pestañas de pedidos del cliente
// (Mis pedidos y Mis reseñas trabajan sobre el mismo historial).

// El pedido está completado cuando el técnico marcó la entrega como
// "Entregado" o cuando la cita de instalación quedó "Finalizada".
// Recibe la forma mínima del pedido que ambas pestañas usan.
export const pedidoCompletado = (pedido: {
  productos_calificables?: boolean | null;
  estado_entrega?: string | null;
  cita?: { estado?: string | null } | null;
}): boolean =>
  pedido.productos_calificables === true ||
  pedido.estado_entrega === 'Entregado' ||
  pedido.cita?.estado === 'Finalizada';
