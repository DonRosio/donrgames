import type { GameInfo, SettingValue } from '@mini-jeux/shared';
import { COMMON_POINTS, ROLES, ROLE_IDS } from '@mini-jeux/shared/games/among-legends-roles';
import styles from './among-legends.module.css';

/** Rules and roles, shown in the lobby to everyone. */
export function RulesPanel({
  settings,
}: {
  info: GameInfo;
  settings: Record<string, SettingValue>;
}) {
  const kept = (settings.roles as readonly string[] | undefined) ?? [];
  return (
    <details className={styles.rules}>
      <summary>Règles et rôles</summary>
      <ol className={styles.steps}>
        <li>
          Chaque joueur reçoit un rôle secret, avec sa propre mission. Il y a toujours un Imposteur.
        </li>
        <li>
          Vous jouez une partie normale de League of Legends en respectant votre mission. À 10
          joueurs, les deux équipes de 5 s'affrontent.
        </li>
        <li>À la fin, l'hôte saisit les résultats de la partie, puis tout le monde débat.</li>
        <li>
          Chacun devine le rôle de tous les autres joueurs. Les points dépendent des votes, de la
          partie et de la mission de chacun.
        </li>
      </ol>
      <h4>Pour tout le monde</h4>
      <ul className={styles.points}>
        {COMMON_POINTS.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <h4>Les rôles</h4>
      <ul className={styles.roleList}>
        {ROLE_IDS.map((id) => {
          const role = ROLES[id];
          const inGame = kept.includes(id);
          return (
            <li key={id} className={inGame ? undefined : styles.outOfGame}>
              <strong>{role.name}</strong>
              {role.inDevelopment ? ' (en développement)' : !inGame ? ' (non retenu)' : ''} :{' '}
              {role.goal}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
