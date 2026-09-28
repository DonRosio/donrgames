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
const PLAYERS = ['alice', 'bob', 'carol'];

function play(rounds = 2, players = PLAYERS) {
  return createHarness(dubbingGame, { players, settings: { rounds }, content: videos });
}

type G = ReturnType<typeof play>;
const view = <P extends DubbingView['phase']>(g: G, player: string, phase: P) => {
  const v = g.view(player);
  expect(v.phase).toBe(phase);
  return v as DubbingView & { phase: P };
};
const readyAll = (g: G, players = PLAYERS) => {
  const v = g.view(players[0]!) as { syncId: string };
  for (const player of players) g.act(player, 'ready', { syncId: v.syncId });
};
const toRecording = (g: G) => {
  readyAll(g);
  g.advance(SYNC_LEAD_MS + 30_000);
};
/** Everybody records, then the first take is loaded and played: now voting. */
const toVoting = (g: G, players = PLAYERS) => {
  toRecording(g);
  for (const player of players) g.upload(player, 'take', take);
  readyAll(g, players);
  g.advance(SYNC_LEAD_MS + 30_000);
  return view(g, players[0]!, 'voting');
};

describe('Doublage: loading, broadcast and recording', () => {
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

    expect(view(g, 'bob', 'broadcast').startAt).toBe(g.clock.now() + SYNC_LEAD_MS);
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

  it('never lets anyone hear a take during the recording', () => {
    const g = play();
    toRecording(g);
    g.upload('alice', 'take', take);
    expect(g.canRead('alice', { kind: 'media', id: 'file-1' })).toBe(false);
    expect(g.canRead('bob', { kind: 'media', id: 'file-1' })).toBe(false);
  });

  it('stops waiting for a player disconnected for too long', () => {
    const g = play();
    toRecording(g);
    g.upload('alice', 'take', take);
    g.upload('bob', 'take', take);
    g.disconnect('carol');
    g.advance(59_000);
    expect(g.phase).toBe('recording');
    g.advance(1_000);
    expect(g.phase).toBe('takeLoading');
  });

  it('goes straight to the end of the round when nobody recorded', () => {
    const g = play();
    toRecording(g);
    g.skip();
    expect(view(g, 'alice', 'roundResults').scores.every((s) => s.roundPoints === 0)).toBe(true);
  });
});

describe('Doublage: presentation and votes', () => {
  it('presents the takes one by one in a random order, synchronized', () => {
    const g = play();
    toRecording(g);
    for (const player of PLAYERS) g.upload(player, 'take', take);
    const loading = view(g, 'alice', 'takeLoading');
    expect(loading).toMatchObject({ index: 1, count: 3, startAt: null });
    expect(PLAYERS).toContain(loading.presenter);
    readyAll(g);
    const playing = view(g, 'bob', 'takePlaying');
    expect(playing.startAt).toBe(g.clock.now() + SYNC_LEAD_MS);
    expect(playing.take.offsetMs).toBe(40);
  });

  it('lets everyone hear the presented take only, during its presentation', () => {
    const g = play();
    toRecording(g);
    for (const player of PLAYERS) g.upload(player, 'take', take);
    const { presenter, take: presented } = view(g, 'alice', 'takeLoading');
    const other = ['file-1', 'file-2', 'file-3'].find((id) => id !== presented.mediaId)!;
    for (const player of PLAYERS) {
      expect(g.canRead(player, { kind: 'media', id: presented.mediaId })).toBe(true);
      expect(g.canRead(player, { kind: 'media', id: other })).toBe(false);
    }
    expect(PLAYERS).toContain(presenter);
  });

  it('enforces the voting rules', () => {
    const g = play();
    const voting = toVoting(g);
    const [voter, otherVoter] = PLAYERS.filter((p) => p !== voting.presenter) as [string, string];
    expect(g.act(voting.presenter, 'vote', { points: 1 })).toEqual({
      ok: false,
      error: 'SELF_VOTE',
    });
    expect(g.act(voter, 'vote', { points: 3 })).toEqual({ ok: false, error: 'INVALID_PAYLOAD' });
    expect(g.act(voter, 'vote', { points: 2 })).toEqual({ ok: true });
    expect(g.act(voter, 'vote', { points: 1 })).toEqual({ ok: false, error: 'ALREADY_VOTED' });
    // Nobody sees the value of a vote before the reveal.
    expect(view(g, otherVoter, 'voting')).toMatchObject({ voted: [voter], myVote: null });
    expect(view(g, voter, 'voting')).toMatchObject({ myVote: 2, canUsePlusTwo: false });
    g.act(otherVoter, 'vote', { points: 0 });
    expect(view(g, voter, 'reveal')).toMatchObject({
      presenter: voting.presenter,
      total: 2,
      votes: expect.arrayContaining([
        { voter, points: 2 },
        { voter: otherVoter, points: 0 },
      ]),
    });
  });

  it('allows the +2 only once per round and per voter', () => {
    const g = play();
    const first = toVoting(g);
    const voter = PLAYERS.find((p) => p !== first.presenter)!;
    g.act(voter, 'vote', { points: 2 });
    g.skip(); // reveal
    g.act('alice', 'next');
    readyAll(g);
    g.advance(SYNC_LEAD_MS + 30_000);
    const second = view(g, voter, 'voting');
    if (second.presenter === voter) return; // the voter presents: nothing to check here
    expect(second.canUsePlusTwo).toBe(false);
    expect(g.act(voter, 'vote', { points: 2 })).toEqual({ ok: false, error: 'PLUS_TWO_USED' });
    expect(g.act(voter, 'vote', { points: 1 })).toEqual({ ok: true });
  });

  it('counts a missing vote as 0 when the host skips, and waits for connected voters only', () => {
    const g = play();
    const voting = toVoting(g);
    const [voter, lazy] = PLAYERS.filter((p) => p !== voting.presenter) as [string, string];
    g.act(voter, 'vote', { points: 1 });
    expect(g.phase).toBe('voting');
    g.skip();
    expect(view(g, voter, 'reveal')).toMatchObject({
      total: 1,
      votes: expect.arrayContaining([{ voter: lazy, points: null }]),
    });
  });

  it('scores the round, deletes the takes after the presentation, then plays the next round', () => {
    const g = play(2);
    toVoting(g);
    for (let presented = 0; presented < 3; presented++) {
      const voting = view(g, 'alice', 'voting');
      for (const player of PLAYERS) {
        if (player !== voting.presenter) g.act(player, 'vote', { points: 1 });
      }
      expect(g.act('bob', 'next')).toEqual({ ok: false, error: 'NOT_HOST' });
      g.act('alice', 'next');
      if (presented < 2) {
        readyAll(g);
        g.advance(SYNC_LEAD_MS + 30_000);
      }
    }
    const results = view(g, 'alice', 'roundResults');
    expect(results.scores).toEqual(
      expect.arrayContaining(PLAYERS.map((playerId) => ({ playerId, roundPoints: 2, total: 2 }))),
    );
    expect(results.last).toBe(false);
    expect([...g.discarded].sort()).toEqual(['file-1', 'file-2', 'file-3']);

    g.act('alice', 'next');
    expect(view(g, 'alice', 'loading').round).toBe(2);
  });

  it('ends after the chosen number of rounds, or when the host decides', () => {
    const g = play(1);
    toRecording(g);
    g.skip();
    expect(view(g, 'alice', 'roundResults').last).toBe(true);
    g.act('alice', 'next');
    expect(g.ended).toBe(true);

    const early = play(3);
    toRecording(early);
    early.skip();
    early.act('alice', 'finish');
    expect(early.ended).toBe(true);
  });

  it('stops when the content runs out', () => {
    const g = play(10);
    for (let round = 1; round <= 3; round++) {
      toRecording(g);
      g.skip();
      expect(view(g, 'alice', 'roundResults').last).toBe(round === 3);
      g.act('alice', 'next');
    }
    expect(g.ended).toBe(true);
  });

  it('works with two players (a single voter per take)', () => {
    const g = play(1, ['alice', 'bob']);
    const voting = toVoting(g, ['alice', 'bob']);
    const voter = voting.presenter === 'alice' ? 'bob' : 'alice';
    g.act(voter, 'vote', { points: 2 });
    expect(view(g, 'alice', 'reveal').total).toBe(2);
  });
});
