import { HEAD_MAX_BYTES, whosMostContract } from '@mini-jeux/shared/games/whos-most';
import type { Head, WhosMostContract, WhosMostView } from '@mini-jeux/shared/games/whos-most';
import { WHOS_MOST_QUESTIONS } from '@mini-jeux/shared/games/whos-most-questions';
import { defineGame } from '../../core/engine/types.ts';
import type { GameContext, Roster } from '../../core/engine/types.ts';

export interface WhosMostState {
  /** Questions of the game, already drawn (random, no repeat). */
  questions: string[];
  /** 0-based index of the current question. */
  index: number;
  /** Picture of each player (media id), kept until the end of the game. */
  photos: Map<string, string>;
  /** Votes of the current question: voter → head voted for. */
  votes: Map<string, string>;
  /** Votes received by each head for the question just revealed. */
  counts: Map<string, number>;
  scores: Map<string, number>;
}

type Ctx = GameContext<WhosMostContract>;

function presentIds(players: Roster): string[] {
  return players
    .all()
    .filter((player) => player.present)
    .map((player) => player.id);
}

function heads(state: WhosMostState, players: Roster): Head[] {
  return presentIds(players).map((playerId) => ({
    playerId,
    mediaId: state.photos.get(playerId) ?? null,
  }));
}

function everyoneHasPhoto(state: WhosMostState, players: Roster): boolean {
  return presentIds(players).every((id) => state.photos.has(id));
}

function allVoted(state: WhosMostState, players: Roster): boolean {
  return players.awaited().every((id) => state.votes.has(id));
}

/** Pictures are personal data: deleted before the game ends (the core also deletes the room's). */
function endGame(state: WhosMostState, ctx: Ctx): void {
  for (const mediaId of state.photos.values()) ctx.media.discard(mediaId);
  state.photos.clear();
  ctx.end([...state.scores].map(([playerId, score]) => ({ playerId, score })));
}

function question(state: WhosMostState) {
  return {
    question: state.questions[state.index]!,
    index: state.index + 1,
    total: state.questions.length,
  };
}

export const whosMostGame = defineGame({
  contract: whosMostContract,
  setup: (ctx, { players, settings }): WhosMostState => ({
    questions: ctx.random.shuffle([...WHOS_MOST_QUESTIONS]).slice(0, settings.questions),
    index: 0,
    photos: new Map(),
    votes: new Map(),
    counts: new Map(),
    scores: new Map(players.map((id) => [id, 0])),
  }),
  initialPhase: 'photos',
  phases: {
    photos: {
      actions: ['start'],
      uploads: ['head'],
      next: ['voting'],
      onUpload: {
        head(state, ctx, from, file) {
          const previous = state.photos.get(from);
          if (previous) ctx.media.discard(previous);
          state.photos.set(from, file.id);
        },
      },
      on: {
        start(state, ctx) {
          if (!everyoneHasPhoto(state, ctx.players)) ctx.reject('PHOTOS_MISSING');
          ctx.goto('voting');
        },
      },
    },
    voting: {
      actions: ['vote', 'reveal'],
      next: ['reveal'],
      enter(state) {
        state.votes.clear();
      },
      on: {
        vote(state, ctx, from, { target }) {
          if (!ctx.players.get(target)?.present) ctx.reject('UNKNOWN_TARGET');
          if (state.votes.has(from)) ctx.reject('ALREADY_VOTED');
          state.votes.set(from, target);
        },
        reveal(state, ctx) {
          if (!allVoted(state, ctx.players)) ctx.reject('VOTES_MISSING');
          ctx.goto('reveal');
        },
      },
    },
    reveal: {
      actions: ['next', 'finish'],
      next: ['voting'],
      enter(state) {
        state.counts.clear();
        for (const target of state.votes.values()) {
          state.counts.set(target, (state.counts.get(target) ?? 0) + 1);
          state.scores.set(target, (state.scores.get(target) ?? 0) + 1);
        }
      },
      on: {
        next(state, ctx) {
          state.index++;
          if (state.index >= state.questions.length) {
            endGame(state, ctx);
            return;
          }
          ctx.goto('voting');
        },
        finish(state, ctx) {
          endGame(state, ctx);
        },
      },
    },
  },
  view(state, viewer, ctx): WhosMostView {
    switch (ctx.phase) {
      case 'photos':
        return {
          phase: 'photos',
          heads: heads(state, ctx.players),
          canStart: everyoneHasPhoto(state, ctx.players),
        };
      case 'voting':
        return {
          phase: 'voting',
          ...question(state),
          heads: heads(state, ctx.players),
          voted: [...state.votes.keys()],
          myVote: state.votes.get(viewer) ?? null,
          allVoted: allVoted(state, ctx.players),
        };
      default: {
        const shown = heads(state, ctx.players);
        // A head that left after receiving votes still shows its result.
        const ids = new Set([...shown.map((head) => head.playerId), ...state.counts.keys()]);
        for (const id of state.counts.keys()) {
          if (!shown.some((head) => head.playerId === id)) {
            shown.push({ playerId: id, mediaId: state.photos.get(id) ?? null });
          }
        }
        return {
          phase: 'reveal',
          ...question(state),
          heads: shown,
          results: [...ids]
            .map((playerId) => ({ playerId, votes: state.counts.get(playerId) ?? 0 }))
            .sort((a, b) => b.votes - a.votes),
          totals: [...state.scores]
            .map(([playerId, total]) => ({ playerId, total }))
            .sort((a, b) => b.total - a.total),
          last: state.index + 1 >= state.questions.length,
        };
      }
    }
  },
  onSkip(state, ctx) {
    if (ctx.phase === 'photos') ctx.goto('voting');
    else if (ctx.phase === 'voting') ctx.goto('reveal');
  },
  uploadLimit: () => HEAD_MAX_BYTES,
  canRead(state, _viewer, ref) {
    // Heads are shown to everyone during the whole game.
    return ref.kind === 'media' && [...state.photos.values()].includes(ref.id);
  },
});
