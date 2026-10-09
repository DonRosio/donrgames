import type { CSSProperties } from 'react';
import { seededRandom } from '../../core/ui/seeded-random.ts';
import styles from './whos-most.module.css';

// A drawn work, like Starburst: its colours do not come from the tokens.
const COLORS = ['#f7b544', '#ffd46a', '#ff8a78', '#9be08c', '#8ec5ff', '#d9a8ff', '#fff6e4'];
const PIECES = Array.from({ length: 48 }, (_, index) => {
  const random = seededRandom(index + 1);
  return {
    left: random() * 100,
    size: 6 + random() * 8,
    color: COLORS[Math.floor(random() * COLORS.length)]!,
    duration: 2.6 + random() * 2.4,
    delay: random() * 1.2,
    turn: 360 + random() * 720,
    round: random() > 0.5,
  };
});

/** Confetti falling once, from the moment the winners appear. */
export function Confetti({ delayMs }: { delayMs: number }) {
  return (
    <div className={styles.confetti} aria-hidden="true">
      {PIECES.map((piece, index) => (
        <span
          key={index}
          style={
            {
              left: `${piece.left}%`,
              width: piece.size,
              height: piece.size * (piece.round ? 1 : 0.5),
              borderRadius: piece.round ? '50%' : 2,
              background: piece.color,
              animationDuration: `${piece.duration}s`,
              animationDelay: `${delayMs + piece.delay * 1000}ms`,
              '--turn': `${piece.turn}deg`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
