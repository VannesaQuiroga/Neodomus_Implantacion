import os
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

# Importar middlewares desde la nueva carpeta
from app.middleware import setup_cors, setup_rate_limit, setup_security_headers


@asynccontextmanager
async def lifespan(_app: FastAPI):
    from app.services.scheduler import detener_scheduler, iniciar_scheduler

    iniciar_scheduler()
    yield
    detener_scheduler()

# Importar routers
from app.routers import (
    auth_router,
    users_router,
    clients_router,
    tecnicos_router,
    productos_router,
    citas_router,
    solicitudes_router,
    reports_router,
    consultas_router,
    pedidos_router,
    tarifas_router,
    calificaciones_router,
    notificaciones_router,
    especializaciones_router,
    reembolsos_router,
    devoluciones_router,
    novedades_router,
)

# Crear la aplicación FastAPI (con scheduler de tareas en segundo plano)
app = FastAPI(
    title="Neodomus API",
    description="API para sistema de gestión de domótica",
    version="1.0.0",
    lifespan=lifespan,
)

# Configurar middlewares
setup_cors(app)
setup_rate_limit(app)
setup_security_headers(app)

# Incluir routers con prefijo /api/v1
app.include_router(auth_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(clients_router, prefix="/api/v1")
app.include_router(tecnicos_router, prefix="/api/v1")
app.include_router(productos_router, prefix="/api/v1")
app.include_router(citas_router, prefix="/api/v1")
app.include_router(solicitudes_router, prefix="/api/v1")
app.include_router(reports_router, prefix="/api/v1")
app.include_router(consultas_router, prefix="/api/v1")
app.include_router(pedidos_router, prefix="/api/v1")
app.include_router(tarifas_router, prefix="/api/v1")
app.include_router(calificaciones_router, prefix="/api/v1")
app.include_router(notificaciones_router, prefix="/api/v1")
app.include_router(especializaciones_router, prefix="/api/v1")
app.include_router(reembolsos_router, prefix="/api/v1")
app.include_router(devoluciones_router, prefix="/api/v1")
app.include_router(novedades_router, prefix="/api/v1")

# Imágenes subidas (productos) servidas desde /uploads
PRODUCTOS_IMG_DIR = Path(__file__).resolve().parent / "static" / "productos"
PRODUCTOS_IMG_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=PRODUCTOS_IMG_DIR), name="uploads")

# Evidencias de trabajo de los técnicos servidas desde /evidencias
EVIDENCIAS_DIR = Path(__file__).resolve().parent / "static" / "evidencias"
EVIDENCIAS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/evidencias", StaticFiles(directory=EVIDENCIAS_DIR), name="evidencias")

# Endpoint de prueba
@app.get("/")
def root():
    return {"message": "Neodomus API funcionando"}

@app.get("/health")
def health_check():
    return {"status": "ok"}

# Manejador de excepciones genéricas
@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    import logging
    logging.exception("Unhandled exception")
    return JSONResponse(
        status_code=500,
        content={"detail": "Error interno del servidor"},
    )

# Ejecución directa (opcional)
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)