import type { ReactNode } from 'react';
import type { RoomView } from '@mini-jeux/shared';
import type { BluffContract, BluffView } from '@mini-jeux/shared/games/bluff';
import { BLANK, THEME_NAMES } from '@mini-jeux/shared/games/bluff-themes';
import type { GameScreenProps } from '../../core/game-host/client-game.ts';
import styles from './bluff.module.css';

export type ScreenProps<P extends BluffView['phase']> = GameScreenProps<
  BluffContract,
  Extract<BluffView, { phase: P }>
>;

export const nameOf = (room: RoomView, id: string) =>
  room.players.find((player) => player.id === id)?.nickname ?? '?';

export const namesOf = (room: RoomView, ids: readonly string[]) =>
  ids.map((id) => nameOf(room, id)).join(', ');

/**
 * The question of the round, its theme and its number. The blank shows as a gap, or as the
 * `filled` answer once it is revealed.
 */
export function QuestionCard({
  view,
  filled,
}: {
  view: { index: number; count: number; theme: keyof typeof THEME_NAMES; question: string };
  filled?: ReactNode;
}) {
  const [before = '', after = ''] = view.question.split(BLANK);
  return (
    <header className={`card ${styles.question}`}>
      <p className={styles.meta}>
        <span className={styles.theme}>{THEME_NAMES[view.theme]}</span>
        <span>
          Question {view.index} / {view.count}
        </span>
      </p>
      <p className={styles.sentence}>
        {before}
        {filled !== undefined ? (
          <strong className={styles.filled}>{filled}</strong>
        ) : (
          <span className={styles.blank} role="img" aria-label="réponse à trouver">
            {' '.repeat(10)}
          </span>
        )}
        {after}
      </p>
    </header>
  );
}
