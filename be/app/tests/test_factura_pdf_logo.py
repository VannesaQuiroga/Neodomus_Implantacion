"""Genera PDFs reales con datos sintéticos; sin BD ni correo externo."""
import asyncio
import unittest
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace as N
from unittest.mock import AsyncMock, patch

from app.services import factura_service as service


class _SMTPFalso:
    """Sustituye solo el transporte SMTP: no abre conexiones ni envía nada."""

    instancias = []

    def __init__(self, *_args, **_kwargs):
        self.mensajes = []
        self.starttls_llamado = False
        self.login_llamado = False
        self.quit_llamado = False
        type(self).instancias.append(self)

    def starttls(self):
        self.starttls_llamado = True

    def login(self, *_args, **_kwargs):
        self.login_llamado = True

    def send_message(self, mensaje):
        self.mensajes.append(mensaje)

    def quit(self):
        self.quit_llamado = True


class FacturaPDFLogoTestCase(unittest.TestCase):
    def setUp(self):
        self.factura = N(numero_factura='TEST-PDF-1', fecha_factura=datetime(2026, 10, 21),
                         metodo_pago='punto_pago', estado_pago='aprobado', numero_transaccion='TEST')
        self.cliente = N(first_name='Cliente', last_name='Prueba', id_tipo_documento_c=None,
                         documento_cliente=None, telefono_cliente=None, address='Direccion de prueba',
                         email='pdf@example.test')
        self.detalle = N(descripcion_detalle='Cable', producto=None, cantidad_detalle=1,
                         cantidad_metros=Decimal('1.50'), precio_unitario_detalle=1000,
                         subtotal_detalle=1500, id_producto_d=1)

    def _validar(self, buffer):
        self.assertEqual(buffer.tell(), 0)
        data = buffer.read()
        self.assertTrue(data.startswith(b'%PDF-'))
        self.assertIn(b'%%EOF', data)
        self.assertGreater(len(data), 1000)

    def test_pedido_sin_logo_sigue_generando_factura(self):
        with patch.object(service, 'LOGO_PATH', Path('__logo_ausente_test__.jpg')):
            self._validar(service.generar_factura_pdf(self.factura, N(total_pedido=1500), self.cliente, [self.detalle]))

    def test_cita_sin_logo_sigue_generando_factura(self):
        cita = N(tipo_servicio='instalacion', fecha=datetime(2026,10,21), hora='10:00',
                 direccion='Direccion de prueba', costo_cita=120000)
        with patch.object(service, 'LOGO_PATH', Path('__logo_ausente_test__.jpg')):
            self._validar(service.generar_factura_cita_pdf(self.factura, cita, self.cliente))

    def test_logo_incluido_en_backend_y_factura_generable(self):
        self.assertTrue(service.LOGO_PATH.is_file())
        self._validar(service.generar_factura_pdf(self.factura, N(total_pedido=1500), self.cliente, [self.detalle]))

    def test_correo_recibe_pdf_real_como_adjunto(self):
        pdf = service.generar_factura_pdf(self.factura, N(total_pedido=1500), self.cliente, [self.detalle])
        with patch('app.utils.email.send_email_with_attachment', new_callable=AsyncMock, return_value=True) as enviar:
            self.assertTrue(asyncio.run(service.enviar_factura_por_correo(self.cliente.email, pdf)))
            enviar.assert_awaited_once()
            args = enviar.await_args.args
            self.assertEqual(args[0], self.cliente.email)
            self.assertIs(args[3], pdf)
            self._validar(args[3])

    def test_smtp_simulado_adjunta_el_pdf_real(self):
        """Recorre el envío completo, sustituyendo únicamente smtplib.SMTP.

        La prueba anterior comprueba la entrega del buffer al servicio de
        adjuntos. Esta comprueba que el mensaje MIME construido por email.py
        contiene un PDF válido como adjunto y que no se contacta ningún SMTP
        real.
        """
        _SMTPFalso.instancias.clear()
        pdf = service.generar_factura_pdf(
            self.factura, N(total_pedido=1500), self.cliente, [self.detalle]
        )
        from app.utils import email as email_module

        # testdb neutraliza el transporte para toda la suite; aquí se usa la
        # implementación real del adjunto y solo se sustituye smtplib.SMTP.
        adjunto_real = getattr(
            email_module, '_adjunto_original', email_module.send_email_with_attachment
        )
        with patch('app.utils.email.send_email_with_attachment', adjunto_real), \
             patch('app.utils.email.smtplib.SMTP', _SMTPFalso), \
             patch('app.utils.email.settings.EMAIL_PROVIDER', 'smtp'):
            self.assertTrue(asyncio.run(
                service.enviar_factura_por_correo(self.cliente.email, pdf)
            ))

        self.assertEqual(len(_SMTPFalso.instancias), 1)
        servidor = _SMTPFalso.instancias[0]
        self.assertTrue(servidor.starttls_llamado)
        self.assertTrue(servidor.login_llamado)
        self.assertTrue(servidor.quit_llamado)
        self.assertEqual(len(servidor.mensajes), 1)

        mensaje = servidor.mensajes[0]
        self.assertEqual(mensaje['To'], self.cliente.email)
        adjuntos = [
            parte for parte in mensaje.walk()
            if parte.get_content_type() == 'application/pdf'
        ]
        self.assertEqual(len(adjuntos), 1)
        contenido = adjuntos[0].get_payload(decode=True)
        self.assertTrue(contenido.startswith(b'%PDF-'))
        self.assertIn(b'%%EOF', contenido)
        self.assertGreater(len(contenido), 1000)
