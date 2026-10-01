import {
  INDICATOR_LABELS,
  PORTS,
  SERIAL_LETTERS,
  VOWELS,
  batteryCount,
} from '@mini-jeux/shared/games/defusal-data';
import type {
  ButtonColor,
  ButtonLabel,
  Condition,
  Edgework,
  Rule,
  WireColor,
} from '@mini-jeux/shared/games/defusal-data';
import type { GameRandom } from '../../core/engine/random.ts';

/** True with probability `p`. */
export const chance = (random: GameRandom, p: number): boolean => random.int(1000) < p * 1000;

/** `count` distinct items, in random order. */
export const sample = <T>(random: GameRandom, items: readonly T[], count: number): T[] =>
  random.shuffle(items).slice(0, count);

/** What a condition can be checked against: the bomb, and the module the rule is about. */
export interface Facts {
  edgework: Edgework;
  wires?: readonly WireColor[];
  button?: { color: ButtonColor; label: ButtonLabel };
}

export function generateEdgework(random: GameRandom): Edgework {
  const characters = Array.from({ length: 5 }, () =>
    chance(random, 0.5) ? random.pick([...SERIAL_LETTERS]) : String(random.int(10)),
  );
  // At least two letters, so that the vowel rules mean something.
  for (const i of sample(random, [0, 1, 2, 3, 4], 2)) {
    if (/\d/.test(characters[i]!)) characters[i] = random.pick([...SERIAL_LETTERS]);
  }
  return {
    serial: `${characters.join('')}${random.int(10)}`,
    holders: Array.from({ length: random.int(4) }, () => (chance(random, 0.5) ? 'AA' : 'D')),
    indicators: sample(random, INDICATOR_LABELS, random.int(4)).map((label) => ({
      label,
      lit: chance(random, 0.5),
    })),
    ports: sample(random, PORTS, random.int(5)),
  };
}

/**
 * A condition about the bomb itself. Indicators and ports are drawn half of the time among those
 * the bomb really has, so that these rules sometimes apply.
 */
export function edgeworkCondition(random: GameRandom, edgework: Edgework): Condition {
  const label = () =>
    edgework.indicators.length > 0 && chance(random, 0.5)
      ? random.pick(edgework.indicators).label
      : random.pick(INDICATOR_LABELS);
  const port = () =>
    edgework.ports.length > 0 && chance(random, 0.5)
      ? random.pick(edgework.ports)
      : random.pick(PORTS);
  switch (random.int(8)) {
    case 0:
      return { k: 'serialOdd' };
    case 1:
      return { k: 'serialEven' };
    case 2:
      return chance(random, 0.5) ? { k: 'serialVowel' } : { k: 'serialNoVowel' };
    case 3:
      return { k: 'batteriesMore', n: 1 + random.int(3) };
    case 4:
      return { k: 'batteriesAtMost', n: 1 + random.int(3) };
    case 5:
      return { k: 'litIndicator', label: label() };
    case 6:
      return { k: 'unlitIndicator', label: label() };
    default:
      return chance(random, 0.5) ? { k: 'port', port: port() } : { k: 'noPort', port: port() };
  }
}

const lastDigit = (serial: string): number => Number(serial.at(-1));
const count = (wires: readonly WireColor[], color: WireColor) =>
  wires.filter((wire) => wire === color).length;

export function holds(c: Condition, facts: Facts): boolean {
  const { edgework } = facts;
  const wires = facts.wires ?? [];
  switch (c.k) {
    case 'serialOdd':
      return lastDigit(edgework.serial) % 2 === 1;
    case 'serialEven':
      return lastDigit(edgework.serial) % 2 === 0;
    case 'serialVowel':
      return [...edgework.serial].some((ch) => VOWELS.includes(ch));
    case 'serialNoVowel':
      return ![...edgework.serial].some((ch) => VOWELS.includes(ch));
    case 'batteriesMore':
      return batteryCount(edgework) > c.n;
    case 'batteriesAtMost':
      return batteryCount(edgework) <= c.n;
    case 'litIndicator':
      return edgework.indicators.some((i) => i.label === c.label && i.lit);
    case 'unlitIndicator':
      return edgework.indicators.some((i) => i.label === c.label && !i.lit);
    case 'port':
      return edgework.ports.includes(c.port);
    case 'noPort':
      return !edgework.ports.includes(c.port);
    case 'wiresNone':
      return count(wires, c.color) === 0;
    case 'wiresOne':
      return count(wires, c.color) === 1;
    case 'wiresMany':
      return count(wires, c.color) > 1;
    case 'firstWire':
      return wires[0] === c.color;
    case 'lastWire':
      return wires.at(-1) === c.color;
    case 'buttonColor':
      return facts.button?.color === c.color;
    case 'buttonLabel':
      return facts.button?.label === c.label;
  }
}

/** The first rule whose conditions all hold, or the fallback. */
export function firstApplying<T>(rules: readonly Rule<T>[], otherwise: T, facts: Facts): T {
  return rules.find((rule) => rule.when.every((c) => holds(c, facts)))?.then ?? otherwise;
}

/** Same conditions, whatever their order: used to avoid writing the same rule twice. */
export const ruleKey = (conditions: readonly Condition[]): string =>
  conditions
    .map((c) => JSON.stringify(c))
    .sort()
    .join('&');
