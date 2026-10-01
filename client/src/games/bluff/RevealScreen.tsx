import { useState } from 'react';
import { Scoreboard } from '../../core/ui/Scoreboard.tsx';
import { QuestionCard, nameOf, namesOf } from './common.tsx';
import type { ScreenProps } from './common.tsx';
import styles from './bluff.module.css';

/** The real answer, who wrote each false one and who fell for it, and the points. */
export function RevealScreen({ view, room, isHost, act }: ScreenProps<'reveal'>) {
  const [error, setError] = useState<string | null>(null);
  const next = async () => {
    const result = await act('next', {});
    setError(result.ok ? null : result.message);
  };

  const entries = view.players.map((id) => ({
    playerId: id,
    nickname: nameOf(room, id),
    score: view.scores[id] ?? 0,
    delta: view.gains[id] ?? 0,
  }));

  return (
    <section className={styles.screen}>
      <QuestionCard view={view} filled={view.answer} />

      <ul className={styles.options}>
        {view.options.map((option) => (
          <li key={option.id} className={`card ${styles.option} ${option.real ? styles.real : ''}`}>
            <p className={styles.optionText}>
              {option.real && <span aria-hidden="true">✓ </span>}
              {option.text}
            </p>
            <p className="muted">
              {option.real ? (
                <span className={styles.realTag}>La vraie réponse</span>
              ) : (
                `Écrite par ${namesOf(room, option.authors)}`
              )}
              {' · '}
              {option.voters.length === 0
                ? 'personne ne l’a choisie'
                : `choisie par ${namesOf(room, option.voters)}`}
            </p>
          </li>
        ))}
      </ul>

      <div className="card">
        <Scoreboard entries={entries} me={room.me} />
      </div>

      {isHost ? (
        <button
          type="button"
          className={`btn btn-primary ${styles.action}`}
          onClick={() => void next()}
        >
          {view.last ? 'Voir le classement final' : 'Question suivante'}
        </button>
      ) : (
        <p className={styles.hint}>
          {view.last
            ? 'L’hôte affichera le classement final.'
            : 'L’hôte lancera la question suivante.'}
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
