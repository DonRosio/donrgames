import type { Clock } from './time.ts';

/** Allows at most `limit` hits per key and per window. */
export class FixedWindowLimiter {
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #clock: Clock;
  readonly #windows = new Map<string, { start: number; count: number }>();

  constructor(options: { limit: number; windowMs: number; clock: Clock }) {
    this.#limit = options.limit;
    this.#windowMs = options.windowMs;
    this.#clock = options.clock;
  }

  /** Records a hit; returns false when the key is over its limit. */
  hit(key: string): boolean {
    const now = this.#clock.now();
    const window = this.#windows.get(key);
    if (!window || now - window.start >= this.#windowMs) {
      this.#windows.set(key, { start: now, count: 1 });
      return true;
    }
    window.count++;
    return window.count <= this.#limit;
  }

  sweep(): void {
    const now = this.#clock.now();
    for (const [key, window] of this.#windows) {
      if (now - window.start >= this.#windowMs) this.#windows.delete(key);
    }
  }
}

/** Blocks a key for `blockMs` once it reached `maxFailures` within `windowMs` (e.g. wrong codes). */
export class FailureLimiter {
  readonly #maxFailures: number;
  readonly #windowMs: number;
  readonly #blockMs: number;
  readonly #clock: Clock;
  readonly #failures = new Map<string, number[]>();
  readonly #blockedUntil = new Map<string, number>();

  constructor(options: { maxFailures: number; windowMs: number; blockMs: number; clock: Clock }) {
    this.#maxFailures = options.maxFailures;
    this.#windowMs = options.windowMs;
    this.#blockMs = options.blockMs;
    this.#clock = options.clock;
  }

  isBlocked(key: string): boolean {
    const until = this.#blockedUntil.get(key);
    return until !== undefined && this.#clock.now() < until;
  }

  recordFailure(key: string): void {
    const now = this.#clock.now();
    const recent = (this.#failures.get(key) ?? []).filter((t) => now - t < this.#windowMs);
    recent.push(now);
    if (recent.length >= this.#maxFailures) {
      this.#blockedUntil.set(key, now + this.#blockMs);
      this.#failures.delete(key);
    } else {
      this.#failures.set(key, recent);
    }
  }

  sweep(): void {
    const now = this.#clock.now();
    for (const [key, until] of this.#blockedUntil) if (now >= until) this.#blockedUntil.delete(key);
    for (const [key, times] of this.#failures) {
      if (times.every((t) => now - t >= this.#windowMs)) this.#failures.delete(key);
    }
  }
}

/** Token bucket: bursts up to `capacity`, then `refillPerSecond` sustained (socket messages). */
export class TokenBucket {
  readonly #capacity: number;
  readonly #refillPerMs: number;
  readonly #clock: Clock;
  #tokens: number;
  #last: number;

  constructor(options: { capacity: number; refillPerSecond: number; clock: Clock }) {
    this.#capacity = options.capacity;
    this.#refillPerMs = options.refillPerSecond / 1000;
    this.#clock = options.clock;
    this.#tokens = options.capacity;
    this.#last = options.clock.now();
  }

  take(): boolean {
    const now = this.#clock.now();
    this.#tokens = Math.min(this.#capacity, this.#tokens + (now - this.#last) * this.#refillPerMs);
    this.#last = now;
    if (this.#tokens < 1) return false;
    this.#tokens -= 1;
    return true;
  }
}
