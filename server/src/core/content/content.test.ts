import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentIdOf, loadContentLibrary } from './library.ts';
import { fakeMp4 } from '../../test/fake-mp4.ts';
import { probeMp4 } from './mp4.ts';

describe('probeMp4', () => {
  it('reads the duration and the codecs', () => {
    expect(probeMp4(fakeMp4(9_980))).toEqual({ durationMs: 9_980, codecs: ['avc1', 'mp4a'] });
  });

  it('rejects files that are not MP4', () => {
    expect(() => probeMp4(Buffer.from('<html>hello</html>'))).toThrow();
    expect(() => probeMp4(Buffer.alloc(0))).toThrow(/ftyp/);
  });
});

describe('content library', () => {
  it('derives stable ids from file names', () => {
    expect(contentIdOf('Hervé Reignier 1.mp4')).toBe('herve-reignier-1');
    expect(contentIdOf('8morts6blesses.mp4')).toBe('8morts6blesses');
  });

  it('keeps valid lines and reports the others', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'content-'));
    const folder = path.join(root, 'dubbing');
    mkdirSync(folder);
    writeFileSync(path.join(folder, 'ok.mp4'), fakeMp4(10_000));
    writeFileSync(path.join(folder, 'long.mp4'), fakeMp4(45_000));
    writeFileSync(path.join(folder, 'hevc.mp4'), fakeMp4(10_000, ['hvc1', 'mp4a']));
    writeFileSync(path.join(folder, 'fake.mp4'), 'not a video');
    writeFileSync(
      path.join(folder, 'selection.txt'),
      [
        '# comment',
        'ok.mp4 | Chat surpris',
        '',
        'long.mp4 | Trop long',
        'hevc.mp4 | Mauvais codec',
        'fake.mp4 | Pas une vidéo',
        '../secret.mp4 | Évasion',
        'absent.mp4 | Absent',
        'sans séparateur',
        'ok.mp4 | Doublon',
      ].join('\n'),
    );
    const library = loadContentLibrary(root, 'dubbing');
    expect(library.items).toEqual([
      expect.objectContaining({ id: 'ok', title: 'Chat surpris', durationMs: 10_000 }),
    ]);
    expect(library.problems).toHaveLength(7);
    expect(library.problems.join('\n')).toMatch(/ligne 4 .*45\.0 s/);
    expect(library.problems.join('\n')).toMatch(/H\.264/);
    expect(library.problems.join('\n')).toMatch(/nom de fichier refusé/);
  });

  it('reports a missing selection file', () => {
    const library = loadContentLibrary(mkdtempSync(path.join(tmpdir(), 'empty-')), 'dubbing');
    expect(library.items).toEqual([]);
    expect(library.problems[0]).toMatch(/introuvable/);
  });

  it('accepts the real videos of the project when present', () => {
    const real = path.resolve(import.meta.dirname, '../../../../content');
    const exists = (() => {
      try {
        return readdirSync(path.join(real, 'dubbing')).some((f) => f.endsWith('.mp4'));
      } catch {
        return false;
      }
    })();
    if (!exists) return;
    const library = loadContentLibrary(real, 'dubbing');
    expect(library.items.length).toBeGreaterThan(0);
  });
});
