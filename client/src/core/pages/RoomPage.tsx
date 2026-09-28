import { useEffect, useState, useSyncExternalStore } from 'react';
import type { PlayerView, RoomView } from '@mini-jeux/shared';
import { navigate, setFlash } from '../../app/router.ts';
import { END_MESSAGES, errorMessage } from '../session/errors.ts';
import { Session } from '../session/session.ts';
import { sessionStore } from '../session/storage.ts';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { ConnectionBanner } from '../ui/ConnectionBanner.tsx';
import { PlayerList } from '../ui/PlayerList.tsx';
import styles from './RoomPage.module.css';

export function RoomPage({ code }: { code: string }) {
  const [stored] = useState(() => {
    const session = sessionStore.load();
    return session?.code === code ? session : null;
  });

  useEffect(() => {
    // Without a session for this room (shared /room link, other tab…), go through the join form.
    if (!stored) navigate(`/join/${code}`, { replace: true });
  }, [stored, code]);

  return stored ? <ConnectedRoom token={stored.token} /> : null;
}

function ConnectedRoom({ token }: { token: string }) {
  const [session] = useState(() => new Session(token));
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);

  useEffect(() => {
    session.start();
    return () => session.stop();
  }, [session]);

  const { status, endReason, room } = snapshot;

  useEffect(() => {
    if (status !== 'ended' || endReason === null || endReason === 'replaced') return;
    sessionStore.clear();
    setFlash(END_MESSAGES[endReason]);
    navigate('/', { replace: true });
  }, [status, endReason]);

  useEffect(() => {
    if (room) document.title = `Salon ${room.code} · Mini-jeux`;
  }, [room]);

  if (endReason === 'replaced') {
    return (
      <main className={`card ${styles.center}`}>
        <h1>Salon ouvert ailleurs</h1>
        <p className="muted">Ce salon vient d'être ouvert dans un autre onglet avec ta session.</p>
        <button type="button" className="btn btn-primary" onClick={() => session.resume()}>
          Reprendre ici
        </button>
      </main>
    );
  }

  if (!room) {
    return (
      <main className={styles.center}>
        <ConnectionBanner status={status} />
        <p className="muted" role="status">
          Connexion au salon…
        </p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <ConnectionBanner status={status} />
      <Lobby room={room} session={session} />
    </main>
  );
}

type PendingAction =
  { kind: 'kick' | 'makeHost'; player: PlayerView } | { kind: 'leave' | 'close' };

function Lobby({ room, session }: { room: RoomView; session: Session }) {
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const isHost = room.hostId === room.me;
  const joinLink = `${location.origin}/join/${room.code}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(joinLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copie impossible : sélectionne le lien à la main.');
    }
  };

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
            onFocus={(e) => e.target.select()}
          />
          <button type="button" className="btn btn-primary" onClick={() => void copyLink()}>
            {copied ? 'Lien copié !' : 'Copier le lien'}
          </button>
        </div>
      </header>

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
          <p className="muted">Aucun jeu disponible pour l'instant.</p>
          {!isHost && <p className="muted">L'hôte choisira le jeu et lancera la partie.</p>}
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
