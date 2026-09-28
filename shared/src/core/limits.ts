export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 16;
/** Raw input is capped before any normalization work. */
export const NICKNAME_MAX_INPUT_LENGTH = 200;

/** "Already seen" history sent by each device (ids of played content, per game). */
export const HISTORY_MAX_GAMES = 20;
export const HISTORY_MAX_ITEMS_PER_GAME = 500;

export const SOCKET_PATH = '/socket.io';
