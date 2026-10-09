import { expect, test } from '@playwright/test';
import { closeAll, createRoom, joinRoom, openPlayer, startGame } from './helpers.ts';
import type { Player } from './helpers.ts';

let players: Player[] = [];

test.afterEach(async () => {
  for (const player of players) expect(player.errors, player.name).toEqual([]);
  await closeAll(players);
  players = [];
});

const NAMES = ['Alice', 'Bob', 'Carol'];
// Any picture of a person will do: the cut-out runs for real, with the production CSP.
const PHOTO = 'design/presentateur.jpeg';

test('a full game of Qui est le + ? with three players: pictures, votes, reveals, ranking', async ({
  browser,
}) => {
  players = await Promise.all(NAMES.map((name) => openPlayer(browser, name)));
  const [alice, bob, carol] = players as [Player, Player, Player];
  const code = await createRoom(alice, 'Qui est le \\+ \\?');
  for (const player of [bob, carol]) await joinRoom(player, code);
  await alice.page.getByLabel('Nombre de questions').fill('2');
  await startGame(alice);

  // Everybody sends a head; the host cannot start before the last one.
  const start = alice.page.getByRole('button', { name: 'Lancer les questions' });
  await expect(start).toBeDisabled();
  for (const player of players) {
    await player.page.locator('input[type=file]').setInputFiles(PHOTO);
    // The background removal ran (no fallback message), and the preview is there.
    await expect(player.page.getByLabel(/Aperçu de ta tête/)).toBeVisible();
    await expect(player.page.getByText('Le détourage automatique a échoué')).toHaveCount(0);
    await player.page.getByRole('button', { name: 'Valider ma tête' }).click();
    await expect(player.page.getByText('Ta tête est envoyée.')).toBeVisible();
  }
  await expect(start).toBeEnabled();
  // Everyone sees the others' pictures (private route, authenticated).
  for (const player of players) {
    await expect(
      player.page.getByRole('list', { name: 'Têtes des joueurs' }).locator('img'),
    ).toHaveCount(3);
  }
  await start.click();

  // Question 1: everybody votes for Bob; votes are final, even for oneself.
  for (const player of players) {
    await expect(player.page.getByRole('list', { name: 'Votez pour une tête' })).toBeVisible();
    await player.page.getByRole('button', { name: 'Bob', exact: true }).click();
    await player.page.getByRole('button', { name: /^Voter pour Bob/ }).click();
    await expect(player.page.getByText('Vote enregistré.')).toBeVisible();
    await expect(player.page.getByRole('button', { name: 'Alice', exact: true })).toBeDisabled();
  }
  await alice.page.getByRole('button', { name: 'Révéler les résultats' }).click();
  for (const player of players) {
    const winners = player.page.getByRole('list', { name: 'Gagnants' });
    await expect(winners).toContainText('Bob');
    await expect(winners).toContainText('3 votes');
  }
  await alice.page.getByRole('button', { name: 'Question suivante' }).click();

  // Question 2: Alice votes for herself, the others for Carol; Carol wins with two votes.
  await expect(alice.page.getByText('Question 2 / 2')).toBeVisible();
  await alice.page.getByRole('button', { name: 'Alice', exact: true }).click();
  await alice.page.getByRole('button', { name: /^Voter pour Alice/ }).click();
  for (const player of [bob, carol]) {
    await player.page.getByRole('button', { name: 'Carol', exact: true }).click();
    await player.page.getByRole('button', { name: /^Voter pour Carol/ }).click();
  }
  await alice.page.getByRole('button', { name: 'Révéler les résultats' }).click();
  await expect(alice.page.getByRole('list', { name: 'Gagnants' })).toContainText('Carol');
  await alice.page.getByRole('button', { name: 'Voir le classement final' }).click();

  // Bob 3, Carol 2, Alice 1.
  for (const player of players) {
    await expect(player.page.getByText('Classement final · Qui est le + ?')).toBeVisible();
  }
  const rows = alice.page.getByRole('listitem').filter({ hasText: /pts?$/ });
  await expect(rows.nth(0)).toContainText('Bob');
  await expect(rows.nth(1)).toContainText('Carol');
  await expect(rows.nth(2)).toContainText('Alice');

  await alice.page.getByRole('button', { name: 'Retour au salon' }).click();
});
