"""Comprobaciones de aislamiento de la suite.

Detectan cualquier conexión fuera de la base de pruebas autorizada (sin exponer
credenciales) y verifican que el scheduler y los transportes externos quedan
neutralizados durante las pruebas.

Estas comprobaciones no tocan la base: inspeccionan los binds de las sesiones
(``engine.url.database``) y el estado del scheduler/transportes.
"""
import unittest

import app.tests.testdb as testdb  # noqa: F401  (configura y bloquea si no hay TEST_DATABASE_URL)

from app import database as app_db
from app.services import minio_service
from app.services import scheduler as sched
from app.utils import email as email_mod
from app.utils import respaldo_usuarios as respaldo


class AislamientoConexionesTestCase(unittest.TestCase):
    def _base_autorizada(self):
        return testdb._nombre_base(testdb.TEST_DATABASE_URL)

    def test_engine_apunta_a_base_de_pruebas(self):
        self.assertEqual(app_db.engine.url.database, self._base_autorizada())
        self.assertNotEqual(
            app_db.engine.url.database,
            testdb._nombre_base(testdb.settings.DATABASE_URL),
        )

    def test_sessionlocal_bind_usa_base_de_pruebas(self):
        s = app_db.SessionLocal()
        try:
            self.assertEqual(s.get_bind().url.database, self._base_autorizada())
        finally:
            s.close()

    def test_get_db_usa_sesion_de_pruebas(self):
        gen = app_db.get_db()
        db = next(gen)
        try:
            self.assertEqual(db.get_bind().url.database, self._base_autorizada())
        finally:
            try:
                next(gen)
            except StopIteration:
                pass

    def test_scheduler_session_apunta_a_base_de_pruebas(self):
        # scheduler importa SessionLocal al cargarse; testdb lo importa después
        # de parchear app.database, por lo que debe apuntar a la base de pruebas.
        s = sched.SessionLocal()
        try:
            self.assertEqual(s.get_bind().url.database, self._base_autorizada())
        finally:
            s.close()

    def test_respaldo_usuarios_session_apunta_a_base_de_pruebas(self):
        # respaldo_usuarios también captura SessionLocal al importarse.
        s = respaldo.SessionLocal()
        try:
            self.assertEqual(s.get_bind().url.database, self._base_autorizada())
        finally:
            s.close()


class AislamientoSchedulerTestCase(unittest.TestCase):
    def test_scheduler_neutralizado(self):
        # testdb convierte iniciar_scheduler en un no-op: no crea trabajos.
        sched.iniciar_scheduler()
        self.assertIsNone(sched._scheduler)


class AislamientoTransportesTestCase(unittest.TestCase):
    def test_transporte_correo_neutralizado(self):
        # _send_email_sync quedó reemplazado por un no-op que no toca SMTP.
        self.assertTrue(email_mod._send_email_sync("a@neodomus.com", "asunto", "cuerpo"))

    def test_transporte_archivos_no_alcanzado(self):
        # Ninguna prueba debe instanciar el cliente MinIO (conexión S3 externa).
        self.assertIsNone(minio_service._client)


if __name__ == "__main__":
    unittest.main(verbosity=2)
