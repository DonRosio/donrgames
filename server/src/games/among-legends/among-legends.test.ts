import { describe, expect, it } from 'vitest';
import type { AmongLegendsView } from '@mini-jeux/shared/games/among-legends';
import {
  CHAMELEON_REVEAL_MS,
  TWO_FACE_PERIOD_MS,
  twoFaceModeAt,
} from '@mini-jeux/shared/games/among-legends-roles';
import type { RoleId, Team } from '@mini-jeux/shared/games/among-legends-roles';
import type { TeamStats } from '@mini-jeux/shared/games/among-legends-scoring';
import { createHarness } from '../../core/engine/harness.ts';
import { seededRandom } from '../../core/engine/random.ts';
import { validateGameDefinition } from '../../core/engine/validate.ts';
import { amongLegendsGame, drawTeamRoles } from './index.ts';

const FIVE = ['alice', 'bob', 'carol', 'dave', 'erin'];
const TEN = [...FIVE, 'fanny', 'gabin', 'hugo', 'ines', 'jules'];
const MINUTE = 60_000;

function play(players = FIVE, roles?: RoleId[], seed = 1) {
  return createHarness(amongLegendsGame, {
    players,
    seed,
    ...(roles ? { settings: { roles } } : {}),
  });
}

type G = ReturnType<typeof play>;
const view = <P extends AmongLegendsView['phase']>(g: G, player: string, phase: P) => {
  const v = g.view(player);
  expect(v.phase).toBe(phase);
  return v as AmongLegendsView & { phase: P };
};
const roleOf = (g: G, player: string) => (g.view(player) as { role: RoleId }).role;
const rolesOf = (g: G, players: readonly string[]) => players.map((p) => roleOf(g, p));
/** First seed whose draw gives this role to someone among the five players. */
function withRole(role: RoleId, roles: RoleId[]): G {
  for (let seed = 1; seed < 200; seed++) {
    const g = play(FIVE, roles, seed);
    if (rolesOf(g, FIVE).includes(role)) return g;
  }
  throw new Error(`no seed draws ${role}`);
}
const holderOf = (g: G, role: RoleId) => FIVE.find((p) => roleOf(g, p) === role)!;

describe('Among Legends: teams and roles', () => {
  it('is a valid definition', () => {
    expect(() => validateGameDefinition(amongLegendsGame)).not.toThrow();
  });

  it('keeps every playable role by default, the Droïde excepted', () => {
    const v = view(play(), 'alice', 'briefing');
    expect(v.roles).not.toContain('droid');
    expect(v.roles).toContain('impostor');
    expect(v.roles).toHaveLength(9);
  });

  it('with 5 players, skips the teams and draws 5 distinct roles, one of them the Imposteur', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = play(FIVE, undefined, seed);
      const roles = rolesOf(g, FIVE);
      expect(new Set(roles).size).toBe(5);
      expect(roles.filter((r) => r === 'impostor')).toHaveLength(1);
      expect(roles).not.toContain('droid');
      expect(Object.values(view(g, 'alice', 'briefing').teams)).toEqual(Array(5).fill('blue'));
    }
  });

  it('only draws the roles the host kept', () => {
    const kept: RoleId[] = ['impostor', 'superhero', 'snake', 'crook', 'pacifist'];
    const g = play(FIVE, kept);
    expect(rolesOf(g, FIVE).sort()).toEqual([...kept].sort());
  });

  it('never shows a player the role of another player', () => {
    const g = play();
    const v = view(g, 'alice', 'briefing');
    expect(Object.keys(v).sort()).toEqual(
      ['phase', 'read', 'role', 'roles', 'size', 'teams', 'twoFaceStart'].sort(),
    );
    expect(v.role).toBe(roleOf(g, 'alice'));
  });

  it('draws valid teams of roles whatever the selection', () => {
    const selected: RoleId[] = ['impostor', 'superhero', 'snake', 'crook', 'pacifist', 'chameleon'];
    for (let seed = 1; seed <= 50; seed++) {
      const roles = drawTeamRoles(selected, seededRandom(seed));
      expect(new Set(roles).size).toBe(5);
      expect(roles).toContain('impostor');
      for (const role of roles) expect(selected).toContain(role);
    }
  });
});

describe('Among Legends: two teams of five', () => {
  const choose = (g: G, players: readonly string[], team: 'blue' | 'red') => {
    for (const p of players) expect(g.act(p, 'chooseTeam', { team })).toEqual({ ok: true });
  };

  it('lets everyone choose a team, five per team, then the host confirms', () => {
    const g = play(TEN);
    expect(view(g, 'alice', 'teams').teams.alice).toBeNull();
    choose(g, TEN.slice(0, 5), 'blue');
    expect(g.act('fanny', 'chooseTeam', { team: 'blue' })).toEqual({
      ok: false,
      error: 'TEAM_FULL',
    });
    expect(g.act('alice', 'confirmTeams')).toEqual({ ok: false, error: 'TEAMS_INCOMPLETE' });
    choose(g, TEN.slice(5), 'red');
    // Changing team is allowed while there is room.
    expect(g.act('alice', 'chooseTeam', { team: 'blue' })).toEqual({ ok: true });
    expect(g.act('bob', 'confirmTeams')).toEqual({ ok: false, error: 'NOT_HOST' });
    expect(g.act('alice', 'confirmTeams')).toEqual({ ok: true });
    expect(view(g, 'fanny', 'briefing').teams).toMatchObject({ alice: 'blue', fanny: 'red' });
  });

  it('draws 5 distinct roles per team, each with its own Imposteur', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = play(TEN, undefined, seed);
      choose(g, TEN.slice(0, 5), 'blue');
      choose(g, TEN.slice(5), 'red');
      g.act('alice', 'confirmTeams');
      for (const team of [TEN.slice(0, 5), TEN.slice(5)]) {
        const roles = rolesOf(g, team);
        expect(new Set(roles).size).toBe(5);
        expect(roles.filter((r) => r === 'impostor')).toHaveLength(1);
      }
    }
  });
});

describe('Among Legends: during the game', () => {
  const DOUBLE_FACE: RoleId[] = ['impostor', 'two-face', 'superhero', 'snake', 'crook'];

  it('shows who read their role, and starts when the host says so', () => {
    const g = play();
    g.act('bob', 'read');
    expect(view(g, 'alice', 'briefing').read).toEqual(['bob']);
    expect(g.act('bob', 'start')).toEqual({ ok: false, error: 'NOT_HOST' });
    expect(g.act('alice', 'start')).toEqual({ ok: true });
    const v = view(g, 'bob', 'playing');
    expect(v.startedAt).toBe(g.clock.now());
    expect(v.alert).toBeNull();
  });

  it('also starts with "Passer à la suite" during the briefing', () => {
    const g = play();
    g.skip();
    view(g, 'alice', 'playing');
  });

  it('tells the Double Face its starting mode, then alerts it every 7 minutes', () => {
    const g = play(FIVE, DOUBLE_FACE);
    const twoFace = holderOf(g, 'two-face');
    const other = FIVE.find((p) => p !== twoFace)!;
    const start = view(g, twoFace, 'briefing').twoFaceStart!;
    expect(view(g, other, 'briefing').twoFaceStart).toBeNull();

    g.act('alice', 'start');
    const t0 = g.clock.now();
    expect(view(g, twoFace, 'playing').twoFace).toEqual({
      mode: start,
      nextSwitchAt: t0 + TWO_FACE_PERIOD_MS,
    });
    g.advance(TWO_FACE_PERIOD_MS - 1);
    expect(view(g, twoFace, 'playing').alert).toBeNull();
    g.advance(1);
    const flipped = view(g, twoFace, 'playing');
    expect(flipped.alert).toEqual({ seq: 1, kind: 'twoFace' });
    expect(flipped.twoFace).toEqual({
      mode: twoFaceModeAt(start, TWO_FACE_PERIOD_MS),
      nextSwitchAt: t0 + 2 * TWO_FACE_PERIOD_MS,
    });
    expect(flipped.twoFace!.mode).not.toBe(start);
    g.advance(TWO_FACE_PERIOD_MS);
    expect(view(g, twoFace, 'playing')).toMatchObject({
      alert: { seq: 2 },
      twoFace: { mode: start },
    });
    // Nobody else hears anything.
    expect(view(g, other, 'playing')).toMatchObject({ alert: null, twoFace: null });
  });

  it('reveals the real role of the Chameleon at 15 minutes, among the free roles', () => {
    const selected: RoleId[] = ['impostor', 'superhero', 'snake', 'crook', 'pacifist', 'chameleon'];
    const g = withRole('chameleon', selected);
    const chameleon = holderOf(g, 'chameleon');
    const taken = rolesOf(g, FIVE);
    const free = selected.filter((r) => !taken.includes(r));
    expect(free).toHaveLength(1);

    g.act('alice', 'start');
    const t0 = g.clock.now();
    expect(view(g, chameleon, 'playing').chameleon).toEqual({
      revealAt: t0 + CHAMELEON_REVEAL_MS,
      role: null,
    });
    g.advance(CHAMELEON_REVEAL_MS);
    expect(view(g, chameleon, 'playing')).toMatchObject({
      role: 'chameleon',
      chameleon: { role: free[0] },
      alert: { seq: 1, kind: 'chameleon' },
    });
  });

  it('turns a Chameleon into a Double Face that then switches like the others', () => {
    const selected: RoleId[] = ['impostor', 'two-face', 'superhero', 'snake', 'crook', 'chameleon'];
    let g: G | null = null;
    for (let seed = 1; seed < 300 && !g; seed++) {
      const candidate = play(FIVE, selected, seed);
      const roles = rolesOf(candidate, FIVE);
      if (roles.includes('chameleon') && !roles.includes('two-face')) g = candidate;
    }
    const chameleon = holderOf(g!, 'chameleon');
    g!.act('alice', 'start');
    g!.advance(CHAMELEON_REVEAL_MS);
    const revealed = view(g!, chameleon, 'playing');
    expect(revealed.chameleon!.role).toBe('two-face');
    expect(revealed.twoFace).not.toBeNull();
    // Next switch at 21 minutes.
    g!.advance(21 * MINUTE - CHAMELEON_REVEAL_MS);
    expect(view(g!, chameleon, 'playing').alert).toEqual({ seq: 2, kind: 'twoFace' });
  });

  it('waits for the statistics when the host says the League of Legends game is over', () => {
    const g = play();
    g.act('alice', 'start');
    expect(g.act('bob', 'end')).toEqual({ ok: false, error: 'NOT_HOST' });
    expect(g.act('alice', 'end')).toEqual({ ok: true });
    view(g, 'bob', 'stats');
    expect(g.ended).toBe(false);
  });
});

describe('Among Legends: statistics, vote and results', () => {
  const KEPT: RoleId[] = ['impostor', 'superhero', 'snake', 'crook', 'pacifist'];

  /** A valid set of answers about a team of five. */
  const stats = (team: readonly string[], override: Partial<TeamStats> = {}): TeamStats => ({
    mostKills: [team[0]!],
    fewestKills: [team[4]!],
    zeroKills: [],
    mostDeaths: [team[1]!],
    mostAssists: [team[2]!],
    mostDamage: [team[0]!],
    mostDamageTaken: [team[1]!],
    leastDamageTaken: [team[4]!],
    ...override,
  });
  const send = (g: G, winner: Team = 'blue', minutes = 30) =>
    g.act('alice', 'submitStats', { winner, minutes, teams: { blue: stats(FIVE) } });
  const guessesOf = (g: G, voter: string, players = FIVE) =>
    Object.fromEntries(players.filter((p) => p !== voter).map((p) => [p, roleOf(g, p)]));
  const everybodyVotes = (g: G) => {
    for (const p of FIVE) g.act(p, 'vote', { guesses: guessesOf(g, p) });
  };
  const started = (roles: RoleId[] = KEPT) => {
    const g = play(FIVE, roles);
    g.act('alice', 'start');
    return g;
  };
  /** The game is over: the host has not entered the statistics yet. */
  const inStats = (roles: RoleId[] = KEPT) => {
    const g = started(roles);
    g.act('alice', 'end');
    return g;
  };
  /** The host sent the statistics: everybody votes. */
  const inVoting = (roles: RoleId[] = KEPT) => {
    const g = inStats(roles);
    send(g);
    return g;
  };
  const tenInStats = () => {
    const g = play(TEN, KEPT);
    for (const p of TEN) g.act(p, 'chooseTeam', { team: TEN.indexOf(p) < 5 ? 'blue' : 'red' });
    g.act('alice', 'confirmTeams');
    g.act('alice', 'start');
    g.act('alice', 'end');
    return g;
  };

  describe('statistics', () => {
    it('come first: the others wait and nobody can vote yet', () => {
      const g = inStats();
      expect(Object.keys(view(g, 'bob', 'stats')).sort()).toEqual(
        ['phase', 'role', 'roles', 'size', 'teams'].sort(),
      );
      expect(g.act('bob', 'vote', { guesses: guessesOf(g, 'bob') })).toEqual({
        ok: false,
        error: 'WRONG_PHASE',
      });
      expect(g.act('alice', 'reveal')).toEqual({ ok: false, error: 'WRONG_PHASE' });
      g.skip();
      view(g, 'bob', 'stats');
    });

    it('stop the alarms of the game', () => {
      const g = started(['impostor', 'two-face', 'superhero', 'snake', 'crook']);
      g.advance(3 * MINUTE);
      g.act('alice', 'end');
      g.advance(30 * MINUTE);
      view(g, 'bob', 'stats');
    });

    it('are sent by the host only, and then open the vote for everybody', () => {
      const g = inStats();
      const payload = { winner: 'blue', minutes: 30, teams: { blue: stats(FIVE) } } as const;
      expect(g.act('bob', 'submitStats', payload)).toEqual({ ok: false, error: 'NOT_HOST' });
      expect(send(g)).toEqual({ ok: true });
      for (const p of FIVE) {
        expect(view(g, p, 'voting').stats).toMatchObject({
          winner: 'blue',
          minutes: 30,
          teams: { blue: stats(FIVE) },
        });
      }
    });

    it('are refused when incoherent, and then not kept', () => {
      const g = inStats();
      const attempt = (override: Partial<TeamStats>) =>
        g.act('alice', 'submitStats', {
          winner: 'blue',
          minutes: 30,
          teams: { blue: stats(FIVE, override) },
        });
      expect(attempt({ mostKills: ['zed'] })).toEqual({ ok: false, error: 'STATS_INVALID' });
      expect(attempt({ mostAssists: [] })).toEqual({ ok: false, error: 'STATS_INCOMPLETE' });
      expect(attempt({ zeroKills: ['alice'] })).toEqual({ ok: false, error: 'STATS_ZERO_KILLS' });
      expect(attempt({ mostKills: ['alice', 'erin'] })).toEqual({
        ok: false,
        error: 'STATS_OVERLAP',
      });
      view(g, 'alice', 'stats');
    });

    it('with one team, refuse a second team', () => {
      const g = inStats();
      expect(
        g.act('alice', 'submitStats', {
          winner: 'blue',
          minutes: 30,
          teams: { blue: stats(FIVE), red: stats(FIVE) },
        }),
      ).toEqual({ ok: false, error: 'STATS_INVALID' });
    });

    it('with two teams, need both, each about its own players', () => {
      const g = tenInStats();
      const blue = TEN.slice(0, 5);
      const red = TEN.slice(5);
      const submit = (teams: { blue: TeamStats; red?: TeamStats }) =>
        g.act('alice', 'submitStats', { winner: 'red', minutes: 30, teams });
      expect(submit({ blue: stats(blue) })).toEqual({ ok: false, error: 'STATS_INVALID' });
      expect(submit({ blue: stats(blue), red: stats(blue) })).toEqual({
        ok: false,
        error: 'STATS_INVALID',
      });
      expect(submit({ blue: stats(blue), red: stats(red) })).toEqual({ ok: true });
      view(g, 'jules', 'voting');
    });

    it('can be corrected by the host during the vote, for everybody', () => {
      const g = inVoting();
      g.act('bob', 'vote', { guesses: guessesOf(g, 'bob') });
      expect(send(g, 'red', 45)).toEqual({ ok: true });
      expect(view(g, 'carol', 'voting').stats).toMatchObject({ winner: 'red', minutes: 45 });
      // The votes already cast are kept.
      expect(view(g, 'carol', 'voting').voted).toEqual(['bob']);
      const payload = { winner: 'blue', minutes: 30, teams: { blue: stats(FIVE) } } as const;
      expect(g.act('bob', 'submitStats', payload)).toEqual({ ok: false, error: 'NOT_HOST' });
    });

    it('are refused before the end of the game', () => {
      expect(send(started())).toEqual({ ok: false, error: 'WRONG_PHASE' });
    });
  });

  describe('votes', () => {
    it('do not reveal any role', () => {
      const v = view(inVoting(), 'bob', 'voting');
      expect(Object.keys(v).sort()).toEqual(
        ['myGuesses', 'phase', 'role', 'roles', 'size', 'stats', 'teams', 'voted'].sort(),
      );
    });

    it('need a guess for every other player, among the roles in game', () => {
      const g = inVoting();
      const all = guessesOf(g, 'bob');
      const { alice: _alice, ...missing } = all;
      const vote = (guesses: Record<string, RoleId>) => g.act('bob', 'vote', { guesses });
      expect(vote(missing)).toEqual({ ok: false, error: 'BAD_VOTE' });
      expect(vote({ ...all, bob: 'snake' })).toEqual({ ok: false, error: 'BAD_VOTE' });
      expect(vote({ ...all, zed: 'snake' })).toEqual({ ok: false, error: 'BAD_VOTE' });
      // The Droïde is not among the roles kept.
      expect(vote({ ...all, alice: 'droid' })).toEqual({ ok: false, error: 'BAD_VOTE' });
      expect(view(g, 'bob', 'voting').myGuesses).toBeNull();
    });

    it('are final, and shown as voted to everybody', () => {
      const g = inVoting();
      expect(g.act('bob', 'vote', { guesses: guessesOf(g, 'bob') })).toEqual({ ok: true });
      expect(g.act('bob', 'vote', { guesses: guessesOf(g, 'bob') })).toEqual({
        ok: false,
        error: 'ALREADY_VOTED',
      });
      expect(view(g, 'carol', 'voting').voted).toEqual(['bob']);
      expect(view(g, 'carol', 'voting').myGuesses).toBeNull();
      expect(view(g, 'bob', 'voting').myGuesses).toEqual(guessesOf(g, 'bob'));
    });

    it('with ten players, guess the other team too: nine guesses', () => {
      const g = tenInStats();
      g.act('alice', 'submitStats', {
        winner: 'red',
        minutes: 30,
        teams: { blue: stats(TEN.slice(0, 5)), red: stats(TEN.slice(5)) },
      });
      expect(Object.keys(guessesOf(g, 'fanny', TEN))).toHaveLength(9);
      expect(g.act('fanny', 'vote', { guesses: guessesOf(g, 'fanny', TEN) })).toEqual({ ok: true });
      expect(g.act('gabin', 'vote', { guesses: guessesOf(g, 'gabin') })).toEqual({
        ok: false,
        error: 'BAD_VOTE',
      });
    });
  });

  describe('results', () => {
    it('wait for the votes, and are shown by the host only', () => {
      const g = inVoting();
      expect(g.act('alice', 'reveal')).toEqual({ ok: false, error: 'VOTES_MISSING' });
      expect(g.act('bob', 'reveal')).toEqual({ ok: false, error: 'NOT_HOST' });
      everybodyVotes(g);
      expect(g.act('alice', 'reveal')).toEqual({ ok: true });
      view(g, 'bob', 'results');
    });

    it('no longer wait for a player disconnected for a minute', () => {
      const g = inVoting();
      for (const p of FIVE.filter((x) => x !== 'erin')) {
        g.act(p, 'vote', { guesses: guessesOf(g, p) });
      }
      g.disconnect('erin');
      expect(g.act('alice', 'reveal')).toEqual({ ok: false, error: 'VOTES_MISSING' });
      g.advance(60_000);
      expect(g.act('alice', 'reveal')).toEqual({ ok: true });
      expect(view(g, 'alice', 'results').players.erin!.voted).toBe(false);
    });

    it('"Passer à la suite" shows them without the missing votes', () => {
      const g = inVoting();
      g.act('bob', 'vote', { guesses: guessesOf(g, 'bob') });
      g.skip();
      const v = view(g, 'alice', 'results');
      expect(v.players.bob!.voted).toBe(true);
      expect(v.players.carol!.voted).toBe(false);
      // Only bob voted: he is the only one who can have found carol's role.
      expect(v.players.carol!.foundBy).toEqual(['bob']);
    });

    it('reveal every role, the outcome and the points, computed by the rules', () => {
      const g = inStats();
      send(g, 'blue', 30);
      everybodyVotes(g);
      g.act('alice', 'reveal');
      const v = view(g, 'dave', 'results');
      expect(v).toMatchObject({ winner: 'blue', minutes: 30, myGuesses: guessesOf(g, 'dave') });
      // Team stats: alice most kills and damage, bob most deaths, carol most assists, erin fewest
      // kills. Victory. Everybody guessed everything: +4 for the guesses, −4 for having been
      // found (none for the Super-Héros).
      const bonus: Record<string, Record<string, number>> = {
        superhero: { alice: 2, carol: 1 },
        snake: { alice: 1, bob: 1 },
        pacifist: { erin: 1 },
      };
      const base = { impostor: -3, superhero: 2, snake: 2, crook: 2, pacifist: 2 };
      for (const p of FIVE) {
        const role = roleOf(g, p) as keyof typeof base;
        expect(v.players[p]!.role).toBe(role);
        expect(v.players[p]!.foundBy).toHaveLength(4);
        const expected = base[role] + (bonus[role]?.[p] ?? 0) + 4 - (role === 'superhero' ? 0 : 4);
        expect(v.players[p]!.total).toBe(expected);
      }
    });

    it('use the corrected statistics', () => {
      const g = inVoting();
      everybodyVotes(g);
      send(g, 'red', 30);
      g.act('alice', 'reveal');
      const v = view(g, 'alice', 'results');
      expect(v.winner).toBe('red');
      const impostor = FIVE.find((p) => roleOf(g, p) === 'impostor')!;
      // A defeat: +2 for the Imposteur.
      expect(v.players[impostor]!.lines.find((l) => l.rule === 'loss')?.points).toBe(2);
    });

    it('give the Double Face its mode at the end of the game, by the clock of the site', () => {
      const roles: RoleId[] = ['impostor', 'two-face', 'superhero', 'snake', 'crook'];
      const g = play(FIVE, roles);
      const twoFace = holderOf(g, 'two-face');
      const start = view(g, twoFace, 'briefing').twoFaceStart!;
      g.act('alice', 'start');
      g.advance(8 * MINUTE); // one switch happened
      g.act('alice', 'end');
      const finalMode = twoFaceModeAt(start, 8 * MINUTE);
      send(g, finalMode === 'ally' ? 'blue' : 'red', 8);
      everybodyVotes(g);
      g.act('alice', 'reveal');
      const player = view(g, 'alice', 'results').players[twoFace]!;
      expect(player.mode).toBe(finalMode);
      expect(player.lines.find((l) => l.rule === 'twoFaceMatch')?.points).toBe(2);
    });

    it('a Chameleon has no new role before 15 minutes, and one after', () => {
      const selected: RoleId[] = [
        'impostor',
        'superhero',
        'snake',
        'crook',
        'pacifist',
        'chameleon',
      ];
      const chameleonGame = (minutes: number) => {
        const g = withRole('chameleon', selected);
        g.act('alice', 'start');
        g.advance(minutes * MINUTE);
        g.act('alice', 'end');
        send(g, 'blue', minutes);
        everybodyVotes(g);
        g.act('alice', 'reveal');
        return view(g, 'alice', 'results').players[holderOf(g, 'chameleon')]!;
      };
      const early = chameleonGame(10);
      expect(early.revealedRole).toBeNull();
      expect(early.lines.map((l) => l.rule).sort()).toEqual(['found', 'guessRight']);
      const late = chameleonGame(20);
      expect(late.revealedRole).not.toBeNull();
      expect(late.lines.length).toBeGreaterThan(2);
    });

    it('end the game with the scores, ranked by the core', () => {
      const g = inVoting();
      everybodyVotes(g);
      g.act('alice', 'reveal');
      const results = view(g, 'alice', 'results');
      expect(g.act('bob', 'finish')).toEqual({ ok: false, error: 'NOT_HOST' });
      expect(g.act('alice', 'finish')).toEqual({ ok: true });
      expect(g.ended).toBe(true);
      const ranking = g.ranking!;
      expect(ranking).toHaveLength(5);
      for (const entry of ranking) {
        expect(entry.score).toBe(results.players[entry.playerId]!.total);
      }
      expect(ranking[0]!.rank).toBe(1);
    });
  });
});
