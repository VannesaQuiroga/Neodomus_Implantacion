"""
Servicio: notificaciones de citas y entregas (correo + plataforma).

Centraliza las plantillas HTML y el envío en segundo plano (fire-and-forget)
para:
  - Cita asignada a un técnico.
  - Cita finalizada / cancelada (aviso al cliente, con solicitud de
    calificación si se completó).
  - Pedido de entrega asignado a un técnico.
  - Aviso previo de entrega al cliente.

Cada evento de asignación también crea una notificación en plataforma
(tabla notificaciones) para que el técnico la vea en la campana y en su
panel, además del correo.
"""
import asyncio


def crear_notificacion(db, id_usuario: int | None, tipo: str, titulo: str, mensaje: str,
                       id_cliente: int | None = None) -> None:
    """Crea una notificación de plataforma para un usuario o cliente (fire-and-forget).

    No lanza excepciones: si falla, solo se registra en consola, igual que
    el envío de correo, para no interrumpir el flujo principal.
    """
    try:
        from app.models.notificacion import Notificacion

        db.add(
            Notificacion(
                id_usuario=id_usuario,
                id_cliente=id_cliente,
                tipo=tipo,
                titulo=titulo[:150],
                mensaje=mensaje[:500],
            )
        )
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error creando notificación de plataforma (usuario={id_usuario} cliente={id_cliente}): {e}")


def programar_correo(correo: str, subject: str, body: str) -> None:
    """Programa el envío de un correo en segundo plano (fire-and-forget).

    - Con event loop activo (rutas async): crea una tarea.
    - En rutas SÍNCRONAS no hay loop: el envío va en un hilo daemon para NO
      bloquear la respuesta HTTP esperando al servidor SMTP (antes usaba
      asyncio.run() en línea y la petición tardaba segundos o quedaba
      colgada si el SMTP no respondía).
    """
    from app.utils.email import send_email

    async def _tarea():
        try:
            await send_email(correo, subject, body)
        except Exception as e:
            print(f"Error enviando correo en segundo plano a {correo}: {e}")

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        import threading

        def _enviar_en_hilo():
            try:
                asyncio.run(_tarea())
            except Exception as e:
                print(f"Error en hilo de correo a {correo}: {e}")

        threading.Thread(target=_enviar_en_hilo, daemon=True).start()
        return
    loop.create_task(_tarea())


def _plantilla(header: str, titulo: str, filas: list[tuple[str, str]], nota: str, color: str = "#1f1a12", acento: str = "#ffd98a") -> str:
    """Cuerpo HTML base de los correos."""
    filas_html = "".join(
        f"<tr><td style='padding:10px 12px;border:1px solid #eee;font-size:13px;color:#666'>{k}</td>"
        f"<td style='padding:10px 12px;border:1px solid #eee;font-size:13px;color:#333'>{v}</td></tr>"
        for k, v in filas
    )
    return (
        "<div style='background:#f6f4ef;padding:24px;font-family:Arial,Helvetica,sans-serif'>"
        "<div style='max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e8e2d6'>"
        f"<div style='background:{color};padding:20px 26px;border-bottom:4px solid #d4a54b'>"
        "<h2 style='margin:0;color:#ffffff;font-size:19px'>Neodomus</h2>"
        f"<p style='margin:4px 0 0;color:{acento};font-size:12px;font-weight:600;letter-spacing:1px'>{header}</p></div>"
        "<div style='padding:26px'>"
        f"<p style='margin:0 0 8px;color:#333;font-size:14px'>{titulo}</p>"
        "<table style='border-collapse:collapse;width:100%;font-family:Arial,Helvetica,sans-serif'>"
        f"{filas_html}</table>"
        f"<p style='margin:18px 0 0;padding:12px 14px;background:#faf7f0;border:1px solid #e8e2d6;border-radius:8px;color:#7a6a4a;font-size:13px'>{nota}</p>"
        "</div>"
        "<div style='background:#f6f4ef;padding:14px 26px;border-top:1px solid #e8e2d6'>"
        "<p style='margin:0;color:#999;font-size:12px'>Neodomus — Sistema de gestión inteligente.</p>"
        "</div></div></div>"
    )


def notificar_bienvenida_tecnico(correo: str, tecnico_nombre: str, email: str, password: str) -> None:
    """Correo de bienvenida con las credenciales de acceso cuando el
    administrador registra a un técnico."""
    subject = "Bienvenido a Neodomus - Tus credenciales de acceso"
    filas = [
        ("Usuario (correo)", email),
        ("Contraseña", password),
    ]
    body = _plantilla(
        "CUENTA CREADA",
        f"Hola {tecnico_nombre}, el administrador de Neodomus creó tu cuenta de técnico. Estas son tus credenciales para iniciar sesión en el panel:",
        filas,
        "Por seguridad, al iniciar sesión por primera vez se te pedirá cambiar la contraseña. Guárdalas en un lugar seguro.",
        color="#1a2e1a",
        acento="#8fd98a",
    )
    programar_correo(correo, subject, body)


def notificar_cita_reasignada_cliente(
    db, cliente_id: int, correo: str, cliente_nombre: str, datos: dict
) -> None:
    """Correo + notificación de plataforma al cliente cuando el administrador
    reasigna su cita a otro técnico (o la aplaza a otra fecha). ``datos`` debe
    contener: servicio, fecha, hora, tecnico."""
    crear_notificacion(
        db,
        id_usuario=None,
        id_cliente=cliente_id,
        tipo="cita",
        titulo="Tu cita fue re agendada",
        mensaje=(
            f"Tu cita de {datos['servicio']} fue re asignada: "
            f"{datos['fecha']} a las {datos['hora']} con {datos['tecnico']}."
        ),
    )
    filas = [
        ("Servicio", datos["servicio"]),
        ("Fecha", datos["fecha"]),
        ("Hora", datos["hora"]),
        ("Técnico", datos["tecnico"]),
    ]
    body = _plantilla(
        "CITA RE AGENDADA",
        f"Hola {cliente_nombre}, tu cita de {datos['servicio']} fue re agendada. "
        "Revisa los nuevos datos a continuación:",
        filas,
        "Si no puedes asistir, puedes reprogramarla desde Mis citas en la plataforma.",
        color="#3d3d3d",
        acento="#ffd98a",
    )
    programar_correo(correo, subject="Tu cita en Neodomus fue re agendada", body=body)


def notificar_admin_citas_reasignar(
    db, cantidad: int, tecnico_nombre: str, citas_resumen: list[str]
) -> None:
    """Alerta a todos los administradores (plataforma + correo) cuando un
    técnico es inhabilitado y quedan citas pendientes de reasignar."""
    from app.models.user import User

    admins = db.query(User).filter(User.id_rol_u == 1, User.is_active == True).all()  # noqa: E712
    if not admins:
        return
    detalle = "; ".join(citas_resumen[:5]) + ("..." if len(citas_resumen) > 5 else "")
    for admin in admins:
        crear_notificacion(
            db,
            id_usuario=admin.id_usuario,
            id_cliente=None,
            tipo="cita",
            titulo=f"{cantidad} cita(s) por reasignar",
            mensaje=(
                f"El técnico {tecnico_nombre} fue inhabilitado y tiene {cantidad} "
                f"cita(s) pendiente(s). Reasígnelas desde Citas. {detalle}"
            ),
        )
    nombre_admin = f"{admins[0].first_name} {admins[0].last_name}".strip() or "Administrador"
    filas = [
        ("Técnico inhabilitado", tecnico_nombre),
        ("Citas por reasignar", str(cantidad)),
        ("Detalle", detalle or "-"),
    ]
    body = _plantilla(
        "CITAS POR REASIGNAR",
        f"Hola {nombre_admin}, el técnico {tecnico_nombre} fue inhabilitado y quedaron "
        f"{cantidad} cita(s) sin atender. Reasigna los técnicos o aplaza las citas "
        "desde el módulo de Citas del panel administrativo.",
        filas,
        "Mientras tanto, las citas NO fueron canceladas: el cliente mantiene su cita agendada.",
        color="#3d3d3d",
        acento="#ffd98a",
    )
    for admin in admins:
        programar_correo(admin.email, subject="Citas por reasignar en Neodomus", body=body)


def notificar_admin_resultado_desactivacion(
    db,
    tecnico_nombre: str,
    reasignadas: int = 0,
    canceladas: int = 0,
    entregas_reasignadas: int = 0,
    entregas_sin_tecnico: int = 0,
) -> None:
    """Alerta a los administradores el resultado del proceso automático al
    desactivar un técnico: citas reasignadas, canceladas (con reembolso) y
    entregas reasignadas o sin técnico disponible."""
    from app.models.user import User

    admins = db.query(User).filter(User.id_rol_u == 1, User.is_active == True).all()  # noqa: E712
    if not admins:
        return

    total = reasignadas + canceladas + entregas_reasignadas + entregas_sin_tecnico
    partes = []
    if reasignadas:
        partes.append(f"{reasignadas} cita(s) reasignada(s)")
    if canceladas:
        partes.append(f"{canceladas} cita(s) cancelada(s) con reembolso")
    if entregas_reasignadas:
        partes.append(f"{entregas_reasignadas} entrega(s) reasignada(s)")
    if entregas_sin_tecnico:
        partes.append(f"{entregas_sin_tecnico} entrega(s) sin técnico")
    resumen = ", ".join(partes) if partes else "sin agenda pendiente"

    for admin in admins:
        crear_notificacion(
            db,
            id_usuario=admin.id_usuario,
            id_cliente=None,
            tipo="cita" if (reasignadas or canceladas) else "sistema",
            titulo=f"Técnico {tecnico_nombre} desactivado",
            mensaje=(
                f"Proceso automático completado: {resumen}. "
                + (
                    "Revisa las citas canceladas y los reembolsos en el panel."
                    if canceladas
                    else ""
                )
            ).strip(),
        )

    nombre_admin = f"{admins[0].first_name} {admins[0].last_name}".strip() or "Administrador"
    filas = [
        ("Técnico desactivado", tecnico_nombre),
        ("Citas reasignadas", str(reasignadas)),
        ("Citas canceladas (con reembolso)", str(canceladas)),
        ("Entregas reasignadas", str(entregas_reasignadas)),
        ("Entregas sin técnico", str(entregas_sin_tecnico)),
    ]
    body = _plantilla(
        "DESACTIVACIÓN DE TÉCNICO",
        f"Hola {nombre_admin}, se desactivó al técnico {tecnico_nombre} y el sistema "
        "procesó automáticamente su agenda:",
        filas,
        (
            "Las citas canceladas fueron reembolsadas y los clientes notificados. "
            "Revisa el historial de cada cita en el módulo de Citas."
            if canceladas
            else "Los clientes afectados ya fueron notificados con su nuevo técnico."
        ),
        color="#3d3d3d",
        acento="#ffd98a",
    )
    for admin in admins:
        programar_correo(
            admin.email,
            subject=f"Técnico {tecnico_nombre} desactivado — resumen de agenda",
            body=body,
        )


def notificar_cita_asignada_tecnico(
    db, id_tecnico_usuario: int | None, correo: str, tecnico_nombre: str, datos: dict
) -> None:
    """Correo + notificación de plataforma al técnico cuando recibe una cita
    (agendada por cliente o pedido)."""
    if id_tecnico_usuario is not None:
        crear_notificacion(
            db,
            id_tecnico_usuario,
            "cita",
            "Nueva cita asignada",
            (
                f"Servicio de {datos['servicio']} para {datos['cliente']} el "
                f"{datos['fecha']} a las {datos['hora']} en {datos['direccion']}."
            ),
        )
    subject = "Nueva cita asignada en Neodomus"
    filas = [
        ("Cliente", datos["cliente"]),
        ("Servicio", datos["servicio"]),
        ("Fecha", datos["fecha"]),
        ("Hora", datos["hora"]),
        ("Dirección", datos["direccion"]),
        ("Teléfono cliente", str(datos.get("telefono") or "-")),
        ("Descripción", datos.get("descripcion") or "-"),
    ]
    body = _plantilla(
        "CITA ASIGNADA",
        f"Hola {tecnico_nombre}, se te asignó una nueva cita. Revisa la agenda del panel para ver los productos y datos completos del cliente.",
        filas,
        "Si no puedes atender esta cita, comunícate con el administrador.",
    )
    programar_correo(correo, subject, body)


def notificar_cita_reagendada_tecnico(
    db, id_tecnico_usuario: int | None, correo: str, tecnico_nombre: str, datos: dict
) -> None:
    """Correo + notificación de plataforma al técnico cuando el cliente o el
    administrador reagendan una cita ya asignada (cambia fecha/hora)."""
    if id_tecnico_usuario is not None:
        crear_notificacion(
            db,
            id_tecnico_usuario,
            "cita",
            "Cita reagendada",
            (
                f"La cita de {datos['servicio']} para {datos['cliente']} fue "
                f"reagendada para el {datos['fecha']} a las {datos['hora']} en "
                f"{datos['direccion']}."
            ),
        )
    subject = "Cita reagendada en Neodomus"
    filas = [
        ("Cliente", datos["cliente"]),
        ("Servicio", datos["servicio"]),
        ("Fecha", datos["fecha"]),
        ("Hora", datos["hora"]),
        ("Dirección", datos["direccion"]),
        ("Teléfono cliente", str(datos.get("telefono") or "-")),
        ("Descripción", datos.get("descripcion") or "-"),
    ]
    body = _plantilla(
        "CITA REAGENDADA",
        f"Hola {tecnico_nombre}, la cita de {datos['servicio']} para "
        f"{datos['cliente']} fue reagendada. Revisa la nueva fecha y hora a "
        "continuación.",
        filas,
        "Si no puedes atender la cita en el nuevo horario, comunícate con el administrador.",
        color="#3d3d3d",
        acento="#ffd98a",
    )
    programar_correo(correo, subject, body)


def notificar_cita_finalizada_cliente(correo: str, cliente_nombre: str, datos: dict) -> None:
    """Correo al cliente cuando el técnico finaliza la cita: solicita calificar."""
    subject = "Tu cita en Neodomus fue finalizada"
    filas = [
        ("Servicio", datos["servicio"]),
        ("Fecha", datos["fecha"]),
        ("Técnico", datos["tecnico"]),
    ]
    body = _plantilla(
        "CITA FINALIZADA",
        f"Hola {cliente_nombre}, tu cita fue completada. Puedes calificar al técnico {datos['tecnico']} desde la sección Mis citas; tu opinión ayuda a otros clientes.",
        filas,
        "¡Gracias por usar Neodomus!",
        color="#1a2e1a",
        acento="#8fd98a",
    )
    programar_correo(correo, subject, body)


def notificar_cita_cancelada_cliente(correo: str, cliente_nombre: str, datos: dict) -> None:
    """Correo al cliente cuando el técnico no pudo completar la cita."""
    subject = "Tu cita en Neodomus no se pudo completar"
    filas = [
        ("Servicio", datos["servicio"]),
        ("Fecha", datos["fecha"]),
        ("Técnico", datos["tecnico"]),
    ]
    body = _plantilla(
        "CITA CANCELADA",
        f"Hola {cliente_nombre}, el técnico {datos['tecnico']} no pudo completar tu cita de {datos['servicio']} programada para el {datos['fecha']}. Puedes reagendarla desde Mis citas.",
        filas,
        "Lamentamos el inconveniente.",
        color="#3d1212",
        acento="#ff9b9b",
    )
    programar_correo(correo, subject, body)


def notificar_entrega_asignada_tecnico(
    db, id_tecnico_usuario: int | None, correo: str, tecnico_nombre: str, datos: dict
) -> None:
    """Correo + notificación de plataforma al técnico cuando recibe un pedido
    de entrega de productos."""
    if id_tecnico_usuario is not None:
        crear_notificacion(
            db,
            id_tecnico_usuario,
            "entrega",
            "Nuevo pedido de entrega asignado",
            (
                f"Entrega del pedido #{datos['pedido']} para {datos['cliente']} el "
                f"{datos['fecha']} a las {datos['hora']} en {datos['direccion']}."
            ),
        )
    subject = "Nuevo pedido de entrega asignado en Neodomus"
    filas = [
        ("Pedido", f"#{datos['pedido']}"),
        ("Cliente", datos["cliente"]),
        ("Dirección", datos["direccion"]),
        ("Teléfono", str(datos.get("telefono") or "-")),
        ("Fecha de entrega", datos["fecha"]),
        ("Hora de entrega", datos["hora"]),
    ]
    body = _plantilla(
        "PEDIDO DE ENTREGA",
        f"Hola {tecnico_nombre}, se te asignó la entrega del pedido #{datos['pedido']}. En el panel de entregas verás los productos y los datos del cliente para verificar su identidad.",
        filas,
        "Cuando vayas a entregar, marca el pedido como En camino para notificar al cliente con anticipación.",
    )
    programar_correo(correo, subject, body)


def notificar_aviso_entrega_cliente(correo: str, cliente_nombre: str, datos: dict) -> None:
    """Correo al cliente con aviso previo de entrega (verificación de identidad)."""
    subject = "Tu pedido Neodomus va en camino"
    filas = [
        ("Pedido", f"#{datos['pedido']}"),
        ("Fecha de entrega", datos["fecha"]),
        ("Hora de entrega", datos["hora"]),
        ("Técnico", datos["tecnico"]),
        ("Teléfono del técnico", str(datos.get("telefono_tecnico") or "-")),
    ]
    body = _plantilla(
        "ENTREGA EN CAMINO",
        f"Hola {cliente_nombre}, el técnico {datos['tecnico']} va en camino con tu pedido #{datos['pedido']}. Verifica su identidad con el nombre y el teléfono indicados antes de recibir los productos.",
        filas,
        "Recuerda revisar los productos al recibirlos.",
        color="#1a2e1a",
        acento="#8fd98a",
    )
    programar_correo(correo, subject, body)


def notificar_entrega_programada_cliente(
    db, cliente_id: int | None, correo: str, cliente_nombre: str, datos: dict
) -> None:
    """Correo + notificación de plataforma al cliente cuando su pedido ya
    tiene técnico de entrega asignado. ``datos`` debe contener: pedido,
    fecha, hora, tecnico."""
    if cliente_id is not None:
        crear_notificacion(
            db,
            id_usuario=None,
            id_cliente=cliente_id,
            tipo="entrega",
            titulo="Entrega asignada a un técnico",
            mensaje=(
                f"Tu pedido #{datos['pedido']} será entregado el {datos['fecha']} "
                f"a las {datos['hora']} por {datos['tecnico']}."
            ),
        )
    subject = "Tu pedido Neodomus ya tiene fecha de entrega"
    filas = [
        ("Pedido", f"#{datos['pedido']}"),
        ("Fecha de entrega", datos["fecha"]),
        ("Hora de entrega", datos["hora"]),
        ("Técnico asignado", datos["tecnico"]),
    ]
    body = _plantilla(
        "ENTREGA PROGRAMADA",
        f"Hola {cliente_nombre}, tu pedido #{datos['pedido']} fue asignado al técnico "
        f"{datos['tecnico']}. Te avisaremos cuando salga hacia tu dirección.",
        filas,
        "Puedes hacer seguimiento del estado de tu entrega desde Mis pedidos.",
    )
    programar_correo(correo, subject, body)


def notificar_pedido_entregado_cliente(
    db, cliente_id: int | None, correo: str, cliente_nombre: str, datos: dict
) -> None:
    """Correo + notificación de plataforma al cliente cuando su pedido quedó
    Entregado: invita a calificar LOS PRODUCTOS del pedido y explica la
    devolución. ``datos`` debe contener: pedido, fecha, tecnico."""
    from app.models.pedido import DetallePedido

    productos_txt = ""
    try:
        nombres = [
            d.producto.nombre_producto
            for d in (
                db.query(DetallePedido)
                .filter(
                    DetallePedido.id_pedido_d == datos["pedido"],
                    DetallePedido.id_producto_d.isnot(None),
                )
                .all()
            )
            if d.producto is not None
        ]
        if nombres:
            productos_txt = f" Productos: {', '.join(nombres)}."
            if "productos" in datos:
                pass
    except Exception:
        productos_txt = ""

    if cliente_id is not None:
        crear_notificacion(
            db,
            id_usuario=None,
            id_cliente=cliente_id,
            tipo="entrega",
            titulo="¡Tu pedido fue entregado!",
            mensaje=(
                f"Tu pedido #{datos['pedido']} fue entregado correctamente."
                f"{productos_txt} Entra a Mis pedidos y califica cada producto; "
                "ahí mismo puedes solicitar una devolución si algo no está bien."
            ),
        )
    subject = "Tu pedido Neodomus fue entregado"
    filas = [
        ("Pedido", f"#{datos['pedido']}"),
        ("Fecha de entrega", datos["fecha"]),
        ("Técnico", datos["tecnico"]),
    ]
    body = _plantilla(
        "PEDIDO ENTREGADO",
        f"Hola {cliente_nombre}, tu pedido #{datos['pedido']} fue entregado correctamente por "
        f"{datos['tecnico']}. ¡Esperamos que lo disfrutes!",
        filas,
        "Desde Mis pedidos puedes calificar cada producto (1-5 estrellas) y, si algo no está bien, "
        "solicitar una devolución con el botón que aparece junto a la calificación.",
        color="#1a2e1a",
        acento="#8fd98a",
    )
    programar_correo(correo, subject, body)


def notificar_pedido_creado_cliente(
    db, cliente_id: int | None, correo: str, cliente_nombre: str, datos: dict
) -> None:
    """Correo + notificación de plataforma al cliente cuando se crea un pedido.
    ``datos`` debe contener: pedido, total, estado_pago."""
    if cliente_id is not None:
        crear_notificacion(
            db,
            id_usuario=None,
            id_cliente=cliente_id,
            tipo="pedido",
            titulo=f"Pedido #{datos['pedido']} registrado",
            mensaje=(
                f"Tu pedido #{datos['pedido']} por ${datos['total']:,.0f} fue registrado "
                f"con estado: {datos['estado_pago']}. Te mantendremos informado sobre "
                "cada cambio de estado."
            ),
        )
    subject = f"Tu pedido Neodomus #{datos['pedido']} fue registrado"
    filas = [
        ("Pedido", f"#{datos['pedido']}"),
        ("Total", f"${datos['total']:,.0f} COP"),
        ("Estado del pago", datos["estado_pago"]),
    ]
    nota = (
        "Tu pedido está siendo procesado. Te enviaremos actualizaciones sobre "
        "el estado de tu pago y entrega."
    )
    if datos["estado_pago"] == "Pago rechazado":
        nota = (
            "El pago no fue aprobado. Si crees que es un error, intenta "
            "nuevamente desde Mis pedidos o contacta soporte."
        )
    elif datos["estado_pago"] == "Pago pendiente":
        nota = (
            "Tu pago está pendiente de confirmación. Completa el pago desde "
            "Mis pedidos para que procesemos tu pedido."
        )
    body = _plantilla(
        "PEDIDO REGISTRADO",
        f"Hola {cliente_nombre}, tu pedido #{datos['pedido']} fue registrado exitosamente.",
        filas,
        nota,
    )
    programar_correo(correo, subject, body)


def notificar_pago_confirmado_cliente(
    db, cliente_id: int | None, correo: str, cliente_nombre: str, datos: dict
) -> None:
    """Correo + notificación de plataforma cuando un pago pendiente se confirma.
    ``datos`` debe contener: pedido, total."""
    if cliente_id is not None:
        crear_notificacion(
            db,
            id_usuario=None,
            id_cliente=cliente_id,
            tipo="pedido",
            titulo=f"Pago confirmado - Pedido #{datos['pedido']}",
            mensaje=(
                f"El pago de tu pedido #{datos['pedido']} por ${datos['total']:,.0f} "
                "fue confirmado. Tu pedido está siendo preparado para entrega."
            ),
        )
    subject = f"Pago confirmado - Pedido Neodomus #{datos['pedido']}"
    filas = [
        ("Pedido", f"#{datos['pedido']}"),
        ("Total", f"${datos['total']:,.0f} COP"),
        ("Estado", "Pagado"),
    ]
    body = _plantilla(
        "PAGO CONFIRMADO",
        f"Hola {cliente_nombre}, confirmamos el pago de tu pedido #{datos['pedido']}.",
        filas,
        "Tu pedido será preparado y asignado a un técnico de entrega pronto. "
        "Te notificaremos cuando tenga fecha de entrega.",
        color="#1a2e1a",
        acento="#8fd98a",
    )
    programar_correo(correo, subject, body)


def notificar_entrega_asignada_cliente(
    db, cliente_id: int | None, correo: str, cliente_nombre: str, datos: dict
) -> None:
    """Correo + notificación de plataforma al cliente cuando se asigna
    automáticamente un técnico de entrega (productos sin instalación).
    ``datos`` debe contener: pedido, fecha, hora, tecnico."""
    if cliente_id is not None:
        crear_notificacion(
            db,
            id_usuario=None,
            id_cliente=cliente_id,
            tipo="entrega",
            titulo="Entrega programada",
            mensaje=(
                f"Tu pedido #{datos['pedido']} será entregado el {datos['fecha']} "
                f"a las {datos['hora']} por {datos['tecnico']}."
            ),
        )
    subject = "Tu pedido Neodomus ya tiene fecha de entrega"
    filas = [
        ("Pedido", f"#{datos['pedido']}"),
        ("Fecha de entrega", datos["fecha"]),
        ("Hora de entrega", datos["hora"]),
        ("Técnico asignado", datos["tecnico"]),
    ]
    body = _plantilla(
        "ENTREGA PROGRAMADA",
        f"Hola {cliente_nombre}, tu pedido #{datos['pedido']} fue asignado al técnico "
        f"{datos['tecnico']}. Te avisaremos cuando salga hacia tu dirección.",
        filas,
        "Puedes hacer seguimiento del estado de tu entrega desde Mis pedidos.",
    )
    programar_correo(correo, subject, body)


def notificar_recogido_cliente(
    db, cliente_id: int | None, correo: str, cliente_nombre: str, datos: dict
) -> None:
    """Correo + notificación de plataforma al cliente cuando el técnico recoge
    el pedido para entregarlo.
    ``datos`` debe contener: pedido, tecnico."""
    if cliente_id is not None:
        crear_notificacion(
            db,
            id_usuario=None,
            id_cliente=cliente_id,
            tipo="entrega",
            titulo="Pedido recogido para entrega",
            mensaje=(
                f"El técnico {datos['tecnico']} recogió tu pedido #{datos['pedido']} "
                "y se prepara para entregarlo."
            ),
        )
    subject = f"Tu pedido Neodomus #{datos['pedido']} está en camino"
    filas = [
        ("Pedido", f"#{datos['pedido']}"),
        ("Técnico", datos["tecnico"]),
    ]
    body = _plantilla(
        "PEDIDO RECOGIDO",
        f"Hola {cliente_nombre}, el técnico {datos['tecnico']} recogió tu pedido "
        f"#{datos['pedido']} y se dirige a tu dirección.",
        filas,
        "Te notificaremos cuando esté en camino. Puedes hacer seguimiento desde Mis pedidos.",
        color="#1a2e1a",
        acento="#8fd98a",
    )
    programar_correo(correo, subject, body)


def notificar_en_camino_cliente(
    db, cliente_id: int | None, correo: str, cliente_nombre: str, datos: dict
) -> None:
    """Correo + notificación de plataforma al cliente cuando su pedido está
    En camino (tanto automático como manual).
    ``datos`` debe contener: pedido, fecha, hora, tecnico, telefono_tecnico."""
    if cliente_id is not None:
        crear_notificacion(
            db,
            id_usuario=None,
            id_cliente=cliente_id,
            tipo="entrega",
            titulo="¡Tu pedido va en camino!",
            mensaje=(
                f"El técnico {datos['tecnico']} va en camino con tu pedido "
                f"#{datos['pedido']}. Verifica su identidad al momento de recibir."
            ),
        )
    notificar_aviso_entrega_cliente(correo, cliente_nombre, datos)


def notificar_entrega_desasignada_cliente(
    db, cliente_id: int | None, correo: str | None, cliente_nombre: str, pedido_id: int
) -> None:
    """Notificación al cliente cuando se quita el técnico de entrega (queda Pendiente)."""
    if cliente_id is not None:
        crear_notificacion(
            db,
            id_usuario=None,
            id_cliente=cliente_id,
            tipo="entrega",
            titulo="Técnico de entrega removido",
            mensaje=(
                f"El técnico de entrega de tu pedido #{pedido_id} fue removido. "
                "Estamos buscando un nuevo técnico. Te notificaremos cuando se reasigne."
            ),
        )
    if correo:
        subject = f"Cambio en la entrega de tu pedido Neodomus #{pedido_id}"
        filas = [("Pedido", f"#{pedido_id}")]
        body = _plantilla(
            "CAMBIO EN ENTREGA",
            f"Hola {cliente_nombre}, se realizó un cambio en la entrega de tu pedido #{pedido_id}.",
            filas,
            "Estamos buscando un nuevo técnico para tu entrega. Te notificaremos "
            "cuando se reasigne con la nueva fecha y hora.",
        )
        programar_correo(correo, subject, body)


def notificar_pedido_cancelado_cliente(
    db, cliente_id: int | None, correo: str | None, cliente_nombre: str, pedido_id: int, motivo: str
) -> None:
    """Correo + notificación de plataforma cuando un pedido se cancela
    (por expiración de pago u otra razón)."""
    if cliente_id is not None:
        crear_notificacion(
            db,
            id_usuario=None,
            id_cliente=cliente_id,
            tipo="pedido",
            titulo=f"Pedido #{pedido_id} cancelado",
            mensaje=(
                f"Tu pedido #{pedido_id} fue cancelado. Motivo: {motivo}. "
                "Si crees que es un error, contacta soporte."
            ),
        )
    if correo:
        subject = f"Pedido Neodomus #{pedido_id} cancelado"
        filas = [
            ("Pedido", f"#{pedido_id}"),
            ("Motivo", motivo),
        ]
        body = _plantilla(
            "PEDIDO CANCELADO",
            f"Hola {cliente_nombre}, tu pedido #{pedido_id} fue cancelado.",
            filas,
            "Si ya realizaste el pago o crees que esto es un error, por favor "
            "contáctanos para verificarlo.",
        )
        programar_correo(correo, subject, body)


def notificar_entrega_sin_tecnico_cliente(
    db, cliente_id: int | None, correo: str | None, cliente_nombre: str, pedido_id: int
) -> None:
    """Notificación al cliente cuando la entrega queda sin técnico
    (por desactivación del técnico sin reemplazo disponible)."""
    if cliente_id is not None:
        crear_notificacion(
            db,
            id_usuario=None,
            id_cliente=cliente_id,
            tipo="entrega",
            titulo=f"Entrega del pedido #{pedido_id} pendiente",
            mensaje=(
                f"La entrega de tu pedido #{pedido_id} quedó pendiente de asignación. "
                "Estamos buscando un nuevo técnico. Te notificaremos cuando se reasigne."
            ),
        )
    if correo:
        subject = f"Entrega de tu pedido Neodomus #{pedido_id} pendiente"
        filas = [("Pedido", f"#{pedido_id}")]
        body = _plantilla(
            "ENTREGA PENDIENTE",
            f"Hola {cliente_nombre}, la entrega de tu pedido #{pedido_id} quedó pendiente de asignación.",
            filas,
            "Nuestro equipo está buscando un nuevo técnico para entregar tu pedido. "
            "Te notificaremos tan pronto como se reasigne.",
        )
        programar_correo(correo, subject, body)


def notificar_admin_devolucion_solicitada(
    db, pedido_id: int, cliente_nombre: str, producto_nombre: str, motivo: str | None
) -> None:
    """Alerta a los administradores (plataforma) cuando un cliente solicita
    la devolución de un producto entregado."""
    from app.models.user import User

    admins = db.query(User).filter(User.id_rol_u == 1, User.is_active == True).all()  # noqa: E712
    for admin in admins:
        crear_notificacion(
            db,
            id_usuario=admin.id_usuario,
            id_cliente=None,
            tipo="sistema",
            titulo="Nueva solicitud de devolución",
            mensaje=(
                f"{cliente_nombre} solicitó la devolución de '{producto_nombre}' "
                f"del pedido #{pedido_id}. Motivo: {motivo or 'sin especificar'}."
            ),
        )


def notificar_admin_reembolso_pendiente_cita(
    db,
    id_cita: int,
    cliente_nombre: str,
    especializacion: str | None,
    monto: float,
    motivo: str | None,
) -> None:
    """Alerta a los administradores (plataforma) cuando una cita se canceló
    por falta de técnico con la especialización requerida y queda un
    reembolso pendiente SOLO del valor del servicio."""
    from app.models.user import User

    admins = db.query(User).filter(User.id_rol_u == 1, User.is_active == True).all()  # noqa: E712
    monto_txt = f"${float(monto or 0):,.0f} COP"
    for admin in admins:
        crear_notificacion(
            db,
            id_usuario=admin.id_usuario,
            id_cliente=None,
            tipo="sistema",
            titulo="Reembolso pendiente por cancelación de cita",
            mensaje=(
                f"Se canceló la cita #{id_cita} de {cliente_nombre} porque no existe un "
                f"técnico disponible con la especialización requerida"
                + (f" ({especializacion})" if especializacion else "")
                + f". Se debe realizar el reembolso correspondiente al valor de la cita "
                f"({monto_txt}). Motivo: {motivo or '—'}"
            ),
        )


def notificar_reembolso_cliente(
    db, cliente_id: int | None, correo: str, cliente_nombre: str, datos: dict,
    referencia: str = "Cita",
) -> None:
    """Correo + notificación de plataforma al cliente cuando un reembolso
    es PROCESADO EXITOSAMENTE (estado "Reembolsado").

    Si el reembolso falló ("Rechazado"), NO se notifica al cliente.

    ``datos`` debe contener: cita (id o número de referencia), monto,
    estado, transaccion, transaccion_original, motivo.
    ``referencia`` rotula el origen del reembolso ('Cita' o 'Pedido')."""
    estado = datos.get("estado", "")

    # Solo notificar cuando el reembolso fue procesado exitosamente.
    if estado != "Reembolsado":
        return

    ref_txt = referencia.lower()
    if cliente_id is not None:
        crear_notificacion(
            db,
            id_usuario=None,
            id_cliente=cliente_id,
            tipo="reembolso",
            titulo=f"💰 Reembolso procesado - {ref_txt.capitalize()} #{datos['cita']}",
            mensaje=(
                f"Tu reembolso de {datos['monto']} por tu "
                f"{ref_txt} #{datos['cita']} ha sido procesado correctamente. "
                "El dinero será devuelto a la misma cuenta y método de pago "
                "con los que realizaste la compra."
            ),
        )
    subject = "Reembolso procesado - Neodomus"
    filas = [
        (referencia, f"#{datos['cita']}"),
        ("Monto reembolsado", datos["monto"]),
        ("Estado", "Reembolsado"),
        ("Transacción original", datos["transaccion_original"]),
        ("N° de reembolso", datos["transaccion"]),
        ("Motivo", datos["motivo"]),
    ]
    body = _plantilla(
        "REEMBOLSO PROCESADO",
        f"Hola {cliente_nombre}, tu reembolso ha sido procesado correctamente. "
        f"Estos son los detalles:",
        filas,
        "El monto se devuelve a la misma cuenta y método de pago con los que se realizó "
        "la compra (transacción original indicada arriba); no necesitamos ningún dato "
        "adicional de tu parte. Puedes ver el detalle desde tu perfil, en la pestaña Mis reembolsos.",
        color="#1a2e1a",
        acento="#8fd98a",
    )
    programar_correo(correo, subject, body)


def notificar_reembolso_fallido_admin(
    db, admin_ids: list[int], reembolso_id: int, motivo_fallo: str,
) -> None:
    """Notifica al admin cuando un reembolso falla al procesarse."""
    for admin_id in admin_ids:
        crear_notificacion(
            db,
            id_usuario=admin_id,
            tipo="sistema",
            titulo=f"⚠️ Reembolso #{reembolso_id} falló",
            mensaje=(
                f"El procesamiento del reembolso #{reembolso_id} falló. "
                f"Motivo: {motivo_fallo}. Revisa el panel de reembolsos."
            ),
        )


# ──────────────────────────────────────────────────────────────────
# 📋 Notificaciones al cliente por cambios de estado de cita
# ──────────────────────────────────────────────────────────────────

_ESTADO_COLORES = {
    "Pendiente":    ("#3d3d3d", "#ffd98a"),
    "Confirmada":   ("#1a2e1a", "#8fd98a"),
    "Finalizada":   ("#1a2e1a", "#8fd98a"),
    "Cancelada":    ("#3d1212", "#ff9b9b"),
}

_ESTADO_TEXTO = {
    "Pendiente":    ("CITA EN ESPERA",
                     "Tu cita sigue en espera de confirmación por parte del técnico."),
    "Confirmada":   ("CITA CONFIRMADA",
                     "El técnico confirmó tu cita. Se presentará en la fecha y hora acordadas."),
    "Finalizada":   ("CITA FINALIZADA",
                     "Tu cita fue completada. Puedes calificar al técnico desde Mis citas; tu opinión ayuda a otros clientes."),
    "Cancelada":    ("CITA CANCELADA",
                     "El técnico no pudo completar tu cita. Puedes reagendarla desde Mis citas."),
}


def notificar_cita_estado_cliente(
    db,
    cliente_id: int,
    correo: str,
    cliente_nombre: str,
    datos: dict,
    nuevo_estado: str,
    motivo: str | None = None,
) -> None:
    """Notifica al cliente por correo y plataforma cuando el estado de su cita cambia.

    ``datos`` debe contener al menos: servicio, fecha, tecnico. ``motivo``
    (opcional) personaliza el mensaje de una cancelación, p. ej. cuando la
    cita se cancela porque el técnico asignado fue deshabilitado.
    """
    header, body_text = _ESTADO_TEXTO.get(
        nuevo_estado,
        (f"CITA — {nuevo_estado.upper()}", f"El estado de tu cita cambió a {nuevo_estado}."),
    )
    color, acento = _ESTADO_COLORES.get(nuevo_estado, ("#1f1a12", "#ffd98a"))

    from datetime import datetime as _dt

    cambio_txt = _dt.now().strftime("%d/%m/%Y %H:%M")
    filas = [
        ("Servicio", datos["servicio"]),
        ("Fecha", datos["fecha"]),
        ("Técnico", datos["tecnico"]),
        ("Nuevo estado", nuevo_estado),
        ("Fecha y hora del cambio", cambio_txt),
    ]
    if datos.get("descripcion"):
        filas.append(("Descripción del servicio", datos["descripcion"]))

    if nuevo_estado == "Finalizada":
        body_text += (
            " Te invitamos a calificar al técnico desde Mis citas; tu opinión ayuda a otros clientes."
        )
    elif nuevo_estado == "Cancelada":
        if motivo:
            body_text = (
                f"Tu cita de {datos['servicio']} programada para el {datos['fecha']} "
                f"fue cancelada. {motivo} Puedes reagendarla desde Mis citas."
            )
        else:
            body_text += " Puedes reagendarla desde Mis citas."
    elif nuevo_estado == "Confirmada":
        body_text = (
            f"El técnico {datos['tecnico']} confirmó tu cita de {datos['servicio']} "
            f"para el {datos['fecha']}. Se presentará en la fecha y hora acordadas."
        )

    crear_notificacion(
        db,
        id_usuario=None,
        id_cliente=cliente_id,
        tipo="cita",
        titulo=f"Cita {nuevo_estado.lower()}",
        mensaje=(
            f"Tu cita de {datos['servicio']} para el {datos['fecha']} "
            f"fue marcada como {nuevo_estado} el {cambio_txt}."
            + (
                f" Descripción: {datos['descripcion']}"
                if datos.get("descripcion")
                else ""
            )
            + (f" {motivo}" if motivo else "")
        ),
    )

    subject_map = {
        "Pendiente":  "Tu cita en Neodomus está en espera",
        "Confirmada": "Tu cita en Neodomus fue confirmada",
        "Finalizada": "Califica al técnico — tu cita en Neodomus fue finalizada",
        "Cancelada":  "Tu cita en Neodomus no se pudo completar",
    }
    subject = subject_map.get(nuevo_estado, f"Actualización de tu cita — Neodomus")
    if nuevo_estado == "Cancelada" and motivo:
        subject = "Tu cita en Neodomus fue cancelada"

    body = _plantilla(header, body_text, filas, "Neodomus — Sistema de gestión inteligente.", color=color, acento=acento)
    programar_correo(correo, subject, body)


def notificar_recordatorio_cita(
    db,
    cliente_id: int,
    correo: str,
    cliente_nombre: str,
    datos: dict,
) -> None:
    """Notifica al cliente que tiene una cita próxima (recordatorio).

    Envía notificación de plataforma + correo. ``datos`` debe contener:
    servicio, fecha, hora, direccion.
    """
    crear_notificacion(
        db,
        id_usuario=None,
        id_cliente=cliente_id,
        tipo="cita",
        titulo="Recordatorio de cita",
        mensaje=(
            f"Tienes una cita de {datos['servicio']} programada para el "
            f"{datos['fecha']} a las {datos['hora']}."
        ),
    )

    filas = [
        ("Servicio", datos["servicio"]),
        ("Fecha", datos["fecha"]),
        ("Hora", datos["hora"]),
        ("Dirección", datos["direccion"]),
    ]
    body = _plantilla(
        "RECORDATORIO DE CITA",
        f"Hola {cliente_nombre}, este es un recordatorio de tu cita programada para mañana. "
        f"Revisa los detalles a continuación:",
        filas,
        "Si necesitas cancelar o reprogramar, hazlo desde Mis citas en la plataforma.",
        color="#3d3d3d",
        acento="#ffd98a",
    )
    programar_correo(correo, subject="Recordatorio de tu cita en Neodomus", body=body)


def notificar_oferta_horario(
    db, cliente_id: int | None, correo: str, cliente_nombre: str, datos: dict
) -> None:
    """Plataforma + correo: se liberó un horario más temprano con su técnico
    y el cliente puede ADELANTAR su cita aceptándolo antes de que expire."""
    if cliente_id is not None:
        crear_notificacion(
            db,
            id_usuario=None,
            id_cliente=cliente_id,
            tipo="cita",
            titulo="Horario disponible para adelantar tu cita",
            mensaje=(
                f"Se liberó el {datos['fecha']} a las {datos['hora']} con {datos['tecnico']}. "
                f"Puedes mover tu cita ahí desde Mis citas (tienes {datos['horas']} h)."
            ),
        )
    subject = "Se liberó un horario más cercano - Neodomus"
    filas = [
        ("Nuevo horario", f"{datos['fecha']} · {datos['hora']}"),
        ("Técnico", datos["tecnico"]),
        ("Tiempo para aceptar", f"{datos['horas']} horas"),
    ]
    body = _plantilla(
        "HORARIO DISPONIBLE",
        (
            f"Hola {cliente_nombre}, se liberó un horario MÁS CERCANO con {datos['tecnico']}: "
            f"{datos['fecha']} a las {datos['hora']}. Si lo aceptas, moveremos tu cita actual a ese momento."
        ),
        filas,
        "Entra a Mis citas y pulsa 'Adelantar mi cita'. Es para el primero que la acepte; "
        "los clientes con mayor antigüedad en compras y servicios tienen prioridad.",
        color="#12211f",
        acento="#8fd9c0",
    )
    programar_correo(correo, subject, body)


# ──────────────────────────────────────────────────────────────────
# ↩️ Notificaciones del proceso de devolución de productos
# ──────────────────────────────────────────────────────────────────

_DEV_EVENTOS = {
    # evento: (header, asunto, nota)
    "solicitada": (
        "SOLICITUD DE DEVOLUCIÓN RECIBIDA",
        "Recibimos tu solicitud de devolución - Neodomus",
        "Nuestro equipo revisará tu solicitud y te avisaremos con la decisión.",
    ),
    "en_revision": (
        "DEVOLUCIÓN EN REVISIÓN",
        "Tu devolución está en revisión - Neodomus",
        "Estamos revisando los detalles de tu solicitud. Te contactaremos pronto.",
    ),
    "aprobada": (
        "DEVOLUCIÓN APROBADA",
        "Tu devolución fue aprobada - Neodomus",
        "Un técnico pasará a recoger los productos en la dirección registrada.",
    ),
    "rechazada": (
        "DEVOLUCIÓN RECHAZADA",
        "Tu solicitud de devolución fue rechazada - Neodomus",
        "Si tienes dudas sobre esta decisión, responde a este correo o contáctanos.",
    ),
    "recibida": (
        "PRODUCTO RECIBIDO",
        "Recibimos tus productos devueltos - Neodomus",
        "Confirmamos la recepción de los productos devueltos.",
    ),
    "reembolso_procesado": (
        "REEMBOLSO PROCESADO",
        "Tu reembolso fue procesado - Neodomus",
        "El dinero será devuelto al mismo medio de pago de tu compra.",
    ),
}


def notificar_devolucion_cliente(
    db,
    cliente_id: int | None,
    correo: str | None,
    cliente_nombre: str,
    *,
    numero: str,
    pedido_id: int,
    evento: str,
    monto: float | None = None,
    motivo_rechazo: str | None = None,
    productos_txt: str | None = None,
) -> None:
    """Notifica al cliente (plataforma + correo) cada hito de su devolución:
    solicitada, en revisión, aprobada, rechazada, recibida o reembolso."""
    header, subject, nota = _DEV_EVENTOS.get(
        evento, (f"DEVOLUCIÓN — {evento.upper()}", f"Actualización de tu devolución — Neodomus", "")
    )

    mensajes = {
        "solicitada": (
            f"Registramos tu solicitud de devolución {numero} del pedido "
            f"#{pedido_id}. Nuestro equipo la revisará pronto."
        ),
        "en_revision": (
            f"Tu devolución {numero} del pedido #{pedido_id} está siendo "
            "revisada por nuestro equipo."
        ),
        "aprobada": (
            f"Tu devolución {numero} del pedido #{pedido_id} fue APROBADA. "
            "Revisa los detalles para conocer los siguientes pasos."
        ),
        "rechazada": (
            f"Tu devolución {numero} del pedido #{pedido_id} fue rechazada."
            + (f" Motivo: {motivo_rechazo}" if motivo_rechazo else "")
        ),
        "recibida": (
            f"El técnico recogió tus productos. Tu devolución {numero} quedó "
            "como Recibida."
        ),
        "reembolso_procesado": (
            f"El reembolso de tu devolución {numero} fue procesado por el valor "
            f"de los productos devueltos."
        ),
    }

    crear_notificacion(
        db,
        id_usuario=None,
        id_cliente=cliente_id,
        tipo="devolucion",
        titulo=f"Devolución {numero}",
        mensaje=mensajes.get(evento, f"Tu devolución {numero} cambió de estado."),
    )

    if not correo:
        return

    filas = [
        ("Devolución", numero),
        ("Pedido", f"#{pedido_id}"),
    ]
    if productos_txt:
        filas.append(("Productos", productos_txt))
    if monto is not None and evento in ("aprobada", "reembolso_procesado"):
        filas.append(("Valor estimado", f"${float(monto):,.0f} COP"))
    if evento == "rechazada":
        filas.append(("Motivo del rechazo", motivo_rechazo or "-"))

    body = _plantilla(
        header,
        f"Hola {cliente_nombre}, " + nota,
        filas,
        "Puedes ver el detalle de tu devolución desde tu perfil, en la pestaña Mis pedidos.",
        color="#3d1212" if evento == "rechazada" else "#1f1a12",
        acento="#ff9b9b" if evento == "rechazada" else "#ffd98a",
    )
    programar_correo(correo, subject=subject, body=body)


# ──────────────────────────────────────────────────────────────────
# 📦 Notificación de stock bajo al admin
# ──────────────────────────────────────────────────────────────────


def notificar_admin_stock_bajo(
    db, admin_ids: list[int], producto_id: int, producto_nombre: str,
    stock_actual: int, stock_minimo: int = 5,
) -> None:
    """Notifica a los admins cuando un producto tiene stock bajo (≤ stock_minimo).

    Crea una notificación de plataforma para cada admin. No envía correo
    para evitar spam; la notificación es suficiente.
    """
    for admin_id in admin_ids:
        crear_notificacion(
            db,
            id_usuario=admin_id,
            tipo="producto",
            titulo=f"📦 Stock bajo: {producto_nombre}",
            mensaje=(
                f"El producto \"{producto_nombre}\" (#{producto_id}) tiene "
                f"sole(s) {stock_actual} unidad(es) en stock. "
                f"El mínimo configurado es {stock_minimo}. "
                "Considera reabastecerlo pronto."
            ),
        )
