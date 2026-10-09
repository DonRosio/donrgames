import { z } from 'zod';
import { defineContract } from '../core/game.ts';

export const whosMostContract = defineContract({
  meta: {
    id: 'whos-most',
    name: 'Qui est le + ?',
    description:
      'Une question du genre « Qui est le + sale ? », tout le monde vote pour une tête, puis on découvre qui a été le plus désigné. Pour rire : pas de classement.',
    minPlayers: 3,
    maxPlayers: 10,
    contentUnit: 'question',
    // The questions are the content of the game: never twice the same in a room.
    replayable: false,
    // Played for fun: the votes of each question are shown, no points, no final ranking.
    ranked: false,
  },
  phases: ['photos', 'voting', 'reveal'],
  settings: {
    questions: {
      kind: 'int',
      label: 'Nombre de questions',
      min: 1,
      max: 'contentLeft',
      default: 10,
    },
  },
  actions: {
    /** Host: the questions start (everyone present must have a picture). */
    start: { payload: z.strictObject({}), hostOnly: true },
    /** The head this player votes for (themself allowed). Final. */
    vote: { payload: z.strictObject({ target: z.string().min(1).max(64) }) },
    /** Host: show the result of the question. */
    reveal: { payload: z.strictObject({}), hostOnly: true },
    next: { payload: z.strictObject({}), hostOnly: true },
    /** End the game after the current question. */
    finish: { payload: z.strictObject({}), hostOnly: true },
  },
  uploads: {
    head: { meta: z.strictObject({}), mimeTypes: ['image/png'] },
  },
  errors: ['PHOTOS_MISSING', 'UNKNOWN_TARGET', 'ALREADY_VOTED', 'VOTES_MISSING'],
});

export type WhosMostContract = typeof whosMostContract;

/** One head of the game; `mediaId` is null for a player who never sent a picture. */
export interface Head {
  playerId: string;
  mediaId: string | null;
}

interface Question {
  /** What follows "Qui est le + ". */
  question: string;
  /** 1-based index and number of questions. */
  index: number;
  total: number;
}

export type WhosMostView =
  | {
      phase: 'photos';
      heads: Head[];
      /** Whether every present player has a picture: the host can start. */
      canStart: boolean;
    }
  | (Question & {
      phase: 'voting';
      heads: Head[];
      /** Who voted, never for whom before the reveal. */
      voted: string[];
      myVote: string | null;
      allVoted: boolean;
    })
  | (Question & {
      phase: 'reveal';
      heads: Head[];
      /** Votes received by each head for this question, most voted first. */
      results: { playerId: string; votes: number }[];
      last: boolean;
    });
