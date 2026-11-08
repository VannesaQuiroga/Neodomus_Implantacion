"""
Módulo: services/factura_service.py
Generación de facturas PDF (reportlab) y envío por correo.

Usa el mismo logo del navbar de NEODOMUS (be/app/static/Logo.jpg) y el
servicio de correo existente (app/utils/email.py).

Las facturas se generan EN MEMORIA (BytesIO) bajo demanda. No se guardan
en disco; el campo pdf_path de la tabla facturas quedó obsoleto.
"""

from __future__ import annotations

import io
import os
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Flowable,
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.config import settings
from app.utils.email import send_email
from app.utils.fechas import fecha_bogota

# Directorio del logo (las facturas ya NO se guardan en disco).
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
LOGO_PATH = STATIC_DIR / "Logo.jpg"

# Paleta NEODOMUS (dorado bronce + negro).
ORO = colors.HexColor("#caa24d")
ORO_CLARO = colors.HexColor("#f0c96f")
NEGRO = colors.HexColor("#000000")
FONDO_TABLA = colors.HexColor("#f7f3ea")
GRIS = colors.HexColor("#6b6b6b")

# Fuente: Inter (igual que el frontend). Si no está disponible se usa Helvetica.
_FUENTE = "Inter-Regular"
_FUENTE_BOLD = "Inter-Bold"
_INTER_PATHS = [
    STATIC_DIR / "fonts" / "Inter-Regular.ttf",
    STATIC_DIR / "fonts" / "Inter-Bold.ttf",
]
if _INTER_PATHS[0].exists() and _INTER_PATHS[1].exists():
    try:
        pdfmetrics.registerFont(TTFont(_FUENTE, str(_INTER_PATHS[0])))
        pdfmetrics.registerFont(TTFont(_FUENTE_BOLD, str(_INTER_PATHS[1])))
    except Exception:
        _FUENTE = "Helvetica"
        _FUENTE_BOLD = "Helvetica-Bold"
else:
    _FUENTE = "Helvetica"
    _FUENTE_BOLD = "Helvetica-Bold"


def formatear_cop(monto) -> str:
    try:
        valor = float(monto or 0)
    except (TypeError, ValueError):
        valor = 0
    return f"${valor:,.0f} COP".replace(",", ".")


class LogoCircular(Flowable):
    """Logo recortado en círculo (igual que el navbar), con borde dorado."""

    def __init__(self, ruta: str, tamaño: float, borde: bool = True):
        super().__init__()
        self.ruta = ruta
        self.tamaño = tamaño
        self.borde = borde
        self.width = tamaño
        self.height = tamaño

    def draw(self) -> None:
        c = self.canv
        radio = self.tamaño / 2.0
        cx, cy = radio, radio
        c.saveState()
        p = c.beginPath()
        p.circle(cx, cy, radio)
        c.clipPath(p, stroke=0, fill=0)
        c.drawImage(
            self.ruta,
            0,
            0,
            width=self.tamaño,
            height=self.tamaño,
            preserveAspectRatio=True,
            anchor="c",
        )
        c.restoreState()
        if self.borde:
            c.setStrokeColor(ORO)
            c.setLineWidth(1.5)
            c.circle(cx, cy, radio - 0.75)


def _logo_factura():
    """Una imagen de marca ausente no debe bloquear el comprobante de compra."""
    if LOGO_PATH.is_file():
        return LogoCircular(str(LOGO_PATH), 28 * mm)
    return Spacer(28 * mm, 28 * mm)


def _styles():
    estilos = getSampleStyleSheet()
    return {
        "titulo": ParagraphStyle(
            "titulo", parent=estilos["Title"], fontName=_FUENTE_BOLD,
            fontSize=20, textColor=ORO, alignment=TA_CENTER, spaceAfter=2,
        ),
        "sub": ParagraphStyle(
            "sub", fontName=_FUENTE, fontSize=9, textColor=GRIS, alignment=TA_CENTER,
        ),
        "label": ParagraphStyle(
            "label", fontName=_FUENTE_BOLD, fontSize=8.5, textColor=NEGRO, spaceAfter=1,
        ),
        "valor": ParagraphStyle(
            "valor", fontName=_FUENTE, fontSize=9.5, textColor=NEGRO,
        ),
        "th": ParagraphStyle(
            "th", fontName=_FUENTE_BOLD, fontSize=9, textColor=colors.white,
            alignment=TA_CENTER, spaceAfter=0,
        ),
        "td": ParagraphStyle(
            "td", fontName=_FUENTE, fontSize=9, textColor=NEGRO,
        ),
        "tdc": ParagraphStyle(
            "tdc", parent=None, fontName=_FUENTE, fontSize=9, textColor=NEGRO,
            alignment=TA_CENTER,
        ),
        "tdr": ParagraphStyle(
            "tdr", parent=None, fontName=_FUENTE, fontSize=9, textColor=NEGRO,
            alignment=TA_RIGHT,
        ),
        "total": ParagraphStyle(
            "total", fontName=_FUENTE_BOLD, fontSize=12, textColor=ORO,
            alignment=TA_RIGHT,
        ),
        "nota": ParagraphStyle(
            "nota", fontName=_FUENTE, fontSize=7.5, textColor=GRIS, alignment=TA_CENTER,
        ),
    }


def _celda(texto, estilo):
    return Paragraph(str(texto or ""), estilo)


def generar_factura_pdf(factura, pedido, cliente, detalles) -> io.BytesIO:
    """Genera el PDF de la factura en memoria y retorna un BytesIO."""
    s = _styles()
    numero_factura = factura.numero_factura

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
        title=f"Factura {numero_factura} - NEODOMUS",
        author="NEODOMUS",
    )

    historia = []

    # ── Encabezado: logo + nombre ──────────────────────────────────────
    tabla_logo = Table([[_logo_factura()]], colWidths=[30 * mm])
    tabla_logo.setStyle(
        TableStyle([
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ])
    )
    info_empresa = Table(
        [[Paragraph("<b>NEODOMUS</b>", s["titulo"])],
         [Paragraph("Innovación para tu hogar", s["sub"])],
         [Paragraph("Calle de la Domótica # 123, Bogotá D.C. - Colombia", s["sub"])],
         [Paragraph("contacto@neodomus.com", s["sub"])]],
        colWidths=[130 * mm],
    )
    info_empresa.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "RIGHT")]))
    encabezado = Table([[tabla_logo, info_empresa]], colWidths=[40 * mm, 140 * mm])
    encabezado.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    historia.append(encabezado)
    historia.append(Spacer(1, 2 * mm))

    linea = Table([[""]], colWidths=[180 * mm], rowHeights=[1.2])
    linea.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), ORO)]))
    historia.append(linea)
    historia.append(Spacer(1, 6 * mm))

    # ── Título ─────────────────────────────────────────────────────────
    historia.append(Paragraph(f"FACTURA {numero_factura}", s["titulo"]))
    historia.append(
        Paragraph(f"Fecha: {factura.fecha_factura.strftime('%d/%m/%Y %H:%M')}", s["sub"])
    )
    historia.append(Spacer(1, 6 * mm))

    # ── Datos del cliente ──────────────────────────────────────────────
    tipo_doc = "CC"
    if cliente.id_tipo_documento_c:
        try:
            from app.models.otros import TipoDocumento
            td = cliente.id_tipo_documento_c
            # resolve by id if possible
            tipo_doc = "CC"
        except Exception:
            tipo_doc = "CC"
    documento = cliente.documento_cliente or "No registrado"
    telefono = cliente.telefono_cliente or "No registrado"
    direccion = cliente.address or "No registrada"

    datos_cliente = [
        [_celda("CLIENTE", s["label"]), _celda("TIPO DOC", s["label"]),
         _celda("NÚMERO DOC", s["label"])],
        [_celda(f"{cliente.first_name} {cliente.last_name}".strip(), s["valor"]),
         _celda(tipo_doc, s["valor"]),
         _celda(documento, s["valor"])],
        [_celda("TELÉFONO", s["label"]), _celda("CORREO", s["label"]),
         _celda("DIRECCIÓN", s["label"])],
        [_celda(telefono, s["valor"]), _celda(cliente.email, s["valor"]),
         _celda(direccion, s["valor"])],
    ]
    tabla_cliente = Table(datos_cliente, colWidths=[60 * mm, 45 * mm, 75 * mm])
    tabla_cliente.setStyle(
        TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e0d5b0")),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#f0e6cc")),
            ("BACKGROUND", (0, 0), (-1, 0), FONDO_TABLA),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ])
    )
    historia.append(tabla_cliente)
    historia.append(Spacer(1, 6 * mm))

    # ── Datos del pago ─────────────────────────────────────────────────
    metodo = factura.metodo_pago or ""
    estado = factura.estado_pago or ""
    transaccion = factura.numero_transaccion or "N/A"
    datos_pago = [
        [_celda("MÉTODO DE PAGO", s["label"]), _celda("ESTADO DEL PAGO", s["label"]),
         _celda("N° TRANSACCIÓN", s["label"])],
        [_celda(metodo, s["valor"]), _celda(estado, s["valor"]), _celda(transaccion, s["valor"])],
    ]
    tabla_pago = Table(datos_pago, colWidths=[70 * mm, 55 * mm, 55 * mm])
    tabla_pago.setStyle(
        TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e0d5b0")),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#f0e6cc")),
            ("BACKGROUND", (0, 0), (-1, 0), FONDO_TABLA),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ])
    )
    historia.append(tabla_pago)
    historia.append(Spacer(1, 6 * mm))

    # ── Detalle de productos ───────────────────────────────────────────
    historia.append(Paragraph("DETALLE DE LA COMPRA", s["label"]))
    historia.append(Spacer(1, 2 * mm))

    cabecera = [
        _celda("PRODUCTO", s["th"]),
        _celda("MARCA", s["th"]),
        _celda("CANT.", s["th"]),
        _celda("P. UNITARIO", s["th"]),
        _celda("SUBTOTAL", s["th"]),
    ]
    filas = [cabecera]
    for det in detalles:
        nombre = det.descripcion_detalle or (det.producto.nombre_producto if det.producto else "Producto")
        marca = det.producto.marca if det.producto and det.producto.marca else "-"
        cantidad = str(det.cantidad_detalle or 1)
        if det.cantidad_metros:
            cantidad = f"{det.cantidad_metros:g} m"
        filas.append([
            _celda(nombre, s["td"]),
            _celda(marca, s["td"]),
            _celda(cantidad, s["tdc"]),
            _celda(formatear_cop(det.precio_unitario_detalle), s["tdr"]),
            _celda(formatear_cop(det.subtotal_detalle), s["tdr"]),
        ])

    tabla_detalle = Table(filas, colWidths=[78 * mm, 30 * mm, 22 * mm, 26 * mm, 26 * mm], repeatRows=1)
    estilos_detalle = [
        ("BACKGROUND", (0, 0), (-1, 0), ORO),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e0d5b0")),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#f0e6cc")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, FONDO_TABLA]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    tabla_detalle.setStyle(TableStyle(estilos_detalle))
    historia.append(tabla_detalle)
    historia.append(Spacer(1, 6 * mm))

    # ── Servicios incluidos (si los hay) ───────────────────────────────
    servicios = [d for d in detalles if d.id_producto_d is None]
    if servicios:
        historia.append(Paragraph("SERVICIOS INCLUIDOS", s["label"]))
        historia.append(Spacer(1, 2 * mm))
        filas_s = [
            [_celda("SERVICIO", s["th"]), _celda("DESCRIPCIÓN", s["th"]),
             _celda("FECHA", s["th"]), _celda("VALOR", s["th"])],
        ]
        for det in servicios:
            descripcion = (det.descripcion_detalle or "Servicio técnico")
            nombre = descripcion.split("\n")[0] if "\n" in descripcion else "Servicio técnico"
            resto = (det.descripcion_detalle or "")
            if "\n" in resto:
                resto = resto.split("\n", 1)[1]
            fecha = det.fecha_servicio.strftime("%d/%m/%Y") if det.fecha_servicio else "-"
            filas_s.append([
                _celda(nombre, s["td"]),
                _celda(resto or "-", s["td"]),
                _celda(fecha, s["tdc"]),
                _celda(formatear_cop(det.subtotal_detalle), s["tdr"]),
            ])
        tabla_serv = Table(filas_s, colWidths=[45 * mm, 75 * mm, 25 * mm, 35 * mm], repeatRows=1)
        tabla_serv.setStyle(TableStyle(estilos_detalle))
        historia.append(tabla_serv)
        historia.append(Spacer(1, 6 * mm))

    # ── Total ──────────────────────────────────────────────────────────
    tabla_total = Table(
        [[_celda("TOTAL A PAGAR", s["label"]), _celda(formatear_cop(pedido.total_pedido), s["total"])]],
        colWidths=[130 * mm, 50 * mm],
    )
    tabla_total.setStyle(
        TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LINEABOVE", (0, 0), (-1, 0), 1, ORO),
            ("ALIGN", (1, 0), (1, 0), "RIGHT"),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ])
    )
    historia.append(tabla_total)
    historia.append(Spacer(1, 10 * mm))

    # ── Pie ────────────────────────────────────────────────────────────
    historia.append(Paragraph(
        "Esta factura fue generada por el sistema de NEODOMUS con fines "
        "académicos/de demostración. No representa un cobro real.",
        s["nota"],
    ))
    historia.append(Paragraph(
        f"Generado el {fecha_bogota().strftime('%d/%m/%Y %H:%M')} - NEODOMUS · "
        "Innovación para tu hogar",
        s["nota"],
    ))

    doc.build(historia)
    buffer.seek(0)
    return buffer


async def enviar_factura_por_correo(to_email: str, pdf_bytes: io.BytesIO) -> bool:
    """Envía la factura PDF adjunta al correo del cliente."""
    subject = "NEODOMUS - Tu factura de compra"
    body = f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><title>Factura NEODOMUS</title></head>
    <body style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
            <h1 style="color: #caa24d; text-align: center;">NEODOMUS</h1>
            <p style="font-size: 16px; line-height: 1.5; color: #333;">
                Gracias por tu compra. Adjunto encontrarás tu factura en formato PDF.
            </p>
            <p style="font-size: 14px; color: #7f8c8d;">
                Si no realizaste esta compra, ignora este mensaje.
            </p>
            <hr style="margin: 30px 0;">
            <p style="font-size: 12px; color: #95a5a6; text-align: center;">
                NEODOMUS - Innovación para tu hogar
            </p>
        </div>
    </body>
    </html>
    """
    from app.utils.email import send_email_with_attachment

    return await send_email_with_attachment(to_email, subject, body, pdf_bytes)


# ── Factura para Citas (servicios standalone) ────────────────────────────────


def generar_factura_cita_pdf(factura, cita, cliente) -> io.BytesIO:
    """Genera el PDF de la factura para una cita en memoria y retorna un BytesIO."""
    s = _styles()
    numero_factura = factura.numero_factura

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
        title=f"Factura {numero_factura} - NEODOMUS",
        author="NEODOMUS",
    )

    historia = []

    # ── Encabezado: logo + nombre ──────────────────────────────────────
    tabla_logo = Table([[_logo_factura()]], colWidths=[30 * mm])
    tabla_logo.setStyle(
        TableStyle([
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ])
    )
    info_empresa = Table(
        [[Paragraph("<b>NEODOMUS</b>", s["titulo"])],
         [Paragraph("Innovación para tu hogar", s["sub"])],
         [Paragraph("Calle de la Domótica # 123, Bogotá D.C. - Colombia", s["sub"])],
         [Paragraph("contacto@neodomus.com", s["sub"])]],
        colWidths=[130 * mm],
    )
    info_empresa.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "RIGHT")]))
    encabezado = Table([[tabla_logo, info_empresa]], colWidths=[40 * mm, 140 * mm])
    encabezado.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    historia.append(encabezado)
    historia.append(Spacer(1, 2 * mm))

    linea = Table([[""]], colWidths=[180 * mm], rowHeights=[1.2])
    linea.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), ORO)]))
    historia.append(linea)
    historia.append(Spacer(1, 6 * mm))

    # ── Título ─────────────────────────────────────────────────────────
    historia.append(Paragraph(f"FACTURA {numero_factura}", s["titulo"]))
    historia.append(
        Paragraph(f"Fecha: {factura.fecha_factura.strftime('%d/%m/%Y %H:%M')}", s["sub"])
    )
    historia.append(Spacer(1, 6 * mm))

    # ── Datos del cliente ──────────────────────────────────────────────
    tipo_doc = "CC"
    documento = cliente.documento_cliente or "No registrado"
    telefono = cliente.telefono_cliente or "No registrado"
    direccion = cliente.address or "No registrada"

    datos_cliente = [
        [_celda("CLIENTE", s["label"]), _celda("TIPO DOC", s["label"]),
         _celda("NÚMERO DOC", s["label"])],
        [_celda(f"{cliente.first_name} {cliente.last_name}".strip(), s["valor"]),
         _celda(tipo_doc, s["valor"]),
         _celda(documento, s["valor"])],
        [_celda("TELÉFONO", s["label"]), _celda("CORREO", s["label"]),
         _celda("DIRECCIÓN", s["label"])],
        [_celda(telefono, s["valor"]), _celda(cliente.email, s["valor"]),
         _celda(direccion, s["valor"])],
    ]
    tabla_cliente = Table(datos_cliente, colWidths=[60 * mm, 45 * mm, 75 * mm])
    tabla_cliente.setStyle(
        TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e0d5b0")),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#f0e6cc")),
            ("BACKGROUND", (0, 0), (-1, 0), FONDO_TABLA),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ])
    )
    historia.append(tabla_cliente)
    historia.append(Spacer(1, 6 * mm))

    # ── Datos del pago ─────────────────────────────────────────────────
    metodo = factura.metodo_pago or ""
    estado = factura.estado_pago or ""
    transaccion = factura.numero_transaccion or "N/A"
    datos_pago = [
        [_celda("MÉTODO DE PAGO", s["label"]), _celda("ESTADO DEL PAGO", s["label"]),
         _celda("N° TRANSACCIÓN", s["label"])],
        [_celda(metodo, s["valor"]), _celda(estado, s["valor"]), _celda(transaccion, s["valor"])],
    ]
    tabla_pago = Table(datos_pago, colWidths=[70 * mm, 55 * mm, 55 * mm])
    tabla_pago.setStyle(
        TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e0d5b0")),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#f0e6cc")),
            ("BACKGROUND", (0, 0), (-1, 0), FONDO_TABLA),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ])
    )
    historia.append(tabla_pago)
    historia.append(Spacer(1, 6 * mm))

    # ── Detalle del servicio ───────────────────────────────────────────
    historia.append(Paragraph("DETALLE DEL SERVICIO", s["label"]))
    historia.append(Spacer(1, 2 * mm))

    filas_svc = [
        [_celda("SERVICIO", s["th"]), _celda("FECHA", s["th"]),
         _celda("HORA", s["th"]), _celda("DIRECCIÓN", s["th"]), _celda("VALOR", s["th"])],
        [_celda(cita.tipo_servicio.capitalize(), s["td"]),
         _celda(cita.fecha.strftime("%d/%m/%Y") if cita.fecha else "-", s["tdc"]),
         _celda(cita.hora or "-", s["tdc"]),
         _celda(cita.direccion or "-", s["td"]),
         _celda(formatear_cop(cita.costo_cita), s["tdr"])],
    ]

    tabla_svc = Table(filas_svc, colWidths=[35 * mm, 25 * mm, 20 * mm, 65 * mm, 35 * mm], repeatRows=1)
    estilos_detalle = [
        ("BACKGROUND", (0, 0), (-1, 0), ORO),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e0d5b0")),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#f0e6cc")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, FONDO_TABLA]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    tabla_svc.setStyle(TableStyle(estilos_detalle))
    historia.append(tabla_svc)
    historia.append(Spacer(1, 6 * mm))

    # ── Total ──────────────────────────────────────────────────────────
    tabla_total = Table(
        [[_celda("TOTAL A PAGAR", s["label"]),
          _celda(formatear_cop(cita.costo_cita), s["total"])]],
        colWidths=[130 * mm, 50 * mm],
    )
    tabla_total.setStyle(
        TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LINEABOVE", (0, 0), (-1, 0), 1, ORO),
            ("ALIGN", (1, 0), (1, 0), "RIGHT"),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ])
    )
    historia.append(tabla_total)
    historia.append(Spacer(1, 10 * mm))

    # ── Pie ────────────────────────────────────────────────────────────
    historia.append(Paragraph(
        "Esta factura fue generada por el sistema de NEODOMUS con fines "
        "académicos/de demostración. No representa un cobro real.",
        s["nota"],
    ))
    historia.append(Paragraph(
        f"Generado el {fecha_bogota().strftime('%d/%m/%Y %H:%M')} - NEODOMUS · "
        "Innovación para tu hogar",
        s["nota"],
    ))

    doc.build(historia)
    buffer.seek(0)
    return buffer


def crear_factura_cita(db, cita, cliente) -> None:
    """Crea la factura de una cita y envía el correo.

    El PDF se genera en memoria (no se guarda en disco).
    El envío de correo es fire-and-forget (no bloquea la respuesta).
    """
    import asyncio

    from app.models.factura import Factura
    from app.utils.email import send_email_with_attachment

    numero_factura = f"FAC-{fecha_bogota().strftime('%Y%m%d')}-{cita.id_cita:06d}"
    factura = Factura(
        id_cita=cita.id_cita,
        numero_factura=numero_factura,
        fecha_factura=fecha_bogota(),
        monto_total=float(cita.costo_cita or 0),
        metodo_pago=cita.metodo_pago,
        estado_pago=cita.estado_pago,
        numero_transaccion=cita.numero_transaccion,
    )
    db.add(factura)
    db.commit()
    db.refresh(factura)

    try:
        pdf_buffer = generar_factura_cita_pdf(factura, cita, cliente)
    except Exception as e:
        print(f"Error generando PDF de factura {numero_factura}: {e}")
        return

    # Envío de correo fire-and-forget.
    subject = "NEODOMUS - Tu factura de servicio"
    body = """
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><title>Factura NEODOMUS</title></head>
    <body style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
            <h1 style="color: #caa24d; text-align: center;">NEODOMUS</h1>
            <p style="font-size: 16px; line-height: 1.5; color: #333;">
                Gracias por contratar nuestro servicio. Adjunto encontrarás tu factura en formato PDF.
            </p>
            <p style="font-size: 14px; color: #7f8c8d;">
                Si no realizaste esta compra, ignora este mensaje.
            </p>
            <hr style="margin: 30px 0;">
            <p style="font-size: 12px; color: #95a5a6; text-align: center;">
                NEODOMUS - Innovación para tu hogar
            </p>
        </div>
    </body>
    </html>
    """

    # Se capturan los datos antes de programar el envío: en rutas síncronas el
    # correo sale en un hilo posterior y la sesión de BD de la petición ya pudo
    # cerrarse (evita DetachedInstanceError).
    correo_cliente = cliente.email
    factura_id = factura.id_factura

    async def _enviar():
        try:
            enviado = await send_email_with_attachment(
                correo_cliente, subject, body, pdf_buffer
            )
        except Exception as e:
            print(f"Error enviando factura {numero_factura} a {correo_cliente}: {e}")
            return
        if not enviado:
            return
        # Marca la factura como enviada con una sesión propia: la tarea puede
        # ejecutarse después de que la petición haya cerrado su sesión.
        from app.database import SessionLocal

        sesion = SessionLocal()
        try:
            actual = sesion.get(Factura, factura_id)
            if actual is not None:
                actual.enviada_por_correo = True
                sesion.commit()
        except Exception as e:
            sesion.rollback()
            print(f"No se pudo marcar la factura {numero_factura} como enviada: {e}")
        finally:
            sesion.close()

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        # Ruta síncrona (FastAPI la ejecuta en un hilo sin event loop): el envío
        # se hace en un hilo daemon para no bloquear la respuesta.
        import threading

        def _enviar_en_hilo():
            try:
                asyncio.run(_enviar())
            except Exception as e:
                print(f"Error en hilo de factura {numero_factura}: {e}")

        threading.Thread(target=_enviar_en_hilo, daemon=True).start()
        return
    loop.create_task(_enviar())
