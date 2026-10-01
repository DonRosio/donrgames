import { PURGE_WORDS, VALVES, shiftValve } from '@mini-jeux/shared/games/defusal-data';
import type {
  Condition,
  Edgework,
  Page,
  PurgeShift,
  Rule,
  Valve,
} from '@mini-jeux/shared/games/defusal-data';
import type { GameRandom } from '../../core/engine/random.ts';
import { chance, edgeworkCondition, firstApplying, ruleKey } from './rules.ts';

/** How long the purge stays active, and how long it sleeps between two activations (ms). */
export const PURGE_WINDOW_MS = 40_000;
export const PURGE_FIRST_MIN_MS = 25_000;
export const PURGE_FIRST_SPAN_MS = 20_000;
export const PURGE_SLEEP_MIN_MS = 30_000;
export const PURGE_SLEEP_SPAN_MS = 30_000;

/** The module to keep an eye on, as the server keeps it. */
export interface PurgeState {
  /** The valve each word calls for, before the corrections. */
  table: { word: string; valve: Valve }[];
  rules: Rule<PurgeShift>[];
  otherwise: PurgeShift;
  active: boolean;
  word: string | null;
  /** Server time at which the active window closes. */
  until: number | null;
  /** Number of the activation: a timer from an earlier one must not close the current one. */
  serial: number;
}

/** The valve to open for this word, from the two sheets: the table, then the correction. */
export function purgeAnswer(
  table: readonly { word: string; valve: Valve }[],
  rules: readonly Rule<PurgeShift>[],
  otherwise: PurgeShift,
  word: string,
  edgework: Edgework,
): Valve {
  const valve = table.find((entry) => entry.word === word)!.valve;
  return shiftValve(valve, firstApplying(rules, otherwise, { edgework, purgeWord: word }));
}

export function generatePurge(
  random: GameRandom,
  edgework: Edgework,
): {
  purge: PurgeState;
  pages: [Page, Page];
} {
  const table = PURGE_WORDS.map((word) => ({ word, valve: random.pick(VALVES) }));
  const shifts: PurgeShift[] = ['next', 'previous', 'keep'];
  const rules: Rule<PurgeShift>[] = [];
  const seen = new Set<string>();
  while (rules.length < 5) {
    // Most corrections depend on the word, so that they change from one activation to the next.
    const when: Condition[] = [];
    if (rules.length < 3) when.push({ k: 'purgeWord', word: random.pick(PURGE_WORDS) });
    if (rules.length >= 3 || chance(random, 0.5)) when.push(edgeworkCondition(random, edgework));
    const key = ruleKey(when);
    if (seen.has(key)) continue;
    seen.add(key);
    rules.push({ when, then: random.pick(shifts) });
  }
  const otherwise: PurgeShift = random.pick(shifts);
  return {
    purge: { table, rules, otherwise, active: false, word: null, until: null, serial: 0 },
    pages: [
      { kind: 'purgeWords', entries: [...table].sort((a, b) => a.word.localeCompare(b.word)) },
      { kind: 'purgeShift', rules, otherwise },
    ],
  };
}
