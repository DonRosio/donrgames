import { VoteReveal } from '../../core/ui/VoteReveal.tsx';
import { RoundHeader } from './common.tsx';
import type { ScreenProps } from './common.tsx';
import styles from './dubbing.module.css';

export function RevealScreen({ view, room, isHost, act }: ScreenProps<'reveal'>) {
  const name = (id: string) => room.players.find((p) => p.id === id)?.nickname ?? '?';
  const last = view.index === view.count;

  return (
    <section className={styles.screen}>
      <RoundHeader
        round={view.round}
        rounds={view.rounds}
        step={`Résultat · prise ${view.index} / ${view.count}`}
      />
      <div className={`card ${styles.center}`}>
        <p className={styles.big}>Prise de {name(view.presenter)}</p>
        {/* Keyed by presenter: the animation replays for each take. */}
        <VoteReveal
          key={view.presenter}
          votes={view.votes.map((vote) => ({ voter: name(vote.voter), points: vote.points }))}
          total={view.total}
        />
        {isHost ? (
          <button type="button" className="btn btn-primary" onClick={() => void act('next', {})}>
            {last ? 'Voir les scores de la manche' : 'Prise suivante'}
          </button>
        ) : (
          <p className="muted">L'hôte passe à la suite quand tout le monde est prêt.</p>
        )}
      </div>
    </section>
  );
}
