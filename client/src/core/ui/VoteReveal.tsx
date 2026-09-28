import type { CSSProperties } from 'react';
import styles from './VoteReveal.module.css';

export interface RevealedVote {
  voter: string;
  /** null: no vote (counts as nothing). */
  points: number | null;
}

/** Delay between two rows of the reveal. */
const STEP_MS = 700;

/**
 * Table of the votes: each voter appears in turn, their "+1" / "+2" pops then fades, then the
 * total is shown.
 */
export function VoteReveal({ votes, total }: { votes: RevealedVote[]; total: number }) {
  return (
    <div className={styles.reveal}>
      <ul className={styles.rows}>
        {votes.map((vote, index) => (
          <li
            key={vote.voter}
            className={styles.row}
            style={{ '--delay': `${index * STEP_MS}ms` } as CSSProperties}
          >
            <span className={styles.voter}>{vote.voter}</span>
            <span className={vote.points ? styles.points : styles.zero}>
              {vote.points === null ? 'pas de vote' : vote.points === 0 ? '0' : `+${vote.points}`}
            </span>
          </li>
        ))}
      </ul>
      <p
        className={styles.total}
        style={{ '--delay': `${votes.length * STEP_MS + 400}ms` } as CSSProperties}
      >
        Total : <strong>+{total}</strong>
      </p>
    </div>
  );
}
