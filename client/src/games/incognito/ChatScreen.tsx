import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Alias } from '@mini-jeux/shared/games/incognito';
import { ANSWER_MAX_LENGTH } from '@mini-jeux/shared/games/incognito-data';
import { Avatar } from './Avatar.tsx';
import { HistoryDialog, NoteField, aliasLabel } from './common.tsx';
import type { ScreenProps } from './common.tsx';
import styles from './incognito.module.css';

/** Pixels from the bottom under which the feed keeps following the new messages. */
const FOLLOW_MARGIN = 80;

/**
 * The chat: a question, one answer per player under their invented first name. On the side, the
 * first names with a private note each ("who is it?") and their history.
 */
export function ChatScreen({ view, act }: ScreenProps<'chat'>) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Alias | null>(null);
  const feed = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const following = useRef(true);

  const aliasById = new Map(view.aliases.map((alias) => [alias.id, alias]));
  const answered = view.answered.includes(view.me);
  const messages = view.rounds.reduce((count, round) => count + round.answers.length, 0);

  // Follows the conversation, unless the player scrolled up to read.
  useEffect(() => {
    const element = feed.current;
    if (element && following.current) element.scrollTop = element.scrollHeight;
  }, [messages, view.index]);

  // A new question: the field is ready to type in again.
  useEffect(() => {
    if (!answered) input.current?.focus();
  }, [answered, view.index]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const answer = text.trim();
    if (!answer || answered || busy) return;
    setBusy(true);
    const result = await act('answer', { question: view.index, text: answer });
    setBusy(false);
    setError(result.ok ? null : result.message);
    if (result.ok) {
      setText('');
      following.current = true;
    }
  };

  return (
    <section className={styles.screen}>
      <div className={`card ${styles.chatLayout}`}>
        <div className={styles.chat}>
          <header className={styles.chatHead}>
            <h2>Chat général</h2>
            <span className="muted">
              Question {view.index} / {view.total}
            </span>
          </header>

          <div
            className={styles.feed}
            ref={feed}
            role="log"
            aria-label="Messages du chat"
            onScroll={(event) => {
              const element = event.currentTarget;
              following.current =
                element.scrollHeight - element.scrollTop - element.clientHeight < FOLLOW_MARGIN;
            }}
          >
            {view.rounds.map((round, index) => (
              <div key={index} className={styles.round}>
                <p className={styles.divider}>
                  <strong>{round.question}</strong>
                  <small>
                    Question n°{index + 1}/{view.total}
                  </small>
                </p>
                {round.answers.map((answer) => {
                  const author = aliasById.get(answer.alias);
                  const mine = answer.alias === view.me;
                  return (
                    <div key={answer.alias} className={mine ? styles.mineMessage : styles.message}>
                      {!mine && <span className={styles.author}>{author?.name}</span>}
                      <span className={mine ? styles.bubbleMine : styles.bubble}>
                        {answer.text}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <form className={styles.composer} onSubmit={(event) => void send(event)}>
            <input
              ref={input}
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={ANSWER_MAX_LENGTH}
              disabled={answered}
              placeholder={
                answered ? 'Réponse envoyée. On attend les autres…' : 'Écris ta réponse…'
              }
              aria-label="Ta réponse"
              autoComplete="off"
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={answered || busy || text.trim() === ''}
            >
              Envoyer
            </button>
          </form>
          {error && (
            <p className={`error ${styles.chatError}`} role="alert">
              {error}
            </p>
          )}
        </div>

        <aside className={styles.side} aria-label="Les prénoms">
          <h3>Qui est qui ?</h3>
          <ul className={styles.aliases}>
            {view.aliases.map((alias) => (
              <li key={alias.id}>
                <button
                  type="button"
                  className={styles.aliasButton}
                  onClick={() => setHistory(alias)}
                  aria-label={`Historique de ${alias.name}`}
                >
                  <span className={styles.avatarWrap}>
                    <Avatar name={alias.name} slot={alias.slot} size={40} />
                    {view.answered.includes(alias.id) && (
                      <span className={styles.check} title="A répondu">
                        ✓
                      </span>
                    )}
                  </span>
                  <span className={styles.aliasName}>{aliasLabel(alias, view.me)}</span>
                </button>
                {alias.id !== view.me && (
                  <NoteField
                    alias={alias}
                    value={view.notes[alias.id] ?? ''}
                    save={(note) => void act('note', { alias: alias.id, text: note })}
                  />
                )}
              </li>
            ))}
          </ul>
          <p className="muted">Les notes sont privées : tu es le seul à les voir.</p>
        </aside>
      </div>

      {history && (
        <HistoryDialog alias={history} rounds={view.rounds} onClose={() => setHistory(null)} />
      )}
    </section>
  );
}
