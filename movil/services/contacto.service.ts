// ─────────────────────────────────────────────────────────────
// Servicio de contacto público.
// Endpoint real del backend (prefijo /api/v1):
// - POST /contacto  { nombre, email, asunto, mensaje, categoria? }
// Categorías válidas (constants.ts de la WEB == backend):
// consulta-general | soporte-tecnico | pedido | pago | reembolso | reclamo | otro
// ─────────────────────────────────────────────────────────────

import { apiFetch } from "./api";

export const CATEGORIAS_CONSULTA: Record<string, string> = {
  'consulta-general': 'Consulta general',
  'soporte-tecnico': 'Soporte técnico',
  pedido: 'Pedido',
  pago: 'Pago',
  reembolso: 'Reembolso',
  reclamo: 'Reclamo',
  otro: 'Otro',
};

export interface DatosConsulta {
  nombre: string;
  email: string;
  /** La web envía el label de la categoría como asunto. */
  asunto: string;
  mensaje: string;
  categoria: string;
}

// Comunica con el backend mediante API "/contacto".
export const enviarConsulta = (datos: DatosConsulta) =>
  apiFetch<{ msg: string; id: number }>("/contacto", {
    method: "POST",
    body: JSON.stringify(datos),
  });
