// Carga una imagen autenticada (evidencia) como data-URI para poder mostrarla
// en <Image>. Las evidencias se sirven por rutas protegidas; <Image source={{uri}}>
// no adjunta el header Authorization, así que se descarga con fetch autenticado
// y se convierte a base64 (sin token en la URL).
import { useEffect, useState } from "react";

import { API_BASE_URL } from "@/constants/api";
import { obtenerSesion } from "@/services/storage";

export async function fetchImagenAutenticada(url: string): Promise<string> {
  const sesion = await obtenerSesion();
  const destino = url.startsWith("http") ? url : `${API_BASE_URL}${url}`;
  const respuesta = await fetch(destino, {
    headers: sesion ? { Authorization: `Bearer ${sesion.accessToken}` } : {},
  });
  if (!respuesta.ok) {
    throw new Error(`HTTP ${respuesta.status}`);
  }
  const blob = await respuesta.blob();
  return await new Promise<string>((resolve, reject) => {
    const lector = new FileReader();
    lector.onloadend = () => resolve(lector.result as string);
    lector.onerror = () => reject(new Error("No se pudo leer la evidencia"));
    lector.readAsDataURL(blob);
  });
}

interface EstadoImagenAutenticada {
  uri: string | null;
  loading: boolean;
  error: boolean;
}

export function useImagenAutenticada(url: string | null | undefined): EstadoImagenAutenticada {
  const [estado, setEstado] = useState<EstadoImagenAutenticada>({
    uri: null,
    loading: false,
    error: false,
  });

  useEffect(() => {
    if (!url) {
      setEstado({ uri: null, loading: false, error: false });
      return;
    }
    let activo = true;
    setEstado({ uri: null, loading: true, error: false });
    fetchImagenAutenticada(url)
      .then((uri) => {
        if (activo) setEstado({ uri, loading: false, error: false });
      })
      .catch(() => {
        if (activo) setEstado({ uri: null, loading: false, error: true });
      });
    return () => {
      activo = false;
    };
  }, [url]);

  return estado;
}
