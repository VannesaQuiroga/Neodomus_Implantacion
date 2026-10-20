// ─────────────────────────────────────────────────────────────
// Servicio de productos públicos.
// Endpoints reales del backend (prefijo /api/v1, be/app/routers/productos.py):
// - GET /productos/?page=&limit=&search=   → { total, page, limit, total_pages, data[] }
// - GET /productos/categorias              → Categoria[]
// - GET /productos/{id}                    → Producto (raíz)
// La WEB usa limit=100 y filtra/pagina en cliente; el móvil replica eso.
// ─────────────────────────────────────────────────────────────

import { apiFetch } from "./api";
import { BACKEND_HOST_URL } from "@/constants/api";

export interface VarianteProducto {
  id: number;
  nombre: string;
  hex?: string | null;
  tamaño?: string | null;
  ancho_cm?: number | null;
  alto_cm?: number | null;
  etiqueta_medida?: string | null;
  precio?: number | null;
  imagen_url?: string | null;
  stock: number;
}

/** Shape real del backend: routers/productos.py → ProductoResponse. */
export interface Producto {
  id_producto: number;
  nombre_producto: string;
  marca?: string | null;
  venta_por_metros?: boolean;
  referencia_producto?: string | null;
  precio_venta_producto: number;
  imagen_url?: string | null;
  id_cate_pr?: number | null;
  nombre_categoria?: string | null;
  descripcion_producto?: string | null;
  caracteristicas_producto?: string | null;
  estado_producto?: string;
  stock_producto?: number;
  stock_estado?: 'disponible' | 'bajo' | 'agotado';
  descuento_activo?: number | null;
  precio_final?: number | null;
  promocion_hasta?: string | null;
  es_nuevo?: boolean;
  tecnicos_requeridos?: number;
  dificultad_instalacion?: string | null;
  variantes?: VarianteProducto[];
}

export interface ListaProductos {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  data: Producto[];
}

export interface CategoriaProducto {
  id_categoria: number;
  nombre_categoria: string;
  descripcion: string;
}

/**
 * Igual que la WEB: GET /productos/ CON barra final.
 * La ruta del backend está definida como router "/" con prefijo
 * "/productos" → /api/v1/productos/. Sin la barra el backend
 * responde 405 y el catálogo fallaría.
 */
export const listarProductos = () =>
  apiFetch<ListaProductos>("/productos/?limit=100");

// Comunica con el backend mediante API "/productos/categorias".
export const obtenerCategorias = () =>
  apiFetch<CategoriaProducto[]>("/productos/categorias");

// Comunica con el backend mediante API `/productos/${id}`.
export const obtenerProducto = (id: number | string) =>
  apiFetch<Producto>(`/productos/${id}`);

/**
 * Resuelve la imagen EXACTAMENTE como la WEB (ProductosPublicos.getImagen) pero
 * haciendo la URL accesible desde un celular físico:
 *   - MinIO en desarrollo expone http://localhost:9000/... que NO es alcanzable
 *     desde el dispositivo (localhost del celular ≠ localhost del PC).
 *   - Se reescribe localhost/127.0.0.1/minio → host real del BACKEND_HOST_URL
 *     (ej. http://172.17.208.1:9000/...) sin tocar la web.
 */
function normalizarUrlImagen(url: string): string {
  let hostMinio = "";
  let hostBackend = "";
  try {
    const u = new URL(BACKEND_HOST_URL);
    hostMinio = `${u.protocol}//${u.hostname}:9000`;
    hostBackend = `${u.protocol}//${u.hostname}:8000`;
  } catch {
    return url;
  }
  // Reemplaza cualquier host interno (MinIO :9000 y backend :8000) por el host LAN accesible desde el celular.
  // Ej: http://localhost:9000/neodomus-media/x.jpg → http://192.168.1.10:9000/...
  // Ej: http://localhost:8000/uploads/x.jpg → http://192.168.1.10:8000/uploads/x.jpg
  let out = url
    .replace(/https?:\/\/localhost:9000/gi, hostMinio)
    .replace(/https?:\/\/127\.0\.0\.1:9000/gi, hostMinio)
    .replace(/https?:\/\/minio:9000/gi, hostMinio)
    .replace(/https?:\/\/\[::1\]:9000/gi, hostMinio)
    .replace(/https?:\/\/localhost:8000/gi, hostBackend)
    .replace(/https?:\/\/127\.0\.0\.1:8000/gi, hostBackend)
    .replace(/https?:\/\/minio:8000/gi, hostBackend)
    .replace(/https?:\/\/\[::1\]:8000/gi, hostBackend);
  // Fallback /uploads sin host (ej. "/uploads/x.jpg") ya se prefija con BACKEND_HOST_URL en urlImagenProducto
  if (__DEV__ && out !== url) {
    console.log(`[imagen] Host localhost → LAN ${hostMinio}/${hostBackend} | ${url} → ${out}`);
  }
  return out;
}

export const urlImagenProducto = (
  producto: Pick<Producto, 'id_producto' | 'imagen_url'>,
  variante?: VarianteProducto | null,
): string => {
  const cruda = variante?.imagen_url || producto.imagen_url;
  if (!cruda) {
    return `${BACKEND_HOST_URL}/uploads/${producto.id_producto}.jpg`;
  }
  const absoluta =
    cruda.startsWith('http://') || cruda.startsWith('https://')
      ? cruda
      : cruda.startsWith('/')
        ? `${BACKEND_HOST_URL}${cruda}`
        : `${BACKEND_HOST_URL}/${cruda}`;
  const normalizada = normalizarUrlImagen(absoluta);
  if (__DEV__ && normalizada !== absoluta) {
    console.log(`[imagen] reescrita → ${absoluta} → ${normalizada}`);
  }
  if (__DEV__ && !cruda) console.log(`[imagen] fallback /uploads para producto ${producto.id_producto} → ${normalizada}`);
  return normalizada;
};

export const tieneDescuento = (producto: Producto): boolean =>
  producto.precio_final != null &&
  !!producto.descuento_activo &&
  producto.descuento_activo > 0;

export const precioFinalDe = (producto: Producto): number =>
  producto.precio_final ?? producto.precio_venta_producto;

/** Formato de la web: `$${monto.toLocaleString()}` + sufijo COP. */
export const formatearPrecio = (monto: number): string =>
  `$${Math.round(monto).toLocaleString('es-CO')}`;
