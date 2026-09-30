import type { AmongLegendsContract, AmongLegendsView } from '@mini-jeux/shared/games/among-legends';
import { defineClientGame } from '../../core/game-host/client-game.ts';
import { BriefingScreen } from './BriefingScreen.tsx';
import { PlayingScreen } from './PlayingScreen.tsx';
import { RulesPanel } from './RulesPanel.tsx';
import { TeamsScreen } from './TeamsScreen.tsx';

export const amongLegendsClient = defineClientGame<AmongLegendsContract, AmongLegendsView>({
  id: 'among-legends',
  screens: {
    teams: TeamsScreen,
    briefing: BriefingScreen,
    playing: PlayingScreen,
  },
  lobbyPanel: RulesPanel,
  errorMessages: {
    TEAM_FULL: 'Cette équipe a déjà 5 joueurs.',
    TEAMS_INCOMPLETE: 'Il faut exactement 5 joueurs dans chaque équipe.',
  },
});
