"""
Servicio: reglas de transición de estado para las entregas de pedidos.

Centraliza en un único lugar el recorrido válido de una entrega para que
backend, web y móvil respeten las mismas reglas:

    Pendiente → Asignada → Recogido → En camino → Entregado

Reglas del bloque:
  - ``Pendiente`` y ``Asignada`` pertenecen al proceso administrativo de
    asignación (admin / asignación automática).
  - El técnico asignado confirma ``Recogido``, luego ``En camino`` y por
    último ``Entregado``. El tiempo transcurrido NUNCA confirma una salida.
  - El técnico no puede saltar etapas ni retroceder.
  - ``Entregado`` es terminal para este flujo.
  - Repetir el estado actual es idempotente (no repite notificaciones ni
    cambia la fecha de transición).
"""

# Orden canónico del recorrido de una entrega.
ORDEN_ESTADOS_ENTREGA = ("Pendiente", "Asignada", "Recogido", "En camino", "Entregado")

# Acciones reales que puede registrar el técnico asignado.
ESTADOS_ACCION_TECNICO = ("Recogido", "En camino", "Entregado")

# Estados en los que el pedido ya está en custodia del técnico (física o en
# tránsito): una reasignación ordinaria NO debe retrocederlos ni transferirlos.
ESTADOS_CUSTODIA_TECNICO = ("Recogido", "En camino")

# Estados en los que una asignación administrativa ordinaria es válida.
# Cualquier otro valor (incluidos estados desconocidos) se rechaza sin
# normalizarlo ni sobrescribirlo.
ESTADOS_ASIGNACION_PERMITIDOS = ("Pendiente", "Asignada")

# Valores vacíos heredados admitidos explícitamente como «aún sin recoger».
VALORES_VACIOS_LEGADOS = (None, "")

# Estados no terminales de una entrega (para bloquear filas durante la
# coordinación entre recogida, reasignación y desactivación).
ESTADOS_ENTREGA_ACTIVOS = ("Asignada", "Recogido", "En camino")


def _posicion(estado: str | None) -> int:
    """Índice en el orden canónico; -1 si el estado no es reconocido."""
    try:
        return ORDEN_ESTADOS_ENTREGA.index(estado)
    except (ValueError, TypeError):
        return -1


def validar_transicion_tecnico(
    actual: str | None, objetivo: str
) -> tuple[bool, str | None]:
    """Valida que el técnico pueda pasar de ``actual`` a ``objetivo``.

    Devuelve ``(ok, error)``. ``objetivo`` debe ser una acción real del
    técnico (Recogido / En camino / Entregado). Se rechazan los saltos de
    etapa y los retrocesos; repetir el estado actual es válido (idempotente).
    """
    if objetivo not in ESTADOS_ACCION_TECNICO:
        return False, "Estado no válido (Recogido / En camino / Entregado)"

    # Una fila ya asignada a un técnico se interpreta como «Asignada» aunque su
    # estado venga vacío (registros legados sin estado explícito).
    actual = actual or "Asignada"

    pos_actual = _posicion(actual)
    if pos_actual < 0:
        return False, f"El estado actual de la entrega («{actual}») no es reconocido"

    pos_objetivo = _posicion(objetivo)
    if pos_objetivo < pos_actual:
        return False, f"No puedes retroceder la entrega de «{actual}» a «{objetivo}»"
    if pos_objetivo - pos_actual > 1:
        return False, (
            f"No puedes pasar de «{actual}» a «{objetivo}» sin completar los pasos intermedios"
        )
    return True, None


def asignacion_reasignable(estado: str | None) -> bool:
    """Indica si una entrega aún puede asignarse/reasignarse por un flujo
    administrativo ordinario.

    Usa una LISTA PERMITIDA: solo ``Pendiente``, ``Asignada`` y los valores
    vacíos heredados admitidos explícitamente. Cualquier otro valor —incluidos
    ``Recogido``, ``En camino``, ``Entregado`` o un estado desconocido— se
    rechaza sin normalizarlo ni sobrescribirlo.
    """
    return estado in VALORES_VACIOS_LEGADOS or estado in ESTADOS_ASIGNACION_PERMITIDOS
