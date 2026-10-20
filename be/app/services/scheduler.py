"""
Módulo: services/scheduler.py

Programador de tareas en segundo plano (APScheduler). Se inicia junto con
la aplicación (lifespan en main.py) y ejecuta:

- Cada INTERVALO_MINUTOS (15): recordatorios de citas próximas y expiración
  de pagos punto de pago.
- Cada 5 minutos: expiración de ofertas de horario.
- Cada hora: recordatorios de calificación pendiente (técnico y productos).
"""

import logging

from apscheduler.schedulers.background import BackgroundScheduler

from app.database import SessionLocal
from app.services.tareas_programadas import (
    expirar_ofertas_vencidas,
    expirar_pagos_vencidos,
    enviar_recordatorios_calificacion,
    procesar_recordatorios_pendientes,
)

INTERVALO_MINUTOS = 15
INTERVALO_CALIFICACION_MINUTOS = 180

_scheduler: BackgroundScheduler | None = None


def _job_recordatorios() -> None:
    db = SessionLocal()
    try:
        enviados = procesar_recordatorios_pendientes(db)
        if enviados:
            logging.info("Scheduler: %d recordatorio(s) de cita enviados", enviados)
    except Exception as e:
        logging.exception("Error en job de recordatorios: %s", e)
    finally:
        db.close()


# delega los avisos en enviar_recordatorios_calificacion.
def _job_recordatorios_calificacion() -> None:
    db = SessionLocal()
    try:
        enviados = enviar_recordatorios_calificacion(db)
        if enviados:
            logging.info(
                "Scheduler: %d recordatorio(s) de calificación enviados", enviados
            )
    except Exception as e:
        logging.exception("Error en job de recordatorios de calificación: %s", e)
    finally:
        db.close()


def _job_expirar_pagos() -> None:
    db = SessionLocal()
    try:
        expirados = expirar_pagos_vencidos(db)
        if expirados:
            logging.info("Scheduler: %d pago(s) vencido(s) expirado(s)", expirados)
    except Exception as e:
        logging.exception("Error en job de expiración de pagos: %s", e)
    finally:
        db.close()


def _job_expirar_ofertas() -> None:
    db = SessionLocal()
    try:
        n = expirar_ofertas_vencidas(db)
        if n:
            logging.info("Scheduler: %d oferta(s) de horario expirada(s)", n)
    except Exception as e:
        logging.exception("Error en job de expiración de ofertas: %s", e)
    finally:
        db.close()


def iniciar_scheduler() -> None:
    """Arranca el scheduler una sola vez por proceso."""
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        return
    _scheduler = BackgroundScheduler(timezone="America/Bogota")
    _scheduler.add_job(
        _job_recordatorios,
        "interval",
        minutes=INTERVALO_MINUTOS,
        id="recordatorios_citas",
        max_instances=1,
        coalesce=True,
    )
    _scheduler.add_job(
        _job_expirar_pagos,
        "interval",
        minutes=INTERVALO_MINUTOS,
        id="expirar_pagos",
        max_instances=1,
        coalesce=True,
    )
    _scheduler.add_job(
        _job_expirar_ofertas,
        "interval",
        minutes=5,
        id="expirar_ofertas",
        max_instances=1,
        coalesce=True,
    )
    _scheduler.add_job(
        _job_recordatorios_calificacion,
        "interval",
        minutes=INTERVALO_CALIFICACION_MINUTOS,
        id="recordatorios_calificacion",
        max_instances=1,
        coalesce=True,
    )
    _scheduler.start()
    logging.info(
        "Scheduler iniciado: citas/pagos cada %d min · calificaciones cada %d min",
        INTERVALO_MINUTOS,
        INTERVALO_CALIFICACION_MINUTOS,
    )


def detener_scheduler() -> None:
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
    _scheduler = None
