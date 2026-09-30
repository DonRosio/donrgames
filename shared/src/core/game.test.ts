import { describe, expect, it } from 'vitest';
import { defaultMulti, isValidMulti, playerCountLabel } from './game.ts';
import type { SettingDef } from './game.ts';

const roles = {
  kind: 'multi',
  label: 'Rôles',
  min: 3,
  options: [
    { value: 'a', label: 'A', locked: true },
    { value: 'b', label: 'B' },
    { value: 'c', label: 'C' },
    { value: 'd', label: 'D', minWhenChecked: 4 },
    { value: 'e', label: 'E', disabled: true },
  ],
} as const satisfies SettingDef;

describe('multi settings', () => {
  it('check every enabled option by default', () => {
    expect(defaultMulti(roles)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('accept the allowed sets only', () => {
    expect(isValidMulti(roles, ['a', 'b', 'c'])).toBe(true);
    expect(isValidMulti(roles, ['c', 'a', 'b'])).toBe(true);
    expect(isValidMulti(roles, ['a', 'b'])).toBe(false); // below the minimum
    expect(isValidMulti(roles, ['b', 'c', 'd', 'x'])).toBe(false); // unknown option
    expect(isValidMulti(roles, ['b', 'c', 'd'])).toBe(false); // locked option missing
    expect(isValidMulti(roles, ['a', 'b', 'e'])).toBe(false); // disabled option
    expect(isValidMulti(roles, ['a', 'b', 'd'])).toBe(false); // d requires 4 options
    expect(isValidMulti(roles, ['a', 'b', 'c', 'd'])).toBe(true);
    expect(isValidMulti(roles, ['a', 'b', 'b'])).toBe(false); // duplicate
    expect(isValidMulti(roles, 'a,b,c')).toBe(false);
  });
});

describe('player count label', () => {
  const meta = {
    id: 'x',
    name: 'X',
    description: '',
    minPlayers: 2,
    maxPlayers: 10,
    replayable: true,
  };

  it('shows the bounds, or the allowed counts', () => {
    expect(playerCountLabel(meta)).toBe('2 à 10 joueurs');
    expect(playerCountLabel({ ...meta, playerCounts: [5, 10] })).toBe('5 ou 10 joueurs');
    expect(playerCountLabel({ ...meta, playerCounts: [4, 6, 8] })).toBe('4, 6 ou 8 joueurs');
  });
});
