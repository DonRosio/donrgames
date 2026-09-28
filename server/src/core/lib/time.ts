/** Injected everywhere time matters, so that logic can be tested with a fake clock. */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };
