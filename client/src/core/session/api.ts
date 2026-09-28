import { isErrorCode } from '@mini-jeux/shared';
import type {
  CreateRoomRequest,
  GameMeta,
  JoinRoomRequest,
  SessionResponse,
} from '@mini-jeux/shared';
import { ApiError } from './errors.ts';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    });
  } catch {
    throw new ApiError('NETWORK');
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code = (body as { error?: unknown } | null)?.error;
    // 502-504 without an error code: a proxy could not reach the Node server.
    const fallback = response.status >= 502 && response.status <= 504 ? 'NETWORK' : 'INTERNAL';
    throw new ApiError(isErrorCode(code) ? code : fallback);
  }
  return body as T;
}

export const api = {
  games: () => request<GameMeta[]>('/api/games'),
  createRoom: (body: CreateRoomRequest) =>
    request<SessionResponse>('/api/rooms', { method: 'POST', body: JSON.stringify(body) }),
  joinRoom: (body: JoinRoomRequest) =>
    request<SessionResponse>('/api/rooms/join', { method: 'POST', body: JSON.stringify(body) }),
};
