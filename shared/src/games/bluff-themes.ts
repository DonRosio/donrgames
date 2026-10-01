// Themes of the questions of Le Bluff: plain data, shared by the server (the questions) and the
// client (labels). No zod here, so that the client can import it at runtime.

export const THEME_IDS = [
  'manga',
  'movies',
  'videogames',
  'history',
  'geography',
  'food',
  'sport',
  'nature',
  'mythology',
  'frenchrap',
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

/** Displayed names (French). */
export const THEME_NAMES: Readonly<Record<ThemeId, string>> = {
  manga: 'Manga',
  movies: 'Films',
  videogames: 'Jeux vidéo',
  history: 'Histoire',
  geography: 'Géographie',
  food: 'Nourriture',
  sport: 'Sport',
  nature: 'Nature',
  mythology: 'Mythologie',
  frenchrap: 'Rap FR',
};

/** What the question shows in place of the answer. */
export const BLANK = '______';

/** An answer written by a player is at most this long, in characters. */
export const ANSWER_MAX_LENGTH = 60;

/** Points: for voting for the real answer, and per player fooled by one of your answers. */
export const POINTS_REAL_VOTE = 2;
export const POINTS_PER_FOOLED = 1;
