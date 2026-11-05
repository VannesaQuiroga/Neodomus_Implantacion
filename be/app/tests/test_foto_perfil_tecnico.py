"""Foto de perfil del técnico: validación de contenido y almacenamiento real.

Comprueba sobre el MinIO de pruebas que la subida de foto de perfil valida el
contenido real (Pillow), rechaza HTML/SVG disfrazados, genera una URL nueva al
reemplazar y queda aislada por cuenta. Usa la instancia/buckets de pruebas
configurados por ``app.tests.testdb`` (TEST_MINIO_*) y objetos sintéticos
desechables; no toca el catálogo ni el bucket privado de evidencias real.
"""
import io
import unittest
from unittest.mock import patch

import app.tests.testdb  # noqa: F401

from app.main import app
from app.config import settings
from app.services import minio_service
from app.tests.test_t1_identidad import BaseT1TestCase


def _png_bytes(color="red", ancho=12, alto=12) -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (ancho, alto), color).save(buf, format="PNG")
    return buf.getvalue()


def _clave_desde_url(url: str) -> str:
    marca = f"/{settings.MINIO_BUCKET}/"
    return url.split(marca, 1)[1] if marca in url else url


class FotoPerfilTecnicoTestCase(BaseT1TestCase):
    def setUp(self):
        super().setUp()
        self._claves_minio = []

    def tearDown(self):
        for clave in self._claves_minio:
            minio_service.eliminar_objeto(clave)
        super().tearDown()

    def _minio_disponible(self) -> bool:
        from app.tests.testdb import minio_de_pruebas_disponible
        return minio_de_pruebas_disponible()

    def _upload(self, token, filename, contenido, content_type):
        return self._post(
            "/api/v1/users/me/foto",
            files={"archivo": (filename, contenido, content_type)},
            headers=self._bearer(token),
        )

    def test_subida_valida_guarda_y_sirve_objeto(self):
        if not self._minio_disponible():
            self.skipTest("MinIO no alcanzable; almacenamiento de foto no comprobado")

        tecnico_u, _ = self._crear_tecnico("foto")
        token = self._token(self._login(tecnico_u.email))

        r = self._upload(token, "foto.png", _png_bytes(), "image/png")
        self.assertEqual(r.status_code, 200, r.text)
        url = r.json()["foto_url"]
        self.assertIn(f"/{settings.MINIO_BUCKET}/perfiles/", url)

        clave = _clave_desde_url(url)
        self._claves_minio.append(clave)
        self.assertEqual(minio_service.leer_objeto_publico(clave), _png_bytes())

    def test_rechaza_html_y_svg_disfrazados(self):
        if not self._minio_disponible():
            self.skipTest("MinIO no alcanzable; validación de contenido no comprobada")

        tecnico_u, _ = self._crear_tecnico("foto")
        token = self._token(self._login(tecnico_u.email))

        for nombre, contenido, tipo in (
            ("foto.png", b"<html><body>no soy imagen</body></html>", "image/png"),
            ("foto.png", b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', "image/png"),
            ("foto.svg", _png_bytes(), "image/svg+xml"),
            ("foto.jpg", _png_bytes(), "image/jpeg"),  # contenido PNG con extensión JPG
        ):
            with self.subTest(nombre=nombre):
                r = self._upload(token, nombre, contenido, tipo)
                self.assertEqual(r.status_code, 400, r.text)

    def test_reemplazo_genera_url_nueva_y_borra_anterior(self):
        if not self._minio_disponible():
            self.skipTest("MinIO no alcanzable; reemplazo de foto no comprobado")

        tecnico_u, _ = self._crear_tecnico("foto")
        token = self._token(self._login(tecnico_u.email))

        r1 = self._upload(token, "a.png", _png_bytes("red"), "image/png")
        self.assertEqual(r1.status_code, 200, r1.text)
        url1 = r1.json()["foto_url"]
        clave1 = _clave_desde_url(url1)

        r2 = self._upload(token, "b.png", _png_bytes("blue"), "image/png")
        self.assertEqual(r2.status_code, 200, r2.text)
        url2 = r2.json()["foto_url"]
        clave2 = _clave_desde_url(url2)
        self._claves_minio.append(clave2)

        self.assertNotEqual(url1, url2)
        with self.assertRaises(FileNotFoundError):
            minio_service.leer_objeto_publico(clave1)
        self.assertEqual(minio_service.leer_objeto_publico(clave2), _png_bytes("blue"))

    def test_anonimo_no_sube_y_otro_tecnico_no_afecta(self):
        if not self._minio_disponible():
            self.skipTest("MinIO no alcanzable; permisos de foto no comprobados")

        tecnico_u, _ = self._crear_tecnico("foto")
        token1 = self._token(self._login(tecnico_u.email))
        r1 = self._upload(token1, "a.png", _png_bytes("red"), "image/png")
        self.assertEqual(r1.status_code, 200, r1.text)
        url1 = r1.json()["foto_url"]
        self._claves_minio.append(_clave_desde_url(url1))

        anonimo = self._post("/api/v1/users/me/foto",
                             files={"archivo": ("x.png", _png_bytes("green"), "image/png")})
        self.assertEqual(anonimo.status_code, 401)

        tecnico_u2, _ = self._crear_tecnico("foto2")
        token2 = self._token(self._login(tecnico_u2.email))
        r2 = self._upload(token2, "b.png", _png_bytes("blue"), "image/png")
        self.assertEqual(r2.status_code, 200, r2.text)
        self._claves_minio.append(_clave_desde_url(r2.json()["foto_url"]))

        self.assertEqual(minio_service.leer_objeto_publico(_clave_desde_url(url1)), _png_bytes("red"))

    def test_fallo_al_subir_no_borra_foto_vigente(self):
        if not self._minio_disponible():
            self.skipTest("MinIO no alcanzable; fallo de subida no comprobado")

        tecnico_u, _ = self._crear_tecnico("foto")
        token = self._token(self._login(tecnico_u.email))

        r1 = self._upload(token, "a.png", _png_bytes("red"), "image/png")
        self.assertEqual(r1.status_code, 200, r1.text)
        url1 = r1.json()["foto_url"]
        clave1 = _clave_desde_url(url1)
        self._claves_minio.append(clave1)

        with patch("app.services.minio_service.subir_imagen", side_effect=RuntimeError("fallo de almacenamiento")):
            with self.assertRaises(RuntimeError):
                self._upload(token, "b.png", _png_bytes("blue"), "image/png")

        # La foto vigente sigue intacta (objeto presente y URL sin cambios).
        self.assertEqual(minio_service.leer_objeto_publico(clave1), _png_bytes("red"))

    def _objetos_perfil(self, id_usuario: int) -> list[str]:
        from minio import Minio

        c = Minio(settings.MINIO_ENDPOINT, access_key=settings.MINIO_ACCESS_KEY,
                  secret_key=settings.MINIO_SECRET_KEY, secure=settings.MINIO_SECURE)
        return [
            o.object_name
            for o in c.list_objects(settings.MINIO_BUCKET, prefix=f"perfiles/perfil_usuario_{id_usuario}_")
        ]

    def test_fallo_de_commit_limpia_solo_objeto_nuevo(self):
        if not self._minio_disponible():
            self.skipTest("MinIO no alcanzable; fallo de commit no comprobado")

        tecnico_u, _ = self._crear_tecnico("foto")
        token = self._token(self._login(tecnico_u.email))

        r1 = self._upload(token, "a.png", _png_bytes("red"), "image/png")
        self.assertEqual(r1.status_code, 200, r1.text)
        url1 = r1.json()["foto_url"]
        clave1 = _clave_desde_url(url1)
        self._claves_minio.append(clave1)

        with patch("sqlalchemy.orm.Session.commit", side_effect=RuntimeError("commit falla")):
            with self.assertRaises(RuntimeError):
                self._upload(token, "b.png", _png_bytes("blue"), "image/png")

        # Referencia anterior conservada y sin objeto huérfano nuevo.
        self.db.expire_all()
        self.db.rollback()
        from app.models.user import User as _User

        usuario = self.db.query(_User).filter(_User.id_usuario == tecnico_u.id_usuario).one()
        self.assertEqual(usuario.foto_url, url1)
        self.assertEqual(minio_service.leer_objeto_publico(clave1), _png_bytes("red"))
        self.assertEqual(self._objetos_perfil(tecnico_u.id_usuario), [clave1])

    def test_limpieza_posterior_fallida_conserva_foto_nueva(self):
        if not self._minio_disponible():
            self.skipTest("MinIO no alcanzable; limpieza posterior no comprobada")

        tecnico_u, _ = self._crear_tecnico("foto")
        token = self._token(self._login(tecnico_u.email))

        r1 = self._upload(token, "a.png", _png_bytes("red"), "image/png")
        self.assertEqual(r1.status_code, 200, r1.text)
        clave1 = _clave_desde_url(r1.json()["foto_url"])
        self._claves_minio.append(clave1)

        with patch("app.services.minio_service.eliminar_imagen_perfil", side_effect=RuntimeError("borrado falla")):
            r2 = self._upload(token, "b.png", _png_bytes("blue"), "image/png")

        # La foto nueva es válida y queda referenciada; la anterior no se perdió
        # por el fallo de limpieza (se conserva la nueva y el borrado quedó pendiente).
        self.assertEqual(r2.status_code, 200, r2.text)
        clave2 = _clave_desde_url(r2.json()["foto_url"])
        self._claves_minio.append(clave2)
        self.assertNotEqual(clave1, clave2)
        self.assertEqual(minio_service.leer_objeto_publico(clave2), _png_bytes("blue"))

    def test_listado_admin_incluye_foto_url(self):
        if not self._minio_disponible():
            self.skipTest("MinIO no alcanzable; listado admin de foto no comprobado")

        tecnico_u, tecnico = self._crear_tecnico("foto")
        admin = self._crear_admin("foto")

        token_tec = self._token(self._login(tecnico_u.email))
        r = self._upload(token_tec, "a.png", _png_bytes("red"), "image/png")
        self.assertEqual(r.status_code, 200, r.text)
        url = r.json()["foto_url"]
        self._claves_minio.append(_clave_desde_url(url))

        token_admin = self._token(self._login(admin.email))
        r_lista = self._get("/api/v1/tecnicos", headers=self._bearer(token_admin))
        self.assertEqual(r_lista.status_code, 200, r_lista.text)
        item = next((x for x in r_lista.json() if x["id_tecnico"] == tecnico.id_tecnico), None)
        self.assertIsNotNone(item)
        self.assertEqual(item["foto_url"], url)


if __name__ == "__main__":
    unittest.main()
