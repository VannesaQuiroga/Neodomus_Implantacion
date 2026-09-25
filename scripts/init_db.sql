-- =====================================================
-- NEODOMUS - Base de datos (no destructiva e idempotente)
-- NO borra datos existentes. Los registros (clientes,
-- técnicos, administradores) se conservan al re-ejecutar.
-- =====================================================

CREATE DATABASE IF NOT EXISTS neodomus
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE neodomus;
SET NAMES utf8mb4;

-- ------------------------------
-- Tablas base (catálogos)
-- ------------------------------
CREATE TABLE IF NOT EXISTS tipos_documento (
    id_tipo_documento INT AUTO_INCREMENT PRIMARY KEY,
    nombre_tipo VARCHAR(2) NOT NULL UNIQUE
);
INSERT INTO tipos_documento (nombre_tipo)
SELECT nombre_tipo FROM (
    SELECT 'cc' AS nombre_tipo
    UNION ALL SELECT 'ce'
) t
WHERE NOT EXISTS (SELECT 1 FROM tipos_documento);

CREATE TABLE IF NOT EXISTS roles_usuario (
    id_rol INT AUTO_INCREMENT PRIMARY KEY,
    nombre_rol VARCHAR(50) NOT NULL UNIQUE
);
INSERT INTO roles_usuario (nombre_rol)
SELECT nombre_rol FROM (
    SELECT 'administrador' AS nombre_rol
    UNION ALL SELECT 'tecnico'
) t
WHERE NOT EXISTS (SELECT 1 FROM roles_usuario);

CREATE TABLE IF NOT EXISTS proveedores (
    id_proveedor INT AUTO_INCREMENT PRIMARY KEY,
    nombre_proveedor VARCHAR(100),
    contacto_proveedor VARCHAR(100),
    telefono_proveedor VARCHAR(20),
    correo_proveedor VARCHAR(100) UNIQUE,
    direccion_proveedor VARCHAR(150)
);

INSERT IGNORE INTO proveedores (nombre_proveedor, contacto_proveedor, telefono_proveedor, correo_proveedor, direccion_proveedor) VALUES
('Deportes Elite S.A.', 'Carlos Ramírez', '3104567890', 'contacto@deporteselite.com', 'Cra 45 #12-34, Bogotá'),
('SportLine Distribuciones', 'María Gómez', '3159876543', 'ventas@sportline.com', 'Av. Las Américas #23-45, Medellín'),
('TodoFitness Ltda.', 'Andrés López', '3006543210', 'info@todofitness.com', 'Calle 50 #67-12, Cali'),
('Proveedora Olímpica', 'Laura Torres', '3123456789', 'ltorres@proveedoraolimpica.com', 'Carrera 9 #80-22, Barranquilla'),
('Suministros Deportivos SAS', 'Jorge Martínez', '3012233445', 'jorge@suministrosdeportivos.com', 'Calle 100 #15-40, Bogotá'),
('Equipos ProGym', 'Diana Herrera', '3209988776', 'dherrera@progym.com', 'Av. 30 de Agosto #45-67, Pereira'),
('Distribuciones RunningPro', 'Luis Castillo', '3167788990', 'ventas@runningpro.com', 'Calle 10 #25-30, Bucaramanga'),
('Balones y Redes S.A.', 'Paola Rincón', '3184455667', 'paola@balonesyredes.com', 'Cra 21 #45-10, Cartagena'),
('FitEquipos SAS', 'Andrés Peña', '3178899001', 'andres@fitequipos.com', 'Cl 45 #23-10, Manizales'),
('GymPro Distribuciones', 'Carolina Ríos', '3164455667', 'carolina@gympro.com', 'Cra 15 #30-20, Ibagué');

CREATE TABLE IF NOT EXISTS categorias (
    id_categoria INT AUTO_INCREMENT PRIMARY KEY,
    nombre_categoria VARCHAR(50) NOT NULL UNIQUE,
    descripcion VARCHAR(200)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO categorias (nombre_categoria, descripcion)
SELECT nombre_categoria, descripcion FROM (
    SELECT 'sensores' AS nombre_categoria, 'dispositivos de detección' AS descripcion
    UNION ALL SELECT 'controladores', 'centrales y controladores'
    UNION ALL SELECT 'iluminación', 'cintas led, bombillas'
    UNION ALL SELECT 'automatización', 'kits de automatización'
    UNION ALL SELECT 'cables y conectividad', 'cables, routers'
    UNION ALL SELECT 'enchufes y tomas', 'enchufes inteligentes'
    UNION ALL SELECT 'fuentes de poder', 'fuentes de alimentación'
    UNION ALL SELECT 'seguridad', 'cámaras, alarmas'
    UNION ALL SELECT 'climatización', 'termostatos, persianas'
    UNION ALL SELECT 'interfaces', 'paneles táctiles'
) t
WHERE NOT EXISTS (SELECT 1 FROM categorias);

CREATE TABLE IF NOT EXISTS tipos_servicios (
    id_tipo_ser INT PRIMARY KEY AUTO_INCREMENT,
    descripcion_tipo VARCHAR(150) UNIQUE
);

INSERT INTO tipos_servicios (descripcion_tipo)
SELECT descripcion_tipo FROM (
    SELECT 'Instalación' AS descripcion_tipo
    UNION ALL SELECT 'Mantenimiento'
    UNION ALL SELECT 'Configuración'
    UNION ALL SELECT 'Soporte'
    UNION ALL SELECT 'Programación'
    UNION ALL SELECT 'Asesoría'
) t
WHERE NOT EXISTS (SELECT 1 FROM tipos_servicios);

CREATE TABLE IF NOT EXISTS comisiones (
    id_comision INT AUTO_INCREMENT PRIMARY KEY,
    porcentaje_comision DECIMAL(5,2),
    valor_comision DECIMAL(10,2)
);

INSERT INTO comisiones (porcentaje_comision, valor_comision)
SELECT porcentaje_comision, valor_comision FROM (
    SELECT 5.00 AS porcentaje_comision, 3500.00 AS valor_comision
    UNION ALL SELECT 5.00, 8000.00
    UNION ALL SELECT 5.00, 1000.00
    UNION ALL SELECT 5.00, 9000.00
    UNION ALL SELECT 5.00, 300.00
    UNION ALL SELECT 5.00, 1950.00
    UNION ALL SELECT 5.00, 2900.00
    UNION ALL SELECT 5.00, 2500.00
    UNION ALL SELECT 5.00, 8500.00
    UNION ALL SELECT 5.00, 500.00
) t
WHERE NOT EXISTS (SELECT 1 FROM comisiones);

-- Tabla de tarifas de servicio (migración 0011)
CREATE TABLE IF NOT EXISTS tarifas_servicio (
    id_tarifa INT AUTO_INCREMENT PRIMARY KEY,
    tipo_servicio VARCHAR(30) NOT NULL UNIQUE,
    costo NUMERIC(12,2) NOT NULL,
    descripcion VARCHAR(150)
);

-- Tabla de especializaciones (migración 0025)
CREATE TABLE IF NOT EXISTS especializaciones (
    id_especializacion INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion VARCHAR(255),
    activa BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------
-- Tablas de usuarios y clientes
-- ------------------------------
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
    desactivado_hasta DATETIME,
    foto_url VARCHAR(255),
    password_reset_required BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_tipo_documento_u) REFERENCES tipos_documento(id_tipo_documento),
    FOREIGN KEY (id_rol_u) REFERENCES roles_usuario(id_rol)
);

-- Contraseñas de usuarios (patrón: 12345678 + inicial nombre MAYÚS + inicial apellido minús + .)
INSERT IGNORE INTO usuarios (first_name, last_name, id_tipo_documento_u, documento_usuario, telefono_usuario, email, password_hash, id_rol_u, is_active) VALUES
('CARLOS ANDRÉS', 'GÓMEZ RÍOS', 1, 1023456790, 3001234567, 'carlos.andres.gomez@gmail.com', '$2b$12$cEkNLc8Js907ywI9KHgYLu/TCD5.Ld35TwAIO7Ev5hSxfeG1LNf0C', 2, 1),
('JORGE DANIEL', 'CHARRY PÉREZ', 1, 1034567890, 3002345678, 'jorge.charry@gmail.com', '$2b$12$N1Ge6TcZlgNgP85DKhp5quBdrXQkixJV5hB1Th455B1gkKDIbMj96', 2, 1),
('JUAN SEBASTIÁN', 'MORENO TORRES', 1, 1078901234, 3003456789, 'juan.moreno@gmail.com', '$2b$12$vic9BT8xg8NX1SKPnjmGn.yoKQBh88xViJjhrrG.PRWyKbMDWOin2', 2, 1),
('LUIS EDUARDO', 'MARTÍNEZ GAITÁN', 1, 1090123456, 3004567890, 'luis.martinez@gmail.com', '$2b$12$.zBmllFGXbnL7eAIFAfr6ueCtlwal3yjMxeiPTooqG6tcq8q2Ham2', 1, 1),
('ANDRÉS MAURICIO', 'LÓPEZ VARGAS', 1, 1056789012, 3005678901, 'andres.lopez@gmail.com', '$2b$12$RByXZVO3eUwDQiQeBeZd2.bdFX3uOCkj9omMfE7iqNX1oRbYB7dPO', 2, 1),
('CAMILA ANDREA', 'RODRÍGUEZ PEÑA', 1, 1089012345, 3006789012, 'camila.rodriguez@gmail.com', '$2b$12$z4DFKDwZ.jHTfu6.0RT7hOU5JpqgvNtYjzCGp11phcY7iKM9kEKfe', 1, 1),
('NICOL ALEJANDRA', 'MARIÑO ROMERO', 1, 1045678901, 3007890123, 'nicolmarinoromero@gmail.com', '$2b$12$OQdysg.2T0oagVqY5zPeq.07kcmonKB.zwxBSbQHlK0uEnGiyhBv6', 1, 1),
('LAURA MARCELA', 'PÉREZ DUARTE', 2, 1009876543, 3008901234, 'nicolmarino09@gmail.com', '$2b$12$iY/it6NSqzlUkR7IBT1q3eTYKKudhyVIb4Gyf1V.UYX6s548abKpu', 2, 1),
('JULIÁN FELIPE', 'CARVAJAL CABALLERO', 2, 1012345678, 3009012345, 'julian.carvajal@gmail.com', '$2b$12$dork9ZuJsoLuly6HWBQ6WuKiP97jjnGNl.h9Z2oqT/FZJfC/iyGQK', 2, 1),
('MARÍA FERNANDA', 'RINCÓN SALAZAR', 2, 1067890123, 3010123456, 'maria.rincon@gmail.com', '$2b$12$QnuBlookrDuipcigufnlKenl1ufl6Fk8.eQP27nIvz5f/lpgYKEhW', 2, 1);

CREATE TABLE IF NOT EXISTS clientes (
    id_cliente INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    id_tipo_documento_c INT,
    documento_cliente BIGINT UNIQUE,
    telefono_cliente BIGINT,
    email VARCHAR(100) UNIQUE NOT NULL,
    address VARCHAR(150),
    password_hash VARCHAR(255),
    is_active BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(100) UNIQUE,
    auth_provider VARCHAR(20) DEFAULT 'local',
    google_id VARCHAR(255) UNIQUE,
    foto_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_tipo_documento_c) REFERENCES tipos_documento(id_tipo_documento)
);

SET @hash = '$2b$12$KIXpzCv6VxPqCQzO4QH3eO8yYjZqXVNZYbGcYX7tZQ0cZ6sJZy3MG';

-- Contraseñas de clientes (patrón: 12345678 + inicial nombre MAYÚS + inicial apellido minús + .)
INSERT IGNORE INTO clientes (first_name, last_name, id_tipo_documento_c, documento_cliente, telefono_cliente, email, address, password_hash, is_active, verification_token) VALUES
('LAURA', 'GARCÍA ROJAS', 1, 1012345678, 3001234567, 'laura.garcia@gmail.com', 'Cra 10 #12-34', '$2b$12$6rroJ8FDswLC2TD7hXAK.uQv1GMyPUVEP8ppw3cIe1X1QOuMsgRoi', 1, NULL),
('DANIELA', 'RAMÍREZ PEÑA', 1, 1034567890, 3023456789, 'daniela.ramirez@gmail.com', 'Av 30 #15-09', '$2b$12$hE1X0XXMBO3Eb3o9kusSU.EVm19hFTkRC8Ko/ve7SJfwF.zTF/k7O', 1, NULL),
('ANDRÉS', 'GONZÁLEZ MORA', 2, 1045678901, 3034567890, 'andres.gonzalez@gmail.com', 'Mz A Casa 10', '$2b$12$AFJtgh2pVgOtqVSEkjHjyemlyZbGWnQj4q70AibjpNuifayrjrWLe', 1, NULL),
('MARIANA', 'SUÁREZ LÓPEZ', 1, 1056789012, 3045678901, 'mariana.suarez@gmail.com', 'Cl 8B #20-45', '$2b$12$/TbKAqekp0mfyBDohFR7juGHCaz5WkZkkceWSnhS0eesDpPkZZzNC', 1, NULL),
('NATALIA', 'CASTRO JIMÉNEZ', 1, 1078901234, 3067890123, 'natalia.castro@gmail.com', 'Cl 19 #13-55', '$2b$12$LRHnOBAUGFV2NGOh37Kz0.zDB7UcSkvVTVbKUgOMw/3qxwUoDoJvC', 1, NULL),
('FELIPE', 'MARTÍNEZ PÉREZ', 1, 1089012345, 3078901234, 'felipe.martinez@gmail.com', 'Av 68 #54-23', '$2b$12$7ZAsIDxO63nJAZ/jdtUDf.0vjL2dmnyhaWeVe8td5aswB44kugAb6', 1, NULL),
('CAMILA', 'ORTIZ SALAZAR', 2, 1090123456, 3089012345, 'camila.ortiz@gmail.com', 'Cl 100 #25-10', '$2b$12$WP/Uqv.1QQkwLrGYzX2fEOdJGIuYRedRMVpS.vvP4eA6zLs/LMTxC', 1, NULL),
('SEBASTIÁN', 'LÓPEZ ROMERO', 1, 1101234567, 3090123456, 'sebastian.lopez@gmail.com', 'Cra 7 #89-12', '$2b$12$oWsjXpWFUd0aRj87rBTufO3wMs7b7i72ZWpDY7G7QDB1rjzUtv2gS', 1, NULL),
('SOFÍA', 'RAMÍREZ ORTEGA', 1, 1112345678, 3101234567, 'sofia.ramirez@gmail.com', 'Cl 50 #12-34', @hash, 1, NULL),
('MATEO', 'GUTIÉRREZ PARDO', 2, 1123456789, 3112345678, 'mateo.gutierrez@gmail.com', 'Av 20 #45-67', @hash, 1, NULL),
('VALENTINA', 'HIDALGO CASTRO', 1, 1134567890, 3123456789, 'valentina.hidalgo@gmail.com', 'Cl 8 #34-56', '$2b$12$K0VCBGB08uRF8BrRN49LhuunCdQflp59lKwqSHFlMjAV6fj.xurqW', 1, NULL);

-- ------------------------------
-- Tabla de registros pendientes (SIN clave foránea)
-- ------------------------------
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------
-- Tablas de solicitudes de habilitación (migración 0009)
-- ------------------------------
CREATE TABLE IF NOT EXISTS solicitudes_habilitacion_empleado (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    resuelta_por INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resuelta_at DATETIME,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario),
    INDEX idx_usuario (id_usuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------
-- Tablas de técnicos, rutas, novedades
-- ------------------------------
CREATE TABLE IF NOT EXISTS tecnicos (
    id_tecnico INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario_t INT UNIQUE,
    certificacion_t VARCHAR(100),
    FOREIGN KEY (id_usuario_t) REFERENCES usuarios(id_usuario)
);

INSERT INTO tecnicos (id_usuario_t, certificacion_t)
SELECT id_usuario_t, certificacion_t FROM (
    SELECT 1 AS id_usuario_t, 'Certificación en Redes y Cableado Estructurado' AS certificacion_t
    UNION ALL SELECT 2, 'Certificación en Instalación de Domótica'
    UNION ALL SELECT 3, 'Certificación en Seguridad Electrónica'
    UNION ALL SELECT 4, 'Certificación en Soporte de Sistemas IoT'
    UNION ALL SELECT 5, 'Certificación en Programación de PLCs'
    UNION ALL SELECT 6, 'Certificación en Bases de Datos y Servidores'
    UNION ALL SELECT 7, 'Certificación en Automatización de Hogares'
    UNION ALL SELECT 8, 'Certificación en Seguridad Informática'
    UNION ALL SELECT 9, 'Certificación en Programación Backend'
    UNION ALL SELECT 10, 'Certificación en Gestión de Proyectos'
) t
WHERE NOT EXISTS (SELECT 1 FROM tecnicos);

-- Tabla asociativa técnico-especialización (migración 0025)
CREATE TABLE IF NOT EXISTS tecnico_especializacion (
    id_tecnico INT NOT NULL,
    id_especializacion INT NOT NULL,
    PRIMARY KEY (id_tecnico, id_especializacion),
    FOREIGN KEY (id_tecnico) REFERENCES tecnicos(id_tecnico) ON DELETE CASCADE,
    FOREIGN KEY (id_especializacion) REFERENCES especializaciones(id_especializacion) ON DELETE CASCADE
);

-- Tabla de ubicaciones de técnico (migración 0026)
CREATE TABLE IF NOT EXISTS ubicaciones_tecnico (
    id_ubicacion INT AUTO_INCREMENT PRIMARY KEY,
    id_tecnico_ut INT NOT NULL UNIQUE,
    latitud FLOAT NOT NULL,
    longitud FLOAT NOT NULL,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (id_tecnico_ut) REFERENCES tecnicos(id_tecnico),
    INDEX idx_tecnico (id_tecnico_ut)
);

CREATE TABLE IF NOT EXISTS novedades (
    id_novedad INT AUTO_INCREMENT PRIMARY KEY,
    id_tecnico_n INT,
    fecha_reporte_novedad DATETIME,
    tipo_novedad VARCHAR(100),
    descripcion_novedad TEXT,
    estado_novedad VARCHAR(50),
    prioridad VARCHAR(20) DEFAULT 'normal',
    lugar_ocurrencia VARCHAR(255),
    evidencia_url VARCHAR(255),
    id_pedido INT,
    id_cita INT,
    id_cliente INT,
    accion_admin TEXT,
    fecha_resolucion DATETIME,
    id_admin_resuelve INT,
    FOREIGN KEY (id_tecnico_n) REFERENCES tecnicos(id_tecnico),
    FOREIGN KEY (id_pedido) REFERENCES pedidos(id_pedido),
    FOREIGN KEY (id_cita) REFERENCES citas(id_cita),
    FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente)
);

-- Historial de cambios de novedades
CREATE TABLE IF NOT EXISTS novedad_historial (
    id_historial INT AUTO_INCREMENT PRIMARY KEY,
    id_novedad INT NOT NULL,
    id_usuario INT,
    accion VARCHAR(100) NOT NULL,
    detalle TEXT,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_novedad) REFERENCES novedades(id_novedad) ON DELETE CASCADE,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario),
    INDEX idx_novedad (id_novedad)
);

-- Evidencias múltiples por novedad (fotos subidas a MinIO)
CREATE TABLE IF NOT EXISTS evidencias_novedad (
    id_evidencia_n INT AUTO_INCREMENT PRIMARY KEY,
    id_novedad INT NOT NULL,
    url_archivo VARCHAR(255) NOT NULL,
    descripcion VARCHAR(255),
    fecha_subida DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_novedad) REFERENCES novedades(id_novedad) ON DELETE CASCADE,
    INDEX idx_novedad (id_novedad)
);

-- Cupones de descuento generados por novedades
CREATE TABLE IF NOT EXISTS cupones_descuento (
    id_cupon INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(50) NOT NULL UNIQUE,
    tipo_descuento VARCHAR(20) NOT NULL DEFAULT 'porcentaje',
    valor_descuento FLOAT NOT NULL,
    fecha_vencimiento DATE,
    compra_minima FLOAT DEFAULT 0,
    usos_maximos INT DEFAULT 1,
    usos_realizados INT DEFAULT 0,
    aplica_tienda_completa BOOLEAN DEFAULT TRUE,
    categorias_aplicables TEXT,
    id_cliente INT,
    id_novedad INT,
    id_admin_crea INT,
    activo BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente),
    FOREIGN KEY (id_novedad) REFERENCES novedades(id_novedad),
    FOREIGN KEY (id_admin_crea) REFERENCES usuarios(id_usuario),
    INDEX idx_cliente (id_cliente),
    INDEX idx_codigo (codigo)
);

INSERT INTO novedades (id_tecnico_n, fecha_reporte_novedad, tipo_novedad, descripcion_novedad, estado_novedad)
SELECT id_tecnico_n, fecha_reporte_novedad, tipo_novedad, descripcion_novedad, estado_novedad FROM (
    SELECT 1 AS id_tecnico_n, NOW() AS fecha_reporte_novedad, 'Falla Técnica' AS tipo_novedad, 'Sensor PIR no responde' AS descripcion_novedad, 'Pendiente' AS estado_novedad
    UNION ALL SELECT 2, NOW(), 'Instalación', 'Controlador central defectuoso', 'Resuelto'
    UNION ALL SELECT 3, NOW(), 'Mantenimiento', 'Cámara IP con visión parcial', 'Pendiente'
    UNION ALL SELECT 4, NOW(), 'Red WiFi', 'Router requiere reinicio', 'Pendiente'
    UNION ALL SELECT 5, NOW(), 'Sensores', 'Sensor de puerta mal instalado', 'Resuelto'
    UNION ALL SELECT 6, NOW(), 'PLC', 'Falla en programación del PLC', 'Pendiente'
    UNION ALL SELECT 7, NOW(), 'Mantenimiento', 'Fuente de poder 12V fallando', 'Pendiente'
    UNION ALL SELECT 8, NOW(), 'Asesoría', 'Cliente solicita cambios en configuración', 'Pendiente'
    UNION ALL SELECT 9, NOW(), 'Cámara IP', 'Soporte de pared dañado', 'Resuelto'
    UNION ALL SELECT 10, NOW(), 'Baterías', 'Batería recargable 18650 no carga', 'Pendiente'
) t
WHERE NOT EXISTS (SELECT 1 FROM novedades);

-- ------------------------------
-- Tablas de productos, inventarios
-- ------------------------------
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
    venta_por_metros TINYINT(1) NOT NULL DEFAULT 0,
    descripcion_producto TEXT NULL,
    colores_producto VARCHAR(255) NULL,
    estado_producto VARCHAR(20) NOT NULL DEFAULT 'activo',
    stock_producto INT NOT NULL DEFAULT 0,
    descuento_activo FLOAT,
    promocion_hasta DATE,
    es_nuevo_producto BOOLEAN NOT NULL DEFAULT TRUE,
    caracteristicas_producto TEXT,
    tecnicos_requeridos INT NOT NULL DEFAULT 1,
    dificultad_instalacion VARCHAR(10),
    tiempo_estimado_horas FLOAT,
    tiene_medidas BOOLEAN NOT NULL DEFAULT FALSE,
    visible_cliente BOOLEAN NOT NULL DEFAULT TRUE,
    marca VARCHAR(100),
    FOREIGN KEY (id_proveedor_pr) REFERENCES proveedores(id_proveedor),
    FOREIGN KEY (id_cate_pr) REFERENCES categorias(id_categoria)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO productos (nombre_producto, referencia_producto, id_proveedor_pr, precio_compra_producto, precio_venta_producto, fecha_registro_producto, imagen_url, id_cate_pr) VALUES
('Sensor De Movimiento Pir', 'smi-001', 1, 52000.00, 82000.00, NOW(), NULL, 1),
('Controlador Central Domótico', 'ccd-004', 3, 190000.00, 285000.00, NOW(), NULL, 2),
('Cinta Led Rgb', 'led-003', 1, 7000.00, 14000.00, NOW(), NULL, 3),
('Kit De Automatización Básica', 'kit-001', 5, 175000.00, 260000.00, NOW(), NULL, 4),
('Cable Utp Cat6', 'utp6-050', 4, 2100.00, 3500.00, NOW(), NULL, 5),
('Sensor De Puerta/Ventana', 'spd-006', 2, 30000.00, 45000.00, NOW(), NULL, 1),
('Enchufe Inteligente Wifi', 'eiw-007', 1, 46000.00, 69000.00, NOW(), NULL, 6),
('Fuente De Poder 12v 5a', 'ps12-5a', 4, 39000.00, 58000.00, NOW(), NULL, 7),
('Cámara Ip 1080p', 'cip-003', 2, 165000.00, 245000.00, NOW(), NULL, 8),
('Batería Recargable 18650', 'bat18650', 6, 11000.00, 18000.00, NOW(), NULL, 7),
('Termostato Inteligente', 'ter-101', 2, 100000.00, 155000.00, NOW(), NULL, 9),
('Interruptor Táctil Wifi', 'int-202', 1, 43000.00, 65000.00, NOW(), NULL, 10),
('Sirena Inalámbrica', 'sir-303', 3, 62000.00, 95000.00, NOW(), NULL, 8),
('Detector De Humo', 'dhu-404', 4, 55000.00, 85000.00, NOW(), NULL, 1),
('Persiana Motorizada', 'per-505', 5, 255000.00, 380000.00, NOW(), NULL, 9),
('Panel Táctil Central', 'pan-606', 6, 600000.00, 890000.00, NOW(), NULL, 2);

-- Tabla asociativa producto-especialización (migración 0030)
CREATE TABLE IF NOT EXISTS producto_especializacion (
    id_producto INT NOT NULL,
    id_especializacion INT NOT NULL,
    PRIMARY KEY (id_producto, id_especializacion),
    FOREIGN KEY (id_producto) REFERENCES productos(id_producto) ON DELETE CASCADE,
    FOREIGN KEY (id_especializacion) REFERENCES especializaciones(id_especializacion) ON DELETE CASCADE
);

-- ------------------------------
-- Variantes de color de productos
-- ------------------------------
CREATE TABLE IF NOT EXISTS producto_variantes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_producto INT NOT NULL,
    nombre VARCHAR(60) NOT NULL,
    hex VARCHAR(10) NULL,
    tamano VARCHAR(60),
    ancho_cm INT,
    alto_cm INT,
    precio FLOAT,
    imagen_url VARCHAR(255) NULL,
    stock INT NOT NULL DEFAULT 0,
    CONSTRAINT fk_variante_producto FOREIGN KEY (id_producto) REFERENCES productos(id_producto) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------
-- Tablas de servicios, pedidos, detalles
-- ------------------------------
CREATE TABLE IF NOT EXISTS servicios (
    id_servicio INT AUTO_INCREMENT PRIMARY KEY,
    id_tipo_ser INT,
    precio_servicio DECIMAL(10,2),
    total_servicio DECIMAL(10,2),
    id_tecnico_s INT,
    FOREIGN KEY (id_tipo_ser) REFERENCES tipos_servicios(id_tipo_ser),
    FOREIGN KEY (id_tecnico_s) REFERENCES tecnicos(id_tecnico)
);

INSERT INTO servicios (id_tipo_ser, precio_servicio, total_servicio, id_tecnico_s)
SELECT id_tipo_ser, precio_servicio, total_servicio, id_tecnico_s FROM (
    SELECT 1 AS id_tipo_ser, 150000.00 AS precio_servicio, 150000.00 AS total_servicio, 1 AS id_tecnico_s
    UNION ALL SELECT 2, 80000.00, 80000.00, 2
    UNION ALL SELECT 3, 60000.00, 60000.00, 3
    UNION ALL SELECT 4, 70000.00, 70000.00, 4
    UNION ALL SELECT 1, 50000.00, 50000.00, 5
    UNION ALL SELECT 5, 120000.00, 120000.00, 6
    UNION ALL SELECT 2, 90000.00, 90000.00, 7
    UNION ALL SELECT 6, 100000.00, 100000.00, 8
    UNION ALL SELECT 1, 85000.00, 85000.00, 9
    UNION ALL SELECT 2, 40000.00, 40000.00, 10
) t
WHERE NOT EXISTS (SELECT 1 FROM servicios);

CREATE TABLE IF NOT EXISTS pedidos (
    id_pedido INT AUTO_INCREMENT PRIMARY KEY,
    id_cliente_pe INT,
    fecha_peedido DATETIME,
    total_pedido FLOAT,
    estado_pedido VARCHAR(50),
    fecha_entrega DATE,
    hora_entrega VARCHAR(10),
    hora_entrega_fin VARCHAR(10),
    id_tecnico_entrega INT,
    nombre_tecnico_entrega VARCHAR(150),
    estado_entrega VARCHAR(20),
    entrega_actualizada_en DATETIME,
    evidencia_entrega_url VARCHAR(255),
    FOREIGN KEY (id_cliente_pe) REFERENCES clientes(id_cliente)
);

INSERT INTO pedidos (id_cliente_pe, fecha_peedido, total_pedido, estado_pedido)
SELECT id_cliente_pe, fecha_peedido, total_pedido, estado_pedido FROM (
    SELECT 1 AS id_cliente_pe, NOW() AS fecha_peedido, 150000.00 AS total_pedido, 'ACTIVO' AS estado_pedido
    UNION ALL SELECT 2, NOW(), 80000.00, 'ACTIVO'
    UNION ALL SELECT 3, NOW(), 60000.00, 'ACTIVO'
    UNION ALL SELECT 4, NOW(), 70000.00, 'ACTIVO'
    UNION ALL SELECT 5, NOW(), 50000.00, 'ACTIVO'
    UNION ALL SELECT 6, NOW(), 120000.00, 'ACTIVO'
    UNION ALL SELECT 7, NOW(), 90000.00, 'ACTIVO'
    UNION ALL SELECT 8, NOW(), 100000.00, 'ACTIVO'
    UNION ALL SELECT 9, NOW(), 85000.00, 'ACTIVO'
    UNION ALL SELECT 10, NOW(), 40000.00, 'ACTIVO'
) t
WHERE NOT EXISTS (SELECT 1 FROM pedidos);

CREATE TABLE IF NOT EXISTS detalle_pedido (
    id_detalle INT AUTO_INCREMENT PRIMARY KEY,
    id_pedido_d INT,
    id_producto_d INT,
    id_servicio_d INT,
    id_comision_d INT,
    cantidad_detalle INT DEFAULT 1,
    cantidad_metros FLOAT,
    precio_unitario_detalle FLOAT,
    subtotal_detalle FLOAT,
    color_detalle VARCHAR(50) NULL,
    largo_metros DECIMAL(10,2) NULL,
    descripcion_detalle TEXT,
    fecha_servicio DATETIME,
    hora_servicio VARCHAR(5),
    direccion_servicio VARCHAR(200),
    FOREIGN KEY (id_pedido_d) REFERENCES pedidos(id_pedido),
    FOREIGN KEY (id_producto_d) REFERENCES productos(id_producto)
);

INSERT INTO detalle_pedido (id_pedido_d, id_producto_d, id_servicio_d, id_comision_d, cantidad_detalle, precio_unitario_detalle, subtotal_detalle)
SELECT id_pedido_d, id_producto_d, id_servicio_d, id_comision_d, cantidad_detalle, precio_unitario_detalle, subtotal_detalle FROM (
    SELECT 1 AS id_pedido_d, 1 AS id_producto_d, 1 AS id_servicio_d, 1 AS id_comision_d, 1 AS cantidad_detalle, 70000.00 AS precio_unitario_detalle, 70000.00 AS subtotal_detalle
    UNION ALL SELECT 2, 2, 2, 2, 1, 160000.00, 160000.00
    UNION ALL SELECT 3, 3, 3, 3, 1, 20000.00, 20000.00
    UNION ALL SELECT 4, 4, 4, 4, 1, 180000.00, 180000.00
    UNION ALL SELECT 5, 5, 5, 5, 1, 6000.00, 6000.00
    UNION ALL SELECT 6, 6, 6, 6, 1, 39000.00, 39000.00
    UNION ALL SELECT 7, 7, 7, 7, 1, 58000.00, 58000.00
    UNION ALL SELECT 8, 8, 8, 8, 1, 50000.00, 50000.00
    UNION ALL SELECT 9, 9, 9, 9, 1, 170000.00, 170000.00
    UNION ALL SELECT 10, 10, 10, 10, 1, 10000.00, 10000.00
) t
WHERE NOT EXISTS (SELECT 1 FROM detalle_pedido);

-- ------------------------------
-- Tablas de tokens (autenticación)
-- ------------------------------
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
);

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
);

-- ------------------------------
-- Tabla de citas de clientes
-- ------------------------------
CREATE TABLE IF NOT EXISTS citas (
    id_cita INT AUTO_INCREMENT PRIMARY KEY,
    id_cliente INT NOT NULL,
    id_tecnico INT NULL,
    nombre_tecnico VARCHAR(150) NULL,
    id_tecnico_2 INT,
    nombre_tecnico_2 VARCHAR(150),
    id_tecnico_3 INT,
    nombre_tecnico_3 VARCHAR(150),
    tipo_servicio VARCHAR(30) NOT NULL,
    fecha DATE NOT NULL,
    hora VARCHAR(10) NOT NULL,
    direccion VARCHAR(200) NOT NULL,
    descripcion TEXT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'Pendiente',
    costo_cita NUMERIC(12,2),
    metodo_pago VARCHAR(30),
    estado_pago VARCHAR(20),
    numero_transaccion VARCHAR(120),
    id_comision_c INT,
    id_especializacion INT,
    recordatorio_enviado BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_citas_cliente FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente) ON DELETE CASCADE,
    FOREIGN KEY (id_comision_c) REFERENCES comisiones(id_comision),
    FOREIGN KEY (id_especializacion) REFERENCES especializaciones(id_especializacion),
    INDEX ix_citas_id_cliente (id_cliente)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de producto-cita (migración 0018)
CREATE TABLE IF NOT EXISTS cita_producto (
    id_cita_producto INT AUTO_INCREMENT PRIMARY KEY,
    id_cita INT NOT NULL,
    id_producto INT,
    id_variante INT,
    cantidad INT NOT NULL DEFAULT 1,
    notas VARCHAR(255),
    FOREIGN KEY (id_cita) REFERENCES citas(id_cita) ON DELETE CASCADE,
    FOREIGN KEY (id_producto) REFERENCES productos(id_producto),
    FOREIGN KEY (id_variante) REFERENCES producto_variantes(id) ON DELETE SET NULL,
    INDEX idx_cita (id_cita),
    INDEX idx_producto (id_producto)
);

-- Tabla de historial de citas (migración 0025)
CREATE TABLE IF NOT EXISTS historial_citas (
    id_historial INT AUTO_INCREMENT PRIMARY KEY,
    id_cita INT NOT NULL,
    accion VARCHAR(50) NOT NULL,
    tecnico_anterior_id INT,
    tecnico_anterior_nombre VARCHAR(150),
    tecnico_nuevo_id INT,
    tecnico_nuevo_nombre VARCHAR(150),
    administrador_id INT,
    motivo VARCHAR(255),
    detalle TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_cita) REFERENCES citas(id_cita) ON DELETE CASCADE,
    INDEX idx_cita (id_cita)
);

-- Tabla de ofertas de horario (migraciones 0040, 0045)
CREATE TABLE IF NOT EXISTS ofertas_horario (
    id_oferta INT AUTO_INCREMENT PRIMARY KEY,
    id_cliente INT,
    fecha DATE NOT NULL,
    hora VARCHAR(10) NOT NULL,
    tipo_servicio VARCHAR(30) NOT NULL,
    id_tecnico INT NOT NULL,
    nombre_tecnico VARCHAR(150),
    puntaje INT NOT NULL DEFAULT 0,
    estado VARCHAR(15) NOT NULL DEFAULT 'Ofrecida',
    aceptada_por_cliente INT,
    expira_en DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente) ON DELETE CASCADE,
    FOREIGN KEY (aceptada_por_cliente) REFERENCES clientes(id_cliente) ON DELETE SET NULL,
    INDEX idx_cliente (id_cliente),
    INDEX idx_tecnico (id_tecnico),
    INDEX idx_estado (estado),
    INDEX idx_expira (expira_en)
);

-- Solicitudes de inhabilitación/habilitación de cuentas
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------
-- Tablas de comercio electrónico
-- ------------------------------

CREATE TABLE IF NOT EXISTS carrito_items (
    id_carrito_item INT AUTO_INCREMENT PRIMARY KEY,
    id_cliente INT NOT NULL,
    id_producto INT NOT NULL,
    cantidad INT NOT NULL DEFAULT 1,
    color VARCHAR(50) NULL,
    largo DECIMAL(10,2) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_carrito_item (id_cliente, id_producto, color, largo),
    CONSTRAINT fk_carrito_cliente FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente) ON DELETE CASCADE,
    CONSTRAINT fk_carrito_producto FOREIGN KEY (id_producto) REFERENCES productos(id_producto) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pagos (
    id_pago INT AUTO_INCREMENT PRIMARY KEY,
    id_pedido INT,
    metodo_pago VARCHAR(30) NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    numero_transaccion VARCHAR(50),
    monto FLOAT NOT NULL DEFAULT 0,
    banco VARCHAR(100),
    titular VARCHAR(150),
    ultimos_digitos VARCHAR(6),
    correo_paypal VARCHAR(150),
    codigo_punto_pago VARCHAR(30),
    punto_pago VARCHAR(50),
    referencia_pago VARCHAR(50),
    fecha_limite_pago DATETIME,
    fecha_pago DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX ix_pago_pedido (id_pedido),
    CONSTRAINT fk_pago_pedido FOREIGN KEY (id_pedido) REFERENCES pedidos(id_pedido)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS facturas (
    id_factura INT AUTO_INCREMENT PRIMARY KEY,
    id_pedido INT NOT NULL,
    id_cita INT,
    numero_factura VARCHAR(30) NOT NULL UNIQUE,
    fecha_factura DATETIME NOT NULL,
    monto_total FLOAT NOT NULL,
    metodo_pago VARCHAR(30),
    estado_pago VARCHAR(20),
    numero_transaccion VARCHAR(50),
    enviada_por_correo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_pedido) REFERENCES pedidos(id_pedido),
    FOREIGN KEY (id_cita) REFERENCES citas(id_cita),
    INDEX ix_factura_pedido (id_pedido)
);

-- ------------------------------
-- Tablas de calificaciones (migración 0014)
-- ------------------------------
CREATE TABLE IF NOT EXISTS calificaciones (
    id_calificacion INT AUTO_INCREMENT PRIMARY KEY,
    id_cliente_c INT NOT NULL,
    id_tecnico_c INT NOT NULL,
    id_cita_c INT,
    calificacion SMALLINT NOT NULL,
    comentario TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_cliente_c) REFERENCES clientes(id_cliente),
    FOREIGN KEY (id_tecnico_c) REFERENCES tecnicos(id_tecnico),
    FOREIGN KEY (id_cita_c) REFERENCES citas(id_cita),
    INDEX idx_cliente (id_cliente_c),
    INDEX idx_tecnico (id_tecnico_c)
);

-- Tabla de calificaciones de producto (migraciones 0026, 0041)
CREATE TABLE IF NOT EXISTS calificaciones_producto (
    id_calificacion_producto INT AUTO_INCREMENT PRIMARY KEY,
    id_cliente_cp INT NOT NULL,
    id_pedido_cp INT,
    id_producto_cp INT,
    calificacion SMALLINT NOT NULL,
    comentario TEXT,
    foto_url VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_cliente_cp) REFERENCES clientes(id_cliente),
    FOREIGN KEY (id_pedido_cp) REFERENCES pedidos(id_pedido),
    FOREIGN KEY (id_producto_cp) REFERENCES productos(id_producto),
    INDEX idx_cliente (id_cliente_cp),
    INDEX idx_pedido (id_pedido_cp),
    INDEX idx_producto (id_producto_cp)
);

-- ------------------------------
-- Tablas de evidencias (migraciones 0017, 0033)
-- ------------------------------
CREATE TABLE IF NOT EXISTS evidencias (
    id_evidencia INT AUTO_INCREMENT PRIMARY KEY,
    id_cita INT NOT NULL,
    id_tecnico INT,
    url_archivo VARCHAR(255) NOT NULL,
    descripcion VARCHAR(255),
    fecha_subida DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_cita) REFERENCES citas(id_cita) ON DELETE CASCADE,
    FOREIGN KEY (id_tecnico) REFERENCES tecnicos(id_tecnico),
    INDEX idx_cita (id_cita)
);

CREATE TABLE IF NOT EXISTS evidencias_entrega (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_pedido INT NOT NULL,
    id_tecnico INT NOT NULL,
    url_archivo VARCHAR(255) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_pedido) REFERENCES pedidos(id_pedido) ON DELETE CASCADE,
    INDEX idx_pedido (id_pedido)
);

-- ------------------------------
-- Tablas de notificaciones (migraciones 0016, 0020, 0044)
-- ------------------------------
CREATE TABLE IF NOT EXISTS notificaciones (
    id_notificacion INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT,
    id_cliente INT,
    tipo VARCHAR(30) NOT NULL DEFAULT 'sistema',
    titulo VARCHAR(150) NOT NULL,
    mensaje VARCHAR(500) NOT NULL,
    leida BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario),
    FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente),
    INDEX idx_usuario (id_usuario),
    INDEX idx_cliente (id_cliente)
);

-- ------------------------------
-- Tablas de devoluciones (migraciones 0026, 0027, 0038, 0039, 0042)
-- ------------------------------
CREATE TABLE IF NOT EXISTS devoluciones (
    id_devolucion INT AUTO_INCREMENT PRIMARY KEY,
    id_cliente_d INT,
    id_pedido_d INT,
    id_producto_d INT,
    motivo TEXT,
    estado VARCHAR(20) NOT NULL DEFAULT 'Pendiente',
    resolucion VARCHAR(20),
    resuelta_por INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resuelta_at DATETIME,
    preferencia VARCHAR(10),
    id_tecnico_recogida INT,
    recogida_estado VARCHAR(20) DEFAULT 'Asignada',
    evidencia_recogida VARCHAR(255),
    fecha_recogida DATETIME,
    evidencia_cambio VARCHAR(255),
    fecha_entrega_cambio DATETIME,
    cantidad INT NOT NULL DEFAULT 1,
    id_solicitud_dv INT,
    FOREIGN KEY (id_cliente_d) REFERENCES clientes(id_cliente),
    FOREIGN KEY (id_pedido_d) REFERENCES pedidos(id_pedido),
    FOREIGN KEY (id_producto_d) REFERENCES productos(id_producto),
    INDEX idx_cliente (id_cliente_d),
    INDEX idx_pedido (id_pedido_d),
    INDEX idx_producto (id_producto_d)
);

-- Tabla de solicitudes de devolución (migración 0043)
CREATE TABLE IF NOT EXISTS solicitudes_devolucion (
    id_solicitud INT AUTO_INCREMENT PRIMARY KEY,
    numero VARCHAR(20) NOT NULL UNIQUE,
    id_cliente_s INT,
    id_pedido_s INT,
    motivo_tipo VARCHAR(40),
    motivo_otro TEXT,
    comentario TEXT,
    estado VARCHAR(30) NOT NULL DEFAULT 'Solicitada',
    tipo_devolucion VARCHAR(10) NOT NULL DEFAULT 'parcial',
    monto_total FLOAT NOT NULL DEFAULT 0,
    resolucion VARCHAR(20),
    motivo_rechazo TEXT,
    observaciones_admin TEXT,
    resuelta_por INT,
    resuelta_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME,
    FOREIGN KEY (id_cliente_s) REFERENCES clientes(id_cliente),
    FOREIGN KEY (id_pedido_s) REFERENCES pedidos(id_pedido),
    INDEX idx_cliente (id_cliente_s),
    INDEX idx_pedido (id_pedido_s),
    INDEX idx_estado (estado)
);

-- Tabla de reembolsos (migración 0025)
CREATE TABLE IF NOT EXISTS reembolsos (
    id_reembolso INT AUTO_INCREMENT PRIMARY KEY,
    id_cita INT,
    id_pedido INT,
    monto FLOAT NOT NULL DEFAULT 0,
    estado VARCHAR(20) NOT NULL DEFAULT 'Pendiente',
    motivo VARCHAR(255),
    numero_transaccion_original VARCHAR(120),
    numero_transaccion_reembolso VARCHAR(120),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    procesado_at DATETIME,
    FOREIGN KEY (id_cita) REFERENCES citas(id_cita) ON DELETE SET NULL,
    FOREIGN KEY (id_pedido) REFERENCES pedidos(id_pedido) ON DELETE SET NULL,
    INDEX idx_cita (id_cita),
    INDEX idx_pedido (id_pedido)
);

-- ------------------------------
-- Contactos / consultas de soporte
-- ------------------------------
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------
-- Migraciones de columnas (idempotentes, seguras en BD existentes)
-- MySQL 8 no soporta "ADD COLUMN IF NOT EXISTS"; se usa information_schema.
-- ------------------------------

-- productos.venta_por_metros
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='productos' AND COLUMN_NAME='venta_por_metros');
SET @sql = IF(@col = 0, 'ALTER TABLE productos ADD COLUMN venta_por_metros TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- productos.marca
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='productos' AND COLUMN_NAME='marca');
SET @sql = IF(@col = 0, 'ALTER TABLE productos ADD COLUMN marca VARCHAR(100) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- productos.descripcion_producto
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='productos' AND COLUMN_NAME='descripcion_producto');
SET @sql = IF(@col = 0, 'ALTER TABLE productos ADD COLUMN descripcion_producto TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- productos.colores_producto
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='productos' AND COLUMN_NAME='colores_producto');
SET @sql = IF(@col = 0, 'ALTER TABLE productos ADD COLUMN colores_producto VARCHAR(255) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- productos.estado_producto
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='productos' AND COLUMN_NAME='estado_producto');
SET @sql = IF(@col = 0, 'ALTER TABLE productos ADD COLUMN estado_producto VARCHAR(20) NOT NULL DEFAULT ''activo''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- productos.stock_producto
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='productos' AND COLUMN_NAME='stock_producto');
SET @sql = IF(@col = 0, 'ALTER TABLE productos ADD COLUMN stock_producto INT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- productos.descuento_activo
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='productos' AND COLUMN_NAME='descuento_activo');
SET @sql = IF(@col = 0, 'ALTER TABLE productos ADD COLUMN descuento_activo FLOAT', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- productos.promocion_hasta
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='productos' AND COLUMN_NAME='promocion_hasta');
SET @sql = IF(@col = 0, 'ALTER TABLE productos ADD COLUMN promocion_hasta DATE', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- productos.es_nuevo_producto
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='productos' AND COLUMN_NAME='es_nuevo_producto');
SET @sql = IF(@col = 0, 'ALTER TABLE productos ADD COLUMN es_nuevo_producto BOOLEAN NOT NULL DEFAULT TRUE', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- productos.caracteristicas_producto
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='productos' AND COLUMN_NAME='caracteristicas_producto');
SET @sql = IF(@col = 0, 'ALTER TABLE productos ADD COLUMN caracteristicas_producto TEXT', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- productos.tecnicos_requeridos
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='productos' AND COLUMN_NAME='tecnicos_requeridos');
SET @sql = IF(@col = 0, 'ALTER TABLE productos ADD COLUMN tecnicos_requeridos INT NOT NULL DEFAULT 1', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- productos.dificultad_instalacion
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='productos' AND COLUMN_NAME='dificultad_instalacion');
SET @sql = IF(@col = 0, 'ALTER TABLE productos ADD COLUMN dificultad_instalacion VARCHAR(10)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- productos.tiempo_estimado_horas
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='productos' AND COLUMN_NAME='tiempo_estimado_horas');
SET @sql = IF(@col = 0, 'ALTER TABLE productos ADD COLUMN tiempo_estimado_horas FLOAT', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- productos.tiene_medidas
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='productos' AND COLUMN_NAME='tiene_medidas');
SET @sql = IF(@col = 0, 'ALTER TABLE productos ADD COLUMN tiene_medidas BOOLEAN NOT NULL DEFAULT FALSE', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- usuarios.desactivado_hasta
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='usuarios' AND COLUMN_NAME='desactivado_hasta');
SET @sql = IF(@col = 0, 'ALTER TABLE usuarios ADD COLUMN desactivado_hasta DATETIME', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- usuarios.foto_url
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='usuarios' AND COLUMN_NAME='foto_url');
SET @sql = IF(@col = 0, 'ALTER TABLE usuarios ADD COLUMN foto_url VARCHAR(255)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- usuarios.password_reset_required
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='usuarios' AND COLUMN_NAME='password_reset_required');
SET @sql = IF(@col = 0, 'ALTER TABLE usuarios ADD COLUMN password_reset_required BOOLEAN DEFAULT FALSE', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- clientes.auth_provider
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='clientes' AND COLUMN_NAME='auth_provider');
SET @sql = IF(@col = 0, 'ALTER TABLE clientes ADD COLUMN auth_provider VARCHAR(20) DEFAULT ''local''', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- clientes.google_id
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='clientes' AND COLUMN_NAME='google_id');
SET @sql = IF(@col = 0, 'ALTER TABLE clientes ADD COLUMN google_id VARCHAR(255)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- detalle_pedido.color_detalle
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='detalle_pedido' AND COLUMN_NAME='color_detalle');
SET @sql = IF(@col = 0, 'ALTER TABLE detalle_pedido ADD COLUMN color_detalle VARCHAR(50) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- detalle_pedido.largo_metros
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='detalle_pedido' AND COLUMN_NAME='largo_metros');
SET @sql = IF(@col = 0, 'ALTER TABLE detalle_pedido ADD COLUMN largo_metros DECIMAL(10,2) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- detalle_pedido.cantidad_metros
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='detalle_pedido' AND COLUMN_NAME='cantidad_metros');
SET @sql = IF(@col = 0, 'ALTER TABLE detalle_pedido ADD COLUMN cantidad_metros FLOAT', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- detalle_pedido.descripcion_detalle
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='detalle_pedido' AND COLUMN_NAME='descripcion_detalle');
SET @sql = IF(@col = 0, 'ALTER TABLE detalle_pedido ADD COLUMN descripcion_detalle TEXT', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- detalle_pedido.fecha_servicio
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='detalle_pedido' AND COLUMN_NAME='fecha_servicio');
SET @sql = IF(@col = 0, 'ALTER TABLE detalle_pedido ADD COLUMN fecha_servicio DATETIME', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- detalle_pedido.hora_servicio
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='detalle_pedido' AND COLUMN_NAME='hora_servicio');
SET @sql = IF(@col = 0, 'ALTER TABLE detalle_pedido ADD COLUMN hora_servicio VARCHAR(5)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- detalle_pedido.direccion_servicio
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='detalle_pedido' AND COLUMN_NAME='direccion_servicio');
SET @sql = IF(@col = 0, 'ALTER TABLE detalle_pedido ADD COLUMN direccion_servicio VARCHAR(200)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- carrito_items.largo
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='carrito_items' AND COLUMN_NAME='largo');
SET @sql = IF(@col = 0, 'ALTER TABLE carrito_items ADD COLUMN largo DECIMAL(10,2) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- carrito_items: incluir largo en la clave única (producto+color+largo)
SET @idx = (SELECT COUNT(*) FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='carrito_items'
              AND INDEX_NAME='uq_carrito_item' AND COLUMN_NAME='largo');
SET @sql = IF(@idx = 0,
  'ALTER TABLE carrito_items DROP KEY uq_carrito_item, ADD UNIQUE KEY uq_carrito_item (id_cliente, id_producto, color, largo)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- citas.costo_cita
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='citas' AND COLUMN_NAME='costo_cita');
SET @sql = IF(@col = 0, 'ALTER TABLE citas ADD COLUMN costo_cita NUMERIC(12,2)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- citas.metodo_pago
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='citas' AND COLUMN_NAME='metodo_pago');
SET @sql = IF(@col = 0, 'ALTER TABLE citas ADD COLUMN metodo_pago VARCHAR(30)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- citas.estado_pago
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='citas' AND COLUMN_NAME='estado_pago');
SET @sql = IF(@col = 0, 'ALTER TABLE citas ADD COLUMN estado_pago VARCHAR(20)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- citas.numero_transaccion
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='citas' AND COLUMN_NAME='numero_transaccion');
SET @sql = IF(@col = 0, 'ALTER TABLE citas ADD COLUMN numero_transaccion VARCHAR(120)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- citas.id_comision_c
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='citas' AND COLUMN_NAME='id_comision_c');
SET @sql = IF(@col = 0, 'ALTER TABLE citas ADD COLUMN id_comision_c INT', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- citas.id_especializacion
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='citas' AND COLUMN_NAME='id_especializacion');
SET @sql = IF(@col = 0, 'ALTER TABLE citas ADD COLUMN id_especializacion INT', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- citas.recordatorio_enviado
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='citas' AND COLUMN_NAME='recordatorio_enviado');
SET @sql = IF(@col = 0, 'ALTER TABLE citas ADD COLUMN recordatorio_enviado BOOLEAN DEFAULT FALSE', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- citas.id_tecnico_2
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='citas' AND COLUMN_NAME='id_tecnico_2');
SET @sql = IF(@col = 0, 'ALTER TABLE citas ADD COLUMN id_tecnico_2 INT', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- citas.nombre_tecnico_2
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='citas' AND COLUMN_NAME='nombre_tecnico_2');
SET @sql = IF(@col = 0, 'ALTER TABLE citas ADD COLUMN nombre_tecnico_2 VARCHAR(150)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- citas.id_tecnico_3
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='citas' AND COLUMN_NAME='id_tecnico_3');
SET @sql = IF(@col = 0, 'ALTER TABLE citas ADD COLUMN id_tecnico_3 INT', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- citas.nombre_tecnico_3
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='citas' AND COLUMN_NAME='nombre_tecnico_3');
SET @sql = IF(@col = 0, 'ALTER TABLE citas ADD COLUMN nombre_tecnico_3 VARCHAR(150)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- producto_variantes.tamano
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='producto_variantes' AND COLUMN_NAME='tamano');
SET @sql = IF(@col = 0, 'ALTER TABLE producto_variantes ADD COLUMN tamano VARCHAR(60)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- producto_variantes.precio
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='producto_variantes' AND COLUMN_NAME='precio');
SET @sql = IF(@col = 0, 'ALTER TABLE producto_variantes ADD COLUMN precio FLOAT', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- producto_variantes.ancho_cm
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='producto_variantes' AND COLUMN_NAME='ancho_cm');
SET @sql = IF(@col = 0, 'ALTER TABLE producto_variantes ADD COLUMN ancho_cm INT', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- producto_variantes.alto_cm
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='producto_variantes' AND COLUMN_NAME='alto_cm');
SET @sql = IF(@col = 0, 'ALTER TABLE producto_variantes ADD COLUMN alto_cm INT', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Productos que se venden por metro (cable UTP y cinta LED)
UPDATE productos SET venta_por_metros = 1
WHERE referencia_producto IN ('utp6-050', 'led-003') AND venta_por_metros = 0;

-- Marcas comerciales de los productos
UPDATE productos SET marca = 'Hikvision'  WHERE referencia_producto = 'smi-001';
UPDATE productos SET marca = 'Fibaro'     WHERE referencia_producto = 'ccd-004';
UPDATE productos SET marca = 'Ledvance'   WHERE referencia_producto = 'led-003';
UPDATE productos SET marca = 'Aqara'      WHERE referencia_producto = 'kit-001';
UPDATE productos SET marca = 'Steren'     WHERE referencia_producto = 'utp6-050';
UPDATE productos SET marca = 'Aqara'      WHERE referencia_producto = 'spd-006';
UPDATE productos SET marca = 'TP-Link'    WHERE referencia_producto = 'eiw-007';
UPDATE productos SET marca = 'Twinsol'    WHERE referencia_producto = 'ps12-5a';
UPDATE productos SET marca = 'Hikvision'  WHERE referencia_producto = 'cip-003';
UPDATE productos SET marca = 'Xtar'       WHERE referencia_producto = 'bat18650';
UPDATE productos SET marca = 'Honeywell'  WHERE referencia_producto = 'ter-101';
UPDATE productos SET marca = 'Sonoff'     WHERE referencia_producto = 'int-202';
UPDATE productos SET marca = 'Bosch'      WHERE referencia_producto = 'sir-303';
UPDATE productos SET marca = 'Kidde'      WHERE referencia_producto = 'dhu-404';
UPDATE productos SET marca = 'Somfy'      WHERE referencia_producto = 'per-505';
UPDATE productos SET marca = 'Fibaro'     WHERE referencia_producto = 'pan-606';

-- Precios reales (pesos colombianos) y descripciones de los productos por metros
UPDATE productos SET precio_compra_producto = 52000.00,   precio_venta_producto = 82000.00   WHERE referencia_producto = 'smi-001';
UPDATE productos SET precio_compra_producto = 190000.00,  precio_venta_producto = 285000.00  WHERE referencia_producto = 'ccd-004';
UPDATE productos SET precio_compra_producto = 7000.00,    precio_venta_producto = 14000.00,
       descripcion_producto = 'Cinta LED RGB con control por app y 16 millones de colores. Venta por metros: elige la longitud que necesitas.' WHERE referencia_producto = 'led-003';
UPDATE productos SET precio_compra_producto = 175000.00,  precio_venta_producto = 260000.00  WHERE referencia_producto = 'kit-001';
UPDATE productos SET precio_compra_producto = 2100.00,    precio_venta_producto = 3500.00,
       descripcion_producto = 'Cable UTP Cat6 blindado para redes de alta velocidad. Venta por metros: elige el color y la longitud que necesitas.' WHERE referencia_producto = 'utp6-050';
UPDATE productos SET precio_compra_producto = 30000.00,   precio_venta_producto = 45000.00   WHERE referencia_producto = 'spd-006';
UPDATE productos SET precio_compra_producto = 46000.00,   precio_venta_producto = 69000.00   WHERE referencia_producto = 'eiw-007';
UPDATE productos SET precio_compra_producto = 39000.00,   precio_venta_producto = 58000.00   WHERE referencia_producto = 'ps12-5a';
UPDATE productos SET precio_compra_producto = 165000.00,  precio_venta_producto = 245000.00  WHERE referencia_producto = 'cip-003';
UPDATE productos SET precio_compra_producto = 11000.00,   precio_venta_producto = 18000.00   WHERE referencia_producto = 'bat18650';
UPDATE productos SET precio_compra_producto = 100000.00,  precio_venta_producto = 155000.00  WHERE referencia_producto = 'ter-101';
UPDATE productos SET precio_compra_producto = 43000.00,   precio_venta_producto = 65000.00   WHERE referencia_producto = 'int-202';
UPDATE productos SET precio_compra_producto = 62000.00,   precio_venta_producto = 95000.00   WHERE referencia_producto = 'sir-303';
UPDATE productos SET precio_compra_producto = 55000.00,   precio_venta_producto = 85000.00   WHERE referencia_producto = 'dhu-404';
UPDATE productos SET precio_compra_producto = 255000.00,  precio_venta_producto = 380000.00  WHERE referencia_producto = 'per-505';
UPDATE productos SET precio_compra_producto = 600000.00,  precio_venta_producto = 890000.00  WHERE referencia_producto = 'pan-606';

-- =====================================================
-- REGISTROS GUARDADOS AUTOMÁTICAMENTE
-- (Generado automáticamente por el backend - no editar a mano)
-- =====================================================

INSERT IGNORE INTO clientes (id_cliente, first_name, last_name, id_tipo_documento_c, documento_cliente, telefono_cliente, email, address, password_hash, is_active, verification_token, created_at) VALUES
(1, 'LAURA', 'GARCÍA ROJAS', 1, 1012345678, 3001234567, 'laura.garcia@gmail.com', 'Cra 10 #12-34', '$2b$12$KIXpzCv6VxPqCQzO4QH3eO8yYjZqXVNZYbGcYX7tZQ0cZ6sJZy3MG', 1, NULL, '2026-09-10 18:08:45'),
(2, 'DANIELA', 'RAMÍREZ PEÑA', 1, 1034567890, 3023456789, 'daniela.ramirez@gmail.com', 'Av 30 #15-09', '$2b$12$KIXpzCv6VxPqCQzO4QH3eO8yYjZqXVNZYbGcYX7tZQ0cZ6sJZy3MG', 1, NULL, '2026-09-10 18:08:45'),
(3, 'ANDRÉS', 'GONZÁLEZ MORA', 2, 1045678901, 3034567890, 'andres.gonzalez@gmail.com', 'Mz A Casa 10', '$2b$12$KIXpzCv6VxPqCQzO4QH3eO8yYjZqXVNZYbGcYX7tZQ0cZ6sJZy3MG', 1, NULL, '2026-09-10 18:08:45'),
(4, 'MARIANA', 'SUÁREZ LÓPEZ', 1, 1056789012, 3045678901, 'mariana.suarez@gmail.com', 'Cl 8B #20-45', '$2b$12$KIXpzCv6VxPqCQzO4QH3eO8yYjZqXVNZYbGcYX7tZQ0cZ6sJZy3MG', 1, NULL, '2026-09-10 18:08:45'),
(5, 'NATALIA', 'CASTRO JIMÉNEZ', 1, 1078901234, 3067890123, 'natalia.castro@gmail.com', 'Cl 19 #13-55', '$2b$12$KIXpzCv6VxPqCQzO4QH3eO8yYjZqXVNZYbGcYX7tZQ0cZ6sJZy3MG', 1, NULL, '2026-09-10 18:08:45'),
(6, 'FELIPE', 'MARTÍNEZ PÉREZ', 1, 1089012345, 3078901234, 'felipe.martinez@gmail.com', 'Av 68 #54-23', '$2b$12$KIXpzCv6VxPqCQzO4QH3eO8yYjZqXVNZYbGcYX7tZQ0cZ6sJZy3MG', 1, NULL, '2026-09-10 18:08:45'),
(7, 'CAMILA', 'ORTIZ SALAZAR', 2, 1090123456, 3089012345, 'camila.ortiz@gmail.com', 'Cl 100 #25-10', '$2b$12$KIXpzCv6VxPqCQzO4QH3eO8yYjZqXVNZYbGcYX7tZQ0cZ6sJZy3MG', 1, NULL, '2026-09-10 18:08:45'),
(8, 'SEBASTIÁN', 'LÓPEZ ROMERO', 1, 1101234567, 3090123456, 'sebastian.lopez@gmail.com', 'Cra 7 #89-12', '$2b$12$KIXpzCv6VxPqCQzO4QH3eO8yYjZqXVNZYbGcYX7tZQ0cZ6sJZy3MG', 1, NULL, '2026-09-10 18:08:45'),
(9, 'SOFÍA', 'RAMÍREZ ORTEGA', 1, 1112345678, 3101234567, 'sofia.ramirez@gmail.com', 'Cl 50 #12-34', '$2b$12$KIXpzCv6VxPqCQzO4QH3eO8yYjZqXVNZYbGcYX7tZQ0cZ6sJZy3MG', 1, NULL, '2026-09-10 18:08:45'),
(10, 'MATEO', 'GUTIÉRREZ PARDO', 2, 1123456789, 3112345678, 'mateo.gutierrez@gmail.com', 'Av 20 #45-67', '$2b$12$KIXpzCv6VxPqCQzO4QH3eO8yYjZqXVNZYbGcYX7tZQ0cZ6sJZy3MG', 1, NULL, '2026-09-10 18:08:45'),
(13, 'Prueba', 'Cliente', NULL, NULL, NULL, 'prueba.cliente@neodomus.com', 'Calle de prueba 123', '$2b$12$AB0J7/rVPURafgqC.qFJJOt8pYQoApul9Nbog74OA0.IfUZqsfZBy', 1, NULL, '2026-09-10 18:09:37'),
(14, 'Carolina', 'Mendez', NULL, NULL, NULL, 'cliente.demo@neodomus.com', 'Calle de prueba 123', '$2b$12$3LAsWQu4GDiHUmU7p7P/MeDH1zpX6STEJfRPuaf01jleUxIEmARYO', 1, NULL, '2026-09-10 18:09:37'),
(15, 'JULIAN', 'CARVAJAL', 2, 1021617845, 3216549877, 'juliancarvajal@gmail.com', 'calle 3 d este 34-54 sur', '$2b$12$OfGi8VoELF0bZyFT5DoPBOW/f6ac24062R3digkOCVQegGa7XbuIC', 1, NULL, '2026-09-10 19:09:21');

INSERT IGNORE INTO usuarios (id_usuario, first_name, last_name, id_tipo_documento_u, documento_usuario, telefono_usuario, email, password_hash, id_rol_u, is_active, created_at) VALUES
(1, 'CARLOS ANDRÉS', 'GÓMEZ RÍOS', 1, 1023456790, 3001234567, 'carlos.andres.gomez@gmail.com', '$2b$12$KIXpzCv6VxPqCQzO4QH3eO8yYjZqXVNZYbGcYX7tZQ0cZ6sJZy3MG', 2, 1, '2026-09-10 18:08:45'),
(2, 'JORGE DANIEL', 'CHARRY PÉREZ', 1, 1034567890, 3002345678, 'jorge.charry@gmail.com', '$2b$12$KIXpzCv6VxPqCQzO4QH3eO8yYjZqXVNZYbGcYX7tZQ0cZ6sJZy3MG', 2, 1, '2026-09-10 18:08:45'),
(3, 'JUAN SEBASTIÁN', 'MORENO TORRES', 1, 1078901234, 3003456789, 'juan.moreno@gmail.com', '$2b$12$KIXpzCv6VxPqCQzO4QH3eO8yYjZqXVNZYbGcYX7tZQ0cZ6sJZy3MG', 2, 1, '2026-09-10 18:08:45'),
(4, 'LUIS EDUARDO', 'MARTÍNEZ GAITÁN', 1, 1090123456, 3004567890, 'luis.martinez@gmail.com', '$2b$12$KIXpzCv6VxPqCQzO4QH3eO8yYjZqXVNZYbGcYX7tZQ0cZ6sJZy3MG', 1, 1, '2026-09-10 18:08:45'),
(5, 'ANDRÉS MAURICIO', 'LÓPEZ VARGAS', 1, 1056789012, 3005678901, 'andres.lopez@gmail.com', '$2b$12$KIXpzCv6VxPqCQzO4QH3eO8yYjZqXVNZYbGcYX7tZQ0cZ6sJZy3MG', 2, 1, '2026-09-10 18:08:45'),
(6, 'CAMILA ANDREA', 'RODRÍGUEZ PEÑA', 1, 1089012345, 3006789012, 'camila.rodriguez@gmail.com', '$2b$12$KIXpzCv6VxPqCQzO4QH3eO8yYjZqXVNZYbGcYX7tZQ0cZ6sJZy3MG', 1, 1, '2026-09-10 18:08:45'),
(7, 'NICOL ALEJANDRA', 'MARIÑO ROMERO', 1, 1045678901, 3007890123, 'nicolmarinoromero@gmail.com', '$2b$12$KIXpzCv6VxPqCQzO4QH3eO8yYjZqXVNZYbGcYX7tZQ0cZ6sJZy3MG', 1, 1, '2026-09-10 18:08:45'),
(8, 'LAURA MARCELA', 'PÉREZ DUARTE', 2, 1009876543, 3008901234, 'nicolmarino09@gmail.com', '$2b$12$KIXpzCv6VxPqCQzO4QH3eO8yYjZqXVNZYbGcYX7tZQ0cZ6sJZy3MG', 2, 1, '2026-09-10 18:08:45'),
(9, 'JULIÁN FELIPE', 'CARVAJAL CABALLERO', 2, 1012345678, 3009012345, 'julian.carvajal@gmail.com', '$2b$12$KIXpzCv6VxPqCQzO4QH3eO8yYjZqXVNZYbGcYX7tZQ0cZ6sJZy3MG', 2, 1, '2026-09-10 18:08:45'),
(10, 'MARÍA FERNANDA', 'RINCÓN SALAZAR', 2, 1067890123, 3010123456, 'maria.rincon@gmail.com', '$2b$12$KIXpzCv6VxPqCQzO4QH3eO8yYjZqXVNZYbGcYX7tZQ0cZ6sJZy3MG', 2, 1, '2026-09-10 18:08:45'),
(13, 'Admin', 'Neodomus', NULL, NULL, NULL, 'admin@neodomus.com', '$2b$12$N09BMCCwEJUENQE4SdXeWuXRZRu9JdJM6rUgFupl8JADJzyz3MNVi', 1, 1, '2026-09-10 18:09:37'),
(14, 'Tecnico', 'Prueba', NULL, NULL, NULL, 'tecnico@neodomus.com', '$2b$12$CblZx019G5XAXUEvPRcZ.exoG7WzcWGMpONbnt9aEDSmI7uYLBeH.', 2, 1, '2026-09-10 18:09:38');

INSERT IGNORE INTO tecnicos (id_tecnico, id_usuario_t, certificacion_t) VALUES
(1, 1, 'Certificación en Redes y Cableado Estructurado'),
(2, 2, 'Certificación en Instalación de Domótica'),
(3, 3, 'Certificación en Seguridad Electrónica'),
(4, 4, 'Certificación en Soporte de Sistemas IoT'),
(5, 5, 'Certificación en Programación de PLCs'),
(6, 6, 'Certificación en Bases de Datos y Servidores'),
(7, 7, 'Certificación en Automatización de Hogares'),
(8, 8, 'Automatización de hogares'),
(9, 9, 'Automatización de hogares'),
(10, 10, 'Automatización de hogares'),
(11, 14, 'Instalacion, mantenimiento, reparacion, revision, soporte');

