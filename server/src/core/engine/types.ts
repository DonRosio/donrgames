import type { GameMeta } from '@mini-jeux/shared';

/** Entry of the server game registry. For now only metadata; phases and views come with the engine. */
export interface RegisteredGame {
  meta: GameMeta;
}
