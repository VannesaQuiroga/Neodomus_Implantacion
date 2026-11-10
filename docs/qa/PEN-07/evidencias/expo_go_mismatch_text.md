# Evidencia PEN-07 (DEF-003) — Texto real de la ErrorActivity de Expo Go 54.0.8

Fuente: `adb shell uiautomator dump` sobre el emulador Pixel_6 (Android 17),
2026-11-10, tras abrir el proyecto SDK 57 con Expo Go 54.0.8.
Captura PNG relacionada: `ev01_error_expo_go.png`.

Nodos de texto extraídos del XML (transcripción exacta):

```text
"Project is incompatible with this version of Expo Go"
"This project requires a newer version of Expo Go.&#10;&#10;How to fix this error&#10;Download the latest version of Expo Go from the Play Store."
"View error log"
```

Versión instalada antes de la corrección:

```text
$ adb shell dumpsys package host.exp.exponent | grep versionName
    versionCode=416 minSdk=24 targetSdk=36
    versionName=54.0.8
```

Resolución aplicada (fuente oficial: página expo.dev/go, entrada SDK 57):

```text
androidClientUrl: https://github.com/expo/expo-go-releases/releases/download/Expo-Go-57.0.9/Expo-Go-57.0.9.apk
androidClientVersion: 57.0.9
Descarga: curl → HTTP 200, 208.916.626 bytes
Instalación: adb install -r -d → "Success"
Post-instalación: versionName=57.0.9  → el proyecto cargó (ver metro_bundled_ok.txt)
```
