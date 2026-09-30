import { z } from 'zod';
import { defineContract } from '../core/game.ts';
import type { MultiOption } from '../core/game.ts';
import { ROLES, ROLE_IDS } from './among-legends-roles.ts';
import type { RoleId, Team, TwoFaceMode } from './among-legends-roles.ts';
import { STAT_KEYS } from './among-legends-scoring.ts';
import type { GameStats, PlayerScore } from './among-legends-scoring.ts';

const NOTES: Partial<Record<RoleId, Pick<MultiOption, 'locked' | 'note' | 'minWhenChecked'>>> = {
  impostor: { locked: true, note: 'toujours en jeu' },
  chameleon: { minWhenChecked: 6, note: 'il faut alors au moins 6 rôles' },
};

const roleOptions = ROLE_IDS.map((id) => ({
  value: id,
  label: ROLES[id].name,
  ...NOTES[id],
  ...(ROLES[id].inDevelopment ? { disabled: true, note: 'en développement' } : {}),
}));

/** Players named in one answer of the end-of-game form (at most one team). */
const players = z.array(z.string().max(64)).max(5);
const teamStats = z.strictObject(
  Object.fromEntries(STAT_KEYS.map((key) => [key, players])) as Record<
    (typeof STAT_KEYS)[number],
    typeof players
  >,
);

export const amongLegendsContract = defineContract({
  meta: {
    id: 'among-legends',
    name: 'Among Legends',
    description:
      "Une partie de League of Legends avec des rôles secrets : chacun a sa propre mission, et il faut démasquer l'Imposteur au débat final.",
    minPlayers: 5,
    maxPlayers: 10,
    playerCounts: [5, 10],
    replayable: true,
  },
  phases: ['teams', 'briefing', 'playing', 'debrief', 'results'],
  settings: {
    roles: { kind: 'multi', label: 'Rôles en jeu', min: 5, options: roleOptions },
  },
  actions: {
    /** 10 players: join a team (can be changed until the host confirms). */
    chooseTeam: { payload: z.strictObject({ team: z.enum(['blue', 'red']) }) },
    confirmTeams: { payload: z.strictObject({}), hostOnly: true },
    /** The player has read their role. */
    read: { payload: z.strictObject({}) },
    /** "La partie a commencé": the League of Legends game timer just started. */
    start: { payload: z.strictObject({}), hostOnly: true },
    /** "La partie est terminée": stops the clock and opens the debrief. */
    end: { payload: z.strictObject({}), hostOnly: true },
    /** Debrief: what the host reads on the end screen of the game (can be sent again). */
    submitStats: {
      payload: z.strictObject({
        winner: z.enum(['blue', 'red']),
        minutes: z.number().int().min(1).max(180),
        teams: z.strictObject({ blue: teamStats, red: teamStats.optional() }),
      }),
      hostOnly: true,
    },
    /** Debrief: my guess of the role of every other player (final). */
    vote: {
      payload: z.strictObject({
        guesses: z
          .record(z.string().max(64), z.enum(ROLE_IDS))
          .refine((guesses) => Object.keys(guesses).length <= 9),
      }),
    },
    /** Debrief → results, once the stats are in and everybody voted. */
    reveal: { payload: z.strictObject({}), hostOnly: true },
    /** Results → final ranking. */
    finish: { payload: z.strictObject({}), hostOnly: true },
  },
  errors: [
    'TEAM_FULL',
    'TEAMS_INCOMPLETE',
    'STATS_INVALID',
    'STATS_INCOMPLETE',
    'STATS_ZERO_KILLS',
    'STATS_OVERLAP',
    'STATS_MISSING',
    'ALREADY_VOTED',
    'BAD_VOTE',
    'VOTES_MISSING',
  ],
});

export type AmongLegendsContract = typeof amongLegendsContract;

/** Something happened that the player must notice even while playing League of Legends. */
export interface Alert {
  /** Increases with every new alert for this player: the client rings when it changes. */
  seq: number;
  kind: 'twoFace' | 'chameleon';
}

interface Base {
  /** 5: one team; 10: two teams playing against each other. */
  size: 5 | 10;
  /** Roles the host kept for this game (public). */
  roles: RoleId[];
}

interface WithTeams extends Base {
  /** Team of every participant (public: everybody knows who plays with whom). */
  teams: Record<string, Team>;
  /** The viewer's own role: never anyone else's. */
  role: RoleId;
}

/** What everybody learns about a player once the results are shown. */
export interface ResultPlayer extends PlayerScore {
  /** Role drawn (a Chameleon stays a Chameleon here). */
  role: RoleId;
  /** Chameleon that discovered its real role: that role. */
  revealedRole: RoleId | null;
  /** Double Face (or Chameleon turned into one): mode at the end of the game. */
  mode: TwoFaceMode | null;
  /** Voters who found the real role of this player. */
  foundBy: string[];
  /** Whether this player voted. */
  voted: boolean;
}

export type AmongLegendsView =
  | (Base & { phase: 'teams'; teams: Record<string, Team | null> })
  | (WithTeams & {
      phase: 'briefing';
      /** Double Face only: mode at the start of the game. */
      twoFaceStart: TwoFaceMode | null;
      /** Who has read their role. */
      read: string[];
    })
  | (WithTeams & {
      phase: 'playing';
      /** Server time when the League of Legends game started. */
      startedAt: number;
      /** Double Face (or a Chameleon that became one): current mode, next switch. */
      twoFace: { mode: TwoFaceMode; nextSwitchAt: number } | null;
      /** Chameleon only: when its real role is revealed, and that role once revealed. */
      chameleon: { revealAt: number; role: RoleId | null } | null;
      alert: Alert | null;
    })
  | (WithTeams & {
      phase: 'debrief';
      /** Who has voted. */
      voted: string[];
      /** The viewer's own guesses, once sent. */
      myGuesses: Record<string, RoleId> | null;
      /** Whether the host sent the stats of the game. */
      statsSent: boolean;
      /** The stats already sent (public: they are on the end screen of the game), to correct them. */
      stats: GameStats | null;
    })
  | (WithTeams & {
      phase: 'results';
      winner: Team;
      minutes: number;
      /** Everything about everybody, roles included. */
      players: Record<string, ResultPlayer>;
      /** The viewer's own guesses (null when they did not vote). */
      myGuesses: Record<string, RoleId> | null;
    });
