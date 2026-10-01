import { z } from 'zod';
import { defineContract } from '../core/game.ts';
import type { BombView, Clock, Page } from './defusal-data.ts';

const module = z.number().int().min(0).max(9);

export const defusalContract = defineContract({
  meta: {
    id: 'defusal',
    name: 'Désamorçage',
    description:
      'Un démineur voit la bombe, trois experts ont chacun un morceau du manuel. Parlez vite et clairement : le chrono tourne, et les règles changent à chaque bombe.',
    minPlayers: 4,
    maxPlayers: 4,
    playerCounts: [4],
    replayable: true,
  },
  phases: ['briefing', 'defusing', 'result'],
  settings: {
    strikes: { kind: 'int', label: 'Erreurs avant explosion', min: 1, max: 3, default: 2 },
    minutes: { kind: 'int', label: 'Chrono (minutes)', min: 2, max: 10, default: 5 },
  },
  actions: {
    /** Briefing: I know my role. */
    ready: { payload: z.strictObject({}) },
    /** Defuser only: the module and what to do with it. */
    cut: { payload: z.strictObject({ module, wire: z.number().int().min(0).max(5) }) },
    buttonDown: { payload: z.strictObject({ module }) },
    buttonUp: { payload: z.strictObject({ module }) },
    press: { payload: z.strictObject({ module, key: z.number().int().min(0).max(3) }) },
    move: {
      payload: z.strictObject({ module, direction: z.enum(['up', 'right', 'down', 'left']) }),
    },
    /** Result → next bomb, or the end of the game after the last one. */
    next: { payload: z.strictObject({}), hostOnly: true },
  },
  errors: ['NOT_DEFUSER', 'BAD_MODULE'],
});

export type DefusalContract = typeof defusalContract;

export type Outcome = 'defused' | 'exploded';

export interface RoundSummary {
  round: number;
  defuser: string;
  outcome: Outcome;
  /** Time left on the clock when it ended (0 when it exploded). */
  remaining: number;
  strikes: number;
}

interface Base {
  /** The four participants, in the order they defuse. */
  players: string[];
  /** 1-based number of the bomb, and how many there are. */
  round: number;
  rounds: number;
  defuser: string;
  /** The bomb explodes at this error. */
  maxStrikes: number;
  /** Bombs already played. */
  history: RoundSummary[];
}

export type DefusalView =
  | (Base & {
      phase: 'briefing';
      minutes: number;
      /** Who is ready. */
      ready: string[];
    })
  | (Base & {
      phase: 'defusing';
      clock: Clock;
      strikes: number;
      solved: number;
      modules: number;
      /** The defuser only. */
      bomb: BombView | null;
      /** The experts only: their own sheets of the manual, never the others'. */
      pages: Page[] | null;
    })
  | (Base & {
      phase: 'result';
      outcome: Outcome;
      remaining: number;
      strikes: number;
      solved: number;
      modules: number;
      /** Last bomb: the host goes on to the final ranking. */
      last: boolean;
    });
