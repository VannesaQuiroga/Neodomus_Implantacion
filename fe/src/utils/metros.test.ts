// Pruebas de interpretación/validación de longitudes en metros (web).
import { describe, it, expect } from 'vitest';
import { parseMetros, formatMetros } from './metros';

describe('parseMetros', () => {
  it('acepta fracciones con punto y coma', () => {
    expect(parseMetros('1.5').valor).toBe(1.5);
    expect(parseMetros('0.5').valor).toBe(0.5);
    expect(parseMetros('1,5').valor).toBe(1.5);
  });

  it('admite hasta dos decimales exactos', () => {
    expect(parseMetros('1.55').valor).toBe(1.55);
    expect(parseMetros('10.25').valor).toBe(10.25);
  });

  it('rechaza más de dos decimales sin redondear', () => {
    expect(parseMetros('1.555').error).not.toBeNull();
    expect(parseMetros('1.555').valor).toBeNull();
  });

  it('rechaza cero, negativos, no numéricos y separadores ambiguos', () => {
    expect(parseMetros('0').error).not.toBeNull();
    expect(parseMetros('-1').error).not.toBeNull();
    expect(parseMetros('abc').error).not.toBeNull();
    expect(parseMetros('1.5.5').error).not.toBeNull();
  });

  it('resuelve un separador final sin decimales (estado temporal)', () => {
    expect(parseMetros('1,').valor).toBe(1);
  });
});

describe('formatMetros', () => {
  it('formatea sin residuos de precisión', () => {
    expect(formatMetros(1.5)).toBe('1.5');
    expect(formatMetros(0.5)).toBe('0.5');
    expect(formatMetros(10)).toBe('10');
    expect(formatMetros(null)).toBe('');
  });
});
