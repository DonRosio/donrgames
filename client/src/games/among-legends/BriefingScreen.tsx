import { useState } from 'react';
import { playAlarm } from '../../core/media/alarm.ts';
import { resumeAudio } from '../../core/media/audio.ts';
import { RoleCard, Teams, nameOf } from './common.tsx';
import type { ScreenProps } from './common.tsx';
import styles from './among-legends.module.css';

const MODE_TEXT = {
  ally: 'en mode Allié : tu dois gagner',
  impostor: 'en mode Imposteur : tu dois perdre',
} as const;

/** Everyone discovers their secret role, then the host starts the clock with the LoL game. */
export function BriefingScreen({ view, room, isHost, act }: ScreenProps<'briefing'>) {
  const [error, setError] = useState<string | null>(null);
  const read = view.read.includes(room.me);
  const notRead = Object.keys(view.teams).filter((id) => !view.read.includes(id));

  const markRead = async () => {
    // This click also allows the page to play the alarms later on.
    await resumeAudio();
    const result = await act('read', {});
    setError(result.ok ? null : result.message);
  };
  const start = async () => {
    const result = await act('start', {});
    setError(result.ok ? null : result.message);
  };

  return (
    <section className={styles.screen}>
      <RoleCard role={view.role} />
      {view.twoFaceStart && (
        <p className={styles.notice}>
          Au début de la partie, tu es {MODE_TEXT[view.twoFaceStart]}. Ton mode change toutes les 7
          minutes : une alarme te préviendra.
        </p>
      )}
      {view.role === 'chameleon' && (
        <p className={styles.notice}>
          Ton vrai rôle te sera révélé à 15 minutes de jeu, avec une alarme.
        </p>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={read ? 'btn' : 'btn btn-primary'}
          disabled={read}
          onClick={() => void markRead()}
        >
          {read ? '✓ Rôle lu' : "J'ai lu mon rôle"}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void resumeAudio().then(() => playAlarm())}
        >
          🔔 Tester l'alarme
        </button>
      </div>
      <p className={styles.hint}>
        Garde cet onglet ouvert pendant la partie et le son de ton PC allumé : les alarmes sonnent
        même quand tu es sur League of Legends.
      </p>

      {view.size === 10 && <Teams teams={view.teams} room={room} size={view.size} />}
      <p className={styles.hint}>
        {notRead.length === 0
          ? 'Tout le monde a lu son rôle.'
          : `Pas encore lu : ${notRead.map((id) => nameOf(room, id)).join(', ')}.`}
      </p>

      {isHost ? (
        <div className={`card ${styles.hostPanel}`}>
          <p>
            Lancez la partie de League of Legends. Clique au moment où son chrono démarre : les
            alarmes du Double Face et du Caméléon en dépendent.
          </p>
          <button
            type="button"
            className={`btn btn-primary ${styles.mainAction}`}
            onClick={() => void start()}
          >
            La partie a commencé
          </button>
        </div>
      ) : (
        <p className={styles.hint}>
          L'hôte démarrera le chrono au lancement de la partie de League of Legends.
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
