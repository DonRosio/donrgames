// Server-side validation schemas. Imported through '@mini-jeux/shared/schemas' so that zod
// never ends up in the client bundle.
import { z } from 'zod';
import { NICKNAME_MAX_INPUT_LENGTH } from './limits.ts';

export const gameIdSchema = z.string().regex(/^[a-z0-9-]{1,32}$/);
export const contentIdSchema = z.string().regex(/^[a-z0-9-]{1,64}$/);
export const playerIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16}$/);
export const sessionTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

const nicknameInputSchema = z.string().max(NICKNAME_MAX_INPUT_LENGTH);

export const createRoomBodySchema = z.strictObject({
  nickname: nicknameInputSchema,
});

export const joinRoomBodySchema = z.strictObject({
  code: z.string().max(20),
  nickname: nicknameInputSchema,
});

export const socketAuthSchema = z.strictObject({ token: sessionTokenSchema });

export const emptyPayloadSchema = z.strictObject({});
export const clockPingSchema = z.strictObject({ t0: z.number() });
export const playerTargetSchema = z.strictObject({ playerId: playerIdSchema });

export const selectGameSchema = z.strictObject({ gameId: gameIdSchema });
export const setSettingsSchema = z.strictObject({
  settings: z
    .record(
      z.string().max(32),
      z.union([z.number(), z.string().max(64), z.boolean(), z.array(z.string().max(64)).max(32)]),
    )
    .refine((settings) => Object.keys(settings).length <= 20),
});
/** Envelope only: the payload is validated against the action schema of the running game. */
export const gameActionSchema = z.strictObject({
  type: z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,31}$/),
  payload: z.unknown(),
});
