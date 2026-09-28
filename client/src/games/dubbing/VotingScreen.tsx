import { useState } from 'react';
import type { Points } from '@mini-jeux/shared/games/dubbing';
import { VotePanel } from '../../core/ui/VotePanel.tsx';
import { RoundHeader } from './common.tsx';
import type { ScreenProps } from './common.tsx';
import styles from './dubbing.module.css';

export function VotingScreen({ view, room, act }: ScreenProps<'voting'>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = (id: string) => room.players.find((p) => p.id === id)?.nickname ?? '?';
  const isPresenter = view.presenter === room.me;

  const vote = async (points: Points) => {
    setBusy(true);
    const result = await act('vote', { points });
    setBusy(false);
    setError(result.ok ? null : result.message);
  };

  return (
    <section className={styles.screen}>
      <RoundHeader
        round={view.round}
        rounds={view.rounds}
        step={`Vote · prise ${view.index} / ${view.count}`}
      />
      <div className={`card ${styles.center}`}>
        {isPresenter ? (
          <p className={styles.big}>C'est ta prise : les autres votent.</p>
        ) : (
          <>
            <p className={styles.big}>Combien pour la prise de {name(view.presenter)} ?</p>
            <VotePanel<Points>
              chosen={view.myVote}
              busy={busy}
              onVote={(points) => void vote(points)}
              options={[
                { value: 0, label: '0' },
                { value: 1, label: '+1' },
                {
                  value: 2,
                  label: '+2',
                  ...(view.canUsePlusTwo ? {} : { disabledReason: 'déjà utilisé cette manche' }),
                },
              ]}
            />
            <p className="muted">
              Le +2 ne peut servir qu'une fois par manche. Un vote est définitif.
            </p>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
      <ul className={styles.status}>
        {view.voters.map((id) => (
          <li key={id} className={view.voted.includes(id) ? styles.ok : undefined}>
            {view.voted.includes(id) ? '✓' : '…'} {name(id)}
          </li>
        ))}
      </ul>
    </section>
  );
}
