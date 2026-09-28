import type { GameContract } from '@mini-jeux/shared';
import type { AnyGameDefinition, PhaseDef } from './types.ts';

/**
 * Consistency checks TypeScript cannot fully express. Run when the registry is loaded, so that a
 * broken game prevents the server from starting instead of failing during a party.
 */
export function validateGameDefinition(definition: AnyGameDefinition): void {
  const contract = definition.contract as GameContract;
  const id = contract.meta.id;
  const fail = (message: string) => {
    throw new Error(`Game "${id}": ${message}`);
  };
  if (!/^[a-z0-9-]{1,32}$/.test(id)) fail('id must be kebab-case (a-z, 0-9, -)');
  if (contract.meta.minPlayers < 1 || contract.meta.maxPlayers < contract.meta.minPlayers) {
    fail('invalid player bounds');
  }

  const phases = definition.phases as Record<string, PhaseDef<GameContract, unknown>>;
  const declared = new Set(contract.phases);
  for (const phase of declared) if (!phases[phase]) fail(`phase "${phase}" has no definition`);
  for (const phase of Object.keys(phases)) {
    if (!declared.has(phase)) fail(`phase "${phase}" is not declared in the contract`);
  }
  if (!declared.has(definition.initialPhase)) fail('initial phase is not declared');

  for (const [name, phase] of Object.entries(phases)) {
    for (const kind of phase.uploads ?? []) {
      if (!contract.uploads || !Object.hasOwn(contract.uploads, kind)) {
        fail(`phase "${name}" accepts unknown upload "${kind}"`);
      }
      if (typeof (phase.onUpload as Record<string, unknown> | undefined)?.[kind] !== 'function') {
        fail(`phase "${name}" accepts "${kind}" without handling it`);
      }
      if (!definition.uploadLimit) fail('uploads require uploadLimit()');
    }
    for (const next of phase.next) {
      if (!declared.has(next)) fail(`phase "${name}" leads to unknown phase "${next}"`);
    }
    for (const action of phase.actions) {
      if (!Object.hasOwn(contract.actions, action))
        fail(`phase "${name}" allows unknown action "${action}"`);
      if (typeof (phase.on as Record<string, unknown> | undefined)?.[action] !== 'function') {
        fail(`phase "${name}" allows "${action}" without handling it`);
      }
    }
  }

  for (const [key, setting] of Object.entries(contract.settings)) {
    if (setting.kind === 'int') {
      const max = setting.max === 'contentLeft' ? Infinity : setting.max;
      const usesContent = setting.max === 'contentLeft' || setting.default === 'contentLeft';
      if (usesContent && !definition.content) {
        fail(`setting "${key}" depends on content, but the game has none`);
      }
      if (
        typeof setting.default === 'number' &&
        (setting.default < setting.min || setting.default > max)
      ) {
        fail(`setting "${key}" has a default outside its bounds`);
      }
    }
    if (setting.kind === 'choice' && !setting.options.some((o) => o.value === setting.default)) {
      fail(`setting "${key}" has a default that is not one of its options`);
    }
  }
}

export function validateRegistry(games: readonly AnyGameDefinition[]): void {
  const ids = new Set<string>();
  for (const game of games) {
    validateGameDefinition(game);
    const id = (game.contract as GameContract).meta.id;
    if (ids.has(id)) throw new Error(`Game "${id}" is registered twice`);
    ids.add(id);
  }
}
