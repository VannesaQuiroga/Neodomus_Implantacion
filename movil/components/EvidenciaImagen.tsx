// Miniatura de evidencia autenticada: descarga la imagen con el header de
// autorización y la muestra. Evita exponer el token en la URL y libera el estado
// al desmontar (ver useImagenAutenticada).
import { Image, type ImageStyle, type StyleProp } from "react-native";

import { useImagenAutenticada } from "@/hooks/useAuthImage";

export default function EvidenciaImagen({
  url,
  estilo,
}: {
  url: string;
  estilo?: StyleProp<ImageStyle>;
}) {
  const { uri, error } = useImagenAutenticada(url);
  if (error || !uri) return null;
  return <Image source={{ uri }} style={estilo} />;
}
