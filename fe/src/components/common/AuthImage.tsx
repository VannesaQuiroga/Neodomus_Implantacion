// Componente <img> autenticado que descarga la evidencia vía blob y permite
// abrirla en tamaño completo (lightbox) sin exponer el token en la URL.
// Gestiona estados de carga y error y libera el object URL al desmontar.
import React, { useState } from 'react';
import { useAuthImage } from '../../hooks/useAuthImage';

interface AuthImageProps {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  /** Si es true, al hacer clic se abre la imagen en tamaño completo. */
  ampliable?: boolean;
}

export default function AuthImage({ src, alt, className, style, ampliable = true }: AuthImageProps) {
  const { objectUrl, loading, error } = useAuthImage(src);
  const [abierta, setAbierta] = useState(false);

  if (loading) {
    return <div className={className} style={style} aria-label="Cargando evidencia" />;
  }
  if (error || !objectUrl) {
    return (
      <div
        className={className}
        style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}
        aria-label="Evidencia no disponible"
      >
        No disponible
      </div>
    );
  }

  return (
    <>
      <img
        src={objectUrl}
        alt={alt || 'Evidencia'}
        className={className}
        style={{ ...style, cursor: ampliable ? 'pointer' : undefined }}
        onClick={ampliable ? () => setAbierta(true) : undefined}
      />
      {ampliable && abierta && (
        <div
          onClick={() => setAbierta(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Evidencia ampliada"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            cursor: 'zoom-out',
          }}
        >
          <img
            src={objectUrl}
            alt={alt || 'Evidencia'}
            style={{ maxWidth: '92vw', maxHeight: '92vh', objectFit: 'contain' }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
