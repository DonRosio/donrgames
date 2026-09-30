import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import type { FastifyBaseLogger } from 'fastify';
import type { z } from 'zod';
import { SOCKET_PATH } from '@mini-jeux/shared';
import type {
  Ack,
  ClientToServerEvents,
  ServerToClientEvents,
  SessionEndReason,
} from '@mini-jeux/shared';
import {
  clockPingSchema,
  emptyPayloadSchema,
  gameActionSchema,
  playerTargetSchema,
  setSettingsSchema,
  socketAuthSchema,
} from '@mini-jeux/shared/schemas';
import { GameRuleError } from '../engine/types.ts';
import { clientIpOf } from '../lib/client-ip.ts';
import { DomainError } from '../lib/errors.ts';
import { isAllowedOrigin } from '../lib/origin.ts';
import { TokenBucket } from '../lib/rate-limit.ts';
import type { Clock } from '../lib/time.ts';
import type { RoomManager, Session } from '../rooms/room-manager.ts';

interface SocketData {
  code: string;
  playerId: string;
  ipKey: string;
}

type IoServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;
type IoSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

/** Untyped view of a socket, used to register handlers that validate their own input. */
interface RawSocket {
  on(event: string, listener: (payload: unknown, ack: unknown) => void): void;
}

const MAX_CONNECTIONS_PER_IP = 30;
/** Rate-limited messages tolerated before the socket is dropped. */
const MAX_VIOLATIONS = 50;

export interface RealtimeDeps {
  server: HttpServer;
  rooms: RoomManager;
  clock: Clock;
  ipKey: (ip: string) => string;
  publicOrigin: string | null;
  trustProxy: boolean;
  logger: FastifyBaseLogger;
}

export function createRealtime(deps: RealtimeDeps): IoServer {
  const { rooms, clock, logger } = deps;

  const io: IoServer = new Server(deps.server, {
    path: SOCKET_PATH,
    // WebSocket only: every connection then carries an Origin header that can be checked.
    transports: ['websocket'],
    serveClient: false,
    maxHttpBufferSize: 16 * 1024,
    // Disconnections are detected within 20 s.
    pingInterval: 10_000,
    pingTimeout: 10_000,
    allowRequest: (request, callback) => {
      callback(
        null,
        isAllowedOrigin(request.headers.origin, request.headers.host, deps.publicOrigin),
      );
    },
  });

  const connectionsPerIp = new Map<string, number>();
  // Last game view sent to each socket (JSON, prefixed by the run id): only changes are sent.
  const lastGameView = new Map<string, string>();

  const endSocket = (socketId: string, reason: SessionEndReason) => {
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) return;
    socket.emit('session:ended', { reason });
    // Namespace disconnect: queued packets are delivered first and the client does not retry.
    // Deferred so that the acknowledgement of the handler being run (e.g. the host closing the
    // room) is queued before the disconnect.
    queueMicrotask(() => socket.disconnect());
  };

  rooms.setEvents({
    roomChanged(room) {
      for (const player of room.players.values()) {
        if (player.socketId) io.to(player.socketId).emit('room:state', rooms.view(room, player.id));
      }
    },
    gameUpdated(room) {
      for (const player of room.players.values()) {
        if (!player.socketId) continue;
        const envelope = rooms.gameView(room, player.id);
        if (!envelope) continue;
        const key = `${envelope.runId}:${JSON.stringify(envelope.view)}`;
        if (lastGameView.get(player.socketId) === key) continue;
        lastGameView.set(player.socketId, key);
        io.to(player.socketId).emit('game:view', envelope);
      }
    },
    gameFailed(room, error) {
      logger.error({ room: room.id, err: error }, 'game handler failed');
    },
    playerRemoved(_room, player, reason) {
      if (!player.socketId) return;
      // A player who leaves receives an acknowledgement, then its socket is closed by the handler.
      if (reason === 'kicked') endSocket(player.socketId, 'kicked');
      if (reason === 'timeout') endSocket(player.socketId, 'expired');
    },
    roomClosed(room, reason) {
      logger.info({ room: room.id, reason }, 'room closed');
      for (const player of room.players.values()) {
        if (player.socketId) endSocket(player.socketId, reason === 'closed' ? 'closed' : 'expired');
      }
    },
  });

  io.use((socket, next) => {
    const ipKey = deps.ipKey(clientIpOf(socket.request, deps.trustProxy));
    if ((connectionsPerIp.get(ipKey) ?? 0) >= MAX_CONNECTIONS_PER_IP) {
      return next(new Error('RATE_LIMITED'));
    }
    const auth = socketAuthSchema.safeParse(socket.handshake.auth);
    const session = auth.success ? rooms.authenticate(auth.data.token) : null;
    if (!session) return next(new Error('SESSION_INVALID'));
    socket.data = { code: session.room.code, playerId: session.player.id, ipKey };
    next();
  });

  io.on('connection', (socket) => {
    const { ipKey } = socket.data;
    connectionsPerIp.set(ipKey, (connectionsPerIp.get(ipKey) ?? 0) + 1);
    const resolve = () => rooms.find(socket.data.code, socket.data.playerId);

    const session = resolve();
    if (!session) {
      socket.emit('session:ended', { reason: 'expired' });
      socket.disconnect();
      return;
    }
    logger.debug({ room: session.room.id }, 'socket connected');
    const replaced = rooms.attachSocket(session, socket.id);
    if (replaced) endSocket(replaced, 'replaced');

    limitRate(socket, clock);

    const handle = <T>(
      event: keyof ClientToServerEvents,
      schema: z.ZodType<T>,
      run: (session: Session, payload: T) => unknown,
    ) => {
      (socket as unknown as RawSocket).on(event, (payload, ack) => {
        const reply = (result: Ack<unknown>) => {
          if (typeof ack === 'function') ack(result);
        };
        const parsed = schema.safeParse(payload);
        if (!parsed.success) return reply({ ok: false, error: 'INVALID_PAYLOAD' });
        const current = resolve();
        if (!current) {
          reply({ ok: false, error: 'SESSION_INVALID' });
          socket.disconnect();
          return;
        }
        try {
          reply({ ok: true, data: run(current, parsed.data) ?? null });
        } catch (error) {
          if (error instanceof DomainError || error instanceof GameRuleError) {
            return reply({ ok: false, error: error.code });
          }
          logger.error({ err: error, event }, 'socket handler failed');
          reply({ ok: false, error: 'INTERNAL' });
        }
      });
    };

    handle('clock:ping', clockPingSchema, (_session, { t0 }) => ({ t0, server: clock.now() }));
    handle('room:kick', playerTargetSchema, (s, { playerId }) => rooms.kick(s, playerId));
    handle('room:transferHost', playerTargetSchema, (s, { playerId }) =>
      rooms.transferHost(s, playerId),
    );
    handle('room:close', emptyPayloadSchema, (s) => rooms.close(s));
    handle('room:setSettings', setSettingsSchema, (s, { settings }) =>
      rooms.setSettings(s, settings),
    );
    handle('room:startGame', emptyPayloadSchema, (s) => rooms.startGame(s));
    handle('game:action', gameActionSchema, (s, { type, payload }) =>
      rooms.gameAction(s, type, payload),
    );
    handle('game:skip', emptyPayloadSchema, (s) => rooms.skipPhase(s));
    handle('game:abort', emptyPayloadSchema, (s) => rooms.abortGame(s));
    handle('results:dismiss', emptyPayloadSchema, (s) => rooms.dismissResults(s));
    handle('room:leave', emptyPayloadSchema, (s) => {
      rooms.leave(s);
      // Runs after the acknowledgement is queued: the client receives it before the disconnect.
      queueMicrotask(() => socket.disconnect());
    });

    socket.on('disconnect', () => {
      lastGameView.delete(socket.id);
      const count = (connectionsPerIp.get(ipKey) ?? 1) - 1;
      if (count > 0) connectionsPerIp.set(ipKey, count);
      else connectionsPerIp.delete(ipKey);
      const current = resolve();
      if (current) rooms.detachSocket(current, socket.id);
      logger.debug('socket disconnected');
    });
  });

  return io;
}

/** Every incoming message costs a token; clock pings have their own budget. */
function limitRate(socket: IoSocket, clock: Clock): void {
  const messages = new TokenBucket({ capacity: 20, refillPerSecond: 10, clock });
  const pings = new TokenBucket({ capacity: 10, refillPerSecond: 2, clock });
  let violations = 0;
  socket.use((packet, next) => {
    const [event, ...args] = packet;
    const bucket = event === 'clock:ping' ? pings : messages;
    if (bucket.take()) return next();
    violations++;
    const ack = args.at(-1);
    if (typeof ack === 'function') ack({ ok: false, error: 'RATE_LIMITED' } satisfies Ack);
    if (violations > MAX_VIOLATIONS) socket.disconnect(true);
  });
}
