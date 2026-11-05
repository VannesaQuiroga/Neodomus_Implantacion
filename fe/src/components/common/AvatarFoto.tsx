import { useEffect, useState } from 'react';

interface Props {
  src: string | null | undefined;
  iniciales: string;
  alt?: string;
  className?: string;
}

// Muestra iniciales con la foto superpuesta. Si la foto falta o falla al cargar
// quedan las iniciales; al recibir una URL nueva (p. ej. reemplazo) se recupera
// automáticamente mostrando la imagen.
export function AvatarFoto({ src, iniciales, alt = '', className = 'ap-initials' }: Props) {
  const [rota, setRota] = useState(false);

  useEffect(() => {
    setRota(false);
  }, [src]);

  return (
    <span className={className} style={{ position: 'relative', overflow: 'hidden' }}>
      {iniciales}
      {src && !rota && (
        <img
          src={src}
          alt={alt}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setRota(true)}
        />
      )}
    </span>
  );
}
