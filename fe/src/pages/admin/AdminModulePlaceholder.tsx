// Muestra una sección administrativa informativa mientras no tiene contenido operativo.
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import '@styles/admin-panel.css';
import '@styles/dashboard-admin.css';

interface AdminModulePlaceholderProps {
  icon: ReactNode;
  titulo: string;
  descripcion: string;
}

const AdminModulePlaceholder = ({ icon, titulo, descripcion }: AdminModulePlaceholderProps) => (
  <motion.section
    className="admin-panel"
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
  >
    <div className="ap-header">
      <div>
        <h1 className="ap-title">{titulo}</h1>
        <p className="ap-subtitle">Módulo del panel de administración de Neodomus.</p>
      </div>
    </div>

    <div className="ap-soon">
      <div className="ap-soon-icon">{icon}</div>
      <h3>{titulo}</h3>
      <p>{descripcion}</p>
      <Link to="/dashboard/admin" className="ap-btn ap-btn-primary">
        Volver al inicio
      </Link>
    </div>
  </motion.section>
);

export default AdminModulePlaceholder;