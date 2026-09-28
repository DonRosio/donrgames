import type { FastifyInstance } from 'fastify';
import type { ErrorCode } from '@mini-jeux/shared';
import { GameRuleError } from '../engine/types.ts';
import { DomainError, httpStatusOf } from '../lib/errors.ts';

/** Every error becomes `{ error: CODE }`: no message, no stack trace ever reaches the client. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof DomainError) {
      return reply.code(httpStatusOf(error.code)).send({ error: error.code });
    }
    // A game rule refused an upload (e.g. a take already validated by a concurrent request).
    if (error instanceof GameRuleError) return reply.code(409).send({ error: error.code });
    const status = (error as { statusCode?: unknown }).statusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      const code: ErrorCode =
        status === 413 ? 'PAYLOAD_TOO_LARGE' : status === 429 ? 'RATE_LIMITED' : 'INVALID_PAYLOAD';
      return reply.code(status).send({ error: code });
    }
    request.log.error({ err: error }, 'unhandled error');
    return reply.code(500).send({ error: 'INTERNAL' });
  });
}
