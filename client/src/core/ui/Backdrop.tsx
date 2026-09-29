import { seededRandom } from './seeded-random.ts';
import styles from './Backdrop.module.css';

const W = 1600;
const H = 900;
const SUN = { x: 590, y: 612 };
const HORIZON = 655;
const INK = '#0b0503';

/** Sky in flat, posterized bands around the sun (comic-book colouring, no smooth gradient). */
const SKY_BANDS: { rx: number; ry: number; color: string }[] = [
  { rx: 2600, ry: 1900, color: '#6e1f0b' },
  { rx: 1750, ry: 1250, color: '#9c2f0d' },
  { rx: 1250, ry: 900, color: '#c9440e' },
  { rx: 900, ry: 640, color: '#ef6a10' },
  { rx: 640, ry: 450, color: '#ff8f12' },
  { rx: 440, ry: 310, color: '#ffb31c' },
  { rx: 290, ry: 205, color: '#ffd23a' },
  { rx: 170, ry: 120, color: '#ffe985' },
  { rx: 96, ry: 68, color: '#fff7cf' },
];

interface Puff {
  x: number;
  y: number;
  r: number;
}

/** A streak of cloud: a row of puffs, taller in the middle, flat underneath. */
function cloudBank(seed: number, cx: number, cy: number, width: number, height: number): Puff[] {
  const next = seededRandom(seed);
  const puffs: Puff[] = [];
  const count = Math.round(width / 46);
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const bulge = Math.sin(Math.PI * t);
    const r = 16 + bulge * height * 0.5 * (0.6 + next() * 0.5);
    puffs.push({ x: cx - width / 2 + t * width, y: cy - bulge * height * 0.35 * next(), r });
  }
  return puffs;
}

function Cloud({ puffs }: { puffs: Puff[] }) {
  return (
    <g>
      {puffs.map((p, i) => (
        <circle key={`o${i}`} cx={p.x} cy={p.y} r={p.r + 6} fill={INK} />
      ))}
      {puffs.map((p, i) => (
        <circle key={`l${i}`} cx={p.x} cy={p.y} r={p.r} fill="#ffb238" />
      ))}
      {puffs.map((p, i) => (
        <circle key={`d${i}`} cx={p.x} cy={p.y + 6} r={p.r} fill="#8e2c14" />
      ))}
      {puffs.map((p, i) => (
        <circle
          key={`s${i}`}
          cx={p.x + p.r * 0.2}
          cy={p.y + p.r * 0.5}
          r={p.r * 0.55}
          fill="#5f1b10"
        />
      ))}
    </g>
  );
}

const CLOUDS = [
  cloudBank(5, 210, 128, 440, 70),
  cloudBank(9, 1030, 100, 760, 84),
  cloudBank(14, 1290, 250, 560, 60),
  cloudBank(21, 90, 330, 260, 44),
  cloudBank(27, 760, 300, 420, 40),
];

function Rays() {
  const rays = [];
  const step = 15;
  for (let a = 0; a < 360; a += step) {
    const a0 = (a * Math.PI) / 180;
    const a1 = ((a + step / 2) * Math.PI) / 180;
    const len = 2800;
    rays.push(
      <polygon
        key={a}
        points={`${SUN.x},${SUN.y} ${SUN.x + Math.cos(a0) * len},${SUN.y + Math.sin(a0) * len} ${SUN.x + Math.cos(a1) * len},${SUN.y + Math.sin(a1) * len}`}
      />,
    );
  }
  return (
    <g fill="#fff0a0" opacity="0.13">
      {rays}
    </g>
  );
}

/** The dark skyline on the horizon: bell tower, big tree, roofs, poplars, a pylon. */
function Skyline() {
  const rim = '#6a2d10';
  const crown = (cx: number, cy: number, radius: number, seed: number) => {
    const next = seededRandom(seed);
    const puffs = Array.from({ length: 7 }, (_, i) => ({
      x: cx + (i - 3) * radius * 0.42 + (next() - 0.5) * 8,
      y: cy - Math.abs(3 - i) * radius * 0.12 - next() * 12,
      r: radius * (0.55 + next() * 0.3),
    }));
    return (
      <g>
        {puffs.map((p, i) => (
          <circle key={`r${i}`} cx={p.x - 3} cy={p.y - 3} r={p.r} fill={rim} />
        ))}
        {puffs.map((p, i) => (
          <circle key={`c${i}`} cx={p.x} cy={p.y} r={p.r} fill={INK} />
        ))}
      </g>
    );
  };
  return (
    <g>
      {/* Low bushes and roofs, left */}
      {crown(60, 632, 44, 1)}
      {crown(200, 640, 34, 2)}
      <polygon points="250,655 250,618 282,594 314,618 314,655" fill={INK} />
      <rect x="298" y="596" width="9" height="22" fill={INK} />
      {crown(360, 640, 30, 3)}
      {/* Bell tower */}
      <polygon points="536,455 546,518 526,518" fill={INK} stroke={rim} strokeWidth="2" />
      <rect x="524" y="516" width="44" height="46" fill={INK} stroke={rim} strokeWidth="2" />
      <rect x="533" y="524" width="8" height="24" rx="4" fill="#ff9a1a" />
      <rect x="551" y="524" width="8" height="24" rx="4" fill="#ff9a1a" />
      <rect x="531" y="560" width="30" height="95" fill={INK} stroke={rim} strokeWidth="2" />
      <rect x="544" y="440" width="3" height="18" fill={INK} />
      <rect x="539" y="447" width="13" height="3" fill={INK} />
      {/* Big tree, right of the sun */}
      <rect x="663" y="590" width="10" height="66" fill={INK} />
      {crown(668, 574, 46, 4)}
      {/* Roofs and a pole */}
      <polygon points="770,655 770,626 796,606 822,626 822,655" fill={INK} />
      <polygon points="828,655 828,632 858,610 888,632 888,655" fill={INK} />
      <rect x="934" y="560" width="4" height="95" fill={INK} />
      <rect x="922" y="568" width="28" height="4" fill={INK} />
      {/* Poplars */}
      {[1000, 1034, 1064].map((x, i) => (
        <g key={x}>
          <ellipse cx={x - 2} cy={600 - i * 6} rx="12" ry="52" fill={rim} />
          <ellipse cx={x} cy={600 - i * 6} rx="12" ry="52" fill={INK} />
        </g>
      ))}
      {crown(1180, 640, 40, 6)}
      {crown(1300, 642, 34, 7)}
      <polygon points="1360,655 1360,624 1392,600 1424,624 1424,655" fill={INK} />
      {/* Pylon */}
      <polyline points="1500,655 1520,520 1540,655" fill="none" stroke={INK} strokeWidth="6" />
      <line x1="1500" y1="560" x2="1540" y2="560" stroke={INK} strokeWidth="5" />
      <line x1="1494" y1="536" x2="1546" y2="536" stroke={INK} strokeWidth="5" />
      <path d="M1506 620 L1534 585 M1534 620 L1506 585" stroke={INK} strokeWidth="3" />
      {crown(1590, 640, 40, 8)}
      <rect x="0" y="646" width={W} height="20" fill={INK} />
    </g>
  );
}

/** Dark field: converging furrows and ink hatching, so that the page content stays readable. */
function Field() {
  const furrows = [];
  for (let x = -1400; x <= 2800; x += 110) {
    furrows.push(<line key={x} x1={SUN.x} y1={HORIZON} x2={x} y2={H + 40} />);
  }
  const hatch = [];
  for (let i = 0; i < 40; i++) {
    hatch.push(<line key={i} x1={i * 44 - 200} y1={H} x2={i * 44 + 40} y2={H - 260} />);
  }
  return (
    <g>
      <rect x="0" y={HORIZON} width={W} height={H - HORIZON} fill="url(#field)" />
      <g stroke="#3a1a0b" strokeWidth="3" opacity="0.85">
        {furrows}
      </g>
      <g stroke={INK} strokeWidth="2" opacity="0.55">
        {hatch}
      </g>
    </g>
  );
}

/** Fixed comic-book sunset over the countryside, behind every page. */
export function Backdrop() {
  return (
    <svg
      className={styles.backdrop}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern
          id="dots"
          width="13"
          height="13"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(30)"
        >
          <circle cx="6.5" cy="6.5" r="2.6" fill="#4a1206" />
        </pattern>
        <radialGradient id="dotFade" cx={SUN.x} cy={SUN.y} r="1250" gradientUnits="userSpaceOnUse">
          <stop offset="0.3" stopColor="#000" />
          <stop offset="0.85" stopColor="#fff" />
        </radialGradient>
        <mask id="dotMask" maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
          <rect width={W} height={H} fill="url(#dotFade)" />
        </mask>
        <linearGradient id="field" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#24110a" />
          <stop offset="0.35" stopColor="#120904" />
          <stop offset="1" stopColor="#040201" />
        </linearGradient>
        <radialGradient id="vignette" cx="50%" cy="60%" r="75%">
          <stop offset="0.5" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.6" />
        </radialGradient>
      </defs>

      {SKY_BANDS.map((band) => (
        <ellipse key={band.rx} cx={SUN.x} cy={SUN.y} rx={band.rx} ry={band.ry} fill={band.color} />
      ))}
      <Rays />
      <rect width={W} height={HORIZON} fill="url(#dots)" mask="url(#dotMask)" opacity="0.6" />

      <g className={styles.sun}>
        <circle cx={SUN.x} cy={SUN.y} r="56" fill="#fff7cf" opacity="0.55" />
        <circle cx={SUN.x} cy={SUN.y} r="34" fill="#fffdf0" />
      </g>

      {CLOUDS.map((puffs, i) => (
        <Cloud key={i} puffs={puffs} />
      ))}

      <Skyline />
      <Field />
      <rect width={W} height={H} fill="url(#vignette)" />
    </svg>
  );
}
