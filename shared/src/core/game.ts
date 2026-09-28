export interface GameMeta {
  /** Stable kebab-case identifier, e.g. 'dubbing'. */
  id: string;
  /** Displayed name (French). */
  name: string;
  /** Displayed description (French). */
  description: string;
  minPlayers: number;
  maxPlayers: number;
  /** false: the game consumes its content ("à usage unique" badge, played content tracking). */
  replayable: boolean;
}
