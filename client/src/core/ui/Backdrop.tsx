import backdropUrl from '../../assets/backdrop.webp';
import styles from './Backdrop.module.css';

/** Fixed painted sunset behind every page (design/fond.jpeg), with a soft scrim for legibility. */
export function Backdrop() {
  return (
    <div
      className={styles.backdrop}
      style={{ backgroundImage: `url(${backdropUrl})` }}
      aria-hidden="true"
    />
  );
}
