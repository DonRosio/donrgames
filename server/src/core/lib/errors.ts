import type { ErrorCode } from '@mini-jeux/shared';

/** Expected refusal (bad input, missing rights...). Its code is sent as is to the client. */
export class DomainError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode) {
    super(code);
    this.name = 'DomainError';
    this.code = code;
  }
}

const HTTP_STATUS: Record<ErrorCode, number> = {
  INVALID_PAYLOAD: 400,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  FORBIDDEN_ORIGIN: 403,
  NOT_FOUND: 404,
  ROOM_NOT_FOUND: 404,
  ROOM_FULL: 409,
  TOO_MANY_ROOMS: 503,
  NICKNAME_TAKEN: 409,
  NICKNAME_TOO_SHORT: 400,
  NICKNAME_TOO_LONG: 400,
  NICKNAME_INVALID: 400,
  NOT_HOST: 403,
  PLAYER_NOT_FOUND: 404,
  SESSION_INVALID: 401,
  GAME_NOT_FOUND: 404,
  GAME_UNAVAILABLE: 409,
  INVALID_SETTINGS: 400,
  WRONG_PHASE: 409,
  NOT_PARTICIPANT: 403,
  UNSUPPORTED_MEDIA: 415,
  STORAGE_FULL: 507,
  INTERNAL: 500,
};

export function httpStatusOf(code: ErrorCode): number {
  return HTTP_STATUS[code];
}
