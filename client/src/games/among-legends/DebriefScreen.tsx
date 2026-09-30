import { useState } from 'react';
import { StatsForm } from './StatsForm.tsx';
import { VoteForm } from './VoteForm.tsx';
import { nameOf } from './common.tsx';
import type { ScreenProps } from './common.tsx';
import styles from './among-legends.module.css';

/**
 * The game is over: everybody votes while the host reads the statistics of the game. The host
 * then shows the results, when the statistics are in and everybody has voted.
 */
export function DebriefScreen(props: ScreenProps<'debrief'>) {
  const { view, room, isHost, act } = props;
  const [error, setError] = useState<string | null>(null);
  const waiting = Object.keys(view.teams).filter((id) => !view.voted.includes(id));

  const reveal = async () => {
    const result = await act('reveal', {});
    setError(result.ok ? null : result.message);
  };

  return (
    <section className={styles.screen}>
      <header className={styles.header}>
        <h2 className={styles.title}>La partie est terminée</h2>
        <p className="muted">
          Chacun devine les rôles des autres. L’hôte saisit ce que montre l’écran de fin de League
          of Legends.
        </p>
      </header>

      <VoteForm view={view} room={room} act={act} />
      <p className={styles.hint}>
        {waiting.length === 0
          ? 'Tout le monde a voté.'
          : `Pas encore voté : ${waiting.map((id) => nameOf(room, id)).join(', ')}.`}
      </p>

      {isHost ? (
        <>
          <StatsForm view={view} room={room} act={act} />
          <div className={`card ${styles.hostPanel}`}>
            <p>
              Quand les statistiques sont enregistrées et que tout le monde a voté, affiche les
              résultats. « Passer à la suite » les affiche même s’il manque des votes.
            </p>
            <button
              type="button"
              className={`btn btn-primary ${styles.mainAction}`}
              disabled={!view.statsSent}
              onClick={() => void reveal()}
            >
              Afficher les résultats
            </button>
          </div>
        </>
      ) : (
        <p className={styles.hint}>
          {view.statsSent
            ? 'L’hôte a saisi les statistiques. Il affichera les résultats.'
            : 'L’hôte saisit les statistiques de la partie.'}
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
