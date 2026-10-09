import type { WhosMostContract, WhosMostView } from '@mini-jeux/shared/games/whos-most';
import { defineClientGame } from '../../core/game-host/client-game.ts';
import { PhotosScreen } from './PhotosScreen.tsx';
import { RevealScreen } from './RevealScreen.tsx';
import { VotingScreen } from './VotingScreen.tsx';

export const whosMostClient = defineClientGame<WhosMostContract, WhosMostView>({
  id: 'whos-most',
  screens: { photos: PhotosScreen, voting: VotingScreen, reveal: RevealScreen },
  errorMessages: {
    PHOTOS_MISSING:
      'Tout le monde n’a pas encore envoyé sa photo. « Passer à la suite » lance quand même.',
    UNKNOWN_TARGET: 'Ce joueur n’est plus dans la partie.',
    ALREADY_VOTED: 'Tu as déjà voté pour cette question.',
    VOTES_MISSING:
      'Tout le monde n’a pas encore voté. « Passer à la suite » affiche les résultats quand même.',
  },
});
