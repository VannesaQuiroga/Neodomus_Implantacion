"""
Módulo: utils/imagenes.py

Validación REAL del contenido de imágenes de perfil compartida por clientes y
empleados: solo formatos raster JPEG/PNG/WEBP, tamaño ≤ 5 MB y dimensiones
≤ 8000×8000. No confía en content_type ni en la extensión declarada
(verificando con Pillow qué envía el navegador), evitando subidas corruptas o
archivos disfrazados (HTML/SVG) como imagen.
"""

import io
from pathlib import Path

from fastapi import HTTPException
from fastapi import UploadFile

FORMATOS_PERMITIDOS = {".jpg": "JPEG", ".jpeg": "JPEG", ".png": "PNG", ".webp": "WEBP"}
TAMANIO_MAXIMO_BYTES = 5 * 1024 * 1024
DIMENSION_MAXIMA_PX = 8000


async def validar_imagen_perfil(archivo: UploadFile) -> tuple[bytes, str]:
    """Lee el archivo y valida su contenido real. Devuelve (bytes, extensión);
    ante cualquier incumplimiento responde 400 con un mensaje claro para la UI."""
    import io

    from PIL import Image

    if not archivo or not archivo.filename:
        raise HTTPException(status_code=400, detail="Selecciona un archivo de imagen")

    ext = Path(archivo.filename or "").suffix.lower()
    if ext not in FORMATOS_PERMITIDOS:
        raise HTTPException(status_code=400, detail="Formato no permitido (usa JPG, PNG o WEBP)")

    contenido = await archivo.read()
    if not contenido:
        raise HTTPException(status_code=400, detail="El archivo está vacío")
    if len(contenido) > TAMANIO_MAXIMO_BYTES:
        raise HTTPException(status_code=400, detail="La imagen no puede superar 5 MB")

    # Verificación real del contenido: integridad y formato raster.
    try:
        with Image.open(io.BytesIO(contenido)) as img:
            img.verify()
    except Exception:
        raise HTTPException(status_code=400, detail="El archivo no es una imagen válida")

    try:
        with Image.open(io.BytesIO(contenido)) as img:
            contenido_formato = (img.format or "").upper()
            ancho, alto = img.size
    except Exception:
        raise HTTPException(status_code=400, detail="El archivo no es una imagen válida")

    if contenido_formato != FORMATOS_PERMITIDOS[ext]:
        raise HTTPException(status_code=400, detail="La extensión no coincide con el contenido real")
    if ancho <= 0 or alto <= 0 or ancho > DIMENSION_MAXIMA_PX or alto > DIMENSION_MAXIMA_PX:
        raise HTTPException(status_code=400, detail="Dimensiones de imagen no permitidas")

    return contenido, ext
