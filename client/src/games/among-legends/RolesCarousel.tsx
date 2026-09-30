import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import type { SettingValue } from '@mini-jeux/shared';
import { ROLES, ROLE_IDS } from '@mini-jeux/shared/games/among-legends-roles';
import { pictureOf } from './role-pictures.ts';
import styles from './among-legends.module.css';

const COUNT = ROLE_IDS.length;
/** The list is shown three times in a row: the middle copy is the one we rest on. */
const COPIES = [0, 1, 2] as const;

/** Longest time a smooth scroll started by an arrow takes, with some margin. */
const ARROW_ANIMATION_MS = 1000;

/** Gap between two tiles, in px (the same value as `.track` in the stylesheet). */
const GAP = 16;

/** Chevron with thick rounded ends. The gradient is defined once, in `ArrowDefs`. */
function ArrowDefs() {
  return (
    <svg width="0" height="0" className={styles.arrowDefs} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="roles-arrow-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--sun)' }} />
          <stop offset="55%" style={{ stopColor: 'var(--accent-strong)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--accent)' }} />
        </linearGradient>
      </defs>
    </svg>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 64 100" className={styles.chevron} aria-hidden="true" focusable="false">
      <path
        d="M14 12 L48 50 L14 88"
        fill="none"
        stroke="url(#roles-arrow-gradient)"
        strokeWidth="19"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * One role at a time, full width, with its mission, its points and its picture on the right. The
 * carousel has no beginning and no end: the arrows, a swipe, a drag with the mouse or the arrow
 * keys keep going in both directions (the roles are repeated, and the scroll position silently
 * goes back to the middle copy once it stops). Roles the host did not keep are dimmed.
 */
export function RolesCarousel({ settings }: { settings: Record<string, SettingValue> }) {
  const track = useRef<HTMLUListElement>(null);
  const drag = useRef<{ x: number; left: number } | null>(null);
  const settle = useRef<number | undefined>(undefined);
  /** Tile an arrow is scrolling to: successive clicks add up instead of restarting. */
  const pending = useRef<number | null>(null);
  /** An arrow animation started by then can still be running: do not recenter before. */
  const busyUntil = useRef(0);
  const kept = (settings.roles as readonly string[] | undefined) ?? [];

  const step = () => (track.current?.clientWidth ?? 0) + GAP;

  /** Scrolls without any animation nor snapping (the snap would fight the jump). */
  const jumpTo = useCallback((left: number) => {
    const element = track.current;
    if (!element) return;
    element.style.scrollSnapType = 'none';
    element.scrollLeft = left;
    requestAnimationFrame(() => {
      element.style.scrollSnapType = '';
    });
  }, []);

  /**
   * Back to the middle copy, which looks exactly the same as the one we are on. Returns how long
   * to wait before trying again when an arrow animation may still be running, otherwise 0.
   */
  const recenter = useCallback((): number => {
    const element = track.current;
    if (!element || drag.current) return 0;
    const wait = busyUntil.current - Date.now();
    if (wait > 0) return wait + 20;
    pending.current = null;
    const size = element.clientWidth + GAP;
    const index = Math.round(element.scrollLeft / size);
    if (index < COUNT) jumpTo(element.scrollLeft + COUNT * size);
    else if (index >= 2 * COUNT) jumpTo(element.scrollLeft - COUNT * size);
    return 0;
  }, [jumpTo]);

  // Start on the first role of the middle copy, and stay on it when the window is resized.
  useLayoutEffect(() => {
    const element = track.current;
    if (!element) return;
    jumpTo(COUNT * (element.clientWidth + GAP));
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      const index = Math.round(element.scrollLeft / (width + GAP));
      width = element.clientWidth;
      jumpTo(index * (width + GAP));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [jumpTo]);

  // Recenter once the scroll has stopped. `scrollend` where it exists, a short delay elsewhere.
  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const settled = () => {
      window.clearTimeout(settle.current);
      const wait = recenter();
      if (wait > 0) settle.current = window.setTimeout(settled, wait);
    };
    const onScroll = () => {
      window.clearTimeout(settle.current);
      settle.current = window.setTimeout(settled, 150);
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    element.addEventListener('scrollend', settled);
    return () => {
      window.clearTimeout(settle.current);
      element.removeEventListener('scroll', onScroll);
      element.removeEventListener('scrollend', settled);
    };
  }, [recenter]);

  const scroll = (direction: -1 | 1) => {
    const element = track.current;
    if (!element) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const index = (pending.current ?? Math.round(element.scrollLeft / step())) + direction;
    pending.current = index;
    busyUntil.current = Date.now() + ARROW_ANIMATION_MS;
    element.scrollTo({ left: index * step(), behavior: reduced ? 'auto' : 'smooth' });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    scroll(event.key === 'ArrowLeft' ? -1 : 1);
  };

  // Dragging with the mouse (touch screens and trackpads already scroll by themselves).
  const onPointerDown = (event: PointerEvent<HTMLUListElement>) => {
    const element = track.current;
    if (!element || event.pointerType !== 'mouse' || event.button !== 0) return;
    pending.current = null;
    busyUntil.current = 0;
    drag.current = { x: event.clientX, left: element.scrollLeft };
    element.setPointerCapture(event.pointerId);
    element.classList.add(styles.dragging!);
  };
  const onPointerMove = (event: PointerEvent<HTMLUListElement>) => {
    const element = track.current;
    if (!element || !drag.current) return;
    element.scrollLeft = drag.current.left - (event.clientX - drag.current.x);
  };
  const onPointerUp = (event: PointerEvent<HTMLUListElement>) => {
    const element = track.current;
    if (!element || !drag.current) return;
    element.releasePointerCapture(event.pointerId);
    element.classList.remove(styles.dragging!);
    const start = drag.current;
    drag.current = null;
    // A drag of more than a fifth of a tile goes to the next tile, otherwise it comes back.
    const moved = element.scrollLeft - start.left;
    const base = Math.round(start.left / step());
    const target = Math.abs(moved) > step() / 5 ? base + Math.sign(moved) : base;
    element.scrollTo({ left: target * step(), behavior: 'smooth' });
  };

  return (
    <section className={`card ${styles.carousel}`} aria-labelledby="roles-title">
      <h3 id="roles-title">Les rôles</h3>
      <ArrowDefs />
      <div className={styles.carouselBody}>
        <button
          type="button"
          className={`${styles.arrow} ${styles.arrowLeft}`}
          onClick={() => scroll(-1)}
        >
          <Chevron />
          <span className="visually-hidden">Rôle précédent</span>
        </button>
        <ul
          ref={track}
          className={styles.track}
          tabIndex={0}
          aria-label="Rôles, à faire défiler de gauche à droite ou de droite à gauche"
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {COPIES.flatMap((copy) =>
            ROLE_IDS.map((id) => {
              const role = ROLES[id];
              const picture = pictureOf(id);
              const status = role.inDevelopment
                ? 'en développement'
                : kept.includes(id)
                  ? null
                  : 'non retenu';
              // Only the middle copy is for assistive technologies and the keyboard.
              const clone = copy !== 1;
              return (
                <li
                  key={`${copy}-${id}`}
                  className={status ? `${styles.roleTile} ${styles.outOfGame}` : styles.roleTile}
                  aria-hidden={clone || undefined}
                  inert={clone || undefined}
                >
                  <div className={styles.tileText}>
                    <h4 className={styles.tileName}>{role.name}</h4>
                    {status && <span className={styles.tag}>{status}</span>}
                    <p className={styles.tileGoal}>{role.goal}</p>
                    <p className={styles.tilePointsTitle}>Points</p>
                    <ul className={styles.points}>
                      {role.points.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                  {picture && (
                    <img
                      className={styles.tilePicture}
                      src={picture}
                      alt=""
                      draggable={false}
                      loading="lazy"
                    />
                  )}
                </li>
              );
            }),
          )}
        </ul>
        <button type="button" className={styles.arrow} onClick={() => scroll(1)}>
          <Chevron />
          <span className="visually-hidden">Rôle suivant</span>
        </button>
      </div>
    </section>
  );
}
