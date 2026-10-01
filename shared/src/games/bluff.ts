import { z } from 'zod';
import { defineContract } from '../core/game.ts';
import { THEME_IDS, THEME_NAMES } from './bluff-themes.ts';
import type { ThemeId } from './bluff-themes.ts';

const themeOptions = THEME_IDS.map((id) => ({ value: id, label: THEME_NAMES[id] }));

export const bluffContract = defineContract({
  meta: {
    id: 'bluff',
    name: 'Le Bluff',
    description:
      'Une question dont personne ne connaît la réponse : chacun invente la fausse réponse la plus crédible, puis on devine laquelle est la vraie.',
    minPlayers: 3,
    maxPlayers: 10,
    replayable: true,
  },
  phases: ['writing', 'voting', 'reveal'],
  settings: {
    rounds: { kind: 'int', label: 'Nombre de questions', min: 3, max: 15, default: 8 },
    themes: { kind: 'multi', label: 'Thèmes', min: 1, options: themeOptions },
  },
  actions: {
    /** My false answer (final). The server checks it, so the limit here is only a safety net. */
    answer: { payload: z.strictObject({ text: z.string().max(400) }) },
    /** My vote: the option I believe is the real answer (final). */
    vote: { payload: z.strictObject({ option: z.string().max(16) }) },
    /** Reveal → next question, or the final ranking after the last one. */
    next: { payload: z.strictObject({}), hostOnly: true },
  },
  errors: ['ANSWER_INVALID', 'ANSWER_IS_REAL', 'ALREADY_ANSWERED', 'ALREADY_VOTED', 'BAD_OPTION'],
});

export type BluffContract = typeof bluffContract;

interface Base {
  /** Participants of the game, in the order of the room. */
  players: string[];
  /** 1-based number of the question, and how many there are. */
  index: number;
  count: number;
  theme: ThemeId;
  /** The question, with the blank to fill. */
  question: string;
}

/** One answer to choose from while voting. The real one is mixed in, nothing tells it apart. */
export interface VoteOption {
  id: string;
  text: string;
  /** The viewer wrote this answer: it cannot be voted for. */
  mine: boolean;
}

/** One answer once the votes are known. */
export interface RevealOption {
  id: string;
  text: string;
  real: boolean;
  /** Who wrote it (several when identical answers were merged); nobody for the real one. */
  authors: string[];
  voters: string[];
}

export type BluffView =
  | (Base & {
      phase: 'writing';
      /** Who has sent their answer. */
      answered: string[];
      /** The viewer's own answer, once sent. */
      mine: string | null;
    })
  | (Base & {
      phase: 'voting';
      options: VoteOption[];
      /** Who has voted. */
      voted: string[];
      myVote: string | null;
    })
  | (Base & {
      phase: 'reveal';
      /** The real answer. */
      answer: string;
      options: RevealOption[];
      /** Points won on this question, and the totals so far. */
      gains: Record<string, number>;
      scores: Record<string, number>;
      /** Last question: the host goes on to the final ranking. */
      last: boolean;
    });
