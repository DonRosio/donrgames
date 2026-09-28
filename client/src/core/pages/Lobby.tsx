import { useState } from 'react';
import type { GameInfo, PlayerView, RoomView } from '@mini-jeux/shared';
import { navigate } from '../../app/router.ts';
import { GamePanel } from '../game-host/GamePanel.tsx';
import { errorMessage } from '../session/errors.ts';
import type { Session } from '../session/session.ts';
import { sessionStore } from '../session/storage.ts';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { PlayerList } from '../ui/PlayerList.tsx';
import styles from './RoomPage.module.css';

type PendingAction =
  { kind: 'kick' | 'makeHost'; player: PlayerView } | { kind: 'leave' | 'close' };

export function Lobby(props: { room: RoomView; session: Session; catalog: GameInfo[] | null }) {
  const { room, session, catalog } = props;
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isHost = room.hostId === room.me;

  const run = async (action: PendingAction) => {
    setPending(null);
    setError(null);
    try {
      if (action.kind === 'kick') await session.kick(action.player.id);
      if (action.kind === 'makeHost') await session.transferHost(action.player.id);
      if (action.kind === 'close') await session.closeRoom();
      if (action.kind === 'leave') {
        await session.leave();
        sessionStore.clear();
        navigate('/', { replace: true });
      }
    } catch (failure) {
      setError(errorMessage(failure));
    }
  };

  return (
    <>
      <RoomHeader room={room} />

      <div className={styles.columns}>
        <section className="card">
          <h2 className={styles.title}>
            Joueurs ({room.players.length}/{room.maxPlayers})
          </h2>
          <PlayerList
            players={room.players}
            me={room.me}
            onMakeHost={isHost ? (player) => setPending({ kind: 'makeHost', player }) : undefined}
            onKick={isHost ? (player) => setPending({ kind: 'kick', player }) : undefined}
          />
        </section>

        <section className="card">
          <h2 className={styles.title}>Jeu</h2>
          <GamePanel room={room} catalog={catalog} session={session} />
        </section>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <footer className={styles.footer}>
        <button type="button" className="btn" onClick={() => setPending({ kind: 'leave' })}>
          Quitter le salon
        </button>
        {isHost && (
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => setPending({ kind: 'close' })}
          >
            Fermer le salon
          </button>
        )}
      </footer>

      {pending && (
        <ConfirmDialog
          {...confirmation(pending)}
          onConfirm={() => void run(pending)}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );
}

function confirmation(action: PendingAction) {
  switch (action.kind) {
    case 'kick':
      return {
        title: `Retirer ${action.player.nickname} ?`,
        message: 'Ce joueur quittera le salon. Il pourra revenir avec le code.',
        confirmLabel: 'Retirer',
        danger: true,
      };
    case 'makeHost':
      return {
        title: `Nommer ${action.player.nickname} hôte ?`,
        message:
          "Tu ne pourras plus choisir les jeux ni gérer le salon, sauf s'il te rend le rôle.",
        confirmLabel: 'Nommer hôte',
      };
    case 'leave':
      return {
        title: 'Quitter le salon ?',
        message: 'Pour revenir, il faudra rejoindre à nouveau avec le code.',
        confirmLabel: 'Quitter',
      };
    case 'close':
      return {
        title: 'Fermer le salon ?',
        message: 'Tous les joueurs seront renvoyés à l’accueil. Cette action est définitive.',
        confirmLabel: 'Fermer le salon',
        danger: true,
      };
  }
}

/** Room code and invitation link. */
export function RoomHeader({ room }: { room: RoomView }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const joinLink = `${location.origin}/join/${room.code}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(joinLink);
      setError(null);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copie impossible : sélectionne le lien à la main.');
    }
  };

  return (
    <header className={`card ${styles.header}`}>
      <div>
        <p className="muted">Code de la partie</p>
        <p className={styles.code} aria-label={`Code ${room.code.split('').join(' ')}`}>
          {room.code}
        </p>
      </div>
      <div className={styles.share}>
        <input
          value={joinLink}
          readOnly
          aria-label="Lien d'invitation"
          onFocus={(event) => event.target.select()}
        />
        <button type="button" className="btn btn-primary" onClick={() => void copyLink()}>
          {copied ? 'Lien copié !' : 'Copier le lien'}
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </header>
  );
}
