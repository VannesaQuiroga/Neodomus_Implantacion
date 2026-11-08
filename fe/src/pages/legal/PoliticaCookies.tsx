// Contenido de la política de cookies dentro de la plantilla legal.
import { FaCookieBite } from 'react-icons/fa6';
import { useIdioma } from '@i18n/IdiomaContext';
import LegalPage from '@components/legal/LegalPage';

const PoliticaCookies = () => {
  const { t } = useIdioma();

  return (
    <LegalPage
      icono={<FaCookieBite />}
      titulo={t('legal.cookies.titulo')}
      actualizacion={t('legal.comun.agosto2026')}
      secciones={[
        {
          titulo: t('legal.cookies.introduccionTitulo'),
          parrafos: [
            t('legal.cookies.introduccionP1'),
          ],
        },
        {
          titulo: t('legal.cookies.queSonTitulo'),
          parrafos: [
            t('legal.cookies.queSonP1'),
          ],
        },
        {
          titulo: t('legal.cookies.tiposTitulo'),
          items: [
            { texto: t('legal.cookies.tiposItem1'), tipo: 'punto' },
            { texto: t('legal.cookies.tiposItem2'), tipo: 'punto' },
            { texto: t('legal.cookies.tiposItem3'), tipo: 'punto' },
          ],
        },
        {
          titulo: t('legal.cookies.gestionTitulo'),
          parrafos: [
            t('legal.cookies.gestionP1'),
          ],
        },
        {
          titulo: t('legal.cookies.tercerosTitulo'),
          parrafos: [
            t('legal.cookies.tercerosP1'),
          ],
        },
        {
          titulo: t('legal.cookies.actualizacionesTitulo'),
          parrafos: [
            t('legal.cookies.actualizacionesP1'),
          ],
        },
        {
          titulo: t('legal.cookies.contactoTitulo'),
          parrafos: [
            t('legal.cookies.contactoP1'),
          ],
        },
      ]}
    />
  );
};

export default PoliticaCookies;
