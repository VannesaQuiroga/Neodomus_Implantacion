"""Seed + runner E2E para la foto de perfil del técnico (MinIO de pruebas).

Siembra un administrador y un técnico (aislados por tag), genera dos PNG
sintéticos (rojo/azul), arranca API + Vite con TEST_MINIO_* apuntando al MinIO
de pruebas, ejecuta Playwright ``foto-tecnico.e2e.spec.ts`` y limpia fixtures
y objetos propios al final.
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
for var in (
    "TEST_MINIO_ENDPOINT", "TEST_MINIO_ACCESS_KEY", "TEST_MINIO_SECRET_KEY",
    "TEST_MINIO_BUCKET", "TEST_MINIO_PRIVATE_BUCKET", "TEST_MINIO_PUBLIC_ENDPOINT",
):
    if not os.environ.get(var):
        raise RuntimeError(f"Configura {var} para el MinIO exclusivo de pruebas.")
sys.path.insert(0, str(ROOT / 'be'))
os.chdir(ROOT / 'be')

import app.tests.testdb as testdb  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.models.roles_usuario import RolesUsuario  # noqa: E402
from app.models.tecnico import Tecnico  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services import minio_service  # noqa: E402
from app.utils.security import hash_password  # noqa: E402


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


def _png(color, ruta):
    from PIL import Image

    Image.new('RGB', (16, 16), color).save(ruta, format='PNG')


def main():
    testdb.ensure_test_schema()
    node = shutil.which('node')
    if not node:
        raise RuntimeError('Node no disponible')

    tag = uuid4().hex[:10]
    admin_email = f'foto.admin.{tag}@example.com'
    clave_admin = f'Admin{tag}9'
    tecnico_email = f'foto.tec.{tag}@example.com'
    clave_tecnico = f'Tec{tag}9'
    roto_email = f'foto.roto.{tag}@example.com'
    clave_roto = f'Roto{tag}9'

    db = testdb.TestSessionLocal()
    procesos = []
    temp = None
    flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
    try:
        rol_admin = db.scalar(select(RolesUsuario).where(RolesUsuario.nombre_rol == 'administrador'))
        rol_tec = db.scalar(select(RolesUsuario).where(RolesUsuario.nombre_rol == 'tecnico'))
        if rol_admin is None or rol_tec is None:
            raise RuntimeError('Faltan roles administrador/tecnico en la base de pruebas')

        admin = User(first_name='Admin', last_name='Foto', email=admin_email,
                     password_hash=hash_password(clave_admin), id_rol_u=rol_admin.id_rol, is_active=True)
        db.add(admin)
        db.flush()
        admin_id = admin.id_usuario

        tecnico = User(first_name='Tecnico', last_name='ConFoto', email=tecnico_email,
                       password_hash=hash_password(clave_tecnico), id_rol_u=rol_tec.id_rol, is_active=True)
        db.add(tecnico)
        db.flush()
        tecnico_id = tecnico.id_usuario
        db.add(Tecnico(id_usuario_t=tecnico.id_usuario, certificacion_t=''))

        roto = User(
            first_name='Tecnico', last_name='SinFoto', email=roto_email,
            password_hash=hash_password(clave_roto), id_rol_u=rol_tec.id_rol, is_active=True,
            foto_url='http://127.0.0.1:9000/neodomus-test-e2e/perfiles/no-existe.png',
        )
        db.add(roto)
        db.flush()
        roto_id = roto.id_usuario
        db.add(Tecnico(id_usuario_t=roto.id_usuario, certificacion_t=''))
        db.commit()

        api_port, web_port = free_port(), free_port()
        temp = tempfile.TemporaryDirectory(prefix='neodomus-foto-tec-', ignore_cleanup_errors=True)
        foto_a = Path(temp.name) / 'foto_a.png'
        foto_b = Path(temp.name) / 'foto_b.png'
        _png('red', foto_a)
        _png('blue', foto_b)

        env = os.environ.copy()
        env.update(
            DISABLE_SCHEDULER='1',
            PAYMENT_PROVIDER='simulator',
            VITE_API_URL=f'http://127.0.0.1:{api_port}/api/v1',
            E2E_BASE_URL=f'http://127.0.0.1:{web_port}',
            E2E_ADMIN_EMAIL=admin_email,
            E2E_ADMIN_PASSWORD=clave_admin,
            E2E_TECNICO_EMAIL=tecnico_email,
            E2E_TECNICO_PASSWORD=clave_tecnico,
            E2E_TECNICO_ROTO_EMAIL=roto_email,
            E2E_TECNICO_ROTO_PASSWORD=clave_roto,
            E2E_FOTO_A=str(foto_a),
            E2E_FOTO_B=str(foto_b),
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
                     'foto-tecnico.e2e.spec.ts', '--workers=1'],
                    cwd=ROOT / 'fe', env=env, creationflags=flags, timeout=600,
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

        # Limpieza: objetos de perfil del técnico + usuarios.
        try:
            for obj in minio_service._cliente().list_objects(
                os.environ['TEST_MINIO_BUCKET'], prefix=f'perfiles/perfil_usuario_{tecnico_id}_'
            ):
                minio_service.eliminar_objeto(obj.object_name)
        except Exception:
            pass
        db.query(Tecnico).filter(Tecnico.id_usuario_t.in_([tecnico_id, roto_id])).delete(synchronize_session=False)
        db.query(User).filter(User.id_usuario.in_([tecnico_id, roto_id, admin_id])).delete(synchronize_session=False)
        db.commit()
        db.close()
        print('Fixtures foto E2E limpios')


if __name__ == '__main__':
    raise SystemExit(main())
