import Fastify, { LogController } from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { Server } from 'socket.io';
import type { Config } from './config.ts';
import type { GameContract, GameInfo } from '@mini-jeux/shared';
import type { AnyGameDefinition } from './core/engine/types.ts';
import type { GameRandom } from './core/engine/random.ts';
import type { Scheduler } from './core/engine/scheduler.ts';
import { validateRegistry } from './core/engine/validate.ts';
import { registerClient } from './core/http/client.ts';
import { loadContentLibrary } from './core/content/library.ts';
import type { ContentLibrary } from './core/content/library.ts';
import { registerErrorHandler } from './core/http/errors.ts';
import { registerMediaRoutes } from './core/http/media.routes.ts';
import { registerRoomRoutes } from './core/http/rooms.routes.ts';
import { registerSecurity } from './core/http/security.ts';
import { createIpKeyer } from './core/lib/client-ip.ts';
import { cryptoRandom } from './core/lib/random.ts';
import type { RandomSource } from './core/lib/random.ts';
import { systemClock } from './core/lib/time.ts';
import type { Clock } from './core/lib/time.ts';
import { createRealtime } from './core/realtime/io.ts';
import { RoomManager } from './core/rooms/room-manager.ts';
import { games as registeredGames } from './games/registry.ts';

export interface AppOptions {
  config: Config;
  clock?: Clock;
  random?: RandomSource;
  games?: readonly AnyGameDefinition[];
  /** Game timers and randomness (replaced by manual / seeded versions in tests). */
  scheduler?: Scheduler;
  gameRandom?: GameRandom;
  /** Content libraries by game id (tests); read from CONTENT_DIR otherwise. */
  content?: ReadonlyMap<string, ContentLibrary>;
  /** Maintenance period (room expiry, limiters). 0 disables the timer (tests call sweep()). */
  sweepIntervalMs?: number;
  /** Serve the built client. Defaults to production only (Vite serves it in development). */
  serveClient?: boolean;
}

export interface App {
  app: FastifyInstance;
  io: Server;
  rooms: RoomManager;
  sweep(): void;
}

export async function buildApp(options: AppOptions): Promise<App> {
  const { config } = options;
  const clock = options.clock ?? systemClock;
  const games = options.games ?? registeredGames;
  validateRegistry(games);

  const app = Fastify({
    logger: { level: config.logLevel },
    // One line per request is logged below, without IP, headers, query string or body.
    logController: new LogController({ disableRequestLogging: true }),
    // Only the direct peer (our reverse proxy) is trusted: request.ip is the last X-Forwarded-For
    // entry, the one the proxy added, never a value the client wrote itself.
    trustProxy: config.trustProxy ? (_address: string, hop: number) => hop === 0 : false,
    bodyLimit: 32 * 1024,
  });

  app.addHook('onResponse', async (request, reply) => {
    request.log.info(
      {
        method: request.method,
        route: request.routeOptions.url ?? 'unmatched',
        status: reply.statusCode,
        ms: Math.round(reply.elapsedTime),
      },
      'request',
    );
  });

  await registerSecurity(app, config);
  registerErrorHandler(app);

  // Content of the non-replayable games: invalid lines are reported, not fatal.
  const content = new Map<string, ContentLibrary>();
  for (const game of games) {
    if (!game.content) continue;
    const id = (game.contract as GameContract).meta.id;
    const library =
      options.content?.get(id) ??
      loadContentLibrary(config.contentDir, id, game.content === 'text' ? 'text' : 'video');
    for (const problem of library.problems) app.log.warn({ game: id }, `content: ${problem}`);
    app.log.info({ game: id, items: library.items.length }, 'content loaded');
    content.set(id, library);
  }

  const rooms = new RoomManager({
    clock,
    random: options.random ?? cryptoRandom,
    limits: config.limits,
    games,
    content,
    ...(options.scheduler ? { scheduler: options.scheduler } : {}),
    ...(options.gameRandom ? { gameRandom: options.gameRandom } : {}),
  });
  const ipKey = createIpKeyer();

  app.get('/api/health', async () => ({ ok: true }));
  const catalog: GameInfo[] = games.map((game) => {
    const { meta, settings } = game.contract as GameContract;
    return { meta, settings };
  });
  app.get('/api/games', async () => catalog);
  const roomRoutes = registerRoomRoutes(app, { rooms, clock, ipKey });
  const mediaRoutes = registerMediaRoutes(app, { rooms, clock });

  const serveClient = options.serveClient ?? config.env === 'production';
  if (serveClient) await registerClient(app, config.clientDistDir);

  app.setNotFoundHandler((request, reply) => {
    const isPage = serveClient && request.method === 'GET' && !request.url.startsWith('/api/');
    if (isPage) return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    return reply.code(404).send({ error: 'NOT_FOUND' });
  });

  const io = createRealtime({
    server: app.server,
    rooms,
    clock,
    ipKey,
    publicOrigin: config.publicOrigin,
    trustProxy: config.trustProxy,
    logger: app.log,
  });

  const sweep = () => {
    rooms.sweep();
    rooms.media.sweep();
    roomRoutes.sweep();
    mediaRoutes.sweep();
  };
  const sweepIntervalMs = options.sweepIntervalMs ?? 1000;
  const timer = sweepIntervalMs > 0 ? setInterval(sweep, sweepIntervalMs) : null;
  timer?.unref();

  // Sockets are closed before Fastify stops its HTTP server (io.close() would close it too).
  app.addHook('preClose', async () => {
    if (timer) clearInterval(timer);
    io.disconnectSockets(true);
    io.engine.close();
  });

  return { app, io, rooms, sweep };
}
