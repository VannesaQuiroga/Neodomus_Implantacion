"""T1.2: privacidad efectiva del almacenamiento de evidencias (MinIO real).

Comprueba sobre el MinIO de pruebas que el bucket privado de evidencias rechaza
la lectura anónima directa, mientras que el catálogo público sigue accesible.
No modifica el bucket público desplegado: usa objetos sintéticos desechables.
"""
import unittest
import urllib.error
import urllib.request

import app.tests.testdb  # noqa: F401

from app.config import settings
from app.models.evidencia import EvidenciaEntrega
from app.models.pedido import Pedido
from app.services import minio_service
from app.tests.test_t1_identidad import BaseT1TestCase


def _get_status(url: str) -> int:
    try:
        urllib.request.urlopen(url, timeout=10)
        return 200
    except urllib.error.HTTPError as e:
        return e.code


def _cruda(ref: str) -> str:
    """Quita el marcador privado para construir la URL directa del objeto."""
    return ref[len("privado:"):] if ref.startswith("privado:") else ref


class PrivacidadMinioTestCase(BaseT1TestCase):
    def _minio_disponible(self):
        try:
            from minio import Minio
            c = Minio(settings.MINIO_ENDPOINT, access_key=settings.MINIO_ACCESS_KEY,
                      secret_key=settings.MINIO_SECRET_KEY, secure=settings.MINIO_SECURE)
            return c.bucket_exists(settings.MINIO_BUCKET)
        except Exception:
            return False

    def test_evidencia_privada_sin_lectura_anonima(self):
        if not self._minio_disponible():
            self.skipTest("MinIO no alcanzable; privacidad de infraestructura no comprobada")

        # Objeto sintético en el bucket PRIVADO de evidencias.
        clave = minio_service.subir_imagen_privada("evidencias_entrega", "t12_sintetico.jpg", b"secreto")
        cruda = _cruda(clave)
        url_directa = f"http://{settings.MINIO_ENDPOINT}/{settings.MINIO_PRIVATE_BUCKET}/{cruda}"
        try:
            # 1) Lectura anónima directa del objeto privado → rechazada.
            self.assertEqual(_get_status(url_directa), 403)

            # 2) La ruta autorizada permite descargar al técnico asignado.
            c = self._crear_cliente("minio")
            u1, t1 = self._crear_tecnico("m1")
            p = Pedido(id_cliente_pe=c.id_cliente, estado_pedido="Pagado",
                       estado_entrega="Asignada", id_tecnico_entrega=t1.id_tecnico)
            self.db.add(p)
            self.db.commit()
            self._ids_pedido.append(p.id_pedido)
            ev = EvidenciaEntrega(id_pedido=p.id_pedido, id_tecnico=t1.id_tecnico, url_archivo=clave)
            self.db.add(ev)
            self.db.commit()
            self.db.refresh(ev)

            token = self._token(self._login(u1.email))
            r = self._get(f"/api/v1/tecnicos/evidencias/entrega/{ev.id}/archivo", headers=self._bearer(token))
            self.assertEqual(r.status_code, 200, r.text)
            self.assertEqual(r.content, b"secreto")

            # 3) Anónimo vía ruta autorizada → 401.
            self.assertEqual(self._get(f"/api/v1/tecnicos/evidencias/entrega/{ev.id}/archivo").status_code, 401)

            # 4) La estructura antigua (objeto en el bucket público con la clave
            #    de evidencia) no elude la protección: el objeto no está allí.
            url_antigua = f"http://{settings.MINIO_ENDPOINT}/{settings.MINIO_BUCKET}/{cruda}"
            self.assertEqual(_get_status(url_antigua), 404)
        finally:
            minio_service.eliminar_objeto_privado(clave)

    def test_catalogo_publico_accesible(self):
        if not self._minio_disponible():
            self.skipTest("MinIO no alcanzable; catálogo no comprobado")

        # Objeto sintético en el bucket PÚBLICO de catálogo.
        minio_service.subir_imagen("productos", "t12_catalogo_sintetico.jpg", b"imagen-publica")
        url_directa = f"http://{settings.MINIO_ENDPOINT}/{settings.MINIO_BUCKET}/productos/t12_catalogo_sintetico.jpg"
        try:
            self.assertEqual(_get_status(url_directa), 200)
        finally:
            minio_service.eliminar_objeto("productos/t12_catalogo_sintetico.jpg")

    def test_novedades_y_recogidas_privadas(self):
        if not self._minio_disponible():
            self.skipTest("MinIO no alcanzable; flujos no comprobados")
        claves = [
            minio_service.subir_imagen_privada("evidencias_novedades", "t12_novedad.jpg", b"novedad"),
            minio_service.subir_imagen_privada("recogidas", "t12_recogida.jpg", b"recogida"),
        ]
        try:
            for clave in claves:
                url = f"http://{settings.MINIO_ENDPOINT}/{settings.MINIO_PRIVATE_BUCKET}/{_cruda(clave)}"
                self.assertEqual(_get_status(url), 403, clave)
        finally:
            for clave in claves:
                minio_service.eliminar_objeto_privado(clave)

    def test_origen_explicito_privado_vs_heredado(self):
        if not self._minio_disponible():
            self.skipTest("MinIO no alcanzable; origen no comprobado")

        # 1) La misma clave existe en ambos buckets: cada referencia obtiene el suyo.
        clave = "evidencias_entrega/t13_ambos.jpg"
        minio_service.subir_imagen_privada("evidencias_entrega", "t13_ambos.jpg", b"privado")
        minio_service.subir_imagen("evidencias_entrega", "t13_ambos.jpg", b"publico")  # simula heredado en bucket público
        try:
            self.assertEqual(minio_service.leer_archivo("privado:" + clave)[0], b"privado")
            self.assertEqual(minio_service.leer_archivo(clave)[0], b"publico")  # referencia heredada (clave simple)

            # 2) Falta el objeto privado y existe uno público con la misma clave:
            #    no se entrega el público.
            solo_publica = "evidencias_entrega/t13_solo_publica.jpg"
            minio_service.subir_imagen("evidencias_entrega", "t13_solo_publica.jpg", b"publico2")
            with self.assertRaises(FileNotFoundError):
                minio_service.leer_archivo("privado:" + solo_publica)

            # 3) Referencia heredada válida (URL pública) → lectura autorizada.
            url_publica = minio_service.url_publica("evidencias_entrega/t13_ambos.jpg")
            self.assertEqual(minio_service.leer_archivo(url_publica)[0], b"publico")
        finally:
            minio_service.eliminar_objeto_privado("privado:" + clave)
            minio_service.eliminar_objeto("evidencias_entrega/t13_ambos.jpg")
            minio_service.eliminar_objeto("evidencias_entrega/t13_solo_publica.jpg")


if __name__ == "__main__":
    unittest.main(verbosity=2)
