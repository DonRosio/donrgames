/** Offset between the server clock and the local clock, measured NTP-style. */
export interface ClockEstimate {
  /** serverTime ≈ localNow() + offsetMs */
  offsetMs: number;
  rttMs: number;
}

/** Monotonic local time expressed in ms since epoch (unaffected by system clock changes). */
export function localNow(): number {
  return performance.timeOrigin + performance.now();
}

/** One ping: sent at t0, answered with `server`, received at t1 (local times). */
export function sampleOf(t0: number, t1: number, server: number): ClockEstimate {
  return { rttMs: t1 - t0, offsetMs: server - (t0 + t1) / 2 };
}

/** The sample with the smallest round trip is the least disturbed by network jitter. */
export function bestEstimate(samples: readonly ClockEstimate[]): ClockEstimate | null {
  let best: ClockEstimate | null = null;
  for (const sample of samples) if (!best || sample.rttMs < best.rttMs) best = sample;
  return best;
}

const BURST = 5;
const BURST_SPACING_MS = 150;
const PERIOD_MS = 30_000;
const KEPT_SAMPLES = 10;

/** Keeps the estimate fresh: a burst on start, one ping every 30 s and on tab focus. */
export class ClockSync {
  readonly #ping: (t0: number) => Promise<number | null>;
  readonly #onUpdate: (estimate: ClockEstimate) => void;
  #samples: ClockEstimate[] = [];
  #timers: ReturnType<typeof setTimeout>[] = [];
  #running = false;

  constructor(
    ping: (t0: number) => Promise<number | null>,
    onUpdate: (estimate: ClockEstimate) => void,
  ) {
    this.#ping = ping;
    this.#onUpdate = onUpdate;
  }

  start(): void {
    this.stop();
    this.#running = true;
    for (let i = 0; i < BURST; i++) {
      this.#timers.push(setTimeout(() => void this.#measure(), i * BURST_SPACING_MS));
    }
    this.#timers.push(setInterval(() => void this.#measure(), PERIOD_MS));
    document.addEventListener('visibilitychange', this.#onVisibility);
  }

  stop(): void {
    this.#running = false;
    for (const timer of this.#timers) clearTimeout(timer);
    this.#timers = [];
    document.removeEventListener('visibilitychange', this.#onVisibility);
  }

  readonly #onVisibility = () => {
    if (document.visibilityState === 'visible') void this.#measure();
  };

  async #measure(): Promise<void> {
    const t0 = localNow();
    const server = await this.#ping(t0);
    if (server === null || !this.#running) return;
    this.#samples = [...this.#samples, sampleOf(t0, localNow(), server)].slice(-KEPT_SAMPLES);
    const best = bestEstimate(this.#samples);
    if (best) this.#onUpdate(best);
  }
}
