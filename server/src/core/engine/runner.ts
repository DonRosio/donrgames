import type { GameContract, ScoreEntry, SettingValue } from '@mini-jeux/shared';
import { DomainError } from '../lib/errors.ts';
import type { Clock } from '../lib/time.ts';
import type { GameRandom } from './random.ts';
import type { Scheduler } from './scheduler.ts';
import { GameRuleError } from './types.ts';
import type {
  AnyGameDefinition,
  GameContext,
  PhaseDef,
  PlayerChange,
  Roster,
  ViewContext,
} from './types.ts';

export interface RunnerHooks {
  /** State changed outside of an action (timer, skip, player change): views must be pushed. */
  onUpdate(): void;
  /** The game called ctx.end(). */
  onEnd(scores: readonly ScoreEntry[]): void;
  /** A game handler threw unexpectedly outside of an action (timer…). */
  onError(error: unknown): void;
}

export interface RunnerOptions {
  definition: AnyGameDefinition;
  runId: string;
  participants: readonly string[];
  settings: Record<string, SettingValue>;
  roster: Roster;
  clock: Clock;
  random: GameRandom;
  scheduler: Scheduler;
  hooks: RunnerHooks;
}

type AnyPhase = PhaseDef<GameContract, unknown>;

/**
 * Runs one game: owns its state, enforces the generic rules (phase, host-only actions,
 * participants, payload schema) and calls the game's handlers.
 */
export class GameRunner {
  readonly runId: string;
  readonly definition: AnyGameDefinition;
  readonly #options: RunnerOptions;
  readonly #timers = new Map<string, unknown>();
  #state: unknown;
  #phase: string;
  #seq = 0;
  #ended = false;
  #endScores: readonly ScoreEntry[] | null = null;
  #disposed = false;

  constructor(options: RunnerOptions) {
    this.#options = options;
    this.runId = options.runId;
    this.definition = options.definition;
    this.#phase = options.definition.initialPhase;
  }

  get phase(): string {
    return this.#phase;
  }

  get seq(): number {
    return this.#seq;
  }

  get ended(): boolean {
    return this.#ended;
  }

  /** For tests and debugging only. */
  get state(): unknown {
    return this.#state;
  }

  start(): void {
    const ctx = this.#context();
    this.#state = this.definition.setup(ctx, {
      players: this.#options.participants,
      settings: this.#options.settings,
    });
    this.#currentPhase().enter?.(this.#state, ctx);
    this.#afterChange();
  }

  /** Handles an action sent by a player. Throws DomainError / GameRuleError when refused. */
  dispatch(playerId: string, type: string, payload: unknown, isHost: boolean): void {
    if (this.#ended || this.#disposed) throw new DomainError('WRONG_PHASE');
    const contract = this.definition.contract as GameContract;
    const action = Object.hasOwn(contract.actions, type) ? contract.actions[type] : undefined;
    if (!action) throw new DomainError('INVALID_PAYLOAD');
    if (action.hostOnly && !isHost) throw new DomainError('NOT_HOST');
    const phase = this.#currentPhase();
    if (!phase.actions.includes(type)) throw new DomainError('WRONG_PHASE');
    if (!this.#options.roster.get(playerId)?.present) throw new DomainError('NOT_PARTICIPANT');
    const parsed = action.payload.safeParse(payload);
    if (!parsed.success) throw new DomainError('INVALID_PAYLOAD');

    const handler = (phase.on as Record<string, AnyHandler> | undefined)?.[type];
    handler!(this.#state, this.#context(), playerId, parsed.data);
    this.#afterChange();
  }

  /** Host's "Passer à la suite". */
  skip(): void {
    if (this.#ended || this.#disposed) throw new DomainError('WRONG_PHASE');
    if (!this.definition.onSkip) throw new DomainError('WRONG_PHASE');
    this.definition.onSkip(this.#state, this.#context());
    this.#afterChange();
  }

  playerChanged(change: PlayerChange): void {
    if (this.#ended || this.#disposed) return;
    this.#guarded(() => this.definition.onPlayerChange?.(this.#state, this.#context(), change));
  }

  isParticipant(playerId: string): boolean {
    return this.#options.participants.includes(playerId);
  }

  view(playerId: string): unknown {
    const ctx: ViewContext<GameContract> = {
      phase: this.#phase,
      now: () => this.#options.clock.now(),
      players: this.#options.roster,
    };
    return this.definition.view(this.#state, playerId, ctx);
  }

  dispose(): void {
    this.#disposed = true;
    for (const handle of this.#timers.values()) this.#options.scheduler.clear(handle);
    this.#timers.clear();
  }

  #currentPhase(): AnyPhase {
    return (this.definition.phases as Record<string, AnyPhase>)[this.#phase]!;
  }

  /** Called after every change: bumps the view sequence, then reports the end of the game if any. */
  #afterChange(): void {
    this.#seq++;
    if (this.#ended && this.#endScores) {
      const scores = this.#endScores;
      this.#endScores = null;
      this.dispose();
      this.#options.hooks.onEnd(scores);
    }
  }

  /** Runs a change triggered outside of an action, then notifies (or reports a failure). */
  #guarded(change: () => void): void {
    try {
      change();
      this.#afterChange();
      if (!this.#ended) this.#options.hooks.onUpdate();
    } catch (error) {
      this.#options.hooks.onError(error);
    }
  }

  #context(): GameContext<GameContract> {
    const options = this.#options;
    const ctx: Omit<GameContext<GameContract>, 'phase'> = {
      now: () => options.clock.now(),
      random: options.random,
      players: options.roster,
      goto: (phase) => {
        if (!this.#currentPhase().next.includes(phase)) {
          throw new Error(`Undeclared transition ${this.#phase} -> ${phase}`);
        }
        for (const handle of this.#timers.values()) options.scheduler.clear(handle);
        this.#timers.clear();
        this.#phase = phase;
        this.#currentPhase().enter?.(this.#state, this.#context());
      },
      schedule: (id, delayMs) => {
        const existing = this.#timers.get(id);
        if (existing !== undefined) options.scheduler.clear(existing);
        const handle = options.scheduler.set(() => {
          this.#timers.delete(id);
          if (this.#ended || this.#disposed) return;
          this.#guarded(() => this.#currentPhase().timer?.(this.#state, this.#context(), id));
        }, delayMs);
        this.#timers.set(id, handle);
      },
      cancel: (id) => {
        const handle = this.#timers.get(id);
        if (handle !== undefined) options.scheduler.clear(handle);
        this.#timers.delete(id);
      },
      reject: (code) => {
        throw new GameRuleError(code);
      },
      end: (scores) => {
        this.#ended = true;
        this.#endScores = [...scores];
      },
    };
    // `phase` stays live: it follows the transitions made through this same context.
    return Object.defineProperty(ctx, 'phase', {
      get: () => this.#phase,
      enumerable: true,
    }) as GameContext<GameContract>;
  }
}

type AnyHandler = (
  state: unknown,
  ctx: GameContext<GameContract>,
  from: string,
  payload: unknown,
) => void;
