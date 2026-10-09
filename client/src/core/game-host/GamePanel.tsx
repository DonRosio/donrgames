import { useState } from 'react';
import { playerCountLabel } from '@mini-jeux/shared';
import type { GameInfo, RoomView, SettingValue } from '@mini-jeux/shared';
import { clientGames } from '../../games/registry.ts';
import { errorMessage } from '../session/errors.ts';
import type { Session } from '../session/session.ts';
import { SettingsForm } from './SettingsForm.tsx';
import styles from './GamePanel.module.css';

const UNAVAILABLE: Record<string, (info: GameInfo) => string> = {
  NOT_ENOUGH_PLAYERS: (info) => `Il faut au moins ${info.meta.minPlayers} joueurs connectés.`,
  TOO_MANY_PLAYERS: (info) => `Ce jeu accepte au plus ${info.meta.maxPlayers} joueurs.`,
  WRONG_PLAYER_COUNT: (info) =>
    `Ce jeu se joue à exactement ${playerCountLabel(info.meta)} connectés.`,
  NO_CONTENT_LEFT: (info) =>
    `Toutes les ${info.meta.contentUnit ?? 'vidéo'}s ont déjà été jouées dans ce salon. Ajoute-en dans selection.txt et redémarre le serveur.`,
};

interface GamePanelProps {
  room: RoomView;
  catalog: GameInfo[] | null;
  session: Session;
}

/** What the lobby needs to know about the game of the room. */
function gameOf(room: RoomView, catalog: GameInfo[] | null) {
  const selected = room.selectedGame;
  const info = catalog?.find((game) => game.meta.id === selected?.id);
  const availability = room.games.find((game) => game.id === selected?.id);
  const clientGame = clientGames.find((game) => game.id === selected?.id);
  return { selected, info, availability, clientGame };
}

/** Title of the lobby card: the game name when the game presents itself elsewhere, else "Jeu". */
export function gameCardTitle(room: RoomView, catalog: GameInfo[] | null): string {
  const { info, clientGame } = gameOf(room, catalog);
  return clientGame?.lobbyPanel && info ? info.meta.name : 'Jeu';
}

/**
 * Lobby card of the game of the room (chosen when the room was created): its settings and the
 * launch button, for the host. A game with a `lobbyPanel` shows its description in that panel,
 * so its card is limited to the settings.
 */
export function GamePanel({ room, catalog, session }: GamePanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const isHost = room.hostId === room.me;

  if (room.games.length === 0) {
    return <p className="muted">Aucun jeu disponible pour l'instant.</p>;
  }
  if (!catalog) return <p className="muted">Chargement des jeux…</p>;

  const run = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (failure) {
      setError(errorMessage(failure));
    }
  };

  const { selected, info, availability, clientGame } = gameOf(room, catalog);
  // A game the server knows but this client version does not (should never happen once deployed).
  const playable = clientGame !== undefined;
  const compact = clientGame?.lobbyPanel !== undefined;

  return (
    <div className={styles.panel}>
      {info && selected && (
        <>
          {!compact && (
            <div>
              <h3 className={styles.name}>
                {info.meta.name}
                {!info.meta.replayable && <span className={styles.badge}>à usage unique</span>}
              </h3>
              <p className="muted">{info.meta.description}</p>
              <p className={styles.content}>{playerCountLabel(info.meta)}</p>
              {availability?.content && (
                <p className={styles.content}>
                  {availability.content.left} {info.meta.contentUnit ?? 'vidéo'}
                  {availability.content.left > 1 ? 's' : ''} pas encore jouée
                  {availability.content.left > 1 ? 's' : ''} dans ce salon
                </p>
              )}
            </div>
          )}
          <SettingsForm
            defs={info.settings}
            values={selected.settings}
            limits={selected.limits}
            editable={isHost}
            onChange={(patch: Record<string, SettingValue>) =>
              void run(() => session.setSettings(patch))
            }
          />
          {availability && !availability.launchable && availability.reason && (
            <p className={styles.warning}>{UNAVAILABLE[availability.reason]?.(info)}</p>
          )}
          {!playable && (
            <p className={styles.warning}>
              Ce jeu n'est pas disponible dans cette version du site.
            </p>
          )}
          {isHost ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!availability?.launchable || !playable || starting}
              onClick={() => {
                setStarting(true);
                void run(() => session.startGame()).finally(() => setStarting(false));
              }}
            >
              Lancer la partie
            </button>
          ) : (
            <p className="muted">L'hôte lancera la partie.</p>
          )}
        </>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Full-width area under the lobby columns, provided by the game (rules, roles…). */
export function GameExtras({ room, catalog }: Pick<GamePanelProps, 'room' | 'catalog'>) {
  const { selected, info, clientGame } = gameOf(room, catalog);
  const Panel = clientGame?.lobbyPanel;
  if (!Panel || !info || !selected) return null;
  return <Panel info={info} settings={selected.settings} />;
}
