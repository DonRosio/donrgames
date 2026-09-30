import { describe, expect, it } from 'vitest';
import type { RoleId, Team, TwoFaceMode } from './among-legends-roles.ts';
import { computeScores, validateTeamStats } from './among-legends-scoring.ts';
import type { GameStats, ScoreRuleId, ScoringInput, TeamStats } from './among-legends-scoring.ts';

const BLUE = ['a', 'b', 'c', 'd', 'e'];
const RED = ['f', 'g', 'h', 'i', 'j'];

const noStats = (): TeamStats => ({
  mostKills: [],
  fewestKills: [],
  zeroKills: [],
  mostDeaths: [],
  mostAssists: [],
  mostDamage: [],
  mostDamageTaken: [],
  leastDamageTaken: [],
});

/** Five players (a…e); `roles` gives the role of a…e in order. Nobody votes unless told. */
function game(
  roles: RoleId[],
  overrides: Partial<Omit<ScoringInput, 'stats'>> & {
    won?: boolean;
    minutes?: number;
    named?: Partial<TeamStats>;
  } = {},
) {
  const { won = true, minutes = 30, named = {}, ...rest } = overrides;
  const stats: GameStats = {
    winner: won ? 'blue' : 'red',
    minutes,
    teams: { blue: { ...noStats(), ...named } },
  };
  const input: ScoringInput = {
    teams: Object.fromEntries(BLUE.map((id) => [id, 'blue' as Team])),
    roles: Object.fromEntries(BLUE.map((id, i) => [id, roles[i]!])),
    revealed: {},
    modes: {},
    stats,
    ballots: {},
    ...rest,
  };
  return computeScores(input);
}

const rule = (scores: ReturnType<typeof game>, id: string, name: ScoreRuleId) =>
  scores[id]!.lines.find((l) => l.rule === name)?.points ?? 0;

type Ballots = ScoringInput['ballots'];

/** Everybody guesses everybody else's role correctly. */
function perfectBallots(roles: Record<string, RoleId>) {
  return Object.fromEntries(
    Object.keys(roles).map((voter) => [
      voter,
      Object.fromEntries(Object.entries(roles).filter(([id]) => id !== voter)),
    ]),
  );
}

describe('computeScores: common rules', () => {
  it('gives nothing without votes nor performance', () => {
    const scores = game(['superhero', 'snake', 'crook', 'pacifist', 'speedrunner'], { won: true });
    expect(scores.a!.total).toBe(2);
    expect(Object.keys(scores)).toHaveLength(5);
  });

  it('+1 per correct guess, −1 per wrong one', () => {
    const roles = ['snake', 'crook', 'pacifist', 'superhero', 'impostor'] as RoleId[];
    const scores = game(roles, {
      ballots: {
        // b guesses a, c, d right and e wrong.
        b: { a: 'snake', c: 'pacifist', d: 'superhero', e: 'crook' },
      },
    });
    expect(rule(scores, 'b', 'guessRight')).toBe(3);
    expect(rule(scores, 'b', 'guessWrong')).toBe(-1);
  });

  it('+1 per voter who did not find your role, −1 per voter who did', () => {
    const roles = ['snake', 'crook', 'pacifist', 'superhero', 'impostor'] as RoleId[];
    const scores = game(roles, {
      ballots: {
        b: { a: 'snake' }, // finds a
        c: { a: 'crook' }, // misses a
        d: { a: 'pacifist' }, // misses a
      },
    });
    expect(rule(scores, 'a', 'found')).toBe(-1);
    expect(rule(scores, 'a', 'notFound')).toBe(2);
  });

  it('ignores a player who did not vote, on both sides', () => {
    const roles = ['snake', 'crook', 'pacifist', 'superhero', 'impostor'] as RoleId[];
    const scores = game(roles, { ballots: { b: { a: 'snake', c: 'pacifist' } } });
    // e and d never voted: only b counts about a.
    expect(rule(scores, 'a', 'found')).toBe(-1);
    expect(rule(scores, 'a', 'notFound')).toBe(0);
    expect(rule(scores, 'd', 'guessRight')).toBe(0);
    expect(rule(scores, 'e', 'guessWrong')).toBe(0);
  });

  it('a guess about yourself is ignored', () => {
    const roles = ['snake', 'crook', 'pacifist', 'superhero', 'impostor'] as RoleId[];
    const scores = game(roles, { ballots: { a: { a: 'snake', b: 'crook' } } });
    expect(rule(scores, 'a', 'guessRight')).toBe(1);
    expect(rule(scores, 'a', 'found')).toBe(0);
  });

  it('a perfect vote of 4 guesses is +4, and −4 for a role that all the others found', () => {
    const roles = ['snake', 'crook', 'pacifist', 'superhero', 'impostor'] as RoleId[];
    const byId = Object.fromEntries(BLUE.map((id, i) => [id, roles[i]!]));
    const scores = game(roles, { ballots: perfectBallots(byId) });
    expect(rule(scores, 'a', 'guessRight')).toBe(4);
    expect(rule(scores, 'a', 'found')).toBe(-4);
  });

  it('no malus for the Super-Héros when found, but the bonus for those who missed', () => {
    const roles = ['superhero', 'crook', 'pacifist', 'snake', 'impostor'] as RoleId[];
    const scores = game(roles, {
      ballots: { b: { a: 'superhero' }, c: { a: 'superhero' }, d: { a: 'snake' } },
    });
    expect(rule(scores, 'a', 'found')).toBe(0);
    expect(rule(scores, 'a', 'notFound')).toBe(1);
  });
});

describe('computeScores: roles', () => {
  it('Imposteur: −3 on a victory, +2 on a defeat, +2 per voter who missed it (common + own)', () => {
    const roles = ['impostor', 'snake', 'crook', 'pacifist', 'superhero'] as RoleId[];
    const ballots: Ballots = {
      b: { a: 'snake' },
      c: { a: 'crook' },
      d: { a: 'impostor' }, // finds
    };
    const win = game(roles, { won: true, ballots });
    expect(rule(win, 'a', 'win')).toBe(-3);
    expect(rule(win, 'a', 'impostorHidden')).toBe(2);
    expect(rule(win, 'a', 'notFound')).toBe(2);
    expect(rule(win, 'a', 'found')).toBe(-1);
    expect(win.a!.total).toBe(-3 + 2 + 2 - 1);
    const loss = game(roles, { won: false, ballots });
    expect(rule(loss, 'a', 'loss')).toBe(2);
    expect(loss.a!.total).toBe(2 + 2 + 2 - 1);
  });

  it('Super-Héros: +2 / −3, and a bonus for kills, assists and damage even after a defeat', () => {
    const roles = ['superhero', 'snake', 'crook', 'pacifist', 'impostor'] as RoleId[];
    const named = { mostKills: ['a'], mostAssists: ['a', 'b'], mostDamage: ['a'] };
    const win = game(roles, { won: true, named });
    expect(win.a!.total).toBe(2 + 3);
    const loss = game(roles, { won: false, named });
    expect(loss.a!.total).toBe(-3 + 3);
    expect(rule(loss, 'a', 'mostAssists')).toBe(1);
  });

  it('bonuses only go to the players named', () => {
    const roles = ['superhero', 'snake', 'crook', 'pacifist', 'impostor'] as RoleId[];
    const scores = game(roles, { named: { mostKills: ['b'], mostDamage: ['b'] } });
    expect(scores.a!.total).toBe(2);
  });

  it('Serpentin: +2 / −2, +1 for damage, +1 for deaths', () => {
    const roles = ['snake', 'superhero', 'crook', 'pacifist', 'impostor'] as RoleId[];
    const named = { mostDamage: ['a'], mostDeaths: ['a', 'c'] };
    expect(game(roles, { named }).a!.total).toBe(4);
    expect(game(roles, { named, won: false }).a!.total).toBe(0);
  });

  it('Escroc: +2 / −3, +1 per voter who names it Imposteur', () => {
    const roles = ['crook', 'snake', 'impostor', 'pacifist', 'superhero'] as RoleId[];
    const ballots: Ballots = { b: { a: 'impostor' }, c: { a: 'impostor' }, d: { a: 'crook' } };
    const win = game(roles, { ballots });
    expect(rule(win, 'a', 'crookDesignated')).toBe(2);
    // Two fooled (+2 common), one found it (−1).
    expect(win.a!.total).toBe(2 + 2 + 2 - 1);
    expect(game(roles, { ballots, won: false }).a!.total).toBe(-3 + 2 + 2 - 1);
  });

  it('Pacifiste: +2 / −2, +1 for the fewest kills and +1 more with none', () => {
    const roles = ['pacifist', 'snake', 'crook', 'superhero', 'impostor'] as RoleId[];
    expect(game(roles, { named: { fewestKills: ['a'] } }).a!.total).toBe(3);
    const none = { fewestKills: ['a'], zeroKills: ['a'] };
    expect(game(roles, { named: none }).a!.total).toBe(4);
    expect(game(roles, { named: none, won: false }).a!.total).toBe(0);
  });

  it('Speedrunner: +2 under 25 minutes, +1 later, −2 on a defeat, +2 for the damage taken', () => {
    const roles = ['speedrunner', 'snake', 'crook', 'pacifist', 'impostor'] as RoleId[];
    expect(game(roles, { minutes: 24 }).a!.total).toBe(2);
    expect(game(roles, { minutes: 25 }).a!.total).toBe(1);
    expect(game(roles, { minutes: 40 }).a!.total).toBe(1);
    expect(game(roles, { minutes: 20, won: false }).a!.total).toBe(-2);
    const hit = { mostDamageTaken: ['a'] };
    expect(game(roles, { minutes: 20, named: hit }).a!.total).toBe(4);
    expect(game(roles, { minutes: 20, named: hit, won: false }).a!.total).toBe(0);
  });

  it('Marathonien: +2 from 35 minutes, +1 sooner, −2 on a defeat, +2 for the least damage taken', () => {
    const roles = ['marathoner', 'snake', 'crook', 'pacifist', 'impostor'] as RoleId[];
    expect(game(roles, { minutes: 35 }).a!.total).toBe(2);
    expect(game(roles, { minutes: 34 }).a!.total).toBe(1);
    expect(game(roles, { minutes: 50, won: false }).a!.total).toBe(-2);
    expect(game(roles, { minutes: 40, named: { leastDamageTaken: ['a'] } }).a!.total).toBe(4);
  });

  it('Double Face: +2 when the final mode matches the result, nothing otherwise', () => {
    const roles = ['two-face', 'snake', 'crook', 'pacifist', 'impostor'] as RoleId[];
    const mode = (m: TwoFaceMode) => ({ modes: { a: m } });
    expect(game(roles, { won: true, ...mode('ally') }).a!.total).toBe(2);
    expect(game(roles, { won: false, ...mode('impostor') }).a!.total).toBe(2);
    expect(game(roles, { won: true, ...mode('impostor') }).a!.total).toBe(0);
    expect(game(roles, { won: false, ...mode('ally') }).a!.total).toBe(0);
  });
});

describe('computeScores: Chameleon', () => {
  const roles = ['chameleon', 'snake', 'crook', 'pacifist', 'impostor'] as RoleId[];

  it('before 15 minutes (no revealed role): only the common rules', () => {
    const scores = game(roles, {
      won: true,
      ballots: { b: { a: 'chameleon' }, c: { a: 'snake' } },
    });
    expect(scores.a!.lines.map((l) => l.rule).sort()).toEqual(['found', 'notFound']);
    expect(scores.a!.total).toBe(0);
  });

  it('plays the points of its new role, +1 when it fulfils the mission', () => {
    const named = { mostDeaths: ['a'], mostDamage: ['a'] };
    const done = game(roles, { revealed: { a: 'snake' }, named });
    // Snake: +2, +1 damage, +1 deaths, mission +1.
    expect(done.a!.total).toBe(5);
    expect(rule(done, 'a', 'chameleonMission')).toBe(1);
    // Only one of the two conditions of the Snake's mission.
    const partial = game(roles, { revealed: { a: 'snake' }, named: { mostDamage: ['a'] } });
    expect(partial.a!.total).toBe(3);
    expect(rule(partial, 'a', 'chameleonMission')).toBe(0);
  });

  it('is voted on as Caméléon, whatever its new role', () => {
    const ballots: Ballots = { b: { a: 'chameleon' }, c: { a: 'snake' } };
    const scores = game(roles, { revealed: { a: 'snake' }, ballots });
    expect(rule(scores, 'a', 'found')).toBe(-1);
    expect(rule(scores, 'a', 'notFound')).toBe(1);
  });

  it('has no malus when found as a Super-Héros (current role)', () => {
    const ballots: Ballots = { b: { a: 'chameleon' }, c: { a: 'chameleon' } };
    const scores = game(roles, { revealed: { a: 'superhero' }, ballots });
    expect(rule(scores, 'a', 'found')).toBe(0);
    // Super-Héros: +2, mission (win) +1.
    expect(scores.a!.total).toBe(3);
  });

  it('missions by role', () => {
    const mission = (revealed: RoleId, over = {}) =>
      rule(game(roles, { revealed: { a: revealed }, ...over }), 'a', 'chameleonMission');
    expect(mission('superhero')).toBe(1);
    expect(mission('superhero', { won: false })).toBe(0);
    expect(mission('pacifist', { named: { fewestKills: ['a'] } })).toBe(1);
    expect(mission('pacifist')).toBe(0);
    expect(mission('speedrunner', { minutes: 24 })).toBe(1);
    expect(mission('speedrunner', { minutes: 26 })).toBe(0);
    expect(mission('marathoner', { minutes: 36 })).toBe(1);
    expect(mission('marathoner', { minutes: 30 })).toBe(0);
    expect(mission('two-face', { modes: { a: 'ally' } })).toBe(1);
    expect(mission('two-face', { modes: { a: 'impostor' } })).toBe(0);
    expect(mission('two-face', { modes: { a: 'impostor' }, won: false })).toBe(1);
  });

  it('Escroc mission: a victory and at least half of the voters name it Imposteur', () => {
    const half: Ballots = {
      b: { a: 'impostor' },
      c: { a: 'impostor' },
      d: { a: 'snake' },
      e: { a: 'snake' },
    };
    const one: Ballots = {
      b: { a: 'impostor' },
      c: { a: 'snake' },
      d: { a: 'snake' },
      e: { a: 'snake' },
    };
    const mission = (ballots: Ballots, won = true) =>
      rule(game(roles, { revealed: { a: 'crook' }, ballots, won }), 'a', 'chameleonMission');
    expect(mission(half)).toBe(1);
    expect(mission(one)).toBe(0);
    expect(mission(half, false)).toBe(0);
    expect(mission({})).toBe(0);
  });
});

describe('computeScores: two teams', () => {
  it('compares each player with their own team only, and a single victory', () => {
    const teams: Record<string, Team> = {
      ...Object.fromEntries(BLUE.map((id) => [id, 'blue' as Team])),
      ...Object.fromEntries(RED.map((id) => [id, 'red' as Team])),
    };
    const roles: Record<string, RoleId> = {
      a: 'superhero',
      f: 'superhero',
      b: 'snake',
      c: 'crook',
      d: 'pacifist',
      e: 'impostor',
      g: 'snake',
      h: 'crook',
      i: 'pacifist',
      j: 'impostor',
    };
    const scores = computeScores({
      teams,
      roles,
      revealed: {},
      modes: {},
      stats: {
        winner: 'red',
        minutes: 30,
        teams: {
          blue: { ...noStats(), mostKills: ['a'] },
          red: { ...noStats(), mostKills: ['f'], mostAssists: ['f'] },
        },
      },
      ballots: {},
    });
    expect(scores.a!.total).toBe(-3 + 1); // blue lost, most kills
    expect(scores.f!.total).toBe(2 + 2); // red won, most kills + assists
    expect(scores.e!.total).toBe(2); // blue impostor, defeat
    expect(scores.j!.total).toBe(-3);
  });

  it('counts the guesses about the other team like any other', () => {
    const teams: Record<string, Team> = {
      ...Object.fromEntries(BLUE.map((id) => [id, 'blue' as Team])),
      ...Object.fromEntries(RED.map((id) => [id, 'red' as Team])),
    };
    const roles: Record<string, RoleId> = Object.fromEntries(
      [...BLUE, ...RED].map((id, i) => [id, (i % 2 ? 'snake' : 'crook') as RoleId]),
    );
    const scores = computeScores({
      teams,
      roles,
      revealed: {},
      modes: {},
      stats: { winner: 'blue', minutes: 30, teams: { blue: noStats(), red: noStats() } },
      ballots: { a: { f: roles.f!, g: 'impostor' } },
    });
    expect(rule(scores, 'a', 'guessRight')).toBe(1);
    expect(rule(scores, 'a', 'guessWrong')).toBe(-1);
    expect(rule(scores, 'f', 'found')).toBe(-1);
    expect(rule(scores, 'g', 'notFound')).toBe(1);
  });
});

describe('computeScores: breakdown', () => {
  it('sums its lines and leaves out those worth nothing', () => {
    const roles = ['superhero', 'snake', 'crook', 'pacifist', 'impostor'] as RoleId[];
    const scores = game(roles, { named: { mostKills: ['a'] }, ballots: { b: { a: 'snake' } } });
    for (const { total, lines } of Object.values(scores)) {
      expect(lines.reduce((sum, l) => sum + l.points, 0)).toBe(total);
      expect(lines.every((l) => l.points !== 0 && l.count > 0)).toBe(true);
    }
  });
});

describe('validateTeamStats', () => {
  const valid = (): TeamStats => ({
    mostKills: ['a'],
    fewestKills: ['e'],
    zeroKills: [],
    mostDeaths: ['b', 'c'],
    mostAssists: ['d'],
    mostDamage: ['a'],
    mostDamageTaken: ['b'],
    leastDamageTaken: ['e'],
  });

  it('accepts complete, coherent answers (ties allowed)', () => {
    expect(validateTeamStats(valid(), BLUE)).toBeNull();
  });

  it('rejects a player outside the team, or twice', () => {
    expect(validateTeamStats({ ...valid(), mostKills: ['z'] }, BLUE)).toBe('STATS_INVALID');
    expect(validateTeamStats({ ...valid(), mostKills: ['a', 'a'] }, BLUE)).toBe('STATS_INVALID');
  });

  it('needs an answer to every question, except the zero kills', () => {
    expect(validateTeamStats({ ...valid(), mostAssists: [] }, BLUE)).toBe('STATS_INCOMPLETE');
    expect(validateTeamStats({ ...valid(), zeroKills: [] }, BLUE)).toBeNull();
  });

  it('the fewest kills must be the players with zero kill, when there are some', () => {
    const zero = { ...valid(), zeroKills: ['e'] };
    expect(validateTeamStats(zero, BLUE)).toBeNull();
    expect(validateTeamStats({ ...zero, fewestKills: ['d'] }, BLUE)).toBe('STATS_ZERO_KILLS');
    expect(validateTeamStats({ ...zero, fewestKills: ['d', 'e'] }, BLUE)).toBe('STATS_ZERO_KILLS');
  });

  it('most and fewest cannot share a player, unless the whole team is tied', () => {
    expect(validateTeamStats({ ...valid(), mostKills: ['a', 'e'] }, BLUE)).toBe('STATS_OVERLAP');
    expect(validateTeamStats({ ...valid(), leastDamageTaken: ['b'] }, BLUE)).toBe('STATS_OVERLAP');
    const tied = { ...valid(), mostKills: BLUE, fewestKills: BLUE };
    expect(validateTeamStats(tied, BLUE)).toBeNull();
  });
});
