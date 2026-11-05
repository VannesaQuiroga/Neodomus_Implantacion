// Agrupa los diccionarios de traducción de los módulos administrativos.
import { ADMIN_TRADUCCIONES_TECNICOS } from './adminTranslations-tecnicos';
import { ADMIN_TRADUCCIONES_INSTALACIONES } from './adminTranslations-instalaciones';
import { ADMIN_TRADUCCIONES_CONSULTAS } from './adminTranslations-consultas';
import { ADMIN_TRADUCCIONES_REPORTES } from './adminTranslations-reportes';
import { ADMIN_TRADUCCIONES_DASHBOARD } from './adminTranslations-dashboard';
import { ADMIN_TRADUCCIONES_NOTIFICACIONES } from './adminTranslations-notificaciones';
import { ADMIN_TRADUCCIONES_CATALOGO } from './adminTranslations-catalogo';
import { ADMIN_TRADUCCIONES_PROVEEDORES } from './adminTranslations-proveedores';
import { ADMIN_TRADUCCIONES_PRODUCTOS } from './adminTranslations-productos';
import { ADMIN_TRADUCCIONES_PRODUCTO_DETALLE } from './adminTranslations-productoDetalle';

export const ADMIN_TRADUCCIONES: Record<string, { es: string; en: string }> = {
  ...ADMIN_TRADUCCIONES_TECNICOS,
  ...ADMIN_TRADUCCIONES_INSTALACIONES,
  ...ADMIN_TRADUCCIONES_CONSULTAS,
  ...ADMIN_TRADUCCIONES_REPORTES,
  ...ADMIN_TRADUCCIONES_DASHBOARD,
  ...ADMIN_TRADUCCIONES_NOTIFICACIONES,
  ...ADMIN_TRADUCCIONES_CATALOGO,
  ...ADMIN_TRADUCCIONES_PROVEEDORES,
  ...ADMIN_TRADUCCIONES_PRODUCTOS,
  ...ADMIN_TRADUCCIONES_PRODUCTO_DETALLE,
};