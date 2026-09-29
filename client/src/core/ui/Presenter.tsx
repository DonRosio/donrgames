const SKIN = '#ffd90f';
const INK = '#141414';
const SUIT = '#3d7196';
const SUIT_DARK = '#2c5878';

/** Sleeve: a thick coloured stroke over a slightly thicker black one (cartoon outline). */
function Limb({ points, color, width }: { points: string; color: string; width: number }) {
  return (
    <>
      <polyline
        points={points}
        fill="none"
        stroke={INK}
        strokeWidth={width + 6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

/**
 * The game show host: yellow skin and bulging eyes like a Springfield character, in a suit
 * and red tie, a microphone in one hand and the other arm raised to introduce the show.
 */
export function Presenter({ className }: { className?: string }) {
  const stroke = { stroke: INK, strokeWidth: 3, strokeLinejoin: 'round' as const };
  return (
    <svg
      className={className}
      viewBox="0 0 250 385"
      role="img"
      aria-label="Le présentateur"
      focusable="false"
    >
      <ellipse cx="122" cy="368" rx="80" ry="9" fill="rgb(0 0 0 / 28%)" />

      {/* Legs and shoes */}
      <path d="M96 268 L96 352 L119 352 L119 268 Z" fill="#2f4d66" {...stroke} />
      <path d="M125 268 L125 352 L148 352 L148 268 Z" fill="#2f4d66" {...stroke} />
      <path d="M72 358 Q72 342 96 344 L119 346 L119 360 L72 360 Z" fill="#232323" {...stroke} />
      <path d="M125 346 L148 344 Q174 342 174 358 L174 360 L125 360 Z" fill="#232323" {...stroke} />

      {/* Neck, jacket, shirt, tie */}
      <rect x="108" y="112" width="28" height="44" fill={SKIN} {...stroke} />
      <path d="M78 156 Q122 140 166 156 L176 282 L68 282 Z" fill={SUIT} {...stroke} />
      <path d="M104 150 L140 150 L122 214 Z" fill="#fdfdfd" {...stroke} />
      <path d="M96 150 L122 216 L84 202 Z" fill={SUIT_DARK} {...stroke} />
      <path d="M148 150 L122 216 L160 202 Z" fill={SUIT_DARK} {...stroke} />
      <path d="M116 152 L128 152 L126 162 L118 162 Z" fill="#b71f1f" {...stroke} />
      <path d="M118 162 L126 162 L133 214 L122 244 L111 214 Z" fill="#d62828" {...stroke} />

      {/* Head */}
      <circle cx="80" cy="82" r="10" fill={SKIN} {...stroke} />
      <path
        d="M76 82 Q80 78 84 83"
        fill="none"
        stroke={INK}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <ellipse cx="122" cy="78" rx="45" ry="43" fill={SKIN} {...stroke} />
      {/* Brown quiff */}
      <path
        d="M80 62 Q76 22 118 18 Q162 18 166 60 Q152 36 120 38 Q94 40 80 62 Z"
        fill="#6b3f1d"
        {...stroke}
      />
      {/* Bulging eyes */}
      <circle cx="104" cy="46" r="14" fill="#fff" {...stroke} />
      <circle cx="131" cy="45" r="14" fill="#fff" {...stroke} />
      <circle cx="109" cy="49" r="3" fill={INK} />
      <circle cx="136" cy="48" r="3" fill={INK} />
      {/* Big round nose, mouth with an overbite */}
      <ellipse cx="146" cy="72" rx="10" ry="9" fill={SKIN} {...stroke} />
      <path d="M100 94 Q124 122 152 92 Z" fill="#7d1d1d" {...stroke} />
      <path
        d="M106 95 L148 94 Q146 104 128 106 Q112 105 106 95 Z"
        fill="#fff"
        stroke={INK}
        strokeWidth="2"
      />
      <path
        d="M98 92 Q96 100 101 104"
        fill="none"
        stroke={INK}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M154 90 Q157 98 152 104"
        fill="none"
        stroke={INK}
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Left arm: holding the microphone in front of the chin */}
      <Limb points="84,164 58,216 92,152" color={SUIT} width={24} />
      <line
        x1="99"
        y1="144"
        x2="104"
        y2="128"
        stroke={INK}
        strokeWidth="13"
        strokeLinecap="round"
      />
      <line
        x1="99"
        y1="144"
        x2="104"
        y2="128"
        stroke="#9aa1ab"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <circle cx="106" cy="117" r="13" fill="#2b2b2b" {...stroke} />
      <path
        d="M98 113 Q102 106 111 107"
        fill="none"
        stroke="#8a8a8a"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="95" cy="149" r="12" fill={SKIN} {...stroke} />
      <path
        d="M88 147 Q95 153 102 147"
        fill="none"
        stroke={INK}
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Right arm: raised, open hand with four fingers */}
      <Limb points="160,164 196,208 206,150" color={SUIT} width={24} />
      <g transform="translate(206 134)">
        <ellipse
          cx="-15"
          cy="6"
          rx="5"
          ry="10"
          transform="rotate(-55 -15 6)"
          fill={SKIN}
          {...stroke}
        />
        <ellipse
          cx="-9"
          cy="-14"
          rx="5"
          ry="11"
          transform="rotate(-18 -9 -14)"
          fill={SKIN}
          {...stroke}
        />
        <ellipse
          cx="-1"
          cy="-19"
          rx="5"
          ry="11"
          transform="rotate(-3 -1 -19)"
          fill={SKIN}
          {...stroke}
        />
        <ellipse
          cx="8"
          cy="-16"
          rx="5"
          ry="11"
          transform="rotate(14 8 -16)"
          fill={SKIN}
          {...stroke}
        />
        <circle cx="0" cy="0" r="13" fill={SKIN} {...stroke} />
        <ellipse cx="-9" cy="-14" rx="3" ry="6" transform="rotate(-18 -9 -14)" fill={SKIN} />
        <ellipse cx="-1" cy="-19" rx="3" ry="6" transform="rotate(-3 -1 -19)" fill={SKIN} />
      </g>
    </svg>
  );
}
