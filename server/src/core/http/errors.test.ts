import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { GameRuleError } from '../engine/types.ts';
import { DomainError } from '../lib/errors.ts';
import { registerErrorHandler } from './errors.ts';

async function appThrowing(error: Error) {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  app.get('/boom', async () => {
    throw error;
  });
  const response = await app.inject('/boom');
  await app.close();
  return { status: response.statusCode, body: response.body };
}

describe('HTTP error handler', () => {
  it('sends the code of expected errors', async () => {
    expect(await appThrowing(new DomainError('NOT_HOST'))).toEqual({
      status: 403,
      body: '{"error":"NOT_HOST"}',
    });
  });

  it('turns a game rule refusal (e.g. during an upload) into a 409, not a crash', async () => {
    expect(await appThrowing(new GameRuleError('TAKE_LOCKED'))).toEqual({
      status: 409,
      body: '{"error":"TAKE_LOCKED"}',
    });
  });

  it('never reveals anything about an unexpected error', async () => {
    const result = await appThrowing(new Error('secret detail at /home/user/file.ts:12'));
    expect(result).toEqual({ status: 500, body: '{"error":"INTERNAL"}' });
  });
});
