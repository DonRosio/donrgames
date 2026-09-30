import { StatsForm } from './StatsForm.tsx';
import type { ScreenProps } from './common.tsx';
import styles from './among-legends.module.css';

/**
 * The game is over. The host enters the statistics; sending them shows them to everybody and
 * opens the vote. The others wait.
 */
export function StatsScreen({ view, room, isHost, act }: ScreenProps<'stats'>) {
  return (
    <section className={styles.screen}>
      <header className={styles.header}>
        <h2 className={styles.title}>La partie est terminée</h2>
        <p className="muted">
          {isHost
            ? 'Saisis ce que montre l’écran de fin de League of Legends. Le vote commencera ensuite.'
            : 'Le vote commencera dès que l’hôte aura saisi les statistiques.'}
        </p>
      </header>
      {isHost ? (
        <StatsForm teams={view.teams} size={view.size} room={room} act={act} initial={null} />
      ) : (
        <p className={styles.notice} role="status">
          L’hôte est en train de remplir les statistiques de la partie…
        </p>
      )}
    </section>
  );
}
