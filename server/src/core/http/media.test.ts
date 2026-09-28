import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ack } from '@mini-jeux/shared';
import { dubbingGame } from '../../games/dubbing/index.ts';
import { fakeMp4 } from '../../test/fake-mp4.ts';
import type { ContentLibrary } from '../content/library.ts';
import { next, startServer, stateMatching } from '../../test/helpers.ts';
import type { TestSocket } from '../../test/helpers.ts';

let server: Awaited<ReturnType<typeof startServer>>;
let videoFile: string;

beforeEach(async () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'video-'));
  videoFile = path.join(folder, 'clip.mp4');
  const data = fakeMp4(5_000);
  writeFileSync(videoFile, data);
  const library: ContentLibrary = {
    gameId: 'dubbing',
    items: [{ id: 'clip', title: 'Clip', durationMs: 5_000, file: videoFile, size: data.length }],
    problems: [],
  };
  server = await startServer({ games: [dubbingGame], content: new Map([['dubbing', library]]) });
});

afterEach(async () => {
  await server.close();
});

const emit = (socket: TestSocket, event: string, payload: unknown = {}): Promise<Ack> =>
  new Promise((resolve) => {
    (socket as unknown as { emit: (...args: unknown[]) => void }).emit(event, payload, resolve);
  });

const webm = (size: number) =>
  Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(size - 4, 7)]);

function upload(token: string, body: Buffer, headers: Record<string, string> = {}) {
  return fetch(`${server.origin}/api/uploads/take`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'audio/webm;codecs=opus',
      'x-upload-meta': JSON.stringify({ offsetMs: 30, durationMs: 5000 }),
      ...headers,
    },
    body,
  });
}

async function gameInRecording() {
  const created = await server.createRoom('Alice');
  const alice = server.connect(created.token);
  await next(alice, 'room:state');
  const joined = await server.joinRoom(created.code, 'Bob');
  const bob = server.connect(joined.token);
  await next(bob, 'room:state');
  const playing = stateMatching(alice, (room) => room.status === 'playing');
  expect(await emit(alice, 'room:startGame')).toEqual({ ok: true, data: null });
  await playing;
  await emit(alice, 'game:skip'); // loading → broadcast
  await emit(alice, 'game:skip'); // broadcast → recording
  return { alice, bob, aliceToken: created.token, bobToken: joined.token };
}

describe('content and media routes', () => {
  it('requires a valid session token', async () => {
    expect((await fetch(`${server.origin}/api/content/dubbing/clip`)).status).toBe(401);
    const forged = await fetch(`${server.origin}/api/media/${'A'.repeat(22)}`, {
      headers: { authorization: `Bearer ${'A'.repeat(43)}` },
    });
    expect(forged.status).toBe(401);
  });

  it('serves the video of the round to the participants only while it is in use', async () => {
    const created = await server.createRoom('Alice');
    const get = (id: string, token = created.token) =>
      fetch(`${server.origin}/api/content/dubbing/${id}`, {
        headers: { authorization: `Bearer ${token}` },
      });
    // No game running yet.
    expect((await get('clip')).status).toBe(404);

    const { aliceToken } = await gameInRecording();
    const response = await get('clip', aliceToken);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('video/mp4');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
    expect((await get('other', aliceToken)).status).toBe(404);
  });

  it('accepts one valid take per player and checks everything else', async () => {
    const { aliceToken, bobToken } = await gameInRecording();

    const wrongType = await upload(aliceToken, webm(1000), { 'content-type': 'audio/wav' });
    expect(wrongType.status).toBe(415);
    const fakeContent = await upload(aliceToken, Buffer.from('<html>not audio</html>'));
    expect(await fakeContent.json()).toEqual({ error: 'UNSUPPORTED_MEDIA' });
    // Limit for a 5 s video: (5 + 3) s × 40 kB/s.
    const tooBig = await upload(aliceToken, webm(8 * 40_000 + 1));
    expect(tooBig.status).toBe(413);
    const badMeta = await upload(aliceToken, webm(1000), { 'x-upload-meta': '{"offsetMs":"x"}' });
    expect(badMeta.status).toBe(400);

    const ok = await upload(aliceToken, webm(1000));
    expect(ok.status).toBe(201);
    const { mediaId } = (await ok.json()) as { mediaId: string };
    expect(mediaId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(server.rooms.media.get(mediaId)?.mime).toBe('audio/webm');

    // Locked once validated.
    expect((await upload(aliceToken, webm(1000))).status).toBe(409);
    // Nobody can listen to it during the recording, not even its author.
    for (const token of [aliceToken, bobToken]) {
      const read = await fetch(`${server.origin}/api/media/${mediaId}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(read.status).toBe(404);
    }
  });

  it('deletes the takes when the room closes', async () => {
    const { alice, aliceToken } = await gameInRecording();
    await upload(aliceToken, webm(1000));
    expect(server.rooms.media.totalBytes).toBe(1000);
    await emit(alice, 'room:close');
    expect(server.rooms.media.totalBytes).toBe(0);
  });
});
