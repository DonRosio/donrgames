import { readFileSync } from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// DEV_LAN=1 (npm run dev:lan): HTTPS with a self-signed certificate, reachable from the local
// network. Browsers only allow the microphone on HTTPS pages (or localhost).
const lan = process.env.DEV_LAN === '1';
const certDir = path.resolve(import.meta.dirname, '../.certs');

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    host: lan ? true : 'localhost',
    https: lan
      ? {
          key: readFileSync(path.join(certDir, 'dev-key.pem')),
          cert: readFileSync(path.join(certDir, 'dev-cert.pem')),
        }
      : undefined,
    // The Node server stays on localhost; Vite forwards API and WebSocket traffic, keeping the
    // Host header so that the server's origin check accepts the page's origin.
    proxy: {
      '/api': { target: 'http://127.0.0.1:3000' },
      '/socket.io': { target: 'ws://127.0.0.1:3000', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
