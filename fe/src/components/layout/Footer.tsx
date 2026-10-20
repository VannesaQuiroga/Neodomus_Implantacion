// Componente de navegación y estructura visual: Footer. Se reutiliza en las pantallas de su área.
import { Link } from "react-router-dom";
import { useIdioma } from "@i18n/IdiomaContext";
import "../../styles/footer.css";

export default function Footer() {
  const { t } = useIdioma();

  return (
    <footer className="main-footer">
      <div className="footer-links">
        <Link to="/terminos">{t('footer.terminos')}</Link>

        <span className="separator">|</span>

        <Link to="/privacidad">{t('footer.privacidad')}</Link>

        <span className="separator">|</span>

        <Link to="/cookies">{t('footer.cookies')}</Link>

        <span className="separator">|</span>

        <Link to="/contacto">{t('footer.contacto')}</Link>
      </div>

      <p className="footer-copy">
        © 2026 NEODOMUS. {t('footer.derechos')}
      </p>
    </footer>
  );
}