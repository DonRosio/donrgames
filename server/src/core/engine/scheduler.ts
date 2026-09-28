import type { Clock } from '../lib/time.ts';

/** Timers used by games; replaceable by a manual scheduler in tests. */
export interface Scheduler {
  set(callback: () => void, delayMs: number): unknown;
  clear(handle: unknown): void;
}

export const systemScheduler: Scheduler = {
  set: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Scheduler driven by hand, sharing a fake clock: `advance()` fires the due timers in order. */
export class ManualScheduler implements Scheduler {
  readonly clock: Clock & { t: number };
  #timers = new Map<number, { at: number; callback: () => void }>();
  #nextId = 1;

  constructor(start = 0) {
    const clock = { t: start, now: () => clock.t };
    this.clock = clock;
  }

  set(callback: () => void, delayMs: number): number {
    const id = this.#nextId++;
    this.#timers.set(id, { at: this.clock.t + delayMs, callback });
    return id;
  }

  clear(handle: unknown): void {
    this.#timers.delete(handle as number);
  }

  advance(ms: number): void {
    const target = this.clock.t + ms;
    for (;;) {
      let dueId: number | null = null;
      let due: { at: number; callback: () => void } | null = null;
      for (const [id, timer] of this.#timers) {
        if (timer.at <= target && (!due || timer.at < due.at)) {
          dueId = id;
          due = timer;
        }
      }
      if (dueId === null || !due) break;
      this.#timers.delete(dueId);
      this.clock.t = Math.max(this.clock.t, due.at);
      due.callback();
    }
    this.clock.t = target;
  }
}
