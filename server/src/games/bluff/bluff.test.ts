import { describe, expect, it } from 'vitest';
import type { BluffView } from '@mini-jeux/shared/games/bluff';
import { THEME_IDS } from '@mini-jeux/shared/games/bluff-themes';
import type { ThemeId } from '@mini-jeux/shared/games/bluff-themes';
import { createHarness } from '../../core/engine/harness.ts';
import { validateGameDefinition } from '../../core/engine/validate.ts';
import { bluffGame } from './index.ts';

const PLAYERS = ['alice', 'bob', 'carol', 'dave'];

function play(
  options: { players?: string[]; rounds?: number; themes?: ThemeId[]; seed?: number } = {},
) {
  return createHarness(bluffGame, {
    players: options.players ?? PLAYERS,
    seed: options.seed ?? 1,
    settings: { rounds: options.rounds ?? 4, themes: options.themes ?? [...THEME_IDS] },
  });
}

type G = ReturnType<typeof play>;
const view = <P extends BluffView['phase']>(g: G, player: string, phase: P) => {
  const v = g.view(player);
  expect(v.phase).toBe(phase);
  return v as BluffView & { phase: P };
};
const question = (g: G) => g.state.questions[g.state.index]!;
const OTHER = 'Une réponse inventée';

/** Everybody writes a different false answer. */
function writeAll(g: G, players = PLAYERS) {
  for (const p of players)
    expect(g.act(p, 'answer', { text: `${OTHER} de ${p}` })).toEqual({ ok: true });
}
const optionOf = (g: G, player: string) =>
  g.state.options.find((o) => o.authors.includes(player))!.id;
const realOption = (g: G) => g.state.options.find((o) => o.real)!.id;

describe('Le Bluff: setup', () => {
  it('is a valid definition', () => {
    expect(() => validateGameDefinition(bluffGame)).not.toThrow();
  });

  it('asks the number of questions chosen, never twice the same', () => {
    const g = play({ rounds: 12 });
    const ids = g.state.questions.map((q) => q.id);
    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(12);
  });

  it('only asks questions of the chosen themes', () => {
    const g = play({ rounds: 15, themes: ['manga', 'food'] });
    for (const q of g.state.questions) expect(['manga', 'food']).toContain(q.theme);
  });

  it('draws other questions from one game to the next', () => {
    const first = play({ seed: 1 }).state.questions.map((q) => q.id);
    const second = play({ seed: 2 }).state.questions.map((q) => q.id);
    expect(first).not.toEqual(second);
  });
});

describe('Le Bluff: writing', () => {
  it('shows the question and never the answer', () => {
    const g = play();
    const v = view(g, 'alice', 'writing');
    expect(v).toMatchObject({ index: 1, count: 4, question: question(g).text, mine: null });
    expect(v.players).toEqual(PLAYERS);
    expect(Object.keys(v).sort()).toEqual(
      ['answered', 'count', 'index', 'mine', 'phase', 'players', 'question', 'theme'].sort(),
    );
  });

  it('keeps an answer, once, and shows who answered', () => {
    const g = play();
    expect(g.act('bob', 'answer', { text: '  Un   chien  ' })).toEqual({ ok: true });
    expect(view(g, 'bob', 'writing').mine).toBe('Un chien');
    expect(view(g, 'carol', 'writing').mine).toBeNull();
    expect(view(g, 'carol', 'writing').answered).toEqual(['bob']);
    expect(g.act('bob', 'answer', { text: 'Autre chose' })).toEqual({
      ok: false,
      error: 'ALREADY_ANSWERED',
    });
  });

  it('refuses an empty, too long or invisible answer', () => {
    const g = play();
    for (const text of ['', '   ', 'x'.repeat(61), 'a‮b', '!!!']) {
      expect(g.act('alice', 'answer', { text }), JSON.stringify(text)).toEqual({
        ok: false,
        error: 'ANSWER_INVALID',
      });
    }
    expect(view(g, 'alice', 'writing').mine).toBeNull();
  });

  it('refuses the real answer, however it is written, and lets the player try again', () => {
    const g = play();
    const { answer, accept } = question(g);
    for (const text of [answer, answer.toUpperCase(), ` ${answer} !`, ...accept]) {
      expect(g.act('alice', 'answer', { text }), text).toEqual({
        ok: false,
        error: 'ANSWER_IS_REAL',
      });
    }
    expect(g.act('alice', 'answer', { text: OTHER })).toEqual({ ok: true });
  });

  it('opens the vote as soon as everybody has answered', () => {
    const g = play();
    for (const p of PLAYERS.slice(0, 3)) g.act(p, 'answer', { text: `${OTHER} ${p}` });
    view(g, 'alice', 'writing');
    g.act('dave', 'answer', { text: `${OTHER} dave` });
    view(g, 'alice', 'voting');
  });

  it('does not wait for a player who left for more than a minute', () => {
    const g = play();
    for (const p of PLAYERS.slice(0, 3)) g.act(p, 'answer', { text: `${OTHER} ${p}` });
    g.disconnect('dave');
    view(g, 'alice', 'writing');
    g.advance(60_000);
    view(g, 'alice', 'voting');
    expect(g.state.options).toHaveLength(4); // 3 false answers + the real one
  });

  it('"Passer à la suite" opens the vote with the answers sent so far', () => {
    const g = play();
    g.act('alice', 'answer', { text: OTHER });
    g.skip();
    expect(view(g, 'bob', 'voting').options).toHaveLength(2);
  });
});

describe('Le Bluff: voting', () => {
  it('mixes the real answer with the false ones, without telling it apart', () => {
    const g = play();
    writeAll(g);
    const v = view(g, 'alice', 'voting');
    expect(v.options).toHaveLength(5);
    expect(v.options.map((o) => o.text)).toContain(question(g).answer);
    for (const o of v.options) expect(Object.keys(o).sort()).toEqual(['id', 'mine', 'text']);
    expect(Object.keys(v).sort()).toEqual(
      [
        'count',
        'index',
        'myVote',
        'options',
        'phase',
        'players',
        'question',
        'theme',
        'voted',
      ].sort(),
    );
    // Identifiers say nothing: the real answer is not always in the same place.
    const positions = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      const other = play({ seed });
      writeAll(other);
      positions.add(other.state.options.findIndex((o) => o.real));
    }
    expect(positions.size).toBeGreaterThan(2);
  });

  it('tells each player which answers are theirs', () => {
    const g = play();
    writeAll(g);
    for (const p of PLAYERS) {
      const mine = view(g, p, 'voting').options.filter((o) => o.mine);
      expect(mine.map((o) => o.text)).toEqual([`${OTHER} de ${p}`]);
    }
  });

  it('refuses a vote for your own answer, or for an unknown one', () => {
    const g = play();
    writeAll(g);
    expect(g.act('alice', 'vote', { option: optionOf(g, 'alice') })).toEqual({
      ok: false,
      error: 'BAD_OPTION',
    });
    expect(g.act('alice', 'vote', { option: 'o99' })).toEqual({ ok: false, error: 'BAD_OPTION' });
    expect(view(g, 'alice', 'voting').myVote).toBeNull();
  });

  it('keeps a vote, once, and shows who has voted', () => {
    const g = play();
    writeAll(g);
    expect(g.act('alice', 'vote', { option: realOption(g) })).toEqual({ ok: true });
    expect(g.act('alice', 'vote', { option: optionOf(g, 'bob') })).toEqual({
      ok: false,
      error: 'ALREADY_VOTED',
    });
    expect(view(g, 'alice', 'voting').myVote).toBe(realOption(g));
    expect(view(g, 'bob', 'voting')).toMatchObject({ voted: ['alice'], myVote: null });
  });

  it('reveals the results once everybody has voted', () => {
    const g = play();
    writeAll(g);
    for (const p of PLAYERS) g.act(p, 'vote', { option: realOption(g) });
    view(g, 'alice', 'reveal');
  });

  it('merges identical answers, whatever the case or the accents, into one option', () => {
    const g = play();
    g.act('alice', 'answer', { text: 'Un éléphant' });
    g.act('bob', 'answer', { text: 'UN ELEPHANT !' });
    g.act('carol', 'answer', { text: 'Un chat' });
    g.act('dave', 'answer', { text: 'Un chien' });
    const merged = g.state.options.find((o) => o.authors.length === 2)!;
    expect(merged.authors).toEqual(['alice', 'bob']);
    expect(g.state.options).toHaveLength(4);
    // Both authors see it as theirs.
    expect(view(g, 'alice', 'voting').options.filter((o) => o.mine)).toHaveLength(1);
    expect(g.act('bob', 'vote', { option: merged.id })).toEqual({ ok: false, error: 'BAD_OPTION' });
  });
});

describe('Le Bluff: reveal and points', () => {
  /** alice and bob find the real answer; carol falls for dave's lie; dave falls for carol's. */
  function scenario() {
    const g = play();
    writeAll(g);
    g.act('alice', 'vote', { option: realOption(g) });
    g.act('bob', 'vote', { option: realOption(g) });
    g.act('carol', 'vote', { option: optionOf(g, 'dave') });
    g.act('dave', 'vote', { option: optionOf(g, 'carol') });
    return g;
  }

  it('gives 2 points for the real answer and 1 per player fooled', () => {
    const v = view(scenario(), 'alice', 'reveal');
    expect(v.gains).toEqual({ alice: 2, bob: 2, carol: 1, dave: 1 });
    expect(v.scores).toEqual(v.gains);
  });

  it('tells the real answer, who wrote each answer and who voted for it', () => {
    const g = scenario();
    const v = view(g, 'carol', 'reveal');
    expect(v.answer).toBe(question(g).answer);
    const real = v.options.find((o) => o.real)!;
    expect(real).toMatchObject({ text: question(g).answer, authors: [], voters: ['alice', 'bob'] });
    const daves = v.options.find((o) => o.authors.includes('dave'))!;
    expect(daves).toMatchObject({ real: false, voters: ['carol'] });
    const nobodys = v.options.find((o) => o.authors.includes('alice'))!;
    expect(nobodys.voters).toEqual([]);
  });

  it('gives each author of a merged answer a point for every player fooled', () => {
    const g = play();
    g.act('alice', 'answer', { text: 'Un éléphant' });
    g.act('bob', 'answer', { text: 'un elephant' });
    g.act('carol', 'answer', { text: 'Un chat' });
    g.act('dave', 'answer', { text: 'Un chien' });
    const merged = g.state.options.find((o) => o.authors.length === 2)!;
    g.act('carol', 'vote', { option: merged.id });
    g.act('dave', 'vote', { option: merged.id });
    g.act('alice', 'vote', { option: realOption(g) });
    g.act('bob', 'vote', { option: realOption(g) });
    expect(view(g, 'alice', 'reveal').gains).toEqual({ alice: 4, bob: 4 });
  });

  it('scores nothing for a player who did not vote, and does not wait for them forever', () => {
    const g = play();
    writeAll(g);
    g.act('alice', 'vote', { option: realOption(g) });
    g.act('bob', 'vote', { option: realOption(g) });
    g.act('carol', 'vote', { option: realOption(g) });
    g.disconnect('dave');
    view(g, 'alice', 'voting');
    g.advance(60_000);
    const v = view(g, 'alice', 'reveal');
    expect(v.gains).toEqual({ alice: 2, bob: 2, carol: 2 });
  });

  it('"Passer à la suite" shows the results without the missing votes', () => {
    const g = play();
    writeAll(g);
    g.act('alice', 'vote', { option: realOption(g) });
    g.skip();
    expect(view(g, 'bob', 'reveal').gains).toEqual({ alice: 2 });
  });

  it('only the host goes on, and the next question starts empty', () => {
    const g = scenario();
    expect(g.act('bob', 'next')).toEqual({ ok: false, error: 'NOT_HOST' });
    const first = question(g).id;
    expect(g.act('alice', 'next')).toEqual({ ok: true });
    const v = view(g, 'alice', 'writing');
    expect(v).toMatchObject({ index: 2, answered: [], mine: null });
    expect(question(g).id).not.toBe(first);
    // Points are kept from one question to the next.
    writeAll(g);
    for (const p of PLAYERS) g.act(p, 'vote', { option: realOption(g) });
    expect(view(g, 'alice', 'reveal').scores).toEqual({ alice: 4, bob: 4, carol: 3, dave: 3 });
  });

  it('after the last question, ends the game with the total scores', () => {
    const g = play({ rounds: 3 });
    for (let i = 1; i <= 3; i++) {
      writeAll(g);
      expect(view(g, 'alice', 'voting').count).toBe(3);
      g.act('alice', 'vote', { option: realOption(g) });
      g.act('bob', 'vote', { option: realOption(g) });
      g.act('carol', 'vote', { option: optionOf(g, 'dave') });
      g.act('dave', 'vote', { option: realOption(g) });
      expect(view(g, 'alice', 'reveal').last).toBe(i === 3);
      expect(g.ended).toBe(false);
      g.act('alice', 'next');
    }
    expect(g.ended).toBe(true);
    const totals = Object.fromEntries(g.ranking!.map((r) => [r.playerId, r.score]));
    // Per question: alice 2, bob 2, carol 0, dave 2 + 1 fooled (carol voted for dave).
    expect(totals).toEqual({ alice: 6, bob: 6, carol: 0, dave: 9 });
    expect(g.ranking![0]).toMatchObject({ playerId: 'dave', rank: 1 });
  });
});

describe('Le Bluff: a game with 3 and with 10 players', () => {
  it('works with the minimum of players', () => {
    const g = play({ players: ['alice', 'bob', 'carol'] });
    writeAll(g, ['alice', 'bob', 'carol']);
    expect(view(g, 'alice', 'voting').options).toHaveLength(4);
  });

  it('works with the maximum of players', () => {
    const players = Array.from({ length: 10 }, (_, i) => `p${i}`);
    const g = play({ players });
    writeAll(g, players);
    expect(view(g, 'p0', 'voting').options).toHaveLength(11);
    for (const p of players) g.act(p, 'vote', { option: realOption(g) });
    view(g, 'p0', 'reveal');
  });
});
