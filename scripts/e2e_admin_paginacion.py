"""Seed + runner E2E para la paginación/numeración de las vistas admin.

Crea (aislados por ``tag``) un administrador, 15 clientes, 15 proveedores,
15 novedades y 13 técnicos; arranca API + Vite; ejecuta Playwright
``admin-paginacion.e2e.spec.ts`` y limpia los fixtures al final.

Base: TEST_DATABASE_URL (separada). Sin correos reales (transporte anulado).
"""
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.request import urlopen
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
if not os.environ.get("TEST_DATABASE_URL"):
    raise RuntimeError("Configura TEST_DATABASE_URL con una base exclusiva de pruebas.")
sys.path.insert(0, str(ROOT / 'be'))
os.chdir(ROOT / 'be')

import app.tests.testdb as testdb  # noqa: E402
from sqlalchemy import func, select  # noqa: E402

from app.models.cliente import Cliente  # noqa: E402
from app.models.novedad import Novedad  # noqa: E402
from app.models.proveedor import Proveedor  # noqa: E402
from app.models.roles_usuario import RolesUsuario  # noqa: E402
from app.models.tecnico import Tecnico  # noqa: E402
from app.models.user import User  # noqa: E402
from app.utils.security import hash_password  # noqa: E402

PREFIXO = 'PagTst'


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def wait_ready(process, url):
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError('Servidor E2E terminó antes de estar listo')
        try:
            with urlopen(url, timeout=1) as r:
                if r.status == 200:
                    return
        except (OSError, TimeoutError):
            pass
        time.sleep(0.2)
    raise RuntimeError('Servidor E2E no respondió en 60 s')


def main():
    testdb.ensure_test_schema()
    node = shutil.which('node')
    if not node:
        raise RuntimeError('Node no disponible')

    tag = uuid4().hex[:10]
    admin_email = f'paginacion.admin.{tag}@example.com'
    admin_password = f'Admin{tag}9'

    db = testdb.TestSessionLocal()
    procesos = []
    temp = None
    flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
    try:
        rol_admin = db.scalar(select(RolesUsuario).where(RolesUsuario.nombre_rol == 'administrador'))
        rol_tec = db.scalar(select(RolesUsuario).where(RolesUsuario.nombre_rol == 'tecnico'))
        if rol_admin is None or rol_tec is None:
            raise RuntimeError('Faltan roles administrador/tecnico en la base de pruebas')

        admin = User(first_name='Admin', last_name='Paginacion', email=admin_email,
                     password_hash=hash_password(admin_password), id_rol_u=rol_admin.id_rol, is_active=True)
        db.add(admin)
        db.flush()
        admin_id = admin.id_usuario

        cliente_ids = []
        for i in range(1, 16):
            c = Cliente(first_name='Cliente', last_name=f'{PREFIXO}{i:02d}',
                        email=f'paginacion.cli.{i}.{tag}@example.com', is_active=True,
                        documento_cliente=900000000 + i, telefono_cliente=3000000000 + i)
            db.add(c)
            db.flush()
            cliente_ids.append(c.id_cliente)

        proveedor_ids = []
        for i in range(1, 16):
            p = Proveedor(nombre_proveedor=f'Prov {PREFIXO} {i:02d}',
                          correo_proveedor=f'paginacion.prov.{i}.{tag}@example.com',
                          contacto_proveedor=f'Contacto {i}', telefono_proveedor=str(3100000000 + i))
            db.add(p)
            db.flush()
            proveedor_ids.append(p.id_proveedor)

        tecnico_ids = []
        usuario_tec_ids = []
        for i in range(1, 14):
            u = User(first_name='Tecnico', last_name=f'{PREFIXO}{i:02d}',
                     email=f'paginacion.tec.{i}.{tag}@example.com',
                     password_hash=hash_password(f'Tec{tag}{i:02d}9'),
                     id_rol_u=rol_tec.id_rol, is_active=True)
            db.add(u)
            db.flush()
            usuario_tec_ids.append(u.id_usuario)
            t = Tecnico(id_usuario_t=u.id_usuario, certificacion_t='')
            db.add(t)
            db.flush()
            tecnico_ids.append(t.id_tecnico)

        novedad_ids = []
        for i in range(1, 16):
            n = Novedad(id_tecnico_n=tecnico_ids[0], tipo_novedad='Otro',
                        descripcion_novedad=f'{PREFIXO} novedad {i:02d}',
                        prioridad='normal', estado_novedad='Pendiente')
            db.add(n)
            db.flush()
            novedad_ids.append(n.id_novedad)

        db.commit()

        api_port, web_port = free_port(), free_port()
        temp = tempfile.TemporaryDirectory(prefix='neodomus-admin-pag-', ignore_cleanup_errors=True)
        env = os.environ.copy()
        env.update(
            DISABLE_SCHEDULER='1',
            PAYMENT_PROVIDER='simulator',
            VITE_API_URL=f'http://127.0.0.1:{api_port}/api/v1',
            E2E_BASE_URL=f'http://127.0.0.1:{web_port}',
            E2E_ADMIN_EMAIL=admin_email,
            E2E_ADMIN_PASSWORD=admin_password,
            E2E_PREFIXO=PREFIXO,
        )
        bootstrap = (
            'import app.tests.testdb as t; from app.main import app; import uvicorn; '
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
                    procesos.append(subprocess.Popen(args, cwd=cwd, env=env, stdout=log, stderr=log, creationflags=flags))
                wait_ready(procesos[0], f'http://127.0.0.1:{api_port}/health')
                wait_ready(procesos[1], env['E2E_BASE_URL'])

                result = subprocess.run(
                    [node, 'node_modules/@playwright/test/cli.js', 'test',
                     'admin-paginacion.e2e.spec.ts', '--workers=1'],
                    cwd=ROOT / 'fe', env=env, creationflags=flags, timeout=300,
                    capture_output=True, text=True, encoding='utf-8', errors='replace',
                )
                enc = sys.stdout.encoding or 'utf-8'
                print(result.stdout.encode(enc, errors='replace').decode(enc))
                print(result.stderr.encode(enc, errors='replace').decode(enc))
                print(f'Playwright exit: {result.returncode}')
                return result.returncode
    finally:
        for p in reversed(procesos):
            if p.poll() is None:
                if os.name == 'nt':
                    subprocess.run(['taskkill', '/PID', str(p.pid), '/T', '/F'],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=flags, check=False)
                else:
                    p.terminate()
                try:
                    p.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    p.kill()
        if temp:
            temp.cleanup()

        # Limpieza de fixtures por id (orden por FK).
        if novedad_ids:
            db.query(Novedad).filter(Novedad.id_novedad.in_(novedad_ids)).delete(synchronize_session=False)
        if tecnico_ids:
            db.query(Tecnico).filter(Tecnico.id_tecnico.in_(tecnico_ids)).delete(synchronize_session=False)
        if usuario_tec_ids:
            db.query(User).filter(User.id_usuario.in_(usuario_tec_ids)).delete(synchronize_session=False)
        if admin_id:
            db.query(User).filter(User.id_usuario == admin_id).delete(synchronize_session=False)
        if cliente_ids:
            db.query(Cliente).filter(Cliente.id_cliente.in_(cliente_ids)).delete(synchronize_session=False)
        if proveedor_ids:
            db.query(Proveedor).filter(Proveedor.id_proveedor.in_(proveedor_ids)).delete(synchronize_session=False)
        db.commit()

        restante = (
            db.scalar(select(func.count()).select_from(Cliente).where(Cliente.email.like(f'paginacion.cli.%.{tag}@example.com'))) or 0
            + (db.scalar(select(func.count()).select_from(User).where(User.email.like(f'paginacion.%@example.com').__and__(User.email.like(f'%.{tag}@example.com')))) or 0)
            + (db.scalar(select(func.count()).select_from(Proveedor).where(Proveedor.correo_proveedor.like(f'paginacion.prov.%.{tag}@example.com'))) or 0)
        )
        db.close()
        print(f'Fixtures admin E2E restantes: {restante}')
        if restante:
            raise RuntimeError('Limpieza admin E2E incompleta')


if __name__ == '__main__':
    raise SystemExit(main())
