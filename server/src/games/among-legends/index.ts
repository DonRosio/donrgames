import { amongLegendsContract } from '@mini-jeux/shared/games/among-legends';
import type {
  Alert,
  AmongLegendsContract,
  AmongLegendsView,
} from '@mini-jeux/shared/games/among-legends';
import {
  CHAMELEON_REVEAL_MS,
  TEAM_SIZE,
  TWO_FACE_PERIOD_MS,
  twoFaceModeAt,
} from '@mini-jeux/shared/games/among-legends-roles';
import type { RoleId, Team, TwoFaceMode } from '@mini-jeux/shared/games/among-legends-roles';
import { defineGame } from '../../core/engine/types.ts';
import type { GameContext } from '../../core/engine/types.ts';
import type { GameRandom } from '../../core/engine/random.ts';

export interface AmongLegendsState {
  size: 5 | 10;
  /** Roles the host kept (always includes the Imposteur). */
  selected: RoleId[];
  teams: Map<string, Team | null>;
  roles: Map<string, RoleId>;
  /** Starting mode of every Double Face, including a Chameleon that became one. */
  twoFaceStart: Map<string, TwoFaceMode>;
  /** Real role of each Chameleon, once revealed. */
  chameleonRole: Map<string, RoleId>;
  read: Set<string>;
  startedAt: number | null;
  /** Number of switches of the Double Faces already announced. */
  switches: number;
  alerts: Map<string, Alert>;
}

type Ctx = GameContext<AmongLegendsContract>;

/** Roles a team can draw, besides the Imposteur that every team has. */
const NOT_DRAWABLE: ReadonlySet<RoleId> = new Set(['impostor', 'droid']);

/** Five distinct roles for one team: the Imposteur plus four others among the selected ones. */
export function drawTeamRoles(selected: readonly RoleId[], random: GameRandom): RoleId[] {
  const others = random.shuffle(selected.filter((role) => !NOT_DRAWABLE.has(role)));
  return random.shuffle(['impostor', ...others.slice(0, TEAM_SIZE - 1)]);
}

function membersOf(state: AmongLegendsState, team: Team): string[] {
  return [...state.teams].filter(([, t]) => t === team).map(([id]) => id);
}

/** Role a player currently has to play: the revealed role of a Chameleon, their role otherwise. */
function currentRole(state: AmongLegendsState, playerId: string): RoleId | undefined {
  const role = state.roles.get(playerId);
  return role === 'chameleon' ? state.chameleonRole.get(playerId) : role;
}

function alert(state: AmongLegendsState, playerId: string, kind: Alert['kind']): void {
  const seq = (state.alerts.get(playerId)?.seq ?? 0) + 1;
  state.alerts.set(playerId, { seq, kind });
}

function randomMode(random: GameRandom): TwoFaceMode {
  return random.pick(['ally', 'impostor'] as const);
}

function drawRoles(state: AmongLegendsState, ctx: Ctx): void {
  for (const team of ['blue', 'red'] as const) {
    const members = membersOf(state, team);
    if (members.length === 0) continue;
    const roles = drawTeamRoles(state.selected, ctx.random);
    members.forEach((id, i) => state.roles.set(id, roles[i]!));
  }
  for (const [id, role] of state.roles) {
    if (role === 'two-face') state.twoFaceStart.set(id, randomMode(ctx.random));
  }
}

/** Each Chameleon gets a selected role that nobody plays in its team. */
function revealChameleons(state: AmongLegendsState, ctx: Ctx): void {
  for (const [id, role] of state.roles) {
    if (role !== 'chameleon') continue;
    const team = state.teams.get(id);
    const taken = new Set(membersOf(state, team!).map((member) => state.roles.get(member)));
    const free = state.selected.filter(
      (candidate) => !taken.has(candidate) && !NOT_DRAWABLE.has(candidate),
    );
    if (free.length === 0) continue; // Cannot happen: at least 6 roles with a Chameleon.
    const next = ctx.random.pick(free);
    state.chameleonRole.set(id, next);
    if (next === 'two-face') state.twoFaceStart.set(id, randomMode(ctx.random));
    alert(state, id, 'chameleon');
  }
}

/** Delay until the next Double Face switch, counted from the start of the game. */
function scheduleSwitch(state: AmongLegendsState, ctx: Ctx): void {
  const at = state.startedAt! + (state.switches + 1) * TWO_FACE_PERIOD_MS;
  ctx.schedule('switch', at - ctx.now());
}

function teamsComplete(state: AmongLegendsState): boolean {
  return (
    membersOf(state, 'blue').length === TEAM_SIZE && membersOf(state, 'red').length === TEAM_SIZE
  );
}

export const amongLegendsGame = defineGame({
  contract: amongLegendsContract,
  setup: (_ctx, { players, settings }): AmongLegendsState => {
    if (players.length !== TEAM_SIZE && players.length !== 2 * TEAM_SIZE) {
      throw new Error('Among Legends needs exactly 5 or 10 players');
    }
    return {
      size: players.length === TEAM_SIZE ? 5 : 10,
      selected: [...settings.roles],
      teams: new Map(players.map((id) => [id, null])),
      roles: new Map(),
      twoFaceStart: new Map(),
      chameleonRole: new Map(),
      read: new Set(),
      startedAt: null,
      switches: 0,
      alerts: new Map(),
    };
  },
  initialPhase: 'teams',
  phases: {
    teams: {
      actions: ['chooseTeam', 'confirmTeams'],
      next: ['briefing'],
      enter(state, ctx) {
        // One team: nothing to choose.
        if (state.size === 5) {
          for (const id of state.teams.keys()) state.teams.set(id, 'blue');
          ctx.goto('briefing');
        }
      },
      on: {
        chooseTeam(state, ctx, from, { team }) {
          if (state.teams.get(from) !== team && membersOf(state, team).length >= TEAM_SIZE) {
            ctx.reject('TEAM_FULL');
          }
          state.teams.set(from, team);
        },
        confirmTeams(state, ctx) {
          if (!teamsComplete(state)) ctx.reject('TEAMS_INCOMPLETE');
          ctx.goto('briefing');
        },
      },
    },
    briefing: {
      actions: ['read', 'start'],
      next: ['playing'],
      enter(state, ctx) {
        drawRoles(state, ctx);
      },
      on: {
        read(state, _ctx, from) {
          state.read.add(from);
        },
        start(_state, ctx) {
          ctx.goto('playing');
        },
      },
    },
    playing: {
      actions: ['end'],
      next: [],
      enter(state, ctx) {
        state.startedAt = ctx.now();
        scheduleSwitch(state, ctx);
        if ([...state.roles.values()].includes('chameleon')) {
          ctx.schedule('chameleon', CHAMELEON_REVEAL_MS);
        }
      },
      on: {
        end(state, ctx) {
          // Scores come with the end-of-game form and the votes (next step of the game).
          ctx.end([...state.roles.keys()].map((playerId) => ({ playerId, score: 0 })));
        },
      },
      timer(state, ctx, id) {
        if (id === 'chameleon') {
          revealChameleons(state, ctx);
          return;
        }
        state.switches++;
        for (const playerId of state.roles.keys()) {
          if (currentRole(state, playerId) === 'two-face') alert(state, playerId, 'twoFace');
        }
        scheduleSwitch(state, ctx);
      },
    },
  },
  view(state, viewer, ctx): AmongLegendsView {
    const base = { size: state.size, roles: state.selected };
    if (ctx.phase === 'teams') {
      return { ...base, phase: 'teams', teams: Object.fromEntries(state.teams) };
    }
    const common = {
      ...base,
      teams: Object.fromEntries(state.teams) as Record<string, Team>,
      role: state.roles.get(viewer)!,
    };
    if (ctx.phase === 'briefing') {
      return {
        ...common,
        phase: 'briefing',
        twoFaceStart: state.twoFaceStart.get(viewer) ?? null,
        read: [...state.read],
      };
    }
    const startedAt = state.startedAt!;
    const elapsed = ctx.now() - startedAt;
    const start = state.twoFaceStart.get(viewer);
    const isTwoFace = currentRole(state, viewer) === 'two-face' && start !== undefined;
    return {
      ...common,
      phase: 'playing',
      startedAt,
      twoFace: isTwoFace
        ? {
            mode: twoFaceModeAt(start, elapsed),
            nextSwitchAt:
              startedAt + (Math.floor(elapsed / TWO_FACE_PERIOD_MS) + 1) * TWO_FACE_PERIOD_MS,
          }
        : null,
      chameleon:
        common.role === 'chameleon'
          ? {
              revealAt: startedAt + CHAMELEON_REVEAL_MS,
              role: state.chameleonRole.get(viewer) ?? null,
            }
          : null,
      alert: state.alerts.get(viewer) ?? null,
    };
  },
  onSkip(state, ctx) {
    // "Passer à la suite" during the briefing: the League of Legends game has started.
    if (ctx.phase === 'briefing') ctx.goto('playing');
  },
});
