import { useEffect, useRef, useState } from 'react';
import { resumeAudio } from '../../core/media/audio.ts';
import {
  MicrophoneFailure,
  closeMicrophone,
  monitorLevel,
  openMicrophone,
  playTakeOverVideo,
  recordOverVideo,
} from '../../core/media/recorder.ts';
import type { RecordedTake } from '../../core/media/recorder.ts';
import { LevelMeter } from '../../core/ui/LevelMeter.tsx';
import { RoundHeader } from './common.tsx';
import type { ScreenProps } from './common.tsx';
import { useVideoUrl } from './video.ts';
import styles from './dubbing.module.css';

type Stage = 'idle' | 'watching' | 'countdown' | 'recording' | 'review' | 'replaying' | 'sending';

/** Below this peak level, the take is considered silent (wrong microphone, muted…). */
const SILENCE_PEAK = 0.08;

const MIC_MESSAGES = {
  denied:
    "Le micro est bloqué pour ce site. Clique sur l'icône à gauche de l'adresse, autorise le micro, puis réessaie.",
  unavailable:
    "Aucun micro utilisable. Vérifie qu'il est branché et qu'aucune autre application ne l'occupe.",
  unsupported: "Ce navigateur ne permet pas d'enregistrer. Utilise Chrome ou Brave.",
};

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Cancelled', 'AbortError'));
    });
  });

export function RecordingScreen({ view, room, upload, fetchMedia }: ScreenProps<'recording'>) {
  const { url, error: loadError } = useVideoUrl(view.video.contentId, fetchMedia);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [take, setTake] = useState<RecordedTake | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [count, setCount] = useState(3);
  const [problem, setProblem] = useState<string | null>(null);
  const [silent, setSilent] = useState(false);
  const cancelRef = useRef<AbortController | null>(null);
  const playbackRef = useRef<{ stop(): void } | null>(null);
  const validated = view.mine === 'validated';

  // Leaving the phase (or the page) stops everything and releases the microphone.
  useEffect(
    () => () => {
      cancelRef.current?.abort();
      playbackRef.current?.stop();
    },
    [],
  );
  useEffect(() => () => closeMicrophone(stream), [stream]);

  const video = () => videoRef.current!;
  const idleStage = (): Stage => (take ? 'review' : 'idle');

  const stopPlayback = () => {
    playbackRef.current?.stop();
    playbackRef.current = null;
    video().pause();
  };

  const watch = async () => {
    setProblem(null);
    stopPlayback();
    const v = video();
    v.muted = false;
    v.currentTime = 0;
    setStage('watching');
    try {
      await v.play();
    } catch {
      setStage(idleStage());
    }
  };

  const record = async () => {
    setProblem(null);
    setSilent(false);
    stopPlayback();
    await resumeAudio();
    let mic: MediaStream;
    try {
      mic = await openMicrophone();
    } catch (failure) {
      setProblem(
        MIC_MESSAGES[failure instanceof MicrophoneFailure ? failure.reason : 'unavailable'],
      );
      return;
    }
    setStream(mic);
    const monitor = monitorLevel(mic);
    const cancel = new AbortController();
    cancelRef.current = cancel;
    const v = video();
    v.muted = true;
    v.currentTime = 0;
    try {
      setStage('countdown');
      for (let n = 3; n > 0; n--) {
        setCount(n);
        await sleep(1000, cancel.signal);
      }
      monitor.resetPeak();
      setStage('recording');
      const recorded = await recordOverVideo(v, mic, cancel.signal);
      setTake(recorded);
      setSilent(monitor.peak() < SILENCE_PEAK);
      setStage('review');
    } catch (failure) {
      if ((failure as DOMException).name !== 'AbortError') {
        setProblem("L'enregistrement a échoué. Réessaie.");
      }
      setStage(idleStage());
    } finally {
      monitor.stop();
      closeMicrophone(mic);
      setStream(null);
      cancelRef.current = null;
    }
  };

  const replay = async () => {
    if (!take) return;
    setProblem(null);
    stopPlayback();
    await resumeAudio();
    setStage('replaying');
    try {
      const playback = await playTakeOverVideo(video(), take.blob, take.offsetMs);
      playbackRef.current = playback;
      await playback.ended;
    } catch {
      setProblem('Impossible de relire cette prise. Recommence-la.');
    } finally {
      playbackRef.current = null;
      setStage('review');
    }
  };

  const send = async () => {
    if (!take) return;
    stopPlayback();
    setStage('sending');
    const result = await upload('take', take.blob, {
      offsetMs: take.offsetMs,
      durationMs: take.durationMs,
    });
    if (result.ok) {
      // Only the validated take left the device; the local copy is dropped.
      setTake(null);
      setStage('idle');
    } else {
      setProblem(result.message);
      setStage('review');
    }
  };

  const participants = room.players.filter((p) => p.role === 'player');
  const busy = stage === 'countdown' || stage === 'recording' || stage === 'sending';

  return (
    <section className={styles.screen}>
      <RoundHeader round={view.round} rounds={view.rounds} step="Enregistrement" />

      {!validated && (
        <p className={styles.reminder}>
          🎧 Mets-toi en sourd et muet sur Discord avant d'enregistrer.
        </p>
      )}

      <div className={styles.player}>
        {url ? (
          <video
            ref={videoRef}
            src={url}
            className={styles.video}
            playsInline
            preload="auto"
            onEnded={() => {
              if (stage === 'watching') setStage(idleStage());
            }}
          />
        ) : (
          <p className={styles.placeholder}>{loadError ?? 'Chargement de la vidéo…'}</p>
        )}
        {stage === 'countdown' && <div className={styles.countdown}>{count}</div>}
        {stage === 'recording' && <div className={styles.rec}>● REC</div>}
      </div>

      {stream && <LevelMeter stream={stream} />}

      {validated ? (
        <p className={styles.done}>✓ Ta prise est envoyée. En attente des autres joueurs…</p>
      ) : (
        <div className={styles.actions}>
          {stage === 'watching' || stage === 'replaying' ? (
            <button
              type="button"
              className="btn"
              onClick={() => {
                stopPlayback();
                setStage(idleStage());
              }}
            >
              ■ Arrêter
            </button>
          ) : stage === 'countdown' || stage === 'recording' ? (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => cancelRef.current?.abort()}
            >
              Annuler
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn"
                disabled={!url || busy}
                onClick={() => void watch()}
              >
                ▶ Revoir avec le son
              </button>
              {take && (
                <button type="button" className="btn" disabled={busy} onClick={() => void replay()}>
                  🔁 Réécouter ma prise
                </button>
              )}
              <button
                type="button"
                className={take ? 'btn' : 'btn btn-primary'}
                disabled={!url || busy}
                onClick={() => void record()}
              >
                {take ? '↺ Recommencer' : '● Enregistrer'}
              </button>
              {take && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => void send()}
                >
                  {stage === 'sending' ? 'Envoi…' : '✓ Valider cette prise'}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {!validated && stage === 'idle' && !take && (
        <p className="muted">
          Pendant l'enregistrement, la vidéo repart du début sans le son : double-la en direct. Tu
          peux réécouter et recommencer autant que tu veux avant de valider.
        </p>
      )}
      {silent && stage === 'review' && (
        <p className={styles.warning}>
          On ne t'entend presque pas. Vérifie le micro choisi dans le navigateur (icône à gauche de
          l'adresse) et recommence.
        </p>
      )}
      {problem && !validated && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}

      <ul className={styles.status}>
        {participants.map((player) => (
          <li
            key={player.id}
            className={view.validated.includes(player.id) ? styles.ok : undefined}
          >
            {view.validated.includes(player.id) ? '✓' : '…'} {player.nickname}
          </li>
        ))}
      </ul>
    </section>
  );
}
