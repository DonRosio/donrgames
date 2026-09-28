import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ack, GameViewEnvelope } from '@mini-jeux/shared';
import { fixtureGame } from '../engine/fixtures/fixture-game.ts';
import type { FixtureView } from '../engine/fixtures/fixture-game.ts';
import { next, startServer, stateMatching } from '../../test/helpers.ts';
import type { TestSocket } from '../../test/helpers.ts';

let server: Awaited<ReturnType<typeof startServer>>;

beforeEach(async () => {
  server = await startServer({ games: [fixtureGame] });
});

afterEach(async () => {
  await server.close();
});

function emit(socket: TestSocket, event: string, payload: unknown = {}): Promise<Ack> {
  return new Promise((resolve) => {
    (socket as unknown as { emit: (...args: unknown[]) => void }).emit(event, payload, resolve);
  });
}

function nextView(socket: TestSocket, predicate: (view: FixtureView) => boolean = () => true) {
  return new Promise<GameViewEnvelope<FixtureView>>((resolve) => {
    const listener = (envelope: GameViewEnvelope) => {
      const typed = envelope as GameViewEnvelope<FixtureView>;
      if (!predicate(typed.view)) return;
      socket.off('game:view', listener);
      resolve(typed);
    };
    socket.on('game:view', listener);
  });
}

async function lobbyWithTwo() {
  const created = await server.createRoom('Alice');
  const alice = server.connect(created.token);
  await next(alice, 'room:state');
  const joined = await server.joinRoom(created.code, 'Bob');
  const bob = server.connect(joined.token);
  const bobState = await next(bob, 'room:state');
  return { code: created.code, alice, bob, bobToken: joined.token, bobId: bobState.me };
}

describe('games over Socket.IO', () => {
  it('serves the catalog with the settings of each game', async () => {
    const response = await fetch(`${server.origin}/api/games`);
    const [game] = (await response.json()) as { meta: { id: string }; settings: object }[];
    expect(game?.meta.id).toBe('fixture');
    expect(Object.keys(game?.settings ?? {})).toEqual(['rounds', 'double', 'mode']);
  });

  it('plays a full game: settings, secret views, reveal, results, back to the lobby', async () => {
    const { alice, bob } = await lobbyWithTwo();

    const settingsSeen = stateMatching(bob, (r) => r.selectedGame?.settings.rounds === 1);
    expect(await emit(alice, 'room:setSettings', { settings: { rounds: 1 } })).toEqual({
      ok: true,
      data: null,
    });
    await settingsSeen;

    const aliceFirst = nextView(alice);
    const bobFirst = nextView(bob);
    const playing = stateMatching(bob, (r) => r.status === 'playing');
    expect(await emit(alice, 'room:startGame')).toEqual({ ok: true, data: null });
    await playing;
    expect((await aliceFirst).view).toEqual({
      phase: 'collect',
      round: 1,
      submitted: [],
      mine: null,
    });
    await bobFirst;

    // Bob learns that Alice submitted, never her value.
    const bobSeesAlice = nextView(bob, (v) => v.phase === 'collect' && v.submitted.length === 1);
    expect(await emit(alice, 'game:action', { type: 'submit', payload: { value: 70 } })).toEqual({
      ok: true,
      data: null,
    });
    expect((await bobSeesAlice).view).toMatchObject({ mine: null });
    expect(await emit(alice, 'game:action', { type: 'submit', payload: { value: 1 } })).toEqual({
      ok: false,
      error: 'ALREADY_SUBMITTED',
    });

    const reveal = nextView(bob, (v) => v.phase === 'reveal');
    await emit(bob, 'game:action', { type: 'submit', payload: { value: 30 } });
    expect((await reveal).view).toMatchObject({
      values: expect.any(Object),
      winner: expect.any(String),
    });

    expect(await emit(bob, 'game:action', { type: 'next', payload: {} })).toEqual({
      ok: false,
      error: 'NOT_HOST',
    });
    const results = stateMatching(bob, (r) => r.status === 'results');
    await emit(alice, 'game:action', { type: 'next', payload: {} });
    const finished = await results;
    expect(finished.results?.ranking.map((e) => [e.nickname, e.score, e.rank])).toEqual([
      ['Alice', 1, 1],
      ['Bob', 0, 2],
    ]);

    const lobby = stateMatching(bob, (r) => r.status === 'lobby');
    expect(await emit(alice, 'results:dismiss')).toEqual({ ok: true, data: null });
    await lobby;
  });

  it('refuses game events that are malformed or out of place', async () => {
    const { alice, bob } = await lobbyWithTwo();
    expect(await emit(alice, 'game:action', { type: 'submit', payload: { value: 1 } })).toEqual({
      ok: false,
      error: 'WRONG_PHASE',
    });
    expect(await emit(bob, 'room:startGame')).toEqual({ ok: false, error: 'NOT_HOST' });
    expect(await emit(alice, 'room:setSettings', { settings: { rounds: 'many' } })).toEqual({
      ok: false,
      error: 'INVALID_SETTINGS',
    });
    expect(await emit(alice, 'game:action', { type: 'sub mit', payload: {} })).toEqual({
      ok: false,
      error: 'INVALID_PAYLOAD',
    });
  });

  it('sends the current view again on reconnection', async () => {
    const { alice, bob, bobToken } = await lobbyWithTwo();
    const started = nextView(bob);
    await emit(alice, 'room:startGame');
    await started;
    await emit(alice, 'game:action', { type: 'submit', payload: { value: 5 } });
    bob.disconnect();

    const again = server.connect(bobToken);
    const view = await nextView(again);
    expect(view.view).toMatchObject({ phase: 'collect', submitted: [expect.any(String)] });
  });

  it('lets the host skip, then abort back to the lobby', async () => {
    const { alice, bob } = await lobbyWithTwo();
    const started = nextView(bob);
    await emit(alice, 'room:startGame');
    await started;

    const reveal = nextView(bob, (v) => v.phase === 'reveal');
    expect(await emit(alice, 'game:skip')).toEqual({ ok: true, data: null });
    await reveal;

    const lobby = stateMatching(bob, (r) => r.status === 'lobby' && r.results === null);
    expect(await emit(alice, 'game:abort')).toEqual({ ok: true, data: null });
    await lobby;
  });
});
