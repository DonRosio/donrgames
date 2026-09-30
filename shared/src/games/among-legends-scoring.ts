// End-of-game data and scoring of Among Legends: plain data and pure functions, shared by the
// server (validation, points) and the client (form, labels of the score breakdown). No zod here.
// The rules themselves are told to the players in among-legends-roles.ts: keep both in sync.

import type { RoleId, Team, TwoFaceMode } from './among-legends-roles.ts';

/** The Speedrunner must win under this duration, the Marathonien at or over the other one. */
export const SPEEDRUN_LIMIT_MIN = 25;
export const MARATHON_LIMIT_MIN = 35;

/** Questions of the end-of-game form, asked for each team, in this order. */
export const STAT_KEYS = [
  'mostKills',
  'fewestKills',
  'zeroKills',
  'mostDeaths',
  'mostAssists',
  'mostDamage',
  'mostDamageTaken',
  'leastDamageTaken',
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

/** For every question, the allies concerned (several on a tie); none is allowed for `zeroKills`. */
export type TeamStats = Record<StatKey, string[]>;

export const STAT_LABELS: Readonly<Record<StatKey, string>> = {
  mostKills: 'Le plus de kills',
  fewestKills: 'Le moins de kills',
  zeroKills: 'Joueurs à 0 kill',
  mostDeaths: 'Le plus de morts',
  mostAssists: "Le plus d'assists",
  mostDamage: 'Le plus de dégâts infligés',
  mostDamageTaken: 'Le plus de dégâts subis',
  leastDamageTaken: 'Le moins de dégâts subis',
};

/** What the host reads on the end screen of League of Legends. */
export interface GameStats {
  /** With one team, "red" stands for a defeat. */
  winner: Team;
  /** Minutes of the game, read on the end screen. */
  minutes: number;
  /** One entry per team that plays: `blue`, plus `red` with ten players. */
  teams: { blue: TeamStats; red?: TeamStats };
}

/** Codes of the errors found in the stats of a team. */
export type StatsError =
  'STATS_INVALID' | 'STATS_INCOMPLETE' | 'STATS_ZERO_KILLS' | 'STATS_OVERLAP';

const OPPOSITES: readonly (readonly [StatKey, StatKey])[] = [
  ['mostKills', 'fewestKills'],
  ['mostDamageTaken', 'leastDamageTaken'],
];

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

/**
 * Checks the answers about one team against its members: only members, no duplicate, at least
 * one player per question (`zeroKills` may be empty), coherent zero-kill answer, and opposite
 * questions (most / fewest) sharing nobody unless the whole team is tied.
 */
export function validateTeamStats(stats: TeamStats, members: readonly string[]): StatsError | null {
  for (const key of STAT_KEYS) {
    const answer = stats[key];
    if (new Set(answer).size !== answer.length) return 'STATS_INVALID';
    if (answer.some((id) => !members.includes(id))) return 'STATS_INVALID';
  }
  // Incoherences come before the missing answers, so that a form being filled points them out.
  if (
    stats.zeroKills.length > 0 &&
    stats.fewestKills.length > 0 &&
    !sameSet(stats.zeroKills, stats.fewestKills)
  ) {
    return 'STATS_ZERO_KILLS';
  }
  for (const [most, least] of OPPOSITES) {
    const shared = stats[most].some((id) => stats[least].includes(id));
    const wholeTeam =
      stats[most].length === members.length && stats[least].length === members.length;
    if (shared && !wholeTeam) return 'STATS_OVERLAP';
  }
  if (STAT_KEYS.some((key) => key !== 'zeroKills' && stats[key].length === 0)) {
    return 'STATS_INCOMPLETE';
  }
  return null;
}

export type ScoreRuleId =
  | StatKey
  | 'guessRight'
  | 'guessWrong'
  | 'found'
  | 'notFound'
  | 'win'
  | 'loss'
  | 'winUnder25'
  | 'winOver25'
  | 'winOver35'
  | 'winUnder35'
  | 'impostorHidden'
  | 'crookDesignated'
  | 'twoFaceMatch'
  | 'chameleonMission';

/** One line of the score breakdown of a player: `count` occurrences worth `points` in total. */
export interface ScoreLine {
  rule: ScoreRuleId;
  count: number;
  points: number;
}

export interface PlayerScore {
  total: number;
  lines: ScoreLine[];
}

export const SCORE_LABELS: Readonly<Record<ScoreRuleId, string>> = {
  ...STAT_LABELS,
  guessRight: 'Rôles bien devinés',
  guessWrong: 'Rôles mal devinés',
  found: 'Joueurs qui ont trouvé ton rôle',
  notFound: "Joueurs qui n'ont pas trouvé ton rôle",
  win: 'Victoire',
  loss: 'Défaite',
  winUnder25: `Victoire en moins de ${SPEEDRUN_LIMIT_MIN} min`,
  winOver25: `Victoire après ${SPEEDRUN_LIMIT_MIN} min`,
  winOver35: `Victoire après ${MARATHON_LIMIT_MIN} min`,
  winUnder35: `Victoire avant ${MARATHON_LIMIT_MIN} min`,
  impostorHidden: "Joueurs qui ne t'ont pas désigné comme Imposteur",
  crookDesignated: "Joueurs qui t'ont désigné comme Imposteur",
  twoFaceMatch: 'Mode final en accord avec le résultat',
  chameleonMission: 'Mission de ton nouveau rôle remplie',
};

export interface ScoringInput {
  /** Every participant and their team. */
  teams: Readonly<Record<string, Team>>;
  /** Role drawn for each player (a Chameleon stays a Chameleon here). */
  roles: Readonly<Record<string, RoleId>>;
  /** Real role of each Chameleon that discovered it (game longer than 15 minutes). */
  revealed: Readonly<Record<string, RoleId>>;
  /** Mode at the end of the game of every player whose current role is Double Face. */
  modes: Readonly<Record<string, TwoFaceMode>>;
  stats: GameStats;
  /** Guesses of each voter: target → role. Players without a ballot are ignored. */
  ballots: Readonly<Record<string, Readonly<Record<string, RoleId>>>>;
}

interface Facts {
  won: boolean;
  minutes: number;
  /** The player is among those named for this question (in their own team). */
  named(key: StatKey): boolean;
  mode: TwoFaceMode | undefined;
  /** Voters who named this player Imposteur, and all voters who voted on this player. */
  designated: number;
  voters: number;
  /** Voters who did not find this player's real role. */
  hidden: number;
}

interface RoleOutcome {
  lines: ScoreLine[];
  /** Whether the main mission of the role is fulfilled (used by the Chameleon). */
  mission: boolean;
}

const line = (rule: ScoreRuleId, count: number, each: number): ScoreLine[] =>
  count > 0 && each !== 0 ? [{ rule, count, points: count * each }] : [];

const namedLines = (facts: Facts, ...bonuses: [StatKey, number][]): ScoreLine[] =>
  bonuses.flatMap(([key, points]) => line(key, facts.named(key) ? 1 : 0, points));

/** Points of a role: its result rule, its performance bonuses and its main mission. */
function roleOutcome(role: RoleId, facts: Facts): RoleOutcome {
  const { won, minutes } = facts;
  const result = (win: number, loss: number) => line(won ? 'win' : 'loss', 1, won ? win : loss);
  switch (role) {
    case 'impostor':
      return {
        lines: [...result(-3, 2), ...line('impostorHidden', facts.hidden, 1)],
        mission: !won,
      };
    case 'superhero':
      return {
        lines: [
          ...result(2, -3),
          ...namedLines(facts, ['mostDamage', 1], ['mostAssists', 1], ['mostKills', 1]),
        ],
        mission: won,
      };
    case 'snake':
      return {
        lines: [...result(2, -2), ...namedLines(facts, ['mostDamage', 1], ['mostDeaths', 1])],
        mission: won && facts.named('mostDeaths') && facts.named('mostDamage'),
      };
    case 'two-face': {
      const match = facts.mode === (won ? 'ally' : 'impostor');
      return { lines: line('twoFaceMatch', match ? 1 : 0, 2), mission: match };
    }
    case 'crook':
      return {
        lines: [...result(2, -3), ...line('crookDesignated', facts.designated, 1)],
        mission: won && facts.voters > 0 && facts.designated * 2 >= facts.voters,
      };
    case 'pacifist':
      return {
        lines: [...result(2, -2), ...namedLines(facts, ['fewestKills', 1], ['zeroKills', 1])],
        mission: won && facts.named('fewestKills'),
      };
    case 'speedrunner': {
      const fast = minutes < SPEEDRUN_LIMIT_MIN;
      return {
        lines: [
          ...(won ? line(fast ? 'winUnder25' : 'winOver25', 1, fast ? 2 : 1) : result(0, -2)),
          ...namedLines(facts, ['mostDamageTaken', 2]),
        ],
        mission: won && fast,
      };
    }
    case 'marathoner': {
      const long = minutes >= MARATHON_LIMIT_MIN;
      return {
        lines: [
          ...(won ? line(long ? 'winOver35' : 'winUnder35', 1, long ? 2 : 1) : result(0, -2)),
          ...namedLines(facts, ['leastDamageTaken', 2]),
        ],
        mission: won && long,
      };
    }
    case 'droid':
      // In development: never drawn. Only the result counts (the orders are not tracked yet).
      return { lines: result(2, -2), mission: won };
    case 'chameleon':
      return { lines: [], mission: false };
  }
}

/**
 * Points of every player at the end of a game.
 *
 * - Common rules: +1 per correct guess, −1 per wrong one; +1 per voter who did not find your
 *   role, −1 per voter who did (no malus for the Super-Héros).
 * - Then the rules of the role. The Chameleon plays its real role once it discovered it, with
 *   +1 if it fulfils that role's main mission; before that (short game), only the common rules.
 * - A player without a ballot neither gives nor costs anything to the others.
 */
export function computeScores(input: ScoringInput): Record<string, PlayerScore> {
  const { teams, roles, revealed, modes, stats, ballots } = input;
  const players = Object.keys(teams);
  const result: Record<string, PlayerScore> = {};

  for (const id of players) {
    const team = teams[id]!;
    const real = roles[id]!;
    const current = real === 'chameleon' ? revealed[id] : real;

    // What the others guessed about this player.
    const guesses = Object.entries(ballots)
      .filter(([voter, ballot]) => voter !== id && ballot[id] !== undefined)
      .map(([, ballot]) => ballot[id]!);
    const found = guesses.filter((guess) => guess === real).length;
    const notFound = guesses.length - found;

    // What this player guessed about the others.
    const own = Object.entries(ballots[id] ?? {}).filter(([target]) => target !== id);
    const right = own.filter(([target, guess]) => guess === roles[target]).length;

    const teamStats = stats.teams[team];
    const facts: Facts = {
      won: stats.winner === team,
      minutes: stats.minutes,
      named: (key) => teamStats?.[key].includes(id) ?? false,
      mode: modes[id],
      designated: guesses.filter((guess) => guess === 'impostor').length,
      voters: guesses.length,
      hidden: notFound,
    };

    const outcome = current ? roleOutcome(current, facts) : { lines: [], mission: false };
    const lines = [
      ...outcome.lines,
      ...(real === 'chameleon' && current
        ? line('chameleonMission', outcome.mission ? 1 : 0, 1)
        : []),
      ...line('guessRight', right, 1),
      ...line('guessWrong', own.length - right, -1),
      ...line('found', current === 'superhero' ? 0 : found, -1),
      ...line('notFound', notFound, 1),
    ];
    result[id] = { total: lines.reduce((sum, l) => sum + l.points, 0), lines };
  }
  return result;
}
