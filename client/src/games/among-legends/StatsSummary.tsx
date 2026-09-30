import type { RoomView } from '@mini-jeux/shared';
import { TEAM_NAMES } from '@mini-jeux/shared/games/among-legends-roles';
import type { Team } from '@mini-jeux/shared/games/among-legends-roles';
import { STAT_KEYS, STAT_LABELS } from '@mini-jeux/shared/games/among-legends-scoring';
import type { GameStats } from '@mini-jeux/shared/games/among-legends-scoring';
import { nameOf, teamsOf } from './common.tsx';
import styles from './among-legends.module.css';

/** The statistics entered by the host, shown to everybody while they vote. */
export function StatsSummary({
  stats,
  size,
  room,
}: {
  stats: GameStats;
  size: 5 | 10;
  room: RoomView;
}) {
  const verdict =
    size === 5
      ? stats.winner === 'blue'
        ? 'Victoire'
        : 'Défaite'
      : `Victoire de l’${TEAM_NAMES[stats.winner].toLowerCase()}`;
  return (
    <section className={`card ${styles.form}`} aria-label="Statistiques de la partie">
      <h3>Statistiques de la partie</h3>
      <p>
        <strong>{verdict}</strong> · {stats.minutes} minutes
      </p>
      {teamsOf(size).map((team: Team) => (
        <div key={team} className={styles.statsTeam}>
          <h4>{size === 5 ? 'Ton équipe' : TEAM_NAMES[team]}</h4>
          <dl className={styles.summary}>
            {STAT_KEYS.map((key) => {
              const ids = stats.teams[team]?.[key] ?? [];
              return (
                <div key={key}>
                  <dt>{STAT_LABELS[key]}</dt>
                  <dd>
                    {ids.length > 0 ? ids.map((id) => nameOf(room, id)).join(', ') : 'Personne'}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      ))}
    </section>
  );
}
