import { useEffect, useRef, useState } from 'react';
import type { RoomView } from '@mini-jeux/shared';
import type { DefusalContract, DefusalView } from '@mini-jeux/shared/games/defusal';
import { formatClock, remainingAt } from '@mini-jeux/shared/games/defusal-data';
import type { Clock } from '@mini-jeux/shared/games/defusal-data';
import type { GameScreenProps } from '../../core/game-host/client-game.ts';
import { useServerNow } from '../../core/session/context.ts';
import styles from './defusal.module.css';

export type ScreenProps<P extends DefusalView['phase']> = GameScreenProps<
  DefusalContract,
  Extract<DefusalView, { phase: P }>
>;

export const nameOf = (room: RoomView, id: string) =>
  room.players.find((player) => player.id === id)?.nickname ?? '?';

/** The bomb's clock, ticking with the server time (and faster after each error). */
export function BombClock({ clock }: { clock: Clock }) {
  const now = useServerNow(100);
  return (
    <span className={styles.clock} role="timer" aria-label="Chrono de la bombe">
      {formatClock(remainingAt(clock, now))}
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
