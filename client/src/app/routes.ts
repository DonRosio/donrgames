import { isRoomCode, normalizeRoomCode } from '@mini-jeux/shared';

export type Route = { name: 'home'; joinCode: string | null } | { name: 'room'; code: string };

/** Three routes only: /, /join/:code and /room/:code. Anything else leads home. */
export function matchRoute(pathname: string): Route {
  const [, section, rawCode, ...rest] = pathname.split('/');
  if (rawCode !== undefined && rest.length === 0) {
    const code = normalizeRoomCode(decodeURIComponent(rawCode));
    if (isRoomCode(code)) {
      if (section === 'join') return { name: 'home', joinCode: code };
      if (section === 'room') return { name: 'room', code };
    }
  }
  return { name: 'home', joinCode: null };
}
