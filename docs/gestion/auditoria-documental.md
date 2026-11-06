# Auditoría documental de NeoDomus

**Fecha de revisión:** 30 de octubre de 2026  
**Alcance:** documentación Markdown y configuración/fuentes usadas para corregir las referencias centrales. Se revisaron inventario, README, guías de instalación, arquitectura, rutas principales, manifiestos, Compose, configuración, modelos/migraciones y navegación web/móvil. No se ejecutó la aplicación ni la suite de pruebas. No se hizo cotejo exhaustivo de cada criterio de las 88 historias/requisitos funcionales; se preservan como especificaciones, no como prueba de implementación.

## Inventario

Antes de esta actualización, `docs/` tenía 106 archivos distribuidos así:

| Área | Contenido |
|---|---|
| `docs/requisitos/RFs/` | 44 requisitos funcionales (`RF-001` a `RF-044`) |
| `docs/requisitos/HUs/` | 44 historias de usuario (`HU-001` a `HU-044`) |
| `docs/requisitos/RNs/` | 6 requisitos no funcionales |
| `docs/requisitos/` | Restricciones |
| `docs/referencia-tecnica/` | Arquitectura, endpoints API, esquema, diccionario y design system |
| `docs/setup/` | Instalación con/sin Docker |
| `docs/conceptos/` | Patrones, OWASP y accesibilidad |
| Raíz de `docs/` | Plan de trabajo |

También existen documentos de proyecto en la raíz: `DOCUMENTACION_PROYECTO.md`, `INFORME_FINAL_EVALUACION_NEODOMUS.md` y `INFORME_DISENO_NEODOMUS_CON_LOGO_SENA_Y_DICCIONARIO.docx`. Además existe una segunda área `fe/doc/requirements/` y `fe/doc/PLAN_TRABAJO.md`. Se conservan para no borrar evidencia ni mover documentación específica del frontend sin una decisión del equipo.

## Hallazgos principales

1. **Rutas de carpetas obsoletas.** Algunas guías apuntaban a `backend/`, `frontend/`, puertos 3000/8025 y scripts de arranque que no corresponden a la raíz actual. El layout observado es `be/`, `fe/`, `movil/` y `scripts/`.
2. **Stack móvil desactualizado en documentos.** `movil/package.json` declara Expo 57.0.22, React Native 0.86.3, React 19.2.3 y Expo Router 57.0.21. `movil/AGENTS.md`, algunos documentos y reportes anteriores mencionan Expo 54.
3. **Tecnología backend.** `be/pyproject.toml` declara Python `>=3.10`; `be/Dockerfile` usa Python 3.12. No se debe presentar Python 3.12 como requisito local estricto sin explicar esa diferencia.
4. **Referencias API antiguas.** La tabla anterior de endpoints incluía rutas como `/servicios`, `/pagos/iniciar` y `/tech/mis-tareas`, que no corresponden a los routers actuales. `be/app/main.py` monta 17 routers bajo `/api/v1`; la referencia se cambió a módulos y rutas representativas verificadas.
5. **URLs de producción no verificadas.** Algunos documentos afirmaban dominios públicos `app.neodomus.com` y `api.neodomus.com`; no hay evidencia de despliegue activo en la configuración revisada. Se retiraron como instrucciones de acceso.
6. **Esquema en evolución.** La secuencia visible llega a la revisión Alembic `0060`; el documento antiguo citaba 48 migraciones y cantidades/tipos anteriores. Se actualizó la referencia principal y se advirtió que el diccionario heredado requiere sincronización campo por campo.
7. **Requisitos no son implementación.** Los 44 RF y 44 HU se conservaron. Su existencia no demuestra que la función esté completa. La navegación incluye pantallas y roles, pero el estado de cada operación depende de los routers/servicios conectados.
8. **Pagos.** `PAYMENT_PROVIDER` tiene simulador por defecto y `be/app/services/pagos_service.py` describe respuestas simuladas. No debe afirmarse que exista procesamiento real de tarjeta/PSE/PayPal.
9. **Archivos MinIO.** `be/app/services/minio_service.py` fija lectura pública para los objetos del bucket. Es un comportamiento confirmado con implicaciones de privacidad que debe revisarse antes de guardar archivos sensibles.
10. **Material histórico y duplicado.** El plan de trabajo y el informe final contienen estados/fechas de agosto de 2026 y números/versiones ya desactualizados. Se añadió aviso histórico al plan. Los requisitos en `fe/doc/` se mantienen separados de `docs/requisitos/` para no asumir cuál colección es oficial.

## Estado funcional que puede afirmarse a partir de la estructura

| Área | Evidencia consultada | Estado documental |
|---|---|---|
| Autenticación | `be/app/routers/auth.py`, `fe/src/App.tsx`, `fe/src/contexts/AuthContext.tsx` | Endpoints y pantallas presentes; correo/OAuth dependen de configuración. No se ejecutó el flujo. |
| Catálogo/carrito/checkout | `be/app/routers/productos.py`, `be/app/routers/pedidos.py`, pantallas `fe/src/pages/public/` | Rutas/componentes y lógica de pedido presentes; pago predeterminado simulado. |
| Citas y trabajo técnico | Routers `citas.py`, `tecnicos.py`; rutas web y `movil/app/(tecnico)/` | Módulos presentes; no se certificó cada transición ni disponibilidad del servicio. |
| Administración | rutas del grupo administrador en `fe/src/App.tsx` y routers backend | Panel web con módulos registrados; no se halló área administrativa móvil equivalente. |
| BD y archivos | modelos, Alembic, `database.py`, `minio_service.py` | Configuración presente; no se conectó a una base de datos ni se inspeccionó un entorno productivo. |
| Pruebas | `be/app/tests/test_auth.py`, scripts de componentes | Existen archivos de prueba; no se ejecutaron y no se declara cobertura ni aprobación. |

## Cambios realizados

- Se simplificó el README de raíz para servir como punto de entrada y usar las rutas/tecnologías actuales.
- Se creó `docs/README.md` como índice navegable.
- Se crearon `MANUAL_DE_USUARIO.md` y `MANUAL_TECNICO.md` en la raíz.
- Se corrigieron las guías con/sin Docker y el README móvil.
- Se reescribieron arquitectura, referencia de API y resumen de esquema para eliminar rutas, hosts y versiones no verificadas.
- Se advirtió que el diccionario de datos requiere actualización completa contra modelos/migraciones.
- Se añadió advertencia de vigencia al plan de trabajo y se corrigieron algunas menciones explícitas a carpetas/Expo obsoletas.
- No se movieron ni eliminaron requisitos, historias, conceptos o informes históricos.

## Pendientes de información/equipo

- Definir URL de producción, navegadores soportados y requisitos mínimos del cliente.
- Definir canal, responsables, horarios y tiempos de soporte/ANS.
- Confirmar proveedores externos activos (correo, Google OAuth y pagos reales) por entorno.
- Decidir política de privacidad para objetos MinIO públicos.
- Sincronizar `docs/referencia-tecnica/diccionario-de-datos.md` columna por columna con modelos y migraciones hasta `0060`, idealmente contra una BD limpia creada desde migraciones.
- Determinar si `fe/doc/requirements/` es duplicado histórico o documentación que debe mantenerse, y alinear su relación con `docs/requisitos/`.
- Revisar afirmaciones y estados de `DOCUMENTACION_PROYECTO.md`, el informe de evaluación y el DOCX de diseño, que no se actualizaron en esta tarea.
- Obtener capturas reales de las pantallas si se requieren para entrega académica.

## Validación y límites

Se cotejaron las rutas y puertos de Compose, los nombres de servicios, las rutas registradas por FastAPI, las rutas de navegación, las versiones declaradas en manifiestos y las revisiones/modelos consultados. No se levantaron contenedores, no se ejecutaron pruebas automatizadas, no se validó un despliegue y no se verificó el render de diagramas en un visor Mermaid específico. El código de aplicación no se modificó.

