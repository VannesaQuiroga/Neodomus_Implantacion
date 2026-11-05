/* Datos compartidos del asistente virtual (widget global + Ayuda) */

export interface BotFAQ {
  keywords: string[];
  respuesta: string;
}

export const BOT_INICIAL =
  '¡Hola! Soy el asistente virtual de Neodomus. Puedo resolver dudas sobre pedidos, pagos, envíos, citas de instalación, garantías y más. ¿En qué te ayudo?';

export const BOT_FAQS: BotFAQ[] = [
  {
    keywords: ['pedido', 'comprar', 'carrito', 'carrito de compras', 'agregar'],
    respuesta:
      'Para realizar un pedido: entra a la sección Productos, agrega los artículos a tu carrito y luego ve al carrito para completar la compra. Recibirás un correo de confirmación con el seguimiento.',
  },
  {
    keywords: ['pago', 'pagar', 'pse', 'nequi', 'daviplata', 'tarjeta', 'metodo', 'método'],
    respuesta:
      'Aceptamos tarjetas de crédito y débito (Visa, Mastercard), PSE, Nequi y Daviplata. Todos los pagos se procesan de forma segura.',
  },
  {
    keywords: ['cita', 'agendar', 'tecnico', 'técnico', 'instalacion', 'instalación', 'instalar', 'reparacion'],
    respuesta:
      'Puedes agendar una cita desde la sección Citas: elige el tipo de servicio, la fecha, la hora y describe tu necesidad. Opcionalmente selecciona un técnico de tu preferencia.',
  },
  {
    keywords: ['cancelar', 'reprogramar', 'modificar', 'reagendar'],
    respuesta:
      'Sí, puedes cancelar o reprogramar tus citas desde "Mi perfil > Mis citas", con al menos 2 horas de antelación.',
  },
  {
    keywords: ['favorito', 'gustaria guardar', 'guardar producto', 'corazon', 'corazón'],
    respuesta:
      'En la página de productos usa el ícono de corazón en la tarjeta del producto. Lo encuentras después en "Mi perfil > Mis favoritos".',
  },
  {
    keywords: ['entrega', 'envio', 'envío', 'tiempo', 'llegar', 'demora', 'cuanto tarda'],
    respuesta:
      'Las entregas son solo en Bogotá. Recibirás notificaciones con el seguimiento de tu pedido.',
  },
  {
    keywords: ['garantia', 'garantía', 'garante', 'reparacion gratis'],
    respuesta:
      'Todas nuestras instalaciones tienen garantía de 12 meses en mano de obra, y los equipos conservan la garantía del fabricante.',
  },
  {
    keywords: ['seguimiento', 'estado de mi pedido', 'opearchivo', 'rastrear', 'tracking'],
    respuesta:
      'Puedes ver el estado de tu pedido en "Mi perfil > Mis pedidos". También recibes correos con cada cambio de estado y el número de guía.',
  },
  {
    keywords: ['reembolso', 'devolucion', 'devolución', 'devolver', 'reembolsar', 'dinero de vuelta'],
    respuesta:
      'Para devoluciones o reembolsos escríbenos con el número de pedido: lo revisamos y te indicamos los pasos. También puedes enviar una solicitud desde el formulario de la sección Ayuda.',
  },
  {
    keywords: ['contrasena', 'contraseña', 'password', 'olvide mi clave', 'clave'],
    respuesta:
      'Usa "Olvidé mi contraseña" en la pantalla de inicio de sesión para restablecerla. Si el proceso no completa el cambio, escribe a soporte@neodomus.com.',
  },
  {
    keywords: ['factura', 'facturacion', 'facturación', 'recibo', 'comprobante'],
    respuesta:
      'La factura de tus compras llega por correo y también la encuentras en "Mi perfil > Mis pedidos" con la opción de descargarla.',
  },
  {
    keywords: ['cuenta', 'usuario', 'crear cuenta', 'registrarme', 'registrar'],
    respuesta:
      'Crea tu cuenta gratis con tu correo y una contraseña. Como cliente registrado puedes hacer pedidos, agendar citas y guardar productos favoritos.',
  },
];

export const BOT_FALLBACK =
  'No tengo una respuesta lista para eso. Te recomiendo escribirnos por el formulario de la sección Ayuda (o teléfono +57 601 123 4567) y un asesor te atenderá lo antes posible.';

export const BOT_CONFIRMACION = '¿Te puedo ayudar en algo más?';
export const BOT_AFIRMACION = '¡Claro! ¿En qué más te puedo ayudar?';
export const BOT_DESPEDIDA =
  'Gracias por comunicarte. Para comenzar un chat solo di !Hola¡.';

const SALUDOS = [
  'hola',
  'holi',
  'buenas',
  'buenos dias',
  'buen dia',
  'buenas tardes',
  'buenas noches',
  'hey',
  'saludos',
  'Hola',
  'Hola!'
];

export const esSaludo = (texto: string): boolean => {
  const limpio = texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  return SALUDOS.includes(limpio);
};

export const BOT_SUGERENCIAS = [
  '¿Cómo hago un pedido?',
  '¿Cuáles son los métodos de pago?',
  '¿Cómo agendo una cita de instalación?',
  '¿Cuál es el tiempo de entrega?',
  '¿Tienen garantía?',
  '¿Cómo cambio mi contraseña?',
];

export const responderBot = (texto: string): string => {
  const m = texto.toLowerCase();
  const match = BOT_FAQS.find((f) => f.keywords.some((k) => m.includes(k)));
  return match ? match.respuesta : BOT_FALLBACK;
};