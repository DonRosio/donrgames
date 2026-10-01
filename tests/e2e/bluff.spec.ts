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
const QUESTIONS = 3;

test('a full game of Le Bluff with three players', async ({ browser }) => {
  players = await Promise.all(NAMES.map((name) => openPlayer(browser, name)));
  const [alice] = players as [Player, ...Player[]];
  const code = await createRoom(alice, 'Le Bluff');
  for (const player of players.slice(1)) await joinRoom(player, code);

  // The host chooses the number of questions, and the others see it.
  const rounds = alice.page.getByLabel('Nombre de questions');
  await rounds.fill(String(QUESTIONS));
  await rounds.blur();
  await expect(
    players[1]!.page.getByText(String(QUESTIONS), { exact: true }).first(),
  ).toBeVisible();
  await startGame(alice);

  for (let question = 1; question <= QUESTIONS; question++) {
    // Writing: the question is the same for everybody, and a false answer is mandatory.
    for (const player of players) {
      await expect(player.page.getByText(`Question ${question} / ${QUESTIONS}`)).toBeVisible();
      await expect(player.page.getByRole('button', { name: 'Valider ma réponse' })).toBeDisabled();
    }
    for (const player of players) {
      await player.page.getByLabel('Ta fausse réponse').fill(`Fausse réponse de ${player.name}`);
      await player.page.getByRole('button', { name: 'Valider ma réponse' }).click();
    }

    // Voting: three false answers and the real one; your own is not allowed.
    for (const player of players) {
      const votes = player.page.getByRole('group', { name: 'Vote' });
      await expect(votes.getByRole('button')).toHaveCount(NAMES.length + 1);
      await expect(
        votes.getByRole('button', { name: `Fausse réponse de ${player.name}` }),
      ).toBeDisabled();
    }
    for (const player of players) {
      const votes = player.page.getByRole('group', { name: 'Vote' });
      // Everybody falls for the false answer of the next player, so that everybody scores.
      const next = NAMES[(NAMES.indexOf(player.name) + 1) % NAMES.length]!;
      await votes.getByRole('button', { name: `Fausse réponse de ${next}` }).click();
    }

    // Reveal: the real answer is shown, with who wrote what and who voted for it.
    for (const player of players) {
      await expect(player.page.getByText('La vraie réponse')).toBeVisible();
      await expect(player.page.getByText('Écrite par Alice')).toBeVisible();
      await expect(player.page.getByText('choisie par Alice')).toBeVisible();
    }
    await alice.page
      .getByRole('button', {
        name: question < QUESTIONS ? 'Question suivante' : 'Voir le classement final',
      })
      .click();
  }

  // Everybody fooled exactly one player per question: 1 point per question each.
  for (const player of players) {
    await expect(player.page.getByText('Classement final · Le Bluff')).toBeVisible();
    const rows = player.page.getByRole('listitem').filter({ hasText: /pts?$/ });
    await expect(rows).toHaveCount(NAMES.length);
    await expect(rows).toHaveText([/Alice\s*3 pts/, /Bob\s*3 pts/, /Carol\s*3 pts/]);
  }
});
