import type { ErrorCode } from './errors.ts';
import type { RoomView } from './room.ts';

export type Ack<T = null> = { ok: true; data: T } | { ok: false; error: ErrorCode };
export type AckCallback<T = null> = (result: Ack<T>) => void;

export type EmptyPayload = Record<string, never>;
export type SessionEndReason = 'kicked' | 'closed' | 'expired' | 'replaced';

export interface ClockPong {
  /** Client time echoed back. */
  t0: number;
  /** Server time (ms since epoch) when the ping was handled. */
  server: number;
}

/** Every client event carries a payload object and an acknowledgement callback. */
export interface ClientToServerEvents {
  'clock:ping': (payload: { t0: number }, ack: AckCallback<ClockPong>) => void;
  'room:leave': (payload: EmptyPayload, ack: AckCallback) => void;
  'room:kick': (payload: { playerId: string }, ack: AckCallback) => void;
  'room:transferHost': (payload: { playerId: string }, ack: AckCallback) => void;
  'room:close': (payload: EmptyPayload, ack: AckCallback) => void;
}

export interface ServerToClientEvents {
  'room:state': (room: RoomView) => void;
  'session:ended': (payload: { reason: SessionEndReason }) => void;
}

/** Ids of already played content, per game id. Stored on each device (localStorage). */
export type ContentHistory = Record<string, string[]>;

export interface CreateRoomRequest {
  nickname: string;
  history: ContentHistory;
}

export interface JoinRoomRequest {
  code: string;
  nickname: string;
  history: ContentHistory;
}

export interface SessionResponse {
  code: string;
  token: string;
}

export interface ErrorResponse {
  error: ErrorCode;
}
