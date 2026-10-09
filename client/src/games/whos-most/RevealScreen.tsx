import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Confetti } from './Confetti.tsx';
import { Scoreboard } from '../../core/ui/Scoreboard.tsx';
import { HeadFrame, QuestionHeader, QuestionTitle, useHeadPictures } from './common.tsx';
import type { ScreenProps } from './common.tsx';
import styles from './whos-most.module.css';

/** Delay between two heads of the reveal (least voted first, the winners last). */
const STEP_MS = 450;

export function RevealScreen({ view, room, isHost, act, fetchMedia }: ScreenProps<'reveal'>) {
  const [error, setError] = useState<string | null>(null);
  const pictures = useHeadPictures(view.heads, fetchMedia);
  const name = (id: string) => room.players.find((p) => p.id === id)?.nickname ?? '?';
  const mediaOf = (id: string) => view.heads.find((head) => head.playerId === id)?.mediaId ?? null;
  const top = view.results[0]?.votes ?? 0;
  const winners = view.results.filter((result) => result.votes === top && top > 0);
  const others = view.results.filter((result) => !winners.includes(result));
  // Appearance order: from the least voted to the most voted.
  const order = [...view.results].reverse();
  const delayOf = (id: string) =>
    `${order.findIndex((result) => result.playerId === id) * STEP_MS}ms`;
  const winnersDelay = `${Math.max(0, others.length) * STEP_MS}ms`;

  const run = async (type: 'next' | 'finish') => {
    const result = await act(type, {});
    setError(result.ok ? null : result.message);
  };

  const card = (id: string, votes: number, state?: 'chosen' | 'dim') => (
    <HeadFrame
      name={name(id)}
      src={mediaOf(id) ? (pictures[mediaOf(id)!] ?? null) : null}
      {...(state ? { state } : {})}
    >
      <span className={styles.votes}>
        {votes} vote{votes > 1 ? 's' : ''}
      </span>
    </HeadFrame>
  );

  return (
    <section className={styles.screen}>
      <QuestionHeader index={view.index} total={view.total} step="Résultat" />
      <QuestionTitle question={view.question} />
      <Confetti delayMs={Math.max(0, others.length) * STEP_MS} />

      <ul className={styles.podium} aria-label="Gagnants">
        {winners.map((result) => (
          <li
            key={result.playerId}
            className={styles.pop}
            style={{ '--delay': winnersDelay } as CSSProperties}
          >
            {card(result.playerId, result.votes, 'chosen')}
          </li>
        ))}
      </ul>

      <ul className={styles.grid} aria-label="Autres têtes">
        {others.map((result) => (
          <li
            key={result.playerId}
            className={styles.pop}
            style={{ '--delay': delayOf(result.playerId) } as CSSProperties}
          >
            {card(result.playerId, result.votes, result.votes === 0 ? 'dim' : undefined)}
          </li>
        ))}
      </ul>

      <div className={`card ${styles.center}`}>
        <div className={styles.board}>
          <Scoreboard
            me={room.me}
            entries={view.totals.map((entry) => ({
              playerId: entry.playerId,
              nickname: name(entry.playerId),
              score: entry.total,
              delta: view.results.find((result) => result.playerId === entry.playerId)?.votes ?? 0,
            }))}
          />
        </div>
        {isHost ? (
          <div className={styles.actions}>
            <button type="button" className="btn btn-primary" onClick={() => void run('next')}>
              {view.last ? 'Voir le classement final' : 'Question suivante'}
            </button>
            {!view.last && (
              <button type="button" className="btn" onClick={() => void run('finish')}>
                Terminer la partie
              </button>
            )}
          </div>
        ) : (
          <p className="muted">L'hôte lance la suite.</p>
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
