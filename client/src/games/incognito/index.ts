import type { IncognitoContract, IncognitoView } from '@mini-jeux/shared/games/incognito';
import { defineClientGame } from '../../core/game-host/client-game.ts';
import { ChatScreen } from './ChatScreen.tsx';
import { MatchingScreen } from './MatchingScreen.tsx';
import { RevealScreen } from './RevealScreen.tsx';

export const incognitoClient = defineClientGame<IncognitoContract, IncognitoView>({
  id: 'incognito',
  screens: { chat: ChatScreen, matching: MatchingScreen, reveal: RevealScreen },
  errorMessages: {
    STALE_QUESTION: 'Cette question est déjà passée. Réponds à la question en cours.',
    ALREADY_ANSWERED: 'Tu as déjà répondu à cette question.',
    UNKNOWN_ALIAS: 'Ce prénom n’existe pas dans cette partie.',
    OWN_ALIAS: 'C’est ton propre prénom : tu n’as pas de note à y mettre.',
    UNKNOWN_PLAYER: 'Ce joueur n’est pas dans la partie.',
    BAD_GUESS: 'Un trait par prénom et par joueur, et jamais le tien.',
    ALREADY_CONFIRMED: 'Tu as déjà validé tes choix.',
    GUESS_INCOMPLETE: 'Relie d’abord tous les prénoms.',
  },
});
