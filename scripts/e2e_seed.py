"""Seed determinista e idempotente para las pruebas E2E de Neodomus.

Crea (si no existen) un cliente, un producto vendido por metros y un producto
por unidad, con identificadores fijos. ``--reset`` deja el stock en su valor
base y elimina SOLO los pedidos/recursos creados para estos fixtures (por
cliente/producto), sin vaciar tablas ni tocar otros datos.

Uso (dentro del contenedor api, con DATABASE_URL apuntando a la base de pruebas):
    uv run python /app/scripts/e2e_seed.py [--reset]
"""
from __future__ import annotations

import sys
from pathlib import Path

for candidato in (Path.cwd(), Path("/app"), Path(__file__).resolve().parent.parent / "be"):
    if str(candidato.resolve()) not in sys.path:
        sys.path.insert(0, str(candidato.resolve()))

from decimal import Decimal  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models.cliente import Cliente  # noqa: E402
from app.models.factura import Factura  # noqa: E402
from app.models.pago import Pago  # noqa: E402
from app.models.pedido import DetallePedido, Pedido  # noqa: E402
from app.models.producto import Producto  # noqa: E402
from app.utils.security import hash_password  # noqa: E402

EMAIL_CLIENTE = "e2e.cliente@neodomus.com"
PASSWORD_CLIENTE = "E2ePass123"
REF_METROS = "E2E-CABLE-METROS"
REF_UNIDAD = "E2E-SENSOR-UNIDAD"
STOCK_BASE_METROS = Decimal("10.00")
PRECIO_METROS = 1000.0
PRECIO_UNIDAD = 5000.0


def _upsert(db) -> None:
    cliente = db.query(Cliente).filter(Cliente.email == EMAIL_CLIENTE).first()
    if not cliente:
        cliente = Cliente(
            first_name="E2E",
            last_name="Cliente",
            email=EMAIL_CLIENTE,
            password_hash=hash_password(PASSWORD_CLIENTE),
            is_active=True,
            id_tipo_documento_c=1,
            documento_cliente=900000001,
            telefono_cliente=3000000001,
            address="Calle E2E 123",
        )
        db.add(cliente)
        db.flush()
    else:
        cliente.id_tipo_documento_c = cliente.id_tipo_documento_c or 1
        cliente.documento_cliente = cliente.documento_cliente or 900000001
        cliente.telefono_cliente = cliente.telefono_cliente or 3000000001
        cliente.address = cliente.address or "Calle E2E 123"

    prod_metros = db.query(Producto).filter(Producto.referencia_producto == REF_METROS).first()
    if not prod_metros:
        prod_metros = Producto(
            nombre_producto="Cable E2E",
            referencia_producto=REF_METROS,
            venta_por_metros=1,
            precio_venta_producto=PRECIO_METROS,
            stock_producto=STOCK_BASE_METROS,
            visible_cliente=True,
            estado_producto="activo",
        )
        db.add(prod_metros)
    else:
        prod_metros.stock_producto = STOCK_BASE_METROS

    prod_unidad = db.query(Producto).filter(Producto.referencia_producto == REF_UNIDAD).first()
    if not prod_unidad:
        prod_unidad = Producto(
            nombre_producto="Sensor E2E",
            referencia_producto=REF_UNIDAD,
            venta_por_metros=0,
            precio_venta_producto=PRECIO_UNIDAD,
            stock_producto=10,
            visible_cliente=True,
            estado_producto="activo",
        )
        db.add(prod_unidad)
    else:
        prod_unidad.stock_producto = 10

    db.commit()
    print(f"cliente={cliente.id_cliente} metros={prod_metros.id_producto} unidad={prod_unidad.id_producto}")


def _reset(db) -> None:
    cliente = db.query(Cliente).filter(Cliente.email == EMAIL_CLIENTE).first()
    if cliente:
        ids = [p.id_pedido for p in db.query(Pedido).filter(Pedido.id_cliente_pe == cliente.id_cliente).all()]
        for pid in ids:
            db.query(Factura).filter(Factura.id_pedido == pid).delete(synchronize_session=False)
            db.query(DetallePedido).filter(DetallePedido.id_pedido_d == pid).delete(synchronize_session=False)
            db.query(Pago).filter(Pago.id_pedido == pid).delete(synchronize_session=False)
            db.query(Pedido).filter(Pedido.id_pedido == pid).delete(synchronize_session=False)
    prod = db.query(Producto).filter(Producto.referencia_producto == REF_METROS).first()
    if prod:
        prod.stock_producto = STOCK_BASE_METROS
    prod_u = db.query(Producto).filter(Producto.referencia_producto == REF_UNIDAD).first()
    if prod_u:
        prod_u.stock_producto = 10
    db.commit()
    print("reset ok")


def main() -> int:
    reset = "--reset" in sys.argv
    db = SessionLocal()
    try:
        if reset:
            _reset(db)
        else:
            _upsert(db)
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
