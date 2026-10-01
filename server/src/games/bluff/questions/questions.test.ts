import { describe, expect, it } from 'vitest';
import { ANSWER_MAX_LENGTH, BLANK, THEME_IDS } from '@mini-jeux/shared/games/bluff-themes';
import { answerKey, isRealAnswer, isValidAnswer } from '../answers.ts';
import { QUESTIONS } from './index.ts';

describe('the questions of Le Bluff', () => {
  it('has 20 questions for each of the ten themes', () => {
    for (const theme of THEME_IDS) {
      expect(
        QUESTIONS.filter((q) => q.theme === theme),
        theme,
      ).toHaveLength(20);
    }
    expect(QUESTIONS).toHaveLength(200);
  });

  it('has unique identifiers and unique sentences', () => {
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length);
    expect(new Set(QUESTIONS.map((q) => q.text)).size).toBe(QUESTIONS.length);
  });

  it('has exactly one blank in every sentence', () => {
    for (const q of QUESTIONS) expect(q.text.split(BLANK), q.id).toHaveLength(2);
  });

  it('has real answers that a player could type, and short enough', () => {
    for (const q of QUESTIONS) {
      expect(isValidAnswer(q.answer), q.id).toBe(true);
      expect(q.answer.length, q.id).toBeLessThanOrEqual(ANSWER_MAX_LENGTH);
      expect(answerKey(q.answer), q.id).not.toBe('');
    }
  });

  it('recognises its own answer and variants as the real one', () => {
    for (const q of QUESTIONS) {
      for (const text of [q.answer, ...q.accept]) {
        expect(isRealAnswer(text, [q.answer, ...q.accept]), `${q.id}: ${text}`).toBe(true);
      }
    }
  });

  it('does not give the answer away in the sentence', () => {
    for (const q of QUESTIONS) {
      const words = answerKey(q.answer).split(' ');
      if (words.length !== 1 || words[0]!.length < 4 || /^\d+$/.test(words[0]!)) continue;
      const sentence = answerKey(q.text.replace(BLANK, ''));
      expect(sentence.split(' '), `${q.id}: "${q.answer}" is in the sentence`).not.toContain(
        words[0],
      );
    }
  });
});
