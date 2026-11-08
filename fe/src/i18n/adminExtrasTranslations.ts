// Textos administrativos complementarios: notificaciones, facturas y panel del cliente.
const tr = (es: string, en: string) => ({ es, en });

export const ADMIN_EXTRAS_TRADUCCIONES: Record<string, { es: string; en: string }> = {
  'adm.facturas.titulo': tr('Facturas', 'Invoices'),
};
