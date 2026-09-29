import { useState } from 'react';
import type { ReactNode } from 'react';
import type { DubbingView } from '@mini-jeux/shared/games/dubbing';
import { RoundTransition } from '../../core/ui/RoundTransition.tsx';

/**
 * Stays mounted across the phases: when the round number goes up, the host announces the next
 * round behind a sweep of clouds. A page reloaded in the middle of a round shows nothing.
 */
export function RoundFrame({ view, children }: { view: DubbingView; children: ReactNode }) {
  const [seenRound, setSeenRound] = useState(view.round);
  const [transitioning, setTransitioning] = useState(false);
  if (view.round !== seenRound) {
    setSeenRound(view.round);
    if (view.round > seenRound) setTransitioning(true);
  }

  return (
    <>
      {children}
      {transitioning && (
        <RoundTransition
          text="Manche suivante !"
          // The clouds stay until the next video is loaded and about to start.
          hold={view.phase === 'loading'}
          onDone={() => setTransitioning(false)}
        />
      )}
    </>
  );
}
