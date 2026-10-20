// Componente de navegación y estructura visual: AdminFooter. Se reutiliza en las pantallas de su área.
import { useIdioma } from "@i18n/IdiomaContext";
import "../../styles/footer.css";

export default function AdminFooter() {
  const { t } = useIdioma();

  return (
    <footer className="main-footer admin-footer">
      <p className="footer-copy">© 2026 NEODOMUS. {t('footer.derechos')}</p>
    </footer>
  );
}