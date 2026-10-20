// Funciones compartidas de tecnicosFavoritos usadas por la interfaz.
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@contexts/AuthContext';

// Favoritos de técnicos separados por identidad del cliente.
//  - Visitante:  neodomus_tecnicos_favoritos_visitante
//  - Usuario:    neodomus_tecnicos_favoritos_<correo>
const VISITANTE_KEY = 'neodomus_tecnicos_favoritos_visitante';

const keyPorCorreo = (correo: string) => `neodomus_tecnicos_favoritos_${correo}`;

// accede a localStorage para conservar o recuperar datos locales.
const leerLista = (key: string): number[] => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

// accede a localStorage para conservar o recuperar datos locales.
const guardarLista = (key: string, ids: number[]) => {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* almacenamiento no disponible */
  }
};

const migrarFavoritosA = (correo: string) => {
  const visitante = leerLista(VISITANTE_KEY);
  const propios = leerLista(keyPorCorreo(correo));
  if (visitante.length === 0) return;
  const unidos = [...new Set([...propios, ...visitante])];
  guardarLista(keyPorCorreo(correo), unidos);
  guardarLista(VISITANTE_KEY, []);
};

export const useTecnicosFavoritos = () => {
  const { isAuthenticated, user } = useAuth();
  const correo = isAuthenticated ? user?.correo || '' : '';
  const storageKey = correo ? keyPorCorreo(correo) : VISITANTE_KEY;

  const [favoritos, setFavoritos] = useState<Set<number>>(
    () => new Set(leerLista(storageKey)),
  );

  useEffect(() => {
    if (correo) migrarFavoritosA(correo);
    setFavoritos(new Set(leerLista(correo ? keyPorCorreo(correo) : VISITANTE_KEY)));
  }, [correo]);

  const toggleFavorito = useCallback(
    (idTecnico: number) => {
      setFavoritos((prev) => {
        const next = new Set(prev);
        if (next.has(idTecnico)) next.delete(idTecnico);
        else next.add(idTecnico);
        guardarLista(storageKey, [...next]);
        return next;
      });
    },
    [storageKey],
  );

  const esFavorito = useCallback((id: number) => favoritos.has(id), [favoritos]);

  return { favoritos, esFavorito, toggleFavorito };
};
