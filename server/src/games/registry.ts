import type { AnyGameDefinition } from '../core/engine/types.ts';
import { amongLegendsGame } from './among-legends/index.ts';
import { defusalGame } from './defusal/index.ts';
import { dubbingGame } from './dubbing/index.ts';
import { whosMostGame } from './whos-most/index.ts';

/** Server game registry: one entry per game (and its import). */
export const games: readonly AnyGameDefinition[] = [
  dubbingGame,
  amongLegendsGame,
  defusalGame,
  whosMostGame,
];
