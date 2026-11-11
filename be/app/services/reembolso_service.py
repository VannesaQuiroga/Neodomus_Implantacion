"""
Servicio: reembolsos integrados con la pasarela simulada de pagos.

Cuando una cita pagada se cancela porque no hay técnico con la
especialización requerida (o por decisión administrativa), se registra un
reembolso y se procesa con el simulador (estado Reembolsado inmediato).

Estados: Pendiente → Procesando → Reembolsado | Rechazado
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.models.especializacion import Reembolso
from app.services import pagos_service


def crear_reembolso(
    db: Session,
    monto: float,
    motivo: str | None = None,
    cita_id: int | None = None,
    pedido_id: int | None = None,
    numero_transaccion_original: str | None = None,
    solicitud_origen_id: int | None = None,
) -> Reembolso:
    """Registra un reembolso pendiente y lo procesa con el simulador.

    ``solicitud_origen_id`` vincula el reembolso con la solicitud de
    devolución que lo originó (PEN-10); el índice único de esa columna
    impide que la misma devolución genere dos reembolsos."""
    reembolso = Reembolso(
        id_cita=cita_id,
        id_pedido=pedido_id,
        id_solicitud_origen=solicitud_origen_id,
        monto=round(float(monto or 0), 2),
        estado="Pendiente",
        motivo=(motivo or "")[:255] or None,
        numero_transaccion_original=numero_transaccion_original,
    )
    db.add(reembolso)
    db.commit()
    db.refresh(reembolso)
    procesar_reembolso(db, reembolso)
    return reembolso


def procesar_reembolso(db: Session, reembolso: Reembolso) -> Reembolso:
    """Procesa el reembolso con la pasarela simulada.

    El simulador siempre aprueba; si mañana se conecta una pasarela real,
    aquí va la llamada correspondiente y el estado puede ser Rechazado.
    """
    reembolso.estado = "Procesando"
    db.commit()
    try:
        resultado = pagos_service.procesar_reembolso(
            monto=reembolso.monto,
            referencia_original=reembolso.numero_transaccion_original
            or (f"CITA-{reembolso.id_cita}" if reembolso.id_cita else f"PEDIDO-{reembolso.id_pedido}"),
        )
        reembolso.estado = "Reembolsado" if resultado.get("aprobado", True) else "Rechazado"
        reembolso.numero_transaccion_reembolso = resultado.get("numero_transaccion")
    except Exception as e:
        print(f"Error procesando reembolso #{reembolso.id_reembolso}: {e}")
        reembolso.estado = "Rechazado"

    reembolso.procesado_at = datetime.now()
    db.commit()
    db.refresh(reembolso)
    return reembolso


def reembolso_de_cita(db: Session, id_cita: int) -> Reembolso | None:
    """Último reembolso registrado para una cita."""
    return (
        db.query(Reembolso)
        .filter(Reembolso.id_cita == id_cita)
        .order_by(Reembolso.id_reembolso.desc())
        .first()
    )
