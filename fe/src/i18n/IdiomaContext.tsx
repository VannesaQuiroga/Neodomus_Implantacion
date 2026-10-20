// Comparte el idioma seleccionado y la resolución de textos traducidos.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { PF_IDIOMA_KEY } from '@utils/profileStorage';
import { construirT, type Idioma, type TFunc } from './translations';

interface IdiomaContextValue {
  idioma: Idioma;
  setIdioma: (idioma: Idioma) => void;
  t: TFunc;
}

const IdiomaContext = createContext<IdiomaContextValue | null>(null);

// accede a localStorage para conservar o recuperar datos locales.
function idiomaInicial(): Idioma {
  const guardado = localStorage.getItem(PF_IDIOMA_KEY);
  return guardado === 'en' ? 'en' : 'es';
}

// accede a localStorage para conservar o recuperar datos locales.
export const IdiomaProvider = ({ children }: { children: ReactNode }) => {
  const [idioma, setIdiomaState] = useState<Idioma>(idiomaInicial);

  // accede a localStorage para conservar o recuperar datos locales.
  const setIdioma = (nuevo: Idioma) => {
    try {
      localStorage.setItem(PF_IDIOMA_KEY, nuevo);
    } catch {
      // almacenamiento no disponible: continuamos igual
    }
    setIdiomaState(nuevo);
  };

  useEffect(() => {
    document.documentElement.lang = idioma;
  }, [idioma]);

  const value = useMemo<IdiomaContextValue>(
    () => ({ idioma, setIdioma, t: construirT(idioma) }),
    [idioma],
  );

  return <IdiomaContext.Provider value={value}>{children}</IdiomaContext.Provider>;
};

export const useIdioma = (): IdiomaContextValue => {
  const ctx = useContext(IdiomaContext);
  if (!ctx) throw new Error('useIdioma debe usarse dentro de <IdiomaProvider>');
  return ctx;
};