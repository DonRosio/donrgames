import { useState } from 'react';
import { HeadFrame, QuestionHeader, QuestionTitle, useHeadPictures } from './common.tsx';
import type { ScreenProps } from './common.tsx';
import styles from './whos-most.module.css';

export function VotingScreen({ view, room, isHost, act, fetchMedia }: ScreenProps<'voting'>) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pictures = useHeadPictures(view.heads, fetchMedia);
  const name = (id: string) => room.players.find((p) => p.id === id)?.nickname ?? '?';
  const locked = view.myVote !== null;
  const selected = view.myVote ?? chosen;

  const vote = async () => {
    if (!chosen) return;
    setBusy(true);
    const result = await act('vote', { target: chosen });
    setBusy(false);
    setError(result.ok ? null : result.message);
  };

  const reveal = async () => {
    const result = await act('reveal', {});
    setError(result.ok ? null : result.message);
  };

  return (
    <section className={styles.screen}>
      <QuestionHeader index={view.index} total={view.total} step="Vote" />
      <QuestionTitle question={view.question} />

      <ul className={styles.grid} aria-label="Votez pour une tête">
        {view.heads.map((head) => (
          <li key={head.playerId}>
            <button
              type="button"
              className={styles.pick}
              disabled={locked || busy}
              aria-pressed={selected === head.playerId}
              aria-label={name(head.playerId)}
              onClick={() => setChosen(head.playerId)}
            >
              <HeadFrame
                name={name(head.playerId)}
                src={head.mediaId ? (pictures[head.mediaId] ?? null) : null}
                {...(selected === head.playerId
                  ? { state: 'chosen' as const }
                  : selected !== null
                    ? { state: 'dim' as const }
                    : {})}
              >
                {selected === head.playerId && (
                  <span className={styles.caption}>{locked ? '✓ Ton vote' : 'Ton choix'}</span>
                )}
              </HeadFrame>
            </button>
          </li>
        ))}
      </ul>

      <div className={`card ${styles.center}`}>
        {locked ? (
          <p className={styles.big}>Vote enregistré.</p>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!chosen || busy}
            onClick={() => void vote()}
          >
            Voter pour {chosen ? name(chosen) : '…'}
          </button>
        )}
        <p className="muted">
          Tu peux voter pour toi. Un vote est définitif. {view.voted.length} vote
          {view.voted.length > 1 ? 's' : ''} reçu{view.voted.length > 1 ? 's' : ''}.
        </p>
        {isHost && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!view.allVoted}
            onClick={() => void reveal()}
          >
            Révéler les résultats
          </button>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
