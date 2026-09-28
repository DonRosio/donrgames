import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};
window.addEventListener('popstate', notify);

export function navigate(path: string, options: { replace?: boolean } = {}): void {
  if (options.replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  notify();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function usePathname(): string {
  return useSyncExternalStore(subscribe, () => location.pathname);
}

/** One-shot message shown on the home page (e.g. after being kicked). */
let flash: string | null = null;

export function setFlash(message: string): void {
  flash = message;
}

export function takeFlash(): string | null {
  const message = flash;
  flash = null;
  return message;
}
