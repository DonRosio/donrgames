import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  NICKNAME_MAX_LENGTH,
  ROOM_CODE_LENGTH,
  normalizeNickname,
  normalizeRoomCode,
  playerCountLabel,
  validateNickname,
} from '@mini-jeux/shared';
import type { GameInfo } from '@mini-jeux/shared';
import { navigate, takeFlash } from '../../app/router.ts';
import { api } from '../session/api.ts';
import { codeMessage, errorMessage } from '../session/errors.ts';
import { nicknameStore, sessionStore } from '../session/storage.ts';
import type { StoredSession } from '../session/storage.ts';
import styles from './HomePage.module.css';

export function HomePage({ joinCode }: { joinCode: string | null }) {
  const [flash] = useState(takeFlash);
  const [games, setGames] = useState<GameInfo[] | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [nickname, setNickname] = useState(nicknameStore.load);
  const [code, setCode] = useState(joinCode ?? '');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Mini-jeux entre amis';
    api.games().then(
      (list) => {
        setGames(list);
        setGameId((current) => current ?? list[0]?.meta.id ?? null);
      },
      () => setGames([]),
    );
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
    if (!name || !gameId) return;
    setBusy('create');
    try {
      enterRoom(await api.createRoom({ nickname: name, gameId }), name);
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
          Chacun sur son PC, en même temps. Choisis un jeu, crée une partie, partage le code, et
          c'est parti.
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

      <section className={styles.games} aria-labelledby="games-title">
        <h2 id="games-title">1. Choisis un jeu</h2>
        {games === null && <p className="muted">Chargement…</p>}
        {games?.length === 0 && <p className="muted">Aucun jeu disponible pour l'instant.</p>}
        {games && games.length > 0 && (
          <div className={styles.gameList} role="radiogroup" aria-labelledby="games-title">
            {games.map(({ meta: game }) => (
              <button
                key={game.id}
                type="button"
                role="radio"
                aria-checked={game.id === gameId}
                className={`card ${styles.gameCard} ${game.id === gameId ? styles.chosen : ''}`}
                onClick={() => setGameId(game.id)}
              >
                <span className={styles.gameName}>
                  {game.name}
                  {!game.replayable && <span className={styles.badge}>à usage unique</span>}
                </span>
                <span className="muted">{game.description}</span>
                <span className={styles.players}>{playerCountLabel(game)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <h2 className={styles.step}>2. Crée une partie ou rejoins-en une</h2>
      <div className={styles.actions}>
        <section className="card">
          <h3>Créer une partie</h3>
          <p className="muted">
            Tu seras l'hôte : tu règles la partie et tu la lances. Un salon = un jeu.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void create()}
            disabled={busy !== null || !gameId}
          >
            {busy === 'create'
              ? 'Création…'
              : `Créer une partie de ${games?.find((g) => g.meta.id === gameId)?.meta.name ?? '…'}`}
          </button>
        </section>

        <form className={`card ${joinCode ? styles.highlight : ''}`} onSubmit={(e) => void join(e)}>
          <h3>Rejoindre</h3>
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

      <footer className={styles.footer}>
        <p>Aucun compte. Tes enregistrements sont supprimés à la fin de la partie.</p>
      </footer>
    </main>
  );
}
