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

test('a full game of Incognito with four players: chat, notes, matching, unmasking, ranking', async ({
  browser,
}) => {
  players = await Promise.all(NAMES.map((name) => openPlayer(browser, name)));
  const [alice, bob, carol, dave] = players as [Player, Player, Player, Player];
  const code = await createRoom(alice, 'Incognito');
  for (const player of [bob, carol, dave]) await joinRoom(player, code);
  await alice.page.getByLabel('Nombre de questions').fill('2');
  await startGame(alice);

  // Chat: one answer per question and per player; the others' answers show under a first name.
  const answer = async (player: Player, text: string) => {
    await player.page.getByLabel('Ta réponse').fill(text);
    await player.page.getByRole('button', { name: 'Envoyer' }).click();
  };
  for (const player of players) {
    await expect(player.page.getByRole('heading', { name: 'Chat général' })).toBeVisible();
    await expect(player.page.getByText('Question 1 / 2')).toBeVisible();
  }
  await answer(alice, 'vingt-huit');
  // One input per question: the field is locked once the answer is sent.
  await expect(alice.page.getByLabel('Ta réponse')).toBeDisabled();
  await expect(bob.page.getByLabel('Messages du chat')).toContainText('vingt-huit');
  // The author is a first name from the game, never a nickname.
  await expect(bob.page.getByLabel('Messages du chat')).not.toContainText('Alice');
  for (const player of [bob, carol, dave]) await answer(player, `réponse de ${player.name}`);

  // Question 2: a private note on a first name, and the history of that first name.
  for (const player of players) await expect(player.page.getByText('Question 2 / 2')).toBeVisible();
  const aliasButtons = bob.page.getByRole('button', { name: /^Historique de / });
  await expect(aliasButtons).toHaveCount(4);
  await bob.page
    .getByLabel(/^Note sur /)
    .first()
    .fill('je crois que c’est Carol');
  await bob.page
    .getByLabel(/^Note sur /)
    .first()
    .blur();
  await bob.page
    .getByRole('button', { name: /^Historique de / })
    .first()
    .click();
  await expect(bob.page.getByRole('dialog')).toContainText('Historique de');
  await bob.page.getByRole('button', { name: 'Fermer' }).click();
  for (const player of players) await answer(player, `bis ${player.name}`);

  // Matching: every first name on the left (with its note), every player on the right.
  for (const player of players) {
    await expect(
      player.page.getByRole('heading', { name: 'Qui se cache derrière ces prénoms ?' }),
    ).toBeVisible();
    await expect(
      player.page.getByRole('list', { name: 'Joueurs' }).getByRole('listitem'),
    ).toHaveCount(4);
  }
  // The note typed during the chat is still there, on the left of the first name.
  await expect(bob.page.getByLabel(/^Note sur /)).toHaveCount(3);
  await expect(bob.page.locator('input[value="je crois que c’est Carol"]')).toHaveCount(1);

  // Alice links everybody by clicking a dot, then the one it goes with.
  const link = async (player: Player, alias: string, person: string) => {
    await player.page.getByRole('button', { name: `Relier ${alias}`, exact: true }).click();
    await player.page.getByRole('button', { name: `Relier ${person}`, exact: true }).click();
  };
  const validate = (player: Player) =>
    player.page.getByRole('button', { name: 'Valider mes choix' });
  await expect(validate(alice)).toBeDisabled();
  const aliasNames = await alice.page
    .getByRole('list', { name: 'Prénoms' })
    .getByRole('button', { name: /^Relier / })
    .evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label')!.slice(7)));
  expect(aliasNames).toHaveLength(3);
  await link(alice, aliasNames[0]!, 'Bob');
  await expect(alice.page.getByText('1 / 3 traits tracés')).toBeVisible();
  // Linking another first name to the same player moves the line.
  await link(alice, aliasNames[1]!, 'Bob');
  await expect(alice.page.getByText('1 / 3 traits tracés')).toBeVisible();
  await link(alice, aliasNames[0]!, 'Carol');
  await link(alice, aliasNames[2]!, 'Dave');
  await expect(alice.page.getByText('3 / 3 traits tracés')).toBeVisible();
  await expect(validate(alice)).toBeEnabled();
  await validate(alice).click();
  await expect(alice.page.getByText('Tes choix sont validés.')).toBeVisible();

  // The others link as they like, then the last validation opens the reveal.
  for (const player of [bob, carol, dave]) {
    const mine = player.name;
    const others = NAMES.filter((name) => name !== mine);
    const aliases = await player.page
      .getByRole('list', { name: 'Prénoms' })
      .getByRole('button', { name: /^Relier / })
      .evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label')!.slice(7)));
    for (const [index, person] of others.entries()) await link(player, aliases[index]!, person);
    await validate(player).click();
  }

  // Reveal: the host unmasks one person at a time, everybody sees the same pair.
  for (const player of players) {
    await expect(player.page.getByRole('heading', { name: 'Le moment de vérité' })).toBeVisible();
  }
  await alice.page.getByRole('button', { name: 'Lever le premier masque' }).click();
  for (const player of players) {
    await expect(player.page.getByText('Était caché sous l’identité de :')).toBeVisible();
  }
  for (let i = 0; i < 3; i++) {
    await alice.page.getByRole('button', { name: 'Démasquer le suivant' }).click();
    await expect(alice.page.getByText('Déjà démasqués')).toBeVisible();
  }
  await expect(alice.page.getByRole('heading', { name: 'Points marqués' })).toBeVisible();
  await alice.page.getByRole('button', { name: 'Voir le classement' }).click();

  for (const player of players) {
    await expect(player.page.getByText('Classement final · Incognito')).toBeVisible();
  }
});
