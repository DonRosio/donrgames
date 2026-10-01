import { describe, expect, it } from 'vitest';
import type { DefusalView } from '@mini-jeux/shared/games/defusal';
import { formatClock, remainingAt } from '@mini-jeux/shared/games/defusal-data';
import type { Direction, ModuleView, Page } from '@mini-jeux/shared/games/defusal-data';
import { createHarness } from '../../core/engine/harness.ts';
import { seededRandom } from '../../core/engine/random.ts';
import { validateGameDefinition } from '../../core/engine/validate.ts';
import { dealPages, generateBomb } from './bomb.ts';
import { defusalGame } from './index.ts';
import {
  HOLD_MS,
  distance,
  identifyMaze,
  solveButton,
  solveKeypad,
  solveWires,
  step,
} from './modules.ts';

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

function start(g: G) {
  for (const p of PLAYERS) g.act(p, 'ready');
  return view(g, defuserOf(g), 'defusing');
}

const bombOf = (g: G) => view(g, defuserOf(g), 'defusing').bomb!;
const indexOf = (g: G, kind: ModuleView['kind']) =>
  bombOf(g).modules.findIndex((m) => m.kind === kind);
/** Every sheet the three experts hold together: what the team can read. */
const manual = (g: G): Page[] => expertsOf(g).flatMap((p) => view(g, p, 'defusing').pages!);
const pageOf = <K extends Page['kind']>(pages: Page[], kind: K) =>
  pages.filter((p) => p.kind === kind) as Extract<Page, { kind: K }>[];

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
function defuseModule(g: G, kind: ModuleView['kind']) {
  const d = defuserOf(g);
  const i = indexOf(g, kind);
  const { edgework } = bombOf(g);
  const pages = manual(g);
  const module = bombOf(g).modules[i]!;
  switch (module.kind) {
    case 'wires': {
      const sections = pageOf(pages, 'wires').flatMap((p) => p.sections);
      const wire = solveWires(sections, module.wires, edgework);
      expect(wire).not.toBeNull();
      expect(g.act(d, 'cut', { module: i, wire: wire! })).toEqual({ ok: true });
      return;
    }
    case 'button': {
      const actions = pageOf(pages, 'buttonActions')[0]!;
      const strip = pageOf(pages, 'buttonStrip')[0]!;
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
      const columns = pageOf(pages, 'keypad').flatMap((p) => p.columns);
      const order = solveKeypad(columns, module.glyphs);
      expect(order).not.toBeNull();
      for (const key of order!) g.act(d, 'press', { module: i, key });
      return;
    }
    case 'maze': {
      const index = pageOf(pages, 'mazeIndex')[0]!;
      const number = identifyMaze(index, module.markers);
      expect(number).not.toBeNull();
      const maze = pageOf(pages, 'mazes')[0]!.mazes.find((m) => m.number === number)!;
      for (const direction of route(maze.cells, module.position, module.target)) {
        g.act(d, 'move', { module: i, direction });
      }
    }
  }
}

function defuseAll(g: G) {
  for (const kind of ['wires', 'button', 'keypad', 'maze'] as const) defuseModule(g, kind);
}

describe('Désamorçage: the manual always leads to the solution', () => {
  it('is a valid definition', () => {
    expect(() => validateGameDefinition(defusalGame)).not.toThrow();
  });

  it('a team that reads its manual correctly defuses every bomb without an error', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const g = play({ seed });
      start(g);
      defuseAll(g);
      const v = view(g, 'alice', 'result');
      expect(v, `seed ${seed}`).toMatchObject({ outcome: 'defused', strikes: 0, solved: 4 });
    }
  });

  it('generates bombs whose manual is unambiguous', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const bomb = generateBomb(seededRandom(seed));
      const pages = bomb.pages.flat();
      for (const module of bomb.modules) {
        if (module.kind === 'wires') {
          const sections = pageOf(pages, 'wires').flatMap((p) => p.sections);
          expect(sections.map((s) => s.count).sort()).toEqual([3, 4, 5, 6]);
          expect(solveWires(sections, module.wires, bomb.edgework)).toBe(module.solution);
        }
        if (module.kind === 'keypad') {
          const columns = pageOf(pages, 'keypad').flatMap((p) => p.columns);
          expect(columns).toHaveLength(6);
          // Exactly one column holds the four symbols.
          expect(
            columns.filter((c) => module.glyphs.every((x) => c.glyphs.includes(x))),
          ).toHaveLength(1);
        }
        if (module.kind === 'maze') {
          const index = pageOf(pages, 'mazeIndex')[0]!;
          const keys = index.entries.map((e) => [...e.markers].sort().join('-'));
          expect(new Set(keys).size).toBe(9);
          expect(identifyMaze(index, module.markers)).toBe(module.maze.number);
          expect(module.markers).not.toContain(module.position);
          expect(distance(module.maze, module.position, module.target)).toBeGreaterThanOrEqual(6);
        }
        if (module.kind === 'button') {
          const strip = pageOf(pages, 'buttonStrip')[0]!;
          const digits = [...strip.strips.map((s) => s.digit), strip.otherwise];
          expect(new Set(digits).size).toBe(digits.length);
        }
      }
    }
  });

  it('every maze of the manual has exactly one path between any two cells', () => {
    const bomb = generateBomb(seededRandom(7));
    const mazes = pageOf(bomb.pages.flat(), 'mazes')[0]!.mazes;
    expect(mazes.map((m) => m.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const maze of mazes) {
      // A perfect maze on 36 cells has 35 passages, and every cell is reachable.
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
    expect(view(g, d, 'defusing')).toMatchObject({ pages: null });
    expect(view(g, d, 'defusing').bomb!.modules).toHaveLength(4);
    for (const e of expertsOf(g)) {
      const v = view(g, e, 'defusing');
      expect(v.bomb).toBeNull();
      expect(v.pages!.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('gives each expert a different part of the manual, the two halves of a module apart', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const g = play({ seed });
      start(g);
      const hands = expertsOf(g).map((e) => view(g, e, 'defusing').pages!);
      expect(hands.flat()).toHaveLength(8);
      expect(hands.map((h) => h.length).sort()).toEqual([2, 3, 3]);
      const halves: Page['kind'][][] = [
        ['buttonActions', 'buttonStrip'],
        ['mazeIndex', 'mazes'],
      ];
      for (const [a, b] of halves) {
        const holderA = hands.findIndex((h) => h.some((p) => p.kind === a));
        const holderB = hands.findIndex((h) => h.some((p) => p.kind === b));
        expect(holderA).not.toBe(holderB);
      }
      for (const kind of ['wires', 'keypad'] as const) {
        expect(hands.filter((h) => h.some((p) => p.kind === kind))).toHaveLength(2);
      }
    }
  });

  it('deals evenly whatever the draw', () => {
    const bomb = generateBomb(seededRandom(3));
    const hands = dealPages(seededRandom(9), ['x', 'y', 'z'], bomb.pages);
    expect([...hands.values()].map((h) => h.length).sort()).toEqual([2, 3, 3]);
  });

  it('only the defuser acts on the bomb', () => {
    const g = play();
    start(g);
    const expert = expertsOf(g)[0]!;
    expect(g.act(expert, 'cut', { module: indexOf(g, 'wires'), wire: 0 })).toEqual({
      ok: false,
      error: 'NOT_DEFUSER',
    });
  });

  it('refuses an action on the wrong module, a wire already cut, a solved module', () => {
    const g = play();
    start(g);
    const d = defuserOf(g);
    expect(g.act(d, 'cut', { module: indexOf(g, 'maze'), wire: 0 })).toEqual({
      ok: false,
      error: 'BAD_MODULE',
    });
    expect(g.act(d, 'cut', { module: 9, wire: 0 })).toEqual({ ok: false, error: 'BAD_MODULE' });
    const wires = bombOf(g).modules[indexOf(g, 'wires')] as Extract<ModuleView, { kind: 'wires' }>;
    expect(g.act(d, 'cut', { module: indexOf(g, 'wires'), wire: wires.wires.length })).toEqual({
      ok: false,
      error: 'BAD_MODULE',
    });
    defuseModule(g, 'wires');
    expect(g.act(d, 'cut', { module: indexOf(g, 'wires'), wire: 0 })).toEqual({
      ok: false,
      error: 'BAD_MODULE',
    });
  });
});

describe('Désamorçage: errors and clock', () => {
  /** Presses the second symbol first: always wrong, and it can be done again and again. */
  function wrongPress(g: G) {
    const i = indexOf(g, 'keypad');
    const module = g.state.bomb!.modules[i] as { order: number[] };
    g.act(defuserOf(g), 'press', { module: i, key: module.order[1]! });
  }

  it('an error is counted, speeds the clock up, and leaves the module to solve', () => {
    const g = play();
    start(g);
    wrongPress(g);
    const v = view(g, 'alice', 'defusing');
    expect(v.strikes).toBe(1);
    expect(v.clock.speed).toBe(1.25);
    expect(v.solved).toBe(0);
  });

  it('explodes at the chosen error: 2 by default', () => {
    const g = play();
    start(g);
    wrongPress(g);
    view(g, 'alice', 'defusing');
    wrongPress(g);
    expect(view(g, 'alice', 'result')).toMatchObject({
      outcome: 'exploded',
      strikes: 2,
      remaining: 0,
    });
  });

  it('with 1 allowed error, the first error is fatal; with 3, the third', () => {
    const one = play({ strikes: 1 });
    start(one);
    wrongPress(one);
    expect(view(one, 'alice', 'result').outcome).toBe('exploded');

    const three = play({ strikes: 3 });
    start(three);
    wrongPress(three);
    wrongPress(three);
    view(three, 'alice', 'defusing');
    wrongPress(three);
    expect(view(three, 'alice', 'result').outcome).toBe('exploded');
  });

  it('explodes when the clock reaches zero', () => {
    const g = play({ minutes: 2 });
    start(g);
    g.advance(2 * 60 * SECOND - 1);
    view(g, 'alice', 'defusing');
    g.advance(1);
    expect(view(g, 'alice', 'result')).toMatchObject({ outcome: 'exploded', remaining: 0 });
  });

  it('an error brings the explosion closer', () => {
    const g = play({ minutes: 5 });
    start(g);
    g.advance(60 * SECOND);
    wrongPress(g); // 240 s left, now running 1.25 times faster: 192 s.
    g.advance(192 * SECOND - 10);
    view(g, 'alice', 'defusing');
    g.advance(10);
    expect(view(g, 'alice', 'result').outcome).toBe('exploded');
  });

  it('a wall of the maze is an error, and the dot does not move', () => {
    const g = play();
    start(g);
    const i = indexOf(g, 'maze');
    const module = g.state.bomb!.modules[i] as Extract<
      (typeof g.state.bomb & object)['modules'][number],
      { kind: 'maze' }
    >;
    const wall = (['up', 'right', 'down', 'left'] as const).find(
      (d) => step(module.maze, module.position, d) === null,
    )!;
    const before = module.position;
    g.act(defuserOf(g), 'move', { module: i, direction: wall });
    expect(view(g, 'alice', 'defusing').strikes).toBe(1);
    expect((bombOf(g).modules[i] as { position: number }).position).toBe(before);
  });

  it('a symbol pressed out of order is an error, and nothing is kept', () => {
    const g = play();
    start(g);
    const i = indexOf(g, 'keypad');
    const module = g.state.bomb!.modules[i] as { order: number[] };
    g.act(defuserOf(g), 'press', { module: i, key: module.order[1]! });
    expect(view(g, 'alice', 'defusing').strikes).toBe(1);
    expect((bombOf(g).modules[i] as { pressed: number[] }).pressed).toEqual([]);
  });

  it('the button: a tap when it must be held, or a release at the wrong time, is an error', () => {
    let tested = 0;
    for (let seed = 1; seed <= 40 && tested < 2; seed++) {
      const g = play({ seed, strikes: 3 });
      start(g);
      const i = indexOf(g, 'button');
      const module = g.state.bomb!.modules[i] as { action: string; digit: number };
      if (module.action !== 'hold') continue;
      const d = defuserOf(g);
      // A quick tap.
      g.act(d, 'buttonDown', { module: i });
      g.act(d, 'buttonUp', { module: i });
      expect(view(g, 'alice', 'defusing').strikes).toBe(1);
      // Held, released when the clock does not show the digit (nor did just before).
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
        g.skip(); // nothing happens during the defusal
        g.advance(5 * 60 * SECOND); // this one explodes
      } else {
        g.advance(30 * SECOND);
        defuseAll(g);
      }
      const v = view(g, 'alice', 'result');
      expect(v.last).toBe(round === 4);
      expect(g.act('bob', 'next')).toEqual(
        PLAYERS[0] === 'bob' ? { ok: true } : { ok: false, error: 'NOT_HOST' },
      );
      g.act('alice', 'next');
    }
    expect(new Set(defusers).size).toBe(4);
    expect(new Set(firstSheets).size).toBe(4);
    expect(g.ended).toBe(true);
    const history = (g.state as { history: { outcome: string; remaining: number }[] }).history;
    expect(history.map((h) => h.outcome)).toEqual(['defused', 'exploded', 'defused', 'defused']);
    const expected = history
      .filter((h) => h.outcome === 'defused')
      .reduce((sum, h) => sum + 100 + Math.floor(h.remaining / 1000), 0);
    for (const entry of g.ranking!) expect(entry.score).toBe(expected);
  });
});
