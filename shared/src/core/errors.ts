export const ERROR_CODES = [
  'INVALID_PAYLOAD',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'FORBIDDEN_ORIGIN',
  'NOT_FOUND',
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'TOO_MANY_ROOMS',
  'NICKNAME_TAKEN',
  'NICKNAME_TOO_SHORT',
  'NICKNAME_TOO_LONG',
  'NICKNAME_INVALID',
  'NOT_HOST',
  'PLAYER_NOT_FOUND',
  'SESSION_INVALID',
  'GAME_NOT_FOUND',
  'GAME_UNAVAILABLE',
  'INVALID_SETTINGS',
  'WRONG_PHASE',
  'NOT_PARTICIPANT',
  'UNSUPPORTED_MEDIA',
  'STORAGE_FULL',
  'INTERNAL',
] as const;

/** The server only ever sends these codes; the client turns them into French messages. */
export type ErrorCode = (typeof ERROR_CODES)[number];

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}
