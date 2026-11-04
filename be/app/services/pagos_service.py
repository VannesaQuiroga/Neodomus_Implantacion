"""
Módulo: services/pagos_service.py
Simulador académico de pasarela de pagos para NEODOMUS.

NO realiza cobros reales ni integra servicios externos. Todo se simula
localmente: genera números de transacción ficticios y estados
(aprobado / rechazado / pendiente) con validaciones de los datos ingresados.
"""

from __future__ import annotations

import random
import re
import string
from datetime import datetime, timedelta

from fastapi import HTTPException

# ──────────────────────────────────────────────────────────────────
# Catálogos del simulador
# ──────────────────────────────────────────────────────────────────

# Métodos de pago soportados.
METODOS_PAGO = {
    "tarjeta_debito": "Tarjeta débito",
    "tarjeta_credito": "Tarjeta crédito",
    "pse": "PSE (Débito bancario)",
    "paypal": "PayPal (simulado)",
    "punto_pago": "Punto de pago (Efecty/Servientrega)",
}

# Bancos colombianos para el selector de PSE.
BANCOS_COLOMBIANOS = [
    "Banco de Bogotá",
    "Bancolombia",
    "Banco Davivienda",
    "Banco AV Villas",
    "BBVA Colombia",
    "Banco de Occidente",
    "Banco Popular",
    "Itaú Colombia",
    "Banco Caja Social",
    "Scotiabank Colpatria",
    "Banco Agrario de Colombia",
    "Nequi (solo ahorro)",
    "Daviplata",
]

# Puntos físicos de pago soportados (Efecty / Servientrega / similares).
PUNTOS_PAGO = [
    "Efecty",
    "Servientrega",
    "Otro punto de pago",
]

# Días de vigencia de un pago en punto físico.
DIAS_VIGENCIA_PUNTO_PAGO = 3

# Tarjetas de prueba para demostración:
#   - Los últimos 4 dígitos que terminan en 0001 simulan un RECHAZO.
#   - Cualquier otra tarjeta válida se aprueba.
TARJETAS_PRUEBA = {
    "4242424242424242": "aprobado",   # Visa de prueba
    "4242424242420001": "rechazado",  # Visa que rechaza
    "5555555555554444": "aprobado",   # Mastercard de prueba
    "5555555555550001": "rechazado",  # Mastercard que rechaza
}

RESULTADOS_VALIDOS = ("aprobado", "rechazado", "pendiente")


# ──────────────────────────────────────────────────────────────────
# Utilidades
# ──────────────────────────────────────────────────────────────────

def _generar_numero_transaccion(prefix: str = "PAY") -> str:
    """Genera una referencia única simulada, p. ej. NEO-PAY-2026-7F3KQ2."""
    anio = datetime.now().strftime("%Y")
    sufijo = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"NEO-{prefix}-{anio}-{sufijo}"


def _generar_referencia_punto_pago() -> str:
    """Referencia ficticia tipo NEODOMUS-2026-000123."""
    anio = datetime.now().strftime("%Y")
    numero = random.randint(1, 999999)
    return f"NEODOMUS-{anio}-{numero:06d}"


def _generar_codigo_punto_pago() -> str:
    """Código de pago ficticio tipo Efecty (números), p. ej. 5021 4839 7761 2045."""
    bloques = ["".join(random.choices(string.digits, k=4)) for _ in range(4)]
    return " ".join(bloques)


def _resultado_simulacion(datos: dict, permitidos: tuple = ("aprobado", "rechazado"), por_defecto: str = "aprobado") -> str:
    """Lee el campo 'resultado_simulacion' enviado por el checkout (entorno de
    prueba) y lo valida. Si no viene, usa 'por_defecto'."""
    valor = (datos.get("resultado_simulacion") or "").strip().lower()
    if not valor:
        return por_defecto
    if valor not in permitidos or valor not in RESULTADOS_VALIDOS:
        raise HTTPException(
            status_code=400,
            detail="Resultado de simulación no válido (usa: aprobado, rechazado o pendiente)",
        )
    return valor


def _luhn_valida(numero: str) -> bool:
    """Validación de tarjeta con el algoritmo de Luhn."""
    numero = numero.replace(" ", "")
    if not numero.isdigit() or not (13 <= len(numero) <= 19):
        return False
    total = 0
    doble = False
    for digito in reversed(numero):
        n = int(digito)
        if doble:
            n *= 2
            if n > 9:
                n -= 9
        total += n
        doble = not doble
    return total % 10 == 0


def _fecha_expiracion_valida(expiracion: str) -> bool:
    """Valida formato MM/AA y que la tarjeta no esté vencida."""
    expiracion = (expiracion or "").strip()
    if not re.fullmatch(r"\d{2}/\d{2}", expiracion):
        return False
    try:
        mes_txt, anio_txt = expiracion.split("/", 1)
        mes = int(mes_txt)
        anio = 2000 + int(anio_txt)
        if not (1 <= mes <= 12):
            return False
        ahora = datetime.now()
        if anio < ahora.year:
            return False
        if anio == ahora.year and mes < ahora.month:
            return False
        return True
    except (ValueError, TypeError):
        return False


def _validar_cvv(cvv: str) -> bool:
    return bool(cvv and cvv.isdigit() and len(cvv) in (3, 4))


# ──────────────────────────────────────────────────────────────────
# Procesamiento por método
# ──────────────────────────────────────────────────────────────────

def _pagar_tarjeta(datos: dict) -> dict:
    """Tarjeta débito/crédito: valida Luhn, expiración, CVV y simula el estado.

    El estado se puede forzar con 'resultado_simulacion' (aprobado/rechazado);
    si no se envía, las tarjetas de prueba ...0001 simulan un rechazo y las
    demás una aprobación."""
    numero = (datos.get("numero") or "").replace(" ", "")
    titular = (datos.get("titular") or "").strip()
    expiracion = datos.get("expiracion") or ""
    cvv = str(datos.get("cvv") or "")

    if not titular:
        raise HTTPException(status_code=400, detail="El titular de la tarjeta es obligatorio")
    # Las tarjetas de prueba documentadas (p. ej. ...0001) simulan un RECHAZO:
    # se respetan aunque no pasen el algoritmo de Luhn (solo verificación de dígitos).
    estado = TARJETAS_PRUEBA.get(numero)
    if estado is None:
        if not _luhn_valida(numero):
            raise HTTPException(status_code=400, detail="El número de tarjeta no es válido (algoritmo de Luhn)")
        estado = "aprobado"
    if not _fecha_expiracion_valida(expiracion):
        raise HTTPException(status_code=400, detail="La fecha de expiración no es válida o la tarjeta está vencida")
    if not _validar_cvv(cvv):
        raise HTTPException(status_code=400, detail="El CVV no es válido")

    # Selector de simulación (entorno de prueba): permite forzar el resultado.
    forzado = _resultado_simulacion(datos, ("aprobado", "rechazado"))
    if forzado != estado:
        estado = forzado

    return {
        "estado": estado,
        "numero_transaccion": _generar_numero_transaccion("PAY"),
        "ultimos_digitos": numero[-4:],
        "titular": titular,
        "banco": None,
    }


def _pagar_pse(datos: dict) -> dict:
    """PSE: requiere banco colombiano. Simula aprobado, rechazado o pendiente
    según el selector 'resultado_simulacion' (por defecto aprobado)."""
    banco = (datos.get("banco") or "").strip()
    if not banco:
        raise HTTPException(status_code=400, detail="Debes seleccionar un banco para pagar por PSE")
    if banco not in BANCOS_COLOMBIANOS:
        raise HTTPException(status_code=400, detail="El banco seleccionado no está soportado")
    estado = _resultado_simulacion(datos, ("aprobado", "rechazado", "pendiente"))
    return {
        "estado": estado,
        "numero_transaccion": _generar_numero_transaccion("PSE"),
        "banco": banco,
        "titular": (datos.get("titular") or "").strip() or None,
        "ultimos_digitos": None,
    }


def _pagar_paypal(datos: dict) -> dict:
    """PayPal simulado: valida un correo y simula aprobado o rechazado según el
    selector 'resultado_simulacion' (por defecto aprobado)."""
    correo = (datos.get("correo_paypal") or "").strip()
    if not correo or "@" not in correo:
        raise HTTPException(status_code=400, detail="Ingresa un correo de PayPal válido")
    estado = _resultado_simulacion(datos, ("aprobado", "rechazado"))
    return {
        "estado": estado,
        "numero_transaccion": _generar_numero_transaccion("PAYPAL"),
        "correo_paypal": correo,
        "titular": (datos.get("titular") or "").strip() or None,
        "ultimos_digitos": None,
    }


def _pagar_punto_pago(datos: dict) -> dict:
    """Punto de pago (Efecty/Servientrega): genera un pago PENDIENTE con
    referencia, código y fecha límite simulados."""
    punto = (datos.get("punto_pago") or "").strip()
    if punto not in PUNTOS_PAGO:
        raise HTTPException(status_code=400, detail="Selecciona un punto de pago válido (Efecty, Servientrega u otro)")
    return {
        "estado": "pendiente",
        "numero_transaccion": _generar_numero_transaccion("EFECTY"),
        "referencia_pago": _generar_referencia_punto_pago(),
        "codigo_punto_pago": _generar_codigo_punto_pago(),
        "punto_pago": punto,
        "fecha_limite": (datetime.now() + timedelta(days=DIAS_VIGENCIA_PUNTO_PAGO)).isoformat(),
        "titular": (datos.get("titular") or "").strip() or None,
        "ultimos_digitos": None,
        "banco": None,
    }


# ──────────────────────────────────────────────────────────────────
# Proveedor de pagos (simulador)
# ──────────────────────────────────────────────────────────────────

def proveedor_activo() -> str:
    """Devuelve el proveedor configurado: 'simulator' (único soportado)."""
    from app.config import settings

    return (settings.PAYMENT_PROVIDER or "simulator").strip().lower()


# ──────────────────────────────────────────────────────────────────
# Punto de entrada público
# ──────────────────────────────────────────────────────────────────

PROCESADORES = {
    "tarjeta_debito": _pagar_tarjeta,
    "tarjeta_credito": _pagar_tarjeta,
    "pse": _pagar_pse,
    "paypal": _pagar_paypal,
    "punto_pago": _pagar_punto_pago,
}


def procesar_pago(
    metodo: str,
    datos: dict,
    monto: float | None = None,
    reference: str | None = None,
    customer_email: str | None = None,
) -> dict:
    """Procesa un pago con el simulador académico local.

    No requiere credenciales, ni empresa, ni registro externo. Simula
    tarjeta, PSE, PayPal, Efecty/Servientrega y los estados
    aprobado/rechazado/pendiente.

    Retorna un dict con estado, numero_transaccion y datos del método.
    """
    if metodo not in PROCESADORES:
        raise HTTPException(status_code=400, detail="Método de pago no soportado")
    return PROCESADORES[metodo](datos or {})


def confirmar_pago_pendiente(pago) -> dict:
    """Confirma un pago pendiente (punto de pago) marcándolo como aprobado."""
    pago.estado = "aprobado"
    pago.fecha_pago = datetime.utcnow()
    return {
        "estado": pago.estado,
        "numero_transaccion": pago.numero_transaccion,
        "codigo_punto_pago": pago.codigo_punto_pago,
    }


def procesar_reembolso(monto: float, referencia_original: str | None = None) -> dict:
    """Procesa un reembolso con el simulador académico (siempre aprobado).

    Cuando se conecte una pasarela real, esta función debe llamar al
    proveedor configurado en PAYMENT_PROVIDER y puede devolver
    ``aprobado: False`` si la pasarela rechaza la operación.
    """
    numero = f"REB-{datetime.now().strftime('%Y%m%d%H%M%S')}-{int(monto * 100) % 1000000:06d}"
    return {
        "aprobado": True,
        "estado": "reembolsado",
        "monto": round(float(monto or 0), 2),
        "numero_transaccion": numero,
        "referencia_original": referencia_original,
        "proveedor": proveedor_activo(),
    }


def metodo_pago_legible(metodo: str) -> str:
    return METODOS_PAGO.get(metodo, metodo)
