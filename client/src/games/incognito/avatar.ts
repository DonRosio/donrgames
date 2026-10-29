// The avatars are drawn artwork: their palette lives here, not in the design tokens.

const SKINS = ['#f6d3b3', '#e8b78c', '#c98e63', '#9a6a45', '#6e4630'];
const HAIRS = ['#2a1a10', '#5b3a1e', '#a8672b', '#d9a441', '#bdbdbd', '#b5342a'];
const SHIRTS = ['#3b5a8a', '#8a3b3b', '#3b8a5a', '#8a6f3b', '#5a3b8a', '#2f2f3a', '#c9c9d6'];
/** One per first name of the game (slot 0 to 9): neighbours are easy to tell apart. */
const BACKGROUNDS = [
  '#7fc4e8',
  '#f2a65a',
  '#9ad17f',
  '#e58fb0',
  '#b39ddb',
  '#f2d16b',
  '#7fd1c4',
  '#e8836f',
  '#a8b8e8',
  '#c9d68a',
];

export const HAIR_STYLES = ['short', 'long', 'bald', 'mohawk', 'curly', 'cap'] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];

export interface Look {
  background: string;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  shirt: string;
  glasses: boolean;
  beard: boolean;
}

/** FNV-1a: a small stable hash, so a first name always gets the same face. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (const char of text) {
    value ^= char.codePointAt(0)!;
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

/** The face of a first name; the background depends on its slot in the game (unique). */
export function lookOf(name: string, slot: number): Look {
  let seed = hash(name);
  const draw = (count: number) => {
    const value = seed % count;
    seed = Math.floor(seed / count) + Math.imul(seed, 31) + 7;
    seed >>>= 0;
    return value;
  };
  return {
    background: BACKGROUNDS[slot % BACKGROUNDS.length]!,
    skin: SKINS[draw(SKINS.length)]!,
    hair: HAIRS[draw(HAIRS.length)]!,
    hairStyle: HAIR_STYLES[draw(HAIR_STYLES.length)]!,
    shirt: SHIRTS[draw(SHIRTS.length)]!,
    glasses: draw(3) === 0,
    beard: draw(3) === 0,
  };
}
