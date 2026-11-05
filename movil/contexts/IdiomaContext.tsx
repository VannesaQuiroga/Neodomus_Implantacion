// ─────────────────────────────────────────────────────────────
// Idioma — mecanismo propio como la WEB (sin librerías):
// diccionario plano {clave:{es,en}} + persistencia en
// AsyncStorage['pf_idioma'] (misma clave que la web usa en
// localStorage). Las cadenas de datos (productos, etc.) vienen del
// backend; aquí se traduce la INTERFAZ móvil.
// ─────────────────────────────────────────────────────────────

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Idioma = "es" | "en";

const CLAVE_IDIOMA = "pf_idioma";

const DICCIONARIO: Record<string, { es: string; en: string }> = {
  // Navbar / menú usuario
  "nav.inicio": { es: "Inicio", en: "Home" },
  "nav.productos": { es: "Productos", en: "Products" },
  "nav.tecnicos": { es: "Técnicos", en: "Technicians" },
  "nav.citas": { es: "Citas", en: "Appointments" },
  "nav.ayuda": { es: "Ayuda", en: "Help" },
  "nav.carrito": { es: "Carrito", en: "Cart" },
  "nav.notificaciones": { es: "Notificaciones", en: "Notifications" },
  "menu.herramientas": { es: "Herramientas", en: "Tools" },
  "menu.miPerfil": { es: "Mi perfil", en: "My profile" },
  "menu.cambiarPassword": { es: "Cambiar contraseña", en: "Change password" },
  "menu.misPedidos": { es: "Mis pedidos", en: "My orders" },
  "menu.misServicios": { es: "Mis servicios", en: "My services" },
  "menu.misFavoritos": { es: "Mis favoritos", en: "My favorites" },
  "menu.misReembolsos": { es: "Mis reembolsos", en: "My refunds" },
  "menu.misResenas": { es: "Mis reseñas", en: "My reviews" },
  "menu.misTecnicos": { es: "Mis técnicos", en: "My technicians" },
  "menu.misFacturas": { es: "Mis facturas", en: "My invoices" },
  "menu.idioma": { es: "Idioma", en: "Language" },
  "menu.cerrarSesion": { es: "Cerrar sesión", en: "Log out" },
  // Navegación inferior técnico
  "navigation.home": { es: "Inicio", en: "Home" },
  "navigation.appointments": { es: "Mis próximas citas", en: "Upcoming Appointments" },
  "navigation.deliveries": { es: "Mis entregas", en: "My Deliveries" },
  "navigation.notifications": { es: "Notificaciones", en: "Notifications" },
  "navigation.homeShort": { es: "Inicio", en: "Home" },
  "navigation.appointmentsShort": { es: "Citas", en: "Appointments" },
  "navigation.deliveriesShort": { es: "Entregas", en: "Deliveries" },
  "navigation.notificationsShort": { es: "Avisos", en: "Alerts" },
  // Técnico header / navbar
  "tecnico.neodomusTecnico": { es: "Neodomus Técnico", en: "Neodomus Technician" },
  "tecnico.tecnico": { es: "Técnico", en: "Technician" },
  "tecnico.editarPerfil": { es: "Editar perfil", en: "Edit profile" },
  // Dashboard técnico
  "tecnico.hola": { es: "Hola, {nombre}", en: "Hello, {nombre}" },
  "tecnico.resumenJornada": { es: "Resumen de tu jornada", en: "Summary of your day" },
  "tecnico.buscarPlaceholder": { es: "Buscar por cliente, dirección, servicio...", en: "Search by client, address, service..." },
  "tecnico.citasAsignadas": { es: "Citas asignadas", en: "Assigned appointments" },
  "tecnico.totalAgenda": { es: "Total agenda", en: "Total schedule" },
  "tecnico.citasHoy": { es: "Citas hoy", en: "Appointments today" },
  "tecnico.agendaDia": { es: "Agenda del día", en: "Today's agenda" },
  "tecnico.pendientes": { es: "Pendientes", en: "Pending" },
  "tecnico.porAtender": { es: "Por atender", en: "To attend" },
  "tecnico.completadas": { es: "Completadas", en: "Completed" },
  "tecnico.trabajosFinalizados": { es: "Trabajos finalizados", en: "Finished jobs" },
  "tecnico.citasDia": { es: "Citas del día", en: "Today's appointments" },
  "tecnico.proximasCitas": { es: "Próximas citas", en: "Upcoming appointments" },
  "tecnico.citasAtrasadas": { es: "Citas atrasadas", en: "Overdue appointments" },
  "tecnico.historialReciente": { es: "Historial reciente", en: "Recent history" },
  "tecnico.misEntregas": { es: "Mis entregas", en: "My deliveries" },
  "tecnico.recogidasDevolucion": { es: "Recogidas por devolución", en: "Pickups for returns" },
  "tecnico.misCalificaciones": { es: "Mis calificaciones", en: "My ratings" },
  "tecnico.notificaciones": { es: "Notificaciones", en: "Notifications" },
  "tecnico.sinCitasHoy": { es: "Sin citas hoy", en: "No appointments today" },
  "tecnico.sinCitasHoyHint": { es: "No tienes citas programadas para hoy.", en: "You have no appointments scheduled for today." },
  "tecnico.sinProximas": { es: "Sin próximas", en: "No upcoming" },
  "tecnico.sinProximasHint": { es: "No hay citas futuras programadas.", en: "No future appointments scheduled." },
  "tecnico.sinHistorial": { es: "Sin historial", en: "No history" },
  "tecnico.sinEntregas": { es: "Sin entregas asignadas", en: "No deliveries assigned" },
  "tecnico.sinRecogidas": { es: "No tienes recogidas asignadas.", en: "You have no pickups assigned." },
  "tecnico.sinCalificaciones": { es: "Sin calificaciones aún", en: "No ratings yet" },
  "tecnico.sinNotificaciones": { es: "Sin notificaciones", en: "No notifications" },
  "tecnico.sinNotificacionesHint": { es: "No tienes notificaciones pendientes.", en: "You have no pending notifications." },
  "tecnico.ver": { es: "Ver", en: "View" },
  "tecnico.citasPendientes": { es: "Tienes {count} citas pendientes por atender", en: "You have {count} pending appointments" },
  "tecnico.detalleCita": { es: "Detalle cita", en: "Appointment details" },
  "tecnico.cliente": { es: "Cliente", en: "Client" },
  "tecnico.servicio": { es: "Servicio", en: "Service" },
  "tecnico.fechaHora": { es: "Fecha · Hora", en: "Date · Time" },
  "tecnico.direccion": { es: "Dirección", en: "Address" },
  "tecnico.telefono": { es: "Teléfono", en: "Phone" },
  "tecnico.descripcion": { es: "Descripción", en: "Description" },
  "tecnico.marcarFinalizada": { es: "Marcar Finalizada", en: "Mark as Completed" },
  "tecnico.guardando": { es: "Guardando...", en: "Saving..." },
  "tecnico.cerrar": { es: "Cerrar", en: "Close" },
  "tecnico.citaCompletada": { es: "Cita completada", en: "Appointment completed" },
  "tecnico.estadoActualizado": { es: "Estado actualizado", en: "Status updated" },
  // Entregas
  "entregas.titulo": { es: "Mis Entregas", en: "My Deliveries" },
  "entregas.subtitulo": { es: "Pedidos asignados para entrega", en: "Orders assigned for delivery" },
  "entregas.yaRecogi": { es: "Ya la recogí", en: "I picked it up" },
  "entregas.actualizando": { es: "Actualizando...", en: "Updating..." },
  "entregas.confirmarRecogida": { es: "Confirmar recogida", en: "Confirm pickup" },
  "entregas.confirmarRecogidaMsg": { es: "¿Confirmas que ya realizaste la recogida de esta entrega?", en: "Do you confirm you have picked up this delivery?" },
  "entregas.marcadaRecogida": { es: "Entrega marcada como recogida", en: "Delivery marked as picked up" },
  // Devoluciones
  "devoluciones.titulo": { es: "Devoluciones", en: "Returns" },
  "devoluciones.subtitulo": { es: "Recogidas asignadas", en: "Assigned pickups" },
  "devoluciones.sinDevoluciones": { es: "Sin devoluciones", en: "No returns" },
  "devoluciones.detalle": { es: "Detalle devolución", en: "Return details" },
  "devoluciones.producto": { es: "Producto", en: "Product" },
  "devoluciones.pedido": { es: "Pedido", en: "Order" },
  "devoluciones.estadoDevolucion": { es: "Estado devolución", en: "Return status" },
  "devoluciones.estadoRecogida": { es: "Estado recogida", en: "Pickup status" },
  "devoluciones.motivo": { es: "Motivo", en: "Reason" },
  "devoluciones.preferencia": { es: "Preferencia", en: "Preference" },
  "devoluciones.subirEvidencia": { es: "Subir evidencia", en: "Upload evidence" },
  "devoluciones.verTodas": { es: "Ver todas", en: "View all" },
  "devoluciones.verMas": { es: "Ver más", en: "See more" },
  // Notificaciones
  "notificaciones.titulo": { es: "Notificaciones", en: "Notifications" },
  "notificaciones.todasAlDia": { es: "Todas al día", en: "All caught up" },
  "notificaciones.sinLeer": { es: "{count} sin leer", en: "{count} unread" },
  "notificaciones.marcarLeidas": { es: "Marcar como leídas", en: "Mark as read" },
  "notificaciones.marcando": { es: "Marcando...", en: "Marking..." },
  "notificaciones.marcadas": { es: "Notificaciones marcadas como leídas", en: "Notifications marked as read" },
  // Estados
  "estado.asignada": { es: "Asignada", en: "Assigned" },
  "estado.recogida": { es: "Recogida", en: "Collected" },
  "estado.recogido": { es: "Recogido", en: "Collected" },
  "estado.pendiente": { es: "Pendiente", en: "Pending" },
  "estado.completada": { es: "Completada", en: "Completed" },
  "estado.finalizada": { es: "Finalizada", en: "Completed" },
  "estado.enCamino": { es: "En camino", en: "On the way" },
  "estado.entregado": { es: "Entregado", en: "Delivered" },
  "estado.confirmada": { es: "Confirmada", en: "Confirmed" },
  "estado.cancelada": { es: "Cancelada", en: "Cancelled" },
  // Acciones comunes
  "accion.verMas": { es: "Ver más", en: "See more" },
  "accion.verTodas": { es: "Ver todas", en: "View all" },
  "accion.marcarLeidas": { es: "Marcar como leídas", en: "Mark as read" },
  "accion.yaRecogi": { es: "Ya la recogí", en: "I picked it up" },
  // Perfil
  "perfil.titulo": { es: "Mi perfil", en: "My profile" },
  "perfil.subtituloTecnico": { es: "Información personal y profesional", en: "Personal and professional information" },
  "perfil.fotoPerfil": { es: "Foto de perfil", en: "Profile photo" },
  "perfil.cambiarFoto": { es: "Cambiar foto", en: "Change photo" },
  "perfil.eliminarFoto": { es: "Eliminar foto", en: "Remove photo" },
  "perfil.fotoActualizada": { es: "Foto actualizada", en: "Photo updated" },
  "perfil.fotoEliminada": { es: "Foto eliminada", en: "Photo removed" },
  "perfil.nombres": { es: "Nombres", en: "First name" },
  "perfil.apellidos": { es: "Apellidos", en: "Last name" },
  "perfil.correo": { es: "Correo electrónico", en: "Email" },
  "perfil.tipoDoc": { es: "Tipo de documento", en: "Document type" },
  "perfil.documento": { es: "Documento", en: "Document number" },
  "perfil.telefono": { es: "Teléfono", en: "Phone" },
  "perfil.direccion": { es: "Dirección", en: "Address" },
  "perfil.especialidad": { es: "Especialidad", en: "Specialty" },
  "perfil.certificacion": { es: "Certificación", en: "Certification" },
  "perfil.seleccionaEspecialidad": { es: "Selecciona tu especialización", en: "Select your specialty" },
  "perfil.correoNoEditable": { es: "El correo no se puede editar aquí.", en: "Email cannot be edited here." },
  "perfil.editar": { es: "Editar perfil", en: "Edit profile" },
  "perfil.guardar": { es: "Guardar cambios", en: "Save changes" },
  "perfil.confirmarTitulo": { es: "Confirmar cambios", en: "Confirm changes" },
  "perfil.confirmarBody": { es: "¿Deseas realizar cambios en tu perfil?", en: "Do you want to make changes to your profile?" },
  "perfil.aceptar": { es: "Aceptar", en: "Accept" },
  "perfil.rechazar": { es: "Rechazar", en: "Reject" },
  "perfil.telefonoInvalido": { es: "El teléfono debe tener exactamente 10 dígitos", en: "Phone must be exactly 10 digits" },
  "perfil.guardadoOk": { es: "Perfil actualizado correctamente", en: "Profile updated successfully" },
  "perfil.inhabilitar": { es: "Inhabilitar mi cuenta", en: "Disable my account" },
  "perfil.inhabilitarMotivo": { es: "Motivo de la inhabilitación", en: "Reason for disabling" },
  "perfil.inhabilitarMensaje": {
    es: "Se enviará una solicitud al administrador para inhabilitar tu cuenta. El administrador deberá revisar y aprobar la solicitud.",
    en: "A request will be sent to the administrator to disable your account. The administrator must review and approve it.",
  },
  "perfil.enviarSolicitud": { es: "Enviar solicitud", en: "Send request" },
  "perfil.solicitudEnviada": { es: "Solicitud de inhabilitación enviada al administrador", en: "Account disabling request sent to the administrator" },
  "perfil.solicitudPendiente": { es: "Tienes una solicitud pendiente de aprobación.", en: "You have a pending request." },
  "perfil.solicitudRechazada": { es: "Tu última solicitud fue rechazada. Puedes intentarlo de nuevo.", en: "Your last request was rejected. You can try again." },
  "perfil.correoCodigoEnviado": { es: "Enviamos un código de verificación a tu correo actual", en: "We sent a verification code to your current email" },
  "perfil.correoVerificado": { es: "Correo verificado y actualizado correctamente", en: "Email verified and updated successfully" },
  "perfil.codigoIncorrecto": { es: "El código de verificación es incorrecto.", en: "The verification code is incorrect." },
  "perfil.codigoExpirado": { es: "El código de verificación ha expirado.", en: "The verification code has expired." },
  "perfil.nombreRequerido": { es: "Nombre y apellido son obligatorios", en: "First and last name are required" },
  "perfil.seleccionaEspecialidadTitle": { es: "Selecciona especialización", en: "Select specialty" },
  // Común
  "common.guardando": { es: "Guardando...", en: "Saving..." },
  "common.cancelar": { es: "Cancelar", en: "Cancel" },
  "common.confirmar": { es: "Confirmar", en: "Confirm" },
  "common.aceptar": { es: "Aceptar", en: "Accept" },
  "common.cerrar": { es: "Cerrar", en: "Close" },
  "common.guardarCambios": { es: "Guardar cambios", en: "Save changes" },
  "common.cerrarSesion": { es: "Cerrar sesión", en: "Log out" },
  "common.reenviar": { es: "Reenviar código", en: "Resend code" },
  "common.cargando": { es: "Cargando...", en: "Loading..." },
  "common.ver": { es: "Ver", en: "View" },
  "common.verTodas": { es: "Ver todas", en: "View all" },
  "common.verMas": { es: "Ver más", en: "See more" },
  "common.buscar": { es: "Buscar", en: "Search" },
  "common.sinResultados": { es: "Sin resultados", en: "No results" },
  "auth.iniciarSesion": { es: "Iniciar sesión", en: "Log in" },
  "auth.registro": { es: "Registro", en: "Sign up" },
  "auth.recuperarPassword": { es: "Recuperar contraseña", en: "Recover password" },
  "auth.cambiarPassword": { es: "Cambiar contraseña", en: "Change password" },
  "auth.idioma": { es: "Idioma", en: "Language" },
};

interface IdiomaContextValue {
  idioma: Idioma;
  setIdioma: (idioma: Idioma) => Promise<void>;
  /** Traduce una clave con fallback es → clave. Soporta interpolación {param}. */
  t: (clave: string, params?: Record<string, string | number>) => string;
}

const IdiomaContext = createContext<IdiomaContextValue | null>(null);

// accede a AsyncStorage para conservar o recuperar datos locales.
export function IdiomaProvider({ children }: { children: React.ReactNode }) {
  const [idioma, setIdiomaEstado] = useState<Idioma>("es");

  useEffect(() => {
    AsyncStorage.getItem(CLAVE_IDIOMA)
      .then((guardado) => {
        if (guardado === "en" || guardado === "es") setIdiomaEstado(guardado);
      })
      .catch(() => {});
  }, []);

  const setIdioma = useCallback(async (nuevo: Idioma) => {
    setIdiomaEstado(nuevo);
    await AsyncStorage.setItem(CLAVE_IDIOMA, nuevo).catch(() => {});
  }, []);

  const t = useCallback(
    (clave: string, params?: Record<string, string | number>) => {
      const entrada = DICCIONARIO[clave];
      let texto = entrada ? (entrada[idioma] ?? entrada.es) : clave;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          texto = texto.replaceAll(`{${k}}`, String(v));
        }
      }
      return texto;
    },
    [idioma],
  );

  const valor = useMemo(
    () => ({ idioma, setIdioma, t }),
    [idioma, setIdioma, t],
  );

  return (
    <IdiomaContext.Provider value={valor}>{children}</IdiomaContext.Provider>
  );
}

export function useIdioma(): IdiomaContextValue {
  const ctx = useContext(IdiomaContext);
  if (!ctx) throw new Error("useIdioma debe usarse dentro de <IdiomaProvider>");
  return ctx;
}