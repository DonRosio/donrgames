import { defusalContract } from '@mini-jeux/shared/games/defusal';
import type {
  DefusalContract,
  DefusalView,
  Outcome,
  RoundSummary,
} from '@mini-jeux/shared/games/defusal';
import {
  FREQUENCIES,
  MEMORY_STAGES,
  PURGE_WORDS,
  ROUNDS,
  SPEED_PER_STRIKE,
  VALVES,
  formatClock,
  remainingAt,
} from '@mini-jeux/shared/games/defusal-data';
import type { BombView, Clock, ModuleView, Page } from '@mini-jeux/shared/games/defusal-data';
import { defineGame } from '../../core/engine/types.ts';
import type { GameContext } from '../../core/engine/types.ts';
import { dealPages, generateBomb } from './bomb.ts';
import type { Bomb } from './bomb.ts';
import { HOLD_MS, RELEASE_TOLERANCE_MS, step } from './modules.ts';
import type { ModuleState } from './modules.ts';
import { drawMemoryScreen, memoryExpected, simonExpected } from './modules-more.ts';
import {
  PURGE_FIRST_MIN_MS,
  PURGE_FIRST_SPAN_MS,
  PURGE_SLEEP_MIN_MS,
  PURGE_SLEEP_SPAN_MS,
  PURGE_WINDOW_MS,
  purgeAnswer,
} from './purge.ts';

export interface DefusalState {
  /** Who defuses each bomb, in order: everybody once. */
  order: string[];
  round: number;
  maxStrikes: number;
  minutes: number;
  ready: Set<string>;
  bomb: Bomb | null;
  /** The sheets of the manual held by each expert, for the current bomb. */
  manuals: Map<string, Page[]>;
  clock: Clock | null;
  strikes: number;
  /** The current bomb once it is over. */
  outcome: Outcome | null;
  remaining: number;
  history: RoundSummary[];
}

type Ctx = GameContext<DefusalContract>;

const defuser = (state: DefusalState): string => state.order[state.round - 1]!;

/** Points of the team: 100 per bomb defused, plus one per second left on its clock. */
function teamScore(history: readonly RoundSummary[]): number {
  return history.reduce(
    (sum, r) => sum + (r.outcome === 'defused' ? 100 + Math.floor(r.remaining / 1000) : 0),
    0,
  );
}

function finish(state: DefusalState, ctx: Ctx, outcome: Outcome): void {
  state.outcome = outcome;
  state.remaining = outcome === 'defused' ? remainingAt(state.clock!, ctx.now()) : 0;
  state.history.push({
    round: state.round,
    defuser: defuser(state),
    outcome,
    remaining: state.remaining,
    strikes: state.strikes,
  });
  ctx.goto('result');
}

function scheduleExplosion(state: DefusalState, ctx: Ctx): void {
  const clock = state.clock!;
  ctx.schedule('explosion', Math.ceil(clock.remaining / clock.speed));
}

/** An error: the clock speeds up, and the bomb explodes at the last allowed error. */
function strike(state: DefusalState, ctx: Ctx): void {
  const now = ctx.now();
  state.strikes++;
  state.clock = {
    remaining: remainingAt(state.clock!, now),
    since: now,
    speed: 1 + SPEED_PER_STRIKE * state.strikes,
  };
  if (state.strikes >= state.maxStrikes) finish(state, ctx, 'exploded');
  else scheduleExplosion(state, ctx);
}

function solve(state: DefusalState, ctx: Ctx, module: ModuleState): void {
  module.solved = true;
  if (state.bomb!.modules.every((m) => m.solved)) finish(state, ctx, 'defused');
}

/** The purge wakes up after a while: a timer `purgeOn`, then `purgeOff-<n>` closes the window. */
function schedulePurge(state: DefusalState, ctx: Ctx, first: boolean): void {
  const delay = first
    ? PURGE_FIRST_MIN_MS + ctx.random.int(PURGE_FIRST_SPAN_MS)
    : PURGE_SLEEP_MIN_MS + ctx.random.int(PURGE_SLEEP_SPAN_MS);
  ctx.schedule('purgeOn', delay);
}

function wakePurge(state: DefusalState, ctx: Ctx): void {
  const purge = state.bomb!.purge;
  purge.serial++;
  purge.active = true;
  purge.word = ctx.random.pick(PURGE_WORDS);
  purge.until = ctx.now() + PURGE_WINDOW_MS;
  ctx.schedule(`purgeOff-${purge.serial}`, PURGE_WINDOW_MS);
}

function calmPurge(state: DefusalState, ctx: Ctx): void {
  const purge = state.bomb!.purge;
  purge.active = false;
  purge.word = null;
  purge.until = null;
  schedulePurge(state, ctx, false);
}

/** The module the defuser acts on: it must exist, be of that kind and not be solved yet. */
function moduleOf<K extends ModuleState['kind']>(
  state: DefusalState,
  ctx: Ctx,
  from: string,
  index: number,
  kind: K,
): Extract<ModuleState, { kind: K }> {
  if (from !== defuser(state)) ctx.reject('NOT_DEFUSER');
  const module = state.bomb!.modules[index];
  if (!module || module.kind !== kind || module.solved) ctx.reject('BAD_MODULE');
  return module as Extract<ModuleState, { kind: K }>;
}

/** Whether the clock showed this digit at release time, or during the moment just before. */
function clockShows(state: DefusalState, now: number, digit: number): boolean {
  return [now, now - RELEASE_TOLERANCE_MS].some((t) =>
    formatClock(remainingAt(state.clock!, t)).includes(String(digit)),
  );
}

function moduleView(module: ModuleState): ModuleView {
  switch (module.kind) {
    case 'wires':
      return { kind: 'wires', wires: module.wires, cut: module.cut, solved: module.solved };
    case 'button':
      return {
        kind: 'button',
        color: module.color,
        label: module.label,
        held: module.heldSince !== null,
        strip: module.heldSince !== null ? module.strip : null,
        solved: module.solved,
      };
    case 'keypad':
      return {
        kind: 'keypad',
        glyphs: module.glyphs,
        pressed: module.pressed,
        solved: module.solved,
      };
    case 'maze':
      return {
        kind: 'maze',
        markers: module.markers,
        position: module.position,
        target: module.target,
        solved: module.solved,
      };
    case 'simon':
      return {
        kind: 'simon',
        flashes: module.sequence.slice(0, module.stage + 1),
        progress: module.progress,
        stage: module.stage,
        stages: module.sequence.length,
        plays: module.plays,
        solved: module.solved,
      };
    case 'morse':
      return { kind: 'morse', signal: module.signal, tuned: module.tuned, solved: module.solved };
    case 'memory':
      return {
        kind: 'memory',
        display: module.display,
        labels: module.labels,
        stage: module.stage,
        stages: MEMORY_STAGES,
        solved: module.solved,
      };
    case 'password':
      return { kind: 'password', wheels: module.wheels, solved: module.solved };
  }
}

function startIfAllReady(state: DefusalState, ctx: Ctx): void {
  const awaited = ctx.players.awaited();
  if (awaited.length > 0 && awaited.every((id) => state.ready.has(id))) ctx.goto('defusing');
}

export const defusalGame = defineGame({
  contract: defusalContract,
  setup: (ctx, { players, settings }): DefusalState => {
    if (players.length !== 4) throw new Error('Désamorçage needs exactly 4 players');
    return {
      order: ctx.random.shuffle(players),
      round: 1,
      maxStrikes: settings.strikes,
      minutes: settings.minutes,
      ready: new Set(),
      bomb: null,
      manuals: new Map(),
      clock: null,
      strikes: 0,
      outcome: null,
      remaining: 0,
      history: [],
    };
  },
  initialPhase: 'briefing',
  phases: {
    briefing: {
      actions: ['ready'],
      next: ['defusing'],
      enter(state, ctx) {
        state.ready = new Set();
        state.bomb = generateBomb(ctx.random);
        const experts = state.order.filter((id) => id !== defuser(state));
        state.manuals = dealPages(ctx.random, experts, state.bomb.pages);
        state.clock = null;
        state.strikes = 0;
        state.outcome = null;
        state.remaining = 0;
      },
      on: {
        ready(state, ctx, from) {
          state.ready.add(from);
          startIfAllReady(state, ctx);
        },
      },
    },
    defusing: {
      actions: [
        'cut',
        'buttonDown',
        'buttonUp',
        'press',
        'move',
        'simon',
        'tune',
        'transmit',
        'memory',
        'password',
        'purge',
      ],
      next: ['result'],
      enter(state, ctx) {
        state.clock = { remaining: state.minutes * 60_000, since: ctx.now(), speed: 1 };
        scheduleExplosion(state, ctx);
        schedulePurge(state, ctx, true);
      },
      on: {
        cut(state, ctx, from, { module: index, wire }) {
          const module = moduleOf(state, ctx, from, index, 'wires');
          if (wire >= module.wires.length || module.cut.includes(wire)) ctx.reject('BAD_MODULE');
          module.cut.push(wire);
          if (wire === module.solution) solve(state, ctx, module);
          else strike(state, ctx);
        },
        buttonDown(state, ctx, from, { module: index }) {
          const module = moduleOf(state, ctx, from, index, 'button');
          if (module.heldSince === null) module.heldSince = ctx.now();
        },
        buttonUp(state, ctx, from, { module: index }) {
          const module = moduleOf(state, ctx, from, index, 'button');
          if (module.heldSince === null) ctx.reject('BAD_MODULE');
          const now = ctx.now();
          const tapped = now - module.heldSince! < HOLD_MS;
          module.heldSince = null;
          const right =
            module.action === 'tap' ? tapped : !tapped && clockShows(state, now, module.digit);
          if (right) solve(state, ctx, module);
          else strike(state, ctx);
        },
        press(state, ctx, from, { module: index, key }) {
          const module = moduleOf(state, ctx, from, index, 'keypad');
          if (module.pressed.includes(key)) ctx.reject('BAD_MODULE');
          if (key !== module.order[module.pressed.length]) return strike(state, ctx);
          module.pressed.push(key);
          if (module.pressed.length === module.order.length) solve(state, ctx, module);
        },
        move(state, ctx, from, { module: index, direction }) {
          const module = moduleOf(state, ctx, from, index, 'maze');
          const next = step(module.maze, module.position, direction);
          if (next === null) return strike(state, ctx);
          module.position = next;
          if (next === module.target) solve(state, ctx, module);
        },
        simon(state, ctx, from, { module: index, color }) {
          const module = moduleOf(state, ctx, from, index, 'simon');
          const flash = module.sequence[module.progress]!;
          const expected = simonExpected(module.rows, flash, state.strikes, state.bomb!.edgework);
          if (color !== expected) {
            module.progress = 0;
            module.plays++;
            return strike(state, ctx);
          }
          module.progress++;
          if (module.progress < module.stage + 1) return;
          module.stage++;
          module.progress = 0;
          module.plays++;
          if (module.stage === module.sequence.length) solve(state, ctx, module);
        },
        tune(state, ctx, from, { module: index, direction }) {
          const module = moduleOf(state, ctx, from, index, 'morse');
          const next = module.tuned + (direction === 'up' ? 1 : -1);
          if (next >= 0 && next < FREQUENCIES.length) module.tuned = next;
        },
        transmit(state, ctx, from, { module: index }) {
          const module = moduleOf(state, ctx, from, index, 'morse');
          if (module.tuned === module.target) solve(state, ctx, module);
          else strike(state, ctx);
        },
        memory(state, ctx, from, { module: index, position }) {
          const module = moduleOf(state, ctx, from, index, 'memory');
          const expected = memoryExpected(
            module.stages,
            module.stage,
            module.display,
            module.labels,
            module.pressed,
          );
          if (position !== expected) {
            // An error starts the five stages over, with a new screen.
            module.stage = 0;
            module.pressed = [];
            Object.assign(module, drawMemoryScreen(ctx.random));
            return strike(state, ctx);
          }
          module.pressed.push({ position, label: module.labels[position]! });
          module.stage++;
          if (module.stage === MEMORY_STAGES) return solve(state, ctx, module);
          Object.assign(module, drawMemoryScreen(ctx.random));
        },
        password(state, ctx, from, { module: index, word }) {
          const module = moduleOf(state, ctx, from, index, 'password');
          if (word === module.target) solve(state, ctx, module);
          else strike(state, ctx);
        },
        purge(state, ctx, from, { valve }) {
          if (from !== defuser(state)) ctx.reject('NOT_DEFUSER');
          const purge = state.bomb!.purge;
          if (!purge.active) ctx.reject('BAD_MODULE');
          const manual = state.bomb!;
          const answer = purgeAnswer(
            purge.table,
            purge.rules,
            purge.otherwise,
            purge.word!,
            manual.edgework,
          );
          if (VALVES[valve] === answer) calmPurge(state, ctx);
          else strike(state, ctx);
        },
      },
      timer(state, ctx, id) {
        if (id === 'explosion') return finish(state, ctx, 'exploded');
        const purge = state.bomb!.purge;
        if (id === 'purgeOn') return wakePurge(state, ctx);
        // The window of an activation closed without the right valve: an error.
        if (id === `purgeOff-${purge.serial}` && purge.active) {
          calmPurge(state, ctx);
          strike(state, ctx);
        }
      },
    },
    result: {
      actions: ['next'],
      next: ['briefing'],
      on: {
        next(state, ctx) {
          if (state.round >= ROUNDS) {
            const score = teamScore(state.history);
            ctx.end(state.order.map((playerId) => ({ playerId, score })));
            return;
          }
          state.round++;
          ctx.goto('briefing');
        },
      },
    },
  },
  view(state, viewer, ctx): DefusalView {
    const base = {
      players: state.order,
      round: state.round,
      rounds: ROUNDS,
      defuser: defuser(state),
      maxStrikes: state.maxStrikes,
      history: state.history,
    };
    const modules = state.bomb!.modules;
    const solved = modules.filter((m) => m.solved).length;
    if (ctx.phase === 'briefing') {
      return { ...base, phase: 'briefing', minutes: state.minutes, ready: [...state.ready] };
    }
    if (ctx.phase === 'defusing') {
      const isDefuser = viewer === defuser(state);
      const bomb: BombView | null = isDefuser
        ? {
            edgework: state.bomb!.edgework,
            modules: modules.map(moduleView),
            purge: {
              active: state.bomb!.purge.active,
              word: state.bomb!.purge.word,
              until: state.bomb!.purge.until,
            },
          }
        : null;
      return {
        ...base,
        phase: 'defusing',
        clock: state.clock!,
        strikes: state.strikes,
        solved,
        modules: modules.length,
        bomb,
        pages: isDefuser ? null : (state.manuals.get(viewer) ?? []),
      };
    }
    return {
      ...base,
      phase: 'result',
      outcome: state.outcome!,
      remaining: state.remaining,
      strikes: state.strikes,
      solved,
      modules: modules.length,
      last: state.round >= ROUNDS,
    };
  },
  onSkip(state, ctx) {
    // "Passer à la suite" during the briefing: start without waiting for everybody.
    if (ctx.phase === 'briefing') ctx.goto('defusing');
  },
  onPlayerChange(state, ctx, change) {
    if (ctx.phase !== 'briefing') return;
    if (change.kind === 'unawaited' || change.kind === 'left') startIfAllReady(state, ctx);
  },
});
