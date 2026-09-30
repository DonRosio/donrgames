import type { GameInfo, SettingValue } from '@mini-jeux/shared';
import { playerCountLabel } from '@mini-jeux/shared';
import { COMMON_POINTS } from '@mini-jeux/shared/games/among-legends-roles';
import styles from './among-legends.module.css';

/** "Règles du jeu": the rules only, foldable. The roles are in the carousel below. */
export function RulesPanel({ info }: { info: GameInfo; settings: Record<string, SettingValue> }) {
  return (
    <details className={styles.rules}>
      <summary>Règles du jeu</summary>
      <ol className={styles.steps}>
        <li>
          Le jeu se joue à exactement {playerCountLabel(info.meta)} : une équipe de 5, ou deux
          équipes de 5 qui s'affrontent.
        </li>
        <li>
          Chaque joueur reçoit un rôle secret, avec sa propre mission. Chaque équipe compte toujours
          un Imposteur et jamais deux fois le même rôle.
        </li>
        <li>
          Vous jouez une partie normale de League of Legends en respectant votre mission. L'hôte
          lance le chrono du site quand la partie commence.
        </li>
        <li>
          À la fin, l'hôte saisit les résultats de la partie, puis tout le monde débat pour
          débusquer l'Imposteur.
        </li>
        <li>
          Chacun devine le rôle de tous les autres joueurs : 4 votes à 5 joueurs, 9 votes à 10
          joueurs.
        </li>
        <li>
          Un tableau récapitulatif donne le score de chacun : les votes, la performance dans la
          partie et le respect de la mission de son rôle.
        </li>
      </ol>
      <h4>Points pour tout le monde</h4>
      <ul className={styles.points}>
        {COMMON_POINTS.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </details>
  );
}
