import { randomInt } from 'node:crypto';

export interface GameRandom {
  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** New array, uniformly shuffled (Fisher-Yates). */
  shuffle<T>(items: readonly T[]): T[];
  pick<T>(items: readonly T[]): T;
}

function fromIntSource(int: (maxExclusive: number) => number): GameRandom {
  return {
    int,
    shuffle<T>(items: readonly T[]): T[] {
      const result = [...items];
      for (let i = result.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [result[i], result[j]] = [result[j]!, result[i]!];
      }
      return result;
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('Cannot pick from an empty list');
      return items[int(items.length)]!;
    },
  };
}

export const cryptoGameRandom: GameRandom = fromIntSource((max) => randomInt(max));

/** Deterministic generator for tests (mulberry32). */
export function seededRandom(seed: number): GameRandom {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return fromIntSource((max) => Math.floor(next() * max));
}
