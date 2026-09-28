import type { DubbingContract, DubbingView } from '@mini-jeux/shared/games/dubbing';
import type { GameScreenProps } from '../../core/game-host/client-game.ts';
import styles from './dubbing.module.css';

export type ScreenProps<P extends DubbingView['phase']> = GameScreenProps<
  DubbingContract,
  Extract<DubbingView, { phase: P }>
>;

export function RoundHeader({
  round,
  rounds,
  step,
}: {
  round: number;
  rounds: number;
  step: string;
}) {
  return (
    <header className={styles.header}>
      <span className={styles.round}>
        Manche {round} / {rounds}
      </span>
      <span className={styles.step}>{step}</span>
    </header>
  );
}
