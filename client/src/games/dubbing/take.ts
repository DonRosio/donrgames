import { useEffect, useState } from 'react';
import type { MediaRef } from '@mini-jeux/shared';
import { audioContext } from '../../core/media/audio.ts';
import { errorMessage } from '../../core/session/errors.ts';

// Only the take being presented is kept (decoded), and dropped for the next one.
let cached: { id: string; buffer: Promise<AudioBuffer> } | null = null;

function loadTake(id: string, fetchMedia: (ref: MediaRef) => Promise<Blob>): Promise<AudioBuffer> {
  if (cached?.id !== id) {
    const buffer = fetchMedia({ kind: 'media', id })
      .then((blob) => blob.arrayBuffer())
      .then((data) => audioContext().decodeAudioData(data));
    buffer.catch(() => {
      if (cached?.id === id) cached = null;
    });
    cached = { id, buffer };
  }
  return cached.buffer;
}

/** Decoded audio of a take, downloaded once the server lets this player hear it. */
export function useTake(
  mediaId: string,
  fetchMedia: (ref: MediaRef) => Promise<Blob>,
): { buffer: AudioBuffer | null; error: string | null } {
  const [state, setState] = useState<{ buffer: AudioBuffer | null; error: string | null }>({
    buffer: null,
    error: null,
  });
  useEffect(() => {
    let alive = true;
    loadTake(mediaId, fetchMedia).then(
      (buffer) => alive && setState({ buffer, error: null }),
      (error: unknown) => alive && setState({ buffer: null, error: errorMessage(error) }),
    );
    return () => {
      alive = false;
    };
  }, [mediaId, fetchMedia]);
  return state;
}
