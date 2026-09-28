import { SYNC_LEAD_MS, dubbingContract } from '@mini-jeux/shared/games/dubbing';
import type {
  DubbingContract,
  DubbingView,
  Points,
  Presentation,
  VideoRef,
} from '@mini-jeux/shared/games/dubbing';
import { Barrier } from '../../core/engine/helpers.ts';
import { defineGame } from '../../core/engine/types.ts';
import type { ContentRef, GameContext, Roster } from '../../core/engine/types.ts';

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
  /** Identifies the current synchronization step: stale "ready" messages are refused. */
  syncId: string;
  ready: Barrier;
  startAt: number | null;
  takes: Map<string, Take>;
  /** Presentation order of the takes (random), and index of the one being presented. */
  order: string[];
  current: number;
  /** Votes for the take being presented. */
  votes: Map<string, Points>;
  /** Voters who already used their +2 this round. */
  plusTwoUsed: Set<string>;
  roundPoints: Map<string, number>;
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

function presenter(state: DubbingState): string {
  return state.order[state.current]!;
}

function presentation(state: DubbingState): Presentation {
  return { presenter: presenter(state), index: state.current + 1, count: state.order.length };
}

/** Synchronized steps only wait for connected players: a latecomer catches up while it plays. */
function readyToPlay(state: DubbingState, ctx: Ctx): boolean {
  return state.ready.isComplete(ctx.players.connected());
}

/** Everyone who takes part may vote, except the author of the take. */
function expectedVoters(state: DubbingState, ctx: { players: Roster }): string[] {
  return ctx.players
    .all()
    .filter((player) => player.present && player.id !== presenter(state))
    .map((player) => player.id);
}

function revealIfAllVoted(state: DubbingState, ctx: Ctx): void {
  const awaited = ctx.players.awaited().filter((id) => id !== presenter(state));
  if (awaited.every((id) => state.votes.has(id))) ctx.goto('reveal');
}

function closeIfAllRecorded(state: DubbingState, ctx: Ctx): void {
  const awaited = ctx.players.awaited();
  if (awaited.length > 0 && awaited.every((id) => state.takes.has(id))) endRecording(state, ctx);
}

function endRecording(state: DubbingState, ctx: Ctx): void {
  state.order = ctx.random.shuffle([...state.takes.keys()]);
  state.current = 0;
  ctx.goto(state.order.length > 0 ? 'takeLoading' : 'roundResults');
}

function newSync(state: DubbingState, ctx: Ctx, prefix: string): void {
  state.syncId = `${prefix}${state.round}-${ctx.random.int(1_000_000_000)}`;
  state.ready.reset();
  state.startAt = null;
}

/** Starts a synchronized playback and moves to `next` once it is over. */
function startPlayback(state: DubbingState, ctx: Ctx): void {
  state.startAt = ctx.now() + SYNC_LEAD_MS;
  ctx.schedule('ended', SYNC_LEAD_MS + state.video!.durationMs + END_MARGIN_MS);
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
    order: [],
    current: 0,
    votes: new Map(),
    plusTwoUsed: new Set(),
    roundPoints: new Map(),
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
        state.plusTwoUsed.clear();
        state.roundPoints.clear();
        newSync(state, ctx, 'v');
      },
      on: {
        ready(state, ctx, from, { syncId }) {
          if (syncId !== state.syncId) ctx.reject('STALE_SYNC');
          state.ready.mark(from);
          if (readyToPlay(state, ctx)) ctx.goto('broadcast');
        },
      },
    },
    broadcast: {
      actions: [],
      next: ['recording'],
      enter(state, ctx) {
        ctx.content.markPlayed(state.video!.id);
        startPlayback(state, ctx);
      },
      timer(_state, ctx) {
        ctx.goto('recording');
      },
    },
    recording: {
      actions: [],
      uploads: ['take'],
      next: ['takeLoading', 'roundResults'],
      enter(state) {
        state.takes.clear();
        state.order = [];
        state.current = 0;
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
    takeLoading: {
      actions: ['ready'],
      next: ['takePlaying'],
      enter(state, ctx) {
        newSync(state, ctx, 't');
        state.votes.clear();
      },
      on: {
        ready(state, ctx, from, { syncId }) {
          if (syncId !== state.syncId) ctx.reject('STALE_SYNC');
          state.ready.mark(from);
          if (readyToPlay(state, ctx)) ctx.goto('takePlaying');
        },
      },
    },
    takePlaying: {
      actions: [],
      next: ['voting'],
      enter(state, ctx) {
        startPlayback(state, ctx);
      },
      timer(_state, ctx) {
        ctx.goto('voting');
      },
    },
    voting: {
      actions: ['vote'],
      next: ['reveal'],
      enter(state, ctx) {
        // Nobody left to vote (e.g. the only other player left): straight to the reveal.
        revealIfAllVoted(state, ctx);
      },
      on: {
        vote(state, ctx, from, { points }) {
          if (from === presenter(state)) ctx.reject('SELF_VOTE');
          if (state.votes.has(from)) ctx.reject('ALREADY_VOTED');
          if (points === 2 && state.plusTwoUsed.has(from)) ctx.reject('PLUS_TWO_USED');
          state.votes.set(from, points);
          if (points === 2) state.plusTwoUsed.add(from);
          revealIfAllVoted(state, ctx);
        },
      },
    },
    reveal: {
      actions: ['next'],
      next: ['takeLoading', 'roundResults'],
      enter(state) {
        const total = [...state.votes.values()].reduce<number>((sum, points) => sum + points, 0);
        const author = presenter(state);
        state.roundPoints.set(author, (state.roundPoints.get(author) ?? 0) + total);
        state.scores.set(author, (state.scores.get(author) ?? 0) + total);
      },
      on: {
        next(state, ctx) {
          state.current++;
          ctx.goto(state.current < state.order.length ? 'takeLoading' : 'roundResults');
        },
      },
    },
    roundResults: {
      actions: ['next', 'finish'],
      next: ['loading'],
      enter(state, ctx) {
        // Recordings are personal data: deleted as soon as the presentation is over.
        for (const take of state.takes.values()) ctx.media.discard(take.mediaId);
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
      case 'takeLoading':
      case 'takePlaying': {
        const take = state.takes.get(presenter(state))!;
        return {
          ...base,
          ...presentation(state),
          phase: ctx.phase,
          video: videoRef(state),
          take: { mediaId: take.mediaId, offsetMs: take.offsetMs },
          syncId: state.syncId,
          ready: state.ready.ids,
          startAt: state.startAt,
        };
      }
      case 'voting':
        return {
          ...base,
          ...presentation(state),
          phase: 'voting',
          voted: [...state.votes.keys()],
          voters: expectedVoters(state, ctx),
          myVote: state.votes.get(viewer) ?? null,
          canUsePlusTwo: !state.plusTwoUsed.has(viewer),
        };
      case 'reveal': {
        const votes = expectedVoters(state, ctx).map((voter) => ({
          voter,
          points: state.votes.get(voter) ?? null,
        }));
        // Voters who left meanwhile still count.
        for (const [voter, points] of state.votes) {
          if (!votes.some((vote) => vote.voter === voter)) votes.push({ voter, points });
        }
        return {
          ...base,
          ...presentation(state),
          phase: 'reveal',
          votes,
          total: votes.reduce((sum, vote) => sum + (vote.points ?? 0), 0),
        };
      }
      default:
        return {
          ...base,
          phase: 'roundResults',
          videoTitle: state.video?.title ?? '',
          scores: [...state.scores]
            .map(([playerId, total]) => ({
              playerId,
              total,
              roundPoints: state.roundPoints.get(playerId) ?? 0,
            }))
            .sort((a, b) => b.total - a.total),
          last: state.last,
        };
    }
  },
  onSkip(state, ctx) {
    switch (ctx.phase) {
      case 'loading':
        return ctx.goto('broadcast');
      case 'broadcast':
        return ctx.goto('recording');
      case 'recording':
        return endRecording(state, ctx);
      case 'takeLoading':
        return ctx.goto('takePlaying');
      case 'takePlaying':
        return ctx.goto('voting');
      case 'voting':
        return ctx.goto('reveal');
    }
  },
  onPlayerChange(state, ctx, change) {
    const gone = change.kind === 'left' || change.kind === 'disconnected';
    if (
      (ctx.phase === 'loading' || ctx.phase === 'takeLoading') &&
      gone &&
      readyToPlay(state, ctx)
    ) {
      ctx.goto(ctx.phase === 'loading' ? 'broadcast' : 'takePlaying');
    }
    const unawaited = change.kind === 'unawaited' || change.kind === 'left';
    if (ctx.phase === 'recording' && unawaited) closeIfAllRecorded(state, ctx);
    if (ctx.phase === 'voting' && unawaited) revealIfAllVoted(state, ctx);
  },
  uploadLimit(state, from) {
    if (!state.video || state.takes.has(from)) return null;
    return Math.ceil((state.video.durationMs / 1000 + TAKE_EXTRA_SECONDS) * TAKE_BYTES_PER_SECOND);
  },
  canRead(state, _viewer, ref) {
    if (ref.kind === 'content') return ref.id === state.video?.id;
    // A take can only be heard during its own presentation, never during the recording.
    const presented = state.order[state.current];
    return presented !== undefined && state.takes.get(presented)?.mediaId === ref.id;
  },
});
