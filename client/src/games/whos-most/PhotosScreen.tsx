import { useState } from 'react';
import { HEAD_MAX_BYTES } from '@mini-jeux/shared/games/whos-most-data';
import { HeadPicker } from '../../core/ui/HeadPicker.tsx';
import { HeadFrame, useHeadPictures } from './common.tsx';
import type { ScreenProps } from './common.tsx';
import { Brush, BrushButton } from './Brush.tsx';
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
        {view.heads.map((head, index) => (
          <li key={head.playerId}>
            <HeadFrame
              playerId={head.playerId}
              name={name(head.playerId)}
              src={head.mediaId ? (pictures[head.mediaId] ?? null) : null}
              state={head.mediaId ? undefined : 'dim'}
            >
              <Brush seed={index + 1}>
                <span className={styles.label}>{head.mediaId ? 'Prêt' : 'En attente'}</span>
              </Brush>
            </HeadFrame>
          </li>
        ))}
      </ul>

      <div className={styles.bottom}>
        {isHost ? (
          <>
            <BrushButton seed={21} disabled={!view.canStart} onClick={() => void start()}>
              Lancer les questions
            </BrushButton>
            {missing > 0 && (
              <Brush size="text" seed={22}>
                {missing > 1 ? 'Des joueurs n’ont' : 'Un joueur n’a'} pas encore envoyé de photo : «
                Passer à la suite » lance quand même, sans photo
              </Brush>
            )}
          </>
        ) : (
          <Brush size="text" seed={23}>
            L'hôte lance les questions quand tout le monde est prêt
          </Brush>
        )}
        {error && (
          <Brush size="text" seed={24}>
            <span className="error" role="alert">
              {error}
            </span>
          </Brush>
        )}
      </div>
    </section>
  );
}
