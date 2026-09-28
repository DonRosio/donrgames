// Fictitious game used only by the tests of the engine and of the realtime layer. It exercises
// every mechanism: secret submissions, barrier, host-only action, timer, skip, disconnections,
// settings of each kind and the end of the game. It is never registered on the site.
import { z } from 'zod';
import { defineContract } from '@mini-jeux/shared';
import { Barrier } from '../helpers.ts';
import { defineGame } from '../types.ts';
import type { GameContext } from '../types.ts';

export const fixtureContract = defineContract({
  meta: {
    id: 'fixture',
    name: 'Jeu fictif',
    description: 'Sert uniquement aux tests du moteur.',
    minPlayers: 2,
    maxPlayers: 4,
    replayable: true,
  },
  phases: ['collect', 'reveal'],
  settings: {
    rounds: { kind: 'int', label: 'Manches', min: 1, max: 5, default: 2 },
    double: { kind: 'boolean', label: 'Points doubles', default: false },
    mode: {
      kind: 'choice',
      label: 'Gagnant',
      options: [
        { value: 'high', label: 'Le plus grand nombre' },
        { value: 'low', label: 'Le plus petit nombre' },
      ],
      default: 'high',
    },
  },
  actions: {
    submit: { payload: z.strictObject({ value: z.number().int().min(0).max(100) }) },
    next: { payload: z.strictObject({}), hostOnly: true },
  },
  errors: ['ALREADY_SUBMITTED'],
});

type Contract = typeof fixtureContract;

export interface FixtureState {
  round: number;
  rounds: number;
  points: number;
  mode: 'high' | 'low';
  values: Map<string, number>;
  submitted: Barrier;
  scores: Map<string, number>;
  winner: string | null;
}

export type FixtureView =
  | { phase: 'collect'; round: number; submitted: string[]; mine: number | null }
  | {
      phase: 'reveal';
      round: number;
      values: Record<string, number>;
      winner: string | null;
      scores: Record<string, number>;
    };

export const DEADLINE_MS = 60_000;

function revealIfComplete(state: FixtureState, ctx: GameContext<Contract>): void {
  if (state.submitted.isComplete(ctx.players.awaited())) ctx.goto('reveal');
}

export const fixtureGame = defineGame({
  contract: fixtureContract,
  setup: (_ctx, { players, settings }): FixtureState => ({
    round: 1,
    rounds: settings.rounds,
    points: settings.double ? 2 : 1,
    mode: settings.mode,
    values: new Map(),
    submitted: new Barrier(),
    scores: new Map(players.map((id) => [id, 0])),
    winner: null,
  }),
  initialPhase: 'collect',
  phases: {
    collect: {
      actions: ['submit'],
      next: ['reveal'],
      enter(state, ctx) {
        state.values.clear();
        state.submitted.reset();
        state.winner = null;
        ctx.schedule('deadline', DEADLINE_MS);
      },
      on: {
        submit(state, ctx, from, { value }) {
          if (state.submitted.has(from)) ctx.reject('ALREADY_SUBMITTED');
          state.values.set(from, value);
          state.submitted.mark(from);
          revealIfComplete(state, ctx);
        },
      },
      timer(_state, ctx, id) {
        if (id === 'deadline') ctx.goto('reveal');
      },
    },
    reveal: {
      actions: ['next'],
      next: ['collect'],
      enter(state) {
        const entries = [...state.values].sort((a, b) =>
          state.mode === 'high' ? b[1] - a[1] : a[1] - b[1],
        );
        state.winner = entries[0]?.[0] ?? null;
        if (state.winner) {
          state.scores.set(state.winner, (state.scores.get(state.winner) ?? 0) + state.points);
        }
      },
      on: {
        next(state, ctx) {
          if (state.round >= state.rounds) {
            ctx.end([...state.scores].map(([playerId, score]) => ({ playerId, score })));
            return;
          }
          state.round++;
          ctx.goto('collect');
        },
      },
    },
  },
  view(state, viewer, ctx): FixtureView {
    if (ctx.phase === 'collect') {
      // Other players' values stay secret until the reveal.
      return {
        phase: 'collect',
        round: state.round,
        submitted: state.submitted.ids,
        mine: state.values.get(viewer) ?? null,
      };
    }
    return {
      phase: 'reveal',
      round: state.round,
      values: Object.fromEntries(state.values),
      winner: state.winner,
      scores: Object.fromEntries(state.scores),
    };
  },
  onSkip(state, ctx) {
    if (ctx.phase === 'collect') ctx.goto('reveal');
  },
  onPlayerChange(state, ctx, change) {
    if (ctx.phase === 'collect' && (change.kind === 'unawaited' || change.kind === 'left')) {
      revealIfComplete(state, ctx);
    }
  },
});
