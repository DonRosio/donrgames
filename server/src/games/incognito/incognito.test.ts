import { describe, expect, it } from 'vitest';
import type { IncognitoView } from '@mini-jeux/shared/games/incognito';
import { ALIAS_NAMES } from '@mini-jeux/shared/games/incognito-data';
import { createHarness } from '../../core/engine/harness.ts';
import { validateGameDefinition } from '../../core/engine/validate.ts';
import { incognitoGame } from './index.ts';

const PLAYERS = ['alice', 'bob', 'carol', 'dave'];
const QUESTIONS = Array.from({ length: 40 }, (_, index) => ({
  id: `q${index}`,
  title: `question ${index}`,
  durationMs: 0,
}));

function play(questions = 2, players = PLAYERS) {
  return createHarness(incognitoGame, { players, settings: { questions }, content: QUESTIONS });
}

type G = ReturnType<typeof play>;
const view = <P extends IncognitoView['phase']>(g: G, player: string, phase: P) => {
  const v = g.view(player);
  expect(v.phase).toBe(phase);
  return v as IncognitoView & { phase: P };
};
/** The secret of the game: the first name of a player, and the player behind a first name. */
const aliasOf = (g: G, player: string) => g.state.aliasOf.get(player)!;
const personOf = (g: G, alias: string) => g.state.playerOf.get(alias)!;

/** Everybody answers the current question (the last answer moves the game on). */
function answerAll(g: G, players = PLAYERS) {
  const { index } = view(g, players[0]!, 'chat');
  for (const player of players) {
    expect(g.act(player, 'answer', { question: index, text: `${player} ${index}` })).toEqual({
      ok: true,
    });
  }
}
const toMatching = (g: G, questions = 2) => {
  for (let i = 0; i < questions; i++) answerAll(g);
  expect(g.phase).toBe('matching');
};

/** The links of a player: the truth, or all wrong (every person moved to the next first name). */
function links(g: G, player: string, correct: boolean, players = PLAYERS) {
  const others = players.filter((id) => id !== player);
  const aliases = others.map((id) => aliasOf(g, id));
  const persons = correct ? others : [...others.slice(1), others[0]!];
  return aliases.map((alias, index) => ({ alias, player: persons[index]! }));
}
function confirmAll(g: G, correct: (player: string) => boolean, players = PLAYERS) {
  for (const player of players) {
    expect(g.act(player, 'guess', { links: links(g, player, correct(player), players) })).toEqual({
      ok: true,
    });
    expect(g.act(player, 'confirm')).toEqual({ ok: true });
  }
}

describe('Incognito', () => {
  it('is a valid definition', () => {
    expect(() => validateGameDefinition(incognitoGame)).not.toThrow();
  });

  it('draws distinct questions and marks them as asked in the room', () => {
    const g = play(8);
    expect(new Set(g.state.questions).size).toBe(8);
    expect(g.played).toHaveLength(8);
    expect(view(g, 'alice', 'chat').total).toBe(8);
  });

  it('gives every player their own first name, from the list', () => {
    const g = play();
    const names = g.state.aliases.map((alias) => alias.name);
    expect(new Set(names).size).toBe(4);
    for (const name of names) expect(ALIAS_NAMES).toContain(name);
    expect(g.state.aliases.map((alias) => alias.slot)).toEqual([0, 1, 2, 3]);
    const mine = PLAYERS.map((player) => view(g, player, 'chat').me);
    expect(new Set(mine).size).toBe(4);
    expect(mine.toSorted()).toEqual(g.state.aliases.map((alias) => alias.id).toSorted());
  });

  it('never gives a first name that looks like a nickname of the room', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = createHarness(incognitoGame, {
        players: ['paul', 'léo', 'ADRIEN', 'hugo'],
        settings: { questions: 1 },
        content: QUESTIONS,
        seed,
      });
      const names = g.state.aliases.map((alias) => alias.name);
      expect(names).not.toContain('Paul');
      expect(names).not.toContain('Léo');
      expect(names).not.toContain('Adrien');
    }
  });

  it('never tells who is behind a first name during the chat', () => {
    const g = play();
    g.act('alice', 'answer', { question: 1, text: 'je suis alice' });
    for (const player of PLAYERS) {
      const json = JSON.stringify(view(g, player, 'chat'));
      for (const id of PLAYERS) expect(json).not.toContain(`"${id}"`);
    }
    // Everybody sees the answer under Alice's first name, and that this name answered.
    const bob = view(g, 'bob', 'chat');
    expect(bob.rounds).toEqual([
      {
        question: g.state.questions[0],
        answers: [{ alias: aliasOf(g, 'alice'), text: 'je suis alice' }],
      },
    ]);
    expect(bob.answered).toEqual([aliasOf(g, 'alice')]);
  });

  describe('chat', () => {
    it('takes one answer per question and per player', () => {
      const g = play(3);
      expect(g.act('alice', 'answer', { question: 1, text: 'une' })).toEqual({ ok: true });
      expect(g.act('alice', 'answer', { question: 1, text: 'deux' })).toEqual({
        ok: false,
        error: 'ALREADY_ANSWERED',
      });
      expect(view(g, 'alice', 'chat').rounds[0]!.answers).toHaveLength(1);
    });

    it('refuses an answer to another question than the current one', () => {
      const g = play(3);
      expect(g.act('alice', 'answer', { question: 2, text: 'trop tôt' })).toEqual({
        ok: false,
        error: 'STALE_QUESTION',
      });
      answerAll(g);
      expect(g.act('alice', 'answer', { question: 1, text: 'trop tard' })).toEqual({
        ok: false,
        error: 'STALE_QUESTION',
      });
    });

    it('refuses an empty or too long answer, and trims the others', () => {
      const g = play();
      for (const text of ['', '   ', 'x'.repeat(121)]) {
        expect(g.act('alice', 'answer', { question: 1, text })).toEqual({
          ok: false,
          error: 'INVALID_PAYLOAD',
        });
      }
      expect(g.act('alice', 'answer', { question: 1, text: '  salut  ' })).toEqual({ ok: true });
      expect(view(g, 'alice', 'chat').rounds[0]!.answers[0]!.text).toBe('salut');
    });

    it('moves to the next question when everybody answered, then to the matching', () => {
      const g = play(2);
      for (const player of ['alice', 'bob', 'carol']) {
        g.act(player, 'answer', { question: 1, text: 'ok' });
      }
      expect(view(g, 'dave', 'chat').index).toBe(1);
      g.act('dave', 'answer', { question: 1, text: 'ok' });
      const second = view(g, 'dave', 'chat');
      expect(second.index).toBe(2);
      expect(second.rounds).toHaveLength(2);
      expect(second.answered).toEqual([]);
      expect(second.rounds[0]!.answers).toHaveLength(4);
      answerAll(g);
      expect(g.phase).toBe('matching');
    });

    it('lets the host skip a question for the late ones', () => {
      const g = play(2);
      g.act('alice', 'answer', { question: 1, text: 'seule' });
      expect(g.skip()).toEqual({ ok: true });
      const v = view(g, 'bob', 'chat');
      expect(v.index).toBe(2);
      expect(v.rounds[0]!.answers).toHaveLength(1);
      // Skipping the last question leads to the matching.
      g.skip();
      expect(g.phase).toBe('matching');
    });

    it('stops waiting for a player disconnected for a minute', () => {
      const g = play(2);
      g.disconnect('dave');
      for (const player of ['alice', 'bob', 'carol']) {
        g.act(player, 'answer', { question: 1, text: 'ok' });
      }
      // Dave is still awaited during the grace delay.
      expect(view(g, 'alice', 'chat').index).toBe(1);
      g.advance(61_000);
      expect(view(g, 'alice', 'chat').index).toBe(2);
    });

    it('stops waiting for a player who left', () => {
      const g = play(2);
      for (const player of ['alice', 'bob', 'carol']) {
        g.act(player, 'answer', { question: 1, text: 'ok' });
      }
      g.leave('dave');
      expect(view(g, 'alice', 'chat').index).toBe(2);
    });

    it('keeps notes private, and refuses them on one’s own first name', () => {
      const g = play();
      const bobName = aliasOf(g, 'bob');
      expect(g.act('alice', 'note', { alias: bobName, text: '  c’est Bob ?  ' })).toEqual({
        ok: true,
      });
      expect(view(g, 'alice', 'chat').notes).toEqual({ [bobName]: 'c’est Bob ?' });
      for (const other of ['bob', 'carol', 'dave']) {
        expect(view(g, other, 'chat').notes).toEqual({});
      }
      expect(g.act('alice', 'note', { alias: aliasOf(g, 'alice'), text: 'moi' })).toEqual({
        ok: false,
        error: 'OWN_ALIAS',
      });
      expect(g.act('alice', 'note', { alias: 'zz', text: 'x' })).toEqual({
        ok: false,
        error: 'UNKNOWN_ALIAS',
      });
      expect(g.act('alice', 'note', { alias: bobName, text: 'x'.repeat(31) })).toEqual({
        ok: false,
        error: 'INVALID_PAYLOAD',
      });
      expect(g.act('alice', 'note', { alias: bobName, text: '' })).toEqual({ ok: true });
      expect(view(g, 'alice', 'chat').notes).toEqual({});
    });

    it('refuses the matching actions during the chat', () => {
      const g = play();
      expect(g.act('alice', 'guess', { links: [] })).toEqual({ ok: false, error: 'WRONG_PHASE' });
      expect(g.act('alice', 'confirm')).toEqual({ ok: false, error: 'WRONG_PHASE' });
      expect(g.act('alice', 'next')).toEqual({ ok: false, error: 'WRONG_PHASE' });
    });
  });

  describe('matching', () => {
    it('shows every first name and every person, with the whole history', () => {
      const g = play();
      g.act('alice', 'note', { alias: aliasOf(g, 'bob'), text: 'Bob' });
      toMatching(g);
      const v = view(g, 'alice', 'matching');
      expect(v.aliases).toHaveLength(4);
      expect(v.people.map((p) => p.id).toSorted()).toEqual(PLAYERS);
      expect(v.rounds).toHaveLength(2);
      expect(v.rounds.every((round) => round.answers.length === 4)).toBe(true);
      expect(v.notes).toEqual({ [aliasOf(g, 'bob')]: 'Bob' });
      expect(v.links).toEqual({});
      expect(v.confirmed).toBe(false);
      // The viewer's own first name is known; nothing else ties a first name to a player.
      expect(v.me).toBe(aliasOf(g, 'alice'));
      expect(Object.keys(v).toSorted()).toEqual([
        'aliases',
        'confirmed',
        'confirmedBy',
        'links',
        'me',
        'notes',
        'people',
        'phase',
        'rounds',
      ]);
    });

    it('keeps a partial draft, and replaces it as a whole', () => {
      const g = play();
      toMatching(g);
      const [first, second] = links(g, 'alice', true);
      expect(g.act('alice', 'guess', { links: [first!, second!] })).toEqual({ ok: true });
      expect(view(g, 'alice', 'matching').links).toEqual({
        [first!.alias]: first!.player,
        [second!.alias]: second!.player,
      });
      expect(g.act('alice', 'guess', { links: [second!] })).toEqual({ ok: true });
      expect(view(g, 'alice', 'matching').links).toEqual({ [second!.alias]: second!.player });
      // Private: the others never see it.
      expect(view(g, 'bob', 'matching').links).toEqual({});
    });

    it('refuses links that are not one per first name and per person, or that involve oneself', () => {
      const g = play();
      toMatching(g);
      const bobName = aliasOf(g, 'bob');
      const carolName = aliasOf(g, 'carol');
      const attempt = (list: { alias: string; player: string }[]) =>
        g.act('alice', 'guess', { links: list });
      expect(attempt([{ alias: 'zz', player: 'bob' }])).toEqual({
        ok: false,
        error: 'UNKNOWN_ALIAS',
      });
      expect(attempt([{ alias: bobName, player: 'mallory' }])).toEqual({
        ok: false,
        error: 'UNKNOWN_PLAYER',
      });
      // One's own first name, or oneself as a person.
      expect(attempt([{ alias: aliasOf(g, 'alice'), player: 'bob' }])).toEqual({
        ok: false,
        error: 'BAD_GUESS',
      });
      expect(attempt([{ alias: bobName, player: 'alice' }])).toEqual({
        ok: false,
        error: 'BAD_GUESS',
      });
      // The same first name twice, or the same person twice.
      expect(
        attempt([
          { alias: bobName, player: 'bob' },
          { alias: bobName, player: 'carol' },
        ]),
      ).toEqual({ ok: false, error: 'BAD_GUESS' });
      expect(
        attempt([
          { alias: bobName, player: 'bob' },
          { alias: carolName, player: 'bob' },
        ]),
      ).toEqual({ ok: false, error: 'BAD_GUESS' });
      // A refused draft changes nothing.
      expect(view(g, 'alice', 'matching').links).toEqual({});
    });

    it('needs every first name linked to confirm, then locks the matching', () => {
      const g = play();
      toMatching(g);
      const all = links(g, 'alice', true);
      expect(g.act('alice', 'confirm')).toEqual({ ok: false, error: 'GUESS_INCOMPLETE' });
      g.act('alice', 'guess', { links: all.slice(0, 2) });
      expect(g.act('alice', 'confirm')).toEqual({ ok: false, error: 'GUESS_INCOMPLETE' });
      g.act('alice', 'guess', { links: all });
      expect(g.act('alice', 'confirm')).toEqual({ ok: true });
      expect(view(g, 'bob', 'matching').confirmedBy).toEqual(['alice']);
      expect(view(g, 'alice', 'matching').confirmed).toBe(true);
      expect(g.act('alice', 'confirm')).toEqual({ ok: false, error: 'ALREADY_CONFIRMED' });
      expect(g.act('alice', 'guess', { links: [] })).toEqual({
        ok: false,
        error: 'ALREADY_CONFIRMED',
      });
      // Notes stay editable.
      expect(g.act('alice', 'note', { alias: aliasOf(g, 'bob'), text: 'sûr' })).toEqual({
        ok: true,
      });
    });

    it('goes to the reveal when the last one confirms', () => {
      const g = play();
      toMatching(g);
      for (const player of ['alice', 'bob', 'carol']) {
        g.act(player, 'guess', { links: links(g, player, true) });
        g.act(player, 'confirm');
      }
      expect(g.phase).toBe('matching');
      g.act('dave', 'guess', { links: links(g, 'dave', true) });
      g.act('dave', 'confirm');
      expect(g.phase).toBe('reveal');
    });

    it('stops waiting for a player who left', () => {
      const g = play();
      toMatching(g);
      for (const player of ['alice', 'bob', 'carol']) {
        g.act(player, 'guess', { links: links(g, player, true) });
        g.act(player, 'confirm');
      }
      expect(g.phase).toBe('matching');
      g.leave('dave');
      expect(g.phase).toBe('reveal');
    });

    it('lets the host go on with the drafts as they are', () => {
      const g = play();
      toMatching(g);
      g.act('alice', 'guess', { links: links(g, 'alice', true).slice(0, 1) });
      expect(g.skip()).toEqual({ ok: true });
      expect(g.phase).toBe('reveal');
      expect(view(g, 'alice', 'reveal').myLinks).toEqual({
        [links(g, 'alice', true)[0]!.alias]: links(g, 'alice', true)[0]!.player,
      });
    });
  });

  describe('reveal', () => {
    it('unmasks one person per click of the host, then ends with the ranking', () => {
      const g = play();
      toMatching(g);
      confirmAll(g, () => true);
      expect(view(g, 'bob', 'reveal').pairs).toEqual([]);
      expect(g.act('bob', 'next')).toEqual({ ok: false, error: 'NOT_HOST' });
      for (let shown = 1; shown <= 4; shown++) {
        expect(g.act('alice', 'next')).toEqual({ ok: true });
        const pairs = view(g, 'bob', 'reveal').pairs;
        expect(pairs).toHaveLength(shown);
        // Every pair is the truth, and every revealed person is new.
        for (const pair of pairs) expect(personOf(g, pair.alias)).toBe(pair.person);
        expect(new Set(pairs.map((pair) => pair.person)).size).toBe(shown);
      }
      expect(g.ended).toBe(false);
      expect(g.act('alice', 'next')).toEqual({ ok: true });
      expect(g.ended).toBe(true);
    });

    it('tells who found each person, and counts the points as the pairs are unmasked', () => {
      const g = play();
      toMatching(g);
      // Alice and Bob find everybody; Carol and Dave find nobody.
      confirmAll(g, (player) => player === 'alice' || player === 'bob');
      g.act('alice', 'next');
      const first = view(g, 'carol', 'reveal');
      const person = first.pairs[0]!.person;
      expect(first.pairs[0]!.foundBy.toSorted()).toEqual(
        ['alice', 'bob'].filter((player) => player !== person),
      );
      expect(first.scores.find((s) => s.playerId === 'alice')!.score).toBe(
        person === 'alice' ? 0 : 1,
      );
      for (let i = 0; i < 3; i++) g.act('alice', 'next');
      const last = view(g, 'carol', 'reveal');
      const byPlayer = Object.fromEntries(last.scores.map((s) => [s.playerId, s.score]));
      expect(byPlayer).toEqual({ alice: 3, bob: 3, carol: 0, dave: 0 });
    });

    it('gives each player a view of their own links', () => {
      const g = play();
      toMatching(g);
      confirmAll(g, () => true);
      const mine = view(g, 'carol', 'reveal').myLinks;
      expect(mine).toEqual(
        Object.fromEntries(links(g, 'carol', true).map((l) => [l.alias, l.player])),
      );
    });

    it('ranks the players by correct links at the end (ties share a rank)', () => {
      const g = play();
      toMatching(g);
      confirmAll(g, (player) => player !== 'dave');
      for (let i = 0; i < 5; i++) g.act('alice', 'next');
      expect(g.ranking).toEqual([
        { playerId: expect.any(String), score: 3, rank: 1 },
        { playerId: expect.any(String), score: 3, rank: 1 },
        { playerId: expect.any(String), score: 3, rank: 1 },
        { playerId: 'dave', score: 0, rank: 4 },
      ]);
    });

    it('counts the points of a player who left, and still unmasks them', () => {
      const g = play();
      toMatching(g);
      confirmAll(g, () => true);
      g.leave('dave');
      for (let i = 0; i < 4; i++) g.act('alice', 'next');
      expect(
        view(g, 'alice', 'reveal')
          .pairs.map((p) => p.person)
          .toSorted(),
      ).toEqual(PLAYERS);
    });
  });

  it('plays a whole game with ten players', () => {
    const players = Array.from({ length: 10 }, (_, index) => `p${index}`);
    const g = play(30, players);
    expect(view(g, 'p0', 'chat').total).toBe(30);
    for (let i = 0; i < 30; i++) answerAll(g, players);
    expect(g.phase).toBe('matching');
    confirmAll(g, () => true, players);
    for (let i = 0; i < 11; i++) g.act('p0', 'next');
    expect(g.ended).toBe(true);
    expect(g.ranking!.every((entry) => entry.score === 9 && entry.rank === 1)).toBe(true);
  });
});
