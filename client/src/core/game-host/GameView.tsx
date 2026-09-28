import { useCallback, useState } from 'react';
import type { GameViewEnvelope, MediaRef, RoomView } from '@mini-jeux/shared';
import { isErrorCode } from '@mini-jeux/shared';
import { clientGames } from '../../games/registry.ts';
import { codeMessage, errorMessage } from '../session/errors.ts';
import type { Session } from '../session/session.ts';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import type { ActResult, AnyClientGame } from './client-game.ts';
import styles from './GameView.module.css';

interface GameViewProps {
  room: RoomView;
  envelope: GameViewEnvelope | null;
  session: Session;
}

/** Shows the screen of the current phase of the running game, plus the host controls. */
export function GameView({ room, envelope, session }: GameViewProps) {
  const game = clientGames.find((candidate) => candidate.id === envelope?.gameId);
  const me = room.players.find((player) => player.id === room.me);
  const isHost = room.hostId === room.me;

  const act = useCallback(
    async (type: string, payload: unknown): Promise<ActResult> => {
      try {
        const result = await session.act(type, payload);
        return result.ok ? { ok: true } : { ok: false, message: messageOf(result.code, game) };
      } catch (failure) {
        return { ok: false, message: errorMessage(failure) };
      }
    },
    [session, game],
  );

  const upload = useCallback(
    async (kind: string, file: Blob, meta: unknown): Promise<ActResult> => {
      try {
        const result = await session.upload(kind, file, meta);
        return result.ok ? { ok: true } : { ok: false, message: messageOf(result.code, game) };
      } catch (failure) {
        return { ok: false, message: errorMessage(failure) };
      }
    },
    [session, game],
  );
  const fetchMedia = useCallback((ref: MediaRef) => session.fetchMedia(ref), [session]);
  const serverNow = useCallback(() => session.serverNow(), [session]);

  if (!envelope || !me) {
    return (
      <p className="muted" role="status">
        Chargement de la partie…
      </p>
    );
  }
  if (!game) {
    return <p className="error">Ce jeu n'est pas disponible dans cette version du site.</p>;
  }

  const phase = (envelope.view as { phase: string }).phase;
  const Screen = (game.screens as Record<string, AnyClientGame['screens'][string]>)[phase];

  return (
    <div className={styles.view}>
      {isHost && <HostBar session={session} />}
      {Screen ? (
        <Screen
          view={envelope.view}
          room={room}
          me={me}
          isHost={isHost}
          act={act}
          upload={upload}
          fetchMedia={fetchMedia}
          serverNow={serverNow}
        />
      ) : (
        <p className="error">Écran manquant pour la phase « {phase} ».</p>
      )}
    </div>
  );
}

function messageOf(code: string, game: AnyClientGame | undefined): string {
  if (isErrorCode(code)) return codeMessage(code);
  return (
    (game?.errorMessages as Record<string, string> | undefined)?.[code] ?? codeMessage('INTERNAL')
  );
}

/** Host controls available during the whole game. */
function HostBar({ session }: { session: Session }) {
  const [pending, setPending] = useState<'skip' | 'abort' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    const action = pending;
    setPending(null);
    setError(null);
    try {
      if (action === 'skip') await session.skipPhase();
      if (action === 'abort') await session.abortGame();
    } catch (failure) {
      setError(errorMessage(failure));
    }
  };

  return (
    <div className={styles.hostBar}>
      <span className="muted">Tu es l'hôte</span>
      <button type="button" className="btn btn-small" onClick={() => setPending('skip')}>
        Passer à la suite
      </button>
      <button
        type="button"
        className="btn btn-small btn-danger"
        onClick={() => setPending('abort')}
      >
        Arrêter la partie
      </button>
      {error && (
        <span className="error" role="alert">
          {error}
        </span>
      )}
      {pending === 'skip' && (
        <ConfirmDialog
          title="Passer à la suite ?"
          message="Les joueurs qui n'ont pas encore fini ne seront plus attendus pour cette étape."
          confirmLabel="Passer à la suite"
          onConfirm={() => void confirm()}
          onCancel={() => setPending(null)}
        />
      )}
      {pending === 'abort' && (
        <ConfirmDialog
          title="Arrêter la partie ?"
          message="La partie s'arrête sans classement et tout le monde revient au salon."
          confirmLabel="Arrêter la partie"
          danger
          onConfirm={() => void confirm()}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
