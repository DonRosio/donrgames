import { useContext, useEffect, useRef, useState } from 'react';
import { localNow } from '../session/clock.ts';
import { SessionContext } from '../session/context.ts';
import styles from './SyncedVideoPlayer.module.css';

interface SyncedVideoPlayerProps {
  /** Object URL of the preloaded video. */
  src: string;
  /** Server time (ms) at which the video starts for everyone; null keeps it on its first frame. */
  startAt: number | null;
  muted?: boolean;
}

const MAX_DRIFT_S = 0.15;

/**
 * Plays a video at the same moment on every device: the start is scheduled on the server clock
 * (compensated), a late device jumps to the right position, and drift is corrected.
 */
export function SyncedVideoPlayer({ src, startAt, muted = false }: SyncedVideoPlayerProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const session = useContext(SessionContext);
  const [blocked, setBlocked] = useState(false);
  const serverNow = () => session?.serverNow() ?? localNow();

  const position = () => (startAt === null ? 0 : (serverNow() - startAt) / 1000);

  const playAtPosition = async () => {
    const video = ref.current;
    if (!video || startAt === null) return;
    const target = position();
    if (target >= video.duration) return;
    if (target > 0.05) video.currentTime = target;
    try {
      await video.play();
      setBlocked(false);
    } catch (error) {
      // Autoplay refused (page reloaded without any click since, or site setting): ask for a click.
      if ((error as DOMException).name === 'NotAllowedError') setBlocked(true);
    }
  };

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.muted = muted;
    video.pause();
    video.currentTime = 0;
    if (startAt === null) return;

    const start = setTimeout(() => void playAtPosition(), Math.max(0, startAt - serverNow()));
    const drift = setInterval(() => {
      if (video.paused || video.ended) return;
      const target = position();
      if (target < video.duration && Math.abs(video.currentTime - target) > MAX_DRIFT_S) {
        video.currentTime = target;
      }
    }, 1000);
    return () => {
      clearTimeout(start);
      clearInterval(drift);
      video.pause();
    };
    // playAtPosition/position only read the latest props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, startAt, muted]);

  return (
    <div className={styles.player}>
      <video ref={ref} src={src} className={styles.video} playsInline preload="auto" />
      {blocked && (
        <button
          type="button"
          className={`btn btn-primary ${styles.unlock}`}
          onClick={() => void playAtPosition()}
        >
          🔊 Activer le son
        </button>
      )}
    </div>
  );
}
