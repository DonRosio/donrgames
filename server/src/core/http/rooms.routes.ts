import type { FastifyInstance } from 'fastify';
import { isRoomCode, normalizeRoomCode } from '@mini-jeux/shared';
import type { SessionResponse } from '@mini-jeux/shared';
import { createRoomBodySchema, joinRoomBodySchema } from '@mini-jeux/shared/schemas';
import { DomainError } from '../lib/errors.ts';
import { FailureLimiter, FixedWindowLimiter } from '../lib/rate-limit.ts';
import type { Clock } from '../lib/time.ts';
import { parseInput } from '../lib/validation.ts';
import type { RoomManager } from '../rooms/room-manager.ts';

const MINUTE = 60_000;

export function registerRoomRoutes(
  app: FastifyInstance,
  deps: { rooms: RoomManager; clock: Clock; ipKey: (ip: string) => string },
): { sweep(): void } {
  const { rooms, clock, ipKey } = deps;
  const createLimiter = new FixedWindowLimiter({ limit: 5, windowMs: MINUTE, clock });
  const joinLimiter = new FixedWindowLimiter({ limit: 20, windowMs: MINUTE, clock });
  // Brute force on codes: 10 wrong codes in 10 minutes block the client for 10 minutes.
  const wrongCodes = new FailureLimiter({
    maxFailures: 10,
    windowMs: 10 * MINUTE,
    blockMs: 10 * MINUTE,
    clock,
  });

  app.post('/api/rooms', async (request, reply) => {
    if (!createLimiter.hit(ipKey(request.ip))) throw new DomainError('RATE_LIMITED');
    const body = parseInput(createRoomBodySchema, request.body);
    const { room, token } = rooms.createRoom(body);
    request.log.info({ room: room.id }, 'room created');
    const response: SessionResponse = { code: room.code, token };
    return reply.code(201).send(response);
  });

  app.post('/api/rooms/join', async (request) => {
    const key = ipKey(request.ip);
    if (!joinLimiter.hit(key) || wrongCodes.isBlocked(key)) throw new DomainError('RATE_LIMITED');
    const body = parseInput(joinRoomBodySchema, request.body);
    const code = normalizeRoomCode(body.code);
    if (!isRoomCode(code) || !rooms.getRoom(code)) {
      wrongCodes.recordFailure(key);
      throw new DomainError('ROOM_NOT_FOUND');
    }
    const { room, token } = rooms.joinRoom({
      code,
      nickname: body.nickname,
      history: body.history,
    });
    request.log.info({ room: room.id }, 'player joined');
    const response: SessionResponse = { code: room.code, token };
    return response;
  });

  return {
    sweep() {
      createLimiter.sweep();
      joinLimiter.sweep();
      wrongCodes.sweep();
    },
  };
}
