// Textos de las pantallas del técnico en la aplicación móvil.
const tr = (es: string, en: string) => ({ es, en });

export const TRADUCCIONES_TECNICO: Record<string, { es: string; en: string }> = {
  "tecnicoApp.cargando": tr("Cargando...", "Loading..."),
};
