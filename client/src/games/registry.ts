import type { AnyClientGame } from '../core/game-host/client-game.ts';
import { amongLegendsClient } from './among-legends/index.ts';
import { defusalClient } from './defusal/index.ts';
import { dubbingClient } from './dubbing/index.ts';
import { whosMostClient } from './whos-most/index.ts';

/** Client game registry: one entry per game (and its import). */
export const clientGames: readonly AnyClientGame[] = [
  dubbingClient,
  amongLegendsClient,
  defusalClient,
  whosMostClient,
];
