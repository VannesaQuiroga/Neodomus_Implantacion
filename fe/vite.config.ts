import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@components': path.resolve(__dirname, 'src/components'),
      '@contexts': path.resolve(__dirname, 'src/contexts'),
      '@assets': path.resolve(__dirname, 'src/assets'),
      '@styles': path.resolve(__dirname, 'src/styles'),
      '@pages': path.resolve(__dirname, 'src/pages'),
      '@services': path.resolve(__dirname, 'src/services'),
      '@types': path.resolve(__dirname, 'src/types'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@i18n': path.resolve(__dirname, 'src/i18n'),
    },
  },
  server: {
    port: 5173,
    host: true,
    open: false,
    // Que: autoriza el host que publica Caddy en local.
    // Para que: evitar el 403 de Vite por Host no permitido al abrir app.neodomus.local.
    allowedHosts: ['app.neodomus.local'],
    // Evita que el navegador bloquee window.postMessage del botón de
    // Google Identity Services (advertencia Cross-Origin-Opener-Policy).
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
    watch: {
      usePolling: true,
      interval: 100,
    },
  },
});