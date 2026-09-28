import type { AnyGameDefinition } from '../core/engine/types.ts';
import { dubbingGame } from './dubbing/index.ts';

/** Server game registry: one entry per game (and its import). */
export const games: readonly AnyGameDefinition[] = [dubbingGame];
