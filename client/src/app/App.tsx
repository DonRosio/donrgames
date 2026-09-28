import { Suspense, lazy } from 'react';
import { HomePage } from '../core/pages/HomePage.tsx';
import { RoomPage } from '../core/pages/RoomPage.tsx';
import { matchRoute } from './routes.ts';
import { usePathname } from './router.ts';

// Development only: the condition is false in production builds, so the gallery is left out.
const DevGallery = import.meta.env.DEV
  ? lazy(() => import('../core/dev/DevGallery.tsx').then((m) => ({ default: m.DevGallery })))
  : null;

export function App() {
  const route = matchRoute(usePathname());
  if (route.name === 'room') return <RoomPage key={route.code} code={route.code} />;
  if (route.name === 'devGallery' && DevGallery) {
    return (
      <Suspense fallback={null}>
        <DevGallery />
      </Suspense>
    );
  }
  const joinCode = route.name === 'home' ? route.joinCode : null;
  return <HomePage key={joinCode ?? ''} joinCode={joinCode} />;
}
