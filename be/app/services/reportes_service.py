"""
Generación de reportes PDF para NEODOMUS.

Usa reportlab (misma paleta y estilos que factura_service.py).
"""
from __future__ import annotations

import io
from datetime import date, datetime
from pathlib import Path

from reportlab.graphics.charts.barcharts import HorizontalBarChart, VerticalBarChart
from reportlab.graphics.charts.legends import Legend
from reportlab.graphics.charts.piecharts import Pie
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# ── Paleta NEODOMUS ───────────────────────────────────────────────

ORO = colors.HexColor("#caa24d")
ORO_CLARO = colors.HexColor("#f0c96f")
NEGRO = colors.HexColor("#000000")
FONDO_TABLA = colors.HexColor("#f7f3ea")
FONDO_TOTAL = colors.HexColor("#f0e8d2")
GRIS = colors.HexColor("#6b6b6b")
BLANCO = colors.white

_LABEL_PERIODO = {"semana": "Semanal", "mes": "Mensual", "anio": "Anual", "personalizado": "Personalizado"}

# ── Estilos PDF ───────────────────────────────────────────────────


def _styles():
    base = getSampleStyleSheet()
    return {
        "titulo": ParagraphStyle(
            "titulo", parent=base["Title"], fontName="Helvetica-Bold",
            fontSize=18, textColor=ORO, alignment=TA_CENTER, spaceAfter=2,
        ),
        "sub": ParagraphStyle(
            "sub", fontName="Helvetica", fontSize=9, textColor=GRIS,
            alignment=TA_CENTER,
        ),
        "seccion": ParagraphStyle(
            "seccion", fontName="Helvetica-Bold", fontSize=11, textColor=ORO,
            spaceBefore=6, spaceAfter=4,
        ),
        "label": ParagraphStyle(
            "label", fontName="Helvetica-Bold", fontSize=9, textColor=NEGRO,
        ),
        "valor": ParagraphStyle(
            "valor", fontName="Helvetica", fontSize=9.5, textColor=NEGRO,
        ),
        "th": ParagraphStyle(
            "th", fontName="Helvetica-Bold", fontSize=8.5, textColor=BLANCO,
            alignment=TA_CENTER,
        ),
        "td": ParagraphStyle(
            "td", fontName="Helvetica", fontSize=8.5, textColor=NEGRO,
        ),
        "tdc": ParagraphStyle(
            "tdc", fontName="Helvetica", fontSize=8.5, textColor=NEGRO,
            alignment=TA_CENTER,
        ),
        "tdr": ParagraphStyle(
            "tdr", fontName="Helvetica", fontSize=8.5, textColor=NEGRO,
            alignment=TA_RIGHT,
        ),
        "tdb": ParagraphStyle(
            "tdb", fontName="Helvetica-Bold", fontSize=8.5, textColor=NEGRO,
        ),
        "tdcb": ParagraphStyle(
            "tdcb", fontName="Helvetica-Bold", fontSize=8.5, textColor=NEGRO,
            alignment=TA_CENTER,
        ),
        "tdrb": ParagraphStyle(
            "tdrb", fontName="Helvetica-Bold", fontSize=8.5, textColor=NEGRO,
            alignment=TA_RIGHT,
        ),
        "total_label": ParagraphStyle(
            "total_label", fontName="Helvetica-Bold", fontSize=10,
            textColor=NEGRO, alignment=TA_RIGHT,
        ),
        "total_valor": ParagraphStyle(
            "total_valor", fontName="Helvetica-Bold", fontSize=12,
            textColor=ORO, alignment=TA_RIGHT,
        ),
        "nota": ParagraphStyle(
            "nota", fontName="Helvetica", fontSize=7.5, textColor=GRIS,
            alignment=TA_CENTER,
        ),
        "marca": ParagraphStyle(
            "marca", fontName="Helvetica-Bold", fontSize=30, leading=36,
            textColor=ORO, alignment=TA_CENTER, spaceAfter=2,
        ),
        "portada_titulo": ParagraphStyle(
            "portada_titulo", fontName="Helvetica-Bold", fontSize=17, leading=21,
            textColor=NEGRO, alignment=TA_CENTER, spaceAfter=3,
        ),
        "portada_nombre": ParagraphStyle(
            "portada_nombre", fontName="Helvetica-Bold", fontSize=16, leading=19,
            textColor=ORO,
        ),
        "portada_rango": ParagraphStyle(
            "portada_rango", fontName="Helvetica-Bold", fontSize=16, leading=20,
            textColor=NEGRO, alignment=TA_CENTER,
        ),
        "portada_sub": ParagraphStyle(
            "portada_sub", fontName="Helvetica", fontSize=10.5, leading=13,
            textColor=GRIS, alignment=TA_CENTER,
        ),
        "portada_etiqueta": ParagraphStyle(
            "portada_etiqueta", fontName="Helvetica-Bold", fontSize=9,
            leading=12, textColor=GRIS, alignment=TA_CENTER,
            spaceBefore=6, spaceAfter=2,
        ),
        "portada_valor": ParagraphStyle(
            "portada_valor", fontName="Helvetica-Bold", fontSize=13,
            leading=17, textColor=NEGRO, alignment=TA_CENTER,
            spaceAfter=6,
        ),
        "portada_cab_nombre": ParagraphStyle(
            "portada_cab_nombre", fontName="Helvetica-Bold", fontSize=11,
            leading=13, textColor=ORO,
        ),
        "portada_caja_label": ParagraphStyle(
            "portada_caja_label", fontName="Helvetica-Bold", fontSize=7.5,
            leading=10, textColor=GRIS, alignment=TA_LEFT, spaceAfter=4,
        ),
        "portada_caja_valor": ParagraphStyle(
            "portada_caja_valor", fontName="Helvetica-Bold", fontSize=11,
            leading=15, textColor=NEGRO, alignment=TA_LEFT,
        ),
        "meta_label": ParagraphStyle(
            "meta_label", fontName="Helvetica-Bold", fontSize=8.5,
            textColor=GRIS, alignment=TA_RIGHT,
        ),
        "meta_valor": ParagraphStyle(
            "meta_valor", fontName="Helvetica-Bold", fontSize=9.5,
            textColor=NEGRO,
        ),
        "kpi_valor": ParagraphStyle(
            "kpi_valor", fontName="Helvetica-Bold", fontSize=15, leading=18,
            textColor=ORO, alignment=TA_CENTER, spaceAfter=2,
        ),
        "kpi_label": ParagraphStyle(
            "kpi_label", fontName="Helvetica", fontSize=8, textColor=GRIS,
            alignment=TA_CENTER,
        ),
        "grafico_titulo": ParagraphStyle(
            "grafico_titulo", fontName="Helvetica-Bold", fontSize=9.5,
            textColor=NEGRO, spaceBefore=8, spaceAfter=2,
        ),
        "sin_datos": ParagraphStyle(
            "sin_datos", fontName="Helvetica-Oblique", fontSize=9,
            textColor=GRIS, spaceBefore=2, spaceAfter=6,
        ),
        "parrafo": ParagraphStyle(
            "parrafo", fontName="Helvetica", fontSize=9, textColor=GRIS,
            leading=13,
        ),
    }


def _celda(texto, estilo):
    return Paragraph(str(texto or ""), estilo)


def _cop(valor) -> str:
    """Formatea un importe en COP (es-CO) conservando 2 decimales.

    Evita redondear a pesos enteros para no perder precisión monetaria
    (p. ej. 3999.75 se muestra como $3.999,75 y no como $4.000).
    """
    try:
        v = round(float(valor or 0), 2)
    except (TypeError, ValueError):
        v = 0.0
    entero, decimal = f"{v:.2f}".split(".")
    miles = f"{int(entero):,}".replace(",", ".")
    return f"${miles},{decimal} COP"


def _logo_pdf(ancho: float = 24) -> Image | None:
    """Imagen del logo NEODOMUS para el encabezado del documento."""
    ruta = Path(__file__).resolve().parent.parent / "assets" / "logo_neodomus.jpg"
    if not ruta.exists():
        return None
    try:
        from PIL import Image as PILImage

        with PILImage.open(ruta) as im:
            w, h = im.size
    except Exception:
        w, h = 342, 332
    alto = ancho * h / w
    return Image(str(ruta), width=ancho, height=alto)


# ── Helpers PDF comunes ──────────────────────────────────────────


def _header(
    s: dict,
    titulo: str,
    periodo: str,
    inicio: date,
    fin: date,
    tecnico_nombre: str | None,
):
    """Devuelve una lista de flowables con el encabezado del reporte."""
    historia = []
    historia.append(Paragraph(f"<b>NEODOMUS</b>", s["titulo"]))
    historia.append(Paragraph("Reportes del Sistema", s["sub"]))
    historia.append(Spacer(1, 2 * mm))

    linea = Table([[""]], colWidths=[180 * mm], rowHeights=[1])
    linea.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), ORO),
        ("LINEBELOW", (0, 0), (-1, -1), 0, ORO),
    ]))
    historia.append(linea)
    historia.append(Spacer(1, 4 * mm))

    historia.append(Paragraph(f"<b>{titulo}</b>", s["seccion"]))
    filtro_texto = f"Periodo: {periodo.capitalize()} | Del {inicio} al {fin}"
    if tecnico_nombre:
        filtro_texto += f" | Técnico: {tecnico_nombre}"
    historia.append(Paragraph(filtro_texto, s["sub"]))
    historia.append(Spacer(1, 4 * mm))

    return historia


def _footer(s: dict, historia: list):
    """Agrega el pie de página al final."""
    historia.append(Spacer(1, 6 * mm))
    linea = Table([[""]], colWidths=[180 * mm], rowHeights=[1])
    linea.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), ORO),
    ]))
    historia.append(linea)
    ahora = datetime.now().strftime("%Y-%m-%d %H:%M")
    historia.append(Paragraph(f"Generado el {ahora} - NEODOMUS", s["nota"]))


def _build_pdf(historia: list, titulo: str) -> io.BytesIO:
    """Construye el PDF en memoria y retorna un BytesIO."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
        title=f"{titulo} - NEODOMUS",
        author="NEODOMUS",
    )
    doc.build(historia)
    buf.seek(0)
    return buf


# ── PDF: Reporte de Ventas ───────────────────────────────────────


def generar_ventas_pdf(
    resumen: dict,
    ventas_por_periodo: list[dict],
    periodo: str,
    inicio: date,
    fin: date,
    tecnico_nombre: str | None,
) -> io.BytesIO:
    s = _styles()
    historia = _header(s, "REPORTE DE VENTAS", periodo, inicio, fin, tecnico_nombre)

    # ── Resumen ──────────────────────────────────────────
    historia.append(Paragraph("<b>RESUMEN</b>", s["seccion"]))
    res_data = [
        [_celda("Total Pedidos", s["label"]), _celda(str(resumen["total_pedidos"]), s["valor"])],
        [_celda("Ventas brutas (productos)", s["label"]), _celda(_cop(resumen["total_ventas_pedidos"]), s["valor"])],
        [_celda("Ingresos por citas", s["label"]), _celda(_cop(resumen["total_ingresos_citas"]), s["valor"])],
    ]
    res_tabla = Table(res_data, colWidths=[60 * mm, 80 * mm])
    res_tabla.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), FONDO_TABLA),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("GRID", (0, 0), (-1, -1), 0.5, GRIS),
    ]))
    historia.append(res_tabla)
    historia.append(Spacer(1, 2 * mm))

    # Total destacado
    total_data = [[
        _celda("TOTAL INGRESOS", s["total_label"]),
        _celda(_cop(resumen["total_ingresos"]), s["total_valor"]),
    ]]
    total_tabla = Table(total_data, colWidths=[60 * mm, 80 * mm])
    total_tabla.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    historia.append(total_tabla)
    historia.append(Spacer(1, 2 * mm))
    historia.append(Paragraph(
        "Las ventas se reportan en términos BRUTOS: no se descuentan reembolsos.",
        s["nota"],
    ))
    historia.append(Spacer(1, 6 * mm))

    # ── Detalle por periodo ──────────────────────────────
    if ventas_por_periodo:
        historia.append(Paragraph("<b>DETALLE POR PERIODO</b>", s["seccion"]))
        headers = ["Periodo", "Pedidos", "Ventas Productos", "Ingresos Citas", "Total"]
        enc_row = [_celda(h, s["th"]) for h in headers]
        rows = [enc_row]
        for v in ventas_por_periodo:
            rows.append([
                _celda(str(v["periodo"]), s["tdc"]),
                _celda(str(v["pedidos"]), s["tdc"]),
                _celda(_cop(v["ventas_pedidos"]), s["tdr"]),
                _celda(_cop(v["ingresos_citas"]), s["tdr"]),
                _celda(_cop(v["total"]), s["tdr"]),
            ])

        col_w = [30 * mm, 22 * mm, 38 * mm, 38 * mm, 38 * mm]
        det_tabla = Table(rows, colWidths=col_w, repeatRows=1)
        det_tabla.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), ORO),
            ("TEXTCOLOR", (0, 0), (-1, 0), BLANCO),
            ("BACKGROUND", (0, 1), (-1, -1), FONDO_TABLA),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [FONDO_TABLA, BLANCO]),
            ("GRID", (0, 0), (-1, -1), 0.5, GRIS),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]))
        historia.append(det_tabla)

    _footer(s, historia)
    return _build_pdf(historia, "Reporte de Ventas")


# ── PDF: Reporte de Citas ────────────────────────────────────────


def generar_citas_pdf(
    resumen: dict,
    citas_por_periodo: list[dict],
    periodo: str,
    inicio: date,
    fin: date,
    tecnico_nombre: str | None,
) -> io.BytesIO:
    s = _styles()
    historia = _header(s, "REPORTE DE CITAS", periodo, inicio, fin, tecnico_nombre)

    # ── Resumen ──────────────────────────────────────────
    historia.append(Paragraph("<b>RESUMEN</b>", s["seccion"]))
    pe = resumen["por_estado"]
    res_data = [
        [_celda("Total Citas", s["label"]), _celda(str(resumen["total_citas"]), s["valor"])],
        [_celda("Pendiente", s["label"]), _celda(str(pe.get("Pendiente", 0)), s["valor"])],
        [_celda("Confirmada", s["label"]), _celda(str(pe.get("Confirmada", 0)), s["valor"])],
        [_celda("Finalizada", s["label"]), _celda(str(pe.get("Finalizada", 0)), s["valor"])],
        [_celda("Cancelada", s["label"]), _celda(str(pe.get("Cancelada", 0)), s["valor"])],
        [_celda("Ingresos Totales", s["label"]), _celda(_cop(resumen["ingresos_total"]), s["valor"])],
    ]
    res_tabla = Table(res_data, colWidths=[60 * mm, 80 * mm])
    res_tabla.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), FONDO_TABLA),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("GRID", (0, 0), (-1, -1), 0.5, GRIS),
    ]))
    historia.append(res_tabla)
    historia.append(Spacer(1, 6 * mm))

    # ── Detalle por periodo ──────────────────────────────
    if citas_por_periodo:
        historia.append(Paragraph("<b>DETALLE POR PERIODO</b>", s["seccion"]))
        headers = ["Periodo", "Total", "Pendiente", "Confirmada", "Finalizada", "Cancelada"]
        enc_row = [_celda(h, s["th"]) for h in headers]
        rows = [enc_row]
        for c in citas_por_periodo:
            rows.append([
                _celda(str(c["periodo"]), s["tdc"]),
                _celda(str(c["total"]), s["tdc"]),
                _celda(str(c.get("Pendiente", 0)), s["tdc"]),
                _celda(str(c.get("Confirmada", 0)), s["tdc"]),
                _celda(str(c.get("Finalizada", 0)), s["tdc"]),
                _celda(str(c.get("Cancelada", 0)), s["tdc"]),
            ])

        col_w = [30 * mm, 22 * mm, 26 * mm, 28 * mm, 28 * mm, 28 * mm]
        det_tabla = Table(rows, colWidths=col_w, repeatRows=1)
        det_tabla.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), ORO),
            ("TEXTCOLOR", (0, 0), (-1, 0), BLANCO),
            ("BACKGROUND", (0, 1), (-1, -1), FONDO_TABLA),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [FONDO_TABLA, BLANCO]),
            ("GRID", (0, 0), (-1, -1), 0.5, GRIS),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]))
        historia.append(det_tabla)

    _footer(s, historia)
    return _build_pdf(historia, "Reporte de Citas")


# ── PDF: Reporte General del Panel ───────────────────────────────


def _leyenda(serie: list[tuple[str, str]]) -> Legend:
    """Leyenda horizontal para las gráficas (pares (color, nombre))."""
    leg = Legend()
    leg.x = 0
    leg.y = 8
    leg.fontName = "Helvetica"
    leg.fontSize = 7.5
    leg.boxAnchor = "w"
    leg.columnMaximum = 6
    leg.alignment = "left"
    leg.dx = 4
    leg.dy = 4
    leg.colorNamePairs = [(colors.HexColor(c), n) for c, n in serie]
    return leg


def _grafica_barras_vertical(
    s: dict,
    titulo: str,
    categorias: list[str],
    series: list[tuple[str, list[float], str]],
    divisor: float = 1.0,
) -> KeepTogether:
    """Gráfica de barras verticales agrupadas con leyenda (valores ya escalados)."""
    d = Drawing(500, 215)
    g = VerticalBarChart()
    g.x = 55
    g.y = 42
    g.width = 440
    g.height = 160
    g.data = [[v / divisor for v in valores] for _, valores, _ in series]
    g.categoryAxis.categoryNames = categorias
    g.categoryAxis.labels.fontSize = 7.5
    g.categoryAxis.labels.angle = 0
    g.categoryAxis.labels.boxAnchor = "n"
    g.categoryAxis.labels.dx = 0
    g.valueAxis.valueMin = 0
    g.valueAxis.labels.fontSize = 7
    g.valueAxis.labels.angle = 0
    g.groupSpacing = 14
    g.barWidth = 13
    for i, (_, _, color) in enumerate(series):
        g.bars[i].fillColor = colors.HexColor(color)
        g.bars[i].strokeColor = colors.white
    d.add(g)
    if len(series) > 1:
        d.add(_leyenda([(c, n) for n, _, c in series]))
    return KeepTogether([Paragraph(titulo, s["grafico_titulo"]), d])


def _grafica_barras_horizontal(
    s: dict,
    titulo: str,
    categorias: list[str],
    valores: list[float],
    divisor: float = 1.0,
) -> KeepTogether:
    """Gráfica de barras horizontales (una serie, color oro)."""
    alto = max(215, 60 + len(categorias) * 13)
    d = Drawing(500, alto)
    g = HorizontalBarChart()
    g.x = 105
    g.y = 30
    g.width = 390
    g.height = alto - 55
    g.data = [[v / divisor for v in valores]]
    g.categoryAxis.categoryNames = categorias
    g.categoryAxis.labels.fontSize = 7.5
    g.valueAxis.valueMin = 0
    g.valueAxis.labels.fontSize = 7
    g.barWidth = 11
    g.bars[0].fillColor = ORO
    g.bars[0].strokeColor = colors.white
    d.add(g)
    return KeepTogether([Paragraph(titulo, s["grafico_titulo"]), d])


def _grafica_dona(
    s: dict,
    titulo: str,
    valores: list[tuple[str, float, str]],
) -> KeepTogether:
    """Gráfica de dona con leyenda lateral (estados de las citas)."""
    d = Drawing(500, 215)
    p = Pie()
    p.x = 60
    p.y = 22
    p.width = 165
    p.height = 165
    p.data = [v for _, v, _ in valores]
    p.labels = None
    p.startAngle = 90
    p.innerRadiusFraction = 0.55
    for i, (_, _, color) in enumerate(valores):
        p.slices[i].fillColor = colors.HexColor(color)
        p.slices[i].strokeColor = colors.white
        p.slices[i].strokeWidth = 1
    d.add(p)
    leg = _leyenda([(c, f"{n} ({int(v)})") for n, v, c in valores])
    leg.x = 260
    leg.y = 60
    leg.columnMaximum = 1
    d.add(leg)
    return KeepTogether([Paragraph(titulo, s["grafico_titulo"]), d])


def _tabla_pdf(
    s: dict,
    headers: list[str],
    filas: list[list],
    col_widths: list,
    alineacion: list[str],
    totales: list | None = None,
) -> Table:
    """Tabla con encabezado dorado, filas alternadas y fila de totales opcional.
    alineacion: 'l' | 'c' | 'r' por columna."""
    fila_estilos = {"l": s["td"], "c": s["tdc"], "r": s["tdr"]}
    tot_estilos = {"l": s["tdb"], "c": s["tdcb"], "r": s["tdrb"]}
    rows = [[_celda(h, s["th"]) for h in headers]]
    for f in filas:
        rows.append([_celda(v, fila_estilos[a]) for v, a in zip(f, alineacion)])
    if totales is not None:
        rows.append([_celda(v, tot_estilos[a]) for v, a in zip(totales, alineacion)])

    t = Table(rows, colWidths=col_widths, repeatRows=1)
    st = [
        ("BACKGROUND", (0, 0), (-1, 0), ORO),
        ("TEXTCOLOR", (0, 0), (-1, 0), BLANCO),
        ("BACKGROUND", (0, 1), (-1, -1), FONDO_TABLA),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [FONDO_TABLA, BLANCO]),
        ("GRID", (0, 0), (-1, -1), 0.5, GRIS),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]
    if totales is not None:
        n = len(rows) - 1
        st += [
            ("BACKGROUND", (0, n), (-1, n), FONDO_TOTAL),
            ("TEXTCOLOR", (0, n), (-1, n), NEGRO),
        ]
    t.setStyle(TableStyle(st))
    return t


def generar_reporte_completo_pdf(
    datos: dict,
    periodo: str,
    inicio: date,
    fin: date,
    preparado_por: str = "Equipo Administrativo NEODOMUS",
) -> io.BytesIO:
    """Reporte general del panel en PDF profesional: encabezado compacto
    con la identidad corporativa (logo + marca), resumen ejecutivo,
    análisis con gráficas reales, detalle con tablas (encabezados
    repetidos y totales) y resumen final."""
    s = _styles()
    resumen = datos["resumen"]
    ventas = datos["ventas_por_periodo"]
    citas_por_periodo = datos["citas_por_periodo"]
    citas_detalle = datos["citas_detalle"]
    servicios = datos["servicios"]
    tecnicos_reporte = datos.get("tecnicos_reporte", [])
    clientes_citas = datos.get("clientes_citas", [])
    hay_datos = bool(datos.get("hay_datos"))
    pe = resumen.get("citas_por_estado", {})
    label = _LABEL_PERIODO.get(periodo, periodo.capitalize())
    ahora = datetime.now()

    historia: list = []

    # ── Encabezado corporativo compacto: logo pequeño + marca.
    #    Ocupa muy poco espacio; el título y la información del
    #    reporte conservan el protagonismo. ─────────────────────────
    historia.append(Spacer(1, 1 * mm))
    logo = _logo_pdf(ancho=24)
    if logo:
        celda_logo = Table([[logo]], colWidths=[14 * mm])
        celda_logo.setStyle(TableStyle([
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        contenido_cab = celda_logo
    else:
        contenido_cab = ""
    header = Table(
        [[
            contenido_cab,
            Paragraph(
                "NEODOMUS<br/><font size=6.5 color='#6b6b6b'>Soluciones Domóticas Inteligentes</font>",
                s["portada_cab_nombre"],
            ),
        ]],
        colWidths=[18 * mm, 128 * mm],
    )
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LINEBELOW", (0, 0), (-1, -1), 0.6, GRIS),
    ]))
    historia.append(header)

    historia.append(Spacer(1, 5 * mm))

    # Título del documento: protagonista, tamaño moderado.
    historia.append(Paragraph("REPORTE GENERAL DE GESTIÓN", s["portada_titulo"]))
    historia.append(Spacer(1, 5 * mm))

    # Cuadros de información (2 × 2): períodos, fecha, responsable y tipo
    def _caja(label: str, valor: str) -> list:
        return [
            Paragraph(label, s["portada_caja_label"]),
            Paragraph(valor, s["portada_caja_valor"]),
        ]

    grid_portada = Table(
        [
            [
                _caja(
                    "PERÍODO DEL REPORTE",
                    f"{inicio.strftime('%d/%m/%Y')} — {fin.strftime('%d/%m/%Y')}",
                ),
                _caja("FECHA DE GENERACIÓN", ahora.strftime("%d/%m/%Y")),
            ],
            [
                _caja("PREPARADO POR", preparado_por or "Equipo Administrativo NEODOMUS"),
                _caja("TIPO DE INFORME", "General de Gestión"),
            ],
        ],
        colWidths=[73 * mm, 73 * mm],
        hAlign="CENTER",
    )
    grid_portada.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.9, ORO),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, GRIS),
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    historia.append(grid_portada)

    historia.append(Spacer(1, 6 * mm))

    # ── 1. Resumen ejecutivo ─────────────────────────────
    historia.append(Paragraph("<b>1 · RESUMEN EJECUTIVO</b>", s["seccion"]))
    kpis_resumen = [
        ("Ventas totales del período", _cop(resumen.get("ventas_total", 0))),
        ("Pedidos del período", str(resumen.get("pedidos_total", 0))),
        ("Ingresos por citas (pagadas)", _cop(resumen.get("ingresos_citas", 0))),
        ("Ingresos por citas finalizadas", _cop(resumen.get("ingresos_citas_finalizadas", 0))),
        ("TOTAL INGRESOS DEL PERÍODO", _cop(resumen.get("total_ingresos", 0))),
        ("Citas del período", str(resumen.get("citas_total", 0))),
        ("Citas pendientes", str(pe.get("Pendiente", 0))),
        ("Citas confirmadas", str(pe.get("Confirmada", 0))),
        ("Citas finalizadas", str(pe.get("Finalizada", 0))),
        ("Citas canceladas", str(pe.get("Cancelada", 0))),
        ("Valor promedio de cita", _cop(resumen.get("promedio_costo_cita", 0))),
        ("Tipos de servicio atendidos", str(resumen.get("servicios_distintos", 0))),
        ("Clientes registrados en el período", str(resumen.get("clientes_registrados", 0))),
        ("Clientes totales", str(resumen.get("clientes_total", 0))),
        ("Técnicos activos", str(resumen.get("tecnicos_activos", 0))),
        ("Técnicos totales", str(resumen.get("tecnicos_total", 0))),
        ("Técnicos con citas en el período", str(resumen.get("tecnicos_con_citas", 0))),
        ("Productos activos", str(resumen.get("productos_activos", 0))),
        ("Productos totales", str(resumen.get("productos_total", 0))),
        ("Solicitudes pendientes", str(resumen.get("solicitudes_pendientes", 0))),
    ]
    res_rows = []
    for k, v in kpis_resumen:
        if k.startswith("TOTAL"):
            res_rows.append([_celda(k, s["total_label"]), _celda(v, s["total_valor"])])
        else:
            res_rows.append([_celda(k, s["label"]), _celda(v, s["valor"])])
    t_resumen = Table(res_rows, colWidths=[90 * mm, 70 * mm])
    t_resumen.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), FONDO_TABLA),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [FONDO_TABLA, BLANCO]),
        ("GRID", (0, 0), (-1, -1), 0.5, GRIS),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    historia.append(KeepTogether([t_resumen]))

    # ── 2. Análisis del período ──────────────────────────
    historia.append(Paragraph("<b>2 · ANÁLISIS DEL PERÍODO</b>", s["seccion"]))

    if ventas:
        historia.append(
            _grafica_barras_vertical(
                s,
                "Ventas del período (miles de COP)",
                [str(v["periodo"]) for v in ventas],
                [
                    ("Ventas productos", [v["ventas_pedidos"] for v in ventas], "#caa24d"),
                    ("Ingresos citas", [v["ingresos_citas"] for v in ventas], "#6b6b6b"),
                ],
                divisor=1000,
            )
        )

    if citas_por_periodo:
        estados_series = [
            ("Pendiente", [c.get("Pendiente", 0) for c in citas_por_periodo], "#caa24d"),
            ("Confirmada", [c.get("Confirmada", 0) for c in citas_por_periodo], "#f0c96f"),
            ("Finalizada", [c.get("Finalizada", 0) for c in citas_por_periodo], "#3d3d3d"),
            ("Cancelada", [c.get("Cancelada", 0) for c in citas_por_periodo], "#9f9f9f"),
        ]
        historia.append(
            _grafica_barras_vertical(
                s,
                "Citas del período por estado",
                [str(c["periodo"]) for c in citas_por_periodo],
                estados_series,
            )
        )

    total_estados = sum(int(pe.get(e, 0)) for e in ("Pendiente", "Confirmada", "Finalizada", "Cancelada"))
    if total_estados > 0:
        historia.append(
            _grafica_dona(
                s,
                "Distribución de citas por estado",
                [
                    ("Pendiente", pe.get("Pendiente", 0), "#caa24d"),
                    ("Confirmada", pe.get("Confirmada", 0), "#f0c96f"),
                    ("Finalizada", pe.get("Finalizada", 0), "#3d3d3d"),
                    ("Cancelada", pe.get("Cancelada", 0), "#9f9f9f"),
                ],
            )
        )

    if servicios:
        historia.append(
            _grafica_barras_horizontal(
                s,
                "Citas por tipo de servicio",
                [sv["tipo_servicio"][:26] for sv in servicios],
                [float(sv["cantidad"]) for sv in servicios],
            )
        )
        historia.append(
            _grafica_barras_horizontal(
                s,
                "Ingresos por tipo de servicio (miles de COP)",
                [sv["tipo_servicio"][:26] for sv in servicios],
                [sv["ingresos"] for sv in servicios],
                divisor=1000,
            )
        )

    if tecnicos_reporte:
        top = tecnicos_reporte[:10]
        historia.append(
            _grafica_barras_horizontal(
                s,
                "Citas por técnico (Top 10)",
                [t["nombre"][:26] for t in top],
                [float(t["total_citas"]) for t in top],
            )
        )

    if not hay_datos:
        historia.append(
            Paragraph(
                "No hay datos registrados para el período seleccionado.",
                s["sin_datos"],
            )
        )

    # ── 3. Detalle del período ───────────────────────────
    historia.append(Paragraph("<b>3 · DETALLE DEL PERÍODO</b>", s["seccion"]))

    if ventas:
        historia.append(Paragraph("<b>3.1 · Ventas por período</b>", s["grafico_titulo"]))
        historia.append(_tabla_pdf(
            s,
            ["Período", "Pedidos", "Ventas Productos", "Ingresos Citas", "Total"],
            [[
                str(v["periodo"]), str(v["pedidos"]),
                _cop(v["ventas_pedidos"]), _cop(v["ingresos_citas"]), _cop(v["total"]),
            ] for v in ventas],
            [28 * mm, 20 * mm, 40 * mm, 40 * mm, 40 * mm],
            ["c", "c", "r", "r", "r"],
            totales=[
                "TOTAL",
                str(sum(v["pedidos"] for v in ventas)),
                _cop(sum(v["ventas_pedidos"] for v in ventas)),
                _cop(sum(v["ingresos_citas"] for v in ventas)),
                _cop(sum(v["total"] for v in ventas)),
            ],
        ))
    else:
        historia.append(Paragraph("Sin ventas registradas en el período.", s["sin_datos"]))

    if citas_por_periodo:
        historia.append(Paragraph("<b>3.2 · Citas por período y estado</b>", s["grafico_titulo"]))
        historia.append(_tabla_pdf(
            s,
            ["Período", "Total", "Pendiente", "Confirmada", "Finalizada", "Cancelada"],
            [[
                str(c["periodo"]), str(c["total"]),
                str(c.get("Pendiente", 0)), str(c.get("Confirmada", 0)),
                str(c.get("Finalizada", 0)), str(c.get("Cancelada", 0)),
            ] for c in citas_por_periodo],
            [28 * mm, 20 * mm, 26 * mm, 28 * mm, 28 * mm, 28 * mm],
            ["c", "c", "c", "c", "c", "c"],
            totales=[
                "TOTAL",
                str(sum(c["total"] for c in citas_por_periodo)),
                str(sum(c.get("Pendiente", 0) for c in citas_por_periodo)),
                str(sum(c.get("Confirmada", 0) for c in citas_por_periodo)),
                str(sum(c.get("Finalizada", 0) for c in citas_por_periodo)),
                str(sum(c.get("Cancelada", 0) for c in citas_por_periodo)),
            ],
        ))

    historia.append(Paragraph("<b>3.3 · Detalle de citas del período</b>", s["grafico_titulo"]))
    if citas_detalle:
        historia.append(_tabla_pdf(
            s,
            ["ID", "Fecha", "Hora", "Cliente", "Técnico", "Servicio", "Estado", "Costo", "Pago"],
            [[
                str(c["id_cita"]),
                c["fecha"].strftime("%d/%m/%Y") if isinstance(c["fecha"], date) else str(c["fecha"]),
                str(c["hora"]),
                str(c["cliente"]),
                str(c["tecnico"]),
                str(c["servicio"])[:24],
                str(c["estado"]),
                _cop(c["costo"]),
                str(c["estado_pago"]),
            ] for c in citas_detalle],
            [10 * mm, 22 * mm, 14 * mm, 28 * mm, 26 * mm, 24 * mm, 18 * mm, 20 * mm, 15 * mm],
            ["c", "c", "c", "l", "l", "l", "c", "r", "c"],
        ))
    else:
        historia.append(Paragraph("No hay citas registradas en el período.", s["sin_datos"]))

    if servicios:
        total_citas_serv = sum(sv["cantidad"] for sv in servicios) or 1
        historia.append(Paragraph("<b>3.4 · Servicios del período</b>", s["grafico_titulo"]))
        historia.append(_tabla_pdf(
            s,
            ["Tipo de servicio", "Citas", "Pend.", "Conf.", "Fin.", "Canc.", "Ingresos", "% del total"],
            [[
                sv["tipo_servicio"][:30],
                str(sv["cantidad"]),
                str(sv["por_estado"].get("Pendiente", 0)),
                str(sv["por_estado"].get("Confirmada", 0)),
                str(sv["por_estado"].get("Finalizada", 0)),
                str(sv["por_estado"].get("Cancelada", 0)),
                _cop(sv["ingresos"]),
                f"{sv['cantidad'] / total_citas_serv * 100:.1f}%",
            ] for sv in servicios],
            [32 * mm, 14 * mm, 13 * mm, 14 * mm, 14 * mm, 14 * mm, 34 * mm, 16 * mm],
            ["l", "c", "c", "c", "c", "c", "r", "c"],
            totales=[
                "TOTAL",
                str(sum(sv["cantidad"] for sv in servicios)),
                "", "", "", "",
                _cop(sum(sv["ingresos"] for sv in servicios)),
                "100.0%",
            ],
        ))

    if clientes_citas:
        historia.append(Paragraph("<b>3.5 · Clientes con citas en el período (Top 15)</b>", s["grafico_titulo"]))
        historia.append(_tabla_pdf(
            s,
            ["Cliente", "Citas", "Gasto en citas"],
            [[
                c["nombre"][:40],
                str(c["citas"]),
                _cop(c["gasto"]),
            ] for c in clientes_citas],
            [90 * mm, 25 * mm, 55 * mm],
            ["l", "c", "r"],
            totales=[
                "TOTAL",
                str(sum(c["citas"] for c in clientes_citas)),
                _cop(sum(c["gasto"] for c in clientes_citas)),
            ],
        ))

    if tecnicos_reporte:
        historia.append(Paragraph("<b>3.6 · Rendimiento por técnico</b>", s["grafico_titulo"]))
        historia.append(_tabla_pdf(
            s,
            ["Técnico", "Citas", "Finalizadas", "Ingresos"],
            [[
                t["nombre"][:40],
                str(t["total_citas"]),
                str(t["finalizadas"]),
                _cop(t["ingresos"]),
            ] for t in tecnicos_reporte],
            [62 * mm, 30 * mm, 30 * mm, 45 * mm],
            ["l", "c", "c", "r"],
            totales=[
                "TOTAL",
                str(sum(t["total_citas"] for t in tecnicos_reporte)),
                str(sum(t["finalizadas"] for t in tecnicos_reporte)),
                _cop(sum(t["ingresos"] for t in tecnicos_reporte)),
            ],
        ))

    # ── 4. Resumen final ─────────────────────────────────
    historia.append(Paragraph("<b>4 · RESUMEN FINAL</b>", s["seccion"]))
    final = [
        ("TOTAL INGRESOS DEL PERÍODO", _cop(resumen.get("total_ingresos", 0))),
        ("Ingresos por citas finalizadas", _cop(resumen.get("ingresos_citas_finalizadas", 0))),
        ("Citas del período", str(resumen.get("citas_total", 0))),
        ("Servicios atendidos", str(resumen.get("servicios_distintos", 0))),
        ("Clientes registrados", str(resumen.get("clientes_registrados", 0))),
        ("Técnicos activos", str(resumen.get("tecnicos_activos", 0))),
        ("Valor promedio por cita", _cop(resumen.get("promedio_costo_cita", 0))),
        ("Solicitudes pendientes", str(resumen.get("solicitudes_pendientes", 0))),
    ]
    final_rows = []
    for k, v in final:
        if k.startswith("TOTAL"):
            final_rows.append([_celda(k, s["total_label"]), _celda(v, s["total_valor"])])
        else:
            final_rows.append([_celda(k, s["label"]), _celda(v, s["valor"])])
    t_final = Table(final_rows, colWidths=[90 * mm, 70 * mm], hAlign="CENTER")
    t_final.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), FONDO_TABLA),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [FONDO_TABLA, BLANCO]),
        ("GRID", (0, 0), (-1, -1), 0.5, GRIS),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    historia.append(KeepTogether([t_final]))
    historia.append(Spacer(1, 8 * mm))
    historia.append(
        Paragraph(
            "Este reporte fue generado automáticamente por el sistema de gestión NEODOMUS "
            "con los datos registrados en el período indicado. Para más detalle, "
            "consulte el panel de administración.",
            s["parrafo"],
        )
    )

    # ── Construcción del documento con pie de página ────
    buf = io.BytesIO()

    def _deco_pagina(canvas, doc):
        """Pie de página mínimo: línea divisoria y número de página.
        La identidad corporativa (logo + marca) va en el encabezado."""
        canvas.saveState()
        ancho = letter[0]
        canvas.setStrokeColor(GRIS)
        canvas.setLineWidth(0.4)
        canvas.line(18 * mm, 12 * mm, ancho - 18 * mm, 12 * mm)
        canvas.setFont("Helvetica", 6.5)
        canvas.setFillColor(GRIS)
        canvas.drawRightString(ancho - 18 * mm, 8 * mm, f"Página {doc.page}")
        canvas.restoreState()

    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
        title=f"Reporte {label} - NEODOMUS",
        author="NEODOMUS",
    )
    doc.build(historia, onFirstPage=_deco_pagina, onLaterPages=_deco_pagina)
    buf.seek(0)
    return buf