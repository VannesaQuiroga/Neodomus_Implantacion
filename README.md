# Neodomus

Sistema integral de gestión para domótica y servicios técnicos. Neodomus centraliza el catálogo de productos, el flujo de compra, la agenda de citas/instalaciones y la operación en campo de técnicos, con aplicación web para clientes y administradores y aplicación móvil nativa para clientes y técnicos.

La plataforma permite a visitantes explorar el catálogo, a clientes comprar, agendar y seguir servicios, a técnicos gestionar citas y entregas con evidencias fotográficas, y a administradores operar catálogo, pedidos, instalaciones, usuarios y reportes desde un panel centralizado.

---

## Descripción del proyecto

Funcionalidades reales implementadas:

- **Gestión de usuarios**: registro, verificación por email, login con JWT (access + refresh), recuperación de contraseña por código, Google Sign-In, control de sesiones por pestaña (`fe/src/services/api.ts:34`).
- **Clientes**: perfil, dirección, teléfono, foto, cambio de correo con verificación, solicitud de inhabilitación de cuenta.
- **Técnicos**: ficha técnica (`tecnicos`), certificaciones, especializaciones, ubicación GPS en tiempo real (`ubicaciones_tecnico`), calificación por clientes.
- **Administradores**: panel con dashboard KPIs, gestión de usuarios, técnicos, clientes, productos, pedidos, instalaciones/citas, facturas, devoluciones, reportes y consultas.
- **Productos / Catálogo**: CRUD completo con categorías (`categorias`), proveedores (`proveedores`), variantes de color/medida (`producto_variantes`), precios, descuentos, promociones, stock por variante, venta por metros (`venta_por_metros`), visibilidad cliente (`visible_cliente`), requisitos de instalación (técnicos, dificultad, horas).
- **Carrito de compras**: por metros y por unidades, validación de stock, variantes y precios (`fe/src/contexts/CartContext.tsx`, `movil/contexts/CartContext.tsx`).
- **Pedidos**: checkout con simulador de pago académico (`app/services/pagos_service.py`), métodos de pago (tarjeta, PayPal, punto Efecty, PSE), facturación PDF automática (`reportlab`), seguimiento con línea de progreso y ubicación del técnico.
- **Instalaciones / Citas**: agenda por fecha/hora con validación de días laborales (lun–sáb) y franjas horarias (`horas_laborales` en `be/app/services/especialidades.py`), asignación de 1 a 3 técnicos, cálculo de duración estimada por servicio/productos, reasignación automática al desactivar técnico, historial de cambios (`historial_citas`), estados `Pendiente | Confirmada | Finalizada | Cancelada`.
- **Dashboard administrativo**: instalaciones con filtros, reasignación de técnicos/entregas, gestión de comisiones, reportes PDF/Excel (`app/routers/reports.py`).
- **Dashboard de técnicos**: mis citas, mis entregas, evidencias fotográficas, comisiones, reagendamiento, clientes asignados, notificaciones.
- **Aplicación móvil**: Expo Router con tabs públicos (productos, producto detalle, carrito, perfil) y stack de técnico (dashboard, citas, entregas, clientes, mensajes, historial, perfil), favoritos por usuario, carrito sincronizado, reconocimiento de variante y medidas.
- **Gestión de imágenes**: ver sección dedicada `ninio_data` (MinIO).
- **Notificaciones**: notificaciones de plataforma (`notificaciones`) y correos transaccionales por cambios de estado de cita/entrega, promociones y reabastecimiento.
- **Autenticación**: JWT `HS256` (`SECRET_KEY` en `be/app/config.py:28`), `ACCESS_TOKEN_EXPIRE_MINUTES`, `REFRESH_TOKEN_EXPIRE_DAYS`, refresh automático en frontend, protección de rutas por rol (`RoleRoute`, `PrivateRoute`).
- **Soporte**: chat asistente (`ChatBotWidget`), páginas legales (términos, privacidad, cookies, contacto), centro de ayuda.
- **Reportes**: reportes admin con filtros de fecha y exportación PDF (`reportlab`) y Excel (`openpyxl`), KPIs de ventas y servicios.

---

## Tecnologías y frameworks

### Frontend web

- **React 18.3.1** — biblioteca de interfaz (`fe/package.json:14`)
- **Vite 5.4.21** — bundler y dev server (`fe/package.json:28`, `fe/vite.config.ts:5`)
- **TypeScript 5.9.3**
- **React Router DOM 7.18.0** — ruteo con layouts por rol (`fe/src/App.tsx:2`)
- **Axios 1.8.4** — cliente HTTP centralizado con refresh de tokens (`fe/src/services/api.ts:33`)
- **Framer Motion 12.40.0** — animaciones
- **React Icons 5.6.0**
- **@react-oauth/google 0.12.1** — Google Sign-In

Estilos: CSS puro por feature (`fe/src/styles/*.css`), sin Tailwind/MUI (los estilos del catálogo viven en `productos-publicos.css` y `producto-detalle.css`). Tipografías `Inter` + `Montserrat` vía Google Fonts (`fe/index.html`).

### Backend

- **Python 3.12** (`be/.python-version`, `be/Dockerfile:1`)
- **FastAPI 0.115.0** + **Uvicorn 0.30.0** (`be/pyproject.toml:7`)
- **SQLAlchemy 2.0.30** + **PyMySQL 1.1.0** + **Alembic 1.13.2** — ORM y migraciones (50 migraciones en `be/alembic/versions/`)
- **Pydantic 2.7.0 / pydantic-settings 2.3.0** — validación y settings
- **python-jose[cryptography] 3.3.0** + **passlib[bcrypt] 1.7.4 / bcrypt 4.0.1** — JWT y hashing
- **MinIO SDK 7.2.20** (`minio>=7.2.20`) — almacenamiento de objetos (`be/app/services/minio_service.py:18`)
- **Pillow >=10** — validación de imágenes (`be/app/routers/productos.py:817`)
- **ReportLab 4.2.0 / openpyxl 3.1.5** — PDFs de facturas y reportes
- **SlowAPI 0.1.9** — rate limiting
- **APScheduler 3.11.3 / tzdata** — tareas programadas (`be/app/services/scheduler.py`, `tareas_programadas.py`)

Gestor de dependencias: **uv** (`be/pyproject.toml`, `uv.lock`, `be/Dockerfile:3`).

### Aplicación móvil

- **React Native 0.81.5** + **React 19.1.0** (`movil/package.json:41`)
- **Expo SDK 54.0.37** + **Expo Router 6.0.24** (`expo-router/entry`)
- **TypeScript 5.9.2**
- **Expo Image 3.0.11 / expo-image-picker 17.0.11 / expo-file-system 19.0.24 / expo-sharing 14.0.8** — imágenes, subida y descarga de PDFs
- **Expo Location 19.0.8 / Expo Crypto / Expo Linking / Expo Auth Session** — GPS, deep links OAuth, intercambio de tokens
- **@react-native-async-storage/async-storage 2.2.0** — persistencia local
- **React Navigation bottom-tabs 7.4.0** — tabs nativos

Entry: `app/_layout.tsx` con providers `AuthProvider`, `CarritoProvider`, `FavoritosProvider`, `IdiomaProvider` y navegación por `Stack` con `(tabs)` público y `(tecnico)` técnico.

### Base de datos

- **MySQL 8.0** (`docker-compose.yml:3`, `mysql:8.0`, healthcheck `mysqladmin ping`, puerto `3307:3306`)
- **ORM**: SQLAlchemy 2.0 con `DeclarativeBase` (`be/app/database.py:31`)
- **Migraciones**: Alembic (head `0050`), versionado no destructivo; `init_db.sql` en `scripts/` como respaldo SQL
- Pool `pool_pre_ping` + `pool_recycle=3600`

### Almacenamiento de imágenes — `ninio_data`

`ninio_data` es el nombre en el host del volumen persistente de **MinIO** (S3-compatible) que usa el proyecto. No es una librería distinta: es la carpeta en raíz `minio_data/` montada al contenedor `minio` en `/data` (`docker-compose.yml:88`):

```yaml
volumes:
  - ./minio_data:/data
command: server /data --console-address ":9001"
```

- Imagen: `elestio/minio:latest` (`docker-compose.yml:77`) — consola en `:9001`, API S3 en `:9000`.
- Backend lo consume como **MinIO** vía `app/services/minio_service.py:32` (`Minio(settings.MINIO_ENDPOINT, ...)`).
- El bucket por defecto es `neodomus-media` (`be/app/config.py:75`), autocreado con política pública de lectura en el primer uso (`_asegurar_bucket`).
- Ver sección **Gestión de imágenes con `ninio_data`** para flujo completo.

### Contenedores

- **Docker + Docker Compose** (`docker-compose.yml`): servicios `db`, `api`, `minio`, `frontend` en red `neodomus_net`.
- **Backend** construido con `be/Dockerfile` (python:3.12-slim, `uv sync`, `alembic upgrade head && uvicorn`).
- **Frontend** con `fe/Dockerfile` (node:22-alpine, `pnpm@10`, `pnpm run dev` en puerto 5173).

---

## Librerías y dependencias principales

### Backend (`be/pyproject.toml:6`)

| Librería | Para qué se usa |
|---|---|
| `fastapi` | framework API REST, routers en `be/app/routers/*.py` |
| `uvicorn[standard]` | servidor ASGI |
| `sqlalchemy` + `pymysql` | ORM y driver MySQL |
| `alembic` | migraciones `be/alembic/versions/` |
| `pydantic` + `pydantic-settings` | schemas (`be/app/schemas/`) y `Settings` (`be/app/config.py:18`) |
| `python-jose[cryptography]` | firma/verificación JWT (`app/utils/security.py`) |
| `passlib[bcrypt]` + `bcrypt` | hash de contraseñas |
| `python-multipart` | `UploadFile` para imágenes/evidencias |
| `minio` | `app/services/minio_service.py` — `subir_imagen`, `url_publica`, `eliminar_objeto` |
| `Pillow` | `Image.verify()` al subir imágenes/productos |
| `reportlab` + `openpyxl` | PDFs de facturas y reportes Excel |
| `slowapi` | rate-limit de auth y endpoints sensibles |
| `email-validator` | validación de emails |
| `google-auth` + `requests` | verificación de tokens OAuth Google |
| `apscheduler` + `tzdata` | `scheduler.py` — recordatorios de cita, tareas periódicas |

### Frontend web (`fe/package.json:11`)

| Librería | Para qué se usa |
|---|---|
| `react` + `react-dom` | UI, `fe/src/pages/*/`, `fe/src/components/` |
| `react-router-dom` | rutas `App.tsx:68` con `MainLayout`/`AdminLayout`/`TechnicianLayout` |
| `axios` | `fe/src/services/api.ts` (base `/api/v1`, interceptores de refresh) |
| `framer-motion` | transiciones de modales y hero |
| `react-icons` | `Fa*` en detalle/producto/perfil |
| `@react-oauth/google` | botón Google en login/registro |

### Móvil (`movil/package.json:14`)

| Librería | Para qué se usa |
|---|---|
| `expo` + `expo-router` | enrutado por carpetas `movil/app/(tabs)`, `movil/app/(tecnico)` |
| `expo-image` + `expo-image-picker` | render y captura de imágenes |
| `expo-file-system/legacy` + `expo-sharing` | descarga de facturas PDF (`movil/services/cliente.services.ts:177`) |
| `expo-location` | GPS cliente/técnico |
| `@react-native-async-storage/async-storage` | sesión, favoritos, carrito |
| `expo-auth-session` + `expo-web-browser` + `expo-crypto` | flujo OAuth Google vía deep link `movil://auth` (`movil/app/_layout.tsx:53`) |
| `expo-constants` | derivar host LAN para API e imágenes (`movil/constants/api.ts:12`) |

---

## Arquitectura del proyecto

Estructura real (raíz):

```
/
├── be/                      # Backend FastAPI (Python 3.12, uv)
│   ├── app/
│   │   ├── config.py        # Settings (env, MinIO, JWT, SMTP)
│   │   ├── database.py      # engine + SessionLocal + Base
│   │   ├── main.py          # FastAPI app, lifespan scheduler, routers, static mounts
│   │   ├── models/          # 29 modelos SQLAlchemy (cliente, user, tecnico, producto, cita, pedido, etc.)
│   │   ├── schemas/         # Pydantic schemas (cita, producto, auth, etc.)
│   │   ├── routers/         # 16 routers montados en /api/v1 (auth, productos, citas, pedidos, tecnicos, devoluciones, ...)
│   │   ├── services/        # minio_service, pagos_service, notificaciones, asignacion_service, etc.
│   │   ├── middleware/      # cors, security_headers, rate_limit
│   │   ├── utils/           # security (JWT), email, audit_log, limiter
│   │   ├── static/productos # montado en /uploads (fallback legado)
│   │   └── static/evidencias# montado en /evidencias
│   ├── alembic/             # migraciones (0050 head)
│   ├── alembic.ini
│   ├── pyproject.toml       # deps y scripts uv
│   ├── Dockerfile
│   ├── scripts/migrar_a_minio.py
│   └── .venv/
├── fe/                      # Frontend web (React + Vite)
│   ├── src/
│   │   ├── components/      # layout (Navbar, AdminSidebar, ...), productos/ProductoCard, profile/*, auth/*
│   │   ├── pages/           # public/ProductoDetalle, ProductosPublicos, CarritoPage, admin/*, tecnico/*, cliente/*
│   │   ├── contexts/        # AuthContext, CartContext
│   │   ├── services/api.ts  # axios con refresh automático
│   │   ├── styles/          # producto-detalle.css, productos-publicos.css, globals.css, ...
│   │   ├── i18n/IdiomaContext.tsx
│   │   └── utils/favoritos.ts
│   ├── public/productos/    # imágenes semilla montadas como /app/productos_local en api (docker-compose.yml:69)
│   ├── vite.config.ts
│   ├── package.json         # react 18 + vite 5 + axios
│   └── Dockerfile
├── movil/                   # App móvil (Expo 54, React Native 0.81)
│   ├── app/
│   │   ├── _layout.tsx      # Stack raíz + providers + deep link movil://auth
│   │   ├── (tabs)/          # tabs públicos: productos, producto/[id], carrito, perfil, etc.
│   │   └── (tecnico)/       # dashboard e informes del técnico
│   ├── components/public/ProductCard.tsx
│   ├── services/            # productos.service (urlImagenProducto con normalización LAN), api, cliente.services
│   ├── constants/api.ts     # API_BASE_URL = EXPO_PUBLIC_API_URL + /api/v1, BACKEND_HOST_URL
│   ├── contexts/            # AuthContext, CartContext, FavoritosContext
│   ├── app.json             # scheme movil, permisos LOCATION y IMAGE_PICKER
│   └── package.json
├── minio_data/              # volumen host de MinIO (S3) — equivale a ninio_data en el enunciado
│   └── .minio.sys/          # metadatos internos MinIO (no versionar: .gitignore:60)
├── scripts/
│   ├── seed_test_users.py   # usuarios de prueba idempotentes
│   ├── subir_productos_minio.py  # sube fe/public/productos/*.jpg a MinIO y actualiza BD
│   └── init_db.sql          # esquema + semillas SQL
├── be/scripts/migrar_a_minio.py # migra /uploads y evidencias locales a MinIO
├── docker-compose.yml       # db (mysql:8.0), api (build ./be), minio, frontend (vite 5173)
├── .env                     # variables reales (DATABASE_URL, SECRET_KEY, MINIO_*, SMTP, GOOGLE, FRONTEND_URL)
├── .env.example             # plantilla documentada
├── docs/                    # requisitos (RFs/HUs), conceptos, setup con-docker/sin-docker, referencia técnica
├── README.md                # este archivo
└── INFORME_FINAL_EVALUACION_NEODOMUS.md
```

Qué contiene cada carpeta importante:

- `be/app/main.py:68` crea `FastAPI(title="Neodomus API")` con lifespan scheduler y monta routers en `/api/v1`; sirve `/uploads` y `/evidencias` como `StaticFiles`.
- `be/app/routers/` agrupa 16 módulos: `productos` (catálogo + `POST /upload-imagen` a MinIO), `citas` (agenda y disponibilidad), `pedidos` (checkout y seguimiento), `tecnicos` (mis-citas/mis-entregas/evidencias), `devoluciones`, `reembolsos`, `auth`, `users`, `clientes`, `notificaciones`, `consultas`, `solicitudes`, `calificaciones`, `reports`, `tarifas`, `especializaciones`.
- `be/app/services/minio_service.py:32` centraliza MinIO (creación del bucket y política pública, `subir_imagen(carpeta, nombre, bytes) -> url_publica`).
- `be/app/models/` define 29+ entidades: `Cliente`, `User`, `Tecnico`, `Producto`, `ProductoVariante`, `Categoria`, `Proveedor`, `Pedido`/`DetallePedido`, `Cita`/`CitaProducto`, `Pago`, `Factura`, `Calificacion`, `Notificacion`, `Evidencia`, `Especializacion` (N:N con técnicos y productos).
- `fe/src/` organiza por pages (public/admin/tecnico/cliente) + components por dominio y `services/api.ts` que inyecta `Authorization: Bearer <tabGet(access_token)>` y renueva vía `POST /auth/refresh` en 401.
- `movil/` espeja la web sin duplicar lógica: `services/productos.service.ts:88` reescribe `localhost:9000/minio:9000` → host LAN derivado de `EXPO_PUBLIC_API_URL`/`expo-constants.hostUri` para que imágenes MinIO sean visibles desde dispositivo físico.
- `minio_data/` es el directorio de datos del servidor MinIO (persistencia del bucket `neodomus-media`).

---

## Cómo funciona el sistema

1. El usuario ingresa vía web (`http://localhost:5173`) o app móvil (Expo). Visitantes ven catálogo sin autenticación; clientes/técnicos/admins inician sesión (local o Google) y reciben `access_token` + `refresh_token` (JWT `HS256`, `15–60 min` / `7–30 días` según `config.py:29` y `.env`).
2. El frontend realiza solicitudes a `VITE_API_URL` (web, por defecto `http://localhost:8000/api/v1` — `docker-compose.yml:100`) o a `EXPO_PUBLIC_API_URL + /api/v1` en móvil (`movil/constants/api.ts:35`); el cliente `api.ts:154` usa `withCredentials:false`, timeout 15 s, e interceptores de request/response para refresh transparente.
3. El backend valida JWT (`get_current_user`, `get_current_client`, `get_current_employee` en `app/utils/security.py`), aplica middlewares en orden pila `CORS externo → SecurityHeaders → RateLimit` (`be/app/main.py:100`), despacha a routers y consulta/modifica MySQL vía SQLAlchemy (`be/app/database.py:18`).
4. Las imágenes se gestionan mediante MinIO: el admin sube vía `POST /productos/upload-imagen` (`be/app/routers/productos.py:800`) → `minio_service.subir_imagen("productos", uuid.jpg, bytes)` → URL `MINIO_PUBLIC_ENDPOINT/MINIO_BUCKET/productos/<uuid>` guardada en `productos.imagen_url` / `producto_variantes.imagen_url`; web la consume directa como `<img src>` y móvil la normaliza a IP LAN (ver `movil/services/productos.service.ts:88`).
5. Los pedidos pueden relacionarse con citas/instalaciones: el checkout (`POST /pedidos` en `be/app/routers/pedidos.py:230`) crea `pedidos` + `detalle_pedido` y factura PDF; para productos con instalación el técnico queda asignado y las citas quedan visibles en paneles dedicados; la relación pedido↔cita se materializa vía `cita_producto` (productos instalados en la cita).
6. Los técnicos visualizan sus asignaciones en `/tecnicos/mis-citas` y `/tecnicos/mis-entregas` (`be/app/routers/tecnicos.py:783`/`1259`), suben evidencias a `evidencias_citas/<uuid>` o `evidencias_entrega/<uuid>` en MinIO, marcan estados (`Pendiente → En camino → Entregado`, `Pendiente → Finalizada`) y reciben notificaciones; el cliente sigue el pedido en `/pedidos/{id}/seguimiento` con pasos y GPS.
7. Tareas programadas (`app/services/scheduler.py` iniciado en `lifespan` de `main.py:40`) envían recordatorios de cita y cierres automáticos.

---

## API y comunicación entre sistemas

- **Tipo de API**: REST `/api/v1` versionada. Todos los routers se incluyen con `app.include_router(..., prefix="/api/v1")` en `be/app/main.py:113`.
- **Comunicación frontend↔backend**: web vía `axios` (`fe/src/services/api.ts:154`), móvil vía `apiFetch` wrapper (`movil/services/api.ts`). Sin WebSockets; polling leve de 15–30 s en catálogo (`ProductoDetalle.tsx:233`, `ProductosPublicos.tsx:94`, `movil/app/(tabs)/productos.tsx:132`).
- **Principales módulos / endpoints**:

| Módulo | Prefijo | Endpoints destacados |
|---|---|---|
| `auth` | `/auth` | `POST /login`, `POST /refresh`, `POST /register`, verificación email, reset password, Google OAuth |
| `users` / `clientes` / `tecnicos` | `/users`, `/clients`, `/tecnicos` | CRUD usuarios/clientes, `GET /tecnicos/publicos`, `PUT /clients/me`, `POST /clients/me/foto` (MinIO) |
| `productos` | `/productos` | `GET /` (filtros `search/categoria/estado`, guest oculta `visible_cliente=false` o stock ≤5), `GET /categorias`, `GET /{id}`, `GET /{id}/variantes`, `POST /upload-imagen` (MinIO, admin), `POST /`, `PUT /{id}`, `DELETE /{id}` |
| `citas` | `/citas` | `POST /` (cliente, valida franja y técnico), `GET /all-admin`, `GET /horas-disponibles`, `GET /tecnico-ocupado`, `PUT /admin/{id}` (re/asignar técnicos y comisión), `GET /admin/reasignar-pendientes` |
| `pedidos` | `/pedidos` | `POST /` (checkout), `POST /{id}/ubicacion` (GPS cliente), `GET /mis-pedidos`, `GET /all-admin` / `/admin/entregas`, `PUT /admin/{id}/entrega`, `GET /{id}/seguimiento`, `GET /{id}/factura` (StreamingResponse PDF) |
| `tecnicos` | `/tecnicos` | `GET /mis-citas`, `PUT /citas/{id}/estado` (Finalizada con evidencia), `POST /citas/{id}/evidencias`, `POST /entregas/{id}/evidencias` (MinIO), `PUT /entregas/{id}/estado`, `POST /ubicacion` (GPS técnico) |
| `devoluciones` / `reembolsos` | `/devoluciones`, `/reembolsos` | elegibilidad y solicitudes de devolución con evidencias, reembolsos por cita cancelada |
| `notificaciones` | `/notificaciones` | `GET /mias`, `PATCH /leer-todas` |
| `reports` | `/reports` | `GET /pdf` para descargar reporte admin (roles `admin`) |

- **Autenticación**: JWT `HS256` con `SECRET_KEY` (`be/app/config.py:28`), `ALGORITHM` y `ACCESS_TOKEN_EXPIRE_MINUTES`/`REFRESH_TOKEN_EXPIRE_DAYS`. Esquema `Authorization: Bearer <access_token>` (`fe/src/services/api.ts:206`, `movil/services/api.ts`). OAuth Google con `GOOGLE_SIGNIN_CLIENT_ID` + `GOOGLE_CLIENT_ID` (`be/app/config.py:53`, `fe/.env`, `movil/.env.example`). Cookies no usadas (`withCredentials:false`).

---

## Gestión de imágenes con `ninio_data`

**Qué es `ninio_data` dentro del proyecto**: no es una librería separada; es la carpeta en la raíz `minio_data/` que el servicio MinIO usa como directorio de datos (`/data`) dentro del contenedor. El propio contenedor MinIO se referencia en `docker-compose.yml:32` como `minio` y la variable `MINIO_PUBLIC_ENDPOINT` es la URL que los clientes usan para cargar imágenes (ver `be/app/config.py:72`). Cambiar el host de esa URL o el bucket recrea un bucket distinto.

**Para qué se utiliza**: almacenar todos los objetos binarios del sistema, exclusivamente en MinIO (no se crea implementación paralela):

- Imágenes de productos (`productos/<uuid>.jpg`) y variantes (`ProductoVariante.imagen_url`)
- Evidencias de citas (`evidencias_citas/<uuid>.jpg`) y de entregas (`evidencias_entrega/<uuid>.jpg`)
- Fotos de perfil cliente/técnico (`/clients/me/foto` → `foto_url`)
- Evidencias técnicas (`app/services/minio_service.py:95` `subir_imagen("evidencias_citas", ...)`)

Montaje y bucket:

```yaml
# docker-compose.yml:77
minio:
  image: elestio/minio:latest
  volumes: ["./minio_data:/data"]
  command: server /data --console-address ":9001"
# api env (docker-compose.yml:61)
MINIO_ENDPOINT: minio:9000  # dentro de Docker
MINIO_PUBLIC_ENDPOINT: http://localhost:9000  # URL que reciben navegadores
MINIO_BUCKET: neodomus-media
```
`be/app/config.py:72` expone `MINIO_PUBLIC_ENDPOINT` (por defecto `http://localhost:9000`) y `MINIO_BUCKET`.

**Cómo se cargan las imágenes**:

1. Admin sube vía formulario → `POST /productos/upload-imagen` (`be/app/routers/productos.py:800`) con `UploadFile`; se valida extensión `.jpg/.jpeg/.png/.webp/.gif`, tamaño ≤ 5 MB y que `Pillow.Image.verify()` suceda; se genera nombre `uuid.hex + ext`.
2. `minio_service.subir_imagen("productos", nombre, contenido)` (`be/app/services/minio_service.py:77`) ejecuta `put_object(bucket, "productos/<nombre>", BytesIO, len, content_type)` vía cliente `Minio(settings.MINIO_ENDPOINT, ...)` y, en el primer uso, crea el bucket y le fija política pública `{"Effect":"Allow","Principal":{"AWS":["*"]},"Action":["s3:GetObject"],"Resource":["arn:aws:s3:::BUCKET/*"]}` (`_asegurar_bucket`).
3. La función retorna `url_publica = f"{MINIO_PUBLIC_ENDPOINT}/{BUCKET}/productos/{nombre}"` que se persiste en `Producto.imagen_url` (y análogamente en `ProductoVariante.imagen_url`). Para evidencias se guarda la clave `evidencias_citas/<nombre>` y `url_publica` se resuelve al leer (`tecnicos.py:82` `_url_evidencia`).
4. Carga masiva/migración: `scripts/subir_productos_minio.py:61` lee `fe/public/productos/*.jpg` (montados en `/app/productos_local` según `docker-compose.yml:69`) y `be/scripts/migrar_a_minio.py:60` migra claves legadas `/uploads/*` a URLs públicas MinIO; ambos preservan filas ya en MinIO.

**Cómo se recuperan**:

- Backend serializa `ProductoResponse.imagen_url` tal cual (`be/app/routers/productos.py:248` `_serializar`) — URL absoluta MinIO — y el frontend/móvil la usan sin transformación adicional salvo normalización de host (ver abajo).
- Lectura pública: MinIO sirve `GET /BUCKET/objeto` sin autenticación por la política pública; el navegador/celular la carga como recurso estático.

**Cómo las consume la aplicación web**:

```ts
// fe/src/pages/public/ProductoDetalle.tsx:202
const imagen = varianteActiva?.imagen_url || producto?.imagen_url || `/productos/${producto?.id_producto}.jpg`;
// fallback en <img>: onError → /productos/default.png
// fe/src/components/productos/ProductoCard.tsx:79 idem
```
La URL pública es accesible directa en `http://localhost:9000/neodomus-media/productos/<archivo>` (desde el mismo host). Las tarjetas muestran `onError={(e)=> e.currentTarget.src='/productos/default.png'}` (`ProductoCard.tsx:192`) y alternan por variante.

**Cómo las consume la aplicación móvil**:

```ts
// movil/services/productos.service.ts:88
function normalizarUrlImagen(url:string):string{
  const hostMinio=`${u.protocol}//${u.hostname}:9000`; // deriva de BACKEND_HOST_URL
  return url.replace(/https?:\/\/localhost:9000/gi, hostMinio)
            .replace(/https?:\/\/minio:9000/gi, hostMinio)
            .replace(/https?:\/\/127.0.0.1:9000/gi, hostMinio) // + :8000 para /uploads legados
}
export const urlImagenProducto = (p, variante?) => normalizarUrlImagen(crudaAbsoluta);
// fallback: `${BACKEND_HOST_URL}/uploads/${p.id_producto}.jpg`
```
`movil/constants/api.ts:28` deriva `BACKEND_HOST_URL` de `EXPO_PUBLIC_API_URL` o de `expo-constants.hostUri` (IP LAN del PC que corre Metro) o `10.0.2.2:8000` (emulador). Así `http://localhost:9000/...` recibido del backend se reescribe a `http://<IP-LAN>:9000/...` accesible desde dispositivo físico. El flag `minio:9000` también se cubre. `expo-image` con `cachePolicy="memory-disk"` hace caching (`movil/components/public/ProductCard.tsx:156`).

**Configuración necesaria**:

- `.env` en raíz: `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_ENDPOINT`, `MINIO_PUBLIC_ENDPOINT`, `MINIO_BUCKET` (ver `.env.example:40` y `docker-compose.yml:61`). Nunca commitear secretos: cambiar en producción y usar `openssl rand -hex 32` para `SECRET_KEY` (`be/app/config.py:87` fail-fast).
- `minio_data/` persistente; no borrar sin backup (contiene todos los objetos). Ignorado en git (`.gitignore:60`).
- Tras primer arranque, verificar que `minio_service` haya creado el bucket; si imágenes antiguas no se ven, ejecutar:
  ```bash
  docker compose exec api uv run python scripts/subir_productos_minio.py
  docker compose exec api uv run python be/scripts/migrar_a_minio.py
  ```

---

## Requisitos previos

Únicamente lo necesario según el stack real:

- **Docker y Docker Compose** (recomendado) — levanta MySQL 8.0, MinIO y la API sin instalar nada local.
- Alternativa sin Docker: **Node.js 22+** y **pnpm 10** (ver `fe/Dockerfile:1`, `fe/pnpm-lock.yaml`), **Python 3.12** + **uv** (`be/pyproject.toml:5`), **Expo CLI** (`npm i -g expo` o `pnpm dlx expo`), **MySQL 8.0** accesible, **Android Studio** + SDK/Emulador para móvil.
- **Expo Go** en dispositivo físico o emulador Android para probar `movil`.
- Credenciales SMTP válidas si se requiere envío real de emails (ver `EMAIL_PROVIDER` en `.env.example:23`); en desarrollo el simulador guarda en logs.

---

## Instalación y ejecución

### Docker (recomendado — levanta todo)

```bash
cp .env.example .env
# Editar .env: SECRET_KEY, MYSQL_PASSWORD, MINIO_ROOT_PASSWORD, SMTP_PASSWORD, GOOGLE_* si aplica
docker compose up --build
# Servicios:
# - MySQL   → localhost:3307 (contenedor db:3306)
# - API     → http://localhost:8000  (/health)
# - MinIO   → http://localhost:9000  (API S3)  +  http://localhost:9001  (consola web)
# - Frontend→ http://localhost:5173
# El contenedor api ejecuta automáticamente: alembic upgrade head && uvicorn app.main:app --reload
```

Primer arranque de datos e imágenes (dentro de `api`):

```bash
docker compose exec api uv run python /app/scripts/seed_test_users.py
docker compose exec api uv run python scripts/subir_productos_minio.py
# Si migras desde datos legados locales:
docker compose exec api uv run python be/scripts/migrar_a_minio.py
```

### Backend sin Docker

```bash
cd be
cp ../.env .env  # o crear be/.env con DATABASE_URL=mysql+pymysql://neodomus:...@localhost:3307/neodomus
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
# Alternativa: python -m app.main (lee PORT env)
```

### Frontend web

```bash
cd fe
pnpm install           # o npm install
pnpm run dev           # vite en http://localhost:5173  (vite.config.ts:21 host:true)
pnpm run build         # tsc && vite build
pnpm run preview       # previsualiza dist
```
Variables relevantes (build time): `VITE_API_URL` (por defecto `http://localhost:8000/api/v1`, `fe/src/services/api.ts:41`) y `VITE_GOOGLE_CLIENT_ID`.

### Aplicación móvil

```bash
cd movil
cp .env.example .env
# Ajustar EXPO_PUBLIC_API_URL según entorno:
# - Emulador Android: http://10.0.2.2:8000
# - Dispositivo físico (misma Wi-Fi): http://<IP-LAN-del-PC>:8000
#   (ipconfig en Windows → Wi-Fi → Dirección IPv4)
pnpm install
pnpm start             # expo start — escanea QR con Expo Go
pnpm android           # expo start --android
pnpm ios               # expo start --ios
pnpm web               # expo start --web
# En LAN física puede requerirse firewall:
# New-NetFirewallRule -DisplayName "Neodomus API 8000" -Direction Inbound -Protocol TCP -LocalPort 8000 -RemoteAddress LocalSubnet -Action Allow
# New-NetFirewallRule -DisplayName "Neodomus MinIO 9000" -Direction Inbound -Protocol TCP -LocalPort 9000 -RemoteAddress LocalSubnet -Action Allow
```

### Docker adicional

```bash
docker compose logs -f api frontend db minio
docker compose ps
docker compose down        # conserva volúmenes (mysql_data, minio_data/)
docker compose down -v     # borra volúmenes (¡datos perdidos!)
```

---

## Variables de entorno

Archivos `.env` necesarios (ninguno se commitea; plantilla: `.env.example`):

**Raíz `.env`** (leído por `docker-compose.yml:34` `env_file: .env` y `be/app/config.py:102` `env_file=".env"`):

| Grupo | Variables | Para qué |
|---|---|---|
| Base de datos | `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE=neodomus`, `MYSQL_USER=neodomus`, `MYSQL_PASSWORD`, `DATABASE_URL` | Conexión MySQL (`be/app/database.py:18`, `docker-compose.yml:6`) |
| Backend / seguridad | `SECRET_KEY`, `ALGORITHM=HS256`, `ACCESS_TOKEN_EXPIRE_MINUTES=60`, `REFRESH_TOKEN_EXPIRE_DAYS=30`, `ENVIRONMENT=development\|production` | JWT, fail-fast en prod (`be/app/config.py:87`) |
| Verificación | `VERIFICATION_TOKEN_EXPIRE_HOURS=24`, `PASSWORD_RESET_TOKEN_EXPIRE_MINUTES=10` | emails de verificación y reset |
| SMTP / correo | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `EMAIL_PROVIDER=smtp\|gmail_api\|resend`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` | `app/utils/email.py`, Resend/Gmail API |
| Google OAuth | `GOOGLE_SIGNIN_CLIENT_ID`, `VITE_GOOGLE_CLIENT_ID` | login Google web/móvil |
| Pagos | `PAYMENT_PROVIDER=simulator` | simulador académico (`app/services/pagos_service.py`) |
| MinIO | `MINIO_ROOT_USER=neodomus`, `MINIO_ROOT_PASSWORD`, `MINIO_ENDPOINT=minio:9000`, `MINIO_PUBLIC_ENDPOINT=http://localhost:9000`, `MINIO_BUCKET=neodomus-media`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_SECURE=false` | almacenamiento (`be/app/config.py:69`) |
| Frontend | `FRONTEND_URL=http://localhost:5173`, `VITE_API_URL=http://localhost:8000/api/v1`, `GOOGLE_OAUTH_REDIRECT_BASE`, `CORS_ORIGINS` | CORS (`be/app/middleware/cors.py`) y redirects |

**`fe/.env`** (Vite, prefijo `VITE_`): `VITE_API_URL`, `VITE_GOOGLE_CLIENT_ID`.

**`movil/.env`** (Expo, prefijo `EXPO_PUBLIC_`): `EXPO_PUBLIC_API_URL` (sin `/api/v1` — lo añade `movil/constants/api.ts:35`), `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.

Ejemplo seguro para documentar:

```env
SECRET_KEY=genera_con_openssl_rand_hex_32
DATABASE_URL=mysql+pymysql://neodomus:***@db:3306/neodomus?charset=utf8mb4
MINIO_PUBLIC_ENDPOINT=http://localhost:9000
MINIO_BUCKET=neodomus-media
VITE_API_URL=http://localhost:8000/api/v1
EXPO_PUBLIC_API_URL=http://192.168.1.10:8000
```

---

## Roles del sistema

| Rol | Cómo se distingue | Qué puede hacer (implementación real) |
|---|---|---|
| **Visitante** (no autenticado) | sin `access_token`; `_empleado_opcional` retorna `None` (`be/app/routers/productos.py:231`) | Explorar catálogo (`GET /productos/` público, oculta `visible_cliente=false` y stock ≤5), ver detalle, buscar/filtrar, añadir a carrito/favoritos locales; requiere login para comprar o agendar |
| **Cliente** | `id_rol` no empleado; token con `user_type=client` → `get_current_client` | Comprar (checkout), ver `mis-pedidos`, seguimiento y GPS, compartir ubicación, gestionar perfil/foto, solicitar cambio de correo, agendar/gestionar citas (`POST /citas`), calificar técnicos, solicitar devoluciones, notificaciones, favoritos de productos y técnicos |
| **Técnico** | `id_rol_u=2` (tabla `roles_usuario`, rol técnico; `be/app/models/user.py:36` + `tecnico.py:27`) | Ver `mis-citas`/`mis-entregas`, subir evidencias a MinIO, actualizar estados (Finalizada con evidencia, Entregado con fotos), reagendar, ver comisiones e historial, reportar GPS, gestionar especializaciones |
| **Administrador** | `id_rol_u=1` (admin) → `_admin` gate en cada router (`be/app/routers/productos.py:197`, `citas.py:302`, `pedidos.py:52`, `tecnicos.py:223`) | CRUD productos/categorías/proveedores con variantes e imágenes, gestionar técnicos/clientes, asignar/reasignar citas y entregas, configurar tarifas y comisiones, ver facturas/pedidos/reportes, gestionar devoluciones/reembolsos y notificaciones |

Visitantes se mantienen vía `TabStorage`/`sessionStorage` por pestaña (`fe/src/services/api.ts:50`).

---

## Funcionalidades principales

Lista únicamente de funcionalidades presentes en el código:

- Catálogo paginado con búsqueda y categorías, precios con descuento y promoción vigente, stock con estados `disponible|bajo|agotado` (`be/app/routers/productos.py:57`).
- Variantes por color/tamaño con stock y precio propio (`producto_variantes`), etiqueta de medida (`_etiqueta_medida`).
- Venta por metros (`venta_por_metros`, `METROS_OPCIONES=[10,20,30,40,50]` en `ProductoCard.tsx:41`).
- Check-out con cálculo de duración de instalación por productos (`duracion_desde_items`) y validación de franjas.
- Pedidos con detalle, factura PDF, estados `Pagado|Pago pendiente|Rechazado`, flujo de entrega con rango horario y técnico (`pedidos.py:452` `asignar_entrega_admin`).
- Citas con validación de técnico ocupado y franja tomada (`citas.py:477` `_validar_tecnico_cita`), oferta de horario por cancelación (`_generar_ofertas_por_cancelacion`), recordatorio a 12 h (`tareas_programadas`).
- Evidencias en MinIO con política pública y eliminación (`minio_service.eliminar_objeto`).
- Favoritos y carrito persistidos por cliente (web `localStorage` clave por email, móvil `AsyncStorage`).
- Notificaciones in-app y por email (cliente ↔ técnico ↔ admin) en cada cambio de estado de cita/entrega.
- Reportes PDF generales y por rango de fechas (`reports.py`).

---

## Base de datos

Motor **MySQL 8.0** con 49 tablas (`SHOW TABLES`), ORM SQLAlchemy y Alembic head `0050`. Entidades principales y relaciones clave:

```
Cliente (clientes) 1──N Pedido (pedidos.id_cliente_pe → clientes.id_cliente)
                           1──N DetallePedido (detalle_pedido.id_pedido_d → pedidos.id_pedido, id_producto_d → productos.id_producto)
                           N──1 Producto (productos.id_cate_pr → categorias.id_categoria, id_proveedor_pr → proveedores.id_proveedor)
                           N──N Producto—Especializacion (producto_especializacion)
                           1──N ProductoVariante (producto_variantes.id_producto → productos.id_producto)

Cliente 1──N Cita (citas.id_cliente → clientes.id_cliente, FK CASCADE)
Tecnico 1──N Cita (citas.id_tecnico / id_tecnico_2 / id_tecnico_3; nombre_tecnico denormalizado)
Producto N──N Cita (cita_producto: id_cita → citas.id_cita, id_producto → productos.id_producto, cantidad)

Pedido N──1 Tecnico (pedidos.id_tecnico_entrega → tecnicos.id_tecnico)
Cita N──1 Comision (citas.id_comision_c → comisiones.id_comision)
Cita 1──N Evidencia (evidencias.id_cita → citas.id_cita)
Pedido 1──N EvidenciaEntrega (evidencias_entrega.id_pedido → pedidos.id_pedido)
Tecnico N──1 User (tecnicos.id_usuario_t → usuarios.id_usuario)
Tecnico N──N Especializacion (tecnico_especializacion)
Cita N──1 Especializacion (citas.id_especializacion → especializaciones.id_especializacion SET NULL)
Cliente 1──N Notificacion (notificaciones.id_cliente → clientes.id_cliente)
```

Estados y enums relevantes:

- `productos.estado_producto`: `activo|inactivo` (el público solo ve `activo`); soft-delete a `inactivo` si tiene historial (`productos.py:1012`).
- `citas.estado`: `Pendiente|Confirmada|Finalizada|Cancelada` (creación por cliente queda `Confirmada` tras pago; creación directa/admin puede usar `Pendiente`).
- `pedidos.estado_pedido`: `Pagado|Pago pendiente|Rechazado`; `estado_entrega`: `Pendiente|Asignada|Recogido|En camino|Entregado`.
- `productos.visible_cliente` (bool, `0050`) controla exposición pública.

---

## Verificaciones finales

Antes de cierre se ejecuta:

```bash
docker compose ps                      # 4 servicios healthy
docker compose exec api uv run alembic current   # head 0050
docker compose exec api uv run python scripts/subir_productos_minio.py  # bucket neodomus-media + 16 objetos
# Imagen pública: curl http://localhost:9000/neodomus-media/productos/1.jpg → 200 image/jpeg
# Catálogo público: GET /api/v1/productos/?limit=100 → 10 visibles al visitante
# Recomendaciones: scroll horizontal, gap 16px, tarjetas 260px (190px móvil), sin superposición, fallback default.png
```

---

## Autores y soporte

Proyecto académico Neodomus — para reportar incidencias o sugerencias abrir un issue en el repositorio o contactar al equipo administrador vía `/contacto` de la aplicación.

