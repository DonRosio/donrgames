import { z } from 'zod';
import { defineContract } from '../core/game.ts';
import { ANSWER_MAX_LENGTH, NOTE_MAX_LENGTH } from './incognito-data.ts';

const aliasId = z.string().min(1).max(8);
const playerId = z.string().min(1).max(64);

export const incognitoContract = defineContract({
  meta: {
    id: 'incognito',
    name: 'Incognito',
    description:
      'Chacun se cache derrière un prénom inventé et répond aux mêmes questions dans un salon de discussion. Après la dernière, il faut retrouver qui était qui.',
    minPlayers: 4,
    maxPlayers: 10,
    contentUnit: 'question',
    // The questions are the content of the game: never twice the same in a room. The list holds
    // three games of 30 questions, hence "3 parties" rather than "à usage unique".
    replayable: false,
    usageLabel: '3 parties par salon',
  },
  phases: ['chat', 'matching', 'reveal'],
  settings: {
    questions: {
      kind: 'int',
      label: 'Nombre de questions',
      min: 1,
      max: 'contentLeft',
      default: 30,
    },
  },
  actions: {
    /** The only answer of this player to a question (`question` is 1-based, to refuse a late one). */
    answer: {
      payload: z.strictObject({
        question: z.number().int().min(1).max(1000),
        text: z.string().trim().min(1).max(ANSWER_MAX_LENGTH),
      }),
    },
    /** Private note: who this player thinks is behind a first name ('' erases it). */
    note: {
      payload: z.strictObject({ alias: aliasId, text: z.string().trim().max(NOTE_MAX_LENGTH) }),
    },
    /** Draft of the matching: the whole current set of links, partial allowed. */
    guess: {
      payload: z.strictObject({
        links: z.array(z.strictObject({ alias: aliasId, player: playerId })).max(10),
      }),
    },
    /** Locks the matching (every first name must be linked). Final. */
    confirm: { payload: z.strictObject({}) },
    /** Host: unmask the next person, then show the final ranking. */
    next: { payload: z.strictObject({}), hostOnly: true },
  },
  errors: [
    'STALE_QUESTION',
    'ALREADY_ANSWERED',
    'UNKNOWN_ALIAS',
    'OWN_ALIAS',
    'UNKNOWN_PLAYER',
    'BAD_GUESS',
    'ALREADY_CONFIRMED',
    'GUESS_INCOMPLETE',
  ],
});

export type IncognitoContract = typeof incognitoContract;

/** A first name a player hides behind. `slot` (0 to players − 1) is unique: it colours the avatar. */
export interface Alias {
  id: string;
  name: string;
  slot: number;
}

/** A real player, to find behind a first name. */
export interface Person {
  id: string;
  nickname: string;
}

/** One question of the chat and the answers received so far, in arrival order. */
export interface ChatRound {
  question: string;
  answers: { alias: string; text: string }[];
}

/** A person unmasked at the reveal, and who found them. */
export interface RevealedPair {
  person: string;
  alias: string;
  foundBy: string[];
}

/** Never contains who is behind which first name, except for the pairs already unmasked. */
export type IncognitoView =
  | {
      phase: 'chat';
      /** The viewer's own first name. */
      me: string;
      aliases: Alias[];
      /** 1-based number of the current question, and number of questions. */
      index: number;
      total: number;
      /** The questions asked so far, the current one last. */
      rounds: ChatRound[];
      /** First names that already answered the current question. */
      answered: string[];
      /** The viewer's private notes, by first name. */
      notes: Record<string, string>;
    }
  | {
      phase: 'matching';
      me: string;
      aliases: Alias[];
      people: Person[];
      rounds: ChatRound[];
      notes: Record<string, string>;
      /** The viewer's links: first name → person (never their own). */
      links: Record<string, string>;
      confirmed: boolean;
      /** Players who locked their matching. */
      confirmedBy: string[];
    }
  | {
      phase: 'reveal';
      me: string;
      aliases: Alias[];
      people: Person[];
      /** Persons unmasked so far, in order. */
      pairs: RevealedPair[];
      /** The viewer's own links, to compare with the truth. */
      myLinks: Record<string, string>;
      /** Points earned on the pairs unmasked so far. */
      scores: { playerId: string; score: number }[];
    };
