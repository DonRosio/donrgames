import { describe, expect, it } from 'vitest';
import { SYNC_LEAD_MS } from '@mini-jeux/shared/games/dubbing';
import type { DubbingView } from '@mini-jeux/shared/games/dubbing';
import { createHarness } from '../../core/engine/harness.ts';
import { validateGameDefinition } from '../../core/engine/validate.ts';
import { dubbingGame } from './index.ts';

const videos = [
  { id: 'raclette', title: 'Raclette', durationMs: 10_000 },
  { id: 'herve1', title: 'Hervé', durationMs: 24_000 },
  { id: 'chat', title: 'Chat', durationMs: 8_000 },
];
const take = { offsetMs: 40, durationMs: 10_000 };

function play(rounds = 2, players = ['alice', 'bob', 'carol']) {
  return createHarness(dubbingGame, { players, settings: { rounds }, content: videos });
}

type G = ReturnType<typeof play>;
const view = <P extends DubbingView['phase']>(g: G, player: string, phase: P) => {
  const v = g.view(player);
  expect(v.phase).toBe(phase);
  return v as Extract<DubbingView, { phase: P }>;
};
const readyAll = (g: G, players = ['alice', 'bob', 'carol']) => {
  const { syncId } = view(g, players[0]!, 'loading');
  for (const player of players) g.act(player, 'ready', { syncId });
};
const toRecording = (g: G) => {
  readyAll(g);
  g.advance(SYNC_LEAD_MS + 30_000);
};

describe('Doublage', () => {
  it('is a valid definition', () => {
    expect(() => validateGameDefinition(dubbingGame)).not.toThrow();
  });

  it('loads a video, then starts it for everyone at the same server time', () => {
    const g = play();
    const loading = view(g, 'alice', 'loading');
    expect(videos.map((v) => v.id)).toContain(loading.video.contentId);
    expect(g.canRead('alice', { kind: 'content', id: loading.video.contentId })).toBe(true);
    expect(g.canRead('alice', { kind: 'content', id: 'other' })).toBe(false);

    expect(g.act('alice', 'ready', { syncId: 'old' })).toEqual({ ok: false, error: 'STALE_SYNC' });
    g.act('alice', 'ready', { syncId: loading.syncId });
    g.act('bob', 'ready', { syncId: loading.syncId });
    expect(g.phase).toBe('loading');
    g.act('carol', 'ready', { syncId: loading.syncId });

    const broadcast = view(g, 'bob', 'broadcast');
    expect(broadcast.startAt).toBe(g.clock.now() + SYNC_LEAD_MS);
    expect(g.played).toEqual([loading.video.contentId]);
  });

  it('does not wait for disconnected players to load', () => {
    const g = play();
    const { syncId } = view(g, 'alice', 'loading');
    g.act('alice', 'ready', { syncId });
    g.act('bob', 'ready', { syncId });
    g.disconnect('carol');
    expect(g.phase).toBe('broadcast');
  });

  it('moves to the recording once the video is over', () => {
    const g = play();
    readyAll(g);
    const { video } = view(g, 'alice', 'broadcast');
    g.advance(SYNC_LEAD_MS + video.durationMs + 499);
    expect(g.phase).toBe('broadcast');
    g.advance(1);
    expect(view(g, 'alice', 'recording')).toMatchObject({ validated: [], mine: 'pending' });
  });

  it('accepts one take per player, locked once validated, and shows who validated', () => {
    const g = play();
    toRecording(g);
    expect(g.upload('alice', 'take', take)).toEqual({ ok: true });
    expect(g.upload('alice', 'take', take)).toEqual({ ok: false, error: 'WRONG_PHASE' });
    expect(view(g, 'alice', 'recording').mine).toBe('validated');
    expect(view(g, 'bob', 'recording')).toMatchObject({ validated: ['alice'], mine: 'pending' });
  });

  it('bounds the size of a take by the duration of the video', () => {
    const g = play();
    toRecording(g);
    const { video } = view(g, 'alice', 'recording');
    const limit = Math.ceil((video.durationMs / 1000 + 3) * 40_000);
    expect(g.upload('alice', 'take', take, limit + 1)).toEqual({
      ok: false,
      error: 'PAYLOAD_TOO_LARGE',
    });
    expect(g.upload('alice', 'take', take, limit)).toEqual({ ok: true });
  });

  it('validates the metadata of a take and refuses takes outside of the recording', () => {
    const g = play();
    expect(g.upload('alice', 'take', take)).toEqual({ ok: false, error: 'WRONG_PHASE' });
    toRecording(g);
    expect(g.upload('alice', 'take', { offsetMs: 99_999, durationMs: 10 })).toEqual({
      ok: false,
      error: 'INVALID_PAYLOAD',
    });
    expect(g.upload('mallory', 'take', take)).toEqual({ ok: false, error: 'NOT_PARTICIPANT' });
  });

  it('ends the recording when every awaited player validated, and deletes the takes', () => {
    const g = play();
    toRecording(g);
    g.upload('alice', 'take', take);
    g.upload('bob', 'take', take);
    g.disconnect('carol');
    g.advance(60_000);
    const results = view(g, 'alice', 'roundResults');
    expect(results.validated).toEqual(['alice', 'bob']);
    expect(g.discarded).toEqual(['file-1', 'file-2']);
  });

  it('never lets anyone download a take (the presentation is not there yet)', () => {
    const g = play();
    toRecording(g);
    g.upload('alice', 'take', take);
    expect(g.canRead('bob', { kind: 'media', id: 'file-1' })).toBe(false);
  });

  it('lets the host skip each waiting step', () => {
    const g = play();
    g.skip();
    expect(g.phase).toBe('broadcast');
    g.skip();
    expect(g.phase).toBe('recording');
    g.skip();
    expect(g.phase).toBe('roundResults');
  });

  it('plays the chosen number of rounds with different videos, then ends', () => {
    const g = play(2);
    for (let round = 1; round <= 2; round++) {
      g.skip();
      g.skip();
      g.skip();
      expect(view(g, 'alice', 'roundResults')).toMatchObject({ round, last: round === 2 });
      expect(g.act('bob', 'next')).toEqual({ ok: false, error: 'NOT_HOST' });
      g.act('alice', 'next');
    }
    expect(g.ended).toBe(true);
    expect(new Set(g.played).size).toBe(2);
  });

  it('lets the host end the game after any round', () => {
    const g = play(3);
    g.skip();
    g.skip();
    g.skip();
    g.act('alice', 'finish');
    expect(g.ended).toBe(true);
  });

  it('stops when the content runs out', () => {
    const g = play(10);
    for (let round = 1; round <= 3; round++) {
      g.skip();
      g.skip();
      g.skip();
      expect(view(g, 'alice', 'roundResults').last).toBe(round === 3);
      g.act('alice', 'next');
    }
    expect(g.ended).toBe(true);
  });
});
