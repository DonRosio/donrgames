import { useState } from 'react';
import { TEAM_NAMES, TEAM_SIZE } from '@mini-jeux/shared/games/among-legends-roles';
import type { Team } from '@mini-jeux/shared/games/among-legends-roles';
import { nameOf } from './common.tsx';
import type { ScreenProps } from './common.tsx';
import styles from './among-legends.module.css';

/** 10 players: everyone joins the team they play in, then the host confirms. */
export function TeamsScreen({ view, room, isHost, act }: ScreenProps<'teams'>) {
  const [error, setError] = useState<string | null>(null);
  const run = async (type: 'chooseTeam' | 'confirmTeams', team?: Team) => {
    const result =
      type === 'chooseTeam' ? await act('chooseTeam', { team: team! }) : await act(type, {});
    setError(result.ok ? null : result.message);
  };
  const members = (team: Team | null) =>
    Object.entries(view.teams)
      .filter(([, t]) => t === team)
      .map(([id]) => id);
  const mine = view.teams[room.me] ?? null;
  const complete = members('blue').length === TEAM_SIZE && members('red').length === TEAM_SIZE;
  const unassigned = members(null);

  return (
    <section className={styles.screen}>
      <header className={styles.header}>
        <h2 className={styles.title}>Choix des équipes</h2>
        <p className="muted">
          Rejoignez l'équipe dans laquelle vous jouez sur League of Legends : 5 joueurs de chaque
          côté.
        </p>
      </header>
      <div className={styles.teams}>
        {(['blue', 'red'] as const).map((team) => {
          const list = members(team);
          return (
            <section key={team} className={`card ${styles.team} ${styles[team]}`}>
              <h3>
                {TEAM_NAMES[team]} ({list.length}/{TEAM_SIZE})
              </h3>
              <ul>
                {list.map((id) => (
                  <li key={id} className={id === room.me ? styles.me : undefined}>
                    {nameOf(room, id)}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="btn"
                disabled={mine === team || list.length >= TEAM_SIZE}
                onClick={() => void run('chooseTeam', team)}
              >
                {mine === team ? 'Tu es dans cette équipe' : 'Rejoindre'}
              </button>
            </section>
          );
        })}
      </div>
      {unassigned.length > 0 && (
        <p className={styles.hint}>
          Sans équipe : {unassigned.map((id) => nameOf(room, id)).join(', ')}
        </p>
      )}
      {isHost ? (
        <button
          type="button"
          className={`btn btn-primary ${styles.mainAction}`}
          disabled={!complete}
          onClick={() => void run('confirmTeams')}
        >
          Valider les équipes
        </button>
      ) : (
        <p className={styles.hint}>L'hôte valide quand les deux équipes sont complètes.</p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
