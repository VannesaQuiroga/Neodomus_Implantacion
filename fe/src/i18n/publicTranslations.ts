// Textos de páginas públicas, legales, inicio y chatbot.
const tr = (es: string, en: string) => ({ es, en });

export const PUBLIC_TRADUCCIONES: Record<string, { es: string; en: string }> = {
  'publico.cargando': tr('Cargando...', 'Loading...'),
  'productos.producto': tr('Producto', 'Product'),
  'productos.descripcionGenerica': tr('El {nombre} pertenece a la categoría {categoria}. Está diseñado para integrarse a tu hogar inteligente con tecnología confiable e instalación sencilla.', 'The {nombre} belongs to the {categoria} category. It is designed to fit into your smart home with reliable technology and easy installation.'),
  'productos.envioSeguro': tr('Envío seguro a todo el país', 'Secure shipping nationwide'),
  'productos.garantiaOficial': tr('Garantía oficial NeoDomus', 'Official NeoDomus warranty'),
};
