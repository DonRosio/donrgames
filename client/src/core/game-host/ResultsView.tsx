import { useState } from 'react';
import type { GameInfo, RoomView } from '@mini-jeux/shared';
import { errorMessage } from '../session/errors.ts';
import type { Session } from '../session/session.ts';
import { RankingScreen } from '../ui/RankingScreen.tsx';

/** Final ranking of the game that just ended; the host brings everyone back to the lobby. */
export function ResultsView(props: {
  room: RoomView;
  catalog: GameInfo[] | null;
  session: Session;
}) {
  const { room, catalog, session } = props;
  const [error, setError] = useState<string | null>(null);
  if (!room.results) return null;
  const name = catalog?.find((game) => game.meta.id === room.results?.gameId)?.meta.name;
  const isHost = room.hostId === room.me;

  return (
    <RankingScreen
      title={name ? `Classement final · ${name}` : 'Classement final'}
      ranking={room.results.ranking}
      me={room.me}
    >
      {isHost ? (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setError(null);
            session.dismissResults().catch((failure: unknown) => setError(errorMessage(failure)));
          }}
        >
          Retour au salon
        </button>
      ) : (
        <p className="muted">L'hôte va ramener tout le monde au salon.</p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </RankingScreen>
  );
}
