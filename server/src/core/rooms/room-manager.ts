import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  nicknameKey,
  normalizeNickname,
  validateNickname,
} from '@mini-jeux/shared';
import type {
  GameAvailability,
  GameContract,
  GameViewEnvelope,
  RankingEntry,
  RoomStatus,
  RoomView,
  ScoreEntry,
  SettingValue,
} from '@mini-jeux/shared';
import { rank } from '../engine/helpers.ts';
import { cryptoGameRandom } from '../engine/random.ts';
import type { GameRandom } from '../engine/random.ts';
import { GameRunner } from '../engine/runner.ts';
import { systemScheduler } from '../engine/scheduler.ts';
import type { Scheduler } from '../engine/scheduler.ts';
import { effectiveSettings, patchSettings, settingLimits } from '../engine/settings.ts';
import type { ContentCounts } from '../engine/settings.ts';
import type { UploadPermit } from '../engine/runner.ts';
import type {
  AnyGameDefinition,
  ContentAccess,
  ReadRef,
  Roster,
  RosterEntry,
} from '../engine/types.ts';
import type { ContentItem, ContentLibrary } from '../content/library.ts';
import { MediaStore } from '../media/media-store.ts';
import type { StoredMedia } from '../media/media-store.ts';
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
  /** 'waiting': arrived during a game (or disconnected when it started), plays the next one. */
  role: 'player' | 'waiting';
  /** The running game was told it should no longer wait for this player. */
  unawaited: boolean;
}

export interface Room {
  /** Internal random identifier: the only room reference written to logs. */
  id: string;
  code: string;
  hostId: string;
  status: RoomStatus;
  /** Insertion order is arrival order. */
  players: Map<string, Player>;
  selectedGame: string | null;
  /** Values chosen by the host; see effectiveSettings() for the values actually used. */
  settings: Record<string, SettingValue>;
  /** Settings the host changed: the others follow their (possibly content-based) default. */
  settingsTouched: Set<string>;
  runner: GameRunner | null;
  /** Content already played in this room, per game: never proposed again here. */
  played: Map<string, Set<string>>;
  results: { gameId: string; ranking: RankingEntry[] } | null;
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
  /** The game views may have changed: push them to the participants. */
  gameUpdated(room: Room): void;
  playerRemoved(room: Room, player: Player, reason: PlayerRemovalReason): void;
  roomClosed(room: Room, reason: RoomCloseReason): void;
  /** A game handler failed outside of an action (timer…): to be logged. */
  gameFailed(room: Room, error: unknown): void;
}

const noEvents: RoomEvents = {
  roomChanged: () => {},
  gameUpdated: () => {},
  playerRemoved: () => {},
  roomClosed: () => {},
  gameFailed: () => {},
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

export interface RoomManagerOptions {
  clock: Clock;
  random: RandomSource;
  limits: RoomLimits;
  games?: readonly AnyGameDefinition[];
  scheduler?: Scheduler;
  gameRandom?: GameRandom;
  /** Content of the games declaring `content: true`, by game id. */
  content?: ReadonlyMap<string, ContentLibrary>;
  media?: MediaStore;
}

export class RoomManager {
  readonly #clock: Clock;
  readonly #random: RandomSource;
  readonly #limits: RoomLimits;
  readonly #games: ReadonlyMap<string, AnyGameDefinition>;
  readonly #scheduler: Scheduler;
  readonly #gameRandom: GameRandom;
  readonly #content: ReadonlyMap<string, ContentLibrary>;
  readonly media: MediaStore;
  #events: RoomEvents = noEvents;
  readonly #rooms = new Map<string, Room>();
  readonly #sessions = new Map<string, SessionRef>();

  constructor(options: RoomManagerOptions) {
    this.#clock = options.clock;
    this.#random = options.random;
    this.#limits = options.limits;
    this.#games = new Map((options.games ?? []).map((game) => [contractOf(game).meta.id, game]));
    this.#scheduler = options.scheduler ?? systemScheduler;
    this.#gameRandom = options.gameRandom ?? cryptoGameRandom;
    this.#content = options.content ?? new Map();
    this.media =
      options.media ?? new MediaStore({ clock: options.clock, newId: () => options.random.id(16) });
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

  // ---------------------------------------------------------------- rooms and players

  /** A room plays one game, chosen here for good (the first registered game by default). */
  createRoom(input: { nickname: string; gameId?: string }): NewSession {
    if (this.#rooms.size >= this.#limits.maxRooms) throw new DomainError('TOO_MANY_ROOMS');
    const nickname = checkNickname(input.nickname);
    const game = input.gameId ? this.#games.get(input.gameId) : this.#games.values().next().value;
    if (input.gameId && !game) throw new DomainError('GAME_NOT_FOUND');
    const now = this.#clock.now();
    const room: Room = {
      id: this.#random.id(6),
      code: this.#uniqueCode(),
      hostId: '',
      status: 'lobby',
      players: new Map(),
      selectedGame: game ? contractOf(game).meta.id : null,
      settings: {},
      settingsTouched: new Set(),
      runner: null,
      played: new Map(),
      results: null,
      createdAt: now,
      lastActionAt: now,
      noConnectedSince: now,
    };
    const { player, token } = this.#addPlayer(room, nickname);
    room.hostId = player.id;
    this.#rooms.set(room.code, room);
    return { room, player, token };
  }

  /** `code` must already be normalized. */
  joinRoom(input: { code: string; nickname: string }): NewSession {
    const room = this.#rooms.get(input.code);
    if (!room) throw new DomainError('ROOM_NOT_FOUND');
    if (room.players.size >= this.#limits.maxPlayersPerRoom) throw new DomainError('ROOM_FULL');
    const nickname = checkNickname(input.nickname);
    const key = nicknameKey(nickname);
    for (const other of room.players.values()) {
      if (nicknameKey(other.nickname) === key) throw new DomainError('NICKNAME_TAKEN');
    }
    const { player, token } = this.#addPlayer(room, nickname);
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
    const wasDisconnected = previous === null;
    player.socketId = socketId;
    player.disconnectedAt = null;
    player.unawaited = false;
    room.noConnectedSince = null;
    this.#events.roomChanged(room);
    if (room.runner?.isParticipant(player.id)) {
      if (wasDisconnected) room.runner.playerChanged({ playerId: player.id, kind: 'reconnected' });
      // Also delivers the current view to the new connection.
      this.#events.gameUpdated(room);
    }
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
    if (room.runner?.isParticipant(player.id)) {
      room.runner.playerChanged({ playerId: player.id, kind: 'disconnected' });
    }
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

  // ---------------------------------------------------------------- games

  setSettings(session: Session, patch: Record<string, unknown>): void {
    const { room } = this.#hostInLobby(session);
    const game = room.selectedGame ? this.#games.get(room.selectedGame) : undefined;
    if (!game) throw new DomainError('GAME_NOT_FOUND');
    const defs = contractOf(game).settings;
    const counts = this.#counts(room, game);
    const current = effectiveSettings(defs, room.settings, room.settingsTouched, counts);
    const settings = patchSettings(defs, current, patch, counts);
    if (!settings) throw new DomainError('INVALID_SETTINGS');
    room.settings = settings;
    for (const key of Object.keys(patch)) room.settingsTouched.add(key);
    this.#touch(room);
    this.#events.roomChanged(room);
  }

  startGame(session: Session): void {
    const { room } = this.#hostInLobby(session);
    const game = room.selectedGame ? this.#games.get(room.selectedGame) : undefined;
    if (!game) throw new DomainError('GAME_NOT_FOUND');
    if (!this.#availability(room, game).launchable) throw new DomainError('GAME_UNAVAILABLE');

    // Participants are the connected players; the others will play the next game.
    const participants: string[] = [];
    const nicknames = new Map<string, string>();
    for (const player of room.players.values()) {
      player.unawaited = false;
      if (player.socketId === null) {
        player.role = 'waiting';
      } else {
        participants.push(player.id);
        nicknames.set(player.id, player.nickname);
      }
    }

    const gameId = contractOf(game).meta.id;
    const settings = effectiveSettings(
      contractOf(game).settings,
      room.settings,
      room.settingsTouched,
      this.#counts(room, game),
    );
    const runner: GameRunner = new GameRunner({
      definition: game,
      runId: this.#random.id(6),
      participants,
      settings,
      content: this.#contentAccess(room, gameId),
      media: { discard: (id) => this.#discardMedia(room, id) },
      roster: this.#roster(room, participants, nicknames),
      clock: this.#clock,
      random: this.#gameRandom,
      scheduler: this.#scheduler,
      hooks: {
        onUpdate: () => {
          if (room.runner === runner) this.#events.gameUpdated(room);
        },
        onEnd: (scores) => this.#finishGame(room, runner, scores, nicknames),
        onError: (error) => this.#events.gameFailed(room, error),
      },
    });
    room.runner = runner;
    room.status = 'playing';
    room.results = null;
    try {
      runner.start();
    } catch (error) {
      this.#backToLobby(room);
      throw error;
    }
    this.#touch(room);
    this.#events.roomChanged(room);
    if (room.runner === runner) this.#events.gameUpdated(room);
  }

  gameAction(session: Session, type: string, payload: unknown): void {
    const { room, player } = session;
    const runner = room.runner;
    if (room.status !== 'playing' || !runner) throw new DomainError('WRONG_PHASE');
    runner.dispatch(player.id, type, payload, room.hostId === player.id);
    this.#touch(room);
    if (room.runner === runner) this.#events.gameUpdated(room);
  }

  /** Host's "Passer à la suite". */
  skipPhase(session: Session): void {
    const { room, player } = session;
    assertHost(room, player);
    const runner = room.runner;
    if (room.status !== 'playing' || !runner) throw new DomainError('WRONG_PHASE');
    runner.skip();
    this.#touch(room);
    if (room.runner === runner) this.#events.gameUpdated(room);
  }

  /** Stops the game without results. */
  abortGame(session: Session): void {
    const { room, player } = session;
    assertHost(room, player);
    if (room.status !== 'playing') throw new DomainError('WRONG_PHASE');
    this.#backToLobby(room);
    this.#touch(room);
    this.#events.roomChanged(room);
  }

  dismissResults(session: Session): void {
    const { room, player } = session;
    assertHost(room, player);
    if (room.status !== 'results') throw new DomainError('WRONG_PHASE');
    this.#backToLobby(room);
    this.#touch(room);
    this.#events.roomChanged(room);
  }

  /** Current game view of a participant, or null (no game, or not a participant). */
  gameView(room: Room, playerId: string): GameViewEnvelope | null {
    const runner = room.runner;
    if (!runner || room.status !== 'playing' || !runner.isParticipant(playerId)) return null;
    return {
      gameId: contractOf(runner.definition).meta.id,
      runId: runner.runId,
      seq: runner.seq,
      view: runner.view(playerId),
    };
  }

  // ---------------------------------------------------------------- files

  /** Before receiving an upload: checks it is expected and returns what it may contain. */
  acceptUpload(session: Session, kind: string, meta: unknown): UploadPermit {
    const runner = session.room.runner;
    if (session.room.status !== 'playing' || !runner) throw new DomainError('WRONG_PHASE');
    return runner.acceptUpload(session.player.id, kind, meta);
  }

  /** Stores a received file and gives it to the game; the file is deleted if the game refuses it. */
  completeUpload(
    session: Session,
    kind: string,
    upload: { data: Buffer; mime: string; meta: unknown },
  ): StoredMedia {
    const { room, player } = session;
    const runner = room.runner;
    if (room.status !== 'playing' || !runner) throw new DomainError('WRONG_PHASE');
    const stored = this.media.put({
      roomId: room.id,
      ownerId: player.id,
      mime: upload.mime,
      data: upload.data,
    });
    if (!stored) throw new DomainError('STORAGE_FULL');
    try {
      runner.completeUpload(
        player.id,
        kind,
        { id: stored.id, mime: stored.mime, size: stored.data.length },
        upload.meta,
      );
    } catch (error) {
      this.media.delete(stored.id);
      throw error;
    }
    this.#touch(room);
    if (room.runner === runner) this.#events.gameUpdated(room);
    return stored;
  }

  /** A recording this player may download right now, or null (unknown, other room, not allowed). */
  readableMedia(session: Session, mediaId: string): StoredMedia | null {
    const media = this.media.get(mediaId);
    if (!media || media.roomId !== session.room.id) return null;
    return this.#canRead(session, { kind: 'media', id: mediaId }) ? media : null;
  }

  /** A content file this player may download right now, or null. */
  readableContent(session: Session, gameId: string, contentId: string): ContentItem | null {
    const runner = session.room.runner;
    if (!runner || contractOf(runner.definition).meta.id !== gameId) return null;
    const item = this.#content.get(gameId)?.items.find((candidate) => candidate.id === contentId);
    // A text item has no file to download.
    if (!item || item.file === '') return null;
    return this.#canRead(session, { kind: 'content', id: contentId }) ? item : null;
  }

  #canRead(session: Session, ref: ReadRef): boolean {
    const runner = session.room.runner;
    return session.room.status === 'playing' && !!runner && runner.canRead(session.player.id, ref);
  }

  // ---------------------------------------------------------------- maintenance and views

  /** Periodic maintenance: host hand-over, grace delays, removal of long-gone players, expiry. */
  sweep(): void {
    const now = this.#clock.now();
    const timings = this.#limits.timings;
    for (const room of [...this.#rooms.values()]) {
      const expired =
        now - room.createdAt >= timings.maxRoomAgeMs ||
        // A running game may legitimately go quiet for long (e.g. players busy in another game).
        (room.status !== 'playing' && now - room.lastActionAt >= timings.idleRoomTtlMs) ||
        (room.noConnectedSince !== null && now - room.noConnectedSince >= timings.emptyRoomTtlMs);
      if (expired) {
        this.#closeRoom(room, 'expired');
        continue;
      }

      for (const player of [...room.players.values()]) {
        if (player.disconnectedAt === null) continue;
        const away = now - player.disconnectedAt;
        // Participants of a running game stay in the room until it is over.
        const removable = room.status === 'lobby' || player.role === 'waiting';
        if (removable && away >= timings.lobbyDisconnectRemoveMs) {
          this.#removePlayer(room, player, 'timeout');
        } else if (room.runner?.isParticipant(player.id) && !player.unawaited) {
          if (away >= timings.disconnectGraceMs) {
            player.unawaited = true;
            room.runner.playerChanged({ playerId: player.id, kind: 'unawaited' });
          }
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
        role: player.role,
      })),
      games: [...this.#games.values()].map((game) => this.#availability(room, game)),
      selectedGame: this.#selectedView(room),
      results: room.results,
    };
  }

  // ---------------------------------------------------------------- internals

  #availability(room: Room, game: AnyGameDefinition): GameAvailability {
    const { id, minPlayers, maxPlayers, playerCounts } = contractOf(game).meta;
    let connected = 0;
    for (const player of room.players.values()) if (player.socketId !== null) connected++;
    const counts = this.#counts(room, game);
    const reason =
      counts && counts.left === 0
        ? 'NO_CONTENT_LEFT'
        : connected < minPlayers
          ? 'NOT_ENOUGH_PLAYERS'
          : connected > maxPlayers
            ? 'TOO_MANY_PLAYERS'
            : playerCounts && !playerCounts.includes(connected)
              ? 'WRONG_PLAYER_COUNT'
              : null;
    return { id, launchable: reason === null, reason, content: counts };
  }

  #selectedView(room: Room): RoomView['selectedGame'] {
    const game = room.selectedGame ? this.#games.get(room.selectedGame) : undefined;
    if (!game) return null;
    const defs = contractOf(game).settings;
    const counts = this.#counts(room, game);
    return {
      id: contractOf(game).meta.id,
      settings: effectiveSettings(defs, room.settings, room.settingsTouched, counts),
      limits: settingLimits(defs, counts),
    };
  }

  /** Content counts of a game in a room (null for games without content). */
  #counts(room: Room, game: AnyGameDefinition): ContentCounts | null {
    if (!game.content) return null;
    const gameId = contractOf(game).meta.id;
    const items = this.#content.get(gameId)?.items ?? [];
    const played = room.played.get(gameId);
    return { left: items.filter((item) => !played?.has(item.id)).length };
  }

  #contentAccess(room: Room, gameId: string): ContentAccess {
    const items = this.#content.get(gameId)?.items ?? [];
    const played = () => room.played.get(gameId) ?? new Set<string>();
    return {
      remaining: () => items.filter((item) => !played().has(item.id)).length,
      pick: () => {
        const left = items.filter((item) => !played().has(item.id));
        if (left.length === 0) return null;
        const item = this.#gameRandom.pick(left);
        return { id: item.id, title: item.title, durationMs: item.durationMs };
      },
      markPlayed: (id) => {
        if (!room.played.has(gameId)) room.played.set(gameId, new Set());
        room.played.get(gameId)!.add(id);
      },
    };
  }

  #discardMedia(room: Room, id: string): void {
    if (this.media.get(id)?.roomId === room.id) this.media.delete(id);
  }

  #roster(room: Room, participants: readonly string[], nicknames: Map<string, string>): Roster {
    const entry = (id: string): RosterEntry | undefined => {
      if (!participants.includes(id)) return undefined;
      const player = room.players.get(id);
      const connected = player !== undefined && player.socketId !== null;
      const withinGrace =
        player !== undefined &&
        player.disconnectedAt !== null &&
        this.#clock.now() - player.disconnectedAt < this.#limits.timings.disconnectGraceMs;
      return {
        id,
        nickname: player?.nickname ?? nicknames.get(id) ?? '',
        present: player !== undefined,
        connected,
        awaited: connected || withinGrace,
      };
    };
    return {
      all: () => participants.map((id) => entry(id)!),
      get: entry,
      awaited: () => participants.filter((id) => entry(id)!.awaited),
      connected: () => participants.filter((id) => entry(id)!.connected),
    };
  }

  #finishGame(
    room: Room,
    runner: GameRunner,
    scores: readonly ScoreEntry[],
    nicknames: Map<string, string>,
  ): void {
    if (room.runner !== runner) return;
    room.runner = null;
    // Idle time is not counted while playing: restart it now, not from the last action.
    this.#touch(room);
    const { meta } = contractOf(runner.definition);
    if (meta.ranked === false) {
      // A game played for fun: no ranking, straight back to the lobby.
      this.#backToLobby(room);
      this.#events.roomChanged(room);
      return;
    }
    room.status = 'results';
    this.media.deleteRoom(room.id);
    room.results = {
      gameId: meta.id,
      ranking: rank(scores).map((entry) => ({
        playerId: entry.playerId,
        nickname: nicknames.get(entry.playerId) ?? '?',
        score: entry.score,
        rank: entry.rank,
      })),
    };
    this.#events.roomChanged(room);
  }

  #backToLobby(room: Room): void {
    this.media.deleteRoom(room.id);
    room.runner?.dispose();
    room.runner = null;
    room.status = 'lobby';
    room.results = null;
    for (const player of room.players.values()) {
      player.role = 'player';
      player.unawaited = false;
    }
  }

  #hostInLobby(session: Session): Session {
    assertHost(session.room, session.player);
    if (session.room.status !== 'lobby') throw new DomainError('WRONG_PHASE');
    return session;
  }

  #addPlayer(room: Room, nickname: string): { player: Player; token: string } {
    const token = this.#random.token();
    const player: Player = {
      id: this.#random.id(12),
      tokenHash: hashToken(token),
      nickname,
      joinedAt: this.#clock.now(),
      socketId: null,
      // Not connected until its socket arrives: a player who never connects gets removed.
      disconnectedAt: this.#clock.now(),
      role: room.status === 'lobby' ? 'player' : 'waiting',
      unawaited: false,
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
    if (room.runner?.isParticipant(player.id)) {
      room.runner.playerChanged({ playerId: player.id, kind: 'left' });
    }
  }

  #closeRoom(room: Room, reason: RoomCloseReason): void {
    this.media.deleteRoom(room.id);
    room.runner?.dispose();
    room.runner = null;
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

function contractOf(game: AnyGameDefinition): GameContract {
  return game.contract as GameContract;
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
