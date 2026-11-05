// Componente reutilizable LegalPage para componer la interfaz de Neodomus.
import { Link } from 'react-router-dom';
import {
  FaChevronLeft, FaCircleCheck, FaCircleDot
} from 'react-icons/fa6';
import '@styles/legal.css';

interface Tarjeta {
  icono: React.ReactNode;
  titulo: string;
  valor: string;
  descripcion?: string;
}

interface Seccion {
  titulo?: string;
  parrafos?: React.ReactNode[];
  items?: { texto: string; tipo?: 'check' | 'punto' }[];
  tarjetas?: Tarjeta[];
}

interface LegalPageProps {
  icono: React.ReactNode;
  titulo: string;
  actualizacion: string;
  secciones: Seccion[];
  numeradas?: boolean;
}

const LegalPage = ({ icono, titulo, actualizacion, secciones, numeradas = true }: LegalPageProps) => {
  return (
    <div className="legal-page app-glass">
      <main className="legal-main">
        <div className="legal-card">
          <header className="legal-header">
            <span className="legal-header-icon">{icono}</span>
            <h1 className="legal-title">{titulo}</h1>
            <p className="legal-update">
              <FaCircleDot /> Última actualización: {actualizacion}
            </p>
          </header>

          <div className="legal-cuerpo">
            {secciones.map((seccion, i) => (
              <section key={i} className="legal-section">
                {seccion.titulo && (
                  <h2 className={numeradas ? 'legal-section-titulo' : 'legal-section-titulo sin-numero'}>
                    {seccion.titulo}
                  </h2>
                )}

                {seccion.parrafos?.map((parrafo, j) => (
                  <p key={j} className="legal-p">{parrafo}</p>
                ))}

                {seccion.items && (
                  <ul className="legal-list">
                    {seccion.items.map((item, k) => (
                      <li key={k} className="legal-list-item">
                        {item.tipo === 'check'
                          ? <FaCircleCheck className="legal-ic-check" />
                          : <FaCircleDot className="legal-ic-punto" />}
                        <span>{item.texto}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {seccion.tarjetas && (
                  <div className="legal-cards">
                    {seccion.tarjetas.map((tarjeta, t) => (
                      <article key={t} className="legal-card-item">
                        <div className="legal-card-icon">{tarjeta.icono}</div>
                        <h3 className="legal-card-title">{tarjeta.titulo}</h3>
                        <p className="legal-card-valor">{tarjeta.valor}</p>
                        {tarjeta.descripcion && (
                          <p className="legal-card-desc">{tarjeta.descripcion}</p>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>

          <footer className="legal-pie">
            <Link to="/" className="legal-volver">
              <FaChevronLeft /> Volver al inicio
            </Link>
            <p className="legal-pie-copy">
              © 2026 NEODOMUS. Todos los derechos reservados.
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
};

export default LegalPage;
