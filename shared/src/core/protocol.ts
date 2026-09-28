import type { ErrorCode } from './errors.ts';
import type { SettingValue } from './game.ts';
import type { GameViewEnvelope, RoomView } from './room.ts';

/** Failures carry a core error code, or a code declared by the game in its contract. */
export type Ack<T = null> = { ok: true; data: T } | { ok: false; error: ErrorCode | (string & {}) };
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
  'room:selectGame': (payload: { gameId: string }, ack: AckCallback) => void;
  'room:setSettings': (
    payload: { settings: Record<string, SettingValue> },
    ack: AckCallback,
  ) => void;
  'room:startGame': (payload: EmptyPayload, ack: AckCallback) => void;
  'game:action': (payload: { type: string; payload: unknown }, ack: AckCallback) => void;
  'game:skip': (payload: EmptyPayload, ack: AckCallback) => void;
  'game:abort': (payload: EmptyPayload, ack: AckCallback) => void;
  'results:dismiss': (payload: EmptyPayload, ack: AckCallback) => void;
}

export interface ServerToClientEvents {
  'room:state': (room: RoomView) => void;
  'game:view': (envelope: GameViewEnvelope) => void;
  'session:ended': (payload: { reason: SessionEndReason }) => void;
}

export interface CreateRoomRequest {
  nickname: string;
}

export interface JoinRoomRequest {
  code: string;
  nickname: string;
}

export interface SessionResponse {
  code: string;
  token: string;
}

export interface UploadResponse {
  mediaId: string;
}

export interface ErrorResponse {
  error: ErrorCode;
}
