// Textos del módulo administrativo de consultas. Cada clave reúne sus versiones en español e inglés.
const traducir = (es: string, en: string) => ({ es, en });

export const ADMIN_TRADUCCIONES_CONSULTAS: Record<string, { es: string; en: string }> = {
  'adm.consultas.titulo': traducir('Solicitudes', 'Requests'),
  'adm.consultas.tituloCuentas': traducir('Cuentas inhabilitadas', 'Disabled accounts'),
  'adm.consultas.subtitulo': traducir(
    'Solicitudes de inhabilitación y habilitación de cuentas enviadas por los usuarios.',
    'Account disable and enable requests submitted by users.'
  ),
  'adm.consultas.subtituloCuentas': traducir(
    'Cuentas de clientes y técnicos inhabilitadas, con opción de habilitarlas nuevamente.',
    'Disabled client and technician accounts, with the option to re-enable them.'
  ),
  'adm.consultas.actualizar': traducir('Actualizar', 'Refresh'),
  'adm.consultas.tabsAriaLabel': traducir('Secciones de solicitudes', 'Request sections'),
  'adm.consultas.tabSolicitudes': traducir('Solicitudes', 'Requests'),
  'adm.consultas.tabCuentas': traducir('Cuentas inhabilitadas', 'Disabled accounts'),
  'adm.consultas.tipoHabilitacionTecnico': traducir(
    'Habilitación de cuenta de técnico',
    'Technician account activation'
  ),
  'adm.consultas.tipoHabilitacion': traducir('Habilitación de cuenta', 'Account activation'),
  'adm.consultas.tipoInhabilitacion': traducir('Inhabilitación de cuenta', 'Account deactivation'),
  'adm.consultas.tipoCuentaTecnico': traducir('Cuenta de técnico', 'Technician account'),
  'adm.consultas.tipoCuentaCliente': traducir('Cuenta de cliente', 'Client account'),
  'adm.consultas.estadoPendiente': traducir('Pendiente', 'Pending'),
  'adm.consultas.estadoAprobada': traducir('Aprobada', 'Approved'),
  'adm.consultas.estadoRechazada': traducir('Rechazada', 'Rejected'),
  'adm.consultas.estadoInhabilitada': traducir('Inhabilitada', 'Disabled'),
  'adm.consultas.aprobar': traducir('Aprobar', 'Approve'),
  'adm.consultas.rechazar': traducir('Rechazar', 'Reject'),
  'adm.consultas.habilitarCuenta': traducir('Habilitar cuenta', 'Enable account'),
  'adm.consultas.cargandoSolicitudes': traducir('Cargando solicitudes', 'Loading requests'),
  'adm.consultas.cargandoSolicitudesSub': traducir(
    'Consultando las solicitudes recibidas...',
    'Fetching incoming requests...'
  ),
  'adm.consultas.sinSolicitudes': traducir('No hay solicitudes', 'No requests'),
  'adm.consultas.sinSolicitudesSub': traducir(
    'Las solicitudes de inhabilitación o habilitación de cuentas llegarán aquí.',
    'Account enable or disable requests will appear here.'
  ),
  'adm.consultas.buscarPlaceholder': traducir(
    'Buscar por nombre, correo o motivo...',
    'Search by name, email or reason...'
  ),
  'adm.consultas.filtroTodos': traducir('Todos los tipos', 'All types'),
  'adm.consultas.filtroHabilitacion': traducir('Habilitación (cliente)', 'Activation (client)'),
  'adm.consultas.filtroInhabilitacion': traducir('Inhabilitación (cliente)', 'Deactivation (client)'),
  'adm.consultas.filtroHabilitacionTecnico': traducir(
    'Habilitación de técnico',
    'Technician activation'
  ),
  'adm.consultas.sinResultados': traducir('Sin resultados', 'No results'),
  'adm.consultas.sinResultadosSub': traducir(
    'No hay solicitudes que coincidan con la búsqueda o el filtro seleccionado.',
    'No requests match the search or the selected filter.'
  ),
  'adm.consultas.anterior': traducir('Anterior', 'Previous'),
  'adm.consultas.siguiente': traducir('Siguiente', 'Next'),
  'adm.consultas.cargandoCuentas': traducir('Cargando cuentas', 'Loading accounts'),
  'adm.consultas.cargandoCuentasSub': traducir(
    'Consultando las cuentas inhabilitadas...',
    'Fetching disabled accounts...'
  ),
  'adm.consultas.sinCuentas': traducir('No hay cuentas inhabilitadas', 'No disabled accounts'),
  'adm.consultas.sinCuentasSub': traducir(
    'Cuando se apruebe una solicitud de inhabilitación, la cuenta aparecerá aquí.',
    'When a deactivation request is approved, the account will appear here.'
  ),
  'adm.consultas.buscarCuentaPlaceholder': traducir('Buscar cuenta...', 'Search account...'),
  'adm.consultas.seccionClientes': traducir('Clientes', 'Clients'),
  'adm.consultas.seccionTecnicos': traducir('Técnicos', 'Technicians'),
  'adm.consultas.sinResultadosCuentasSub': traducir(
    'No hay cuentas que coincidan con la búsqueda.',
    'No accounts match the search.'
  ),
  'adm.consultas.toastAprobada': traducir('Solicitud aprobada', 'Request approved'),
  'adm.consultas.toastRechazada': traducir('Solicitud rechazada', 'Request rejected'),
  'adm.consultas.toastErrorProcesar': traducir(
    'No se pudo procesar la solicitud',
    'Could not process the request'
  ),
  'adm.consultas.toastClienteHabilitada': traducir(
    'Cuenta del cliente habilitada correctamente',
    'Client account enabled successfully'
  ),
  'adm.consultas.toastTecnicoHabilitada': traducir(
    'Cuenta del técnico habilitada correctamente',
    'Technician account enabled successfully'
  ),
  'adm.consultas.toastErrorHabilitar': traducir(
    'No se pudo habilitar la cuenta',
    'Could not enable the account'
  ),
};
