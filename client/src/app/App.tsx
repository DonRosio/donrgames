import { HomePage } from '../core/pages/HomePage.tsx';
import { RoomPage } from '../core/pages/RoomPage.tsx';
import { matchRoute } from './routes.ts';
import { usePathname } from './router.ts';

export function App() {
  const route = matchRoute(usePathname());
  if (route.name === 'room') return <RoomPage key={route.code} code={route.code} />;
  return <HomePage key={route.joinCode ?? ''} joinCode={route.joinCode} />;
}
