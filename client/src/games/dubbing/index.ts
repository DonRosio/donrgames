import type { DubbingContract, DubbingView } from '@mini-jeux/shared/games/dubbing';
import { defineClientGame } from '../../core/game-host/client-game.ts';
import { BroadcastScreen } from './BroadcastScreen.tsx';
import { LoadingScreen } from './LoadingScreen.tsx';
import { RecordingScreen } from './RecordingScreen.tsx';
import { RevealScreen } from './RevealScreen.tsx';
import { RoundResultsScreen } from './RoundResultsScreen.tsx';
import { TakeScreen } from './TakeScreen.tsx';
import { VotingScreen } from './VotingScreen.tsx';

export const dubbingClient = defineClientGame<DubbingContract, DubbingView>({
  id: 'dubbing',
  screens: {
    loading: LoadingScreen,
    broadcast: BroadcastScreen,
    recording: RecordingScreen,
    takeLoading: TakeScreen,
    takePlaying: TakeScreen,
    voting: VotingScreen,
    reveal: RevealScreen,
    roundResults: RoundResultsScreen,
  },
  errorMessages: {
    STALE_SYNC: 'Cette étape est déjà passée.',
    TAKE_LOCKED: 'Ta prise est déjà validée.',
    SELF_VOTE: 'Tu ne peux pas voter pour ta propre prise.',
    ALREADY_VOTED: 'Tu as déjà voté pour cette prise.',
    PLUS_TWO_USED: 'Tu as déjà utilisé ton +2 dans cette manche.',
  },
});
