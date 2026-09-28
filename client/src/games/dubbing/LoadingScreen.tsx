import { useEffect } from 'react';
import { RoundHeader } from './common.tsx';
import type { ScreenProps } from './common.tsx';
import { useVideoUrl } from './video.ts';
import styles from './dubbing.module.css';

export function LoadingScreen({ view, room, act, fetchMedia }: ScreenProps<'loading'>) {
  const { url, error, retry } = useVideoUrl(view.video.contentId, fetchMedia);
  const players = room.players.filter((p) => p.connected && p.role === 'player').length;

  useEffect(() => {
    // Refused only if this step is already over: nothing to do then.
    if (url) void act('ready', { syncId: view.syncId });
  }, [url, view.syncId, act]);

  return (
    <section className={styles.screen}>
      <RoundHeader round={view.round} rounds={view.rounds} step="Chargement" />
      <div className={`card ${styles.center}`}>
        <p className={styles.big}>{url ? 'Vidéo prête !' : 'La vidéo se charge…'}</p>
        <p className="muted">
          Joueurs prêts : {view.ready.length} / {players}. Elle démarrera en même temps pour tout le
          monde.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}{' '}
            <button type="button" className="btn btn-small" onClick={retry}>
              Réessayer
            </button>
          </p>
        )}
      </div>
    </section>
  );
}
