// Interpretación y validación de longitudes en metros (cortes fraccionarios).
// El backend es la autoridad decimal; aquí se interpreta la entrada del usuario
// (hasta 2 decimales) sin redondear silenciosamente valores inválidos.

export interface ResultadoMetros {
  valor: number | null;
  error: string | null;
}

export function parseMetros(entrada: string | number): ResultadoMetros {
  const crudo = String(entrada).trim();
  if (!/^[0-9]+([.,][0-9]{0,2})?$/.test(crudo)) {
    return { valor: null, error: "Cantidad inválida (usa hasta 2 decimales)" };
  }
  const normalizado = crudo.replace(",", ".");
  const n = Number(normalizado);
  if (!Number.isFinite(n)) {
    return { valor: null, error: "Cantidad inválida" };
  }
  if (n <= 0) {
    return { valor: null, error: "La longitud debe ser mayor a cero" };
  }
  return { valor: n, error: null };
}

export function formatMetros(valor: number | null | undefined): string {
  if (valor == null || !Number.isFinite(valor)) return "";
  return String(Number(valor.toFixed(2)));
}
