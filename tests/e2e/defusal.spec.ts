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

/** A gesture that is certainly wrong, on whichever of these modules the bomb has. */
async function blowUp(defuser: Player) {
  const region = (name: string) => defuser.page.getByRole('region', { name, exact: true });
  // The wheels never start on the right word, and the radio never starts on the right frequency.
  if (await region('Mot de passe').count()) {
    await region('Mot de passe').getByRole('button', { name: 'Valider' }).click();
  } else if (await region('Morse').count()) {
    await region('Morse').getByRole('button', { name: 'Émettre' }).click();
  } else {
    // Cutting every wire cuts a wrong one: there is only one right wire.
    const wires = region('Fils').getByRole('button');
    for (let i = 0; i < 6 && (await wires.nth(i).isVisible()); i++) {
      await wires.nth(i).click();
    }
  }
}

test('Désamorçage with four players: roles, separate manuals, six modules, four bombs', async ({
  browser,
}) => {
  players = await Promise.all(NAMES.map((name) => openPlayer(browser, name)));
  const [alice] = players as [Player, ...Player[]];
  const code = await createRoom(alice, 'Désamorçage');
  for (const player of players.slice(1)) await joinRoom(player, code);

  // One error is enough to blow the bomb up.
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
    if (round === 1) {
      // The sound can be turned off, and on again (it is made in the browser, no file).
      const toggle = alice.page.getByRole('button', { name: /^.{0,3}Son/ });
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      await toggle.click();
      await expect(toggle).toHaveText(/Son coupé/);
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    }
    for (const player of players) {
      await player.page.getByRole('button', { name: 'Je suis prêt' }).click();
    }

    // The defuser sees the bomb and no manual: six modules, and the purge asleep.
    for (const player of players) {
      await expect(player.page.getByRole('timer', { name: 'Chrono de la bombe' })).toBeVisible();
      await expect(player.page.getByText('Modules désamorcés : 0 / 6')).toBeVisible();
    }
    await expect(defuser.page.getByRole('region', { name: 'Purge', exact: true })).toBeVisible();
    await expect(defuser.page.getByText('AU REPOS')).toBeVisible();
    await expect(defuser.page.locator('article')).toHaveCount(0);

    // Each expert sees their own sheets, not the bomb, and the three manuals are different.
    const experts = players.filter((p) => p !== defuser);
    const manuals: string[] = [];
    for (const expert of experts) {
      await expect(expert.page.getByRole('region', { name: 'Purge', exact: true })).toHaveCount(0);
      const sheets = expert.page.locator('article');
      expect(await sheets.count()).toBeGreaterThanOrEqual(4);
      manuals.push((await sheets.allTextContents()).join('|'));
    }
    expect(new Set(manuals).size).toBe(3);

    if (round === 1) {
      const button = defuser.page.getByRole('button', { name: /^Bouton / });
      if (await button.count()) {
        // Holding the big button lights its strip up (released at once, right or wrong).
        const box = (await button.boundingBox())!;
        await defuser.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await defuser.page.mouse.down();
        await expect(defuser.page.getByRole('img', { name: /^Bande (?!éteinte)/ })).toBeVisible();
        await defuser.page.mouse.up();
        // Wrong or right, an error ends this bomb: go to the next one.
        if (await defuser.page.getByRole('heading', { name: 'BOUM' }).count()) {
          for (const player of players) {
            await expect(player.page.getByRole('heading', { name: 'BOUM' })).toBeVisible();
          }
          await alice.page.getByRole('button', { name: 'Bombe suivante' }).click();
          continue;
        }
      }
    }

    await blowUp(defuser);
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
