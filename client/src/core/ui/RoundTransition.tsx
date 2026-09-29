import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CloudSheet } from './CloudSheet.tsx';
import { Presenter } from './Presenter.tsx';
import styles from './RoundTransition.module.css';

/** Clouds slide in (0.8 s), the host speaks, then the clouds leave (0.8 s). */
const MIN_COVER_MS = 2200;
/** Safety net: never stay on screen longer than this, even if `hold` is never released. */
const MAX_COVER_MS = 12_000;
const LEAVE_MS = 900;

interface RoundTransitionProps {
  /** What the host says. */
  text: string;
  /** Keeps the clouds in place (e.g. while the next round loads); they leave once it is false. */
  hold?: boolean;
  onDone: () => void;
}

/**
 * Full-screen transition between two rounds: clouds sliding diagonally from the top left to the
 * bottom right, and the host announcing what comes next. Does not capture clicks.
 */
export function RoundTransition({ text, hold = false, onDone }: RoundTransitionProps) {
  const [leaving, setLeaving] = useState(false);
  const [minElapsed, setMinElapsed] = useState(false);

  useEffect(() => {
    const min = setTimeout(() => setMinElapsed(true), MIN_COVER_MS);
    const max = setTimeout(() => setLeaving(true), MAX_COVER_MS);
    return () => {
      clearTimeout(min);
      clearTimeout(max);
    };
  }, []);

  useEffect(() => {
    if (!minElapsed || hold) return;
    const timer = setTimeout(() => setLeaving(true), 0);
    return () => clearTimeout(timer);
  }, [minElapsed, hold]);

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(onDone, LEAVE_MS);
    return () => clearTimeout(timer);
  }, [leaving, onDone]);

  return createPortal(
    <div className={leaving ? `${styles.overlay} ${styles.leaving}` : styles.overlay}>
      <CloudSheet
        className={styles.sheet}
        seed={3}
        fill="#e3f6fd"
        shade="#b9e3f5"
        outline="#2d7fae"
        style={{ '--delay': '0s' } as React.CSSProperties}
      />
      <CloudSheet
        className={styles.sheet}
        seed={11}
        fill="#eefaff"
        shade="#c4e9f8"
        outline="#3b8cbb"
        style={{ '--delay': '0.16s' } as React.CSSProperties}
      />
      <div className={styles.stage} role="status">
        <Presenter className={styles.presenter} />
        <p className={styles.bubble}>{text}</p>
      </div>
    </div>,
    document.body,
  );
}
