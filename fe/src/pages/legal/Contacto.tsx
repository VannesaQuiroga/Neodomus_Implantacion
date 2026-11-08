// Presenta los canales de contacto y sus accesos desde la web.
import { Link } from 'react-router-dom';
import {
  FaHeadset, FaEnvelope, FaPhone, FaClock, FaLocationDot
} from 'react-icons/fa6';
import { useIdioma } from '@i18n/IdiomaContext';
import LegalPage from '@components/legal/LegalPage';

const Contacto = () => {
  const { t } = useIdioma();

  return (
    <LegalPage
      icono={<FaHeadset />}
      titulo={t('legal.contacto.titulo')}
      actualizacion={t('legal.comun.agosto2026')}
      numeradas={false}
      secciones={[
        {
          titulo: t('legal.contacto.introduccionTitulo'),
          parrafos: [
            t('legal.contacto.introduccionP1'),
          ],
        },
        {
          titulo: t('legal.contacto.canalesTitulo'),
          tarjetas: [
            { icono: <FaEnvelope />, titulo: t('legal.contacto.canalesCorreoTitulo'), valor: 'soporte@neodomus.com', descripcion: t('legal.contacto.canalesCorreoDesc') },
            { icono: <FaPhone />, titulo: t('legal.contacto.canalesLineaTitulo'), valor: '+57 601 123 4567', descripcion: t('legal.contacto.canalesLineaDesc') },
            { icono: <FaClock />, titulo: t('legal.contacto.canalesHorarioTitulo'), valor: t('legal.contacto.canalesHorarioValor'), descripcion: t('legal.contacto.canalesHorarioDesc') },
            { icono: <FaLocationDot />, titulo: t('legal.contacto.canalesOficinaTitulo'), valor: 'Cra 15 #93-47, Bogotá', descripcion: t('legal.contacto.canalesOficinaDesc') },
          ],
        },
        {
          titulo: t('legal.contacto.ayudaTitulo'),
          items: [
            { texto: t('legal.contacto.ayudaItem1'), tipo: 'check' },
            { texto: t('legal.contacto.ayudaItem2'), tipo: 'check' },
            { texto: t('legal.contacto.ayudaItem3'), tipo: 'check' },
            { texto: t('legal.contacto.ayudaItem4'), tipo: 'check' },
          ],
        },
        {
          titulo: t('legal.contacto.tiempoTitulo'),
          parrafos: [
            t('legal.contacto.tiempoP1'),
            <>
              {t('legal.contacto.tiempoP2Prefijo')}{' '}
              <Link to="/ayuda" className="legal-enlace">{t('ayuda.centro')}</Link>.
            </>,
          ],
        },
      ]}
    />
  );
};

export default Contacto;
