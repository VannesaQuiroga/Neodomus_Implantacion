# Arquitectura del Sistema — Neodomus

Este documento describe la arquitectura general de Neodomus y el modo en que se relacionan sus módulos, capas y responsabilidades. Está dirigido a desarrolladores que se incorporan al proyecto y necesitan comprender la estructura del sistema antes de leer el código fuente: qué hace cada capa, cómo fluye una petición y por qué se tomaron las decisiones técnicas actuales.

## Información general

| Elemento | Detalle |
| --- | --- |
| Proyecto | Neodomus — Plataforma de gestión de servicios domóticos |
| Stack | FastAPI (Python 3.12) · React 18 (web) · React 19 con Expo 54 (móvil) · MySQL 8.0 · MinIO · Docker |
| Frontend web | `https://app.neodomus.com` |
| API | `https://api.neodomus.com` |
| Base de datos | MySQL 8.0 en contenedor Docker o cloud · `localhost:3306` |
| Cobertura de pruebas | Backend ≥ 70 % · Frontend ≥ 80 % |
| Roles | `cliente` (tabla `clientes`), `tecnico`, `administrador`/`admin` (tablas `usuarios` y `roles_usuario`) y `visitante` (no autenticado) |
| Configuración local | `backend/.env.example` y `frontend/.env.example` |

## Índice

- [Información general](#información-general)
- [Visión general del sistema](#visión-general-del-sistema)
- [Stack tecnológico](#stack-tecnológico)
- [Arquitectura del backend](#arquitectura-del-backend)
  - [Estructura del backend](#estructura-del-backend)
  - [Diagrama de capas del backend](#diagrama-de-capas-del-backend)
  - [Flujo de una petición HTTP](#flujo-de-una-petición-http)
  - [Capas de seguridad](#capas-de-seguridad)
- [Arquitectura del frontend](#arquitectura-del-frontend)
  - [Estructura del frontend](#estructura-del-frontend)
  - [Diagrama de capas del frontend](#diagrama-de-capas-del-frontend)
  - [Rutas de la aplicación](#rutas-de-la-aplicación)
  - [Flujo de autenticación y roles](#flujo-de-autenticación-y-roles)
- [Flujos de negocio de extremo a extremo](#flujos-de-negocio-de-extremo-a-extremo)
  - [Registro, verificación y login](#registro-verificación-y-login)
  - [Solicitud de servicio, pago y asignación](#solicitud-de-servicio-pago-y-asignación)
  - [Actualización de tareas del técnico](#actualización-de-tareas-del-técnico)
  - [Cancelación de citas](#cancelación-de-citas)
- [Componentes y dependencias](#componentes-y-dependencias)
- [Decisiones técnicas](#decisiones-técnicas)
- [Configuración de entornos](#configuración-de-entornos)
- [Resumen de componentes](#resumen-de-componentes)
- [Conclusión](#conclusión)

## Visión general del sistema

Neodomus sigue una **arquitectura cliente-servidor de tres capas**. Cada capa tiene una responsabilidad única y se comunica con la capa adyacente:

- **Capa 3 — Cliente:** aplicaciones web y móvil construidas con React. Gestionan la interfaz, el estado global y la navegación; consumen la API mediante HTTPS y JSON.
- **Capa 2 — Servidor:** API REST en FastAPI. Concentra la autenticación, las reglas de negocio, la validación y el acceso a datos.
- **Capa 1 — Datos:** MySQL 8.0. Persiste usuarios, técnicos, servicios, citas, pagos, calificaciones, mensajes y notificaciones. También incluye las tablas `password_reset_tokens`, `email_verification_tokens` y `audit_log`.

```mermaid
flowchart TB
  subgraph CLIENTE["Capa 3 · Cliente"]
    direction LR
    WEB["Web<br/>React 18 · TypeScript<br/>Vite · TailwindCSS · React Router"]
    MOVIL["Móvil<br/>React 19 · Expo 54"]
    SPA["Pages · Components<br/>Context · Hooks"]
    API_CLIENT["api/<br/>Axios + interceptores JWT"]
    MAPA["Mapa<br/>Leaflet"]
    WEB --> SPA
    MOVIL --> SPA
    SPA --> API_CLIENT
    SPA --> MAPA
  end

  subgraph SERVIDOR["Capa 2 · Servidor"]
    direction LR
    FASTAPI["FastAPI + Uvicorn<br/>API REST"]
    APP["Routers · Services · Utils"]
    ORM["Schemas Pydantic<br/>Models SQLAlchemy"]
    FASTAPI --> APP
    APP --> ORM
  end

  subgraph DATOS["Capa 1 · Datos"]
    MYSQL[("MySQL 8.0<br/>localhost:3306")]
  end

  API_CLIENT -->|"HTTPS + JSON"| FASTAPI
  ORM -->|"SQL · PyMySQL"| MYSQL

  classDef cliente fill:#e8f1fb,stroke:#2f6fad,color:#102a43
  classDef servidor fill:#eaf6ec,stroke:#2e7d32,color:#102a43
  classDef datos fill:#fff4e5,stroke:#b26a00,color:#102a43
  class WEB,MOVIL,SPA,API_CLIENT,MAPA cliente
  class FASTAPI,APP,ORM servidor
  class MYSQL datos
```

## Stack tecnológico

| Capa o ámbito | Tecnologías principales | Uso en el proyecto |
| --- | --- | --- |
| Cliente web | React 18, TypeScript, Vite, TailwindCSS, React Router | SPA con rutas protegidas por rol y componentes reutilizables |
| Cliente móvil | React 19, Expo 54 | Acceso a la plataforma desde dispositivos móviles |
| Backend | Python 3.12, FastAPI, Uvicorn, SQLAlchemy, Pydantic | API REST, lógica de negocio, validación y ORM |
| Seguridad | JWT, bcrypt, CORS, cabeceras de seguridad, slowapi | Autenticación, autorización, rate limiting y protección de endpoints |
| Base de datos | MySQL 8.0, PyMySQL | Persistencia, triggers, vistas e integridad referencial |
| Almacenamiento | MinIO | Evidencias y archivos asociados a las tareas |
| Mapas | Leaflet, react-leaflet | Visualización de tareas y marcadores para técnicos |
| Pagos | MercadoPago/Stripe | Intención de pago, webhook, abonos y comprobantes |
| Notificaciones | SMTP (Resend/SendGrid) y campana in-app | Verificación, recordatorios, asignaciones y avisos |
| Infraestructura | Docker | Contenedores de base de datos y servicios del entorno |

## Arquitectura del backend

La API se organiza en capas con responsabilidades separadas. Los routers atienden HTTP, los servicios concentran la lógica de negocio, los esquemas validan los contratos y los modelos representan la persistencia.

### Estructura del backend

```text
backend/
│
├── app/
│   ├── main.py                ← Punto de entrada: FastAPI app, CORS, middleware, routers
│   ├── config.py              ← Variables de entorno con Pydantic Settings
│   ├── database.py            ← Engine + Session de SQLAlchemy
│   ├── dependencies.py        ← Dependencias inyectables: get_db(), get_current_user(), require_rol()
│   │
│   ├── routers/               ← CAPA DE PRESENTACIÓN (HTTP)
│   │   ├── auth.py            ← /register, /login, /refresh, /change-password, etc.
│   │   ├── usuarios.py        ← /me, /me (PUT), /me (DELETE)
│   │   ├── servicios.py       ← catálogo y detalles
│   │   ├── citas.py           ← solicitar, listar, modificar, cancelar
│   │   ├── pagos.py           ← iniciar, webhook, abono, comprobante
│   │   ├── tech.py            ← mis-tareas, estado, evidencias, disponibilidad, mapa
│   │   ├── admin.py           ← gestión de técnicos, aprobación, asignación, reportes
│   │   ├── chat.py            ← enviar, conversación, marcar leído
│   │   ├── notificaciones.py  ← listar, marcar leída
│   │   └── calificaciones.py  ← calificar, listar
│   │
│   ├── services/              ← CAPA DE LÓGICA DE NEGOCIO
│   │   ├── auth_service.py
│   │   ├── usuario_service.py
│   │   ├── cita_service.py    ← validación de 48h, horarios, conflictos
│   │   ├── pago_service.py    ← abonos, actualización de estado de pedido
│   │   ├── tech_service.py    ← asignación, evidencias
│   │   ├── admin_service.py
│   │   ├── chat_service.py
│   │   └── notificacion_service.py
│   │
│   ├── models/                ← CAPA DE DATOS (ORM)
│   │   ├── usuario.py
│   │   ├── tecnico.py         ← hereda de usuario o relación 1:1
│   │   ├── servicio.py
│   │   ├── cita.py
│   │   ├── pedido.py
│   │   ├── pago.py
│   │   ├── calificacion.py
│   │   ├── mensaje.py
│   │   ├── notificacion.py
│   │   ├── promocion.py
│   │   ├── password_reset_token.py
│   │   └── email_verification_token.py
│   │
│   ├── schemas/               ← VALIDACIÓN (Pydantic)
│   │   ├── usuario.py         ← UserCreate, UserLogin, UserResponse, etc.
│   │   ├── servicio.py
│   │   ├── cita.py
│   │   ├── pago.py
│   │   └── ...
│   │
│   ├── core/                  ← NÚCLEO
│   │   ├── security.py        ← hash_password, verify_password, create_access_token,
│   │   │                         create_refresh_token, decode_token (con rol embebido)
│   │   └── audit_log.py       ← log_login_success/failed, log_asignacion, log_pago
│   │
│   └── utils/                 ← UTILIDADES TRANSVERSALES
│       ├── email.py           ← send_verification_email, send_password_reset_email,
│       │                         send_notificacion, send_recordatorio
│       ├── limiter.py         ← Instancia de SlowAPI (rate limiter)
│       ├── geocoding.py       ← convertir dirección a coordenadas (lat/lng)
│       └── payment_gateway.py ← cliente de pasarela de pagos (MercadoPago/Stripe)
│
├── requirements.txt
├── Dockerfile
└── .env.example
```

### Diagrama de capas del backend

```mermaid
flowchart LR
  CLIENTE["Cliente web / móvil"]

  subgraph BORDE["Borde HTTP"]
    MW["Middlewares<br/>CORS · cabeceras · rate limit"]
    ROUTERS["Routers<br/>auth · usuarios · servicios · citas<br/>pagos · tech · admin · chat<br/>notificaciones · calificaciones"]
  end

  subgraph APLICACION["Aplicación"]
    DEPS["dependencies.py<br/>get_db · get_current_user · require_rol"]
    SERVICES["Services<br/>auth · usuario · cita · pago<br/>tech · admin · chat · notificación"]
  end

  subgraph CONTRATOS["Contratos y persistencia"]
    SCHEMAS["Schemas Pydantic<br/>usuario · servicio · cita · pago"]
    MODELS["Models SQLAlchemy<br/>usuario · tecnico · servicio · cita<br/>pedido · pago · calificación · mensaje<br/>notificación · promoción · tokens"]
  end

  subgraph TRANSVERSAL["Seguridad y utilidades"]
    SEC["core/security.py<br/>bcrypt · access/refresh token"]
    AUDIT["core/audit_log.py<br/>login · asignación · pago"]
    UTILS["utils/<br/>email · limiter · geocoding · payment_gateway"]
  end

  DB[("MySQL 8.0")]

  CLIENTE -->|"HTTPS + JSON"| MW
  MW --> ROUTERS
  ROUTERS -->|"valida entrada y salida"| SCHEMAS
  ROUTERS --> SERVICES
  ROUTERS -.->|"inyecta dependencias"| DEPS
  DEPS --> SEC
  SERVICES --> MODELS
  SERVICES -.-> UTILS
  SERVICES -.-> AUDIT
  MODELS -->|"SQL · PyMySQL"| DB

  classDef borde fill:#e8f1fb,stroke:#2f6fad,color:#102a43
  classDef aplicacion fill:#eaf6ec,stroke:#2e7d32,color:#102a43
  classDef contratos fill:#fff4e5,stroke:#b26a00,color:#102a43
  classDef transversal fill:#f3e8fd,stroke:#6a3fa0,color:#102a43
  classDef datos fill:#f5f5f5,stroke:#555,color:#102a43
  class MW,ROUTERS borde
  class DEPS,SERVICES aplicacion
  class SCHEMAS,MODELS contratos
  class SEC,AUDIT,UTILS transversal
  class DB datos
```

### Flujo de una petición HTTP

Ejemplo: solicitud de un servicio mediante `POST /api/v1/citas`.

```http
POST /api/v1/citas
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "servicio_id": "<id>",
  "fecha": "<fecha>",
  "hora": "<hora>",
  "direccion": "<direccion>"
}
```

```mermaid
sequenceDiagram
  autonumber
  actor C as Cliente
  participant F as FastAPI
  participant L as Rate limiter
  participant D as get_current_user
  participant R as Router citas
  participant S as cita_service
  participant DB as MySQL
  participant A as audit_log
  participant M as SMTP

  C->>F: POST /api/v1/citas + Bearer token
  F->>F: Valida CitaCreate con Pydantic
  alt Datos inválidos
    F-->>C: 422 Unprocessable Entity
  end

  F->>L: Verifica límite de 20/minuto por IP y usuario
  alt Límite excedido
    L-->>C: 429 Too Many Requests
  end

  F->>D: Valida JWT y extrae el rol
  alt Token inválido o ausente
    D-->>C: 401 Unauthorized
  end
  D->>DB: Obtiene el usuario
  DB-->>D: Usuario
  D-->>F: current_user

  F->>R: solicitar_cita()
  R->>S: crear_solicitud(db, datos, current_user.id)
  S->>DB: Verifica que el servicio exista y esté activo
  S->>S: Valida fecha ≥ hoy + 24 h
  S->>S: Valida hora dentro del horario general (tabla config)
  S->>DB: Verifica que no exista otra cita en el mismo horario
  S->>DB: INSERT cita con estado "pendiente"
  S->>A: Registra action = "solicitar_servicio"
  S->>M: Envía email de confirmación al usuario
  S-->>R: Cita creada
  R-->>F: CitaResponse
  F-->>C: Respuesta JSON con response_model
```

### Capas de seguridad

Los controles se aplican de afuera hacia adentro. Cada capa reduce la superficie de ataque antes de llegar a la lógica de negocio o a la base de datos.

```mermaid
flowchart TB
  subgraph PERIMETRO["Perímetro"]
    CORS["CORS<br/>solo FRONTEND_URL"]
    HEADERS["Cabeceras de seguridad<br/>X-Frame-Options · nosniff"]
    RATE["Rate limiter<br/>slowapi por IP"]
  end

  subgraph APLICACION["Aplicación"]
    VALID["Validación Pydantic<br/>tipos · rangos · formatos"]
    JWT["Verificación JWT<br/>get_current_user + roles"]
    BIZ["Reglas de negocio<br/>propiedad · 48 h · estado"]
  end

  subgraph DATOS["Datos y trazabilidad"]
    ORM["SQLAlchemy ORM<br/>sin SQL crudo"]
    HASH["Hash bcrypt<br/>contraseñas"]
    AUDIT["Audit log<br/>eventos críticos"]
  end

  CORS --> HEADERS --> RATE
  RATE --> VALID --> JWT --> BIZ
  BIZ --> ORM --> HASH --> AUDIT

  classDef perimetro fill:#e8f1fb,stroke:#2f6fad,color:#102a43
  classDef aplicacion fill:#eaf6ec,stroke:#2e7d32,color:#102a43
  classDef datos fill:#fff4e5,stroke:#b26a00,color:#102a43
  class CORS,HEADERS,RATE perimetro
  class VALID,JWT,BIZ aplicacion
  class ORM,HASH,AUDIT datos
```

| # | Capa | Control | Propósito |
| --- | --- | --- | --- |
| 1 | Perímetro | CORS middleware | Permitir solicitudes únicamente desde `FRONTEND_URL` |
| 2 | Perímetro | Cabeceras de seguridad | Aplicar `X-Frame-Options` y `nosniff` |
| 3 | Perímetro | Rate limiter con slowapi | Limitar por IP y por endpoint sensible |
| 4 | Aplicación | Validación con Pydantic | Verificar tipos, rangos y formatos |
| 5 | Aplicación | Verificación JWT | Resolver `get_current_user` y los roles |
| 6 | Aplicación | Reglas de negocio | Validar propiedad del recurso, regla de 48 h y estado |
| 7 | Datos | SQLAlchemy ORM | Evitar SQL crudo y prevenir inyección |
| 8 | Datos | Hash con bcrypt | Impedir el almacenamiento de contraseñas en plano |
| 9 | Auditoría | Audit logging | Mantener trazabilidad de eventos críticos |

## Arquitectura del frontend

El frontend es una SPA organizada por responsabilidades: páginas, componentes, estado global, hooks y una capa de comunicación HTTP con interceptores para JWT y refresh.

### Estructura del frontend

```text
frontend/
│
├── src/
│   ├── main.tsx               ← Punto de entrada: renderiza <App /> en el DOM
│   ├── App.tsx                ← Rutas de la aplicación (React Router)
│   ├── index.css              ← Estilos globales + TailwindCSS
│   │
│   ├── context/               ← ESTADO GLOBAL
│   │   ├── AuthContext.tsx    ← Provider: usuario, rol, tokens
│   │   └── NotificationContext.tsx ← campana, notificaciones no leídas
│   │
│   ├── hooks/                 ← LÓGICA REUTILIZABLE
│   │   ├── useAuth.ts
│   │   ├── useHasRol.ts
│   │   ├── useNotificaciones.ts
│   │   └── useChat.ts
│   │
│   ├── api/                   ← COMUNICACIÓN HTTP
│   │   ├── auth.ts, citas.ts, pagos.ts, tech.ts, admin.ts, etc.
│   │   └── axios.ts           ← Instancia de Axios con interceptores JWT + refresh
│   │
│   ├── components/            ← COMPONENTES REUTILIZABLES
│   │   ├── ProtectedRoute.tsx ← guarda de rutas por rol
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx  ← navbar + campana + sidebar
│   │   │   └── Navbar.tsx
│   │   ├── ui/
│   │   │   ├── Button.tsx
│   │   │   ├── InputField.tsx
│   │   │   ├── Alert.tsx
│   │   │   ├── NotificationBell.tsx
│   │   │   └── RatingStars.tsx
│   │   └── map/
│   │       └── TechMap.tsx    ← Leaflet con marcadores
│   │
│   ├── pages/                 ← VISTAS (una por ruta)
│   │   ├── auth/              ← Login, Register, ForgotPassword, ResetPassword
│   │   ├── usuario/           ← Dashboard, MisServicios, SolicitarServicio, Historial
│   │   ├── tecnico/           ← TechDashboard, TechMap, TechTareas, TechDisponibilidad
│   │   └── admin/             ← AdminTecnicos, AdminSolicitudes, AdminServicios, AdminReportes
│   │
│   └── types/                 ← TIPOS TYPESCRIPT
│       ├── auth.ts
│       ├── servicio.ts
│       ├── cita.ts
│       └── ...
│
├── package.json               ← versiones exactas, pnpm
├── vite.config.ts
└── .env.example
```

### Diagrama de capas del frontend

```mermaid
flowchart TB
  subgraph ENTRADA["Entrada"]
    MAIN["main.tsx"]
    APP["App.tsx<br/>React Router"]
    MAIN --> APP
  end

  subgraph VISTAS["Vistas y componentes"]
    PAGES["pages/<br/>auth · usuario · tecnico · admin"]
    PROTECTED["ProtectedRoute<br/>guarda por rol"]
    COMPONENTS["components/<br/>layout · ui · map"]
    APP --> PAGES
    APP --> PROTECTED
    PROTECTED --> PAGES
    PAGES --> COMPONENTS
  end

  subgraph ESTADO["Estado y lógica"]
    HOOKS["hooks/<br/>useAuth · useHasRol<br/>useNotificaciones · useChat"]
    CONTEXT["context/<br/>AuthContext · NotificationContext"]
    PAGES --> HOOKS
    HOOKS --> CONTEXT
    COMPONENTS --> CONTEXT
  end

  subgraph ACCESO["Acceso a datos"]
    API["api/<br/>auth · citas · pagos · tech · admin"]
    AXIOS["axios.ts<br/>interceptores JWT + refresh"]
    TYPES["types/<br/>auth · servicio · cita"]
    PAGES --> API
    API --> AXIOS
    PAGES -.-> TYPES
    API -.-> TYPES
  end

  BACKEND["Backend FastAPI"]
  AXIOS -->|"HTTPS + JWT"| BACKEND

  classDef entrada fill:#e8f1fb,stroke:#2f6fad,color:#102a43
  classDef vistas fill:#eaf6ec,stroke:#2e7d32,color:#102a43
  classDef estado fill:#fff4e5,stroke:#b26a00,color:#102a43
  classDef acceso fill:#f3e8fd,stroke:#6a3fa0,color:#102a43
  classDef externo fill:#f5f5f5,stroke:#555,color:#102a43
  class MAIN,APP entrada
  class PAGES,PROTECTED,COMPONENTS vistas
  class HOOKS,CONTEXT estado
  class API,AXIOS,TYPES acceso
  class BACKEND externo
```

### Rutas de la aplicación

| Ruta | Página | Rol | Acceso |
| --- | --- | --- | --- |
| `/` | Redirección según rol o a `/login` | — | Público |
| `/login` | `LoginPage` | — | Público |
| `/register` | `RegisterPage` | — | Público |
| `/forgot-password` | `ForgotPasswordPage` | — | Público |
| `/reset-password` | `ResetPasswordPage` | — | Público |
| `/verify-email` | Manejado con token | — | Público |
| `/panel/dashboard` | `DashboardPage` | usuario | Protegido |
| `/panel/servicios/solicitar` | `SolicitarServicioPage` | usuario | Protegido |
| `/panel/mis-servicios` | `MisServiciosPage` | usuario | Protegido |
| `/tech/mapa` | `TechMapPage` | técnico | Protegido |
| `/tech/mis-tareas` | `TechTareasPage` | técnico | Protegido |
| `/tech/disponibilidad` | `TechDisponibilidadPage` | técnico | Protegido |
| `/admin/tecnicos` | `AdminTecnicosPage` | admin | Protegido |
| `/admin/solicitudes` | `AdminSolicitudesPage` | admin | Protegido |
| `/admin/servicios` | `AdminServiciosPage` | admin | Protegido |
| `/admin/reportes` | `AdminReportesPage` | admin | Protegido |

### Flujo de autenticación y roles

El `access_token` se guarda en `sessionStorage`, no en `localStorage`. Al arrancar la aplicación, `AuthContext` restaura la sesión y valida el token contra la API.

```mermaid
sequenceDiagram
  autonumber
  actor U as Usuario
  participant F as Frontend
  participant A as AuthContext
  participant API as Backend API
  participant DB as MySQL

  Note over A: Al montar la aplicación
  A->>A: Lee access_token de sessionStorage

  alt Hay access_token
    A->>API: GET /api/v1/users/me
    alt Respuesta 200
      API->>DB: Obtiene el perfil
      DB-->>API: Usuario
      API-->>A: Perfil y rol
    else Respuesta 401
      A->>API: POST /api/v1/auth/refresh
      alt Refresh correcto
        API-->>A: Nuevos tokens
      else Refresh falla
        A-->>F: Logout y redirección a /login
      end
    end
  else No hay access_token
    A-->>F: Mostrar /login
  end

  U->>F: Ingresa email y contraseña
  F->>API: POST /auth/login
  API->>DB: SELECT usuario
  DB-->>API: Usuario
  API->>API: verify_password y creación de tokens
  API-->>F: 200 { access_token, refresh_token, rol }
  F->>A: Guarda tokens en sessionStorage y rol en estado
  A->>API: GET /users/me
  API-->>A: Perfil completo
  A-->>F: Redirige según rol

  Note over F,API: Usuario → /panel/dashboard · Técnico → /tech/mapa · Admin → /admin/tecnicos
  Note over F,API: El access_token dura 15 min. El interceptor de Axios detecta 401, llama a refresh y reintenta la petición original. Si refresh falla, hace logout y redirección.
```

## Flujos de negocio de extremo a extremo

Los siguientes recorridos resumen las operaciones principales del sistema y muestran la interacción entre cliente, API, base de datos y servicios externos.

### Registro, verificación y login

```mermaid
sequenceDiagram
  autonumber
  actor U as Usuario
  participant F as Frontend
  participant B as Backend
  participant DB as MySQL
  participant M as Email

  U->>F: Completa el formulario de registro
  F->>B: POST /auth/register
  B->>B: Validación y hash bcrypt
  B->>DB: INSERT usuario (is_verified = 0)
  DB-->>B: Usuario creado
  B->>M: Envía email de verificación
  B-->>F: 201 UserResponse
  F-->>U: Mensaje "Verifica tu email"

  U->>F: Clic en el enlace de verificación
  F->>B: POST /auth/verify-email
  B->>DB: UPDATE is_verified = 1
  DB-->>B: OK
  B-->>F: 200
  F-->>U: Cuenta verificada

  U->>F: Ingresa email y contraseña
  F->>B: POST /auth/login
  B->>DB: SELECT usuario
  DB-->>B: Usuario
  B->>B: verify_password y creación de tokens
  B-->>F: 200 { access_token, refresh_token, rol }
  F-->>U: Redirección al dashboard según rol
```

### Solicitud de servicio, pago y asignación

```mermaid
sequenceDiagram
  autonumber
  actor U as Usuario
  participant F as Frontend
  participant B as Backend
  participant P as Pasarela de pago
  participant A as Admin
  participant T as Técnico

  U->>F: Selecciona servicio, fecha y hora
  F->>B: POST /citas
  B->>B: Valida 24 h, horario y conflictos
  B->>B: Crea cita con estado "pendiente"
  B-->>F: Cita creada
  F-->>U: "Servicio solicitado"

  opt Pago en línea
    F->>B: POST /pagos/iniciar
    B->>P: Crea intención de pago
    P-->>B: Intención creada
    B-->>F: Datos de pago
    U->>P: Paga en la pasarela
    P->>B: Webhook de pago
    B->>B: Marca el pedido como pagado
  end

  A->>B: Aprueba y asigna un técnico
  B->>B: cita.estado = "confirmada"
  B->>T: Notifica la asignación
  B-->>A: Asignación registrada
  T->>T: Ve la tarea en el mapa y en la lista
```

### Actualización de tareas del técnico

```mermaid
sequenceDiagram
  autonumber
  actor T as Técnico
  participant F as Frontend
  participant B as Backend
  participant DB as MySQL
  participant S as Storage

  T->>F: Abre la tarea
  F->>B: GET /tech/tarea/101
  B->>DB: SELECT cita + cliente
  DB-->>B: Datos
  B-->>F: Detalle de la tarea
  F-->>T: Muestra los detalles

  T->>F: Marca "en_progreso"
  F->>B: PUT /tech/tarea/101/estado {"estado":"en_progreso"}
  B->>DB: UPDATE estado
  B->>B: audit_log: cambio_estado
  DB-->>B: OK
  B-->>F: Estado actualizado

  T->>F: Finaliza y sube fotos
  F->>B: POST /tech/tarea/101/evidencias (multipart)
  B->>S: Guarda las fotos
  B->>DB: UPDATE estado = "completado"
  B->>B: Notifica al usuario
  B-->>F: Evidencias registradas

  Note over T,F: El usuario puede calificar el servicio después.
```

### Cancelación de citas

La cancelación se permite cuando faltan al menos 48 horas para la cita. El backend calcula la diferencia entre la fecha de la cita y el momento actual antes de modificar el registro.

```mermaid
flowchart TD
  U["Cliente solicita cancelar la cita #101"] --> F["Frontend<br/>DELETE /citas/101"]
  F --> B["Backend<br/>routers/citas.py"]
  B --> GET["1. Obtener la cita"]
  GET --> CALC["2. Calcular la diferencia<br/>fecha de la cita − ahora"]
  CALC --> D{"¿Diferencia ≥ 48 h?"}
  D -->|Sí| DEL["3. Permitir la cancelación<br/>soft delete o estado = cancelado"]
  D -->|No| NO["Cancelación no permitida<br/>por la regla de 48 h"]
  DEL --> AUD["4. Registrar audit_log:<br/>cancelacion"]
  AUD --> NOTIF["5. Notificar al técnico<br/>si está asignado"]
  NOTIF --> OK["Respuesta al cliente"]
  NO --> ERR["Respuesta de rechazo"]

  classDef inicio fill:#e8f1fb,stroke:#2f6fad,color:#102a43
  classDef proceso fill:#eaf6ec,stroke:#2e7d32,color:#102a43
  classDef decision fill:#fff4e5,stroke:#b26a00,color:#102a43
  classDef error fill:#fdecea,stroke:#b23b3b,color:#102a43
  class U,F inicio
  class B,GET,CALC,DEL,AUD,NOTIF,OK proceso
  class D decision
  class NO,ERR error
```

## Componentes y dependencias

El cliente consume la API por HTTPS. El backend concentra el acceso a MySQL, MinIO, la pasarela de pagos y el servidor SMTP; ningún cliente accede directamente a la base de datos ni al almacenamiento.

```mermaid
flowchart LR
  subgraph CLIENTE["Cliente"]
    SPA["SPA React<br/>web y móvil"]
    MAPA["Mapa Leaflet"]
    SPA --> MAPA
  end

  subgraph SERVIDOR["Backend"]
    API["API FastAPI<br/>Routers · Services · Models"]
  end

  subgraph ALMACENAMIENTO["Almacenamiento"]
    MYSQL[("MySQL 8.0")]
    MINIO[("MinIO<br/>evidencias")]
  end

  subgraph EXTERNOS["Servicios externos"]
    PAY["Pasarela de pagos<br/>MercadoPago / Stripe"]
    SMTP["SMTP<br/>Resend / SendGrid"]
  end

  SPA -->|"HTTPS + JSON + JWT"| API
  API -->|"SQL · PyMySQL"| MYSQL
  API -->|"archivos y fotos"| MINIO
  API -->|"intención de pago"| PAY
  PAY -->|"webhook"| API
  API -->|"correos y recordatorios"| SMTP

  classDef cliente fill:#e8f1fb,stroke:#2f6fad,color:#102a43
  classDef servidor fill:#eaf6ec,stroke:#2e7d32,color:#102a43
  classDef almacen fill:#fff4e5,stroke:#b26a00,color:#102a43
  classDef externo fill:#f3e8fd,stroke:#6a3fa0,color:#102a43
  class SPA,MAPA cliente
  class API servidor
  class MYSQL,MINIO almacen
  class PAY,SMTP externo
```

## Decisiones técnicas

### ¿Por qué FastAPI y no Django o Flask?

| Criterio | FastAPI | Flask | Django |
| --- | --- | --- | --- |
| Velocidad | Muy alta (ASGI) | Media (WSGI) | Media (WSGI) |
| Tipado | Nativo (Pydantic) | Manual | Parcial |
| Validación | Automática | Manual | Forms/Serializers |
| Documentación | Swagger automático | Manual | Manual (o DRF) |
| Curva de aprendizaje | Baja | Muy baja | Alta |

FastAPI fue elegido por su soporte nativo de tipos, la validación automática con Pydantic, la documentación Swagger auto-generada y su rendimiento ASGI, adecuado para una API con múltiples roles y operaciones complejas.

### ¿Por qué JWT stateless con roles embebidos?

| Criterio | JWT stateless + roles | Sesiones en servidor |
| --- | --- | --- |
| Escalabilidad | Horizontal fácil | Requiere sticky sessions o Redis |
| Estado en servidor | Ninguno | Almacenamiento de sesiones |
| Revocación | Requiere blacklist | Borrar sesión |
| Rol en cada petición | Embebido en el payload, sin consultar la BD | Requiere consultar la BD cada vez |

Para Neodomus, tener el rol embebido en el JWT permite autorizar rápidamente sin hacer una consulta a la base de datos por cada petición, lo cual es crítico para el rendimiento cuando hay muchos técnicos y administradores.

### ¿Por qué MySQL y no PostgreSQL?

El proyecto original usaba MySQL 8.0 por requisitos del stack académico (triggers, vistas, procedimientos almacenados). MySQL es suficiente para la carga esperada (miles de usuarios, cientos de técnicos). Sin embargo, si se escalara, se podría migrar fácilmente gracias a SQLAlchemy (cambiar la cadena de conexión).

### ¿Por qué Leaflet para el mapa del técnico?

- **Open-source** y gratuito, sin restricciones de API key como Google Maps.
- **Ligero** y compatible con React mediante `react-leaflet`.
- **Suficiente** para mostrar marcadores, popups y trayectorias.
- **Accesible**, con soporte de teclado y etiquetas ARIA.

### ¿Por qué React + Vite y no Next.js?

Neodomus es una **SPA (Single Page Application)** y no necesita SSR (Server-Side Rendering) porque el backend ya es una API separada. Vite ofrece desarrollo rápido y builds optimizados. Next.js agregaría complejidad innecesaria. Además, la navegación por roles se maneja completamente en el cliente con `ProtectedRoute`.

## Configuración de entornos

| Variable | Propósito | Desarrollo | Producción |
| --- | --- | --- | --- |
| `ENVIRONMENT` | Define el entorno activo | `development` | `production` |
| `/docs` (Swagger) | Documentación interactiva de la API | Disponible | Deshabilitado (404) |
| `DATABASE_URL` | Conexión a la base de datos | `mysql://user:pass@localhost:3306/neodomus` | Servidor MySQL en cloud (Aiven/Clever Cloud) |
| `FRONTEND_URL` | Origen permitido por CORS | `http://localhost:5173` | `https://app.neodomus.com` |
| `SECRET_KEY` | Firma de tokens y seguridad | Clave de desarrollo (≥ 32 caracteres) | Clave aleatoria (`openssl rand -hex 32`) |
| `SMTP_*` | Envío de correos | Mock (logs en consola) | Credenciales reales (Resend/SendGrid) |
| `PAYMENT_SECRET` | Integración con la pasarela de pagos | Sandbox (test) | Clave de producción (MercadoPago/Stripe) |
| `MAPBOX_TOKEN` (opcional) | Token de mapas, si se usa | Token público de prueba | Token de producción |

> Consulta `backend/.env.example` y `frontend/.env.example` para la lista completa de variables.

## Resumen de componentes

| Componente | Tecnología | Responsabilidad |
| --- | --- | --- |
| Frontend (SPA) | React 18 + Vite + TypeScript | UI, estado global, rutas protegidas por rol y mapa Leaflet |
| Backend API | FastAPI + SQLAlchemy | Lógica de negocio, autenticación, roles y endpoints REST |
| Base de datos | MySQL 8.0 | Persistencia, triggers (48 h), vistas e integridad referencial |
| Autenticación | JWT + bcrypt | Sesiones stateless con roles embebidos en el token |
| Mapa | Leaflet + react-leaflet | Visualización de tareas para técnicos con marcadores |
| Pagos | MercadoPago/Stripe | Pasarela, webhook, abonos parciales y comprobantes PDF |
| Notificaciones | SMTP + in-app (campana) | Email de confirmación, recordatorios y asignaciones |
| Chat | REST (sin WebSockets v1) | Comunicación asíncrona con contexto de servicio |
| Auditoría | Tabla `audit_log` | Trazabilidad de eventos críticos (login, asignaciones, pagos) |
| Rate limiting | slowapi (por IP) | Protección contra fuerza bruta en login, registro y recuperación |
| Seguridad | CORS, cabeceras, HTTPS | Producción deshabilita Swagger y limita los orígenes permitidos |

## Conclusión

Neodomus sigue una arquitectura limpia de tres capas, con separación clara de responsabilidades, roles embebidos en JWT y componentes bien definidos para citas, pagos, mapa y chat. Esta arquitectura permite escalar horizontalmente (stateless), es testeable gracias a la inyección de dependencias y se mantiene organizada en capas independientes. El frontend está estructurado por roles y protege sus rutas automáticamente, mientras que el backend valida cada operación con lógica de negocio y reglas como la cancelación con 48 horas de anticipación. Todo el sistema está diseñado para ser accesible (WCAG AA) y seguro (OWASP Top 10).
