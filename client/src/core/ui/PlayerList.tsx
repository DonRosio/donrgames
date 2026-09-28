import type { PlayerView } from '@mini-jeux/shared';
import styles from './PlayerList.module.css';

interface PlayerListProps {
  players: PlayerView[];
  me: string;
  /** Host-only actions on the other players; omitted for regular players. */
  onMakeHost?: (player: PlayerView) => void;
  onKick?: (player: PlayerView) => void;
}

export function PlayerList({ players, me, onMakeHost, onKick }: PlayerListProps) {
  return (
    <ul className={styles.list}>
      {players.map((player) => (
        <li key={player.id} className={player.connected ? styles.player : styles.offline}>
          <span
            className={player.connected ? styles.dotOnline : styles.dotOffline}
            aria-hidden="true"
          />
          <span className={styles.name}>{player.nickname}</span>
          {player.id === me && <span className={styles.badge}>toi</span>}
          {player.isHost && <span className={styles.hostBadge}>hôte</span>}
          {!player.connected && <span className="muted">déconnecté</span>}
          {player.id !== me && (onMakeHost || onKick) && (
            <span className={styles.actions}>
              {onMakeHost && (
                <button type="button" className="btn btn-small" onClick={() => onMakeHost(player)}>
                  Nommer hôte
                </button>
              )}
              {onKick && (
                <button
                  type="button"
                  className="btn btn-small btn-danger"
                  onClick={() => onKick(player)}
                >
                  Retirer
                </button>
              )}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
