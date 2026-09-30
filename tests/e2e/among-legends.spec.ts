import { expect, test } from '@playwright/test';
import { closeAll, createRoom, joinRoom, openPlayer, startGame } from './helpers.ts';
import type { Player } from './helpers.ts';

let players: Player[] = [];

test.afterEach(async () => {
  for (const player of players) expect(player.errors, player.name).toEqual([]);
  await closeAll(players);
  players = [];
});

const NAMES = ['Alice', 'Bob', 'Carol', 'Dave', 'Erin'];

test('a full game of Among Legends with five players: briefing, vote, statistics, results', async ({
  browser,
}) => {
  players = await Promise.all(NAMES.map((name) => openPlayer(browser, name)));
  const [alice] = players as [Player, ...Player[]];
  const code = await createRoom(alice, 'Among Legends');
  for (const player of players.slice(1)) await joinRoom(player, code);
  await startGame(alice);

  // Briefing: everyone reads their secret role, the host starts the clock.
  for (const player of players) {
    await player.page.getByRole('button', { name: "J'ai lu mon rôle" }).click();
  }
  await alice.page.getByRole('button', { name: 'La partie a commencé' }).click();
  await expect(alice.page.getByRole('timer', { name: 'Temps de jeu' })).toBeVisible();
  await alice.page.getByRole('button', { name: 'La partie est terminée' }).click();
  await alice.page.getByRole('dialog').getByRole('button', { name: 'Oui, terminée' }).click();
  for (const player of players) {
    await expect(
      player.page.getByRole('heading', { name: 'La partie est terminée' }),
    ).toBeVisible();
  }

  // The host enters the statistics first; the others wait and cannot vote yet.
  const others = players.slice(1);
  for (const player of others) {
    await expect(
      player.page.getByText('L’hôte est en train de remplir les statistiques'),
    ).toBeVisible();
    await expect(player.page.getByRole('button', { name: /statistiques/ })).toHaveCount(0);
    await expect(player.page.getByRole('button', { name: 'Envoyer mon vote' })).toHaveCount(0);
  }
  const { page } = alice;
  await page.getByLabel('Résultat').selectOption({ label: 'Victoire' });
  await page.getByLabel('Durée de la partie').selectOption({ label: '30 min' });
  const tick = (question: string, name: string) =>
    page.getByRole('group', { name: question, exact: true }).getByLabel(name).check();
  const send = page.getByRole('button', { name: 'Afficher les statistiques à tous' });
  // An incoherent answer cannot be sent.
  await tick('Le plus de kills', 'Alice');
  await tick('Le moins de kills', 'Alice');
  await expect(page.getByRole('alert').filter({ hasText: 'même joueur' })).toBeVisible();
  await expect(send).toBeDisabled();
  await page
    .getByRole('group', { name: 'Le moins de kills', exact: true })
    .getByLabel('Alice')
    .uncheck();
  await tick('Le moins de kills', 'Erin');
  await tick('Le plus de morts', 'Bob');
  await tick("Le plus d'assists", 'Carol');
  await tick('Le plus de dégâts infligés', 'Alice');
  await tick('Le plus de dégâts subis', 'Bob');
  await tick('Le moins de dégâts subis', 'Erin');
  await send.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Envoyer' }).click();

  // Everybody, the host included, now votes with the statistics in view.
  for (const player of players) {
    const summary = player.page.getByRole('region', { name: 'Statistiques de la partie' });
    await expect(summary.getByText('Victoire · 30 minutes')).toBeVisible();
    await expect(summary.getByText('Le plus de morts').locator('..')).toContainText('Bob');
  }
  for (const player of players) {
    const wanted = NAMES.filter((name) => name !== player.name);
    for (const name of wanted) {
      await player.page
        .getByRole('combobox', { name, exact: true })
        .selectOption({ label: 'Imposteur' });
    }
    await player.page.getByRole('button', { name: 'Envoyer mon vote' }).click();
    await player.page.getByRole('dialog').getByRole('button', { name: 'Envoyer' }).click();
    await expect(player.page.getByText('Ton vote est envoyé')).toBeVisible();
  }
  await expect(players[3]!.page.getByText('Tout le monde a voté.')).toBeVisible();

  // The host can still correct the statistics; everybody sees the correction.
  await page.getByRole('button', { name: 'Corriger les statistiques' }).click();
  await page.getByLabel('Résultat').selectOption({ label: 'Défaite' });
  await page.getByRole('button', { name: 'Mettre à jour les statistiques' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Envoyer' }).click();
  await expect(
    players[2]!.page
      .getByRole('region', { name: 'Statistiques de la partie' })
      .getByText('Défaite · 30 minutes'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Corriger les statistiques' }).click();
  await page.getByLabel('Résultat').selectOption({ label: 'Victoire' });
  await page.getByRole('button', { name: 'Mettre à jour les statistiques' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Envoyer' }).click();
  await expect(
    players[2]!.page
      .getByRole('region', { name: 'Statistiques de la partie' })
      .getByText('Victoire · 30 minutes'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Afficher les résultats' }).click();
  for (const player of players) {
    await expect(player.page.getByRole('heading', { name: 'Victoire !' })).toBeVisible();
    await expect(player.page.getByText('Partie de 30 minutes.')).toBeVisible();
    // Every role is now public.
    await expect(player.page.getByText('Imposteur', { exact: true }).first()).toBeVisible();
  }

  await page.getByRole('button', { name: 'Voir le classement final' }).click();
  for (const player of players) {
    await expect(player.page.getByText('Classement final · Among Legends')).toBeVisible();
    await expect(player.page.getByRole('listitem').filter({ hasText: /pts?$/ })).toHaveCount(5);
  }
});
