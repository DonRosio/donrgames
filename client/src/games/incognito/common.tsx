import { useEffect, useRef, useState } from 'react';
import type {
  Alias,
  ChatRound,
  IncognitoContract,
  IncognitoView,
} from '@mini-jeux/shared/games/incognito';
import { NOTE_MAX_LENGTH } from '@mini-jeux/shared/games/incognito-data';
import type { GameScreenProps } from '../../core/game-host/client-game.ts';
import { Avatar } from './Avatar.tsx';
import styles from './incognito.module.css';

export type ScreenProps<P extends IncognitoView['phase']> = GameScreenProps<
  IncognitoContract,
  Extract<IncognitoView, { phase: P }>
>;

/** "Vous (Arthur)" for the viewer's own first name. */
export function aliasLabel(alias: Alias, me: string): string {
  return alias.id === me ? `Vous (${alias.name})` : alias.name;
}

const SAVE_DELAY_MS = 600;

/**
 * Private note about a first name ("who do I think it is?"). The text is kept here while typing,
 * saved shortly after the last key, when leaving the field, and when the screen goes away.
 */
export function NoteField({
  alias,
  value,
  save,
  className,
}: {
  alias: Alias;
  /** Note already known by the server (read once, when the field appears). */
  value: string;
  save: (text: string) => void;
  className?: string;
}) {
  const [text, setText] = useState(value);
  const dirty = useRef(false);
  const latest = useRef({ text, save });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    latest.current = { text, save };
  });

  const flush = () => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    latest.current.save(latest.current.text.trim());
  };

  // A note typed just before the phase changes must not be lost.
  useEffect(() => flush, []);

  return (
    <input
      className={`${styles.note} ${className ?? ''}`}
      value={text}
      maxLength={NOTE_MAX_LENGTH}
      placeholder="Qui est-ce ?"
      aria-label={`Note sur ${alias.name}`}
      autoComplete="off"
      spellCheck={false}
      onChange={(event) => {
        setText(event.target.value);
        latest.current.text = event.target.value;
        dirty.current = true;
        clearTimeout(timer.current);
        timer.current = setTimeout(flush, SAVE_DELAY_MS);
      }}
      onBlur={flush}
    />
  );
}

/** What a first name answered to each question, in a modal. */
export function HistoryDialog({
  alias,
  rounds,
  onClose,
}: {
  alias: Alias;
  rounds: ChatRound[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="history-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // A click on the dark backdrop reaches the dialog element itself.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <header className={styles.dialogHead}>
        <Avatar name={alias.name} slot={alias.slot} size={36} />
        <h2 id="history-title">Historique de {alias.name}</h2>
        <button type="button" className="btn btn-small" onClick={onClose} autoFocus>
          Fermer
        </button>
      </header>
      <ol className={styles.history}>
        {rounds.map((round, index) => {
          const answer = round.answers.find((entry) => entry.alias === alias.id);
          return (
            <li key={index}>
              <span className={styles.historyQuestion}>{round.question}</span>
              {answer ? (
                <span className={styles.bubble}>{answer.text}</span>
              ) : (
                <span className="muted">Pas de réponse</span>
              )}
            </li>
          );
        })}
      </ol>
    </dialog>
  );
}
