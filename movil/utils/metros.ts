// Interpretación y validación de longitudes en metros (cortes fraccionarios).
// El backend es la autoridad decimal; aquí se interpreta la entrada del usuario
// (hasta 2 decimales) sin redondear silenciosamente valores inválidos.

// ── Reglas del metraje comercial (PEN-08) ───────────────────────────────────
// El selector ofrece cortes en pasos de 0,5 m limitados por la disponibilidad
// real. Internamente se trabaja en UNIDADES ENTERAS de medio metro
// (pasos = floor(max × 2)) para evitar aritmética fraccionaria; ×2 es exacto
// en IEEE-754 (potencia de dos), así que nunca se pierde el corte por redondeo.

/** Paso comercial del metraje: medio metro. */
export const PASO_METROS = 0.5;

/** Unidades enteras de 0,5 m comprables para un máximo disponible.
 *  Ej.: 3,2 m → 6 pasos (máx. seleccionable 3,0 m); 0,4 m → 0 pasos. */
export function pasosMetraje(maxMetros: number | null | undefined): number {
  const n = Number(maxMetros);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(0, Math.floor(n * 2));
}

/** Opciones de metraje en incrementos de 0,5 m hasta el máximo disponible.
 *  Ej.: 3,2 m → [0.5, 1, 1.5, 2, 2.5, 3]; 0,4 m → [] (sin metraje disponible). */
export function opcionesMetraje(maxMetros: number | null | undefined): number[] {
  const pasos = pasosMetraje(maxMetros);
  return Array.from({ length: pasos }, (_paso, indice) => (indice + 1) / 2);
}

/** Máximo metraje seleccionable (múltiplo exacto de 0,5 m); 0 si no alcanza 0,5 m. */
export function maxMetrajePermitido(maxMetros: number | null | undefined): number {
  return pasosMetraje(maxMetros) / 2;
}

/** ¿Es un corte válido: mayor que 0, múltiplo de 0,5 m y dentro del disponible?
 *  No redondea ni corrige: solo responde (los errores se comunican en la UI). */
export function esMetrajeValido(
  valor: number,
  maxMetros: number | null | undefined,
): boolean {
  if (!Number.isFinite(valor) || valor <= 0) return false;
  const solicitados = valor * 2;
  if (!Number.isInteger(solicitados)) return false;
  return solicitados <= pasosMetraje(maxMetros);
}

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
