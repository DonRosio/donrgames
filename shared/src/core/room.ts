export type RoomStatus = 'lobby';

export interface PlayerView {
  id: string;
  nickname: string;
  connected: boolean;
  isHost: boolean;
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
}
