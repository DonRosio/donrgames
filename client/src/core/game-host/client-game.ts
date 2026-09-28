import type { ComponentType } from 'react';
import type {
  ActionTypeOf,
  GameContract,
  GameErrorOf,
  PayloadOf,
  PhaseOf,
  PlayerView,
  RoomView,
} from '@mini-jeux/shared';

/** Result of a game action, with the refusal already turned into a French message. */
export type ActResult = { ok: true } | { ok: false; message: string };

export interface GameScreenProps<C extends GameContract, V> {
  /** View of the current phase, sent by the server for this player only. */
  view: V;
  room: RoomView;
  me: PlayerView;
  isHost: boolean;
  act<A extends ActionTypeOf<C>>(type: A, payload: PayloadOf<C, A>): Promise<ActResult>;
}

/** Client side of a game: one screen per phase and the messages of its rule errors. */
export interface ClientGame<C extends GameContract, V extends { phase: PhaseOf<C> }> {
  id: C['meta']['id'];
  screens: {
    [P in PhaseOf<C>]: ComponentType<GameScreenProps<C, Extract<V, { phase: P }>>>;
  };
  errorMessages: Record<GameErrorOf<C>, string>;
}

// The registry holds games of different types; each game module stays precisely typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyClientGame = ClientGame<any, any>;

export function defineClientGame<C extends GameContract, V extends { phase: PhaseOf<C> }>(
  game: ClientGame<C, V>,
): ClientGame<C, V> {
  return game;
}
