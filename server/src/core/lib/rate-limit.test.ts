import { describe, expect, it } from 'vitest';
import { FailureLimiter, FixedWindowLimiter, TokenBucket } from './rate-limit.ts';

const fakeClock = () => {
  const clock = { t: 0, now: () => clock.t };
  return clock;
};

describe('FixedWindowLimiter', () => {
  it('allows `limit` hits per window and per key', () => {
    const clock = fakeClock();
    const limiter = new FixedWindowLimiter({ limit: 2, windowMs: 1000, clock });
    expect([limiter.hit('a'), limiter.hit('a'), limiter.hit('a')]).toEqual([true, true, false]);
    expect(limiter.hit('b')).toBe(true);
    clock.t = 1000;
    expect(limiter.hit('a')).toBe(true);
  });
});

describe('FailureLimiter', () => {
  it('blocks a key after too many failures, for a while', () => {
    const clock = fakeClock();
    const limiter = new FailureLimiter({ maxFailures: 3, windowMs: 10_000, blockMs: 5_000, clock });
    limiter.recordFailure('a');
    limiter.recordFailure('a');
    expect(limiter.isBlocked('a')).toBe(false);
    limiter.recordFailure('a');
    expect(limiter.isBlocked('a')).toBe(true);
    expect(limiter.isBlocked('b')).toBe(false);
    clock.t = 5_000;
    expect(limiter.isBlocked('a')).toBe(false);
  });

  it('forgets failures older than the window', () => {
    const clock = fakeClock();
    const limiter = new FailureLimiter({ maxFailures: 2, windowMs: 1_000, blockMs: 5_000, clock });
    limiter.recordFailure('a');
    clock.t = 1_000;
    limiter.recordFailure('a');
    expect(limiter.isBlocked('a')).toBe(false);
  });
});

describe('TokenBucket', () => {
  it('allows a burst, then the sustained rate', () => {
    const clock = fakeClock();
    const bucket = new TokenBucket({ capacity: 3, refillPerSecond: 2, clock });
    expect([bucket.take(), bucket.take(), bucket.take(), bucket.take()]).toEqual([
      true,
      true,
      true,
      false,
    ]);
    clock.t = 500;
    expect([bucket.take(), bucket.take()]).toEqual([true, false]);
  });
});
