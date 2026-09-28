import { describe, expect, it } from 'vitest';
import { createRoomBodySchema, historySchema, joinRoomBodySchema } from './schemas.ts';

describe('HTTP body schemas', () => {
  it('defaults the history to an empty object', () => {
    expect(createRoomBodySchema.parse({ nickname: 'Léa' })).toEqual({
      nickname: 'Léa',
      history: {},
    });
  });

  it('rejects unknown fields', () => {
    expect(
      joinRoomBodySchema.safeParse({ code: 'ABC123', nickname: 'Léa', isHost: true }).success,
    ).toBe(false);
  });

  it('bounds the history', () => {
    expect(historySchema.safeParse({ dubbing: ['raclette', 'herve1'] }).success).toBe(true);
    expect(historySchema.safeParse({ dubbing: ['../etc/passwd'] }).success).toBe(false);
    expect(historySchema.safeParse({ dubbing: Array(501).fill('a') }).success).toBe(false);
    const tooManyGames = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`g${i}`, []]));
    expect(historySchema.safeParse(tooManyGames).success).toBe(false);
  });
});
