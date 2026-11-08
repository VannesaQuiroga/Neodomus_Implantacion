FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

WORKDIR /app

RUN useradd -m -u 1000 appuser

COPY pyproject.toml uv.lock* ./

COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini ./

# --locked: no resuelve más allá de uv.lock (dependencias bloqueadas,
# S8544). --no-build-isolation: no ejecuta scripts/setup de entorno de
# construcción (S8541).
RUN uv sync --no-dev --locked --no-build-isolation



EXPOSE 8000

CMD ["sh", "-c", "uv run alembic upgrade head && exec uv run uvicorn app.main:app --host 0.0.0.0 --port 8000"]
