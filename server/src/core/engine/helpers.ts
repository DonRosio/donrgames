import type { ScoreEntry } from '@mini-jeux/shared';

/** Tracks who has done something (validated, voted…) among the players the game waits for. */
export class Barrier {
  readonly #done = new Set<string>();

  mark(playerId: string): void {
    this.#done.add(playerId);
  }

  has(playerId: string): boolean {
    return this.#done.has(playerId);
  }

  reset(): void {
    this.#done.clear();
  }

  get ids(): string[] {
    return [...this.#done];
  }

  /** Complete when every awaited player is done (and at least one is awaited or done). */
  isComplete(awaited: readonly string[]): boolean {
    return awaited.every((id) => this.#done.has(id)) && (awaited.length > 0 || this.#done.size > 0);
  }
}

/** Competition ranking, best score first: ties share a rank (1, 1, 3). Stable for equal scores. */
export function rank<T extends ScoreEntry>(scores: readonly T[]): (T & { rank: number })[] {
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  return sorted.map((entry, index) => {
    const firstEqual = sorted.findIndex((other) => other.score === entry.score);
    return { ...entry, rank: (firstEqual === -1 ? index : firstEqual) + 1 };
  });
}
