// Encabezado reutilizable de una sección del perfil, con icono, texto y acción opcional.
import { ReactNode } from 'react';

interface SectionHeaderProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

const SectionHeader = ({ icon, title, subtitle, action }: SectionHeaderProps) => (
  <div className="pf-section-header">
    <div className="pf-section-title-wrap">
      <span className="pf-section-icon">{icon}</span>
      <div>
        <h2 className="pf-section-title">{title}</h2>
        {subtitle && <p className="pf-section-subtitle">{subtitle}</p>}
      </div>
    </div>
    {action && <div className="pf-section-action">{action}</div>}
  </div>
);

export default SectionHeader;