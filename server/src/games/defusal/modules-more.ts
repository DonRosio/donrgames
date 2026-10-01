import {
  FREQUENCIES,
  MEMORY_BUTTONS,
  MEMORY_STAGES,
  MORSE,
  PASSWORD_WHEEL_SIZE,
  SIMON_COLORS,
} from '@mini-jeux/shared/games/defusal-data';
import type {
  Edgework,
  MemoryRule,
  MemoryStage,
  Page,
  SimonColor,
  SimonMap,
  SimonRow,
} from '@mini-jeux/shared/games/defusal-data';
import type { GameRandom } from '../../core/engine/random.ts';
import { chance, holds, sample } from './rules.ts';
import { WORDS } from './words.ts';

/** The modules of the second half of the game, as the server keeps them, with their solution. */
export type MoreModuleState =
  | {
      kind: 'simon';
      /** One flash per stage: stage `n` plays the first `n + 1`. */
      sequence: SimonColor[];
      rows: SimonRow[];
      /** Current stage (from 0) and how many flashes of it are already answered. */
      stage: number;
      progress: number;
      plays: number;
      solved: boolean;
    }
  | {
      kind: 'morse';
      word: string;
      signal: string[];
      /** Index in `FREQUENCIES` that sends the word: the radio must be tuned to it. */
      target: number;
      tuned: number;
      solved: boolean;
    }
  | {
      kind: 'memory';
      stages: MemoryStage[];
      /** Current stage (from 0), what the screen shows, the labels of the buttons. */
      stage: number;
      display: number;
      labels: number[];
      pressed: { position: number; label: number }[];
      solved: boolean;
    }
  | {
      kind: 'password';
      words: string[];
      target: string;
      wheels: string[][];
      solved: boolean;
    };

export interface MoreGenerated {
  module: MoreModuleState;
  pages: [Page, Page];
}

// ---------------------------------------------------------------------------------------------
// Colours sequence

const SIMON_STAGES = [4, 5] as const;
export const SIMON_ERRORS_COVERED = 3;

/** A map that moves every colour: pressing what flashes would never be right. */
function simonMap(random: GameRandom): SimonMap {
  for (;;) {
    const shuffled = random.shuffle(SIMON_COLORS);
    if (shuffled.every((color, i) => color !== SIMON_COLORS[i])) {
      return Object.fromEntries(SIMON_COLORS.map((color, i) => [color, shuffled[i]!])) as SimonMap;
    }
  }
}

/** The colour to press for a flash, given the errors so far. */
export function simonExpected(
  rows: readonly SimonRow[],
  flash: SimonColor,
  strikes: number,
  edgework: Edgework,
): SimonColor {
  const row = rows.find((r) => r.strikes === Math.min(strikes, SIMON_ERRORS_COVERED - 1))!;
  const vowel = holds({ k: 'serialVowel' }, { edgework });
  return (vowel ? row.vowel : row.noVowel)[flash];
}

export function generateSimon(random: GameRandom): MoreGenerated {
  const stages = random.pick(SIMON_STAGES);
  const sequence = Array.from({ length: stages }, () => random.pick(SIMON_COLORS));
  const rows: SimonRow[] = Array.from({ length: SIMON_ERRORS_COVERED }, (_, strikes) => {
    const vowel = simonMap(random);
    // Two different maps: otherwise the serial number would not matter for this row.
    let noVowel = simonMap(random);
    while (SIMON_COLORS.every((color) => noVowel[color] === vowel[color])) {
      noVowel = simonMap(random);
    }
    return { strikes, vowel, noVowel };
  });
  return {
    module: { kind: 'simon', sequence, rows, stage: 0, progress: 0, plays: 0, solved: false },
    // One expert covers the first stages without error, the other what comes after an error.
    pages: [
      { kind: 'simon', rows: rows.slice(0, 1) },
      { kind: 'simon', rows: rows.slice(1) },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// Morse

const MORSE_WORDS = 16;

export const decodeMorse = (
  alphabet: readonly { letter: string; code: string }[],
  signal: readonly string[],
): string => signal.map((code) => alphabet.find((a) => a.code === code)?.letter ?? '?').join('');

export function generateMorse(random: GameRandom): MoreGenerated {
  const words = sample(random, WORDS, MORSE_WORDS);
  const frequencies = random.shuffle(FREQUENCIES);
  const entries = words.map((word, i) => ({ word, frequency: frequencies[i]! }));
  const word = random.pick(words);
  const target = FREQUENCIES.indexOf(entries.find((e) => e.word === word)!.frequency as never);
  const tuned = random.pick([...FREQUENCIES.keys()].filter((i) => i !== target));
  return {
    module: {
      kind: 'morse',
      word,
      signal: [...word].map((letter) => MORSE[letter]!),
      target,
      tuned,
      solved: false,
    },
    pages: [
      {
        kind: 'morseAlphabet',
        letters: Object.entries(MORSE).map(([letter, code]) => ({ letter, code })),
      },
      { kind: 'morseWords', entries: [...entries].sort((a, b) => a.word.localeCompare(b.word)) },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// Memory

function memoryRule(random: GameRandom, stage: number): MemoryRule {
  // The later stages lean on what was pressed before: the defuser has to remember.
  const kinds =
    stage === 1
      ? (['position', 'label'] as const)
      : stage === 2
        ? (['position', 'label', 'samePosition', 'sameLabel'] as const)
        : ([
            'samePosition',
            'sameLabel',
            'samePosition',
            'sameLabel',
            'position',
            'label',
          ] as const);
  const k = random.pick(kinds);
  if (k === 'position' || k === 'label') return { k, n: 1 + random.int(MEMORY_BUTTONS) };
  return { k, stage: 1 + random.int(stage - 1) };
}

/** What the screen shows and what is written on the four buttons, drawn anew. */
export function drawMemoryScreen(random: GameRandom): { display: number; labels: number[] } {
  return {
    display: 1 + random.int(MEMORY_BUTTONS),
    labels: random.shuffle(Array.from({ length: MEMORY_BUTTONS }, (_, i) => i + 1)),
  };
}

/** Position (from 0) of the button to press at this stage. */
export function memoryExpected(
  stages: readonly MemoryStage[],
  stage: number,
  display: number,
  labels: readonly number[],
  pressed: readonly { position: number; label: number }[],
): number {
  const rule = stages[stage]!.rules[display]!;
  switch (rule.k) {
    case 'position':
      return rule.n - 1;
    case 'label':
      return labels.indexOf(rule.n);
    case 'samePosition':
      return pressed[rule.stage - 1]!.position;
    case 'sameLabel':
      return labels.indexOf(pressed[rule.stage - 1]!.label);
  }
}

export function generateMemory(random: GameRandom): MoreGenerated {
  const stages: MemoryStage[] = Array.from({ length: MEMORY_STAGES }, (_, i) => ({
    stage: i + 1,
    rules: Object.fromEntries(
      Array.from({ length: MEMORY_BUTTONS }, (_, d) => [d + 1, memoryRule(random, i + 1)]),
    ),
  }));
  return {
    module: {
      kind: 'memory',
      stages,
      stage: 0,
      pressed: [],
      solved: false,
      ...drawMemoryScreen(random),
    },
    pages: [
      { kind: 'memory', stages: stages.slice(0, 3) },
      { kind: 'memory', stages: stages.slice(3) },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// Password

const PASSWORD_WORDS = 36;
const ALPHABET = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

/** The words of the list that the wheels can spell. */
export const spellable = (words: readonly string[], wheels: readonly string[][]): string[] =>
  words.filter((word) => [...word].every((letter, i) => wheels[i]!.includes(letter)));

export function generatePassword(random: GameRandom): MoreGenerated {
  for (let attempt = 0; attempt < 5000; attempt++) {
    const words = sample(random, WORDS, PASSWORD_WORDS);
    const target = random.pick(words);
    const wheels = [...target].map((letter, i) => {
      // Decoys are mostly letters that other words really have at this position, so that each
      // wheel rules out some words but not all.
      const others = [...new Set(words.map((w) => w[i]!))].filter((l) => l !== letter);
      const pool =
        attempt < 200 && chance(random, 0.85) ? others : ALPHABET.filter((l) => l !== letter);
      const decoys = sample(random, pool, PASSWORD_WHEEL_SIZE - 1);
      for (const l of random.shuffle(ALPHABET)) {
        if (decoys.length >= PASSWORD_WHEEL_SIZE - 1) break;
        if (l !== letter && !decoys.includes(l)) decoys.push(l);
      }
      return random.shuffle([letter, ...decoys]);
    });
    if (spellable(words, wheels).length !== 1) continue;
    const shuffled = random.shuffle(words);
    const half = PASSWORD_WORDS / 2;
    const page = (list: string[]): Page => ({ kind: 'passwordWords', words: [...list].sort() });
    return {
      module: { kind: 'password', words, target, wheels, solved: false },
      pages: [page(shuffled.slice(0, half)), page(shuffled.slice(half))],
    };
  }
  throw new Error('no unambiguous password found');
}
