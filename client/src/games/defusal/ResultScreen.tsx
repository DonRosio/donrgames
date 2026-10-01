import { useEffect, useState } from 'react';
import { formatClock } from '@mini-jeux/shared/games/defusal-data';
import { History } from './History.tsx';
import { playDefused, playExplosion } from './sounds.ts';
import { nameOf } from './common.tsx';
import type { ScreenProps } from './common.tsx';
import styles from './defusal.module.css';

/** How this bomb ended; the host goes on to the next one. */
export function ResultScreen({ view, room, isHost, act }: ScreenProps<'result'>) {
  const [error, setError] = useState<string | null>(null);
  const next = async () => {
    const result = await act('next', {});
    setError(result.ok ? null : result.message);
  };
  const defused = view.outcome === 'defused';
  const { round } = view;
  useEffect(() => {
    if (defused) playDefused();
    else playExplosion();
  }, [defused, round]);
  return (
    <section className={styles.screen}>
      <header className={`card ${styles.result} ${defused ? styles.resultWin : styles.resultLoss}`}>
        {defused ? (
          <span className={styles.ring} aria-hidden="true" />
        ) : (
          <span className={styles.boom} aria-hidden="true" />
        )}
        <h2 className={defused ? styles.role : `${styles.role} ${styles.boomTitle}`}>
          {defused ? 'Bombe désamorcée !' : 'BOUM'}
        </h2>
        <p>
          {defused
            ? `${nameOf(room, view.defuser)} et les experts l'ont désamorcée avec ${formatClock(view.remaining)} d'avance.`
            : `La bombe a explosé : ${view.solved} module${view.solved > 1 ? 's' : ''} sur ${view.modules} désamorcé${view.solved > 1 ? 's' : ''}.`}
        </p>
        <p className="muted">
          Erreurs : {view.strikes} / {view.maxStrikes}
        </p>
      </header>
      <History history={view.history} room={room} />
      {isHost ? (
        <button
          type="button"
          className={`btn btn-primary ${styles.action}`}
          onClick={() => void next()}
        >
          {view.last ? 'Voir le bilan' : 'Bombe suivante'}
        </button>
      ) : (
        <p className={styles.hint}>
          {view.last ? "L'hôte affichera le bilan." : "L'hôte lancera la bombe suivante."}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
