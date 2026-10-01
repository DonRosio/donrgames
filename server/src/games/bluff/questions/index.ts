import type { ThemeId } from '@mini-jeux/shared/games/bluff-themes';
import { FOOD } from './food.ts';
import { FRENCHRAP } from './frenchrap.ts';
import { GEOGRAPHY } from './geography.ts';
import { HISTORY } from './history.ts';
import { MANGA } from './manga.ts';
import { MOVIES } from './movies.ts';
import { MYTHOLOGY } from './mythology.ts';
import { NATURE } from './nature.ts';
import { SPORT } from './sport.ts';
import type { RawQuestion } from './types.ts';
import { VIDEOGAMES } from './videogames.ts';

export interface Question extends RawQuestion {
  /** Stable within a deployment: `<theme>-<number>`. */
  id: string;
  theme: ThemeId;
}

const BY_THEME: Record<ThemeId, RawQuestion[]> = {
  manga: MANGA,
  movies: MOVIES,
  videogames: VIDEOGAMES,
  history: HISTORY,
  geography: GEOGRAPHY,
  food: FOOD,
  sport: SPORT,
  nature: NATURE,
  mythology: MYTHOLOGY,
  frenchrap: FRENCHRAP,
};

/** Every question of the game, all themes together. Server only: the answers stay secret. */
export const QUESTIONS: readonly Question[] = (Object.keys(BY_THEME) as ThemeId[]).flatMap(
  (theme) => BY_THEME[theme].map((raw, i) => ({ ...raw, id: `${theme}-${i + 1}`, theme })),
);
