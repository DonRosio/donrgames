import type { ReactNode } from 'react';
import type { RankingEntry } from '@mini-jeux/shared';
import styles from './RankingScreen.module.css';

const MEDALS = ['🥇', '🥈', '🥉'];

interface RankingScreenProps {
  title: string;
  ranking: RankingEntry[];
  me?: string;
  /** Actions shown under the ranking (e.g. "Retour au salon"). */
  children?: ReactNode;
}

/** Final ranking of a game: podium for the first three ranks, then the others. */
export function RankingScreen({ title, ranking, me, children }: RankingScreenProps) {
  return (
    <section className={`card ${styles.screen}`}>
      <h2 className={styles.title}>{title}</h2>
      <ol className={styles.list}>
        {ranking.map((entry) => (
          <li
            key={entry.playerId}
            className={entry.playerId === me ? `${styles.row} ${styles.me}` : styles.row}
            data-rank={entry.rank}
          >
            <span className={styles.rank} aria-label={`${entry.rank}e`}>
              {MEDALS[entry.rank - 1] ?? `${entry.rank}e`}
            </span>
            <span className={styles.name}>{entry.nickname}</span>
            <span className={styles.score}>
              {entry.score} pt{Math.abs(entry.score) > 1 ? 's' : ''}
            </span>
          </li>
        ))}
      </ol>
      {children && <div className={styles.actions}>{children}</div>}
    </section>
  );
}
