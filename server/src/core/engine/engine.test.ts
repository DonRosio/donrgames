import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineContract } from '@mini-jeux/shared';
import { DEADLINE_MS, fixtureGame } from './fixtures/fixture-game.ts';
import { createHarness } from './harness.ts';
import { Barrier, rank } from './helpers.ts';
import { seededRandom } from './random.ts';
import { ManualScheduler } from './scheduler.ts';
import { defaultSettings, patchSettings } from './settings.ts';
import { defineGame } from './types.ts';
import { validateGameDefinition, validateRegistry } from './validate.ts';

const play = (players = ['alice', 'bob', 'carol']) =>
  createHarness(fixtureGame, { players, settings: { rounds: 2 } });

describe('GameRunner (with the fixture game)', () => {
  it('starts in the initial phase with per-player views that hide secrets', () => {
    const g = play();
    expect(g.phase).toBe('collect');
    expect(g.act('alice', 'submit', { value: 42 })).toEqual({ ok: true });
    expect(g.view('alice')).toEqual({ phase: 'collect', round: 1, submitted: ['alice'], mine: 42 });
    // Bob knows Alice submitted, but not her value.
    expect(g.view('bob')).toEqual({ phase: 'collect', round: 1, submitted: ['alice'], mine: null });
  });

  it('refuses actions outside of their phase', () => {
    const g = play();
    expect(g.act('alice', 'next')).toEqual({ ok: false, error: 'WRONG_PHASE' });
  });

  it('reserves host-only actions to the host', () => {
    const g = play();
    for (const player of ['alice', 'bob', 'carol']) g.act(player, 'submit', { value: 1 });
    expect(g.phase).toBe('reveal');
    expect(g.act('bob', 'next')).toEqual({ ok: false, error: 'NOT_HOST' });
    expect(g.act('alice', 'next')).toEqual({ ok: true });
  });

  it('validates payloads with the contract schema', () => {
    const g = play();
    expect(g.act('alice', 'submit', { value: 101 })).toEqual({
      ok: false,
      error: 'INVALID_PAYLOAD',
    });
    expect(g.act('alice', 'submit', { value: 1, cheat: true })).toEqual({
      ok: false,
      error: 'INVALID_PAYLOAD',
    });
    expect(g.act('alice', 'unknownAction', {})).toEqual({ ok: false, error: 'INVALID_PAYLOAD' });
  });

  it('refuses non-participants', () => {
    const g = play();
    expect(g.act('mallory', 'submit', { value: 1 })).toEqual({
      ok: false,
      error: 'NOT_PARTICIPANT',
    });
  });

  it('returns the game rule errors declared in the contract, without mutating', () => {
    const g = play();
    g.act('alice', 'submit', { value: 10 });
    expect(g.act('alice', 'submit', { value: 99 })).toEqual({
      ok: false,
      error: 'ALREADY_SUBMITTED',
    });
    expect(g.view('alice')).toMatchObject({ mine: 10 });
  });

  it('fires timers, and cancels them on phase change', () => {
    const timed = play();
    timed.advance(DEADLINE_MS);
    expect(timed.phase).toBe('reveal');

    const early = play();
    for (const player of ['alice', 'bob', 'carol']) early.act(player, 'submit', { value: 5 });
    early.act('alice', 'next');
    expect(early.phase).toBe('collect');
    // The deadline of round 1 was cancelled: only round 2's own deadline remains.
    early.advance(DEADLINE_MS - 1);
    expect(early.phase).toBe('collect');
    early.advance(1);
    expect(early.phase).toBe('reveal');
  });

  it('lets the host skip the players who are late', () => {
    const g = play();
    g.act('alice', 'submit', { value: 5 });
    expect(g.skip()).toEqual({ ok: true });
    expect(g.phase).toBe('reveal');
  });

  it('waits for a disconnected player during the grace delay, then stops waiting', () => {
    const g = play();
    g.act('alice', 'submit', { value: 5 });
    g.act('bob', 'submit', { value: 6 });
    g.disconnect('carol');
    g.advance(59_000);
    expect(g.phase).toBe('collect');
    g.advance(1_000);
    expect(g.phase).toBe('reveal');
  });

  it('stops waiting at once for a player who left', () => {
    const g = play();
    g.act('alice', 'submit', { value: 5 });
    g.act('bob', 'submit', { value: 6 });
    g.leave('carol');
    expect(g.phase).toBe('reveal');
  });

  it('ends with a ranking computed by the core', () => {
    const g = play(['alice', 'bob']);
    for (let round = 0; round < 2; round++) {
      g.act('alice', 'submit', { value: 90 });
      g.act('bob', 'submit', { value: 10 });
      g.act('alice', 'next');
    }
    expect(g.ended).toBe(true);
    expect(g.ranking).toEqual([
      { playerId: 'alice', score: 2, rank: 1 },
      { playerId: 'bob', score: 0, rank: 2 },
    ]);
    expect(g.act('alice', 'next')).toEqual({ ok: false, error: 'WRONG_PHASE' });
  });

  it('applies the settings', () => {
    const g = createHarness(fixtureGame, {
      players: ['alice', 'bob'],
      settings: { double: true, mode: 'low', rounds: 1 },
    });
    g.act('alice', 'submit', { value: 90 });
    g.act('bob', 'submit', { value: 10 });
    expect(g.view('alice')).toMatchObject({ phase: 'reveal', winner: 'bob', scores: { bob: 2 } });
  });

  it('forbids undeclared transitions', () => {
    const contract = defineContract({
      meta: {
        id: 'broken',
        name: 'x',
        description: 'x',
        minPlayers: 1,
        maxPlayers: 2,
        replayable: true,
      },
      phases: ['a', 'b'],
      settings: {},
      actions: { go: { payload: z.strictObject({}) } },
      errors: [],
    });
    const broken = defineGame({
      contract,
      setup: () => ({}),
      initialPhase: 'a',
      phases: {
        a: { actions: ['go'], next: [], on: { go: (_s, ctx) => ctx.goto('b') } },
        b: { actions: [], next: [] },
      },
      view: (_s, _v, ctx) => ({ phase: ctx.phase }),
    });
    const g = createHarness(broken, { players: ['alice'] });
    expect(() => g.act('alice', 'go')).toThrow(/Undeclared transition a -> b/);
  });
});

describe('game definition validation', () => {
  it('accepts the fixture game', () => {
    expect(() => validateGameDefinition(fixtureGame)).not.toThrow();
  });

  it('detects an allowed action without handler', () => {
    const phases = {
      ...fixtureGame.phases,
      collect: { ...fixtureGame.phases.collect, on: {} },
    };
    expect(() => validateGameDefinition({ ...fixtureGame, phases })).toThrow(
      /allows "submit" without handling it/,
    );
  });

  it('detects duplicate ids in the registry', () => {
    expect(() => validateRegistry([fixtureGame, fixtureGame])).toThrow(/registered twice/);
  });
});

describe('settings', () => {
  const defs = fixtureGame.contract.settings;

  it('starts from the defaults', () => {
    expect(defaultSettings(defs)).toEqual({ rounds: 2, double: false, mode: 'high' });
  });

  it('accepts valid patches and rejects everything else', () => {
    const current = defaultSettings(defs);
    expect(patchSettings(defs, current, { rounds: 5, mode: 'low' })).toEqual({
      rounds: 5,
      double: false,
      mode: 'low',
    });
    expect(patchSettings(defs, current, { rounds: 6 })).toBeNull();
    expect(patchSettings(defs, current, { rounds: 2.5 })).toBeNull();
    expect(patchSettings(defs, current, { double: 'yes' })).toBeNull();
    expect(patchSettings(defs, current, { mode: 'medium' })).toBeNull();
    expect(patchSettings(defs, current, { unknown: 1 })).toBeNull();
    expect(patchSettings(defs, current, { toString: 1 })).toBeNull();
  });
});

describe('helpers', () => {
  it('ranks with ties sharing a rank', () => {
    expect(
      rank([
        { playerId: 'a', score: 3 },
        { playerId: 'b', score: 5 },
        { playerId: 'c', score: 3 },
        { playerId: 'd', score: 1 },
      ]).map((e) => [e.playerId, e.rank]),
    ).toEqual([
      ['b', 1],
      ['a', 2],
      ['c', 2],
      ['d', 4],
    ]);
  });

  it('completes a barrier when every awaited player is done', () => {
    const barrier = new Barrier();
    barrier.mark('a');
    expect(barrier.isComplete(['a', 'b'])).toBe(false);
    expect(barrier.isComplete(['a'])).toBe(true);
    expect(new Barrier().isComplete([])).toBe(false);
  });

  it('draws reproducible shuffles from a seed', () => {
    const items = [1, 2, 3, 4, 5, 6];
    expect(seededRandom(7).shuffle(items)).toEqual(seededRandom(7).shuffle(items));
    expect(seededRandom(7).shuffle(items).sort()).toEqual(items);
  });

  it('fires manual timers in order', () => {
    const scheduler = new ManualScheduler();
    const fired: string[] = [];
    scheduler.set(() => fired.push('b'), 200);
    scheduler.set(() => fired.push('a'), 100);
    const cancelled = scheduler.set(() => fired.push('never'), 150);
    scheduler.clear(cancelled);
    scheduler.advance(250);
    expect(fired).toEqual(['a', 'b']);
  });
});
