import { SYNC_LEAD_MS, dubbingContract } from '@mini-jeux/shared/games/dubbing';
import type { DubbingContract, DubbingView, VideoRef } from '@mini-jeux/shared/games/dubbing';
import { Barrier } from '../../core/engine/helpers.ts';
import { defineGame } from '../../core/engine/types.ts';
import type { ContentRef, GameContext } from '../../core/engine/types.ts';

/** Margin after the end of a synchronized video before moving on. */
const END_MARGIN_MS = 500;
/** Upper bound of a take: 320 kbit/s for the video duration plus 3 s. Opus at 96 kbit/s is far below. */
const TAKE_BYTES_PER_SECOND = 40_000;
const TAKE_EXTRA_SECONDS = 3;

interface Take {
  mediaId: string;
  offsetMs: number;
  durationMs: number;
}

export interface DubbingState {
  round: number;
  rounds: number;
  video: ContentRef | null;
  /** Identifies the current synchronization step: stale "ready" messages are ignored. */
  syncId: string;
  ready: Barrier;
  startAt: number | null;
  takes: Map<string, Take>;
  scores: Map<string, number>;
  last: boolean;
}

type Ctx = GameContext<DubbingContract>;

function videoRef(state: DubbingState): VideoRef {
  return { contentId: state.video!.id, durationMs: state.video!.durationMs };
}

function scores(state: DubbingState) {
  return [...state.scores].map(([playerId, score]) => ({ playerId, score }));
}

/** Loading only waits for connected players: a latecomer catches up during the playback. */
function startIfReady(state: DubbingState, ctx: Ctx): void {
  if (state.ready.isComplete(ctx.players.connected())) ctx.goto('broadcast');
}

function closeIfAllRecorded(state: DubbingState, ctx: Ctx): void {
  const awaited = ctx.players.awaited();
  if (awaited.length > 0 && awaited.every((id) => state.takes.has(id))) ctx.goto('roundResults');
}

/** Deletes the recorded files; who validated stays known until the next recording. */
function discardTakes(state: DubbingState, ctx: Ctx): void {
  for (const take of state.takes.values()) ctx.media.discard(take.mediaId);
}

export const dubbingGame = defineGame({
  contract: dubbingContract,
  content: true,
  setup: (_ctx, { players, settings }): DubbingState => ({
    round: 1,
    rounds: settings.rounds,
    video: null,
    syncId: '',
    ready: new Barrier(),
    startAt: null,
    takes: new Map(),
    scores: new Map(players.map((id) => [id, 0])),
    last: false,
  }),
  initialPhase: 'loading',
  phases: {
    loading: {
      actions: ['ready'],
      next: ['broadcast'],
      enter(state, ctx) {
        state.video = ctx.content.pick();
        if (!state.video) {
          ctx.end(scores(state));
          return;
        }
        state.syncId = `v${state.round}-${ctx.random.int(1_000_000_000)}`;
        state.ready.reset();
        state.startAt = null;
      },
      on: {
        ready(state, ctx, from, { syncId }) {
          if (syncId !== state.syncId) ctx.reject('STALE_SYNC');
          state.ready.mark(from);
          startIfReady(state, ctx);
        },
      },
    },
    broadcast: {
      actions: [],
      next: ['recording'],
      enter(state, ctx) {
        state.startAt = ctx.now() + SYNC_LEAD_MS;
        ctx.content.markPlayed(state.video!.id);
        ctx.schedule('ended', SYNC_LEAD_MS + state.video!.durationMs + END_MARGIN_MS);
      },
      timer(_state, ctx) {
        ctx.goto('recording');
      },
    },
    recording: {
      actions: [],
      uploads: ['take'],
      next: ['roundResults'],
      enter(state) {
        state.takes.clear();
      },
      onUpload: {
        take(state, ctx, from, file, meta) {
          // A validated take is locked (also checked before the upload by uploadLimit).
          if (state.takes.has(from)) ctx.reject('TAKE_LOCKED');
          state.takes.set(from, {
            mediaId: file.id,
            offsetMs: meta.offsetMs,
            durationMs: meta.durationMs,
          });
          closeIfAllRecorded(state, ctx);
        },
      },
    },
    roundResults: {
      actions: ['next', 'finish'],
      next: ['loading'],
      enter(state, ctx) {
        // Recordings are personal data: deleted as soon as they are no longer needed.
        discardTakes(state, ctx);
        state.last = state.round >= state.rounds || ctx.content.remaining() === 0;
      },
      on: {
        next(state, ctx) {
          if (state.last) {
            ctx.end(scores(state));
            return;
          }
          state.round++;
          ctx.goto('loading');
        },
        finish(state, ctx) {
          ctx.end(scores(state));
        },
      },
    },
  },
  view(state, viewer, ctx): DubbingView {
    const base = { round: state.round, rounds: state.rounds };
    switch (ctx.phase) {
      case 'loading':
        return {
          ...base,
          phase: 'loading',
          video: videoRef(state),
          syncId: state.syncId,
          ready: state.ready.ids,
        };
      case 'broadcast':
        return { ...base, phase: 'broadcast', video: videoRef(state), startAt: state.startAt! };
      case 'recording':
        return {
          ...base,
          phase: 'recording',
          video: videoRef(state),
          validated: [...state.takes.keys()],
          mine: state.takes.has(viewer) ? 'validated' : 'pending',
        };
      default:
        return {
          ...base,
          phase: 'roundResults',
          videoTitle: state.video?.title ?? '',
          validated: [...state.takes.keys()],
          last: state.last,
        };
    }
  },
  onSkip(state, ctx) {
    if (ctx.phase === 'loading') ctx.goto('broadcast');
    else if (ctx.phase === 'broadcast') ctx.goto('recording');
    else if (ctx.phase === 'recording') ctx.goto('roundResults');
  },
  onPlayerChange(state, ctx, change) {
    if (ctx.phase === 'loading' && (change.kind === 'disconnected' || change.kind === 'left')) {
      startIfReady(state, ctx);
    }
    if (ctx.phase === 'recording' && (change.kind === 'unawaited' || change.kind === 'left')) {
      closeIfAllRecorded(state, ctx);
    }
  },
  uploadLimit(state, from) {
    if (!state.video || state.takes.has(from)) return null;
    return Math.ceil((state.video.durationMs / 1000 + TAKE_EXTRA_SECONDS) * TAKE_BYTES_PER_SECOND);
  },
  canRead(state, _viewer, ref) {
    // The video of the current round only. Takes are not readable yet (presentation comes later).
    return ref.kind === 'content' && ref.id === state.video?.id;
  },
});
