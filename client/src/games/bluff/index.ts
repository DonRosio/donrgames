import type { BluffContract, BluffView } from '@mini-jeux/shared/games/bluff';
import { defineClientGame } from '../../core/game-host/client-game.ts';
import { RevealScreen } from './RevealScreen.tsx';
import { VotingScreen } from './VotingScreen.tsx';
import { WritingScreen } from './WritingScreen.tsx';

export const bluffClient = defineClientGame<BluffContract, BluffView>({
  id: 'bluff',
  screens: {
    writing: WritingScreen,
    voting: VotingScreen,
    reveal: RevealScreen,
  },
  errorMessages: {
    ANSWER_INVALID: 'Réponse invalide : de 1 à 60 caractères, sans caractères cachés.',
    ANSWER_IS_REAL: 'Trop proche de la vraie réponse ! Invente-en une autre.',
    ALREADY_ANSWERED: 'Tu as déjà répondu.',
    ALREADY_VOTED: 'Tu as déjà voté.',
    BAD_OPTION: 'Tu ne peux pas voter pour cette réponse.',
  },
});
