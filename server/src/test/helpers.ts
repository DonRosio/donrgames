import { io as connect } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { ClientToServerEvents, RoomView, ServerToClientEvents } from '@mini-jeux/shared';
import { buildApp } from '../app.ts';
import type { AppOptions } from '../app.ts';
import { loadConfig } from '../config.ts';

export type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function testConfig(overrides: Record<string, string> = {}) {
  return loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ...overrides });
}

export async function startServer(options: Partial<AppOptions> = {}) {
  const built = await buildApp({ config: testConfig(), sweepIntervalMs: 0, ...options });
  await built.app.listen({ host: '127.0.0.1', port: 0 });
  const address = built.app.server.address();
  if (!address || typeof address === 'string') throw new Error('no address');
  const origin = `http://127.0.0.1:${address.port}`;
  const sockets: TestSocket[] = [];

  return {
    ...built,
    origin,
    async createRoom(nickname: string) {
      return post<{ code: string; token: string }>(origin, '/api/rooms', { nickname });
    },
    async joinRoom(code: string, nickname: string) {
      return post<{ code: string; token: string }>(origin, '/api/rooms/join', { code, nickname });
    },
    /** Connects a socket; resolves with its first room state. */
    connect(token: string, extra: { origin?: string } = {}): TestSocket {
      const socket: TestSocket = connect(origin, {
        path: '/socket.io',
        transports: ['websocket'],
        auth: { token },
        extraHeaders: { origin: extra.origin ?? origin },
        reconnection: false,
        forceNew: true,
      });
      sockets.push(socket);
      return socket;
    },
    async close() {
      for (const socket of sockets) socket.disconnect();
      await built.app.close();
    },
  };
}

async function post<T>(origin: string, path: string, body: unknown): Promise<T> {
  const response = await fetch(origin + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await response.json()) as T;
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(json)}`);
  return json;
}

/** Resolves with the next occurrence of `event`. */
export function next<E extends keyof ServerToClientEvents>(
  socket: TestSocket,
  event: E,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve) => {
    socket.once(event as 'room:state', ((payload: RoomView) => resolve(payload as never)) as never);
  });
}

/** Resolves with the first room state matching the predicate. */
export function stateMatching(socket: TestSocket, predicate: (room: RoomView) => boolean) {
  return new Promise<RoomView>((resolve) => {
    const listener = (room: RoomView) => {
      if (!predicate(room)) return;
      socket.off('room:state', listener);
      resolve(room);
    };
    socket.on('room:state', listener);
  });
}
