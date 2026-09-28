import type { ConnectionStatus } from '../session/session.ts';
import styles from './ConnectionBanner.module.css';

/** Shown while the realtime connection is being (re)established. */
export function ConnectionBanner({ status }: { status: ConnectionStatus }) {
  if (status !== 'reconnecting') return null;
  return (
    <div className={styles.banner} role="status">
      Connexion perdue, reconnexion en cours…
    </div>
  );
}
