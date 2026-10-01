import { expect, test } from '@playwright/test';
import { closeAll, createRoom, joinRoom, openPlayer, startGame } from './helpers.ts';
import type { Player } from './helpers.ts';

let players: Player[] = [];

test.afterEach(async () => {
  for (const player of players) expect(player.errors, player.name).toEqual([]);
  await closeAll(players);
  players = [];
});

const NAMES = ['Alice', 'Bob', 'Carol', 'Dave'];

test('Désamorçage with four players: roles, separate manuals, explosions, four bombs', async ({
  browser,
}) => {
  players = await Promise.all(NAMES.map((name) => openPlayer(browser, name)));
  const [alice] = players as [Player, ...Player[]];
  const code = await createRoom(alice, 'Désamorçage');
  for (const player of players.slice(1)) await joinRoom(player, code);

  // One error is enough to blow the bomb up: the test hits a wall of the maze on purpose.
  const strikes = alice.page.getByLabel('Erreurs avant explosion');
  await strikes.fill('1');
  await strikes.blur();
  await startGame(alice);

  const defusers = new Set<string>();
  for (let round = 1; round <= 4; round++) {
    for (const player of players) {
      await expect(player.page.getByText(`Bombe ${round} / 4`)).toBeVisible();
      await expect(player.page.getByText('La bombe explose à la première erreur.')).toBeVisible();
    }
    const defuser = await (async () => {
      for (const player of players) {
        if (await player.page.getByRole('heading', { name: 'Tu es le démineur' }).isVisible()) {
          return player;
        }
      }
      throw new Error('no defuser');
    })();
    defusers.add(defuser.name);
    for (const player of players) {
      await player.page.getByRole('button', { name: 'Je suis prêt' }).click();
    }

    // The defuser sees the bomb and no manual; each expert sees their own sheets, not the bomb.
    for (const player of players) {
      await expect(player.page.getByRole('timer', { name: 'Chrono de la bombe' })).toBeVisible();
    }
    await expect(defuser.page.getByRole('region', { name: 'Labyrinthe' })).toBeVisible();
    await expect(defuser.page.getByRole('region', { name: 'Fils' })).toBeVisible();
    await expect(defuser.page.locator('article')).toHaveCount(0);
    const experts = players.filter((p) => p !== defuser);
    const manuals: string[] = [];
    for (const expert of experts) {
      await expect(expert.page.getByRole('region', { name: 'Labyrinthe' })).toHaveCount(0);
      const sheets = expert.page.locator('article');
      expect(await sheets.count()).toBeGreaterThanOrEqual(2);
      manuals.push((await sheets.allTextContents()).join('|'));
    }
    expect(new Set(manuals).size).toBe(3);

    if (round === 1) {
      // Holding the big button lights its strip up (released at once: right or wrong, no matter).
      const button = defuser.page.getByRole('button', { name: /^Bouton / });
      const box = (await button.boundingBox())!;
      await defuser.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await defuser.page.mouse.down();
      await expect(defuser.page.getByRole('img', { name: /^Bande (?!éteinte)/ })).toBeVisible();
      await defuser.page.mouse.up();
    }

    // Going up from any cell ends against the top edge of the maze: an error, the only one allowed.
    const up = defuser.page
      .getByRole('region', { name: 'Labyrinthe' })
      .getByRole('button', { name: 'Haut' });
    for (let i = 0; i < 6 && (await up.isVisible()); i++) await up.click();
    for (const player of players) {
      await expect(player.page.getByRole('heading', { name: 'BOUM' })).toBeVisible();
    }
    await alice.page
      .getByRole('button', { name: round < 4 ? 'Bombe suivante' : 'Voir le bilan' })
      .click();
  }

  // Everybody was the defuser once.
  expect(defusers.size).toBe(4);
  for (const player of players) {
    await expect(player.page.getByText('Classement final · Désamorçage')).toBeVisible();
  }
});
