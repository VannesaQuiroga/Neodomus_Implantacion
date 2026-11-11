// Textos de las pestañas del perfil del cliente.
const tr = (es: string, en: string) => ({ es, en });

export const PROFILE_TABS_TRADUCCIONES: Record<string, { es: string; en: string }> = {
  // ─── Pedidos ───────────────────────────────────────────────
  'perfil.pedidos.titulo': tr('Mis pedidos', 'My orders'),
  'perfil.pedidos.subtitulo': tr(
    'Consulta el historial de tus compras, su estado y descarga tus facturas.',
    'Check your purchase history, its status and download your invoices.',
  ),
  'perfil.pedidos.cargando': tr('Cargando tus pedidos...', 'Loading your orders...'),
  'perfil.pedidos.errorCargar': tr(
    'No se pudieron cargar tus pedidos. Intenta más tarde.',
    'We could not load your orders. Please try again later.',
  ),
  'perfil.pedidos.vacio': tr(
    'No tienes pedidos todavía. Cuando realices una compra, aparecerá aquí.',
    'You have no orders yet. When you make a purchase, it will appear here.',
  ),
  'perfil.pedidos.folioPedido': tr('Pedido {id}', 'Order {id}'),
  'perfil.pedidos.novedad': tr('{n} novedad', '{n} update'),
  'perfil.pedidos.novedades': tr('{n} novedades', '{n} updates'),
  'perfil.pedidos.servicio': tr('(servicio)', '(service)'),
  'perfil.pedidos.ocultarDetalle': tr('Ocultar detalle', 'Hide details'),
  'perfil.pedidos.verDetalle': tr('Ver detalle del pedido', 'View order details'),
  'perfil.pedidos.novedadesTitulo': tr('Novedades de este pedido', 'Updates for this order'),
  'perfil.pedidos.actualizacionEquipo': tr('Actualización del equipo', 'Team update'),
  'perfil.pedidos.solucion': tr('Solución', 'Solution'),
  'perfil.pedidos.cuponCompensacion': tr('Cupón de compensación', 'Compensation coupon'),
  'perfil.pedidos.cuponPorcentaje': tr('{valor}% de descuento', '{valor}% off'),
  'perfil.pedidos.cuponMonto': tr('{valor} COP de descuento', '{valor} COP discount'),
  'perfil.pedidos.cuponDisponible': tr(
    'Disponible para usar en tu próxima compra',
    'Available to use on your next purchase',
  ),
  'perfil.pedidos.cuponNoDisponible': tr(
    'Este cupón ya no está disponible',
    'This coupon is no longer available',
  ),
  'perfil.pedidos.cuponVence': tr(' · Vence {fecha}', ' · Expires {fecha}'),
  'perfil.pedidos.enviando': tr('Enviando...', 'Sending...'),
  'perfil.pedidos.devoluciones': tr('Devoluciones', 'Returns'),
  'perfil.pedidos.devolucionNumero': tr('Devolución {numero}', 'Return {numero}'),
  'perfil.pedidos.devolucionRechazada': tr('Devolución rechazada', 'Return rejected'),
  'perfil.pedidos.motivo': tr('Motivo:', 'Reason:'),
  'perfil.pedidos.comentario': tr('Comentario:', 'Comment:'),
  'perfil.pedidos.tipo': tr('Tipo:', 'Type:'),
  'perfil.pedidos.devolucionCompleta': tr(
    'Devolución completa del pedido',
    'Full order return',
  ),
  'perfil.pedidos.devolucionParcial': tr('Devolución parcial', 'Partial return'),
  'perfil.pedidos.totalADevolver': tr('Total a devolver: {monto}', 'Total to refund: {monto}'),
  'perfil.pedidos.reembolsoTransaccion': tr(
    'Reembolso {estado} · Transacción {numero}',
    'Refund {estado} · Transaction {numero}',
  ),
  'perfil.pedidos.observaciones': tr('Observaciones:', 'Notes:'),
  'perfil.pedidos.pago': tr('Pago', 'Payment'),
  'perfil.pedidos.estadoPago': tr('Estado del pago', 'Payment status'),
  'perfil.pedidos.metodoPago': tr('Método de pago', 'Payment method'),
  'perfil.pedidos.numeroTransaccion': tr('Número de transacción', 'Transaction number'),
  'perfil.pedidos.codigoPago': tr('Código de pago', 'Payment code'),
  'perfil.pedidos.entregaRastreo': tr('Entrega y rastreo', 'Delivery & tracking'),
  'perfil.pedidos.fechaEntrega': tr('Fecha de entrega', 'Delivery date'),
  'perfil.pedidos.porProgramar': tr('Por programar', 'To be scheduled'),
  'perfil.pedidos.franjaEntrega': tr('Franja de entrega', 'Delivery window'),
  'perfil.pedidos.entreHoras': tr('Entre {inicio} y {fin}', 'Between {inicio} and {fin}'),
  'perfil.pedidos.estadoEntrega': tr('Estado de la entrega', 'Delivery status'),
  'perfil.pedidos.telefonoTecnico': tr('Teléfono del técnico', 'Technician phone'),
  'perfil.pedidos.tuTecnico': tr('Tu técnico: {nombre}', 'Your technician: {nombre}'),
  'perfil.pedidos.franjaEntregaValor': tr(
    'Franja de entrega: {rango}',
    'Delivery window: {rango}',
  ),
  'perfil.pedidos.ubicacionActualizada': tr(
    'Ubicación actualizada a las {hora}',
    'Location updated at {hora}',
  ),
  'perfil.pedidos.ubicacionTecnico': tr('Ubicación del técnico', 'Technician location'),
  'perfil.pedidos.sinUbicacion': tr(
    'El técnico aún no ha compartido su ubicación.',
    'The technician has not shared their location yet.',
  ),
  'perfil.pedidos.cargandoRastreo': tr('Cargando rastreo...', 'Loading tracking...'),
  'perfil.pedidos.ocultarRastreo': tr('Ocultar rastreo', 'Hide tracking'),
  'perfil.pedidos.rastrear': tr('Rastrear mi pedido', 'Track my order'),
  'perfil.pedidos.confirmando': tr('Confirmando...', 'Confirming...'),
  'perfil.pedidos.confirmarPago': tr('Confirmar pago', 'Confirm payment'),
  'perfil.pedidos.pagoConfirmado': tr(
    'Pago del pedido #{id} confirmado. ¡Gracias!',
    'Payment for order #{id} confirmed. Thank you!',
  ),
  'perfil.pedidos.errorConfirmarPago': tr(
    'No se pudo confirmar el pago.',
    'We could not confirm the payment.',
  ),
  'perfil.pedidos.descargarFactura': tr('Descargar factura PDF', 'Download PDF invoice'),
  'perfil.pedidos.solicitarDevolucion': tr('Solicitar devolución', 'Request return'),
  'perfil.pedidos.devolucionHint': tr(
    'Puedes devolver uno, varios o todos los productos del pedido.',
    'You can return one, several or all products in the order.',
  ),
  'perfil.pedidos.total': tr('Total: {monto}', 'Total: {monto}'),
  'perfil.pedidos.modalTitulo': tr(
    'Solicitar devolución · Pedido #{id}',
    'Request return · Order #{id}',
  ),
  'perfil.pedidos.cargandoProductos': tr(
    'Cargando productos del pedido...',
    'Loading order products...',
  ),
  'perfil.pedidos.motivoPaso': tr('Motivo', 'Reason'),
  'perfil.pedidos.resumen': tr('Resumen', 'Summary'),
  'perfil.pedidos.seleccionaProductos': tr(
    'Selecciona los productos a devolver y cuántas unidades.',
    'Select the products to return and how many units.',
  ),
  'perfil.pedidos.compradosPrecio': tr(
    'Comprados: {comprados} · Precio: {precio}',
    'Purchased: {comprados} · Price: {precio}',
  ),
  'perfil.pedidos.yaDevuelto': tr('Ya devuelto / en proceso', 'Already returned / in progress'),
  'perfil.pedidos.corteCompleto': tr(
    'Corte completo: {metros} m',
    'Full cut: {metros} m',
  ),
  'perfil.pedidos.corteCompletoHint': tr(
    'Los productos vendidos por metros se devuelven por el corte completo.',
    'Products sold by meters are returned as the full cut.',
  ),
  'perfil.pedidos.compradosPrecioMetros': tr(
    'Comprados: {metros} m · Precio: {precio}/m',
    'Purchased: {metros} m · Price: {precio}/m',
  ),
  'perfil.pedidos.quitarUnidad': tr('Quitar unidad', 'Remove unit'),
  'perfil.pedidos.agregarUnidad': tr('Agregar unidad', 'Add unit'),
  'perfil.pedidos.subtotalDevolver': tr('Subtotal a devolver:', 'Subtotal to refund:'),
  'perfil.pedidos.continuarDevolucion': tr('Continuar devolución', 'Continue return'),
  'perfil.pedidos.motivoPregunta': tr(
    '¿Cuál es el motivo de la devolución?',
    'What is the reason for the return?',
  ),
  'perfil.pedidos.motivoPlaceholder': tr(
    'Explica brevemente el motivo (mínimo 10 caracteres)',
    'Briefly explain the reason (minimum 10 characters)',
  ),
  'perfil.pedidos.comentarioPlaceholder': tr(
    'Comentario adicional (opcional)',
    'Additional comment (optional)',
  ),
  'perfil.pedidos.atras': tr('Atrás', 'Back'),
  'perfil.pedidos.verResumen': tr('Ver resumen', 'View summary'),
  'perfil.pedidos.solicitudDevolucion': tr('Solicitud de devolución', 'Return request'),
  'perfil.pedidos.pedidoLabel': tr('Pedido:', 'Order:'),
  'perfil.pedidos.unidad': tr('{n} unidad', '{n} unit'),
  'perfil.pedidos.unidades': tr('{n} unidades', '{n} units'),
  'perfil.pedidos.totalEstimado': tr(
    'Total estimado a devolver: {monto}',
    'Estimated total to refund: {monto}',
  ),
  'perfil.pedidos.notaReembolso': tr(
    'El reembolso se calcula únicamente sobre los productos y cantidades seleccionadas. Un técnico pasará a recogerlos una vez aprobada la solicitud.',
    'The refund is calculated only on the selected products and quantities. A technician will pick them up once the request is approved.',
  ),
  'perfil.pedidos.errorElegibilidad': tr(
    'Este pedido no es elegible para devolución.',
    'This order is not eligible for return.',
  ),
  'perfil.pedidos.errorCargarDevolucion': tr(
    'No se pudo cargar la devolución.',
    'We could not load the return.',
  ),
  'perfil.pedidos.errorSeleccionaProducto': tr(
    'Selecciona al menos un producto para devolver.',
    'Select at least one product to return.',
  ),
  'perfil.pedidos.errorSeleccionaMotivo': tr(
    'Selecciona el motivo de la devolución.',
    'Select the reason for the return.',
  ),
  'perfil.pedidos.errorMotivoCorto': tr(
    'Cuéntanos brevemente el motivo (mínimo 10 caracteres).',
    'Briefly tell us the reason (minimum 10 characters).',
  ),
  'perfil.pedidos.solicitudEnviada': tr(
    'Tu solicitud de devolución fue enviada. Recibirás una notificación con el estado.',
    'Your return request was sent. You will receive a notification with the status.',
  ),
  'perfil.pedidos.errorEnviarSolicitud': tr(
    'No se pudo enviar la solicitud.',
    'We could not send the request.',
  ),
  'perfil.pedidos.paso.solicitada': tr('Solicitada', 'Requested'),
  'perfil.pedidos.paso.enRevision': tr('En revisión', 'Under review'),
  'perfil.pedidos.paso.aprobada': tr('Aprobada', 'Approved'),
  'perfil.pedidos.paso.productoDevolucion': tr(
    'Producto en devolución',
    'Product in return',
  ),
  'perfil.pedidos.paso.recibida': tr('Recibida', 'Received'),
  'perfil.pedidos.paso.reembolsoProcesado': tr(
    'Reembolso procesado',
    'Refund processed',
  ),

  // ─── Servicios ─────────────────────────────────────────────
  'perfil.servicios.subtitulo': tr(
    'Rastrea el estado de tus citas y servicios técnicos en tiempo real.',
    'Track the status of your appointments and technical services in real time.',
  ),
  'perfil.servicios.cargando': tr('Cargando tus servicios...', 'Loading your services...'),
  'perfil.servicios.vacio': tr(
    'No tienes servicios agendados. Cuando solicites una cita aparecerá aquí.',
    'You have no scheduled services. When you request an appointment, it will appear here.',
  ),
  'perfil.servicios.porAsignar': tr('Por asignar', 'To be assigned'),
  'perfil.servicios.ocultarRastreo': tr(
    'Ocultar rastreo del servicio',
    'Hide service tracking',
  ),
  'perfil.servicios.rastrear': tr('Rastrear mi servicio', 'Track my service'),
  'perfil.servicios.detalle': tr('Detalle del servicio', 'Service details'),
  'perfil.servicios.fechaHora': tr('Fecha y hora', 'Date & time'),
  'perfil.servicios.especialidad': tr('Especialidad', 'Specialty'),
  'perfil.servicios.sinTecnico': tr(
    'Aún no hay técnico asignado. Te notificaremos en cuanto se realice la asignación.',
    'No technician has been assigned yet. We will notify you as soon as the assignment is made.',
  ),
  'perfil.servicios.rastreo': tr('Rastreo', 'Tracking'),
  'perfil.servicios.citaCancelada': tr(
    'Esta cita fue cancelada. Puedes solicitar una nueva cuando quieras.',
    'This appointment was cancelled. You can request a new one whenever you want.',
  ),
  'perfil.servicios.rastreoServicio': tr('Rastreo del servicio', 'Service tracking'),
  'perfil.servicios.calificarTecnico': tr('Calificar técnico', 'Rate technician'),
  'perfil.servicios.modalTitulo': tr('Califica al técnico', 'Rate the technician'),
  'perfil.servicios.estrellas': tr('{n} estrellas', '{n} stars'),
  'perfil.servicios.rating.malo': tr('Malo', 'Poor'),
  'perfil.servicios.rating.regular': tr('Regular', 'Fair'),
  'perfil.servicios.rating.bueno': tr('Bueno', 'Good'),
  'perfil.servicios.rating.muyBueno': tr('Muy bueno', 'Very good'),
  'perfil.servicios.rating.excelente': tr('Excelente', 'Excellent'),
  'perfil.servicios.comentarioPlaceholder': tr(
    'Comentario (opcional)...',
    'Comment (optional)...',
  ),
  'perfil.servicios.enviando': tr('Enviando...', 'Sending...'),
  'perfil.servicios.enviarCalificacion': tr('Enviar calificación', 'Send rating'),
  'perfil.servicios.graciasCalificacion': tr(
    '¡Gracias por calificar al técnico!',
    'Thank you for rating the technician!',
  ),
  'perfil.servicios.errorEstrellas': tr(
    'Selecciona una calificación de 1 a 5 estrellas',
    'Select a rating from 1 to 5 stars',
  ),
  'perfil.servicios.errorGuardar': tr(
    'No se pudo guardar la calificación',
    'We could not save the rating',
  ),
  'perfil.servicios.paso.solicitud': tr('Solicitud registrada', 'Request registered'),
  'perfil.servicios.paso.tecnico': tr('Técnico asignado', 'Technician assigned'),
  'perfil.servicios.paso.confirmada': tr('Cita confirmada', 'Appointment confirmed'),
  'perfil.servicios.paso.realizado': tr('Servicio realizado', 'Service completed'),

  // ─── Reseñas ───────────────────────────────────────────────
  'perfil.resenas.subtitulo': tr(
    'Las calificaciones que has dejado a los técnicos y tus reseñas de productos.',
    'The ratings you have left for technicians and your product reviews.',
  ),
  'perfil.resenas.tecnicosPorCalificar': tr(
    'Técnicos por calificar',
    'Technicians to rate',
  ),
  'perfil.resenas.experienciaPlaceholder': tr(
    'Cuéntanos tu experiencia (opcional)',
    'Tell us about your experience (optional)',
  ),
  'perfil.resenas.guardarCalificacion': tr('Guardar calificación', 'Save rating'),
  'perfil.resenas.tecnicosAtendieron': tr(
    'Técnicos que atendieron tus citas',
    'Technicians who handled your appointments',
  ),
  'perfil.resenas.cargandoTecnicos': tr(
    'Cargando tus reseñas de técnicos...',
    'Loading your technician reviews...',
  ),
  'perfil.resenas.sinTecnicos': tr(
    'Aún no has calificado a ningún técnico.',
    'You have not rated any technician yet.',
  ),
  'perfil.resenas.sinTecnicosHint': tr(
    'Cuando completes una cita, el técnico aparecerá aquí para que lo califiques.',
    'When you complete an appointment, the technician will appear here for you to rate.',
  ),
  'perfil.resenas.estrellas': tr('{n} estrellas', '{n} stars'),
  'perfil.resenas.experienciaProductoPlaceholder': tr(
    'Cuéntanos qué te pareció el producto…',
    'Tell us what you thought of the product...',
  ),
  'perfil.resenas.porCalificar': tr(
    'Productos por calificar',
    'Products to rate',
  ),
  'perfil.resenas.porCalificarHint': tr(
    'Estos productos ya fueron entregados. Comparte cómo te fue con ellos.',
    'These products were already delivered. Share how they worked for you.',
  ),
  'perfil.resenas.adjuntarFotoTitle': tr(
    'Adjuntar foto del producto',
    'Attach product photo',
  ),
  'perfil.resenas.adjuntarFoto': tr('Adjuntar foto', 'Attach photo'),
  'perfil.resenas.cambiarFoto': tr('Cambiar foto', 'Change photo'),
  'perfil.resenas.graciasProducto': tr(
    '¡Gracias por calificar el producto!',
    'Thank you for rating the product!',
  ),
  'perfil.resenas.calificacionesPedidos': tr(
    'Calificaciones de tus pedidos',
    'Ratings from your orders',
  ),
  'perfil.resenas.cargandoProductos': tr(
    'Cargando tus reseñas de productos...',
    'Loading your product reviews...',
  ),
  'perfil.resenas.sinProductos': tr(
    'Aún no has calificado productos de tus pedidos.',
    'You have not rated any products from your orders yet.',
  ),
  'perfil.resenas.sinProductosHint': tr(
    'Cuando un pedido sea entregado, sus productos aparecerán aquí para que los califiques.',
    'When an order is delivered, its products will appear here for you to rate.',
  ),
  'perfil.resenas.pedidoNumero': tr('Pedido #{id}', 'Order #{id}'),
  'perfil.resenas.errorCargarTecnicos': tr(
    'No se pudieron cargar tus reseñas de técnicos.',
    'We could not load your technician reviews.',
  ),
  'perfil.resenas.errorCargarProductos': tr(
    'No se pudieron cargar tus reseñas de productos.',
    'We could not load your product reviews.',
  ),
  'perfil.resenas.errorEstrellas': tr(
    'Selecciona una cantidad de estrellas antes de guardar.',
    'Select a star rating before saving.',
  ),
  'perfil.resenas.graciasTecnico': tr(
    '¡Gracias por calificar al técnico!',
    'Thank you for rating the technician!',
  ),
  'perfil.resenas.errorEnviarCalificacion': tr(
    'No se pudo enviar tu calificación.',
    'We could not send your rating.',
  ),
};
