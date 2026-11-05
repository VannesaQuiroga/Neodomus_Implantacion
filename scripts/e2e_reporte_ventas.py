"""Seed + runner E2E para la descarga del PDF de ventas.

Siembra un administrador y pedidos "Pagado" con totales conocidos en un rango
aislado, arranca API + Vite, ejecuta Playwright ``reporte-ventas.e2e.spec.ts``
(que captura el PDF descargado) y verifica el total en el PDF con PyMuPDF.
"""
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path
from urllib.request import urlopen
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
if not os.environ.get("TEST_DATABASE_URL"):
    raise RuntimeError("Configura TEST_DATABASE_URL con una base exclusiva de pruebas.")
sys.path.insert(0, str(ROOT / "be"))
os.chdir(ROOT / "be")

import app.tests.testdb as testdb  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.models.pedido import Pedido  # noqa: E402
from app.models.roles_usuario import RolesUsuario  # noqa: E402
from app.models.user import User  # noqa: E402
from app.utils.security import hash_password  # noqa: E402


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def wait_ready(process, url):
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError("Servidor E2E terminó antes de estar listo")
        try:
            with urlopen(url, timeout=1) as r:
                if r.status == 200:
                    return
        except (OSError, TimeoutError):
            pass
        time.sleep(0.2)
    raise RuntimeError("Servidor E2E no respondió en 60 s")


def _texto_pdf(pdf: bytes) -> str:
    import re
    import zlib

    from reportlab.pdfbase.pdfutils import asciiBase85Decode

    frags = []
    for m in re.finditer(rb"stream\r?\n(.*?)endstream", pdf, re.S):
        crudo = m.group(1).rstrip(b"\r\n")
        try:
            crudo = zlib.decompress(asciiBase85Decode(crudo.decode("latin-1")))
        except Exception:
            try:
                crudo = zlib.decompress(crudo)
            except Exception:
                crudo = b""
        frags.append(crudo)
    return b"\n".join(frags).decode("latin-1", errors="ignore")


def main():
    testdb.ensure_test_schema()
    node = shutil.which("node")
    if not node:
        raise RuntimeError("Node no disponible")

    tag = uuid4().hex[:10]
    admin_email = f"reporte.admin.{tag}@example.com"
    admin_password = f"Admin{tag}9"
    fecha = datetime(2020, 3, 15, 12, 0, 0)

    db = testdb.TestSessionLocal()
    procesos = []
    temp = None
    flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    try:
        rol_admin = db.scalar(select(RolesUsuario).where(RolesUsuario.nombre_rol == "administrador"))
        if rol_admin is None:
            raise RuntimeError("Falta rol administrador en la base de pruebas")

        admin = User(first_name="Admin", last_name="Reporte", email=admin_email,
                     password_hash=hash_password(admin_password), id_rol_u=rol_admin.id_rol, is_active=True)
        db.add(admin)
        db.flush()
        admin_id = admin.id_usuario

        pedido_ids = []
        for total in (1000.0, 3000.0, 1999.5):
            p = Pedido(estado_pedido="Pagado", total_pedido=total, fecha_peedido=fecha)
            db.add(p)
            db.flush()
            pedido_ids.append(p.id_pedido)
        db.commit()

        api_port, web_port = free_port(), free_port()
        temp = tempfile.TemporaryDirectory(prefix="neodomus-reporte-", ignore_cleanup_errors=True)
        env = os.environ.copy()
        env.update(
            DISABLE_SCHEDULER="1",
            PAYMENT_PROVIDER="simulator",
            VITE_API_URL=f"http://127.0.0.1:{api_port}/api/v1",
            E2E_BASE_URL=f"http://127.0.0.1:{web_port}",
            E2E_ADMIN_EMAIL=admin_email,
            E2E_ADMIN_PASSWORD=admin_password,
            E2E_REPORTE_PATH=str(Path(temp.name) / "reporte.pdf"),
        )
        bootstrap = (
            "import app.tests.testdb as t; from app.main import app; import uvicorn; "
            "app.state.limiter.enabled=False; "
            f"uvicorn.run(app,host='127.0.0.1',port={api_port},log_level='warning',access_log=False)"
        )
        with temp as temporary:
            log_path = Path(temporary) / "servers.log"
            with open(log_path, "w", encoding="utf-8") as log:
                for args, cwd in [
                    ([sys.executable, "-c", bootstrap], ROOT / "be"),
                    ([node, "node_modules/vite/bin/vite.js", "--host", "127.0.0.1",
                      "--port", str(web_port), "--strictPort"], ROOT / "fe"),
                ]:
                    procesos.append(subprocess.Popen(args, cwd=cwd, env=env, stdout=log, stderr=log, creationflags=flags))
                wait_ready(procesos[0], f"http://127.0.0.1:{api_port}/health")
                wait_ready(procesos[1], env["E2E_BASE_URL"])

                result = subprocess.run(
                    [node, "node_modules/@playwright/test/cli.js", "test",
                     "reporte-ventas.e2e.spec.ts", "--workers=1"],
                    cwd=ROOT / "fe", env=env, creationflags=flags, timeout=600,
                    capture_output=True, text=True, encoding="utf-8", errors="replace",
                )
                enc = sys.stdout.encoding or "utf-8"
                print(result.stdout.encode(enc, errors="replace").decode(enc))
                print(result.stderr.encode(enc, errors="replace").decode(enc))
                print(f"Playwright exit: {result.returncode}")

                if result.returncode == 0:
                    pdf_path = Path(env["E2E_REPORTE_PATH"])
                    if not pdf_path.exists():
                        raise RuntimeError("El PDF descargado no existe")
                    pdf = pdf_path.read_bytes()
                    if not pdf.startswith(b"%PDF"):
                        raise RuntimeError("El archivo descargado no es un PDF")
                    texto = _texto_pdf(pdf)
                    total = 1000.0 + 3000.0 + 1999.5
                    esperado = f"${total:,.2f} COP".replace(",", "X").replace(".", ",").replace("X", ".")
                    if esperado not in texto:
                        raise RuntimeError(f"Total {esperado} no encontrado en el PDF")
                    print(f"Verificación de total en PDF: OK ({esperado})")
                return result.returncode
    finally:
        for p in reversed(procesos):
            if p.poll() is None:
                if os.name == "nt":
                    subprocess.run(["taskkill", "/PID", str(p.pid), "/T", "/F"],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=flags, check=False)
                else:
                    p.terminate()
                try:
                    p.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    p.kill()
        if temp:
            temp.cleanup()

        db.query(Pedido).filter(Pedido.id_pedido.in_(pedido_ids)).delete(synchronize_session=False)
        db.query(User).filter(User.id_usuario == admin_id).delete(synchronize_session=False)
        db.commit()
        db.close()
        print("Fixtures reporte E2E limpios")


if __name__ == "__main__":
    raise SystemExit(main())
