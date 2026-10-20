// Normaliza nombres para mostrarlos con iniciales en mayúscula y espacios uniformes.
export const tituloNombre = (valor: string | null | undefined): string => {
  if (!valor) return '';
  return valor
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((palabra) => palabra.charAt(0).toUpperCase() + palabra.slice(1))
    .join(' ');
};

export const nombreCompleto = (
  first_name: string | null | undefined,
  last_name: string | null | undefined,
): string => {
  return tituloNombre(`${first_name ?? ''} ${last_name ?? ''}`.trim());
};