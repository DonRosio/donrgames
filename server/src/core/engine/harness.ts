import type {
  GameContract,
  PhaseOf,
  RankingEntry,
  SettingValue,
  SettingsOf,
} from '@mini-jeux/shared';
import { DomainError } from '../lib/errors.ts';
import { rank } from './helpers.ts';
import { seededRandom } from './random.ts';
import { GameRunner } from './runner.ts';
import { ManualScheduler } from './scheduler.ts';
import { defaultSettings } from './settings.ts';
import { GameRuleError } from './types.ts';
import type {
  ContentAccess,
  ContentRef,
  GameDefinition,
  ReadRef,
  Roster,
  RosterEntry,
} from './types.ts';

export type HarnessResult = { ok: true } | { ok: false; error: string };

interface HarnessOptions<C extends GameContract> {
  /** Participant ids; the first one is the host unless `host` is given. */
  players: readonly string[];
  host?: string;
  settings?: Partial<SettingsOf<C>>;
  seed?: number;
  /** Delay after which a disconnected player is no longer awaited (60 s like the core). */
  graceMs?: number;
  /** Content items of the game (games declaring `content: true`). */
  content?: readonly ContentRef[];
}

/**
 * Runs a game without network nor server: act as players, move time forward, disconnect people,
 * and inspect views. The recommended way to test game logic.
 */
export function createHarness<C extends GameContract, S, V extends { phase: PhaseOf<C> }>(
  definition: GameDefinition<C, S, V>,
  options: HarnessOptions<C>,
) {
  const scheduler = new ManualScheduler(1_000_000);
  const clock = scheduler.clock;
  const graceMs = options.graceMs ?? 60_000;
  const host = options.host ?? options.players[0]!;

  const status = new Map(
    options.players.map((id) => [
      id,
      { present: true, connected: true, disconnectedAt: null as number | null, unawaited: false },
    ]),
  );
  const entry = (id: string): RosterEntry | undefined => {
    const s = status.get(id);
    if (!s) return undefined;
    const withinGrace = s.disconnectedAt !== null && clock.now() - s.disconnectedAt < graceMs;
    return {
      id,
      nickname: id,
      present: s.present,
      connected: s.present && s.connected,
      awaited: s.present && (s.connected || withinGrace),
    };
  };
  const roster: Roster = {
    all: () => options.players.map((id) => entry(id)!),
    get: entry,
    awaited: () => options.players.filter((id) => entry(id)!.awaited),
    connected: () => options.players.filter((id) => entry(id)!.connected),
  };

  let ranking: Omit<RankingEntry, 'nickname'>[] | null = null;
  const played = new Set<string>();
  const discarded: string[] = [];
  const random = seededRandom(options.seed ?? 1);
  const contentAccess: ContentAccess = {
    remaining: () => (options.content ?? []).filter((item) => !played.has(item.id)).length,
    pick: () => {
      const left = (options.content ?? []).filter((item) => !played.has(item.id));
      return left.length > 0 ? random.pick(left) : null;
    },
    markPlayed: (id) => void played.add(id),
  };
  let nextFile = 0;
  const runner = new GameRunner({
    definition,
    runId: 'test-run',
    participants: options.players,
    settings: {
      ...defaultSettings(definition.contract.settings),
      ...(options.settings as Record<string, SettingValue>),
    },
    roster,
    clock,
    random,
    content: contentAccess,
    media: { discard: (id) => void discarded.push(id) },
    scheduler,
    hooks: {
      onUpdate: () => {},
      onEnd: (scores) => {
        ranking = rank(scores);
      },
      onError: (error) => {
        throw error;
      },
    },
  });
  runner.start();

  const attempt = (fn: () => void): HarnessResult => {
    try {
      fn();
      return { ok: true };
    } catch (error) {
      if (error instanceof DomainError || error instanceof GameRuleError) {
        return { ok: false, error: error.code };
      }
      throw error;
    }
  };

  return {
    runner,
    clock,
    get phase(): PhaseOf<C> {
      return runner.phase as PhaseOf<C>;
    },
    get state(): S {
      return runner.state as S;
    },
    get ended(): boolean {
      return runner.ended;
    },
    /** Final ranking once the game called ctx.end(). */
    get ranking() {
      return ranking;
    },
    act(player: string, type: string, payload: unknown = {}): HarnessResult {
      return attempt(() => runner.dispatch(player, type, payload, player === host));
    },
    /** Sends a file (fake content: only its size and type matter to the game). */
    upload(player: string, kind: string, meta: unknown, size = 1000): HarnessResult {
      return attempt(() => {
        const permit = runner.acceptUpload(player, kind, meta);
        if (size > permit.maxBytes) throw new DomainError('PAYLOAD_TOO_LARGE');
        const file = { id: `file-${++nextFile}`, mime: 'audio/webm', size };
        runner.completeUpload(player, kind, file, permit.meta);
      });
    },
    /** Content ids marked as played, and files discarded by the game. */
    get played(): string[] {
      return [...played];
    },
    get discarded(): string[] {
      return [...discarded];
    },
    canRead(player: string, ref: ReadRef): boolean {
      return runner.canRead(player, ref);
    },
    skip(): HarnessResult {
      return attempt(() => runner.skip());
    },
    view(player: string): V {
      return runner.view(player) as V;
    },
    /** Moves time forward: fires timers, and ends the grace delay of disconnected players. */
    advance(ms: number): void {
      scheduler.advance(ms);
      for (const [id, s] of status) {
        if (s.present && !s.connected && !s.unawaited && s.disconnectedAt !== null) {
          if (clock.now() - s.disconnectedAt >= graceMs) {
            s.unawaited = true;
            runner.playerChanged({ playerId: id, kind: 'unawaited' });
          }
        }
      }
    },
    disconnect(player: string): void {
      const s = status.get(player)!;
      s.connected = false;
      s.disconnectedAt = clock.now();
      runner.playerChanged({ playerId: player, kind: 'disconnected' });
    },
    reconnect(player: string): void {
      const s = status.get(player)!;
      Object.assign(s, { connected: true, disconnectedAt: null, unawaited: false });
      runner.playerChanged({ playerId: player, kind: 'reconnected' });
    },
    leave(player: string): void {
      status.get(player)!.present = false;
      runner.playerChanged({ playerId: player, kind: 'left' });
    },
  };
}
