import {
  BUTTON_ACTION_TEXT,
  COLOR_NAMES_FEMININE,
  EAST,
  MAZE_SIZE,
  NORTH,
  PAGE_TITLES,
  SOUTH,
  WEST,
  conditionsText,
  wireTargetText,
} from '@mini-jeux/shared/games/defusal-data';
import type { Maze, Page } from '@mini-jeux/shared/games/defusal-data';
import { MARKER, WALL } from './art.ts';
import styles from './defusal.module.css';

type Of<K extends Page['kind']> = Extract<Page, { kind: K }>;

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "Si a et b, coupez le deuxième fil." */
function RuleList<T>({
  rules,
  otherwise,
  then,
}: {
  rules: { when: Parameters<typeof conditionsText>[0]; then: T }[];
  otherwise: T;
  then: (value: T) => string;
}) {
  return (
    <ol className={styles.rules}>
      {rules.map((rule, i) => (
        <li key={i}>
          Si {conditionsText(rule.when)}, {then(rule.then)}.
        </li>
      ))}
      <li>Sinon, {then(otherwise)}.</li>
    </ol>
  );
}

function WiresPage({ page }: { page: Of<'wires'> }) {
  return (
    <>
      <p className={styles.howto}>
        Les fils se comptent de haut en bas. Un seul fil est à couper : appliquez la première règle
        vraie, dans l'ordre, pour le nombre de fils de la bombe.
      </p>
      {page.sections.map((section) => (
        <div key={section.count} className={styles.section}>
          <h4>Avec {section.count} fils</h4>
          <RuleList
            rules={section.rules}
            otherwise={section.otherwise}
            then={(target) => `coupez ${wireTargetText(target)}`}
          />
        </div>
      ))}
    </>
  );
}

function ButtonActionsPage({ page }: { page: Of<'buttonActions'> }) {
  return (
    <>
      <p className={styles.howto}>
        Appliquez la première règle vraie, dans l'ordre. Pour un bouton maintenu, la bande lumineuse
        dit quand relâcher : c'est sur une autre page.
      </p>
      <RuleList rules={page.rules} otherwise={page.otherwise} then={(a) => BUTTON_ACTION_TEXT[a]} />
    </>
  );
}

function ButtonStripPage({ page }: { page: Of<'buttonStrip'> }) {
  return (
    <>
      <p className={styles.howto}>
        Quand le bouton est maintenu, une bande s'allume à côté. Relâchez quand le chrono affiche le
        chiffre indiqué, à n'importe quelle position.
      </p>
      <ul className={styles.rules}>
        {page.strips.map((strip) => (
          <li key={strip.color}>
            Bande {COLOR_NAMES_FEMININE[strip.color]} : relâchez sur un{' '}
            <strong>{strip.digit}</strong>.
          </li>
        ))}
        <li>
          Toute autre couleur : relâchez sur un <strong>{page.otherwise}</strong>.
        </li>
      </ul>
    </>
  );
}

function KeypadPage({ page }: { page: Of<'keypad'> }) {
  return (
    <>
      <p className={styles.howto}>
        Une seule colonne du manuel contient les quatre symboles de la bombe (les autres colonnes
        sont chez un autre expert). Appuyez dans l'ordre de cette colonne, de haut en bas.
      </p>
      <div className={styles.columns}>
        {page.columns.map((column) => (
          <ol key={column.number} className={styles.column} aria-label={`Colonne ${column.number}`}>
            <li className={styles.columnTitle}>Colonne {column.number}</li>
            {column.glyphs.map((glyph) => (
              <li key={glyph} className={styles.columnGlyph}>
                {glyph}
              </li>
            ))}
          </ol>
        ))}
      </div>
    </>
  );
}

const CELL = 20;
const center = (cell: number) => ({
  x: (cell % MAZE_SIZE) * CELL + CELL / 2,
  y: Math.floor(cell / MAZE_SIZE) * CELL + CELL / 2,
});

/** Two markers on an empty grid. */
function MarkerGrid({ markers }: { markers: [number, number] }) {
  return (
    <svg viewBox="0 0 120 120" className={styles.miniGrid} role="img" aria-label="Repères">
      <rect width="120" height="120" className={styles.mazeScreen} />
      {Array.from({ length: MAZE_SIZE * MAZE_SIZE }, (_, cell) => {
        const { x, y } = center(cell);
        return <circle key={cell} cx={x} cy={y} r="1.6" className={styles.mazeDot} />;
      })}
      {markers.map((cell) => {
        const { x, y } = center(cell);
        return (
          <circle key={cell} cx={x} cy={y} r="7" fill="none" stroke={MARKER} strokeWidth="2.4" />
        );
      })}
    </svg>
  );
}

function MazeIndexPage({ page }: { page: Of<'mazeIndex'> }) {
  return (
    <>
      <p className={styles.howto}>
        Le démineur voit deux repères (cercles verts). Retrouvez-les ici : ils donnent le numéro du
        labyrinthe, dont le plan est chez un autre expert.
      </p>
      <div className={styles.mazeIndex}>
        {page.entries.map((entry) => (
          <figure key={entry.maze} className={styles.mazeEntry}>
            <MarkerGrid markers={entry.markers} />
            <figcaption>Labyrinthe n° {entry.maze}</figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}

/** The walls of a maze: every side of a cell that is not open. */
function MazePlan({ maze }: { maze: Maze }) {
  const walls: [number, number, number, number][] = [];
  maze.cells.forEach((open, cell) => {
    const x = (cell % MAZE_SIZE) * CELL;
    const y = Math.floor(cell / MAZE_SIZE) * CELL;
    if (!(open & NORTH)) walls.push([x, y, x + CELL, y]);
    if (!(open & WEST)) walls.push([x, y, x, y + CELL]);
    if (!(open & SOUTH)) walls.push([x, y + CELL, x + CELL, y + CELL]);
    if (!(open & EAST)) walls.push([x + CELL, y, x + CELL, y + CELL]);
  });
  return (
    <svg
      viewBox="-2 -2 124 124"
      className={styles.miniGrid}
      role="img"
      aria-label={`Plan du labyrinthe ${maze.number}`}
    >
      <rect x="0" y="0" width="120" height="120" className={styles.mazeScreen} />
      {Array.from({ length: MAZE_SIZE * MAZE_SIZE }, (_, cell) => {
        const { x, y } = center(cell);
        return <circle key={cell} cx={x} cy={y} r="1.6" className={styles.mazeDot} />;
      })}
      {walls.map(([x1, y1, x2, y2], i) => (
        <line
          key={i}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={WALL}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

function MazesPage({ page }: { page: Of<'mazes'> }) {
  return (
    <>
      <p className={styles.howto}>
        Le démineur voit un point blanc (sa position) et un triangle rouge (la sortie), mais pas les
        murs. Guidez-le case par case : toucher un mur est une erreur. Le numéro du labyrinthe se
        trouve grâce aux repères, sur une autre page.
      </p>
      <div className={styles.mazePlans}>
        {page.mazes.map((maze) => (
          <figure key={maze.number} className={styles.mazeEntry}>
            <MazePlan maze={maze} />
            <figcaption>Labyrinthe n° {maze.number}</figcaption>
          </figure>
        ))}
      </div>
    </>
  );
}

function PageBody({ page }: { page: Page }) {
  switch (page.kind) {
    case 'wires':
      return <WiresPage page={page} />;
    case 'buttonActions':
      return <ButtonActionsPage page={page} />;
    case 'buttonStrip':
      return <ButtonStripPage page={page} />;
    case 'keypad':
      return <KeypadPage page={page} />;
    case 'mazeIndex':
      return <MazeIndexPage page={page} />;
    case 'mazes':
      return <MazesPage page={page} />;
  }
}

/** Sections of a wires page: "Fils (3 et 4 fils)". */
const titleOf = (page: Page) =>
  page.kind === 'wires'
    ? `${PAGE_TITLES.wires} (${page.sections.map((s) => s.count).join(' et ')} fils)`
    : page.kind === 'keypad'
      ? `${PAGE_TITLES.keypad} (colonnes ${page.columns[0]!.number} à ${page.columns.at(-1)!.number})`
      : PAGE_TITLES[page.kind];

/** The expert's own sheets of the manual, then the appendix everybody has. */
export function Manual({ pages }: { pages: Page[] }) {
  return (
    <div className={styles.manual}>
      {pages.map((page, i) => (
        <article key={i} className={styles.sheet}>
          <h3 className={styles.sheetTitle}>{capitalize(titleOf(page))}</h3>
          <PageBody page={page} />
        </article>
      ))}
      <details className={styles.sheet}>
        <summary className={styles.sheetTitle}>Annexe : lire la bombe</summary>
        <ul className={styles.rules}>
          <li>Le numéro de série a six caractères ; le dernier est toujours un chiffre.</li>
          <li>Les voyelles sont A, E, I, O et U (le numéro de série ne contient ni O ni Y).</li>
          <li>Un support AA contient deux piles ; une pile D est seule sur son support.</li>
          <li>Un indicateur porte une étiquette de trois lettres et un voyant allumé ou éteint.</li>
          <li>« Plus de 2 piles » veut dire 3 ou davantage ; « au plus 2 », 2 ou moins.</li>
        </ul>
      </details>
    </div>
  );
}
