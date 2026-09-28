import { describe, expect, it } from 'vitest';
import type { GameContract } from '@mini-jeux/shared';
import { clientGames } from '../client/src/games/registry.ts';
import { games } from '../server/src/games/registry.ts';
import { validateRegistry } from '../server/src/core/engine/validate.ts';

const contractOf = (game: (typeof games)[number]) => game.contract as GameContract;

describe('game registries', () => {
  it('pass the server-side validation', () => {
    expect(() => validateRegistry(games)).not.toThrow();
  });

  it('declare the same games on the server and on the client', () => {
    const serverIds = games.map((game) => contractOf(game).meta.id).sort();
    const clientIds = clientGames.map((game) => game.id).sort();
    expect(clientIds).toEqual(serverIds);
  });

  it('give a screen to every phase and a message to every rule error', () => {
    for (const game of games) {
      const contract = contractOf(game);
      const client = clientGames.find((candidate) => candidate.id === contract.meta.id);
      expect(Object.keys(client?.screens ?? {}).sort()).toEqual([...contract.phases].sort());
      expect(Object.keys(client?.errorMessages ?? {}).sort()).toEqual([...contract.errors].sort());
    }
  });
});
