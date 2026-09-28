import { useEffect, useRef } from 'react';
import { useServerNow } from '../session/context.ts';
import styles from './Countdown.module.css';

interface CountdownProps {
  /** End of the countdown, in server time (ms). */
  endsAt: number;
  label?: string;
  onDone?: () => void;
}

/** Seconds left until a server deadline, compensated for the clock offset of this device. */
export function Countdown({ endsAt, label, onDone }: CountdownProps) {
  const now = useServerNow(100);
  const remainingMs = Math.max(0, endsAt - now);
  const seconds = Math.ceil(remainingMs / 1000);
  // Deadline for which onDone was already called: a new deadline re-arms the countdown.
  const doneFor = useRef<number | null>(null);

  useEffect(() => {
    if (remainingMs === 0 && doneFor.current !== endsAt) {
      doneFor.current = endsAt;
      onDone?.();
    }
  }, [remainingMs, endsAt, onDone]);

  return (
    <div className={styles.countdown} role="timer" aria-live="off">
      {label && <span className={styles.label}>{label}</span>}
      <span className={styles.value}>{seconds}</span>
    </div>
  );
}
