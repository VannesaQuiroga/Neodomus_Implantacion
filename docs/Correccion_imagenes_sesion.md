# Evidencias privadas y cambios de sesión

Fecha: 2026-10-18.

## Defecto reproducido

El hook useAuthImage incrementaba la generación al recibir
`neodomus:sesion-expirada`, provocando otra descarga. Si el transporte volvía
a emitir ese evento tras un rechazo definitivo, podía producir más intentos.
Además, el logout explícito y los inicios de sesión no emitían los eventos
necesarios para invalidar una imagen cuyo src permaneciera igual.

Antes de corregir, tres escenarios fallaron por encontrar dos solicitudes
cuando se esperaba una. No se relajaron esas expectativas.

## Cambios

- useAuthImage suspende descargas al invalidarse la sesión y retira la imagen.
- Una generación síncrona descarta resultados de descargas de una sesión anterior.
- Una nueva sesión permite descargar de nuevo, incluso si el src no cambió.
- AuthProvider emite sesión iniciada después de guardar las credenciales de
  login normal o Google; logout emite sesión expirada después de limpiar la
  sesión local.
- Vitest descubre únicamente `src/**/*.test.{ts,tsx}`; los recorridos e2e
  pertenecen a Playwright.

## Resultados reales

- Suite web: **20 pruebas aprobadas, cuatro archivos**.
  - Hook de evidencias: 7.
  - AuthProvider real con hook real, transporte simulado: 2.
  - CartContext: 5.
  - Utilidades de metros: 6.
- TypeScript web: **exit 0**, después de estos cambios.
- Comprobación de espacios del diff en los archivos modificados: sin errores.

Comandos desde fe:

```powershell
node node_modules/vitest/vitest.mjs run --pool=threads --maxWorkers=1 --minWorkers=1
node node_modules/typescript/bin/tsc --noEmit
```

## Entorno y límites

Se restauraron paquetes locales incompletos desde el registro oficial y se
compararon sus SHA-512 con los locks existentes. No se actualizaron versiones
de los manifiestos para hacer pasar TypeScript. Los locks npm y pnpm fijan
versiones diferentes de React Router: queda pendiente unificar el gestor y
verificar una instalación limpia. La restauración local no demuestra todavía
esa instalación reproducible completa.

La prueba de navegador sigue pendiente: Chromium no arranca en el entorno y
la pestaña del navegador integrado agotó el tiempo de conexión. No se presenta
como E2E aprobado.

Tras encender MySQL se pudo iniciar el servidor aislado, pero en una ejecución
posterior el puerto 3307 volvió a quedar sin respuesta. El nuevo intento de
las ocho pruebas HTTP se interrumpió por errores de infraestructura; no es una
ejecución aprobada ni sustituye los resultados históricos.

No se pudo confirmar el cierre del runner interactivo anterior: la herramienta
rechazó enviar Enter a esa sesión por política de aprobación. Su fixture era
cliente e2e.session.7354c04887344f45ac83cd6d69141780@example.test y producto 148
en neodomus_test_t01; su web usó el puerto 65481. Comprobar proceso y limpieza
al recuperar el entorno. No afirmar que ya se eliminaron esos fixtures.

No se cambió móvil, no se hicieron migraciones, commit, push ni despliegue.
