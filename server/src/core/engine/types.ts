import type {
  ActionTypeOf,
  GameContract,
  GameErrorOf,
  PayloadOf,
  PhaseOf,
  ScoreEntry,
  SettingsOf,
} from '@mini-jeux/shared';
import type { GameRandom } from './random.ts';

export interface RosterEntry {
  id: string;
  nickname: string;
  /** Still in the room (false once the player left or was kicked). */
  present: boolean;
  connected: boolean;
  /** Connected, or disconnected for less than the grace delay: the game should wait for them. */
  awaited: boolean;
}

/** Participants of the game (players present when it started), with their live status. */
export interface Roster {
  all(): readonly RosterEntry[];
  get(playerId: string): RosterEntry | undefined;
  /** Ids of the participants the game should currently wait for. */
  awaited(): string[];
  /** Ids of the connected participants. */
  connected(): string[];
}

export type PlayerChange = {
  playerId: string;
  kind: 'disconnected' | 'reconnected' | 'unawaited' | 'left';
};

export interface GameContext<C extends GameContract> {
  readonly phase: PhaseOf<C>;
  /** Server time in ms (fake in tests). */
  now(): number;
  readonly random: GameRandom;
  readonly players: Roster;
  /** Declared transition: runs the `enter` of the new phase and cancels the timers of the old one. */
  goto(phase: PhaseOf<C>): void;
  /** Technical timer: calls `timer(id)` of the current phase after `delayMs`. Replaces a timer with the same id. */
  schedule(id: string, delayMs: number): void;
  cancel(id: string): void;
  /** Refuses the current action: the sender gets `{ ok: false, error: code }`. Nothing must be mutated before. */
  reject(code: GameErrorOf<C>): never;
  /** Ends the game: the core ranks the scores, shows the final ranking, then goes back to the lobby. */
  end(scores: readonly ScoreEntry[]): void;
}

export interface ViewContext<C extends GameContract> {
  readonly phase: PhaseOf<C>;
  now(): number;
  readonly players: Roster;
}

export type ActionHandlers<C extends GameContract, S> = {
  [A in ActionTypeOf<C>]?: (
    state: S,
    ctx: GameContext<C>,
    from: string,
    payload: PayloadOf<C, A>,
  ) => void;
};

export interface PhaseDef<C extends GameContract, S> {
  /** The only actions accepted in this phase (enforced by the core before calling the game). */
  actions: readonly ActionTypeOf<C>[];
  /** Phases reachable from this one (checked by ctx.goto). */
  next: readonly PhaseOf<C>[];
  enter?(state: S, ctx: GameContext<C>): void;
  on?: ActionHandlers<C, S>;
  timer?(state: S, ctx: GameContext<C>, id: string): void;
}

/**
 * Server side of a game: a state machine that is the only source of truth. Handlers are
 * synchronous, mutate the state, and check everything before mutating anything.
 */
export interface GameDefinition<
  C extends GameContract,
  S,
  V extends { phase: PhaseOf<C> } = { phase: PhaseOf<C> },
> {
  contract: C;
  setup(ctx: GameContext<C>, init: { players: readonly string[]; settings: SettingsOf<C> }): S;
  initialPhase: PhaseOf<C>;
  phases: { [P in PhaseOf<C>]: PhaseDef<C, S> };
  /** Pure: what this player is allowed to see. Must never leak other players' secrets. */
  view(state: S, viewer: string, ctx: ViewContext<C>): V;
  /** Host's "Passer à la suite": stop waiting for the players who are late. */
  onSkip?(state: S, ctx: GameContext<C>): void;
  onPlayerChange?(state: S, ctx: GameContext<C>, change: PlayerChange): void;
}

// Registries hold games of different types: their precise types are only needed inside each game.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGameDefinition = GameDefinition<any, any, any>;

export function defineGame<C extends GameContract, S, V extends { phase: PhaseOf<C> }>(
  definition: GameDefinition<C, S, V>,
): GameDefinition<C, S, V> {
  return definition;
}

/** A rule of the game refused an action (code declared in the contract). */
export class GameRuleError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'GameRuleError';
    this.code = code;
  }
}
