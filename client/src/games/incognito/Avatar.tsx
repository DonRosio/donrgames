import { useId } from 'react';
import { lookOf } from './avatar.ts';
import type { Look } from './avatar.ts';

const EYE = '#2a1a10';

/** Hair drawn behind the head (long hair). */
function HairBack({ look }: { look: Look }) {
  if (look.hairStyle !== 'long') return null;
  return <path d="M19 30 C16 8 48 8 45 30 L48 52 L16 52 Z" fill={look.hair} />;
}

/** Hair drawn over the head. */
function HairFront({ look }: { look: Look }) {
  switch (look.hairStyle) {
    case 'short':
    case 'long':
      return <path d="M19.5 28 C18 11 46 11 44.5 28 C41 21 23 21 19.5 28 Z" fill={look.hair} />;
    case 'mohawk':
      return <path d="M29 7 L35 7 L36.5 21 L27.5 21 Z" fill={look.hair} />;
    case 'curly':
      return (
        <g fill={look.hair}>
          <circle cx="23.5" cy="20" r="5" />
          <circle cx="30" cy="15.5" r="5.5" />
          <circle cx="37" cy="15.5" r="5.5" />
          <circle cx="42" cy="21" r="5" />
          <circle cx="20.5" cy="27" r="3.5" />
          <circle cx="43.5" cy="27" r="3.5" />
        </g>
      );
    case 'cap':
      return (
        <g fill={look.hair}>
          <path d="M19.5 25 C19 9 45 9 44.5 25 Z" />
          <rect x="17" y="23.5" width="30" height="3.5" rx="1.75" />
          <path d="M40 24 L55 25.5 L40 28 Z" />
        </g>
      );
    case 'bald':
      return null;
  }
}

/** A round cartoon face, always the same for a given first name. */
export function Avatar({ name, slot, size = 40 }: { name: string; slot: number; size?: number }) {
  const clip = useId();
  const look = lookOf(name, slot);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      style={{ flex: 'none' }}
    >
      <defs>
        <clipPath id={clip}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="64" height="64" fill={look.background} />
        <path d="M6 66 C8 50 22 46 32 46 C42 46 56 50 58 66 Z" fill={look.shirt} />
        <rect x="27" y="38" width="10" height="11" fill={look.skin} />
        <HairBack look={look} />
        <ellipse cx="32" cy="30" rx="12" ry="14" fill={look.skin} />
        {look.beard && (
          <path d="M20.2 31 C20 49 44 49 43.8 31 C40 39 24 39 20.2 31 Z" fill={look.hair} />
        )}
        <HairFront look={look} />
        <circle cx="27" cy="30" r="1.7" fill={EYE} />
        <circle cx="37" cy="30" r="1.7" fill={EYE} />
        {look.glasses && (
          <g fill="none" stroke={EYE} strokeWidth="1.4">
            <circle cx="27" cy="30" r="4.6" />
            <circle cx="37" cy="30" r="4.6" />
            <path d="M31.6 29.5 L32.4 29.5" />
          </g>
        )}
        <path
          d="M28 37.2 Q32 40.4 36 37.2"
          fill="none"
          stroke={look.beard ? '#f6e6d0' : EYE}
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
