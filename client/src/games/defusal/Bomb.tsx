import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import {
  COLOR_NAMES,
  MAZE_SIZE,
  MODULE_NAMES,
  PORT_NAMES,
} from '@mini-jeux/shared/games/defusal-data';
import type {
  BombView,
  Direction,
  Edgework,
  ModuleView,
} from '@mini-jeux/shared/games/defusal-data';
import type { ScreenProps } from './common.tsx';
import { DOT, MARKER, PAINT, TARGET } from './art.ts';
import { Memory, Morse, Password, Purge, Simon } from './BombMore.tsx';
import styles from './defusal.module.css';

type Act = ScreenProps<'defusing'>['act'];
type Of<K extends ModuleView['kind']> = Extract<ModuleView, { kind: K }>;

/** What surrounds the modules: the rules of the manual refer to it all the time. */
function EdgeworkPanel({ edgework }: { edgework: Edgework }) {
  return (
    <div className={styles.edgework}>
      <div className={styles.serial}>
        <span className={styles.edgeLabel}>N° de série</span>
        <strong>{edgework.serial}</strong>
      </div>
      <div className={styles.edgeGroup}>
        <span className={styles.edgeLabel}>Piles</span>
        {edgework.holders.length === 0 && <span className="muted">aucune</span>}
        {edgework.holders.map((holder, i) => (
          <span
            key={i}
            className={holder === 'AA' ? styles.holderAA : styles.holderD}
            title={holder === 'AA' ? 'Support de deux piles AA' : 'Une pile D'}
          >
            {holder === 'AA' ? (
              <>
                <span className={styles.cellAA} />
                <span className={styles.cellAA} />
              </>
            ) : (
              <span className={styles.cellD} />
            )}
          </span>
        ))}
      </div>
      <div className={styles.edgeGroup}>
        <span className={styles.edgeLabel}>Indicateurs</span>
        {edgework.indicators.length === 0 && <span className="muted">aucun</span>}
        {edgework.indicators.map((indicator) => (
          <span key={indicator.label} className={styles.indicator}>
            <span className={indicator.lit ? styles.ledLit : styles.ledUnlit} />
            {indicator.label}
          </span>
        ))}
      </div>
      <div className={styles.edgeGroup}>
        <span className={styles.edgeLabel}>Ports</span>
        {edgework.ports.length === 0 && <span className="muted">aucun</span>}
        {edgework.ports.map((port) => (
          <span key={port} className={styles.port}>
            {PORT_NAMES[port]}
          </span>
        ))}
      </div>
    </div>
  );
}

function Wires({ module, index, act }: { module: Of<'wires'>; index: number; act: Act }) {
  return (
    <ol className={styles.wires}>
      {module.wires.map((color, wire) => {
        const cut = module.cut.includes(wire);
        return (
          <li key={wire}>
            <button
              type="button"
              className={styles.wire}
              disabled={cut || module.solved}
              aria-label={`Couper le fil ${wire + 1}, ${COLOR_NAMES[color]}`}
              onClick={() => void act('cut', { module: index, wire })}
            >
              <span
                className={cut ? `${styles.wireBody} ${styles.wireCut}` : styles.wireBody}
                style={{ background: PAINT[color] }}
              />
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function BigButton({ module, index, act }: { module: Of<'button'>; index: number; act: Act }) {
  const down = useRef(false);
  const press = () => {
    if (down.current || module.solved) return;
    down.current = true;
    void act('buttonDown', { module: index });
  };
  const release = () => {
    if (!down.current) return;
    down.current = false;
    void act('buttonUp', { module: index });
  };
  const onKey = (event: KeyboardEvent, isDown: boolean) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (isDown && !event.repeat) press();
    if (!isDown) release();
  };
  return (
    <div className={styles.buttonModule}>
      <button
        type="button"
        className={styles.bigButton}
        style={{ background: PAINT[module.color] }}
        data-dark={module.color === 'blue' || module.color === 'red' ? '' : undefined}
        disabled={module.solved}
        aria-label={`Bouton ${COLOR_NAMES[module.color]} « ${module.label} »`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          press();
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
        onKeyDown={(event) => onKey(event, true)}
        onKeyUp={(event) => onKey(event, false)}
      >
        {module.label}
      </button>
      <span
        className={styles.strip}
        style={module.strip ? { background: PAINT[module.strip] } : undefined}
        aria-label={module.strip ? `Bande ${COLOR_NAMES[module.strip]}` : 'Bande éteinte'}
        role="img"
      />
    </div>
  );
}

function Keypad({ module, index, act }: { module: Of<'keypad'>; index: number; act: Act }) {
  return (
    <div className={styles.keypad}>
      {module.glyphs.map((glyph, key) => {
        const pressed = module.pressed.includes(key);
        return (
          <button
            key={key}
            type="button"
            className={styles.key}
            disabled={pressed || module.solved}
            aria-label={`Symbole ${glyph}`}
            onClick={() => void act('press', { module: index, key })}
          >
            <span className={pressed ? styles.keyLedOn : styles.keyLed} />
            <span className={styles.glyph}>{glyph}</span>
          </button>
        );
      })}
    </div>
  );
}

const ARROWS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowRight: 'right',
  ArrowDown: 'down',
  ArrowLeft: 'left',
};

function MazeModule({ module, index, act }: { module: Of<'maze'>; index: number; act: Act }) {
  const move = (direction: Direction) => {
    if (!module.solved) void act('move', { module: index, direction });
  };
  const at = (cell: number) => ({
    x: (cell % MAZE_SIZE) * 20 + 10,
    y: Math.floor(cell / MAZE_SIZE) * 20 + 10,
  });
  const target = at(module.target);
  const position = at(module.position);
  return (
    <div
      className={styles.maze}
      tabIndex={0}
      aria-label="Labyrinthe : flèches du clavier pour se déplacer"
      onKeyDown={(event) => {
        const direction = ARROWS[event.key];
        if (!direction) return;
        event.preventDefault();
        move(direction);
      }}
    >
      <button
        type="button"
        className={`${styles.arrow} ${styles.arrowUp}`}
        onClick={() => move('up')}
        aria-label="Haut"
      >
        ▲
      </button>
      <button
        type="button"
        className={`${styles.arrow} ${styles.arrowLeft}`}
        onClick={() => move('left')}
        aria-label="Gauche"
      >
        ◀
      </button>
      <svg
        viewBox="0 0 120 120"
        className={styles.mazeGrid}
        role="img"
        aria-label="Grille du labyrinthe"
      >
        <rect width="120" height="120" rx="4" className={styles.mazeScreen} />
        {Array.from({ length: MAZE_SIZE * MAZE_SIZE }, (_, cell) => {
          const { x, y } = at(cell);
          return <circle key={cell} cx={x} cy={y} r="1.6" className={styles.mazeDot} />;
        })}
        {module.markers.map((cell) => {
          const { x, y } = at(cell);
          return (
            <circle key={cell} cx={x} cy={y} r="7" fill="none" stroke={MARKER} strokeWidth="2.2" />
          );
        })}
        <polygon
          points={`${target.x},${target.y - 6} ${target.x + 6},${target.y + 5} ${target.x - 6},${target.y + 5}`}
          fill={TARGET}
        />
        <circle cx={position.x} cy={position.y} r="4.5" fill={DOT} />
      </svg>
      <button
        type="button"
        className={`${styles.arrow} ${styles.arrowRight}`}
        onClick={() => move('right')}
        aria-label="Droite"
      >
        ▶
      </button>
      <button
        type="button"
        className={`${styles.arrow} ${styles.arrowDown}`}
        onClick={() => move('down')}
        aria-label="Bas"
      >
        ▼
      </button>
    </div>
  );
}

function ModuleCard({ module, index, act }: { module: ModuleView; index: number; act: Act }) {
  return (
    <section className={styles.module} aria-label={MODULE_NAMES[module.kind]}>
      <header className={styles.moduleHeader}>
        <span>{MODULE_NAMES[module.kind]}</span>
        <span
          className={module.solved ? styles.ledSolved : styles.ledPending}
          role="img"
          aria-label={module.solved ? 'désamorcé' : 'actif'}
        />
      </header>
      {module.kind === 'wires' && <Wires module={module} index={index} act={act} />}
      {module.kind === 'button' && <BigButton module={module} index={index} act={act} />}
      {module.kind === 'keypad' && <Keypad module={module} index={index} act={act} />}
      {module.kind === 'maze' && <MazeModule module={module} index={index} act={act} />}
      {module.kind === 'simon' && <Simon module={module} index={index} act={act} />}
      {module.kind === 'morse' && <Morse module={module} index={index} act={act} />}
      {module.kind === 'memory' && <Memory module={module} index={index} act={act} />}
      {module.kind === 'password' && <Password module={module} index={index} act={act} />}
    </section>
  );
}

/** The bomb as the defuser sees it. */
export function Bomb({ bomb, act }: { bomb: BombView; act: Act }) {
  return (
    <div className={styles.bomb}>
      <EdgeworkPanel edgework={bomb.edgework} />
      <div className={styles.modules}>
        {bomb.modules.map((module, index) => (
          <ModuleCard key={index} module={module} index={index} act={act} />
        ))}
        <Purge purge={bomb.purge} act={act} />
      </div>
    </div>
  );
}
