"""Verificación de base de datos (sesión independiente) para E2E de metros.

Lee el id del pedido desde el archivo generado por Playwright (o lo deduce como
el último pedido del cliente E2E) y valida contra la base de pruebas:

- cantidad_metros == 1.50 (corte fraccionario exacto)
- subtotal_detalle == 1500.00 y precio_unitario_detalle == 1000.00
- stock_producto == 8.50 (10.00 - 1.50)
- estado_pedido == "Pagado" y pago.estado == "aprobado"

Uso (dentro del contenedor api, con DATABASE_URL de pruebas):
    uv run python /app/scripts/e2e_verify.py [--pedido-file /app/fe/.e2e_pedido_id.txt]
"""
from __future__ import annotations

import sys
from decimal import Decimal
from pathlib import Path

for candidato in (Path.cwd(), Path("/app"), Path(__file__).resolve().parent.parent / "be"):
    if str(candidato.resolve()) not in sys.path:
        sys.path.insert(0, str(candidato.resolve()))

from app.database import SessionLocal  # noqa: E402
from app.models.cliente import Cliente  # noqa: E402
from app.models.pago import Pago  # noqa: E402
from app.models.pedido import DetallePedido, Pedido  # noqa: E402
from app.models.producto import Producto  # noqa: E402

EMAIL_CLIENTE = "e2e.cliente@neodomus.com"
REF_METROS = "E2E-CABLE-METROS"


def _leer_pedido_id(args: list[str]) -> int | None:
    for i, a in enumerate(args):
        if a == "--pedido-file" and i + 1 < len(args):
            p = Path(args[i + 1])
            if p.exists():
                return int(p.read_text().strip())
    return None


def main() -> int:
    pedido_id = _leer_pedido_id(sys.argv)
    db = SessionLocal()
    try:
        if pedido_id is None:
            cliente = db.query(Cliente).filter(Cliente.email == EMAIL_CLIENTE).first()
            if not cliente:
                print("FAIL: cliente E2E no encontrado")
                return 1
            pedido = (
                db.query(Pedido)
                .filter(Pedido.id_cliente_pe == cliente.id_cliente)
                .order_by(Pedido.id_pedido.desc())
                .first()
            )
        else:
            pedido = db.query(Pedido).filter(Pedido.id_pedido == pedido_id).first()
        if not pedido:
            print("FAIL: pedido no encontrado")
            return 1

        detalle = (
            db.query(DetallePedido)
            .filter(DetallePedido.id_pedido_d == pedido.id_pedido)
            .first()
        )
        pago = db.query(Pago).filter(Pago.id_pedido == pedido.id_pedido).first()
        prod = (
            db.query(Producto)
            .filter(Producto.referencia_producto == REF_METROS)
            .first()
        )

        errores: list[str] = []

        def check(cond: bool, msg: str) -> None:
            if not cond:
                errores.append(msg)

        check(pedido.estado_pedido == "Pagado", f"estado_pedido={pedido.estado_pedido}")
        check(pago is not None and pago.estado == "aprobado", f"pago.estado={getattr(pago, 'estado', None)}")
        check(detalle is not None, "detalle ausente")
        if detalle is not None:
            check(
                Decimal(str(detalle.cantidad_metros)) == Decimal("1.50"),
                f"cantidad_metros={detalle.cantidad_metros}",
            )
            check(
                Decimal(str(detalle.precio_unitario_detalle)) == Decimal("1000.00"),
                f"precio_unitario={detalle.precio_unitario_detalle}",
            )
            check(
                Decimal(str(detalle.subtotal_detalle)) == Decimal("1500.00"),
                f"subtotal={detalle.subtotal_detalle}",
            )
        check(
            prod is not None and Decimal(str(prod.stock_producto)) == Decimal("8.50"),
            f"stock_producto={getattr(prod, 'stock_producto', None)}",
        )

        if errores:
            print("FAIL:")
            for e in errores:
                print(" -", e)
            return 1
        print(f"OK pedido={pedido.id_pedido} metros=1.50 subtotal=1500.00 stock=8.50")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
