import { expect, test } from '@playwright/test';
import {
  closeAll,
  confirmHostAction,
  createRoom,
  joinRoom,
  openPlayer,
  presenterOf,
  recordTake,
  startGame,
  tokenOf,
  vote,
} from './helpers.ts';
import type { Player } from './helpers.ts';

let players: Player[] = [];

test.afterEach(async () => {
  // No console error on any page: CSP violations, React errors, failed requests…
  for (const player of players) expect(player.errors, player.name).toEqual([]);
  await closeAll(players);
  players = [];
});

test('a full game of Doublage with three players', async ({ browser }) => {
  const [alice, bob, carol] = (players = await Promise.all(
    ['Alice', 'Bob', 'Carol'].map((name) => openPlayer(browser, name)),
  )) as [Player, Player, Player];

  // The production build is served with its strict security headers.
  const home = await alice.page.goto('/');
  expect(home?.headers()['content-security-policy']).toContain("script-src 'self'");
  const code = await createRoom(alice);
  await joinRoom(bob, code);
  await joinRoom(carol, code);
  await expect(alice.page.getByText('1 vidéo pas encore jouée dans ce salon')).toBeVisible();
  await startGame(alice);

  // Loading and broadcast go on by themselves, then everyone records at the same time.
  await Promise.all(players.map(recordTake));

  // Three takes, presented one by one in a random order.
  for (let index = 1; index <= 3; index++) {
    for (const player of players) {
      await expect(player.page.getByText(`Vote · prise ${index} / 3`)).toBeVisible();
    }
    const presenter = await presenterOf(players);
    for (const voter of players.filter((player) => player !== presenter)) {
      await vote(voter, voter === bob && presenter === alice ? '+2' : '+1');
    }
    await expect(carol.page.getByText(`Résultat · prise ${index} / 3`)).toBeVisible();
    await alice.page
      .getByRole('button', { name: index < 3 ? 'Prise suivante' : 'Voir les scores de la manche' })
      .click();
  }

  // Scores of the round, then the final ranking (the only video was played).
  await expect(bob.page.getByText('Fin de manche')).toBeVisible();
  await expect(alice.page.getByRole('button', { name: 'Terminer la partie' })).toHaveCount(0);
  await alice.page.getByRole('button', { name: 'Voir le classement final' }).click();
  for (const player of players) {
    const rows = player.page.getByRole('listitem').filter({ hasText: /pts?$/ });
    await expect(player.page.getByText('Classement final · Doublage')).toBeVisible();
    await expect(rows).toHaveText([/Alice\s*3 pts/, /2 pts/, /2 pts/]);
    await expect(rows.nth(1)).toHaveAttribute('data-rank', '2');
    await expect(rows.nth(2)).toHaveAttribute('data-rank', '2');
  }

  await alice.page.getByRole('button', { name: 'Retour au salon' }).click();
  await expect(carol.page.getByText("L'hôte lancera la partie.")).toBeVisible();
  // A video is never played twice in the same room.
  await expect(alice.page.getByText('Toutes les vidéos ont déjà été jouées')).toBeVisible();
  await expect(alice.page.getByRole('button', { name: 'Lancer la partie' })).toBeDisabled();
});

test('reconnection, skipping a player, and a stopped game deleting the takes', async ({
  browser,
}) => {
  const [alice, bob] = (players = await Promise.all(
    ['Alice', 'Bob'].map((name) => openPlayer(browser, name)),
  )) as [Player, Player];
  const code = await createRoom(alice);
  await joinRoom(bob, code);
  await startGame(alice);
  await expect(bob.page.getByRole('button', { name: '● Enregistrer' })).toBeVisible();

  // Bob reloads the page in the middle of the game: same player, same screen.
  await bob.page.reload();
  await expect(bob.page.getByRole('button', { name: '● Enregistrer' })).toBeVisible();

  // Bob never records: the host stops waiting for him.
  await recordTake(alice);
  const takeResponse = bob.page.waitForResponse((response) =>
    response.url().includes('/api/media/'),
  );
  await confirmHostAction(alice, 'Passer à la suite');
  const take = await takeResponse;
  expect(take.status()).toBe(200);
  expect(take.headers()['cache-control']).toBe('no-store');

  await expect(bob.page.getByText('Vote · prise 1 / 1')).toBeVisible();
  await expect(alice.page.getByText("C'est ta prise : les autres votent.")).toBeVisible();
  await vote(bob, '+2');
  await expect(alice.page.getByText('Résultat · prise 1 / 1')).toBeVisible();

  // The take can be downloaded by hand during its presentation only, and with the token only.
  const token = await tokenOf(bob);
  const statusOf = async (withToken: boolean) =>
    (
      await bob.page.context().request.get(take.url(), {
        headers: withToken ? { authorization: `Bearer ${token}` } : {},
      })
    ).status();
  expect(await statusOf(true)).toBe(200);
  expect(await statusOf(false)).toBe(401);

  await confirmHostAction(alice, 'Arrêter la partie');
  await expect(bob.page.getByText("L'hôte lancera la partie.")).toBeVisible();
  expect(await statusOf(true)).toBe(404);
});
