import { useRef } from 'react';
import type { SettingValue } from '@mini-jeux/shared';
import { ROLES, ROLE_IDS } from '@mini-jeux/shared/games/among-legends-roles';
import styles from './among-legends.module.css';

/**
 * Every role with its mission and its points, in a strip that scrolls sideways (mouse wheel,
 * swipe, arrow keys once focused, or the two buttons). Roles the host did not keep are dimmed.
 */
export function RolesCarousel({ settings }: { settings: Record<string, SettingValue> }) {
  const track = useRef<HTMLUListElement>(null);
  const kept = (settings.roles as readonly string[] | undefined) ?? [];

  const scroll = (direction: -1 | 1) => {
    const element = track.current;
    if (!element) return;
    const card = element.firstElementChild as HTMLElement | null;
    const step = (card?.offsetWidth ?? 280) + 16;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollBy({ left: direction * step, behavior: reduced ? 'auto' : 'smooth' });
  };

  return (
    <section className={`card ${styles.carousel}`} aria-labelledby="roles-title">
      <div className={styles.carouselHeader}>
        <h3 id="roles-title">Les rôles</h3>
        <div className={styles.carouselButtons}>
          <button type="button" className="btn btn-small" onClick={() => scroll(-1)}>
            <span aria-hidden="true">←</span>
            <span className="visually-hidden">Rôle précédent</span>
          </button>
          <button type="button" className="btn btn-small" onClick={() => scroll(1)}>
            <span aria-hidden="true">→</span>
            <span className="visually-hidden">Rôle suivant</span>
          </button>
        </div>
      </div>
      <ul
        ref={track}
        className={styles.track}
        tabIndex={0}
        aria-label="Rôles, à faire défiler de gauche à droite"
      >
        {ROLE_IDS.map((id) => {
          const role = ROLES[id];
          const status = role.inDevelopment
            ? 'en développement'
            : kept.includes(id)
              ? null
              : 'non retenu';
          return (
            <li
              key={id}
              className={status ? `${styles.roleTile} ${styles.outOfGame}` : styles.roleTile}
            >
              <h4 className={styles.tileName}>{role.name}</h4>
              {status && <span className={styles.tag}>{status}</span>}
              <p className={styles.tileGoal}>{role.goal}</p>
              <p className={styles.tilePointsTitle}>Points</p>
              <ul className={styles.points}>
                {role.points.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
