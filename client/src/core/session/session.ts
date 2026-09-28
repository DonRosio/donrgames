import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { SOCKET_PATH } from '@mini-jeux/shared';
import type {
  Ack,
  ClientToServerEvents,
  ClockPong,
  RoomView,
  ServerToClientEvents,
} from '@mini-jeux/shared';
import { ClockSync } from './clock.ts';
import type { ClockEstimate } from './clock.ts';
import { ApiError } from './errors.ts';
import type { EndReason } from './errors.ts';

export type ConnectionStatus = 'connecting' | 'online' | 'reconnecting' | 'ended';

export interface SessionSnapshot {
  status: ConnectionStatus;
  /** Last room state received; kept while reconnecting. */
  room: RoomView | null;
  endReason: EndReason | null;
  clock: ClockEstimate | null;
}

const REQUEST_TIMEOUT_MS = 5000;
const RETRY_DELAY_MS = 3000;

type RoomEvent = 'room:leave' | 'room:kick' | 'room:transferHost' | 'room:close';

/**
 * Realtime connection to a room, exposed as an external store for React
 * (useSyncExternalStore). Reconnects on its own; the server resends the full state.
 */
export class Session {
  readonly #socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  readonly #clock: ClockSync;
  readonly #listeners = new Set<() => void>();
  #snapshot: SessionSnapshot = { status: 'connecting', room: null, endReason: null, clock: null };
  #retry: ReturnType<typeof setTimeout> | null = null;

  constructor(token: string) {
    this.#socket = io({
      path: SOCKET_PATH,
      transports: ['websocket'],
      // One connection per session (never share a multiplexed manager between sessions).
      forceNew: true,
      auth: { token },
      autoConnect: false,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    this.#clock = new ClockSync(
      (t0) => this.#pingClock(t0),
      (clock) => this.#update({ clock }),
    );

    this.#socket.on('connect', () => {
      this.#update({ status: 'online' });
      this.#clock.start();
    });
    this.#socket.on('disconnect', (reason) => {
      this.#clock.stop();
      if (this.#snapshot.status === 'ended') return;
      // Server-side namespace disconnects come with 'session:ended' (handled below).
      if (reason !== 'io server disconnect' && reason !== 'io client disconnect') {
        this.#update({ status: 'reconnecting' });
      }
    });
    this.#socket.on('connect_error', (error) => {
      if (error.message === 'SESSION_INVALID') return this.#end('invalid');
      this.#update({ status: 'reconnecting' });
      // Errors raised by the server middleware are not retried automatically.
      if (!this.#socket.active) this.#scheduleRetry();
    });
    this.#socket.on('room:state', (room) => this.#update({ room }));
    this.#socket.on('session:ended', ({ reason }) => this.#end(reason));
  }

  start(): void {
    this.#socket.connect();
  }

  stop(): void {
    if (this.#retry) clearTimeout(this.#retry);
    this.#clock.stop();
    this.#socket.disconnect();
  }

  /** After 'replaced': takes the session back in this tab. */
  resume(): void {
    this.#update({ status: 'connecting', endReason: null });
    this.#socket.connect();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  getSnapshot = (): SessionSnapshot => this.#snapshot;

  async leave(): Promise<void> {
    await this.#request('room:leave', {});
    this.stop();
  }

  kick(playerId: string): Promise<void> {
    return this.#request('room:kick', { playerId });
  }

  transferHost(playerId: string): Promise<void> {
    return this.#request('room:transferHost', { playerId });
  }

  closeRoom(): Promise<void> {
    return this.#request('room:close', {});
  }

  #request(event: RoomEvent, payload: object): Promise<void> {
    return new Promise((resolve, reject) => {
      // Loosely typed on purpose: every room event shares the (payload, ack) shape.
      const socket = this.#socket.timeout(REQUEST_TIMEOUT_MS) as unknown as {
        emit(
          event: RoomEvent,
          payload: object,
          ack: (error: Error | null, result: Ack) => void,
        ): void;
      };
      socket.emit(event, payload, (error, result) => {
        if (error) reject(new ApiError('TIMEOUT'));
        else if (result.ok) resolve();
        else reject(new ApiError(result.error));
      });
    });
  }

  #pingClock(t0: number): Promise<number | null> {
    return new Promise((resolve) => {
      this.#socket
        .timeout(REQUEST_TIMEOUT_MS)
        .emit('clock:ping', { t0 }, (error: Error | null, result: Ack<ClockPong>) => {
          resolve(!error && result.ok ? result.data.server : null);
        });
    });
  }

  #scheduleRetry(): void {
    if (this.#retry) clearTimeout(this.#retry);
    this.#retry = setTimeout(() => {
      this.#retry = null;
      if (this.#snapshot.status !== 'ended') this.#socket.connect();
    }, RETRY_DELAY_MS);
  }

  #end(reason: EndReason): void {
    this.#update({ status: 'ended', endReason: reason });
    this.#clock.stop();
    // A replaced session can be resumed; any other end is final.
    if (reason !== 'replaced') this.stop();
  }

  #update(patch: Partial<SessionSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...patch };
    for (const listener of this.#listeners) listener();
  }
}
