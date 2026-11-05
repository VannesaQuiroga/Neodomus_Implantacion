# T1 — Identidad, permisos y propiedad de datos

Inventario de rutas con sus reglas de autenticación/autorización, defectos
corregidos, pruebas HTTP reales y limitaciones. Se conserva la infraestructura de
T0/T0.1 (TEST_DATABASE_URL + testdb.py, base dedicada). No se hizo commit/push.

> **T1.1** (recuperación de cuentas, archivos privados y pendientes de
> autorización) queda integrado en este documento: ver sección 8.

## 1. Defectos de autenticación confirmados y corregidos

| Defecto | Evidencia | Corrección | Archivo |
|---|---|---|---|
| `verify_password` devolvía `True` siempre: cualquier contraseña iniciaba sesión. | `login` con contraseña incorrecta → **200** (debía ser 401). | Verificar con `pwd_context.verify` y rechazar hashes no verificables. | `app/utils/security.py` |
| Un token de refresco servía como token de acceso en rutas protegidas (los tipos no se separaban para el propósito "acceso"). | `GET /notificaciones/mias` con el `refresh_token` → **200** (debía ser 401). | `get_current_user` exige `payload["type"] == "access"`. | `app/utils/security.py` |

Ambas correcciones son mínimas y no debilitan validaciones existentes. El caso
inverso (token de acceso para refrescar) ya se rechazaba en `refresh_access_token`.

## 2. Convenciones de protección observadas

- `_admin` (por router): `get_current_employee` + rol en `{admin, administrador}` → 403.
- `_tecnico` (novedades): rol `tecnico` + ficha técnica → 403/404.
- `get_current_client` / `get_current_employee` / `get_current_user`: token tipo `access`.
- Propiedad: filtros `id_cliente == current.id_cliente` (o `id_usuario`) → 404 si no es dueño.
- El rol **no** se lee del claim del JWT para autorizar: `_admin`/`_tecnico`/`require_roles`
  lo releen de `roles_usuario` en la BD.

## 3. Matriz de rutas

Leyenda — Acceso: **P** público, **C** cliente, **E** empleado (admin+técnico),
**T** técnico, **A** admin. Protección: ✓ correcta, ✗ defecto (corregido), ◐ ambigua.

### Autenticación (`/api/v1/auth`)

| Método/ruta | Recurso/acción | Acceso | Regla de propiedad | Protección | Prueba | Resultado |
|---|---|---|---|---|---|---|
| POST /register/client | registrar cliente (pendiente) | P | crea `PendingRegistration`; sin rol | ✓ (ignora `id_rol_u`/`user_type`/`is_active`) | `test_register_no_escala_rol` | OK |
| POST /register/client (débil) | validación contraseña | P | min 8, mayúsc, mín, dígito | ✓ | `test_register_password_debil_422` | OK |
| POST /register/client (dup) | email ya registrado | P | 400 si existe `Cliente`; reemplaza pendiente | ◐ (duplicado de *pendiente* devuelve 200) | `test_register_email_verificado_duplicado_400` | OK |
| POST /login | autenticar | P | credenciales correctas | ✗→✓ | `test_login_correcto`/`_incorrecto` | OK |
| POST /refresh | renovar sesión | P | token tipo `refresh` | ✓ | `test_access_token_no_sirve_como_refresh` | OK |
| GET /session | identidad sesión | autenticado | — | ✓ | — | no cubierto |
| POST /logout | cierre sesión | P | solo borra cookies (sin revocación) | ◐ | — | documentado |
| POST /verify-email, /resend-verification | activar cliente | P | requiere código (por correo) | ✓ | — | parcial |
| POST /forgot-password, /verify-code, /reset-password | recuperar contraseña | P | código 6 díg + vencimiento | ✓ | — | no cubierto |
| POST /change-password, /update-password, /request-email-change, /verify-email-change | autogestión | autenticado | sobre sí mismo | ✓ | — | no cubierto |

### Administración de usuarios (`/api/v1/users`)

| Método/ruta | Acceso | Protección | Prueba |
|---|---|---|---|
| GET /me, PUT /me, POST /me/foto | E | ✓ (rol no editable desde /me; `UserUpdate` sin `is_active`/`id_rol_u`) | — |
| GET /roles, GET /, POST /, PUT /{id}, DELETE /{id} | A | ✓ (`_admin`) | `test_tecnico_no_edita_usuarios_ni_roles` |

### Clientes (`/api/v1/clients`)

| Método/ruta | Acceso | Regla | Protección |
|---|---|---|---|
| GET "" | A | lista global | ✓ |
| GET /me, PUT /me, POST /me/foto | C | sí mismo | ✓ (`ClientUpdate` sin `is_active`) |
| GET/POST /me/cuenta-solicitud | C | sí mismo | ✓ |
| PUT /{id}/habilitar, /inhabilitar | A | — | ✓ |
| GET /{id}/pedidos, /servicios, /devoluciones | A | — | ✓ |

### Pedidos (`/api/v1/pedidos`)

| Método/ruta | Acceso | Regla | Protección |
|---|---|---|---|
| POST "" | C | crea pedido propio | ✓ |
| GET /mis-pedidos | C | solo propios | ✓ |
| GET /all-admin, /admin/entregas, /admin/facturas | A | global | ✓ |
| PUT /admin/{id}/entrega | A | — | ✓ |
| GET /{id}/seguimiento, /{id}, /{id}/factura | C | `id_cliente_pe == cliente` | ✓ (`test_cliente_no_lee_pedido_ajeno`, `test_cliente_no_descarga_factura_ajena`) |
| POST /{id}/confirmar-pago | C | propio (validado en servicio) | ✓ |
| GET /admin/{id}/factura | A | — | ✓ |

### Citas (`/api/v1/citas`)

| Método/ruta | Acceso | Regla | Protección |
|---|---|---|---|
| POST "" | C | crea cita propia | ✓ |
| GET /mis-citas | C | solo propias | ✓ (`test_cliente_no_ve_cita_ajena_en_listado`) |
| PUT /{id}, DELETE /{id} | C | `_get_own_cita` (propia) | ✓ (`test_cliente_no_cancela_cita_ajena`) |
| GET /all-admin, /admin/*, PUT /admin/{id}, POST /admin/{id}/reasignar | A | — | ✓ |
| GET /horas-disponibles, /tecnico-ocupado | P | — | ✓ (consulta pública) |
| GET/POST/DELETE /{id}/productos | E | — | ✓ |

### Entregas / evidencias (`/api/v1/tecnicos`)

| Método/ruta | Acceso | Regla | Protección |
|---|---|---|---|
| PUT /entregas/{id}/estado | T | técnico asignado al pedido | ✓ (cubierto en `test_bloque_11`, `test_entregas_comportamiento`) |
| GET /entregas (mis entregas) | T | asignadas | ✓ |
| POST/GET /entregas/{id}/evidencias, /citas/{id}/evidencias | T | asignado | ✓ |
| DELETE /citas/{id}/evidencias/{eid} | T | asignado | ✓ |
| GET/POST /admin/* (reports de técnicos) | A | — | ✓ |

### Devoluciones, reembolsos, novedades, reportes, calificaciones

| Dominio | Acceso resumen | Protección |
|---|---|---|
| Devoluciones | C: crear/ver propias; A: resolver | ✓ (`_admin` + filtros propios) |
| Reembolsos | C: propias; A: procesar | ✓ (`_admin`) |
| Novedades | T: crear/ver propias; A: resolver | ✓ (`_tecnico`/`_admin`) |
| Reportes | A | ✓ (`_admin`) |
| Calificaciones | C: crear/ver propias; T: ver asignadas | ✓ (`get_current_client`/`get_current_employee`) |
| Notificaciones | autenticado: propias | ✓ (`id_cliente`/`id_usuario`) |
| Especializaciones, tarifas, consultas, solicitudes | A | ✓ (`_admin`) |
| Productos | P: catálogo; A: gestión | ✓ (catálogo público, mutación admin) |

## 4. Archivos y evidencias (acceso por URL)

- **Facturas**: `GET /api/v1/pedidos/{id}/factura` genera el PDF en tiempo real
  (`StreamingResponse`) y exige autenticación + propiedad (o `_admin`). **Protegido**;
  no hay archivo estático. Verificado con `test_cliente_no_descarga_factura_ajena`.
- **Imágenes de catálogo** (`/uploads`, MinIO bucket `productos`): públicas por diseño. OK.
- **Evidencias de trabajo** (entrega/citas): **corregido en T1.1** — las URLs devueltas
  apuntan ahora a una ruta autorizada `/api/v1/tecnicos/evidencias/{tipo}/{id}/archivo`
  que comprueba asignación/rol y sirve el contenido desde el backend. El montaje estático
  legado `/evidencias` fue retirado (acceso directo → 404). Ver sección 8.3.
  - **Limitación de infraestructura**: el bucket MinIO sigue siendo público-lectura
    (política de almacenamiento desplegado que no se modificó). Conocer la URL del bucket
    aún expone los objetos hasta que se aplique una política privada + presigned URLs;
    pendiente de infraestructura (no se declara protegido).

## 5. Cobertura de escenarios de prueba (test_t1_identidad.py, 21 pruebas)

Autenticación: login correcto/incorrecto, rol no escalable en registro, datos inválidos,
duplicado de cliente verificado, token ausente/malformado/expirado, refresh≠access,
access≠refresh, cuenta desactivada (login 403 y sesión previa 401).

Autorización/propiedad: cliente no lee pedido ajeno (404), no descarga factura ajena (404),
no ve/cancela cita ajena (404), no accede a listado admin (401/403), técnico no accede a
admin (403), técnico no edita usuarios/roles (403, sin cambios), cliente no se reactiva
por campo extra (ignorado).

Para cada rechazo de escritura se comprobó la **respuesta y la ausencia de cambios** (estado
de la cita/pedido y campos del usuario permanecen intactos).

## 6. Ambigüedades y pendientes

1. **Logout sin revocación en servidor**: `/logout` solo borra las cookies del navegador;
   el token sigue siendo válido hasta su expiración. No se declara revocación.
2. **Duplicado de registro pendiente**: re-registrar un correo aún no verificado **reemplaza**
   el pendiente (200), en lugar de rechazar. Comportamiento aparente, no confirmado como regla.
3. **Evidencias públicas** (sección 4): acceso por URL sin autenticación vía MinIO público
   y montaje legado `/evidencias`. Requiere decisión de producto/infraestructura.
4. **Verificación/recuperación de correo**: flujos implementados pero no cubiertos por
   pruebas HTTP (expiración/alteración/reutilización del código). Pendiente de pruebas.
5. Rutas no cubiertas por pruebas HTTP de este bloque: `/session`, `change/update-password`,
   `request/verify-email-change`, `forgot-password`/`verify-code`/`reset-password`.

## 7. Resultados y validación

- Suite completa sobre base dedicada recién migrada: **151 pruebas OK**
  (98 previas + 21 T1 + 15 T1.1 cuentas + 7 T1.1 archivos + 4 T1.2 MinIO + 6 T1.3 permisos), 0 fallidas, 0 errores, 0 omitidas.
- Limpieza: huellas de los registros de referencia idénticas antes/después; sin residuos
  (`>10` = 0, citas/historial/reembolsos/notificaciones/facturas/pagos = 0).
- Cobertura regenerada (mismo denominador T0): **líneas 42.14 %** (4106/9743),
  **ramas 16.23 %** (458/2822). Módulos intervenidos: `utils/security.py` 78.3 % líneas,
  `services/auth_service.py` 43.4 %, `routers/auth.py` 67.9 %,
  `routers/notificaciones.py` 68.3 %, `services/minio_service.py` 81.5 %,
  `routers/pedidos.py` 48.2 %.

### Comandos reproducibles (sin credenciales)

```bash
# Migrar base de pruebas (una vez; usa la URL de neodomus_test*)
docker compose exec -T -e DATABASE_URL="$TEST_DATABASE_URL" api uv run alembic upgrade head

# Suite completa
docker compose exec -T -e TEST_DATABASE_URL="$TEST_DATABASE_URL" api uv run python -m unittest discover -s app/tests -p "test_*.py"

# Cobertura
docker compose exec -T -e TEST_DATABASE_URL="$TEST_DATABASE_URL" api sh -c "uv run coverage erase && uv run coverage run --source=app --branch -m unittest discover -s app/tests -p 'test_*.py' && uv run coverage html && uv run coverage xml"
```

## 8. T1.1 — Recuperación de cuentas, archivos privados y pendientes de autorización

### 8.1 Verificación y recuperación de cuentas (15 pruebas, `test_t1_1_cuentas.py`)

Cubierto por HTTP real (el correo se neutraliza vía testdb; se controla el tiempo
manipulando `expires_at` en la BD, sin pausas):

- Verificación válida crea `Cliente` y consume el pendiente.
- Código de verificación inválido, expirado y **consumido** → 400.
- Reenvío invalida el código anterior (el anterior ya no verifica; el nuevo sí).
- Recuperación: cambio de contraseña efectivo (la nueva funciona, la anterior deja de
  funcionar), reutilización del enlace → 400, código expirado → 400.
- Correo inexistente: respuesta idéntica a la de un correo existente (no revela existencia).
- Código de un propósito (verificación) no sirve para otro (reset) → 400.

**Contrato de sesiones tras cambio de contraseña**: los JWT son sin estado; cambiar la
contraseña **NO revoca** las sesiones previas (no hay revocación en servidor). Verificado
con `test_sesion_existente_no_se_revoca_al_cambiar_password`. No se declara revocación.

### 8.2 Contraseñas y tipos de token (4 pruebas)

- Hash inválido/no verificable → login 401 (sin error interno).
- Token firmado **sin `type`** o con `type` desconocido → 401.
- Access y refresh legítimos siguen funcionando en sus rutas.

### 8.3 Archivos privados (7 pruebas, `test_t1_1_archivos.py`)

Cambios de código (mínimos):

- `app/main.py`: retirado el montaje estático público `/evidencias` (acceso directo → 404).
- `app/routers/tecnicos.py`: nueva ruta autorizada
  `GET /tecnicos/evidencias/{tipo}/{id}/archivo` (tipo `entrega`|`cita`) que comprueba
  asignación/rol y sirve el contenido desde el backend (`_leer_archivo_evidencia`).
- `_url_evidencia` ahora emite la URL autorizada (con id), nunca un enlace público.

Probado (almacenamiento local dedicado `app/static/evidencias`):

- Técnico asignado descarga → 200 (contenido correcto).
- Otro técnico → 403; anónimo → 401; admin → 200.
- Acceso directo a la ruta legada `/evidencias/...` → 404.

**Separado de la aplicación (pendiente de infraestructura)**: el bucket MinIO sigue
siendo público-lectura (política desplegada no modificada). El acceso directo a la URL
del bucket expone los objetos hasta aplicar bucket privado + presigned URLs. No se
declara protegido ese acceso; se documenta como pendiente de infraestructura. Los
archivos heredados en `app/static/evidencias` se conservan (no se borran/mueven) y ya
no se exponen; un procedimiento de migración revisable queda como paso necesario si se
mueven a un bucket privado.

### 8.4 Pendientes de autorización cerrados (más pruebas)

- Notificaciones ajenas: un cliente no lee ni marca como leída la notificación de otro
  (404 y sin cambios). (`test_t1_1_archivos.py`)
- Entregas/evidencias de otro técnico y antiguo responsable: cubierto en
  `test_bloque_11` (PermisoActualizacionTestCase) y en T1.1 (evidencias).
- Devoluciones/reembolsos/novedades de otro cliente: listados y detalle protegidos por
  `_admin`/filtros propios (matriz sección 3); no se añadió una prueba HTTP dedicada por
  reutilizar la misma protección `_admin`/`get_current_client` ya demostrada. Documentado
  como "revisado sin prueba dedicada".

### 8.5 Ambigüedades resueltas o mantenidas

- **Logout sin revocación**: se mantiene (borra cookies; el token sigue válido hasta
  expirar). Documentado, no es defecto.
- **Reemplazo de registro pendiente**: re-registrar un correo aún no verificado reemplaza
  el pendiente (200). Documentado, no es defecto; el código anterior deja de ser válido
  (verificado en 8.1).
- **Evidencias públicas por bucket**: pendiente de infraestructura (8.3).
- **Acceso de cliente a sus propias evidencias** (seguimiento de pedido): ambigüedad de
  producto — actualmente `seguimiento_pedido` devuelve `evidencia_entrega_url`; decidir si
  el cliente debe ver sus evidencias por ruta autorizada. Pendiente de decisión de negocio.

## 9. T1.2 — Privacidad efectiva del almacenamiento, consumidores y cierre

### 9.1 Privacidad efectiva del almacenamiento (MinIO real)

**Inventario** (config actual de `app/services/minio_service.py` + `app/config.py`):

| Carpeta/bucket | Contenido | Acceso |
|---|---|---|
| `MINIO_BUCKET` (`neodomus-media`) `productos/` | catálogo de productos | público (correcto) |
| `MINIO_BUCKET` `perfiles/` | fotos de perfil usuario/cliente | público (pendiente de decisión de privacidad) |
| `MINIO_BUCKET` `calificaciones_productos/` | fotos de reseñas de producto | público (catálogo) |
| `MINIO_PRIVATE_BUCKET` (`neodomus-private`) `evidencias_entrega/`, `evidencias_citas/` | evidencias de entregas/citas | **privado** (nuevo en T1.2) |
| `MINIO_BUCKET` `evidencias_novedades/`, `recogidas/` | evidencias de novedades y devoluciones | público (pendiente de migrar) |

**Corrección en código** (estado "código corregido"):

- `app/config.py`: nuevo `MINIO_PRIVATE_BUCKET` (por defecto `neodomus-private`).
- `app/services/minio_service.py`: `subir_imagen_privada`/`leer_objeto_privado`/
  `eliminar_objeto_privado` y `_cliente_privado` (bucket **sin** política pública).
- `app/routers/tecnicos.py`: las evidencias de entrega y cita se suben al bucket privado;
  `_leer_archivo_evidencia` lee del bucket privado (con retroceso al público para objetos
  heredados); `_servir_evidencia` valida `tipo ∈ {entrega, cita}`.
- Las evidencias de novedades (`novedades.py`) y recogidas (`devoluciones.py`) siguen
  usando el bucket público: **pendiente de migración** (misma estrategia, aplicar
  `subir_imagen_privada` + ruta autorizada).

**Evidencia de rechazo de acceso anónimo directo** (prueba real con MinIO,
`test_t1_2_minio.py`):

- Objeto sintético en el bucket privado → lectura anónima directa `GET
  http://minio/{bucket}/{objeto}` = **403**.
- Ruta autorizada (`/tecnicos/evidencias/entrega/{id}/archivo`) del técnico asignado = 200.
- Anónimo por ruta autorizada = 401.
- URL con la estructura antigua (objeto en bucket público con la clave de evidencia) = 404.
- Catálogo público (objeto sintético en `productos/`) = 200 anónimo.

### 9.2 Archivos heredados — procedimiento revisable (no ejecutado)

Distinción de estados:

1. **Código corregido**: evidencia de entrega/cita va al bucket privado y se sirve por ruta
   autorizada (verificado).
2. **Configuración local probada**: `MINIO_PRIVATE_BUCKET` + bucket privado en el MinIO de
   pruebas (verificado con objetos sintéticos).
3. **Infraestructura desplegada pendiente**: el bucket público `neodomus-media` desplegado
   no se modificó; los objetos de evidencia antiguos siguen expuestos por URL pública
   hasta migrarlos.
4. **Archivos heredados sin comprobar**: objetos ya subidos a `neodomus-media` (evidencias)
   y archivos en `app/static/evidencias` no se han movido ni se declara su privacidad.

Procedimiento de migración (referencia, para aplicar con infraestructura real):

1. Crear bucket privado y replicar objetos de evidencias (`evidencias_*`, `recogidas`)
   desde el bucket público.
2. Actualizar `url_archivo` en las tablas de evidencia para referenciar el bucket privado
   (o dejar la clave y resolverla por tipo, como hace el código).
3. Verificar descarga por ruta autorizada y rechazo anónimo directo.
4. Retirar los objetos de evidencia del bucket público (o aplicar política privada a ese
   bucket solo si el catálogo se sirve aparte).
5. Reversión: reponer los objetos en el bucket público y revertir la configuración.

### 9.3 Consumidores web/móvil (revisión; no se ejecutó comprobación visual)

Hallazgo: las evidencias se muestran en componentes de imagen que **no adjuntan el token**:

- Web (`fe/.../TechnicianEntregas.tsx`, `TecnicoHistorial.tsx`): `<img src={url}>`; depende
  de la cookie HttpOnly de sesión (misma-origen) o del header `Authorization` vía `api.ts`.
- Móvil (`movil/app/(tecnico)/entregas.tsx`, `novedades.tsx`, `devoluciones.tsx`):
  `<Image source={{ uri: url }}>`; React Native **no** envía cookies ni `Authorization`,
  por lo que la URL autorizada devolvería 401.

Adaptación requerida (no ejecutada): en móvil, descargar la evidencia con el cliente
autenticado (que adjunta el header) y renderizar un blob/base64; en web, si no usa cookie,
buscar la imagen con `fetch` autenticado y `createObjectURL`. **No** incluir el token de
acceso en parámetros de URL. Esta comprobación queda como **manual/pendiente** (no se
puede verificar aquí sin ejecutar las apps).

### 9.4 Matriz e inventario de pruebas (sin duplicados)

Las cuatro pruebas de tipos de token están en `test_t1_1_cuentas.py`
(`TiposTokenYHashTestCase`: `test_hash_invalido_rechaza_login`,
`test_token_sin_type_rechazado`, `test_token_tipo_desconocido_rechazado`,
`test_access_y_refresh_legitimos_siguen_funcionando`) más `test_sesion_existente_no_se_revoca_al_cambiar_password`.

Las pruebas de notificaciones están en `test_t1_1_archivos.py`
(`NotificacionesPropiedadTestCase`: `test_cliente_no_marca_notificacion_ajena`,
`test_cliente_no_ve_notificacion_ajena`).

Inventario por descubrimiento (`python -m unittest discover`): **143 pruebas**, 0 fallidas,
0 errores, 0 omitidas. Módulos: `test_aislamiento` (8), `test_auth` (3), `test_bloque_2` (18),
`test_bloque_11` (16), `test_bloque_21` (12), `test_bloque_21_cierre` (14),
`test_entregas_comportamiento` (19), `test_reasignacion_transacciones` (8),
`test_t1_identidad` (21), `test_t1_1_cuentas` (15), `test_t1_1_archivos` (7),
`test_t1_2_minio` (2). Total = 143.

Pendientes de autorización (T1.1) revisados:

- Devoluciones/reembolsos/novedades de otro cliente: **inspeccionado** (protección `_admin`
  / filtros propios) pero **sin prueba HTTP dedicada** — pendiente.
- Reportes/exportaciones restringidos: `_admin` (inspeccionado) — pendiente de prueba.
- Listados que revelan datos ajenos: `clientes/`, `pedidos/all-admin`, `citas/all-admin`
  usan `_admin` — inspeccionado; pendiente de prueba dedicada.
- Campos protegidos: `UserUpdate`/`ClientUpdate` sin `is_active`/`id_rol_u` — probado en
  `test_t1_identidad.py` (`test_tecnico_no_edita_usuarios_ni_roles`,
  `test_cliente_no_puede_reactivarse`).
- Entregas de otro técnico / antiguo responsable: probado en `test_bloque_11`.

### 9.5 Limitaciones explícitas

- El bucket público `neodomus-media` desplegado **no** se modificó; los objetos de evidencia
  antiguos y los de novedades/recogidas siguen expuestos por URL pública (pendiente de
  migración/infraestructura).
- Evidencias de novedades y recogidas no migradas a bucket privado (pendiente).
- Consumidores móvil/web no adaptados ni comprobados visualmente (se documenta el cambio
  requerido); es una comprobación manual pendiente.
- Acceso del cliente propietario a sus propias evidencias: decisión de producto pendiente
  (`evidencia_entrega_url` no está poblada actualmente).

## 10. T1.3 — Evidencias privadas completas, consumidores y permisos pendientes

### 10.1 Nuevas cargas privadas (completado)

Todos los flujos de evidencias nuevas suben al bucket PRIVADO (`neodomus-private`):

| Flujo de carga | Almacenamiento (nuevo) | Ruta de lectura autorizada | Roles |
|---|---|---|---|
| Entregas (`/tecnicos/entregas/{id}/evidencias`) | privado | `/tecnicos/evidencias/entrega/{id}/archivo` | técnico asignado, admin |
| Citas (`/tecnicos/citas/{id}/evidencias`) | privado | `/tecnicos/evidencias/cita/{id}/archivo` | técnico asignado, admin |
| Novedades (`/novedades/{id}/evidencia`) | privado | `/novedades/evidencias/{id}/archivo` | técnico dueño, admin |
| Recogidas/cambio (`/devoluciones/{id}/evidencia-*`) | privado | `/devoluciones/{id}/evidencia-*/archivo` | cliente dueño, técnico asignado, admin |
| Entrega para cliente (seguimiento) | privado | `/pedidos/{id}/evidencias-entrega/{ev}/archivo` | cliente dueño |

Catálogo (`productos`, `perfiles`, `calificaciones_productos`) sigue en el bucket público.

**Retroceso a heredados corregido**: `minio_service.leer_archivo`/`leer_objeto_privado`
distinguen "objeto no encontrado" (`NoSuchKey` → `FileNotFoundError`) de errores de
permisos/conexión; el retroceso al bucket público solo ocurre ante `NoSuchKey`. La
referencia se normaliza por clave (`_clave_desde_referencia`) para no decidir privacidad
por el nombre ni por ocultar la URL.

### 10.2 Acceso del cliente a la evidencia de entrega (completado)

`seguimiento_pedido` ahora resuelve `evidencia_entrega_url` con la URL autorizada de la
última evidencia (antes estaba sin poblar). Rutas nuevas de cliente:
`GET /pedidos/{id}/evidencias-entrega` (lista) y
`GET /pedidos/{id}/evidencias-entrega/{ev}/archivo` (descarga), con verificación de
propiedad. Probado: cliente dueño 200, otro cliente 404, anónimo 401, id inexistente 404,
tipo no admitido 404. No se extiende a evidencias de novedades ni de otros procesos.

### 10.3 Consumidores web/móvil (estado B pendiente)

Evidencias renderizadas con `<img src>` (web) y `<Image source={{uri}}>` (móvil) que no
adjuntan token. Adaptación requerida (fetch autenticado → blob/base64), sin token en URL,
con manejo de error/sesión expirada y liberación de recursos. **No ejecutada** (comprobación
visual/manual pendiente por plataforma). Archivos afectados identificados:
`fe/.../TechnicianEntregas.tsx`, `TecnicoHistorial.tsx`, `TecnicoNovedades.tsx` y
`movil/app/(tecnico)/{entregas,novedades,devoluciones}.tsx`.

### 10.4 Permisos pendientes por HTTP (completado, `test_t1_3_permisos.py`)

- Endpoints administrativos (`/clients`, `/pedidos/all-admin`, `/citas/all-admin`,
  `/reports/operativo`, `/reembolsos`): cliente → 401/403, técnico → 403, admin → 200.
- Devoluciones: `/devoluciones/mias` no filtra ajenas (verificado).
- `/novedades` (admin): **omitido de la prueba por drift de esquema preexistente** —
  columna `novedades.mensaje_cliente` (y otras del modelo) no existe en la base migrada a
  `0057`; `GET /novedades` falla con `Unknown column`. Es un defecto de esquema a corregir
  con migración (fuera de T1.3); documentado.

### 10.5 Estados de entrega

- **A. Solución local implementada y comprobada**: evidencias nuevas privadas (4 flujos),
  rutas autorizadas, retroceso correcto, acceso del cliente a su evidencia de entrega,
  pruebas HTTP + MinIO real (lectura anónima 403, autorizada 200, catálogo 200). ✓
- **B. Comprobación visual por plataforma**: pendiente (web/móvil no ejecutados).
- **C. Migración y configuración desplegada**: no ejecutadas (bucket público desplegado sin
  modificar; evidencias antiguas/novedades/recogidas heredadas siguen expuestas por URL
  pública hasta migrarlas).

### 10.6 Limitaciones

- `novedades.mensaje_cliente` (drift de esquema) impide probar `GET /novedades` y su rol.
- Consumidores web/móvil sin adaptar (B pendiente).
- Evidencias heredadas en bucket público y `app/static/evidencias` sin migrar (C pendiente).

## 11. T1.3 (cierre) — consumidores, esquema y origen explícito

### 11.1 Consumidores web y móvil implementados

- **Web** (`fe`): `src/hooks/useAuthImage.ts` (descarga blob autenticada + object URL con
  limpieza en cleanup/cambio) y `src/components/common/AuthImage.tsx` (carga/error/no
  disponible). Cableado en `TechnicianEntregas.tsx`, `TecnicoHistorial.tsx`,
  `TecnicoNovedades.tsx` (se reemplazan `<img src>`/`<a href>` por `AuthImage`). Typecheck
  web (`tsc --noEmit`) **aprobado**.
- **Móvil** (`movil`): `hooks/useAuthImage.ts` (fetch con `Authorization` → base64 vía
  `FileReader`, sin token en URL) y `components/EvidenciaImagen.tsx`. Cableado en
  `app/(tecnico)/entregas.tsx` (miniaturas de entrega y recogida). Se conserva la técnica por
  plataforma (object URL en web, data-URI en móvil), sin convertir todo a base64 en web.
- Comprobación integrada: `test_t1_2_minio.py` obtiene evidencia desde el backend y MinIO de
  pruebas por la ruta autorizada (200 con contenido). Comprobación visual por plataforma:
  **pendiente** (no se ejecutaron las apps).

### 11.2 Discrepancia de esquema en novedades corregida

- Causa: el modelo `Novedad` usa `mensaje_cliente`, `solucion_cliente`, `cliente_visible`
  (contrato vigente usado por `enviar_mensaje_cliente` y `listar_novedades_cliente`), pero
  ninguna migración los creaba.
- Corrección: nueva migración **`0058_novedades_mensaje_cliente.py`** (idempotente) que añade
  las tres columnas: `mensaje_cliente`/`solucion_cliente` TEXT nullable, `cliente_visible`
  BOOLEAN NOT NULL `server_default="0"` (los registros previos quedan no visibles).
- Verificado: instalación desde cero (base `neodomus_test_t02` → head) y actualización desde
  0057 con datos (`neodomus_test_t01`): columnas presentes y 10 novedades sembradas
  preservadas (`cliente_visible=0`, `mensaje_cliente` NULL).
- `GET /novedades` restaurado en `test_t1_3_permisos.py`: admin 200, técnico 403, cliente 401.

### 11.3 Origen explícito de archivos heredados

- `minio_service` ahora marca las referencias privadas nuevas con el prefijo **`privado:`**
  (`subir_imagen_privada` devuelve `privado:{clave}`). `leer_archivo` distingue de forma
  inequívoca: `privado:` → solo bucket privado (sin retroceso); URL pública o clave simple →
  heredado (bucket público). `eliminar_objeto_privado` normaliza el prefijo.
- Pruebas con objetos sintéticos (`test_t1_2_minio.py`):
  - Misma clave en ambos buckets → cada referencia obtiene el objeto correcto.
  - Falta el objeto privado y existe uno público homónimo → **no** se entrega el público.
  - Referencia heredada (URL pública) → lectura autorizada.
  - Lectura anónima directa del objeto privado → 403.

### 11.4 Tabla de cierre

| Requisito | Implementación | Prueba | Resultado | Pendiente |
|---|---|---|---|---|
| Evidencias nuevas privadas (4 flujos) | `minio_service`, `tecnicos/novedades/devoluciones/pedidos` | `test_t1_2_minio.py` | 403 anónimo / 200 autorizado | — |
| Origen explícito privado vs heredado | prefijo `privado:` + `leer_archivo` | `test_origen_explicito_privado_vs_heredado` | OK | migración desplegada (C) |
| Acceso cliente a evidencia de entrega | rutas `/pedidos/{id}/evidencias-entrega*` | `test_t1_3_permisos.py` | OK | — |
| Esquema `novedades` | migración `0058` | `test_t1_3_permisos.py` (`/novedades`) | OK | — |
| Consumidores web | `AuthImage` + `useAuthImage` | `tsc --noEmit` | OK | visual (B) |
| Consumidores móvil | `EvidenciaImagen` + `useImagenAutenticada` | — | código integrado | typecheck/visual (B) |
| Permisos pendientes HTTP | `test_t1_3_permisos.py` | endpoints admin + devoluciones | OK | — |

Estados: **A** solución local implementada y comprobada (151 pruebas). **B** comprobación
visual web/móvil pendiente. **C** migración/configuración desplegada no ejecutada (heredados
públicos siguen expuestos hasta migrar).

## 12. T1.3 (consumidores) — inventario completo y pruebas de componentes

### 12.1 Inventario de consumidores de evidencias

**Web** (`fe/`):

| Archivo | Flujo | Rol | Mecanismo | Estado |
|---|---|---|---|---|
| `pages/tecnico/TechnicianEntregas.tsx` | evidencia de entrega | técnico | `AuthImage` (blob autenticado) | adaptado |
| `pages/tecnico/TechnicianDashboard.tsx` | evidencia de entrega + cita | técnico | `AuthImage` | adaptado |
| `pages/tecnico/TecnicoHistorial.tsx` | evidencia de entrega + cita | técnico | `AuthImage` | adaptado |
| `pages/tecnico/TecnicoNovedades.tsx` | evidencia de novedad | técnico | `AuthImage` | adaptado |
| `pages/admin/AdminTecnicos.tsx` | evidencia entrega/cita/devolución (historial) | admin | `AuthImage` | adaptado |
| `pages/admin/AdminNovedades.tsx` | evidencia de novedad | admin | `AuthImage` | adaptado |
| `pages/cliente/ClienteNovedades.tsx` | evidencia de novedad | cliente | `AuthImage` | adaptado |
| `components/profile/OrdersTab.tsx` (seguimiento) | evidencia de entrega (`evidencia_entrega_url`) | cliente | — | **sin UI** (el backend ya la puebla; el seguimiento no la renderiza) |

**Móvil** (`movil/`):

| Archivo | Flujo | Rol | Mecanismo | Estado |
|---|---|---|---|---|
| `app/(tecnico)/entregas.tsx` | evidencia de entrega + recogida | técnico | `EvidenciaImagen` (data-URI) | adaptado |
| `app/(tecnico)/novedades.tsx` | evidencia de novedad | técnico | `EvidenciaImagen` | adaptado |
| `app/(cliente)/novedades.tsx` | evidencia de novedad | cliente | `EvidenciaImagen` | adaptado |
| `app/(tecnico)/index.tsx` | — (solo cuenta evidencias) | técnico | — | no muestra imágenes |
| `app/(tecnico)/devoluciones.tsx` | sube evidencia de recogida | técnico | — | sube, no muestra |

La funcionalidad de "abrir en tamaño completo" que antes daban los enlaces `<a
href target="_blank">`/lupa se conserva con el lightbox integrado de `AuthImage`
(clic → imagen ampliada). No se eliminó la capacidad de ver la evidencia completa.

### 12.2 Pruebas de componentes (`useAuthImage.test.ts`, 5 pruebas, vitest)

Se simula solo el transporte (`api.get`); se ejecuta el código real del hook:

- Descarga autenticada correcta (objeto blob → object URL) y sin token en la URL.
- Rechazo 401/403/404 y error de red, sin reintentos (una sola llamada).
- Cambio de `src` con descarga anterior pendiente: la respuesta vieja no sobrescribe la nueva.
- Desmontaje: se revoca el object URL temporal.
- Cierre de sesión (`neodomus:sesion-expirada`): retira la evidencia anterior y la descarga
  pendiente de la cuenta previa no vuelve a mostrarse.

Para el caso de cierre de sesión se corrigió `useAuthImage` de forma acotada: ahora escucha
el evento `neodomus:sesion-expirada` y aumenta una "generación de sesión" que reinicia el
efecto (retira la imagen anterior y evita que una descarga pendiente la restaure).

### 12.3 Typecheck y validación

- Web: `npx tsc --noEmit` → **aprobado**; `pnpm exec vitest run` → **5 pruebas OK**.
- Móvil: `tsc --noEmit` (script `typecheck` de `movil/package.json`) → **aprobado** con las
  dependencias ya instaladas (node_modules presentes). La técnica de descarga usa `fetch` +
  `FileReader.readAsDataURL` (estándar de React Native, sin APIs Expo específicas).
- Comprobación visual/nativa por plataforma: **pendiente** (no se ejecutó Expo/emulador).

### 12.4 Pendientes

- Visualización en el seguimiento del cliente (`OrdersTab.tsx`): el backend ya devuelve
  `evidencia_entrega_url`, pero la UI no la renderiza; pendiente de decidir/añadir la vista.
- Comprobación visual/nativa web y móvil (B) y migración desplegada de heredados (C) siguen
  pendientes y fuera de este bloque.
