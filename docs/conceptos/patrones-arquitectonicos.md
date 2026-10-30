> **Alcance:** este archivo presenta patrones/conceptos de referencia y contiene ejemplos históricos. Las rutas `backend/`/`frontend/`, Leaflet y otros ejemplos no describen necesariamente la implementación actual. Para arquitectura comprobada usa `docs/referencia-tecnica/architecture.md`; para el código real revisa `be/`, `fe/` y `movil/`.
> **Nota 2026-08 — Stack real:** Este documento lista `Leaflet`/`react-leaflet` (Patrón 10) y `backend/`+`frontend/` (Patrón 9). **Real:** Sin Leaflet (`fe/package.json` sin leaflet), monorepo `be/`+`fe/`+`movil/` (`docker-compose.yml:24,93`), `uv` no `poetry`, `react-icons` no `lucide-react`. Ver `restricciones.md` y `docs/referencia-tecnica/architecture.md` actualizados. Patrón 10 es aspiracional/futuro (HU-025).

# Patrones Arquitectónicos — Neodomus

<!--
  Archivo: patrones-arquitectonicos.md
  Descripción: Documentación técnica ilustrada de los patrones arquitectónicos
               aplicados en el proyecto Neodomus (plataforma de servicios domóticos).
  ¿Para qué? Servir como referencia de estudio y consulta para entender por qué
             el sistema está estructurado como lo está.
  ¿Impacto? Comprender los patrones facilita mantener, extender y defender
            decisiones técnicas del proyecto ante evaluaciones o presentaciones.
-->

> **Proyecto:** Neodomus — Plataforma de gestión de servicios domóticos  
> **Stack:** React 18 + TypeScript · Vite · FastAPI · MySQL · Leaflet · pnpm  
> **Cobertura tests:** Frontend ≥ 80% · Backend ≥ 70%

---

## Resumen ejecutivo

El sistema aplica **10 patrones arquitectónicos y de diseño** de uso profesional adaptados a una aplicación del mundo real de servicios técnicos. Cada patrón resuelve un problema concreto y está presente en el código del proyecto.

| #   | Patrón                              | Dónde vive                           | Qué resuelve                                                              |
| --- | ----------------------------------- | ------------------------------------ | ------------------------------------------------------------------------- |
| 1   | Arquitectura en Capas               | `backend/app/`                       | Separación de responsabilidades en el backend                             |
| 2   | DTO — Data Transfer Object          | `backend/app/schemas/`               | Nunca exponer datos internos de BD (contraseñas, datos sensibles)         |
| 3   | Inyección de Dependencias           | `backend/app/dependencies.py`        | Desacoplar servicios transversales (DB, auth, roles)                      |
| 4   | JWT Stateless + Roles               | `backend/app/core/security.py`       | Autenticación sin estado + control de acceso por rol (usuario/técnico/admin) |
| 5   | Context / Provider                  | `frontend/src/context/AuthContext.tsx` | Estado de autenticación y rol global en toda la app React                 |
| 6   | Custom Hook                         | `frontend/src/hooks/useAuth.ts`      | Encapsular y reutilizar lógica de autenticación y roles                   |
| 7   | Interceptor                         | `frontend/src/services/api.ts`       | Adjuntar token JWT en cada petición automáticamente                       |
| 8   | Route Guard basado en roles         | `frontend/src/components/ProtectedRoute.tsx` | Proteger rutas según rol (usuario, técnico, admin)                       |
| 9   | Monorepo                            | `backend/` + `frontend/`             | Código fuente unificado en un solo repositorio                            |
| 10  | Patrón de Mapa + Marcadores         | `frontend/src/modules/maps/` + Leaflet | Visualización de tareas geolocalizadas para técnicos                     |

---

## Vista general del sistema

![](../assets/neodomus-overview.svg)

Neodomus sigue una **arquitectura Cliente–Servidor** de tres capas lógicas con un frontend SPA y un backend API-first:

1. **Frontend (React SPA)** — Interfaz para usuarios, técnicos y administradores. Nunca guarda estado crítico en el servidor.
2. **Backend (FastAPI)** — Lógica de negocio (solicitudes, asignaciones, pagos). Expone una API REST bajo `/api/v1/`.
3. **Base de datos (MySQL)** — Persistencia de usuarios, servicios, citas, pagos, chat. Solo accedida desde el backend.

La comunicación es exclusivamente **HTTP + JSON**. Los tokens JWT (con rol embebido) viajan en `Authorization: Bearer <token>`. No hay sesiones en el servidor, lo que permite escalar horizontalmente.

---

## Patrón 1 — Arquitectura en Capas

![](../assets/neodomus-backend-layers.svg)

### ¿Qué es?

Organizar el código en capas horizontales donde **cada capa solo puede comunicarse con la capa directamente inferior**.

### ¿Cómo se aplica en Neodomus?
HTTP Request (cliente: web o móvil)
↓
┌─────────────────────────────────────────────────┐
│ routers/ → Capa HTTP │ Recibe JSON, valida con Pydantic, devuelve respuesta
├─────────────────────────────────────────────────┤
│ services/ → Capa de Negocio │ Reglas: "Un usuario no puede cancelar con <48h"
├─────────────────────────────────────────────────┤
│ models/ + schemas → Capa de Datos │ SQLAlchemy ORM + DTOs (filtra campos sensibles)
├─────────────────────────────────────────────────┤
│ core/ + utils/ → Capa Transversal │ security (bcrypt, JWT), db, email, audit_log
└─────────────────────────────────────────────────┘
↓
MySQL

text

### Ejemplo en código

```python
# routers/servicios.py — solo recibe request y llama al service
@router.post("/solicitar", response_model=CitaResponse)
async def solicitar_servicio(
    datos: CitaCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Delega toda la lógica al servicio
    return await servicio_service.crear_solicitud(db, datos, current_user.id)

# services/servicio_service.py — contiene la lógica de negocio
async def crear_solicitud(db: Session, datos: CitaCreate, user_id: int) -> Cita:
    # Validar que la fecha sea > ahora + 24h
    if datos.fecha < datetime.now() + timedelta(hours=24):
        raise HTTPException(400, "La fecha debe ser al menos 24 horas después")
    # Asignar estado inicial "pendiente"
    nueva_cita = Cita(**datos.dict(), usuario_id=user_id, estado="pendiente")
    db.add(nueva_cita)
    db.commit()
    # Registrar en audit log
    audit_log(user_id=user_id, action="solicitar_servicio", target_id=nueva_cita.id)
    return nueva_cita
Ventaja
Un cambio en las reglas de negocio (ej. cambiar el umbral de 24h a 48h) se hace solo en el service. El router y la BD no se modifican. Cada capa es testeable independientemente.

Patrón 2 — DTO (Data Transfer Object)
¿Qué es?
Un objeto diseñado exclusivamente para transportar datos entre capas, diferente del modelo de base de datos.

¿Por qué es crítico en Neodomus?
El modelo ORM Usuario contiene hashed_password, reset_token, direccion_completa. Si devolviéramos el objeto ORM directamente, el hash de la contraseña y datos sensibles quedarían expuestos. El DTO actúa como filtro.

Ejemplo en código
python
# models/usuario.py — Modelo ORM (lo que hay en la BD)
class Usuario(Base):
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True)
    nombre = Column(String)
    apellido = Column(String)
    hashed_password = Column(String)   # ← NUNCA debe salir en la respuesta
    rol = Column(Enum(RolEnum))        # "usuario", "tecnico", "admin"
    direccion = Column(String)
    telefono = Column(String)
    is_active = Column(Boolean)

# schemas/usuario.py — Schema Pydantic (lo que se devuelve al cliente)
class UsuarioResponse(BaseModel):
    id: int
    email: str
    nombre: str
    apellido: str
    rol: str
    # hashed_password: ← OMITIDO
    # reset_token: ← OMITIDO
    direccion: str   # solo si el usuario tiene permiso para verla
    telefono: str
    is_active: bool

    model_config = ConfigDict(from_attributes=True)
python
# routers/usuarios.py — FastAPI convierte automáticamente ORM → DTO
@router.get("/me", response_model=UsuarioResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user  # FastAPI aplica from_attributes y omite campos sensibles
Ventaja
La API puede cambiar su contrato (qué datos se exponen) sin alterar la estructura de la base de datos, y viceversa. Los técnicos no ven datos de pago de los clientes; los clientes no ven la disponibilidad de otros técnicos.

Patrón 3 — Inyección de Dependencias (DI)
¿Qué es?
En lugar de que cada función cree sus propias dependencias (sesión de BD, cliente de email, etc.), las recibe inyectadas desde afuera. FastAPI implementa esto con Depends().

Ejemplo en código
python
# dependencies.py — define las dependencias reutilizables

def get_db() -> Generator[Session, None, None]:
    """Provee una sesión de BD para cada request; la cierra al terminar."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

async def get_current_user(
    token: str = Depends(oauth2_scheme),   # DI: extrae el token del header
    db: Session = Depends(get_db)          # DI: inyecta la sesión de BD
) -> Usuario:
    """Valida el JWT, extrae el rol y devuelve el usuario autenticado."""
    payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    user_id = payload.get("sub")
    user = db.query(Usuario).filter(Usuario.id == user_id).first()
    if not user:
        raise HTTPException(401)
    return user

def require_rol(roles_permitidos: list[str]):
    """Factory que retorna una dependencia que valida el rol."""
    async def role_checker(current_user: Usuario = Depends(get_current_user)):
        if current_user.rol not in roles_permitidos:
            raise HTTPException(403, "No tienes permiso para esta acción")
        return current_user
    return role_checker
python
# routers/tecnicos.py — consume dependencias con validación de rol
@router.get("/mis-tareas")
async def mis_tareas(
    current_user: Usuario = Depends(require_rol(["tecnico", "admin"])),
    db: Session = Depends(get_db)
):
    # Solo técnicos o admins pueden acceder
    tareas = db.query(Cita).filter(Cita.tecnico_id == current_user.id).all()
    return tareas
Ventaja
Para los tests, se puede reemplazar get_db por una base de datos en memoria o mock, y get_current_user por un usuario de prueba con rol específico, sin tocar los routers.

python
# tests/conftest.py — override de dependencias
app.dependency_overrides[get_db] = override_get_db  # BD de test
app.dependency_overrides[get_current_user] = lambda: test_admin_user  # usuario admin mock
Patrón 4 — JWT Stateless + Roles
¿Qué es?
El servidor no guarda sesión. En cambio, emite un token firmado criptográficamente que contiene el rol del usuario (usuario, técnico, administrador). El cliente lo presenta en cada request.

Tokens del sistema
Token	Duración	Contenido del payload	Propósito
access_token	15 minutos	{ sub: user_id, rol: "tecnico", exp: ... }	Autenticar cada request y autorizar según rol
refresh_token	7 días	{ sub: user_id, type: "refresh", exp: ... }	Obtener un nuevo access_token sin re-login
Ejemplo en código
python
# core/security.py — creación del token con rol
def create_access_token(user_id: int, rol: str) -> str:
    payload = {
        "sub": str(user_id),
        "rol": rol,                     # ← rol embebido en el token
        "exp": datetime.utcnow() + timedelta(minutes=15)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")

# dependencies.py — verificación del token y extracción del rol
async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        user_id = int(payload.get("sub"))
        rol = payload.get("rol")  # ← se obtiene del token, no de la BD (ahorra consulta)
    except JWTError:
        raise HTTPException(401, "Token inválido")
    user = db.query(Usuario).filter(Usuario.id == user_id).first()
    if not user or user.rol != rol:   # validación de consistencia
        raise HTTPException(401)
    return user
Ventaja
El backend no necesita consultar la BD para conocer el rol en cada request (aunque igual valida consistencia). El rol viaja dentro del token, lo que acelera la autorización. El sistema puede escalar a múltiples instancias sin compartir estado.

Patrón 5 — Context / Provider (Frontend)
¿Qué es?
React usa el patrón Provider para compartir estado global (usuario, rol, token) sin necesidad de pasar props manualmente por cada nivel del árbol de componentes.

Ejemplo en código
typescript
// context/AuthContext.tsx
interface AuthContextType {
  user: UsuarioResponse | null;
  rol: "usuario" | "tecnico" | "admin" | null;
  accessToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UsuarioResponse | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const login = async (email: string, password: string) => {
    const response = await authApi.login({ email, password });
    setAccessToken(response.access_token);
    // Decodificar token para obtener rol (sin validar firma, solo para UI)
    const payload = JSON.parse(atob(response.access_token.split('.')[1]));
    setUser({ ...response.user, rol: payload.rol });
    sessionStorage.setItem("access_token", response.access_token);
  };

  return (
    <AuthContext.Provider value={{ user, rol: user?.rol, accessToken, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
tsx
// main.tsx — AuthProvider envuelve toda la app
<AuthProvider>
  <BrowserRouter>
    <App />
  </BrowserRouter>
</AuthProvider>
Ventaja
Navbar, DashboardPage, TechMapPage y AdminPanel todos acceden al mismo estado de autenticación y rol sin recibir props. Un cambio de rol se propaga instantáneamente a todos los componentes.

Patrón 6 — Custom Hook (Frontend)
¿Qué es?
Una función de React que encapsula lógica reutilizable y puede usar otros hooks internamente.

Ejemplo en código
typescript
// hooks/useAuth.ts
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth() debe usarse dentro de <AuthProvider>");
  }
  return context;
}

// hooks/useHasRol.ts
export function useHasRol(requiredRol: string | string[]): boolean {
  const { rol, isLoading } = useAuth();
  if (isLoading) return false;
  if (Array.isArray(requiredRol)) {
    return requiredRol.includes(rol || "");
  }
  return rol === requiredRol;
}
tsx
// components/TechOnlyButton.tsx — uso del hook
export function TechOnlyButton() {
  const isTech = useHasRol("tecnico");
  if (!isTech) return null;
  return <button>Ver mis tareas en el mapa</button>;
}
Ventaja
En lugar de esparcir useContext(AuthContext) con validación en cada componente, se centraliza en useAuth(). La lógica de verificación de roles se reutiliza con useHasRol. Si el contexto cambia, solo se modifican los hooks.

Patrón 7 — Interceptor (Frontend)
¿Qué es?
Middleware a nivel de cliente HTTP que procesa todas las peticiones/respuestas antes de que lleguen al código de la aplicación.

Ejemplo en código
typescript
// services/api.ts
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

// Interceptor de request — adjunta el token automáticamente
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor de response — maneja errores de autenticación y refresh token
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = sessionStorage.getItem("refresh_token");
        const response = await authApi.refresh({ refresh_token: refreshToken });
        sessionStorage.setItem("access_token", response.data.access_token);
        originalRequest.headers.Authorization = `Bearer ${response.data.access_token}`;
        return api(originalRequest);
      } catch (refreshError) {
        sessionStorage.clear();
        window.location.href = "/login";
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  },
);
Ventaja
Ningún componente ni función de API necesita preocuparse por añadir el header Authorization ni por manejar la expiración del token. El interceptor lo hace automáticamente y refresca el token silenciosamente.

Patrón 8 — Route Guard basado en roles (SPA)
¿Qué es?
En una SPA, el enrutamiento ocurre en el cliente. El Route Guard protege rutas según el rol del usuario, redirigiendo si no tiene permiso.

Ejemplo en código
tsx
// components/ProtectedRoute.tsx
export function ProtectedRoute({ allowedRoles }: { allowedRoles: string[] }) {
  const { isAuthenticated, rol, isLoading } = useAuth();

  if (isLoading) return <LoadingSpinner />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(rol || "")) {
    // Usuario autenticado pero sin rol suficiente → redirigir a dashboard según su rol real
    if (rol === "tecnico") return <Navigate to="/tech/dashboard" replace />;
    if (rol === "admin") return <Navigate to="/admin/dashboard" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
tsx
// App.tsx — configuración de rutas protegidas por rol
<Routes>
  {/* Rutas públicas */}
  <Route path="/login" element={<LoginPage />} />
  <Route path="/register" element={<RegisterPage />} />

  {/* Rutas para usuarios normales */}
  <Route element={<ProtectedRoute allowedRoles={["usuario"]} />}>
    <Route path="/dashboard" element={<DashboardPage />} />
    <Route path="/servicios/solicitar" element={<SolicitarServicioPage />} />
    <Route path="/mis-servicios" element={<MisServiciosPage />} />
  </Route>

  {/* Rutas para técnicos */}
  <Route element={<ProtectedRoute allowedRoles={["tecnico"]} />}>
    <Route path="/tech/mapa" element={<TechMapPage />} />
    <Route path="/tech/mis-tareas" element={<TechTareasPage />} />
  </Route>

  {/* Rutas para administradores */}
  <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
    <Route path="/admin/tecnicos" element={<AdminTecnicosPage />} />
    <Route path="/admin/solicitudes" element={<AdminSolicitudesPage />} />
  </Route>
</Routes>
Ventaja
Un usuario técnico que intenta acceder a /admin/tecnicos es redirigido automáticamente a su propio dashboard (o a login si no está autenticado). La protección está centralizada y no requiere lógica dispersa en cada componente.

Patrón 9 — Monorepo
¿Qué es?
Múltiples proyectos (frontend React, backend FastAPI, scripts de BD) conviven en un solo repositorio git.

Estructura de Neodomus
text
neodomus/                    ← Un solo repositorio git
├── backend/                 ← FastAPI (Python)
│   ├── app/
│   │   ├── routers/
│   │   ├── services/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── core/
│   │   └── utils/
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                ← React + TypeScript + Vite
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── context/
│   │   ├── hooks/
│   │   └── services/
│   ├── package.json
│   └── vite.config.ts
├── database/                ← Scripts SQL
│   ├── init.sql
│   ├── triggers.sql
│   └── seeds.sql
├── docker-compose.yml       ← Levanta todo (MySQL, backend, frontend dev)
└── .github/
    └── copilot-instructions.md
Ventaja
Un git clone obtiene todo el proyecto.

Los cambios que afectan a backend y frontend viajan en el mismo commit (ej. añadir un campo en la BD y mostrarlo en UI).

La infraestructura (docker-compose.yml) está versionada y puede replicarse fácilmente.

Patrón 10 — Patrón de Mapa + Marcadores (Leaflet)
¿Qué es?
Visualización de tareas geolocalizadas sobre un mapa interactivo, con marcadores que representan distintos tipos de eventos (citas, entregas) y permiten acciones al hacer clic.

¿Cómo se aplica en Neodomus?
El técnico necesita ver en un mapa todas sus tareas del día (instalaciones, mantenimientos, entregas) para planificar la ruta más eficiente. El patrón consiste en:

El backend almacena coordenadas (lat, lng) en las tablas cita y pedido.

El frontend consume un endpoint que devuelve las tareas con sus coordenadas.

Se renderiza un mapa Leaflet con marcadores diferenciados por tipo.

Ejemplo en código
tsx
// pages/tech/TechMapPage.tsx
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { useTareasMapa } from '../../hooks/useTareasMapa';

export function TechMapPage() {
  const { tareas, isLoading } = useTareasMapa();  // custom hook que llama a API

  if (isLoading) return <Spinner />;

  return (
    <MapContainer center={[-34.6037, -58.3816]} zoom={12} className="h-[600px] w-full">
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {tareas.map(tarea => (
        <Marker
          key={tarea.id}
          position={[tarea.lat, tarea.lng]}
          icon={tarea.tipo === 'cita' ? citaIcon : entregaIcon}
          eventHandlers={{ click: () => mostrarDetalles(tarea) }}
          aria-label={`${tarea.tipo === 'cita' ? 'Cita' : 'Entrega'} en ${tarea.direccion}`}
        >
          <Popup>
            <strong>{tarea.cliente_nombre}</strong><br />
            {tarea.direccion}<br />
            {tarea.fecha} a las {tarea.hora}<br />
            <button onClick={() => navegarATarea(tarea.id)}>Ver detalles</button>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
python
# backend/app/routers/tech.py
@router.get("/mis-tareas-mapa")
async def get_tareas_mapa(
    current_user: Usuario = Depends(require_rol(["tecnico"])),
    db: Session = Depends(get_db)
):
    tareas = db.query(Cita).filter(
        Cita.tecnico_id == current_user.id,
        Cita.estado.in_(["pendiente", "en_progreso"])
    ).all()
    return [
        {
            "id": t.id,
            "tipo": "cita",
            "lat": t.latitud,
            "lng": t.longitud,
            "direccion": t.direccion,
            "cliente_nombre": t.usuario.nombre,
            "fecha": t.fecha,
            "hora": t.hora
        } for t in tareas
    ]
Ventaja
El técnico planifica su ruta visualmente, reduciendo tiempos de desplazamiento y mejorando la eficiencia. Los marcadores diferenciados (ej. rojo para citas urgentes, verde para entregas) permiten una comprensión inmediata. El mapa es accesible por teclado (movimiento de mapa, selección de marcadores) y compatible con lectores de pantalla mediante aria-label.

Relación entre patrones en Neodomus
text
┌─────────────────────────────────────────────────────────────────────────────┐
│ Monorepo (#9)                                                               │
│                                                                             │
│  ┌─── REST API (#10) ────────────────────────────────────────────────────┐  │
│  │                                                                        │  │
│  │  Frontend (SPA)                      Backend (Capas #1)               │  │
│  │  ┌────────────────────────────┐      ┌─────────────────────────────┐  │  │
│  │  │ Provider (#5)              │      │ routers/                    │  │  │
│  │  │  Hook (#6)                 │←─────│ services/      ← DI (#3)    │  │  │
│  │  │  RouteGuard (#8) (roles)   │─────→│ models/        ← DTO (#2)   │  │  │
│  │  │  Interceptor (#7)          │      │ core/security  ← JWT+roles(#4)│ │  │
│  │  │  Mapa + marcadores (#10)   │      │ utils/ (audit, email)        │  │  │
│  │  └────────────────────────────┘      └─────────────────────────────┘  │  │
│  │                                              ↕                         │  │
│  │                                        MySQL (SQLAlchemy)              │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
Cada patrón resuelve un problema específico de Neodomus. Juntos, hacen que el sistema sea:

Seguro — DTO + JWT con roles + bcrypt + validación de permisos.

Mantenible — Capas + DI + Custom Hooks + Route Guards.

Escalable — Stateless JWT + Monorepo + API REST.

Eficiente — Patrón de mapa + geolocalización para técnicos.

Testeable — DI override + mocks de roles + cobertura ≥ 80/70.

Comparativa con otros sistemas
Patrón	Neodomus	Sistema de autenticación simple
Roles	JWT embebe rol, validación en cada router	Solo usuario autenticado / no autenticado
Mapa	Leaflet + marcadores dinámicos	No aplica
Chat	No incluido en este resumen, pero usaría WebSockets	No aplica
Pagos	Integración con pasarela, patrón de webhook	No aplica
Rutas protegidas	Basadas en allowedRoles array	Solo verifica autenticación
Conclusión pedagógica para Neodomus: Entender estos patrones no es un ejercicio teórico. Cada uno resuelve un problema real de la plataforma: la inyección de dependencias permite testear el servicio de cancelación con 48h sin tocar la BD real; el DTO evita exponer el número de tarjeta de crédito; el patrón de mapa con marcadores permite al técnico ahorrar horas de desplazamiento. Al dominar estos patrones, el equipo puede extender Neodomus (añadir facturación electrónica, IoT, etc.) sin perder calidad ni seguridad.
