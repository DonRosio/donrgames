import { useState } from 'react';
import { HeadFrame, QuestionHeader, QuestionTitle, useHeadPictures } from './common.tsx';
import type { ScreenProps } from './common.tsx';
import { Brush, BrushButton } from './Brush.tsx';
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

      <ul className={`${styles.grid} ${styles.ballot}`} aria-label="Votez pour une tête">
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
                playerId={head.playerId}
                name={name(head.playerId)}
                src={head.mediaId ? (pictures[head.mediaId] ?? null) : null}
                size={136}
                state={
                  selected === head.playerId ? 'chosen' : selected !== null ? 'dim' : undefined
                }
              >
                {selected === head.playerId && (
                  <Brush seed={31}>
                    <span className={styles.label}>{locked ? 'Ton vote' : 'Ton choix'}</span>
                  </Brush>
                )}
              </HeadFrame>
            </button>
          </li>
        ))}
      </ul>

      <div className={styles.bottom}>
        {locked ? (
          <Brush size="button" tone="light" seed={32}>
            Vote enregistré
          </Brush>
        ) : (
          <BrushButton seed={33} disabled={!chosen || busy} onClick={() => void vote()}>
            {chosen ? `Voter pour ${name(chosen)}` : 'Choisis une tête'}
          </BrushButton>
        )}
        <Brush tone="light" seed={34}>
          <span className={styles.votes}>
            {view.voted.length}/{Math.max(view.heads.length, view.voted.length)} votes
          </span>
        </Brush>
        {isHost && (
          <BrushButton seed={35} disabled={!view.allVoted} onClick={() => void reveal()}>
            Révéler les résultats
          </BrushButton>
        )}
        {error && (
          <Brush size="text" tone="light" seed={36}>
            <span className="error" role="alert">
              {error}
            </span>
          </Brush>
        )}
      </div>
    </section>
  );
}
