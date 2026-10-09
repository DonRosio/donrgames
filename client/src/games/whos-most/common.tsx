import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { MediaRef } from '@mini-jeux/shared';
import type { Head, WhosMostContract, WhosMostView } from '@mini-jeux/shared/games/whos-most';
import type { GameScreenProps } from '../../core/game-host/client-game.ts';
import { Brush } from './Brush.tsx';
import { floatStyle, questionSeed } from './layout.ts';
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

/** "0 vote", "1 vote", "3 votes". */
export function votesLabel(votes: number): string {
  return `${votes} vote${votes > 1 ? 's' : ''}`;
}

/**
 * A head in its frame (a thick dark outline, a light ring, a coloured inside), with the nickname
 * on the top edge. The frame floats very slightly, each one at its own pace. A player without a
 * picture shows their initial.
 */
export function HeadFrame({
  playerId,
  name,
  src,
  state,
  size = 128,
  tilt = 0,
  children,
}: {
  playerId: string;
  name: string;
  src: string | null;
  /** 'chosen': highlighted (selected, or most voted). 'dim': set aside. */
  state?: 'chosen' | 'dim' | undefined;
  /** Width of the frame, in px. */
  size?: number;
  /** Rotation, in degrees. */
  tilt?: number;
  /** Shown under the frame (the number of votes…). */
  children?: ReactNode;
}) {
  // Long nicknames get smaller letters, to stay on the edge of the frame.
  const length = [...name].length;
  const style = {
    '--size': `${size}px`,
    '--tilt': `${tilt}deg`,
    '--name-scale': Math.min(1, 7 / Math.max(length, 1)).toFixed(2),
    ...floatStyle(playerId),
  } as CSSProperties;
  return (
    // Spans only: the frame also sits inside a button (the ballot).
    <span className={`${styles.head} ${state ? styles[state] : ''}`} style={style}>
      <span className={styles.frame}>
        <span className={styles.picture}>
          {src ? (
            <img src={src} alt="" draggable={false} />
          ) : (
            <span className={styles.initial} aria-hidden="true">
              {[...name][0]?.toUpperCase()}
            </span>
          )}
        </span>
        <span className={styles.name}>{name}</span>
      </span>
      {children}
    </span>
  );
}

/** "Qui est le +" (script) over the adjective (rounded), on a brush. */
export function QuestionTitle({ question }: { question: string }) {
  return (
    <h2 className={styles.question}>
      <Brush size="title" seed={Math.abs(questionSeed(question, 0)) % 997}>
        <span className={styles.lead}>Qui est le +</span>
        <span className={styles.adjective}>{question}</span>
      </Brush>
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
