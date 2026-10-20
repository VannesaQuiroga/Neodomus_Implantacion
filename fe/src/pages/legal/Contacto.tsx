// Presenta los canales de contacto y sus accesos desde la web.
import { Link } from 'react-router-dom';
import {
  FaHeadset, FaEnvelope, FaPhone, FaClock, FaLocationDot
} from 'react-icons/fa6';
import LegalPage from '@components/legal/LegalPage';

const Contacto = () => (
  <LegalPage
    icono={<FaHeadset />}
    titulo="Contacto"
    actualizacion="Agosto de 2026"
    numeradas={false}
    secciones={[
      {
        titulo: 'Introducción',
        parrafos: [
          'Estamos aquí para ayudarte. El equipo de Neodomus está disponible para resolver tus dudas, atender tus solicitudes y brindarte asesoría sobre nuestros productos y servicios.',
        ],
      },
      {
        titulo: 'Canales de atención',
        tarjetas: [
          { icono: <FaEnvelope />, titulo: 'Correo de soporte', valor: 'soporte@neodomus.com', descripcion: 'Respondemos en 24h hábiles' },
          { icono: <FaPhone />, titulo: 'Línea de atención', valor: '+57 601 123 4567', descripcion: 'Lun - Vie 8:00 - 18:00' },
          { icono: <FaClock />, titulo: 'Horario de atención', valor: 'Lunes a Viernes', descripcion: '8:00 AM - 6:00 PM' },
          { icono: <FaLocationDot />, titulo: 'Oficina principal', valor: 'Cra 15 #93-47, Bogotá', descripcion: 'Solo con cita previa' },
        ],
      },
      {
        titulo: '¿Cómo podemos ayudarte?',
        items: [
          { texto: 'Consultas sobre pedidos y pagos.', tipo: 'check' },
          { texto: 'Agendamiento y reprogramación de citas.', tipo: 'check' },
          { texto: 'Soporte técnico e instalaciones.', tipo: 'check' },
          { texto: 'Asesoría en productos domóticos.', tipo: 'check' },
        ],
      },
      {
        titulo: 'Tiempo de respuesta',
        parrafos: [
          'Nos comprometemos a responder todas las consultas dentro de un plazo máximo de 24 horas hábiles.',
          <>
            Para enviar una consulta por formulario, visita nuestro{' '}
            <Link to="/ayuda" className="legal-enlace">Centro de Ayuda</Link>.
          </>,
        ],
      },
    ]}
  />
);

export default Contacto;
