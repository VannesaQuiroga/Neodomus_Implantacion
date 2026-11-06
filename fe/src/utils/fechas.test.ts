import { describe, expect, it } from 'vitest';
import { esDomingo } from './fechas';

describe('esDomingo', () => {
  it('detecta un domingo', () => {
    expect(esDomingo('2026-11-08')).toBe(true);
  });

  it('no marca de lunes a sábado', () => {
    expect(esDomingo('2026-11-06')).toBe(false);
    expect(esDomingo('2026-11-07')).toBe(false);
  });

  it('ignora valores vacíos o inválidos', () => {
    expect(esDomingo('')).toBe(false);
    expect(esDomingo('no-es-fecha')).toBe(false);
  });
});
