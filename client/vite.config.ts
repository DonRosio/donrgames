import { readFileSync } from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

// DEV_LAN=1 (npm run dev:lan): HTTPS with a self-signed certificate, reachable from the local
// network. Browsers only allow the microphone on HTTPS pages (or localhost).
const lan = process.env.DEV_LAN === '1';
const certDir = path.resolve(import.meta.dirname, '../.certs');

// The WASM runtime of the background removal (@mediapipe/tasks-vision) is served by ourselves
// (CSP 'self', no CDN): taken from node_modules rather than committed (13 MB).
const wasmDir = path.resolve(import.meta.dirname, '../node_modules/@mediapipe/tasks-vision/wasm');
const wasmUrl = '/vendor/mediapipe/wasm';
const wasmFiles = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm'];

function mediapipeWasm(): Plugin {
  return {
    name: 'mediapipe-wasm',
    configureServer(server) {
      server.middlewares.use(wasmUrl, (request, response, next) => {
        const name = (request.url ?? '').split('?')[0]!.slice(1);
        if (!wasmFiles.includes(name)) return next();
        response.setHeader(
          'Content-Type',
          name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
        );
        response.end(readFileSync(path.join(wasmDir, name)));
      });
    },
    generateBundle() {
      for (const name of wasmFiles) {
        this.emitFile({
          type: 'asset',
          fileName: `${wasmUrl.slice(1)}/${name}`,
          source: readFileSync(path.join(wasmDir, name)),
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), mediapipeWasm()],
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
