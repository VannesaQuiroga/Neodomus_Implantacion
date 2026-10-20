// Contenido de la política de cookies dentro de la plantilla legal.
import { FaCookieBite } from 'react-icons/fa6';
import LegalPage from '@components/legal/LegalPage';

const PoliticaCookies = () => (
  <LegalPage
    icono={<FaCookieBite />}
    titulo="Política de Cookies"
    actualizacion="Agosto de 2026"
    secciones={[
      {
        titulo: 'Introducción',
        parrafos: [
          'Esta política explica qué son las cookies, cómo las utilizamos en Neodomus y las opciones que tienes para gestionarlas.',
        ],
      },
      {
        titulo: '¿Qué son las cookies?',
        parrafos: [
          'Las cookies son pequeños archivos de texto que se almacenan en tu dispositivo al visitar un sitio web. Permiten reconocer tu navegador y recordar preferencias, con el fin de mejorar tu experiencia de navegación.',
        ],
      },
      {
        titulo: 'Tipos de cookies que utilizamos',
        items: [
          { texto: 'Cookies esenciales: necesarias para el funcionamiento básico de la plataforma, la gestión de sesiones y la seguridad. No pueden desactivarse.', tipo: 'punto' },
          { texto: 'Cookies de preferencias: recuerdan tu idioma, configuración de cuenta y opciones personalizadas.', tipo: 'punto' },
          { texto: 'Cookies de análisis: recopilan estadísticas anónimas de uso y rendimiento para mejorar nuestros servicios.', tipo: 'punto' },
        ],
      },
      {
        titulo: 'Cómo gestionar las cookies',
        parrafos: [
          'Puedes configurar tu navegador para bloquear o eliminar las cookies en cualquier momento. Ten en cuenta que, si deshabilitas las cookies esenciales, algunas funcionalidades de la plataforma podrían no estar disponibles.',
        ],
      },
      {
        titulo: 'Cookies de terceros',
        parrafos: [
          'Algunos servicios externos utilizados en la plataforma (como herramientas de análisis de tráfico) pueden instalar sus propias cookies, sujetas a sus respectivas políticas de privacidad.',
        ],
      },
      {
        titulo: 'Actualizaciones',
        parrafos: [
          'Esta política podrá actualizarse cuando sea necesario. Las modificaciones serán publicadas dentro de la plataforma y entrarán en vigencia desde su publicación.',
        ],
      },
      {
        titulo: 'Contacto',
        parrafos: [
          'Si tienes dudas sobre el uso de cookies en Neodomus, escríbenos a soporte@neodomus.com.',
        ],
      },
    ]}
  />
);

export default PoliticaCookies;
