import type { ContentHistory } from '@mini-jeux/shared';

// Storage can be unavailable (private mode, blocked site data): every access is guarded.
function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, value: string | null): void {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch {
    // Nothing to do: the feature simply degrades.
  }
}

const local = () => window.localStorage;
const perTab = () => window.sessionStorage;

const SESSION_KEY = 'mini-jeux:session';
const NICKNAME_KEY = 'mini-jeux:nickname';
const HISTORY_KEY = 'mini-jeux:history';

export interface StoredSession {
  code: string;
  token: string;
}

/** Session token: sessionStorage, so each tab is its own player. */
export const sessionStore = {
  load(): StoredSession | null {
    try {
      const value: unknown = JSON.parse(read(perTab, SESSION_KEY) ?? 'null');
      if (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as StoredSession).code === 'string' &&
        typeof (value as StoredSession).token === 'string'
      ) {
        return value as StoredSession;
      }
    } catch {
      // Corrupted value: ignored.
    }
    return null;
  },
  save(session: StoredSession): void {
    write(perTab, SESSION_KEY, JSON.stringify(session));
  },
  clear(): void {
    write(perTab, SESSION_KEY, null);
  },
};

/** Last nickname used on this device, for convenience. */
export const nicknameStore = {
  load: (): string => read(local, NICKNAME_KEY) ?? '',
  save: (nickname: string): void => write(local, NICKNAME_KEY, nickname),
};

/** Ids of the content already played on this device, sent when creating or joining a room. */
export const historyStore = {
  load(): ContentHistory {
    try {
      const value: unknown = JSON.parse(read(local, HISTORY_KEY) ?? '{}');
      if (typeof value !== 'object' || value === null) return {};
      return Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, string[]] =>
            Array.isArray(entry[1]) && entry[1].every((id) => typeof id === 'string'),
        ),
      );
    } catch {
      return {};
    }
  },
  isEmpty(): boolean {
    return Object.values(this.load()).every((ids) => ids.length === 0);
  },
  clear(): void {
    write(local, HISTORY_KEY, null);
  },
};
