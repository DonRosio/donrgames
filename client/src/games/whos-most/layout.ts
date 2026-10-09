import { seededRandom } from '../../core/ui/seeded-random.ts';

/** Place of a head scattered around the winners, in % of the stage, and its tilt. */
export interface Spot {
  x: number;
  y: number;
  tilt: number;
}

/**
 * Free places around the centre of the stage (the winners) and under the question (top): left
 * and right columns, then the bottom (kept inside the stage: the buttons come right after it).
 * Up to 10 heads besides the winners (9 at most are needed).
 */
const SLOTS: readonly (readonly [number, number])[] = [
  [12, 22],
  [88, 22],
  [8, 56],
  [92, 56],
  [17, 84],
  [83, 84],
  [34, 84],
  [66, 84],
  [26, 44],
  [74, 44],
];

/**
 * Where the heads that were not the most voted go. Same draw for every player (the seed
 * depends on the question only), different from one question to the next.
 */
export function scatter(count: number, seed: number): Spot[] {
  const random = seededRandom(seed);
  const slots = SLOTS.map((slot, index) => ({ slot, key: random() + (index >= 6 ? 1 : 0) }))
    // The bottom places last: they are only used by large groups.
    .sort((a, b) => a.key - b.key)
    .map(({ slot }) => slot);
  return Array.from({ length: Math.min(count, slots.length) }, (_, index) => {
    const [x, y] = slots[index]!;
    return {
      x: x + (random() - 0.5) * 5,
      y: y + (random() - 0.5) * 5,
      tilt: (random() - 0.5) * 16,
    };
  });
}

/** Seed of a question: the same on every device. */
export function questionSeed(question: string, index: number): number {
  let hash = index * 7919;
  for (const char of question) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return hash;
}

/** Slightly different floating for each head, so that they do not move together. */
export function floatStyle(key: string): { '--float-delay': string; '--float-duration': string } {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  const random = seededRandom(hash);
  return {
    '--float-delay': `${(-random() * 6).toFixed(2)}s`,
    '--float-duration': `${(4.5 + random() * 2.5).toFixed(2)}s`,
  };
}
