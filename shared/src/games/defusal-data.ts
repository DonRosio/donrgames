// Désamorçage: the bomb, the manual pages and how they read. Plain data and pure functions,
// shared by the server (generation, checks) and the client (bomb, manual). No zod here.

export const ROUNDS = 4;
export const PLAYERS = 4;

/** Each error makes the clock run 25 % faster. */
export const SPEED_PER_STRIKE = 0.25;

// ---------------------------------------------------------------------------------------------
// Bomb parameters ("edgework")

export const WIRE_COLORS = ['red', 'blue', 'yellow', 'white', 'black', 'green'] as const;
export type WireColor = (typeof WIRE_COLORS)[number];

export const BUTTON_COLORS = ['red', 'blue', 'yellow', 'white'] as const;
export type ButtonColor = (typeof BUTTON_COLORS)[number];

export const STRIP_COLORS = ['blue', 'white', 'yellow', 'red', 'green', 'purple'] as const;
export type StripColor = (typeof STRIP_COLORS)[number];

export type Color = WireColor | StripColor;

/** Colour of a "fil" or a "bouton" (masculine). */
export const COLOR_NAMES: Readonly<Record<Color, string>> = {
  red: 'rouge',
  blue: 'bleu',
  yellow: 'jaune',
  white: 'blanc',
  black: 'noir',
  green: 'vert',
  purple: 'violet',
};

/** Colour of a "bande" (feminine). */
export const COLOR_NAMES_FEMININE: Readonly<Record<Color, string>> = {
  red: 'rouge',
  blue: 'bleue',
  yellow: 'jaune',
  white: 'blanche',
  black: 'noire',
  green: 'verte',
  purple: 'violette',
};

export const BUTTON_LABELS = ['Annuler', 'Exploser', 'Maintenir', 'Appuyer', 'Abandonner'] as const;
export type ButtonLabel = (typeof BUTTON_LABELS)[number];

export const INDICATOR_LABELS = [
  'SND',
  'CLR',
  'CAR',
  'IND',
  'FRQ',
  'SIG',
  'NSA',
  'MSA',
  'TRN',
  'BOB',
  'FRK',
] as const;
export type IndicatorLabel = (typeof INDICATOR_LABELS)[number];

export const PORTS = ['dvi', 'parallel', 'ps2', 'rj45', 'serial', 'rca'] as const;
export type Port = (typeof PORTS)[number];

export const PORT_NAMES: Readonly<Record<Port, string>> = {
  dvi: 'DVI-D',
  parallel: 'parallèle',
  ps2: 'PS/2',
  rj45: 'RJ-45',
  serial: 'série',
  rca: 'RCA stéréo',
};

/** Letters of the serial number: no O (taken for a zero) and no Y (vowel or not?). */
export const SERIAL_LETTERS = 'ABCDEFGHIJKLMNPQRSTUVWXZ';
export const VOWELS = 'AEIOU';

export interface Indicator {
  label: IndicatorLabel;
  lit: boolean;
}

/** What the defuser reads around the modules: the rules refer to it all the time. */
export interface Edgework {
  /** Six characters; the last one is always a digit. */
  serial: string;
  /** Battery holders: a holder of two AA batteries, or a single D battery. */
  holders: ('AA' | 'D')[];
  indicators: Indicator[];
  ports: Port[];
}

export const batteryCount = (edgework: Edgework): number =>
  edgework.holders.reduce((sum, holder) => sum + (holder === 'AA' ? 2 : 1), 0);

// ---------------------------------------------------------------------------------------------
// Symbols of the keypad: common Greek, Cyrillic and Latin-1 characters (present in every font).

export const GLYPHS = [
  'Ж',
  'Ф',
  'Ψ',
  'Ω',
  'Ξ',
  'Λ',
  'Π',
  'Σ',
  'Б',
  'Д',
  'Ю',
  'Я',
  'Щ',
  'Ћ',
  'Џ',
  'Ђ',
  'Њ',
  'Љ',
  'Ы',
  '¶',
  '©',
  '¿',
  '¥',
  '§',
  '¤',
  'æ',
  'Ø',
  'Þ',
  'ð',
  'ß',
  '★',
  '☆',
] as const;

// ---------------------------------------------------------------------------------------------
// Maze: 6 × 6 cells, numbered row by row from the top left (0 … 35).

export const MAZE_SIZE = 6;
/** Open sides of a cell, as bits. */
export const NORTH = 1;
export const EAST = 2;
export const SOUTH = 4;
export const WEST = 8;

export type Direction = 'up' | 'right' | 'down' | 'left';
export const DIRECTION_BITS: Readonly<Record<Direction, number>> = {
  up: NORTH,
  right: EAST,
  down: SOUTH,
  left: WEST,
};

// ---------------------------------------------------------------------------------------------
// Rules of the manual

/** A condition the experts check with what the defuser describes. */
export type Condition =
  | { k: 'serialOdd' }
  | { k: 'serialEven' }
  | { k: 'serialVowel' }
  | { k: 'serialNoVowel' }
  | { k: 'batteriesMore'; n: number }
  | { k: 'batteriesAtMost'; n: number }
  | { k: 'litIndicator'; label: IndicatorLabel }
  | { k: 'unlitIndicator'; label: IndicatorLabel }
  | { k: 'port'; port: Port }
  | { k: 'noPort'; port: Port }
  | { k: 'wiresNone'; color: WireColor }
  | { k: 'wiresOne'; color: WireColor }
  | { k: 'wiresMany'; color: WireColor }
  | { k: 'firstWire'; color: WireColor }
  | { k: 'lastWire'; color: WireColor }
  | { k: 'buttonColor'; color: ButtonColor }
  | { k: 'buttonLabel'; label: ButtonLabel };

/** Which wire to cut. Positions count from the top, starting at 1. */
export type WireTarget =
  | { k: 'position'; n: number }
  | { k: 'last' }
  | { k: 'firstOf'; color: WireColor }
  | { k: 'lastOf'; color: WireColor };

export type ButtonAction = 'tap' | 'hold';

/** Every condition must hold. The first rule that applies is the one to follow. */
export interface Rule<T> {
  when: Condition[];
  then: T;
}

export interface WireSection {
  /** Number of wires this section is about. */
  count: number;
  rules: Rule<WireTarget>[];
  otherwise: WireTarget;
}

export interface Maze {
  /** Manual number of the maze (1 …). */
  number: number;
  /** Open sides of every cell (bits NORTH, EAST, SOUTH, WEST). */
  cells: number[];
}

/** One sheet of the manual. A module is described by two sheets, always held by two experts. */
export type Page =
  | { kind: 'wires'; sections: WireSection[] }
  | { kind: 'buttonActions'; rules: Rule<ButtonAction>[]; otherwise: ButtonAction }
  | {
      kind: 'buttonStrip';
      strips: { color: StripColor; digit: number }[];
      /** Digit for any colour not listed. */
      otherwise: number;
    }
  | { kind: 'keypad'; columns: { number: number; glyphs: string[] }[] }
  | { kind: 'mazeIndex'; entries: { markers: [number, number]; maze: number }[] }
  | { kind: 'mazes'; mazes: Maze[] };

export type PageKind = Page['kind'];

export const PAGE_TITLES: Readonly<Record<PageKind, string>> = {
  wires: 'Fils',
  buttonActions: 'Bouton : appuyer ou maintenir',
  buttonStrip: 'Bouton : la bande lumineuse',
  keypad: 'Symboles',
  mazeIndex: 'Labyrinthe : identification',
  mazes: 'Labyrinthe : plans',
};

// ---------------------------------------------------------------------------------------------
// What the defuser sees

export type ModuleView =
  | { kind: 'wires'; wires: WireColor[]; cut: number[]; solved: boolean }
  | {
      kind: 'button';
      color: ButtonColor;
      label: ButtonLabel;
      /** The button is held down: the strip lights up. */
      held: boolean;
      strip: StripColor | null;
      solved: boolean;
    }
  | { kind: 'keypad'; glyphs: string[]; pressed: number[]; solved: boolean }
  | {
      kind: 'maze';
      markers: [number, number];
      position: number;
      target: number;
      solved: boolean;
    };

export type ModuleKind = ModuleView['kind'];

export const MODULE_NAMES: Readonly<Record<ModuleKind, string>> = {
  wires: 'Fils',
  button: 'Bouton',
  keypad: 'Symboles',
  maze: 'Labyrinthe',
};

export interface BombView {
  edgework: Edgework;
  modules: ModuleView[];
}

// ---------------------------------------------------------------------------------------------
// Clock

/** The clock: `remaining` ms at server time `since`, counting down `speed` times faster. */
export interface Clock {
  remaining: number;
  since: number;
  speed: number;
}

export const remainingAt = (clock: Clock, now: number): number =>
  Math.max(0, clock.remaining - (now - clock.since) * clock.speed);

/** What the bomb displays: "4:07". Rounded up, so that "0:00" means the explosion. */
export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------------------------
// How the manual reads (French)

const ORDINALS = ['premier', 'deuxième', 'troisième', 'quatrième', 'cinquième', 'sixième'];

export function conditionText(c: Condition): string {
  switch (c.k) {
    case 'serialOdd':
      return 'le dernier chiffre du numéro de série est impair';
    case 'serialEven':
      return 'le dernier chiffre du numéro de série est pair';
    case 'serialVowel':
      return 'le numéro de série contient une voyelle';
    case 'serialNoVowel':
      return 'le numéro de série ne contient aucune voyelle';
    case 'batteriesMore':
      return `la bombe a plus de ${c.n} pile${c.n > 1 ? 's' : ''}`;
    case 'batteriesAtMost':
      return `la bombe a au plus ${c.n} pile${c.n > 1 ? 's' : ''}`;
    case 'litIndicator':
      return `un indicateur allumé porte l'étiquette ${c.label}`;
    case 'unlitIndicator':
      return `un indicateur éteint porte l'étiquette ${c.label}`;
    case 'port':
      return `la bombe a un port ${PORT_NAMES[c.port]}`;
    case 'noPort':
      return `la bombe n'a aucun port ${PORT_NAMES[c.port]}`;
    case 'wiresNone':
      return `il n'y a aucun fil ${COLOR_NAMES[c.color]}`;
    case 'wiresOne':
      return `il y a exactement un fil ${COLOR_NAMES[c.color]}`;
    case 'wiresMany':
      return `il y a plus d'un fil ${COLOR_NAMES[c.color]}`;
    case 'firstWire':
      return `le premier fil est ${COLOR_NAMES[c.color]}`;
    case 'lastWire':
      return `le dernier fil est ${COLOR_NAMES[c.color]}`;
    case 'buttonColor':
      return `le bouton est ${COLOR_NAMES[c.color]}`;
    case 'buttonLabel':
      return `le bouton indique « ${c.label} »`;
  }
}

export const conditionsText = (conditions: readonly Condition[]): string =>
  conditions.map(conditionText).join(' et ');

export function wireTargetText(t: WireTarget): string {
  switch (t.k) {
    case 'position':
      return `le ${ORDINALS[t.n - 1]} fil`;
    case 'last':
      return 'le dernier fil';
    case 'firstOf':
      return `le premier fil ${COLOR_NAMES[t.color]}`;
    case 'lastOf':
      return `le dernier fil ${COLOR_NAMES[t.color]}`;
  }
}

export const BUTTON_ACTION_TEXT: Readonly<Record<ButtonAction, string>> = {
  tap: 'appuyez et relâchez aussitôt',
  hold: 'maintenez le bouton enfoncé et suivez la bande lumineuse',
};
