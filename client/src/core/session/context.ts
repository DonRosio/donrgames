import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { localNow } from './clock.ts';
import type { Session, SessionSnapshot } from './session.ts';

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside a room');
  return session;
}

export function useSessionSnapshot(): SessionSnapshot {
  const session = useSession();
  return useSyncExternalStore(session.subscribe, session.getSnapshot);
}

/**
 * Estimated server time, refreshed every `refreshMs`. Outside of a room (dev gallery) the local
 * clock is used as is.
 */
export function useServerNow(refreshMs = 250): number {
  const session = useContext(SessionContext);
  const offset = session?.getSnapshot().clock?.offsetMs ?? 0;
  const [now, setNow] = useState(() => localNow() + offset);
  useEffect(() => {
    const timer = setInterval(() => setNow(localNow() + offset), refreshMs);
    return () => clearInterval(timer);
  }, [offset, refreshMs]);
  return now;
}
