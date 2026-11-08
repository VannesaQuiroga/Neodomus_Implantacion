// Las referencias son las claves estables del seed; los nombres numéricos de
// los archivos son históricos y no deben depender del AUTO_INCREMENT de MySQL.
const PRODUCT_IMAGE_BY_REFERENCE: Readonly<Partial<Record<string, string>>> = {
  'smi-001': '/productos/1.jpg',
  'ccd-004': '/productos/2.jpg',
  'led-003': '/productos/3.jpg',
  'kit-001': '/productos/4.jpg',
  'utp6-050': '/productos/5.jpg',
  'spd-006': '/productos/6.jpg',
  'eiw-007': '/productos/7.webp',
  'ps12-5a': '/productos/8.jpg',
  'cip-003': '/productos/9.jpg',
  bat18650: '/productos/10.jpg',
  'ter-101': '/productos/11.jpg',
  'int-202': '/productos/12.jpg',
  'sir-303': '/productos/13.jpg',
  'dhu-404': '/productos/14.jpg',
  'per-505': '/productos/15.jpg',
  'pan-606': '/productos/16.jpg',
};

export const PRODUCT_IMAGE_PLACEHOLDER = '/productos/default.png';

export interface ProductImageSource {
  imagen_url?: string | null;
  referencia_producto?: string | null;
}

export function imagenPorReferencia(referencia?: string | null): string | undefined {
  const clave = referencia?.trim().toLowerCase();
  return clave ? PRODUCT_IMAGE_BY_REFERENCE[clave] : undefined;
}

export function resolverImagenProducto(producto: ProductImageSource): string {
  const imagenConfigurada = producto.imagen_url?.trim();
  if (imagenConfigurada) return imagenConfigurada;
  return imagenPorReferencia(producto.referencia_producto) ?? PRODUCT_IMAGE_PLACEHOLDER;
}

export function aplicarFallbackImagenProducto(
  imagen: HTMLImageElement,
  referencia?: string | null,
): void {
  const fallback = imagenPorReferencia(referencia) ?? PRODUCT_IMAGE_PLACEHOLDER;
  if (imagen.getAttribute('src') === fallback) {
    imagen.onerror = null;
    return;
  }
  imagen.src = fallback;
}
