// Server-side validation schemas. Imported through '@mini-jeux/shared/schemas' so that zod
// never ends up in the client bundle.
import { z } from 'zod';
import {
  HISTORY_MAX_GAMES,
  HISTORY_MAX_ITEMS_PER_GAME,
  NICKNAME_MAX_INPUT_LENGTH,
} from './limits.ts';

export const gameIdSchema = z.string().regex(/^[a-z0-9-]{1,32}$/);
export const contentIdSchema = z.string().regex(/^[a-z0-9-]{1,64}$/);
export const playerIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16}$/);
export const sessionTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const historySchema = z
  .record(gameIdSchema, z.array(contentIdSchema).max(HISTORY_MAX_ITEMS_PER_GAME))
  .refine((history) => Object.keys(history).length <= HISTORY_MAX_GAMES);

const nicknameInputSchema = z.string().max(NICKNAME_MAX_INPUT_LENGTH);

export const createRoomBodySchema = z.strictObject({
  nickname: nicknameInputSchema,
  history: historySchema.default({}),
});

export const joinRoomBodySchema = z.strictObject({
  code: z.string().max(20),
  nickname: nicknameInputSchema,
  history: historySchema.default({}),
});

export const socketAuthSchema = z.strictObject({ token: sessionTokenSchema });

export const emptyPayloadSchema = z.strictObject({});
export const clockPingSchema = z.strictObject({ t0: z.number() });
export const playerTargetSchema = z.strictObject({ playerId: playerIdSchema });
