import { useEffect, useState } from 'react';
import { monitorLevel } from '../media/recorder.ts';
import styles from './LevelMeter.module.css';

/** Live microphone level: shows that the microphone chosen in the browser picks up the voice. */
export function LevelMeter({ stream }: { stream: MediaStream | null }) {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!stream) return;
    const monitor = monitorLevel(stream);
    let frame = 0;
    const tick = () => {
      setLevel(monitor.level());
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      monitor.stop();
      setLevel(0);
    };
  }, [stream]);

  return (
    <div
      className={styles.meter}
      role="meter"
      aria-label="Niveau du micro"
      aria-valuenow={Math.round(level * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={styles.fill} style={{ width: `${Math.round(level * 100)}%` }} />
    </div>
  );
}
