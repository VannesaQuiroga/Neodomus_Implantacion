// Interpretación y validación de longitudes en metros (cortes fraccionarios).
// El backend es la autoridad decimal; aquí solo se interpreta la entrada del
// usuario de forma coherente con su contrato (hasta 2 decimales) sin redondear
// silenciosamente valores inválidos.

export interface ResultadoMetros {
  valor: number | null;
  error: string | null;
}

/** Acepta coma o punto como separador decimal. No interpreta separadores
 * ambiguos (p. ej. "1,5.5" se rechaza). No redondea más de 2 decimales. */
export function parseMetros(entrada: string | number): ResultadoMetros {
  const crudo = String(entrada).trim();
  // Rechaza separadores ambiguos o caracteres no numéricos.
  if (!/^[0-9]+([.,][0-9]{0,2})?$/.test(crudo)) {
    return { valor: null, error: 'Cantidad inválida (usa hasta 2 decimales)' };
  }
  const normalizado = crudo.replace(',', '.');
  const n = Number(normalizado);
  if (!Number.isFinite(n)) {
    return { valor: null, error: 'Cantidad inválida' };
  }
  if (n <= 0) {
    return { valor: null, error: 'La longitud debe ser mayor a cero' };
  }
  return { valor: n, error: null };
}

/** Formatea una longitud en metros (máx. 2 decimales) sin exponentes. */
export function formatMetros(valor: number | null | undefined): string {
  if (valor == null || !Number.isFinite(valor)) return '';
  return String(Number(valor.toFixed(2)));
}
