// ─────────────────────────────────────────────────────────────
// Servicio de novedades e incidencias para técnicos.
// Endpoints reales del backend (prefijo /api/v1/novedades):
// - GET  /novedades/tipos              → lista de tipos
// - GET  /novedades/estados            → lista de estados
// - GET  /novedades/prioridades        → lista de prioridades
// - GET  /novedades/clientes-buscar    → buscar clientes del técnico
// - GET  /novedades/clientes/:id/pedidos → pedidos del cliente para el técnico
// - GET  /novedades/clientes/:id/citas   → citas del cliente para el técnico
// - POST /novedades                    → crear novedad
// - POST /novedades/:id/evidencia      → subir evidencia (multipart)
// - GET  /novedades/mis-novedades      → listar novedades del técnico
// - GET  /novedades/:id                → detalle de novedad
// - GET  /novedades/:id/evidencias     → evidencias de una novedad
// ─────────────────────────────────────────────────────────────

import { apiFetch } from "./api";
import { API_BASE_URL } from "@/constants/api";
import { obtenerSesion } from "./storage";

// ── Interfaces ───────────────────────────────────────────────

export interface ClienteBusqueda {
  id_cliente: number;
  nombre: string;
  email: string | null;
  telefono: number | null;
  documento: number | null;
  direccion: string | null;
}

export interface PedidoCliente {
  id_pedido: number;
  fecha_pedido: string | null;
  estado_pedido: string | null;
  total: number | null;
  fecha_entrega: string | null;
  hora_entrega: string | null;
  hora_entrega_fin: string | null;
  estado_entrega: string | null;
  nombre_tecnico: string | null;
  detalles: { producto: string | null; cantidad: number | null; precio: number | null }[];
}

export interface CitaCliente {
  id_cita: number;
  fecha: string | null;
  hora: string;
  tipo_servicio: string;
  especialidad: string | null;
  estado: string;
  direccion: string;
  descripcion: string | null;
  costo: number | null;
  nombre_tecnico: string | null;
  id_tecnico: number | null;
}

export interface Novedad {
  id_novedad: number;
  tipo_novedad: string;
  descripcion_novedad: string;
  prioridad: string;
  estado_novedad: string;
  fecha_reporte: string | null;
  lugar_ocurrencia: string | null;
  evidencia_url: string | null;
  id_pedido: number | null;
  id_cita: number | null;
  id_cliente: number | null;
  id_devolucion: number | null;
  id_tecnico: number | null;
  tecnico_nombre: string | null;
  cliente_nombre: string | null;
  accion_admin: string | null;
  fecha_resolucion: string | null;
  evidencias: EvidenciaNovedad[];
  pedido_info: { id_pedido: number; estado: string | null; fecha_entrega: string | null } | null;
  cita_info: { id_cita: number; tipo_servicio: string; fecha: string | null; hora: string; estado: string } | null;
  devolucion_info: { id_devolucion: number; estado: string | null; motivo: string | null } | null;
}

export interface NovedadDetalle extends Novedad {
  historial: NovedadHistorial[];
  cliente_info: { id_cliente: number; nombre: string; email: string; telefono: number | null; documento: number | null; direccion: string | null } | null;
  pedido_info_completo: { id_pedido: number; estado: string | null; fecha_pedido: string | null; total: number | null; fecha_entrega: string | null; hora_entrega: string | null; estado_entrega: string | null; nombre_tecnico: string | null } | null;
  cita_info_completo: { id_cita: number; tipo_servicio: string; fecha: string | null; hora: string; estado: string; direccion: string; especialidad: string | null } | null;
  devolucion_info_completo: { id_devolucion: number; estado: string | null; motivo: string | null; descripcion: string | null; fecha_solicitud: string | null } | null;
}

export interface EvidenciaNovedad {
  id_evidencia_n: number;
  url: string;
  descripcion: string | null;
  fecha_subida: string | null;
}

export interface NovedadHistorial {
  id_historial: number;
  accion: string;
  detalle: string | null;
  fecha: string | null;
  usuario_nombre: string | null;
}

export interface NovedadCrearPayload {
  tipo_novedad: string;
  descripcion: string;
  prioridad?: string;
  id_pedido?: number | null;
  id_cita?: number | null;
  id_cliente?: number | null;
  id_devolucion?: number | null;
  lugar_ocurrencia?: string | null;
}

// ── Constantes ───────────────────────────────────────────────

export const TIPOS_NOVEDAD = [
  "Retraso en entrega",
  "Cliente ausente",
  "Cliente no recibió el pedido",
  "Dirección incorrecta",
  "Producto dañado",
  "Producto faltante",
  "Producto equivocado",
  "Pérdida de producto",
  "Robo de productos",
  "Accidente",
  "Problema con el vehículo/transporte",
  "Problema técnico",
  "Problema durante una cita",
  "Cita no realizada",
  "Cita reprogramada",
  "Cliente solicita reprogramación",
  "Problema con instalación",
  "Retraso que afecta cita",
  "Otro",
];

export const TIPOS_DEVOLUCION = [
  "Producto recibido con daños",
  "Producto incompleto",
  "Cliente no tenía el producto disponible",
  "Producto diferente al solicitado",
  "Devolución no realizada",
  "Problema durante la recogida",
  "Otro",
];

export const ESTADOS_NOVEDAD = [
  "Pendiente",
  "En revisión",
  "Aprobada",
  "Rechazada",
  "Resuelta",
  "Cerrada",
];

export const PRIORIDADES = ["baja", "normal", "alta", "urgente"];

// ── Funciones API ────────────────────────────────────────────

export function obtenerTiposNovedad() {
  return apiFetch<string[]>("/novedades/tipos");
}

export function obtenerEstadosNovedad() {
  return apiFetch<string[]>("/novedades/estados");
}

export function obtenerPrioridadesNovedad() {
  return apiFetch<string[]>("/novedades/prioridades");
}

export function buscarClientes(q?: string) {
  const params = q ? `?q=${encodeURIComponent(q)}` : "";
  return apiFetch<ClienteBusqueda[]>(`/novedades/clientes-buscar${params}`);
}

export function pedidosCliente(clienteId: number) {
  return apiFetch<PedidoCliente[]>(`/novedades/clientes/${clienteId}/pedidos`);
}

export function citasCliente(clienteId: number) {
  return apiFetch<CitaCliente[]>(`/novedades/clientes/${clienteId}/citas`);
}

export function crearNovedad(data: NovedadCrearPayload) {
  return apiFetch<{ id_novedad: number; mensaje: string }>("/novedades", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function listarMisNovedades() {
  return apiFetch<Novedad[]>("/novedades/mis-novedades");
}

export function obtenerNovedad(id: number) {
  return apiFetch<NovedadDetalle>(`/novedades/${id}`);
}

export function obtenerEvidencias(novedadId: number) {
  return apiFetch<EvidenciaNovedad[]>(`/novedades/${novedadId}/evidencias`);
}

/**
 * Sube una evidencia (foto) a una novedad.
 * Usa multipart/form-data directamente con fetch (no apiFetch)
 * porque apiFetch no soporta FormData.
 */
export async function subirEvidencia(
  novedadId: number,
  archivo: { uri: string; name: string; type: string },
  descripcion?: string,
): Promise<{ id_evidencia_n: number; url: string; mensaje: string }> {
  const sesion = await obtenerSesion();
  const formData = new FormData();
  formData.append("file", archivo as any);
  if (descripcion) {
    formData.append("descripcion", descripcion);
  }

  const response = await fetch(
    `${API_BASE_URL}/novedades/${novedadId}/evidencia`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sesion?.accessToken}`,
      },
      body: formData,
    },
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Error al subir evidencia" }));
    throw new Error(err.detail || "Error al subir evidencia");
  }

  return response.json();
}
