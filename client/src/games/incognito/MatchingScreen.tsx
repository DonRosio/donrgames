import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Alias } from '@mini-jeux/shared/games/incognito';
import { Avatar } from './Avatar.tsx';
import { HistoryDialog, NoteField, aliasLabel } from './common.tsx';
import type { ScreenProps } from './common.tsx';
import styles from './incognito.module.css';

type Side = 'alias' | 'person';
interface Dot {
  side: Side;
  id: string;
}
interface Point {
  x: number;
  y: number;
}
type Points = Record<string, Point>;

/** Below this distance (px), a press on a dot is a click, not the start of a drag. */
const DRAG_THRESHOLD = 6;
/** The draft is sent to the server shortly after the last change. */
const SAVE_DELAY_MS = 200;

const keyOf = (dot: Dot) => `${dot.side}:${dot.id}`;

function samePoints(a: Points, b: Points): boolean {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => b[key] && a[key]!.x === b[key].x && a[key]!.y === b[key].y)
  );
}

/**
 * The matching: a line from each first name (left) to the player the viewer thinks is behind it
 * (right). Press a dot and drag to the other column, or click one dot then the other. Each first
 * name and each player takes exactly one line; one's own line is already drawn.
 */
export function MatchingScreen({ view, me, act }: ScreenProps<'matching'>) {
  const [links, setLinks] = useState<Record<string, string>>(view.links);
  const [armed, setArmed] = useState<Dot | null>(null);
  const [drag, setDrag] = useState<(Dot & Point) | null>(null);
  const [points, setPoints] = useState<Points>({});
  const [history, setHistory] = useState<Alias | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const board = useRef<HTMLDivElement>(null);
  const dots = useRef(new Map<string, HTMLElement>());
  const ignoreClick = useRef(false);
  const dirty = useRef(false);

  const locked = view.confirmed;
  const myAlias = view.me;
  const myPerson = me.id;
  const others = view.people.length - 1;
  const linked = Object.keys(links).length;
  const complete = linked === others;

  // Where the dots are, to draw the lines between them (the layout moves with the window).
  const measure = useCallback(() => {
    const element = board.current;
    if (!element) return;
    const origin = element.getBoundingClientRect();
    const next: Points = {};
    for (const [key, dot] of dots.current) {
      const box = dot.getBoundingClientRect();
      next[key] = {
        x: box.left + box.width / 2 - origin.left,
        y: box.top + box.height / 2 - origin.top,
      };
    }
    setPoints((current) => (samePoints(current, next) ? current : next));
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, view.aliases, view.people]);

  useEffect(() => {
    const element = board.current;
    if (!element) return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  // The draft is kept by the server: it survives a reload, and counts if the host moves on.
  useEffect(() => {
    if (!dirty.current || locked) return;
    const timer = setTimeout(() => {
      dirty.current = false;
      void act('guess', { links: toList(links) });
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [links, locked, act]);

  const link = (alias: string, person: string) => {
    if (locked || alias === myAlias || person === myPerson) return;
    dirty.current = true;
    setLinks((current) => {
      const next = { ...current };
      // One line per player: moving a line away from someone frees them.
      for (const key of Object.keys(next)) if (next[key] === person) delete next[key];
      next[alias] = person;
      return next;
    });
  };

  const join = (from: Dot, to: Dot) => {
    if (from.side === to.side) return;
    if (from.side === 'alias') link(from.id, to.id);
    else link(to.id, from.id);
  };

  const unlink = (alias: string) => {
    if (locked) return;
    dirty.current = true;
    setLinks((current) => {
      const next = { ...current };
      delete next[alias];
      return next;
    });
  };

  const pointOf = (event: { clientX: number; clientY: number }): Point => {
    const origin = board.current!.getBoundingClientRect();
    return { x: event.clientX - origin.left, y: event.clientY - origin.top };
  };

  const onPointerDown = (dot: Dot) => (event: ReactPointerEvent) => {
    if (locked || event.button !== 0) return;
    const start = { moved: false };
    const origin = { x: event.clientX, y: event.clientY };

    const move = (moveEvent: PointerEvent) => {
      const point = pointOf(moveEvent);
      if (!start.moved) {
        start.moved =
          Math.hypot(moveEvent.clientX - origin.x, moveEvent.clientY - origin.y) > DRAG_THRESHOLD;
      }
      if (start.moved) setDrag({ side: dot.side, id: dot.id, ...point });
    };
    const finish = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      setDrag(null);
      if (!start.moved) return; // a click: the click handler takes over
      // A click event may follow the drag: it must not arm a dot.
      ignoreClick.current = true;
      setTimeout(() => {
        ignoreClick.current = false;
      }, 0);
      const target = document
        .elementFromPoint(upEvent.clientX, upEvent.clientY)
        ?.closest<HTMLElement>('[data-side]');
      if (target?.dataset.side && target.dataset.id) {
        join(dot, { side: target.dataset.side as Side, id: target.dataset.id });
      }
      setArmed(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

  // Click (or keyboard): select a dot, then the one it goes with.
  const onClick = (dot: Dot) => () => {
    if (locked || ignoreClick.current) return;
    if (armed && armed.side !== dot.side) {
      join(armed, dot);
      setArmed(null);
    } else {
      setArmed(armed && keyOf(armed) === keyOf(dot) ? null : dot);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    dirty.current = false;
    const saved = await act('guess', { links: toList(links) });
    const result = saved.ok ? await act('confirm', {}) : saved;
    setBusy(false);
    if (!result.ok) setError(result.message);
  };

  const dotButton = (dot: Dot, label: string, disabled: boolean) => {
    const isLinked = dot.side === 'alias' ? dot.id in links : Object.values(links).includes(dot.id);
    const isArmed = armed !== null && keyOf(armed) === keyOf(dot);
    return (
      <button
        type="button"
        ref={(element) => {
          if (element) dots.current.set(keyOf(dot), element);
          else dots.current.delete(keyOf(dot));
        }}
        className={`${styles.dot} ${isLinked || disabled ? styles.dotLinked : ''} ${isArmed ? styles.dotArmed : ''}`}
        data-side={dot.side}
        data-id={dot.id}
        aria-label={label}
        aria-pressed={isArmed}
        disabled={disabled || locked}
        onPointerDown={onPointerDown(dot)}
        onClick={onClick(dot)}
      />
    );
  };

  const lines = [
    ...Object.entries(links).map(([alias, person]) => ({
      key: alias,
      from: points[`alias:${alias}`],
      to: points[`person:${person}`],
      alias,
      own: false,
    })),
    {
      key: 'own',
      from: points[`alias:${myAlias}`],
      to: points[`person:${myPerson}`],
      alias: myAlias,
      own: true,
    },
  ];
  const dragFrom = drag ? points[keyOf(drag)] : undefined;
  const waiting = view.people.filter((person) => !view.confirmedBy.includes(person.id));

  return (
    <section className={styles.screen}>
      <header className={styles.matchHead}>
        <h2>Qui se cache derrière ces prénoms ?</h2>
        <p>
          Relie chaque prénom à la personne que tu penses y reconnaître : clique un point puis
          l’autre, ou glisse la souris de l’un à l’autre. Un trait par prénom et par personne.
        </p>
      </header>

      <div className={`card ${styles.board}`} ref={board}>
        <svg className={styles.lines} aria-hidden="true">
          {lines.map(
            (line) =>
              line.from &&
              line.to && (
                <g key={line.key}>
                  <line
                    className={line.own ? styles.lineOwn : styles.line}
                    x1={line.from.x}
                    y1={line.from.y}
                    x2={line.to.x}
                    y2={line.to.y}
                  />
                  {!line.own && !locked && (
                    <line
                      className={styles.lineHit}
                      x1={line.from.x}
                      y1={line.from.y}
                      x2={line.to.x}
                      y2={line.to.y}
                      onClick={() => unlink(line.alias)}
                    >
                      <title>Effacer ce trait</title>
                    </line>
                  )}
                </g>
              ),
          )}
          {drag && dragFrom && (
            <line
              className={styles.lineDrag}
              x1={dragFrom.x}
              y1={dragFrom.y}
              x2={drag.x}
              y2={drag.y}
            />
          )}
        </svg>

        <ul className={styles.column} aria-label="Prénoms">
          {view.aliases.map((alias) => {
            const mine = alias.id === myAlias;
            return (
              <li key={alias.id} className={styles.matchRow}>
                {mine ? (
                  // Keeps the own first name aligned with the others.
                  <span className={styles.matchNote} aria-hidden="true" />
                ) : (
                  <NoteField
                    alias={alias}
                    value={view.notes[alias.id] ?? ''}
                    save={(note) => void act('note', { alias: alias.id, text: note })}
                    className={styles.matchNote}
                  />
                )}
                <button
                  type="button"
                  className={`${styles.pill} ${mine ? styles.pillMine : ''}`}
                  onClick={() => setHistory(alias)}
                  aria-label={`Historique de ${alias.name}`}
                >
                  <Avatar name={alias.name} slot={alias.slot} size={32} />
                  <span>{aliasLabel(alias, myAlias)}</span>
                </button>
                {dotButton(
                  { side: 'alias', id: alias.id },
                  mine ? `${alias.name} (toi)` : `Relier ${alias.name}`,
                  mine,
                )}
              </li>
            );
          })}
        </ul>

        <ul className={styles.column} aria-label="Joueurs">
          {view.people.map((person) => {
            const mine = person.id === myPerson;
            return (
              <li key={person.id} className={styles.matchRowRight}>
                {dotButton(
                  { side: 'person', id: person.id },
                  mine ? `${person.nickname} (toi)` : `Relier ${person.nickname}`,
                  mine,
                )}
                <span className={`${styles.pill} ${mine ? styles.pillMine : ''}`}>
                  <span className={styles.initial} aria-hidden="true">
                    {[...person.nickname][0]?.toUpperCase()}
                  </span>
                  <span>{mine ? `${person.nickname} (toi)` : person.nickname}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className={styles.matchBottom}>
        {locked ? (
          <p className={styles.status} role="status">
            Tes choix sont validés.{' '}
            {waiting.length > 0
              ? `On attend ${waiting.map((person) => person.nickname).join(', ')}.`
              : ''}
          </p>
        ) : (
          <>
            <p className={styles.status} role="status">
              {linked} / {others} traits tracés
              {view.confirmedBy.length > 0 &&
                ` · ${view.confirmedBy.length} joueur${view.confirmedBy.length > 1 ? 's ont' : ' a'} validé`}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!complete || busy}
              onClick={() => void confirm()}
            >
              Valider mes choix
            </button>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>

      {history && (
        <HistoryDialog alias={history} rounds={view.rounds} onClose={() => setHistory(null)} />
      )}
    </section>
  );
}

const toList = (links: Record<string, string>) =>
  Object.entries(links).map(([alias, player]) => ({ alias, player }));
