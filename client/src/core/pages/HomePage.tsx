import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  NICKNAME_MAX_LENGTH,
  ROOM_CODE_LENGTH,
  normalizeNickname,
  normalizeRoomCode,
  validateNickname,
} from '@mini-jeux/shared';
import type { GameMeta } from '@mini-jeux/shared';
import { navigate, takeFlash } from '../../app/router.ts';
import { api } from '../session/api.ts';
import { codeMessage, errorMessage } from '../session/errors.ts';
import { historyStore, nicknameStore, sessionStore } from '../session/storage.ts';
import type { StoredSession } from '../session/storage.ts';
import styles from './HomePage.module.css';

export function HomePage({ joinCode }: { joinCode: string | null }) {
  const [flash] = useState(takeFlash);
  const [games, setGames] = useState<GameMeta[] | null>(null);
  const [nickname, setNickname] = useState(nicknameStore.load);
  const [code, setCode] = useState(joinCode ?? '');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasHistory, setHasHistory] = useState(() => !historyStore.isEmpty());

  useEffect(() => {
    document.title = 'Mini-jeux entre amis';
    api.games().then(setGames, () => setGames([]));
  }, []);

  /** Checks the nickname locally for immediate feedback; the server checks it again. */
  const checkedNickname = (): string | null => {
    const normalized = normalizeNickname(nickname);
    const problem = validateNickname(normalized);
    if (problem) {
      setError(codeMessage(problem));
      return null;
    }
    return normalized;
  };

  const enterRoom = (session: StoredSession, usedNickname: string) => {
    nicknameStore.save(usedNickname);
    sessionStore.save(session);
    navigate(`/room/${session.code}`);
  };

  const create = async () => {
    setError(null);
    const name = checkedNickname();
    if (!name) return;
    setBusy('create');
    try {
      enterRoom(await api.createRoom({ nickname: name, history: historyStore.load() }), name);
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(null);
    }
  };

  const join = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const name = checkedNickname();
    if (!name) return;
    const normalizedCode = normalizeRoomCode(code);
    if (normalizedCode.length !== ROOM_CODE_LENGTH) {
      setError(`Le code de partie fait ${ROOM_CODE_LENGTH} caractères.`);
      return;
    }
    setBusy('join');
    try {
      const session = await api.joinRoom({
        code: normalizedCode,
        nickname: name,
        history: historyStore.load(),
      });
      enterRoom(session, name);
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(null);
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <h1>Mini-jeux entre amis</h1>
        <p className="muted">
          Chacun sur son PC, en même temps. Crée une partie, partage le code, et c'est parti.
        </p>
      </header>

      {flash && (
        <p className={styles.flash} role="status">
          {flash}
        </p>
      )}

      <section className={`card ${styles.nickname}`}>
        <label htmlFor="nickname">Ton pseudo</label>
        <input
          id="nickname"
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          maxLength={NICKNAME_MAX_LENGTH * 4}
          autoComplete="nickname"
          placeholder="Ex. : Léa"
          autoFocus
        />
      </section>

      <div className={styles.actions}>
        <section className="card">
          <h2>Créer une partie</h2>
          <p className="muted">Tu seras l'hôte : tu choisis les jeux et tu lances les parties.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void create()}
            disabled={busy !== null}
          >
            {busy === 'create' ? 'Création…' : 'Créer une partie'}
          </button>
        </section>

        <form className={`card ${joinCode ? styles.highlight : ''}`} onSubmit={(e) => void join(e)}>
          <h2>Rejoindre</h2>
          <label htmlFor="code" className="visually-hidden">
            Code de la partie
          </label>
          <input
            id="code"
            className={styles.code}
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            maxLength={ROOM_CODE_LENGTH + 4}
            placeholder="CODE"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" className="btn btn-primary" disabled={busy !== null}>
            {busy === 'join' ? 'Connexion…' : 'Rejoindre'}
          </button>
        </form>
      </div>

      {error && (
        <p className={`error ${styles.error}`} role="alert">
          {error}
        </p>
      )}

      <section className={styles.games}>
        <h2>Jeux disponibles</h2>
        {games === null && <p className="muted">Chargement…</p>}
        {games?.length === 0 && <p className="muted">Aucun jeu disponible pour l'instant.</p>}
        {games && games.length > 0 && (
          <ul className={styles.gameList}>
            {games.map((game) => (
              <li key={game.id} className="card">
                <h3>
                  {game.name}
                  {!game.replayable && <span className={styles.badge}>à usage unique</span>}
                </h3>
                <p className="muted">{game.description}</p>
                <p className={styles.players}>
                  {game.minPlayers} à {game.maxPlayers} joueurs
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className={styles.footer}>
        <p>Aucun compte. Tes enregistrements sont supprimés à la fin de la partie.</p>
        {hasHistory && (
          <button
            type="button"
            className="btn btn-small"
            onClick={() => {
              historyStore.clear();
              setHasHistory(false);
            }}
          >
            Oublier mon historique de vidéos
          </button>
        )}
      </footer>
    </main>
  );
}
