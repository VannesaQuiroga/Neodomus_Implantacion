"""
Módulo: utils/fechas.py
Utilidades de fecha/hora.

El contenedor del API corre en UTC; Colombia (America/Bogota) es UTC-5 y no
usa horario de verano. Las fechas de negocio (facturas, etc.) deben guardarse
en hora local de Bogotá, naive (sin tzinfo) para la columna DateTime.
"""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

BOGOTA_TZ = ZoneInfo("America/Bogota")
UTC_TZ = timezone.utc


def fecha_bogota() -> datetime:
    """Fecha/hora actual de Bogotá como datetime naive (sin tzinfo)."""
    return datetime.now(BOGOTA_TZ).replace(tzinfo=None)


def ahora_utc_naiva() -> datetime:
    """Fecha/hora actual en UTC como datetime naive (sin tzinfo).

    Reemplaza ``datetime.utcnow()`` (deprecado y señalado por la regla de
    calidad S6903): mismo comportamiento —valores naive UTC, comparables con
    las columnas DateTime de la BD— pero usando la referencia explícita
    ``datetime.now(timezone.utc)``."""
    return datetime.now(UTC_TZ).replace(tzinfo=None)
