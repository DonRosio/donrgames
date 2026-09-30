import { useState } from 'react';
import type { RoomView } from '@mini-jeux/shared';
import { TEAM_NAMES } from '@mini-jeux/shared/games/among-legends-roles';
import type { Team } from '@mini-jeux/shared/games/among-legends-roles';
import {
  STAT_KEYS,
  STAT_LABELS,
  validateTeamStats,
} from '@mini-jeux/shared/games/among-legends-scoring';
import type { GameStats, StatKey, TeamStats } from '@mini-jeux/shared/games/among-legends-scoring';
import { ConfirmDialog } from '../../core/ui/ConfirmDialog.tsx';
import { STATS_ERROR_MESSAGES, membersOf, nameOf, teamsOf } from './common.tsx';
import type { ScreenProps } from './common.tsx';
import styles from './among-legends.module.css';

/** Durations offered: what the end screen of League of Legends can show, in minutes. */
const MINUTES = Array.from({ length: 86 }, (_, i) => i + 5);

const emptyStats = (): TeamStats =>
  Object.fromEntries(STAT_KEYS.map((key) => [key, [] as string[]])) as unknown as TeamStats;

/**
 * Host only: what the end screen of the game shows. Every question is asked for each team, about
 * the five allies only; several players can be ticked on a tie.
 */
export function StatsForm({
  teams: teamOf,
  size,
  room,
  act,
  initial,
  onCancel,
  onSent,
}: {
  teams: Record<string, Team | null>;
  size: 5 | 10;
  room: RoomView;
  act: ScreenProps<'stats'>['act'];
  /** Statistics already sent, when correcting them. */
  initial: GameStats | null;
  onCancel?: () => void;
  onSent?: () => void;
}) {
  const teams = teamsOf(size);
  const sent = initial;
  const [confirming, setConfirming] = useState(false);
  const [winner, setWinner] = useState<Team | ''>(sent?.winner ?? '');
  const [minutes, setMinutes] = useState<number | ''>(sent?.minutes ?? '');
  const [answers, setAnswers] = useState<Partial<Record<Team, TeamStats>>>(
    () => sent?.teams ?? Object.fromEntries(teams.map((team) => [team, emptyStats()])),
  );
  const [error, setError] = useState<string | null>(null);

  const problems = teams.map((team) =>
    validateTeamStats(answers[team] ?? emptyStats(), membersOf(teamOf, team)),
  );
  const valid = winner !== '' && minutes !== '' && problems.every((problem) => problem === null);

  const toggle = (team: Team, key: StatKey, id: string) => {
    const current = answers[team] ?? emptyStats();
    const next = current[key].includes(id)
      ? current[key].filter((other) => other !== id)
      : [...current[key], id];
    setAnswers({ ...answers, [team]: { ...current, [key]: next } });
  };

  const send = async () => {
    if (winner === '' || minutes === '') return;
    const stats: GameStats = {
      winner,
      minutes,
      teams: {
        blue: answers.blue ?? emptyStats(),
        ...(size === 10 ? { red: answers.red ?? emptyStats() } : {}),
      },
    };
    setConfirming(false);
    const result = await act('submitStats', stats);
    setError(result.ok ? null : result.message);
    if (result.ok) onSent?.();
  };

  return (
    <section className={`card ${styles.form}`}>
      <h3>Statistiques de la partie</h3>
      <p className="muted">À lire sur l’écran de fin de League of Legends.</p>

      <div className={styles.voteRow}>
        <label htmlFor="stats-winner">{size === 5 ? 'Résultat' : 'Équipe gagnante'}</label>
        <select
          id="stats-winner"
          className={styles.select}
          value={winner}
          onChange={(event) => setWinner(event.target.value as Team | '')}
        >
          <option value="">— Choisis —</option>
          {size === 5 ? (
            <>
              <option value="blue">Victoire</option>
              <option value="red">Défaite</option>
            </>
          ) : (
            teams.map((team) => (
              <option key={team} value={team}>
                {TEAM_NAMES[team]}
              </option>
            ))
          )}
        </select>
      </div>
      <div className={styles.voteRow}>
        <label htmlFor="stats-minutes">Durée de la partie</label>
        <select
          id="stats-minutes"
          className={styles.select}
          value={minutes}
          onChange={(event) => setMinutes(event.target.value ? Number(event.target.value) : '')}
        >
          <option value="">— Choisis —</option>
          {MINUTES.map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
      </div>

      {teams.map((team, index) => {
        const members = membersOf(teamOf, team);
        const problem = problems[index];
        return (
          <div key={team} className={styles.statsTeam}>
            <h4>{size === 5 ? 'Ton équipe' : TEAM_NAMES[team]}</h4>
            {STAT_KEYS.map((key) => (
              <fieldset key={key} className={styles.question}>
                <legend>{STAT_LABELS[key]}</legend>
                <div className={styles.choices}>
                  {members.map((id) => (
                    <label key={id} className={styles.choice}>
                      <input
                        type="checkbox"
                        className={styles.check}
                        checked={answers[team]?.[key].includes(id) ?? false}
                        onChange={() => toggle(team, key, id)}
                      />
                      {nameOf(room, id)}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            {problem === 'STATS_INCOMPLETE' && (
              <p className={styles.hint}>{STATS_ERROR_MESSAGES[problem]}</p>
            )}
            {problem && problem !== 'STATS_INCOMPLETE' && (
              <p className="error" role="alert">
                {STATS_ERROR_MESSAGES[problem]}
              </p>
            )}
          </div>
        );
      })}

      <div className={styles.actions}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!valid}
          onClick={() => setConfirming(true)}
        >
          {sent ? 'Mettre à jour les statistiques' : 'Afficher les statistiques à tous'}
        </button>
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Annuler
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {confirming && (
        <ConfirmDialog
          title="Envoyer les statistiques ?"
          message={
            sent
              ? 'Tout le monde verra les statistiques corrigées.'
              : 'Elles seront affichées à tout le monde, et le vote commencera.'
          }
          confirmLabel="Envoyer"
          onConfirm={() => void send()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </section>
  );
}
