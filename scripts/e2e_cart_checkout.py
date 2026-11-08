import json
import os
from decimal import Decimal
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from urllib.request import urlopen
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
if not os.environ.get("TEST_DATABASE_URL"):
    raise RuntimeError("Configura TEST_DATABASE_URL con una base exclusiva de pruebas.")
sys.path.insert(0, str(ROOT / 'be'))
os.chdir(ROOT / 'be')

import app.tests.testdb as testdb
from app.models.categoria import Categoria
from app.models.cliente import Cliente
from app.models.factura import Factura
from app.models.notificacion import Notificacion
from app.models.pago import Pago
from app.models.pedido import DetallePedido, Pedido
from app.models.producto import Producto
from app.models.producto_variante import ProductoVariante
from app.models.proveedor import Proveedor
from app.models.roles_usuario import RolesUsuario
from app.models.user import User
from app.utils.security import hash_password
from sqlalchemy import func, select


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def wait_ready(process, url):
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError('Servidor E2E terminó antes de estar listo')
        try:
            with urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except (OSError, TimeoutError):
            pass
        time.sleep(.2)
    raise RuntimeError('Servidor E2E no respondió en 60 segundos')


def verify_order(result):
    with testdb.TestSessionLocal() as db:
        pedido = db.get(Pedido, result['pedido_id'])
        if pedido is None:
            raise AssertionError('El pedido no existe en la base de datos')
        if Decimal(str(pedido.total_pedido)) != Decimal('3000.00'):
            raise AssertionError(f'Total inesperado: {pedido.total_pedido}')
        if pedido.estado_pedido != 'Pagado':
            raise AssertionError(f'Estado inesperado: {pedido.estado_pedido}')
        if db.query(Pedido).filter(Pedido.id_cliente_pe == pedido.id_cliente_pe).count() != 1:
            raise AssertionError('Se crearon pedidos duplicados')

        detalles = db.query(DetallePedido).filter(
            DetallePedido.id_pedido_d == pedido.id_pedido
        ).order_by(DetallePedido.id_detalle).all()
        if len(detalles) != 2:
            raise AssertionError(f'Detalles inesperados: {len(detalles)}')
        unit_detail = next(d for d in detalles if d.id_producto_d == result['unidad_id'])
        metres_detail = next(d for d in detalles if d.id_producto_d == result['metros_id'])
        if unit_detail.cantidad_detalle != 2:
            raise AssertionError(f'Cantidad unitaria inesperada: {unit_detail.cantidad_detalle}')
        if Decimal(str(unit_detail.precio_unitario_detalle)) != Decimal('750.00'):
            raise AssertionError(f'Precio unitario inesperado: {unit_detail.precio_unitario_detalle}')
        if Decimal(str(unit_detail.subtotal_detalle)) != Decimal('1500.00'):
            raise AssertionError(f'Subtotal unitario inesperado: {unit_detail.subtotal_detalle}')
        if Decimal(str(metres_detail.cantidad_metros)) != Decimal('1.50'):
            raise AssertionError(f'Metros inesperados: {metres_detail.cantidad_metros}')
        if metres_detail.cantidad_detalle != 1:
            raise AssertionError(f'Unidades de metros inesperadas: {metres_detail.cantidad_detalle}')
        if Decimal(str(metres_detail.precio_unitario_detalle)) != Decimal('1000.00'):
            raise AssertionError(f'Precio por metro inesperado: {metres_detail.precio_unitario_detalle}')
        if Decimal(str(metres_detail.subtotal_detalle)) != Decimal('1500.00'):
            raise AssertionError(f'Subtotal de metros inesperado: {metres_detail.subtotal_detalle}')

        pagos = db.query(Pago).filter(Pago.id_pedido == pedido.id_pedido).all()
        if len(pagos) != 1:
            raise AssertionError(f'Pagos inesperados: {len(pagos)}')
        pago = pagos[0]
        if pago.estado != 'aprobado' or pago.metodo_pago != 'tarjeta_debito':
            raise AssertionError(f'Pago inesperado: {pago.estado}/{pago.metodo_pago}')
        if Decimal(str(pago.monto)) != Decimal('3000.00'):
            raise AssertionError(f'Monto pagado inesperado: {pago.monto}')

        facturas = db.query(Factura).filter(Factura.id_pedido == pedido.id_pedido).all()
        if len(facturas) != 1:
            raise AssertionError(f'Facturas inesperadas: {len(facturas)}')
        if Decimal(str(facturas[0].monto_total)) != Decimal('3000.00'):
            raise AssertionError(f'Monto de factura inesperado: {facturas[0].monto_total}')

        unit_product = db.get(Producto, result['unidad_id'])
        metres_product = db.get(Producto, result['metros_id'])
        variant = db.get(ProductoVariante, result['variante_id'])
        stock_real = (
            Decimal(str(unit_product.stock_producto)),
            Decimal(str(variant.stock)),
            Decimal(str(metres_product.stock_producto)),
        )
        if stock_real != (Decimal('8.00'), Decimal('8.00'), Decimal('8.50')):
            raise AssertionError(f'Stock inesperado: {stock_real}')

        return {
            'pedido': pedido.id_pedido,
            'total': float(pedido.total_pedido),
            'detalles': len(detalles),
            'stock': [float(value) for value in stock_real],
        }


def main():
    testdb.ensure_test_schema()
    node = shutil.which('node')
    if not node:
        raise RuntimeError('Node no está disponible')

    tag = uuid4().hex
    suffix = int(tag[:8], 16) % 900000000 + 100000000
    client_email = f'e2e.cart.{tag}@example.com'
    admin_email = f'e2e.cart.admin.{tag}@example.com'
    clave_cliente = f'Cart{tag}9'
    clave_admin = f'Admin{tag}9'

    db = testdb.TestSessionLocal()
    client_id = admin_id = unit_id = metres_id = variant_id = None
    processes = []
    temp = None
    flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
    try:
        category_id = db.scalar(select(Categoria.id_categoria).limit(1))
        provider_id = db.scalar(select(Proveedor.id_proveedor).limit(1))
        if category_id is None or provider_id is None:
            raise RuntimeError('La base de pruebas no tiene categorías y proveedores suficientes')

        role = db.scalar(select(RolesUsuario).where(RolesUsuario.nombre_rol == 'administrador'))
        if role is None:
            role = RolesUsuario(nombre_rol='administrador')
            db.add(role)
            db.flush()

        client = Cliente(
            first_name='Cliente', last_name='Checkout E2E', email=client_email,
            password_hash=hash_password(clave_cliente), is_active=True,
            id_tipo_documento_c=1, documento_cliente=suffix,
            telefono_cliente=3000000000 + suffix % 100000000,
            address='Calle E2E 123',
        )
        admin = User(
            first_name='Admin', last_name='Checkout E2E', email=admin_email,
            password_hash=hash_password(clave_admin), id_rol_u=role.id_rol,
            is_active=True, id_tipo_documento_u=1, documento_usuario=suffix + 1,
            telefono_usuario=3100000000 + suffix % 100000000,
        )
        unit_product = Producto(
            nombre_producto='Producto variante E2E', marca='E2E',
            referencia_producto=f'CART-UNIT-{tag}', venta_por_metros=0,
            precio_venta_producto=999, stock_producto=10,
            colores_producto='Rojo', color_hex='#ff0000',
            estado_producto='activo', visible_cliente=True,
            id_cate_pr=category_id, id_proveedor_pr=provider_id,
            descuento_activo=None, tiene_medidas=False,
        )
        metres_product = Producto(
            nombre_producto='Producto metros E2E', marca='E2E',
            referencia_producto=f'CART-METRES-{tag}', venta_por_metros=1,
            precio_venta_producto=1000, stock_producto=10,
            estado_producto='activo', visible_cliente=True,
            id_cate_pr=category_id, id_proveedor_pr=provider_id,
            descuento_activo=None, tiene_medidas=False,
        )
        db.add_all([client, admin, unit_product, metres_product])
        db.flush()
        variant = ProductoVariante(
            id_producto=unit_product.id_producto, nombre='Rojo',
            hex='#ff0000', precio=750, stock=10,
        )
        db.add(variant)
        db.commit()

        client_id = client.id_cliente
        admin_id = admin.id_usuario
        unit_id = unit_product.id_producto
        metres_id = metres_product.id_producto
        variant_id = variant.id

        api_port, web_port = free_port(), free_port()
        temp = tempfile.TemporaryDirectory(prefix='neodomus-cart-checkout-', ignore_cleanup_errors=True)
        result_path = Path(temp.name) / 'result.json'
        env = os.environ.copy()
        env.update(
            DISABLE_SCHEDULER='1',
            PAYMENT_PROVIDER='simulator',
            VITE_API_URL=f'http://127.0.0.1:{api_port}/api/v1',
            E2E_BASE_URL=f'http://127.0.0.1:{web_port}',
            E2E_CLIENT_EMAIL=client_email,
            E2E_CLIENT_PASSWORD=clave_cliente,
            E2E_ADMIN_EMAIL=admin_email,
            E2E_ADMIN_PASSWORD=clave_admin,
            E2E_UNIT_PRODUCT_ID=str(unit_id),
            E2E_UNIT_VARIANT_ID=str(variant_id),
            E2E_METRES_PRODUCT_ID=str(metres_id),
            E2E_CATEGORY_ID=str(category_id),
            E2E_PROVIDER_ID=str(provider_id),
            E2E_RESULT_PATH=str(result_path),
        )
        bootstrap = (
            'import app.tests.testdb as t; '
            'from app.main import app; import uvicorn; '
            'app.state.limiter.enabled=False; '
            f'uvicorn.run(app,host="127.0.0.1",port={api_port},log_level="warning",access_log=False)'
        )

        with temp as temporary:
            log_path = Path(temporary) / 'servers.log'
            with open(log_path, 'w', encoding='utf-8') as log:
                for args, cwd in [
                    ([sys.executable, '-c', bootstrap], ROOT / 'be'),
                    ([node, 'node_modules/vite/bin/vite.js', '--host', '127.0.0.1',
                      '--port', str(web_port), '--strictPort'], ROOT / 'fe'),
                ]:
                    processes.append(subprocess.Popen(
                        args, cwd=cwd, env=env, stdout=log, stderr=log,
                        creationflags=flags,
                    ))
                wait_ready(processes[0], f'http://127.0.0.1:{api_port}/health')
                wait_ready(processes[1], env['E2E_BASE_URL'])

                result = subprocess.run(
                    [node, 'node_modules/@playwright/test/cli.js', 'test',
                     'cart-checkout.e2e.spec.ts', '--workers=1'],
                    cwd=ROOT / 'fe', env=env, creationflags=flags, timeout=300,
                    capture_output=True, text=True, encoding='utf-8', errors='replace',
                )
                encoding = sys.stdout.encoding or 'utf-8'
                print(result.stdout.encode(encoding, errors='replace').decode(encoding))
                print(result.stderr.encode(encoding, errors='replace').decode(encoding))
                print(f'Playwright exit: {result.returncode}')

                if result.returncode == 0:
                    if not result_path.exists():
                        raise AssertionError('Playwright no dejó el identificador del pedido')
                    verify = verify_order(json.loads(result_path.read_text(encoding='utf-8')))
                    print(f"Verificación BD independiente: OK {verify}")
                else:
                    print(f'Log de servidores: {log_path}')
                return result.returncode
    finally:
        for process in reversed(processes):
            if process.poll() is None:
                if os.name == 'nt':
                    subprocess.run(
                        ['taskkill', '/PID', str(process.pid), '/T', '/F'],
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                        creationflags=flags, check=False,
                    )
                else:
                    process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
        if temp:
            temp.cleanup()

        db.rollback()
        if client_id:
            order_ids = [row[0] for row in db.query(Pedido.id_pedido).filter(
                Pedido.id_cliente_pe == client_id
            ).all()]
            if order_ids:
                for model, column in (
                    (Pago, Pago.id_pedido),
                    (Factura, Factura.id_pedido),
                    (DetallePedido, DetallePedido.id_pedido_d),
                ):
                    db.query(model).filter(column.in_(order_ids)).delete(synchronize_session=False)
                db.query(Pedido).filter(Pedido.id_pedido.in_(order_ids)).delete(synchronize_session=False)
            db.query(Notificacion).filter(Notificacion.id_cliente == client_id).delete(synchronize_session=False)
        if admin_id:
            db.query(Notificacion).filter(Notificacion.id_usuario == admin_id).delete(synchronize_session=False)
            db.query(User).filter(User.id_usuario == admin_id).delete(synchronize_session=False)
        if variant_id:
            db.query(ProductoVariante).filter(ProductoVariante.id == variant_id).delete(synchronize_session=False)
        if unit_id:
            db.query(Producto).filter(Producto.id_producto == unit_id).delete(synchronize_session=False)
        if metres_id:
            db.query(Producto).filter(Producto.id_producto == metres_id).delete(synchronize_session=False)
        if client_id:
            db.query(Cliente).filter(Cliente.id_cliente == client_id).delete(synchronize_session=False)
        db.commit()

        remaining = 0
        remaining += db.scalar(select(func.count()).select_from(Cliente).where(Cliente.email == client_email))
        remaining += db.scalar(select(func.count()).select_from(User).where(User.email == admin_email))
        remaining += db.scalar(select(func.count()).select_from(Producto).where(
            Producto.referencia_producto.in_([f'CART-UNIT-{tag}', f'CART-METRES-{tag}'])
        ))
        db.close()
        print(f'Fixtures E2E restantes: {remaining}')
        if remaining:
            raise RuntimeError('Limpieza E2E incompleta')


if __name__ == '__main__':
    raise SystemExit(main())
