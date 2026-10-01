import type { Edgework, Page, PageKind } from '@mini-jeux/shared/games/defusal-data';
import type { GameRandom } from '../../core/engine/random.ts';
import { generateButton, generateKeypad, generateMaze, generateWires } from './modules.ts';
import type { ModuleState } from './modules.ts';
import { generateEdgework } from './rules.ts';

export interface Bomb {
  edgework: Edgework;
  modules: ModuleState[];
  /** The two sheets of the manual for each module, in the same order as the modules. */
  pages: [Page, Page][];
}

/** A new bomb, with new rules: nothing carries over from the previous bomb. */
export function generateBomb(random: GameRandom): Bomb {
  const edgework = generateEdgework(random);
  const generated = random.shuffle([
    generateWires(random, edgework),
    generateButton(random, edgework),
    generateKeypad(random),
    generateMaze(random),
  ]);
  return {
    edgework,
    modules: generated.map((g) => g.module),
    pages: generated.map((g) => g.pages),
  };
}

/** Order of the sheets in a manual: grouped by module, the two halves of a module together. */
const PAGE_ORDER: readonly PageKind[] = [
  'wires',
  'buttonActions',
  'buttonStrip',
  'keypad',
  'mazeIndex',
  'mazes',
];

/**
 * Deals the sheets to the experts: the two sheets of a module always go to two different
 * experts (they must talk to each other), and the loads stay even.
 */
export function dealPages(
  random: GameRandom,
  experts: readonly string[],
  pairs: readonly [Page, Page][],
): Map<string, Page[]> {
  const hands = new Map(experts.map((id) => [id, [] as Page[]]));
  for (const pair of random.shuffle(pairs)) {
    const lightest = random
      .shuffle(experts)
      .sort((a, b) => hands.get(a)!.length - hands.get(b)!.length)
      .slice(0, 2);
    random.shuffle(pair).forEach((page, i) => hands.get(lightest[i]!)!.push(page));
  }
  for (const pages of hands.values()) {
    pages.sort((a, b) => PAGE_ORDER.indexOf(a.kind) - PAGE_ORDER.indexOf(b.kind));
  }
  return hands;
}
