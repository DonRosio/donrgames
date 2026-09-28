import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { SOCKET_PATH, isErrorCode } from '@mini-jeux/shared';
import type {
  Ack,
  ClientToServerEvents,
  ClockPong,
  GameViewEnvelope,
  MediaRef,
  RoomView,
  ServerToClientEvents,
  SettingValue,
  UploadResponse,
} from '@mini-jeux/shared';
import { ClockSync, localNow } from './clock.ts';
import type { ClockEstimate } from './clock.ts';
import { ApiError } from './errors.ts';
import type { EndReason } from './errors.ts';

export type ConnectionStatus = 'connecting' | 'online' | 'reconnecting' | 'ended';

export interface SessionSnapshot {
  status: ConnectionStatus;
  /** Last room state received; kept while reconnecting. */
  room: RoomView | null;
  /** View of the running game for this player (null outside of a game or when waiting). */
  game: GameViewEnvelope | null;
  endReason: EndReason | null;
  clock: ClockEstimate | null;
}

/** Result of a game action: refusals carry a core or game error code. */
export type ActionAck = { ok: true } | { ok: false; code: string };

const REQUEST_TIMEOUT_MS = 5000;
const RETRY_DELAY_MS = 3000;

type RequestEvent = Exclude<keyof ClientToServerEvents, 'clock:ping'>;

/**
 * Realtime connection to a room, exposed as an external store for React
 * (useSyncExternalStore). Reconnects on its own; the server resends the full state.
 */
export class Session {
  readonly #socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  readonly #clock: ClockSync;
  readonly #listeners = new Set<() => void>();
  #snapshot: SessionSnapshot = {
    status: 'connecting',
    room: null,
    game: null,
    endReason: null,
    clock: null,
  };
  #retry: ReturnType<typeof setTimeout> | null = null;
  readonly #token: string;

  constructor(token: string) {
    this.#token = token;
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
    this.#socket.on('room:state', (room) => {
      // Game views only make sense while a game is running.
      this.#update(room.status === 'playing' ? { room } : { room, game: null });
    });
    this.#socket.on('game:view', (envelope) => {
      const current = this.#snapshot.game;
      if (current && current.runId === envelope.runId && current.seq >= envelope.seq) return;
      this.#update({ game: envelope });
    });
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

  selectGame(gameId: string): Promise<void> {
    return this.#request('room:selectGame', { gameId });
  }

  setSettings(settings: Record<string, SettingValue>): Promise<void> {
    return this.#request('room:setSettings', { settings });
  }

  startGame(): Promise<void> {
    return this.#request('room:startGame', {});
  }

  skipPhase(): Promise<void> {
    return this.#request('game:skip', {});
  }

  abortGame(): Promise<void> {
    return this.#request('game:abort', {});
  }

  dismissResults(): Promise<void> {
    return this.#request('results:dismiss', {});
  }

  /** Estimated server time (ms), compensated for the clock offset of this device. */
  serverNow(): number {
    return localNow() + (this.#snapshot.clock?.offsetMs ?? 0);
  }

  /** Downloads a content file or a recording the running game lets this player read. */
  async fetchMedia(ref: MediaRef): Promise<Blob> {
    const url =
      ref.kind === 'content'
        ? `/api/content/${encodeURIComponent(ref.gameId)}/${encodeURIComponent(ref.id)}`
        : `/api/media/${encodeURIComponent(ref.id)}`;
    const response = await this.#authorizedFetch(url);
    if (!response.ok) {
      const code = await errorCodeOf(response);
      throw new ApiError(isErrorCode(code) || code === 'NETWORK' ? code : 'INTERNAL');
    }
    return response.blob();
  }

  /** Sends a file to the running game (e.g. a recorded take); refusals are returned. */
  async upload(kind: string, file: Blob, meta: unknown): Promise<ActionAck & { mediaId?: string }> {
    const response = await this.#authorizedFetch(`/api/uploads/${encodeURIComponent(kind)}`, {
      method: 'POST',
      headers: { 'content-type': file.type, 'x-upload-meta': JSON.stringify(meta) },
      body: file,
    });
    if (!response.ok) return { ok: false, code: await errorCodeOf(response) };
    const body = (await response.json()) as UploadResponse;
    return { ok: true, mediaId: body.mediaId };
  }

  async #authorizedFetch(url: string, init: RequestInit = {}): Promise<Response> {
    try {
      return await fetch(url, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string>),
          authorization: `Bearer ${this.#token}`,
        },
      });
    } catch {
      throw new ApiError('NETWORK');
    }
  }

  /** Sends a game action; refusals are returned, not thrown. */
  async act(type: string, payload: unknown): Promise<ActionAck> {
    const result = await this.#emit('game:action', { type, payload });
    return result.ok ? { ok: true } : { ok: false, code: result.error };
  }

  async #request(event: RequestEvent, payload: object): Promise<void> {
    const result = await this.#emit(event, payload);
    if (!result.ok) throw new ApiError(isErrorCode(result.error) ? result.error : 'INTERNAL');
  }

  #emit(event: RequestEvent, payload: object): Promise<Ack<unknown>> {
    return new Promise((resolve, reject) => {
      // Loosely typed on purpose: every request event shares the (payload, ack) shape.
      const socket = this.#socket.timeout(REQUEST_TIMEOUT_MS) as unknown as {
        emit(
          event: RequestEvent,
          payload: object,
          ack: (error: Error | null, result: Ack<unknown>) => void,
        ): void;
      };
      socket.emit(event, payload, (error, result) => {
        if (error) reject(new ApiError('TIMEOUT'));
        else resolve(result);
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

async function errorCodeOf(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  if (typeof body?.error === 'string') return body.error;
  return response.status >= 502 && response.status <= 504 ? 'NETWORK' : 'INTERNAL';
}
