import { describe, expect, it } from 'vitest';
import { purgeBeepEvery, soundEvents, tickKind } from './sound-events.ts';

const calm = { strikes: 0, solved: 0, purgeActive: false };

describe('soundEvents', () => {
  it('says nothing when nothing changed', () => {
    expect(soundEvents(calm, calm)).toEqual([]);
    expect(soundEvents({ ...calm, strikes: 1 }, { ...calm, strikes: 1 })).toEqual([]);
  });

  it('an error, a module defused, the purge waking up', () => {
    expect(soundEvents(calm, { ...calm, strikes: 1 })).toEqual(['strike']);
    expect(soundEvents(calm, { ...calm, solved: 1 })).toEqual(['solved']);
    expect(soundEvents(calm, { ...calm, purgeActive: true })).toEqual(['purgeAlert']);
  });

  it('several things at once: the error comes first', () => {
    expect(soundEvents(calm, { strikes: 1, solved: 1, purgeActive: true })).toEqual([
      'strike',
      'solved',
      'purgeAlert',
    ]);
  });

  it('is silent when things go back to calm: the purge falling asleep is not news', () => {
    expect(soundEvents({ ...calm, purgeActive: true }, calm)).toEqual([]);
    expect(soundEvents({ strikes: 2, solved: 3, purgeActive: false }, calm)).toEqual([]);
  });
});

describe('tickKind and purgeBeepEvery', () => {
  it('gets more urgent as the clock runs out', () => {
    expect(tickKind(120)).toBe('normal');
    expect(tickKind(31)).toBe('normal');
    expect(tickKind(30)).toBe('fast');
    expect(tickKind(11)).toBe('fast');
    expect(tickKind(10)).toBe('urgent');
    expect(tickKind(0)).toBe('urgent');
  });

  it('beeps faster when the purge window is about to close', () => {
    expect(purgeBeepEvery(40_000)).toBe(1500);
    expect(purgeBeepEvery(10_001)).toBe(1500);
    expect(purgeBeepEvery(10_000)).toBe(600);
    expect(purgeBeepEvery(0)).toBe(600);
  });
});
