import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { probeMp4 } from './mp4.ts';

/** A playable content item (for now: a video clip). */
export interface ContentItem {
  /** Stable id derived from the file name: it is what devices remember as "already seen". */
  id: string;
  title: string;
  durationMs: number;
  /** Absolute path, never sent to clients. */
  file: string;
  size: number;
}

export interface ContentLibrary {
  gameId: string;
  items: ContentItem[];
  /** Lines that were rejected, with the reason (shown at startup and by content:check). */
  problems: string[];
}

export const MIN_DURATION_MS = 1_000;
export const MAX_DURATION_MS = 30_000;
const FILE_NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*\.mp4$/iu;

/** Content id from a file name: "Hervé 1.mp4" → "herve-1". */
export function contentIdOf(fileName: string): string {
  return fileName
    .replace(/\.mp4$/i, '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/**
 * Reads `<contentDir>/<gameId>/selection.txt`: one "file | title" line per video.
 * Invalid lines are reported and skipped; a missing folder simply means no content.
 */
export function loadContentLibrary(contentDir: string, gameId: string): ContentLibrary {
  const folder = path.join(contentDir, gameId);
  const selection = path.join(folder, 'selection.txt');
  const library: ContentLibrary = { gameId, items: [], problems: [] };
  if (!existsSync(selection)) {
    library.problems.push(`${path.relative(process.cwd(), selection)} introuvable`);
    return library;
  }

  const ids = new Set<string>();
  const lines = readFileSync(selection, 'utf8').split(/\r?\n/);
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;
    const problem = (message: string) => library.problems.push(`ligne ${index + 1} : ${message}`);

    const separator = line.indexOf('|');
    if (separator === -1) return problem('format attendu « fichier | titre »');
    const fileName = line.slice(0, separator).trim();
    const title = line.slice(separator + 1).trim();
    if (!FILE_NAME.test(fileName)) return problem(`nom de fichier refusé « ${fileName} » (un .mp4, sans dossier)`);
    if (title.length === 0 || title.length > 80) return problem('titre vide ou trop long (80 caractères max)');
    const file = path.join(folder, fileName);
    if (!existsSync(file)) return problem(`fichier introuvable « ${fileName} »`);

    const id = contentIdOf(fileName);
    if (id === '' || ids.has(id)) return problem(`nom de fichier en double ou vide « ${fileName} »`);

    let info;
    try {
      info = probeMp4(readFileSync(file));
    } catch (error) {
      return problem(`« ${fileName} » illisible : ${(error as Error).message}`);
    }
    if (!info.codecs.includes('avc1') || !info.codecs.includes('mp4a')) {
      return problem(`« ${fileName} » doit être en H.264 + AAC (trouvé : ${info.codecs.join(', ') || 'aucun'})`);
    }
    if (info.durationMs < MIN_DURATION_MS || info.durationMs > MAX_DURATION_MS) {
      return problem(`« ${fileName} » dure ${(info.durationMs / 1000).toFixed(1)} s (1 à 30 s acceptées)`);
    }
    ids.add(id);
    library.items.push({ id, title, durationMs: info.durationMs, file, size: statSync(file).size });
  });
  return library;
}
