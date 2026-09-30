import { expect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { E2E_ORIGIN } from './env.ts';

export interface Player {
  name: string;
  page: Page;
  /** Console errors and uncaught exceptions (CSP violations included). */
  errors: string[];
}

/** A player = a separate browser context, like a separate PC. */
export async function openPlayer(browser: Browser, name: string): Promise<Player> {
  const context = await browser.newContext({ baseURL: E2E_ORIGIN, permissions: ['microphone'] });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return { name, page, errors };
}

/** Creates a room for a game, chosen by name on the home page (Doublage by default). */
export async function createRoom(host: Player, game = 'Doublage'): Promise<string> {
  await host.page.goto('/');
  await host.page.getByLabel('Ton pseudo').fill(host.name);
  await host.page.getByRole('radio', { name: new RegExp(game) }).click();
  await host.page.getByRole('button', { name: 'Créer une partie' }).click();
  await host.page.waitForURL(/\/room\/[A-Z0-9]{6}$/);
  return host.page.url().split('/').at(-1)!;
}

/** Joins through the invitation link, as a friend would. */
export async function joinRoom(player: Player, code: string): Promise<void> {
  await player.page.goto(`/join/${code}`);
  await player.page.getByLabel('Ton pseudo').fill(player.name);
  await player.page.getByRole('button', { name: 'Rejoindre', exact: true }).click();
  await player.page.waitForURL(`**/room/${code}`);
}

export async function startGame(host: Player): Promise<void> {
  await host.page.getByRole('button', { name: 'Lancer la partie' }).click();
}

/** Records a take with the fake microphone and validates it. */
export async function recordTake(player: Player): Promise<void> {
  const { page } = player;
  await page.getByRole('button', { name: '● Enregistrer' }).click();
  await expect(page.getByText('● REC')).toBeVisible();
  const validate = page.getByRole('button', { name: '✓ Valider cette prise' });
  await validate.click();
  // Accepted: "sent" message, or straight to the presentations for the last one to validate.
  await expect(validate).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
}

/** Confirms a host action that opens a confirmation dialog. */
export async function confirmHostAction(host: Player, label: string): Promise<void> {
  await host.page.getByRole('button', { name: label }).click();
  await host.page.getByRole('dialog').getByRole('button', { name: label }).click();
}

export async function vote(player: Player, points: '0' | '+1' | '+2'): Promise<void> {
  const button = player.page
    .getByRole('group', { name: 'Vote' })
    .getByRole('button', { name: points, exact: true });
  await button.click();
  // Accepted: the vote is locked, or the last vote already led to the results of the take.
  await expect(
    button.and(player.page.locator('[aria-pressed="true"]')).or(player.page.getByText(/^Résultat/)),
  ).toBeVisible();
}

/** The player whose take is being voted on. */
export async function presenterOf(players: Player[]): Promise<Player> {
  for (const player of players) {
    if (await player.page.getByText("C'est ta prise : les autres votent.").isVisible()) {
      return player;
    }
  }
  throw new Error('no presenter found');
}

/** Session token of a page, to reproduce what a malicious player could request by hand. */
export async function tokenOf(player: Player): Promise<string> {
  return player.page.evaluate(
    () => (JSON.parse(sessionStorage.getItem('mini-jeux:session')!) as { token: string }).token,
  );
}

export async function closeAll(players: Player[]): Promise<void> {
  for (const player of players) await player.page.context().close();
}
