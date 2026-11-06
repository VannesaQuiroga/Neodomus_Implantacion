# Plan de Trabajo — Proyecto Neodomus

> **Nota de vigencia (30/10/2026):** este plan conserva un corte de seguimiento fechado 29/08/2026 y referencias/estados que no se volvieron a certificar en esta actualización. En particular, el manifiesto actual de `movil/package.json` declara Expo 57 y la API tiene migración `0060`. Trata las fechas, porcentajes, Jira, cobertura y estados como registro histórico hasta que el equipo los confirme. Consulta `docs/gestion/auditoria-documental.md`.

<!--
  ¿Qué? Documento que define fases, actividades, responsables y seguimiento del proyecto.
  ¿Para qué? Alinear la ejecución real (código, BD, despliegue) con la gestión en Jira y la evaluación ADSO.
  ¿Impacto? Sin plan, no hay trazabilidad entre requisitos, historias de usuario y entregables.
-->

> **Proyecto:** Neodomus — Plataforma de servicios domóticos (ADSO Sexto Trimestre)  
> **Repositorio:** Monorepo `be/` + `fe/` + `movil/` (ver `restricciones.md:72` RH-006)  
> **Gestión:** Jira (tablero, backlog, sprints) + este documento (evidencia documental)  
> **Entorno:** Docker Compose (`docker-compose.yml:1-115`) + Alembic migraciones (48)

---

## 1. Fases del Proyecto

| Fase | Periodo | Objetivo | Entregables | Estado |
|---|---|---|---|---|
| **1. Análisis y diseño** | Mayo 2026 | Requisitos RF/RNF, HU, restricciones, arquitectura, modelo BD | `docs/requisitos/RFs/*` (44), `RNs/*` (6), `HUs/*` (44), `restricciones.md`, `referencia-tecnica/architecture.md` | ✅ Completado |
| **2. Backend** | Jun-Jul 2026 | API FastAPI, auth JWT, productos, citas, pedidos, pagos simulador, técnicos, reportes | `be/app/routers/` 16 routers, `be/app/models/` 29 modelos, `be/alembic/versions/` 48 | ✅ Completado |
| **3. Frontend Web** | Jul-Ago 2026 | SPA React 18, auth multitab, catálogo, carrito, checkout, dashboards por rol | `fe/src/pages/` 56 pages, `fe/src/components/` 43, `fe/src/contexts/` 3 | ✅ Completado |
| **4. Móvil** | Ago 2026 | App Expo (visitante/cliente/técnico; este plan consignó SDK 54, el manifiesto actual declara 57), parity checkout/citas | `movil/app/(tabs)` 19, `movil/app/(tecnico)` 10, `movil/services/` 5 | 🟡 Parcial (admin 0%) |
| **5. Integración y calidad** | Ago 2026 | Docker, MinIO, pruebas, seguridad, auditoría | `docker-compose.yml`, `AUDITORIA_FINAL_NEODOMUS.md`, `be/app/tests/test_auth.py` | 🟡 Parcial (tests 0%) |
| **6. Presentación** | Sep 2026 | Documentación final, plan mejora, evidencias Jira | `docs/plan-trabajo.md` (este), `AUDITORIA_FINAL_NEODOMUS.md`, `docs/referencia-tecnica/database-schema.md` | 🔄 En curso |

---

## 2. Actividades y Tareas Principales

| ID | Actividad | Responsable | Prioridad | Estado | Evidencia |
|---|---|---|---|---|---|
| **A-01** | Modelado BD y migraciones Alembic | Backend | Alta | ✅ | `be/alembic/versions/0001_*.py`→`0047`, `scripts/init_db.sql` |
| **A-02** | Autenticación JWT + roles (cliente/tecnico/admin) | Backend/Frontend | Crítica | ✅ | `be/app/routers/auth.py:64`, `security.py:130`, `fe/src/contexts/AuthContext.tsx:63` |
| **A-03** | Catálogo productos (variantes, metros, visibilidad, MinIO) | Backend/Frontend | Alta | ✅ | `productos.py:429,771`, `ProductoCard.tsx` |
| **A-04** | Carrito + checkout + pagos simulador + factura PDF | Fullstack | Alta | ✅ | `pedidos.py:198`, `CartContext.tsx:64`, `pagos_service.py:23` |
| **A-05** | Citas (3h anticipación, lun-sáb 08-18, tarifas, horas disponibles) | Backend/Frontend | Alta | ✅ | `citas.py:533,660`, `CitasPage.tsx` |
| **A-06** | Dashboards por rol (admin reportes, técnico entregas/devoluciones) | Frontend | Alta | ✅ | `AdminReportes.tsx`, `TechnicianDashboard.tsx:141` |
| **A-07** | Móvil parity cliente/técnico | Móvil | Media | 🟡 | `movil/app/(tabs)/checkout.tsx:265`, `movil/app/(tecnico)/index.tsx:106` |
| **A-08** | Docker + MinIO + scheduler | DevOps | Alta | ✅ | `docker-compose.yml:76` minio, `be/app/main.py:13` scheduler |
| **A-09** | Pruebas automatizadas | Calidad | Alta | ❌ | `be/app/tests/test_auth.py:8` roto — ver Plan Mejora |
| **A-10** | Auditoría y documentación | Calidad | Alta | ✅ | `AUDITORIA_FINAL_NEODOMUS.md`, `docs/referencia-tecnica/database-schema.md` |

---

## 3. Relación con Jira

> **Jira está implementado** como herramienta oficial (criterio 12 checklist ADSO). Este plan **no reemplaza** Jira, lo complementa.

| Elemento Jira | Relación con este plan | Evidencia requerida |
|---|---|---|
| **Backlog** | RFs y HUs corresponden a issues `NEO-001..044` | Captura backlog `docs/jira/backlog.png` |
| **Sprints** | Fases 1-5 mapean a Sprints 1-5 | Burndown `docs/jira/sprint-*.png` |
| **Tareas** | A-01..A-10 son épicas; cada RF/HU es historia con subtareas | Export `jira-export.csv` |
| **Estados** | To Do / In Progress / Done → Estado columna Fase | Captura tablero Kanban |
| **Asignados** | Backend / Frontend / Móvil / DevOps | Captura asignación |

**Acción pendiente:** Adjuntar en `docs/jira/` capturas de tablero, backlog y reporte de avance (ver `AUDITORIA_FINAL_NEODOMUS.md:2` criterio 12 🔍).

---

## 4. Seguimiento y Entregables por Rol

| Rol | Entregables | Verificación |
|---|---|---|
| **Administrador** | Gestión productos/técnicos/clientes, reportes PDF, consultas | `fe/src/App.tsx:124-143` rutas admin, `reports.py:1143` `GET /pdf` |
| **Técnico** | Dashboard, citas, entregas, devoluciones, calificaciones, perfil dropdown | `TechnicianDashboard.tsx:141`, `TecnicoPerfil.tsx` dropdown especialidades |
| **Cliente** | Registro, catálogo, carrito metros, checkout, citas, perfil, favoritos | `ProductosPublicos.tsx:41`, `CartContext.tsx:64`, `CheckoutPage.tsx:296` |
| **Visitante** | Home, productos públicos, info, auth | `App.tsx:70-84` `MainLayout` público |

---

## 5. Cronograma Resumen (ADSO Sexto Trimestre)

```
Mayo      Junio     Julio     Agosto    Septiembre
|-----------|-----------|-----------|-----------|
 Análisis   Backend   Frontend  Móvil    Auditoría
 Diseño     API 16R   SPA 56P   Expo 19  + Presentación
 BD 48 mig  Auth      Dashboards Parity  Plan mejora
```

---

> **Nota:** Este plan refleja el desarrollo real auditado el 29/08/2026. No inventa fases ni reasigna responsables. Para detalle por requisito ver `docs/requisitos/RFs/*` y por historia `docs/requisitos/HUs/*` (trazabilidad RF↔HU en cada `HU-*.md:18` `RF asociados`).
