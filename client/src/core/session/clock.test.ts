import { describe, expect, it } from 'vitest';
import { bestEstimate, sampleOf } from './clock.ts';

describe('clock estimation', () => {
  it('computes the offset from the middle of the round trip', () => {
    // Sent at 1000, answered by a server 500 ms ahead, received 100 ms later.
    expect(sampleOf(1000, 1100, 1550)).toEqual({ rttMs: 100, offsetMs: 500 });
  });

  it('keeps the sample with the smallest round trip', () => {
    const samples = [
      { rttMs: 180, offsetMs: 540 },
      { rttMs: 40, offsetMs: 498 },
      { rttMs: 90, offsetMs: 505 },
    ];
    expect(bestEstimate(samples)).toEqual({ rttMs: 40, offsetMs: 498 });
    expect(bestEstimate([])).toBeNull();
  });
});
