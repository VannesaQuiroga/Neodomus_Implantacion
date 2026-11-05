import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { construirT, TRADUCCIONES } from './translations';

describe('Traducciones de gestión de pedidos', () => {
  const source = readFileSync('src/pages/admin/AdminPedidos.tsx', 'utf8');
  const keys = [...new Set([...source.matchAll(/t\('(adm\.pedidos\.[^']+)'/g)].map(match => match[1]))];
  it.each(['es', 'en'])('resuelve todas las claves utilizadas en %s', (language) => {
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(TRADUCCIONES[key]?.[language], key).toBeTruthy();
      expect(construirT(language)(key)).not.toBe(key);
    }
  });
});
