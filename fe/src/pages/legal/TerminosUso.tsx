// Contenido de los términos de uso dentro de la plantilla legal.
import { FaFileContract } from 'react-icons/fa6';
import { useIdioma } from '@i18n/IdiomaContext';
import LegalPage from '@components/legal/LegalPage';

const TerminosUso = () => {
  const { t } = useIdioma();

  return (
    <LegalPage
      icono={<FaFileContract />}
      titulo={t('legal.terminos.titulo')}
      actualizacion={t('legal.comun.agosto2026')}
      secciones={[
        {
          titulo: t('legal.terminos.introduccionTitulo'),
          parrafos: [
            t('legal.terminos.introduccionP1'),
          ],
        },
        {
          titulo: t('legal.terminos.objetoTitulo'),
          parrafos: [
            t('legal.terminos.objetoP1'),
          ],
        },
        {
          titulo: t('legal.terminos.registroTitulo'),
          parrafos: [
            t('legal.terminos.registroP1'),
            t('legal.terminos.registroP2'),
          ],
        },
        {
          titulo: t('legal.terminos.obligacionesTitulo'),
          items: [
            { texto: t('legal.terminos.obligacionesItem1'), tipo: 'check' },
            { texto: t('legal.terminos.obligacionesItem2'), tipo: 'check' },
            { texto: t('legal.terminos.obligacionesItem3'), tipo: 'check' },
            { texto: t('legal.terminos.obligacionesItem4'), tipo: 'check' },
          ],
        },
        {
          titulo: t('legal.terminos.propiedadTitulo'),
          parrafos: [
            t('legal.terminos.propiedadP1'),
          ],
        },
        {
          titulo: t('legal.terminos.suspensionTitulo'),
          parrafos: [
            t('legal.terminos.suspensionP1'),
          ],
        },
        {
          titulo: t('legal.terminos.modificacionesTitulo'),
          parrafos: [
            t('legal.terminos.modificacionesP1'),
            t('legal.terminos.modificacionesP2'),
          ],
        },
        {
          titulo: t('legal.terminos.legislacionTitulo'),
          parrafos: [
            t('legal.terminos.legislacionP1'),
          ],
        },
      ]}
    />
  );
};

export default TerminosUso;
