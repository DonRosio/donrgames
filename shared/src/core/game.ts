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
  /** Only these numbers of players are allowed (e.g. [5, 10]); any count in the bounds otherwise. */
  playerCounts?: readonly number[];
  /** Singular name of one content item, in French (default: 'vidéo'; e.g. 'question'). */
  contentUnit?: string;
  /** false: the game consumes its content ("à usage unique" badge, played content tracking). */
  replayable: boolean;
  /** Badge of a non-replayable game, instead of "à usage unique" (e.g. '3 parties par salon'). */
  usageLabel?: string;
  /**
   * false: a game played for fun, with no final ranking. When it ends (`ctx.end([])`), everyone
   * goes straight back to the lobby.
   */
  ranked?: false;
}

/** "2 à 10 joueurs", or "5 ou 10 joueurs" for games with fixed player counts. */
export function playerCountLabel(meta: GameMeta): string {
  const counts = meta.playerCounts;
  if (!counts || counts.length === 0) return `${meta.minPlayers} à ${meta.maxPlayers} joueurs`;
  if (counts.length === 1) return `${counts[0]} joueurs`;
  return `${counts.slice(0, -1).join(', ')} ou ${counts.at(-1)} joueurs`;
}

export type SettingValue = number | string | boolean | readonly string[];

/** One checkbox of a 'multi' setting. */
export interface MultiOption {
  value: string;
  label: string;
  /** Always checked, cannot be unchecked. */
  locked?: boolean;
  /** Shown greyed out, never checked (e.g. not ready yet). */
  disabled?: boolean;
  /** Short note shown next to the option. */
  note?: string;
  /** When this option is checked, at least this many options must be checked. */
  minWhenChecked?: number;
}

/** Declarative settings: rendered by a generic form in the lobby, validated by the server. */
export type SettingDef =
  | {
      kind: 'int';
      label: string;
      min: number;
      /** 'contentLeft': number of content items not played yet in the room. */
      max: number | 'contentLeft';
      /** 'contentLeft': every item not played yet in the room. */
      default: number | 'contentLeft';
    }
  | {
      kind: 'choice';
      label: string;
      options: readonly { value: string; label: string }[];
      default: string;
    }
  | { kind: 'boolean'; label: string; default: boolean }
  | {
      /** Several options to check; the default is every option that is not disabled. */
      kind: 'multi';
      label: string;
      options: readonly MultiOption[];
      /** Minimum number of checked options. */
      min: number;
    };

type MultiDef = Extract<SettingDef, { kind: 'multi' }>;

/** Default value of a 'multi' setting: every option that is not disabled, in option order. */
export function defaultMulti(def: MultiDef): string[] {
  return def.options.filter((option) => !option.disabled).map((option) => option.value);
}

/**
 * Whether a set of checked options is allowed: known options only, no duplicate, locked ones
 * included, disabled ones excluded, and enough options checked. Shared by the server (which
 * enforces it) and the lobby form (which only offers the changes it would accept).
 */
export function isValidMulti(def: MultiDef, value: unknown): value is string[] {
  if (!Array.isArray(value) || new Set(value).size !== value.length) return false;
  const checked = new Set<unknown>(value);
  for (const item of value) {
    const option = def.options.find((candidate) => candidate.value === item);
    if (!option || option.disabled) return false;
    if (option.minWhenChecked !== undefined && value.length < option.minWhenChecked) return false;
  }
  if (def.options.some((option) => option.locked && !checked.has(option.value))) return false;
  return value.length >= def.min;
}

export interface ActionDef {
  payload: z.ZodType;
  /** Only the host may send this action. */
  hostOnly?: boolean;
}

/**
 * Everything both halves of a game agree on. Lives in shared/src/games/<id>.ts; the server
 * validates actions with it, the client imports it as a type only.
 */
export interface UploadDef {
  /** Metadata sent along with the file (X-Upload-Meta header, JSON). */
  meta: z.ZodType;
  /** Accepted container types; the real type is checked from the file content. */
  mimeTypes: readonly string[];
}

export interface GameContract {
  meta: GameMeta;
  phases: readonly string[];
  settings: Readonly<Record<string, SettingDef>>;
  actions: Readonly<Record<string, ActionDef>>;
  /** Files the players can send (e.g. a recorded take). */
  uploads?: Readonly<Record<string, UploadDef>>;
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
export type UploadKindOf<C extends GameContract> = keyof NonNullable<C['uploads']> & string;
export type UploadMetaOf<C extends GameContract, K extends UploadKindOf<C>> = NonNullable<
  C['uploads']
>[K]['meta'] extends z.ZodType
  ? z.output<NonNullable<C['uploads']>[K]['meta']>
  : never;

type SettingValueOf<D> = D extends { kind: 'int' }
  ? number
  : D extends { kind: 'boolean' }
    ? boolean
    : D extends { kind: 'multi'; options: readonly { value: infer V }[] }
      ? V[]
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

/** Something a client may download during a game: a content file or a private recording. */
export type MediaRef =
  { kind: 'content'; gameId: string; id: string } | { kind: 'media'; id: string };

/** Final scores given by a game; the core ranks them (ties share a rank). */
export interface ScoreEntry {
  playerId: string;
  score: number;
}
