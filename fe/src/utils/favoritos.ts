// Funciones compartidas de favoritos usadas por la interfaz.
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@contexts/AuthContext';

// Favoritos separados por identidad:
//  - Visitante:  neodomus_favoritos_visitante
//  - Usuario:    neodomus_favoritos_<correo>
const VISITANTE_KEY = 'neodomus_favoritos_visitante';

const keyPorCorreo = (correo: string) => `neodomus_favoritos_${correo}`;

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
    // Almacenamiento no disponible: la interacción sigue siendo visual
  }
};

// Al autenticarse, asocia los favoritos del visitante a la cuenta del usuario
// (sin duplicados) y limpia el estado temporal del visitante.
const migrarFavoritosA = (correo: string) => {
  const visitante = leerLista(VISITANTE_KEY);
  const propios = leerLista(keyPorCorreo(correo));
  if (visitante.length === 0) return;
  const unidos = [...new Set([...propios, ...visitante])];
  guardarLista(keyPorCorreo(correo), unidos);
  guardarLista(VISITANTE_KEY, []);
};

export const useFavoritos = () => {
  const { isAuthenticated, user } = useAuth();
  const correo = isAuthenticated ? (user?.correo || '') : '';
  const storageKey = correo ? keyPorCorreo(correo) : VISITANTE_KEY;

  const [favoritos, setFavoritos] = useState<Set<number>>(() => new Set(leerLista(storageKey)));

  // Cuando cambia la identidad (login/logout) se recarga el estado correcto.
  // Al iniciar sesión se migran los favoritos del visitante a la cuenta.
  useEffect(() => {
    if (correo) migrarFavoritosA(correo);
    setFavoritos(new Set(leerLista(correo ? keyPorCorreo(correo) : VISITANTE_KEY)));
  }, [correo]);

  const toggleFavorito = useCallback(
    (id: number) => {
      setFavoritos((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        guardarLista(storageKey, [...next]);
        return next;
      });
    },
    [storageKey]
  );

  const quitarFavorito = useCallback(
    (id: number) => {
      setFavoritos((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        guardarLista(storageKey, [...next]);
        return next;
      });
    },
    [storageKey]
  );

  const esFavorito = useCallback((id: number) => favoritos.has(id), [favoritos]);

  return { favoritos, esFavorito, toggleFavorito, quitarFavorito };
};