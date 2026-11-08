// Textos de la cuenta del cliente en la aplicación móvil.
const tr = (es: string, en: string) => ({ es, en });

export const TRADUCCIONES_CLIENTE_CUENTA: Record<string, { es: string; en: string }> = {
  "clienteCuenta.cargando": tr("Cargando...", "Loading..."),
};
