import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import './styles/global.css';

// Former "already seen" history (feature removed): nothing of it is kept on the device.
try {
  localStorage.removeItem('mini-jeux:history');
} catch {
  // Storage unavailable: nothing to clean.
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
