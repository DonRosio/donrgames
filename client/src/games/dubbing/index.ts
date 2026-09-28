import type { DubbingContract, DubbingView } from '@mini-jeux/shared/games/dubbing';
import { defineClientGame } from '../../core/game-host/client-game.ts';
import { BroadcastScreen } from './BroadcastScreen.tsx';
import { LoadingScreen } from './LoadingScreen.tsx';
import { RecordingScreen } from './RecordingScreen.tsx';
import { RoundResultsScreen } from './RoundResultsScreen.tsx';

export const dubbingClient = defineClientGame<DubbingContract, DubbingView>({
  id: 'dubbing',
  screens: {
    loading: LoadingScreen,
    broadcast: BroadcastScreen,
    recording: RecordingScreen,
    roundResults: RoundResultsScreen,
  },
  errorMessages: {
    STALE_SYNC: 'Cette étape est déjà passée.',
    TAKE_LOCKED: 'Ta prise est déjà validée.',
  },
});
