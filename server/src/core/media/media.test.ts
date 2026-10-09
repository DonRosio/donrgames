import { describe, expect, it } from 'vitest';
import { MediaStore } from './media-store.ts';
import { sniffMime } from './sniff.ts';

describe('sniffMime', () => {
  it('recognizes the accepted containers by their magic bytes', () => {
    expect(sniffMime(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01]))).toBe('audio/webm');
    expect(sniffMime(Buffer.from('OggS\x00\x02', 'latin1'))).toBe('audio/ogg');
    expect(sniffMime(Buffer.from('\x00\x00\x00\x18ftypM4A ', 'latin1'))).toBe('audio/mp4');
    expect(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe(
      'image/png',
    );
    expect(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(sniffMime(Buffer.from('<script>alert(1)</script>'))).toBeNull();
    expect(sniffMime(Buffer.alloc(0))).toBeNull();
  });
});

describe('MediaStore', () => {
  const setup = (limits = { maxBytesPerRoom: 10, maxBytesTotal: 15, ttlMs: 1000 }) => {
    const clock = { t: 0, now: () => clock.t };
    let n = 0;
    const store = new MediaStore({ clock, newId: () => `m${++n}`, limits });
    return { clock, store };
  };
  const put = (store: MediaStore, roomId: string, size: number) =>
    store.put({ roomId, ownerId: 'p', mime: 'audio/webm', data: Buffer.alloc(size, 1) });

  it('enforces per-room and global quotas', () => {
    const { store } = setup();
    expect(put(store, 'r1', 8)).not.toBeNull();
    expect(put(store, 'r1', 3)).toBeNull();
    expect(put(store, 'r2', 7)).not.toBeNull();
    expect(put(store, 'r3', 1)).toBeNull();
    expect(store.totalBytes).toBe(15);
  });

  it('deletes a room and wipes the data', () => {
    const { store } = setup();
    const media = put(store, 'r1', 4)!;
    const data = media.data;
    store.deleteRoom('r1');
    expect(store.get(media.id)).toBeUndefined();
    expect(data.every((byte) => byte === 0)).toBe(true);
    expect(store.totalBytes).toBe(0);
  });

  it('expires anything older than its lifetime', () => {
    const { store, clock } = setup();
    const media = put(store, 'r1', 4)!;
    clock.t = 999;
    store.sweep();
    expect(store.get(media.id)).toBeDefined();
    clock.t = 1000;
    store.sweep();
    expect(store.get(media.id)).toBeUndefined();
  });
});
