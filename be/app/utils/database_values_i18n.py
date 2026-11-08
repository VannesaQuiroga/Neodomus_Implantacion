"""Translate allow-listed database values for API presentation only.

Stored values remain canonical. Unknown/custom values are returned unchanged,
and callers add separate ``*_label`` fields instead of replacing API values.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Mapping
from typing import Any, Literal

from fastapi import Request

Language = Literal["es", "en"]


def language_from_request(request: Request) -> Language:
    """Resolve Spanish or English from the standard Accept-Language header."""
    weighted_languages: list[tuple[float, int, str]] = []
    for position, entry in enumerate(request.headers.get("accept-language", "").split(",")):
        parts = entry.strip().split(";", maxsplit=1)
        language = parts[0].strip().lower().split("-", maxsplit=1)[0]
        if language not in {"es", "en"}:
            continue

        quality = 1.0
        if len(parts) == 2 and parts[1].strip().startswith("q="):
            try:
                quality = float(parts[1].strip()[2:])
            except ValueError:
                quality = 0.0
        if 0.0 < quality <= 1.0:
            weighted_languages.append((quality, -position, language))

    if not weighted_languages:
        return "es"
    return max(weighted_languages)[2]  # type: ignore[return-value]


def _normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value.casefold())
    without_accents = "".join(char for char in decomposed if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", " ", without_accents).strip()


_VALUE_TRANSLATIONS: dict[str, dict[str, tuple[str, str]]] = {
    "novelty_type": {
        "retraso en entrega": ("Retraso en entrega", "Delivery delay"),
        "cliente ausente": ("Cliente ausente", "Customer absent"),
        "cliente no recibio el pedido": ("Cliente no recibió el pedido", "Customer did not receive the order"),
        "direccion incorrecta": ("Dirección incorrecta", "Incorrect address"),
        "producto danado": ("Producto dañado", "Damaged product"),
        "producto faltante": ("Producto faltante", "Missing product"),
        "producto equivocado": ("Producto equivocado", "Wrong product"),
        "perdida de producto": ("Pérdida de producto", "Lost product"),
        "robo de productos": ("Robo de productos", "Product theft"),
        "accidente": ("Accidente", "Accident"),
        "problema con el vehiculo transporte": ("Problema con el vehículo/transporte", "Vehicle/transport issue"),
        "problema tecnico": ("Problema técnico", "Technical issue"),
        "problema durante una cita": ("Problema durante una cita", "Appointment issue"),
        "cita no realizada": ("Cita no realizada", "Appointment not completed"),
        "cita reprogramada": ("Cita reprogramada", "Appointment rescheduled"),
        "cliente solicita reprogramacion": ("Cliente solicita reprogramación", "Customer requested rescheduling"),
        "problema con instalacion": ("Problema con instalación", "Installation issue"),
        "retraso que afecta cita": ("Retraso que afecta cita", "Delay affecting appointment"),
        "otro": ("Otro", "Other"),
        "producto recibido con danos": ("Producto recibido con daños", "Product received damaged"),
        "producto incompleto": ("Producto incompleto", "Incomplete product"),
        "cliente no tenia el producto disponible": ("Cliente no tenía el producto disponible", "Customer did not have the product available"),
        "producto diferente al solicitado": ("Producto diferente al solicitado", "Product differs from the one ordered"),
        "devolucion no realizada": ("Devolución no realizada", "Return not completed"),
        "problema durante la recogida": ("Problema durante la recogida", "Pickup issue"),
    },
    "novelty_status": {
        "pendiente": ("Pendiente", "Pending"),
        "en revision": ("En revisión", "Under review"),
        "aprobada": ("Aprobada", "Approved"),
        "rechazada": ("Rechazada", "Rejected"),
        "resuelta": ("Resuelta", "Resolved"),
        "cerrada": ("Cerrada", "Closed"),
    },
    "priority": {
        "baja": ("Baja", "Low"),
        "normal": ("Normal", "Normal"),
        "alta": ("Alta", "High"),
        "urgente": ("Urgente", "Urgent"),
    },
    "role": {
        "admin": ("Administrador", "Administrator"),
        "administrador": ("Administrador", "Administrator"),
        "tecnico": ("Técnico", "Technician"),
        "cliente": ("Cliente", "Customer"),
        "proveedor": ("Proveedor", "Supplier"),
    },
    "request_category": {
        "consulta general": ("Consulta general", "General inquiry"),
        "soporte tecnico": ("Soporte técnico", "Technical support"),
        "pedido": ("Pedido", "Order"),
        "pago": ("Pago", "Payment"),
        "reembolso": ("Reembolso", "Refund"),
        "reclamo": ("Reclamo", "Complaint"),
        "otro": ("Otro", "Other"),
    },
    "contact_status": {
        "pendiente": ("Pendiente", "Pending"),
        "en proceso": ("En proceso", "In progress"),
        "en_proceso": ("En proceso", "In progress"),
        "resuelta": ("Resuelta", "Resolved"),
        "respondida": ("Respondida", "Answered"),
    },
    "order_status": {
        "pendiente": ("Pendiente", "Pending"),
        "pago pendiente": ("Pago pendiente", "Payment pending"),
        "pagado": ("Pagado", "Paid"),
        "confirmado": ("Confirmado", "Confirmed"),
        "en preparacion": ("En preparación", "Preparing"),
        "en camino": ("En camino", "On the way"),
        "entregado": ("Entregado", "Delivered"),
        "cancelado": ("Cancelado", "Cancelled"),
        "cancelada": ("Cancelada", "Cancelled"),
        "completado": ("Completado", "Completed"),
    },
    "payment_status": {
        "pendiente": ("Pendiente", "Pending"),
        "aprobado": ("Aprobado", "Approved"),
        "rechazado": ("Rechazado", "Declined"),
        "reembolsado": ("Reembolsado", "Refunded"),
        "fallido": ("Fallido", "Failed"),
    },
    "appointment_status": {
        "pendiente": ("Pendiente", "Pending"),
        "confirmada": ("Confirmada", "Confirmed"),
        "en proceso": ("En proceso", "In progress"),
        "finalizada": ("Finalizada", "Completed"),
        "cancelada": ("Cancelada", "Cancelled"),
        "reprogramada": ("Reprogramada", "Rescheduled"),
    },
    "delivery_status": {
        "asignada": ("Asignada", "Assigned"),
        "recogido": ("Recogido", "Picked up"),
        "en camino": ("En camino", "On the way"),
        "entregado": ("Entregado", "Delivered"),
    },
    "return_status": {
        "pendiente": ("Pendiente", "Pending"),
        "aprobada": ("Aprobada", "Approved"),
        "rechazada": ("Rechazada", "Rejected"),
        "recogida": ("Recogida", "Collected"),
        "reembolsado": ("Reembolsado", "Refunded"),
    },
    "stock_status": {
        "disponible": ("Disponible", "Available"),
        "bajo": ("Bajo", "Low"),
        "agotado": ("Agotado", "Out of stock"),
    },
    "discount_type": {
        "porcentaje": ("Porcentaje", "Percentage"),
        "fijo": ("Valor fijo", "Fixed amount"),
    },
    "product_status": {
        "activo": ("Activo", "Active"),
        "inactivo": ("Inactivo", "Inactive"),
    },
    "product_name": {
        "sensor de movimiento pir": ("Sensor de movimiento PIR", "PIR motion sensor"),
        "controlador central domotico": ("Controlador central domótico", "Central home automation controller"),
        "cinta led rgb": ("Cinta LED RGB", "RGB LED strip"),
        "kit de automatizacion basica": ("Kit de automatización básica", "Basic home automation kit"),
        "cable utp cat6": ("Cable UTP Cat6", "UTP Cat6 cable"),
        "sensor de puerta ventana": ("Sensor de puerta/ventana", "Door/window sensor"),
        "enchufe inteligente wifi": ("Enchufe inteligente WiFi", "WiFi smart plug"),
        "fuente de poder 12v 5a": ("Fuente de poder 12V 5A", "12V 5A power supply"),
        "camara ip 1080p": ("Cámara IP 1080p", "1080p IP camera"),
        "bateria recargable 18650": ("Batería recargable 18650", "18650 rechargeable battery"),
        "termostato inteligente": ("Termostato inteligente", "Smart thermostat"),
        "interruptor tactil wifi": ("Interruptor táctil WiFi", "WiFi touch switch"),
        "sirena inalambrica": ("Sirena inalámbrica", "Wireless siren"),
        "detector de humo": ("Detector de humo", "Smoke detector"),
        "persiana motorizada": ("Persiana motorizada", "Motorized blind"),
        "panel tactil central": ("Panel táctil central", "Central touch panel"),
    },
    "product_category": {
        "sensores": ("Sensores", "Sensors"),
        "controladores": ("Controladores", "Controllers"),
        "iluminacion": ("Iluminación", "Lighting"),
        "automatizacion": ("Automatización", "Automation"),
        "cables y conectividad": ("Cables y conectividad", "Cables and connectivity"),
        "enchufes y tomas": ("Enchufes y tomas", "Plugs and outlets"),
        "fuentes de poder": ("Fuentes de poder", "Power supplies"),
        "seguridad": ("Seguridad", "Security"),
        "climatizacion": ("Climatización", "Climate control"),
        "interfaces": ("Interfaces", "Interfaces"),
    },
    "product_color": {
        "blanco": ("Blanco", "White"),
        "negro": ("Negro", "Black"),
        "gris": ("Gris", "Gray"),
        "azul": ("Azul", "Blue"),
        "rojo": ("Rojo", "Red"),
        "rgb": ("RGB", "RGB"),
    },
    "product_description": {
        "sensor de movimiento pir para deteccion de presencia con angulo de 110 y alcance de 9 metros.": (
            "Sensor de movimiento PIR para detección de presencia con ángulo de 110° y alcance de 9 metros.",
            "PIR motion sensor for presence detection, with a 110° angle and a 9-meter range.",
        ),
        "controlador central para automatizar todos los dispositivos del hogar.": (
            "Controlador central para automatizar todos los dispositivos del hogar.",
            "Central controller to automate all the devices in your home.",
        ),
        "cinta led rgb de 5 m con control por app y 16 millones de colores.": (
            "Cinta LED RGB de 5 m con control por app y 16 millones de colores.",
            "5 m RGB LED strip with app control and 16 million colors.",
        ),
        "kit completo para iniciar la automatizacion del hogar.": (
            "Kit completo para iniciar la automatización del hogar.",
            "Complete kit to get started with home automation.",
        ),
        "cable utp cat6 de 50 metros para redes de alta velocidad.": (
            "Cable UTP Cat6 de 50 metros para redes de alta velocidad.",
            "50-meter UTP Cat6 cable for high-speed networks.",
        ),
        "sensor magnetico de apertura para puertas y ventanas.": (
            "Sensor magnético de apertura para puertas y ventanas.",
            "Magnetic door and window opening sensor.",
        ),
        "enchufe inteligente con control remoto via wifi y monitoreo de energia.": (
            "Enchufe inteligente con control remoto vía WiFi y monitoreo de energía.",
            "Smart plug with WiFi remote control and energy monitoring.",
        ),
        "fuente de poder 12v 5a para dispositivos de seguridad y automatizacion.": (
            "Fuente de poder 12V 5A para dispositivos de seguridad y automatización.",
            "12V 5A power supply for security and home automation devices.",
        ),
        "camara ip full hd con vision nocturna y deteccion de movimiento.": (
            "Cámara IP Full HD con visión nocturna y detección de movimiento.",
            "Full HD IP camera with night vision and motion detection.",
        ),
        "bateria recargable 18650 de 3000 mah para sensores y dispositivos.": (
            "Batería recargable 18650 de 3000 mAh para sensores y dispositivos.",
            "3000 mAh 18650 rechargeable battery for sensors and devices.",
        ),
        "termostato inteligente compatible con wifi, para climatizacion.": (
            "Termostato inteligente compatible con WiFi, para climatización.",
            "WiFi-compatible smart thermostat for climate control.",
        ),
        "interruptor tactil wifi para controlar la iluminacion desde el celular.": (
            "Interruptor táctil WiFi para controlar la iluminación desde el celular.",
            "WiFi touch switch to control lighting from your phone.",
        ),
        "sirena inalambrica con bateria integrada para alarmas de seguridad.": (
            "Sirena inalámbrica con batería integrada para alarmas de seguridad.",
            "Wireless siren with built-in battery for security alarm systems.",
        ),
        "detector de humo con alarma incluida y bateria de larga duracion.": (
            "Detector de humo con alarma incluida y batería de larga duración.",
            "Smoke detector with included alarm and long-lasting battery.",
        ),
        "persiana motorizada programable para automatizar la luz natural.": (
            "Persiana motorizada programable para automatizar la luz natural.",
            "Programmable motorized blind to automate natural light.",
        ),
        "panel tactil central para controlar toda la automatizacion desde un solo lugar.": (
            "Panel táctil central para controlar toda la automatización desde un solo lugar.",
            "Central touch panel to control all your home automation from one place.",
        ),
    },
}


def translate_database_value(value: Any, domain: str, language: Language) -> Any:
    """Translate a known enum-like string; preserve unknown values verbatim."""
    if not isinstance(value, str) or language not in {"es", "en"}:
        return value

    translations = _VALUE_TRANSLATIONS.get(domain)
    if not translations:
        return value

    translation = translations.get(_normalize(value))
    return translation[0 if language == "es" else 1] if translation else value


def add_database_value_labels(
    payload: Any,
    fields: Mapping[str, str | Mapping[str, Any]],
    language: Language,
) -> Any:
    """Copy response mappings and add localized labels without replacing values."""
    if isinstance(payload, list):
        return [add_database_value_labels(item, fields, language) for item in payload]
    if not isinstance(payload, Mapping):
        return payload

    result = dict(payload)
    for field, specification in fields.items():
        value = payload.get(field)
        if isinstance(specification, str):
            if value is not None:
                result[f"{field}_label"] = translate_database_value(value, specification, language)
        elif isinstance(specification, Mapping) and value is not None:
            result[field] = add_database_value_labels(value, specification, language)
    return result
