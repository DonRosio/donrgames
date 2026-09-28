import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ack } from '@mini-jeux/shared';
import { next, startServer, stateMatching } from '../../test/helpers.ts';
import type { TestSocket } from '../../test/helpers.ts';

let server: Awaited<ReturnType<typeof startServer>>;

beforeEach(async () => {
  server = await startServer();
});

afterEach(async () => {
  await server.close();
});

function emit<T = null>(socket: TestSocket, event: string, payload: unknown): Promise<Ack<T>> {
  return new Promise((resolve) => {
    (socket as unknown as { emit: (...args: unknown[]) => void }).emit(event, payload, resolve);
  });
}

function connectError(socket: TestSocket): Promise<string> {
  return new Promise((resolve) => socket.once('connect_error', (error) => resolve(error.message)));
}

/** Creates a room with a connected host and `others` connected players. */
async function roomWith(...others: string[]) {
  const created = await server.createRoom('Léa');
  const host = server.connect(created.token);
  await next(host, 'room:state');
  const players = [];
  for (const nickname of others) {
    const joined = await server.joinRoom(created.code, nickname);
    const socket = server.connect(joined.token);
    const state = await next(socket, 'room:state');
    players.push({ socket, token: joined.token, id: state.me });
  }
  return { code: created.code, hostToken: created.token, host, players };
}

describe('realtime', () => {
  it('sends the room state on connection, then to everyone on arrival', async () => {
    const created = await server.createRoom('Léa');
    const host = server.connect(created.token);
    const first = await next(host, 'room:state');
    expect(first).toMatchObject({ code: created.code, status: 'lobby', maxPlayers: 10 });
    expect(first.players).toEqual([
      { id: first.me, nickname: 'Léa', connected: true, isHost: true, role: 'player' },
    ]);

    const tom = await server.joinRoom(created.code, 'Tom');
    const seenByHost = stateMatching(host, (room) =>
      room.players.some((p) => p.connected && p.nickname === 'Tom'),
    );
    const tomSocket = server.connect(tom.token);
    const seenByTom = await next(tomSocket, 'room:state');
    expect(seenByTom.me).not.toBe(first.me);
    expect((await seenByHost).players.map((p) => p.nickname)).toEqual(['Léa', 'Tom']);
  });

  it('rejects invalid tokens and foreign origins', async () => {
    const forged = server.connect('A'.repeat(43));
    expect(await connectError(forged)).toBe('SESSION_INVALID');

    const { token } = await server.createRoom('Léa');
    const foreign = server.connect(token, { origin: 'https://evil.example' });
    const message = await connectError(foreign);
    expect(message).not.toBe('');
    expect(foreign.connected).toBe(false);
  });

  it('answers clock pings with the server time', async () => {
    const { host } = await roomWith();
    const before = Date.now();
    const result = await emit<{ t0: number; server: number }>(host, 'clock:ping', { t0: 123 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.t0).toBe(123);
      expect(result.data.server).toBeGreaterThanOrEqual(before);
    }
  });

  it('validates every payload', async () => {
    const { host } = await roomWith('Tom');
    expect(await emit(host, 'room:kick', { playerId: '<script>' })).toEqual({
      ok: false,
      error: 'INVALID_PAYLOAD',
    });
    expect(await emit(host, 'room:kick', 'nope')).toEqual({ ok: false, error: 'INVALID_PAYLOAD' });
    expect(await emit(host, 'room:close', { force: true })).toEqual({
      ok: false,
      error: 'INVALID_PAYLOAD',
    });
  });

  it('reserves host actions to the host', async () => {
    const { host, players } = await roomWith('Tom');
    const tom = players[0]!;
    const hostState = await emit(tom.socket, 'room:close', {});
    expect(hostState).toEqual({ ok: false, error: 'NOT_HOST' });
    expect(host.connected).toBe(true);
  });

  it('kicks a player, who is told why and disconnected', async () => {
    const { host, players } = await roomWith('Tom');
    const tom = players[0]!;
    const ended = next(tom.socket, 'session:ended');
    const hostSeesOne = stateMatching(host, (room) => room.players.length === 1);
    expect(await emit(host, 'room:kick', { playerId: tom.id })).toEqual({ ok: true, data: null });
    expect(await ended).toEqual({ reason: 'kicked' });
    await hostSeesOne;
    // The kicked token is no longer valid.
    expect(await connectError(server.connect(tom.token))).toBe('SESSION_INVALID');
  });

  it('transfers the host role', async () => {
    const { host, players } = await roomWith('Tom');
    const tom = players[0]!;
    const tomSeesHost = stateMatching(tom.socket, (room) => room.hostId === tom.id);
    expect(await emit(host, 'room:transferHost', { playerId: tom.id })).toEqual({
      ok: true,
      data: null,
    });
    const room = await tomSeesHost;
    expect(room.players.find((p) => p.id === tom.id)?.isHost).toBe(true);
  });

  it('lets a player leave: acknowledged, then disconnected', async () => {
    const { host, players } = await roomWith('Tom');
    const tom = players[0]!;
    const disconnected = new Promise((resolve) => tom.socket.once('disconnect', resolve));
    const hostSeesOne = stateMatching(host, (room) => room.players.length === 1);
    expect(await emit(tom.socket, 'room:leave', {})).toEqual({ ok: true, data: null });
    await disconnected;
    await hostSeesOne;
  });

  it('closes the room for everyone', async () => {
    const { host, players } = await roomWith('Tom');
    const tomEnded = next(players[0]!.socket, 'session:ended');
    const hostEnded = next(host, 'session:ended');
    expect(await emit(host, 'room:close', {})).toEqual({ ok: true, data: null });
    expect(await tomEnded).toEqual({ reason: 'closed' });
    expect(await hostEnded).toEqual({ reason: 'closed' });
    expect(server.rooms.roomCount).toBe(0);
  });

  it('shows a disconnected player, then restores the session on reconnection', async () => {
    const { host, players } = await roomWith('Tom');
    const tom = players[0]!;
    const offline = stateMatching(host, (room) => room.players[1]?.connected === false);
    tom.socket.disconnect();
    await offline;

    const online = stateMatching(host, (room) => room.players[1]?.connected === true);
    const again = server.connect(tom.token);
    const state = await next(again, 'room:state');
    expect(state.me).toBe(tom.id);
    await online;
  });

  it('replaces the previous connection of the same session (duplicated tab)', async () => {
    const { host, hostToken } = await roomWith();
    const replaced = next(host, 'session:ended');
    const second = server.connect(hostToken);
    await next(second, 'room:state');
    expect(await replaced).toEqual({ reason: 'replaced' });
    expect(second.connected).toBe(true);
  });

  it('rate-limits message floods', async () => {
    const { host } = await roomWith();
    const results = await Promise.all(
      Array.from({ length: 30 }, () =>
        emit(host, 'room:transferHost', { playerId: 'A'.repeat(16) }),
      ),
    );
    expect(results.filter((r) => !r.ok && r.error === 'RATE_LIMITED').length).toBeGreaterThan(0);
  });
});
