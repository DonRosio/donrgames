import { describe, expect, it } from 'vitest';
import { createRoomBodySchema, joinRoomBodySchema } from './schemas.ts';

describe('HTTP body schemas', () => {
  it('accepts a nickname', () => {
    expect(createRoomBodySchema.parse({ nickname: 'Léa' })).toEqual({ nickname: 'Léa' });
  });

  it('rejects unknown fields', () => {
    expect(
      joinRoomBodySchema.safeParse({ code: 'ABC123', nickname: 'Léa', isHost: true }).success,
    ).toBe(false);
  });
});
