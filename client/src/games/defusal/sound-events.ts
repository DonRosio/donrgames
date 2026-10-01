// Which sounds a change of the view calls for. Pure, so that it can be tested without a browser;
// the sounds themselves are made in `sounds.ts`.

/** What a player can hear change about the bomb. */
export interface BombSnapshot {
  strikes: number;
  /** Modules defused so far. */
  solved: number;
  /** The purge is awake (only the defuser knows). */
  purgeActive: boolean;
}

export type BombSound = 'strike' | 'solved' | 'purgeAlert';

/** The sounds to play when the bomb goes from one snapshot to the next, loudest news first. */
export function soundEvents(previous: BombSnapshot, next: BombSnapshot): BombSound[] {
  const sounds: BombSound[] = [];
  if (next.strikes > previous.strikes) sounds.push('strike');
  if (next.solved > previous.solved) sounds.push('solved');
  if (next.purgeActive && !previous.purgeActive) sounds.push('purgeAlert');
  return sounds;
}

/** The ticking gets higher, then urgent, as the clock runs out. */
export type TickKind = 'normal' | 'fast' | 'urgent';

export function tickKind(secondsLeft: number): TickKind {
  if (secondsLeft <= 10) return 'urgent';
  if (secondsLeft <= 30) return 'fast';
  return 'normal';
}

/** The clock turns red and pulses when this little time is left. */
export const CLOCK_WARNING_SECONDS = 30;
export const CLOCK_DANGER_SECONDS = 10;

/** Time between two beeps of the purge alert: faster when its window is about to close. */
export function purgeBeepEvery(msLeft: number): number {
  return msLeft <= 10_000 ? 600 : 1500;
}
