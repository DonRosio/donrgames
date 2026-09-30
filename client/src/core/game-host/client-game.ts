import type { ComponentType, ReactNode } from 'react';
import type {
  ActionTypeOf,
  GameInfo,
  GameContract,
  GameErrorOf,
  MediaRef,
  PayloadOf,
  PhaseOf,
  PlayerView,
  RoomView,
  SettingValue,
  UploadKindOf,
  UploadMetaOf,
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
  /** Sends a file declared in the contract's `uploads`. */
  upload<K extends UploadKindOf<C>>(
    kind: K,
    file: Blob,
    meta: UploadMetaOf<C, K>,
  ): Promise<ActResult>;
  /** Downloads a content file or a recording (with the session token). */
  fetchMedia(ref: MediaRef): Promise<Blob>;
  /** Estimated server time (ms). */
  serverNow(): number;
}

/** Client side of a game: one screen per phase and the messages of its rule errors. */
export interface ClientGame<C extends GameContract, V extends { phase: PhaseOf<C> }> {
  id: C['meta']['id'];
  screens: {
    [P in PhaseOf<C>]: ComponentType<GameScreenProps<C, Extract<V, { phase: P }>>>;
  };
  errorMessages: Record<GameErrorOf<C>, string>;
  /**
   * Optional panel shown in the lobby under the game description, to everyone: rules, presentation
   * of the game… It receives the current settings (e.g. to highlight the options in play).
   */
  lobbyPanel?: ComponentType<{ info: GameInfo; settings: Record<string, SettingValue> }>;
  /**
   * Optional wrapper around the screen of every phase. It stays mounted from one phase to the
   * next, so it can keep state across phases (e.g. play a transition when the round changes).
   */
  frame?: ComponentType<{ view: V; children: ReactNode }>;
}

// The registry holds games of different types; each game module stays precisely typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyClientGame = ClientGame<any, any>;

export function defineClientGame<C extends GameContract, V extends { phase: PhaseOf<C> }>(
  game: ClientGame<C, V>,
): ClientGame<C, V> {
  return game;
}
