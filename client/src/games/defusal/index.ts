import type { DefusalContract, DefusalView } from '@mini-jeux/shared/games/defusal';
import { defineClientGame } from '../../core/game-host/client-game.ts';
import { BriefingScreen } from './BriefingScreen.tsx';
import { DefusingScreen } from './DefusingScreen.tsx';
import { ResultScreen } from './ResultScreen.tsx';

export const defusalClient = defineClientGame<DefusalContract, DefusalView>({
  id: 'defusal',
  screens: {
    briefing: BriefingScreen,
    defusing: DefusingScreen,
    result: ResultScreen,
  },
  errorMessages: {
    NOT_DEFUSER: 'Seul le démineur peut toucher la bombe.',
    BAD_MODULE: 'Ce geste ne correspond pas à ce module.',
  },
});
