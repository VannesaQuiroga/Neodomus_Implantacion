# RNF-006 — Compatibilidad y Portabilidad

<!--
  ¿Qué? Requisito no funcional que define los navegadores y entornos soportados.
  ¿Para qué? Garantizar que el sistema funcione correctamente en los entornos objetivo.
  ¿Impacto? Si no se define compatibilidad, podrían surgir errores inesperados en ciertos navegadores.
-->

---

## Identificación

| Campo             | Valor                                                  |
| ----------------- | ------------------------------------------------------ |
| **ID**            | RNF-006                                                |
| **Nombre**        | Compatibilidad y Portabilidad                          |
| **Categoría**     | Compatibilidad                                         |
| **Prioridad**     | Media                                                  |
| **Estado**        | Implementado                                           |

---

## Requisitos

### RNF-006.1 — Navegadores soportados
La aplicación frontend debe funcionar correctamente en las últimas dos versiones estables de:
- Google Chrome
- Mozilla Firefox
- Microsoft Edge
- Safari

### RNF-006.2 — Resoluciones de pantalla
La interfaz debe ser funcional desde **320px** de ancho (móviles pequeños) hasta **2560px** (monitores ultrawide).

### RNF-006.3 — Sistema operativo del servidor
El backend debe ejecutarse correctamente en sistemas Linux (entorno de desarrollo y producción).

### RNF-006.4 — Containerización
La base de datos debe ejecutarse en contenedores Docker para garantizar reproducibilidad del entorno de desarrollo.

### RNF-006.5 — Versiones mínimas de runtime
- **Python**: 3.12+ (`be/.python-version:1` `3.12`, `be/Dockerfile:1` `python:3.12-slim`, `pyproject.toml:5` `>=3.10`)
- **Node.js**: 20 LTS+ (`fe` Vite 5.4 / `movil` Expo 57 (revisa Node compatible con el SDK actual))
- **MySQL**: 8.0+ (`docker-compose.yml:3` `mysql:8.0`, `docs/requisitos/restricciones.md:34` `RT-003`). **PostgreSQL no aplica** (corrección: doc históricamente decía PostgreSQL 17+ por error).
