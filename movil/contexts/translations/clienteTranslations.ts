// Textos de las pantallas del cliente en la aplicación móvil.
const tr = (es: string, en: string) => ({ es, en });

export const TRADUCCIONES_CLIENTE: Record<string, { es: string; en: string }> = {
  "cliente.cargando": tr("Cargando...", "Loading..."),
};
