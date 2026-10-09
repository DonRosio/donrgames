import { useMemo } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { seededRandom } from '../../core/ui/seeded-random.ts';
import styles from './whos-most.module.css';

// The viewBox of a brush: a band 200 wide and 60 high, stretched to the size of its text.
const WIDTH = 200;
const HEIGHT = 60;

interface Smear {
  /** The band: one polygon with a ragged outline. */
  band: string;
  /** Streaks laid over it, darker where they overlap. */
  streaks: { points: string; opacity: number }[];
}

const COLUMNS = 22;

const format = (points: number[][]) =>
  points.map(([x, y]) => `${x!.toFixed(1)},${y!.toFixed(1)}`).join(' ');

/**
 * A marker smear, like the purple one of the wireframes: a band that rises a little to the right,
 * made of streaks side by side, each starting and stopping at its own height (the top and the
 * bottom are stepped), tapering at both ends, darker in the middle.
 */
function smearOf(seed: number): Smear {
  const random = seededRandom(seed * 7919 + 13);
  const column = (WIDTH - 24) / COLUMNS;
  const top: number[][] = [];
  const bottom: number[][] = [];
  for (let index = 0; index < COLUMNS; index++) {
    const along = index / (COLUMNS - 1);
    const x = 12 + index * column;
    const rise = (0.5 - along) * 8;
    const taper = Math.abs(along * 2 - 1) ** 3 * 9;
    const yTop = 6 + random() * 8 + rise + taper;
    const yBottom = 46 + random() * 8 + rise - taper;
    const lean = 2.5;
    // A little slanted step at the top, and another at the bottom.
    top.push([x + lean, yTop], [x + column + lean, yTop + (random() - 0.5) * 3]);
    bottom.unshift([x - lean, yBottom + (random() - 0.5) * 3], [x + column - lean, yBottom]);
  }
  const streaks = Array.from({ length: 11 }, () => {
    const centre = 18 + random() * (WIDTH - 36);
    const middle = 1 - Math.abs((centre / WIDTH) * 2 - 1);
    const half = 5 + random() * 8;
    const yTop = 8 + random() * 10;
    const yBottom = 42 + random() * 10;
    return {
      points: format([
        [centre - half + 3, yTop],
        [centre + half + 3, yTop],
        [centre + half - 3, yBottom],
        [centre - half - 3, yBottom],
      ]),
      opacity: 0.05 + middle * 0.1 + random() * 0.04,
    };
  });
  return { band: format([...top, ...bottom]), streaks };
}

/**
 * A text on a translucent black marker smear, which replaces the dark boxes: the streaks stick
 * out a little around the text. Drawn work, like the frames: its ink is not a design token.
 */
export function Brush({
  children,
  size = 'label',
  seed = 1,
}: {
  children: ReactNode;
  /** 'title': the question; 'label': a short text under a head; 'text': a sentence; 'button'. */
  size?: 'title' | 'label' | 'text' | 'button';
  /** Another number draws another smear. */
  seed?: number;
}) {
  const smear = useMemo(() => smearOf(seed), [seed]);
  return (
    <span className={`${styles.brushed} ${styles[`brushed-${size}`]}`}>
      <svg
        className={styles.brush}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polygon className={styles.brushBand} points={smear.band} />
        {smear.streaks.map((streak, index) => (
          <polygon key={index} points={streak.points} fillOpacity={streak.opacity} />
        ))}
        <polygon className={styles.brushShine} points="132,8 154,6 170,41 146,45" />
      </svg>
      <span className={styles.brushedText}>{children}</span>
    </span>
  );
}

/** A button that is a text on a brush: the action of the host, or the vote. */
export function BrushButton({
  children,
  seed,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'type'> & {
  children: ReactNode;
  seed?: number;
}) {
  return (
    <button type="button" className={styles.brushButton} {...props}>
      <Brush size="button" {...(seed === undefined ? {} : { seed })}>
        {children}
      </Brush>
    </button>
  );
}
