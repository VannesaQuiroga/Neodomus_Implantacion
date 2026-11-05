import { FaChevronLeft, FaChevronRight } from 'react-icons/fa6';

interface Props {
  page: number;
  totalPages: number;
  onPageChange: (n: number) => void;
}

// Control de paginación reutilizable (mismos estilos .ap-paginacion del panel).
export function Paginacion({ page, totalPages, onPageChange }: Props) {
  if (totalPages <= 1) return null;

  return (
    <div className="ap-paginacion">
      <button
        type="button"
        className="ap-page-btn"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Página anterior"
      >
        <FaChevronLeft /> Anterior
      </button>
      <div className="ap-page-nums">
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            className={`ap-page-btn ${n === page ? 'active' : ''}`}
            onClick={() => onPageChange(n)}
            aria-label={`Ir a la página ${n}`}
            aria-current={n === page ? 'page' : undefined}
          >
            {n}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="ap-page-btn"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        aria-label="Página siguiente"
      >
        Siguiente <FaChevronRight />
      </button>
    </div>
  );
}
