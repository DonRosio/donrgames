import { beforeEach, describe, expect, it } from 'vitest';
import { DEADLINE_MS, fixtureGame } from '../engine/fixtures/fixture-game.ts';
import { seededRandom } from '../engine/random.ts';
import { ManualScheduler } from '../engine/scheduler.ts';
import { DomainError } from '../lib/errors.ts';
import type { RandomSource } from '../lib/random.ts';
import { DEFAULT_TIMINGS, RoomManager } from './room-manager.ts';
import type { Room, Session } from './room-manager.ts';

const SECOND = 1000;

function counterRandom(): RandomSource {
  let n = 0;
  return {
    token: () => `token-${++n}`,
    id: () => `id-${++n}`,
    string: (length) => String(++n).padStart(length, 'X'),
  };
}

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    if (error instanceof Error && 'code' in error) return String(error.code);
    throw error;
  }
  return undefined;
}

describe('games in a room', () => {
  let scheduler: ManualScheduler;
  let rooms: RoomManager;
  let updates: number;
  let host: Session;
  let bob: Session;

  beforeEach(() => {
    scheduler = new ManualScheduler(1_000_000);
    rooms = new RoomManager({
      clock: scheduler.clock,
      random: counterRandom(),
      limits: { maxRooms: 10, maxPlayersPerRoom: 10, timings: DEFAULT_TIMINGS },
      games: [fixtureGame],
      scheduler,
      gameRandom: seededRandom(1),
    });
    updates = 0;
    rooms.setEvents({
      roomChanged: () => {},
      gameUpdated: () => updates++,
      playerRemoved: () => {},
      roomClosed: () => {},
      gameFailed: (_room, error) => {
        throw error;
      },
    });
    host = rooms.createRoom({ nickname: 'Alice' });
    rooms.attachSocket(host, 's-alice');
    bob = rooms.joinRoom({ code: host.room.code, nickname: 'Bob' });
    rooms.attachSocket(bob, 's-bob');
  });

  const room = (): Room => host.room;
  const advance = (ms: number) => {
    scheduler.advance(ms);
    rooms.sweep();
  };
  const submitAll = (value = 50) => {
    rooms.gameAction(host, 'submit', { value });
    rooms.gameAction(bob, 'submit', { value: value - 1 });
  };

  it('preselects the first game with its default settings', () => {
    expect(rooms.view(room(), host.player.id)).toMatchObject({
      selectedGame: { id: 'fixture', settings: { rounds: 2, double: false, mode: 'high' } },
      games: [{ id: 'fixture', launchable: true, reason: null }],
    });
  });

  it('plays the game chosen when the room was created, for good', () => {
    expect(errorCode(() => rooms.createRoom({ nickname: 'Zoé', gameId: 'nope' }))).toBe(
      'GAME_NOT_FOUND',
    );
    const chosen = rooms.createRoom({ nickname: 'Zoé', gameId: 'fixture' });
    expect(chosen.room.selectedGame).toBe('fixture');
    expect(rooms.createRoom({ nickname: 'Tom' }).room.selectedGame).toBe('fixture');
  });

  it('lets only the host set the game up, in the lobby', () => {
    expect(errorCode(() => rooms.setSettings(bob, { rounds: 3 }))).toBe('NOT_HOST');
    expect(errorCode(() => rooms.setSettings(host, { rounds: 99 }))).toBe('INVALID_SETTINGS');
    rooms.setSettings(host, { rounds: 1 });
    expect(room().settings).toMatchObject({ rounds: 1 });
  });

  it('refuses to start without enough connected players', () => {
    rooms.detachSocket(bob, 's-bob');
    expect(rooms.view(room(), host.player.id).games[0]).toEqual({
      id: 'fixture',
      launchable: false,
      reason: 'NOT_ENOUGH_PLAYERS',
      content: null,
    });
    expect(errorCode(() => rooms.startGame(host))).toBe('GAME_UNAVAILABLE');
  });

  it('only launches games with an allowed number of players', () => {
    const meta = { ...fixtureGame.contract.meta, playerCounts: [3] };
    const three = { ...fixtureGame, contract: { ...fixtureGame.contract, meta } };
    const r = new RoomManager({
      clock: scheduler.clock,
      random: counterRandom(),
      limits: { maxRooms: 10, maxPlayersPerRoom: 10, timings: DEFAULT_TIMINGS },
      games: [three],
      scheduler,
    });
    const a = r.createRoom({ nickname: 'Alice' });
    r.attachSocket(a, 's-a');
    r.attachSocket(r.joinRoom({ code: a.room.code, nickname: 'Bob' }), 's-b');
    expect(r.view(a.room, a.player.id).games[0]).toMatchObject({
      launchable: false,
      reason: 'WRONG_PLAYER_COUNT',
    });
    expect(errorCode(() => r.startGame(a))).toBe('GAME_UNAVAILABLE');
    r.attachSocket(r.joinRoom({ code: a.room.code, nickname: 'Carol' }), 's-c');
    expect(r.view(a.room, a.player.id).games[0]).toMatchObject({ launchable: true });
  });

  it('never closes a room for inactivity while a game is running', () => {
    rooms.startGame(host);
    advance(2 * 60 * 60 * SECOND);
    expect(rooms.getRoom(room().code)).toBe(room());
    expect(room().status).toBe('playing');
  });

  it('starts a game: only the connected players take part', () => {
    const carol = rooms.joinRoom({ code: room().code, nickname: 'Carol' });
    rooms.startGame(host);
    expect(room().status).toBe('playing');
    expect(rooms.gameView(room(), host.player.id)).toMatchObject({
      gameId: 'fixture',
      view: { phase: 'collect' },
    });
    // Carol never connected: she waits for the next game.
    expect(rooms.gameView(room(), carol.player.id)).toBeNull();
    expect(rooms.view(room(), host.player.id).players.map((p) => p.role)).toEqual([
      'player',
      'player',
      'waiting',
    ]);
    expect(errorCode(() => rooms.gameAction(carol, 'submit', { value: 1 }))).toBe(
      'NOT_PARTICIPANT',
    );
    expect(errorCode(() => rooms.setSettings(host, { rounds: 1 }))).toBe('WRONG_PHASE');
  });

  it('makes late joiners wait for the next game', () => {
    rooms.startGame(host);
    const dave = rooms.joinRoom({ code: room().code, nickname: 'Dave' });
    expect(dave.player.role).toBe('waiting');
  });

  it('routes actions to the game and pushes views', () => {
    rooms.startGame(host);
    const before = updates;
    submitAll();
    expect(updates).toBeGreaterThan(before);
    expect(rooms.gameView(room(), bob.player.id)?.view).toMatchObject({ phase: 'reveal' });
  });

  it('pushes views when a timer fires', () => {
    rooms.startGame(host);
    const before = updates;
    advance(DEADLINE_MS);
    expect(updates).toBeGreaterThan(before);
    expect(rooms.gameView(room(), host.player.id)?.view).toMatchObject({ phase: 'reveal' });
  });

  it('keeps waiting for a disconnected participant during the grace delay only', () => {
    rooms.startGame(host);
    rooms.gameAction(host, 'submit', { value: 10 });
    rooms.detachSocket(bob, 's-bob');
    advance(59 * SECOND);
    expect(rooms.gameView(room(), host.player.id)?.view).toMatchObject({ phase: 'collect' });
    advance(1 * SECOND);
    expect(rooms.gameView(room(), host.player.id)?.view).toMatchObject({ phase: 'reveal' });
  });

  it('keeps disconnected participants in the room until the game is over', () => {
    rooms.startGame(host);
    rooms.detachSocket(bob, 's-bob');
    advance(6 * 60 * SECOND);
    expect(room().players.has(bob.player.id)).toBe(true);
  });

  it('lets the host skip and abort', () => {
    rooms.startGame(host);
    expect(errorCode(() => rooms.skipPhase(bob))).toBe('NOT_HOST');
    rooms.skipPhase(host);
    expect(rooms.gameView(room(), host.player.id)?.view).toMatchObject({ phase: 'reveal' });
    rooms.abortGame(host);
    expect(room().status).toBe('lobby');
    expect(room().results).toBeNull();
    expect(rooms.gameView(room(), host.player.id)).toBeNull();
  });

  it('shows the final ranking, then goes back to the lobby with everyone', () => {
    rooms.setSettings(host, { rounds: 1 });
    rooms.startGame(host);
    const dave = rooms.joinRoom({ code: room().code, nickname: 'Dave' });
    submitAll(80);
    rooms.gameAction(host, 'next', {});
    expect(room().status).toBe('results');
    expect(room().results).toEqual({
      gameId: 'fixture',
      ranking: [
        { playerId: host.player.id, nickname: 'Alice', score: 1, rank: 1 },
        { playerId: bob.player.id, nickname: 'Bob', score: 0, rank: 2 },
      ],
    });
    expect(errorCode(() => rooms.dismissResults(bob))).toBe('NOT_HOST');
    rooms.dismissResults(host);
    expect(room().status).toBe('lobby');
    expect(dave.player.role).toBe('player');
  });

  it('goes straight back to the lobby at the end of a game without ranking', () => {
    const unranked = {
      ...fixtureGame,
      contract: {
        ...fixtureGame.contract,
        meta: { ...fixtureGame.contract.meta, ranked: false as const },
      },
    };
    rooms = new RoomManager({
      clock: scheduler.clock,
      random: counterRandom(),
      limits: { maxRooms: 10, maxPlayersPerRoom: 10, timings: DEFAULT_TIMINGS },
      games: [unranked],
      scheduler,
      gameRandom: seededRandom(1),
    });
    rooms.setEvents({
      roomChanged: () => {},
      gameUpdated: () => {},
      playerRemoved: () => {},
      roomClosed: () => {},
      gameFailed: (_room, error) => {
        throw error;
      },
    });
    host = rooms.createRoom({ nickname: 'Alice' });
    rooms.attachSocket(host, 's-alice');
    bob = rooms.joinRoom({ code: host.room.code, nickname: 'Bob' });
    rooms.attachSocket(bob, 's-bob');
    rooms.setSettings(host, { rounds: 1 });
    rooms.startGame(host);
    const media = rooms.media.put({
      roomId: room().id,
      ownerId: bob.player.id,
      mime: 'image/png',
      data: Buffer.alloc(10),
    })!;
    submitAll(80);
    rooms.gameAction(host, 'next', {});
    expect(room().status).toBe('lobby');
    expect(room().results).toBeNull();
    expect(rooms.gameView(room(), host.player.id)).toBeNull();
    expect(rooms.media.get(media.id)).toBeUndefined();
  });

  it('keeps the nickname of a participant who left in the ranking', () => {
    rooms.setSettings(host, { rounds: 1 });
    rooms.startGame(host);
    submitAll();
    rooms.leave(bob);
    rooms.gameAction(host, 'next', {});
    expect(room().results?.ranking.map((e) => e.nickname)).toEqual(['Alice', 'Bob']);
  });

  it('stops the game timers when the room closes', () => {
    rooms.startGame(host);
    rooms.close(host);
    expect(() => advance(DEADLINE_MS)).not.toThrow();
    expect(updates).toBe(1);
  });
});
