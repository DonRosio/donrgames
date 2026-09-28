import { useEffect, useState } from 'react';
import type { MediaRef } from '@mini-jeux/shared';
import { errorMessage } from '../../core/session/errors.ts';

// Only the video of the current round is kept: loaded once, then reused by every phase.
const cache = new Map<string, Promise<string>>();

function loadVideo(id: string, fetchMedia: (ref: MediaRef) => Promise<Blob>): Promise<string> {
  let url = cache.get(id);
  if (!url) {
    for (const [key, previous] of cache) {
      cache.delete(key);
      previous.then(URL.revokeObjectURL, () => {});
    }
    url = fetchMedia({ kind: 'content', gameId: 'dubbing', id }).then((blob) =>
      URL.createObjectURL(blob),
    );
    url.catch(() => cache.delete(id));
    cache.set(id, url);
  }
  return url;
}

/** Object URL of a round video, fully downloaded before being used (no stall during playback). */
export function useVideoUrl(
  id: string,
  fetchMedia: (ref: MediaRef) => Promise<Blob>,
): { url: string | null; error: string | null; retry: () => void } {
  const [state, setState] = useState<{ url: string | null; error: string | null }>({
    url: null,
    error: null,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    loadVideo(id, fetchMedia).then(
      (url) => alive && setState({ url, error: null }),
      (error: unknown) => alive && setState({ url: null, error: errorMessage(error) }),
    );
    return () => {
      alive = false;
    };
  }, [id, fetchMedia, attempt]);

  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
