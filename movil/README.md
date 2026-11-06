# Aplicación móvil NeoDomus

Cliente móvil construido con Expo Router. Esta guía sustituye las instrucciones genéricas del starter de Expo.

## Configuración actual

El manifiesto `package.json` declara Expo 57.0.22, React Native 0.86.3, React 19.2.3 y Expo Router 57.0.21. El punto de entrada es `expo-router/entry`; las rutas están en `app/`.

## Preparación y ejecución

Instala las dependencias desde `movil/` usando pnpm y el lockfile `pnpm-lock.yaml`:

```sh
pnpm install
pnpm start
```

También están declarados `pnpm android`, `pnpm ios`, `pnpm web`, `pnpm lint` y `pnpm typecheck`. La disponibilidad de simuladores y plataforma depende del equipo local.

## URL de la API

Copia `.env.example` a `.env` y configura `EXPO_PUBLIC_API_URL` como host del backend sin `/api/v1`. Para Android Emulator se documenta `http://10.0.2.2:8000`; un teléfono físico necesita la IP LAN del equipo y permiso de red. `constants/api.ts` añade `/api/v1`.

Las variables `EXPO_PUBLIC_*` quedan incluidas en el bundle: nunca pongas secretos en ellas. Reinicia Expo después de cambiar configuración.

## Navegación

`app/_layout.tsx` monta proveedores de autenticación, carrito, favoritos, idioma y consentimiento de cookies. `(tabs)` aloja experiencia pública/cliente; `(tecnico)` es el área técnica, seleccionada según el rol. No se encontró una sección administrativa móvil.

Para uso de la aplicación, consulta el [manual de usuario del repositorio](../docs/manuales/usuario/MANUAL_DE_USUARIO.md). Para instalación completa, consulta [docs/setup/sin-docker.md](../docs/setup/sin-docker.md) o la [guía Docker](../docs/setup/con-docker.md).
