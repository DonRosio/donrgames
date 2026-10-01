import { describe, expect, it } from 'vitest';
import { answerKey, cleanAnswer, isRealAnswer, isValidAnswer } from './answers.ts';

describe('cleanAnswer', () => {
  it('collapses spaces and trims', () => {
    expect(cleanAnswer('  un   cochon \n')).toBe('un cochon');
  });
});

describe('isValidAnswer', () => {
  it('accepts normal answers, with accents, digits, punctuation and emoji', () => {
    for (const ok of [
      'Un cochon',
      "L'île d'Elbe",
      'Dr. Slump',
      '1386',
      'Pikachu ⚡',
      'Œuf à la coque',
    ]) {
      expect(isValidAnswer(ok), ok).toBe(true);
    }
  });

  it('refuses empty, too long, invisible or stacked-marks text', () => {
    expect(isValidAnswer('')).toBe(false);
    expect(isValidAnswer('a'.repeat(61))).toBe(false);
    expect(isValidAnswer('a'.repeat(60))).toBe(true);
    expect(isValidAnswer('!!!')).toBe(false);
    expect(isValidAnswer('abc\u0000def')).toBe(false);
    expect(isValidAnswer('abc‮def')).toBe(false); // right-to-left override
    expect(isValidAnswer('a​b')).toBe(false); // zero-width space
    expect(isValidAnswer(`z${'́'.repeat(12)}`)).toBe(false);
  });

  it('counts a character, not a code unit', () => {
    expect(isValidAnswer('😀'.repeat(60))).toBe(true);
    expect(isValidAnswer('😀'.repeat(61))).toBe(false);
  });
});

describe('answerKey', () => {
  it('ignores case, accents, punctuation and articles', () => {
    expect(answerKey('La Joconde !')).toBe('joconde');
    expect(answerKey("L'Éléphant")).toBe('elephant');
    expect(answerKey('Dr. Slump')).toBe(answerKey('dr slump'));
    expect(answerKey('un cochon')).toBe(answerKey('Le COCHON'));
  });

  it('never ends up empty because of the small words', () => {
    expect(answerKey('Le')).toBe('le');
  });
});

describe('isRealAnswer', () => {
  const accepted = ['Tokyo', 'Tōkyō'];

  it('recognises the real answer and its variants', () => {
    expect(isRealAnswer('tokyo', accepted)).toBe(true);
    expect(isRealAnswer('TOKYO !', accepted)).toBe(true);
    expect(isRealAnswer('Tokyō', accepted)).toBe(true);
    expect(isRealAnswer('Kyoto', accepted)).toBe(false);
  });

  it('is fooled neither by articles nor by one typo in a long word', () => {
    expect(isRealAnswer('Le cochon', ['un cochon'])).toBe(true);
    expect(isRealAnswer('Dr Slumps', ['Dr. Slump'])).toBe(true);
    expect(isRealAnswer('un chien', ['un cochon'])).toBe(false);
  });

  it('does not take one digit for a typo', () => {
    expect(isRealAnswer('Paris 8', ['Paris 7'])).toBe(false);
    expect(isRealAnswer('1387', ['1386'])).toBe(false);
  });

  it('does not take a short word for a typo of another', () => {
    expect(isRealAnswer('chat', ['chut'])).toBe(false);
  });
});
