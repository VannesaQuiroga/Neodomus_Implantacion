"""domotizar proveedores de demostración

Migración de corrección de datos (idempotente y conservadora):

Los proveedores de demostración sembrados por la migración 0001 (y por
``scripts/init_db.sql``) eran datos heredados de una plantilla deportiva
(«Deportes Elite S.A.», «GymPro Distribuciones», etc.), incoherentes con el
giro comercial de NeoDomus (domótica) y con los productos ya sembrados
(sensores, cámaras, iluminación, automatización).

Esta migración:

- Renombra los 10 proveedores de demostración por proveedores del sector
  domótico, marcados claramente como datos de prueba («Proveedor Demo NN -
  Especialidad»), conservando su ``id_proveedor`` para no romper claves
  foráneas ni perder relaciones con productos.
- Reasigna el proveedor de los productos sembrados para que cada producto
  pertenezca a un proveedor coherente con su categoría comercial.

Garantías:

- Solo toca filas cuyo ``nombre_proveedor`` coincide con el sembrado
  original: los proveedores ya editados por administradores no se alteran.
- Solo reasigna productos cuya referencia coincide con el sembrado y cuyo
  ``id_proveedor_pr`` aún apunta al proveedor original.
- No elimina registros: las filas de demostración solo cambian sus datos
  de identificación y contacto, y el downgrade las restaura.

Revision ID: 0064
Revises: 0063
Create Date: 2026-11-11
"""
from alembic import op
import sqlalchemy as sa


revision = "0064"
down_revision = "0063"
branch_labels = None
depends_on = None


# Estado original sembrado por 0001 / scripts/init_db.sql. Se conserva para
# poder restaurarlo en downgrade; no se usa en upgrade.
_PROVEEDORES_ORIGINALES = {
    1: ("Deportes Elite S.A.", "Carlos Ramírez", "3104567890",
        "contacto@deporteselite.com", "Cra 45 #12-34, Bogotá"),
    2: ("SportLine Distribuciones", "María Gómez", "3159876543",
        "ventas@sportline.com", "Av. Las Américas #23-45, Medellín"),
    3: ("TodoFitness Ltda.", "Andrés López", "3006543210",
        "info@todofitness.com", "Calle 50 #67-12, Cali"),
    4: ("Proveedora Olímpica", "Laura Torres", "3123456789",
        "ltorres@proveedoraolimpica.com", "Carrera 9 #80-22, Barranquilla"),
    5: ("Suministros Deportivos SAS", "Jorge Martínez", "3012233445",
        "jorge@suministrosdeportivos.com", "Calle 100 #15-40, Bogotá"),
    6: ("Equipos ProGym", "Diana Herrera", "3209988776",
        "dherrera@progym.com", "Av. 30 de Agosto #45-67, Pereira"),
    7: ("Distribuciones RunningPro", "Luis Castillo", "3167788990",
        "ventas@runningpro.com", "Calle 10 #25-30, Bucaramanga"),
    8: ("Balones y Redes S.A.", "Paola Rincón", "3184455667",
        "paola@balonesyredes.com", "Cra 21 #45-10, Cartagena"),
    9: ("FitEquipos SAS", "Andrés Peña", "3178899001",
        "andres@fitequipos.com", "Cl 45 #23-10, Manizales"),
    10: ("GymPro Distribuciones", "Carolina Ríos", "3164455667",
         "carolina@gympro.com", "Cra 15 #30-20, Ibagué"),
}

# id_proveedor -> datos domóticos de demostración (claramente marcados como
# datos de prueba: nombre con prefijo «Demo» y correo @example.com).
_DEMO_DOMOTICA = {
    1: ("Proveedor Demo 01 - Sensores Inteligentes", "Ana Martínez", "3101110101",
        "proveedor.demo01@example.com", "Cra 13 #45-12, Bogotá"),
    2: ("Proveedor Demo 02 - Cámaras y Seguridad", "Carlos Gómez", "3122220202",
        "proveedor.demo02@example.com", "Calle 100 #19-55, Bogotá"),
    3: ("Proveedor Demo 03 - Iluminación Inteligente", "Laura Restrepo", "3153330303",
        "proveedor.demo03@example.com", "Av. El Poblado #10-30, Medellín"),
    4: ("Proveedor Demo 04 - Cerraduras y Acceso", "Diego Salas", "3184440404",
        "proveedor.demo04@example.com", "Cra 43A #6-50, Medellín"),
    5: ("Proveedor Demo 05 - Enchufes y Control", "Paula Vélez", "3015550505",
        "proveedor.demo05@example.com", "Av. 3N #34-67, Cali"),
    6: ("Proveedor Demo 06 - Automatización Residencial", "Jorge Duarte", "3146660606",
        "proveedor.demo06@example.com", "Calle 50 #45-10, Medellín"),
    7: ("Proveedor Demo 07 - Climatización Inteligente", "Mariana Ortiz", "3177770707",
        "proveedor.demo07@example.com", "Cra 9 #80-22, Barranquilla"),
    8: ("Proveedor Demo 08 - Conectividad y Redes", "Andrés Cárdenas", "3028880808",
        "proveedor.demo08@example.com", "Calle 36 #33-40, Bucaramanga"),
    9: ("Proveedor Demo 09 - Paneles de Control", "Valeria Pardo", "3169990909",
        "proveedor.demo09@example.com", "Cra 1 #8-12, Cartagena"),
    10: ("Proveedor Demo 10 - Energía y Respaldos", "Camilo Rueda", "3191110101",
         "proveedor.demo10@example.com", "Av. Circunvalar #15-20, Pereira"),
}

# (referencia_producto, proveedor original, proveedor domótico coherente).
# Solo se reasignan los productos cuyo proveedor aún es el sembrado original.
_PRODUCTOS = [
    ("smi-001", 1, 1),     # sensor de movimiento PIR      -> sensores
    ("spd-006", 2, 1),     # sensor de puerta/ventana      -> sensores
    ("dhu-404", 4, 1),     # detector de humo              -> sensores
    ("cip-003", 3, 2),     # cámara IP 1080p               -> cámaras y seguridad
    ("sir-303", 2, 2),     # sirena inalámbrica            -> cámaras y seguridad
    ("led-003", 1, 3),     # cinta LED RGB                 -> iluminación
    ("int-202", 3, 3),     # interruptor táctil WiFi       -> iluminación
    ("eiw-007", 3, 5),     # enchufe inteligente WiFi      -> enchufes y control
    ("kit-001", 6, 6),     # kit de automatización básica  -> automatización
    ("ccd-004", 3, 6),     # controlador central domótico  -> automatización
    ("ter-101", 2, 7),     # termostato inteligente        -> climatización
    ("per-505", 5, 7),     # persiana motorizada           -> climatización
    ("utp6-050", 5, 8),    # cable UTP Cat6                -> conectividad y redes
    ("pan-606", 6, 9),     # panel táctil central          -> paneles de control
    ("ps12-5a", 4, 10),    # fuente de poder 12V 5A        -> energía y respaldos
    ("bat18650", 8, 10),   # batería recargable 18650      -> energía y respaldos
]


def _correo_seguro(bind, correo: str, id_proveedor: int) -> str:
    """Devuelve el correo objetivo o un equivalente de prueba si ya está tomado.

    El dominio ``example.com`` está reservado para documentación y pruebas,
    por lo que el fallback conserva el marcado de dato de demostración.
    """
    ocupado = bind.execute(
        sa.text(
            "SELECT id_proveedor FROM proveedores "
            "WHERE correo_proveedor = :correo AND id_proveedor <> :id"
        ),
        {"correo": correo, "id": id_proveedor},
    ).scalar()
    if not ocupado:
        return correo
    base, _, dominio = correo.partition("@")
    return f"{base}.alt{id_proveedor}@{dominio}"


def _actualizar_proveedor(bind, id_proveedor: int, nombre_actual: str, datos: tuple) -> None:
    """Actualiza un proveedor de demostración conservando su id.

    Solo aplica si el nombre actual coincide con ``nombre_actual``, de modo
    que los proveedores ya editados por los administradores no se
    sobrescriban ni en upgrade ni en downgrade.
    """
    nombre, contacto, telefono, correo, direccion = datos
    correo_final = _correo_seguro(bind, correo, id_proveedor)
    bind.execute(
        sa.text(
            "UPDATE proveedores "
            "SET nombre_proveedor = :nombre, contacto_proveedor = :contacto, "
            "    telefono_proveedor = :telefono, correo_proveedor = :correo, "
            "    direccion_proveedor = :direccion "
            "WHERE id_proveedor = :id AND nombre_proveedor = :nombre_actual"
        ),
        {
            "nombre": nombre,
            "contacto": contacto,
            "telefono": telefono,
            "correo": correo_final,
            "direccion": direccion,
            "id": id_proveedor,
            "nombre_actual": nombre_actual,
        },
    )


def _reasignar_productos(bind, hacia_domotico: bool) -> None:
    """Vincula los productos sembrados al proveedor coherente con su categoría.

    Con ``hacia_domotico=False`` restaura la asignación original (downgrade).
    """
    for referencia, proveedor_original, proveedor_domotico in _PRODUCTOS:
        destino = proveedor_domotico if hacia_domotico else proveedor_original
        origen = proveedor_original if hacia_domotico else proveedor_domotico
        if destino == origen:
            continue
        bind.execute(
            sa.text(
                "UPDATE productos SET id_proveedor_pr = :destino "
                "WHERE referencia_producto = :ref AND id_proveedor_pr = :origen"
            ),
            {"destino": destino, "ref": referencia, "origen": origen},
        )


def upgrade() -> None:
    bind = op.get_bind()
    for id_proveedor in _DEMO_DOMOTICA:
        _actualizar_proveedor(
            bind, id_proveedor, _PROVEEDORES_ORIGINALES[id_proveedor][0], _DEMO_DOMOTICA[id_proveedor]
        )
    _reasignar_productos(bind, hacia_domotico=True)


def downgrade() -> None:
    # Devuelve los datos de demostración a su estado original (sembrado de 0001).
    bind = op.get_bind()
    _reasignar_productos(bind, hacia_domotico=False)
    for id_proveedor, datos_originales in _PROVEEDORES_ORIGINALES.items():
        _actualizar_proveedor(
            bind, id_proveedor, _DEMO_DOMOTICA[id_proveedor][0], datos_originales
        )
