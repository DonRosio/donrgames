import { useContext, useEffect, useRef, useState } from 'react';
import { audioContext } from '../media/audio.ts';
import { localNow } from '../session/clock.ts';
import { SessionContext } from '../session/context.ts';
import styles from './SyncedVideoPlayer.module.css';

/** A soundtrack played instead of the video's own sound (e.g. a recorded take). */
export interface Soundtrack {
  buffer: AudioBuffer;
  /** Position in the soundtrack that matches the first video frame. */
  offsetMs: number;
}

interface SyncedVideoPlayerProps {
  /** Object URL of the preloaded video. */
  src: string;
  /** Server time (ms) at which the video starts for everyone; null keeps it on its first frame. */
  startAt: number | null;
  muted?: boolean;
  /** Replaces the sound of the video (which is then muted). */
  soundtrack?: Soundtrack | null;
}

const MAX_DRIFT_S = 0.15;

/**
 * Plays a video at the same moment on every device: the start is scheduled on the server clock
 * (compensated), a late device jumps to the right position, and drift is corrected. An optional
 * soundtrack is scheduled on the Web Audio clock, aligned with the video.
 */
export function SyncedVideoPlayer({
  src,
  startAt,
  muted = false,
  soundtrack = null,
}: SyncedVideoPlayerProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const session = useContext(SessionContext);
  const [blocked, setBlocked] = useState(false);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const serverNow = () => session?.serverNow() ?? localNow();
  const position = () => (startAt === null ? 0 : (serverNow() - startAt) / 1000);

  /** Starts the soundtrack so that it matches the video position `atSeconds` from now. */
  const startSoundtrack = (delaySeconds: number, videoSeconds: number) => {
    if (!soundtrack) return;
    const context = audioContext();
    sourceRef.current?.stop();
    const source = context.createBufferSource();
    source.buffer = soundtrack.buffer;
    source.connect(context.destination);
    const when = context.currentTime + Math.max(0, delaySeconds);
    const offset = soundtrack.offsetMs / 1000 + videoSeconds;
    if (offset >= 0) source.start(when, offset);
    else source.start(when - offset);
    sourceRef.current = source;
  };

  const playAtPosition = async () => {
    const video = ref.current;
    if (!video || startAt === null) return;
    const target = position();
    if (target >= video.duration) return;
    if (target > 0.05) video.currentTime = target;
    try {
      if (soundtrack) {
        await audioContext().resume();
        if (audioContext().state !== 'running') {
          throw new DOMException('Audio locked', 'NotAllowedError');
        }
        // Not scheduled yet (audio was locked when the start was planned): start it in place.
        if (!sourceRef.current) startSoundtrack(0, Math.max(0, position()));
      }
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
    video.muted = muted || soundtrack !== null;
    video.pause();
    video.currentTime = 0;
    if (startAt === null) return;

    const delay = startAt - serverNow();
    // The soundtrack is scheduled right away on the precise audio clock.
    if (soundtrack && audioContext().state === 'running') {
      startSoundtrack(delay / 1000, Math.max(0, -delay / 1000));
    }
    const start = setTimeout(() => void playAtPosition(), Math.max(0, delay));
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
      try {
        sourceRef.current?.stop();
      } catch {
        // Not started.
      }
      sourceRef.current = null;
    };
    // playAtPosition/position/startSoundtrack only read the latest props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, startAt, muted, soundtrack]);

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
