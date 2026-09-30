import { useState } from 'react';
import { ROLES, TEAM_NAMES } from '@mini-jeux/shared/games/among-legends-roles';
import type { RoleId } from '@mini-jeux/shared/games/among-legends-roles';
import { ConfirmDialog } from '../../core/ui/ConfirmDialog.tsx';
import { membersOf, nameOf, teamsOf } from './common.tsx';
import type { ScreenProps } from './common.tsx';
import styles from './among-legends.module.css';

/** Guess the role of every other player, the other team included. Final once sent. */
export function VoteForm({
  view,
  room,
  act,
}: Pick<ScreenProps<'debrief'>, 'view' | 'room' | 'act'>) {
  const [guesses, setGuesses] = useState<Partial<Record<string, RoleId>>>({});
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (view.myGuesses) {
    return (
      <section className={`card ${styles.form}`}>
        <h3>Ton vote est envoyé</h3>
        <ul className={styles.plain}>
          {Object.entries(view.myGuesses).map(([id, role]) => (
            <li key={id}>
              {nameOf(room, id)} : <strong>{ROLES[role].name}</strong>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const targets = Object.keys(view.teams).filter((id) => id !== room.me);
  const complete = targets.every((id) => guesses[id] !== undefined);

  const send = async () => {
    setConfirming(false);
    const result = await act('vote', { guesses: guesses as Record<string, RoleId> });
    setError(result.ok ? null : result.message);
  };

  return (
    <section className={`card ${styles.form}`}>
      <h3>Ton vote</h3>
      <p className="muted">
        Devine le rôle de chacun. Pour le Caméléon, il faut deviner « Caméléon ». Le vote est
        définitif.
      </p>
      {teamsOf(view.size).map((team) => {
        const others = membersOf(view.teams, team).filter((id) => id !== room.me);
        if (others.length === 0) return null;
        return (
          <div key={team} className={styles.voteGroup}>
            {view.size === 10 && <h4>{TEAM_NAMES[team]}</h4>}
            {others.map((id) => (
              <div key={id} className={styles.voteRow}>
                <label htmlFor={`guess-${id}`}>{nameOf(room, id)}</label>
                <select
                  id={`guess-${id}`}
                  className={styles.select}
                  value={guesses[id] ?? ''}
                  onChange={(event) =>
                    setGuesses({ ...guesses, [id]: (event.target.value || undefined) as RoleId })
                  }
                >
                  <option value="">— Choisis un rôle —</option>
                  {view.roles.map((role) => (
                    <option key={role} value={role}>
                      {ROLES[role].name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        );
      })}
      <button
        type="button"
        className={`btn btn-primary ${styles.mainAction}`}
        disabled={!complete}
        onClick={() => setConfirming(true)}
      >
        Envoyer mon vote
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {confirming && (
        <ConfirmDialog
          title="Envoyer ton vote ?"
          message="Tu ne pourras plus le modifier."
          confirmLabel="Envoyer"
          onConfirm={() => void send()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </section>
  );
}
