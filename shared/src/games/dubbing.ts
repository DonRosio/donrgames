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
  phases: ['loading', 'broadcast', 'recording', 'roundResults'],
  settings: {
    rounds: {
      kind: 'int',
      label: 'Nombre de manches (vidéos)',
      min: 1,
      max: 'contentLeft',
      default: 'contentNew',
    },
  },
  actions: {
    /** The video (or take) of this synchronization step is loaded on this device. */
    ready: { payload: z.strictObject({ syncId: z.string().min(1).max(32) }) },
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
  errors: ['STALE_SYNC', 'TAKE_LOCKED'],
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
  | (Base & { phase: 'roundResults'; videoTitle: string; validated: string[]; last: boolean });
