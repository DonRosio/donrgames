import type { ErrorCode, SessionEndReason } from '@mini-jeux/shared';

/** Server error codes plus the failures only the client can observe. */
export type ClientErrorCode = ErrorCode | 'NETWORK' | 'TIMEOUT';

export class ApiError extends Error {
  readonly code: ClientErrorCode;

  constructor(code: ClientErrorCode) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
  }
}

const MESSAGES: Record<ClientErrorCode, string> = {
  INVALID_PAYLOAD: 'Requête invalide.',
  PAYLOAD_TOO_LARGE: 'Envoi trop volumineux.',
  RATE_LIMITED: 'Trop de tentatives. Patiente un peu avant de réessayer.',
  FORBIDDEN_ORIGIN: 'Requête refusée.',
  NOT_FOUND: 'Introuvable.',
  ROOM_NOT_FOUND: 'Aucune partie avec ce code. Vérifie-le, ou demande un nouveau lien.',
  ROOM_FULL: 'Ce salon est complet.',
  TOO_MANY_ROOMS: 'Le serveur est plein pour le moment. Réessaie plus tard.',
  NICKNAME_TAKEN: 'Ce pseudo est déjà pris dans ce salon.',
  NICKNAME_TOO_SHORT: 'Ton pseudo doit faire au moins 2 caractères.',
  NICKNAME_TOO_LONG: 'Ton pseudo doit faire au plus 16 caractères.',
  NICKNAME_INVALID:
    "Ton pseudo contient des caractères non autorisés (lettres, chiffres, espaces, emojis et - _ . ' ! seulement).",
  NOT_HOST: "Seul l'hôte peut faire ça.",
  PLAYER_NOT_FOUND: "Ce joueur n'est plus dans le salon.",
  SESSION_INVALID: "Ta session n'est plus valide.",
  GAME_NOT_FOUND: 'Jeu introuvable.',
  GAME_UNAVAILABLE: 'Impossible de lancer ce jeu avec les joueurs connectés.',
  INVALID_SETTINGS: 'Réglage invalide.',
  WRONG_PHASE: 'Action impossible à ce moment de la partie.',
  NOT_PARTICIPANT: 'Tu ne participes pas à cette partie.',
  INTERNAL: 'Erreur inattendue du serveur.',
  NETWORK: 'Impossible de joindre le serveur. Vérifie ta connexion.',
  TIMEOUT: 'Le serveur ne répond pas. Réessaie.',
};

export function errorMessage(error: unknown): string {
  return MESSAGES[error instanceof ApiError ? error.code : 'INTERNAL'];
}

export function codeMessage(code: ClientErrorCode): string {
  return MESSAGES[code];
}

export type EndReason = SessionEndReason | 'invalid';

export const END_MESSAGES: Record<Exclude<EndReason, 'replaced'>, string> = {
  kicked: "L'hôte t'a retiré du salon.",
  closed: "L'hôte a fermé le salon.",
  expired: 'Le salon a expiré après une longue inactivité.',
  invalid: "Ta session n'est plus valide : le salon a sans doute été fermé.",
};
