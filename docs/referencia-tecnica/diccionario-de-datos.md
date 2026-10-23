# Diccionario de datos Neodomus

**Fuente:** modelos SQLAlchemy de `be/app/models/`. Tipos y restricciones reflejan las declaraciones ORM; para la estructura física desplegada deben contrastarse las migraciones de Alembic y `scripts/init_db.sql`.

**Gestor:** MySQL 8 con InnoDB y `utf8mb4`, según configuración del backend.

Se documentan las claves foráneas explícitas; no se infieren relaciones solo por el nombre de un campo.

**Tablas documentadas:** 39.

## `calificaciones`

**Modelo:** `Calificacion` (`be/app/models/calificacion.py`). **Propósito:** Registra información de calificacion.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id_calificacion` | `Integer` | PK; NOT NULL | Identificador principal. |
| `id_cliente_c` | `Integer` | FK → clientes.id_cliente; Índice; NOT NULL | Referencia a clientes. |
| `id_tecnico_c` | `Integer` | FK → tecnicos.id_tecnico; Índice; NOT NULL | Referencia a tecnicos. |
| `id_cita_c` | `Integer` | FK → citas.id_cita; NOT NULL | Referencia a citas. |
| `calificacion` | `Integer` | NOT NULL | Dato de calificacion. |
| `comentario` | `String` | — | Dato de comentario. |
| `created_at` | `DateTime` | Predeterminado en BD: func.now() | Dato de created at. |

## `calificaciones_producto`

**Modelo:** `CalificacionProducto` (`be/app/models/calificacion_producto.py`). **Propósito:** Registra información de calificacion producto.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id_calificacion_producto` | `Integer` | PK; NOT NULL | Identificador principal. |
| `id_cliente_cp` | `Integer` | FK → clientes.id_cliente; Índice; NOT NULL | Referencia a clientes. |
| `id_pedido_cp` | `Integer` | FK → pedidos.id_pedido; Índice; NOT NULL | Referencia a pedidos. |
| `id_producto_cp` | `Integer` | FK → productos.id_producto; Índice; NOT NULL | Referencia a productos. |
| `calificacion` | `Integer` | NOT NULL | Dato de calificacion. |
| `comentario` | `String` | — | Dato de comentario. |
| `foto_url` | `String(255)` | — | Dato de foto url. |
| `created_at` | `DateTime` | Predeterminado en BD: func.now() | Dato de created at. |

## `categorias`

**Modelo:** `Categoria` (`be/app/models/categoria.py`). **Propósito:** Registra información de categoria.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id_categoria` | `No especificado` | PK; Índice; NOT NULL | Identificador principal. |
| `nombre_categoria` | `String(50)` | NOT NULL | Dato de nombre categoria. |
| `descripcion` | `String(200)` | — | Dato de descripcion. |

## `cita_producto`

**Modelo:** `CitaProducto` (`be/app/models/cita_producto.py`). **Propósito:** Registra información de cita producto.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id_cita_producto` | `Integer` | PK; NOT NULL | Identificador principal. |
| `id_cita` | `Integer` | FK → citas.id_cita; Índice; NOT NULL | Referencia a citas. |
| `id_producto` | `Integer` | FK → productos.id_producto; Índice; NOT NULL | Referencia a productos. |
| `id_variante` | `Integer` | FK → producto_variantes.id | Referencia a producto_variantes. |
| `cantidad` | `Integer` | NOT NULL; Predeterminado ORM: 1 | Dato de cantidad. |
| `notas` | `String(255)` | — | Dato de notas. |

## `citas`

**Modelo:** `Cita` (`be/app/models/cita.py`). **Propósito:** Registra información de cita.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id_cita` | `Integer` | PK; NOT NULL | Identificador principal. |
| `id_cliente` | `Integer` | FK → clientes.id_cliente; Índice; NOT NULL | Referencia a clientes. |
| `id_tecnico` | `Integer` | — | Dato de id tecnico. |
| `nombre_tecnico` | `String(150)` | — | Dato de nombre tecnico. |
| `id_tecnico_2` | `Integer` | — | Dato de id tecnico 2. |
| `nombre_tecnico_2` | `String(150)` | — | Dato de nombre tecnico 2. |
| `id_tecnico_3` | `Integer` | — | Dato de id tecnico 3. |
| `nombre_tecnico_3` | `String(150)` | — | Dato de nombre tecnico 3. |
| `tipo_servicio` | `String(30)` | NOT NULL | Dato de tipo servicio. |
| `fecha` | `Date` | NOT NULL | Dato de fecha. |
| `hora` | `String(10)` | NOT NULL | Dato de hora. |
| `direccion` | `String(200)` | NOT NULL | Dato de direccion. |
| `descripcion` | `String` | — | Dato de descripcion. |
| `estado` | `String(20)` | NOT NULL; Predeterminado ORM: 'Pendiente' | Dato de estado. |
| `costo_cita` | `Numeric(12, 2)` | — | Dato de costo cita. |
| `metodo_pago` | `String(30)` | — | Dato de metodo pago. |
| `estado_pago` | `String(20)` | — | Dato de estado pago. |
| `numero_transaccion` | `String(120)` | — | Dato de numero transaccion. |
| `id_comision_c` | `Integer` | FK → comisiones.id_comision | Referencia a comisiones. |
| `id_especializacion` | `Integer` | FK → especializaciones.id_especializacion | Referencia a especializaciones. |
| `recordatorio_enviado` | `Boolean` | NOT NULL; Predeterminado en BD: text('0') | Dato de recordatorio enviado. |
| `created_at` | `DateTime` | Predeterminado en BD: func.now() | Dato de created at. |

## `clientes`

**Modelo:** `Cliente` (`be/app/models/cliente.py`). **Propósito:** Registra información de cliente.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id_cliente` | `Integer` | PK; NOT NULL | Identificador principal. |
| `first_name` | `String(100)` | NOT NULL | Dato de first name. |
| `last_name` | `String(100)` | NOT NULL | Dato de last name. |
| `email` | `String(100)` | Único; Índice; NOT NULL | Dato de email. |
| `password_hash` | `String(255)` | — | Dato de password hash. |
| `id_tipo_documento_c` | `Integer` | — | Dato de id tipo documento c. |
| `documento_cliente` | `Integer` | Único | Dato de documento cliente. |
| `telefono_cliente` | `Integer` | — | Dato de telefono cliente. |
| `address` | `String(150)` | — | Dato de address. |
| `is_active` | `Boolean` | NOT NULL; Predeterminado ORM: False | Dato de is active. |
| `verification_token` | `String(100)` | Único | Dato de verification token. |
| `auth_provider` | `String(20)` | NOT NULL; Predeterminado ORM: 'local' | Dato de auth provider. |
| `google_id` | `String(255)` | Único | Dato de google id. |
| `foto_url` | `String(255)` | — | Dato de foto url. |
| `created_at` | `DateTime` | Predeterminado en BD: func.now() | Dato de created at. |

## `comisiones`

**Modelo:** `Comision` (`be/app/models/otros.py`). **Propósito:** Registra información de comision.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id_comision` | `No especificado` | PK; NOT NULL | Identificador principal. |
| `porcentaje_comision` | `Numeric(5, 2)` | — | Dato de porcentaje comision. |
| `valor_comision` | `Numeric(10, 2)` | — | Dato de valor comision. |

## `contactos`

**Modelo:** `Contacto` (`be/app/models/contacto.py`). **Propósito:** Registra información de contacto.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id` | `Integer` | PK; NOT NULL | Identificador principal. |
| `nombre_usuario` | `String(120)` | NOT NULL | Dato de nombre usuario. |
| `email_usuario` | `String(120)` | NOT NULL | Dato de email usuario. |
| `asunto` | `String(180)` | NOT NULL | Dato de asunto. |
| `mensaje` | `String` | NOT NULL | Dato de mensaje. |
| `categoria` | `String(40)` | — | Dato de categoria. |
| `estado` | `String(20)` | NOT NULL; Predeterminado ORM: 'pendiente' | Dato de estado. |
| `respuesta` | `String` | — | Dato de respuesta. |
| `responded_by` | `Integer` | — | Dato de responded by. |
| `created_at` | `DateTime` | Predeterminado en BD: func.now() | Dato de created at. |
| `responded_at` | `DateTime` | — | Dato de responded at. |

## `cupones_descuento`

**Modelo:** `CuponDescuento` (`be/app/models/novedad.py`). **Propósito:** Registra información de cupon descuento.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id_cupon` | `Integer` | PK; NOT NULL | Identificador principal. |
| `codigo` | `String(50)` | Único; Índice; NOT NULL | Dato de codigo. |
| `tipo_descuento` | `String(20)` | NOT NULL; Predeterminado ORM: 'porcentaje' | Dato de tipo descuento. |
| `valor_descuento` | `Float` | NOT NULL | Dato de valor descuento. |
| `fecha_vencimiento` | `No especificado` | — | Dato de fecha vencimiento. |
| `compra_minima` | `Float` | NOT NULL; Predeterminado ORM: 0 | Dato de compra minima. |
| `usos_maximos` | `Integer` | NOT NULL; Predeterminado ORM: 1 | Dato de usos maximos. |
| `usos_realizados` | `Integer` | NOT NULL; Predeterminado ORM: 0 | Dato de usos realizados. |
| `aplica_tienda_completa` | `Boolean` | NOT NULL; Predeterminado en BD: text('1') | Dato de aplica tienda completa. |
| `categorias_aplicables` | `String` | — | Dato de categorias aplicables. |
| `id_cliente` | `Integer` | FK → clientes.id_cliente; Índice | Referencia a clientes. |
| `id_novedad` | `Integer` | FK → novedades.id_novedad | Referencia a novedades. |
| `id_admin_crea` | `Integer` | FK → usuarios.id_usuario | Referencia a usuarios. |
| `activo` | `Boolean` | NOT NULL; Predeterminado en BD: text('1') | Dato de activo. |
| `created_at` | `DateTime` | NOT NULL; Predeterminado en BD: func.now() | Dato de created at. |

## `detalle_pedido`

**Modelo:** `DetallePedido` (`be/app/models/pedido.py`). **Propósito:** Registra información de detalle pedido.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id_detalle` | `Integer` | PK; NOT NULL | Identificador principal. |
| `id_pedido_d` | `Integer` | FK → pedidos.id_pedido | Referencia a pedidos. |
| `id_producto_d` | `Integer` | FK → productos.id_producto | Referencia a productos. |
| `id_servicio_d` | `Integer` | — | Dato de id servicio d. |
| `id_comision_d` | `Integer` | — | Dato de id comision d. |
| `cantidad_detalle` | `Integer` | Predeterminado ORM: 1 | Dato de cantidad detalle. |
| `cantidad_metros` | `Float` | — | Dato de cantidad metros. |
| `precio_unitario_detalle` | `Float` | — | Dato de precio unitario detalle. |
| `subtotal_detalle` | `Float` | — | Dato de subtotal detalle. |
| `descripcion_detalle` | `String` | — | Dato de descripcion detalle. |
| `fecha_servicio` | `DateTime` | — | Dato de fecha servicio. |
| `hora_servicio` | `String(5)` | — | Dato de hora servicio. |
| `direccion_servicio` | `String(200)` | — | Dato de direccion servicio. |

## `devoluciones`

**Modelo:** `Devolucion` (`be/app/models/devolucion.py`). **Propósito:** Registra información de devolucion.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id_devolucion` | `Integer` | PK; NOT NULL | Identificador principal. |
| `id_cliente_d` | `Integer` | FK → clientes.id_cliente; Índice; NOT NULL | Referencia a clientes. |
| `id_pedido_d` | `Integer` | FK → pedidos.id_pedido; Índice | Referencia a pedidos. |
| `id_producto_d` | `Integer` | FK → productos.id_producto; Índice | Referencia a productos. |
| `motivo` | `String` | — | Dato de motivo. |
| `descripcion` | `String` | — | Dato de descripcion. |
| `estado` | `String(20)` | NOT NULL; Predeterminado en BD: 'Pendiente' | Dato de estado. |
| `resolucion` | `String(20)` | — | Dato de resolucion. |
| `resuelta_por` | `Integer` | — | Dato de resuelta por. |
| `created_at` | `DateTime` | Predeterminado en BD: func.now() | Dato de created at. |
| `resuelta_at` | `DateTime` | — | Dato de resuelta at. |
| `preferencia` | `String(10)` | — | Dato de preferencia. |
| `id_tecnico_recogida` | `Integer` | Índice | Dato de id tecnico recogida. |
| `recogida_estado` | `String(20)` | Predeterminado en BD: 'Asignada' | Dato de recogida estado. |
| `evidencia_recogida` | `String(255)` | — | Dato de evidencia recogida. |
| `fecha_recogida` | `DateTime` | — | Dato de fecha recogida. |
| `evidencia_cambio` | `String(255)` | — | Dato de evidencia cambio. |
| `fecha_entrega_cambio` | `DateTime` | — | Dato de fecha entrega cambio. |
| `cantidad` | `Integer` | NOT NULL; Predeterminado en BD: '1' | Dato de cantidad. |
| `id_solicitud_dv` | `Integer` | Índice | Dato de id solicitud dv. |

## `email_verification_tokens`

**Modelo:** `EmailVerificationToken` (`be/app/models/email_verification_token.py`). **Propósito:** Registra información de email verification token.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id` | `Integer` | PK; NOT NULL | Identificador principal. |
| `email_cliente` | `String(100)` | FK → clientes.email; Único; NOT NULL | Referencia a clientes. |
| `code` | `String(6)` | Único; Índice; NOT NULL | Dato de code. |
| `expires_at` | `DateTime` | NOT NULL | Dato de expires at. |
| `used` | `Boolean` | NOT NULL; Predeterminado ORM: False | Dato de used. |
| `created_at` | `DateTime` | Predeterminado en BD: func.now() | Dato de created at. |

## `especializaciones`

**Modelo:** `Especializacion` (`be/app/models/especializacion.py`). **Propósito:** Registra información de especializacion.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id_especializacion` | `No especificado` | PK; Índice; NOT NULL | Identificador principal. |
| `nombre` | `String(100)` | Único; NOT NULL | Dato de nombre. |
| `descripcion` | `String(255)` | — | Dato de descripcion. |
| `activa` | `No especificado` | NOT NULL; Predeterminado en BD: '1' | Dato de activa. |
| `created_at` | `No especificado` | Predeterminado en BD: func.now() | Dato de created at. |

## `evidencias`

**Modelo:** `Evidencia` (`be/app/models/evidencia.py`). **Propósito:** Registra información de evidencia.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id_evidencia` | `Integer` | PK; NOT NULL | Identificador principal. |
| `id_cita` | `Integer` | FK → citas.id_cita; Índice; NOT NULL | Referencia a citas. |
| `id_tecnico` | `Integer` | FK → tecnicos.id_tecnico; NOT NULL | Referencia a tecnicos. |
| `url_archivo` | `String(255)` | NOT NULL | Dato de url archivo. |
| `descripcion` | `String(255)` | — | Dato de descripcion. |
| `fecha_subida` | `DateTime` | NOT NULL; Predeterminado en BD: func.now() | Dato de fecha subida. |

## `evidencias_entrega`

**Modelo:** `EvidenciaEntrega` (`be/app/models/evidencia.py`). **Propósito:** Registra información de evidencia entrega.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id` | `Integer` | PK; NOT NULL | Identificador principal. |
| `id_pedido` | `Integer` | FK → pedidos.id_pedido; Índice; NOT NULL | Referencia a pedidos. |
| `id_tecnico` | `Integer` | NOT NULL | Dato de id tecnico. |
| `url_archivo` | `String(255)` | NOT NULL | Dato de url archivo. |
| `created_at` | `DateTime` | Predeterminado en BD: func.now() | Dato de created at. |

## `evidencias_novedad`

**Modelo:** `EvidenciaNovedad` (`be/app/models/novedad.py`). **Propósito:** Registra información de evidencia novedad.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id_evidencia_n` | `Integer` | PK; NOT NULL | Identificador principal. |
| `id_novedad` | `Integer` | FK → novedades.id_novedad; Índice; NOT NULL | Referencia a novedades. |
| `url_archivo` | `String(500)` | NOT NULL | Dato de url archivo. |
| `descripcion` | `String(255)` | — | Dato de descripcion. |
| `fecha_subida` | `DateTime` | NOT NULL; Predeterminado en BD: func.now() | Dato de fecha subida. |

## `facturas`

**Modelo:** `Factura` (`be/app/models/factura.py`). **Propósito:** Registra información de factura.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id_factura` | `Integer` | PK; NOT NULL | Identificador principal. |
| `id_pedido` | `Integer` | FK → pedidos.id_pedido; Índice | Referencia a pedidos. |
| `id_cita` | `Integer` | FK → citas.id_cita; Índice | Referencia a citas. |
| `numero_factura` | `String(30)` | Único; NOT NULL | Dato de numero factura. |
| `fecha_factura` | `DateTime` | NOT NULL | Dato de fecha factura. |
| `monto_total` | `Float` | NOT NULL | Dato de monto total. |
| `metodo_pago` | `String(30)` | — | Dato de metodo pago. |
| `estado_pago` | `String(20)` | — | Dato de estado pago. |
| `numero_transaccion` | `String(50)` | — | Dato de numero transaccion. |
| `enviada_por_correo` | `Boolean` | NOT NULL; Predeterminado ORM: False | Dato de enviada por correo. |
| `created_at` | `DateTime` | Predeterminado en BD: func.now() | Dato de created at. |

## `historial_citas`

**Modelo:** `HistorialCita` (`be/app/models/especializacion.py`). **Propósito:** Registra información de historial cita.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id_historial` | `No especificado` | PK; Índice; NOT NULL | Identificador principal. |
| `id_cita` | `No especificado` | FK → citas.id_cita; Índice; NOT NULL | Referencia a citas. |
| `accion` | `String(50)` | NOT NULL | Dato de accion. |
| `tecnico_anterior_id` | `No especificado` | — | Dato de tecnico anterior id. |
| `tecnico_anterior_nombre` | `String(150)` | — | Dato de tecnico anterior nombre. |
| `tecnico_nuevo_id` | `No especificado` | — | Dato de tecnico nuevo id. |
| `tecnico_nuevo_nombre` | `String(150)` | — | Dato de tecnico nuevo nombre. |
| `administrador_id` | `No especificado` | — | Dato de administrador id. |
| `motivo` | `String(255)` | — | Dato de motivo. |
| `detalle` | `No especificado` | — | Dato de detalle. |
| `created_at` | `No especificado` | Predeterminado en BD: func.now() | Dato de created at. |

## `notificaciones`

**Modelo:** `Notificacion` (`be/app/models/notificacion.py`). **Propósito:** Registra información de notificacion.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id_notificacion` | `Integer` | PK; NOT NULL | Identificador principal. |
| `id_usuario` | `Integer` | FK → usuarios.id_usuario; Índice | Referencia a usuarios. |
| `id_cliente` | `Integer` | FK → clientes.id_cliente; Índice | Referencia a clientes. |
| `tipo` | `String(30)` | NOT NULL; Predeterminado ORM: 'sistema' | Dato de tipo. |
| `titulo` | `String(150)` | NOT NULL | Dato de titulo. |
| `mensaje` | `String(500)` | NOT NULL | Dato de mensaje. |
| `leida` | `Boolean` | NOT NULL; Predeterminado en BD: text('0') | Dato de leida. |
| `fecha_creacion` | `DateTime` | NOT NULL; Predeterminado en BD: func.now() | Dato de fecha creacion. |

## `novedad_historial`

**Modelo:** `NovedadHistorial` (`be/app/models/novedad.py`). **Propósito:** Registra información de novedad historial.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id_historial` | `Integer` | PK; NOT NULL | Identificador principal. |
| `id_novedad` | `Integer` | FK → novedades.id_novedad; Índice; NOT NULL | Referencia a novedades. |
| `id_usuario` | `Integer` | FK → usuarios.id_usuario | Referencia a usuarios. |
| `accion` | `String(100)` | NOT NULL | Dato de accion. |
| `detalle` | `String` | — | Dato de detalle. |
| `fecha` | `DateTime` | NOT NULL; Predeterminado en BD: func.now() | Dato de fecha. |

## `novedades`

**Modelo:** `Novedad` (`be/app/models/novedad.py`). **Propósito:** Registra información de novedad.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id_novedad` | `Integer` | PK; NOT NULL | Identificador principal. |
| `id_tecnico_n` | `Integer` | FK → tecnicos.id_tecnico; Índice | Referencia a tecnicos. |
| `id_pedido` | `Integer` | FK → pedidos.id_pedido; Índice | Referencia a pedidos. |
| `id_cita` | `Integer` | FK → citas.id_cita; Índice | Referencia a citas. |
| `id_cliente` | `Integer` | FK → clientes.id_cliente; Índice | Referencia a clientes. |
| `id_devolucion` | `Integer` | FK → devoluciones.id_devolucion; Índice | Referencia a devoluciones. |
| `fecha_reporte_novedad` | `DateTime` | NOT NULL; Predeterminado en BD: func.now() | Dato de fecha reporte novedad. |
| `tipo_novedad` | `String(100)` | NOT NULL | Dato de tipo novedad. |
| `descripcion_novedad` | `String` | NOT NULL | Dato de descripcion novedad. |
| `prioridad` | `String(20)` | NOT NULL; Predeterminado en BD: 'normal' | Dato de prioridad. |
| `estado_novedad` | `String(50)` | NOT NULL; Predeterminado en BD: text("'Pendiente'") | Dato de estado novedad. |
| `lugar_ocurrencia` | `String(255)` | — | Dato de lugar ocurrencia. |
| `evidencia_url` | `String(500)` | — | Dato de evidencia url. |
| `accion_admin` | `String` | — | Dato de accion admin. |
| `mensaje_cliente` | `String` | — | Dato de mensaje cliente. |
| `solucion_cliente` | `String` | — | Dato de solucion cliente. |
| `cliente_visible` | `Boolean` | NOT NULL; Predeterminado en BD: text('0') | Dato de cliente visible. |
| `id_admin_resuelve` | `Integer` | FK → usuarios.id_usuario | Referencia a usuarios. |
| `fecha_resolucion` | `DateTime` | — | Dato de fecha resolucion. |

## `ofertas_horario`

**Modelo:** `OfertaHorario` (`be/app/models/oferta_horario.py`). **Propósito:** Registra información de oferta horario.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id_oferta` | `Integer` | PK; NOT NULL | Identificador principal. |
| `id_cliente` | `Integer` | FK → clientes.id_cliente; Índice; NOT NULL | Referencia a clientes. |
| `fecha` | `DateTime` | NOT NULL | Dato de fecha. |
| `hora` | `String(10)` | NOT NULL | Dato de hora. |
| `tipo_servicio` | `String(30)` | NOT NULL | Dato de tipo servicio. |
| `id_tecnico` | `Integer` | Índice; NOT NULL | Dato de id tecnico. |
| `nombre_tecnico` | `String(150)` | — | Dato de nombre tecnico. |
| `puntaje` | `Integer` | NOT NULL; Predeterminado ORM: 0 | Dato de puntaje. |
| `estado` | `String(15)` | Índice; NOT NULL; Predeterminado ORM: 'Ofrecida' | Dato de estado. |
| `aceptada_por_cliente` | `Integer` | FK → clientes.id_cliente | Referencia a clientes. |
| `expira_en` | `DateTime` | Índice; NOT NULL | Dato de expira en. |
| `created_at` | `DateTime` | Predeterminado en BD: func.now() | Dato de created at. |

## `pagos`

**Modelo:** `Pago` (`be/app/models/pago.py`). **Propósito:** Registra información de pago.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id_pago` | `Integer` | PK; NOT NULL | Identificador principal. |
| `id_pedido` | `Integer` | FK → pedidos.id_pedido; Índice | Referencia a pedidos. |
| `metodo_pago` | `String(30)` | NOT NULL | Dato de metodo pago. |
| `estado` | `String(20)` | NOT NULL; Predeterminado ORM: 'pendiente' | Dato de estado. |
| `numero_transaccion` | `String(50)` | — | Dato de numero transaccion. |
| `monto` | `Float` | NOT NULL; Predeterminado ORM: 0 | Dato de monto. |
| `banco` | `String(100)` | — | Dato de banco. |
| `titular` | `String(150)` | — | Dato de titular. |
| `ultimos_digitos` | `String(6)` | — | Dato de ultimos digitos. |
| `correo_paypal` | `String(150)` | — | Dato de correo paypal. |
| `codigo_punto_pago` | `String(30)` | — | Dato de codigo punto pago. |
| `punto_pago` | `String(50)` | — | Dato de punto pago. |
| `referencia_pago` | `String(50)` | — | Dato de referencia pago. |
| `fecha_limite_pago` | `DateTime` | — | Dato de fecha limite pago. |
| `fecha_pago` | `DateTime` | — | Dato de fecha pago. |
| `created_at` | `DateTime` | Predeterminado en BD: func.now() | Dato de created at. |

## `password_reset_tokens`

**Modelo:** `PasswordResetToken` (`be/app/models/password_reset_token.py`). **Propósito:** Registra información de password reset token.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id` | `No especificado` | PK; Índice; NOT NULL | Identificador principal. |
| `email` | `String(255)` | Índice; NOT NULL | Dato de email. |
| `user_type` | `String(20)` | NOT NULL | Dato de user type. |
| `token` | `String(500)` | Único; Índice | Dato de token. |
| `code` | `String(10)` | NOT NULL | Dato de code. |
| `expires_at` | `No especificado` | NOT NULL | Dato de expires at. |
| `used` | `No especificado` | Predeterminado ORM: False | Dato de used. |
| `ip_used` | `String(45)` | — | Dato de ip used. |
| `created_at` | `No especificado` | Predeterminado en BD: func.now() | Dato de created at. |

## `pedidos`

**Modelo:** `Pedido` (`be/app/models/pedido.py`). **Propósito:** Registra información de pedido.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id_pedido` | `Integer` | PK; NOT NULL | Identificador principal. |
| `id_cliente_pe` | `Integer` | FK → clientes.id_cliente | Referencia a clientes. |
| `fecha_peedido` | `DateTime` | Predeterminado en BD: func.now() | Dato de fecha peedido. |
| `total_pedido` | `Float` | — | Dato de total pedido. |
| `estado_pedido` | `String(50)` | — | Dato de estado pedido. |
| `fecha_entrega` | `Date` | — | Dato de fecha entrega. |
| `hora_entrega` | `String(10)` | — | Dato de hora entrega. |
| `hora_entrega_fin` | `String(10)` | — | Dato de hora entrega fin. |
| `id_tecnico_entrega` | `Integer` | — | Dato de id tecnico entrega. |
| `nombre_tecnico_entrega` | `String(150)` | — | Dato de nombre tecnico entrega. |
| `estado_entrega` | `String(20)` | — | Dato de estado entrega. |
| `entrega_actualizada_en` | `DateTime` | — | Dato de entrega actualizada en. |
| `evidencia_entrega_url` | `String(255)` | — | Dato de evidencia entrega url. |

## `pending_registrations`

**Modelo:** `PendingRegistration` (`be/app/models/pending_registration.py`). **Propósito:** Registra información de pending registration.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id` | `No especificado` | PK; Índice; NOT NULL | Identificador principal. |
| `first_name` | `String(100)` | NOT NULL | Dato de first name. |
| `last_name` | `String(100)` | NOT NULL | Dato de last name. |
| `id_tipo_documento_c` | `No especificado` | — | Dato de id tipo documento c. |
| `documento_cliente` | `No especificado` | — | Dato de documento cliente. |
| `telefono_cliente` | `No especificado` | — | Dato de telefono cliente. |
| `email` | `String(100)` | Único; Índice; NOT NULL | Dato de email. |
| `address` | `String(150)` | — | Dato de address. |
| `password_hash` | `String(255)` | NOT NULL | Dato de password hash. |
| `code` | `String(6)` | NOT NULL | Dato de code. |
| `expires_at` | `No especificado` | NOT NULL | Dato de expires at. |
| `created_at` | `No especificado` | Predeterminado en BD: func.now() | Dato de created at. |

## `producto_variantes`

**Modelo:** `ProductoVariante` (`be/app/models/producto_variante.py`). **Propósito:** Registra información de producto variante.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id` | `No especificado` | PK; Índice; NOT NULL | Identificador principal. |
| `id_producto` | `No especificado` | FK → productos.id_producto; NOT NULL | Referencia a productos. |
| `nombre` | `String(60)` | NOT NULL | Dato de nombre. |
| `hex` | `String(10)` | — | Dato de hex. |
| `tamaño` | `String(60)` | — | Dato de tamaño. |
| `ancho_cm` | `No especificado` | — | Dato de ancho cm. |
| `alto_cm` | `No especificado` | — | Dato de alto cm. |
| `precio` | `No especificado` | — | Dato de precio. |
| `imagen_url` | `String(255)` | — | Dato de imagen url. |
| `stock` | `No especificado` | NOT NULL; Predeterminado ORM: 0 | Dato de stock. |

## `productos`

**Modelo:** `Producto` (`be/app/models/producto.py`). **Propósito:** Registra información de producto.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id_producto` | `No especificado` | PK; Índice; NOT NULL | Identificador principal. |
| `nombre_producto` | `String(100)` | — | Dato de nombre producto. |
| `marca` | `String(100)` | — | Dato de marca. |
| `venta_por_metros` | `No especificado` | NOT NULL; Predeterminado ORM: 0 | Dato de venta por metros. |
| `referencia_producto` | `String(50)` | Único | Dato de referencia producto. |
| `id_proveedor_pr` | `No especificado` | FK → proveedores.id_proveedor | Referencia a proveedores. |
| `precio_compra_producto` | `No especificado` | — | Dato de precio compra producto. |
| `precio_venta_producto` | `No especificado` | — | Dato de precio venta producto. |
| `fecha_registro_producto` | `No especificado` | — | Dato de fecha registro producto. |
| `imagen_url` | `String(255)` | — | Dato de imagen url. |
| `id_cate_pr` | `No especificado` | FK → categorias.id_categoria | Referencia a categorias. |
| `descripcion_producto` | `No especificado` | — | Dato de descripcion producto. |
| `caracteristicas_producto` | `No especificado` | — | Dato de caracteristicas producto. |
| `colores_producto` | `String(255)` | — | Dato de colores producto. |
| `color_hex` | `String(10)` | — | Dato de color hex. |
| `tamaño` | `String(60)` | — | Dato de tamaño. |
| `estado_producto` | `String(20)` | NOT NULL; Predeterminado ORM: 'activo' | Dato de estado producto. |
| `stock_producto` | `No especificado` | NOT NULL; Predeterminado ORM: 0 | Dato de stock producto. |
| `descuento_activo` | `No especificado` | — | Dato de descuento activo. |
| `promocion_hasta` | `No especificado` | — | Dato de promocion hasta. |
| `es_nuevo_producto` | `No especificado` | NOT NULL; Predeterminado ORM: True | Dato de es nuevo producto. |
| `tecnicos_requeridos` | `No especificado` | NOT NULL; Predeterminado ORM: 1 | Dato de tecnicos requeridos. |
| `dificultad_instalacion` | `String(10)` | — | Dato de dificultad instalacion. |
| `tiempo_estimado_horas` | `No especificado` | — | Dato de tiempo estimado horas. |
| `tiene_medidas` | `No especificado` | NOT NULL; Predeterminado ORM: False | Dato de tiene medidas. |
| `visible_cliente` | `No especificado` | NOT NULL; Predeterminado ORM: True | Dato de visible cliente. |

## `proveedores`

**Modelo:** `Proveedor` (`be/app/models/proveedor.py`). **Propósito:** Registra información de proveedor.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id_proveedor` | `No especificado` | PK; Índice; NOT NULL | Identificador principal. |
| `nombre_proveedor` | `String(100)` | — | Dato de nombre proveedor. |
| `contacto_proveedor` | `String(100)` | — | Dato de contacto proveedor. |
| `telefono_proveedor` | `String(20)` | — | Dato de telefono proveedor. |
| `correo_proveedor` | `String(100)` | Único | Dato de correo proveedor. |
| `direccion_proveedor` | `String(150)` | — | Dato de direccion proveedor. |

## `reembolsos`

**Modelo:** `Reembolso` (`be/app/models/especializacion.py`). **Propósito:** Registra información de reembolso.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id_reembolso` | `No especificado` | PK; Índice; NOT NULL | Identificador principal. |
| `id_cita` | `No especificado` | FK → citas.id_cita; Índice | Referencia a citas. |
| `id_pedido` | `No especificado` | FK → pedidos.id_pedido; Índice | Referencia a pedidos. |
| `monto` | `No especificado` | NOT NULL; Predeterminado ORM: 0 | Dato de monto. |
| `estado` | `String(20)` | NOT NULL; Predeterminado ORM: 'Pendiente' | Dato de estado. |
| `motivo` | `String(255)` | — | Dato de motivo. |
| `numero_transaccion_original` | `String(120)` | — | Dato de numero transaccion original. |
| `numero_transaccion_reembolso` | `String(120)` | — | Dato de numero transaccion reembolso. |
| `created_at` | `No especificado` | Predeterminado en BD: func.now() | Dato de created at. |
| `procesado_at` | `No especificado` | — | Dato de procesado at. |

## `roles_usuario`

**Modelo:** `RolesUsuario` (`be/app/models/roles_usuario.py`). **Propósito:** Registra información de roles usuario.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id_rol` | `Integer` | PK; NOT NULL | Identificador principal. |
| `nombre_rol` | `String(50)` | NOT NULL | Dato de nombre rol. |

## `solicitudes_cuenta`

**Modelo:** `SolicitudCuenta` (`be/app/models/solicitud_cuenta.py`). **Propósito:** Registra información de solicitud cuenta.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id` | `Integer` | PK; NOT NULL | Identificador principal. |
| `id_cliente` | `Integer` | FK → clientes.id_cliente; Índice; NOT NULL | Referencia a clientes. |
| `tipo` | `String(20)` | NOT NULL | Dato de tipo. |
| `estado` | `String(20)` | NOT NULL; Predeterminado ORM: 'pendiente' | Dato de estado. |
| `motivo` | `String` | — | Dato de motivo. |
| `resuelta_por` | `Integer` | — | Dato de resuelta por. |
| `created_at` | `DateTime` | Predeterminado en BD: func.now() | Dato de created at. |
| `resuelta_at` | `DateTime` | — | Dato de resuelta at. |

## `solicitudes_devolucion`

**Modelo:** `SolicitudDevolucion` (`be/app/models/solicitud_devolucion.py`). **Propósito:** Registra información de solicitud devolucion.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id_solicitud` | `Integer` | PK; NOT NULL | Identificador principal. |
| `numero` | `String(20)` | Único; NOT NULL | Dato de numero. |
| `id_cliente_s` | `Integer` | FK → clientes.id_cliente; Índice; NOT NULL | Referencia a clientes. |
| `id_pedido_s` | `Integer` | FK → pedidos.id_pedido; Índice | Referencia a pedidos. |
| `motivo_tipo` | `String(40)` | — | Dato de motivo tipo. |
| `motivo_otro` | `String` | — | Dato de motivo otro. |
| `comentario` | `String` | — | Dato de comentario. |
| `estado` | `String(30)` | Índice; NOT NULL; Predeterminado en BD: 'Solicitada' | Dato de estado. |
| `tipo_devolucion` | `String(10)` | NOT NULL; Predeterminado en BD: 'parcial' | Dato de tipo devolucion. |
| `monto_total` | `Float` | NOT NULL; Predeterminado en BD: '0' | Dato de monto total. |
| `resolucion` | `String(20)` | — | Dato de resolucion. |
| `motivo_rechazo` | `String` | — | Dato de motivo rechazo. |
| `observaciones_admin` | `String` | — | Dato de observaciones admin. |
| `resuelta_por` | `Integer` | — | Dato de resuelta por. |
| `resuelta_at` | `DateTime` | — | Dato de resuelta at. |
| `created_at` | `DateTime` | Predeterminado en BD: func.now() | Dato de created at. |
| `updated_at` | `DateTime` | — | Dato de updated at. |

## `solicitudes_habilitacion_empleado`

**Modelo:** `SolicitudHabilitacionEmpleado` (`be/app/models/solicitud_habilitacion_empleado.py`). **Propósito:** Registra información de solicitud habilitacion empleado.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id` | `Integer` | PK; NOT NULL | Identificador principal. |
| `id_usuario` | `Integer` | FK → usuarios.id_usuario; Índice; NOT NULL | Referencia a usuarios. |
| `estado` | `String(20)` | NOT NULL; Predeterminado ORM: 'pendiente' | Dato de estado. |
| `resuelta_por` | `Integer` | — | Dato de resuelta por. |
| `created_at` | `DateTime` | Predeterminado en BD: func.now() | Dato de created at. |
| `resuelta_at` | `DateTime` | — | Dato de resuelta at. |

## `tarifas_servicio`

**Modelo:** `TarifaServicio` (`be/app/models/tarifa_servicio.py`). **Propósito:** Registra información de tarifa servicio.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id_tarifa` | `Integer` | PK; NOT NULL | Identificador principal. |
| `tipo_servicio` | `String(30)` | Único; NOT NULL | Dato de tipo servicio. |
| `costo` | `Numeric(12, 2)` | NOT NULL | Dato de costo. |
| `descripcion` | `String(150)` | — | Dato de descripcion. |

## `tecnicos`

**Modelo:** `Tecnico` (`be/app/models/tecnico.py`). **Propósito:** Registra información de tecnico.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id_tecnico` | `Integer` | PK; NOT NULL | Identificador principal. |
| `id_usuario_t` | `Integer` | FK → usuarios.id_usuario | Referencia a usuarios. |
| `certificacion_t` | `String(100)` | — | Dato de certificacion t. |

## `tipos_documento`

**Modelo:** `TipoDocumento` (`be/app/models/otros.py`). **Propósito:** Registra información de tipo documento.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id_tipo_documento` | `No especificado` | PK; NOT NULL | Identificador principal. |
| `nombre_tipo` | `String(2)` | — | Dato de nombre tipo. |

## `ubicaciones_tecnico`

**Modelo:** `UbicacionTecnico` (`be/app/models/ubicacion_tecnico.py`). **Propósito:** Registra información de ubicacion tecnico.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id_ubicacion` | `Integer` | PK; NOT NULL | Identificador principal. |
| `id_tecnico_ut` | `Integer` | FK → tecnicos.id_tecnico; Único; Índice; NOT NULL | Referencia a tecnicos. |
| `latitud` | `Float` | NOT NULL | Dato de latitud. |
| `longitud` | `Float` | NOT NULL | Dato de longitud. |
| `actualizado_en` | `DateTime` | Predeterminado en BD: func.now() | Dato de actualizado en. |

## `usuarios`

**Modelo:** `User` (`be/app/models/user.py`). **Propósito:** Registra información de user.

| Campo | Tipo declarado | Restricciones | Descripción |
|---|---|---|---|
| `id_usuario` | `Integer` | PK; NOT NULL | Identificador principal. |
| `first_name` | `String(100)` | NOT NULL | Dato de first name. |
| `last_name` | `String(100)` | NOT NULL | Dato de last name. |
| `id_tipo_documento_u` | `Integer` | — | Dato de id tipo documento u. |
| `documento_usuario` | `Integer` | Único | Dato de documento usuario. |
| `telefono_usuario` | `Integer` | — | Dato de telefono usuario. |
| `email` | `String(100)` | Único; Índice; NOT NULL | Dato de email. |
| `password_hash` | `String(255)` | NOT NULL | Dato de password hash. |
| `id_rol_u` | `Integer` | FK → roles_usuario.id_rol | Referencia a roles_usuario. |
| `is_active` | `Boolean` | NOT NULL; Predeterminado ORM: True | Dato de is active. |
| `desactivado_hasta` | `DateTime` | — | Dato de desactivado hasta. |
| `foto_url` | `String(255)` | — | Dato de foto url. |
| `password_reset_required` | `Boolean` | NOT NULL; Predeterminado en BD: text('0') | Dato de password reset required. |
| `created_at` | `DateTime` | Predeterminado en BD: func.now() | Dato de created at. |

## Convenciones

- `PK`: clave primaria; `FK`: relación `ForeignKey` explícita; `NOT NULL`: campo obligatorio.
- `Único` e `Índice` se señalan cuando están declarados en el modelo.
- `Predeterminado ORM` y `Predeterminado en BD` distinguen el valor asignado por SQLAlchemy del `server_default`.
- Pueden existir diferencias entre modelos, scripts iniciales y migraciones. La migración más reciente es la referencia para la base desplegada.
