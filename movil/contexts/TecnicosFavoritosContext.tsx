// ─────────────────────────────────────────────────────────────
// Favoritos de TÉCNICOS — réplica del comportamiento de la WEB
// (utils/tecnicosFavoritos.ts). 100% cliente, sin backend.
//
// - Visitante: clave 'neodomus_tecnicos_favoritos_visitante'
// - Usuario:   clave 'neodomus_tecnicos_favoritos_<correo>'
// - Al iniciar sesión, migrarFavoritosA(correo) une sin duplicados y
//   vacía la lista del visitante (igual que la web).
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

const CLAVE_VISITANTE = "neodomus_tecnicos_favoritos_visitante";
const clavePorCorreo = (correo: string) => `neodomus_tecnicos_favoritos_${correo}`;

interface TecnicosFavoritosContextValue {
  favoritosTecnicos: Set<number>;
  esFavoritoTecnico: (idTecnico: number) => boolean;
  toggleFavoritoTecnico: (idTecnico: number) => void;
  quitarFavoritoTecnico: (idTecnico: number) => void;
}

const TecnicosFavoritosContext = createContext<TecnicosFavoritosContextValue | null>(null);

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
export function TecnicosFavoritosProvider({
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
    cargarClave(correoUsuario ? clavePorCorreo(correoUsuario) : CLAVE_VISITANTE).then((lista) => {
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

  const toggleFavoritoTecnico = useCallback(
    (idTecnico: number) => {
      const nueva = new Set(favoritos);
      if (nueva.has(idTecnico)) {
        nueva.delete(idTecnico);
      } else {
        nueva.add(idTecnico);
      }
      void persistir(nueva);
    },
    [favoritos, persistir],
  );

  const quitarFavoritoTecnico = useCallback(
    (idTecnico: number) => {
      if (!favoritos.has(idTecnico)) return;
      const nueva = new Set(favoritos);
      nueva.delete(idTecnico);
      void persistir(nueva);
    },
    [favoritos, persistir],
  );

  // Migración visitante → cuenta al iniciar sesión (igual que web)
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
        await AsyncStorage.setItem(clavePorCorreo(correoUsuario), JSON.stringify([...cuenta]));
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

  const valor = useMemo<TecnicosFavoritosContextValue>(
    () => ({
      favoritosTecnicos: favoritos,
      esFavoritoTecnico: (id) => favoritos.has(id),
      toggleFavoritoTecnico,
      quitarFavoritoTecnico,
    }),
    [favoritos, toggleFavoritoTecnico, quitarFavoritoTecnico],
  );

  return (
    <TecnicosFavoritosContext.Provider value={valor}>{children}</TecnicosFavoritosContext.Provider>
  );
}

export function useTecnicosFavoritos(): TecnicosFavoritosContextValue {
  const contexto = useContext(TecnicosFavoritosContext);
  if (!contexto) {
    throw new Error("useTecnicosFavoritos debe usarse dentro de <TecnicosFavoritosProvider>");
  }
  return contexto;
}
