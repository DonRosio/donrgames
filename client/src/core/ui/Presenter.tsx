const INK = '#2a1912';
const SKIN = '#f6d2b0';
const SKIN_SHADE = '#e2aa84';
const HAIR = '#4b3021';
const HAIR_LIGHT = '#7a4c31';
const VEST = '#b8321d';
const VEST_SHADE = '#8b2314';
const SHIRT = '#f8f6f2';
const SHIRT_SHADE = '#d9d5cf';
const TIE = '#1d8f7d';
const GOLD = '#f1b72a';

const line = { stroke: INK, strokeWidth: 3.5, strokeLinejoin: 'round' as const };

/**
 * The host, shouting and pointing straight at the player: spiky hair, red waistcoat, rolled
 * sleeves, a green tie and a gold bracelet. Drawn waist-up, meant to be cropped by the bottom of
 * the screen.
 */
export function Presenter({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 470 580"
      role="img"
      aria-label="Le présentateur"
      focusable="false"
    >
      {/* Impact lines behind the pointing hand and the shouting mouth */}
      <g stroke={INK} strokeWidth="5" strokeLinecap="round">
        <line x1="396" y1="196" x2="428" y2="170" />
        <line x1="410" y1="226" x2="450" y2="214" />
        <line x1="352" y1="176" x2="364" y2="140" />
        <line x1="296" y1="196" x2="326" y2="176" />
        <line x1="298" y1="226" x2="330" y2="226" />
      </g>

      {/* Left arm (hanging): rolled sleeve and fist, cropped by the bottom edge */}
      <path d="M118 318 Q86 340 84 420 L92 500 L150 494 L152 380 Z" fill={SHIRT} {...line} />
      <path d="M88 470 Q120 486 150 476" fill="none" stroke={SHIRT_SHADE} strokeWidth="6" />
      <path d="M96 494 Q92 540 100 580 L146 580 Q150 530 148 492 Z" fill={SKIN} {...line} />

      {/* Back panel of the waistcoat, seen on the right */}
      <path d="M262 318 L316 338 Q322 450 318 580 L262 580 Z" fill="#33333a" {...line} />

      {/* Torso: shirt, waistcoat, buttons */}
      <path d="M124 312 Q196 266 274 312 L282 580 L112 580 Z" fill={SHIRT} {...line} />
      <path d="M124 312 L182 270 L208 352 L224 580 L112 580 Z" fill={VEST} {...line} />
      <path d="M274 312 L232 274 L214 352 L214 580 L282 580 Z" fill={VEST} {...line} />
      <path d="M124 312 L140 320 L150 580 L112 580 Z" fill={VEST_SHADE} />
      <path d="M274 312 L262 322 L256 580 L282 580 Z" fill={VEST_SHADE} />
      {[398, 452, 506].map((y) => (
        <circle key={y} cx={214} cy={y} r="6" fill={GOLD} stroke={INK} strokeWidth="2.5" />
      ))}
      <circle cx="152" cy="330" r="7" fill={GOLD} stroke={INK} strokeWidth="2.5" />

      {/* Collar and tie */}
      <path d="M176 262 L196 306 L160 292 Z" fill={SHIRT} {...line} />
      <path d="M244 264 L232 308 L268 292 Z" fill={SHIRT} {...line} />
      <path d="M200 304 L224 304 L232 400 L212 428 L192 400 Z" fill={TIE} {...line} />
      <path d="M198 290 L226 290 L224 308 L200 308 Z" fill="#146b5d" {...line} />

      {/* Neck and head, widened a little */}
      <g transform="translate(205 0) scale(1.1 1) translate(-205 0)">
        <path d="M180 244 L182 282 L242 284 L246 240 Z" fill={SKIN_SHADE} {...line} />
        <path
          d="M132 122 Q124 182 150 226 Q182 270 222 264 Q266 250 276 176 Q282 140 270 112 Q206 80 132 122 Z"
          fill={SKIN}
          {...line}
        />
        <path d="M126 158 Q112 158 114 178 Q118 190 132 188" fill={SKIN} {...line} />

        {/* Face: brows, eyes, nose, wide-open mouth */}
        <path d="M150 140 L192 158" stroke={INK} strokeWidth="7" strokeLinecap="round" />
        <path d="M232 158 L272 138" stroke={INK} strokeWidth="7" strokeLinecap="round" />
        <path d="M152 170 Q172 152 194 168 Q172 184 152 170 Z" fill="#fff" {...line} />
        <path d="M234 168 Q256 152 276 168 Q256 184 234 168 Z" fill="#fff" {...line} />
        <circle cx="174" cy="169" r="9" fill="#4a2a1c" />
        <circle cx="256" cy="169" r="9" fill="#4a2a1c" />
        <circle cx="171" cy="166" r="3" fill="#fff" />
        <circle cx="253" cy="166" r="3" fill="#fff" />
        <path
          d="M150 168 Q172 150 196 166"
          fill="none"
          stroke={INK}
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M232 166 Q256 150 280 168"
          fill="none"
          stroke={INK}
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M212 186 L206 204 L218 206"
          fill="none"
          stroke={INK}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M178 214 Q214 204 250 212 Q246 246 214 250 Q182 246 178 214 Z"
          fill="#7d1c1c"
          {...line}
        />
        <path
          d="M182 215 Q214 206 246 213 L244 224 Q214 218 184 226 Z"
          fill="#fff"
          stroke={INK}
          strokeWidth="2"
        />
        <ellipse cx="214" cy="240" rx="16" ry="7" fill="#e0607a" />
        <path
          d="M160 200 Q168 216 182 222"
          fill="none"
          stroke={SKIN_SHADE}
          strokeWidth="4"
          strokeLinecap="round"
        />

        {/* Spiky hair with one long tuft */}
        <path
          d="M128 156 L120 112 L94 88 L138 90 L124 46 L164 72 L170 22 L200 64 L232 4 L238 64 L268 38 L266 86 L296 78 L272 122 L268 156 Q264 120 242 108 Q206 94 164 108 Q142 120 138 156 Z"
          fill={HAIR}
          {...line}
        />
        <path d="M140 92 L128 56 L156 76 Z" fill={HAIR_LIGHT} />
        <path d="M176 66 L172 34 L194 66 Z" fill={HAIR_LIGHT} />
        <path d="M236 60 L234 20 L252 52 Z" fill={HAIR_LIGHT} />
      </g>

      {/* Pointing arm: rolled sleeve, forearm, bracelet, fist with the index finger out */}
      <path d="M270 316 Q318 316 344 388 L328 448 L270 430 Z" fill={SHIRT} {...line} />
      <path d="M298 420 Q318 440 336 434" fill="none" stroke={SHIRT_SHADE} strokeWidth="6" />
      <path
        d="M326 452 L322 388 Q336 340 366 320 L394 340 Q380 372 372 452 Z"
        fill={SKIN}
        {...line}
      />
      <path d="M326 430 Q350 444 374 430" fill="none" stroke={SKIN_SHADE} strokeWidth="5" />
      <g transform="translate(350 352) rotate(10) scale(1.18) translate(-350 -352)">
        <path d="M330 344 Q356 328 382 342 L380 362 Q356 348 332 364 Z" fill={GOLD} {...line} />
        <path
          d="M338 326 Q352 276 392 270 Q430 268 436 306 Q440 336 410 350 Q380 360 350 350 Z"
          fill={SKIN}
          {...line}
        />
        <path
          d="M392 306 Q416 300 432 312"
          fill="none"
          stroke={INK}
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M388 326 Q414 322 434 332"
          fill="none"
          stroke={INK}
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M396 276 Q398 226 414 200 Q426 192 432 206 Q428 246 424 284 Z"
          fill={SKIN}
          {...line}
        />
        <path d="M344 316 Q336 290 350 280 Q364 286 366 312" fill={SKIN} {...line} />
      </g>
    </svg>
  );
}
