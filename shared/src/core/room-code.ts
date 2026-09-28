import { ROOM_CODE_LENGTH } from './limits.ts';

const ROOM_CODE_PATTERN = new RegExp(`^[A-Z0-9]{${ROOM_CODE_LENGTH}}$`);

/** Codes are typed case-insensitively and may contain stray spaces. */
export function normalizeRoomCode(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

export function isRoomCode(code: string): boolean {
  return ROOM_CODE_PATTERN.test(code);
}
