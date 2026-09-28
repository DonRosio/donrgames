import { describe, expect, it } from 'vitest';
import { countGraphemes, nicknameKey, normalizeNickname, validateNickname } from './nickname.ts';

describe('normalizeNickname', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeNickname('  Jean \t  Pierre \n')).toBe('Jean Pierre');
  });

  it('applies NFC normalization', () => {
    expect(normalizeNickname('Amélie')).toBe('Amélie');
  });
});

describe('validateNickname', () => {
  it.each(['Léa', 'Jean-Pierre', "O'Brien", 'Zoé_42', 'Max!', 'Ça va', '😀 Bob', 'Émile 👨‍👩‍👧'])(
    'accepts %s',
    (nickname) => {
      expect(validateNickname(normalizeNickname(nickname))).toBeNull();
    },
  );

  it('enforces the length in graphemes, not code units', () => {
    expect(validateNickname('A')).toBe('NICKNAME_TOO_SHORT');
    expect(validateNickname('A'.repeat(17))).toBe('NICKNAME_TOO_LONG');
    // A family emoji is several code points but a single grapheme.
    expect(countGraphemes('👨‍👩‍👧')).toBe(1);
    expect(validateNickname('👨‍👩‍👧'.repeat(16))).toBeNull();
  });

  it.each([
    ['HTML', '<b>Bob</b>'],
    ['control characters', 'Bob\u0007'],
    ['bidi override', 'Bob‮evil'],
    ['zero-width space', 'Bo​b'],
    ['punctuation only', '---'],
    ['slash', 'a/b'],
  ])('rejects %s', (_label, nickname) => {
    expect(validateNickname(normalizeNickname(nickname))).toBe('NICKNAME_INVALID');
  });
});

describe('nicknameKey', () => {
  it('ignores case and invisible emoji joiners', () => {
    expect(nicknameKey('Bob')).toBe(nicknameKey('bOB'));
    expect(nicknameKey('Bob‍')).toBe(nicknameKey('Bob'));
  });

  it('keeps accents significant', () => {
    expect(nicknameKey('Léa')).not.toBe(nicknameKey('Lea'));
  });
});
