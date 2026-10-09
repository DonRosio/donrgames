import { describe, expect, it } from 'vitest';
import type { WhosMostView } from '@mini-jeux/shared/games/whos-most';
import { createHarness } from '../../core/engine/harness.ts';
import { validateGameDefinition } from '../../core/engine/validate.ts';
import { whosMostGame } from './index.ts';

const PLAYERS = ['alice', 'bob', 'carol', 'dave'];
const QUESTIONS = Array.from({ length: 12 }, (_, index) => ({
  id: `q${index}`,
  title: `adjectif ${index}`,
  durationMs: 0,
}));

function play(questions = 2, players = PLAYERS) {
  return createHarness(whosMostGame, {
    players,
    settings: { questions },
    content: QUESTIONS,
  });
}

type G = ReturnType<typeof play>;
const view = <P extends WhosMostView['phase']>(g: G, player: string, phase: P) => {
  const v = g.view(player);
  expect(v.phase).toBe(phase);
  return v as WhosMostView & { phase: P };
};
const sendPhotos = (g: G, players = PLAYERS) => {
  for (const player of players) g.upload(player, 'head', {});
};
const toVoting = (g: G) => {
  sendPhotos(g);
  g.act('alice', 'start');
};
const voteAll = (g: G, target: (voter: string) => string, players = PLAYERS) => {
  for (const voter of players) g.act(voter, 'vote', { target: target(voter) });
};

describe('Qui est le + ?', () => {
  it('is a valid definition', () => {
    expect(() => validateGameDefinition(whosMostGame)).not.toThrow();
  });

  it('draws distinct questions and marks them as asked in the room', () => {
    const g = play(8);
    expect(new Set(g.state.questions).size).toBe(8);
    expect(g.played).toHaveLength(8);
    expect(view(g, 'alice', 'photos').heads).toHaveLength(4);
  });

  it('needs a picture from everyone present before the host starts', () => {
    const g = play();
    expect(view(g, 'bob', 'photos').canStart).toBe(false);
    g.upload('alice', 'head', {});
    expect(g.act('alice', 'start')).toEqual({ ok: false, error: 'PHOTOS_MISSING' });
    expect(g.act('bob', 'start')).toEqual({ ok: false, error: 'NOT_HOST' });
    sendPhotos(g);
    expect(view(g, 'bob', 'photos').canStart).toBe(true);
    expect(g.act('alice', 'start')).toEqual({ ok: true });
    expect(g.phase).toBe('voting');
  });

  it('replaces a picture and discards the previous one', () => {
    const g = play();
    g.upload('bob', 'head', {});
    const first = view(g, 'bob', 'photos').heads.find((h) => h.playerId === 'bob')!.mediaId;
    g.upload('bob', 'head', {});
    const second = view(g, 'bob', 'photos').heads.find((h) => h.playerId === 'bob')!.mediaId;
    expect(second).not.toBe(first);
    expect(g.discarded).toEqual([first]);
    // Everyone sees every picture, nothing else.
    expect(g.canRead('carol', { kind: 'media', id: second! })).toBe(true);
    expect(g.canRead('carol', { kind: 'media', id: first! })).toBe(false);
    expect(g.canRead('carol', { kind: 'content', id: 'x' })).toBe(false);
  });

  it('refuses a picture once the questions started', () => {
    const g = play();
    toVoting(g);
    expect(g.upload('bob', 'head', {})).toEqual({ ok: false, error: 'WRONG_PHASE' });
  });

  it('lets the host skip the missing pictures: the head shows without a picture', () => {
    const g = play();
    g.upload('alice', 'head', {});
    g.skip();
    const v = view(g, 'bob', 'voting');
    expect(v.heads.find((h) => h.playerId === 'bob')!.mediaId).toBeNull();
    expect(v.heads.find((h) => h.playerId === 'alice')!.mediaId).not.toBeNull();
  });

  it('votes are final, may target oneself, and stay secret before the reveal', () => {
    const g = play();
    toVoting(g);
    expect(g.act('bob', 'vote', { target: 'bob' })).toEqual({ ok: true });
    expect(g.act('bob', 'vote', { target: 'carol' })).toEqual({
      ok: false,
      error: 'ALREADY_VOTED',
    });
    expect(g.act('carol', 'vote', { target: 'zed' })).toEqual({
      ok: false,
      error: 'UNKNOWN_TARGET',
    });
    const seenByCarol = view(g, 'carol', 'voting');
    expect(seenByCarol.voted).toEqual(['bob']);
    expect(seenByCarol.myVote).toBeNull();
    expect(view(g, 'bob', 'voting').myVote).toBe('bob');
    expect(JSON.stringify(seenByCarol)).not.toContain('"target"');
  });

  it('the host reveals once everyone voted, with the votes each head received', () => {
    const g = play();
    toVoting(g);
    voteAll(g, (voter) => (voter === 'dave' ? 'bob' : 'alice'), ['alice', 'bob', 'carol']);
    expect(view(g, 'alice', 'voting').allVoted).toBe(false);
    expect(g.act('alice', 'reveal')).toEqual({ ok: false, error: 'VOTES_MISSING' });
    g.act('dave', 'vote', { target: 'bob' });
    expect(view(g, 'alice', 'voting').allVoted).toBe(true);
    expect(g.act('bob', 'reveal')).toEqual({ ok: false, error: 'NOT_HOST' });
    g.act('alice', 'reveal');
    const reveal = view(g, 'carol', 'reveal');
    expect(reveal.results[0]).toEqual({ playerId: 'alice', votes: 3 });
    expect(reveal.results.find((r) => r.playerId === 'bob')!.votes).toBe(1);
    expect(reveal.last).toBe(false);
  });

  it('chains the questions, counts the votes of each one apart, and ends with no ranking', () => {
    const g = play(2);
    toVoting(g);
    voteAll(g, () => 'alice');
    g.act('alice', 'reveal');
    g.act('alice', 'next');
    expect(view(g, 'bob', 'voting').index).toBe(2);
    expect(view(g, 'bob', 'voting').myVote).toBeNull();
    voteAll(g, (voter) => (voter === 'alice' ? 'bob' : 'carol'));
    g.act('alice', 'reveal');
    const second = view(g, 'bob', 'reveal');
    expect(second.results.slice(0, 2)).toEqual([
      { playerId: 'carol', votes: 3 },
      { playerId: 'bob', votes: 1 },
    ]);
    // Alice's votes of the first question do not carry over.
    expect(second.results.find((r) => r.playerId === 'alice')!.votes).toBe(0);
    expect(second.last).toBe(true);
    g.act('alice', 'next');
    expect(g.ended).toBe(true);
    expect(g.ranking).toEqual([]);
  });

  it('can finish early and deletes every picture', () => {
    const g = play(5);
    toVoting(g);
    const pictures = view(g, 'alice', 'voting')
      .heads.map((h) => h.mediaId!)
      .sort();
    voteAll(g, () => 'bob');
    g.act('alice', 'reveal');
    g.act('alice', 'finish');
    expect(g.ended).toBe(true);
    expect([...g.discarded].sort()).toEqual(pictures);
  });

  it('skips the missing votes, stops waiting for a player who left and refuses their head', () => {
    const g = play();
    toVoting(g);
    g.act('alice', 'vote', { target: 'alice' });
    g.skip();
    expect(g.phase).toBe('reveal');

    const h = play();
    toVoting(h);
    voteAll(h, () => 'bob', ['alice', 'bob', 'carol']);
    h.leave('dave');
    expect(view(h, 'alice', 'voting').allVoted).toBe(true);
    expect(view(h, 'alice', 'voting').heads.map((x) => x.playerId)).not.toContain('dave');
    expect(h.act('alice', 'vote', { target: 'dave' })).toEqual({
      ok: false,
      error: 'UNKNOWN_TARGET',
    });
  });

  it('keeps counting the votes of a head who left before the reveal', () => {
    const g = play();
    toVoting(g);
    voteAll(g, () => 'dave');
    g.leave('dave');
    g.act('alice', 'reveal');
    const reveal = view(g, 'alice', 'reveal');
    expect(reveal.results[0]).toEqual({ playerId: 'dave', votes: 4 });
  });
});
