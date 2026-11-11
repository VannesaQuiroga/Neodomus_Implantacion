import json
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
if not os.environ.get("TEST_DATABASE_URL"):
    raise RuntimeError("Configura TEST_DATABASE_URL con una base exclusiva de pruebas.")
sys.path.insert(0, str(ROOT / 'be'))
os.chdir(ROOT / 'be')

import app.tests.testdb as testdb
from app.models.cliente import Cliente
from app.models.pending_registration import PendingRegistration
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


def verify_registration(result):
    with testdb.TestSessionLocal() as db:
        email = result['email']
        duplicado = result['duplicado']
        pendientes = db.query(PendingRegistration).filter(
            PendingRegistration.email == email
        ).all()
        if len(pendientes) != 1:
            raise AssertionError(f'Registros pendientes inesperados: {len(pendientes)}')
        if db.query(Cliente).filter(Cliente.email == email).count() != 0:
            raise AssertionError('El registro validado creó el cliente antes de verificar correo')
        if db.query(Cliente).filter(Cliente.email == duplicado).count() != 1:
            raise AssertionError('El fixture de correo duplicado desapareció')
        return {
            'pendientes': len(pendientes),
            'email': pendientes[0].email,
            'nombre': pendientes[0].first_name,
        }


def main():
    testdb.ensure_test_schema()
    node = shutil.which('node')
    if not node:
        raise RuntimeError('Node no está disponible')

    tag = uuid4().hex
    suffix = int(tag[:8], 16) % 900000000 + 100000000
    email = f'e2e.register.{tag}@example.com'
    duplicado = f'e2e.register.dup.{tag}@example.com'
    acceso_demo = f'Reg{tag}9!'

    db = testdb.TestSessionLocal()
    duplicado_id = None
    processes = []
    temp = None
    flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
    try:
        cliente_duplicado = Cliente(
            first_name='Duplicado', last_name='Registro E2E', email=duplicado,
            password_hash=hash_password(acceso_demo), is_active=True,
            id_tipo_documento_c=1, documento_cliente=suffix,
            telefono_cliente=3000000000 + suffix % 100000000,
            address='Calle E2E 123',
        )
        db.add(cliente_duplicado)
        db.commit()
        duplicado_id = cliente_duplicado.id_cliente

        api_port, web_port = free_port(), free_port()
        temp = tempfile.TemporaryDirectory(prefix='neodomus-register-', ignore_cleanup_errors=True)
        result_path = Path(temp.name) / 'result.json'
        env = os.environ.copy()
        env.update(
            DISABLE_SCHEDULER='1',
            VITE_GOOGLE_CLIENT_ID='',
            VITE_API_URL=f'http://127.0.0.1:{api_port}/api/v1',
            E2E_BASE_URL=f'http://127.0.0.1:{web_port}',
            E2E_REGISTER_EMAIL=email,
            E2E_REGISTER_PASSWORD=acceso_demo,
            E2E_REGISTER_DUPLICATE_EMAIL=duplicado,
            E2E_RESULT_PATH=str(result_path),
        )
        bootstrap = (
            'import app.tests.testdb as t; '
            'import app.services.auth_service as a; '
            'ns={}; exec("async def fake(*args, **kwargs):\\n    return None", ns); '
            'a.send_verification_email=ns["fake"]; '
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
                     'register.e2e.spec.ts', '--workers=1'],
                    cwd=ROOT / 'fe', env=env, creationflags=flags, timeout=300,
                    capture_output=True, text=True, encoding='utf-8', errors='replace',
                )
                encoding = sys.stdout.encoding or 'utf-8'
                print(result.stdout.encode(encoding, errors='replace').decode(encoding))
                print(result.stderr.encode(encoding, errors='replace').decode(encoding))
                print(f'Playwright exit: {result.returncode}')

                if result.returncode == 0:
                    if not result_path.exists():
                        raise AssertionError('Playwright no dejó el resultado del registro')
                    verify = verify_registration(json.loads(result_path.read_text(encoding='utf-8')))
                    print(f'Verificación BD independiente: OK {verify}')
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
        db.query(PendingRegistration).filter(
            PendingRegistration.email.in_([email, duplicado])
        ).delete(synchronize_session=False)
        if duplicado_id:
            db.query(Cliente).filter(Cliente.id_cliente == duplicado_id).delete(
                synchronize_session=False
            )
        db.commit()

        remaining = 0
        remaining += db.scalar(select(func.count()).select_from(Cliente).where(
            Cliente.email.in_([email, duplicado])
        ))
        remaining += db.scalar(select(func.count()).select_from(PendingRegistration).where(
            PendingRegistration.email.in_([email, duplicado])
        ))
        db.close()
        print(f'Fixtures E2E restantes: {remaining}')
        if remaining:
            raise RuntimeError('Limpieza E2E incompleta')


if __name__ == '__main__':
    raise SystemExit(main())
