import { existsSync } from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

/**
 * Serves the built client (production). Unknown non-API paths get index.html so that client
 * routes such as /join/ABC123 work on direct access.
 */
export async function registerClient(app: FastifyInstance, distDir: string): Promise<void> {
  if (!existsSync(path.join(distDir, 'index.html'))) {
    throw new Error(`Built client not found in ${distDir}: run "npm run build" first.`);
  }
  const assetsDir = `${path.sep}assets${path.sep}`;
  await app.register(fastifyStatic, {
    root: distDir,
    setHeaders(reply, filePath) {
      // Vite fingerprints the files in assets/: they can be cached forever.
      reply.header(
        'Cache-Control',
        filePath.includes(assetsDir) ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
    },
  });
}
