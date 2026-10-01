import { useState } from 'react';
import type { FormEvent } from 'react';
import { ANSWER_MAX_LENGTH } from '@mini-jeux/shared/games/bluff-themes';
import { QuestionCard, namesOf } from './common.tsx';
import type { ScreenProps } from './common.tsx';
import styles from './bluff.module.css';

/** Everybody invents a false answer; nobody knows the real one. */
export function WritingScreen({ view, room, act }: ScreenProps<'writing'>) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const waiting = view.players.filter((id) => !view.answered.includes(id));

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || text.trim() === '') return;
    setBusy(true);
    const result = await act('answer', { text });
    setBusy(false);
    setError(result.ok ? null : result.message);
  };

  return (
    <section className={styles.screen}>
      <QuestionCard view={view} />

      {view.mine === null ? (
        <form className={`card ${styles.form}`} onSubmit={(event) => void send(event)}>
          <label htmlFor="bluff-answer">Ta fausse réponse</label>
          <p className="muted">
            Invente la réponse la plus crédible : les autres devront la distinguer de la vraie.
          </p>
          <input
            id="bluff-answer"
            type="text"
            value={text}
            maxLength={ANSWER_MAX_LENGTH}
            autoComplete="off"
            autoFocus
            onChange={(event) => setText(event.target.value)}
          />
          <button
            type="submit"
            className={`btn btn-primary ${styles.action}`}
            disabled={busy || text.trim() === ''}
          >
            Valider ma réponse
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </form>
      ) : (
        <div className={`card ${styles.form}`}>
          <p className="muted">Ta réponse est envoyée :</p>
          <p className={styles.mine}>{view.mine}</p>
        </div>
      )}

      <p className={styles.hint}>
        {waiting.length === 0
          ? 'Tout le monde a répondu.'
          : `Pas encore répondu : ${namesOf(room, waiting)}.`}
      </p>
    </section>
  );
}
