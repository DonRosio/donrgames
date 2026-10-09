// Checks content/<game>/selection.txt and the files it lists. Usage: npm run content:check
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { loadContentLibrary } from '../server/src/core/content/library.ts';
import { games as registry } from '../server/src/games/registry.ts';

const contentDir = path.resolve(import.meta.dirname, '..', process.env.CONTENT_DIR ?? 'content');
let games: string[] = [];
try {
  games = readdirSync(contentDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
} catch {
  console.log(`Dossier de contenu introuvable : ${contentDir}`);
  process.exit(1);
}

let problems = 0;
for (const gameId of games) {
  const text = registry.find((game) => game.contract.meta.id === gameId)?.content === 'text';
  const library = loadContentLibrary(contentDir, gameId, text ? 'text' : 'video');
  console.log(`\n${gameId} : ${library.items.length} ${text ? 'texte(s)' : 'vidéo(s)'} retenu(s)`);
  for (const item of library.items) {
    if (text) {
      console.log(`  ✓ ${item.title}`);
      continue;
    }
    const seconds = (item.durationMs / 1000).toFixed(1).padStart(5);
    const size = `${(item.size / 1_000_000).toFixed(1)} Mo`.padStart(7);
    console.log(`  ✓ ${seconds} s ${size}  ${item.id.padEnd(24)} ${item.title}`);
  }
  for (const problem of library.problems) console.log(`  ✗ ${problem}`);
  problems += library.problems.length;
}
console.log(
  problems === 0
    ? '\nTout est bon.'
    : `\n${problems} problème(s) : ces lignes sont ignorées par le serveur.`,
);
process.exit(problems === 0 ? 0 : 1);
