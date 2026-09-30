import { useState } from 'react';
import { StatsForm } from './StatsForm.tsx';
import { StatsSummary } from './StatsSummary.tsx';
import { VoteForm } from './VoteForm.tsx';
import { nameOf } from './common.tsx';
import type { ScreenProps } from './common.tsx';
import styles from './among-legends.module.css';

/**
 * Everybody guesses the roles, with the statistics of the game in view. The host shows the
 * results once everybody has voted, and can still correct the statistics.
 */
export function VotingScreen({ view, room, isHost, act }: ScreenProps<'voting'>) {
  const [error, setError] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const waiting = Object.keys(view.teams).filter((id) => !view.voted.includes(id));

  const reveal = async () => {
    const result = await act('reveal', {});
    setError(result.ok ? null : result.message);
  };

  return (
    <section className={styles.screen}>
      <header className={styles.header}>
        <h2 className={styles.title}>Le vote</h2>
        <p className="muted">
          Chacun devine les rôles des autres, statistiques de la partie à l’appui.
        </p>
      </header>

      <VoteForm view={view} room={room} act={act} />
      <p className={styles.hint}>
        {waiting.length === 0
          ? 'Tout le monde a voté.'
          : `Pas encore voté : ${waiting.map((id) => nameOf(room, id)).join(', ')}.`}
      </p>

      {correcting ? (
        <StatsForm
          teams={view.teams}
          size={view.size}
          room={room}
          act={act}
          initial={view.stats}
          onCancel={() => setCorrecting(false)}
          onSent={() => setCorrecting(false)}
        />
      ) : (
        <StatsSummary stats={view.stats} size={view.size} room={room} />
      )}

      {isHost && (
        <div className={`card ${styles.hostPanel}`}>
          <p>
            Quand tout le monde a voté, affiche les résultats. « Passer à la suite » les affiche
            même s’il manque des votes.
          </p>
          <div className={styles.actions}>
            <button type="button" className="btn btn-primary" onClick={() => void reveal()}>
              Afficher les résultats
            </button>
            {!correcting && (
              <button type="button" className="btn" onClick={() => setCorrecting(true)}>
                Corriger les statistiques
              </button>
            )}
          </div>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
