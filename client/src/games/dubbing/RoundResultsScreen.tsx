import { useState } from 'react';
import { Scoreboard } from '../../core/ui/Scoreboard.tsx';
import { RoundHeader } from './common.tsx';
import type { ScreenProps } from './common.tsx';
import styles from './dubbing.module.css';

export function RoundResultsScreen({ view, room, isHost, act }: ScreenProps<'roundResults'>) {
  const [error, setError] = useState<string | null>(null);
  const name = (id: string) => room.players.find((p) => p.id === id)?.nickname ?? '?';

  const run = async (type: 'next' | 'finish') => {
    const result = await act(type, {});
    setError(result.ok ? null : result.message);
  };

  return (
    <section className={styles.screen}>
      <RoundHeader round={view.round} rounds={view.rounds} step="Fin de manche" />
      <div className={`card ${styles.center}`}>
        <p className={styles.big}>« {view.videoTitle} »</p>
        <div className={styles.board}>
          <Scoreboard
            me={room.me}
            entries={view.scores.map((entry) => ({
              playerId: entry.playerId,
              nickname: name(entry.playerId),
              score: entry.total,
              delta: entry.roundPoints,
            }))}
          />
        </div>
        {isHost ? (
          <div className={styles.actions}>
            <button type="button" className="btn btn-primary" onClick={() => void run('next')}>
              {view.last ? 'Voir le classement final' : 'Manche suivante'}
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
