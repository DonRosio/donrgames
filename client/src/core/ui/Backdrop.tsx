import { seededRandom } from './seeded-random.ts';
import styles from './Backdrop.module.css';

const W = 1600;
const H = 900;
const SUN = { x: 640, y: 560 };

interface Puff {
  x: number;
  y: number;
  r: number;
}

/** A cumulus made of overlapping puffs, wider than tall, flat underneath. */
function cumulus(seed: number, cx: number, cy: number, width: number, height: number): Puff[] {
  const next = seededRandom(seed);
  const puffs: Puff[] = [];
  const count = Math.round(width / 38);
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const bulge = Math.sin(Math.PI * t) ** 0.8;
    const r = 26 + bulge * height * (0.34 + next() * 0.22);
    puffs.push({
      x: cx - width / 2 + t * width + (next() - 0.5) * 24,
      y: cy - bulge * height * 0.3 * (0.5 + next()),
      r,
    });
  }
  // A second, higher row makes the towers.
  for (let i = 0; i < count / 2; i++) {
    const t = 0.2 + (i / (count / 2)) * 0.6;
    puffs.push({
      x: cx - width / 2 + t * width,
      y: cy - height * (0.5 + next() * 0.3),
      r: height * (0.3 + next() * 0.18),
    });
  }
  return puffs;
}

/** Lit from the sun side: pale gold on top, dusty violet underneath, soft edges. */
function Cloud({ puffs, id, warm }: { puffs: Puff[]; id: string; warm: boolean }) {
  const lit = warm ? '#ffe2b0' : '#fff1dc';
  const mid = warm ? '#f2a77c' : '#f6c2a6';
  const shade = warm ? '#a2607a' : '#9a7aa6';
  return (
    <g filter="url(#soft)">
      <g fill={shade}>
        {puffs.map((p, i) => (
          <circle key={`s${i}`} cx={p.x + 6} cy={p.y + 12} r={p.r} />
        ))}
      </g>
      <g fill={mid}>
        {puffs.map((p, i) => (
          <circle key={`m${i}`} cx={p.x} cy={p.y + 2} r={p.r * 0.95} />
        ))}
      </g>
      <g fill={lit}>
        {puffs.map((p, i) => (
          <circle key={`l${i}`} cx={p.x - p.r * 0.14} cy={p.y - p.r * 0.2} r={p.r * 0.72} />
        ))}
      </g>
      <g fill="#fff9ea" opacity="0.9" id={`${id}-hl`}>
        {puffs.map((p, i) => (
          <circle key={`h${i}`} cx={p.x - p.r * 0.24} cy={p.y - p.r * 0.34} r={p.r * 0.4} />
        ))}
      </g>
    </g>
  );
}

const CLOUDS: { puffs: Puff[]; warm: boolean; opacity: number }[] = [
  { puffs: cumulus(3, 260, 210, 620, 150), warm: false, opacity: 0.95 },
  { puffs: cumulus(8, 1130, 170, 760, 170), warm: false, opacity: 0.95 },
  { puffs: cumulus(13, 820, 330, 420, 70), warm: true, opacity: 0.85 },
  { puffs: cumulus(19, 1400, 400, 480, 80), warm: true, opacity: 0.9 },
  { puffs: cumulus(24, 130, 440, 360, 66), warm: true, opacity: 0.9 },
];

/** Clumps of leaves, dark inside and lit with gold on the sun side. */
function Foliage({
  cx,
  cy,
  radius,
  seed,
}: {
  cx: number;
  cy: number;
  radius: number;
  seed: number;
}) {
  const next = seededRandom(seed);
  const clumps = Array.from({ length: 26 }, () => {
    const a = next() * Math.PI * 2;
    const d = Math.sqrt(next()) * radius * 0.78;
    return {
      x: cx + Math.cos(a) * d * 1.15,
      y: cy + Math.sin(a) * d * 0.8,
      r: radius * (0.2 + next() * 0.16),
    };
  });
  return (
    <g filter="url(#soft)">
      <g fill="#1f4a34">
        {clumps.map((c, i) => (
          <circle key={`a${i}`} cx={c.x + 4} cy={c.y + 8} r={c.r} />
        ))}
      </g>
      <g fill="#3d7b48">
        {clumps.map((c, i) => (
          <circle key={`b${i}`} cx={c.x} cy={c.y} r={c.r * 0.9} />
        ))}
      </g>
      <g fill="#8fbf5a">
        {clumps.map((c, i) => (
          <circle key={`c${i}`} cx={c.x - c.r * 0.22} cy={c.y - c.r * 0.28} r={c.r * 0.55} />
        ))}
      </g>
      <g fill="#ffe08a" opacity="0.75">
        {clumps.map((c, i) => (
          <circle key={`d${i}`} cx={c.x - c.r * 0.36} cy={c.y - c.r * 0.42} r={c.r * 0.22} />
        ))}
      </g>
    </g>
  );
}

/** Small farmhouse with a lit wall and a warm window. */
function House({ x, y, w, h, roof }: { x: number; y: number; w: number; h: number; roof: string }) {
  return (
    <g>
      <rect x={x} y={y - h} width={w} height={h} fill="#e9c9a0" />
      <rect x={x + w * 0.55} y={y - h} width={w * 0.45} height={h} fill="#b98f7a" />
      <polygon
        points={`${x - 4},${y - h} ${x + w / 2},${y - h - h * 0.6} ${x + w + 4},${y - h}`}
        fill={roof}
      />
      <polygon
        points={`${x + w / 2},${y - h - h * 0.6} ${x + w + 4},${y - h} ${x + w / 2},${y - h}`}
        fill="#7a3f36"
        opacity="0.6"
      />
      <rect x={x + w * 0.18} y={y - h * 0.62} width={w * 0.2} height={h * 0.3} fill="#ffcf6a" />
    </g>
  );
}

/** Hill ridge: smooth path filled from the crest down to the bottom of the picture. */
function Hill({ points, fill, rim }: { points: [number, number][]; fill: string; rim?: string }) {
  // Catmull-Rom spline through the crest points, as cubic curves.
  const at = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))]!;
  let d = `M ${at(0)[0]} ${at(0)[1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = at(i - 1);
    const [x1, y1] = at(i);
    const [x2, y2] = at(i + 1);
    const [x3, y3] = at(i + 2);
    d += ` C ${x1 + (x2 - x0) / 6} ${y1 + (y2 - y0) / 6} ${x2 - (x3 - x1) / 6} ${y2 - (y3 - y1) / 6} ${x2} ${y2}`;
  }
  const crest = d;
  d += ` L ${W + 40} ${H} L -40 ${H} Z`;
  return (
    <g>
      <path d={d} fill={fill} />
      {rim && <path d={crest} fill="none" stroke={rim} strokeWidth="3" opacity="0.7" />}
    </g>
  );
}

function grass(seed: number, count: number, baseY: number, spread: number): React.ReactNode[] {
  const next = seededRandom(seed);
  const blades: React.ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    const x = next() * W;
    const y = baseY + next() * spread;
    const h = 30 + next() * 70;
    const lean = (next() - 0.5) * 34;
    const shade = next();
    const color = shade < 0.4 ? '#2c6a3a' : shade < 0.8 ? '#4d9a44' : '#a6cf5c';
    blades.push(
      <path
        key={i}
        d={`M ${x} ${y} Q ${x + lean * 0.2} ${y - h * 0.6} ${x + lean} ${y - h}`}
        stroke={color}
        strokeWidth={2 + next() * 2.5}
        fill="none"
        strokeLinecap="round"
      />,
    );
  }
  return blades;
}

function flowers(seed: number, count: number): React.ReactNode[] {
  const next = seededRandom(seed);
  const colors = ['#fff6e8', '#ffd0dc', '#ffe27a', '#f6a0b8'];
  return Array.from({ length: count }, (_, i) => {
    const x = next() * W;
    const y = 700 + next() * 190;
    const r = 2.2 + ((y - 700) / 190) * 3.4;
    return <circle key={i} cx={x} cy={y} r={r} fill={colors[Math.floor(next() * colors.length)]} />;
  });
}

const MOTES = Array.from({ length: 34 }, (_, i) => {
  const next = seededRandom(100 + i);
  return { x: next() * W, y: 360 + next() * 460, r: 1.6 + next() * 2.6, o: 0.35 + next() * 0.5 };
});

/**
 * Fixed background: a golden-hour countryside painted in soft gradients (sky, clouds, hills, a
 * village, a big tree, tall grass). Three stacked layers: the clouds drift slowly on their own.
 */
export function Backdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true">
      <svg
        className={styles.layer}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMax slice"
        focusable="false"
      >
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1d3560" />
            <stop offset="0.26" stopColor="#4a63a0" />
            <stop offset="0.46" stopColor="#b98aa6" />
            <stop offset="0.62" stopColor="#f2a56d" />
            <stop offset="0.74" stopColor="#ffd684" />
          </linearGradient>
          <radialGradient id="glow" cx={SUN.x} cy={SUN.y} r="700" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fffbe6" stopOpacity="1" />
            <stop offset="0.12" stopColor="#ffe9a8" stopOpacity="0.9" />
            <stop offset="0.4" stopColor="#ffbf6a" stopOpacity="0.35" />
            <stop offset="1" stopColor="#ff9a5a" stopOpacity="0" />
          </radialGradient>
          <filter id="soft" x="-10%" y="-20%" width="120%" height="140%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
          <filter id="haze" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
        </defs>
        <rect width={W} height={H} fill="url(#sky)" />
        <rect width={W} height={H} fill="url(#glow)" />
        <g filter="url(#haze)" opacity="0.5" fill="#ffd9a0">
          <ellipse cx={SUN.x} cy={SUN.y + 10} rx="360" ry="46" />
        </g>
        <circle cx={SUN.x} cy={SUN.y} r="46" fill="#fffdf2" filter="url(#soft)" />
        {/* Soft rays */}
        <g fill="#fff2c4" opacity="0.1" filter="url(#haze)">
          {[-58, -36, -14, 8, 30, 52].map((a) => {
            const r = (a * Math.PI) / 180;
            return (
              <polygon
                key={a}
                points={`${SUN.x},${SUN.y} ${SUN.x + Math.sin(r - 0.05) * 1500},${SUN.y - Math.cos(r - 0.05) * 1500} ${SUN.x + Math.sin(r + 0.05) * 1500},${SUN.y - Math.cos(r + 0.05) * 1500}`}
              />
            );
          })}
        </g>
        {/* Birds */}
        <g stroke="#3a2a44" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.65">
          <path d="M880 300 q8 -9 16 0 q8 -9 16 0" />
          <path d="M930 268 q6 -7 12 0 q6 -7 12 0" />
          <path d="M1010 318 q6 -7 12 0 q6 -7 12 0" />
        </g>
      </svg>

      <svg
        className={`${styles.layer} ${styles.clouds}`}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMax slice"
        focusable="false"
      >
        {CLOUDS.map((cloud, i) => (
          <g key={i} opacity={cloud.opacity}>
            <Cloud puffs={cloud.puffs} id={`c${i}`} warm={cloud.warm} />
          </g>
        ))}
      </svg>

      <svg
        className={styles.layer}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMax slice"
        focusable="false"
      >
        <defs>
          <linearGradient id="meadow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5f9a48" />
            <stop offset="0.35" stopColor="#3c7a3e" />
            <stop offset="1" stopColor="#15382a" />
          </linearGradient>
          <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.55" stopColor="#06140d" stopOpacity="0" />
            <stop offset="1" stopColor="#06140d" stopOpacity="0.62" />
          </linearGradient>
          <linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0a1530" stopOpacity="0.45" />
            <stop offset="0.3" stopColor="#0a1530" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Distant hills, lavender then green, warmer near the sun */}
        <Hill
          fill="#a58aa8"
          rim="#ffd9a0"
          points={[
            [0, 560],
            [260, 520],
            [520, 556],
            [800, 530],
            [1100, 548],
            [1350, 512],
            [1600, 540],
          ]}
        />
        <Hill
          fill="#7d9a86"
          rim="#ffe0a0"
          points={[
            [0, 600],
            [300, 574],
            [600, 606],
            [900, 580],
            [1200, 604],
            [1600, 570],
          ]}
        />
        {/* Village on the hill, at the left edge of the picture */}
        <g transform="translate(-400 0)">
          <House x={470} y={612} w={44} h={34} roof="#c4553f" />
          <House x={528} y={616} w={52} h={40} roof="#b8493a" />
          <House x={600} y={610} w={40} h={30} roof="#d0674a" />
          <House x={664} y={618} w={58} h={38} roof="#c4553f" />
          <House x={748} y={612} w={42} h={32} roof="#b8493a" />
          {/* Bell tower */}
          <rect x={572} y={520} width={22} height={94} fill="#e9c9a0" />
          <rect x={584} y={520} width={10} height={94} fill="#b98f7a" />
          <polygon points="566,520 583,470 600,520" fill="#b8493a" />
          <rect x={578} y={534} width={10} height={20} rx={5} fill="#ffcf6a" />
          <rect x={581} y={454} width={3} height={18} fill="#6a4030" />
          <circle cx={520} cy={598} r="20" fill="#3f7a44" />
          <circle cx={800} cy={600} r="24" fill="#3a7446" />
        </g>
        <Hill
          fill="#4f8a4c"
          rim="#ffe9a8"
          points={[
            [0, 650],
            [280, 636],
            [560, 660],
            [880, 640],
            [1180, 630],
            [1400, 596],
            [1600, 610],
          ]}
        />
        {/* The big tree on the right hill */}
        <g transform="translate(230 0)">
          <path
            d="M1188 660 C1186 600 1180 560 1168 520 L1206 520 C1204 560 1214 610 1222 660 Z"
            fill="#4a3226"
          />
          <path
            d="M1198 660 C1196 610 1192 570 1186 528 L1206 520 C1204 560 1214 610 1222 660 Z"
            fill="#33221a"
            opacity="0.6"
          />
          <Foliage cx={1192} cy={438} radius={150} seed={5} />
        </g>
        <circle cx="1000" cy="640" r="30" fill="#2f6a3e" />
        <circle cx="1022" cy="646" r="22" fill="#3d7d46" />
        {/* Meadow with tall grass and flowers */}
        <Hill
          fill="url(#meadow)"
          rim="#e6f08a"
          points={[
            [0, 700],
            [300, 682],
            [640, 706],
            [980, 690],
            [1300, 700],
            [1600, 676],
          ]}
        />
        <rect width={W} height={H} fill="url(#shade)" />
        <g>{grass(2, 260, 704, 180)}</g>
        <g>{flowers(3, 90)}</g>
        <g fill="#fff3c2">
          {MOTES.map((m, i) => (
            <circle key={i} cx={m.x} cy={m.y} r={m.r} opacity={m.o} />
          ))}
        </g>
        <rect width={W} height={H} fill="url(#dusk)" />
      </svg>
    </div>
  );
}
