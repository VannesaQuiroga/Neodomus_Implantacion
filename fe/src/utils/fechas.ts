/** Indica si una fecha ISO (YYYY-MM-DD) corresponde a un domingo. */
export const esDomingo = (fechaIso: string): boolean => {
  if (!fechaIso) return false;
  const [anio, mes, dia] = fechaIso.split('-').map(Number);
  if (!anio || !mes || !dia) return false;
  return new Date(anio, mes - 1, dia).getDay() === 0;
};
