import { isRoomCode, normalizeRoomCode } from '@mini-jeux/shared';

export type Route =
  | { name: 'home'; joinCode: string | null }
  | { name: 'room'; code: string }
  /** Components gallery, available in development only. */
  | { name: 'devGallery' };

/** Three routes (/, /join/:code, /room/:code) plus the dev gallery. Anything else leads home. */
export function matchRoute(pathname: string): Route {
  if (pathname === '/dev/ui') return { name: 'devGallery' };
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
