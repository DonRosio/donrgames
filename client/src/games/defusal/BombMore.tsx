import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  COLOR_NAMES,
  FREQUENCIES,
  MORSE_UNIT_MS,
  VALVES,
} from '@mini-jeux/shared/games/defusal-data';
import type { ModuleView, PurgeView, SimonColor } from '@mini-jeux/shared/games/defusal-data';
import { useServerNow } from '../../core/session/context.ts';
import { PAINT } from './art.ts';
import type { ScreenProps } from './common.tsx';
import styles from './defusal.module.css';

type Act = ScreenProps<'defusing'>['act'];
type Of<K extends ModuleView['kind']> = Extract<ModuleView, { kind: K }>;

/** Pads in reading order; each lights up in its own colour. */
const PAD_ORDER: SimonColor[] = ['red', 'blue', 'yellow', 'green'];

/** The colours module: it flashes a sequence, the defuser answers with the translated colours. */
export function Simon({ module, index, act }: { module: Of<'simon'>; index: number; act: Act }) {
  const [lit, setLit] = useState<SimonColor | null>(null);
  const [replays, setReplays] = useState(0);
  const sequence = module.flashes.join(',');

  // Plays the sequence of the stage again whenever it changes (stage won, error) or on request.
  useEffect(() => {
    if (module.solved) return;
    const timers: number[] = [];
    sequence.split(',').forEach((color, i) => {
      timers.push(window.setTimeout(() => setLit(color as SimonColor), 700 + i * 900));
      timers.push(window.setTimeout(() => setLit(null), 700 + i * 900 + 550));
    });
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
      setLit(null);
    };
  }, [sequence, module.plays, module.solved, replays]);

  return (
    <div className={styles.simon}>
      <div className={styles.pads}>
        {PAD_ORDER.map((color) => (
          <button
            key={color}
            type="button"
            className={lit === color ? `${styles.pad} ${styles.padLit}` : styles.pad}
            style={{ '--pad': PAINT[color] } as CSSProperties}
            disabled={module.solved}
            aria-label={`Couleur ${COLOR_NAMES[color]}`}
            onClick={() => void act('simon', { module: index, color })}
          />
        ))}
      </div>
      <div className={styles.moduleFoot}>
        <span>
          Étape {Math.min(module.stage + 1, module.stages)} / {module.stages}
        </span>
        <button
          type="button"
          className={`btn btn-small ${styles.replay}`}
          disabled={module.solved}
          onClick={() => setReplays((n) => n + 1)}
        >
          Rejouer la séquence
        </button>
      </div>
    </div>
  );
}

/** What the lamp does, step by step: on or off for this long. */
function lampSteps(signal: readonly string[]): { on: boolean; ms: number }[] {
  const unit = MORSE_UNIT_MS;
  const steps: { on: boolean; ms: number }[] = [];
  signal.forEach((code, letter) => {
    [...code].forEach((symbol, i) => {
      steps.push({ on: true, ms: symbol === '.' ? unit : 3 * unit });
      const lastOfLetter = i === code.length - 1;
      const lastOfWord = letter === signal.length - 1;
      // One unit between symbols, three between letters, seven before the word starts again.
      steps.push({ on: false, ms: !lastOfLetter ? unit : lastOfWord ? 7 * unit : 3 * unit });
    });
  });
  return steps;
}

/** The radio: a lamp that flashes a word in a loop, and a knob to tune the frequency. */
export function Morse({ module, index, act }: { module: Of<'morse'>; index: number; act: Act }) {
  const [on, setOn] = useState(false);
  const key = module.signal.join(' ');
  const steps = useMemo(() => lampSteps(key.split(' ')), [key]);

  useEffect(() => {
    if (module.solved) return;
    let i = 0;
    let timer = 0;
    const run = () => {
      const current = steps[i]!;
      setOn(current.on);
      timer = window.setTimeout(() => {
        i = (i + 1) % steps.length;
        run();
      }, current.ms);
    };
    run();
    return () => {
      window.clearTimeout(timer);
      setOn(false);
    };
  }, [steps, module.solved]);

  return (
    <div className={styles.morse}>
      <span
        className={on ? `${styles.lamp} ${styles.lampOn}` : styles.lamp}
        role="img"
        aria-label={on ? 'Lampe allumée' : 'Lampe éteinte'}
      />
      <div className={styles.tuner}>
        <button
          type="button"
          className={styles.knob}
          disabled={module.solved}
          aria-label="Fréquence plus basse"
          onClick={() => void act('tune', { module: index, direction: 'down' })}
        >
          ◀
        </button>
        <span className={styles.frequency} aria-label="Fréquence réglée">
          {FREQUENCIES[module.tuned]} MHz
        </span>
        <button
          type="button"
          className={styles.knob}
          disabled={module.solved}
          aria-label="Fréquence plus haute"
          onClick={() => void act('tune', { module: index, direction: 'up' })}
        >
          ▶
        </button>
      </div>
      <button
        type="button"
        className={`btn btn-small ${styles.transmit}`}
        disabled={module.solved}
        onClick={() => void act('transmit', { module: index })}
      >
        Émettre
      </button>
    </div>
  );
}

/** A screen with a number, four numbered buttons, five stages. */
export function Memory({ module, index, act }: { module: Of<'memory'>; index: number; act: Act }) {
  return (
    <div className={styles.memory}>
      <div className={styles.memoryScreen} role="status" aria-label="Écran">
        {module.solved ? '—' : module.display}
      </div>
      <div className={styles.memoryButtons}>
        {module.labels.map((label, position) => (
          <button
            key={position}
            type="button"
            className={styles.memoryButton}
            disabled={module.solved}
            aria-label={`Position ${position + 1}, chiffre ${label}`}
            onClick={() => void act('memory', { module: index, position })}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={styles.stages} aria-label={`Étape ${module.stage + 1} sur ${module.stages}`}>
        {Array.from({ length: module.stages }, (_, i) => (
          <span
            key={i}
            className={i < module.stage || module.solved ? styles.stageDone : styles.stage}
          />
        ))}
      </div>
    </div>
  );
}

/** Five wheels of six letters: scroll each one, then submit the word. */
export function Password({
  module,
  index,
  act,
}: {
  module: Of<'password'>;
  index: number;
  act: Act;
}) {
  const [shown, setShown] = useState<number[]>(() => module.wheels.map(() => 0));
  const turn = (wheel: number, delta: number) =>
    setShown((current) =>
      current.map((i, w) =>
        w === wheel ? (i + delta + module.wheels[w]!.length) % module.wheels[w]!.length : i,
      ),
    );
  const word = module.wheels.map((letters, w) => letters[shown[w]!]).join('');
  return (
    <div className={styles.password}>
      <div className={styles.wheels}>
        {module.wheels.map((letters, w) => (
          <div key={w} className={styles.wheel}>
            <button
              type="button"
              className={styles.wheelArrow}
              disabled={module.solved}
              aria-label={`Colonne ${w + 1} : lettre précédente`}
              onClick={() => turn(w, -1)}
            >
              ▲
            </button>
            <span className={styles.wheelLetter} aria-label={`Colonne ${w + 1}`}>
              {letters[shown[w]!]}
            </span>
            <button
              type="button"
              className={styles.wheelArrow}
              disabled={module.solved}
              aria-label={`Colonne ${w + 1} : lettre suivante`}
              onClick={() => turn(w, 1)}
            >
              ▼
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className={`btn btn-small ${styles.transmit}`}
        disabled={module.solved}
        onClick={() => void act('password', { module: index, word })}
      >
        Valider
      </button>
    </div>
  );
}

/** The module to keep an eye on: when it wakes up, a word, a window to answer, four valves. */
export function Purge({ purge, act }: { purge: PurgeView; act: Act }) {
  const now = useServerNow(100);
  const total = 40_000;
  const left = purge.until === null ? 0 : Math.max(0, purge.until - now);
  return (
    <section
      className={purge.active ? `${styles.module} ${styles.purgeAwake}` : styles.module}
      aria-label="Purge"
    >
      <header className={styles.moduleHeader}>
        <span>Purge</span>
        <span
          className={purge.active ? styles.ledAlert : styles.ledPending}
          role="img"
          aria-label={purge.active ? 'en alerte' : 'au repos'}
        />
      </header>
      <div className={styles.purgeScreen} role="status">
        {purge.active ? purge.word : 'AU REPOS'}
      </div>
      <div className={styles.gauge} aria-hidden="true">
        <span className={styles.gaugeFill} style={{ width: `${(left / total) * 100}%` }} />
      </div>
      <div className={styles.valves}>
        {VALVES.map((valve, i) => (
          <button
            key={valve}
            type="button"
            className={styles.valve}
            style={{ background: PAINT[valve] }}
            disabled={!purge.active}
            aria-label={`Vanne ${COLOR_NAMES[valve]}`}
            onClick={() => void act('purge', { valve: i })}
          />
        ))}
      </div>
    </section>
  );
}
