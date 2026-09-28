import { z } from 'zod';
import { defineContract } from '../core/game.ts';

/** Delay between the moment everyone is ready and the synchronized start of a video. */
export const SYNC_LEAD_MS = 1500;

export const dubbingContract = defineContract({
  meta: {
    id: 'dubbing',
    name: 'Doublage',
    description:
      'Une courte vidéo passe pour tout le monde. Chacun la double avec sa propre voix, puis on écoute toutes les versions.',
    minPlayers: 2,
    maxPlayers: 10,
    replayable: false,
  },
  phases: [
    'loading',
    'broadcast',
    'recording',
    'takeLoading',
    'takePlaying',
    'voting',
    'reveal',
    'roundResults',
  ],
  settings: {
    rounds: {
      kind: 'int',
      label: 'Nombre de manches (vidéos)',
      min: 1,
      max: 'contentLeft',
      default: 'contentLeft',
    },
  },
  actions: {
    /** The video (or take) of this synchronization step is loaded on this device. */
    ready: { payload: z.strictObject({ syncId: z.string().min(1).max(32) }) },
    /** Points given to the take being presented; +2 once per round and per voter. */
    vote: {
      payload: z.strictObject({ points: z.union([z.literal(0), z.literal(1), z.literal(2)]) }),
    },
    next: { payload: z.strictObject({}), hostOnly: true },
    /** End the game after the current round. */
    finish: { payload: z.strictObject({}), hostOnly: true },
  },
  uploads: {
    take: {
      meta: z.strictObject({
        /** Position in the recording at which the first frame of the video was shown. */
        offsetMs: z.number().int().min(-1000).max(2000),
        durationMs: z.number().int().min(500).max(40_000),
      }),
      mimeTypes: ['audio/webm', 'audio/ogg', 'audio/mp4'],
    },
  },
  errors: ['STALE_SYNC', 'TAKE_LOCKED', 'SELF_VOTE', 'ALREADY_VOTED', 'PLUS_TWO_USED'],
});

export type DubbingContract = typeof dubbingContract;

export interface VideoRef {
  contentId: string;
  durationMs: number;
}

interface Base {
  round: number;
  rounds: number;
}

export type Points = 0 | 1 | 2;

/** Place of the take being presented in the presentation order. */
export interface Presentation {
  presenter: string;
  /** 1-based index and number of takes presented this round. */
  index: number;
  count: number;
}

export interface TakeRef {
  mediaId: string;
  /** Position in the recording at which the first video frame was shown. */
  offsetMs: number;
}

export type DubbingView =
  | (Base & { phase: 'loading'; video: VideoRef; syncId: string; ready: string[] })
  | (Base & { phase: 'broadcast'; video: VideoRef; startAt: number })
  | (Base & {
      phase: 'recording';
      video: VideoRef;
      /** Who validated a take (never the takes themselves). */
      validated: string[];
      mine: 'pending' | 'validated';
    })
  | (Base &
      Presentation & {
        phase: 'takeLoading' | 'takePlaying';
        video: VideoRef;
        take: TakeRef;
        syncId: string;
        ready: string[];
        /** Server time of the synchronized start (takePlaying only). */
        startAt: number | null;
      })
  | (Base &
      Presentation & {
        phase: 'voting';
        /** Who voted, never how much before the reveal. */
        voted: string[];
        voters: string[];
        myVote: Points | null;
        canUsePlusTwo: boolean;
      })
  | (Base &
      Presentation & {
        phase: 'reveal';
        /** Every expected voter; null when they did not vote (counts as 0). */
        votes: { voter: string; points: Points | null }[];
        total: number;
      })
  | (Base & {
      phase: 'roundResults';
      videoTitle: string;
      /** Points won this round and total, best total first. */
      scores: { playerId: string; roundPoints: number; total: number }[];
      last: boolean;
    });
