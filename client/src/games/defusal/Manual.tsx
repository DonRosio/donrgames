import {
  BUTTON_ACTION_TEXT,
  COLOR_NAMES,
  COLOR_NAMES_FEMININE,
  EAST,
  MAZE_SIZE,
  NORTH,
  PAGE_TITLES,
  PURGE_SHIFT_TEXT,
  SIMON_COLORS,
  SOUTH,
  WEST,
  conditionsText,
  memoryRuleText,
  wireTargetText,
} from '@mini-jeux/shared/games/defusal-data';
import type { Maze, Page, SimonMap } from '@mini-jeux/shared/games/defusal-data';
import { MARKER, PAINT, WALL } from './art.ts';
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

const dot = (color: keyof typeof PAINT) => (
  <span className={styles.chip} style={{ background: PAINT[color] }} aria-hidden="true" />
);

function SimonTable({ title, map }: { title: string; map: SimonMap }) {
  return (
    <table className={styles.table}>
      <caption>{title}</caption>
      <tbody>
        {SIMON_COLORS.map((flash) => (
          <tr key={flash}>
            <td>
              {dot(flash)} {COLOR_NAMES[flash]}
            </td>
            <td>→</td>
            <td>
              {dot(map[flash])} <strong>{COLOR_NAMES[map[flash]]}</strong>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SimonPage({ page }: { page: Of<'simon'> }) {
  return (
    <>
      <p className={styles.howto}>
        Le module joue une séquence de couleurs qui s'allonge à chaque étape. Le démineur ne doit
        jamais presser la couleur qui clignote : il presse celle que donne la table, selon le numéro
        de série et le nombre d'erreurs déjà commises sur toute la bombe (pas seulement sur ce
        module). Il répond à la séquence entière à chaque étape.
      </p>
      {page.rows.map((row) => (
        <div key={row.strikes} className={styles.section}>
          <h4>
            {row.strikes === 0
              ? 'Aucune erreur'
              : `${row.strikes} erreur${row.strikes > 1 ? 's' : ''}`}
          </h4>
          <div className={styles.tables}>
            <SimonTable title="Le numéro de série contient une voyelle" map={row.vowel} />
            <SimonTable title="Le numéro de série ne contient aucune voyelle" map={row.noVowel} />
          </div>
        </div>
      ))}
    </>
  );
}

const symbols = (code: string) => [...code].map((c) => (c === '.' ? '·' : '—')).join(' ');

function MorseAlphabetPage({ page }: { page: Of<'morseAlphabet'> }) {
  return (
    <>
      <p className={styles.howto}>
        Le démineur décrit la lampe : un éclat court est un point (·), un éclat long un trait (—).
        Un temps d'arrêt plus long sépare les lettres, et la lampe attend encore plus longtemps
        avant de reprendre le mot du début. Décodez le mot lettre par lettre.
      </p>
      <ul className={styles.alphabet}>
        {page.letters.map(({ letter, code }) => (
          <li key={letter}>
            <strong>{letter}</strong> <span>{symbols(code)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function MorseWordsPage({ page }: { page: Of<'morseWords'> }) {
  return (
    <>
      <p className={styles.howto}>
        Une fois le mot décodé (alphabet sur une autre page), cherchez-le ici : le démineur règle la
        radio sur la fréquence indiquée, puis émet.
      </p>
      <table className={styles.table}>
        <tbody>
          {page.entries.map((entry) => (
            <tr key={entry.word}>
              <td>
                <strong>{entry.word}</strong>
              </td>
              <td>{entry.frequency} MHz</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function MemoryPage({ page }: { page: Of<'memory'> }) {
  return (
    <>
      <p className={styles.howto}>
        Le module a cinq étapes. À chacune, l'écran affiche un chiffre et quatre boutons portent
        chacun un chiffre. Le démineur décrit l'écran et les boutons ; suivez la ligne de l'étape en
        cours. Certaines lignes parlent de ce qui a été pressé aux étapes précédentes : faites noter
        chaque étape (position et chiffre du bouton pressé). Une erreur recommence à l'étape 1, avec
        un nouvel écran.
      </p>
      {page.stages.map((stage) => (
        <div key={stage.stage} className={styles.section}>
          <h4>Étape {stage.stage}</h4>
          <ul className={styles.rules}>
            {[1, 2, 3, 4].map((display) => (
              <li key={display}>
                Si l'écran affiche <strong>{display}</strong>,{' '}
                {memoryRuleText(stage.rules[display]!)}.
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

function PasswordPage({ page }: { page: Of<'passwordWords'> }) {
  return (
    <>
      <p className={styles.howto}>
        Le module a cinq colonnes de six lettres que le démineur fait défiler. Une fois qu'il vous a
        lu les six lettres de chaque colonne, un seul mot de la liste complète peut être formé : les
        deux experts qui tiennent cette liste doivent chacun chercher dans la leur.
      </p>
      <ul className={styles.words}>
        {page.words.map((word) => (
          <li key={word}>{word}</li>
        ))}
      </ul>
    </>
  );
}

function PurgeWordsPage({ page }: { page: Of<'purgeWords'> }) {
  return (
    <>
      <p className={styles.howto}>
        La purge se réveille de temps en temps et affiche un mot : le démineur n'a que quarante
        secondes pour ouvrir la bonne vanne. Cherchez le mot ici, puis appliquez la correction de
        l'autre page.
      </p>
      <table className={styles.table}>
        <tbody>
          {page.entries.map((entry) => (
            <tr key={entry.word}>
              <td>
                <strong>{entry.word}</strong>
              </td>
              <td>
                {dot(entry.valve)} vanne {COLOR_NAMES_FEMININE[entry.valve]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function PurgeShiftPage({ page }: { page: Of<'purgeShift'> }) {
  return (
    <>
      <p className={styles.howto}>
        Une fois la vanne du mot trouvée (table sur une autre page), appliquez la première
        correction vraie. Les vannes se suivent dans cet ordre : rouge, bleue, jaune, blanche.
      </p>
      <RuleList rules={page.rules} otherwise={page.otherwise} then={(s) => PURGE_SHIFT_TEXT[s]} />
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
    case 'simon':
      return <SimonPage page={page} />;
    case 'morseAlphabet':
      return <MorseAlphabetPage page={page} />;
    case 'morseWords':
      return <MorseWordsPage page={page} />;
    case 'memory':
      return <MemoryPage page={page} />;
    case 'passwordWords':
      return <PasswordPage page={page} />;
    case 'purgeWords':
      return <PurgeWordsPage page={page} />;
    case 'purgeShift':
      return <PurgeShiftPage page={page} />;
  }
}

/** Sections of a wires page: "Fils (3 et 4 fils)". */
const titleOf = (page: Page) =>
  page.kind === 'wires'
    ? `${PAGE_TITLES.wires} (${page.sections.map((s) => s.count).join(' et ')} fils)`
    : page.kind === 'keypad'
      ? `${PAGE_TITLES.keypad} (colonnes ${page.columns[0]!.number} à ${page.columns.at(-1)!.number})`
      : page.kind === 'simon'
        ? `${PAGE_TITLES.simon} (${page.rows.map((r) => r.strikes).join(' et ')} erreur${page.rows.length > 1 ? 's' : ''})`
        : page.kind === 'memory'
          ? `${PAGE_TITLES.memory} (étapes ${page.stages[0]!.stage} à ${page.stages.at(-1)!.stage})`
          : PAGE_TITLES[page.kind];

/** The expert's own sheets of the manual, then the appendix everybody has. */
export function Manual({ pages }: { pages: Page[] }) {
  return (
    <div className={styles.manual}>
      {pages.map((page, i) => (
        <article key={i} className={styles.sheet}>
          <span className={styles.sheetNumber}>
            Feuillet {i + 1} / {pages.length}
          </span>
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
