// Data of Incognito shown by the client too: no zod here, the client imports this file.

/** Longest answer in the chat, in characters. */
export const ANSWER_MAX_LENGTH = 120;

/** Longest private note about a first name, in characters. */
export const NOTE_MAX_LENGTH = 30;

/** Invented first names players hide behind (each game draws as many as there are players). */
export const ALIAS_NAMES: readonly string[] = [
  'Adrien',
  'Albert',
  'Armand',
  'Arthur',
  'Basile',
  'Bastien',
  'Bernard',
  'Cyprien',
  'Damien',
  'Dimitri',
  'Éloi',
  'Ernest',
  'Fabien',
  'Florian',
  'Gaétan',
  'Gaston',
  'Gérard',
  'Gontran',
  'Guillaume',
  'Henry',
  'Hervé',
  'Hubert',
  'Igor',
  'Jean-Paul',
  'Jules',
  'Léo',
  'Lionel',
  'Lucien',
  'Mathis',
  'Maurice',
  'Michel',
  'Noé',
  'Octave',
  'Olivier',
  'Patrice',
  'Paul',
  'Pierre',
  'Raymond',
  'Rémi',
  'Robert',
  'Sylvain',
  'Thibault',
  'Ulysse',
  'Valentin',
  'Wilfried',
  'Xavier',
  'Yann',
];

/** Lower case, without accents: two names that look alike compare equal. */
export function plainName(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}
