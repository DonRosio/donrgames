import styles from './defusal.module.css';

/** The defuser's icon: a round bomb with a lit fuse. */
export function BombIcon() {
  return (
    <svg viewBox="0 0 64 64" className={styles.icon} role="img" aria-label="Bombe">
      <circle cx="28" cy="38" r="20" fill="#2b2e33" stroke="currentColor" strokeWidth="3" />
      <path
        d="M15 30c3-7 9-11 16-11"
        fill="none"
        stroke="#8a8f98"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect x="36" y="11" width="9" height="9" rx="2" transform="rotate(35 40 15)" fill="#6b6f78" />
      <path
        d="M43 12c4-6 9-6 11-2"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <g stroke="#ff5b4a" strokeWidth="3" strokeLinecap="round">
        <path d="M56 6v5M51 3l2 4M60 11h-4M59 5l-4 3" />
      </g>
    </svg>
  );
}

/** An expert's icon: the manual, open. */
export function BookIcon() {
  return (
    <svg viewBox="0 0 64 64" className={styles.icon} role="img" aria-label="Manuel">
      <path
        d="M32 15c-6-5-15-6-24-4v36c9-2 18-1 24 4 6-5 15-6 24-4V11c-9-2-18-1-24 4z"
        fill="#f6efdc"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M32 15v36" stroke="currentColor" strokeWidth="3" />
      <g stroke="#8a7a55" strokeWidth="2.4" strokeLinecap="round">
        <path d="M14 22h12M14 29h12M14 36h9M38 22h12M38 29h12M38 36h9" />
      </g>
    </svg>
  );
}
