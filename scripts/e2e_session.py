"""Recarga web real con fixtures propios y servidor aislado mediante testdb.

Desde be, con TEST_DATABASE_URL configurada: python ../scripts/e2e_session.py
No confirma compras ni reutiliza fixtures de otros E2E.
"""
import os
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
sys.path.insert(0, str(ROOT / 'be'))
os.chdir(ROOT / 'be')
import app.tests.testdb as testdb
from app.models.cliente import Cliente
from app.models.producto import Producto
from app.utils.security import hash_password
from sqlalchemy import select, func


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def wait_ready(process, url):
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError('Servidor de pruebas terminó antes de estar listo')
        try:
            with urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except (OSError, TimeoutError):
            pass
        time.sleep(.2)
    raise RuntimeError('Servidor de pruebas no respondió en 60 segundos')


def main():
    testdb.ensure_test_schema()
    node = shutil.which('node')
    if not node:
        raise RuntimeError('Node no está disponible')
    tag = uuid4().hex
    email = f'e2e.session.{tag}@example.test'
    password = f'Session{tag}9'
    db = testdb.TestSessionLocal()
    client_id = product_id = None
    processes = []
    session_temp = None
    flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
    try:
        client = Cliente(first_name='Sesion', last_name='E2E', email=email,
                         password_hash=hash_password(password), is_active=True,
                         id_tipo_documento_c=1, documento_cliente=900000002,
                         telefono_cliente=3000000002, address='Calle prueba 123')
        product = Producto(nombre_producto='Cable sesión E2E', referencia_producto=f'SESSION-{tag}',
                            venta_por_metros=1, precio_venta_producto=1000,
                            stock_producto=10, visible_cliente=True, estado_producto='activo')
        db.add_all([client, product])
        db.flush()
        client_id, product_id = client.id_cliente, product.id_producto
        db.commit()
        api_port, web_port = free_port(), free_port()
        env = os.environ.copy()
        env.update(DISABLE_SCHEDULER='1', PAYMENT_PROVIDER='simulator',
                   VITE_API_URL=f'http://127.0.0.1:{api_port}/api/v1',
                   E2E_BASE_URL=f'http://127.0.0.1:{web_port}',
                   E2E_SESSION_EMAIL=email, E2E_SESSION_PASSWORD=password,
                   E2E_SESSION_PRODUCT=str(product_id))
        # El propio servidor importa testdb ANTES de importar la aplicación.
        bootstrap = ('import app.tests.testdb as t; '
                     'from app.main import app; import uvicorn; '
                     'app.state.limiter.enabled=False; '
                     f'uvicorn.run(app,host="127.0.0.1",port={api_port},log_level="warning",access_log=False)')
        session_temp = tempfile.TemporaryDirectory(prefix='neodomus-session-', ignore_cleanup_errors=True)
        with session_temp as temporary:
            with open(Path(temporary) / 'servers.log', 'w', encoding='utf-8') as log:
                for args, cwd in [
                    ([sys.executable, '-c', bootstrap], ROOT / 'be'),
                    ([node, 'node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', str(web_port), '--strictPort'], ROOT / 'fe'),
                ]:
                    processes.append(subprocess.Popen(args, cwd=cwd, env=env, stdout=log, stderr=log, creationflags=flags))
                wait_ready(processes[0], f'http://127.0.0.1:{api_port}/health')
                wait_ready(processes[1], env['E2E_BASE_URL'])
                if '--interactive' in sys.argv:
                    # Credenciales efímeras de prueba; nunca una cuenta real.
                    print(f"URL={env['E2E_BASE_URL']} PRODUCTO={product_id}", flush=True)
                    print(f"CLIENTE_PRUEBA={email} PASSWORD_PRUEBA={password}", flush=True)
                    input('Enter para detener servidores y limpiar fixtures: ')
                    return 0
                result = subprocess.run([node, 'node_modules/@playwright/test/cli.js', 'test',
                                         'session.e2e.spec.ts', '--repeat-each=2'],
                                        cwd=ROOT / 'fe', env=env, creationflags=flags, timeout=240,
                                        capture_output=True, text=True, encoding='utf-8', errors='replace')
                # Algunas consolas Windows no representan los símbolos del reporter.
                encoding = sys.stdout.encoding or 'utf-8'
                print(result.stdout.encode(encoding, errors='replace').decode(encoding))
                print(result.stderr.encode(encoding, errors='replace').decode(encoding))
                print(f'Playwright exit: {result.returncode}')
                return result.returncode
    finally:
        for process in reversed(processes):
            if process.poll() is None:
                if os.name == 'nt':
                    # Incluye hijos del lanzador Python y del servidor Vite.
                    subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                   creationflags=flags, check=False)
                else:
                    process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
        if session_temp:
            # Windows mantiene el log abierto mientras viven los servidores.
            session_temp.cleanup()
        db.rollback()
        if product_id:
            db.query(Producto).filter(Producto.id_producto == product_id).delete(synchronize_session=False)
        if client_id:
            db.query(Cliente).filter(Cliente.id_cliente == client_id).delete(synchronize_session=False)
        db.commit()
        remaining = db.scalar(select(func.count()).select_from(Cliente).where(Cliente.email == email))
        remaining += db.scalar(select(func.count()).select_from(Producto).where(Producto.referencia_producto == f'SESSION-{tag}'))
        db.close()
        print(f'Fixtures propios restantes: {remaining}')
        if remaining:
            raise RuntimeError('Limpieza incompleta')


if __name__ == '__main__':
    raise SystemExit(main())
