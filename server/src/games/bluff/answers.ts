import { ANSWER_MAX_LENGTH } from '@mini-jeux/shared/games/bluff-themes';

const segmenter = new Intl.Segmenter('fr', { granularity: 'grapheme' });
const COMBINING_MARK = /\p{M}/gu;
/** Real scripts and emoji use a few marks per character; "Zalgo" text stacks dozens of them. */
const MAX_MARKS_PER_GRAPHEME = 4;
// Format characters (invisible, right-to-left marks…) other than the joiners emoji need.
const FORBIDDEN_FORMAT = /(?![\u{200D}\u{FE0F}])\p{Cf}/u;
const MEANINGFUL = /[\p{L}\p{N}\p{Extended_Pictographic}]/u;

/** A written answer as it is kept: NFC, spaces collapsed, trimmed. */
export function cleanAnswer(raw: string): string {
  return raw.normalize('NFC').replace(/\s+/gu, ' ').trim();
}

export function countGraphemes(text: string): number {
  let count = 0;
  for (const _ of segmenter.segment(text)) count++;
  return count;
}

/** Whether a cleaned answer can be shown to everybody: not empty, short, no hidden characters. */
export function isValidAnswer(text: string): boolean {
  const length = countGraphemes(text);
  if (length < 1 || length > ANSWER_MAX_LENGTH) return false;
  if (!MEANINGFUL.test(text)) return false;
  if (/[\p{Cc}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/u.test(text) || FORBIDDEN_FORMAT.test(text)) return false;
  for (const { segment } of segmenter.segment(text)) {
    if ((segment.match(COMBINING_MARK)?.length ?? 0) > MAX_MARKS_PER_GRAPHEME) return false;
  }
  return true;
}

/** Small words that people add or drop when they write the same answer. */
const SMALL_WORDS = new Set(['le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd']);

/**
 * What two answers must share to count as the same: no case, no accent, no punctuation, no
 * article ("La Joconde" = "joconde" = "Joconde !").
 */
export function answerKey(text: string): string {
  const words = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('fr')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  const meaningful = words.filter((word) => !SMALL_WORDS.has(word));
  return (meaningful.length > 0 ? meaningful : words).join(' ');
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        previous[j]! + 1,
        row[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = row;
  }
  return previous[b.length]!;
}

/**
 * Whether a written answer is, in practice, the real one: the same once normalized, or one typo
 * away for a word of at least six letters (digits excluded: "Paris 7" is not "Paris 8").
 */
export function isRealAnswer(text: string, accepted: readonly string[]): boolean {
  const key = answerKey(text);
  return accepted.some((answer) => {
    const other = answerKey(answer);
    if (key === other) return true;
    if (/\d/u.test(key) || /\d/u.test(other)) return false;
    return Math.min(key.length, other.length) >= 6 && editDistance(key, other) <= 1;
  });
}
