import styles from './VotePanel.module.css';

export interface VoteOption<T extends number | string> {
  value: T;
  label: string;
  /** Why the option is unavailable (shown under it); undefined when available. */
  disabledReason?: string;
}

interface VotePanelProps<T extends number | string> {
  options: VoteOption<T>[];
  /** The vote already cast, if any (votes are final). */
  chosen: T | null;
  onVote: (value: T) => void;
  busy?: boolean;
}

/** One big button per option; once a vote is cast, the choice is shown and locked. */
export function VotePanel<T extends number | string>({
  options,
  chosen,
  onVote,
  busy,
}: VotePanelProps<T>) {
  return (
    <div className={styles.panel} role="group" aria-label="Vote">
      {options.map((option) => (
        <div key={option.value} className={styles.option}>
          <button
            type="button"
            className={
              option.value === chosen ? `${styles.button} ${styles.chosen}` : styles.button
            }
            disabled={chosen !== null || busy || option.disabledReason !== undefined}
            aria-pressed={option.value === chosen}
            onClick={() => onVote(option.value)}
          >
            {option.label}
          </button>
          {option.disabledReason && chosen === null && (
            <span className={styles.reason}>{option.disabledReason}</span>
          )}
        </div>
      ))}
    </div>
  );
}
