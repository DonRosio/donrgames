import { useEffect, useState, useSyncExternalStore } from 'react';
import type { GameInfo } from '@mini-jeux/shared';
import { navigate, setFlash } from '../../app/router.ts';
import { GameView } from '../game-host/GameView.tsx';
import { ResultsView } from '../game-host/ResultsView.tsx';
import { api } from '../session/api.ts';
import { SessionContext } from '../session/context.ts';
import { END_MESSAGES } from '../session/errors.ts';
import { Session } from '../session/session.ts';
import { sessionStore } from '../session/storage.ts';
import { ConnectionBanner } from '../ui/ConnectionBanner.tsx';
import { Lobby, RoomHeader } from './Lobby.tsx';
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
  const [catalog, setCatalog] = useState<GameInfo[] | null>(null);

  useEffect(() => {
    session.start();
    return () => session.stop();
  }, [session]);

  useEffect(() => {
    api.games().then(setCatalog, () => setCatalog([]));
  }, []);

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

  const me = room.players.find((player) => player.id === room.me);
  return (
    <SessionContext value={session}>
      <main className={styles.page}>
        <ConnectionBanner status={status} />
        {room.status === 'lobby' && <Lobby room={room} session={session} catalog={catalog} />}
        {room.status === 'playing' &&
          (me?.role === 'waiting' ? (
            <>
              <RoomHeader room={room} />
              <p className={`card ${styles.waiting}`}>
                Une partie est en cours. Tu joueras à la prochaine !
              </p>
            </>
          ) : (
            <GameView room={room} envelope={snapshot.game} session={session} />
          ))}
        {room.status === 'results' && (
          <ResultsView room={room} catalog={catalog} session={session} />
        )}
      </main>
    </SessionContext>
  );
}
