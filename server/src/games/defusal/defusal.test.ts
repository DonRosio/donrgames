import { describe, expect, it } from 'vitest';
import type { DefusalView } from '@mini-jeux/shared/games/defusal';
import {
  FREQUENCIES,
  PURGE_WORDS,
  VALVES,
  formatClock,
  remainingAt,
} from '@mini-jeux/shared/games/defusal-data';
import type { Direction, ModuleView, Page } from '@mini-jeux/shared/games/defusal-data';
import { createHarness } from '../../core/engine/harness.ts';
import { seededRandom } from '../../core/engine/random.ts';
import { validateGameDefinition } from '../../core/engine/validate.ts';
import { MODULES_PER_BOMB, dealPages, generateBomb } from './bomb.ts';
import { defusalGame } from './index.ts';
import type { DefusalState } from './index.ts';
import {
  HOLD_MS,
  distance,
  identifyMaze,
  solveButton,
  solveKeypad,
  solveWires,
  step,
} from './modules.ts';
import type { ModuleState } from './modules.ts';
import { decodeMorse, memoryExpected, simonExpected, spellable } from './modules-more.ts';
import {
  PURGE_FIRST_MIN_MS,
  PURGE_FIRST_SPAN_MS,
  PURGE_SLEEP_MIN_MS,
  PURGE_SLEEP_SPAN_MS,
  PURGE_WINDOW_MS,
  purgeAnswer,
} from './purge.ts';

const PLAYERS = ['alice', 'bob', 'carol', 'dave'];
const SECOND = 1000;

function play(options: { seed?: number; strikes?: number; minutes?: number } = {}) {
  return createHarness(defusalGame, {
    players: PLAYERS,
    seed: options.seed ?? 1,
    settings: { strikes: options.strikes ?? 2, minutes: options.minutes ?? 5 },
  });
}

type G = ReturnType<typeof play>;
const view = <P extends DefusalView['phase']>(g: G, player: string, phase: P) => {
  const v = g.view(player);
  expect(v.phase).toBe(phase);
  return v as DefusalView & { phase: P };
};
const defuserOf = (g: G) => (g.view('alice') as { defuser: string }).defuser;
const expertsOf = (g: G) => PLAYERS.filter((p) => p !== defuserOf(g));
const state = (g: G) => g.state as DefusalState;

function start(g: G) {
  for (const p of PLAYERS) g.act(p, 'ready');
  return view(g, defuserOf(g), 'defusing');
}

const bombOf = (g: G) => view(g, defuserOf(g), 'defusing').bomb!;
const kindsOf = (g: G) => bombOf(g).modules.map((m) => m.kind);
const indexOf = (g: G, kind: ModuleView['kind']) => kindsOf(g).indexOf(kind);
const viewOf = <K extends ModuleView['kind']>(g: G, kind: K) =>
  bombOf(g).modules[indexOf(g, kind)] as Extract<ModuleView, { kind: K }>;
/** The server's own module, with its solution (tests only). */
const moduleState = <K extends ModuleState['kind']>(g: G, kind: K) =>
  state(g).bomb!.modules.find((m) => m.kind === kind) as Extract<ModuleState, { kind: K }>;

/** Every sheet the three experts hold together: what the team can read. */
const manual = (g: G): Page[] => expertsOf(g).flatMap((p) => view(g, p, 'defusing').pages!);
const pagesOf = <K extends Page['kind']>(pages: Page[], kind: K) =>
  pages.filter((p) => p.kind === kind) as Extract<Page, { kind: K }>[];

/** First seed whose bomb holds all of these kinds of module (the bomb is already started). */
function withModules(
  kinds: ModuleView['kind'][],
  options: { strikes?: number; minutes?: number } = {},
) {
  for (let seed = 1; seed < 300; seed++) {
    const g = play({ seed, ...options });
    start(g);
    if (kinds.every((kind) => kindsOf(g).includes(kind))) return g;
  }
  throw new Error(`no seed holds ${kinds.join(', ')}`);
}

/** The path through a maze, as moves. */
function route(cells: number[], from: number, to: number): Direction[] {
  const maze = { number: 0, cells };
  const path: Direction[] = [];
  let cell = from;
  while (cell !== to) {
    const next = (['up', 'right', 'down', 'left'] as const).find((d) => {
      const n = step(maze, cell, d);
      return n !== null && distance(maze, n, to) < distance(maze, cell, to);
    })!;
    path.push(next);
    cell = step(maze, cell, next)!;
  }
  return path;
}

/**
 * A virtual team: the defuser describes, the experts read their sheets, the defuser acts. It only
 * uses what the players see in their views, so it proves the manual is enough to solve the bomb.
 */
function defuseModule(g: G, i: number) {
  const d = defuserOf(g);
  const bomb = bombOf(g);
  const { edgework } = bomb;
  const pages = manual(g);
  const module = bomb.modules[i]!;
  const strikesNow = () => view(g, d, 'defusing').strikes;
  switch (module.kind) {
    case 'wires': {
      const sections = pagesOf(pages, 'wires').flatMap((p) => p.sections);
      const wire = solveWires(sections, module.wires, edgework);
      expect(wire).not.toBeNull();
      expect(g.act(d, 'cut', { module: i, wire: wire! })).toEqual({ ok: true });
      return;
    }
    case 'button': {
      const actions = pagesOf(pages, 'buttonActions')[0]!;
      const strip = pagesOf(pages, 'buttonStrip')[0]!;
      g.act(d, 'buttonDown', { module: i });
      const held = bombOf(g).modules[i] as Extract<ModuleView, { kind: 'button' }>;
      expect(held.held).toBe(true);
      const { action, digit } = solveButton(
        { actions, strip },
        { color: held.color, label: held.label, strip: held.strip! },
        edgework,
      );
      if (action === 'tap') {
        g.advance(100);
      } else {
        g.advance(HOLD_MS);
        const clock = view(g, d, 'defusing').clock;
        while (!formatClock(remainingAt(clock, g.clock.now())).includes(String(digit))) {
          g.advance(100);
        }
      }
      expect(g.act(d, 'buttonUp', { module: i })).toEqual({ ok: true });
      return;
    }
    case 'keypad': {
      const columns = pagesOf(pages, 'keypad').flatMap((p) => p.columns);
      const order = solveKeypad(columns, module.glyphs);
      expect(order).not.toBeNull();
      for (const key of order!) g.act(d, 'press', { module: i, key });
      return;
    }
    case 'maze': {
      const index = pagesOf(pages, 'mazeIndex')[0]!;
      const number = identifyMaze(index, module.markers);
      expect(number).not.toBeNull();
      const maze = pagesOf(pages, 'mazes')[0]!.mazes.find((m) => m.number === number)!;
      for (const direction of route(maze.cells, module.position, module.target)) {
        g.act(d, 'move', { module: i, direction });
      }
      return;
    }
    case 'simon': {
      const rows = pagesOf(pages, 'simon').flatMap((p) => p.rows);
      for (let stage = 0; stage < module.stages; stage++) {
        const now = bombOf(g).modules[i] as Extract<ModuleView, { kind: 'simon' }>;
        expect(now.flashes).toHaveLength(stage + 1);
        for (const flash of now.flashes) {
          const color = simonExpected(rows, flash, strikesNow(), edgework);
          expect(g.act(d, 'simon', { module: i, color })).toEqual({ ok: true });
        }
      }
      return;
    }
    case 'morse': {
      const alphabet = pagesOf(pages, 'morseAlphabet')[0]!.letters;
      const word = decodeMorse(alphabet, module.signal);
      const entry = pagesOf(pages, 'morseWords')[0]!.entries.find((e) => e.word === word);
      expect(entry, `word ${word}`).toBeDefined();
      const wanted = FREQUENCIES.indexOf(entry!.frequency as never);
      let tuned = module.tuned;
      while (tuned !== wanted) {
        g.act(d, 'tune', { module: i, direction: tuned < wanted ? 'up' : 'down' });
        tuned += tuned < wanted ? 1 : -1;
      }
      expect(g.act(d, 'transmit', { module: i })).toEqual({ ok: true });
      return;
    }
    case 'memory': {
      const stages = pagesOf(pages, 'memory')
        .flatMap((p) => p.stages)
        .sort((a, b) => a.stage - b.stage);
      const pressed: { position: number; label: number }[] = [];
      for (let stage = 0; stage < module.stages; stage++) {
        const now = bombOf(g).modules[i] as Extract<ModuleView, { kind: 'memory' }>;
        expect(now.stage).toBe(stage);
        const position = memoryExpected(stages, stage, now.display, now.labels, pressed);
        pressed.push({ position, label: now.labels[position]! });
        expect(g.act(d, 'memory', { module: i, position })).toEqual({ ok: true });
      }
      return;
    }
    case 'password': {
      const words = pagesOf(pages, 'passwordWords').flatMap((p) => p.words);
      const candidates = spellable(words, module.wheels);
      expect(candidates).toHaveLength(1);
      expect(g.act(d, 'password', { module: i, word: candidates[0]! })).toEqual({ ok: true });
    }
  }
}

/** Answers the purge if it is awake, from what the defuser reads and what the experts hold. */
function answerPurge(g: G) {
  const d = defuserOf(g);
  const { purge, edgework } = bombOf(g);
  if (!purge.active) return false;
  const pages = manual(g);
  const table = pagesOf(pages, 'purgeWords')[0]!.entries;
  const shift = pagesOf(pages, 'purgeShift')[0]!;
  const valve = purgeAnswer(table, shift.rules, shift.otherwise, purge.word!, edgework);
  expect(g.act(d, 'purge', { valve: VALVES.indexOf(valve) })).toEqual({ ok: true });
  return true;
}

function defuseAll(g: G) {
  const modules = kindsOf(g).length;
  for (let i = 0; i < modules; i++) {
    answerPurge(g);
    defuseModule(g, i);
  }
}

/** Goes forward in time until the purge wakes up (at most one minute and a half). */
function untilPurge(g: G) {
  for (let t = 0; t < 90; t++) {
    if (bombOf(g).purge.active) return;
    g.advance(SECOND);
  }
  throw new Error('the purge never woke up');
}

/** Goes forward in time, answering the purge whenever it wakes up (nobody forgets it here). */
function waitAnswering(g: G, ms: number) {
  let left = ms;
  while (left > 0) {
    const stepMs = Math.min(left, SECOND);
    g.advance(stepMs);
    left -= stepMs;
    if (g.phase === 'defusing') answerPurge(g);
  }
}

/** One wrong gesture on any module that allows it again and again: an error. */
function makeError(g: G) {
  const d = defuserOf(g);
  const kinds = kindsOf(g);
  const { edgework } = bombOf(g);
  const pages = manual(g);
  for (const kind of ['password', 'morse', 'simon', 'memory', 'keypad', 'maze'] as const) {
    const i = kinds.indexOf(kind);
    if (i === -1) continue;
    const module = state(g).bomb!.modules[i]!;
    if (module.kind === 'password') g.act(d, 'password', { module: i, word: 'QQQQQ' });
    if (module.kind === 'morse') g.act(d, 'transmit', { module: i });
    if (module.kind === 'simon') {
      const rows = pagesOf(pages, 'simon').flatMap((p) => p.rows);
      const flash = module.sequence[module.progress]!;
      const good = simonExpected(rows, flash, state(g).strikes, edgework);
      const color = (['red', 'blue', 'green', 'yellow'] as const).find((c) => c !== good)!;
      g.act(d, 'simon', { module: i, color });
    }
    if (module.kind === 'memory') {
      const expected = memoryExpected(
        module.stages,
        module.stage,
        module.display,
        module.labels,
        module.pressed,
      );
      g.act(d, 'memory', { module: i, position: (expected + 1) % 4 });
    }
    if (module.kind === 'keypad') g.act(d, 'press', { module: i, key: module.order[1]! });
    if (module.kind === 'maze') {
      const wall = (['up', 'right', 'down', 'left'] as const).find(
        (dir) => step(module.maze, module.position, dir) === null,
      )!;
      g.act(d, 'move', { module: i, direction: wall });
    }
    return;
  }
  throw new Error('no module allows an error');
}

describe('Désamorçage: the manual always leads to the solution', () => {
  it('is a valid definition', () => {
    expect(() => validateGameDefinition(defusalGame)).not.toThrow();
  });

  it('a team that reads its manual correctly defuses every bomb without an error', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 150; seed++) {
      const g = play({ seed });
      start(g);
      for (const kind of kindsOf(g)) seen.add(kind);
      defuseAll(g);
      const v = view(g, 'alice', 'result');
      expect(v, `seed ${seed}`).toMatchObject({ outcome: 'defused', strikes: 0, solved: 6 });
    }
    expect(seen.size).toBe(8);
  });

  it('a bomb has six different modules out of the eight, and the purge on top', () => {
    const counts = new Map<string, number>();
    for (let seed = 1; seed <= 400; seed++) {
      const bomb = generateBomb(seededRandom(seed));
      const kinds = bomb.modules.map((m) => m.kind);
      expect(kinds).toHaveLength(MODULES_PER_BOMB);
      expect(new Set(kinds).size).toBe(MODULES_PER_BOMB);
      expect(bomb.pages).toHaveLength(MODULES_PER_BOMB + 1);
      for (const kind of kinds) counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    // Each module comes up three times out of four.
    for (const n of counts.values()) expect(n / 400).toBeGreaterThan(0.65);
    expect(counts.size).toBe(8);
  });

  it('generates bombs whose manual is unambiguous', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const bomb = generateBomb(seededRandom(seed));
      const pages = bomb.pages.flat();
      for (const module of bomb.modules) {
        if (module.kind === 'wires') {
          const sections = pagesOf(pages, 'wires').flatMap((p) => p.sections);
          expect(sections.map((s) => s.count).sort()).toEqual([3, 4, 5, 6]);
          expect(solveWires(sections, module.wires, bomb.edgework)).toBe(module.solution);
        }
        if (module.kind === 'keypad') {
          const columns = pagesOf(pages, 'keypad').flatMap((p) => p.columns);
          expect(columns).toHaveLength(6);
          expect(
            columns.filter((c) => module.glyphs.every((x) => c.glyphs.includes(x))),
          ).toHaveLength(1);
        }
        if (module.kind === 'maze') {
          const index = pagesOf(pages, 'mazeIndex')[0]!;
          const keys = index.entries.map((e) => [...e.markers].sort().join('-'));
          expect(new Set(keys).size).toBe(9);
          expect(identifyMaze(index, module.markers)).toBe(module.maze.number);
          expect(module.markers).not.toContain(module.position);
          expect(distance(module.maze, module.position, module.target)).toBeGreaterThanOrEqual(6);
        }
        if (module.kind === 'button') {
          const strip = pagesOf(pages, 'buttonStrip')[0]!;
          const digits = [...strip.strips.map((s) => s.digit), strip.otherwise];
          expect(new Set(digits).size).toBe(digits.length);
        }
        if (module.kind === 'simon') {
          const rows = pagesOf(pages, 'simon').flatMap((p) => p.rows);
          expect(rows.map((r) => r.strikes).sort()).toEqual([0, 1, 2]);
          expect([4, 5]).toContain(module.sequence.length);
          for (const row of rows) {
            for (const map of [row.vowel, row.noVowel]) {
              // Every colour is sent to another one, and no two colours to the same.
              expect(new Set(Object.values(map)).size).toBe(4);
              for (const [flash, press] of Object.entries(map)) expect(press).not.toBe(flash);
            }
            // The serial number must matter: the two maps of a row differ.
            expect(row.vowel).not.toEqual(row.noVowel);
          }
        }
        if (module.kind === 'morse') {
          const alphabet = pagesOf(pages, 'morseAlphabet')[0]!.letters;
          const entries = pagesOf(pages, 'morseWords')[0]!.entries;
          expect(alphabet).toHaveLength(26);
          expect(entries).toHaveLength(16);
          expect(new Set(entries.map((e) => e.word)).size).toBe(16);
          expect(new Set(entries.map((e) => e.frequency)).size).toBe(16);
          expect(decodeMorse(alphabet, module.signal)).toBe(module.word);
          const wanted = entries.find((e) => e.word === module.word)!.frequency;
          expect(FREQUENCIES[module.target]).toBe(wanted);
          expect(module.tuned).not.toBe(module.target);
        }
        if (module.kind === 'memory') {
          const stages = pagesOf(pages, 'memory').flatMap((p) => p.stages);
          expect(stages.map((s) => s.stage).sort()).toEqual([1, 2, 3, 4, 5]);
          expect(
            pagesOf(pages, 'memory')
              .map((p) => p.stages.length)
              .sort(),
          ).toEqual([2, 3]);
          for (const { stage, rules } of stages) {
            expect(Object.keys(rules).sort()).toEqual(['1', '2', '3', '4']);
            for (const rule of Object.values(rules)) {
              // Only what an earlier stage pressed can be referred to.
              if ('stage' in rule) expect(rule.stage).toBeLessThan(stage);
              if ('n' in rule) expect(rule.n).toBeGreaterThanOrEqual(1);
              if ('n' in rule) expect(rule.n).toBeLessThanOrEqual(4);
            }
          }
          expect(module.labels.slice().sort()).toEqual([1, 2, 3, 4]);
        }
        if (module.kind === 'password') {
          const words = pagesOf(pages, 'passwordWords').flatMap((p) => p.words);
          expect(words).toHaveLength(36);
          expect(new Set(words).size).toBe(36);
          expect(spellable(words, module.wheels)).toEqual([module.target]);
          expect(module.wheels).toHaveLength(5);
          for (const wheel of module.wheels) {
            expect(wheel).toHaveLength(6);
            expect(new Set(wheel).size).toBe(6);
          }
        }
      }
      const table = pagesOf(pages, 'purgeWords')[0]!.entries;
      const shift = pagesOf(pages, 'purgeShift')[0]!;
      expect(table.map((e) => e.word).sort()).toEqual([...PURGE_WORDS].sort());
      expect(shift.rules).toHaveLength(5);
      for (const word of PURGE_WORDS) {
        expect(VALVES).toContain(
          purgeAnswer(table, shift.rules, shift.otherwise, word, bomb.edgework),
        );
      }
    }
  });

  it('every maze of the manual has exactly one path between any two cells', () => {
    let mazes: { number: number; cells: number[] }[] | undefined;
    for (let seed = 1; !mazes; seed++) {
      mazes = pagesOf(generateBomb(seededRandom(seed)).pages.flat(), 'mazes')[0]?.mazes;
    }
    expect(mazes.map((m) => m.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const maze of mazes) {
      const passages = maze.cells.reduce(
        (sum, c) => sum + (c.toString(2).split('1').length - 1),
        0,
      );
      expect(passages / 2).toBe(35);
      for (let cell = 1; cell < 36; cell++) expect(distance(maze, 0, cell)).toBeLessThan(Infinity);
    }
  });
});

describe('Désamorçage: roles and manuals', () => {
  it('waits for everybody before starting the clock', () => {
    const g = play();
    const v = view(g, 'bob', 'briefing');
    expect(v).toMatchObject({ round: 1, rounds: 4, minutes: 5, maxStrikes: 2, ready: [] });
    for (const p of PLAYERS.slice(0, 3)) g.act(p, 'ready');
    view(g, 'bob', 'briefing');
    g.act('dave', 'ready');
    view(g, 'bob', 'defusing');
  });

  it('"Passer à la suite" starts without waiting', () => {
    const g = play();
    g.skip();
    view(g, 'alice', 'defusing');
  });

  it('shows the bomb to the defuser only, and the manual to the experts only', () => {
    const g = play();
    start(g);
    const d = defuserOf(g);
    expect(view(g, d, 'defusing')).toMatchObject({ pages: null, modules: 6 });
    expect(view(g, d, 'defusing').bomb!.modules).toHaveLength(6);
    for (const e of expertsOf(g)) {
      const v = view(g, e, 'defusing');
      expect(v.bomb).toBeNull();
      expect(v.pages!.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('never tells the defuser a solution, and the purge screen is blank while it sleeps', () => {
    const g = start(play({ seed: 3 }));
    const text = JSON.stringify(g.bomb);
    for (const secret of ['solution', '"order"', '"sequence"', '"answer"', '"rules"']) {
      expect(text, secret).not.toContain(secret);
    }
    expect(g.bomb!.purge).toEqual({ active: false, word: null, until: null });
  });

  it('gives each expert a different part of the manual, the two halves of a module apart', () => {
    const halves: Record<string, [Page['kind'], Page['kind']]> = {
      button: ['buttonActions', 'buttonStrip'],
      maze: ['mazeIndex', 'mazes'],
      morse: ['morseAlphabet', 'morseWords'],
    };
    const doubles: Record<string, Page['kind']> = {
      wires: 'wires',
      keypad: 'keypad',
      simon: 'simon',
      memory: 'memory',
      password: 'passwordWords',
    };
    for (let seed = 1; seed <= 50; seed++) {
      const g = play({ seed });
      start(g);
      const hands = expertsOf(g).map((e) => view(g, e, 'defusing').pages!);
      expect(hands.flat()).toHaveLength(14);
      const loads = hands.map((h) => h.length);
      expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(1);
      const holder = (kind: Page['kind']) => hands.findIndex((h) => h.some((p) => p.kind === kind));
      const kinds = new Set<string>(kindsOf(g));
      for (const [module, [a, b]] of Object.entries(halves)) {
        if (kinds.has(module)) expect(holder(a), `seed ${seed} ${module}`).not.toBe(holder(b));
      }
      expect(holder('purgeWords')).not.toBe(holder('purgeShift'));
      for (const [module, kind] of Object.entries(doubles)) {
        if (!kinds.has(module)) continue;
        expect(hands.filter((h) => h.some((p) => p.kind === kind))).toHaveLength(2);
      }
    }
  });

  it('deals evenly whatever the draw', () => {
    const bomb = generateBomb(seededRandom(3));
    const hands = dealPages(seededRandom(9), ['x', 'y', 'z'], bomb.pages);
    const loads = [...hands.values()].map((h) => h.length).sort();
    expect(loads.reduce((a, b) => a + b)).toBe(14);
    expect(loads[2]! - loads[0]!).toBeLessThanOrEqual(1);
  });

  it('only the defuser acts on the bomb', () => {
    const g = play();
    start(g);
    const expert = expertsOf(g)[0]!;
    expect(g.act(expert, 'purge', { valve: 0 })).toEqual({ ok: false, error: 'NOT_DEFUSER' });
    expect(g.act(expert, 'password', { module: 0, word: 'ABCDE' })).toEqual({
      ok: false,
      error: 'NOT_DEFUSER',
    });
  });

  it('refuses an action on the wrong module, or on a module already defused', () => {
    const g = withModules(['password', 'wires']);
    const d = defuserOf(g);
    expect(g.act(d, 'cut', { module: indexOf(g, 'password'), wire: 0 })).toEqual({
      ok: false,
      error: 'BAD_MODULE',
    });
    expect(g.act(d, 'cut', { module: 9, wire: 0 })).toEqual({ ok: false, error: 'BAD_MODULE' });
    defuseModule(g, indexOf(g, 'password'));
    expect(g.act(d, 'password', { module: indexOf(g, 'password'), word: 'QQQQQ' })).toEqual({
      ok: false,
      error: 'BAD_MODULE',
    });
    expect(view(g, 'alice', 'defusing').strikes).toBe(0);
  });
});

describe('Désamorçage: errors and clock', () => {
  it('an error is counted, speeds the clock up, and leaves the module to solve', () => {
    const g = play();
    start(g);
    makeError(g);
    const v = view(g, 'alice', 'defusing');
    expect(v.strikes).toBe(1);
    expect(v.clock.speed).toBe(1.25);
    expect(v.solved).toBe(0);
  });

  it('explodes at the chosen error: 2 by default', () => {
    const g = play();
    start(g);
    makeError(g);
    view(g, 'alice', 'defusing');
    makeError(g);
    expect(view(g, 'alice', 'result')).toMatchObject({
      outcome: 'exploded',
      strikes: 2,
      remaining: 0,
    });
  });

  it('with 1 allowed error, the first error is fatal; with 3, the third', () => {
    const one = play({ strikes: 1 });
    start(one);
    makeError(one);
    expect(view(one, 'alice', 'result').outcome).toBe('exploded');

    const three = play({ strikes: 3 });
    start(three);
    makeError(three);
    makeError(three);
    view(three, 'alice', 'defusing');
    makeError(three);
    expect(view(three, 'alice', 'result').outcome).toBe('exploded');
  });

  it('explodes when the clock reaches zero', () => {
    const g = play({ minutes: 2 });
    start(g);
    waitAnswering(g, 2 * 60 * SECOND - 1);
    view(g, 'alice', 'defusing');
    g.advance(1);
    expect(view(g, 'alice', 'result')).toMatchObject({ outcome: 'exploded', remaining: 0 });
  });

  it('an error brings the explosion closer', () => {
    const g = play({ minutes: 5, strikes: 3 });
    start(g);
    g.advance(10 * SECOND);
    makeError(g); // 290 s left, now running 1.25 times faster: 232 s.
    waitAnswering(g, 232 * SECOND - 10);
    view(g, 'alice', 'defusing');
    g.advance(10);
    expect(view(g, 'alice', 'result').outcome).toBe('exploded');
  });

  it('a wall of the maze is an error, and the dot does not move', () => {
    const g = withModules(['maze']);
    const i = indexOf(g, 'maze');
    const module = moduleState(g, 'maze');
    const wall = (['up', 'right', 'down', 'left'] as const).find(
      (d) => step(module.maze, module.position, d) === null,
    )!;
    const before = module.position;
    g.act(defuserOf(g), 'move', { module: i, direction: wall });
    expect(view(g, 'alice', 'defusing').strikes).toBe(1);
    expect(viewOf(g, 'maze').position).toBe(before);
  });

  it('a symbol pressed out of order is an error, and nothing is kept', () => {
    const g = withModules(['keypad']);
    const i = indexOf(g, 'keypad');
    g.act(defuserOf(g), 'press', { module: i, key: moduleState(g, 'keypad').order[1]! });
    expect(view(g, 'alice', 'defusing').strikes).toBe(1);
    expect(viewOf(g, 'keypad').pressed).toEqual([]);
  });

  it('the button: a tap when it must be held, or a release at the wrong time, is an error', () => {
    let tested = 0;
    for (let seed = 1; seed <= 80 && tested < 2; seed++) {
      const g = play({ seed, strikes: 3 });
      start(g);
      const i = indexOf(g, 'button');
      if (i === -1 || moduleState(g, 'button').action !== 'hold') continue;
      const module = moduleState(g, 'button');
      const d = defuserOf(g);
      g.act(d, 'buttonDown', { module: i });
      g.act(d, 'buttonUp', { module: i });
      expect(view(g, 'alice', 'defusing').strikes).toBe(1);
      g.act(d, 'buttonDown', { module: i });
      g.advance(HOLD_MS);
      const clock = view(g, d, 'defusing').clock;
      const shows = (t: number) =>
        formatClock(remainingAt(clock, t)).includes(String(module.digit));
      while (shows(g.clock.now()) || shows(g.clock.now() - 750)) g.advance(100);
      g.act(d, 'buttonUp', { module: i });
      expect(view(g, 'alice', 'defusing').strikes).toBe(2);
      tested++;
    }
    expect(tested).toBe(2);
  });
});

describe('Désamorçage: the colours module', () => {
  it('starts with one flash, and a wrong colour is an error that restarts the stage', () => {
    const g = withModules(['simon']);
    const i = indexOf(g, 'simon');
    const module = moduleState(g, 'simon');
    expect(viewOf(g, 'simon')).toMatchObject({ stage: 0, progress: 0, plays: 0 });
    expect(viewOf(g, 'simon').flashes).toEqual(module.sequence.slice(0, 1));
    const rows = pagesOf(manual(g), 'simon').flatMap((p) => p.rows);
    const good = simonExpected(rows, module.sequence[0]!, 0, bombOf(g).edgework);
    const wrong = (['red', 'blue', 'green', 'yellow'] as const).find((c) => c !== good)!;
    g.act(defuserOf(g), 'simon', { module: i, color: wrong });
    expect(view(g, 'alice', 'defusing').strikes).toBe(1);
    expect(viewOf(g, 'simon')).toMatchObject({ stage: 0, progress: 0, plays: 1 });
  });

  it('adds a flash at each stage won, and the old answers stop being right after an error', () => {
    const g = withModules(['simon', 'password'], { strikes: 3 });
    const d = defuserOf(g);
    const i = indexOf(g, 'simon');
    const module = moduleState(g, 'simon');
    const rows = pagesOf(manual(g), 'simon').flatMap((p) => p.rows);
    const { edgework } = bombOf(g);
    g.act(d, 'simon', {
      module: i,
      color: simonExpected(rows, module.sequence[0]!, 0, edgework),
    });
    expect(viewOf(g, 'simon')).toMatchObject({ stage: 1, progress: 0, plays: 1 });
    expect(viewOf(g, 'simon').flashes).toHaveLength(2);

    // An error elsewhere: the answers now come from the row of one error.
    g.act(d, 'password', { module: indexOf(g, 'password'), word: 'QQQQQ' });
    expect(view(g, 'alice', 'defusing').strikes).toBe(1);
    const flash = module.sequence[0]!;
    const oldAnswer = simonExpected(rows, flash, 0, edgework);
    if (oldAnswer !== simonExpected(rows, flash, 1, edgework)) {
      g.act(d, 'simon', { module: i, color: oldAnswer });
      expect(view(g, 'alice', 'defusing').strikes).toBe(2);
    }
  });
});

describe('Désamorçage: the radio', () => {
  it('moves one step at a time and stops at both ends', () => {
    const g = withModules(['morse']);
    const d = defuserOf(g);
    const i = indexOf(g, 'morse');
    for (let n = 0; n < 20; n++) g.act(d, 'tune', { module: i, direction: 'down' });
    expect(viewOf(g, 'morse').tuned).toBe(0);
    for (let n = 0; n < 30; n++) g.act(d, 'tune', { module: i, direction: 'up' });
    expect(viewOf(g, 'morse').tuned).toBe(FREQUENCIES.length - 1);
    expect(view(g, 'alice', 'defusing').strikes).toBe(0);
  });

  it('sending on the wrong frequency is an error', () => {
    const g = withModules(['morse']);
    g.act(defuserOf(g), 'transmit', { module: indexOf(g, 'morse') });
    expect(view(g, 'alice', 'defusing').strikes).toBe(1);
    expect(viewOf(g, 'morse').solved).toBe(false);
  });

  it('flashes the word letter by letter, as dots and dashes', () => {
    const g = withModules(['morse']);
    const { word } = moduleState(g, 'morse');
    expect(viewOf(g, 'morse').signal).toHaveLength(word.length);
    expect(viewOf(g, 'morse').signal.join('')).toMatch(/^[.-]+$/);
  });
});

describe('Désamorçage: the memory', () => {
  it('goes through five stages, with a new screen at each', () => {
    const g = withModules(['memory']);
    const i = indexOf(g, 'memory');
    expect(viewOf(g, 'memory')).toMatchObject({ stage: 0, stages: 5 });
    const stages = pagesOf(manual(g), 'memory')
      .flatMap((p) => p.stages)
      .sort((a, b) => a.stage - b.stage);
    const pressed: { position: number; label: number }[] = [];
    const screens = new Set<string>();
    for (let stage = 0; stage < 5; stage++) {
      const now = viewOf(g, 'memory');
      screens.add(JSON.stringify([now.display, now.labels]));
      const position = memoryExpected(stages, stage, now.display, now.labels, pressed);
      pressed.push({ position, label: now.labels[position]! });
      g.act(defuserOf(g), 'memory', { module: i, position });
      if (stage < 4) expect(viewOf(g, 'memory').stage).toBe(stage + 1);
    }
    expect(viewOf(g, 'memory').solved).toBe(true);
    expect(screens.size).toBeGreaterThan(1);
  });

  it('a wrong button is an error and sends back to the first stage', () => {
    const g = withModules(['memory']);
    const i = indexOf(g, 'memory');
    const stages = pagesOf(manual(g), 'memory')
      .flatMap((p) => p.stages)
      .sort((a, b) => a.stage - b.stage);
    // Win the first stage, then fail the second.
    const first = viewOf(g, 'memory');
    const position = memoryExpected(stages, 0, first.display, first.labels, []);
    g.act(defuserOf(g), 'memory', { module: i, position });
    expect(viewOf(g, 'memory').stage).toBe(1);
    const second = viewOf(g, 'memory');
    const good = memoryExpected(stages, 1, second.display, second.labels, [
      { position, label: first.labels[position]! },
    ]);
    g.act(defuserOf(g), 'memory', { module: i, position: (good + 1) % 4 });
    expect(view(g, 'alice', 'defusing').strikes).toBe(1);
    expect(viewOf(g, 'memory')).toMatchObject({ stage: 0, solved: false });
  });
});

describe('Désamorçage: the password', () => {
  it('a wrong word is an error', () => {
    const g = withModules(['password']);
    g.act(defuserOf(g), 'password', { module: indexOf(g, 'password'), word: 'QQQQQ' });
    expect(view(g, 'alice', 'defusing').strikes).toBe(1);
    expect(viewOf(g, 'password').solved).toBe(false);
  });

  it('refuses anything but five capital letters', () => {
    const g = withModules(['password']);
    const i = indexOf(g, 'password');
    for (const word of ['abcde', 'ABCD', 'ABCDEF', 'AB1DE', '']) {
      expect(g.act(defuserOf(g), 'password', { module: i, word }).ok, word).toBe(false);
    }
  });
});

describe('Désamorçage: the purge', () => {
  it('sleeps at first, then wakes up between 25 and 45 seconds', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = play({ seed });
      start(g);
      g.advance(PURGE_FIRST_MIN_MS - 1);
      expect(bombOf(g).purge.active).toBe(false);
      g.advance(PURGE_FIRST_SPAN_MS + 1);
      const purge = bombOf(g).purge;
      expect(purge.active).toBe(true);
      expect(PURGE_WORDS).toContain(purge.word);
      expect(purge.until! - g.clock.now()).toBeGreaterThan(0);
      expect(purge.until! - g.clock.now()).toBeLessThanOrEqual(PURGE_WINDOW_MS);
    }
  });

  it('only the defuser sees its screen, and it asks for nothing while asleep', () => {
    const g = play();
    start(g);
    const d = defuserOf(g);
    expect(g.act(d, 'purge', { valve: 0 })).toEqual({ ok: false, error: 'BAD_MODULE' });
    expect(view(g, 'alice', 'defusing').strikes).toBe(0);
    untilPurge(g);
    for (const e of expertsOf(g)) expect(view(g, e, 'defusing').bomb).toBeNull();
  });

  it('the right valve calms it down, until the next activation', () => {
    const g = play();
    start(g);
    untilPurge(g);
    expect(answerPurge(g)).toBe(true);
    expect(bombOf(g).purge).toEqual({ active: false, word: null, until: null });
    expect(view(g, 'alice', 'defusing').strikes).toBe(0);
    g.advance(PURGE_SLEEP_MIN_MS - 1);
    expect(bombOf(g).purge.active).toBe(false);
    g.advance(PURGE_SLEEP_SPAN_MS + 1);
    expect(bombOf(g).purge.active).toBe(true);
  });

  it('a wrong valve is an error, and the purge stays awake to try again', () => {
    const g = play({ strikes: 3 });
    start(g);
    untilPurge(g);
    const { purge, edgework } = bombOf(g);
    const pages = manual(g);
    const table = pagesOf(pages, 'purgeWords')[0]!.entries;
    const shift = pagesOf(pages, 'purgeShift')[0]!;
    const good = purgeAnswer(table, shift.rules, shift.otherwise, purge.word!, edgework);
    const wrong = VALVES.findIndex((v) => v !== good);
    g.act(defuserOf(g), 'purge', { valve: wrong });
    expect(view(g, 'alice', 'defusing').strikes).toBe(1);
    expect(bombOf(g).purge.active).toBe(true);
    expect(answerPurge(g)).toBe(true);
    expect(bombOf(g).purge.active).toBe(false);
  });

  it('an answer that comes too late is an error, and it sleeps again', () => {
    const g = play({ strikes: 3 });
    start(g);
    untilPurge(g);
    const until = bombOf(g).purge.until!;
    g.advance(until - g.clock.now() - 1);
    expect(bombOf(g).purge.active).toBe(true);
    expect(view(g, 'alice', 'defusing').strikes).toBe(0);
    g.advance(1);
    expect(view(g, 'alice', 'defusing').strikes).toBe(1);
    expect(bombOf(g).purge).toEqual({ active: false, word: null, until: null });
    // Waking up again later: it is a new window, with all its time.
    untilPurge(g);
    g.advance(bombOf(g).purge.until! - g.clock.now() - 1);
    expect(view(g, 'alice', 'defusing').strikes).toBe(1);
    expect(bombOf(g).purge.active).toBe(true);
  });

  it('a window closed by a right answer cannot close the next one', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const g = play({ seed, strikes: 3, minutes: 10 });
      start(g);
      untilPurge(g);
      answerPurge(g);
      untilPurge(g);
      // The first window would have closed by now (or will, during this one): the second must
      // still have all its time.
      g.advance(bombOf(g).purge.until! - g.clock.now() - 1);
      expect(view(g, 'alice', 'defusing').strikes, `seed ${seed}`).toBe(0);
      expect(bombOf(g).purge.active).toBe(true);
    }
  });

  it('is never counted among the modules to defuse', () => {
    const g = play();
    start(g);
    untilPurge(g);
    answerPurge(g);
    expect(view(g, 'alice', 'defusing')).toMatchObject({ solved: 0, modules: 6 });
    defuseAll(g);
    expect(view(g, 'alice', 'result')).toMatchObject({ outcome: 'defused', solved: 6 });
  });

  it('forgetting it is enough to blow the bomb up', () => {
    const g = play({ strikes: 2, minutes: 10 });
    start(g);
    untilPurge(g);
    g.advance(PURGE_WINDOW_MS); // first error
    view(g, 'alice', 'defusing');
    untilPurge(g);
    g.advance(PURGE_WINDOW_MS); // second error
    expect(view(g, 'alice', 'result').outcome).toBe('exploded');
  });

  it('stops with the bomb: nothing wakes up during the result', () => {
    const g = play();
    start(g);
    defuseAll(g);
    view(g, 'alice', 'result');
    g.advance(5 * 60 * SECOND);
    view(g, 'alice', 'result');
  });
});

describe('Désamorçage: four bombs, everybody defuses once', () => {
  it('rotates the defuser, draws new rules each bomb, and ends with the team score', () => {
    const g = play({ seed: 4 });
    const defusers: string[] = [];
    const firstSheets: string[] = [];
    for (let round = 1; round <= 4; round++) {
      expect(view(g, 'alice', 'briefing').round).toBe(round);
      start(g);
      defusers.push(defuserOf(g));
      firstSheets.push(JSON.stringify(manual(g)));
      if (round === 2) {
        g.advance(10 * 60 * SECOND); // this one explodes
      } else {
        defuseAll(g);
      }
      const v = view(g, 'alice', 'result');
      expect(v.last).toBe(round === 4);
      g.act('alice', 'next');
    }
    expect(new Set(defusers).size).toBe(4);
    expect(new Set(firstSheets).size).toBe(4);
    expect(g.ended).toBe(true);
    const history = state(g).history;
    expect(history.map((h) => h.outcome)).toEqual(['defused', 'exploded', 'defused', 'defused']);
    const expected = history
      .filter((h) => h.outcome === 'defused')
      .reduce((sum, h) => sum + 100 + Math.floor(h.remaining / 1000), 0);
    for (const entry of g.ranking!) expect(entry.score).toBe(expected);
  });
});
