import type { RoomView } from '@mini-jeux/shared';
import type { RoundSummary } from '@mini-jeux/shared/games/defusal';
import { formatClock } from '@mini-jeux/shared/games/defusal-data';
import { nameOf } from './common.tsx';
import styles from './defusal.module.css';

/** The bombs already played. */
export function History({ history, room }: { history: RoundSummary[]; room: RoomView }) {
  if (history.length === 0) return null;
  return (
    <ol className={`card ${styles.history}`} aria-label="Bombes précédentes">
      {history.map((r) => (
        <li key={r.round}>
          <span>
            Bombe {r.round} · {nameOf(room, r.defuser)}
          </span>
          <span className={r.outcome === 'defused' ? styles.defused : styles.exploded}>
            {r.outcome === 'defused'
              ? `désamorcée, ${formatClock(r.remaining)} restantes`
              : 'explosée'}
          </span>
        </li>
      ))}
    </ol>
  );
}
