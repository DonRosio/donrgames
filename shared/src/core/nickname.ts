import { NICKNAME_MAX_LENGTH, NICKNAME_MIN_LENGTH } from './limits.ts';

export type NicknameError = 'NICKNAME_TOO_SHORT' | 'NICKNAME_TOO_LONG' | 'NICKNAME_INVALID';

// Letters and digits of any script, combining marks, space, a few punctuation signs and emoji
// (including ZWJ sequences, variation selectors, skin tones and flags).
const ALLOWED_CHARS =
  /^[\p{L}\p{M}\p{N} \-_.'!\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u{200D}\u{FE0F}]+$/u;
const MEANINGFUL_CHAR = /[\p{L}\p{N}\p{Extended_Pictographic}\p{Regional_Indicator}]/u;
const INVISIBLE_JOINERS = /[\u{200D}\u{FE0F}]/gu;

const segmenter = new Intl.Segmenter('fr', { granularity: 'grapheme' });

export function normalizeNickname(raw: string): string {
  return raw.normalize('NFC').replace(/\s+/gu, ' ').trim();
}

export function countGraphemes(text: string): number {
  let count = 0;
  for (const _ of segmenter.segment(text)) count++;
  return count;
}

/** Validates an already normalized nickname. Returns null when valid. */
export function validateNickname(nickname: string): NicknameError | null {
  const length = countGraphemes(nickname);
  if (length < NICKNAME_MIN_LENGTH) return 'NICKNAME_TOO_SHORT';
  if (length > NICKNAME_MAX_LENGTH) return 'NICKNAME_TOO_LONG';
  if (!ALLOWED_CHARS.test(nickname) || !MEANINGFUL_CHAR.test(nickname)) return 'NICKNAME_INVALID';
  return null;
}

/** Key used to detect duplicates: case-insensitive, ignoring invisible emoji joiners. */
export function nicknameKey(nickname: string): string {
  return nickname.replace(INVISIBLE_JOINERS, '').toLocaleLowerCase('fr');
}
