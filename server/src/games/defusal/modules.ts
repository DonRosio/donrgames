import {
  BUTTON_COLORS,
  BUTTON_LABELS,
  DIRECTION_BITS,
  EAST,
  GLYPHS,
  MAZE_SIZE,
  NORTH,
  SOUTH,
  STRIP_COLORS,
  WEST,
  WIRE_COLORS,
} from '@mini-jeux/shared/games/defusal-data';
import type {
  ButtonAction,
  ButtonColor,
  ButtonLabel,
  Condition,
  Direction,
  Edgework,
  Maze,
  Page,
  Rule,
  StripColor,
  WireColor,
  WireSection,
  WireTarget,
} from '@mini-jeux/shared/games/defusal-data';
import type { GameRandom } from '../../core/engine/random.ts';
import { chance, edgeworkCondition, firstApplying, ruleKey, sample } from './rules.ts';

/** A module as the server keeps it, with its solution. */
export type ModuleState =
  | { kind: 'wires'; wires: WireColor[]; cut: number[]; solution: number; solved: boolean }
  | {
      kind: 'button';
      color: ButtonColor;
      label: ButtonLabel;
      strip: StripColor;
      action: ButtonAction;
      /** Digit the clock must show when a held button is released. */
      digit: number;
      heldSince: number | null;
      solved: boolean;
    }
  | {
      kind: 'keypad';
      /** As displayed on the four keys. */
      glyphs: string[];
      /** Keys to press, in order. */
      order: number[];
      pressed: number[];
      solved: boolean;
    }
  | {
      kind: 'maze';
      maze: Maze;
      markers: [number, number];
      position: number;
      target: number;
      solved: boolean;
    };

/** A module and the two sheets of the manual that describe it (always for two experts). */
export interface Generated {
  module: ModuleState;
  pages: [Page, Page];
}

/** Half of the time, something the bomb really has, so that rules sometimes apply. */
const likely = <T>(random: GameRandom, present: readonly T[], all: readonly T[]): T =>
  present.length > 0 && chance(random, 0.5) ? random.pick(present) : random.pick(all);

// ---------------------------------------------------------------------------------------------
// Wires

const WIRE_COUNTS = [3, 4, 5, 6] as const;
/** Conditions that guarantee at least one wire of their colour. */
const GUARANTEES_COLOR = new Set(['wiresOne', 'wiresMany', 'firstWire', 'lastWire']);

/** Index of the wire a target designates, or null when there is no such wire. */
export function wireIndex(target: WireTarget, wires: readonly WireColor[]): number | null {
  switch (target.k) {
    case 'position':
      return target.n <= wires.length ? target.n - 1 : null;
    case 'last':
      return wires.length - 1;
    case 'firstOf': {
      const i = wires.indexOf(target.color);
      return i === -1 ? null : i;
    }
    case 'lastOf': {
      const i = wires.lastIndexOf(target.color);
      return i === -1 ? null : i;
    }
  }
}

function wireCondition(random: GameRandom, wires: readonly WireColor[]): Condition {
  const color = likely(random, wires, WIRE_COLORS);
  const k = random.pick(['wiresNone', 'wiresOne', 'wiresMany', 'firstWire', 'lastWire'] as const);
  return { k, color } as Condition;
}

function wireTarget(random: GameRandom, when: readonly Condition[], count: number): WireTarget {
  const sure = when.find((c) => GUARANTEES_COLOR.has(c.k)) as { color: WireColor } | undefined;
  if (sure && chance(random, 0.5)) {
    return { k: chance(random, 0.5) ? 'firstOf' : 'lastOf', color: sure.color };
  }
  return chance(random, 0.25) ? { k: 'last' } : { k: 'position', n: 1 + random.int(count) };
}

function wireSection(
  random: GameRandom,
  count: number,
  wires: readonly WireColor[],
  edgework: Edgework,
): WireSection {
  const rules: Rule<WireTarget>[] = [];
  const seen = new Set<string>();
  while (rules.length < (count <= 4 ? 4 : 5)) {
    const when = [wireCondition(random, wires)];
    if (chance(random, 0.5)) when.push(edgeworkCondition(random, edgework));
    const key = ruleKey(when);
    if (seen.has(key)) continue;
    seen.add(key);
    rules.push({ when, then: wireTarget(random, when, count) });
  }
  return { count, rules, otherwise: wireTarget(random, [], count) };
}

export function solveWires(
  sections: readonly WireSection[],
  wires: readonly WireColor[],
  edgework: Edgework,
): number | null {
  const section = sections.find((s) => s.count === wires.length);
  if (!section) return null;
  const target = firstApplying(section.rules, section.otherwise, { edgework, wires });
  return wireIndex(target, wires);
}

export function generateWires(random: GameRandom, edgework: Edgework): Generated {
  const wires = Array.from({ length: random.pick(WIRE_COUNTS) }, () => random.pick(WIRE_COLORS));
  const sections = WIRE_COUNTS.map((count) => wireSection(random, count, wires, edgework));
  const solution = solveWires(sections, wires, edgework);
  if (solution === null) throw new Error('wires without a solution');
  return {
    module: { kind: 'wires', wires, cut: [], solution, solved: false },
    pages: [
      { kind: 'wires', sections: sections.slice(0, 2) },
      { kind: 'wires', sections: sections.slice(2) },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// Button

/** Below this, a press is a tap; above, the button is held (and the strip lights up). */
export const HOLD_MS = 700;
/** Releasing a held button is judged on what the clock showed during this last moment. */
export const RELEASE_TOLERANCE_MS = 750;

export function solveButton(
  pages: {
    actions: Extract<Page, { kind: 'buttonActions' }>;
    strip: Extract<Page, { kind: 'buttonStrip' }>;
  },
  button: { color: ButtonColor; label: ButtonLabel; strip: StripColor },
  edgework: Edgework,
): { action: ButtonAction; digit: number } {
  const action = firstApplying(pages.actions.rules, pages.actions.otherwise, {
    edgework,
    button,
  });
  const digit =
    pages.strip.strips.find((s) => s.color === button.strip)?.digit ?? pages.strip.otherwise;
  return { action, digit };
}

export function generateButton(random: GameRandom, edgework: Edgework): Generated {
  const color = random.pick(BUTTON_COLORS);
  const label = random.pick(BUTTON_LABELS);
  const strip = random.pick(STRIP_COLORS);

  const rules: Rule<ButtonAction>[] = [];
  const seen = new Set<string>();
  while (rules.length < 5) {
    const when: Condition[] = [
      chance(random, 0.5)
        ? { k: 'buttonColor', color: likely(random, [color], BUTTON_COLORS) }
        : { k: 'buttonLabel', label: likely(random, [label], BUTTON_LABELS) },
    ];
    if (chance(random, 0.6)) when.push(edgeworkCondition(random, edgework));
    const key = ruleKey(when);
    if (seen.has(key)) continue;
    seen.add(key);
    rules.push({ when, then: chance(random, 0.5) ? 'tap' : 'hold' });
  }
  const actions: Extract<Page, { kind: 'buttonActions' }> = {
    kind: 'buttonActions',
    rules,
    otherwise: chance(random, 0.5) ? 'tap' : 'hold',
  };

  const digits = sample(random, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 5);
  const stripPage: Extract<Page, { kind: 'buttonStrip' }> = {
    kind: 'buttonStrip',
    strips: sample(random, STRIP_COLORS, 4).map((c, i) => ({ color: c, digit: digits[i]! })),
    otherwise: digits[4]!,
  };

  const { action, digit } = solveButton(
    { actions, strip: stripPage },
    { color, label, strip },
    edgework,
  );
  return {
    module: { kind: 'button', color, label, strip, action, digit, heldSince: null, solved: false },
    pages: [actions, stripPage],
  };
}

// ---------------------------------------------------------------------------------------------
// Keypad

const COLUMNS = 6;
const GLYPHS_PER_COLUMN = 6;

/** The keys to press, in order: the only column holding all four symbols gives the order. */
export function solveKeypad(
  columns: readonly { glyphs: readonly string[] }[],
  glyphs: readonly string[],
): number[] | null {
  const matching = columns.filter((column) => glyphs.every((g) => column.glyphs.includes(g)));
  if (matching.length !== 1) return null;
  const column = matching[0]!.glyphs;
  return [...glyphs.keys()].sort((a, b) => column.indexOf(glyphs[a]!) - column.indexOf(glyphs[b]!));
}

export function generateKeypad(random: GameRandom): Generated {
  for (;;) {
    const columns = Array.from({ length: COLUMNS }, (_, i) => ({
      number: i + 1,
      glyphs: sample(random, GLYPHS, GLYPHS_PER_COLUMN),
    }));
    const column = random.pick(columns);
    const picked = sample(random, column.glyphs, 4);
    const glyphs = random.shuffle(picked);
    const order = solveKeypad(columns, glyphs);
    if (!order) continue; // Another column holds the same four symbols: draw again.
    return {
      module: { kind: 'keypad', glyphs, order, pressed: [], solved: false },
      pages: [
        { kind: 'keypad', columns: columns.slice(0, 3) },
        { kind: 'keypad', columns: columns.slice(3) },
      ],
    };
  }
}

// ---------------------------------------------------------------------------------------------
// Maze

const MAZES = 9;
const CELLS = MAZE_SIZE * MAZE_SIZE;
const MIN_PATH = 6;

const STEPS: readonly { bit: number; opposite: number; dr: number; dc: number }[] = [
  { bit: NORTH, opposite: SOUTH, dr: -1, dc: 0 },
  { bit: EAST, opposite: WEST, dr: 0, dc: 1 },
  { bit: SOUTH, opposite: NORTH, dr: 1, dc: 0 },
  { bit: WEST, opposite: EAST, dr: 0, dc: -1 },
];

/** The cell next to `cell` in that direction, if a passage leads there; null for a wall. */
export function step(maze: Maze, cell: number, direction: Direction): number | null {
  const bit = DIRECTION_BITS[direction];
  if ((maze.cells[cell]! & bit) === 0) return null;
  const { dr, dc } = STEPS.find((s) => s.bit === bit)!;
  return (Math.floor(cell / MAZE_SIZE) + dr) * MAZE_SIZE + (cell % MAZE_SIZE) + dc;
}

/** A perfect maze (exactly one path between two cells), dug at random. */
function digMaze(random: GameRandom, number: number): Maze {
  const cells = new Array<number>(CELLS).fill(0);
  const visited = new Set<number>();
  const stack = [random.int(CELLS)];
  visited.add(stack[0]!);
  while (stack.length > 0) {
    const cell = stack.at(-1)!;
    const row = Math.floor(cell / MAZE_SIZE);
    const col = cell % MAZE_SIZE;
    const options = STEPS.filter(({ dr, dc }) => {
      const r = row + dr;
      const c = col + dc;
      return r >= 0 && r < MAZE_SIZE && c >= 0 && c < MAZE_SIZE && !visited.has(r * MAZE_SIZE + c);
    });
    if (options.length === 0) {
      stack.pop();
      continue;
    }
    const { bit, opposite, dr, dc } = random.pick(options);
    const next = (row + dr) * MAZE_SIZE + col + dc;
    cells[cell]! |= bit;
    cells[next]! |= opposite;
    visited.add(next);
    stack.push(next);
  }
  return { number, cells };
}

/** Number of moves from one cell to another. */
export function distance(maze: Maze, from: number, to: number): number {
  const seen = new Map([[from, 0]]);
  const queue = [from];
  while (queue.length > 0) {
    const cell = queue.shift()!;
    if (cell === to) return seen.get(cell)!;
    for (const direction of ['up', 'right', 'down', 'left'] as const) {
      const next = step(maze, cell, direction);
      if (next !== null && !seen.has(next)) {
        seen.set(next, seen.get(cell)! + 1);
        queue.push(next);
      }
    }
  }
  return Infinity;
}

const pairKey = (pair: readonly number[]) => [...pair].sort((a, b) => a - b).join('-');

export function generateMaze(random: GameRandom): Generated {
  const numbers = random.shuffle(Array.from({ length: MAZES }, (_, i) => i + 1));
  const mazes = numbers.map((n) => digMaze(random, n));
  // Two markers per maze; no two mazes share the same pair, so the markers identify the maze.
  const markers = new Map<number, [number, number]>();
  const used = new Set<string>();
  for (const maze of mazes) {
    for (;;) {
      const pair = sample(random, [...Array(CELLS).keys()], 2) as [number, number];
      if (used.has(pairKey(pair))) continue;
      used.add(pairKey(pair));
      markers.set(maze.number, pair);
      break;
    }
  }
  const maze = random.pick(mazes);
  const pair = markers.get(maze.number)!;
  const free = [...Array(CELLS).keys()].filter((cell) => !pair.includes(cell));
  for (;;) {
    const [position, target] = sample(random, free, 2) as [number, number];
    if (distance(maze, position, target) < MIN_PATH) continue;
    return {
      module: { kind: 'maze', maze, markers: pair, position, target, solved: false },
      pages: [
        {
          kind: 'mazeIndex',
          entries: random
            .shuffle(mazes)
            .map((m) => ({ markers: markers.get(m.number)!, maze: m.number })),
        },
        { kind: 'mazes', mazes: [...mazes].sort((a, b) => a.number - b.number) },
      ],
    };
  }
}

/** Which maze of the manual the markers designate. */
export function identifyMaze(
  index: Extract<Page, { kind: 'mazeIndex' }>,
  markers: readonly [number, number],
): number | null {
  return index.entries.find((e) => pairKey(e.markers) === pairKey(markers))?.maze ?? null;
}
