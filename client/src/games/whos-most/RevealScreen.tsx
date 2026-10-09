import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Confetti } from './Confetti.tsx';
import {
  HeadFrame,
  QuestionHeader,
  QuestionTitle,
  useHeadPictures,
  votesLabel,
} from './common.tsx';
import type { ScreenProps } from './common.tsx';
import { questionSeed, scatter } from './layout.ts';
import { Brush, BrushButton } from './Brush.tsx';
import styles from './whos-most.module.css';

/** Delay between two heads of the reveal (least voted first, the winners last). */
const STEP_MS = 450;

/** Size of the winners' frames: smaller when many share the first place. */
function winnerSize(count: number): number {
  if (count <= 2) return 200;
  if (count <= 4) return 150;
  return 112;
}

/**
 * The result of a question, as on a stage: the most voted heads in the middle, the others
 * scattered around, each with its number of votes. No points: played for fun.
 */
export function RevealScreen({ view, room, isHost, act, fetchMedia }: ScreenProps<'reveal'>) {
  const [error, setError] = useState<string | null>(null);
  const pictures = useHeadPictures(view.heads, fetchMedia);
  const name = (id: string) => room.players.find((p) => p.id === id)?.nickname ?? '?';
  const srcOf = (id: string) => {
    const mediaId = view.heads.find((head) => head.playerId === id)?.mediaId;
    return mediaId ? (pictures[mediaId] ?? null) : null;
  };
  const top = view.results[0]?.votes ?? 0;
  const winners = view.results.filter((result) => result.votes === top && top > 0);
  const others = view.results.filter((result) => !winners.includes(result));
  const spots = scatter(others.length, questionSeed(view.question, view.index));
  // Appearance order: from the least voted to the most voted.
  const order = [...view.results].reverse();
  const delayOf = (id: string) =>
    `${order.findIndex((result) => result.playerId === id) * STEP_MS}ms`;
  const winnersDelayMs = others.length * STEP_MS;

  const next = async () => {
    const result = await act('next', {});
    setError(result.ok ? null : result.message);
  };

  return (
    <section className={styles.screen}>
      <QuestionHeader index={view.index} total={view.total} step="Résultat" />
      {winners.length > 0 && <Confetti delayMs={winnersDelayMs} />}

      <div className={styles.stage}>
        <div className={styles.stageTitle}>
          <QuestionTitle question={view.question} />
        </div>

        <ul className={styles.winners} aria-label="Gagnants">
          {winners.map((result) => (
            <li
              key={result.playerId}
              className={styles.pop}
              style={{ '--delay': `${winnersDelayMs}ms` } as CSSProperties}
            >
              <HeadFrame
                playerId={result.playerId}
                name={name(result.playerId)}
                src={srcOf(result.playerId)}
                size={winnerSize(winners.length)}
                state="chosen"
              >
                <Brush seed={42}>
                  <span className={styles.votes}>{votesLabel(result.votes)}</span>
                </Brush>
              </HeadFrame>
            </li>
          ))}
          {winners.length === 0 && (
            <li>
              <Brush size="text" seed={41}>
                Personne n'a voté
              </Brush>
            </li>
          )}
        </ul>

        <ul className={styles.others} aria-label="Autres têtes">
          {others.map((result, index) => {
            const spot = spots[index];
            return (
              <li
                key={result.playerId}
                className={`${styles.pop} ${styles.scattered}`}
                style={
                  {
                    '--delay': delayOf(result.playerId),
                    ...(spot ? { '--x': `${spot.x}%`, '--y': `${spot.y}%` } : {}),
                  } as CSSProperties
                }
              >
                <HeadFrame
                  playerId={result.playerId}
                  name={name(result.playerId)}
                  src={srcOf(result.playerId)}
                  size={108}
                  tilt={spot?.tilt ?? 0}
                  state={result.votes === 0 ? 'dim' : undefined}
                >
                  <Brush seed={index + 43}>
                    <span className={styles.votes}>{votesLabel(result.votes)}</span>
                  </Brush>
                </HeadFrame>
              </li>
            );
          })}
        </ul>
      </div>

      <div className={styles.bottom}>
        {isHost ? (
          <BrushButton seed={61} onClick={() => void next()}>
            {view.last ? 'Retour au salon' : 'Question suivante'}
          </BrushButton>
        ) : (
          <Brush size="text" seed={62}>
            L'hôte lance la suite
          </Brush>
        )}
        {error && (
          <Brush size="text" seed={63}>
            <span className="error" role="alert">
              {error}
            </span>
          </Brush>
        )}
      </div>
    </section>
  );
}
