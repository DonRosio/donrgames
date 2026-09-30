import { describe, expect, it } from 'vitest';
import type { AmongLegendsView } from '@mini-jeux/shared/games/among-legends';
import {
  CHAMELEON_REVEAL_MS,
  TWO_FACE_PERIOD_MS,
  twoFaceModeAt,
} from '@mini-jeux/shared/games/among-legends-roles';
import type { RoleId } from '@mini-jeux/shared/games/among-legends-roles';
import { createHarness } from '../../core/engine/harness.ts';
import { seededRandom } from '../../core/engine/random.ts';
import { validateGameDefinition } from '../../core/engine/validate.ts';
import { amongLegendsGame, drawTeamRoles } from './index.ts';

const FIVE = ['alice', 'bob', 'carol', 'dave', 'erin'];
const TEN = [...FIVE, 'fanny', 'gabin', 'hugo', 'ines', 'jules'];
const MINUTE = 60_000;

function play(players = FIVE, roles?: RoleId[], seed = 1) {
  return createHarness(amongLegendsGame, {
    players,
    seed,
    ...(roles ? { settings: { roles } } : {}),
  });
}

type G = ReturnType<typeof play>;
const view = <P extends AmongLegendsView['phase']>(g: G, player: string, phase: P) => {
  const v = g.view(player);
  expect(v.phase).toBe(phase);
  return v as AmongLegendsView & { phase: P };
};
const roleOf = (g: G, player: string) => (g.view(player) as { role: RoleId }).role;
const rolesOf = (g: G, players: readonly string[]) => players.map((p) => roleOf(g, p));
/** First seed whose draw gives this role to someone among the five players. */
function withRole(role: RoleId, roles: RoleId[]): G {
  for (let seed = 1; seed < 200; seed++) {
    const g = play(FIVE, roles, seed);
    if (rolesOf(g, FIVE).includes(role)) return g;
  }
  throw new Error(`no seed draws ${role}`);
}
const holderOf = (g: G, role: RoleId) => FIVE.find((p) => roleOf(g, p) === role)!;

describe('Among Legends: teams and roles', () => {
  it('is a valid definition', () => {
    expect(() => validateGameDefinition(amongLegendsGame)).not.toThrow();
  });

  it('keeps every playable role by default, the Droïde excepted', () => {
    const v = view(play(), 'alice', 'briefing');
    expect(v.roles).not.toContain('droid');
    expect(v.roles).toContain('impostor');
    expect(v.roles).toHaveLength(9);
  });

  it('with 5 players, skips the teams and draws 5 distinct roles, one of them the Imposteur', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = play(FIVE, undefined, seed);
      const roles = rolesOf(g, FIVE);
      expect(new Set(roles).size).toBe(5);
      expect(roles.filter((r) => r === 'impostor')).toHaveLength(1);
      expect(roles).not.toContain('droid');
      expect(Object.values(view(g, 'alice', 'briefing').teams)).toEqual(Array(5).fill('blue'));
    }
  });

  it('only draws the roles the host kept', () => {
    const kept: RoleId[] = ['impostor', 'superhero', 'snake', 'crook', 'pacifist'];
    const g = play(FIVE, kept);
    expect(rolesOf(g, FIVE).sort()).toEqual([...kept].sort());
  });

  it('never shows a player the role of another player', () => {
    const g = play();
    const v = view(g, 'alice', 'briefing');
    expect(Object.keys(v).sort()).toEqual(
      ['phase', 'read', 'role', 'roles', 'size', 'teams', 'twoFaceStart'].sort(),
    );
    expect(v.role).toBe(roleOf(g, 'alice'));
  });

  it('draws valid teams of roles whatever the selection', () => {
    const selected: RoleId[] = ['impostor', 'superhero', 'snake', 'crook', 'pacifist', 'chameleon'];
    for (let seed = 1; seed <= 50; seed++) {
      const roles = drawTeamRoles(selected, seededRandom(seed));
      expect(new Set(roles).size).toBe(5);
      expect(roles).toContain('impostor');
      for (const role of roles) expect(selected).toContain(role);
    }
  });
});

describe('Among Legends: two teams of five', () => {
  const choose = (g: G, players: readonly string[], team: 'blue' | 'red') => {
    for (const p of players) expect(g.act(p, 'chooseTeam', { team })).toEqual({ ok: true });
  };

  it('lets everyone choose a team, five per team, then the host confirms', () => {
    const g = play(TEN);
    expect(view(g, 'alice', 'teams').teams.alice).toBeNull();
    choose(g, TEN.slice(0, 5), 'blue');
    expect(g.act('fanny', 'chooseTeam', { team: 'blue' })).toEqual({
      ok: false,
      error: 'TEAM_FULL',
    });
    expect(g.act('alice', 'confirmTeams')).toEqual({ ok: false, error: 'TEAMS_INCOMPLETE' });
    choose(g, TEN.slice(5), 'red');
    // Changing team is allowed while there is room.
    expect(g.act('alice', 'chooseTeam', { team: 'blue' })).toEqual({ ok: true });
    expect(g.act('bob', 'confirmTeams')).toEqual({ ok: false, error: 'NOT_HOST' });
    expect(g.act('alice', 'confirmTeams')).toEqual({ ok: true });
    expect(view(g, 'fanny', 'briefing').teams).toMatchObject({ alice: 'blue', fanny: 'red' });
  });

  it('draws 5 distinct roles per team, each with its own Imposteur', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = play(TEN, undefined, seed);
      choose(g, TEN.slice(0, 5), 'blue');
      choose(g, TEN.slice(5), 'red');
      g.act('alice', 'confirmTeams');
      for (const team of [TEN.slice(0, 5), TEN.slice(5)]) {
        const roles = rolesOf(g, team);
        expect(new Set(roles).size).toBe(5);
        expect(roles.filter((r) => r === 'impostor')).toHaveLength(1);
      }
    }
  });
});

describe('Among Legends: during the game', () => {
  const DOUBLE_FACE: RoleId[] = ['impostor', 'two-face', 'superhero', 'snake', 'crook'];

  it('shows who read their role, and starts when the host says so', () => {
    const g = play();
    g.act('bob', 'read');
    expect(view(g, 'alice', 'briefing').read).toEqual(['bob']);
    expect(g.act('bob', 'start')).toEqual({ ok: false, error: 'NOT_HOST' });
    expect(g.act('alice', 'start')).toEqual({ ok: true });
    const v = view(g, 'bob', 'playing');
    expect(v.startedAt).toBe(g.clock.now());
    expect(v.alert).toBeNull();
  });

  it('also starts with "Passer à la suite" during the briefing', () => {
    const g = play();
    g.skip();
    view(g, 'alice', 'playing');
  });

  it('tells the Double Face its starting mode, then alerts it every 7 minutes', () => {
    const g = play(FIVE, DOUBLE_FACE);
    const twoFace = holderOf(g, 'two-face');
    const other = FIVE.find((p) => p !== twoFace)!;
    const start = view(g, twoFace, 'briefing').twoFaceStart!;
    expect(view(g, other, 'briefing').twoFaceStart).toBeNull();

    g.act('alice', 'start');
    const t0 = g.clock.now();
    expect(view(g, twoFace, 'playing').twoFace).toEqual({
      mode: start,
      nextSwitchAt: t0 + TWO_FACE_PERIOD_MS,
    });
    g.advance(TWO_FACE_PERIOD_MS - 1);
    expect(view(g, twoFace, 'playing').alert).toBeNull();
    g.advance(1);
    const flipped = view(g, twoFace, 'playing');
    expect(flipped.alert).toEqual({ seq: 1, kind: 'twoFace' });
    expect(flipped.twoFace).toEqual({
      mode: twoFaceModeAt(start, TWO_FACE_PERIOD_MS),
      nextSwitchAt: t0 + 2 * TWO_FACE_PERIOD_MS,
    });
    expect(flipped.twoFace!.mode).not.toBe(start);
    g.advance(TWO_FACE_PERIOD_MS);
    expect(view(g, twoFace, 'playing')).toMatchObject({
      alert: { seq: 2 },
      twoFace: { mode: start },
    });
    // Nobody else hears anything.
    expect(view(g, other, 'playing')).toMatchObject({ alert: null, twoFace: null });
  });

  it('reveals the real role of the Chameleon at 15 minutes, among the free roles', () => {
    const selected: RoleId[] = ['impostor', 'superhero', 'snake', 'crook', 'pacifist', 'chameleon'];
    const g = withRole('chameleon', selected);
    const chameleon = holderOf(g, 'chameleon');
    const taken = rolesOf(g, FIVE);
    const free = selected.filter((r) => !taken.includes(r));
    expect(free).toHaveLength(1);

    g.act('alice', 'start');
    const t0 = g.clock.now();
    expect(view(g, chameleon, 'playing').chameleon).toEqual({
      revealAt: t0 + CHAMELEON_REVEAL_MS,
      role: null,
    });
    g.advance(CHAMELEON_REVEAL_MS);
    expect(view(g, chameleon, 'playing')).toMatchObject({
      role: 'chameleon',
      chameleon: { role: free[0] },
      alert: { seq: 1, kind: 'chameleon' },
    });
  });

  it('turns a Chameleon into a Double Face that then switches like the others', () => {
    const selected: RoleId[] = ['impostor', 'two-face', 'superhero', 'snake', 'crook', 'chameleon'];
    let g: G | null = null;
    for (let seed = 1; seed < 300 && !g; seed++) {
      const candidate = play(FIVE, selected, seed);
      const roles = rolesOf(candidate, FIVE);
      if (roles.includes('chameleon') && !roles.includes('two-face')) g = candidate;
    }
    const chameleon = holderOf(g!, 'chameleon');
    g!.act('alice', 'start');
    g!.advance(CHAMELEON_REVEAL_MS);
    const revealed = view(g!, chameleon, 'playing');
    expect(revealed.chameleon!.role).toBe('two-face');
    expect(revealed.twoFace).not.toBeNull();
    // Next switch at 21 minutes.
    g!.advance(21 * MINUTE - CHAMELEON_REVEAL_MS);
    expect(view(g!, chameleon, 'playing').alert).toEqual({ seq: 2, kind: 'twoFace' });
  });

  it('ends when the host says the League of Legends game is over', () => {
    const g = play();
    g.act('alice', 'start');
    expect(g.act('bob', 'end')).toEqual({ ok: false, error: 'NOT_HOST' });
    g.act('alice', 'end');
    expect(g.ended).toBe(true);
  });
});
