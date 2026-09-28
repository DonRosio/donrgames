import Fastify, { LogController } from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { Server } from 'socket.io';
import type { Config } from './config.ts';
import type { RegisteredGame } from './core/engine/types.ts';
import { registerClient } from './core/http/client.ts';
import { registerErrorHandler } from './core/http/errors.ts';
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
  games?: readonly RegisteredGame[];
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

  const app = Fastify({
    logger: { level: config.logLevel },
    // One line per request is logged below, without IP, headers, query string or body.
    logController: new LogController({ disableRequestLogging: true }),
    trustProxy: config.trustProxy,
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

  const rooms = new RoomManager({
    clock,
    random: options.random ?? cryptoRandom,
    limits: config.limits,
  });
  const ipKey = createIpKeyer();

  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/games', async () => games.map((game) => game.meta));
  const roomRoutes = registerRoomRoutes(app, { rooms, clock, ipKey });

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
    roomRoutes.sweep();
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
