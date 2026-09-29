import type { ReactNode } from 'react';
import { seededRandom } from './seeded-random.ts';
import styles from './Starburst.module.css';

const W = 1000;
const H = 600;
const INK = '#0b0503';

/** Jagged outline of a comic explosion, scaled around the centre. */
function points(scale: number, seed: number): string {
  const next = seededRandom(seed);
  const spikes = 20;
  const result: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (i * Math.PI) / spikes;
    const outer = i % 2 === 0;
    const k = (outer ? 1 : 0.7) * (0.93 + next() * 0.09) * scale;
    result.push(
      `${W / 2 + Math.cos(angle) * (W / 2) * k},${H / 2 + Math.sin(angle) * (H / 2) * k}`,
    );
  }
  return result.join(' ');
}

const OUTER = points(0.97, 4);
const INNER = points(0.86, 4);

/** Comic-book explosion holding a shout. Its text scales with its width (container units). */
export function Starburst({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={className ? `${styles.burst} ${className}` : styles.burst}>
      <svg
        className={styles.shape}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <polygon points={OUTER} fill={INK} transform="translate(16 18)" />
        <polygon
          points={OUTER}
          fill="#e8431a"
          stroke={INK}
          strokeWidth="9"
          strokeLinejoin="miter"
        />
        <polygon
          points={INNER}
          fill="#ffd21f"
          stroke={INK}
          strokeWidth="5"
          strokeLinejoin="miter"
        />
      </svg>
      <p className={styles.text}>{children}</p>
    </div>
  );
}
