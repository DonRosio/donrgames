// Production server for the end-to-end tests: built client, strict CSP, real origin check.
// Plays the shortest valid clip of content/dubbing, so that a game stays short.
import { buildApp } from '../../server/src/app.ts';
import { loadConfig } from '../../server/src/config.ts';
import { loadContentLibrary } from '../../server/src/core/content/library.ts';
import { E2E_ORIGIN, E2E_PORT } from './env.ts';

const config = loadConfig({
  NODE_ENV: 'production',
  HOST: '127.0.0.1',
  PORT: String(E2E_PORT),
  PUBLIC_ORIGIN: E2E_ORIGIN,
  CONTENT_DIR: process.env.CONTENT_DIR,
  LOG_LEVEL: 'warn',
});

const library = loadContentLibrary(config.contentDir, 'dubbing');
const [clip] = library.items.toSorted((a, b) => a.durationMs - b.durationMs);
if (!clip) {
  console.error(
    `Tests E2E : aucune vidéo valide dans ${config.contentDir}/dubbing (voir npm run content:check).`,
  );
  process.exit(1);
}

const { app } = await buildApp({
  config,
  content: new Map([['dubbing', { gameId: 'dubbing', items: [clip], problems: [] }]]),
});
await app.listen({ host: config.host, port: config.port });
console.log(`E2E : ${E2E_ORIGIN}, vidéo « ${clip.id} » (${(clip.durationMs / 1000).toFixed(1)} s)`);
