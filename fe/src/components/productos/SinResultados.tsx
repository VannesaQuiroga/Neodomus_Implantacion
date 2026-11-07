import type { ReactNode } from 'react';

interface SinResultadosProps {
  titulo: string;
  mensaje: string;
  icono?: ReactNode;
  accion?: { etiqueta: string; alHacerClic: () => void };
}

// Estado vacío compartido por las vistas de productos (catálogo público y
// panel del cliente): título grande en blanco + sugerencias, siempre visible
// sobre el fondo oscuro. Solo se muestra cuando la carga terminó sin errores.
const SinResultados = ({ titulo, mensaje, icono, accion }: SinResultadosProps) => (
  <div className="productos-vacio" role="status">
    {icono && (
      <div className="productos-vacio-icono" aria-hidden="true">
        {icono}
      </div>
    )}
    <h2 className="productos-vacio-titulo">{titulo}</h2>
    <p className="productos-vacio-mensaje">{mensaje}</p>
    {accion && (
      <button type="button" className="productos-vacio-accion" onClick={accion.alHacerClic}>
        {accion.etiqueta}
      </button>
    )}
  </div>
);

export default SinResultados;
