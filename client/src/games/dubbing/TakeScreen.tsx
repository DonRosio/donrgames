import { useEffect, useMemo } from 'react';
import { SyncedVideoPlayer } from '../../core/ui/SyncedVideoPlayer.tsx';
import { RoundHeader } from './common.tsx';
import type { ScreenProps } from './common.tsx';
import { useTake } from './take.ts';
import { useVideoUrl } from './video.ts';
import styles from './dubbing.module.css';

/** Presentation of one take: loaded by everyone, then played in sync over the muted video. */
export function TakeScreen({
  view,
  room,
  act,
  fetchMedia,
}: ScreenProps<'takeLoading' | 'takePlaying'>) {
  const video = useVideoUrl(view.video.contentId, fetchMedia);
  const take = useTake(view.take.mediaId, fetchMedia);
  const presenter = room.players.find((p) => p.id === view.presenter)?.nickname ?? '?';
  const loaded = video.url !== null && take.buffer !== null;

  useEffect(() => {
    if (view.phase === 'takeLoading' && loaded) void act('ready', { syncId: view.syncId });
  }, [view.phase, view.syncId, loaded, act]);

  const soundtrack = useMemo(
    () => (take.buffer ? { buffer: take.buffer, offsetMs: view.take.offsetMs } : null),
    [take.buffer, view.take.offsetMs],
  );

  return (
    <section className={styles.screen}>
      <RoundHeader
        round={view.round}
        rounds={view.rounds}
        step={`Prise ${view.index} / ${view.count}`}
      />
      <p className={styles.hint}>
        {view.presenter === room.me ? 'À toi ! Voici ta prise.' : `La prise de ${presenter}`}
      </p>
      {video.url && soundtrack ? (
        <SyncedVideoPlayer src={video.url} startAt={view.startAt} soundtrack={soundtrack} />
      ) : (
        <p className="muted">{video.error ?? take.error ?? 'Chargement de la prise…'}</p>
      )}
    </section>
  );
}
