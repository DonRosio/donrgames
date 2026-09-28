import { beforeEach, describe, expect, it } from 'vitest';
import { DomainError } from '../lib/errors.ts';
import type { RandomSource } from '../lib/random.ts';
import { DEFAULT_TIMINGS, RoomManager } from './room-manager.ts';
import type {
  Player,
  PlayerRemovalReason,
  Room,
  RoomCloseReason,
  Session,
} from './room-manager.ts';

const SECOND = 1000;
const MINUTE = 60 * SECOND;

function counterRandom(codes: string[] = []): RandomSource {
  let n = 0;
  return {
    token: () => `token-${++n}`,
    id: () => `id-${++n}`,
    string: (length) => codes.shift() ?? String(++n).padStart(length, 'X'),
  };
}

function setup(options: { maxRooms?: number; maxPlayersPerRoom?: number; codes?: string[] } = {}) {
  const clock = { t: 1_000_000, now: () => clock.t };
  const rooms = new RoomManager({
    clock,
    random: counterRandom(options.codes),
    limits: {
      maxRooms: options.maxRooms ?? 100,
      maxPlayersPerRoom: options.maxPlayersPerRoom ?? 10,
      timings: DEFAULT_TIMINGS,
    },
  });
  const log = {
    changed: [] as Room[],
    removed: [] as { player: Player; reason: PlayerRemovalReason }[],
    closed: [] as { room: Room; reason: RoomCloseReason }[],
  };
  rooms.setEvents({
    roomChanged: (room) => log.changed.push(room),
    playerRemoved: (_room, player, reason) => log.removed.push({ player, reason }),
    roomClosed: (room, reason) => log.closed.push({ room, reason }),
  });
  const advance = (ms: number) => {
    clock.t += ms;
    rooms.sweep();
  };
  return { rooms, clock, log, advance };
}

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return undefined;
}

describe('RoomManager', () => {
  let t: ReturnType<typeof setup>;
  let host: Session;

  beforeEach(() => {
    t = setup();
    host = t.rooms.createRoom({ nickname: '  Léa ', history: {} });
    t.rooms.attachSocket(host, 'socket-host');
  });

  const join = (nickname: string, socketId?: string) => {
    const session = t.rooms.joinRoom({ code: host.room.code, nickname, history: {} });
    if (socketId) t.rooms.attachSocket(session, socketId);
    return session;
  };

  describe('creating and joining', () => {
    it('creates a room whose creator is the host, with a normalized nickname', () => {
      expect(host.room.hostId).toBe(host.player.id);
      expect(host.player.nickname).toBe('Léa');
      expect(t.rooms.view(host.room, host.player.id)).toMatchObject({
        code: host.room.code,
        me: host.player.id,
        hostId: host.player.id,
        players: [{ nickname: 'Léa', connected: true, isHost: true }],
      });
    });

    it('never reuses the code of an active room', () => {
      const s = setup({ codes: ['AAAAAA', 'AAAAAA', 'BBBBBB'] });
      expect(s.rooms.createRoom({ nickname: 'Un', history: {} }).room.code).toBe('AAAAAA');
      expect(s.rooms.createRoom({ nickname: 'Deux', history: {} }).room.code).toBe('BBBBBB');
    });

    it('limits the number of active rooms', () => {
      const s = setup({ maxRooms: 1 });
      s.rooms.createRoom({ nickname: 'Un', history: {} });
      expect(errorCode(() => s.rooms.createRoom({ nickname: 'Deux', history: {} }))).toBe(
        'TOO_MANY_ROOMS',
      );
    });

    it('rejects invalid nicknames with a precise code', () => {
      expect(errorCode(() => t.rooms.createRoom({ nickname: 'A', history: {} }))).toBe(
        'NICKNAME_TOO_SHORT',
      );
      expect(errorCode(() => join('<script>'))).toBe('NICKNAME_INVALID');
    });

    it('rejects unknown codes, full rooms and duplicate nicknames', () => {
      expect(
        errorCode(() => t.rooms.joinRoom({ code: 'ZZZZZZ', nickname: 'Tom', history: {} })),
      ).toBe('ROOM_NOT_FOUND');
      expect(errorCode(() => join('LÉA'))).toBe('NICKNAME_TAKEN');

      const s = setup({ maxPlayersPerRoom: 2 });
      const h = s.rooms.createRoom({ nickname: 'Un', history: {} });
      s.rooms.joinRoom({ code: h.room.code, nickname: 'Deux', history: {} });
      expect(
        errorCode(() => s.rooms.joinRoom({ code: h.room.code, nickname: 'Trois', history: {} })),
      ).toBe('ROOM_FULL');
    });

    it('keeps the declared history of each device', () => {
      const session = t.rooms.joinRoom({
        code: host.room.code,
        nickname: 'Tom',
        history: { dubbing: ['raclette', 'herve1'] },
      });
      expect([...(session.player.history.get('dubbing') ?? [])]).toEqual(['raclette', 'herve1']);
    });
  });

  describe('sessions', () => {
    it('authenticates with the token only, which is stored hashed', () => {
      const session = t.rooms.joinRoom({ code: host.room.code, nickname: 'Tom', history: {} });
      expect(t.rooms.authenticate(session.token)?.player).toBe(session.player);
      expect(t.rooms.authenticate('forged-token')).toBeNull();
      expect(session.player.tokenHash).not.toContain(session.token);
    });

    it('lets a new connection replace the previous one', () => {
      expect(t.rooms.attachSocket(host, 'socket-2')).toBe('socket-host');
      // The replaced socket disconnecting afterwards must not mark the player offline.
      t.rooms.detachSocket(host, 'socket-host');
      expect(host.player.socketId).toBe('socket-2');
    });

    it('marks a player disconnected, then connected again on reconnection', () => {
      const tom = join('Tom', 'socket-tom');
      t.rooms.detachSocket(tom, 'socket-tom');
      expect(t.rooms.view(host.room, host.player.id).players[1]?.connected).toBe(false);
      t.advance(30 * SECOND);
      t.rooms.attachSocket(tom, 'socket-tom-2');
      expect(t.rooms.view(host.room, host.player.id).players[1]?.connected).toBe(true);
    });
  });

  describe('host actions', () => {
    it('kicks a player, whose session becomes invalid', () => {
      const tom = join('Tom', 'socket-tom');
      t.rooms.kick(host, tom.player.id);
      expect(t.log.removed).toEqual([{ player: tom.player, reason: 'kicked' }]);
      expect(t.rooms.authenticate(tom.token)).toBeNull();
      expect(host.room.players.size).toBe(1);
    });

    it('refuses host actions from other players', () => {
      const tom = join('Tom', 'socket-tom');
      expect(errorCode(() => t.rooms.kick(tom, host.player.id))).toBe('NOT_HOST');
      expect(errorCode(() => t.rooms.transferHost(tom, tom.player.id))).toBe('NOT_HOST');
      expect(errorCode(() => t.rooms.close(tom))).toBe('NOT_HOST');
    });

    it('validates the target of host actions', () => {
      expect(errorCode(() => t.rooms.kick(host, 'unknown'))).toBe('PLAYER_NOT_FOUND');
      expect(errorCode(() => t.rooms.kick(host, host.player.id))).toBe('INVALID_PAYLOAD');
    });

    it('transfers the host role', () => {
      const tom = join('Tom', 'socket-tom');
      t.rooms.transferHost(host, tom.player.id);
      expect(host.room.hostId).toBe(tom.player.id);
    });

    it('closes the room and invalidates every session', () => {
      const tom = join('Tom', 'socket-tom');
      t.rooms.close(host);
      expect(t.log.closed).toEqual([{ room: host.room, reason: 'closed' }]);
      expect(t.rooms.getRoom(host.room.code)).toBeUndefined();
      expect(t.rooms.authenticate(tom.token)).toBeNull();
    });
  });

  describe('leaving', () => {
    it('hands the host role to the earliest arrived connected player', () => {
      join('Tom');
      const zoe = join('Zoé', 'socket-zoe');
      t.rooms.leave(host);
      expect(host.room.hostId).toBe(zoe.player.id);
    });

    it('closes the room when the last player leaves', () => {
      t.rooms.leave(host);
      expect(t.log.closed).toEqual([{ room: host.room, reason: 'empty' }]);
    });
  });

  describe('sweep', () => {
    it('transfers the host role after 60 s of disconnection only', () => {
      const tom = join('Tom', 'socket-tom');
      t.rooms.detachSocket(host, 'socket-host');
      t.advance(59 * SECOND);
      expect(host.room.hostId).toBe(host.player.id);
      t.advance(1 * SECOND);
      expect(host.room.hostId).toBe(tom.player.id);
    });

    it('keeps the host role if nobody else is connected', () => {
      join('Tom');
      t.rooms.detachSocket(host, 'socket-host');
      t.advance(2 * MINUTE);
      expect(host.room.hostId).toBe(host.player.id);
    });

    it('removes a player disconnected for 5 minutes from the lobby', () => {
      const tom = join('Tom', 'socket-tom');
      t.rooms.detachSocket(tom, 'socket-tom');
      t.advance(4 * MINUTE);
      expect(host.room.players.has(tom.player.id)).toBe(true);
      t.advance(1 * MINUTE);
      expect(host.room.players.has(tom.player.id)).toBe(false);
      expect(t.log.removed).toEqual([{ player: tom.player, reason: 'timeout' }]);
    });

    it('removes a player whose socket never arrived', () => {
      const tom = join('Tom');
      t.advance(5 * MINUTE);
      expect(host.room.players.has(tom.player.id)).toBe(false);
    });

    it('closes a room without any action for 60 minutes', () => {
      t.advance(59 * MINUTE);
      expect(t.log.closed).toEqual([]);
      t.advance(1 * MINUTE);
      expect(t.log.closed).toEqual([{ room: host.room, reason: 'expired' }]);
    });

    it('closes a room nobody ever connected to after 10 minutes', () => {
      const s = setup();
      const lonely = s.rooms.createRoom({ nickname: 'Solo', history: {} });
      s.advance(10 * MINUTE);
      expect(s.log.closed).toEqual([{ room: lonely.room, reason: 'expired' }]);
    });

    it('closes any room after 12 hours', () => {
      for (let i = 0; i < 12 * 60; i++) {
        t.clock.t += MINUTE;
        host.room.lastActionAt = t.clock.t; // keep the room active
        t.rooms.sweep();
      }
      expect(t.log.closed).toEqual([{ room: host.room, reason: 'expired' }]);
    });
  });
});
