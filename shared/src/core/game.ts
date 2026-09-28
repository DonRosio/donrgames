import type { z } from 'zod';

export interface GameMeta {
  /** Stable kebab-case identifier, e.g. 'dubbing'. */
  id: string;
  /** Displayed name (French). */
  name: string;
  /** Displayed description (French). */
  description: string;
  minPlayers: number;
  maxPlayers: number;
  /** false: the game consumes its content ("à usage unique" badge, played content tracking). */
  replayable: boolean;
}

export type SettingValue = number | string | boolean;

/** Declarative settings: rendered by a generic form in the lobby, validated by the server. */
export type SettingDef =
  | { kind: 'int'; label: string; min: number; max: number; default: number }
  | {
      kind: 'choice';
      label: string;
      options: readonly { value: string; label: string }[];
      default: string;
    }
  | { kind: 'boolean'; label: string; default: boolean };

export interface ActionDef {
  payload: z.ZodType;
  /** Only the host may send this action. */
  hostOnly?: boolean;
}

/**
 * Everything both halves of a game agree on. Lives in shared/src/games/<id>.ts; the server
 * validates actions with it, the client imports it as a type only.
 */
export interface GameContract {
  meta: GameMeta;
  phases: readonly string[];
  settings: Readonly<Record<string, SettingDef>>;
  actions: Readonly<Record<string, ActionDef>>;
  /** Error codes the game rules can raise; the client module gives their French messages. */
  errors: readonly string[];
}

export function defineContract<const C extends GameContract>(contract: C): C {
  return contract;
}

export type PhaseOf<C extends GameContract> = C['phases'][number];
export type ActionTypeOf<C extends GameContract> = keyof C['actions'] & string;
export type PayloadOf<
  C extends GameContract,
  A extends ActionTypeOf<C>,
> = C['actions'][A]['payload'] extends z.ZodType ? z.output<C['actions'][A]['payload']> : never;
export type GameErrorOf<C extends GameContract> = C['errors'][number];

type SettingValueOf<D> = D extends { kind: 'int' }
  ? number
  : D extends { kind: 'boolean' }
    ? boolean
    : D extends { kind: 'choice'; options: readonly { value: infer V }[] }
      ? V
      : never;

export type SettingsOf<C extends GameContract> = {
  -readonly [K in keyof C['settings']]: SettingValueOf<C['settings'][K]>;
};

/** Public description of a game, served by GET /api/games. */
export interface GameInfo {
  meta: GameMeta;
  settings: Record<string, SettingDef>;
}

/** Final scores given by a game; the core ranks them (ties share a rank). */
export interface ScoreEntry {
  playerId: string;
  score: number;
}
