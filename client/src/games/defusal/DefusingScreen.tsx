import { Bomb } from './Bomb.tsx';
import { Manual } from './Manual.tsx';
import { BombClock, Strikes, nameOf, usePulse } from './common.tsx';
import type { ScreenProps } from './common.tsx';
import styles from './defusal.module.css';

/** The clock for everybody; the bomb for the defuser, their sheets for the experts. */
export function DefusingScreen({ view, room, act }: ScreenProps<'defusing'>) {
  const flash = usePulse(view.strikes);
  return (
    <section className={`${styles.screen} ${styles.wide}`}>
      <header className={`card ${styles.status} ${flash ? styles.strikeFlash : ''}`}>
        <BombClock clock={view.clock} />
        <div className={styles.statusText}>
          <span>
            Erreurs <Strikes strikes={view.strikes} max={view.maxStrikes} />
          </span>
          <span>
            Modules désamorcés : {view.solved} / {view.modules}
          </span>
          {!view.bomb && <span>Démineur : {nameOf(room, view.defuser)}</span>}
        </div>
      </header>
      {view.bomb ? <Bomb bomb={view.bomb} act={act} /> : <Manual pages={view.pages ?? []} />}
    </section>
  );
}
