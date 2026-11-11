"""baseline: esquema completo de Neodomus

Revision ID: 0001
Revises:
Create Date: 2026-08-08

Esta migración es el punto de partida de la base de datos.

- Utiliza CREATE TABLE IF NOT EXISTS para que sea idempotente: si se ejecuta
  sobre una base de datos que ya tiene las tablas (creadas antes de adoptar
  Alembic), simplemente no hace nada y solo deja registrada la revisión.
- Los datos iniciales solo se insertan si la tabla correspondiente está vacía,
  para no duplicar ni restaurar datos de una base existente.
- Incluye la tabla producto_variantes, que el modelo ProductoVariante ya usa
  pero que nunca se creó en scripts/init_db.sql (causa del error 1146).
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


# Hash real NUNCA versionado (S8215). "!" es un marcador de contraseña no
# establecida: bcrypt no puede verificarlo y el login se rechaza de forma
# controlada (verify_password captura el ValueError). Credenciales reales
# se generan en runtime con hash_password() (scripts/seed_test_users.py).
PASSWORD_NO_DEFINIDA = "!"


def _seed(bind, table, sql):
    """Inserta datos iniciales solo si la tabla está vacía (idempotente)."""
    count = bind.execute(sa.text(f"SELECT COUNT(*) FROM {table}")).scalar()
    if count == 0:
        bind.execute(sa.text(sql))


def upgrade() -> None:
    bind = op.get_bind()

    # ── Catálogos base ──────────────────────────────────────────────
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS tipos_documento (
            id_tipo_documento INT AUTO_INCREMENT PRIMARY KEY,
            nombre_tipo VARCHAR(2) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    _seed(
        bind,
        "tipos_documento",
        "INSERT INTO tipos_documento (nombre_tipo) VALUES ('cc'), ('ce')",
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS roles_usuario (
            id_rol INT AUTO_INCREMENT PRIMARY KEY,
            nombre_rol VARCHAR(50) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    _seed(
        bind,
        "roles_usuario",
        "INSERT INTO roles_usuario (nombre_rol) VALUES ('administrador'), ('tecnico')",
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS proveedores (
            id_proveedor INT AUTO_INCREMENT PRIMARY KEY,
            nombre_proveedor VARCHAR(100),
            contacto_proveedor VARCHAR(100),
            telefono_proveedor VARCHAR(20),
            correo_proveedor VARCHAR(100) UNIQUE,
            direccion_proveedor VARCHAR(150)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    _seed(
        bind,
        "proveedores",
        """
        INSERT INTO proveedores (nombre_proveedor, contacto_proveedor, telefono_proveedor, correo_proveedor, direccion_proveedor) VALUES
        ('Proveedor Demo 01 - Sensores Inteligentes', 'Ana Martínez', '3101110101', 'proveedor.demo01@example.com', 'Cra 13 #45-12, Bogotá'),
        ('Proveedor Demo 02 - Cámaras y Seguridad', 'Carlos Gómez', '3122220202', 'proveedor.demo02@example.com', 'Calle 100 #19-55, Bogotá'),
        ('Proveedor Demo 03 - Iluminación Inteligente', 'Laura Restrepo', '3153330303', 'proveedor.demo03@example.com', 'Av. El Poblado #10-30, Medellín'),
        ('Proveedor Demo 04 - Cerraduras y Acceso', 'Diego Salas', '3184440404', 'proveedor.demo04@example.com', 'Cra 43A #6-50, Medellín'),
        ('Proveedor Demo 05 - Enchufes y Control', 'Paula Vélez', '3015550505', 'proveedor.demo05@example.com', 'Av. 3N #34-67, Cali'),
        ('Proveedor Demo 06 - Automatización Residencial', 'Jorge Duarte', '3146660606', 'proveedor.demo06@example.com', 'Calle 50 #45-10, Medellín'),
        ('Proveedor Demo 07 - Climatización Inteligente', 'Mariana Ortiz', '3177770707', 'proveedor.demo07@example.com', 'Cra 9 #80-22, Barranquilla'),
        ('Proveedor Demo 08 - Conectividad y Redes', 'Andrés Cárdenas', '3028880808', 'proveedor.demo08@example.com', 'Calle 36 #33-40, Bucaramanga'),
        ('Proveedor Demo 09 - Paneles de Control', 'Valeria Pardo', '3169990909', 'proveedor.demo09@example.com', 'Cra 1 #8-12, Cartagena'),
        ('Proveedor Demo 10 - Energía y Respaldos', 'Camilo Rueda', '3191110101', 'proveedor.demo10@example.com', 'Av. Circunvalar #15-20, Pereira')
        """,
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS sucursales (
            id_sucursal INT AUTO_INCREMENT PRIMARY KEY,
            nombre_sucursal VARCHAR(100) UNIQUE,
            direccion_sucursal VARCHAR(150),
            telefono_sucursal VARCHAR(20) UNIQUE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    _seed(
        bind,
        "sucursales",
        """
        INSERT INTO sucursales (nombre_sucursal, direccion_sucursal, telefono_sucursal) VALUES
        ('Sucursal Centro Bogotá', 'Cra 7 #12-34, Bogotá', '6013456789'),
        ('Sucursal Norte Bogotá', 'Av. 19 #120-45, Bogotá', '6019876543'),
        ('Sucursal Medellín Poblado', 'Cra 43A #6-50, Medellín', '6043112233'),
        ('Sucursal Medellín Centro', 'Calle 50 #45-10, Medellín', '6044567890'),
        ('Sucursal Cali Norte', 'Av. 3N #34-67, Cali', '6023211122'),
        ('Sucursal Cali Sur', 'Cra 66 #13-45, Cali', '6026547890'),
        ('Sucursal Barranquilla Centro', 'Carrera 45 #50-22, Barranquilla', '6053556677'),
        ('Sucursal Bucaramanga Cabecera', 'Calle 36 #33-40, Bucaramanga', '6076123456'),
        ('Sucursal Cartagena Bocagrande', 'Cra 1 #8-12, Cartagena', '6056789012'),
        ('Sucursal Pereira Circunvalar', 'Av. Circunvalar #15-20, Pereira', '6063456789')
        """,
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS categorias (
            id_categoria INT AUTO_INCREMENT PRIMARY KEY,
            nombre_categoria VARCHAR(50) NOT NULL,
            descripcion VARCHAR(200)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    _seed(
        bind,
        "categorias",
        """
        INSERT INTO categorias (nombre_categoria, descripcion) VALUES
        ('sensores', 'dispositivos de detección'),
        ('controladores', 'centrales y controladores'),
        ('iluminación', 'cintas led, bombillas'),
        ('automatización', 'kits de automatización'),
        ('cables y conectividad', 'cables, routers'),
        ('enchufes y tomas', 'enchufes inteligentes'),
        ('fuentes de poder', 'fuentes de alimentación'),
        ('seguridad', 'cámaras, alarmas'),
        ('climatización', 'termostatos, persianas'),
        ('interfaces', 'paneles táctiles')
        """,
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS tipos_servicios (
            id_tipo_ser INT PRIMARY KEY AUTO_INCREMENT,
            descripcion_tipo VARCHAR(150)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    _seed(
        bind,
        "tipos_servicios",
        "INSERT INTO tipos_servicios (descripcion_tipo) VALUES ('Instalación'), ('Mantenimiento'), ('Configuración'), ('Soporte'), ('Programación'), ('Asesoría')",
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS comisiones (
            id_comision INT AUTO_INCREMENT PRIMARY KEY,
            porcentaje_comision DECIMAL(5,2),
            valor_comision DECIMAL(10,2)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    _seed(
        bind,
        "comisiones",
        """
        INSERT INTO comisiones (porcentaje_comision, valor_comision) VALUES
        (5.00, 3500.00), (5.00, 8000.00), (5.00, 1000.00), (5.00, 9000.00), (5.00, 300.00),
        (5.00, 1950.00), (5.00, 2900.00), (5.00, 2500.00), (5.00, 8500.00), (5.00, 500.00)
        """,
    )

    # ── Usuarios y clientes ─────────────────────────────────────────
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS usuarios (
            id_usuario INT AUTO_INCREMENT PRIMARY KEY,
            first_name VARCHAR(100) NOT NULL,
            last_name VARCHAR(100) NOT NULL,
            id_tipo_documento_u INT,
            documento_usuario BIGINT UNIQUE,
            telefono_usuario BIGINT,
            email VARCHAR(100) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            id_rol_u INT,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (id_tipo_documento_u) REFERENCES tipos_documento(id_tipo_documento),
            FOREIGN KEY (id_rol_u) REFERENCES roles_usuario(id_rol)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    _seed(
        bind,
        "usuarios",
        f"""
        INSERT INTO usuarios (first_name, last_name, id_tipo_documento_u, documento_usuario, telefono_usuario, email, password_hash, id_rol_u, is_active) VALUES
        ('Usuario Demo 01', 'Sintetico', 1, 1023456790, 3001234567, 'demo001@example.com', '{PASSWORD_NO_DEFINIDA}', 2, 1),
        ('Usuario Demo 02', 'Sintetico', 1, 1034567890, 3002345678, 'demo002@example.com', '{PASSWORD_NO_DEFINIDA}', 2, 1),
        ('Usuario Demo 03', 'Sintetico', 1, 1078901234, 3003456789, 'demo003@example.com', '{PASSWORD_NO_DEFINIDA}', 2, 1),
        ('Usuario Demo 04', 'Sintetico', 1, 1090123456, 3004567890, 'demo004@example.com', '{PASSWORD_NO_DEFINIDA}', 1, 1),
        ('Usuario Demo 05', 'Sintetico', 1, 1056789012, 3005678901, 'demo005@example.com', '{PASSWORD_NO_DEFINIDA}', 2, 1),
        ('Usuario Demo 06', 'Sintetico', 1, 1089012345, 3006789012, 'demo006@example.com', '{PASSWORD_NO_DEFINIDA}', 1, 1),
        ('Usuario Demo 07', 'Sintetico', 1, 1045678901, 3007890123, 'demo007@example.com', '{PASSWORD_NO_DEFINIDA}', 1, 1),
        ('Usuario Demo 08', 'Sintetico', 2, 1009876543, 3008901234, 'demo008@example.com', '{PASSWORD_NO_DEFINIDA}', 2, 1),
        ('Usuario Demo 09', 'Sintetico', 2, 1012345678, 3009012345, 'demo009@example.com', '{PASSWORD_NO_DEFINIDA}', 2, 1),
        ('Usuario Demo 10', 'Sintetico', 2, 1067890123, 3010123456, 'demo010@example.com', '{PASSWORD_NO_DEFINIDA}', 2, 1)
        """,
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS clientes (
            id_cliente INT AUTO_INCREMENT PRIMARY KEY,
            first_name VARCHAR(100) NOT NULL,
            last_name VARCHAR(100) NOT NULL,
            id_tipo_documento_c INT,
            documento_cliente BIGINT UNIQUE,
            telefono_cliente BIGINT,
            email VARCHAR(100) UNIQUE NOT NULL,
            address VARCHAR(150),
            password_hash VARCHAR(255) NOT NULL,
            is_active BOOLEAN DEFAULT FALSE,
            verification_token VARCHAR(100) UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (id_tipo_documento_c) REFERENCES tipos_documento(id_tipo_documento)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    _seed(
        bind,
        "clientes",
        f"""
        INSERT INTO clientes (first_name, last_name, id_tipo_documento_c, documento_cliente, telefono_cliente, email, address, password_hash, is_active, verification_token) VALUES
        ('Usuario Demo 11', 'Sintetico', 1, 1012345678, 3001234567, 'demo011@example.com', 'Cra 10 #12-34', '{PASSWORD_NO_DEFINIDA}', 1, NULL),
        ('Usuario Demo 12', 'Sintetico', 1, 1034567890, 3023456789, 'demo012@example.com', 'Av 30 #15-09', '{PASSWORD_NO_DEFINIDA}', 1, NULL),
        ('Usuario Demo 13', 'Sintetico', 2, 1045678901, 3034567890, 'demo013@example.com', 'Mz A Casa 10', '{PASSWORD_NO_DEFINIDA}', 1, NULL),
        ('Usuario Demo 14', 'Sintetico', 1, 1056789012, 3045678901, 'demo014@example.com', 'Cl 8B #20-45', '{PASSWORD_NO_DEFINIDA}', 1, NULL),
        ('Usuario Demo 15', 'Sintetico', 1, 1078901234, 3067890123, 'demo015@example.com', 'Cl 19 #13-55', '{PASSWORD_NO_DEFINIDA}', 1, NULL),
        ('Usuario Demo 16', 'Sintetico', 1, 1089012345, 3078901234, 'demo016@example.com', 'Av 68 #54-23', '{PASSWORD_NO_DEFINIDA}', 1, NULL),
        ('Usuario Demo 17', 'Sintetico', 2, 1090123456, 3089012345, 'demo017@example.com', 'Cl 100 #25-10', '{PASSWORD_NO_DEFINIDA}', 1, NULL),
        ('Usuario Demo 18', 'Sintetico', 1, 1101234567, 3090123456, 'demo018@example.com', 'Cra 7 #89-12', '{PASSWORD_NO_DEFINIDA}', 1, NULL),
        ('Usuario Demo 19', 'Sintetico', 1, 1112345678, 3101234567, 'demo019@example.com', 'Cl 50 #12-34', '{PASSWORD_NO_DEFINIDA}', 1, NULL),
        ('Usuario Demo 20', 'Sintetico', 2, 1123456789, 3112345678, 'demo020@example.com', 'Av 20 #45-67', '{PASSWORD_NO_DEFINIDA}', 1, NULL)
        """,
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS pending_registrations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            first_name VARCHAR(100) NOT NULL,
            last_name VARCHAR(100) NOT NULL,
            id_tipo_documento_c INT,
            documento_cliente BIGINT,
            telefono_cliente BIGINT,
            email VARCHAR(100) UNIQUE NOT NULL,
            address VARCHAR(150),
            password_hash VARCHAR(255) NOT NULL,
            code VARCHAR(6) NOT NULL,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_email (email),
            INDEX idx_code (code)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )

    # ── Técnicos, rutas, novedades ──────────────────────────────────
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS tecnicos (
            id_tecnico INT AUTO_INCREMENT PRIMARY KEY,
            id_usuario_t INT,
            certificacion_t VARCHAR(100),
            cargo_t VARCHAR(50),
            FOREIGN KEY (id_usuario_t) REFERENCES usuarios(id_usuario)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    _seed(
        bind,
        "tecnicos",
        """
        INSERT INTO tecnicos (id_usuario_t, certificacion_t, cargo_t) VALUES
        (1, 'Certificación en Redes y Cableado Estructurado', 'Junior'),
        (2, 'Certificación en Instalación de Domótica', 'Junior'),
        (3, 'Certificación en Seguridad Electrónica', 'Semi Senior'),
        (4, 'Certificación en Soporte de Sistemas IoT', 'Junior'),
        (5, 'Certificación en Programación de PLCs', 'Senior'),
        (6, 'Certificación en Bases de Datos y Servidores', 'Senior'),
        (7, 'Certificación en Automatización de Hogares', 'Semi Senior'),
        (8, 'Certificación en Seguridad Informática', 'Senior'),
        (9, 'Certificación en Programación Backend', 'Semi Senior'),
        (10, 'Certificación en Gestión de Proyectos', 'Senior')
        """,
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS novedades (
            id_novedad INT AUTO_INCREMENT PRIMARY KEY,
            id_tecnico_n INT,
            fecha_reporte_novedad DATETIME,
            tipo_novedad VARCHAR(100),
            descripcion_novedad TEXT,
            estado_novedad VARCHAR(50),
            FOREIGN KEY (id_tecnico_n) REFERENCES tecnicos(id_tecnico)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    _seed(
        bind,
        "novedades",
        """
        INSERT INTO novedades (id_tecnico_n, fecha_reporte_novedad, tipo_novedad, descripcion_novedad, estado_novedad) VALUES
        (1, NOW(), 'Falla Técnica', 'Sensor PIR no responde', 'Pendiente'),
        (2, NOW(), 'Instalación', 'Controlador central defectuoso', 'Resuelto'),
        (3, NOW(), 'Mantenimiento', 'Cámara IP con visión parcial', 'Pendiente'),
        (4, NOW(), 'Red WiFi', 'Router requiere reinicio', 'Pendiente'),
        (5, NOW(), 'Sensores', 'Sensor de puerta mal instalado', 'Resuelto'),
        (6, NOW(), 'PLC', 'Falla en programación del PLC', 'Pendiente'),
        (7, NOW(), 'Mantenimiento', 'Fuente de poder 12V fallando', 'Pendiente'),
        (8, NOW(), 'Asesoría', 'Cliente solicita cambios en configuración', 'Pendiente'),
        (9, NOW(), 'Cámara IP', 'Soporte de pared dañado', 'Resuelto'),
        (10, NOW(), 'Baterías', 'Batería recargable 18650 no carga', 'Pendiente')
        """,
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS detalle_ruta (
            id_detaruta INT PRIMARY KEY AUTO_INCREMENT,
            id_ruta_dr INT,
            id_tecnico INT,
            id_bodega_et INT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    _seed(
        bind,
        "detalle_ruta",
        """
        INSERT INTO detalle_ruta (id_ruta_dr, id_tecnico, id_bodega_et) VALUES
        (1, 1, 1), (2, 2, 2), (3, 3, 3), (4, 4, 4), (5, 5, 5), (6, 6, 6), (7, 7, 7), (8, 8, 8), (9, 9, 9), (10, 10, 10)
        """,
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS rutero (
            id_ruta INT AUTO_INCREMENT PRIMARY KEY,
            id_detalle_r INT,
            fecha_ruta DATE,
            hora_ruta TIME,
            direccion_ruta VARCHAR(255),
            estado_ruta VARCHAR(50) DEFAULT 'Pendiente',
            observaciones_ruta TEXT,
            FOREIGN KEY (id_detalle_r) REFERENCES detalle_ruta(id_detaruta)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    _seed(
        bind,
        "rutero",
        """
        INSERT INTO rutero (id_detalle_r, fecha_ruta, hora_ruta, direccion_ruta, estado_ruta, observaciones_ruta) VALUES
        (1, CURDATE(), '09:00:00', 'Cra 10 #12-34', 'Pendiente', 'Revisión inicial del sistema'),
        (2, CURDATE(), '10:00:00', 'Av 30 #15-09', 'Pendiente', 'Instalación de sensores'),
        (3, CURDATE(), '11:00:00', 'Mz A Casa 10', 'Pendiente', 'Mantenimiento de cámaras'),
        (4, CURDATE(), '12:00:00', 'Cl 8B #20-45', 'Pendiente', 'Configuración de red WiFi'),
        (5, CURDATE(), '13:00:00', 'Cl 19 #13-55', 'Pendiente', 'Prueba de sensores de puerta'),
        (6, CURDATE(), '14:00:00', 'Av 68 #54-23', 'Pendiente', 'Programación de PLC'),
        (7, CURDATE(), '15:00:00', 'Cl 100 #25-10', 'Pendiente', 'Mantenimiento general'),
        (8, CURDATE(), '16:00:00', 'Cra 7 #89-12', 'Pendiente', 'Asesoría técnica en domótica'),
        (9, CURDATE(), '17:00:00', 'Carrera 9 #80-22', 'Pendiente', 'Instalación de cámaras IP'),
        (10, CURDATE(), '18:00:00', 'Av. 30 de Agosto #45-67', 'Pendiente', 'Revisión de baterías y fuentes')
        """,
    )

    # ── Productos, inventarios, bodegas ─────────────────────────────
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS productos (
            id_producto INT AUTO_INCREMENT PRIMARY KEY,
            nombre_producto VARCHAR(100),
            referencia_producto VARCHAR(50) UNIQUE,
            id_proveedor_pr INT,
            precio_compra_producto DECIMAL(10,2),
            precio_venta_producto DECIMAL(10,2),
            fecha_registro_producto DATETIME,
            imagen_url VARCHAR(255) NULL,
            id_cate_pr INT,
            descripcion_producto TEXT NULL,
            colores_producto VARCHAR(255) NULL,
            estado_producto VARCHAR(20) NOT NULL DEFAULT 'activo',
            stock_producto INT NOT NULL DEFAULT 0,
            FOREIGN KEY (id_proveedor_pr) REFERENCES proveedores(id_proveedor),
            FOREIGN KEY (id_cate_pr) REFERENCES categorias(id_categoria)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    _seed(
        bind,
        "productos",
        """
        INSERT INTO productos (nombre_producto, referencia_producto, id_proveedor_pr, precio_compra_producto, precio_venta_producto, fecha_registro_producto, imagen_url, id_cate_pr, descripcion_producto, colores_producto, estado_producto, stock_producto) VALUES
        ('sensor de movimiento pir', 'smi-001', 1, 45000.00, 70000.00, NOW(), NULL, 1, 'Sensor de movimiento PIR para detección de presencia con ángulo de 110° y alcance de 9 metros.', 'Blanco', 'activo', 50),
        ('controlador central domótico', 'ccd-004', 6, 90000.00, 160000.00, NOW(), NULL, 2, 'Controlador central para automatizar todos los dispositivos del hogar.', 'Blanco,Negro', 'activo', 20),
        ('cinta led rgb', 'led-003', 3, 12000.00, 20000.00, NOW(), NULL, 3, 'Cinta LED RGB de 5 m con control por app y 16 millones de colores.', 'RGB', 'activo', 100),
        ('kit de automatización básica', 'kit-001', 6, 100000.00, 180000.00, NOW(), NULL, 4, 'Kit completo para iniciar la automatización del hogar.', 'Negro', 'activo', 15),
        ('cable utp cat6', 'utp6-050', 8, 3000.00, 6000.00, NOW(), NULL, 5, 'Cable UTP Cat6 de 50 metros para redes de alta velocidad.', 'Gris,Azul', 'activo', 300),
        ('sensor de puerta/ventana', 'spd-006', 1, 25000.00, 39000.00, NOW(), NULL, 1, 'Sensor magnético de apertura para puertas y ventanas.', 'Blanco', 'activo', 75),
        ('enchufe inteligente wifi', 'eiw-007', 5, 34000.00, 58000.00, NOW(), NULL, 6, 'Enchufe inteligente con control remoto vía WiFi y monitoreo de energía.', 'Blanco', 'activo', 40),
        ('fuente de poder 12v 5a', 'ps12-5a', 10, 28000.00, 50000.00, NOW(), NULL, 7, 'Fuente de poder 12V 5A para dispositivos de seguridad y automatización.', 'Negro', 'activo', 60),
        ('cámara ip 1080p', 'cip-003', 2, 120000.00, 170000.00, NOW(), NULL, 8, 'Cámara IP Full HD con visión nocturna y detección de movimiento.', 'Blanco,Negro', 'activo', 25),
        ('batería recargable 18650', 'bat18650', 10, 5000.00, 10000.00, NOW(), NULL, 7, 'Batería recargable 18650 de 3000 mAh para sensores y dispositivos.', 'Negro', 'activo', 120),
        ('termostato inteligente', 'ter-101', 7, 75000.00, 125000.00, NOW(), NULL, 9, 'Termostato inteligente compatible con WiFi, para climatización.', 'Blanco,Negro', 'activo', 0),
        ('interruptor táctil wifi', 'int-202', 3, 32000.00, 55000.00, NOW(), NULL, 10, 'Interruptor táctil WiFi para controlar la iluminación desde el celular.', 'Blanco,Negro,Gris', 'activo', 0),
        ('sirena inalámbrica', 'sir-303', 2, 45000.00, 80000.00, NOW(), NULL, 8, 'Sirena inalámbrica con batería integrada para alarmas de seguridad.', 'Rojo,Blanco', 'activo', 0),
        ('detector de humo', 'dhu-404', 1, 38000.00, 69000.00, NOW(), NULL, 1, 'Detector de humo con alarma incluida y batería de larga duración.', 'Blanco', 'activo', 0),
        ('persiana motorizada', 'per-505', 7, 120000.00, 210000.00, NOW(), NULL, 9, 'Persiana motorizada programable para automatizar la luz natural.', 'Gris,Blanco', 'activo', 0),
        ('panel táctil central', 'pan-606', 9, 250000.00, 420000.00, NOW(), NULL, 2, 'Panel táctil central para controlar toda la automatización desde un solo lugar.', 'Negro', 'activo', 0)
        """,
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS bodega_f (
            id_bodega_f INT AUTO_INCREMENT PRIMARY KEY,
            nombre_bodega_f VARCHAR(100) UNIQUE,
            ubicacion_bodega_f VARCHAR(150),
            capacidad_bodega_f INT,
            id_sucursal_f INT,
            FOREIGN KEY (id_sucursal_f) REFERENCES sucursales(id_sucursal)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    _seed(
        bind,
        "bodega_f",
        """
        INSERT INTO bodega_f (nombre_bodega_f, ubicacion_bodega_f, capacidad_bodega_f, id_sucursal_f) VALUES
        ('Bodega Central Bogotá', 'Cra 7 #12-34, Bogotá', 1000, 1),
        ('Bodega Norte Bogotá', 'Av. 19 #120-45, Bogotá', 800, 2),
        ('Bodega Medellín Poblado', 'Cra 43A #6-50, Medellín', 600, 3),
        ('Bodega Medellín Centro', 'Calle 50 #45-10, Medellín', 500, 4),
        ('Bodega Cali Norte', 'Av. 3N #34-67, Cali', 700, 5),
        ('Bodega Cali Sur', 'Cra 66 #13-45, Cali', 650, 6),
        ('Bodega Barranquilla Centro', 'Carrera 45 #50-22, Barranquilla', 400, 7),
        ('Bodega Bucaramanga Cabecera', 'Calle 36 #33-40, Bucaramanga', 550, 8),
        ('Bodega Cartagena Bocagrande', 'Cra 1 #8-12, Cartagena', 450, 9),
        ('Bodega Pereira Circunvalar', 'Av. Circunvalar #15-20, Pereira', 500, 10)
        """,
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS inventario_f (
            id_inventario_f INT AUTO_INCREMENT PRIMARY KEY,
            id_producto_if INT,
            id_bodega_if INT,
            cantidad_if INT,
            fecha_registro_if DATETIME,
            FOREIGN KEY (id_producto_if) REFERENCES productos(id_producto),
            FOREIGN KEY (id_bodega_if) REFERENCES bodega_f(id_bodega_f)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    _seed(
        bind,
        "inventario_f",
        """
        INSERT INTO inventario_f (id_producto_if, id_bodega_if, cantidad_if, fecha_registro_if) VALUES
        (1, 1, 50, NOW()), (2, 2, 20, NOW()), (3, 3, 100, NOW()), (4, 4, 15, NOW()), (5, 5, 300, NOW()),
        (6, 6, 75, NOW()), (7, 7, 40, NOW()), (8, 8, 60, NOW()), (9, 9, 25, NOW()), (10, 10, 120, NOW())
        """,
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS insumos (
            id_insumo INT AUTO_INCREMENT PRIMARY KEY,
            nombre_insumo VARCHAR(100) UNIQUE,
            ubicacion_insumo VARCHAR(150),
            capacidad_insumo INT,
            id_tecnico_insumo INT,
            FOREIGN KEY (id_tecnico_insumo) REFERENCES tecnicos(id_tecnico)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    _seed(
        bind,
        "insumos",
        """
        INSERT INTO insumos (nombre_insumo, ubicacion_insumo, capacidad_insumo, id_tecnico_insumo) VALUES
        ('Bodega Técnico 1', 'Cra 7 #12-34, Bogotá', 100, 1),
        ('Bodega Técnico 2', 'Av. 19 #120-45, Bogotá', 80, 2),
        ('Bodega Técnico 3', 'Cra 43A #6-50, Medellín', 60, 3),
        ('Bodega Técnico 4', 'Calle 50 #45-10, Medellín', 50, 4),
        ('Bodega Técnico 5', 'Av. 3N #34-67, Cali', 70, 5),
        ('Bodega Técnico 6', 'Cra 66 #13-45, Cali', 65, 6),
        ('Bodega Técnico 7', 'Carrera 45 #50-22, Barranquilla', 40, 7),
        ('Bodega Técnico 8', 'Calle 36 #33-40, Bucaramanga', 55, 8),
        ('Bodega Técnico 9', 'Cra 1 #8-12, Cartagena', 45, 9),
        ('Bodega Técnico 10', 'Av. Circunvalar #15-20, Pereira', 50, 10)
        """,
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS bodega_et (
            id_insumo_et INT AUTO_INCREMENT PRIMARY KEY,
            id_producto_et INT,
            id_insumos_et INT,
            cantidad_et INT,
            fecha_registro_et DATETIME,
            FOREIGN KEY (id_producto_et) REFERENCES productos(id_producto)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    _seed(
        bind,
        "bodega_et",
        """
        INSERT INTO bodega_et (id_producto_et, id_insumos_et, cantidad_et, fecha_registro_et) VALUES
        (1, 1, 10, NOW()), (2, 2, 5, NOW()), (3, 3, 30, NOW()), (4, 4, 2, NOW()), (5, 5, 100, NOW()),
        (6, 6, 15, NOW()), (7, 7, 8, NOW()), (8, 8, 20, NOW()), (9, 9, 4, NOW()), (10, 10, 50, NOW())
        """,
    )

    # ── Servicios, pedidos, detalles ────────────────────────────────
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS servicios (
            id_servicio INT AUTO_INCREMENT PRIMARY KEY,
            id_tipo_ser INT,
            precio_servicio DECIMAL(10,2),
            total_servicio DECIMAL(10,2),
            id_tecnico_s INT,
            FOREIGN KEY (id_tipo_ser) REFERENCES tipos_servicios(id_tipo_ser),
            FOREIGN KEY (id_tecnico_s) REFERENCES tecnicos(id_tecnico)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    _seed(
        bind,
        "servicios",
        """
        INSERT INTO servicios (id_tipo_ser, precio_servicio, total_servicio, id_tecnico_s) VALUES
        (1, 150000.00, 150000.00, 1), (2, 80000.00, 80000.00, 2), (3, 60000.00, 60000.00, 3),
        (4, 70000.00, 70000.00, 4), (1, 50000.00, 50000.00, 5), (5, 120000.00, 120000.00, 6),
        (2, 90000.00, 90000.00, 7), (6, 100000.00, 100000.00, 8), (1, 85000.00, 85000.00, 9),
        (2, 40000.00, 40000.00, 10)
        """,
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS pedidos (
            id_pedido INT AUTO_INCREMENT PRIMARY KEY,
            id_cliente_pe INT,
            fecha_peedido DATETIME,
            total_pedido DECIMAL(10,2),
            estado_pedido VARCHAR(50),
            FOREIGN KEY (id_cliente_pe) REFERENCES clientes(id_cliente)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    _seed(
        bind,
        "pedidos",
        """
        INSERT INTO pedidos (id_cliente_pe, fecha_peedido, total_pedido, estado_pedido) VALUES
        (1, NOW(), 150000.00, 'ACTIVO'), (2, NOW(), 80000.00, 'ACTIVO'), (3, NOW(), 60000.00, 'ACTIVO'),
        (4, NOW(), 70000.00, 'ACTIVO'), (5, NOW(), 50000.00, 'ACTIVO'), (6, NOW(), 120000.00, 'ACTIVO'),
        (7, NOW(), 90000.00, 'ACTIVO'), (8, NOW(), 100000.00, 'ACTIVO'), (9, NOW(), 85000.00, 'ACTIVO'),
        (10, NOW(), 40000.00, 'ACTIVO')
        """,
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS detalle_pedido (
            id_detalle INT AUTO_INCREMENT PRIMARY KEY,
            id_pedido_d INT,
            id_producto_d INT,
            id_servicio_d INT,
            id_comision_d INT,
            cantidad_detalle INT,
            precio_unitario_detalle DECIMAL(10,2),
            subtotal_detalle DECIMAL(10,2),
            FOREIGN KEY (id_pedido_d) REFERENCES pedidos(id_pedido),
            FOREIGN KEY (id_producto_d) REFERENCES productos(id_producto),
            FOREIGN KEY (id_servicio_d) REFERENCES servicios(id_servicio),
            FOREIGN KEY (id_comision_d) REFERENCES comisiones(id_comision)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )
    _seed(
        bind,
        "detalle_pedido",
        """
        INSERT INTO detalle_pedido (id_pedido_d, id_producto_d, id_servicio_d, id_comision_d, cantidad_detalle, precio_unitario_detalle, subtotal_detalle) VALUES
        (1, 1, 1, 1, 1, 70000.00, 70000.00), (2, 2, 2, 2, 1, 160000.00, 160000.00),
        (3, 3, 3, 3, 1, 20000.00, 20000.00), (4, 4, 4, 4, 1, 180000.00, 180000.00),
        (5, 5, 5, 5, 1, 6000.00, 6000.00), (6, 6, 6, 6, 1, 39000.00, 39000.00),
        (7, 7, 7, 7, 1, 58000.00, 58000.00), (8, 8, 8, 8, 1, 50000.00, 50000.00),
        (9, 9, 9, 9, 1, 170000.00, 170000.00), (10, 10, 10, 10, 1, 10000.00, 10000.00)
        """,
    )

    # ── Tokens de autenticación ─────────────────────────────────────
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(100) NOT NULL,
            user_type ENUM('client', 'employee') NOT NULL,
            token VARCHAR(500) NULL UNIQUE,
            code VARCHAR(10) NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL,
            used BOOLEAN DEFAULT FALSE,
            ip_used VARCHAR(45),
            INDEX idx_token (token),
            INDEX idx_email_type (email, user_type),
            INDEX idx_expires_used (expires_at, used)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS email_verification_tokens (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email_cliente VARCHAR(100) NOT NULL,
            code VARCHAR(6) NOT NULL,
            expires_at DATETIME NOT NULL,
            used BOOLEAN NOT NULL DEFAULT FALSE,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (email_cliente) REFERENCES clientes(email) ON DELETE CASCADE,
            UNIQUE KEY unique_active_token_per_client (email_cliente),
            INDEX idx_code (code),
            INDEX idx_expires_used (expires_at, used)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )

    # ── Citas, solicitudes, contactos ───────────────────────────────
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS citas (
            id_cita INT AUTO_INCREMENT PRIMARY KEY,
            id_cliente INT NOT NULL,
            id_tecnico INT NULL,
            nombre_tecnico VARCHAR(150) NULL,
            tipo_servicio VARCHAR(30) NOT NULL,
            fecha DATE NOT NULL,
            hora VARCHAR(10) NOT NULL,
            direccion VARCHAR(200) NOT NULL,
            descripcion TEXT NULL,
            estado VARCHAR(20) NOT NULL DEFAULT 'Pendiente',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_citas_cliente FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente) ON DELETE CASCADE,
            INDEX ix_citas_id_cliente (id_cliente)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS solicitudes_cuenta (
            id INT AUTO_INCREMENT PRIMARY KEY,
            id_cliente INT NOT NULL,
            tipo VARCHAR(20) NOT NULL,
            estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
            motivo TEXT NULL,
            resuelta_por INT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            resuelta_at DATETIME NULL,
            CONSTRAINT fk_sol_cuenta_cliente FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente) ON DELETE CASCADE,
            INDEX ix_sol_cliente (id_cliente)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS contactos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nombre_usuario VARCHAR(120) NOT NULL,
            email_usuario VARCHAR(120) NOT NULL,
            asunto VARCHAR(180) NOT NULL,
            mensaje TEXT NOT NULL,
            categoria VARCHAR(40) NULL,
            estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
            respuesta TEXT NULL,
            responded_by INT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            responded_at DATETIME NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )

    # ── Variantes de producto (modelo ProductoVariante) ─────────────
    # Tabla usada por el backend (GET /api/v1/productos) que nunca se
    # creó en scripts/init_db.sql: causa del error 1146 en BD nuevas.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS producto_variantes (
            id INT NOT NULL AUTO_INCREMENT,
            id_producto INT NOT NULL,
            nombre VARCHAR(60) NOT NULL,
            `hex` VARCHAR(10) NULL,
            imagen_url VARCHAR(255) NULL,
            stock INT NOT NULL DEFAULT 0,
            PRIMARY KEY (id),
            INDEX ix_producto_variantes_id (id),
            CONSTRAINT fk_producto_variantes_producto FOREIGN KEY (id_producto)
                REFERENCES productos(id_producto) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
    )


def downgrade() -> None:
    tablas = [
        "producto_variantes",
        "contactos",
        "solicitudes_cuenta",
        "citas",
        "email_verification_tokens",
        "password_reset_tokens",
        "detalle_pedido",
        "pedidos",
        "servicios",
        "bodega_et",
        "insumos",
        "inventario_f",
        "bodega_f",
        "productos",
        "rutero",
        "detalle_ruta",
        "novedades",
        "tecnicos",
        "pending_registrations",
        "clientes",
        "usuarios",
        "comisiones",
        "tipos_servicios",
        "categorias",
        "sucursales",
        "proveedores",
        "roles_usuario",
        "tipos_documento",
    ]
    op.execute("SET FOREIGN_KEY_CHECKS = 0")
    for tabla in tablas:
        op.execute(f"DROP TABLE IF EXISTS {tabla}")
    op.execute("SET FOREIGN_KEY_CHECKS = 1")
