import type { SettingValue } from './game.ts';

export type RoomStatus = 'lobby' | 'playing' | 'results';

export interface PlayerView {
  id: string;
  nickname: string;
  connected: boolean;
  isHost: boolean;
  /** 'waiting': arrived during a game, plays the next one. */
  role: 'player' | 'waiting';
}

export type UnavailableReason = 'NOT_ENOUGH_PLAYERS' | 'TOO_MANY_PLAYERS' | 'NO_CONTENT_LEFT';

export interface GameAvailability {
  id: string;
  launchable: boolean;
  reason: UnavailableReason | null;
  /** Games with content: number of items not played yet in this room. */
  content: { left: number } | null;
}

export interface RankingEntry {
  playerId: string;
  nickname: string;
  score: number;
  /** Competition ranking: ties share a rank (1, 1, 3). */
  rank: number;
}

/** What one player receives about their room: a full snapshot, never the raw server state. */
export interface RoomView {
  code: string;
  /** Id of the player receiving this view. */
  me: string;
  hostId: string;
  status: RoomStatus;
  /** In arrival order. */
  players: PlayerView[];
  maxPlayers: number;
  games: GameAvailability[];
  /** Game chosen by the host and its current settings. */
  selectedGame: {
    id: string;
    settings: Record<string, SettingValue>;
    /** Current bounds of the integer settings (some depend on the content left). */
    limits: Record<string, { min: number; max: number }>;
  } | null;
  /** Final ranking of the game that just ended (status 'results'). */
  results: { gameId: string; ranking: RankingEntry[] } | null;
}

/** A game view for one player. `runId` identifies the game run, `seq` orders its views. */
export interface GameViewEnvelope<V = unknown> {
  gameId: string;
  runId: string;
  seq: number;
  view: V;
}
