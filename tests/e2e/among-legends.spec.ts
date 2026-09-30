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

  // Everybody guesses the role of the four others (any role: the vote is not checked here).
  for (const player of players) {
    const others = NAMES.filter((name) => name !== player.name);
    for (const name of others) {
      await player.page
        .getByRole('combobox', { name, exact: true })
        .selectOption({ label: 'Imposteur' });
    }
    await player.page.getByRole('button', { name: 'Envoyer mon vote' }).click();
    await player.page.getByRole('dialog').getByRole('button', { name: 'Envoyer' }).click();
    await expect(player.page.getByText('Ton vote est envoyé')).toBeVisible();
  }
  await expect(players[3]!.page.getByText('Tout le monde a voté.')).toBeVisible();

  // The statistics are the host's job only. An incoherent answer cannot be sent.
  await expect(
    players[1]!.page.getByText('L’hôte saisit les statistiques de la partie.'),
  ).toBeVisible();
  await expect(players[1]!.page.getByRole('button', { name: /statistiques/ })).toHaveCount(0);
  const { page } = alice;
  await page.getByLabel('Résultat').selectOption({ label: 'Victoire' });
  await page.getByLabel('Durée de la partie').selectOption({ label: '30 min' });
  const tick = (question: string, name: string) =>
    page.getByRole('group', { name: question, exact: true }).getByLabel(name).check();
  await tick('Le plus de kills', 'Alice');
  await tick('Le moins de kills', 'Alice');
  await expect(page.getByRole('alert').filter({ hasText: 'même joueur' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enregistrer les statistiques' })).toBeDisabled();
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
  await page.getByRole('button', { name: 'Enregistrer les statistiques' }).click();
  await expect(page.getByText('✓ Statistiques enregistrées.')).toBeVisible();

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
