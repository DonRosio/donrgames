import { seededRandom as random } from './seeded-random.ts';

const W = 1600;
const H = 900;

interface Puff {
  x: number;
  y: number;
  r: number;
}

/** Puffs along the four edges of the sheet, so that every side ends in a cloud outline. */
function edgePuffs(seed: number): Puff[] {
  const next = random(seed);
  const puffs: Puff[] = [];
  const radius = () => 52 + next() * 40;
  for (let x = 0; x <= W; x += 62 + next() * 22) {
    puffs.push({ x, y: next() * 26, r: radius() }, { x, y: H - next() * 26, r: radius() });
  }
  for (let y = 0; y <= H; y += 62 + next() * 22) {
    puffs.push({ x: next() * 26, y, r: radius() }, { x: W - next() * 26, y, r: radius() });
  }
  return puffs;
}

/** Soft lighter puffs inside the sheet, for some depth. */
function insidePuffs(seed: number): Puff[] {
  const next = random(seed);
  return Array.from({ length: 26 }, () => ({
    x: 120 + next() * (W - 240),
    y: 120 + next() * (H - 240),
    r: 60 + next() * 80,
  }));
}

interface CloudSheetProps {
  seed: number;
  fill: string;
  shade: string;
  outline: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * A big sheet of cartoon clouds (pale fill, blue outline). Sized by its container: the puffs
 * stretch with it, which is fine for clouds.
 */
export function CloudSheet({ seed, fill, shade, outline, className, style }: CloudSheetProps) {
  const edge = edgePuffs(seed);
  const inside = insidePuffs(seed + 7);
  return (
    <svg
      className={className}
      style={style}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {edge.map((p, i) => (
        <circle key={`o${i}`} cx={p.x} cy={p.y} r={p.r + 7} fill={outline} />
      ))}
      {edge.map((p, i) => (
        <circle key={`f${i}`} cx={p.x} cy={p.y} r={p.r} fill={fill} />
      ))}
      <rect x="40" y="40" width={W - 80} height={H - 80} fill={fill} />
      {inside.map((p, i) => (
        <circle key={`s${i}`} cx={p.x} cy={p.y} r={p.r} fill={shade} opacity="0.8" />
      ))}
      {inside.map((p, i) => (
        <circle key={`t${i}`} cx={p.x - 8} cy={p.y - 10} r={p.r * 0.86} fill={fill} />
      ))}
    </svg>
  );
}
