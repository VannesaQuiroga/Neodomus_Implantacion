// Funciones compartidas de profileStorage usadas por la interfaz.
// accede a localStorage para conservar o recuperar datos locales.
export function loadItem<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// accede a localStorage para conservar o recuperar datos locales.
export function saveItem<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin espacio o modo privado: ignoramos silenciosamente
  }
}

export const PF_REDIRECT_AFTER_LOGIN_KEY = 'neodomus_redirect_after_login';

export const PF_AVATAR_KEY = 'clientAvatar';

// accede a localStorage para conservar o recuperar datos locales.
export const getAvatar = (): string | null => localStorage.getItem(PF_AVATAR_KEY);

// accede a localStorage para conservar o recuperar datos locales.
export const setAvatar = (dataUrl: string): void => {
  localStorage.setItem(PF_AVATAR_KEY, dataUrl);
  window.dispatchEvent(new CustomEvent('client-profile-updated'));
};

// accede a localStorage para conservar o recuperar datos locales.
export const removeAvatar = (): void => {
  localStorage.removeItem(PF_AVATAR_KEY);
  window.dispatchEvent(new CustomEvent('client-profile-updated'));
};

export const PF_TECH_AVATAR_KEY = 'technicalAvatar';

// accede a localStorage para conservar o recuperar datos locales.
export const getTechnicalAvatar = (): string | null => localStorage.getItem(PF_TECH_AVATAR_KEY);

// accede a localStorage para conservar o recuperar datos locales.
export const setTechnicalAvatar = (dataUrl: string): void => {
  localStorage.setItem(PF_TECH_AVATAR_KEY, dataUrl);
  window.dispatchEvent(new CustomEvent('technical-profile-updated'));
};

// accede a localStorage para conservar o recuperar datos locales.
export const removeTechnicalAvatar = (): void => {
  localStorage.removeItem(PF_TECH_AVATAR_KEY);
  window.dispatchEvent(new CustomEvent('technical-profile-updated'));
};

export const PF_ADMIN_AVATAR_KEY = 'adminAvatar';

// accede a localStorage para conservar o recuperar datos locales.
export const getAdminAvatar = (): string | null => localStorage.getItem(PF_ADMIN_AVATAR_KEY);

// accede a localStorage para conservar o recuperar datos locales.
export const setAdminAvatar = (dataUrl: string): void => {
  localStorage.setItem(PF_ADMIN_AVATAR_KEY, dataUrl);
  window.dispatchEvent(new CustomEvent('admin-profile-updated'));
};

// accede a localStorage para conservar o recuperar datos locales.
export const removeAdminAvatar = (): void => {
  localStorage.removeItem(PF_ADMIN_AVATAR_KEY);
  window.dispatchEvent(new CustomEvent('admin-profile-updated'));
};

export const getIniciales = (nombre: string): string => {
  const partes = (nombre || '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return 'N';
  return partes
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
};

export interface PedidoItem {
  nombre: string;
  cantidad: number;
  precio: number;
}

export type EstadoPedido = 'Procesando' | 'Enviado' | 'Entregado' | 'Cancelado';

export interface Pedido {
  id: string;
  folio: string;
  fecha: string;
  estado: EstadoPedido;
  total: number;
  items: PedidoItem[];
}

export interface Mensaje {
  id: string;
  de: string;
  tipo: 'pedido' | 'tecnico' | 'cuenta' | 'promo';
  asunto: string;
  preview: string;
  fecha: string;
  leido: boolean;
  cuerpo: string;
}

export interface Resena {
  id: string;
  producto: string;
  productoImg: string;
  calificacion: number;
  comentario: string;
  fecha: string;
}

export interface Tecnico {
  id: string;
  nombre: string;
  especialidad: string;
  valoracion: number;
  trabajos: number;
  telefono: string;
  disponible: boolean;
}

export type TipoPago = 'tarjeta' | 'nequi' | 'pse';

export interface MetodoPago {
  id: string;
  tipo: TipoPago;
  titular: string;
  numero: string;
  expiracion?: string;
  predeterminado: boolean;
}

export interface NotificacionPrefs {
  pedidos: boolean;
  promociones: boolean;
  tecnicos: boolean;
  boletines: boolean;
  seguridad: boolean;
}

export const PF_PEDIDOS_KEY = 'pf_pedidos';
export const PF_MENSAJES_KEY = 'pf_mensajes';
export const PF_RESENAS_KEY = 'pf_resenas';
export const PF_TECNICOS_KEY = 'pf_tecnicos';
export const PF_PAGOS_KEY = 'pf_pagos';
export const PF_IDIOMA_KEY = 'pf_idioma';
export const PF_NOTIF_KEY = 'pf_notificaciones';

const defaultPedidos: Pedido[] = [
  {
    id: 'PED-1042', folio: 'FAC-2025-0001', fecha: '28 jul 2025', estado: 'Entregado', total: 1849200,
    items: [
      { nombre: 'Kit domótica Neodomus Smart Home', cantidad: 1, precio: 1290000 },
      { nombre: 'Sensor de movimiento Wi-Fi', cantidad: 4, precio: 139800 },
    ],
  },
  {
    id: 'PED-1041', folio: 'FAC-2025-0007', fecha: '22 jul 2025', estado: 'Enviado', total: 685400,
    items: [
      { nombre: 'Cámara IP 4K exterior', cantidad: 1, precio: 560000 },
      { nombre: 'Cableado y canaleta', cantidad: 2, precio: 62700 },
    ],
  },
  {
    id: 'PED-1040', folio: 'FAC-2025-0012', fecha: '15 jul 2025', estado: 'Procesando', total: 129900,
    items: [{ nombre: 'Enchufe inteligente Wi-Fi', cantidad: 3, precio: 43300 }],
  },
  {
    id: 'PED-1039', folio: 'FAC-2025-0015', fecha: '2 jul 2025', estado: 'Cancelado', total: 210000,
    items: [{ nombre: 'Termostato inteligente', cantidad: 1, precio: 210000 }],
  },
];

const defaultMensajes: Mensaje[] = [
  {
    id: 'msg-1', de: 'Neodomus', tipo: 'pedido', asunto: 'Tu pedido FAC-2025-0007 está en camino',
    preview: 'Hola Carolina, tu pedido fue entregado a la empresa de mensajería...',
    fecha: 'Hace 2 horas', leido: false,
    cuerpo: 'Hola Carolina, tu pedido FAC-2025-0007 ya fue despachado y está en camino a tu domicilio. Puedes hacer seguimiento desde Mis pedidos. Gracias por confiar en Neodomus.',
  },
  {
    id: 'msg-2', de: 'Equipo Neodomus', tipo: 'tecnico', asunto: 'Tu técnico asignado ha sido confirmado',
    preview: 'El técnico Andrés Rojas visitará tu instalación el próximo lunes...',
    fecha: 'Ayer', leido: false,
    cuerpo: 'Tu cita de instalación fue confirmada. El técnico Andrés Rojas visitará tu domicilio el próximo lunes a las 9:00 a. m. Encuentra los detalles en Mis técnicos.',
  },
  {
    id: 'msg-3', de: 'Soporte Neodomus', tipo: 'cuenta', asunto: 'Notificación de seguridad',
    preview: 'Detectamos un inicio de sesión desde un dispositivo nuevo...',
    fecha: '12 jul 2025', leido: true,
    cuerpo: 'Notificamos que se realizó un inicio de sesión desde un dispositivo nuevo. Si fuiste tú, no necesitas hacer nada. Si no reconoces esta actividad, cambia tu contraseña de inmediato.',
  },
  {
    id: 'msg-4', de: 'Neodomus', tipo: 'promo', asunto: '20 % de descuento en sensores este mes',
    preview: 'Aprovecha la oferta exclusiva para clientes Neodomus...',
    fecha: '5 jul 2025', leido: true,
    cuerpo: 'Aprovecha un 20 % de descuento en sensores y accesorios para tu hogar inteligente durante todo este mes. Válido solo en tienda en línea.',
  },
];

const defaultResenas: Resena[] = [
  {
    id: 'r-1', producto: 'Kit domótica Neodomus', productoImg: '/productos/1.jpg', calificacion: 5,
    comentario: 'Excelente calidad. La instalación fue rápida y los dispositivos se integraron sin problema con la app.',
    fecha: '18 jun 2025',
  },
  {
    id: 'r-2', producto: 'Sensor de movimiento Wi-Fi', productoImg: '/productos/5.jpg', calificacion: 4,
    comentario: 'Muy buen sensor, aunque el empaque llegó un poco golpeado. Funciona perfecto.',
    fecha: '3 jun 2025',
  },
];

const defaultTecnicos: Tecnico[] = [
  {
    id: 't-1', nombre: 'Andrés Rojas', especialidad: 'Instalación y programación', valoracion: 4.9, trabajos: 214,
    telefono: '310 456 7890', disponible: true,
  },
  {
    id: 't-2', nombre: 'María Torres', especialidad: 'Mantenimiento y soporte', valoracion: 4.8, trabajos: 168,
    telefono: '320 654 3210', disponible: false,
  },
];

const defaultPagos: MetodoPago[] = [
  {
    id: 'pay-1', tipo: 'tarjeta', titular: 'Carolina Méndez', numero: '4242424242424242',
    expiracion: '08/27', predeterminado: true,
  },
  {
    id: 'pay-2', tipo: 'tarjeta', titular: 'Carolina Méndez', numero: '5589123456788891',
    expiracion: '11/26', predeterminado: false,
  },
  {
    id: 'pay-3', tipo: 'nequi', titular: 'Carolina M.', numero: '3001234567', predeterminado: false,
  },
];

export function getPedidos(): Pedido[] {
  return loadItem<Pedido[]>(PF_PEDIDOS_KEY, defaultPedidos);
}

export function getMensajes(): Mensaje[] {
  return loadItem<Mensaje[]>(PF_MENSAJES_KEY, defaultMensajes);
}

export function getResenas(): Resena[] {
  return loadItem<Resena[]>(PF_RESENAS_KEY, defaultResenas);
}

export function getTecnicos(): Tecnico[] {
  return loadItem<Tecnico[]>(PF_TECNICOS_KEY, defaultTecnicos);
}

export function getPagos(): MetodoPago[] {
  return loadItem<MetodoPago[]>(PF_PAGOS_KEY, defaultPagos);
}

// accede a localStorage para conservar o recuperar datos locales.
export function getIdioma(): string {
  return localStorage.getItem(PF_IDIOMA_KEY) || 'es';
}

export function getNotificaciones(): NotificacionPrefs {
  const defaults: NotificacionPrefs = { pedidos: true, promociones: true, tecnicos: true, boletines: false, seguridad: true };
  return loadItem<NotificacionPrefs>(PF_NOTIF_KEY, defaults);
}