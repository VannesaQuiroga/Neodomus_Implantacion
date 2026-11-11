# Índice de evidencias — PEN-08 (auditoría)

Evidencias reales generadas en la auditoría integrada de esta sesión. El
análisis original de PEN-08 es `../analisis-implementacion.md` (del integrante).

| Archivo | Qué demuestra |
|---|---|
| `auditoria.md` | Verificación por pantalla (tarjeta/detalle/carrito/checkout), paridad de reglas y controles ejecutados. |
| `lint-movil-clasificado.txt` | Salida completa de `expo lint`: 86 hallazgos (27 errores/59 warnings) para clasificación. |
| `lint-archivos-pen08.txt` | Lint solo de los archivos PEN-08: 3 hallazgos, todos en líneas fuera del diff (preexistentes). |
| `bundle-movil-android.txt` | `expo export --platform android` OK: bundle Hermes 4,8 MB con los cambios PEN-08. |
| `vitest-frontend-108tests.txt` | Suite frontend 108/108 (incluye el asistente de devoluciones con metros). |
| `suites-pen09-10-e-integrada-36tests.txt` | 36 pruebas backend OK (PEN-09/10 + escenarios E1-E4 de integración, con compras por metros reales). |
| `regresion-suite-backend-291tests.txt` | Suite completa del backend: 291/291 OK, 15 skipped (MinIO opcional). |

Nota: la prueba visual del checkout en Expo Go está **bloqueada por entorno**
(sin adb/emulador/dispositivo); no se generó captura de pantalla ni se declara
aprobada. Referencia compartida: `../../auditoria-integrada.md`.
