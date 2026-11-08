FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

WORKDIR /app

RUN useradd -m -u 1000 appuser

COPY pyproject.toml uv.lock* ./

COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini ./

# --locked: respeta uv.lock; --no-build evita ejecutar backends de build de
# dependencias; --no-build-isolation conserva el entorno de build controlado.
RUN uv sync --no-dev --locked --no-build --no-build-isolation --no-install-project



EXPOSE 8000

CMD ["sh", "-c", "uv run alembic upgrade head && exec uv run uvicorn app.main:app --host 0.0.0.0 --port 8000"]
