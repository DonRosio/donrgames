import { describe, expect, it } from 'vitest';
import { isRoomCode, normalizeRoomCode } from './room-code.ts';

describe('room codes', () => {
  it('normalizes case and spaces', () => {
    expect(normalizeRoomCode(' ab c1 23 ')).toBe('ABC123');
  });

  it('accepts exactly 6 characters among A-Z and 0-9', () => {
    expect(isRoomCode('ABC123')).toBe(true);
    expect(isRoomCode('ABC12')).toBe(false);
    expect(isRoomCode('ABC1234')).toBe(false);
    expect(isRoomCode('ABC-12')).toBe(false);
    expect(isRoomCode('abc123')).toBe(false);
  });
});
