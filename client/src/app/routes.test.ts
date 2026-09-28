import { describe, expect, it } from 'vitest';
import { matchRoute } from './routes.ts';

describe('matchRoute', () => {
  it('matches the home page', () => {
    expect(matchRoute('/')).toEqual({ name: 'home', joinCode: null });
  });

  it('prefills the code of a join link, case-insensitively', () => {
    expect(matchRoute('/join/abc123')).toEqual({ name: 'home', joinCode: 'ABC123' });
  });

  it('matches a room page', () => {
    expect(matchRoute('/room/ABC123')).toEqual({ name: 'room', code: 'ABC123' });
  });

  it('matches the dev gallery', () => {
    expect(matchRoute('/dev/ui')).toEqual({ name: 'devGallery' });
  });

  it('sends invalid or unknown paths home', () => {
    expect(matchRoute('/room/ABC')).toEqual({ name: 'home', joinCode: null });
    expect(matchRoute('/join/ABC123/extra')).toEqual({ name: 'home', joinCode: null });
    expect(matchRoute('/admin')).toEqual({ name: 'home', joinCode: null });
  });
});
