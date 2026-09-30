import { useEffect, useRef, useState } from 'react';
import { ROLES } from '@mini-jeux/shared/games/among-legends-roles';
import { playAlarm } from '../../core/media/alarm.ts';
import { useServerNow } from '../../core/session/context.ts';
import { ConfirmDialog } from '../../core/ui/ConfirmDialog.tsx';
import { RoleCard, formatClock } from './common.tsx';
import type { ScreenProps } from './common.tsx';
import styles from './among-legends.module.css';

/** How long the banner of the last alert stays on screen. */
const BANNER_MS = 60_000;

/**
 * Rings when the server raises a new alert for this player. The alert present when the screen
 * appears (page reloaded) does not ring again.
 */
function useAlarm(seq: number | undefined): boolean {
  const seen = useRef(seq ?? 0);
  const [recent, setRecent] = useState(false);
  useEffect(() => {
    if (seq === undefined || seq <= seen.current) return;
    seen.current = seq;
    playAlarm();
    setRecent(true);
    const timer = setTimeout(() => setRecent(false), BANNER_MS);
    return () => clearTimeout(timer);
  }, [seq]);
  return recent;
}

export function PlayingScreen({ view, isHost, act }: ScreenProps<'playing'>) {
  const now = useServerNow(1000);
  const recent = useAlarm(view.alert?.seq);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revealed = view.chameleon?.role ?? null;

  const end = async () => {
    setConfirming(false);
    const result = await act('end', {});
    setError(result.ok ? null : result.message);
  };

  return (
    <section className={styles.screen}>
      <div className={styles.clock} role="timer" aria-label="Temps de jeu">
        {formatClock(now - view.startedAt)}
      </div>

      {view.twoFace && (
        <div
          className={`card ${styles.mode} ${view.twoFace.mode === 'ally' ? styles.ally : styles.foe} ${recent ? styles.flash : ''}`}
        >
          <p className={styles.modeLabel}>
            {view.twoFace.mode === 'ally' ? 'Mode Allié' : 'Mode Imposteur'}
          </p>
          <p className={styles.modeOrder}>
            {view.twoFace.mode === 'ally' ? 'Tu dois GAGNER' : 'Tu dois PERDRE'}
          </p>
          <p className="muted">
            Prochain changement dans {formatClock(view.twoFace.nextSwitchAt - now)}
          </p>
        </div>
      )}

      {view.chameleon && !revealed && (
        <p className={styles.notice}>
          Ton vrai rôle arrive à 15:00 de jeu, dans {formatClock(view.chameleon.revealAt - now)}.
        </p>
      )}
      {revealed && (
        <p className={`${styles.notice} ${recent && !view.twoFace ? styles.flash : ''}`}>
          Caméléon : ton vrai rôle est <strong>{ROLES[revealed].name}</strong>. Remplis sa mission
          pour gagner 1 point de plus.
        </p>
      )}

      <RoleCard role={revealed ?? view.role} compact />

      {isHost && (
        <div className={`card ${styles.hostPanel}`}>
          <p>À la fin de la partie de League of Legends :</p>
          <button
            type="button"
            className={`btn btn-primary ${styles.mainAction}`}
            onClick={() => setConfirming(true)}
          >
            La partie est terminée
          </button>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {confirming && (
        <ConfirmDialog
          title="La partie est terminée ?"
          message="Le chrono s'arrête pour tout le monde. Chacun votera, et tu saisiras les statistiques de la partie."
          confirmLabel="Oui, terminée"
          onConfirm={() => void end()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </section>
  );
}
