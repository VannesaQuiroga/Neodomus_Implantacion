"""T1.1: protección de archivos privados (evidencias) y propiedad restante.

Prueba el acceso a evidencias mediante la ruta autorizada y comprueba que el
montaje legado /evidencias ya no sirve archivos sin autenticación. También cubre
la propiedad de notificaciones (lectura y modificación ajenas).
"""
import unittest
from pathlib import Path

import app.tests.testdb  # noqa: F401

from app.database import SessionLocal
from app.models.evidencia import EvidenciaEntrega
from app.models.notificacion import Notificacion
from app.models.pedido import Pedido
from app.tests.test_t1_identidad import BaseT1TestCase

EVIDENCIAS_DIR = Path(__file__).resolve().parent.parent / "static" / "evidencias"


class EvidenciasPrivadasTestCase(BaseT1TestCase):
    def _preparar_evidencia(self):
        """Crea técnico t1 (dueño), pedido y evidencia local; devuelve (t1_user, t2_user, admin, ev)."""
        c = self._crear_cliente("evid")
        u1, t1 = self._crear_tecnico("e1")
        u2, t2 = self._crear_tecnico("e2")
        admin = self._crear_admin("evid")
        p = Pedido(id_cliente_pe=c.id_cliente, estado_pedido="Pagado",
                   estado_entrega="Asignada", id_tecnico_entrega=t1.id_tecnico)
        self.db.add(p)
        self.db.commit()
        self._ids_pedido.append(p.id_pedido)

        nombre = "t11_evidencia_test.jpg"
        EVIDENCIAS_DIR.mkdir(parents=True, exist_ok=True)
        ruta = EVIDENCIAS_DIR / nombre
        contenido = b"foto-privada"
        ruta.write_bytes(contenido)

        ev = EvidenciaEntrega(id_pedido=p.id_pedido, id_tecnico=t1.id_tecnico, url_archivo=nombre)
        self.db.add(ev)
        self.db.commit()
        self.db.refresh(ev)
        return u1, u2, admin, ev, contenido, ruta

    def test_tecnico_asignado_descarga_evidencia(self):
        u1, _, _, ev, contenido, ruta = self._preparar_evidencia()
        try:
            token = self._token(self._login(u1.email))
            r = self._get(f"/api/v1/tecnicos/evidencias/entrega/{ev.id}/archivo", headers=self._bearer(token))
            self.assertEqual(r.status_code, 200, r.text)
            self.assertEqual(r.content, contenido)
        finally:
            ruta.unlink(missing_ok=True)

    def test_otro_tecnico_no_descarga_evidencia(self):
        u1, u2, _, ev, _, ruta = self._preparar_evidencia()
        try:
            token = self._token(self._login(u2.email))
            r = self._get(f"/api/v1/tecnicos/evidencias/entrega/{ev.id}/archivo", headers=self._bearer(token))
            self.assertEqual(r.status_code, 403, r.text)
        finally:
            ruta.unlink(missing_ok=True)

    def test_anonimo_no_descarga_evidencia(self):
        _, _, _, ev, _, ruta = self._preparar_evidencia()
        try:
            r = self._get(f"/api/v1/tecnicos/evidencias/entrega/{ev.id}/archivo")
            self.assertEqual(r.status_code, 401)
        finally:
            ruta.unlink(missing_ok=True)

    def test_admin_descarga_evidencia(self):
        _, _, admin, ev, contenido, ruta = self._preparar_evidencia()
        try:
            token = self._token(self._login(admin.email))
            r = self._get(f"/api/v1/tecnicos/evidencias/entrega/{ev.id}/archivo", headers=self._bearer(token))
            self.assertEqual(r.status_code, 200)
            self.assertEqual(r.content, contenido)
        finally:
            ruta.unlink(missing_ok=True)

    def test_montaje_legado_evidencias_ya_no_sirve(self):
        _, _, _, _, _, ruta = self._preparar_evidencia()
        try:
            # El montaje estático /evidencias fue retirado: acceso directo → 404.
            r = self._get("/evidencias/t11_evidencia_test.jpg")
            self.assertEqual(r.status_code, 404)
        finally:
            ruta.unlink(missing_ok=True)


class NotificacionesPropiedadTestCase(BaseT1TestCase):
    def _notif_para(self, cliente, mensaje="hola"):
        n = Notificacion(id_cliente=cliente.id_cliente, tipo="sistema",
                         titulo="T", mensaje=mensaje, leida=False)
        self.db.add(n)
        self.db.commit()
        self.db.refresh(n)
        return n

    def test_cliente_no_marca_notificacion_ajena(self):
        c1 = self._crear_cliente("a")
        c2 = self._crear_cliente("b")
        n = self._notif_para(c1)
        token = self._token(self._login(c2.email))
        r = self._request("PATCH", f"/api/v1/notificaciones/{n.id_notificacion}/leida", headers=self._bearer(token))
        self.assertEqual(r.status_code, 404, r.text)
        self.db.expire_all()
        self.assertFalse(self.db.query(Notificacion).filter(Notificacion.id_notificacion == n.id_notificacion).first().leida)

    def test_cliente_no_ve_notificacion_ajena(self):
        c1 = self._crear_cliente("a")
        c2 = self._crear_cliente("b")
        n = self._notif_para(c1)
        token = self._token(self._login(c2.email))
        r = self._get("/api/v1/notificaciones/mias", headers=self._bearer(token))
        self.assertEqual(r.status_code, 200)
        ids = [x["id_notificacion"] for x in r.json()]
        self.assertNotIn(n.id_notificacion, ids)


if __name__ == "__main__":
    unittest.main(verbosity=2)
