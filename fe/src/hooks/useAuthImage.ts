// Carga una imagen autenticada (evidencia) convirtiendo la respuesta en un
// object URL temporal. Las evidencias se sirven por rutas protegidas que exigen
// el header Authorization; un <img src> no lo envía, por eso se descarga con el
// cliente autenticado y se muestra desde un blob (sin token en la URL).
import { useEffect, useRef, useState } from 'react';
import api from '../services/api';

interface AuthImageState {
  objectUrl: string | null;
  loading: boolean;
  error: boolean;
}

// Descarga la imagen (blob) y crea un object URL. Devuelve null en error.
export async function fetchAuthImageBlob(src: string): Promise<string | null> {
  const res = await api.get(src, { responseType: 'blob' });
  const blob = res.data instanceof Blob ? res.data : new Blob([res.data]);
  return URL.createObjectURL(blob);
}

export function useAuthImage(src: string | null | undefined): AuthImageState {
  const [state, setState] = useState<AuthImageState>({
    objectUrl: null,
    loading: false,
    error: false,
  });
  // Generación de sesión: al invalidarse la sesión (logout/expiración), se
  // retira la evidencia anterior y se impide que una descarga pendiente de la
  // cuenta previa vuelva a mostrarse.
  const [sessionGen, setSessionGen] = useState(0);
  const [sesionInvalidada, setSesionInvalidada] = useState(false);
  const generacion = useRef(0);

  useEffect(() => {
    const onSesionInvalidada = () => {
      generacion.current += 1;
      setSesionInvalidada(true);
    };
    const onSesionIniciada = () => {
      generacion.current += 1;
      setSesionInvalidada(false);
      setSessionGen((g) => g + 1);
    };
    window.addEventListener('neodomus:sesion-expirada', onSesionInvalidada);
    window.addEventListener('neodomus:sesion-iniciada', onSesionIniciada);
    return () => {
      window.removeEventListener('neodomus:sesion-expirada', onSesionInvalidada);
      window.removeEventListener('neodomus:sesion-iniciada', onSesionIniciada);
    };
  }, []);

  useEffect(() => {
    // No descargar de nuevo tras un 401 definitivo: el interceptor podría
    // volver a emitir expiración y crear un ciclo de solicitudes.
    if (!src || sesionInvalidada) {
      setState({ objectUrl: null, loading: false, error: false });
      return;
    }
    let objectUrl: string | null = null;
    let activo = true;
    const generacionDescarga = generacion.current;

    setState({ objectUrl: null, loading: true, error: false });
    fetchAuthImageBlob(src)
      .then((url) => {
        if (!activo || generacionDescarga !== generacion.current) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setState({ objectUrl: url, loading: false, error: false });
      })
      .catch(() => {
        // 401 lo gestiona el interceptor de api (renovación/cierre de sesión).
        if (activo && generacionDescarga === generacion.current) {
          setState({ objectUrl: null, loading: false, error: true });
        }
      });

    // Limpieza: al cambiar de src, invalidar sesión o desmontar, se libera el
    // object URL temporal y se descarta la descarga pendiente.
    return () => {
      activo = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, sessionGen, sesionInvalidada]);

  return sesionInvalidada ? { objectUrl: null, loading: false, error: false } : state;
}
