"""
Módulo: services/minio_service.py

Cliente centralizado de MinIO (compatible S3) para almacenar las imágenes
del sistema (productos, evidencias). Reemplaza el guardado en disco local
(app/static/...).

El bucket se crea automáticamente en el primer uso y queda con política
pública de lectura, de modo que los navegadores cargan las imágenes por
URL directa: {MINIO_PUBLIC_ENDPOINT}/{MINIO_BUCKET}/{objeto}.
"""

import io
import json
from pathlib import Path

from minio import Minio
from minio.error import S3Error

from app.config import settings

CONTENT_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".pdf": "application/pdf",
}


def _cliente() -> Minio:
    """Cliente único de MinIO; crea el bucket público-lectura si no existe."""
    global _client
    if _client is None:
        _client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )
        _asegurar_bucket(_client)
    return _client


_client: Minio | None = None

# Cliente del bucket PRIVADO (evidencias). Nunca recibe política de lectura
# pública: el acceso se hace únicamente por el backend con credenciales.
_client_privado: Minio | None = None

# Marcador explícito de una referencia PRIVADA nueva. Distingue de forma
# inequívoca las referencias nuevas (privado:{clave}) de las heredadas (URL
# pública o clave simple en el bucket público).
PRIVATE_PREFIX = "privado:"


def _asegurar_bucket_privado(client: Minio) -> None:
    bucket = settings.MINIO_PRIVATE_BUCKET
    try:
        if not client.bucket_exists(bucket):
            client.make_bucket(bucket)
        # Intencionalmente SIN set_bucket_policy: bucket privado por defecto.
    except S3Error as e:
        raise RuntimeError(
            f"No se pudo preparar el bucket privado MinIO '{bucket}' en "
            f"{settings.MINIO_ENDPOINT}: {e}"
        ) from e


def _cliente_privado() -> Minio:
    """Cliente del bucket privado (evidencias); lo crea si no existe (sin
    política pública)."""
    global _client_privado
    if _client_privado is None:
        _client_privado = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )
        _asegurar_bucket_privado(_client_privado)
    return _client_privado


def subir_imagen_privada(carpeta: str, nombre_archivo: str, contenido: bytes) -> str:
    """Sube un archivo al bucket PRIVADO y devuelve una referencia marcada
    ``privado:{clave}`` (sin URL pública y con origen explícito)."""
    cliente = _cliente_privado()
    objeto = f"{carpeta.strip('/')}/{nombre_archivo}"
    ext = Path(nombre_archivo).suffix.lower()
    cliente.put_object(
        settings.MINIO_PRIVATE_BUCKET,
        objeto,
        io.BytesIO(contenido),
        length=len(contenido),
        content_type=CONTENT_TYPES.get(ext, "application/octet-stream"),
    )
    return f"{PRIVATE_PREFIX}{objeto}"


def leer_objeto_privado(objeto: str) -> bytes:
    """Lee un objeto del bucket PRIVADO (solo backend autorizado).

    Lanza ``FileNotFoundError`` únicamente si el objeto no existe (NoSuchKey);
    cualquier otro error (permisos, conexión) se propaga sin disfrazarse de
    "archivo heredado".
    """
    cliente = _cliente_privado()
    try:
        resp = cliente.get_object(settings.MINIO_PRIVATE_BUCKET, objeto)
    except S3Error as e:
        if getattr(e, "code", None) == "NoSuchKey":
            raise FileNotFoundError(objeto) from e
        raise
    try:
        return resp.read()
    finally:
        resp.close()
        resp.release_conn()


def leer_objeto_publico(objeto: str) -> bytes:
    """Lee un objeto del bucket PÚBLICO (solo para archivos heredados)."""
    cliente = _cliente()
    try:
        resp = cliente.get_object(settings.MINIO_BUCKET, objeto)
    except S3Error as e:
        if getattr(e, "code", None) == "NoSuchKey":
            raise FileNotFoundError(objeto) from e
        raise
    try:
        return resp.read()
    finally:
        resp.close()
        resp.release_conn()


def eliminar_objeto_privado(ref: str) -> None:
    clave = ref[len(PRIVATE_PREFIX):] if ref.startswith(PRIVATE_PREFIX) else ref
    try:
        _cliente_privado().remove_object(settings.MINIO_PRIVATE_BUCKET, clave)
    except Exception:
        pass


def _clave_desde_referencia(ref: str) -> str:
    """Normaliza una referencia a su clave de objeto.

    Acepta una URL pública heredada (``http://.../{bucket}/{clave}``) o una clave
    simple. Las referencias privadas marcadas (``privado:``) se resuelven aparte.
    """
    if ref.startswith("http"):
        for bucket in (settings.MINIO_BUCKET, settings.MINIO_PRIVATE_BUCKET):
            marca = f"/{bucket}/"
            if marca in ref:
                return ref.split(marca, 1)[1]
    return ref


def leer_archivo(url_archivo: str) -> tuple[bytes, str]:
    """Lee un archivo según su referencia y devuelve (bytes, media_type).

    - ``privado:{clave}`` (nueva): solo bucket privado. Si la clave no existe,
      devuelve ausencia controlada; NO busca un objeto público homónimo.
    - URL pública o clave simple (heredada): bucket público, previa autorización.
    Los errores de permisos/conexión se propagan sin activar retrocesos.
    """
    import mimetypes

    if url_archivo.startswith(PRIVATE_PREFIX):
        clave = url_archivo[len(PRIVATE_PREFIX):]
        data = leer_objeto_privado(clave)
    else:
        clave = _clave_desde_referencia(url_archivo)
        data = leer_objeto_publico(clave)
    media = mimetypes.guess_type(clave)[0] or "application/octet-stream"
    return data, media


def _asegurar_bucket(client: Minio) -> None:
    bucket = settings.MINIO_BUCKET
    try:
        if not client.bucket_exists(bucket):
            client.make_bucket(bucket)
        politica = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": {"AWS": ["*"]},
                    "Action": ["s3:GetObject"],
                    "Resource": [f"arn:aws:s3:::{bucket}/*"],
                }
            ],
        }
        client.set_bucket_policy(bucket, json.dumps(politica))
    except S3Error as e:
        raise RuntimeError(
            f"No se pudo preparar el bucket MinIO '{bucket}' en {settings.MINIO_ENDPOINT}: {e}"
        ) from e


def url_publica(objeto: str) -> str:
    """URL pública de un objeto del bucket (para <img src=...>)."""
    return f"{settings.MINIO_PUBLIC_ENDPOINT}/{settings.MINIO_BUCKET}/{objeto}"


def subir_imagen(carpeta: str, nombre_archivo: str, contenido: bytes) -> str:
    """Sube un archivo al bucket bajo '{carpeta}/{nombre_archivo}' y devuelve su URL pública."""
    cliente = _cliente()
    objeto = f"{carpeta.strip('/')}/{nombre_archivo}"
    ext = Path(nombre_archivo).suffix.lower()
    try:
        cliente.put_object(
            settings.MINIO_BUCKET,
            objeto,
            io.BytesIO(contenido),
            length=len(contenido),
            content_type=CONTENT_TYPES.get(ext, "application/octet-stream"),
        )
    except S3Error as e:
        raise RuntimeError(f"Error subiendo '{objeto}' a MinIO: {e}") from e
    return url_publica(objeto)


def eliminar_objeto(objeto: str) -> None:
    """Elimina un objeto del bucket (ignora errores para no bloquear la operación)."""
    try:
        _cliente().remove_object(settings.MINIO_BUCKET, objeto)
    except Exception:
        pass


def eliminar_imagen_producto(imagen_url: str) -> None:
    """Elimina del bucket la imagen de producto apuntada por su URL pública."""
    prefijo = f"{settings.MINIO_PUBLIC_ENDPOINT}/{settings.MINIO_BUCKET}/"
    if imagen_url and imagen_url.startswith(prefijo):
        eliminar_objeto(imagen_url[len(prefijo):])
