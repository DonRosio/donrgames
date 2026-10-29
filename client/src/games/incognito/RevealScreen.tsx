import { useState } from 'react';
import { Scoreboard } from '../../core/ui/Scoreboard.tsx';
import { Avatar } from './Avatar.tsx';
import type { ScreenProps } from './common.tsx';
import styles from './incognito.module.css';

/**
 * The moment of truth: the host unmasks one person at a time ("X was hiding behind Y"), with who
 * found them, and the points add up. After the last one, the final ranking.
 */
export function RevealScreen({ view, me, isHost, act }: ScreenProps<'reveal'>) {
  const [error, setError] = useState<string | null>(null);
  const nickname = (id: string) => view.people.find((person) => person.id === id)?.nickname ?? '?';
  const aliasById = new Map(view.aliases.map((alias) => [alias.id, alias]));
  const current = view.pairs.at(-1);
  const earlier = view.pairs.slice(0, -1).reverse();
  const done = view.pairs.length === view.people.length;

  const next = async () => {
    const result = await act('next', {});
    setError(result.ok ? null : result.message);
  };

  const verdict = (pair: NonNullable<typeof current>) => {
    if (pair.person === me.id) {
      return pair.foundBy.length === 0
        ? 'C’était toi, et personne ne t’a reconnu !'
        : `C’était toi : ${pair.foundBy.map(nickname).join(', ')} t’ont reconnu.`;
    }
    const guess = view.myLinks[pair.alias];
    if (guess === pair.person) return 'Tu l’avais trouvé !';
    return guess ? `Tu avais pensé à ${nickname(guess)}.` : 'Tu n’avais rien relié.';
  };

  return (
    <section className={styles.screen}>
      <header className={styles.matchHead}>
        <h2>Le moment de vérité</h2>
      </header>

      {current ? (
        <div className={`card ${styles.unmask}`} key={view.pairs.length}>
          <span className={`${styles.pill} ${styles.pillBig}`}>
            <span className={styles.initial} aria-hidden="true">
              {[...nickname(current.person)][0]?.toUpperCase()}
            </span>
            <span>{nickname(current.person)}</span>
          </span>
          <p className={styles.unmaskText}>Était caché sous l’identité de :</p>
          <span className={`${styles.pill} ${styles.pillBig} ${styles.unmaskAlias}`}>
            <Avatar
              name={aliasById.get(current.alias)!.name}
              slot={aliasById.get(current.alias)!.slot}
              size={48}
            />
            <span>{aliasById.get(current.alias)!.name}</span>
          </span>
          <p className={`${styles.unmaskFound} ${styles.afterAlias}`}>
            {current.foundBy.length === 0
              ? 'Personne ne l’a trouvé !'
              : `Trouvé par ${current.foundBy.map(nickname).join(', ')}.`}
          </p>
          <p className={`muted ${styles.afterAlias}`}>{verdict(current)}</p>
        </div>
      ) : (
        <div className={`card ${styles.unmask}`}>
          <p className={styles.unmaskText}>
            Les {view.people.length} masques vont tomber, un par un.
          </p>
          <p className="muted">Qui se cachait derrière chaque prénom ?</p>
        </div>
      )}

      {earlier.length > 0 && (
        <div className={`card ${styles.earlier}`}>
          <h3>Déjà démasqués</h3>
          <ul>
            {earlier.map((pair) => (
              <li key={pair.person}>
                <strong>{nickname(pair.person)}</strong> était {aliasById.get(pair.alias)?.name}
                <span className="muted">
                  {' '}
                  · trouvé par {pair.foundBy.length} joueur{pair.foundBy.length > 1 ? 's' : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {view.pairs.length > 0 && (
        <div className="card">
          <h3 className={styles.scoreTitle}>Points marqués</h3>
          <Scoreboard
            entries={view.scores.map((entry) => ({
              playerId: entry.playerId,
              nickname: nickname(entry.playerId),
              score: entry.score,
            }))}
            me={me.id}
          />
        </div>
      )}

      {isHost ? (
        <div className={styles.matchBottom}>
          <button type="button" className="btn btn-primary" onClick={() => void next()}>
            {done
              ? 'Voir le classement'
              : view.pairs.length === 0
                ? 'Lever le premier masque'
                : 'Démasquer le suivant'}
          </button>
        </div>
      ) : (
        <p className={styles.hint}>
          {done ? 'L’hôte affichera le classement.' : 'L’hôte démasque les joueurs un à un.'}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
