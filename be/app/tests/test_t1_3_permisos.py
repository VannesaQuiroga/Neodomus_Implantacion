"""T1.3: acceso del cliente a evidencia de entrega y permisos pendientes por HTTP.

Cubre el contrato de seguimiento del cliente (evidencia de entrega) y los roles
de devoluciones/reembolsos/novedades/reportes/listados con peticiones reales.
"""
import unittest
import urllib.error
import urllib.request

import app.tests.testdb  # noqa: F401

from app.config import settings
from app.models.devolucion import Devolucion
from app.models.evidencia import EvidenciaEntrega
from app.models.notificacion import Notificacion
from app.models.pedido import Pedido
from app.services import minio_service
from app.tests.test_t1_identidad import BaseT1TestCase


def _get_status(url: str) -> int:
    try:
        urllib.request.urlopen(url, timeout=10)
        return 200
    except urllib.error.HTTPError as e:
        return e.code


class EvidenciaEntregaClienteTestCase(BaseT1TestCase):
    def _minio_disponible(self):
        try:
            from minio import Minio
            c = Minio(settings.MINIO_ENDPOINT, access_key=settings.MINIO_ACCESS_KEY,
                      secret_key=settings.MINIO_SECRET_KEY, secure=settings.MINIO_SECURE)
            return c.bucket_exists(settings.MINIO_BUCKET)
        except Exception:
            return False

    def _preparar(self):
        c1 = self._crear_cliente("a")
        c2 = self._crear_cliente("b")
        u1, t1 = self._crear_tecnico("t")
        p = Pedido(id_cliente_pe=c1.id_cliente, estado_pedido="Pagado",
                   estado_entrega="Entregado", id_tecnico_entrega=t1.id_tecnico)
        self.db.add(p)
        self.db.commit()
        self._ids_pedido.append(p.id_pedido)
        clave = minio_service.subir_imagen_privada("evidencias_entrega", "t13_entrega.jpg", b"foto-entrega")
        ev = EvidenciaEntrega(id_pedido=p.id_pedido, id_tecnico=t1.id_tecnico, url_archivo=clave)
        self.db.add(ev)
        self.db.commit()
        self.db.refresh(ev)
        return c1, c2, u1, p, ev, clave

    def test_cliente_propietario_descarga_su_evidencia(self):
        if not self._minio_disponible():
            self.skipTest("MinIO no alcanzable")
        c1, _, _, p, ev, clave = self._preparar()
        try:
            token = self._token(self._login(c1.email))
            r_lista = self._get(f"/api/v1/pedidos/{p.id_pedido}/evidencias-entrega", headers=self._bearer(token))
            self.assertEqual(r_lista.status_code, 200)
            self.assertIn(ev.id, [x["id"] for x in r_lista.json()])
            r = self._get(f"/api/v1/pedidos/{p.id_pedido}/evidencias-entrega/{ev.id}/archivo", headers=self._bearer(token))
            self.assertEqual(r.status_code, 200, r.text)
            self.assertEqual(r.content, b"foto-entrega")
        finally:
            minio_service.eliminar_objeto_privado(clave)

    def test_otro_cliente_no_descarga_evidencia_ajena(self):
        if not self._minio_disponible():
            self.skipTest("MinIO no alcanzable")
        _, c2, _, p, ev, clave = self._preparar()
        try:
            token = self._token(self._login(c2.email))
            r = self._get(f"/api/v1/pedidos/{p.id_pedido}/evidencias-entrega/{ev.id}/archivo", headers=self._bearer(token))
            self.assertEqual(r.status_code, 404, r.text)
        finally:
            minio_service.eliminar_objeto_privado(clave)

    def test_anonimo_y_no_existente(self):
        if not self._minio_disponible():
            self.skipTest("MinIO no alcanzable")
        _, _, _, p, ev, clave = self._preparar()
        try:
            self.assertEqual(self._get(f"/api/v1/pedidos/{p.id_pedido}/evidencias-entrega/{ev.id}/archivo").status_code, 401)
            token = self._token(self._login(self._crear_cliente("c").email))
            self.assertEqual(self._get(f"/api/v1/pedidos/999999/evidencias-entrega/999999/archivo", headers=self._bearer(token)).status_code, 404)
        finally:
            minio_service.eliminar_objeto_privado(clave)

    def test_tipo_evidencia_no_admitido(self):
        u1, _ = self._crear_tecnico("tt")
        token = self._token(self._login(u1.email))
        r = self._get("/api/v1/tecnicos/evidencias/foo/1/archivo", headers=self._bearer(token))
        self.assertEqual(r.status_code, 404)


class PermisosPendientesTestCase(BaseT1TestCase):
    """Roles de endpoints administrativos y propiedad en devoluciones/reembolsos."""

    def _roles(self):
        c = self._crear_cliente("cli")
        u, _t = self._crear_tecnico("tec")
        admin = self._crear_admin()
        return c, u, admin

    def test_endpoints_admin_rechazan_cliente_y_tecnico(self):
        c = self._crear_cliente("cli")
        u, _t = self._crear_tecnico("tec")
        admin = self._crear_admin()
        tc = self._token(self._login(c.email))
        tt = self._token(self._login(u.email))
        ta = self._token(self._login(admin.email))
        endpoints = [
            "/api/v1/clients",
            "/api/v1/pedidos/all-admin",
            "/api/v1/citas/all-admin",
            "/api/v1/reports/operativo",
            "/api/v1/reembolsos",
            "/api/v1/novedades",
        ]
        for ep in endpoints:
            self.assertIn(self._get(ep, headers=self._bearer(tc)).status_code, (401, 403), ep)
            self.assertEqual(self._get(ep, headers=self._bearer(tt)).status_code, 403, ep)
            self.assertEqual(self._get(ep, headers=self._bearer(ta)).status_code, 200, ep)

    def test_devoluciones_mias_no_filtra_ajenas(self):
        c1 = self._crear_cliente("a")
        c2 = self._crear_cliente("b")
        d = Devolucion(id_cliente_d=c1.id_cliente, motivo="defecto", estado="Solicitada", cantidad=1)
        self.db.add(d)
        self.db.commit()
        self._ids_devolucion.append(d.id_devolucion)
        token = self._token(self._login(c2.email))
        r = self._get("/api/v1/devoluciones/mias", headers=self._bearer(token))
        self.assertEqual(r.status_code, 200)
        ids = [x.get("id_devolucion") for x in r.json()]
        self.assertNotIn(d.id_devolucion, ids)


if __name__ == "__main__":
    unittest.main(verbosity=2)
