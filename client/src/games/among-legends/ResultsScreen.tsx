import { useState } from 'react';
import { ROLES, TEAM_NAMES } from '@mini-jeux/shared/games/among-legends-roles';
import type { ResultPlayer } from '@mini-jeux/shared/games/among-legends';
import { SCORE_LABELS } from '@mini-jeux/shared/games/among-legends-scoring';
import { Scoreboard } from '../../core/ui/Scoreboard.tsx';
import { membersOf, nameOf, teamsOf } from './common.tsx';
import type { ScreenProps } from './common.tsx';
import styles from './among-legends.module.css';

const signed = (points: number) => (points > 0 ? `+${points}` : `${points}`);

/** Outcome, everybody's role and how each player scored, then the host ends the game. */
export function ResultsScreen({ view, room, isHost, act }: ScreenProps<'results'>) {
  const [error, setError] = useState<string | null>(null);
  const finish = async () => {
    const result = await act('finish', {});
    setError(result.ok ? null : result.message);
  };

  const entries = Object.entries(view.players).map(([id, player]) => ({
    playerId: id,
    nickname: nameOf(room, id),
    score: player.total,
  }));

  const verdict =
    view.size === 5
      ? view.winner === 'blue'
        ? 'Victoire !'
        : 'Défaite…'
      : `Victoire de l’${TEAM_NAMES[view.winner].toLowerCase()}`;

  const card = (id: string, player: ResultPlayer) => {
    const guess = view.myGuesses?.[id];
    return (
      <li key={id} className={`card ${styles.result} ${id === room.me ? styles.mine : ''}`}>
        <div className={styles.resultHead}>
          <h4>{nameOf(room, id)}</h4>
          <span className={styles.resultTotal}>
            {signed(player.total)} pt{Math.abs(player.total) > 1 ? 's' : ''}
          </span>
        </div>
        <p className={styles.resultRole}>
          <strong>{ROLES[player.role].name}</strong>
          {player.revealedRole
            ? ` → est devenu ${ROLES[player.revealedRole].name}`
            : player.role === 'chameleon'
              ? ' (n’a pas découvert de nouveau rôle)'
              : ''}
          {player.mode && ` · mode final ${player.mode === 'ally' ? 'Allié' : 'Imposteur'}`}
        </p>
        <p className="muted">
          {player.foundBy.length === 0
            ? 'Personne n’a trouvé son rôle.'
            : `Trouvé par ${player.foundBy.map((other) => nameOf(room, other)).join(', ')}.`}
          {guess !== undefined &&
            (guess === player.role
              ? ' Tu l’avais trouvé.'
              : ` Tu avais voté ${ROLES[guess].name}.`)}
          {!player.voted && ' N’a pas voté.'}
        </p>
        <ul className={styles.lines}>
          {player.lines.map((line) => (
            <li key={line.rule}>
              <span>
                {SCORE_LABELS[line.rule]}
                {line.count > 1 && ` (×${line.count})`}
              </span>
              <span className={line.points < 0 ? styles.minus : styles.plus}>
                {signed(line.points)}
              </span>
            </li>
          ))}
          {player.lines.length === 0 && <li className="muted">Aucun point.</li>}
        </ul>
      </li>
    );
  };

  return (
    <section className={styles.screen}>
      <header className={styles.header}>
        <h2 className={styles.title}>{verdict}</h2>
        <p className="muted">Partie de {view.minutes} minutes.</p>
      </header>

      <div className="card">
        <Scoreboard entries={entries} me={room.me} />
      </div>

      {teamsOf(view.size).map((team) => (
        <div key={team} className={styles.resultGroup}>
          {view.size === 10 && <h3>{TEAM_NAMES[team]}</h3>}
          <ul className={styles.results}>
            {membersOf(view.teams, team).map((id) => card(id, view.players[id]!))}
          </ul>
        </div>
      ))}

      {isHost ? (
        <div className={`card ${styles.hostPanel}`}>
          <button
            type="button"
            className={`btn btn-primary ${styles.mainAction}`}
            onClick={() => void finish()}
          >
            Voir le classement final
          </button>
        </div>
      ) : (
        <p className={styles.hint}>L’hôte affichera le classement final.</p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
