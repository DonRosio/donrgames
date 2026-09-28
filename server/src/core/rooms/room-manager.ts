import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  nicknameKey,
  normalizeNickname,
  validateNickname,
} from '@mini-jeux/shared';
import type { ContentHistory, RoomView } from '@mini-jeux/shared';
import { DomainError } from '../lib/errors.ts';
import { hashToken } from '../lib/random.ts';
import type { RandomSource } from '../lib/random.ts';
import type { Clock } from '../lib/time.ts';

export interface RoomTimings {
  /** A disconnected player is still awaited (and keeps the host role) during this delay. */
  disconnectGraceMs: number;
  /** In the lobby, a player disconnected for this long is removed from the room. */
  lobbyDisconnectRemoveMs: number;
  /** A room without any connected player is closed after this delay. */
  emptyRoomTtlMs: number;
  /** A room without any action is closed after this delay (forgotten tabs). */
  idleRoomTtlMs: number;
  /** Hard limit on the lifetime of a room. */
  maxRoomAgeMs: number;
}

export interface RoomLimits {
  maxRooms: number;
  maxPlayersPerRoom: number;
  timings: RoomTimings;
}

export const DEFAULT_TIMINGS: RoomTimings = {
  disconnectGraceMs: 60_000,
  lobbyDisconnectRemoveMs: 5 * 60_000,
  emptyRoomTtlMs: 10 * 60_000,
  idleRoomTtlMs: 60 * 60_000,
  maxRoomAgeMs: 12 * 60 * 60_000,
};

export interface Player {
  /** Public identifier, used in views. */
  id: string;
  /** SHA-256 of the session token; the token itself is never kept. */
  tokenHash: string;
  nickname: string;
  joinedAt: number;
  /** Current Socket.IO connection, null when disconnected. */
  socketId: string | null;
  disconnectedAt: number | null;
  /** "Already seen" content ids declared by the device, per game. */
  history: Map<string, Set<string>>;
}

export interface Room {
  /** Internal random identifier: the only room reference written to logs. */
  id: string;
  code: string;
  hostId: string;
  status: 'lobby';
  /** Insertion order is arrival order. */
  players: Map<string, Player>;
  createdAt: number;
  lastActionAt: number;
  /** Since when no player is connected, null while someone is. */
  noConnectedSince: number | null;
}

export type PlayerRemovalReason = 'left' | 'kicked' | 'timeout';
export type RoomCloseReason = 'closed' | 'expired' | 'empty';

/** Notifications consumed by the realtime layer to push new states to clients. */
export interface RoomEvents {
  roomChanged(room: Room): void;
  playerRemoved(room: Room, player: Player, reason: PlayerRemovalReason): void;
  roomClosed(room: Room, reason: RoomCloseReason): void;
}

const noEvents: RoomEvents = {
  roomChanged: () => {},
  playerRemoved: () => {},
  roomClosed: () => {},
};

export interface Session {
  room: Room;
  player: Player;
}

export interface NewSession extends Session {
  /** Secret token, handed once to the client. */
  token: string;
}

interface SessionRef {
  code: string;
  playerId: string;
}

export class RoomManager {
  readonly #clock: Clock;
  readonly #random: RandomSource;
  readonly #limits: RoomLimits;
  #events: RoomEvents = noEvents;
  readonly #rooms = new Map<string, Room>();
  readonly #sessions = new Map<string, SessionRef>();

  constructor(options: { clock: Clock; random: RandomSource; limits: RoomLimits }) {
    this.#clock = options.clock;
    this.#random = options.random;
    this.#limits = options.limits;
  }

  setEvents(events: RoomEvents): void {
    this.#events = events;
  }

  get roomCount(): number {
    return this.#rooms.size;
  }

  getRoom(code: string): Room | undefined {
    return this.#rooms.get(code);
  }

  createRoom(input: { nickname: string; history: ContentHistory }): NewSession {
    if (this.#rooms.size >= this.#limits.maxRooms) throw new DomainError('TOO_MANY_ROOMS');
    const nickname = checkNickname(input.nickname);
    const now = this.#clock.now();
    const room: Room = {
      id: this.#random.id(6),
      code: this.#uniqueCode(),
      hostId: '',
      status: 'lobby',
      players: new Map(),
      createdAt: now,
      lastActionAt: now,
      noConnectedSince: now,
    };
    const { player, token } = this.#addPlayer(room, nickname, input.history);
    room.hostId = player.id;
    this.#rooms.set(room.code, room);
    return { room, player, token };
  }

  /** `code` must already be normalized. */
  joinRoom(input: { code: string; nickname: string; history: ContentHistory }): NewSession {
    const room = this.#rooms.get(input.code);
    if (!room) throw new DomainError('ROOM_NOT_FOUND');
    if (room.players.size >= this.#limits.maxPlayersPerRoom) throw new DomainError('ROOM_FULL');
    const nickname = checkNickname(input.nickname);
    const key = nicknameKey(nickname);
    for (const other of room.players.values()) {
      if (nicknameKey(other.nickname) === key) throw new DomainError('NICKNAME_TAKEN');
    }
    const { player, token } = this.#addPlayer(room, nickname, input.history);
    this.#touch(room);
    this.#events.roomChanged(room);
    return { room, player, token };
  }

  authenticate(token: string): Session | null {
    const ref = this.#sessions.get(hashToken(token));
    return ref ? this.find(ref.code, ref.playerId) : null;
  }

  find(code: string, playerId: string): Session | null {
    const room = this.#rooms.get(code);
    const player = room?.players.get(playerId);
    return room && player ? { room, player } : null;
  }

  /** Returns the id of the socket this one replaces (same session opened elsewhere), if any. */
  attachSocket(session: Session, socketId: string): string | null {
    const { room, player } = session;
    const previous = player.socketId;
    player.socketId = socketId;
    player.disconnectedAt = null;
    room.noConnectedSince = null;
    this.#events.roomChanged(room);
    return previous !== null && previous !== socketId ? previous : null;
  }

  /** Ignored when the socket was already replaced by a newer connection. */
  detachSocket(session: Session, socketId: string): void {
    const { room, player } = session;
    if (player.socketId !== socketId) return;
    const now = this.#clock.now();
    player.socketId = null;
    player.disconnectedAt = now;
    if (!hasConnectedPlayer(room)) room.noConnectedSince = now;
    this.#events.roomChanged(room);
  }

  leave(session: Session): void {
    this.#removePlayer(session.room, session.player, 'left');
  }

  kick(session: Session, targetId: string): void {
    const { room, player } = session;
    assertHost(room, player);
    const target = room.players.get(targetId);
    if (!target) throw new DomainError('PLAYER_NOT_FOUND');
    if (target === player) throw new DomainError('INVALID_PAYLOAD');
    this.#removePlayer(room, target, 'kicked');
  }

  transferHost(session: Session, targetId: string): void {
    const { room, player } = session;
    assertHost(room, player);
    const target = room.players.get(targetId);
    if (!target) throw new DomainError('PLAYER_NOT_FOUND');
    if (target === player) throw new DomainError('INVALID_PAYLOAD');
    room.hostId = target.id;
    this.#touch(room);
    this.#events.roomChanged(room);
  }

  close(session: Session): void {
    assertHost(session.room, session.player);
    this.#closeRoom(session.room, 'closed');
  }

  /** Periodic maintenance: host hand-over, removal of long-gone players, room expiry. */
  sweep(): void {
    const now = this.#clock.now();
    const timings = this.#limits.timings;
    for (const room of [...this.#rooms.values()]) {
      const expired =
        now - room.createdAt >= timings.maxRoomAgeMs ||
        now - room.lastActionAt >= timings.idleRoomTtlMs ||
        (room.noConnectedSince !== null && now - room.noConnectedSince >= timings.emptyRoomTtlMs);
      if (expired) {
        this.#closeRoom(room, 'expired');
        continue;
      }

      for (const player of [...room.players.values()]) {
        if (
          player.disconnectedAt !== null &&
          now - player.disconnectedAt >= timings.lobbyDisconnectRemoveMs
        ) {
          this.#removePlayer(room, player, 'timeout');
        }
      }
      if (!this.#rooms.has(room.code)) continue;

      const host = room.players.get(room.hostId);
      if (
        host &&
        host.disconnectedAt !== null &&
        now - host.disconnectedAt >= timings.disconnectGraceMs
      ) {
        const successor = firstConnected(room);
        if (successor) {
          room.hostId = successor.id;
          this.#events.roomChanged(room);
        }
      }
    }
  }

  view(room: Room, viewerId: string): RoomView {
    return {
      code: room.code,
      me: viewerId,
      hostId: room.hostId,
      status: room.status,
      maxPlayers: this.#limits.maxPlayersPerRoom,
      players: [...room.players.values()].map((player) => ({
        id: player.id,
        nickname: player.nickname,
        connected: player.socketId !== null,
        isHost: player.id === room.hostId,
      })),
    };
  }

  #addPlayer(
    room: Room,
    nickname: string,
    history: ContentHistory,
  ): { player: Player; token: string } {
    const token = this.#random.token();
    const player: Player = {
      id: this.#random.id(12),
      tokenHash: hashToken(token),
      nickname,
      joinedAt: this.#clock.now(),
      socketId: null,
      // Not connected until its socket arrives: a player who never connects gets removed.
      disconnectedAt: this.#clock.now(),
      history: new Map(Object.entries(history).map(([game, ids]) => [game, new Set(ids)])),
    };
    room.players.set(player.id, player);
    this.#sessions.set(player.tokenHash, { code: room.code, playerId: player.id });
    return { player, token };
  }

  #removePlayer(room: Room, player: Player, reason: PlayerRemovalReason): void {
    room.players.delete(player.id);
    this.#sessions.delete(player.tokenHash);
    this.#events.playerRemoved(room, player, reason);
    if (room.players.size === 0) {
      this.#closeRoom(room, 'empty');
      return;
    }
    if (room.hostId === player.id) {
      room.hostId = (firstConnected(room) ?? room.players.values().next().value!).id;
    }
    if (!hasConnectedPlayer(room)) room.noConnectedSince ??= this.#clock.now();
    this.#touch(room);
    this.#events.roomChanged(room);
  }

  #closeRoom(room: Room, reason: RoomCloseReason): void {
    this.#rooms.delete(room.code);
    for (const player of room.players.values()) this.#sessions.delete(player.tokenHash);
    this.#events.roomClosed(room, reason);
  }

  #uniqueCode(): string {
    // 36^6 ≈ 2.2 billion codes for at most a few hundred rooms: collisions are extremely rare.
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = this.#random.string(ROOM_CODE_LENGTH, ROOM_CODE_ALPHABET);
      if (!this.#rooms.has(code)) return code;
    }
    throw new Error('Could not generate a unique room code');
  }

  #touch(room: Room): void {
    room.lastActionAt = this.#clock.now();
  }
}

function checkNickname(raw: string): string {
  const nickname = normalizeNickname(raw);
  const error = validateNickname(nickname);
  if (error) throw new DomainError(error);
  return nickname;
}

function assertHost(room: Room, player: Player): void {
  if (room.hostId !== player.id) throw new DomainError('NOT_HOST');
}

function hasConnectedPlayer(room: Room): boolean {
  for (const player of room.players.values()) if (player.socketId !== null) return true;
  return false;
}

/** Earliest arrived connected player. */
function firstConnected(room: Room): Player | undefined {
  for (const player of room.players.values()) if (player.socketId !== null) return player;
  return undefined;
}
