// Textos compartidos: mensajes de contexto, validaciones y componentes comunes.
const tr = (es: string, en: string) => ({ es, en });

export const TRADUCCIONES_COMPARTIDAS: Record<string, { es: string; en: string }> = {
  "shared.errorGenerico": tr("Ocurrió un error. Inténtalo de nuevo.", "Something went wrong. Please try again."),
};
