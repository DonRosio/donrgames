import type { RoomView } from '@mini-jeux/shared';
import type { AmongLegendsContract, AmongLegendsView } from '@mini-jeux/shared/games/among-legends';
import { COMMON_POINTS, ROLES, TEAM_NAMES } from '@mini-jeux/shared/games/among-legends-roles';
import type { RoleId, Team } from '@mini-jeux/shared/games/among-legends-roles';
import type { StatsError } from '@mini-jeux/shared/games/among-legends-scoring';
import type { GameScreenProps } from '../../core/game-host/client-game.ts';
import { pictureOf } from './role-pictures.ts';
import styles from './among-legends.module.css';

export type ScreenProps<P extends AmongLegendsView['phase']> = GameScreenProps<
  AmongLegendsContract,
  Extract<AmongLegendsView, { phase: P }>
>;

export const nameOf = (room: RoomView, id: string) =>
  room.players.find((player) => player.id === id)?.nickname ?? '?';

/** "7:05", or "1:02:03" past an hour. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** A role with its mission and its picture on the right, and, unless compact, how it scores. */
export function RoleCard({ role, compact = false }: { role: RoleId; compact?: boolean }) {
  const info = ROLES[role];
  const picture = pictureOf(role);
  return (
    <article className={`card ${styles.roleCard}`}>
      <div className={styles.roleCardRow}>
        <div className={styles.roleCardText}>
          <p className={styles.roleLabel}>Ton rôle</p>
          <h2 className={styles.roleName}>{info.name}</h2>
          <p className={styles.goal}>{info.goal}</p>
          {!compact && (
            <>
              <h3 className={styles.pointsTitle}>Tes points</h3>
              <ul className={styles.points}>
                {info.points.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <h3 className={styles.pointsTitle}>Pour tout le monde</h3>
              <ul className={styles.points}>
                {COMMON_POINTS.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          )}
        </div>
        {picture && (
          <img
            className={compact ? styles.roleCardPictureSmall : styles.roleCardPicture}
            src={picture}
            alt={info.name}
            draggable={false}
          />
        )}
      </div>
    </article>
  );
}

/** Who plays in which team (public information). */
export function Teams({
  teams,
  room,
  size,
}: {
  teams: Record<string, Team>;
  room: RoomView;
  size: 5 | 10;
}) {
  const members = (team: Team) =>
    Object.entries(teams)
      .filter(([, t]) => t === team)
      .map(([id]) => id);
  const shown: Team[] = size === 5 ? ['blue'] : ['blue', 'red'];
  return (
    <div className={styles.teams}>
      {shown.map((team) => (
        <section key={team} className={`card ${styles.team} ${styles[team]}`}>
          <h3>{size === 5 ? 'Ton équipe' : TEAM_NAMES[team]}</h3>
          <ul>
            {members(team).map((id) => (
              <li key={id} className={id === room.me ? styles.me : undefined}>
                {nameOf(room, id)}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Rule errors of the end-of-game form, told the same way by the server and by the form itself. */
export const STATS_ERROR_MESSAGES: Record<StatsError, string> = {
  STATS_INVALID: 'Ces réponses ne correspondent pas aux joueurs de l’équipe.',
  STATS_INCOMPLETE: 'Chaque question demande au moins un joueur (sauf « 0 kill »).',
  STATS_ZERO_KILLS: 'Les joueurs à 0 kill doivent être exactement ceux qui ont le moins de kills.',
  STATS_OVERLAP:
    'Le « plus » et le « moins » ne peuvent pas nommer le même joueur, sauf si toute l’équipe est à égalité.',
};

/** Players of a team, in the order of the room. */
export const membersOf = (teams: Record<string, Team | null>, team: Team): string[] =>
  Object.entries(teams)
    .filter(([, t]) => t === team)
    .map(([id]) => id);

/** Teams that play: the single one with five players, both with ten. */
export const teamsOf = (size: 5 | 10): Team[] => (size === 5 ? ['blue'] : ['blue', 'red']);
