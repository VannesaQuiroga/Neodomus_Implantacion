# Referencia de API NeoDomus

**Revisada:** 30 de octubre de 2026. Esta página reemplaza la tabla de endpoints antigua, que contenía rutas y métodos de pago no coincidentes con el código actual.

## Base y documentación interactiva

- Prefijo de routers: `/api/v1` (ver `be/app/main.py`).
- En desarrollo, FastAPI expone OpenAPI/Swagger en `/docs` y ReDoc en `/redoc` por configuración predeterminada. No se verificó su disponibilidad en producción.
- La web toma su URL de `VITE_API_URL` (predeterminado en el cliente: `http://localhost:8000/api/v1`). Móvil usa `EXPO_PUBLIC_API_URL` y agrega `/api/v1`.
- No se encontró una URL de producción confirmada para publicar como Base URL.

## Routers registrados

El backend registra estos routers bajo `/api/v1`:

| Router | Archivo | Área |
|---|---|---|
| `auth` | `be/app/routers/auth.py` | registro de cliente, verificación, login, OAuth Google, renovación, logout, cambio/recuperación de contraseña y cambio de correo |
| `users` | `be/app/routers/users.py` | cuenta/usuarios |
| `clientes` | `be/app/routers/clientes.py` | perfil y operaciones de clientes |
| `tecnicos` | `be/app/routers/tecnicos.py` | técnicos, citas, clientes, entregas, evidencias y ubicación |
| `productos` | `be/app/routers/productos.py` | catálogo, productos, variantes, categorías, proveedores e imágenes |
| `citas` | `be/app/routers/citas.py` | citas, disponibilidad, administración e historial |
| `solicitudes` | `be/app/routers/solicitudes.py` | solicitudes de habilitación y gestión relacionada |
| `reports` | `be/app/routers/reports.py` | reportes operativos, ventas, citas y técnicos |
| `consultas` | `be/app/routers/consultas.py` | consultas/contacto |
| `pedidos` | `be/app/routers/pedidos.py` | pedidos, métodos de pago, seguimiento, facturas y confirmación |
| `tarifas` | `be/app/routers/tarifas.py` | tarifas de servicio |
| `calificaciones` | `be/app/routers/calificaciones.py` | calificaciones |
| `notificaciones` | `be/app/routers/notificaciones.py` | notificaciones |
| `especializaciones` | `be/app/routers/especializaciones.py` | especializaciones |
| `reembolsos` | `be/app/routers/reembolsos.py` | reembolsos |
| `devoluciones` | `be/app/routers/devoluciones.py` | devoluciones |
| `novedades` | `be/app/routers/novedades.py` | novedades y gestión relacionada |

Los routers se incluyen en `be/app/main.py` y sus prefijos propios se definen en cada módulo. Usa OpenAPI generado por la versión en ejecución para consultar parámetros, respuestas, autenticación y códigos actuales.

## Rutas representativas verificadas en el código

Estas rutas se forman combinando el prefijo del router con las rutas observadas en el decorador. Revisa OpenAPI para los contratos completos:

| Método | Ruta | Evidencia |
|---|---|---|
| POST | `/api/v1/auth/register/client` | `auth.py` |
| POST | `/api/v1/auth/login` | `auth.py` |
| POST | `/api/v1/auth/refresh` | `auth.py` |
| POST | `/api/v1/auth/forgot-password` | `auth.py` |
| GET | `/api/v1/productos/` | `productos.py` |
| GET | `/api/v1/productos/{producto_id}` | `productos.py` |
| POST | `/api/v1/pedidos` | `pedidos.py` |
| GET | `/api/v1/pedidos/mis-pedidos` | `pedidos.py` |
| GET | `/api/v1/citas/mis-citas` | `citas.py` |
| POST | `/api/v1/citas` | `citas.py` |
| GET | `/api/v1/tecnicos/mis-citas` | `tecnicos.py` |
| GET | `/api/v1/reports/resumen` | `reports.py` |

La ruta raíz `/` devuelve mensaje de estado y `/health` devuelve `{"status":"ok"}`; ambas están fuera del prefijo API en `be/app/main.py`.

## Autenticación y errores

Los endpoints aplican dependencias de autenticación/rol de acuerdo con cada router. No supongas que una ruta pública por aparecer en la web es anónima, ni que todos los endpoints usan el mismo rol. Revisa el decorador y las dependencias del endpoint.

El cliente web adjunta `Authorization: Bearer ...`, renueva tokens ante respuestas 401 según `fe/src/services/api.ts`, y maneja sesión en contexto de autenticación. La configuración puede variar por entorno.

## Mantenimiento de esta referencia

No copies listados de versiones anteriores. Para modificar esta tabla, compara las rutas con `be/app/main.py` y `be/app/routers/*.py`, y revisa los esquemas correspondientes en `be/app/schemas/`. No añadas datos reales de usuarios, tokens o secretos.
