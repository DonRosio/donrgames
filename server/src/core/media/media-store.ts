import type { Clock } from '../lib/time.ts';

export interface StoredMedia {
  id: string;
  roomId: string;
  ownerId: string;
  mime: string;
  data: Buffer;
  storedAt: number;
}

export interface MediaStoreLimits {
  maxBytesPerRoom: number;
  maxBytesTotal: number;
  /** Safety net: anything older is deleted, whatever happens to the game. */
  ttlMs: number;
}

export const DEFAULT_MEDIA_LIMITS: MediaStoreLimits = {
  maxBytesPerRoom: 30 * 1024 * 1024,
  maxBytesTotal: 300 * 1024 * 1024,
  ttlMs: 2 * 60 * 60 * 1000,
};

/**
 * Private recordings, in RAM only: nothing is ever written to disk, so a crash or a restart
 * leaves nothing behind. Ids are random and generated here.
 */
export class MediaStore {
  readonly #clock: Clock;
  readonly #newId: () => string;
  readonly #limits: MediaStoreLimits;
  readonly #items = new Map<string, StoredMedia>();
  #totalBytes = 0;

  constructor(options: { clock: Clock; newId: () => string; limits?: MediaStoreLimits }) {
    this.#clock = options.clock;
    this.#newId = options.newId;
    this.#limits = options.limits ?? DEFAULT_MEDIA_LIMITS;
  }

  get totalBytes(): number {
    return this.#totalBytes;
  }

  /** Returns null when a quota would be exceeded. */
  put(input: { roomId: string; ownerId: string; mime: string; data: Buffer }): StoredMedia | null {
    const roomBytes = this.#roomBytes(input.roomId);
    if (
      roomBytes + input.data.length > this.#limits.maxBytesPerRoom ||
      this.#totalBytes + input.data.length > this.#limits.maxBytesTotal
    ) {
      return null;
    }
    const media: StoredMedia = { ...input, id: this.#newId(), storedAt: this.#clock.now() };
    this.#items.set(media.id, media);
    this.#totalBytes += media.data.length;
    return media;
  }

  get(id: string): StoredMedia | undefined {
    return this.#items.get(id);
  }

  delete(id: string): void {
    const media = this.#items.get(id);
    if (!media) return;
    this.#items.delete(id);
    this.#totalBytes -= media.data.length;
    media.data.fill(0);
  }

  deleteRoom(roomId: string): void {
    for (const media of [...this.#items.values()])
      if (media.roomId === roomId) this.delete(media.id);
  }

  sweep(): void {
    const now = this.#clock.now();
    for (const media of [...this.#items.values()]) {
      if (now - media.storedAt >= this.#limits.ttlMs) this.delete(media.id);
    }
  }

  #roomBytes(roomId: string): number {
    let total = 0;
    for (const media of this.#items.values())
      if (media.roomId === roomId) total += media.data.length;
    return total;
  }
}
