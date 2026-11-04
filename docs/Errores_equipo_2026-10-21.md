# Errores reportados por el equipo — 21 de octubre de 2026

Fuente: lista escrita y cuatro capturas aportadas por el usuario. Los tres
archivos OGG no se han escuchado ni transcrito; no se atribuyen hallazgos a ellos.

## Primera corrección local, sin commit ni push

- Gestión de pedidos: añadidas las claves cliente, productos y fechaEntrega en
  español e inglés. El fallback con || no funcionaba porque t devolvía la clave.
- Checkout: componente CardPaymentInput conectado a débito y crédito. Limita
  número a 19 dígitos, expiración MM/AA a 5 caracteres y CVV a 4 dígitos; limpia
  letras al escribir/pegar y permite borrar. CVV se muestra oculto. La validación
  de validez continúa en el servidor. Esto no acredita pago completo correcto.
- PayPal: sustituido el placeholder tucorreo@ejemplo.com por una indicación sin
  correo ficticio. No se alteró el valor escrito por el cliente.
- Pruebas: 4 de entradas controladas reales y 2 de resolución de todas las
  claves adm.pedidos usadas por la vista. Suite web completa: 26 OK. tsc --noEmit
  exit 0. No se ejecutó validación visual ni E2E de checkout en este bloque.

## Pendientes conservados del reporte

1. Ocultar productos sin stock e impedir hacerlos visibles hasta reponer.
   Confirmado por inspección: toggle_visibilidad_cliente no valida stock.
   Revisar variantes, creación/edición, catálogo y descuento antes de cambiarlo.
2. Botón volver en gestión de producto: ya existe un Link en AdminProductoDetalle;
   falta reproducir si el reporte corresponde a otra vista o si queda oculto.
3. Campo de usuario no editable: pantalla/campo pendientes de aclaración.
4. Precio al incrementar cantidad y en vista grande: hay cálculo de subtotal,
   pero la entrada manual confirma al perder foco; falta reproducir el caso.
5. Chatbot no permite preguntas sucesivas: falta reproducción, sin corrección aún.
6. Notificaciones leídas no reducen contador: campana combina avisos sintéticos
   de pedidos/citas con avisos persistidos; página pública solo muestra persistidos.
   Falta unificar semántica y probar sincronización y persistencia.
7. Notificaciones del cliente no abren: falta reproducción.
8. Paginación/numeración de clientes, proveedores, novedades y técnicos.
9. Fotos de técnicos.
10. PDF del reporte de ventas.
11. Recomendaciones «Te puede interesar».
12. Finalización de compra con tarjeta débito (límites de campos corregidos,
    recorrido de pago pendiente).
13. Formulario de registro desbordado.
14. Traducción completa del aplicativo (solo tres claves corregidas).
15. Factura ausente en perfil: falta seguimiento API, persistencia y consumidor.
16. Selector de metraje: confirmar desplegable + Otra medida; mantener cortes
    exactos fraccionarios, sin volver al redondeo entero.
17. Captura del dashboard con citas en cero: contrastar contra datos y filtros;
    una captura por sí sola no demuestra conteo incorrecto.
18. Captura de reembolsos: desbordamiento horizontal y registro sin identificación.
19. Captura de novedades: fila «Resuelto» y filtro «Resuelta»; verificar estados
    heredados y conteos sin modificar históricos a ciegas.

Regla comercial previamente elegida: devoluciones de corte completo con revisión
administrativa. Su implementación sigue pendiente, priorizando estos errores.
Los porcentajes históricos de cobertura no se actualizaron con esta ejecución.


## Metraje confirmado por el usuario

Solo desplegable de 0.5 en 0.5 m. Implementado en web: tarjeta de producto,
detalle y carrito con MetrosSelect compartido. Las opciones no superan stock;
en carrito tienen en cuenta la cantidad de cortes. No se redondean cantidades
antiguas: aparecen como opción deshabilitada hasta elegir una disponible.
Móvil aún pendiente. Suite web 29 OK y TypeScript exit 0.

## Facturas: defecto reproducido y corregido

Faltaba be/app/static/Logo.jpg; ambos generadores lanzaban HTTP 500 antes de
crear el PDF. El correo de pedido es independiente, por eso puede llegar sin
factura. Se copió el logo existente del frontend al backend y se eliminó la
dependencia obligatoria: ante ausencia se reserva el espacio del logo, sin
bloquear el comprobante. Prueba previa: 2 errores 500 y 1 fallo por archivo
ausente. Se añadieron pruebas con PDFs reales de pedido y cita, con/sin logo,
y transferencia del PDF al servicio de adjuntos con transporte simulado.
No se ha comprobado la entrega real en Gmail ni la descarga HTTP desde UI.
No se enviaron correos reales. La causa está confirmada en esta copia local;
no se inspeccionó la instalación del otro equipo.
Contadores de citas y reembolsos: pendientes de reproducir contra los registros
indicados. No se consideran resueltos ni se atribuyen al logo.
