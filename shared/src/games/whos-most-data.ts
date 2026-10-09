/** Largest picture accepted: a 512 px PNG with transparency stays far below. */
export const HEAD_MAX_BYTES = 1024 * 1024;

/**
 * What follows "Qui est le + " in each question. Plain data shown by the client, so it lives
 * here (no zod, not in the contract). To be completed with the questions of the video.
 */
export const WHOS_MOST_QUESTIONS: readonly string[] = [
  'sale',
  'sportif',
  'fort aux jeux vidéo',
  'radin',
  'en retard',
  'bavard',
  'susceptible de pleurer devant un film',
  'drôle',
  'gourmand',
  'bordélique',
  'têtu',
  'susceptible de gagner au loto et de tout perdre',
];
