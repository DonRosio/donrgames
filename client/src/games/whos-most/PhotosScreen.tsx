import { useState } from 'react';
import { HeadPicker } from '../../core/ui/HeadPicker.tsx';
import { HEAD_MAX_BYTES } from '@mini-jeux/shared/games/whos-most-data';
import { HeadFrame, useHeadPictures } from './common.tsx';
import type { ScreenProps } from './common.tsx';
import styles from './whos-most.module.css';

export function PhotosScreen({
  view,
  room,
  isHost,
  act,
  upload,
  fetchMedia,
}: ScreenProps<'photos'>) {
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pictures = useHeadPictures(view.heads, fetchMedia);
  const name = (id: string) => room.players.find((p) => p.id === id)?.nickname ?? '?';
  const mine = view.heads.find((head) => head.playerId === room.me);
  const picking = !mine?.mediaId || changing;
  const missing = view.heads.filter((head) => !head.mediaId).length;

  const send = async (png: Blob) => {
    const result = await upload('head', png, {});
    if (result.ok) setChanging(false);
    return result;
  };

  const start = async () => {
    const result = await act('start', {});
    setError(result.ok ? null : result.message);
  };

  return (
    <section className={styles.screen}>
      <div className={`card ${styles.center}`}>
        <h2 className={styles.big}>Ta tête</h2>
        {picking ? (
          <>
            <p className="muted">
              Choisis une photo de toi : le fond est retiré directement dans ton navigateur, rien
              n'est envoyé avant que tu valides.
            </p>
            <HeadPicker maxBytes={HEAD_MAX_BYTES} submitLabel="Valider ma tête" onSubmit={send} />
            {mine?.mediaId && (
              <button type="button" className="btn" onClick={() => setChanging(false)}>
                Annuler
              </button>
            )}
          </>
        ) : (
          <>
            <p className="muted">Ta tête est envoyée.</p>
            <button type="button" className="btn" onClick={() => setChanging(true)}>
              Changer ma photo
            </button>
          </>
        )}
      </div>

      <ul className={styles.grid} aria-label="Têtes des joueurs">
        {view.heads.map((head) => (
          <li key={head.playerId}>
            <HeadFrame
              name={name(head.playerId)}
              src={head.mediaId ? (pictures[head.mediaId] ?? null) : null}
              {...(head.mediaId ? {} : { state: 'dim' as const })}
            >
              <span className={styles.caption}>{head.mediaId ? '✓ Prête' : 'En attente…'}</span>
            </HeadFrame>
          </li>
        ))}
      </ul>

      {isHost ? (
        <div className={`card ${styles.center}`}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!view.canStart}
            onClick={() => void start()}
          >
            Lancer les questions
          </button>
          {missing > 0 && (
            <p className="muted">
              {missing} joueur{missing > 1 ? 's' : ''} n'{missing > 1 ? 'ont' : 'a'} pas encore
              envoyé de photo. « Passer à la suite » lance quand même, sans leur photo.
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
      ) : (
        <p className={styles.hint}>L'hôte lance les questions quand tout le monde est prêt.</p>
      )}
    </section>
  );
}
