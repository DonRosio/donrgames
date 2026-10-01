import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.ts';
import type { App } from '../../app.ts';
import { testConfig } from '../../test/helpers.ts';

let built: App;

beforeEach(async () => {
  built = await buildApp({ config: testConfig(), sweepIntervalMs: 0 });
});

afterEach(async () => {
  await built.app.close();
});

const create = (nickname: unknown, headers: Record<string, string> = {}) =>
  built.app.inject({ method: 'POST', url: '/api/rooms', payload: { nickname }, headers });

const join = (code: string, nickname = 'Tom', remoteAddress = '10.0.0.1') =>
  built.app.inject({
    method: 'POST',
    url: '/api/rooms/join',
    payload: { code, nickname },
    remoteAddress,
  });

describe('HTTP API', () => {
  it('reports its health and the game catalog', async () => {
    expect((await built.app.inject('/api/health')).json()).toEqual({ ok: true });
    const catalog = (await built.app.inject('/api/games')).json() as { meta: { id: string } }[];
    expect(catalog.map((game) => game.meta.id)).toEqual(['dubbing', 'among-legends', 'bluff']);
  });

  it('creates a room and returns a code and a 256-bit token', async () => {
    const response = await create('Léa');
    expect(response.statusCode).toBe(201);
    const { code, token } = response.json();
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('creates a room for the chosen game, and refuses an unknown one', async () => {
    const chosen = await built.app.inject({
      method: 'POST',
      url: '/api/rooms',
      payload: { nickname: 'Léa', gameId: 'among-legends' },
    });
    expect(chosen.statusCode).toBe(201);
    const { code } = chosen.json();
    expect(built.rooms.getRoom(code)?.selectedGame).toBe('among-legends');

    const unknown = await create('Tom');
    expect(unknown.statusCode).toBe(201);
    expect(built.rooms.getRoom(unknown.json().code)?.selectedGame).toBe('dubbing');

    const missing = await built.app.inject({
      method: 'POST',
      url: '/api/rooms',
      payload: { nickname: 'Zoé', gameId: 'nope' },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: 'GAME_NOT_FOUND' });
    const malformed = await built.app.inject({
      method: 'POST',
      url: '/api/rooms',
      payload: { nickname: 'Zoé', gameId: '../x' },
    });
    expect(malformed.statusCode).toBe(400);
  });

  it('joins with a case-insensitive code', async () => {
    const { code } = (await create('Léa')).json();
    const response = await join(` ${code.toLowerCase()} `);
    expect(response.statusCode).toBe(200);
    expect(response.json().code).toBe(code);
  });

  it('answers with error codes only', async () => {
    expect((await create('A')).json()).toEqual({ error: 'NICKNAME_TOO_SHORT' });
    expect((await create(42)).json()).toEqual({ error: 'INVALID_PAYLOAD' });
    const { code } = (await create('Léa')).json();
    const duplicate = await join(code, 'léa');
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual({ error: 'NICKNAME_TAKEN' });
    expect((await join('ZZZZZZ')).json()).toEqual({ error: 'ROOM_NOT_FOUND' });
    expect((await join('not a code')).json()).toEqual({ error: 'ROOM_NOT_FOUND' });
  });

  it('rejects malformed JSON and unknown routes without details', async () => {
    const malformed = await built.app.inject({
      method: 'POST',
      url: '/api/rooms',
      payload: '{"nickname":',
      headers: { 'content-type': 'application/json' },
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toEqual({ error: 'INVALID_PAYLOAD' });
    const unknown = await built.app.inject('/api/nothing');
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toEqual({ error: 'NOT_FOUND' });
  });

  it('rejects an oversized body', async () => {
    const response = await create('x'.repeat(40_000));
    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual({ error: 'PAYLOAD_TOO_LARGE' });
  });

  it('limits room creation to 5 per minute per client', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await create(`Joueur${i}`)).statusCode);
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
  });

  it('behind a proxy, ignores the forged start of X-Forwarded-For', async () => {
    const proxied = await buildApp({
      config: testConfig({ TRUST_PROXY: 'true' }),
      sweepIntervalMs: 0,
    });
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const response = await proxied.app.inject({
        method: 'POST',
        url: '/api/rooms',
        payload: { nickname: `Joueur${i}` },
        // The client varies the first entry; the proxy appends the real address.
        headers: { 'x-forwarded-for': `10.9.9.${i}, 203.0.113.7` },
      });
      statuses.push(response.statusCode);
    }
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
    await proxied.app.close();
  });

  it('blocks a client after 10 wrong codes, without affecting others', async () => {
    const { code } = (await create('Léa')).json();
    for (let i = 0; i < 10; i++) expect((await join('ZZZZZZ')).statusCode).toBe(404);
    expect((await join(code)).json()).toEqual({ error: 'RATE_LIMITED' });
    expect((await join(code, 'Zoé', '10.0.0.2')).statusCode).toBe(200);
  });

  it('refuses state-changing requests from another origin', async () => {
    const response = await create('Léa', {
      origin: 'https://evil.example',
      host: 'localhost:3000',
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'FORBIDDEN_ORIGIN' });
  });

  it('sends strict security headers', async () => {
    const response = await built.app.inject('/api/health');
    const csp = String(response.headers['content-security-policy']);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(response.headers).toMatchObject({
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'cross-origin-opener-policy': 'same-origin',
      'cache-control': 'no-store',
    });
    expect(response.headers['permissions-policy']).toContain('microphone=(self)');
    // No HSTS without HTTPS (development / local production test).
    expect(response.headers['strict-transport-security']).toBeUndefined();
  });

  it('enables HSTS and upgrade-insecure-requests behind an HTTPS public origin', async () => {
    const secure = await buildApp({
      config: testConfig({ PUBLIC_ORIGIN: 'https://jeux.example.com' }),
      sweepIntervalMs: 0,
    });
    const response = await secure.app.inject('/api/health');
    expect(response.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(String(response.headers['content-security-policy'])).toContain(
      "connect-src 'self' wss://jeux.example.com",
    );
    await secure.app.close();
  });
});
