import { useState } from 'react';
import { VotePanel } from '../../core/ui/VotePanel.tsx';
import { QuestionCard, namesOf } from './common.tsx';
import type { ScreenProps } from './common.tsx';
import styles from './bluff.module.css';

/** One of these answers is the real one. Pick it; your own answer is not allowed. */
export function VotingScreen({ view, room, act }: ScreenProps<'voting'>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const waiting = view.players.filter((id) => !view.voted.includes(id));

  const vote = async (option: string) => {
    setBusy(true);
    const result = await act('vote', { option });
    setBusy(false);
    setError(result.ok ? null : result.message);
  };

  return (
    <section className={styles.screen}>
      <QuestionCard view={view} />

      <div className={`card ${styles.form}`}>
        <p className="muted">
          {view.myVote === null
            ? 'Laquelle est la vraie réponse ? Ton vote est définitif.'
            : 'Vote enregistré. En attendant les autres…'}
        </p>
        <VotePanel
          options={view.options.map((option) => ({
            value: option.id,
            label: option.text,
            ...(option.mine ? { disabledReason: 'C’est ta réponse' } : {}),
          }))}
          chosen={view.myVote}
          busy={busy}
          onVote={(option) => void vote(option)}
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>

      <p className={styles.hint}>
        {waiting.length === 0
          ? 'Tout le monde a voté.'
          : `Pas encore voté : ${namesOf(room, waiting)}.`}
      </p>
    </section>
  );
}
