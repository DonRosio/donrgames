import type { AnyClientGame } from '../core/game-host/client-game.ts';

/** Client game registry: one entry per game (and its import). */
export const clientGames: readonly AnyClientGame[] = [];
