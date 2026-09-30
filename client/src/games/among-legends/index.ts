import type { AmongLegendsContract, AmongLegendsView } from '@mini-jeux/shared/games/among-legends';
import { defineClientGame } from '../../core/game-host/client-game.ts';
import { BriefingScreen } from './BriefingScreen.tsx';
import { PlayingScreen } from './PlayingScreen.tsx';
import { ResultsScreen } from './ResultsScreen.tsx';
import { StatsScreen } from './StatsScreen.tsx';
import { VotingScreen } from './VotingScreen.tsx';
import { STATS_ERROR_MESSAGES } from './common.tsx';
import { LobbyPanel } from './LobbyPanel.tsx';
import { TeamsScreen } from './TeamsScreen.tsx';

export const amongLegendsClient = defineClientGame<AmongLegendsContract, AmongLegendsView>({
  id: 'among-legends',
  screens: {
    teams: TeamsScreen,
    briefing: BriefingScreen,
    playing: PlayingScreen,
    stats: StatsScreen,
    voting: VotingScreen,
    results: ResultsScreen,
  },
  lobbyPanel: LobbyPanel,
  errorMessages: {
    TEAM_FULL: 'Cette équipe a déjà 5 joueurs.',
    TEAMS_INCOMPLETE: 'Il faut exactement 5 joueurs dans chaque équipe.',
    ...STATS_ERROR_MESSAGES,
    ALREADY_VOTED: 'Tu as déjà voté.',
    BAD_VOTE: 'Ton vote est incomplet ou invalide.',
    VOTES_MISSING:
      'Tout le monde n’a pas encore voté. « Passer à la suite » affiche les résultats quand même.',
  },
});
