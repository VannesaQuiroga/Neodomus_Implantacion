// Contenido de la política de privacidad dentro de la plantilla legal.
import { FaShieldHalved } from 'react-icons/fa6';
import { useIdioma } from '@i18n/IdiomaContext';
import LegalPage from '@components/legal/LegalPage';

const PoliticaPrivacidad = () => {
  const { t } = useIdioma();

  return (
    <LegalPage
      icono={<FaShieldHalved />}
      titulo={t('legal.privacidad.titulo')}
      actualizacion={t('legal.comun.agosto2026')}
      secciones={[
        {
          titulo: t('legal.privacidad.introduccionTitulo'),
          parrafos: [
            t('legal.privacidad.introduccionP1'),
          ],
        },
        {
          titulo: t('legal.privacidad.datosTitulo'),
          items: [
            { texto: t('legal.privacidad.datosItem1'), tipo: 'punto' },
            { texto: t('legal.privacidad.datosItem2'), tipo: 'punto' },
            { texto: t('legal.privacidad.datosItem3'), tipo: 'punto' },
            { texto: t('legal.privacidad.datosItem4'), tipo: 'punto' },
          ],
        },
        {
          titulo: t('legal.privacidad.usoTitulo'),
          parrafos: [
            t('legal.privacidad.usoP1'),
            t('legal.privacidad.usoP2'),
          ],
        },
        {
          titulo: t('legal.privacidad.compartirTitulo'),
          parrafos: [
            t('legal.privacidad.compartirP1'),
            t('legal.privacidad.compartirP2'),
          ],
        },
        {
          titulo: t('legal.privacidad.derechosTitulo'),
          parrafos: [
            t('legal.privacidad.derechosP1'),
          ],
          items: [
            { texto: t('legal.privacidad.derechosItem1'), tipo: 'check' },
            { texto: t('legal.privacidad.derechosItem2'), tipo: 'check' },
            { texto: t('legal.privacidad.derechosItem3'), tipo: 'check' },
            { texto: t('legal.privacidad.derechosItem4'), tipo: 'check' },
          ],
        },
        {
          titulo: t('legal.privacidad.seguridadTitulo'),
          parrafos: [
            t('legal.privacidad.seguridadP1'),
          ],
        },
        {
          titulo: t('legal.privacidad.retencionTitulo'),
          parrafos: [
            t('legal.privacidad.retencionP1'),
          ],
        },
        {
          titulo: t('legal.privacidad.modificacionesTitulo'),
          parrafos: [
            t('legal.privacidad.modificacionesP1'),
          ],
        },
        {
          titulo: t('legal.privacidad.contactoTitulo'),
          parrafos: [
            t('legal.privacidad.contactoP1'),
          ],
        },
      ]}
    />
  );
};

export default PoliticaPrivacidad;
