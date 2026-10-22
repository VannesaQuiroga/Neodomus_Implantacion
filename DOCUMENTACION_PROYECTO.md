# Neodomus

Neodomus es una plataforma integral de **gestión de productos de domótica y servicios técnicos asociados** (instalación, mantenimiento, reparación, revisión y soporte). El sistema unifica en una sola aplicación el catálogo comercial, el carrito de compra, la generación de pedidos y facturas, la agenda de citas/instalaciones y la operación de campo de técnicos, con una **aplicación web** para visitantes/clientes/administradores y una **aplicación móvil nativa** (Expo) para clientes y técnicos.

El proyecto resuelve la necesidad de un comercio de domótica que no solo vende productos (sensores, controladores, cámaras, cintas LED, etc.), sino que además debe coordinar la instalación técnica en domicilio: evita la gestión manual de agendas, descontrol de stock, asignaciones informales de técnicos y falta de trazabilidad de entregas y evidencias.

Usuarios reales del sistema (implementación en `be/app/models/` y control de roles en `be/app/utils/security.py`):

- **Visitante** — explora sin autenticarse.
- **Cliente** — compra y agenda servicios (tabla `clientes`).
- **Técnico** — ejecuta citas y entregas (tablas `usuarios` con `id_rol_u=2` + `tecnicos`).
- **Administrador** — opera el negocio completo (tabla `usuarios` con `id_rol_u=1`).

---

## 1. Explicación general del proyecto

Neodomus permite, únicamente con funcionalidades presentes en el código:

- **Gestionar usuarios** — registro con verificación por email, login con JWT + refresh, recuperación de contraseña por código temporal, Google Sign-In, inhabilitación por inactividad y cambio de contraseña obligatorio.
- **Gestionar clientes** — perfil con `first_name/last_name/email/telefono_cliente/address/documento_cliente`, foto, cambio de correo verificado y solicitud de baja (`solicitudes_cuenta`).
- **Gestionar técnicos** — ficha `tecnicos` vinculada a `usuarios`, certificaciones, especializaciones (`tecnico_especializacion` N:N), ubicación GPS (`ubicaciones_tecnico`), calificación promedio y disponibilidad por franja.
- **Administrar productos** — CRUD con `productos`, `categorias`, `proveedores`, `producto_variantes` (color hex, tamaño, dimensiones ancho/alto, precio y stock propio), descuento/promoción con vigencia, venta por metros, visibilidad `visible_cliente`.
- **Visualizar productos** — catálogo público paginado con búsqueda por nombre, filtro por categoría/proveedor, precios con `precio_final`, stock con estados `disponible|bajo|agotado`, tarjetas uniformes y variantes como chips.
- **Gestionar carrito de compras** — cantidades por unidades y por metros (rangos 10–50 m), validación de stock, variantes y precios en web (`fe/src/contexts/CartContext.tsx`) y móvil (`movil/contexts/CartContext.tsx`).
- **Realizar pedidos** — checkout con simulador de pago académico (`app/services/pagos_service.py`), métodos tarjeta/PayPal/Efecty/PSE/Bancos, facturación PDF automática, seguimiento con línea de pasos y GPS del técnico.
- **Gestionar citas** — creación por cliente con validación de días laborales (lunes–sábado) y franjas según duración, asignación de hasta 3 técnicos, cálculo de duración estimada, reasignación automática al desactivar técnico, historial en `historial_citas`, estados `Pendiente|Confirmada|Finalizada|Cancelada` (`be/app/models/cita.py:50`).
- **Gestionar instalaciones** — equivalente a citas de tipo `instalacion` con comisión (`comisiones`) y evidencias fotográficas (`evidencias`).
- **Asignar técnicos** — asignación manual por admin (`PUT /citas/admin/{id}`, `PUT /pedidos/admin/{id}/entrega`), sugerencia automática por especializaciones y carga (`recomendacion_service`), control de solapamiento de horarios.
- **Administrar desde dashboard** — panel admin (KPIs, productos, catálogo, técnicos, clientes, instalaciones, pedidos, facturas, devoluciones, reportes, consultas, notificaciones) y panel técnico (mis citas, mis entregas, evidencias, comisiones, clientes, mensajes).
- **Utilizar aplicación móvil** — espejo funcional de la web con tabs públicos y stack técnico, favoritos y carrito por usuario, manejo de imágenes con normalización LAN y descarga de facturas en dispositivo.

---

## 2. Objetivo del proyecto

**Objetivo principal**: ofrecer un sistema profesional y trazable que cubra el ciclo completo **catálogo → compra → facturación → instalación/entrega → evidencia y calificación**, sin procesos manuales externos.

**Necesidad que resuelve**:

- Para el **cliente**: encontrar productos de domótica, comprar con fluidez, compartir ubicación, seguir la entrega y calificar el servicio, todo desde web o móvil.
- Para el **técnico**: recibir asignaciones claras, visualizar productos y dirección, subir evidencias fotográficas obligatorias antes de finalizar, reportar GPS y reagendar con franjas reales.
- Para el **administrador**: controlar stock y precios, publicar promociones, asignar/reasignar técnicos sin romper agendas, gestionar comisiones, resolver devoluciones/reembolsos y emitir reportes PDF/Excel.

El diseño prioriza reglas académicas verificables (pagos simulados, 50 migraciones Alembic idempotentes, hashing bcrypt, JWT, rate-limit, validaciones de imagen con Pillow) sobre pasarelas reales.

---

## 3. Cómo funciona el sistema

### Flujo del visitante

1. Entra a `http://localhost:5173` o a la app móvil sin autenticarse (`movil/app/(tabs)/productos.tsx`).
2. Ve el catálogo público (`GET /api/v1/productos/?limit=100` en `be/app/routers/productos.py:458`): el backend filtra automáticamente `estado_producto='activo'`, `visible_cliente=True` y `stock_producto > 5` o variante con `stock>5` si `_empleado_opcional` es `None` (`productos.py:474`). Los visitantes ven 10 productos con stock (ID 1–10) de 16 totales.
3. Usa buscador (`nombre_producto ILIKE`) y selector de categoría (`id_cate_pr`), pagina resultados (8/16/24 por página en web, `FlatList` virtualizada con `numColumns=2` en móvil).
4. Abre `ProductoDetalle` (`/producto/:id` web, `/(tabs)/producto/[id]` móvil) y consulta imágenes desde MinIO, variantes, disponibilidad, características y la sección **Más recomendados para ti** (mismos `id_cate_pr` primero, luego otros).
5. Añade al carrito y a favoritos (persistidos localmente por email o por pestaña); cualquier intento de checkout (`/checkout`) redirige a login (`ProtectedRoute allowedRoles=['cliente']` en `fe/src/App.tsx:75`).

### Flujo del cliente

1. **Registro/Login**: `POST /auth/register` → hash `passlib[bcrypt]` → token de verificación por email (tabla `email_verification_tokens`), `POST /auth/login` → `access_token` (60 min) + `refresh_token` (30 días) firmados `HS256` con `SECRET_KEY` (`be/app/config.py:28`). Google Sign-In vía `GOOGLE_SIGNIN_CLIENT_ID` (`@react-oauth/google` en web, `expo-auth-session` + deep link `movil://auth` en móvil).
2. **Perfil**: completa `id_tipo_documento_c/documento_cliente/telefono_cliente/address` (`Perfil.tsx`), sube foto (`POST /clients/me/foto` → MinIO `foto_url`), cambia email (`request-email-change/verify-email-change`) y solicita inhabilitación (`solicitudes_cuenta`).
3. **Carrito → Pedido**: elige color/variante y cantidad o metros (ej. 10 m × unidades = total m, validado contra `stock_producto`), checkout elige `metodo` y `datos_pago` → `POST /pedidos` (`be/app/routers/pedidos.py:230`) ejecuta `pedidos_service.crear_pedido` con `procesar_pago` simulado (`simulator` en `pagos_service.py`), descuenta stock, crea `pedidos` + `detalle_pedido` + `pagos` + `facturas` y PDF vía `reportlab`. Respuesta incluye `pedido`, `pago`, `factura`, `pdf_url=/api/v1/pedidos/{id}/factura`, `entrega` con rango horario.
4. **Cita**: desde `tecnicos` o desde `pedido` (productos que requieren instalación), elige `tipo_servicio` (`instalacion|mantenimiento|reparacion|revision|soporte`), `fecha/hora` (`horas_laborales` lun–sáb 08:00–18:00, duración base 1–1.5 h según tipo), `direccion/descripcion` y técnico opcional → `POST /citas` (`be/app/routers/citas.py:592`) valida 3 h de anticipación, franja libre, `slot_tomado` y `tecnico_ocupado`, crea `citas` con `estado='Confirmada'`, `costo_cita` desde `tarifas_servicio` y vínculo en `cita_producto` para los productos instalados.
5. **Seguimiento**: `GET /pedidos/mis-pedidos` y `GET /pedidos/{id}/seguimiento` muestran pasos `Confirmado→Asignado→Recogido→En camino→Entregado`, datos del técnico, evidencias, ubicación GPS en vivo (`ubicaciones_tecnico`) y ubicación compartida del cliente (`POST /pedidos/{id}/ubicacion`).
6. **Post-servicio**: califica al técnico (`POST /calificaciones`), solicita devolución (`POST /devoluciones/solicitudes` con evidencia) y descarga facturas (`GET /pedidos/{id}/factura` con `StreamingResponse`).

### Flujo del administrador

Autenticado con rol `admin` (gate `_admin` en cada router verifica `RolesUsuario.nombre_rol in ('admin','administrador')` `productos.py:197`). En `AdminLayout` (`fe/src/components/layout/AdminLayout.tsx`) accede a:

- **Productos/Catálogo** (`/admin/productos`, `/admin/catalogo`): tablas con estado, stock, visibilidad, descuentos; `POST /productos/upload-imagen` → MinIO, `POST /productos` y `PUT /{id}` con especializaciones y reabastecimiento por correo a proveedor.
- **Técnicos** (`/admin/tecnicos`): lista con calificación promedio (`func.avg(calificaciones)`), especializaciones, activación/desactivación (que dispara `asignacion_service.desactivar_tecnico_proceso` con reasignación automática o cancelación+reembolso), historial.
- **Instalaciones/Citas** (`/admin/instalaciones`): todas las `citas` (`GET /citas/all-admin`), reasignar técnicos/fechas/horas (`PUT /citas/admin/{id}` con `_validar_tecnico_cita` y cálculo de `duracion_estimada_cita`), ver `horas-disponibles` y `tecnico-ocupado`.
- **Pedidos/Facturas/Reportes** (`/admin/pedidos`, `/admin/facturas`, `/admin/reportes`): todos los `pedidos` (`GET /pedidos/all-admin`), entregas con rango (`GET /pedidos/admin/entregas`), reasignación de `id_tecnico_entrega` con `tecnico_libre_en_rango`, descarga `GET /reports/pdf` con filtros `fecha_inicio/fecha_fin`.
- **Clientes/Notificaciones/Devoluciones/Consultas**: CRUD y resolución de estados, envío de notificaciones masivas por promoción/nuevo producto.

### Flujo del técnico

Login con `id_rol_u=2` → `TechnicianLayout` (`fe/src/components/layout/TechnicianLayout.tsx`, `movil/app/(tecnico)/_layout.tsx`) y rutas `RoleRoute allowed=['tecnico']`:

1. Ve **dashboard** con KPIs, **mis-citas** (`GET /tecnicos/mis-citas` filtra `id_tecnico/id_tecnico_2/id_tecnico_3`), filtra por estado.
2. Abre cita, consulta `productos` vinculados (`cita_producto`), cliente (`cliente_info`), comisión y evidencias previas.
3. **Sube evidencias** (`POST /tecnicos/citas/{id}/evidencias` con `UploadFile` → MinIO `evidencias_citas/<uuid>`; verificadas `Pillow` y límite 5 MB — `tecnicos.py:1109`), reagenda (`PUT /tecnicos/citas/{id}/reagendar` valida `_validar_franja_cita` y `slot_tomado`), consulta `horas-disponibles` y `proxima-fecha`.
4. **Finaliza** con `PUT /tecnicos/citas/{id}/estado {"estado":"Finalizada"}` (gate: solo `id_tecnico` principal y con evidencia existente — `tecnicos.py:849`); el cliente recibe correo y notificación de estado.
5. **Entregas** (`GET /tecnicos/mis-entregas`): ve rango `hora_entrega/hora_entrega_fin`, cliente y productos, sube múltiples fotos (`POST /tecnicos/entregas/{id}/evidencias` → `evidencias_entrega/<uuid>`), cambia estado a `En camino`/`Entregado` (`PUT /tecnicos/entregas/{id}/estado` — `Entregado` exige fotos) y reporta GPS (`POST /tecnicos/ubicacion` → `ubicaciones_tecnico`).
6. Gestiona especializaciones (`POST /mis-especializaciones/{id}`), ve comisiones (`GET /tecnicos/comisiones`) y clientes asignados (`GET /tecnicos/mis-clientes`).

Todos los flujos mantienen el estilo oscuro con acentos dorados (`NeodomusColors` `#caa24d/#ffd700` en `fe/src/styles/globals.css` y `movil/constants/theme.ts:12`) y toasts centralizados.

---

## 4. Arquitectura general del proyecto

```
                                         VISITANTE / CLIENTE / TÉCNICO / ADMIN
                                                         │
                               ┌───────────────────────────┼───────────────────────────┐
                               │                           │                           │
                               ▼                           ▼                           ▼
                        Navegador Web                App Expo (iOS/Android)       Google OAuth
                      (React 18 + Vite)           (React Native + Expo Router)   (Identity Services)
                     fe/src/App.tsx:68             movil/app/_layout.tsx:53
                               │                           │                           │
                               │  VITE_API_URL             │  EXPO_PUBLIC_API_URL      │
                               │  http://localhost:8000/api/v1 │ + /api/v1               │
                               └───────────────┬───────────┘
                                               │
                                               ▼
                                         BACKEND REST
                                      FastAPI + Uvicorn
                                      be/app/main.py:68
                                   lifespan(scheduler)  CORS externo
                                     16 routers /api/v1 ──── middleware pila
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    │                          │                          │
                    ▼                          ▼                          ▼
               MySQL 8.0                  MinIO (S3)               StaticFiles
            docker db:3306              docker minio:9000       /uploads · /evidencias
         be/app/database.py:18       minio_data/ host (ninio_data)  fallback legado
          SQLAlchemy 2.0 +            bucket neodomus-media
           Alembic 0050              be/app/services/minio_service.py:32
                    │                          │
                    └───────────┬──────────────┘
                                │
               ┌────────────────┼────────────────┐
               ▼                ▼                ▼
          APScheduler      SMTP / Resend     ReportLab/openpyxl
       tareas_programadas  email transac.    facturas PDF
```

La web y la app móvil no se comunican entre sí; ambas consumen el mismo backend JSON. El backend es la única fuente de verdad para stock, agenda y pagos simulados. MinIO es persistente en `minio_data/` y público para lecturas; las claves de evidencias y productos se resuelven a `MINIO_PUBLIC_ENDPOINT/BUCKET/clave`. No hay WebSockets: la sincronización de catálogo usa polling 15–30 s (`ProductoDetalle.tsx:233`, `ProductosPublicos.tsx:94`, `productos.tsx:132`) y las notificaciones son pull (`GET /notificaciones/mias`).

---

## 5. Tecnologías utilizadas

### 5.1 Lenguajes de programación

| Lenguaje | Dónde se usa | Para qué |
|---|---|---|
| **TypeScript 5.9.3** | `fe/` (100% componentes, contexts, services, 847 líneas `ProductoDetalle.tsx`) y `movil/` (todos los `services/` y `app/`) | tipado de productos/citas/pedidos, props de `ProductoCard` y validación de formularios |
| **JavaScript (JSX/TSX)** | idem | render React, hooks, efectos, navegación |
| **Python 3.12** | `be/app/**` (29 modelos, 16 routers, 13 services, 50 migraciones) | lógica de negocio, validaciones, JWT, almacenamiento |
| **SQL** | MySQL 8.0 (DDL en `scripts/init_db.sql` y `be/alembic/versions/*.py`) | esquema relacional, índices (`ix_citas_id_cliente`), FK y consultas `ilike`/`exists` |
| **CSS** | `fe/src/styles/*.css` (1309 líneas `productos-publicos.css`, 973 líneas `producto-detalle.css`) | catálogo oscuro, tarjetas `card-producto`, carrusel `detalle-recomendados-grid`, responsive con `Flexbox`/`Grid`/`gap`/`min-height` y sin posiciones absolutas |
| **HTML** | `fe/index.html` | shell Vite, meta `lang`, fuentes `Inter`/`Montserrat` |

### 5.2 Frameworks

#### Frameworks utilizados

| Área | Framework | Versión (archivo) | Propósito |
|---|---|---|---|
| Frontend web | **React** | `18.3.1` (`fe/package.json:14`) | componentes, estado local y contextos (`CartContext`, `AuthContext`) |
| Frontend web | **Vite** | `5.4.21` (`fe/package.json:28`, `fe/vite.config.ts:5`) | bundler, dev server `host:true:5173`, aliases `@components/@services` y polling watch |
| Frontend web | **React Router DOM** | `7.18.0` (`fe/package.json:17`) | `Routes` en `App.tsx:68` con `MainLayout`/`AdminLayout`/`TechnicianLayout` y `ProtectedRoute`/`RoleRoute` |
| Backend | **FastAPI** | `0.115.0` (`be/pyproject.toml:7`) | definición de 16 `APIRouter(prefix=...)`, validación con Pydantic, `StaticFiles` y `lifespan(scheduler)` |
| Backend | **Uvicorn** | `0.30.0` con `standard` | servidor ASGI `uvicorn app.main:app --host 0.0.0.0 --port 8000` (`be/Dockerfile:14`, `be/app/main.py:215`) |
| Backend | **SQLAlchemy** | `2.0.30` | ORM `DeclarativeBase` (`be/app/database.py:31`), relaciones y pool `pool_pre_ping` |
| Backend | **Alembic** | `1.13.2` | `uv run alembic upgrade head` (head `0050`), versionado no destructivo |
| Aplicación móvil | **React Native** | `0.81.5` (`movil/package.json:43`) | render nativo, `FlatList` virtualizada, `Pressable` y `StyleSheet` |
| Aplicación móvil | **Expo SDK** | `54.0.37` (`movil/package.json:22`) | toolchain, plugins `expo-router`/`expo-image-picker`/`expo-location`, `app.json` con `scheme: movil` y permisos |
| Aplicación móvil | **Expo Router** | `6.0.24` (`movil/package.json:34`, `main: expo-router/entry`) | enrutado por carpetas `app/(tabs)` y `app/(tecnico)` con `Stack` y `unstable_settings.anchor: (tabs)` |

### 5.3 Librerías principales

| Librería | Área | Propósito |
|---|---|---|
| `axios 1.8.4` | Frontend | cliente HTTP `fe/src/services/api.ts:33` (base `VITE_API_URL`, interceptor de refresh `POST /auth/refresh`, `withCredentials:false`, timeout 15 s) |
| `framer-motion 12.40.0` | Frontend | animaciones de modales `AuthModalHost`, `CompletarDatosModal` y hero |
| `react-icons 5.6.0` | Frontend | `FaHeart/FaCheck/FaTruckFast/FaChevron*` en detalle y tarjetas |
| `@react-oauth/google 0.12.1` | Frontend | botón Google `GoogleOAuthProvider` + `useGoogleLogin` |
| `pydantic 2.7.0` + `pydantic-settings 2.3.0` | Backend | `ProductoResponse`, `CitaCreate`, `Settings(BaseSettings)` con `model_validator` fail-fast en prod (`be/app/config.py:87`) |
| `python-jose[cryptography] 3.3.0` | Backend | `jose.jwt.encode/decode` `HS256` en `app/utils/security.py` |
| `passlib[bcrypt] 1.7.4` + `bcrypt 4.0.1` | Backend | `CryptContext(schemes=["bcrypt"])` para `password_hash` |
| `python-multipart 0.0.9` | Backend | `UploadFile` para `upload-imagen` y evidencias |
| `minio 7.2.20` | Backend | `Minio(endpoint, access_key, secret_key, secure)` en `minio_service.py:36`, `put_object`, `bucket_exists/make_bucket/set_bucket_policy`, `remove_object` |
| `Pillow >=10` | Backend | `Image.open(BytesIO).verify()` y límite 5 MB en uploads (`routers/productos.py:817`, `tecnicos.py:1063`) |
| `reportlab 4.2.0` | Backend | `generar_factura_pdf` (`services/factura_service.py`) y `StreamingResponse` en `/pedidos/{id}/factura` |
| `openpyxl 3.1.5` | Backend | exportación Excel de reportes (`routers/reports.py`) |
| `slowapi 0.1.9` | Backend | `limiter` y handler `RateLimitExceeded` (`middleware/rate_limit.py`, `main.py:100`) |
| `email-validator 2.1.0` | Backend | validación `EmailStr` en schemas `auth` |
| `google-auth 2.35.0` + `requests 2.31` | Backend | verificación `id_token.verify_oauth2_token` para Google Sign-In |
| `apscheduler 3.11.3` + `tzdata` | Backend | `iniciar_scheduler/detener_scheduler` (`services/scheduler.py`, `tareas_programadas.py`) para recordatorios y cierres |
| `alembic 1.13.2` + `pymysql 1.1.0` | Backend | migraciones y driver MySQL `mysql+pymysql://` |
| `expo-image 3.0.11` | Móvil | `<Image contentFit="cover" cachePolicy="memory-disk" transition>` en `ProductCard.tsx:151` y `producto/[id].tsx:269` |
| `expo-image-picker 17.0.11` | Móvil | `launchImageLibrary` para captura de evidencias y foto de perfil |
| `expo-file-system/legacy 19.0.24` + `expo-sharing 14.0.8` | Móvil | `downloadAsync` + `shareAsync` de facturas PDF (`movil/services/cliente.services.ts:177` `descargarFacturaPdf`) |
| `expo-location 19.0.8` | Móvil | `getCurrentPositionAsync` y `compartirUbicacionCliente` (`cliente.services.ts:554`) |
| `@react-native-async-storage/async-storage 2.2.0` | Móvil | `getItem/setItem` para `access_token`, `FavoritosContext` y `CartContext` |
| `@react-navigation/bottom-tabs 7.4.0` | Móvil | tabs nativos `movil/app/(tabs)/_layout.tsx` con 5 pestañas |
| `expo-auth-session 7.0.11` + `expo-crypto 15.0.9` + `expo-web-browser 15.0.11` | Móvil | PKCE OAuth vía `movil://auth?access_token=&refresh_token=&rol=` procesado en `_layout.tsx:55` |
| `expo-constants 18.0.14` | Móvil | `hostUri` para derivar IP LAN de `BACKEND_HOST_URL` si `EXPO_PUBLIC_API_URL` no está definido (`constants/api.ts:12`) |

---

## 6. Frontend web

- **Tecnología / framework**: React 18 + Vite 5 + TS 5.9 + React Router 7, sin UI kit externo; estilos por feature en CSS, fuentes `Inter`/`Montserrat` y modo oscuro forzado con `NeodomusColors` (`fe/src/styles/globals.css`).
- **Organización**: `src/pages/` por rol (`public/` visitantes, `cliente/` perfil/citas/tecnicos, `tecnico/` dashboard/citas/entregas/clientes, `admin/` productos/tecnicos/pedidos/instalaciones/reportes, `legal/` y `Home/`); `src/components/` por dominio (`layout/` tres layouts, `productos/ProductoCard`, `profile/*`, `auth/AuthModalHost`); `src/contexts/` (`AuthContext` con `sessionStorage` por pestaña `tabGet/tabSet`, `CartContext` con `localStorage` por email, `IdiomaContext`); `src/services/api.ts` singleton `axios.create(baseURL=VITE_API_URL)` y `src/utils/` (favoritos, copyPaste).
- **Componentes**: `ProductoCard` (`ProductoCard.tsx:43` `export interface ProductoCardData`) es el único componente reutilizado: renderiza imagen con `getImagen(p)` (`p.imagen_url || /productos/${id}.jpg`), fav (SVG heart), badges `Nuevo/Promoción`, categoría, `Requiere N técnicos`, bloque precio con/bajo `venta_por_metros`, stock pill con dot verde/amarillo/rojo, chips de variantes (hex `+ etiqueta_medida`), selector de metros (10–50) y control de cantidad con `inputMode="numeric"` y `onBlur` de validación contra `stockTotal`, botón `Agregar al carrito` con `CartContext.addItem`. El detalle (`ProductoDetalle.tsx:144`) replica la lógica pero gobernada por `varianteActiva` (color × medida) y muestra además combos elegibles y beneficios.
- **Rutas**: `App.tsx:68` declara `MainLayout` (público), `RoleRoute allowed=['cliente']` → `Perfil/CitasPage/TecnicosPage`, `RoleRoute allowed=['tecnico']` → `TechnicianLayout` y `RoleRoute allowed=['administrador']` → `AdminLayout`; `Routes` usa `ScrollToTop`, `AuthModalHost` (modales `transparentModal`), `CompletarDatosModal` (post-registro), `ChatBotGate` (oculto para admin/tecnico) y `Navigate to /` fallback.
- **Estilos**: `productos-publicos.css` define `.productos-grid` `repeat(4,1fr)` → `3` a 1400px → `2` a 1000px → `1` a 700px, `.card-producto` `linear-gradient` con `hover translateY(-8px)` y `border-color rgba(211,172,77,0.55)`, `.producto-footer` con `margin-top:auto` y `gap:5px`, `.cantidad-control`/`.metros-select` `border-radius:999px` rediseñado a `10px` en `min-width:701px`; `producto-detalle.css` define `.detalle-layout grid 1fr 1.15fr` → `1fr` a 950px, `precio-bloque`, `detalle-cantidad`, `detalle-recomendados-grid` horizontal `flex gap16 scroll-snap` con tarjetas `260px min-height:520px` (`190px/500px` móvil).
- **Consumo de API**: `api.ts:154` crea `axios` con `baseURL=VITE_API_URL||'/api/v1'`, `Content-Type json`, interceptores de request que añaden `Authorization: Bearer tabGet(access_token)` y normalizan `FormData`, y de response que convierten 422 a string y en 401 intentan `POST ${BASE_URL}/auth/refresh {refresh_token}` vía `axios.post` directo (evita bucle) para guardar nuevos tokens y reintentar, o `clearSession` si `authError` y no está `__neodomus_validando_sesion`.
- **Principales pantallas**: `ProductosPublicos` (catálogo, paginación con elipsis `getPageNumbers`), `ProductoDetalle` (detalle + recomendados), `CarritoPage` (totales y edición), `CheckoutPage` (form pago simulado y entrega), `ClientDashboard`/`Perfil`/`CitasPage`/`TecnicosPage`, `TechnicianDashboard`/`TecnicoCitas`/`TechnicianEntregas`/`Calificaciones`, `AdminDashboard` + 10 subpáginas admin.

---

## 7. Backend

- **Lenguaje/framework**: Python 3.12 + FastAPI (`be/app/main.py:68` `FastAPI(title="Neodomus API", lifespan=lifespan)`), ejecutado por Uvicorn con reload en dev. Dependencias con `uv` (`pyproject.toml:5`), build `hatchling`.
- **Estructura**: `app/config.py:18` `Settings(BaseSettings)` centraliza 25 campos con `model_config env_file=".env"`, `app/database.py:18` crea `engine=create_engine(DATABASE_URL, pool_pre_ping, pool_recycle=3600)` y `SessionLocal`; `app/main.py:100` aplica `setup_rate_limit → setup_security_headers → setup_cors` (orden LIFO: CORS externo), monta 16 routers con `prefix="/api/v1"` (`routers/__init__.py:1`) y expone `StaticFiles` `/uploads` y `/evidencias` (`main.py:141`) además de `GET /` y `/health`; `app/middleware/` implementa `cors.py` (origins `FRONTEND_URL`), `security_headers.py` (`X-Frame-Options`, `nosniff`) y `rate_limit.py`.
- **Rutas/controladores/services**: cada `routers/*.py` declara `APIRouter(prefix=..., tags=...)`; handlers usan `Depends(get_db)` y `Depends(get_current_*)` para JWT. `productos.py` expone `GET /` con `_empleado_opcional` y filtro invitado (`visible_cliente`+`exists stock>5`), `GET /categorias`, `GET /{id}`, `POST /upload-imagen` (admin, `File`→MinIO), `POST /`/`PUT /{id}` con `_vincular_especializaciones_automatico` y notificaciones a clientes; `citas.py` expone `POST /` (crea `Confirmada` con `slot_tomado`/`tecnico_ocupado`), `GET /horas-disponibles`/`/tecnico-ocupado`, `PUT /admin/{id}` (hasta 3 técnicos y comisión `Decimal`), `GET /admin/reasignar-pendientes`; `pedidos.py` (`POST /` → `pedidos_service.crear_pedido` con `pagos_service.procesar_pago` y factura PDF, `GET /mis-pedidos`, `GET /admin/entregas`, `PUT /admin/{id}/entrega`); `tecnicos.py` y los 9 routers restantes completan devoluciones, reembolsos, calificaciones, notificaciones y `reports.py` (PDF con `reportlab`).
- **Modelos**: `be/app/models/` con 29 clases `Mapped` (`Base(DeclarativeBase)`). Claves: `User(id_usuario)`, `Cliente(id_cliente, first_name/last_name/email unique)`, `Tecnico(id_tecnico, id_usuario_t→usuarios, certificacion_t, especializaciones N:N)`, `Producto(id_producto, nombre/marca/venta_por_metros/referencia única, imagen_url, id_cate_pr/proveedor, precio_venta, stock_producto, visible_cliente, tiene_medidas, variantes→ProductoVariante)`, `Cita(id_cita, id_cliente→clientes CASCADE, id_tecnico/2/3 denormalizados, tipo_servicio, fecha/hora/direccion/descripcion, estado, costo_cita, metodo/estado_pago, id_comision_c, recordatorio_enviado, especializacion)`, `Pedido/DetallePedido`, `Evidencia/EvidenciaEntrega` y 19 tablas auxiliares (`notificaciones`, `pagos`, `facturas`, `calificaciones`, `reembolsos`, `ofertas_horario`, `ubicaciones_tecnico`...).
- **Validaciones**: Pydantic en `schemas/` (`auth.py`, `cita.py:24` `CitaCreate` con `metodo_pago+datos_pago`), validaciones imperativas (fechas laborables `_dia_es_laboral`, horas dentro de `08:00–18:00`, solapamiento ` _se_solapan`, stock `>5`, tamaño archivo ≤5 MB, `Pillow.verify()`), y `model_validator` en producción para `SECRET_KEY`/`DATABASE_URL`/`MINIO_SECRET_KEY`.
- **Comunicación con BD**: cada endpoint `db: Session = Depends(get_db)` (`database.py:35` `yield`+`close`), queries `db.query/execute/select`, transacciones `commit/rollback` y `flush/refresh` para FKs, ` IntegrityError` → `HTTPException 400`.
- **Principales funcionalidades de API**: ver tabla de 9 módulos en sección 13; atomizadas por rol, con rate-limit en `auth/login/refresh`, CORS restrictivo y `SecurityHeaders`.

---

## 8. Aplicación móvil

- **Tecnología/framework**: `movil/package.json:41` `react 19.1.0` + `react-native 0.81.5` + `expo 54.0.37` + `expo-router 6.0.24` + `typescript 5.9.2`; build `app.json:32` plugins `expo-router/splash-screen/font/location/image-picker`, `scheme: movil`, `newArchEnabled:true`, `edgeToEdgeEnabled:true`.
- **Organización**: `movil/app/_layout.tsx:40` `RootLayout` con `SafeAreaProvider→AuthProvider→CarritoProvider→FavoritosProvider→CookieConsentProvider→IdiomaProvider→NavegacionRaiz (Stack)`; `Stack` registra `(tabs)` (anchor), `(tecnico)` y modales `login/registro/verificar-correo/recuperar-password/codigo-seguridad/nueva-password` como `transparentModal` más `terminos/privacidad/cookies/centro-privacidad/contacto/ayuda` como páginas push. `app/(tabs)/` contiene 5 tabs (`index`(Home), `productos.tsx` catálogo, `producto/[id].tsx` detalle, `carrito.tsx`, `perfil`+subpáginas cliente); `app/(tecnico)/` duplica el área técnico con 6 pantallas; `components/public/ProductCard.tsx` es la tarjeta móvil homóloga de la web; `services/` replica `productos.service`, `api.ts`, `cliente.services.ts`; `constants/` guarda `api.ts` y `theme.ts`/`variantes.ts`.
- **Navegación**: `expo-router` file-based con `Link`/`router.push` y `useSegments` para redirección por rol (`NavegacionRaiz` mueve a `/(tecnico)` si `usuario.rol==='tecnico'` y viceversa); `PublicNavbar` fijo fuera de `FlatList` virtualizada para evitar jerarquía `ScrollView+FlatList`; `AsistenteFlotante` flotante global.
- **Principales pantallas**: `productos.tsx` (búsqueda `TextInput`, chips de categoría con `FlatList` horizontal, `FlatList numColumns=2` con `columnWrapperStyle gap`, pull-to-refresh, infinite `onEndReached`, logs `__DEV__` por escenario A–D), `producto/[id].tsx` (imagen con `expo-image`, chips categoría/técnicos, precio con `formatearPrecio`, stock, paleta `paletaDeColores` y swatches `hex`, medidas derivadas `medidaDe`, selector metros, contador con `TextInput` y validación `onBlur`, `detalle-recomendados` horizontal `FlatList` de 140px cards), `(tecnico)/` dashboard, citas, entregas con lista de productos y estado, clientes, mensajes, historial con `FlatList`, perfil con foto.
- **Comunicación con backend**: `movil/constants/api.ts:28` `API_BASE_URL = (EXPO_PUBLIC_API_URL || obtenerHostDesdeExpo() || "10.0.2.2:8000") + "/api/v1"` y `BACKEND_HOST_URL` base sin `/api/v1`; `services/api.ts` implementa `apiFetch(path, init)` con `Authorization: Bearer token` (`AsyncStorage`), JSON por defecto y retry de refresh; `services/productos.service.ts:71` `listarProductos()` → `GET /productos/?limit=100` (barra final obligatoria), `obtenerProducto(id)` → `GET /productos/:id`, `listarTecnicosPublicos`, `listarMisCitas`, `crearCita`, `crearPedido`, `descargarFacturaPdf` (descarga `expo-file-system/legacy` con header `Authorization` y `Sharing.shareAsync`).
- **Manejo de imágenes**: `urlImagenProducto(producto, variante?)` (`productos.service.ts:117`) elige `variante.imagen_url || producto.imagen_url` o fallback `${BACKEND_HOST_URL}/uploads/${id}.jpg`, las hace absolutas con `BACKEND_HOST_URL` y luego `normalizarUrlImagen` reescribe `localhost:9000/minio:9000/127.0.0.1:9000/::1:9000` → `${hostMinio}` y `localhost:8000/...` → `${hostBackend}` para que el emulador (`10.0.2.2`) y el físico (IP LAN de `hostUri`) vean MinIO; `ProductCard.tsx:151` `<Image source={{uri:imagen}} contentFit="cover" cachePolicy="memory-disk" onError={()=>setFalloImagen(true)}>` con placeholder `box-open`.
- **Ejecución**: `pnpm start` (Metro con QR → Expo Go), `pnpm android` (`expo start --android`), `pnpm ios` / `pnpm web`; `movil/.env.example:15` documenta `EXPO_PUBLIC_API_URL=http://72.28.32.1:8000` y la variante `10.0.2.2:8000` para emulador; firewall LAN para 8000/9000 y `host.minio:9000` → console `:9001`.

---

## 9. Base de datos

- **Qué BD utiliza**: **MySQL 8.0** (`docker-compose.yml:3` `image: mysql:8.0`, `container_name: neodomus_mysql`, `MYSQL_DATABASE=neodomus`, `ports: "3307:3306"`, `healthcheck: mysqladmin ping`, `volumes: mysql_data:/var/lib/mysql`). Conexión vía `mysql+pymysql://` (`be/app/config.py:25` `DATABASE_URL` y `be/app/database.py:18`).
- **Cómo se conecta el backend**: `create_engine(settings.DATABASE_URL, pool_pre_ping=True, pool_recycle=3600)` + `sessionmaker(autocommit=False, autoflush=False)` (`database.py:25`); cada request inyecta `Session` con `get_db() -> Generator[Session]` (`database.py:35` `yield`/`finally close()`), validada por `pymysql` y Alembic.
- **Qué ORM/tecnología**: **SQLAlchemy 2.0** (`DeclarativeBase` en `database.py:31`, typing `Mapped/mapped_column`, relaciones `relationship` con `lazy="selectin"` y `cascade="all, delete-orphan"` para variantes y `cita_producto`), **Alembic 1.13.2** con 50 scripts en `be/alembic/versions/` (head `0050`, `autoincrement` en MySQL) y `init_db.sql` idempotente en `scripts/` como respaldo SQL.
- **Entidades principales** (`be/app/models/*.py`):

| Entidad | Tabla | Claves / campos |
|---|---|---|
| Cliente | `clientes` | `id_cliente PK`, `email unique`, `first_name/last_name`, `password_hash`, `is_active`, `auth_provider/google_id`, `foto_url` (`cliente.py:28`) |
| Usuario (empleado) | `usuarios` | `id_usuario PK`, `email unique`, `id_rol_u→roles_usuario`, `is_active`, `desactivado_hasta`, `foto_url` (`user.py:24`) |
| Tecnico | `tecnicos` | `id_tecnico PK`, `id_usuario_t→usuarios`, `certificacion_t`, `especializaciones N:N` (`tecnico.py:22`) |
| Producto | `productos` | `id_producto PK`, `nombre_producto`, `marca`, `venta_por_metros`, `referencia unique`, `imagen_url`, `id_cate_pr/proveedor`, `precio_venta`, `stock_producto`, `visible_cliente`, `tiene_medidas`, `variantes` (`producto.py:27`) |
| ProductoVariante | `producto_variantes` | `id PK`, `id_producto→productos`, `nombre`, `hex`, `tamaño`, `ancho_cm/alto_cm`, `precio`, `imagen_url`, `stock` (`producto_variante.py`) |
| Categoria/Proveedor | `categorias`/`proveedores` | `id_categoria/nombre_categoria`, `id_proveedor/nombre_proveedor` |
| Cita / Instalación | `citas` | `id_cita PK`, `id_cliente→clientes CASCADE`, `id_tecnico/2/3`, `nombre_tecnico*_denorm`, `tipo_servicio`, `fecha/hora/direccion/descripcion`, `estado`, `costo_cita`, `metodo/estado_pago`, `id_comision_c`, `id_especializacion SET NULL`, `recordatorio_enviado` (`cita.py:30`) |
| Pedido | `pedidos` | `id_pedido PK`, `id_cliente_pe→clientes`, `total_pedido`, `estado_pedido`, `fecha_entrega/hora_entrega/_fin`, `id_tecnico_entrega`, `estado_entrega` (`pedido.py:34`) |
| DetallePedido | `detalle_pedido` | `id_detalle PK`, `id_pedido_d→pedidos`, `id_producto_d→productos`, `cantidad_detalle`, `cantidad_metros`, `precio_unitario`, `subtotal` |
| Pago/Factura | `pagos`/`facturas` | `id_pago→pedidos/citas`, `metodo/estado/monto/transaccion`, `facturas.numero_factura` (`factura.py`) |
| Calificaciones | `calificaciones`/`calificaciones_producto` | `id_calificacion`, `id_cita_c/id_tecnico_c`, `calificacion 1–5`, `comentario` |
| Notificaciones | `notificaciones` | `id_notificacion PK`, `id_cliente/id_usuario`, `tipo/titulo/mensaje/leida` (`notificacion.py`) |
| Especializaciones | `especializaciones` + `producto_especializacion`/`tecnico_especializacion` + `historial_citas`+`reembolsos` | catálogo N:N con técnicos y productos |

- **Relaciones principales**:

```
Cliente 1──N Pedido (fk clientes.id_cliente)
         1──N Cita   (fk clientes.id_cliente, ondelete CASCADE)
         1──N Notificacion

Pedido 1──N DetallePedido N──1 Producto (fk id_producto_d)
Pedido N──1 Tecnico (fk id_tecnico_entrega, nullable)

Cita N──1 Tecnico (fk no formal id_tecnico/2/3 → tecnicos.id_tecnico + nombre_tecnico* denorm)
Cita N──N Producto via cita_producto (fk id_cita/id_producto, cantidad)
Cita N──1 Comision (fk id_comision_c)
Cita N──1 Especializacion (fk SET NULL)
Cita 1──N Evidencia (fk id_cita)

Producto N──1 Categoria / Proveedor
Producto 1──N ProductoVariante (cascade delete-orphan)
Producto N──N Especializacion

Tecnico N──1 User (fk id_usuario_t)  User N──1 Rol (roles_usuario)
Tecnico N──N Especializacion

Cliente
  │
  ├─→ Pedido 1──N DetallePedido ──→ Producto ──→ Categoria
  │     │
  │     └─→ Entrega (id_tecnico_entrega) ──→ Tecnico ──→ User
  │
  └─→ Cita / Instalación N──N Producto (cita_producto)
        │
        └─→ Tecnico (+ Técnico2/3)
```

Estados: `pedidos.estado_pedido Pagado|Pago pendiente|Rechazado`, `estado_entrega Pendiente|Asignada|Recogido|En camino|Entregado`, `citas.estado Pendiente|Confirmada|Finalizada|Cancelada`, `productos.estado_producto activo|inactivo` (soft-delete a `inactivo` si hay `IntegrityError` en `DELETE /productos/{id}` `productos.py:1012`).

---

## 10. Gestión de imágenes y `ninio_data`

**Qué es `ninio_data`**: exactamente la carpeta `minio_data/` en la raíz del repo. No es una librería distinta: es el volumen host del servicio **MinIO** (objeto-compatible S3) declarado en `docker-compose.yml:88` `volumes: ["./minio_data:/data"]` con `command: server /data --console-address ":9001"` (`docker-compose.yml:89`). El contenedor es `elestio/minio:latest` (`docker-compose.yml:78`) con `ports 9000:9000` (API S3) y `9001:9001` (consola), en `networks: neodomus_net`. El bucket por defecto es `neodomus-media` (`be/app/config.py:75`), accesible a la red `api→minio` en `minio:9000` y al mundo externo en `MINIO_PUBLIC_ENDPOINT` (`http://localhost:9000` por defecto).

**Dónde está configurado**:

- `.env(.example:40)` → `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_ENDPOINT`, `MINIO_PUBLIC_ENDPOINT`, `MINIO_BUCKET`.
- `docker-compose.yml:32` expone `MINIO_ENDPOINT= minio:9000` y `MINIO_PUBLIC_ENDPOINT` a `api`; `minio:77` lee `MINIO_ROOT_USER/PASSWORD`.
- `be/app/config.py:72` mapea `MINIO_ENDPOINT/MINIO_ACCESS_KEY/MINIO_SECRET_KEY/MINIO_BUCKET/MINIO_PUBLIC_ENDPOINT/MINIO_SECURE` y `app/services/minio_service.py:32` es el único cliente.

**Cómo se cargan las imágenes**:

1. Inspector de formato (`EXTENSIONES_IMAGEN {".jpg",".jpeg",".png",".webp",".gif"}`) + `file.read()` + límite 5 MB + `Pillow Image.verify()` (`routers/productos.py:817`). Para evidencias el flujo es idéntico (`routers/tecnicos.py:1051` con `subir_imagen("evidencias_citas", nombre, contenido)`).
2. Nombre `f"{uuid.uuid4().hex}{ext}"` y carpeta lógica (`productos`, `evidencias_citas`, `evidencias_entrega`).
3. `minio_service.subir_imagen(carpeta, nombre, contenido)` (`minio_service.py:77`) hace `Minio(settings.MINIO_ENDPOINT, secure=settings.MINIO_SECURE).put_object(BUCKET, f"{carpeta}/{nombre}", BytesIO(contenido), len(contenido), content_type=CONTENT_TYPES[ext])` y devuelve `url_publica(f"{carpeta}/{nombre}")` = `f"{MINIO_PUBLIC_ENDPOINT}/{BUCKET}/{carpeta}/{nombre}"` (`minio_service.py:72`). La primera llamada invoca `_asegurar_bucket` que `make_bucket` si no existe y `set_bucket_policy` con `Allow s3:GetObject` público (`minio_service.py:49`).
4. El handler guarda `producto.imagen_url = url` (`productos.py:822`) o `variante.imagen_url` o `evidencias_citas/evidencias_entrega` claves (`url_archivo = f"{carpeta}/{nombre}"`) y el estado se commitea.
5. Semillado/migración: `scripts/subir_productos_minio.py:61` itera `Path("/app/productos_local")` (bind `fe/public/productos` `docker-compose.yml:69`) con `producto_id=int(img.stem)` y `be/scripts/migrar_a_minio.py:60` convierte `/uploads/x.jpg` y claves de evidencia sin `/` a URLs MinIO; ambos preservan ya-MinIO (`_es_de_minio`).

**Cómo se almacenan**: como objetos S3 en MinIO bajo `neodomus-media/productos/`, `evidencias_citas/`, `evidencias_entrega/`, `fotos_perfil/` (keys planas, sin sub-buckets), con `content_type` inferido (`CONTENT_TYPES`). Persistidos en `minio_data/` del host, ignorados por git (`.gitignore:60` `minio_data/`). Eliminables con `eliminar_objeto(clave)` (`minio_service.py:95`) y `eliminar_imagen_producto(url)` que recorta el prefijo `MINIO_PUBLIC_ENDPOINT/BUCKET/`.

**Cómo se relacionan con productos**: `productos.imagen_url varchar(255)` (`producto.py:38`) y `producto_variantes.imagen_url varchar(255)` (`producto_variante.py`) guardan la URL pública absoluta; `cita_producto` no guarda imagen propia sino el `producto_variante.imagen_url` correspondiente. La migración respetó `producto_especializacion` y `tecnico_especializacion`.

**Cómo el backend las gestiona**: además de `upload-imagen`, el backend sirve fallback legado `mount("/uploads", StaticFiles(PRODUCTOS_IMG_DIR))` y `mount("/evidencias", ...)` (`main.py:141`) para rutas antiguas `/uploads/<archivo>` mientras la migración completa no termina. La lectura de evidencias resuelve `"/" in url_archivo` → `url_publica(url_archivo)` sino `f"/evidencias/{url_archivo}"` (`tecnicos.py:82`).

**Cómo se visualizan en web**: `ProductoDetalle.tsx:202` `const imagen = varianteActiva?.imagen_url || producto?.imagen_url || /productos/${id}.jpg` con `<img src={imagen} onError={e=>e.currentTarget.src='/productos/default.png'}>` (`ProductoDetalle.tsx:437`); `ProductoCard.tsx:79` `getImagen(p)=p.imagen_url||/productos/${id}.jpg` con idem. Como MinIO tiene `set_bucket_policy` pública, el navegador resuelve `http://localhost:9000/neodomus-media/productos/x.jpg` (o el host configurado) sin auth. El carrusel **Más recomendados** consume las mismas URLs a través de `ProductoCard`.

**Cómo se visualizan en móvil**: `movil/services/productos.service.ts:88` deriva `hostMinio=${protocol}//${hostname}:9000` de `BACKEND_HOST_URL` y reescribe cualquier `localhost:9000/127.0.0.1:9000/minio:9000/::1:9000` y `localhost:8000/minio:8000/...` a `hostMinio/hostBackend` para que el dispositivo físico/emulador (donde `localhost` ≠ PC) alcance el host LAN. `ProductCard.tsx:151` usa `expo-image` `cachePolicy="memory-disk"` con `onError` a placeholder `box-open`. Descarga de facturas en `cliente.services.ts:177` reusea la misma idea de reescritura `hostname` antes de `downloadAsync`.

---

## 11. Autenticación y roles

**Autenticación** (`be/app/utils/security.py` y `be/app/routers/auth.py`):

- **Registro**: `POST /auth/register` valida `email_validator`, genera `password_hash=bcrypt.hash`, crea `Cliente` con `is_active=False` y `EmailVerificationToken` (`email_verification_tokens`, expira `VERIFICATION_TOKEN_EXPIRE_HOURS=24`), envía `verification_token` por `EmailProvider` (`smtp/gmail_api/resend` según `EMAIL_PROVIDER` `config.py:50`).
- **Login**: `POST /auth/login` acepta `email+password` para `clientes` o `usuarios` (según `RolesUsuario`), verifica `bcrypt.verify`, emite `access_token=jwt.encode({sub=email, uid=id, user_type, rol, exp=now+ACCESS_TOKEN_EXPIRE_MINUTES})` y `refresh_token` (`exp=+REFRESH_TOKEN_EXPIRE_DAYS`) firmados `HS256` con `SECRET_KEY` (`config.py:28`), retornando `{access_token, refresh_token, user}`. Estado `is_active=False` bloquea (`403`).
- **Refresh**: `POST /auth/refresh {refresh_token}` → nuevo `access_token` si `jose.jwt.decode` válido y no expirado; el interceptor web lo llama en 401 (`api.ts:106` `refreshAccessToken`).
- **Recuperación**: `POST /auth/request-password-reset` → `PasswordResetToken` (`password_reset_tokens`, expira `PASSWORD_RESET_TOKEN_EXPIRE_MINUTES=10` `config.py:36`), envía código `123345+InicialMayus+inicialMinus+.` (patrón seeds); `POST /auth/verify-reset-code` + `POST /auth/reset-password` re-hashean.
- **Google Sign-In**: verifica `id_token` con `google.oauth2.id_token.verify_oauth2_token(GOOGLE_SIGNIN_CLIENT_ID)` (`be/app/utils`), crea o linkea `clientes` con `auth_provider='google'` y `google_id`, emite tokens JWT propios. Frontend web usa `@react-oauth/google` `GoogleOAuthProvider` (`fe/src/main.tsx`) y `useGoogleLogin`; móvil usa `expo-auth-session` + `expo-web-browser` + `expo-crypto` con `scheme: movil` y deep link `movil://auth?access_token=&refresh_token=&rol=` (`movil/app/_layout.tsx:55` `Linking.addEventListener("url")`).
- **Tokens / JWT**: `python-jose` `HS256`, `ALGORITHM` y `ACCESS_TOKEN_EXPIRE_MINUTES/REFRESH_TOKEN_EXPIRE_DAYS` desde `.env`; payload mínimo `sub/email`, `uid`, `rol`, `user_type`, `exp`. `oauth2_scheme=OAuth2PasswordBearer(tokenUrl="/auth/login")`.
- **Control de sesión**: web persiste `access_token/refresh_token/user` por pestaña en `tabStorage` (`sessionStorage` wrapper `tabGet/tabSet/tabRemove` `fe/src/services/api.ts:50`), dispara `window.dispatchEvent("neodomus:sesion-expirada")` en 401 irrecuperable; móvil usa `AsyncStorage`.

**Roles reales** (según DB y `_admin` gate):

| Rol | `roles_usuario.nombre_rol` / chequeo | Qué puede hacer |
|---|---|---|
| **Administrador** | `id_rol_u=1` → `get_current_employee` + `select(nombre_rol) in ('admin','administrador')` (`tecnicos.py:223`) | todo lo de cliente+técnico además de: `GET /citas/all-admin`, `PUT /citas/admin/{id}`, `GET/PUT /pedidos/all-admin/admin/entregas`, `GET /tecnicos`/`unassigned`, `POST /productos/upload-imagen`, `POST/PUT/DELETE /productos`, `GET /reports/pdf`, `GET /notificaciones` admin |
| **Cliente** | `get_current_client` → `Cliente` activo (`is_active=True`) | `POST /citas`, `GET /citas/mis-citas`, `POST /pedidos`, `GET /pedidos/mis-pedidos`, `POST /pedidos/{id}/ubicacion`, `PUT /clients/me`, `POST /clients/me/foto`, `POST /devoluciones/solicitudes`, `GET /calificaciones/mis-dadas` |
| **Técnico** | `id_rol_u=2` → `get_current_employee` + `_ficha_tecnico_actual` (`tecnicos.py:376`) | `GET /tecnicos/mis-citas|mis-entregas|mis-clientes|comisiones`, `PUT /tecnicos/citas/{id}/estado`, `POST /tecnicos/citas/{id}/evidencias`, `POST /tecnicos/entregas/{id}/evidencias`, `PUT /tecnicos/entregas/{id}/estado`, `POST /tecnicos/ubicacion`, `POST/DELETE /tecnicos/mis-especializaciones/{id}` |
| **Visitante** | `token=None` → `_empleado_opcional` retorna `None` (`productos.py:231` lee cookie `access_token` o `Authorization`) | `GET /productos/` (solo `visible_cliente=true` y `stock>5`), `GET /productos/{id}`, `GET /productos/categorias`, `GET /tecnicos/publicos`, páginas legales/Home, carrito/favoritos locales; checkout exige `get_current_client` → 401 → modal login |

Guardas frontend: `PrivateRoute`/`RoleRoute` (`fe/src/components/layout/RoleRoute.tsx`) y `ProtectedRoute` (`fe/src/components/common/ProtectedRoute.tsx`) con `AuthContext.rol` derivado de JWT; móvil replica con `useSegments` y `router.replace("(tabs)"|"(tecnico)")` (`_layout.tsx:92`).

---

## 12. API y comunicación entre sistemas

- **Cómo se comunica frontend web ↔ backend**: `VITE_API_URL` (`.env.example:38` `http://localhost:8000/api/v1`, fallback idem en `fe/src/services/api.ts:41`) → `axios.create(baseURL, withCredentials:false, timeout:15000, responseType:json)` → interceptor request añade `Authorization` y quita `Content-Type` para `FormData` → backend `CORSMiddleware` (`be/app/middleware/cors.py:12` con `allow_origins=[FRONTEND_URL]` y `allow_credentials`, sin `*` en prod) y `SecurityHeadersMiddleware`; respuesta JSON en `response.data`. `downloadFactura` reusea el mismo `api` con `responseType:blob`.
- **Cómo se comunica móvil ↔ backend**: `movil/constants/api.ts:28` `API_BASE_URL = (EXPO_PUBLIC_API_URL || hostUri || "10.0.2.2:8000")+"/api/v1"`; `services/api.ts` `apiFetch(path, init)` envuelve `fetch(API_BASE_URL+path, {headers:{Authorization,"Content-Type":json}})`; `hostUri` via `expo-constants` es la IP LAN del PC con Metro (fallback `10.0.2.2:8000` prefijo del emulador Android).
- **Qué tipo de API**: REST JSON versionada `ka /api/v1` (`be/app/main.py:113` `include_router` x16), stateless, paginada por `page/limit`, errores `{"detail": string}` (normalizados en web de 422 array a string, `api.ts:253`).
- **Cómo se intercambia información**: JSON `application/json; charset=utf-8`; cargas de archivo como `multipart/form-data` (`FormData` con `file` fields); descargas PDF como `StreamingResponse` server `media_type application/pdf` + header `Content-Disposition: attachment; filename="factura_<numero>.pdf"` consumido como `blob`/`FileSystem.downloadAsync`.
- **Qué formato usan los datos**: fechas ISO `date` `YYYY-MM-DD` y `datetime` `ISO`; decimales como `float` en JSON (`precio_venta: 82000.0`), imágenes como `string URL`; variantes como objetos `{id,nombre,hex,tamaño,ancho_cm,alto_cm,etiqueta_medida,precio,imagen_url,stock}`.
- **Principales módulos de API** (según `be/app/routers/__init__.py:1`):

| Prefijo | Router | Descripción breve |
|---|---|---|
| `/auth` | `auth.py` | registro/login/refresh/verify-email/reset-password/Google |
| `/users` | `users.py` | CRUD usuarios admin, activación |
| `/clients` | `clientes.py` | `GET/PUT /clients/me`, `/me/foto`, `/me/cuenta-solicitud`, favoritos |
| `/tecnicos` | `tecnicos.py` | públicos, `mis-citas/mis-entregas/comisiones`, `citas/{id}/evidencias`, `entregas/{id}/estado`, `ubicacion` |
| `/productos` | `productos.py` | `GET /`, `/categorias`, `/proveedores`, `/{id}`, `/{id}/variantes`, `POST /upload-imagen`, `POST/PUT /{id}` |
| `/citas` | `citas.py` | `POST /`, `GET /all-admin`, `GET /horas-disponibles`, `GET /tecnico-ocupado`, `PUT /admin/{id}` |
| `/pedidos` | `pedidos.py` | `POST /`, `GET /mis-pedidos|all-admin/admin/entregas`, `PUT /admin/{id}/entrega`, `GET /{id}/seguimiento|factura`, `POST /{id}/ubicacion` |
| `/tarifas` | `tarifas.py` | `GET /` lista `tarifas_servicio` |
| `/calificaciones` | `calificaciones.py` | `POST /`, `GET /mis-dadas`, `GET /tecnico/{id}` |
| `/notificaciones` | `notificaciones.py` | `GET /mias`, `PATCH /leer-todas` |
| `/especializaciones` | `especializaciones.py` | catálogo `especializaciones` |
| `/reembolsos\|/devoluciones` | `reembolsos.py`/`devoluciones.py` | `GET /mis`, `POST /pedido/{id}`, `POST /solicitudes`, elegibilidad |
| `/reports` | `reports.py` | `GET /pdf?fecha_inicio=&fecha_fin=` |
| `/consultas\|/solicitudes` | `consultas.py`/`solicitudes.py` | contacto y habilitación empleado |

---

## 13. Estructura del proyecto

```
/
├── be/                              # Backend
│   ├── app/
│   │   ├── main.py                  # FastAPI + lifespan(scheduler) + routers + StaticFiles /uploads /evidencias
│   │   ├── config.py                # Settings(BaseSettings) con .env, JWT, SMTP, MinIO, validación prod
│   │   ├── database.py              # engine/session/Base + get_db()
│   │   ├── models/                  # cliente.py, user.py, tecnico.py, producto.py (+ variante/categoria/proveedor), pedido.py, cita.py, cita_producto.py, pago.py, factura.py, calificacion*.py, notificacion.py, evidencia.py, especializacion.py, ...
│   │   ├── schemas/                 # auth.py, producto.py, cita.py, user.py, cliente.py, solicitud.py, tarifa.py
│   │   ├── routers/                 # auth.py, users.py, clientes.py, tecnicos.py, productos.py, citas.py, pedidos.py, tarifas.py, calificaciones.py, notificaciones.py, especializaciones.py, reembolsos.py, devoluciones.py, reports.py, consultas.py, solicitudes.py
│   │   ├── services/                # minio_service.py, pagos_service.py, pedidos_service.py, factura_service.py, asignacion_service.py, especialidades.py, recomendacion_service.py, inventario_service.py, reembolso_service.py, devoluciones_service.py, notificaciones.py, scheduler.py, tareas_programadas.py
│   │   ├── middleware/              # cors.py, security_headers.py, rate_limit.py
│   │   └── utils/                   # security.py (JWT + get_current_*), email.py, gmail_api.py, audit_log.py, fechas.py, limiter.py, respaldo_usuarios.py
│   ├── alembic/ + alembic.ini       # 50 migraciones (0001_baseline → 0050_cliente_foto_url)
│   ├── scripts/migrar_a_minio.py    # migración /uploads y evidencias → MinIO
│   ├── pyproject.toml  uv.lock  .venv/
│   ├── Dockerfile  (python:3.12-slim, uv sync, alembic upgrade + uvicorn)
│   ├── .python-version
│   ├── requirements.txt  +  productos_local/ (mount fe/public/productos)
│   └── verify_stock*.py  tmp_e2e_direccion.py
├── fe/                              # Frontend web
│   ├── src/
│   │   ├── pages/                   # public/ (ProductosPublicos.tsx:41, ProductoDetalle.tsx:144, CarritoPage, CheckoutPage), Home/ (HomePage, WhyNeodomus), cliente/ (Perfil, CitasPage, TecnicosPage), tecnico/ (TechnicianDashboard, TecnicoCitas/Perfil/...), admin/ (AdminDashboard + 10 subpáginas), legal/, auth/ (VerifyEmail...)
│   │   ├── components/              # layout/ (MainLayout, AdminLayout, TechnicianLayout, Navbar, Footer...), productos/ProductoCard.tsx:43, auth/ (AuthModalHost/Layout), profile/, legal/, chat/ChatBotWidget, common/
│   │   ├── contexts/                # AuthContext.tsx, CartContext.tsx, AuthModalContext
│   │   ├── services/api.ts          # axios singleton con refresh
│   │   ├── styles/                  # producto-detalle.css, productos-publicos.css, globals.css, carrito.css, checkout.css, citas.css, ...
│   │   ├── i18n/IdiomaContext.tsx  +  types/index.ts  +  utils/favoritos.ts
│   │   ├── hooks/ + constants.ts + data/ + assets/
│   │   ├── App.tsx (Routes) + main.tsx + vite-env.d.ts
│   ├── public/productos/            # JPG semilla (1.jpg..16.jpg + default.png) → /app/productos_local en api
│   ├── vite.config.ts (proxy none, aliases @components/@services, host:true:5173, Cross-Origin-Opener-Policy)
│   ├── package.json  pnpm-lock.yaml  pnpm-workspace.yaml
│   ├── tsconfig*.json  eslint.config.js  index.html  nginx.conf
│   └── Dockerfile  (.dockerignore)
├── movil/                           # Aplicación móvil
│   ├── app/                         # _layout.tsx, (tabs)/ (productos.tsx, producto/[id].tsx, carrito.tsx, perfil/...), (tecnico)/, login/registro/verificar-correo/...
│   ├── components/ (public/ProductCard.tsx, layout/Navbar, public/AppFooter)
│   ├── services/ (api.ts, productos.service.ts:71, cliente.services.ts:177)
│   ├── constants/ (api.ts:28, theme.ts:12, variantes.ts)
│   ├── contexts/ (AuthContext, CartContext, FavoritosContext)
│   ├── hooks/ + utils/ + assets/images/ + data/
│   ├── app.json (scheme movil, permisos LOCATION/IMAGE_PICKER)
│   ├── package.json + eslint.config.js + tsconfig.json + .env.example
│   └── start-lan.bat
├── minio_data/                      # volumen host de MinIO — ninio_data (S3)
│   └── .minio.sys/                  # metadatos internos (gitignore)
├── scripts/                         # scripts host
│   ├── seed_test_users.py           # usuarios prueba idempotentes (hash bcrypt)
│   ├── subir_productos_minio.py     # HOST wrapper que llama api: scripts/subir_productos_minio.py
│   ├── export_seed.py + init_db.sql # esquema + INSERT IGNORE idempotente (respaldo)
│   └── init_db.sql
├── docs/ (requisitos/ RFs+ HUs, conceptos/owasp-top-10, plan-trabajo.md, referencia-tecnica/, setup/ con-docker.md/sin-docker.md)
├── docker-compose.yml               # db: mysql:8.0/3307 + api: build ./be + minio + frontend:5173, red neodomus_net
├── .env + .env.example              # env real vs plantilla (DATABASE_URL, SECRET_KEY, MINIO_*, SMTP, GOOGLE, FRONTEND_URL)
├── .gitignore (incluye minio_data/ pnpm-store/ .venv/)
├── README.md                        # README técnico original (no modificado)
├── DOCUMENTACION_PROYECTO.md        # este archivo
└── INFORME_FINAL_EVALUACION_NEODOMUS.md
```

Explicación por carpeta importante:

- `be/app/routers/` → cada archivo declara un `APIRouter` con prefijos (`/productos`, `/citas`, `/tecnicos`...), handlers validados por `Depends(get_db)` y `Depends(oauth2_scheme)`; `auth.py` no requiere token, `productos.py` distingue invitado vs empleado con `_empleado_opcional`, `tecnicos.py` aísla `_ficha_tecnico_actual` y evidencias en MinIO.
- `be/app/models/` → 32 archivos con PKs autoincrement, FKs y relaciones (`relationship` + `secondary` para N:N); `otros.py` agrupa `Comision`, `TipoDocumento`; `especializacion.py` define `tecnico_especializacion` y `producto_especializacion`.
- `be/app/services/minio_service.py` → único acceso a MinIO, con `_cliente()` lazy singleton y `_asegurar_bucket()` idempotente.
- `fe/src/pages/public/` → `ProductosPublicos` hace `GET /productos/?limit=100` y filtra por variante.stock, `ProductoDetalle` calcula `usaTamanos`, `varianteActiva`, `totalMetros`, carrusel de recomendados con `scrollRecomendados` ref.
- `movil/app/(tabs)/` → `productos.tsx` replica filtros pero con `FlatList virtualizada` y `CarritoProvider` sincronizado con `AsyncStorage`.

---

## 14. Herramientas utilizadas

| Herramienta | Existe en repo | Para qué |
|---|---|---|
| **Git + GitHub** | `.git/`, `.gitignore` (incluye `minio_data/`, `be/.venv/`, `.pnpm-store/`) | control de versiones, flow `git rm --cached minio_data` recomendado |
| **Docker + Docker Compose** | `docker-compose.yml`, `be/Dockerfile`, `fe/Dockerfile` | orquestar `db/api/minio/frontend` sin instalar MySQL/Node local; `healthcheck` y `depends_on: service_healthy` |
| **pnpm 10** | `fe/pnpm-lock.yaml`, `movil/pnpm-lock.yaml`, `fe/Dockerfile:3 corepack prepare pnpm@10` | gestor de deps frontend/móvil (faster que npm, `pnpm-workspace.yaml` con `@` aliases) |
| **npm** (compat) | `fe/package-lock.json` | fallback opcional `npm install` |
| **uv** | `be/Dockerfile:3 RUN pip install uv`, `be/pyproject.toml:35 build-system hatchling` | reemplazo de pip con `uv sync`, `uv.lock`, `uv run alembic/uvicorn` reproducibles |
| **Expo CLI 54** | `movil/package.json:23 expo 54.0.37`, `movil/start-lan.bat` | `expo start`, `expo start --android`, `expo lint`, túnel Metro y OTA |
| **Android Studio** | no versionado, pero requerido para `movil` en emulador (`10.0.2.2`) | AVD, SDK 34, `adb`, debugging `expo-dev-client` |
| **MySQL Workbench / mysql CLI** | no en repo, pero `docker exec neodomus_mysql mysql -uneodomus -p...` | inspeccionar `SHOW TABLES`, `alembic current` |
| **MinIO Console** | `http://localhost:9001` (`docker-compose.yml:86`) | explorar bucket `neodomus-media`, prefijos y policy pública |

---

## 15. Instalación del proyecto

### Backend

Comandos reales (`be/pyproject.toml:7` `requires-python >=3.10`, `be/Dockerfile:5`):

```bash
# Sin Docker
cd be
cp ../.env .env
# Ajustar DATABASE_URL=mysql+pymysql://neodomus:<PASSWORD>@db:3306/neodomus?charset=utf8mb4
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
# El health: curl http://localhost:8000/health → {"status":"ok"} (be/app/main.py:159)

# Verificar cabezal de migraciones
docker compose exec api uv run alembic current  # → 0050 (head)
```

### Frontend web

```bash
cd fe
pnpm install            # instala react 18.3, vite 5.4, axios, framer-motion, react-icons, @react-oauth/google
pnpm run dev            # vite en http://localhost:5173 (host:true, port 5173, polling 100ms)
pnpm run build          # tsc && vite build  (vite.config.ts:5 aliases @components/@services)
pnpm run preview        # vite preview dist/
```

### Aplicación móvil

```bash
cd movil
cp .env.example .env
# Editar .env: EXPO_PUBLIC_API_URL=http://10.0.2.2:8000  (emulador)
#           o EXPO_PUBLIC_API_URL=http://<IP-LAN-de-ipconfig>:8000  (físico, misma Wi-Fi)
pnpm install
pnpm start              # expo start — abrir QR con Expo Go
pnpm android            # expo start --android
pnpm ios                # expo start --ios
pnpm web                # expo start --web
pnpm typecheck          # tsc --noEmit
# Firewall LAN (PowerShell Admin) si el físico no ve el host:
# New-NetFirewallRule -DisplayName "Neodomus API 8000 (LAN)" -Direction Inbound -Protocol TCP -LocalPort 8000 -RemoteAddress LocalSubnet -Action Allow
# New-NetFirewallRule -DisplayName "Neodomus MinIO 9000 (LAN)" -Direction Inbound -Protocol TCP -LocalPort 9000 -RemoteAddress LocalSubnet -Action Allow
```

### Docker

```bash
cp .env.example .env
# Completar MYSQL_PASSWORD, SECRET_KEY (openssl rand -hex 32), MINIO_ROOT_PASSWORD, SMTP_USERNAME/PASSWORD, GOOGLE_* si se usa, FRONTEND_URL=http://localhost:5173
docker compose up --build
#  db      mysql:8.0 healthy en 3307:3306
#  api     be/Dockerfile → uv run alembic upgrade head && uvicorn (0.0.0.0:8000)
#  minio   elestio/minio:latest data=/data (./minio_data) + console 9001
#  frontend pnpm run dev en 5173 (bind fe:/app)
docker compose ps                    # 4 servicios Up
docker compose exec api uv run python /app/scripts/seed_test_users.py   # idempotente, users hash bcrypt
docker compose exec api uv run python scripts/subir_productos_minio.py   # 16→ MinIO + BD
docker compose down                  # conserva volúmenes (mysql_data, minio_data)
docker compose down -v               # ¡borra todo! (solo para reset)
```

---

## 16. Variables de entorno

Ninguna credencial real se muestra; valores de ejemplo son seguros. Grupos por módulo (`docker-compose.yml:34` `env_file: .env` → `api: environment:` y `be/app/config.py:102` `env_file=".env"`):

| Grupo | Variables clave | Uso |
|---|---|---|
| **DB** | `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE=neodomus`, `MYSQL_USER=neodomus`, `MYSQL_PASSWORD`, `DATABASE_URL=mysql+pymysql://...@db:3306/neodomus?charset=utf8mb4` | `database.py:18` y `docker-compose.yml:6` |
| **Backend/JWT** | `SECRET_KEY` (≥32 chars, fail-fast en `ENVIRONMENT=production` `config.py:90`), `ALGORITHM=HS256`, `ACCESS_TOKEN_EXPIRE_MINUTES=60`, `REFRESH_TOKEN_EXPIRE_DAYS=30`, `ENVIRONMENT=development|production` | `security.py` firma de `access_token/refresh_token` |
| **Verificación** | `VERIFICATION_TOKEN_EXPIRE_HOURS=24`, `PASSWORD_RESET_TOKEN_EXPIRE_MINUTES=10` | `email_verification_tokens`, `password_reset_tokens` |
| **Correo** | `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `EMAIL_PROVIDER=smtp|gmail_api|resend`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN` | `utils/email.py`/`gmail_api.py`/`notificaciones.py` |
| **Google OAuth** | `GOOGLE_SIGNIN_CLIENT_ID`, `VITE_GOOGLE_CLIENT_ID`, `GOOGLE_OAUTH_REDIRECT_BASE` | web `VITE_GOOGLE_CLIENT_ID` + móvil `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` |
| **Pagos** | `PAYMENT_PROVIDER=simulator` | `pagos_service.py` validación académica |
| **MinIO (`ninio_data`)** | `MINIO_ROOT_USER=neodomus`, `MINIO_ROOT_PASSWORD`, `MINIO_ENDPOINT=minio:9000`, `MINIO_PUBLIC_ENDPOINT=http://localhost:9000`, `MINIO_BUCKET=neodomus-media`, `MINIO_ACCESS_KEY/MINIO_SECRET_KEY/MINIO_SECURE=false` | `config.py:72` y `docker-compose.yml:61` |
| **Frontend/Móvil** | `FRONTEND_URL=http://localhost:5173`, `VITE_API_URL=http://localhost:8000/api/v1`, `EXPO_PUBLIC_API_URL=http://<IP-LAN>:8000` (sin `/api/v1`), `CORS_ORIGINS` | `vite.config.ts`, `fe/services/api.ts:41`, `movil/constants/api.ts:35` |

Ejemplo no sensible:

```env
SECRET_KEY=openssl_rand_hex_32_aqui
DATABASE_URL=mysql+pymysql://neodomus:***@db:3306/neodomus?charset=utf8mb4
MINIO_PUBLIC_ENDPOINT=http://localhost:9000
MINIO_BUCKET=neodomus-media
VITE_API_URL=http://localhost:8000/api/v1
EXPO_PUBLIC_API_URL=http://192.168.1.10:8000
```

---

## 17. Resumen de tecnologías

| Área | Tecnología | Función |
|---|---|---|
| Frontend web | **React 18.3 + Vite 5.4 + React Router 7 + Axios + Framer Motion + React Icons** | SPA oscura por roles, layouts Main/Admin/Technician, interceptores de refresh, animaciones y OAuth Google |
| Backend | **FastAPI 0.115 + Uvicorn + SQLAlchemy 2.0 + Alembic + Pydantic** | API REST `/api/v1` con 16 routers, ORM `pool_pre_ping`, 50 migraciones, validación y settings con fail-fast |
| Aplicación móvil | **React Native 0.81 + Expo 54 + Expo Router 6 + AsyncStorage** | tabs públicos + stack técnico, `FlatList` virtualizada, `expo-image` con normalización LAN de MinIO, `expo-location/auth-session` |
| Base de datos | **MySQL 8.0** | 49 tablas, 29 modelos SQLAlchemy, `clientes↔pedidos↔citas↔tecnicos` con `cita_producto` y comisiones, FK CASCADE/SET NULL |
| Imágenes | **MinIO (S3) en `minio_data/` (`ninio_data`)** | bucket `neodomus-media`, política pública, `minio_service.subir_imagen/url_publica`, evidencias y productos, consumo web directo + móvil con `normalizarUrlImagen` |
| Contenedores | **Docker + Docker Compose** | 4 servicios `db/api/minio/frontend` en `neodomus_net`, builds `python:3.12-slim+uv` y `node:22+pnpm10`, `healthcheck` MySQL y volúmenes `mysql_data/minio_data` |

