import { z } from 'zod';
import { defineContract } from '../core/game.ts';
import type { MultiOption } from '../core/game.ts';
import { ROLES, ROLE_IDS } from './among-legends-roles.ts';
import type { RoleId, Team, TwoFaceMode } from './among-legends-roles.ts';

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
  phases: ['teams', 'briefing', 'playing'],
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
    /** "La partie est terminée". */
    end: { payload: z.strictObject({}), hostOnly: true },
  },
  errors: ['TEAM_FULL', 'TEAMS_INCOMPLETE'],
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
    });
