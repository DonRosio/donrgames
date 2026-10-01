import { useEffect, useRef, useState } from 'react';
import type { RoomView } from '@mini-jeux/shared';
import type { DefusalContract, DefusalView } from '@mini-jeux/shared/games/defusal';
import { formatClock, remainingAt } from '@mini-jeux/shared/games/defusal-data';
import type { Clock } from '@mini-jeux/shared/games/defusal-data';
import type { GameScreenProps } from '../../core/game-host/client-game.ts';
import { resumeAudio } from '../../core/media/audio.ts';
import { useServerNow } from '../../core/session/context.ts';
import styles from './defusal.module.css';
import {
  CLOCK_DANGER_SECONDS,
  CLOCK_WARNING_SECONDS,
  soundEvents,
  tickKind,
} from './sound-events.ts';
import { playBomb, playTick, setSoundEnabled, useSoundEnabled } from './sounds.ts';

export type ScreenProps<P extends DefusalView['phase']> = GameScreenProps<
  DefusalContract,
  Extract<DefusalView, { phase: P }>
>;

export const nameOf = (room: RoomView, id: string) =>
  room.players.find((player) => player.id === id)?.nickname ?? '?';

/** The bomb's clock, ticking with the server time (and faster after each error). */
export function BombClock({ clock }: { clock: Clock }) {
  const now = useServerNow(100);
  const left = remainingAt(clock, now);
  const seconds = Math.ceil(left / 1000);
  const level =
    seconds <= CLOCK_DANGER_SECONDS
      ? styles.clockDanger
      : seconds <= CLOCK_WARNING_SECONDS
        ? styles.clockWarning
        : '';
  return (
    <span className={`${styles.clock} ${level}`} role="timer" aria-label="Chrono de la bombe">
      {formatClock(left)}
    </span>
  );
}

/** Errors so far, out of the one that makes the bomb explode. */
export function Strikes({ strikes, max }: { strikes: number; max: number }) {
  return (
    <span className={styles.strikes} aria-label={`Erreurs : ${strikes} sur ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < strikes ? styles.strikeOn : styles.strikeOff}>
          ✕
        </span>
      ))}
    </span>
  );
}

/** Turns the sound of the game on or off, for this browser. */
export function SoundToggle() {
  const on = useSoundEnabled();
  return (
    <button
      type="button"
      className={`btn btn-small ${styles.soundToggle}`}
      aria-pressed={on}
      onClick={() => {
        setSoundEnabled(!on);
        // A click is also what lets the browser play sounds again after a page reload.
        if (!on) void resumeAudio();
      }}
    >
      {on ? '🔊 Son' : '🔇 Son coupé'}
    </button>
  );
}

/**
 * What everybody hears of the bomb: the clock ticking once a second (higher as time runs out),
 * the buzz of an error, the chime of a module defused.
 */
export function useBombSounds(view: Extract<DefusalView, { phase: 'defusing' }>): void {
  const now = useServerNow(100);
  const seconds = Math.ceil(remainingAt(view.clock, now) / 1000);
  const lastSecond = useRef(seconds);
  useEffect(() => {
    if (seconds !== lastSecond.current && seconds > 0) playTick(tickKind(seconds));
    lastSecond.current = seconds;
  }, [seconds]);

  const { strikes, solved } = view;
  const purgeActive = view.bomb?.purge.active ?? false;
  const previous = useRef({ strikes, solved, purgeActive });
  useEffect(() => {
    // The purge alert beeps for as long as it is awake: that is up to the purge module.
    for (const sound of soundEvents(previous.current, { strikes, solved, purgeActive })) {
      if (sound !== 'purgeAlert') playBomb(sound);
    }
    previous.current = { strikes, solved, purgeActive };
  }, [strikes, solved, purgeActive]);
}

/** True for a moment each time the value increases (an error, for instance). */
export function usePulse(value: number, ms = 900): boolean {
  const previous = useRef(value);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (value <= previous.current) {
      previous.current = value;
      return;
    }
    previous.current = value;
    setOn(true);
    const timer = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return on;
}
