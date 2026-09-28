import { SyncedVideoPlayer } from '../../core/ui/SyncedVideoPlayer.tsx';
import { RoundHeader } from './common.tsx';
import type { ScreenProps } from './common.tsx';
import { useVideoUrl } from './video.ts';
import styles from './dubbing.module.css';

export function BroadcastScreen({ view, fetchMedia }: ScreenProps<'broadcast'>) {
  const { url, error } = useVideoUrl(view.video.contentId, fetchMedia);

  return (
    <section className={styles.screen}>
      <RoundHeader round={view.round} rounds={view.rounds} step="Diffusion" />
      <p className={styles.hint}>Regarde bien : tu vas devoir la doubler !</p>
      {url ? (
        <SyncedVideoPlayer src={url} startAt={view.startAt} />
      ) : (
        <p className="muted">{error ?? 'Chargement de la vidéo…'}</p>
      )}
    </section>
  );
}
