import { amongLegendsContract } from '@mini-jeux/shared/games/among-legends';
import type {
  Alert,
  AmongLegendsContract,
  AmongLegendsView,
  ResultPlayer,
} from '@mini-jeux/shared/games/among-legends';
import {
  CHAMELEON_REVEAL_MS,
  TEAM_SIZE,
  TWO_FACE_PERIOD_MS,
  twoFaceModeAt,
} from '@mini-jeux/shared/games/among-legends-roles';
import type { RoleId, Team, TwoFaceMode } from '@mini-jeux/shared/games/among-legends-roles';
import { computeScores, validateTeamStats } from '@mini-jeux/shared/games/among-legends-scoring';
import type { GameStats, PlayerScore } from '@mini-jeux/shared/games/among-legends-scoring';
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
  /** Server time when the host said the game was over. */
  endedAt: number | null;
  /** Debrief: what the host read on the end screen, and the guesses of each voter. */
  stats: GameStats | null;
  ballots: Map<string, Record<string, RoleId>>;
  /** Results: points of every player. */
  scores: Map<string, PlayerScore>;
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

/** Mode of every Double Face (Chameleon turned into one included) when the game ended. */
function modesAtEnd(state: AmongLegendsState): Record<string, TwoFaceMode> {
  const elapsed = state.endedAt! - state.startedAt!;
  const modes: Record<string, TwoFaceMode> = {};
  for (const id of state.roles.keys()) {
    const start = state.twoFaceStart.get(id);
    if (currentRole(state, id) === 'two-face' && start !== undefined) {
      modes[id] = twoFaceModeAt(start, elapsed);
    }
  }
  return modes;
}

/** Everybody but the player: the ones they guess the role of. */
function othersOf(state: AmongLegendsState, playerId: string): string[] {
  return [...state.teams.keys()].filter((id) => id !== playerId);
}

/** Refuses statistics that do not fit the teams (`ctx.reject`), before anything is stored. */
function checkStats(state: AmongLegendsState, ctx: Ctx, stats: GameStats): void {
  const teams = state.size === 10 ? (['blue', 'red'] as const) : (['blue'] as const);
  if (Object.keys(stats.teams).some((team) => !teams.some((t) => t === team))) {
    ctx.reject('STATS_INVALID');
  }
  for (const team of teams) {
    const answers = stats.teams[team];
    if (!answers) ctx.reject('STATS_INVALID');
    const error = validateTeamStats(answers!, membersOf(state, team));
    if (error) ctx.reject(error);
  }
}

/** Voting → results, provided the stats are in. Ballots missing are simply ignored. */
function openResults(state: AmongLegendsState, ctx: Ctx): void {
  const teams = Object.fromEntries(state.teams) as Record<string, Team>;
  const scores = computeScores({
    teams,
    roles: Object.fromEntries(state.roles),
    revealed: Object.fromEntries(state.chameleonRole),
    modes: modesAtEnd(state),
    stats: state.stats!,
    ballots: Object.fromEntries(state.ballots),
  });
  state.scores = new Map(Object.entries(scores));
  ctx.goto('results');
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
      endedAt: null,
      stats: null,
      ballots: new Map(),
      scores: new Map(),
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
      next: ['stats'],
      enter(state, ctx) {
        state.startedAt = ctx.now();
        scheduleSwitch(state, ctx);
        if ([...state.roles.values()].includes('chameleon')) {
          ctx.schedule('chameleon', CHAMELEON_REVEAL_MS);
        }
      },
      on: {
        end(state, ctx) {
          state.endedAt = ctx.now();
          ctx.goto('stats');
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
    stats: {
      actions: ['submitStats'],
      next: ['voting'],
      on: {
        submitStats(state, ctx, _from, stats) {
          checkStats(state, ctx, stats);
          state.stats = stats;
          ctx.goto('voting');
        },
      },
    },
    voting: {
      // The host can still correct the statistics: everybody then sees the new ones.
      actions: ['submitStats', 'vote', 'reveal'],
      next: ['results'],
      on: {
        submitStats(state, ctx, _from, stats) {
          checkStats(state, ctx, stats);
          state.stats = stats;
        },
        vote(state, ctx, from, { guesses }) {
          if (state.ballots.has(from)) ctx.reject('ALREADY_VOTED');
          const targets = othersOf(state, from);
          const complete =
            Object.keys(guesses).length === targets.length &&
            targets.every((id) => guesses[id] !== undefined);
          if (!complete) ctx.reject('BAD_VOTE');
          if (Object.values(guesses).some((role) => !state.selected.includes(role))) {
            ctx.reject('BAD_VOTE');
          }
          state.ballots.set(from, guesses);
        },
        reveal(state, ctx) {
          if (ctx.players.awaited().some((id) => !state.ballots.has(id))) {
            ctx.reject('VOTES_MISSING');
          }
          openResults(state, ctx);
        },
      },
    },
    results: {
      actions: ['finish'],
      next: [],
      on: {
        finish(state, ctx) {
          ctx.end([...state.scores].map(([playerId, { total }]) => ({ playerId, score: total })));
        },
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
    if (ctx.phase === 'stats') return { ...common, phase: 'stats' };
    if (ctx.phase === 'voting') {
      return {
        ...common,
        phase: 'voting',
        voted: [...state.ballots.keys()],
        myGuesses: state.ballots.get(viewer) ?? null,
        stats: state.stats!,
      };
    }
    if (ctx.phase === 'results') {
      const modes = modesAtEnd(state);
      const players: Record<string, ResultPlayer> = {};
      for (const [id, role] of state.roles) {
        const { total, lines } = state.scores.get(id)!;
        players[id] = {
          total,
          lines,
          role,
          revealedRole: state.chameleonRole.get(id) ?? null,
          mode: modes[id] ?? null,
          foundBy: [...state.ballots]
            .filter(([voter, ballot]) => voter !== id && ballot[id] === role)
            .map(([voter]) => voter),
          voted: state.ballots.has(id),
        };
      }
      return {
        ...common,
        phase: 'results',
        winner: state.stats!.winner,
        minutes: state.stats!.minutes,
        players,
        myGuesses: state.ballots.get(viewer) ?? null,
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
    // During the vote: show the results without waiting for the missing votes.
    if (ctx.phase === 'voting') openResults(state, ctx);
  },
});
