import { createReadStream } from 'node:fs';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { UploadResponse } from '@mini-jeux/shared';
import { contentIdSchema, gameIdSchema, sessionTokenSchema } from '@mini-jeux/shared/schemas';
import type { UploadPermit } from '../engine/runner.ts';
import { DomainError } from '../lib/errors.ts';
import { FixedWindowLimiter } from '../lib/rate-limit.ts';
import type { Clock } from '../lib/time.ts';
import { parseInput } from '../lib/validation.ts';
import { sniffAudio } from '../media/sniff.ts';
import type { RoomManager, Session } from '../rooms/room-manager.ts';

/** Hard ceiling for any upload body; each game sets a stricter limit per file. */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const MAX_META_LENGTH = 1024;

const kindParams = z.strictObject({ kind: z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,31}$/) });
const mediaParams = z.strictObject({ id: z.string().regex(/^[A-Za-z0-9_-]{22}$/) });
const contentParams = z.strictObject({ gameId: gameIdSchema, contentId: contentIdSchema });

interface PendingUpload {
  session: Session;
  permit: UploadPermit;
  mime: string;
}

/**
 * Private files: recordings sent by the players (kept in RAM) and content files (videos).
 * Everything requires the session token, and the running game decides who may read what, when.
 */
export function registerMediaRoutes(
  app: FastifyInstance,
  deps: { rooms: RoomManager; clock: Clock },
): { sweep(): void } {
  const { rooms, clock } = deps;
  const uploadLimiter = new FixedWindowLimiter({ limit: 10, windowMs: 60_000, clock });
  const pending = new WeakMap<FastifyRequest, PendingUpload>();

  const sessionOf = (request: FastifyRequest): Session => {
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const session = sessionTokenSchema.safeParse(token).success ? rooms.authenticate(token) : null;
    if (!session) throw new DomainError('SESSION_INVALID');
    return session;
  };

  app.addContentTypeParser(
    /^audio\//,
    { parseAs: 'buffer', bodyLimit: MAX_UPLOAD_BYTES },
    (_request, body, done) => done(null, body),
  );

  app.post('/api/uploads/:kind', {
    // Everything that can be checked without the body is checked before receiving it.
    onRequest: async (request) => {
      const session = sessionOf(request);
      if (!uploadLimiter.hit(session.player.id)) throw new DomainError('RATE_LIMITED');
      const { kind } = parseInput(kindParams, request.params);
      const rawMeta = request.headers['x-upload-meta'];
      if (typeof rawMeta !== 'string' || rawMeta.length > MAX_META_LENGTH) {
        throw new DomainError('INVALID_PAYLOAD');
      }
      let meta: unknown;
      try {
        meta = JSON.parse(rawMeta);
      } catch {
        throw new DomainError('INVALID_PAYLOAD');
      }
      const permit = rooms.acceptUpload(session, kind, meta);
      const mime = (request.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
      if (!permit.mimeTypes.includes(mime)) throw new DomainError('UNSUPPORTED_MEDIA');
      const length = Number(request.headers['content-length']);
      if (!Number.isInteger(length) || length <= 0) throw new DomainError('INVALID_PAYLOAD');
      if (length > permit.maxBytes) throw new DomainError('PAYLOAD_TOO_LARGE');
      pending.set(request, { session, permit, mime });
    },
    handler: async (request, reply) => {
      const upload = pending.get(request);
      const data = request.body;
      if (!upload || !Buffer.isBuffer(data)) throw new DomainError('INVALID_PAYLOAD');
      if (data.length > upload.permit.maxBytes) throw new DomainError('PAYLOAD_TOO_LARGE');
      // The declared type must match the real content of the file.
      if (sniffAudio(data) !== upload.mime) throw new DomainError('UNSUPPORTED_MEDIA');
      const { kind } = parseInput(kindParams, request.params);
      const stored = rooms.completeUpload(upload.session, kind, {
        data,
        mime: upload.mime,
        meta: upload.permit.meta,
      });
      const response: UploadResponse = { mediaId: stored.id };
      return reply.code(201).send(response);
    },
  });

  app.get('/api/media/:id', async (request, reply) => {
    const session = sessionOf(request);
    const { id } = parseInput(mediaParams, request.params);
    const media = rooms.readableMedia(session, id);
    // Unknown, from another room or not readable yet: same answer.
    if (!media) throw new DomainError('NOT_FOUND');
    return reply.header('Content-Type', media.mime).send(media.data);
  });

  app.get('/api/content/:gameId/:contentId', async (request, reply) => {
    const session = sessionOf(request);
    const { gameId, contentId } = parseInput(contentParams, request.params);
    const item = rooms.readableContent(session, gameId, contentId);
    if (!item) throw new DomainError('NOT_FOUND');
    return reply
      .header('Content-Type', 'video/mp4')
      .header('Content-Length', item.size)
      .send(createReadStream(item.file));
  });

  return { sweep: () => uploadLimiter.sweep() };
}
