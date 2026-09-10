from .auth import router as auth_router
from .users import router as users_router
from .clientes import router as clients_router
from .tecnicos import router as tecnicos_router
from .productos import router as productos_router   # ← asegurar esta línea
from .citas import router as citas_router
from .solicitudes import router as solicitudes_router
from .reports import router as reports_router
from .consultas import router as consultas_router
from .pedidos import router as pedidos_router
from .tarifas import router as tarifas_router
from .calificaciones import router as calificaciones_router
from .notificaciones import router as notificaciones_router
from .especializaciones import router as especializaciones_router
from .reembolsos import router as reembolsos_router
from .devoluciones import router as devoluciones_router
from .novedades import router as novedades_router