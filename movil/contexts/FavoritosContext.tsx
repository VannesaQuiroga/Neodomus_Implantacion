// ─────────────────────────────────────────────────────────────
// Favoritos — réplica del comportamiento de la WEB (utils/favoritos.ts).
//
// La WEB NO tiene endpoints de favoritos: son 100% cliente.
// - Visitante: clave 'neodomus_favoritos_visitante'
// - Usuario:   clave 'neodomus_favoritos_<correo>'
// - Al iniciar sesión, migrarFavoritosA(correo) une sin duplicados y
//   vacía la lista del visitante (igual que la web).
// - Al cerrar sesión se vuelve a la lista del visitante (vacía tras migrar).
// ─────────────────────────────────────────────────────────────

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import AsyncStorage from "@react-native-async-storage/async-storage";

const CLAVE_VISITANTE = "neodomus_favoritos_visitante";
const clavePorCorreo = (correo: string) => `neodomus_favoritos_${correo}`;

interface FavoritosContextValue {
  favoritos: Set<number>;
  esFavorito: (idProducto: number) => boolean;
  toggleFavorito: (idProducto: number) => void;
  quitarFavorito: (idProducto: number) => void;
}

const FavoritosContext = createContext<FavoritosContextValue | null>(null);

// accede a AsyncStorage para conservar o recuperar datos locales.
async function cargarClave(clave: string): Promise<Set<number>> {
  try {
    const crudo = await AsyncStorage.getItem(clave);
    const lista: unknown = crudo ? JSON.parse(crudo) : [];
    if (!Array.isArray(lista)) return new Set();
    return new Set(lista.filter((v): v is number => typeof v === "number"));
  } catch {
    return new Set();
  }
}

// accede a AsyncStorage para conservar o recuperar datos locales.
export function FavoritosProvider({
  correoUsuario,
  children,
}: {
  correoUsuario: string | null;
  children: React.ReactNode;
}) {
  const [favoritos, setFavoritos] = useState<Set<number>>(new Set());

  // Cargar la lista correspondiente a la identidad actual.
  useEffect(() => {
    let activo = true;
    cargarClave(correoUsuario ? clavePorCorreo(correoUsuario) : CLAVE_VISITANTE)
      .then((lista) => {
        if (activo) setFavoritos(lista);
      });
    return () => {
      activo = false;
    };
  }, [correoUsuario]);

  const persistir = useCallback(
    async (nueva: Set<number>) => {
      setFavoritos(nueva);
      const clave = correoUsuario ? clavePorCorreo(correoUsuario) : CLAVE_VISITANTE;
      try {
        await AsyncStorage.setItem(clave, JSON.stringify([...nueva]));
      } catch {
        // Sin persistencia no rompemos la UX; la lista vive en memoria.
      }
    },
    [correoUsuario],
  );

  const toggleFavorito = useCallback(
    (idProducto: number) => {
      const nueva = new Set(favoritos);
      if (nueva.has(idProducto)) {
        nueva.delete(idProducto);
      } else {
        nueva.add(idProducto);
      }
      void persistir(nueva);
    },
    [favoritos, persistir],
  );

  const quitarFavorito = useCallback(
    (idProducto: number) => {
      if (!favoritos.has(idProducto)) return;
      const nueva = new Set(favoritos);
      nueva.delete(idProducto);
      void persistir(nueva);
    },
    [favoritos, persistir],
  );

  /**
   * Migra los favoritos del visitante a la cuenta al iniciar sesión
   * (une sin duplicados y vacía la lista del visitante). Igual que la WEB.
   */
  useEffect(() => {
    if (!correoUsuario) return;
    let activo = true;

    (async () => {
      try {
        const visitante = await AsyncStorage.getItem(CLAVE_VISITANTE);
        if (!visitante) return;
        const listaVisitante: unknown = JSON.parse(visitante);
        if (!Array.isArray(listaVisitante) || listaVisitante.length === 0) return;

        const cuenta = await cargarClave(clavePorCorreo(correoUsuario));
        for (const id of listaVisitante) {
          if (typeof id === "number") cuenta.add(id);
        }

        await AsyncStorage.setItem(
          clavePorCorreo(correoUsuario),
          JSON.stringify([...cuenta]),
        );
        await AsyncStorage.removeItem(CLAVE_VISITANTE);

        if (activo) setFavoritos(cuenta);
      } catch {
        // Si falla la migración, los favoritos del visitante simplemente no viajan.
      }
    })();

    return () => {
      activo = false;
    };
  }, [correoUsuario]);

  const valor = useMemo<FavoritosContextValue>(
    () => ({
      favoritos,
      esFavorito: (id) => favoritos.has(id),
      toggleFavorito,
      quitarFavorito,
    }),
    [favoritos, toggleFavorito, quitarFavorito],
  );

  return (
    <FavoritosContext.Provider value={valor}>
      {children}
    </FavoritosContext.Provider>
  );
}

export function useFavoritos(): FavoritosContextValue {
  const contexto = useContext(FavoritosContext);
  if (!contexto) {
    throw new Error("useFavoritos debe usarse dentro de <FavoritosProvider>");
  }
  return contexto;
}
