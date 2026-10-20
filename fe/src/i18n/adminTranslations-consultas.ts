// Textos del módulo administrativo de consultas. Cada clave reúne sus versiones en español e inglés.
export const ADMIN_TRADUCCIONES_CONSULTAS: Record<string, { es: string; en: string }> = {
  'adm.consultas.titulo': { es: 'Solicitudes', en: 'Requests' },
  'adm.consultas.tituloCuentas': { es: 'Cuentas inhabilitadas', en: 'Disabled accounts' },
  'adm.consultas.subtitulo': {
    es: 'Solicitudes de inhabilitación y habilitación de cuentas enviadas por los usuarios.',
    en: 'Account disable and enable requests submitted by users.',
  },
  'adm.consultas.subtituloCuentas': {
    es: 'Cuentas de clientes y técnicos inhabilitadas, con opción de habilitarlas nuevamente.',
    en: 'Disabled client and technician accounts, with the option to re-enable them.',
  },
  'adm.consultas.actualizar': { es: 'Actualizar', en: 'Refresh' },
  'adm.consultas.tabsAriaLabel': { es: 'Secciones de solicitudes', en: 'Request sections' },
  'adm.consultas.tabSolicitudes': { es: 'Solicitudes', en: 'Requests' },
  'adm.consultas.tabCuentas': { es: 'Cuentas inhabilitadas', en: 'Disabled accounts' },
  'adm.consultas.tipoHabilitacionTecnico': {
    es: 'Habilitación de cuenta de técnico',
    en: 'Technician account activation',
  },
  'adm.consultas.tipoHabilitacion': { es: 'Habilitación de cuenta', en: 'Account activation' },
  'adm.consultas.tipoInhabilitacion': {
    es: 'Inhabilitación de cuenta',
    en: 'Account deactivation',
  },
  'adm.consultas.tipoCuentaTecnico': { es: 'Cuenta de técnico', en: 'Technician account' },
  'adm.consultas.tipoCuentaCliente': { es: 'Cuenta de cliente', en: 'Client account' },
  'adm.consultas.estadoPendiente': { es: 'Pendiente', en: 'Pending' },
  'adm.consultas.estadoAprobada': { es: 'Aprobada', en: 'Approved' },
  'adm.consultas.estadoRechazada': { es: 'Rechazada', en: 'Rejected' },
  'adm.consultas.estadoInhabilitada': { es: 'Inhabilitada', en: 'Disabled' },
  'adm.consultas.aprobar': { es: 'Aprobar', en: 'Approve' },
  'adm.consultas.rechazar': { es: 'Rechazar', en: 'Reject' },
  'adm.consultas.habilitarCuenta': { es: 'Habilitar cuenta', en: 'Enable account' },
  'adm.consultas.cargandoSolicitudes': { es: 'Cargando solicitudes', en: 'Loading requests' },
  'adm.consultas.cargandoSolicitudesSub': {
    es: 'Consultando las solicitudes recibidas...',
    en: 'Fetching incoming requests...',
  },
  'adm.consultas.sinSolicitudes': { es: 'No hay solicitudes', en: 'No requests' },
  'adm.consultas.sinSolicitudesSub': {
    es: 'Las solicitudes de inhabilitación o habilitación de cuentas llegarán aquí.',
    en: 'Account enable or disable requests will appear here.',
  },
  'adm.consultas.buscarPlaceholder': {
    es: 'Buscar por nombre, correo o motivo...',
    en: 'Search by name, email or reason...',
  },
  'adm.consultas.filtroTodos': { es: 'Todos los tipos', en: 'All types' },
  'adm.consultas.filtroHabilitacion': { es: 'Habilitación (cliente)', en: 'Activation (client)' },
  'adm.consultas.filtroInhabilitacion': {
    es: 'Inhabilitación (cliente)',
    en: 'Deactivation (client)',
  },
  'adm.consultas.filtroHabilitacionTecnico': {
    es: 'Habilitación de técnico',
    en: 'Technician activation',
  },
  'adm.consultas.sinResultados': { es: 'Sin resultados', en: 'No results' },
  'adm.consultas.sinResultadosSub': {
    es: 'No hay solicitudes que coincidan con la búsqueda o el filtro seleccionado.',
    en: 'No requests match the search or the selected filter.',
  },
  'adm.consultas.anterior': { es: 'Anterior', en: 'Previous' },
  'adm.consultas.siguiente': { es: 'Siguiente', en: 'Next' },
  'adm.consultas.cargandoCuentas': { es: 'Cargando cuentas', en: 'Loading accounts' },
  'adm.consultas.cargandoCuentasSub': {
    es: 'Consultando las cuentas inhabilitadas...',
    en: 'Fetching disabled accounts...',
  },
  'adm.consultas.sinCuentas': { es: 'No hay cuentas inhabilitadas', en: 'No disabled accounts' },
  'adm.consultas.sinCuentasSub': {
    es: 'Cuando se apruebe una solicitud de inhabilitación, la cuenta aparecerá aquí.',
    en: 'When a deactivation request is approved, the account will appear here.',
  },
  'adm.consultas.buscarCuentaPlaceholder': { es: 'Buscar cuenta...', en: 'Search account...' },
  'adm.consultas.seccionClientes': { es: 'Clientes', en: 'Clients' },
  'adm.consultas.seccionTecnicos': { es: 'Técnicos', en: 'Technicians' },
  'adm.consultas.sinResultadosCuentasSub': {
    es: 'No hay cuentas que coincidan con la búsqueda.',
    en: 'No accounts match the search.',
  },
  'adm.consultas.toastAprobada': { es: 'Solicitud aprobada', en: 'Request approved' },
  'adm.consultas.toastRechazada': { es: 'Solicitud rechazada', en: 'Request rejected' },
  'adm.consultas.toastErrorProcesar': {
    es: 'No se pudo procesar la solicitud',
    en: 'Could not process the request',
  },
  'adm.consultas.toastClienteHabilitada': {
    es: 'Cuenta del cliente habilitada correctamente',
    en: 'Client account enabled successfully',
  },
  'adm.consultas.toastTecnicoHabilitada': {
    es: 'Cuenta del técnico habilitada correctamente',
    en: 'Technician account enabled successfully',
  },
  'adm.consultas.toastErrorHabilitar': {
    es: 'No se pudo habilitar la cuenta',
    en: 'Could not enable the account',
  },
};