import { useState } from 'react';
import { resumeAudio } from '../../core/media/audio.ts';
import { History } from './History.tsx';
import { SoundToggle, nameOf } from './common.tsx';
import { BombIcon, BookIcon } from './Icons.tsx';
import type { ScreenProps } from './common.tsx';
import styles from './defusal.module.css';

/** Who defuses this bomb; everybody says they are ready, then the clock starts. */
export function BriefingScreen({ view, room, act }: ScreenProps<'briefing'>) {
  const [error, setError] = useState<string | null>(null);
  const isDefuser = view.defuser === room.me;
  const ready = view.ready.includes(room.me);
  const waiting = view.players.filter((id) => !view.ready.includes(id));

  const markReady = async () => {
    // This click is what lets the page play the sounds of the game later on.
    await resumeAudio();
    const result = await act('ready', {});
    setError(result.ok ? null : result.message);
  };

  return (
    <section className={styles.screen}>
      <header className={`card ${styles.briefing}`}>
        <p className={styles.round}>
          Bombe {view.round} / {view.rounds}
        </p>
        <div className={styles.roleRow}>
          {isDefuser ? <BombIcon /> : <BookIcon />}
          <h2 className={styles.role}>{isDefuser ? 'Tu es le démineur' : 'Tu es expert'}</h2>
        </div>
        {isDefuser ? (
          <p>
            Tu vas voir la bombe, mais pas le manuel. Décris tout ce que tu vois aux experts, et
            fais exactement ce qu'ils te disent.
          </p>
        ) : (
          <p>
            Tu vas recevoir ta part du manuel, différente de celle des deux autres experts, mais tu
            ne verras pas la bombe. Le démineur est <strong>{nameOf(room, view.defuser)}</strong>.
          </p>
        )}
        <ul className={styles.facts}>
          <li>Chrono : {view.minutes} minutes, qui accélère à chaque erreur.</li>
          <li>
            La bombe explose à la {view.maxStrikes === 1 ? 'première' : `${view.maxStrikes}e`}{' '}
            erreur.
          </li>
          <li>Nouvelles règles pour chaque bombe : rien ne se garde d'une bombe à l'autre.</li>
        </ul>
        <div className={styles.actions}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={ready}
            onClick={() => void markReady()}
          >
            {ready ? '✓ Prêt' : 'Je suis prêt'}
          </button>
          <SoundToggle />
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </header>
      <p className={styles.hint}>
        {waiting.length === 0
          ? 'Tout le monde est prêt.'
          : `Pas encore prêt : ${waiting.map((id) => nameOf(room, id)).join(', ')}. Le chrono démarre quand tout le monde l'est.`}
      </p>
      <History history={view.history} room={room} />
    </section>
  );
}
