import styles from './Scoreboard.module.css';

export interface ScoreboardEntry {
  playerId: string;
  nickname: string;
  score: number;
  /** Points just won (e.g. during the last round), shown next to the total. */
  delta?: number;
}

/** Scores sorted from best to worst; ties share a rank. */
export function Scoreboard({ entries, me }: { entries: ScoreboardEntry[]; me?: string }) {
  const sorted = [...entries].sort((a, b) => b.score - a.score);
  return (
    <ol className={styles.board}>
      {sorted.map((entry) => {
        const rank = sorted.findIndex((other) => other.score === entry.score) + 1;
        return (
          <li
            key={entry.playerId}
            className={entry.playerId === me ? `${styles.row} ${styles.me}` : styles.row}
          >
            <span className={styles.rank}>{rank}</span>
            <span className={styles.name}>{entry.nickname}</span>
            {entry.delta !== undefined && entry.delta !== 0 && (
              <span className={styles.delta}>
                {entry.delta > 0 ? '+' : ''}
                {entry.delta}
              </span>
            )}
            <span className={styles.score}>
              {entry.score} pt{Math.abs(entry.score) > 1 ? 's' : ''}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
