import { useEffect, useState } from 'react';
import type { MediaRef } from '@mini-jeux/shared';
import type { Head, WhosMostContract, WhosMostView } from '@mini-jeux/shared/games/whos-most';
import type { GameScreenProps } from '../../core/game-host/client-game.ts';
import styles from './whos-most.module.css';

export type ScreenProps<P extends WhosMostView['phase']> = GameScreenProps<
  WhosMostContract,
  Extract<WhosMostView, { phase: P }>
>;

type FetchMedia = (ref: MediaRef) => Promise<Blob>;

// Pictures stay for the whole game (every phase shows them): downloaded once, then reused.
const cache = new Map<string, Promise<string>>();

/** Object URLs of the heads' pictures, by media id, as soon as they are downloaded. */
export function useHeadPictures(heads: Head[], fetchMedia: FetchMedia): Record<string, string> {
  const [loaded, setLoaded] = useState<Record<string, string>>({});
  const ids = heads
    .map((head) => head.mediaId)
    .filter((id): id is string => id !== null)
    .sort()
    .join(',');

  useEffect(() => {
    let alive = true;
    const wanted = new Set(ids.split(',').filter(Boolean));
    for (const [id, url] of cache) {
      if (wanted.has(id)) continue;
      cache.delete(id);
      url.then(URL.revokeObjectURL, () => {});
    }
    for (const id of wanted) {
      let url = cache.get(id);
      if (!url) {
        url = fetchMedia({ kind: 'media', id }).then((blob) => URL.createObjectURL(blob));
        url.catch(() => cache.delete(id));
        cache.set(id, url);
      }
      url.then(
        (value) =>
          alive &&
          setLoaded((current) => (current[id] === value ? current : { ...current, [id]: value })),
        () => {},
      );
    }
    return () => {
      alive = false;
    };
  }, [ids, fetchMedia]);

  return loaded;
}

/** A head in its frame, with the nickname above; a player without picture shows their initial. */
export function HeadFrame({
  name,
  src,
  state,
  children,
}: {
  name: string;
  src: string | null;
  /** 'chosen': highlighted (selected, or winner). 'dim': set aside. */
  state?: 'chosen' | 'dim';
  children?: React.ReactNode;
}) {
  return (
    <div className={`${styles.head} ${state ? styles[state] : ''}`}>
      <span className={styles.name}>{name}</span>
      <div className={styles.picture}>
        {src ? (
          <img src={src} alt="" draggable={false} />
        ) : (
          <span className={styles.initial} aria-hidden="true">
            {[...name][0]?.toUpperCase()}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

export function QuestionTitle({ question }: { question: string }) {
  return (
    <h2 className={styles.question}>
      <span>Qui est le +</span>
      <strong>{question}</strong>
    </h2>
  );
}

export function QuestionHeader({
  index,
  total,
  step,
}: {
  index: number;
  total: number;
  step: string;
}) {
  return (
    <header className={styles.header}>
      <span className={styles.counter}>
        Question {index} / {total}
      </span>
      <span className={styles.step}>{step}</span>
    </header>
  );
}
